import { constants, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import runtimeArtifacts from '../../config/runtime-artifacts.json' with { type: 'json' }
import errorCatalog from '../../config/error-catalog.json' with { type: 'json' }
import pluginRuntimeResources from '../../config/plugin-runtime-resources.json' with { type: 'json' }
import { parsePluginRuntimeResources } from '../../config/plugin-runtime-resources-schema.ts'
import {
  assertPluginRuntimeResourcesAvailable,
  PLUGIN_RUNTIME_RESOURCE_PATHS,
  PluginRuntimeResourcesUnavailableError,
  resolvePluginRuntimeResourcePaths,
} from '../../src/host/plugin-resources.ts'

const temporaryDirectories: string[] = []

function validRuntimeResourcesConfiguration(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    sourceClients: {
      semanticQueryClient: { label: 'Semantic query client', relativePath: 'scripts/source-client/query.mjs' },
      sourceReadClient: { label: 'Source reader client', relativePath: 'scripts/source-client/read.mjs' },
    },
    runtimeArtifacts: {
      frontendCompilerWorker: { label: 'Workflow worker', artifactKey: 'frontendCompilerWorker' },
      managedCli: { label: 'managed CLI', artifactKey: 'managedCli' },
    },
    requiredFiles: [
      'agent-presets/presets.cordis.yml',
      'agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml',
      '.agents/skills/local-image-reader/SKILL.md',
    ],
    failureDetailsTemplate: 'Unavailable resources:\n{resources}',
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>
}

function expectInvalidRuntimeResourcesConfiguration(value: unknown, message: string): void {
  expect(() => parsePluginRuntimeResources(value)).toThrow(expect.objectContaining({
    name: 'TypeError',
    message: expect.stringContaining(message),
  }))
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('plugin runtime resources configuration parser', () => {
  it('accepts a complete resource manifest', () => {
    expect(parsePluginRuntimeResources(validRuntimeResourcesConfiguration())).toMatchObject({
      schemaVersion: 1,
      requiredFiles: [
        'agent-presets/presets.cordis.yml',
        'agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml',
        '.agents/skills/local-image-reader/SKILL.md',
      ],
      failureDetailsTemplate: 'Unavailable resources:\n{resources}',
    })
  })

  it.each([null, [], 'not an object', 42])('rejects a non-object manifest root: %j', value => {
    expectInvalidRuntimeResourcesConfiguration(value, 'Plugin runtime resources config must be an object')
  })

  it.each([
    ['root record', (value: Record<string, unknown>) => { delete value.failureDetailsTemplate }, 'missing failureDetailsTemplate'],
    ['root record', (value: Record<string, unknown>) => { delete value.requiredFiles }, 'missing requiredFiles'],
    ['root record', (value: Record<string, unknown>) => { value.unexpected = true }, 'unexpected unexpected'],
    ['Source client map', (value: Record<string, unknown>) => {
      delete asRecord(value.sourceClients).semanticQueryClient
    }, 'missing semanticQueryClient'],
    ['Source client map', (value: Record<string, unknown>) => {
      asRecord(value.sourceClients).unexpected = true
    }, 'unexpected unexpected'],
    ['Source client record', (value: Record<string, unknown>) => {
      delete asRecord(asRecord(value.sourceClients).semanticQueryClient).relativePath
    }, 'missing relativePath'],
    ['Source client record', (value: Record<string, unknown>) => {
      asRecord(asRecord(value.sourceClients).semanticQueryClient).unexpected = true
    }, 'unexpected unexpected'],
    ['Source client record', (value: Record<string, unknown>) => {
      delete asRecord(asRecord(value.sourceClients).sourceReadClient).label
    }, 'missing label'],
    ['Source client record', (value: Record<string, unknown>) => {
      asRecord(asRecord(value.sourceClients).sourceReadClient).unexpected = true
    }, 'unexpected unexpected'],
    ['runtime artifact map', (value: Record<string, unknown>) => {
      delete asRecord(value.runtimeArtifacts).managedCli
    }, 'missing managedCli'],
    ['runtime artifact map', (value: Record<string, unknown>) => {
      asRecord(value.runtimeArtifacts).unexpected = true
    }, 'unexpected unexpected'],
    ['runtime artifact record', (value: Record<string, unknown>) => {
      delete asRecord(asRecord(value.runtimeArtifacts).managedCli).artifactKey
    }, 'missing artifactKey'],
    ['runtime artifact record', (value: Record<string, unknown>) => {
      asRecord(asRecord(value.runtimeArtifacts).frontendCompilerWorker).unexpected = true
    }, 'unexpected unexpected'],
  ])('rejects a missing or unexpected key in the %s', (_record, change, message) => {
    const value = validRuntimeResourcesConfiguration()
    change(value)
    expectInvalidRuntimeResourcesConfiguration(value, message)
  })

  it.each([
    ['sourceClients', (value: Record<string, unknown>) => { value.sourceClients = null }],
    ['semanticQueryClient', (value: Record<string, unknown>) => {
      asRecord(value.sourceClients).semanticQueryClient = []
    }],
    ['sourceReadClient', (value: Record<string, unknown>) => {
      asRecord(value.sourceClients).sourceReadClient = null
    }],
    ['runtimeArtifacts', (value: Record<string, unknown>) => { value.runtimeArtifacts = [] }],
    ['frontendCompilerWorker', (value: Record<string, unknown>) => {
      asRecord(value.runtimeArtifacts).frontendCompilerWorker = []
    }],
    ['managedCli', (value: Record<string, unknown>) => {
      asRecord(value.runtimeArtifacts).managedCli = null
    }],
  ])('rejects a non-object %s record', (_record, change) => {
    const value = validRuntimeResourcesConfiguration()
    change(value)
    expectInvalidRuntimeResourcesConfiguration(value, 'must be an object')
  })

  it.each([null, [], 'not an array'])('rejects non-array required runtime files: %j', requiredFiles => {
    const value = validRuntimeResourcesConfiguration()
    value.requiredFiles = requiredFiles
    expectInvalidRuntimeResourcesConfiguration(value, 'requiredFiles')
  })

  it('rejects an empty required runtime file list', () => {
    const value = validRuntimeResourcesConfiguration()
    value.requiredFiles = []
    expectInvalidRuntimeResourcesConfiguration(value, 'array length >= 1')
  })

  it.each([
    ['/scripts/source-client/query.mjs', 'Plugin runtime resources config validation failed'],
    ['C:/scripts/source-client/query.mjs', 'relative POSIX path'],
    ['scripts/source-client/../query.mjs', 'empty or traversing path segments'],
    ['scripts\\source-client\\query.mjs', 'Plugin runtime resources config validation failed'],
    ['scripts/source-client/\u0000query.mjs', 'Plugin runtime resources config validation failed'],
  ])('rejects an unsafe Source client path %j', (relativePath, message) => {
    const value = validRuntimeResourcesConfiguration()
    asRecord(asRecord(value.sourceClients).semanticQueryClient).relativePath = relativePath
    expectInvalidRuntimeResourcesConfiguration(value, message)
  })

  it('rejects duplicate Source client paths', () => {
    const value = validRuntimeResourcesConfiguration()
    const clients = asRecord(value.sourceClients)
    asRecord(clients.sourceReadClient).relativePath = asRecord(clients.semanticQueryClient).relativePath
    expectInvalidRuntimeResourcesConfiguration(value, 'Source client paths must be distinct')
  })

  it('rejects duplicate required package resource paths', () => {
    const value = validRuntimeResourcesConfiguration()
    value.requiredFiles = [
      'agent-presets/presets.cordis.yml',
      'agent-presets/presets.cordis.yml',
    ]
    expectInvalidRuntimeResourcesConfiguration(value, 'required file paths must be distinct')
  })

  it.each([
    ['/agent-presets/presets.cordis.yml', 'relative POSIX path'],
    ['.agents/skills/local-image-reader/references/../SKILL.md', 'empty or traversing path segments'],
    ['tests/plugin-resources.test.ts', 'must be inside agent-presets/ or a Skill runtime directory'],
    ['.agents/skills/local-image-reader/evals/evals.json', 'must be inside agent-presets/ or a Skill runtime directory'],
  ])('rejects an unsafe or non-runtime required package path %j', (path, message) => {
    const value = validRuntimeResourcesConfiguration()
    value.requiredFiles = [path]
    expectInvalidRuntimeResourcesConfiguration(value, message)
  })

  it('rejects a relative Source client path outside the packaged Source client directory', () => {
    const value = validRuntimeResourcesConfiguration()
    asRecord(asRecord(value.sourceClients).semanticQueryClient).relativePath = 'plugins/source-client/query.mjs'
    expectInvalidRuntimeResourcesConfiguration(value, 'must be inside scripts/source-client/')
  })

  it('rejects a Source reader path outside the packaged Source client directory', () => {
    const value = validRuntimeResourcesConfiguration()
    asRecord(asRecord(value.sourceClients).sourceReadClient).relativePath = 'plugins/source-client/read.mjs'
    expectInvalidRuntimeResourcesConfiguration(value, 'Source reader client must be inside scripts/source-client/')
  })

  it('rejects a Configuration Profile schema version outside the supported version', () => {
    const value = validRuntimeResourcesConfiguration()
    value.schemaVersion = 2
    expectInvalidRuntimeResourcesConfiguration(value, 'expected 1 but got 2')
  })

  it('rejects an empty Source client label', () => {
    const value = validRuntimeResourcesConfiguration()
    asRecord(asRecord(value.sourceClients).semanticQueryClient).label = ''
    expectInvalidRuntimeResourcesConfiguration(value, 'Plugin runtime resources config validation failed')
  })

  it('rejects runtime artifact references assigned to the wrong resource key', () => {
    const value = validRuntimeResourcesConfiguration()
    const artifacts = asRecord(value.runtimeArtifacts)
    asRecord(artifacts.frontendCompilerWorker).artifactKey = 'managedCli'
    asRecord(artifacts.managedCli).artifactKey = 'frontendCompilerWorker'
    expectInvalidRuntimeResourcesConfiguration(value, 'artifact references must match their resource keys')
  })

  it('rejects an unknown runtime artifact reference', () => {
    const value = validRuntimeResourcesConfiguration()
    asRecord(asRecord(value.runtimeArtifacts).managedCli).artifactKey = 'unmanagedLauncher'
    expectInvalidRuntimeResourcesConfiguration(value, 'Plugin runtime resources config validation failed')
  })

  it.each([
    ['missing', 'No resource details'],
    ['duplicated', '{resources} and {resources}'],
    ['unknown', '{resource}'],
  ])('rejects a %s resource placeholder in failure details', (_kind, template) => {
    const value = validRuntimeResourcesConfiguration()
    value.failureDetailsTemplate = template
    expectInvalidRuntimeResourcesConfiguration(value, 'must contain exactly one {resources} placeholder')
  })

  it.each(['', '   '])('rejects an empty failure detail template %j', template => {
    const value = validRuntimeResourcesConfiguration()
    value.failureDetailsTemplate = template
    expectInvalidRuntimeResourcesConfiguration(value, 'Plugin runtime resources config validation failed')
  })
})

function temporaryPackageRoot(name = 'harness-plugin-runtime-resources-'): string {
  const root = mkdtempSync(join(tmpdir(), name))
  temporaryDirectories.push(root)
  return root
}

function createRuntimeResources(root: string): Record<keyof typeof PLUGIN_RUNTIME_RESOURCE_PATHS, string> {
  const paths = resolvePluginRuntimeResourcePaths(relativePath => resolve(root, relativePath))
  for (const path of Object.values(paths)) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, 'test runtime resource')
  }
  for (const relativePath of pluginRuntimeResources.requiredFiles) {
    const path = resolve(root, relativePath)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, 'test package resource')
  }
  return paths
}

describe('installed plugin runtime resource validation', () => {
  it('checks both Source clients, the configured Workflow worker, and the managed CLI entrypoint', () => {
    const root = temporaryPackageRoot()
    const paths = createRuntimeResources(root)

    expect(PLUGIN_RUNTIME_RESOURCE_PATHS).toMatchObject({
      semanticQueryClient: 'scripts/source-client/imagegen-semantic-query.mjs',
      sourceReadClient: 'scripts/source-client/imagegen-comfyui-source-read.mjs',
      frontendCompilerWorker: runtimeArtifacts.frontendCompilerWorker.outputEntryRelativePath,
      managedCli: runtimeArtifacts.managedCli.outputEntryRelativePath,
    })
    expect(assertPluginRuntimeResourcesAvailable({ resolvePath: relativePath => resolve(root, relativePath) }))
      .toEqual(paths)
  })

  it('reports an absent resource with its absolute path and the system reason', () => {
    const root = temporaryPackageRoot()
    const paths = createRuntimeResources(root)
    rmSync(paths.sourceReadClient)

    try {
      assertPluginRuntimeResourcesAvailable({ resolvePath: relativePath => resolve(root, relativePath) })
      throw new Error('expected runtime resource validation to fail')
    } catch (error) {
      expect(error).toMatchObject({ code: 'PLUGIN_PACKAGE_RESOURCES_UNAVAILABLE' })
      expect(error).toMatchObject({ detail: expect.stringContaining(paths.sourceReadClient) })
      expect(error).toMatchObject({ detail: expect.stringContaining('ENOENT') })
      expect(error).toMatchObject({ message: expect.stringContaining(errorCatalog.PLUGIN_PACKAGE_RESOURCES_UNAVAILABLE.reason) })
      expect(error).toMatchObject({ message: expect.stringContaining(errorCatalog.PLUGIN_PACKAGE_RESOURCES_UNAVAILABLE.next_step) })
      expect(error).toMatchObject({
        detail: expect.stringContaining('本次激活在初始化业务数据前停止，现有配置和业务数据保持原样'),
      })
    }
  })

  it.each([
    ['Skill root instructions', '.agents/skills/local-image-reader/SKILL.md'],
    ['Skill reference', '.agents/skills/local-image-reader/references/image-inspection-cli.md'],
    ['Skill script', '.agents/skills/anima-prompt-builder/scripts/cli-help.mjs'],
    ['Preset configuration', 'agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml'],
  ])('reports a missing packaged %s with its path and reinstall action', (_resource, relativePath) => {
    const root = temporaryPackageRoot()
    const target = resolve(root, relativePath)
    const fileSystem = {
      lstatSync: vi.fn((path: string) => {
        if (path === target) throw Object.assign(new Error(`ENOENT: missing ${path}`), { code: 'ENOENT' })
        return { isFile: () => true }
      }),
      accessSync: vi.fn(),
    }

    expect(() => assertPluginRuntimeResourcesAvailable({
      resolvePath: path => resolve(root, path),
      fileSystem,
    })).toThrow(expect.objectContaining({
      code: 'PLUGIN_PACKAGE_RESOURCES_UNAVAILABLE',
      detail: expect.stringContaining(target),
      message: expect.stringContaining(errorCatalog.PLUGIN_PACKAGE_RESOURCES_UNAVAILABLE.next_step),
    }))
  })

  it('reports a required Preset resource that is not a regular file', () => {
    const root = temporaryPackageRoot()
    const target = resolve(root, 'agent-presets/presets.cordis.yml')
    const fileSystem = {
      lstatSync: vi.fn((path: string) => ({ isFile: () => path !== target })),
      accessSync: vi.fn(),
    }

    expect(() => assertPluginRuntimeResourcesAvailable({
      resolvePath: path => resolve(root, path),
      fileSystem,
    })).toThrow(expect.objectContaining({
      code: 'PLUGIN_PACKAGE_RESOURCES_UNAVAILABLE',
      detail: expect.stringContaining('resource path is not a regular file'),
    }))
  })

  it('reports a required Skill file that cannot be read', () => {
    const root = temporaryPackageRoot()
    const target = resolve(root, '.agents/skills/local-image-reader/SKILL.md')
    const unreadable = Object.assign(new Error(`EACCES: permission denied ${target}`), { code: 'EACCES' })
    const fileSystem = {
      lstatSync: vi.fn(() => ({ isFile: () => true })),
      accessSync: vi.fn((path: string) => {
        if (path === target) throw unreadable
      }),
    }

    expect(() => assertPluginRuntimeResourcesAvailable({
      resolvePath: path => resolve(root, path),
      fileSystem,
    })).toThrow(expect.objectContaining({
      code: 'PLUGIN_PACKAGE_RESOURCES_UNAVAILABLE',
      detail: expect.stringContaining(unreadable.message),
    }))
  })

  it('reports a resource path that resolves to a directory as a non-regular file', () => {
    const root = temporaryPackageRoot()
    const paths = createRuntimeResources(root)
    rmSync(paths.frontendCompilerWorker)
    mkdirSync(paths.frontendCompilerWorker)

    expect(() => assertPluginRuntimeResourcesAvailable({ resolvePath: relativePath => resolve(root, relativePath) }))
      .toThrow(expect.objectContaining({
        code: 'PLUGIN_PACKAGE_RESOURCES_UNAVAILABLE',
        detail: expect.stringContaining('resource path is not a regular file'),
      }))
  })

  it('preserves unclassified access errors and literal replacement characters in detail', () => {
    const root = temporaryPackageRoot('plugin-$&-resource-root-')
    const paths = resolvePluginRuntimeResourcePaths(relativePath => resolve(root, relativePath))
    const target = paths.managedCli
    const systemError = Object.assign(new Error('EIO: device $& \u0024`\u0024\' failed'), { code: 'EIO' })
    const fileSystem = {
      lstatSync: vi.fn(() => ({ isFile: () => true })),
      accessSync: vi.fn((path: string, mode: number) => {
        expect(mode).toBe(constants.R_OK)
        if (path === target) throw systemError
      }),
    }

    try {
      assertPluginRuntimeResourcesAvailable({
        resolvePath: relativePath => resolve(root, relativePath),
        fileSystem,
      })
      throw new Error('expected runtime resource validation to fail')
    } catch (error) {
      if (!(error instanceof PluginRuntimeResourcesUnavailableError)) throw error
      expect(error).toMatchObject({ code: 'PLUGIN_PACKAGE_RESOURCES_UNAVAILABLE' })
      expect(error).toMatchObject({ detail: expect.stringContaining(target) })
      expect(error).toMatchObject({ detail: expect.stringContaining(systemError.message) })
      expect(error.detail).toContain('$&')
      expect(error.detail).toContain('$`')
      expect(error.detail).toContain("$'")
    }
  })
})

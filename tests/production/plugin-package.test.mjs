import { chmod, copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { execFile as execFileCallback, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

import repositorySkillCatalog from '../fixtures/repository-skill-catalog.json' with { type: 'json' }
import runtimeArtifacts from '../../config/runtime-artifacts.json' with { type: 'json' }
import managedCliEnvironment from '../../config/managed-cli-environment.json' with { type: 'json' }
import { parsePluginPackageConfig } from '../../config/plugin-package-schema.mjs'
import { buildPlugin, packPlugin } from '../../scripts/build/index.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const temporaryDirectories = new Set()
const readOnlyDirectories = new Set()
const execFile = promisify(execFileCallback)
const configuredArtifactEntries = [
  ...Object.values(runtimeArtifacts.hostPlugins).map(artifact => artifact.outputEntryRelativePath),
  runtimeArtifacts.frontendCompilerWorker.outputEntryRelativePath,
  runtimeArtifacts.managedCli.outputEntryRelativePath,
  runtimeArtifacts.client.outputEntryRelativePath,
]
const configuredArtifactRoots = [...new Set(configuredArtifactEntries.map(path => path.split('/').slice(0, 2).join('/')))]
const configuredArtifactFilePaths = [...new Set([
  ...configuredArtifactRoots,
  ...configuredArtifactRoots.map(root => configuredArtifactEntries.find(path => path.startsWith(`${root}/`))),
])]

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'harness-plugin-package-'))
  temporaryDirectories.add(directory)
  return directory
}

afterEach(async () => {
  for (const directory of readOnlyDirectories) {
    await setTreeMode(directory, false)
  }
  readOnlyDirectories.clear()
  await Promise.all([...temporaryDirectories].map(path => rm(path, { recursive: true, force: true })))
  temporaryDirectories.clear()
})

async function setTreeMode(path, readOnly) {
  const details = await stat(path)
  if (details.isDirectory()) {
    for (const name of await readdir(path)) await setTreeMode(join(path, name), readOnly)
    await chmod(path, readOnly ? 0o555 : 0o755)
    return
  }
  await chmod(path, readOnly ? 0o444 : 0o644)
}

it('declares the supported official host baseline in the install manifest', async () => {
  const manifest = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'))
  const desktop = JSON.parse(await readFile(join(repositoryRoot, 'config/desktop-e2e.json'), 'utf8'))
  expect(manifest.engines.dsh).toBe('0.2.1-rc.2')
  expect(desktop.application.version).toBe(manifest.engines.dsh)
  expect([...new Set(Object.entries(manifest.peerDependencies)
    .filter(([name]) => name.startsWith('@deepseek-ai/dsh-'))
    .map(([, version]) => version))]).toEqual(['0.2.1-rc.2'])
})

describe('plugin build and package entry points', () => {
  it('builds the configured Host, Client, managed CLI, and workflow worker into the output root', async () => {
    const outputRoot = await temporaryDirectory()

    await buildPlugin({ repositoryRoot, outputRoot })

    const outputs = [
      ...Object.values(runtimeArtifacts.hostPlugins).map(artifact => artifact.outputEntryRelativePath),
      runtimeArtifacts.frontendCompilerWorker.outputEntryRelativePath,
      runtimeArtifacts.managedCli.outputEntryRelativePath,
      runtimeArtifacts.client.outputEntryRelativePath,
    ]

    for (const outputPath of outputs) {
      const output = await stat(resolve(outputRoot, outputPath))
      expect(output.isFile(), `${outputPath} must be a built file`).toBe(true)
    }
    expect(await readdir(join(outputRoot, '.local/source-host'))).toContain('core.js')
  })

  it('exposes the pure build through the build command', async () => {
    const outputRoot = await temporaryDirectory()
    const cliPath = join(repositoryRoot, 'scripts/build/cli.mjs')

    const { stdout } = await execFile(process.execPath, [cliPath, 'build', '--output-root', outputRoot])

    expect(stdout).toContain(resolve(outputRoot, '.local/source-host/index.js'))
    expect(stdout).toContain(resolve(outputRoot, '.local/source-cli/harness-comfyui.mjs'))
  })

  it('reports every configured package resource that is missing before packing', async () => {
    const fixtureRoot = await temporaryDirectory()
    await writePackageFixture(fixtureRoot, {
      schemaVersion: 1,
      packageName: 'harness-comfyui',
      files: [
        'config/plugin-package.json',
        'config/plugin-package-schema.mjs',
        'config/missing-runtime.json',
      ],
      artifacts: ['.local/source-host'],
    })

    await expect(packPlugin({ repositoryRoot: fixtureRoot, artifactRoot: fixtureRoot }))
      .rejects.toThrow(/config\/missing-runtime\.json[\s\S]*\.local\/source-host/u)
  })

  it('rejects configured package paths that escape the repository', async () => {
    const fixtureRoot = await temporaryDirectory()
    await writePackageFixture(fixtureRoot, {
      schemaVersion: 1,
      packageName: 'harness-comfyui',
      files: ['../outside.json'],
      artifacts: ['.local/source-host'],
    })

    await expect(packPlugin({ repositoryRoot: fixtureRoot, artifactRoot: fixtureRoot }))
      .rejects.toThrow(/must not contain empty or traversing segments/u)
  })

  it.each(configuredArtifactFilePaths.map(filesPath => [
    filesPath,
    configuredArtifactRoots.find(root => filesPath !== root && !filesPath.startsWith(`${root}/`)),
  ]))('rejects build artifact source %s when artifacts names a different output root', (filesPath, artifactRoot) => {
    expect(() => parsePluginPackageConfig({
      schemaVersion: 1,
      packageName: 'harness-comfyui',
      files: [filesPath],
      artifacts: [artifactRoot],
    })).toThrow(/list build artifacts separately from source resources/u)
  })

  it('rejects packing a source-checkout Host when the configured artifact root is elsewhere', async () => {
    const fixtureRoot = await temporaryDirectory()
    const builtArtifactRoot = await temporaryDirectory()
    const hostRoot = configuredArtifactRoots.find(root => root.endsWith('/source-host'))
    const cliRoot = configuredArtifactRoots.find(root => root.endsWith('/source-cli'))
    await writePackageFixture(fixtureRoot, {
      schemaVersion: 1,
      packageName: 'harness-comfyui',
      files: [hostRoot],
      artifacts: [cliRoot],
    })
    await mkdir(join(fixtureRoot, hostRoot), { recursive: true })
    await writeFile(join(fixtureRoot, hostRoot, 'index.js'), 'old checkout Host')
    await mkdir(join(builtArtifactRoot, cliRoot), { recursive: true })
    await writeFile(join(builtArtifactRoot, cliRoot, 'harness-comfyui.mjs'), 'built managed CLI')

    await expect(packPlugin({ repositoryRoot: fixtureRoot, artifactRoot: builtArtifactRoot }))
      .rejects.toThrow(/list build artifacts separately from source resources/u)
  })

  it('rejects local Desktop configuration from the package resource list', async () => {
    const fixtureRoot = await temporaryDirectory()
    await writePackageFixture(fixtureRoot, {
      schemaVersion: 1,
      packageName: 'harness-comfyui',
      files: ['config/desktop-e2e.json'],
      artifacts: ['.local/source-host'],
    })

    await expect(packPlugin({ repositoryRoot: fixtureRoot, artifactRoot: fixtureRoot }))
      .rejects.toThrow(/must not include host-local configuration/u)
  })

  it.each(['credentials.json', 'private-data.json', '.env', 'desktop-e2e.json'])('rejects private descendants of a packaged directory: %s', async filename => {
    const fixtureRoot = await temporaryDirectory()
    await writePackageFixture(fixtureRoot, {
      schemaVersion: 1, packageName: 'harness-comfyui', files: ['agent-presets'], artifacts: ['.local/source-host'],
    })
    await mkdir(join(fixtureRoot, 'agent-presets/nested'), { recursive: true })
    await mkdir(join(fixtureRoot, '.local/source-host'), { recursive: true })
    await writeFile(join(fixtureRoot, 'agent-presets/nested', filename), '{}')
    await expect(packPlugin({ repositoryRoot: fixtureRoot })).rejects.toThrow(/host-local configuration or private data/u)
  })

  it.each(['resource', 'ancestor', 'descendant'])('rejects a symbolic link at a package %s', async position => {
    const fixtureRoot = await temporaryDirectory()
    await writePackageFixture(fixtureRoot, {
      schemaVersion: 1, packageName: 'harness-comfyui', files: ['agent-presets/nested'], artifacts: ['.local/source-host'],
    })
    await mkdir(join(fixtureRoot, 'owned'), { recursive: true })
    await mkdir(join(fixtureRoot, '.local/source-host'), { recursive: true })
    if (position === 'ancestor') {
      await mkdir(join(fixtureRoot, 'owned/nested'))
      await symlink(join(fixtureRoot, 'owned'), join(fixtureRoot, 'agent-presets'))
    } else {
      await mkdir(join(fixtureRoot, 'agent-presets'), { recursive: true })
      if (position === 'resource') await symlink(join(fixtureRoot, 'owned'), join(fixtureRoot, 'agent-presets/nested'))
      else {
        await mkdir(join(fixtureRoot, 'agent-presets/nested'))
        await symlink(join(fixtureRoot, 'owned'), join(fixtureRoot, 'agent-presets/nested/linked'))
      }
    }
    await expect(packPlugin({ repositoryRoot: fixtureRoot })).rejects.toThrow(/symbolic link/u)
  })

  it('rejects a source map left by an earlier build before creating an archive', async () => {
    const fixtureRoot = await temporaryDirectory()
    await writePackageFixture(fixtureRoot, {
      schemaVersion: 1, packageName: 'harness-comfyui', files: ['agent-presets'], artifacts: ['.local/source-host'],
    })
    await mkdir(join(fixtureRoot, 'agent-presets'))
    await mkdir(join(fixtureRoot, '.local/source-host'), { recursive: true })
    await writeFile(join(fixtureRoot, '.local/source-host/stale.js.map'), '{}')
    await expect(packPlugin({ repositoryRoot: fixtureRoot })).rejects.toThrow(/source map/u)
  })

  it('packs a relocatable plugin whose resource references remain readable in a read-only path with spaces', async () => {
    const artifactRoot = await temporaryDirectory()
    const outputDirectory = await temporaryDirectory()
    const archive = join(outputDirectory, 'harness-comfyui-candidate.tgz')
    await buildPlugin({ repositoryRoot, outputRoot: artifactRoot })

    const cliPath = join(repositoryRoot, 'scripts/build/cli.mjs')
    const { stdout } = await execFile(process.execPath, [
      cliPath,
      'pack',
      '--artifact-root', artifactRoot,
      '--out',
      archive,
    ])
    expect(stdout.trim()).toBe(archive)

    const outsideWorkspace = await temporaryDirectory()
    const installedPath = join(outsideWorkspace, 'official plugin install with spaces')
    await mkdir(installedPath)
    await execFile('tar', ['-xzf', archive, '-C', installedPath])
    const packageRoot = join(installedPath, 'package')
    const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
    const references = [
      ...Object.values(manifest.exports).flatMap(value => collectPackageTargets(value)),
      manifest.dsh.bundle.patch,
    ].filter(value => typeof value === 'string')

    expect(manifest.name).toBe('harness-comfyui')
    for (const entry of ['', '/core', '/image-reader', '/cli', '/presets', '/web', '/cli-workspace']) {
      for (const language of ['en', 'zh']) {
        const target = manifest.exports[`.${entry}/locale/${language}.json`]
        expect(target, `${entry} exposes ${language} plugin metadata`).toBeTypeOf('string')
        const metadata = JSON.parse(await readFile(resolve(packageRoot, target), 'utf8'))
        expect(metadata.meta.title).toBeTypeOf('string')
        expect(metadata.meta.title.length).toBeGreaterThan(0)
      }
    }
    expect(manifest.files).toContain('.agents/skills')
    expect(manifest.files).toContain('agent-presets')
    expect(manifest.files).not.toContain('scripts/build')
    expect(manifest.files).not.toContain('scripts/production')
    expect(manifest.private).toBeUndefined()
    expect(manifest.scripts).toBeUndefined()
    expect(manifest.devDependencies).toBeUndefined()
    expect(references).toContain('./.local/source-host/index.js')
    expect(references).toContain('./.local/source-client/client.js')
    expect(references.length).toBeGreaterThan(1)
    await setTreeMode(packageRoot, true)
    readOnlyDirectories.add(packageRoot)

    for (const reference of references) {
      const resource = resolve(packageRoot, reference)
      expect(resource.startsWith(`${packageRoot}/`), `${reference} must remain inside the package`).toBe(true)
      const details = await stat(resource)
      expect(details.mode & 0o222, `${reference} must resolve inside a read-only package`).toBe(0)
      await readFile(resource)
    }
    for (const { name: skill } of repositorySkillCatalog) {
      await readFile(join(packageRoot, '.agents/skills', skill, 'SKILL.md'))
    }
    const packageConfig = JSON.parse(await readFile(join(repositoryRoot, 'config/plugin-package.json'), 'utf8'))
    await assertConfiguredResourcesPresent(packageRoot, repositoryRoot, artifactRoot, packageConfig)
    for (const artifactPath of packageConfig.artifacts) {
      const artifactRootPath = join(packageRoot, artifactPath)
      const artifactInfo = await stat(artifactRootPath)
      if (artifactInfo.isDirectory()) {
        expect((await listFiles(artifactRootPath)).filter(path => path.endsWith('.map'))).toEqual([])
      }
    }
    const installedFiles = await listFiles(packageRoot)
    expect(installedFiles.filter(path => path.startsWith('tests/') || path.startsWith('scripts/verification/'))).toEqual([])
    expect(installedFiles.some(path => /official-session-trace|official-trace-evidence|desktop-e2e/.test(path))).toBe(false)
    expect(installedFiles.some(path => path.startsWith('scripts/source-client/'))).toBe(false)
    expect(installedFiles).not.toContain('config/source-cli-guidance.json')
    expect(installedFiles).toContain('config/source-client.json')
    expect(await readdir(packageRoot)).not.toContain('src')
    expect(await readdir(packageRoot)).not.toContain('.env')
    const cliEnvironment = { ...process.env }
    for (const name of ['NODE_PATH', 'NODE_OPTIONS', ...Object.values(managedCliEnvironment.environmentNames)]) {
      delete cliEnvironment[name]
    }
    const resultRoot = await temporaryDirectory()
    const accepted = { run_id: 'run_packaged_cli' }
    let requests = 0
    const server = createServer(async (request, response) => {
      requests += 1
      const chunks = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      expect(JSON.parse(Buffer.concat(chunks).toString('utf8'))).toEqual({
        command: 'generation.submit',
        request: { title: 'package', template_id: '1', instance_id: '2', model: null, parameters: {}, loras: [] },
      })
      response.end(JSON.stringify({ ok: true, data: accepted }))
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    try {
      const execution = execFile(process.execPath, [resolve(packageRoot, runtimeArtifacts.managedCli.outputEntryRelativePath), '--quiet', 'generation', 'submit', '--stdin'], {
        cwd: outsideWorkspace,
        env: {
          ...cliEnvironment,
          TMPDIR: resultRoot,
          DSH_HARNESS_COMFYUI_CLI_API: `http://127.0.0.1:${address.port}/api/harness-comfyui/cli/v1`,
          DSH_HARNESS_COMFYUI_CLI_CAPABILITY: 'package-capability',
        },
        timeout: 10000,
      })
      execution.child.stdin.end(JSON.stringify({ title: 'package', template_id: '1', instance_id: '2', model: null, parameters: {}, loras: [] }))
      const { stdout, stderr } = await execution
      expect(stdout).toMatch(/^\/[^\r\n]+\n$/u)
      expect(stdout.startsWith(`${resultRoot}/`)).toBe(true)
      expect(await readFile(stdout.slice(0, -1), 'utf8')).toBe('{"run_id":"run_packaged_cli"}\n')
      expect(stderr).toBe('')
      expect(requests).toBe(1)
    } finally { await new Promise(resolve => server.close(resolve)) }
    for (const { args, input, status, error } of [
      { args: ['generation', 'inspect-template-parameters', '--help'], status: 0 },
      { args: ['catalog', 'instance', 'list'], status: 2, error: 'CLI_ARGUMENT_INVALID:' },
      {
        args: ['generation', 'inspect-template-parameters', '--stdin'],
        input: JSON.stringify({ template_id: '29', instance_id: '2' }),
        status: 2,
        error: 'CLI_ENVIRONMENT_INVALID:',
      },
    ]) {
      const result = spawnSync(process.execPath, [resolve(packageRoot, runtimeArtifacts.managedCli.outputEntryRelativePath), ...args], {
        cwd: outsideWorkspace,
        env: cliEnvironment,
        input,
        encoding: 'utf8',
        timeout: 10000,
      })
      expect(result.error).toBeUndefined()
      expect(result.status, result.stderr).toBe(status)
      if (error) {
        expect(result.stderr).toContain(error)
        expect(result.stdout).toBe('')
      } else {
        expect(result.stderr).toBe('')
        expect(result.stdout).toContain('template_id')
      }
    }
  })
})

async function writePackageFixture(root, packageConfig) {
  await mkdir(join(root, 'config'), { recursive: true })
  await writeFile(join(root, 'config/plugin-package.json'), `${JSON.stringify(packageConfig, null, 2)}\n`)
  await copyFile(
    join(repositoryRoot, 'config/plugin-package-schema.mjs'),
    join(root, 'config/plugin-package-schema.mjs'),
  )
  await writeFile(join(root, 'package.json'), `${JSON.stringify({
    name: 'harness-comfyui',
    version: '1.0.0',
    dependencies: { sharp: '0.35.5' },
  }, null, 2)}\n`)
}

async function assertConfiguredResourcesPresent(packageRoot, repositoryRoot, artifactRoot, packageConfig) {
  for (const [sourceRoot, resourcePaths] of [
    [repositoryRoot, packageConfig.files],
    [artifactRoot, packageConfig.artifacts],
  ]) {
    for (const resourcePath of resourcePaths) {
      const sourcePath = join(sourceRoot, resourcePath)
      const sourceInfo = await stat(sourcePath)
      if (sourceInfo.isDirectory()) {
        for (const file of await listFiles(sourcePath)) {
          const baseName = file.split('/').at(-1)
          if (baseName === '.gitignore' || baseName === '.npmignore') continue
          await stat(join(packageRoot, resourcePath, file))
        }
      } else {
        await stat(join(packageRoot, resourcePath))
      }
    }
  }
}

async function listFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await listFiles(path)).map(child => join(entry.name, child)))
    else files.push(entry.name)
  }
  return files
}

function collectPackageTargets(value) {
  if (typeof value === 'string') return [value]
  if (!value || typeof value !== 'object') return []
  return Object.values(value).flatMap(collectPackageTargets)
}

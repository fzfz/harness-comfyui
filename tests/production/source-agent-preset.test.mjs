import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  materializeSourceProductAgentPreset,
  replaceOwnedAgentPresetDirectory,
  validateAgentPresetComposition,
} from '../../scripts/profile/agent-preset.mjs'
import { loadProductAgentConfiguration } from '../../scripts/profile/product-agent-config.mjs'
import { prepareSourceWorktreeRuntime } from '../../scripts/worktree/runtime.mjs'
import {
  COMFYUI_INSTANCE_QUERY_TOOL_NAME,
  GENERATION_MODEL_RESOLVER_TOOL_NAME,
  LORA_RESOLVER_TOOL_NAME,
  TEMPLATE_RESOLVER_TOOL_NAME,
} from '../../src/host/catalog/catalog-tool.ts'
import { GENERATION_TOOL_NAME } from '../../src/host/generation/generation-tool.ts'
import { GENERATION_RUN_INPUT_TOOL_NAME } from '../../src/host/generation/generation-run-input-tool.ts'
import {
  GENERATION_RUN_MEDIA_TOOL_NAME,
  INSPECT_IMAGE_TOOL_NAME,
} from '../../src/host/image-reader/image-reader-tool.ts'

const temporaryPaths = []
const CONTROL_PRESET_ID = 'harness-comfyui-schema-control'
const PRODUCT_PRESET_ID = 'harness-comfyui-cli-candidate'
const PRESET_IDS = [CONTROL_PRESET_ID, PRODUCT_PRESET_ID]
const SYSTEM_PROMPT_VISIBILITY_COMPONENT_FILE = 'project-system-prompt-visibility.mjs'
const PRODUCT_SHARED_FILES = [
  'project-tool-visibility.mjs',
  SYSTEM_PROMPT_VISIBILITY_COMPONENT_FILE,
]
const requireFromModule = createRequire(import.meta.url)
const requireFromDsh = createRequire(requireFromModule.resolve('@deepseek-ai/dsh/package.json'))

async function loadDshScopedCordis() {
  const [cordis, scope] = await Promise.all([
    import(pathToFileURL(requireFromDsh.resolve('@deepseek-ai/cordis')).href),
    import(pathToFileURL(requireFromDsh.resolve('@deepseek-ai/dsh-scope')).href),
  ])
  return {
    Context: cordis.Context,
    createScope: scope.createScope,
    scopeTarget: scope.scopeTarget,
  }
}

async function temporaryDirectory(prefix) {
  const path = await mkdtemp(join(tmpdir(), prefix))
  temporaryPaths.push(path)
  return path
}

async function pathExists(path) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function relativeFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...await relativeFiles(root, path))
    else files.push(path.slice(root.length + 1))
  }
  return files.sort()
}

function productConfig(change = value => value) {
  return change({
    schemaVersion: 2,
    preset: {
      id: PRODUCT_PRESET_ID,
      sourceRootRelativePath: 'agent-presets',
      installRootRelativePath: '.agent-presets',
      retiredManagedPresetIds: [CONTROL_PRESET_ID],
      sharedFiles: PRODUCT_SHARED_FILES,
    },
    skills: {
      sourceRootRelativePath: '.agents/skills',
      environmentVariable: 'HARNESS_COMFYUI_SKILL_DIR',
    },
  })
}

async function createRepositoryFixture() {
  const repositoryRoot = await temporaryDirectory('harness-product-agent-source-')
  const sourceRoot = resolve(repositoryRoot, 'agent-presets')
  await mkdir(resolve(repositoryRoot, 'config'), { recursive: true })
  await mkdir(sourceRoot, { recursive: true })
  await mkdir(resolve(repositoryRoot, '.agents/skills'), { recursive: true })
  const configPath = resolve(repositoryRoot, 'config/product-agent.json')
  await writeFile(configPath, `${JSON.stringify(productConfig(), null, 2)}\n`, 'utf8')
  await writeFile(resolve(repositoryRoot, 'config/environment-overrides.json'), `${JSON.stringify({
    HARNESS_COMFYUI_SKILL_DIR: { passThrough: true, valueType: 'string' },
  }, null, 2)}\n`, 'utf8')
  await writeFile(
    resolve(sourceRoot, 'project-tool-visibility.mjs'),
    'export function apply() {}\n',
    'utf8',
  )
  await writeFile(
    resolve(sourceRoot, SYSTEM_PROMPT_VISIBILITY_COMPONENT_FILE),
    'export function apply() {}\n',
    'utf8',
  )
  const presetSource = resolve(sourceRoot, PRODUCT_PRESET_ID)
  await mkdir(presetSource, { recursive: true })
  await writeFile(
    resolve(presetSource, 'agent.cordis.yml'),
    '- id: visibility\n  name: ../project-tool-visibility.mjs\n  config:\n    mode: local-only\n',
    'utf8',
  )
  await writeFile(resolve(presetSource, 'preset.yml'), 'name: ComfyUI工作台预设\n', 'utf8')
  return {
    repositoryRoot,
    sourceRoot,
    configPath,
    environmentOverridesPath: resolve(repositoryRoot, 'config/environment-overrides.json'),
    repositorySkillsRoot: resolve(repositoryRoot, '.agents/skills'),
  }
}

afterEach(async () => {
  vi.restoreAllMocks()
  for (const path of temporaryPaths.splice(0).reverse()) {
    await rm(path, { recursive: true, force: true })
  }
})

describe('A/B project Tool visibility', () => {
  it('keeps Host-global schemas in A and removes the same schemas from B', async () => {
    const pluginPath = resolve(import.meta.dirname, '../..', 'agent-presets/project-tool-visibility.mjs')
    const { apply } = await import(pathToFileURL(pluginPath).href)
    const inheritedSchemas = [
      { name: TEMPLATE_RESOLVER_TOOL_NAME },
      { name: GENERATION_MODEL_RESOLVER_TOOL_NAME },
      { name: LORA_RESOLVER_TOOL_NAME },
      { name: COMFYUI_INSTANCE_QUERY_TOOL_NAME },
      { name: GENERATION_TOOL_NAME },
      { name: GENERATION_RUN_INPUT_TOOL_NAME },
      { name: GENERATION_RUN_MEDIA_TOOL_NAME },
      { name: INSPECT_IMAGE_TOOL_NAME },
    ]
    const restrict = vi.fn(() => vi.fn())
    const ctx = {
      tools: { schemas: vi.fn(() => inheritedSchemas), restrict },
      effect: effect => effect(),
    }

    apply(ctx, { mode: 'inherit-host-global' })
    expect(restrict).not.toHaveBeenCalled()

    apply(ctx, { mode: 'local-only' })
    expect(restrict).toHaveBeenCalledOnce()
    expect(restrict).toHaveBeenCalledWith({ deny: inheritedSchemas.map(schema => schema.name) })
  })

  it('uses identical A/B composition except the visibility mode', async () => {
    const repositoryRoot = resolve(import.meta.dirname, '../..')
    const paths = [
      resolve(repositoryRoot, 'tests/fixtures/agent-presets', CONTROL_PRESET_ID, 'agent.cordis.yml'),
      resolve(repositoryRoot, 'agent-presets', PRODUCT_PRESET_ID, 'agent.cordis.yml'),
    ]
    const [control, candidate] = await Promise.all(paths.map(validateAgentPresetComposition))
    const normalizedCandidate = structuredClone(candidate)
    normalizedCandidate[0].config.mode = 'inherit-host-global'

    expect(normalizedCandidate).toEqual(control)
    expect(control[0]).toMatchObject({
      name: '../project-tool-visibility.mjs',
      config: { mode: 'inherit-host-global' },
    })
    expect(candidate[0]).toMatchObject({
      name: '../project-tool-visibility.mjs',
      config: { mode: 'local-only' },
    })
    expect(candidate.find(row => row.id === 'skill-filesystem')).toMatchObject({
      name: '@deepseek-ai/dsh-skill-filesystem',
      config: {
        providerName: 'harness-comfyui',
        includeDefaultRoots: false,
        watch: false,
        customSkillDirs: [{ __jsExpr: 'process.env.HARNESS_COMFYUI_SKILL_DIR' }],
      },
    })
    expect(control.map(row => row.name)).toEqual([
      '../project-tool-visibility.mjs',
      '../project-system-prompt-visibility.mjs',
      '@deepseek-ai/dsh-persona',
      '@deepseek-ai/dsh-agent-instructions',
      '@deepseek-ai/dsh-tool-bash',
      '@deepseek-ai/dsh-tool-pwsh',
      '@deepseek-ai/dsh-agent-tool-presentation',
      '@deepseek-ai/dsh-skill-filesystem',
      '@deepseek-ai/dsh-tool-skill',
      'cordis:group',
    ])
  })
})

describe('ComfyUI Workbench system prompt visibility', () => {
  it('removes only the Harness maintenance sections from the product Preset assembly', async () => {
    const repositoryRoot = resolve(import.meta.dirname, '../..')
    const composition = await validateAgentPresetComposition(resolve(
      repositoryRoot,
      'agent-presets',
      PRODUCT_PRESET_ID,
      'agent.cordis.yml',
    ))
    const visibilityRow = composition.find(row => row.name === `../${SYSTEM_PROMPT_VISIBILITY_COMPONENT_FILE}`)
    expect(visibilityRow).toMatchObject({
      config: {
        hiddenSectionNames: [
          'harness:identity',
          'harness:source',
          'app:web-surface',
        ],
      },
    })

    const componentPath = resolve(
      repositoryRoot,
      'agent-presets',
      SYSTEM_PROMPT_VISIBILITY_COMPONENT_FILE,
    )
    const [{ apply }, { Context, createScope, scopeTarget }] = await Promise.all([
      import(pathToFileURL(componentPath).href),
      loadDshScopedCordis(),
    ])
    const ctx = new Context()
    const presetKey = { agentPreset: PRODUCT_PRESET_ID }
    const otherPresetKey = { agentPreset: 'standard' }
    const presetScope = createScope(ctx, presetKey)
    apply(presetScope.ctx, visibilityRow.config)

    const contexts = [{ name: 'runtime:permissions', text: 'Current permission state.' }]
    const tools = [{ name: 'bash', description: 'Run a foreground shell command.' }]
    const variables = { cwd: '/workspace' }
    const assembled = {
      sections: [
        { name: 'harness:identity', text: 'Harness identity.' },
        { name: 'harness:source', text: 'Harness source checkout.' },
        { name: 'app:web-surface', text: 'Harness Web development instructions.' },
        { name: 'deployment:persona', text: 'ComfyUI Workbench persona.' },
        { name: 'tool:bash', text: 'Bash tool guidance.' },
      ],
      contexts,
      tools,
      variables,
    }
    try {
      await expect(ctx.waterfall(
        scopeTarget(ctx, presetKey),
        'system-prompt/assemble',
        assembled,
        { scope: presetKey },
        async () => assembled,
      )).resolves.toEqual({
        sections: [
          { name: 'deployment:persona', text: 'ComfyUI Workbench persona.' },
          { name: 'tool:bash', text: 'Bash tool guidance.' },
        ],
        contexts,
        tools,
        variables,
      })
      await expect(ctx.waterfall(
        scopeTarget(ctx, otherPresetKey),
        'system-prompt/assemble',
        assembled,
        { scope: otherPresetKey },
        async () => assembled,
      )).resolves.toBe(assembled)
    } finally {
      await presetScope.dispose()
      await ctx.fiber.dispose()
    }
  })

  it('propagates a downstream system prompt assembly error unchanged', async () => {
    const repositoryRoot = resolve(import.meta.dirname, '../..')
    const componentPath = resolve(repositoryRoot, 'agent-presets', SYSTEM_PROMPT_VISIBILITY_COMPONENT_FILE)
    const [{ apply }, { Context, createScope, scopeTarget }] = await Promise.all([
      import(pathToFileURL(componentPath).href),
      loadDshScopedCordis(),
    ])
    const ctx = new Context()
    const presetKey = { agentPreset: PRODUCT_PRESET_ID }
    const presetScope = createScope(ctx, presetKey)
    const error = new Error('downstream assembly failed')
    apply(presetScope.ctx, { hiddenSectionNames: ['harness:identity'] })

    try {
      await expect(ctx.waterfall(
        scopeTarget(ctx, presetKey),
        'system-prompt/assemble',
        { sections: [], contexts: [], tools: [], variables: {} },
        { scope: presetKey },
        async () => { throw error },
      )).rejects.toBe(error)
    } finally {
      await presetScope.dispose()
      await ctx.fiber.dispose()
    }
  })

  it('removes the assembly listener when the product Preset scope is disposed', async () => {
    const repositoryRoot = resolve(import.meta.dirname, '../..')
    const componentPath = resolve(repositoryRoot, 'agent-presets', SYSTEM_PROMPT_VISIBILITY_COMPONENT_FILE)
    const [{ apply }, { Context, createScope, scopeTarget }] = await Promise.all([
      import(pathToFileURL(componentPath).href),
      loadDshScopedCordis(),
    ])
    const ctx = new Context()
    const presetKey = { agentPreset: PRODUCT_PRESET_ID }
    const presetScope = createScope(ctx, presetKey)
    const assembled = {
      sections: [{ name: 'harness:identity', text: 'Harness identity.' }],
      contexts: [],
      tools: [],
      variables: {},
    }
    apply(presetScope.ctx, { hiddenSectionNames: ['harness:identity'] })
    await presetScope.dispose()

    try {
      await expect(ctx.waterfall(
        scopeTarget(ctx, presetKey),
        'system-prompt/assemble',
        assembled,
        { scope: presetKey },
        async () => assembled,
      )).resolves.toBe(assembled)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it.each([
    ['a null config', null, 'must contain only hiddenSectionNames'],
    ['an array config', [], 'must contain only hiddenSectionNames'],
    ['a missing hiddenSectionNames property', {}, 'must contain only hiddenSectionNames'],
    [
      'an unknown config property',
      { hiddenSectionNames: ['harness:identity'], unknown: true },
      'must contain only hiddenSectionNames',
    ],
    ['a scalar hiddenSectionNames value', { hiddenSectionNames: 'harness:identity' }, 'must be a non-empty array'],
    ['an empty hiddenSectionNames array', { hiddenSectionNames: [] }, 'must be a non-empty array'],
    ['an empty section name', { hiddenSectionNames: [''] }, 'must be non-empty strings'],
    ['a whitespace-only section name', { hiddenSectionNames: ['   '] }, 'must be non-empty strings'],
    ['a non-string section name', { hiddenSectionNames: [1] }, 'must be non-empty strings'],
    [
      'a duplicated section name',
      { hiddenSectionNames: ['harness:identity', 'harness:identity'] },
      'section name "harness:identity" is duplicated',
    ],
  ])('rejects %s', async (_name, config, message) => {
    const componentPath = resolve(
      import.meta.dirname,
      '../..',
      'agent-presets',
      SYSTEM_PROMPT_VISIBILITY_COMPONENT_FILE,
    )
    const { apply } = await import(pathToFileURL(componentPath).href)

    expect(() => apply({ on: vi.fn() }, config)).toThrow(message)
  })
})

describe('product Agent configuration', () => {
  it('returns the Preset and Repository Skills runtime contract', async () => {
    const fixture = await createRepositoryFixture()

    await expect(loadProductAgentConfiguration(fixture.repositoryRoot)).resolves.toEqual({
      preset: {
        presetId: PRODUCT_PRESET_ID,
        retiredPresetIds: [CONTROL_PRESET_ID],
        sourceRoot: resolve(fixture.repositoryRoot, 'agent-presets'),
        installRootRelativePath: '.agent-presets',
        sharedFiles: PRODUCT_SHARED_FILES,
      },
      repositorySkillsRoot: resolve(fixture.repositoryRoot, '.agents/skills'),
      repositorySkillsEnvironmentVariable: 'HARNESS_COMFYUI_SKILL_DIR',
    })
  })

  it.each([
    {
      name: 'a non-object root',
      value: [],
      message: 'product Agent configuration must be an object',
    },
    {
      name: 'an unknown root property',
      value: productConfig(value => ({ ...value, unknown: true })),
      message: 'must contain exactly preset, schemaVersion, skills',
    },
    {
      name: 'a missing schema version',
      value: productConfig(value => Object.fromEntries(
        Object.entries(value).filter(([key]) => key !== 'schemaVersion'),
      )),
      message: 'must contain exactly preset, schemaVersion, skills',
    },
    {
      name: 'a non-numeric schema version',
      value: productConfig(value => ({ ...value, schemaVersion: '2' })),
      message: 'schemaVersion must be 2',
    },
    {
      name: 'a schema version other than 2',
      value: productConfig(value => ({ ...value, schemaVersion: 1 })),
      message: 'schemaVersion must be 2',
    },
    {
      name: 'a non-object Preset',
      value: productConfig(value => ({ ...value, preset: [] })),
      message: 'product Agent configuration.preset must be an object',
    },
    {
      name: 'an unknown Preset property',
      value: productConfig(value => ({ ...value, preset: { ...value.preset, unknown: true } })),
      message: 'preset must contain exactly id, installRootRelativePath, retiredManagedPresetIds, sharedFiles, sourceRootRelativePath',
    },
    {
      name: 'a missing Preset id',
      value: productConfig(value => ({
        ...value,
        preset: Object.fromEntries(Object.entries(value.preset).filter(([key]) => key !== 'id')),
      })),
      message: 'preset must contain exactly id, installRootRelativePath, retiredManagedPresetIds, sharedFiles, sourceRootRelativePath',
    },
    {
      name: 'an invalid Preset id',
      value: productConfig(value => ({ ...value, preset: { ...value.preset, id: 'Invalid_id' } })),
      message: 'preset.id must contain only lowercase letters, numbers, and hyphens',
    },
    {
      name: 'a non-array retired Preset list',
      value: productConfig(value => ({
        ...value,
        preset: { ...value.preset, retiredManagedPresetIds: CONTROL_PRESET_ID },
      })),
      message: 'retiredManagedPresetIds must be an array',
    },
    {
      name: 'a non-string retired Preset id',
      value: productConfig(value => ({
        ...value,
        preset: { ...value.preset, retiredManagedPresetIds: [1] },
      })),
      message: 'retiredManagedPresetIds[0] must contain only lowercase letters, numbers, and hyphens',
    },
    {
      name: 'an invalid retired Preset id',
      value: productConfig(value => ({
        ...value,
        preset: { ...value.preset, retiredManagedPresetIds: ['Invalid_id'] },
      })),
      message: 'retiredManagedPresetIds[0] must contain only lowercase letters, numbers, and hyphens',
    },
    {
      name: 'duplicated retired Preset ids',
      value: productConfig(value => ({
        ...value,
        preset: { ...value.preset, retiredManagedPresetIds: [CONTROL_PRESET_ID, CONTROL_PRESET_ID] },
      })),
      message: 'retiredManagedPresetIds must be unique',
    },
    {
      name: 'the current Preset id in the retired list',
      value: productConfig(value => ({
        ...value,
        preset: { ...value.preset, retiredManagedPresetIds: [PRODUCT_PRESET_ID] },
      })),
      message: 'preset.id must not be retired',
    },
    {
      name: 'a non-array shared file list',
      value: productConfig(value => ({
        ...value,
        preset: { ...value.preset, sharedFiles: 'project-tool-visibility.mjs' },
      })),
      message: 'sharedFiles must be a non-empty array',
    },
    {
      name: 'an empty shared file list',
      value: productConfig(value => ({ ...value, preset: { ...value.preset, sharedFiles: [] } })),
      message: 'sharedFiles must be a non-empty array',
    },
    {
      name: 'a duplicated shared filename',
      value: productConfig(value => ({
        ...value,
        preset: { ...value.preset, sharedFiles: [PRODUCT_SHARED_FILES[0], PRODUCT_SHARED_FILES[0]] },
      })),
      message: 'sharedFiles must be unique',
    },
    {
      name: 'an invalid shared filename',
      value: productConfig(value => ({
        ...value,
        preset: { ...value.preset, sharedFiles: ['../escape.mjs'] },
      })),
      message: 'sharedFiles must contain .mjs basenames',
    },
    {
      name: 'a non-string Preset source path',
      value: productConfig(value => ({ ...value, preset: { ...value.preset, sourceRootRelativePath: 1 } })),
      message: 'preset.sourceRootRelativePath must be a non-empty relative path',
    },
    {
      name: 'an empty Preset source path',
      value: productConfig(value => ({ ...value, preset: { ...value.preset, sourceRootRelativePath: '' } })),
      message: 'preset.sourceRootRelativePath must be a non-empty relative path',
    },
    {
      name: 'an absolute Preset source path',
      value: productConfig(value => ({
        ...value,
        preset: { ...value.preset, sourceRootRelativePath: '/tmp/agent-presets' },
      })),
      message: 'preset.sourceRootRelativePath must be a non-empty relative path',
    },
    {
      name: 'an escaping Preset source path',
      value: productConfig(value => ({
        ...value,
        preset: { ...value.preset, sourceRootRelativePath: '../agent-presets' },
      })),
      message: 'preset.sourceRootRelativePath must identify a path inside its root',
    },
    {
      name: 'a non-string Preset install path',
      value: productConfig(value => ({ ...value, preset: { ...value.preset, installRootRelativePath: 1 } })),
      message: 'preset.installRootRelativePath must be a non-empty relative path',
    },
    {
      name: 'an empty Preset install path',
      value: productConfig(value => ({ ...value, preset: { ...value.preset, installRootRelativePath: '' } })),
      message: 'preset.installRootRelativePath must be a non-empty relative path',
    },
    {
      name: 'an absolute Preset install path',
      value: productConfig(value => ({
        ...value,
        preset: { ...value.preset, installRootRelativePath: '/tmp/agent-presets' },
      })),
      message: 'preset.installRootRelativePath must be a non-empty relative path',
    },
    {
      name: 'an escaping Preset install path',
      value: productConfig(value => ({
        ...value,
        preset: { ...value.preset, installRootRelativePath: '../agent-presets' },
      })),
      message: 'preset.installRootRelativePath must identify a path inside its root',
    },
    {
      name: 'a missing Skills object',
      value: productConfig(value => Object.fromEntries(
        Object.entries(value).filter(([key]) => key !== 'skills'),
      )),
      message: 'must contain exactly preset, schemaVersion, skills',
    },
    {
      name: 'a non-object Skills value',
      value: productConfig(value => ({ ...value, skills: [] })),
      message: 'product Agent configuration.skills must be an object',
    },
    {
      name: 'an unknown Skills property',
      value: productConfig(value => ({ ...value, skills: { ...value.skills, unknown: true } })),
      message: 'skills must contain exactly environmentVariable, sourceRootRelativePath',
    },
    {
      name: 'a missing Skills source path',
      value: productConfig(value => ({
        ...value,
        skills: { environmentVariable: value.skills.environmentVariable },
      })),
      message: 'skills must contain exactly environmentVariable, sourceRootRelativePath',
    },
    {
      name: 'a non-string Skills source path',
      value: productConfig(value => ({
        ...value,
        skills: { ...value.skills, sourceRootRelativePath: 1 },
      })),
      message: 'sourceRootRelativePath must be a non-empty relative path',
    },
    {
      name: 'a missing Skills environment variable',
      value: productConfig(value => ({
        ...value,
        skills: { sourceRootRelativePath: value.skills.sourceRootRelativePath },
      })),
      message: 'skills must contain exactly environmentVariable, sourceRootRelativePath',
    },
    {
      name: 'a non-string Skills environment variable',
      value: productConfig(value => ({ ...value, skills: { ...value.skills, environmentVariable: 1 } })),
      message: 'environmentVariable must be HARNESS_COMFYUI_SKILL_DIR',
    },
    {
      name: 'another Skills environment variable',
      value: productConfig(value => ({
        ...value,
        skills: { ...value.skills, environmentVariable: 'OTHER_SKILL_DIR' },
      })),
      message: 'environmentVariable must be HARNESS_COMFYUI_SKILL_DIR',
    },
    {
      name: 'an absolute Skills source path',
      value: productConfig(value => ({
        ...value,
        skills: { ...value.skills, sourceRootRelativePath: '/tmp/skills' },
      })),
      message: 'sourceRootRelativePath must be a non-empty relative path',
    },
    {
      name: 'an escaping Skills source path',
      value: productConfig(value => ({
        ...value,
        skills: { ...value.skills, sourceRootRelativePath: '../skills' },
      })),
      message: 'sourceRootRelativePath must identify a path inside its root',
    },
  ])('rejects $name', async ({ value, message }) => {
    const fixture = await createRepositoryFixture()
    await writeFile(fixture.configPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')

    await expect(loadProductAgentConfiguration(fixture.repositoryRoot)).rejects.toThrow(message)
  })

  it.each([
    {
      name: 'a missing declaration',
      declaration: {},
      message: 'environment override map.HARNESS_COMFYUI_SKILL_DIR must be an object',
    },
    {
      name: 'a declaration with target',
      declaration: {
        HARNESS_COMFYUI_SKILL_DIR: { passThrough: true, valueType: 'string', target: 'profile' },
      },
      message: 'must contain exactly passThrough, valueType',
    },
    {
      name: 'a non-pass-through declaration',
      declaration: { HARNESS_COMFYUI_SKILL_DIR: { passThrough: false, valueType: 'string' } },
      message: 'must be a string pass-through declaration',
    },
    {
      name: 'a non-string declaration',
      declaration: { HARNESS_COMFYUI_SKILL_DIR: { passThrough: true, valueType: 'number' } },
      message: 'must be a string pass-through declaration',
    },
  ])('rejects $name for the managed Skills environment variable', async ({ declaration, message }) => {
    const fixture = await createRepositoryFixture()
    await writeFile(fixture.environmentOverridesPath, `${JSON.stringify(declaration, null, 2)}\n`, 'utf8')

    await expect(loadProductAgentConfiguration(fixture.repositoryRoot)).rejects.toThrow(message)
  })

  it.each([
    ['a missing root', async fixture => rm(fixture.repositorySkillsRoot, { recursive: true }), 'does not exist'],
    [
      'a regular file root',
      async fixture => {
        await rm(fixture.repositorySkillsRoot, { recursive: true })
        await writeFile(fixture.repositorySkillsRoot, 'not a directory\n', 'utf8')
      },
      'must be a directory',
    ],
    [
      'a symbolic-link root',
      async fixture => {
        const target = await temporaryDirectory('harness-product-agent-linked-skills-')
        await rm(fixture.repositorySkillsRoot, { recursive: true })
        await symlink(target, fixture.repositorySkillsRoot, 'dir')
      },
      'must not be a symbolic link',
    ],
    [
      'a root whose intermediate symbolic link leaves the checkout',
      async fixture => {
        const target = await temporaryDirectory('harness-product-agent-external-skills-')
        await rm(resolve(fixture.repositoryRoot, '.agents'), { recursive: true })
        await symlink(target, resolve(fixture.repositoryRoot, '.agents'), 'dir')
        await mkdir(resolve(target, 'skills'))
      },
      'must stay inside the current checkout',
    ],
  ])('rejects $name with the rejected path', async (_name, changeRoot, message) => {
    const fixture = await createRepositoryFixture()
    await changeRoot(fixture)

    await expect(loadProductAgentConfiguration(fixture.repositoryRoot)).rejects.toThrow(message)
    await expect(loadProductAgentConfiguration(fixture.repositoryRoot))
      .rejects.toThrow(fixture.repositorySkillsRoot)
  })
})

describe('source product Agent Preset materialization', () => {
  it('materializes only the ComfyUI workbench Preset with its product display name', async () => {
    const repositoryRoot = resolve(import.meta.dirname, '../..')
    const dshHome = await temporaryDirectory('harness-product-agent-canonical-')

    const result = await materializeSourceProductAgentPreset(repositoryRoot, dshHome)

    expect(result).toEqual({
      installRoot: resolve(dshHome, '.agent-presets'),
      sharedFiles: PRODUCT_SHARED_FILES.map(filename => resolve(dshHome, '.agent-presets', filename)),
      presets: [{
        presetId: PRODUCT_PRESET_ID,
        sourceDirectory: resolve(repositoryRoot, 'agent-presets', PRODUCT_PRESET_ID),
        targetDirectory: resolve(dshHome, '.agent-presets', PRODUCT_PRESET_ID),
      }],
      retiredPresetIds: [CONTROL_PRESET_ID],
    })
    expect(await relativeFiles(result.installRoot)).toEqual([
      'harness-comfyui-cli-candidate/agent.cordis.yml',
      'harness-comfyui-cli-candidate/preset.yml',
      'project-system-prompt-visibility.mjs',
      'project-tool-visibility.mjs',
    ])
    for (const filename of PRODUCT_SHARED_FILES) {
      expect(await readFile(resolve(result.installRoot, filename), 'utf8'))
        .toBe(await readFile(resolve(repositoryRoot, 'agent-presets', filename), 'utf8'))
    }
    expect(await readFile(resolve(
      result.installRoot,
      PRODUCT_PRESET_ID,
      'preset.yml',
    ), 'utf8')).toContain('name: ComfyUI工作台预设\n')
    for (const preset of result.presets) {
      for (const filename of ['agent.cordis.yml', 'preset.yml']) {
        expect(await readFile(resolve(preset.targetDirectory, filename), 'utf8'))
          .toBe(await readFile(resolve(preset.sourceDirectory, filename), 'utf8'))
      }
    }
  })

  it('removes the retired schema-control Preset and preserves user-owned Presets', async () => {
    const repositoryRoot = resolve(import.meta.dirname, '../..')
    const dshHome = await temporaryDirectory('harness-product-agent-retired-')
    const installRoot = resolve(dshHome, '.agent-presets')
    const retiredDirectory = resolve(installRoot, PRESET_IDS[0])
    const userDirectory = resolve(installRoot, 'user-owned')
    await mkdir(retiredDirectory, { recursive: true })
    await mkdir(userDirectory, { recursive: true })
    await writeFile(resolve(retiredDirectory, 'preset.yml'), 'name: retired A\n', 'utf8')
    await writeFile(resolve(userDirectory, 'keep.txt'), 'keep\n', 'utf8')

    await materializeSourceProductAgentPreset(repositoryRoot, dshHome)

    expect(await pathExists(retiredDirectory)).toBe(false)
    expect(await readFile(resolve(userDirectory, 'keep.txt'), 'utf8')).toBe('keep\n')
    expect(await pathExists(resolve(installRoot, PRODUCT_PRESET_ID))).toBe(true)
  })

  it('removes a retired Preset symbolic link without changing its external target', async () => {
    const repositoryRoot = resolve(import.meta.dirname, '../..')
    const dshHome = await temporaryDirectory('harness-product-agent-retired-link-')
    const installRoot = resolve(dshHome, '.agent-presets')
    const externalDirectory = await temporaryDirectory('harness-product-agent-retired-target-')
    const sentinel = resolve(externalDirectory, 'sentinel.txt')
    await mkdir(installRoot, { recursive: true })
    await writeFile(sentinel, 'external target remains unchanged\n', 'utf8')
    await symlink(externalDirectory, resolve(installRoot, CONTROL_PRESET_ID), 'dir')

    await materializeSourceProductAgentPreset(repositoryRoot, dshHome)

    expect(await pathExists(resolve(installRoot, CONTROL_PRESET_ID))).toBe(false)
    expect(await readFile(sentinel, 'utf8')).toBe('external target remains unchanged\n')
    expect(await pathExists(resolve(installRoot, PRODUCT_PRESET_ID))).toBe(true)
  })

  it('replaces only product-owned paths on repeated materialization', async () => {
    const fixture = await createRepositoryFixture()
    const dshHome = await temporaryDirectory('harness-product-agent-replace-')
    const siblingDirectory = resolve(dshHome, '.agent-presets', 'user-owned')
    await mkdir(siblingDirectory, { recursive: true })
    await writeFile(resolve(siblingDirectory, 'keep.txt'), 'keep\n', 'utf8')
    await materializeSourceProductAgentPreset(fixture.repositoryRoot, dshHome)
    const productTarget = resolve(dshHome, '.agent-presets', PRODUCT_PRESET_ID)
    await writeFile(resolve(productTarget, 'stale.txt'), 'stale\n', 'utf8')
    await writeFile(resolve(fixture.sourceRoot, PRODUCT_PRESET_ID, 'preset.yml'), 'name: Updated product Preset\n', 'utf8')
    await writeFile(resolve(fixture.sourceRoot, 'project-tool-visibility.mjs'), 'export function apply() { return 1 }\n', 'utf8')

    await materializeSourceProductAgentPreset(fixture.repositoryRoot, dshHome)

    expect(await pathExists(resolve(productTarget, 'stale.txt'))).toBe(false)
    expect(await readFile(resolve(productTarget, 'preset.yml'), 'utf8')).toBe('name: Updated product Preset\n')
    expect(await readFile(resolve(dshHome, '.agent-presets/project-tool-visibility.mjs'), 'utf8'))
      .toBe('export function apply() { return 1 }\n')
    expect(await readFile(resolve(siblingDirectory, 'keep.txt'), 'utf8')).toBe('keep\n')
  })

  it('validates all canonical sources before creating the install root', async () => {
    const fixture = await createRepositoryFixture()
    const dshHome = await temporaryDirectory('harness-product-agent-invalid-')
    await rm(resolve(fixture.sourceRoot, PRODUCT_PRESET_ID, 'agent.cordis.yml'))

    await expect(materializeSourceProductAgentPreset(fixture.repositoryRoot, dshHome))
      .rejects.toThrow('canonical Agent Preset directory')
    expect(await pathExists(resolve(dshHome, '.agent-presets'))).toBe(false)
  })

  it.each([
    ['invalid module syntax', 'export function apply(\n', 'component cannot be loaded'],
    ['a missing apply export', 'export const name = "missing-apply"\n', 'must export apply'],
  ])('preserves the installed shared component when the source has %s', async (_name, source, message) => {
    const fixture = await createRepositoryFixture()
    const dshHome = await temporaryDirectory('harness-product-agent-invalid-component-')
    await materializeSourceProductAgentPreset(fixture.repositoryRoot, dshHome)
    const installedPath = resolve(dshHome, '.agent-presets/project-tool-visibility.mjs')
    const installedBeforeFailure = await readFile(installedPath, 'utf8')
    await writeFile(resolve(fixture.sourceRoot, 'project-tool-visibility.mjs'), source, 'utf8')

    await expect(materializeSourceProductAgentPreset(fixture.repositoryRoot, dshHome)).rejects.toThrow(message)

    expect(await readFile(installedPath, 'utf8')).toBe(installedBeforeFailure)
  })

  it('rejects a symbolic-link install root without changing its external target', async () => {
    const fixture = await createRepositoryFixture()
    const dshHome = await temporaryDirectory('harness-product-agent-linked-home-')
    const externalRoot = await temporaryDirectory('harness-product-agent-external-')
    const sentinel = resolve(externalRoot, 'sentinel.txt')
    await writeFile(sentinel, 'outside remains unchanged\n', 'utf8')
    await symlink(externalRoot, resolve(dshHome, '.agent-presets'), 'dir')

    await expect(materializeSourceProductAgentPreset(fixture.repositoryRoot, dshHome))
      .rejects.toThrow('install root must not be a symbolic link')

    expect(await readFile(sentinel, 'utf8')).toBe('outside remains unchanged\n')
    expect(await pathExists(resolve(externalRoot, PRODUCT_PRESET_ID))).toBe(false)
  })

  it('restores an installed path when the staged rename fails', async () => {
    const root = await temporaryDirectory('harness-product-agent-rollback-')
    const targetDirectory = resolve(root, PRODUCT_PRESET_ID)
    const missingStagingDirectory = resolve(root, '.missing.next')
    const backupDirectory = resolve(root, '.product-preset.previous')
    await mkdir(targetDirectory)
    await writeFile(resolve(targetDirectory, 'sentinel.txt'), 'installed preset\n', 'utf8')

    await expect(replaceOwnedAgentPresetDirectory(
      targetDirectory,
      missingStagingDirectory,
      backupDirectory,
    )).rejects.toThrow()

    expect(await readFile(resolve(targetDirectory, 'sentinel.txt'), 'utf8')).toBe('installed preset\n')
    expect(await pathExists(backupDirectory)).toBe(false)
  })

  it.each([
    {
      name: 'an unknown root field',
      change: value => ({ ...value, unknown: true }),
      message: 'must contain exactly preset, schemaVersion, skills',
    },
    {
      name: 'a different schema version',
      change: value => ({ ...value, schemaVersion: 1 }),
      message: 'schemaVersion must be 2',
    },
    {
      name: 'a missing product Preset id',
      change: value => ({
        ...value,
        preset: Object.fromEntries(Object.entries(value.preset).filter(([key]) => key !== 'id')),
      }),
      message: 'preset must contain exactly id, installRootRelativePath, retiredManagedPresetIds, sharedFiles, sourceRootRelativePath',
    },
    {
      name: 'a retired product Preset id',
      change: value => ({
        ...value,
        preset: {
          ...value.preset,
          retiredManagedPresetIds: [PRODUCT_PRESET_ID],
        },
      }),
      message: 'preset.id must not be retired',
    },
    {
      name: 'duplicated retired Preset ids',
      change: value => ({
        ...value,
        preset: {
          ...value.preset,
          retiredManagedPresetIds: [CONTROL_PRESET_ID, CONTROL_PRESET_ID],
        },
      }),
      message: 'retiredManagedPresetIds must be unique',
    },
    {
      name: 'an escaping source root',
      change: value => ({ ...value, preset: { ...value.preset, sourceRootRelativePath: '../escape' } }),
      message: 'sourceRootRelativePath must identify a path inside its root',
    },
    {
      name: 'an escaping install root',
      change: value => ({ ...value, preset: { ...value.preset, installRootRelativePath: '../escape' } }),
      message: 'installRootRelativePath must identify a path inside its root',
    },
    {
      name: 'an invalid shared filename',
      change: value => ({ ...value, preset: { ...value.preset, sharedFiles: ['../escape.mjs'] } }),
      message: 'sharedFiles must contain .mjs basenames',
    },
  ])('rejects $name before creating the installation root', async ({ change, message }) => {
    const fixture = await createRepositoryFixture()
    const dshHome = await temporaryDirectory('harness-product-agent-config-')
    await writeFile(fixture.configPath, `${JSON.stringify(productConfig(change), null, 2)}\n`, 'utf8')

    await expect(materializeSourceProductAgentPreset(fixture.repositoryRoot, dshHome)).rejects.toThrow(message)
    expect(await pathExists(resolve(dshHome, '.agent-presets'))).toBe(false)
  })
})

describe('shared production and worktree product Agent preparation', () => {
  it('preserves the product Agent Preset prepared by the shared source runtime', async () => {
    const dshHome = await temporaryDirectory('harness-product-agent-worktree-')
    const context = { repositoryRoot: '/repository', dshHome }
    const prepared = {
      activeVersion: '0.33.2',
      dshHome,
      productAgentPreset: { presets: [{ presetId: PRODUCT_PRESET_ID }] },
    }
    const prepareRuntime = vi.fn(async () => prepared)

    const result = await prepareSourceWorktreeRuntime(context, { prepareRuntime })

    expect(prepareRuntime).toHaveBeenCalledOnce()
    expect(result).toBe(prepared)
    expect(result.productAgentPreset.presets.map(preset => preset.presetId)).toEqual([PRODUCT_PRESET_ID])
  })

  it('does not materialize the product Preset when shared source runtime preparation fails', async () => {
    const fixture = await createRepositoryFixture()
    const dshHome = await temporaryDirectory('harness-product-agent-worktree-failure-')
    const prepareRuntime = vi.fn(async () => { throw new Error('shared preparation failed') })

    await expect(prepareSourceWorktreeRuntime(
      { repositoryRoot: fixture.repositoryRoot, dshHome },
      { prepareRuntime },
    )).rejects.toThrow('shared preparation failed')

    expect(await pathExists(resolve(dshHome, '.agent-presets'))).toBe(false)
  })
})

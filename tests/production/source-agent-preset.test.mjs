import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  materializeDeclaredAgentPresetPatch,
  materializeSourceProductAgentPreset,
  replaceOwnedAgentPresetDirectory,
  validateAgentPresetComposition,
} from '../../scripts/profile/agent-preset.mjs'
import { loadProductAgentConfiguration } from '../../scripts/profile/product-agent-config.mjs'
import { prepareSourceWorktreeRuntime } from '../../scripts/worktree/runtime.mjs'
const temporaryPaths = []
const CONTROL_PRESET_ID = 'harness-comfyui-schema-control'
const PRODUCT_PRESET_ID = 'harness-comfyui-cli-candidate'
const ITERATION_PRESET_ID = 'harness-comfyui-iteration'
const PRESET_IDS = [CONTROL_PRESET_ID, PRODUCT_PRESET_ID]
const SYSTEM_PROMPT_VISIBILITY_COMPONENT_FILE = 'project-system-prompt-visibility.mjs'
const SUBAGENT_WORKSPACE_COMPONENT_FILE = 'project-subagent-workspace.mjs'
const PRODUCT_SHARED_FILES = [
  'project-tool-visibility.mjs',
  SYSTEM_PROMPT_VISIBILITY_COMPONENT_FILE,
  SUBAGENT_WORKSPACE_COMPONENT_FILE,
  'project-iteration-dispatch.mjs',
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

async function loadSubagentWorkspaceListener(services) {
  const componentPath = resolve(
    import.meta.dirname,
    '../..',
    'agent-presets',
    SUBAGENT_WORKSPACE_COMPONENT_FILE,
  )
  const { apply } = await import(pathToFileURL(componentPath).href)
  let listener
  const on = vi.fn((event, candidate) => {
    expect(event).toBe('agent/pre-step')
    listener = candidate
  })
  apply({ on, ...services })
  expect(on).toHaveBeenCalledOnce()
  return listener
}

function testAgent(id, origin, cwd, parentSession) {
  return {
    session: {
      id,
      header: {
        origin,
        ...(cwd === undefined ? {} : { cwd }),
        ...(parentSession === undefined ? {} : { parentSession }),
      },
    },
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
    schemaVersion: 3,
    preset: {
      id: PRODUCT_PRESET_ID,
      additionalManagedPresetIds: [ITERATION_PRESET_ID],
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
  await writeFile(
    resolve(sourceRoot, SUBAGENT_WORKSPACE_COMPONENT_FILE),
    'export function apply() {}\n',
    'utf8',
  )
  await writeFile(resolve(sourceRoot, 'project-iteration-dispatch.mjs'), 'export function apply() {}\n', 'utf8')
  for (const [presetId, displayName] of [
    [PRODUCT_PRESET_ID, 'ComfyUI工作台预设'],
    [ITERATION_PRESET_ID, 'ComfyUI迭代预设'],
  ]) {
    const presetSource = resolve(sourceRoot, presetId)
    await mkdir(presetSource, { recursive: true })
    await writeFile(
      resolve(presetSource, 'agent.cordis.yml'),
      '- id: visibility\n  name: ../project-tool-visibility.mjs\n  config:\n    mode: local-only\n',
      'utf8',
    )
    await writeFile(resolve(presetSource, 'preset.yml'), `name: ${displayName}\n`, 'utf8')
  }
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
  it('materializes the two managed product Presets as literal Profile declarations', async () => {
    const repositoryRoot = resolve(import.meta.dirname, '../..')
    const { load } = await import(pathToFileURL(requireFromDsh.resolve('js-yaml')).href)
    const { entryListSchema } = await import(pathToFileURL(requireFromDsh.resolve('@deepseek-ai/cordis-plugin-include')).href)
    const bundle = load(await readFile(resolve(repositoryRoot, 'cordis.patch.yml'), 'utf8'), { schema: entryListSchema })
    expect(bundle.find(row => row.id === 'agent-preset-registry')?.config.default).toBe(PRODUCT_PRESET_ID)
    expect(bundle.flatMap(row => row.insert ?? []).filter(row => row.name === '@deepseek-ai/dsh-agent-preset')).toEqual([])
    const home = await temporaryDirectory('harness-declared-presets-')
    const productAgentPreset = await materializeSourceProductAgentPreset(repositoryRoot, home)
    const profileDirectory = resolve(home, 'profiles/test')
    await mkdir(profileDirectory, { recursive: true })
    const patchPath = resolve(profileDirectory, 'cordis.patch.yml')
    await writeFile(patchPath, '- id: existing\n  config:\n    enabled: true\n')
    await materializeDeclaredAgentPresetPatch(productAgentPreset, profileDirectory)
    await materializeDeclaredAgentPresetPatch(productAgentPreset, profileDirectory)
    const rows = load(await readFile(patchPath, 'utf8'), { schema: entryListSchema })
    expect(rows.find(row => row.id === 'existing')?.config.enabled).toBe(true)
    const declarations = rows.flatMap(row => row.insert ?? []).filter(row => row.name === '@deepseek-ai/dsh-agent-preset')
    expect(declarations.map(row => row.config.id)).toEqual([PRODUCT_PRESET_ID, ITERATION_PRESET_ID])
    for (const declaration of declarations) {
      const metadata = load(await readFile(resolve(home, '.agent-presets', declaration.config.id, 'preset.yml'), 'utf8'))
      expect(declaration.config.name).toBe(metadata.name)
      expect(Array.isArray(declaration.config.plugins)).toBe(true)
      const plugins = declaration.config.plugins
      expect(plugins[0].name).toBe(resolve(home, '.agent-presets/project-tool-visibility.mjs'))
      expect(plugins[0].config.mode).toBe('local-only')
      expect(plugins.find(row => row.id === 'skill-filesystem')).toMatchObject({
        name: '@deepseek-ai/dsh-skill-filesystem',
        config: { providerName: 'harness-comfyui', includeDefaultRoots: false },
      })
    }
  })

  it('hides initial and later Host tools while keeping Preset bash and skill tools visible', () => {
    const script = `
      import { createRequire } from 'node:module'
      import { pathToFileURL } from 'node:url'
      const requireFromDsh = createRequire(${JSON.stringify(requireFromModule.resolve('@deepseek-ai/dsh/package.json'))})
      const load = async name => import(pathToFileURL(requireFromDsh.resolve(name)).href)
      const [{ Context }, { createScope, bindScopeParent }, { SystemPrompt }, { ToolRuntime }] = await Promise.all([
        load('@deepseek-ai/cordis'), load('@deepseek-ai/dsh-scope'),
        load('@deepseek-ai/dsh-system-prompt'), load('@deepseek-ai/dsh-tools'),
      ])
      const { apply } = await import(${JSON.stringify(pathToFileURL(resolve(import.meta.dirname, '../..', 'agent-presets/project-tool-visibility.mjs')).href)})
      const ctx = new Context()
      new SystemPrompt(ctx, {})
      new ToolRuntime(ctx, {})
      const controlKey = { agentPreset: 'control' }
      const candidateKey = { agentPreset: 'candidate' }
      const control = createScope(ctx, controlKey)
      const candidate = createScope(ctx, candidateKey)
      const agentKey = { agent: 'candidate-child' }
      bindScopeParent(agentKey, candidateKey)
      const agent = createScope(ctx, agentKey)
      const tool = name => ({
        name, description: name, parameters: { type: 'object', properties: {} },
        output: { schema: { type: 'string' }, render: () => [] }, execute: async () => '',
      })
      const names = key => ctx.tools.schemas(key).map(schema => schema.name)
      ctx.tools.register(tool('initial-host'))
      candidate.ctx.tools.register(tool('bash'))
      candidate.ctx.tools.register(tool('skill'))
      apply(control.ctx, { mode: 'inherit-host-global' })
      apply(candidate.ctx, { mode: 'local-only' })
      const initial = { control: names(controlKey), candidate: names(candidateKey), agent: names(agentKey) }
      ctx.tools.register(tool('later-host'))
      const later = { control: names(controlKey), candidate: names(candidateKey), agent: names(agentKey) }
      ctx.emit('tools/change')
      const duplicateEvent = names(agentKey)
      await agent.dispose()
      await candidate.dispose()
      const afterDispose = names(candidateKey)
      await control.dispose()
      console.log(JSON.stringify({ initial, later, duplicateEvent, afterDispose }))
    `
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
    }))
    expect(result.initial).toEqual({ control: ['initial-host'], candidate: ['bash', 'skill'], agent: ['bash', 'skill'] })
    expect(result.later).toEqual({ control: ['initial-host', 'later-host'], candidate: ['bash', 'skill'], agent: ['bash', 'skill'] })
    expect(result.duplicateEvent).toEqual(['bash', 'skill'])
    expect(result.afterDispose).toEqual(['initial-host', 'later-host'])
  })

  it('handles an empty initial Host registry and a late registration', () => {
    const script = `
      import { createRequire } from 'node:module'
      import { pathToFileURL } from 'node:url'
      const requireFromDsh = createRequire(${JSON.stringify(requireFromModule.resolve('@deepseek-ai/dsh/package.json'))})
      const load = async name => import(pathToFileURL(requireFromDsh.resolve(name)).href)
      const [{ Context }, { createScope }, { SystemPrompt }, { ToolRuntime }] = await Promise.all([
        load('@deepseek-ai/cordis'), load('@deepseek-ai/dsh-scope'),
        load('@deepseek-ai/dsh-system-prompt'), load('@deepseek-ai/dsh-tools'),
      ])
      const { apply } = await import(${JSON.stringify(pathToFileURL(resolve(import.meta.dirname, '../..', 'agent-presets/project-tool-visibility.mjs')).href)})
      const ctx = new Context()
      new SystemPrompt(ctx, {})
      new ToolRuntime(ctx, {})
      const key = { agentPreset: 'candidate' }
      const preset = createScope(ctx, key)
      apply(preset.ctx, { mode: 'local-only' })
      const initial = ctx.tools.schemas(key).map(schema => schema.name)
      ctx.tools.register({
        name: 'late-host', description: 'Late Host tool',
        parameters: { type: 'object', properties: {} },
        output: { schema: { type: 'string' }, render: () => [] }, execute: async () => '',
      })
      const later = ctx.tools.schemas(key).map(schema => schema.name)
      await preset.dispose()
      const afterDispose = ctx.tools.schemas(key).map(schema => schema.name)
      console.log(JSON.stringify({ initial, later, afterDispose }))
    `
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
    }))
    expect(result).toEqual({ initial: [], later: [], afterDispose: ['late-host'] })
  })

  it.each(['ptc', 'both'])('keeps the reserved run_code transport and Preset tools in global %s mode', mode => {
    const script = `
      import { createRequire } from 'node:module'
      import { pathToFileURL } from 'node:url'
      const requireFromDsh = createRequire(${JSON.stringify(requireFromModule.resolve('@deepseek-ai/dsh/package.json'))})
      const load = async name => import(pathToFileURL(requireFromDsh.resolve(name)).href)
      const [{ Context }, { createScope }, { SystemPrompt }, { ToolRuntime }] = await Promise.all([
        load('@deepseek-ai/cordis'), load('@deepseek-ai/dsh-scope'),
        load('@deepseek-ai/dsh-system-prompt'), load('@deepseek-ai/dsh-tools'),
      ])
      const { apply } = await import(${JSON.stringify(pathToFileURL(resolve(import.meta.dirname, '../..', 'agent-presets/project-tool-visibility.mjs')).href)})
      const ctx = new Context()
      new SystemPrompt(ctx, {})
      new ToolRuntime(ctx, { mode: ${JSON.stringify(mode)} })
      const key = { agentPreset: 'candidate' }
      const preset = createScope(ctx, key)
      const tool = name => ({
        name, description: name, parameters: { type: 'object', properties: {} },
        output: { schema: { type: 'string' }, render: () => [] }, execute: async () => '',
      })
      ctx.tools.register(tool('initial-host'))
      preset.ctx.tools.register(tool('bash'))
      preset.ctx.tools.register(tool('skill'))
      apply(preset.ctx, { mode: 'local-only' })
      const initial = ctx.tools.schemas(key).map(schema => schema.name)
      ctx.tools.register(tool('late-host'))
      const later = ctx.tools.schemas(key).map(schema => schema.name)
      await preset.dispose()
      console.log(JSON.stringify({ initial, later }))
    `
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
    }))
    expect(result.initial).toEqual(['bash', 'skill', 'run_code'])
    expect(result.later).toEqual(['bash', 'skill', 'run_code'])
  })

  it('rejects invalid project Tool visibility modes', async () => {
    const pluginPath = resolve(import.meta.dirname, '../..', 'agent-presets/project-tool-visibility.mjs')
    const { apply } = await import(pathToFileURL(pluginPath).href)
    const ctx = {
      root: { tools: { schemas: () => [] } },
      tools: { restrict: vi.fn() },
      effect: vi.fn(),
    }
    for (const config of [null, {}, { mode: 'unknown' }]) {
      expect(() => apply(ctx, config)).toThrow(TypeError)
    }
    expect(ctx.effect).not.toHaveBeenCalled()
  })

  it('unsubscribes when the Host rejects a restriction', async () => {
    const pluginPath = resolve(import.meta.dirname, '../..', 'agent-presets/project-tool-visibility.mjs')
    const { apply } = await import(pathToFileURL(pluginPath).href)
    const stopListening = vi.fn()
    const restrict = vi.fn(() => { throw new Error('restriction failed') })
    const ctx = {
      root: { tools: { schemas: () => [{ name: 'host-tool' }] } },
      tools: { restrict },
      on: vi.fn(() => stopListening),
      effect: effect => effect(),
    }
    expect(() => apply(ctx, { mode: 'local-only' })).toThrow('restriction failed')
    expect(restrict).toHaveBeenCalledWith({ deny: ['host-tool'] })
    expect(ctx.on).toHaveBeenCalledWith('tools/change', expect.any(Function))
    expect(stopListening).toHaveBeenCalledOnce()
  })

  it.each([PRODUCT_PRESET_ID, ITERATION_PRESET_ID])('validates %s persona against the selected host schema', async (presetId) => {
    const rows = await validateAgentPresetComposition(resolve(import.meta.dirname,
      '../../agent-presets', presetId, 'agent.cordis.yml'))
    const persona = rows.find(row => row.name === '@deepseek-ai/dsh-persona')
    const { Config } = requireFromDsh('@deepseek-ai/dsh-persona')
    expect(Config(persona.config)).toMatchObject({ prefix: persona.config.prefix })
    expect(persona.config.prefix).toBeTypeOf('string')
    expect(persona.config).not.toHaveProperty('text')
    expect(() => Config({ text: persona.config.prefix })).toThrow()
  })

  it('keeps the base A/B composition identical except the visibility mode', async () => {
    const repositoryRoot = resolve(import.meta.dirname, '../..')
    const paths = [
      resolve(repositoryRoot, 'tests/fixtures/agent-presets', CONTROL_PRESET_ID, 'agent.cordis.yml'),
      resolve(repositoryRoot, 'agent-presets', PRODUCT_PRESET_ID, 'agent.cordis.yml'),
    ]
    const [control, candidate] = await Promise.all(paths.map(validateAgentPresetComposition))
    const normalizedCandidate = structuredClone(candidate.filter(row => ![
      'project-subagent-workspace', 'task-agent', 'tool-subagent-control',
    ].includes(row.id)))
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

  it('configures workbench continuation and four iteration roles with Workspace registration', async () => {
    const repositoryRoot = resolve(import.meta.dirname, '../..')
    const [workbench, iteration] = await Promise.all([
      validateAgentPresetComposition(resolve(
        repositoryRoot,
        'agent-presets',
        PRODUCT_PRESET_ID,
        'agent.cordis.yml',
      )),
      validateAgentPresetComposition(resolve(
        repositoryRoot,
        'agent-presets',
        ITERATION_PRESET_ID,
        'agent.cordis.yml',
      )),
    ])

    expect(workbench.find(row => row.name === `../${SUBAGENT_WORKSPACE_COMPONENT_FILE}`)).toMatchObject({
      id: 'project-subagent-workspace',
    })
    const workbenchRoles = workbench.filter(row => row.name === '../project-iteration-dispatch.mjs')
    expect(workbenchRoles).toHaveLength(1)
    expect(workbenchRoles[0].config).toMatchObject({
      toolName: 'subagent_task',
      provider: 'spawn',
      maxDepth: 1,
      agentOptions: {},
      toolFilter: { deny: ['subagent_task', 'interrupt_agent'] },
    })
    expect(workbench.map(row => row.name)).toEqual([
      '../project-tool-visibility.mjs',
      '../project-system-prompt-visibility.mjs',
      '@deepseek-ai/dsh-persona',
      '@deepseek-ai/dsh-agent-instructions',
      '@deepseek-ai/dsh-tool-bash',
      '@deepseek-ai/dsh-tool-pwsh',
      '@deepseek-ai/dsh-agent-tool-presentation',
      '@deepseek-ai/dsh-skill-filesystem',
      '@deepseek-ai/dsh-tool-skill',
      '../project-subagent-workspace.mjs',
      '../project-iteration-dispatch.mjs',
      '@deepseek-ai/dsh-tool-subagent-control',
      'cordis:group',
    ])
    expect(iteration.find(row => row.name === `../${SUBAGENT_WORKSPACE_COMPONENT_FILE}`)).toMatchObject({
      id: 'project-subagent-workspace',
    })
    const roles = iteration.filter(row => row.name === '../project-iteration-dispatch.mjs')
    expect(roles.map(row => row.config.toolName)).toEqual([
      'subagent_composition',
      'subagent_generation',
      'subagent_observation',
      'subagent_comparison',
    ])
    for (const role of roles) {
      expect(role.config).toMatchObject({
        provider: 'spawn',
        maxDepth: 1,
        persona: expect.any(String),
        agentOptions: {
          provider: expect.any(String),
          model: expect.any(String),
        },
        toolFilter: {
          deny: expect.arrayContaining([
            ...roles.map(row => row.config.toolName),
            'interrupt_agent',
            'get_goal',
            'create_goal',
            'update_goal',
          ]),
        },
      })
      expect(role.config.persona.length).toBeGreaterThan(0)
    }
    expect(new Set(roles.map(row => row.config.persona)).size).toBe(4)
    expect(iteration.map(row => row.name)).toEqual([
      '../project-tool-visibility.mjs',
      '../project-system-prompt-visibility.mjs',
      '@deepseek-ai/dsh-persona',
      '@deepseek-ai/dsh-agent-instructions',
      '@deepseek-ai/dsh-tool-bash',
      '@deepseek-ai/dsh-tool-pwsh',
      '@deepseek-ai/dsh-agent-tool-presentation',
      '@deepseek-ai/dsh-skill-filesystem',
      '@deepseek-ai/dsh-tool-skill',
      '../project-subagent-workspace.mjs',
      '@deepseek-ai/dsh-command-goal',
      '@deepseek-ai/dsh-tool-goal',
      '../project-iteration-dispatch.mjs',
      '../project-iteration-dispatch.mjs',
      '../project-iteration-dispatch.mjs',
      '../project-iteration-dispatch.mjs',
      '@deepseek-ai/dsh-tool-subagent-control',
      'cordis:group',
    ])
    expect(iteration.find(row => row.id === 'skill-filesystem')).toMatchObject({
      name: '@deepseek-ai/dsh-skill-filesystem',
      config: {
        providerName: 'harness-comfyui',
        includeDefaultRoots: false,
        watch: false,
        customSkillDirs: [{ __jsExpr: 'process.env.HARNESS_COMFYUI_SKILL_DIR' }],
      },
    })
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

describe('iteration Preset subagent Workspace registration', () => {
  it('passes non-subagent Sessions through without reading Workspace state', async () => {
    const agents = { get: vi.fn() }
    const workspaceRegistry = { resolveByPath: vi.fn() }
    const listener = await loadSubagentWorkspaceListener({ agents, workspaceRegistry })
    const next = vi.fn(async () => 'continued')

    await expect(listener({ agent: testAgent('session_main', 'user', '/workspace') }, next))
      .resolves.toBe('continued')

    expect(next).toHaveBeenCalledOnce()
    expect(agents.get).not.toHaveBeenCalled()
    expect(workspaceRegistry.resolveByPath).not.toHaveBeenCalled()
  })

  it('attaches the actual child Session once before repeated pre-steps continue', async () => {
    const cwd = await temporaryDirectory('harness-subagent-workspace-')
    const parent = testAgent('session_parent', 'user', cwd)
    const child = testAgent('session_child', 'subagent', cwd, parent.session.id)
    const sessionIds = [parent.session.id]
    const callOrder = []
    const attachSession = vi.fn(async sessionId => {
      callOrder.push('attach')
      sessionIds.push(sessionId)
    })
    const workspace = { id: 'workspace_1', sessionIds, attachSession }
    const resolveByPath = vi.fn(async () => workspace)
    const listener = await loadSubagentWorkspaceListener({
      agents: { get: vi.fn(id => id === parent.session.id ? parent : undefined) },
      workspaceRegistry: { resolveByPath },
    })
    const next = vi.fn(async () => {
      callOrder.push('next')
      return 'continued'
    })

    await expect(listener({ agent: child }, next)).resolves.toBe('continued')
    await expect(listener({ agent: child }, next)).resolves.toBe('continued')

    expect(resolveByPath).toHaveBeenCalledTimes(2)
    expect(resolveByPath).toHaveBeenNthCalledWith(1, cwd)
    expect(attachSession).toHaveBeenCalledOnce()
    expect(attachSession).toHaveBeenCalledWith(child.session.id)
    expect(sessionIds).toEqual([parent.session.id, child.session.id])
    expect(next).toHaveBeenCalledTimes(2)
    expect(callOrder).toEqual(['attach', 'next', 'next'])
  })

  it('stops before the next handler when the parent Session is missing', async () => {
    const cwd = await temporaryDirectory('harness-subagent-missing-parent-')
    const listener = await loadSubagentWorkspaceListener({
      agents: { get: vi.fn(() => undefined) },
      workspaceRegistry: { resolveByPath: vi.fn() },
    })
    const next = vi.fn()

    await expect(listener({ agent: testAgent('session_child', 'subagent', cwd, 'session_missing') }, next))
      .rejects.toThrow('parent Session session_missing was not found; set the child Session header.parentSession field to an existing parent Session ID')
    expect(next).not.toHaveBeenCalled()
  })

  it.each([
    ['child', undefined, 'same', 'child Session has no cwd; set the child Session cwd to its parent Session cwd'],
    ['parent', 'same', undefined, 'parent Session has no cwd; set the parent Session cwd to a directory within its Workspace'],
  ])('stops when the %s Session cwd is missing', async (_name, childCwdValue, parentCwdValue, message) => {
    const cwd = await temporaryDirectory('harness-subagent-missing-cwd-')
    const parent = testAgent(
      'session_parent',
      'user',
      parentCwdValue === 'same' ? cwd : parentCwdValue,
    )
    const child = testAgent(
      'session_child',
      'subagent',
      childCwdValue === 'same' ? cwd : childCwdValue,
      parent.session.id,
    )
    const listener = await loadSubagentWorkspaceListener({
      agents: { get: vi.fn(() => parent) },
      workspaceRegistry: { resolveByPath: vi.fn() },
    })
    const next = vi.fn()

    await expect(listener({ agent: child }, next)).rejects.toThrow(message)
    expect(next).not.toHaveBeenCalled()
  })

  it.each(['child', 'parent'])('reports an unavailable %s cwd before resolving a Workspace', async label => {
    const cwd = await temporaryDirectory('harness-subagent-unavailable-cwd-')
    const missingCwd = resolve(cwd, 'missing')
    const parent = testAgent('session_parent', 'user', label === 'parent' ? missingCwd : cwd)
    const child = testAgent('session_child', 'subagent', label === 'child' ? missingCwd : cwd, parent.session.id)
    const resolveByPath = vi.fn()
    const listener = await loadSubagentWorkspaceListener({
      agents: { get: vi.fn(() => parent) },
      workspaceRegistry: { resolveByPath },
    })
    const next = vi.fn()

    await expect(listener({ agent: child }, next))
      .rejects.toThrow(`${label} Session cwd at ${missingCwd} is unavailable:`)
    expect(resolveByPath).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it('stops when the child and parent resolve to different directories', async () => {
    const [parentCwd, childCwd] = await Promise.all([
      temporaryDirectory('harness-subagent-parent-cwd-'),
      temporaryDirectory('harness-subagent-child-cwd-'),
    ])
    const parent = testAgent('session_parent', 'user', parentCwd)
    const child = testAgent('session_child', 'subagent', childCwd, parent.session.id)
    const resolveByPath = vi.fn()
    const listener = await loadSubagentWorkspaceListener({
      agents: { get: vi.fn(() => parent) },
      workspaceRegistry: { resolveByPath },
    })
    const next = vi.fn()
    const [resolvedChildCwd, resolvedParentCwd] = await Promise.all([
      realpath(childCwd),
      realpath(parentCwd),
    ])

    await expect(listener({ agent: child }, next))
      .rejects.toThrow(`child cwd ${resolvedChildCwd} differs from parent cwd ${resolvedParentCwd}; set the child Session cwd to the parent cwd`)
    expect(resolveByPath).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it('preserves lookup failure context and stops the child step', async () => {
    const cwd = await temporaryDirectory('harness-subagent-lookup-failure-')
    const parent = testAgent('session_parent', 'user', cwd)
    const child = testAgent('session_child', 'subagent', cwd, parent.session.id)
    const cause = new Error('Workspace storage read failed')
    const resolveByPath = vi.fn(async () => { throw cause })
    const listener = await loadSubagentWorkspaceListener({
      agents: { get: vi.fn(() => parent) },
      workspaceRegistry: { resolveByPath },
    })
    const next = vi.fn()

    await expect(listener({ agent: child }, next)).rejects.toMatchObject({
      message: `Registration of subagent Session session_child failed because Workspace lookup for parent cwd ${cwd} failed with Workspace storage read failed; check the Workspace registry and parent Session cwd, then retry.`,
      cause,
    })
    expect(resolveByPath).toHaveBeenCalledExactlyOnceWith(cwd)
    expect(next).not.toHaveBeenCalled()
  })

  it('stops when the parent cwd has no Workspace', async () => {
    const cwd = await temporaryDirectory('harness-subagent-no-workspace-')
    const parent = testAgent('session_parent', 'user', cwd)
    const child = testAgent('session_child', 'subagent', cwd, parent.session.id)
    const listener = await loadSubagentWorkspaceListener({
      agents: { get: vi.fn(() => parent) },
      workspaceRegistry: { resolveByPath: vi.fn(async () => undefined) },
    })
    const next = vi.fn()

    await expect(listener({ agent: child }, next))
      .rejects.toThrow(`no Workspace contains parent cwd ${cwd}; register a Workspace containing that cwd or set the parent Session cwd to a directory in an existing Workspace`)
    expect(next).not.toHaveBeenCalled()
  })

  it('stops when the parent Session is not attached to the resolved Workspace', async () => {
    const cwd = await temporaryDirectory('harness-subagent-parent-unregistered-')
    const parent = testAgent('session_parent', 'user', cwd)
    const child = testAgent('session_child', 'subagent', cwd, parent.session.id)
    const attachSession = vi.fn()
    const listener = await loadSubagentWorkspaceListener({
      agents: { get: vi.fn(() => parent) },
      workspaceRegistry: {
        resolveByPath: vi.fn(async () => ({ id: 'workspace_1', sessionIds: [], attachSession })),
      },
    })
    const next = vi.fn()

    await expect(listener({ agent: child }, next))
      .rejects.toThrow('parent Session session_parent is not attached to Workspace workspace_1; attach the parent Session to that Workspace')
    expect(attachSession).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it('reports an attach failure and does not continue the child task', async () => {
    const cwd = await temporaryDirectory('harness-subagent-attach-failure-')
    const parent = testAgent('session_parent', 'user', cwd)
    const child = testAgent('session_child', 'subagent', cwd, parent.session.id)
    const attachSession = vi.fn(async () => { throw new Error('storage rejected attachment') })
    const listener = await loadSubagentWorkspaceListener({
      agents: { get: vi.fn(() => parent) },
      workspaceRegistry: {
        resolveByPath: vi.fn(async () => ({
          id: 'workspace_1',
          sessionIds: [parent.session.id],
          attachSession,
        })),
      },
    })
    const next = vi.fn()

    await expect(listener({ agent: child }, next))
      .rejects.toThrow('Workspace workspace_1 could not attach the child Session: storage rejected attachment; check the Workspace Session record and retry')
    expect(attachSession).toHaveBeenCalledWith(child.session.id)
    expect(next).not.toHaveBeenCalled()
  })
})

describe('product Agent configuration', () => {
  it('returns the Preset and Repository Skills runtime contract', async () => {
    const fixture = await createRepositoryFixture()

    await expect(loadProductAgentConfiguration(fixture.repositoryRoot)).resolves.toEqual({
      preset: {
        presetId: PRODUCT_PRESET_ID,
        additionalManagedPresetIds: [ITERATION_PRESET_ID],
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
      message: 'schemaVersion must be 3',
    },
    {
      name: 'a schema version other than 3',
      value: productConfig(value => ({ ...value, schemaVersion: 1 })),
      message: 'schemaVersion must be 3',
    },
    {
      name: 'a non-object Preset',
      value: productConfig(value => ({ ...value, preset: [] })),
      message: 'product Agent configuration.preset must be an object',
    },
    {
      name: 'an unknown Preset property',
      value: productConfig(value => ({ ...value, preset: { ...value.preset, unknown: true } })),
      message: 'preset must contain exactly additionalManagedPresetIds, id, installRootRelativePath, retiredManagedPresetIds, sharedFiles, sourceRootRelativePath',
    },
    {
      name: 'a missing Preset id',
      value: productConfig(value => ({
        ...value,
        preset: Object.fromEntries(Object.entries(value.preset).filter(([key]) => key !== 'id')),
      })),
      message: 'preset must contain exactly additionalManagedPresetIds, id, installRootRelativePath, retiredManagedPresetIds, sharedFiles, sourceRootRelativePath',
    },
    {
      name: 'an invalid Preset id',
      value: productConfig(value => ({ ...value, preset: { ...value.preset, id: 'Invalid_id' } })),
      message: 'preset.id must contain only lowercase letters, numbers, and hyphens',
    },
    {
      name: 'a missing additional managed Preset list',
      value: productConfig(value => ({
        ...value,
        preset: Object.fromEntries(
          Object.entries(value.preset).filter(([key]) => key !== 'additionalManagedPresetIds'),
        ),
      })),
      message: 'preset must contain exactly additionalManagedPresetIds, id, installRootRelativePath, retiredManagedPresetIds, sharedFiles, sourceRootRelativePath',
    },
    {
      name: 'a non-array additional managed Preset list',
      value: productConfig(value => ({
        ...value,
        preset: { ...value.preset, additionalManagedPresetIds: ITERATION_PRESET_ID },
      })),
      message: 'additionalManagedPresetIds must be an array',
    },
    {
      name: 'a non-string additional managed Preset id',
      value: productConfig(value => ({
        ...value,
        preset: { ...value.preset, additionalManagedPresetIds: [1] },
      })),
      message: 'additionalManagedPresetIds[0] must contain only lowercase letters, numbers, and hyphens',
    },
    {
      name: 'an invalid additional managed Preset id',
      value: productConfig(value => ({
        ...value,
        preset: { ...value.preset, additionalManagedPresetIds: ['Invalid_id'] },
      })),
      message: 'additionalManagedPresetIds[0] must contain only lowercase letters, numbers, and hyphens',
    },
    {
      name: 'duplicated additional managed Preset ids',
      value: productConfig(value => ({
        ...value,
        preset: { ...value.preset, additionalManagedPresetIds: [ITERATION_PRESET_ID, ITERATION_PRESET_ID] },
      })),
      message: 'additionalManagedPresetIds must be unique',
    },
    {
      name: 'the default Preset id in the additional managed Preset list',
      value: productConfig(value => ({
        ...value,
        preset: { ...value.preset, additionalManagedPresetIds: [PRODUCT_PRESET_ID] },
      })),
      message: 'additionalManagedPresetIds must not contain preset.id',
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
      name: 'an additional managed Preset id in the retired list',
      value: productConfig(value => ({
        ...value,
        preset: { ...value.preset, retiredManagedPresetIds: [ITERATION_PRESET_ID] },
      })),
      message: `additionalManagedPresetIds must not contain retired Preset ${ITERATION_PRESET_ID}`,
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
  it('materializes the default workbench and additional iteration Presets with their product names', async () => {
    const repositoryRoot = resolve(import.meta.dirname, '../..')
    const dshHome = await temporaryDirectory('harness-product-agent-canonical-')

    const result = await materializeSourceProductAgentPreset(repositoryRoot, dshHome)

    expect(result).toEqual({
      installRoot: resolve(dshHome, '.agent-presets'),
      sharedFiles: PRODUCT_SHARED_FILES.map(filename => resolve(dshHome, '.agent-presets', filename)),
      presets: [
        {
          presetId: PRODUCT_PRESET_ID,
          sourceDirectory: resolve(repositoryRoot, 'agent-presets', PRODUCT_PRESET_ID),
          targetDirectory: resolve(dshHome, '.agent-presets', PRODUCT_PRESET_ID),
        },
        {
          presetId: ITERATION_PRESET_ID,
          sourceDirectory: resolve(repositoryRoot, 'agent-presets', ITERATION_PRESET_ID),
          targetDirectory: resolve(dshHome, '.agent-presets', ITERATION_PRESET_ID),
        },
      ],
      retiredPresetIds: [CONTROL_PRESET_ID],
    })
    expect(await relativeFiles(result.installRoot)).toEqual([
      'harness-comfyui-cli-candidate/agent.cordis.yml',
      'harness-comfyui-cli-candidate/preset.yml',
      'harness-comfyui-iteration/agent.cordis.yml',
      'harness-comfyui-iteration/preset.yml',
      'project-iteration-dispatch.mjs',
      'project-subagent-workspace.mjs',
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
    expect(await readFile(resolve(
      result.installRoot,
      ITERATION_PRESET_ID,
      'preset.yml',
    ), 'utf8')).toContain('name: ComfyUI迭代预设\n')
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
    expect(await pathExists(resolve(installRoot, ITERATION_PRESET_ID))).toBe(true)
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
    expect(await pathExists(resolve(installRoot, ITERATION_PRESET_ID))).toBe(true)
  })

  it('replaces only product-owned paths on repeated materialization', async () => {
    const fixture = await createRepositoryFixture()
    const dshHome = await temporaryDirectory('harness-product-agent-replace-')
    const siblingDirectory = resolve(dshHome, '.agent-presets', 'user-owned')
    await mkdir(siblingDirectory, { recursive: true })
    await writeFile(resolve(siblingDirectory, 'keep.txt'), 'keep\n', 'utf8')
    await materializeSourceProductAgentPreset(fixture.repositoryRoot, dshHome)
    const productTarget = resolve(dshHome, '.agent-presets', PRODUCT_PRESET_ID)
    const iterationTarget = resolve(dshHome, '.agent-presets', ITERATION_PRESET_ID)
    await writeFile(resolve(productTarget, 'stale.txt'), 'stale\n', 'utf8')
    await writeFile(resolve(iterationTarget, 'stale.txt'), 'stale\n', 'utf8')
    await writeFile(resolve(fixture.sourceRoot, PRODUCT_PRESET_ID, 'preset.yml'), 'name: Updated product Preset\n', 'utf8')
    await writeFile(resolve(fixture.sourceRoot, ITERATION_PRESET_ID, 'preset.yml'), 'name: Updated iteration Preset\n', 'utf8')
    await writeFile(resolve(fixture.sourceRoot, 'project-tool-visibility.mjs'), 'export function apply() { return 1 }\n', 'utf8')

    await materializeSourceProductAgentPreset(fixture.repositoryRoot, dshHome)

    expect(await pathExists(resolve(productTarget, 'stale.txt'))).toBe(false)
    expect(await pathExists(resolve(iterationTarget, 'stale.txt'))).toBe(false)
    expect(await readFile(resolve(productTarget, 'preset.yml'), 'utf8')).toBe('name: Updated product Preset\n')
    expect(await readFile(resolve(iterationTarget, 'preset.yml'), 'utf8')).toBe('name: Updated iteration Preset\n')
    expect(await readFile(resolve(dshHome, '.agent-presets/project-tool-visibility.mjs'), 'utf8'))
      .toBe('export function apply() { return 1 }\n')
    expect(await readFile(resolve(siblingDirectory, 'keep.txt'), 'utf8')).toBe('keep\n')
  })

  it('validates all canonical sources before creating the install root', async () => {
    const fixture = await createRepositoryFixture()
    const dshHome = await temporaryDirectory('harness-product-agent-invalid-')
    await rm(resolve(fixture.sourceRoot, ITERATION_PRESET_ID, 'agent.cordis.yml'))

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
      message: 'schemaVersion must be 3',
    },
    {
      name: 'a missing product Preset id',
      change: value => ({
        ...value,
        preset: Object.fromEntries(Object.entries(value.preset).filter(([key]) => key !== 'id')),
      }),
      message: 'preset must contain exactly additionalManagedPresetIds, id, installRootRelativePath, retiredManagedPresetIds, sharedFiles, sourceRootRelativePath',
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
      productAgentPreset: {
        presets: [
          { presetId: PRODUCT_PRESET_ID },
          { presetId: ITERATION_PRESET_ID },
        ],
      },
    }
    const prepareRuntime = vi.fn(async () => prepared)

    const result = await prepareSourceWorktreeRuntime(context, { prepareRuntime })

    expect(prepareRuntime).toHaveBeenCalledOnce()
    expect(result).toBe(prepared)
    expect(result.productAgentPreset.presets.map(preset => preset.presetId)).toEqual([
      PRODUCT_PRESET_ID,
      ITERATION_PRESET_ID,
    ])
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

import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  materializeSourceAgentToolCanary,
  replaceOwnedAgentPresetDirectory,
  validateAgentPresetComposition,
} from '../../scripts/profile/agent-preset.mjs'
import { prepareSourceWorktreeRuntime } from '../../scripts/worktree/runtime.mjs'
import {
  COMFYUI_INSTANCE_QUERY_TOOL_NAME,
  GENERATION_MODEL_RESOLVER_TOOL_NAME,
  LORA_RESOLVER_TOOL_NAME,
  TEMPLATE_RESOLVER_TOOL_NAME,
} from '../../src/host/catalog/catalog-tool.ts'
import { GENERATION_TOOL_NAME } from '../../src/host/generation/generation-tool.ts'

const temporaryPaths = []

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

async function createRepositoryFixture() {
  const repositoryRoot = await temporaryDirectory('harness-agent-preset-source-')
  const presetId = 'harness-comfyui-tool-canary'
  const presetSource = resolve(repositoryRoot, 'agent-presets', presetId)
  await mkdir(resolve(repositoryRoot, 'config'), { recursive: true })
  await mkdir(presetSource, { recursive: true })
  const configPath = resolve(repositoryRoot, 'config/product-agent.json')
  await writeFile(configPath, `${JSON.stringify({
    schemaVersion: 1,
    toolCanary: {
      presetId,
      sourceRootRelativePath: 'agent-presets',
      installRootRelativePath: '.agent-presets',
    },
  }, null, 2)}\n`, 'utf8')
  await writeFile(
    resolve(presetSource, 'agent.cordis.yml'),
    '- id: tool-bash\n  name: \'@deepseek-ai/dsh-tool-bash\'\n',
    'utf8',
  )
  await writeFile(resolve(presetSource, 'preset.yml'), 'name: Test Tool Canary\n', 'utf8')
  return { repositoryRoot, presetId, presetSource, configPath }
}

afterEach(async () => {
  vi.restoreAllMocks()
  for (const path of temporaryPaths.splice(0).reverse()) {
    await rm(path, { recursive: true, force: true })
  }
})

describe('source Agent Tool canary materialization', () => {
  it('materializes the repository B canonical source without changing its bytes', async () => {
    const repositoryRoot = resolve(import.meta.dirname, '../..')
    const dshHome = await temporaryDirectory('harness-agent-preset-canonical-')

    const result = await materializeSourceAgentToolCanary(repositoryRoot, dshHome)

    for (const filename of ['agent.cordis.yml', 'preset.yml']) {
      expect(await readFile(resolve(result.targetDirectory, filename), 'utf8'))
        .toBe(await readFile(resolve(result.sourceDirectory, filename), 'utf8'))
    }
  })

  it('parses the canonical B composition with the DSH dialect and fixes its model Tool contract', async () => {
    const repositoryRoot = resolve(import.meta.dirname, '../..')
    const compositionPath = resolve(
      repositoryRoot,
      'agent-presets/harness-comfyui-tool-canary/agent.cordis.yml',
    )

    const rows = await validateAgentPresetComposition(compositionPath)

    expect(rows.map(row => ({ id: row.id, name: row.name }))).toEqual([
      { id: 'persona', name: '@deepseek-ai/dsh-persona' },
      { id: 'agent-instructions', name: '@deepseek-ai/dsh-agent-instructions' },
      { id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash' },
      { id: 'tool-pwsh', name: '@deepseek-ai/dsh-tool-pwsh' },
      { id: 'tool-presentation', name: '@deepseek-ai/dsh-agent-tool-presentation' },
      { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
      { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
      { id: 'compaction', name: 'cordis:group' },
    ])
    expect(rows.find(row => row.id === 'tool-bash')).toMatchObject({
      disabled: { __jsExpr: "process.platform === 'win32'" },
      config: { enableRunInBackground: false },
    })
    expect(rows.find(row => row.id === 'tool-pwsh')).toMatchObject({
      disabled: { __jsExpr: "process.platform !== 'win32'" },
      config: { enableRunInBackground: false },
    })
    expect(rows.find(row => row.id === 'tool-presentation')).toMatchObject({ config: { mode: 'native' } })
    expect(rows.find(row => row.id === 'compaction').config.map(row => row.name)).toEqual([
      '@deepseek-ai/dsh-compaction-basic',
      '@deepseek-ai/dsh-command-compact',
      '@deepseek-ai/dsh-compaction-tool-result-pruner',
    ])
    expect([
      process.platform === 'win32' ? 'pwsh' : 'bash',
      TEMPLATE_RESOLVER_TOOL_NAME,
      GENERATION_MODEL_RESOLVER_TOOL_NAME,
      LORA_RESOLVER_TOOL_NAME,
      COMFYUI_INSTANCE_QUERY_TOOL_NAME,
      GENERATION_TOOL_NAME,
      'skill',
    ]).toEqual([
      process.platform === 'win32' ? 'pwsh' : 'bash',
      'query_semantic_comfyui_templates',
      'query_semantic_generation_models',
      'query_semantic_loras',
      'query_semantic_comfyui_instances',
      'generate_with_comfyui',
      'skill',
    ])
  })

  it('installs the canonical B preset into only the supplied DSH home', async () => {
    const fixture = await createRepositoryFixture()
    const dshHome = await temporaryDirectory('harness-agent-preset-home-')

    const result = await materializeSourceAgentToolCanary(fixture.repositoryRoot, dshHome)

    const targetDirectory = resolve(dshHome, '.agent-presets', fixture.presetId)
    expect(result).toEqual({
      presetId: fixture.presetId,
      sourceDirectory: fixture.presetSource,
      targetDirectory,
    })
    expect(await readFile(resolve(targetDirectory, 'agent.cordis.yml'), 'utf8'))
      .toBe('- id: tool-bash\n  name: \'@deepseek-ai/dsh-tool-bash\'\n')
    expect(await readFile(resolve(targetDirectory, 'preset.yml'), 'utf8'))
      .toBe('name: Test Tool Canary\n')
  })

  it('replaces only its owned preset directory on repeated preparation', async () => {
    const fixture = await createRepositoryFixture()
    const dshHome = await temporaryDirectory('harness-agent-preset-replace-')
    const siblingDirectory = resolve(dshHome, '.agent-presets', 'user-owned')
    await mkdir(siblingDirectory, { recursive: true })
    await writeFile(resolve(siblingDirectory, 'keep.txt'), 'keep\n', 'utf8')
    await materializeSourceAgentToolCanary(fixture.repositoryRoot, dshHome)
    const targetDirectory = resolve(dshHome, '.agent-presets', fixture.presetId)
    await writeFile(resolve(targetDirectory, 'stale.txt'), 'stale\n', 'utf8')
    await writeFile(resolve(fixture.presetSource, 'preset.yml'), 'name: Updated Tool Canary\n', 'utf8')

    await materializeSourceAgentToolCanary(fixture.repositoryRoot, dshHome)

    expect(await pathExists(resolve(targetDirectory, 'stale.txt'))).toBe(false)
    expect(await readFile(resolve(targetDirectory, 'preset.yml'), 'utf8'))
      .toBe('name: Updated Tool Canary\n')
    expect(await readFile(resolve(siblingDirectory, 'keep.txt'), 'utf8')).toBe('keep\n')
  })

  it('rejects an invalid canonical source without replacing an installed B preset', async () => {
    const fixture = await createRepositoryFixture()
    const dshHome = await temporaryDirectory('harness-agent-preset-invalid-')
    await materializeSourceAgentToolCanary(fixture.repositoryRoot, dshHome)
    const targetMetadata = resolve(dshHome, '.agent-presets', fixture.presetId, 'preset.yml')
    await rm(resolve(fixture.presetSource, 'agent.cordis.yml'))

    await expect(materializeSourceAgentToolCanary(fixture.repositoryRoot, dshHome))
      .rejects.toThrow('canonical Agent Preset directory')
    expect(await readFile(targetMetadata, 'utf8')).toBe('name: Test Tool Canary\n')
  })

  it.each([
    {
      name: 'malformed DSH YAML',
      composition: '- id: broken\n  name: [\n',
      message: 'not valid DSH YAML',
    },
    {
      name: 'an unavailable DSH component',
      composition: '- id: broken\n  name: \'@deepseek-ai/dsh-component-that-does-not-exist\'\n',
      message: 'component cannot be resolved by DSH',
    },
  ])('preserves the installed preset when the canonical source contains $name', async ({ composition, message }) => {
    const fixture = await createRepositoryFixture()
    const dshHome = await temporaryDirectory('harness-agent-preset-invalid-composition-')
    await materializeSourceAgentToolCanary(fixture.repositoryRoot, dshHome)
    const targetComposition = resolve(dshHome, '.agent-presets', fixture.presetId, 'agent.cordis.yml')
    const installedComposition = await readFile(targetComposition, 'utf8')
    await writeFile(resolve(fixture.presetSource, 'agent.cordis.yml'), composition, 'utf8')

    await expect(materializeSourceAgentToolCanary(fixture.repositoryRoot, dshHome)).rejects.toThrow(message)

    expect(await readFile(targetComposition, 'utf8')).toBe(installedComposition)
  })

  it('rejects a symbolic-link install root without changing its external target', async () => {
    const fixture = await createRepositoryFixture()
    const dshHome = await temporaryDirectory('harness-agent-preset-linked-home-')
    const externalRoot = await temporaryDirectory('harness-agent-preset-external-')
    const sentinel = resolve(externalRoot, 'sentinel.txt')
    await writeFile(sentinel, 'outside remains unchanged\n', 'utf8')
    await symlink(externalRoot, resolve(dshHome, '.agent-presets'), 'dir')

    await expect(materializeSourceAgentToolCanary(fixture.repositoryRoot, dshHome))
      .rejects.toThrow('install root must not be a symbolic link')

    expect(await readFile(sentinel, 'utf8')).toBe('outside remains unchanged\n')
    expect(await pathExists(resolve(externalRoot, fixture.presetId))).toBe(false)
  })

  it('restores the installed preset when the staged-directory rename fails', async () => {
    const root = await temporaryDirectory('harness-agent-preset-rollback-')
    const targetDirectory = resolve(root, 'harness-comfyui-tool-canary')
    const missingStagingDirectory = resolve(root, '.missing.next')
    const backupDirectory = resolve(root, '.canary.previous')
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
      message: 'must contain exactly schemaVersion, toolCanary',
    },
    {
      name: 'a different schema version',
      change: value => ({ ...value, schemaVersion: 2 }),
      message: 'schemaVersion must be 1',
    },
    {
      name: 'an invalid preset id',
      change: value => ({ ...value, toolCanary: { ...value.toolCanary, presetId: '../escape' } }),
      message: 'presetId must contain only',
    },
    {
      name: 'an escaping source root',
      change: value => ({ ...value, toolCanary: { ...value.toolCanary, sourceRootRelativePath: '../escape' } }),
      message: 'sourceRootRelativePath must identify a directory inside its root',
    },
    {
      name: 'an escaping install root',
      change: value => ({ ...value, toolCanary: { ...value.toolCanary, installRootRelativePath: '../escape' } }),
      message: 'installRootRelativePath must identify a directory inside its root',
    },
  ])('rejects $name before creating the installation root', async ({ change, message }) => {
    const fixture = await createRepositoryFixture()
    const dshHome = resolve(await temporaryDirectory('harness-agent-preset-config-'), 'dsh-home')
    const config = JSON.parse(await readFile(fixture.configPath, 'utf8'))
    await writeFile(fixture.configPath, `${JSON.stringify(change(config), null, 2)}\n`, 'utf8')

    await expect(materializeSourceAgentToolCanary(fixture.repositoryRoot, dshHome)).rejects.toThrow(message)
    expect(await pathExists(dshHome)).toBe(false)
  })
})

describe('worktree-only Agent Tool canary preparation', () => {
  it('materializes B after the shared source runtime is prepared', async () => {
    const fixture = await createRepositoryFixture()
    const dshHome = await temporaryDirectory('harness-agent-preset-worktree-')
    const context = { repositoryRoot: fixture.repositoryRoot, dshHome }
    const prepareRuntime = vi.fn(async () => ({ activeVersion: '0.31.4', dshHome }))

    const result = await prepareSourceWorktreeRuntime(context, { prepareRuntime })

    expect(prepareRuntime).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      activeVersion: '0.31.4',
      agentToolCanary: {
        presetId: fixture.presetId,
        targetDirectory: resolve(dshHome, '.agent-presets', fixture.presetId),
      },
    })
  })

  it('does not materialize B when shared source runtime preparation fails', async () => {
    const fixture = await createRepositoryFixture()
    const dshHome = await temporaryDirectory('harness-agent-preset-worktree-failure-')
    const prepareRuntime = vi.fn(async () => { throw new Error('shared preparation failed') })

    await expect(prepareSourceWorktreeRuntime(
      { repositoryRoot: fixture.repositoryRoot, dshHome },
      { prepareRuntime },
    )).rejects.toThrow('shared preparation failed')

    expect(await pathExists(resolve(dshHome, '.agent-presets', fixture.presetId))).toBe(false)
  })
})

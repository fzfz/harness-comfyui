import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  materializeSourceAgentExperiment,
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
const PRESET_IDS = [
  'harness-comfyui-schema-control',
  'harness-comfyui-cli-candidate',
]

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

function experimentConfig(change = value => value) {
  return change({
    schemaVersion: 1,
    experiment: {
      presets: {
        schemaControl: PRESET_IDS[0],
        cliCandidate: PRESET_IDS[1],
      },
      sourceRootRelativePath: 'agent-presets',
      installRootRelativePath: '.agent-presets',
      sharedFiles: ['project-tool-visibility.mjs'],
    },
  })
}

async function createRepositoryFixture() {
  const repositoryRoot = await temporaryDirectory('harness-agent-experiment-source-')
  const sourceRoot = resolve(repositoryRoot, 'agent-presets')
  await mkdir(resolve(repositoryRoot, 'config'), { recursive: true })
  await mkdir(sourceRoot, { recursive: true })
  const configPath = resolve(repositoryRoot, 'config/product-agent.json')
  await writeFile(configPath, `${JSON.stringify(experimentConfig(), null, 2)}\n`, 'utf8')
  await writeFile(
    resolve(sourceRoot, 'project-tool-visibility.mjs'),
    'export function apply() {}\n',
    'utf8',
  )
  for (const [index, presetId] of PRESET_IDS.entries()) {
    const presetSource = resolve(sourceRoot, presetId)
    await mkdir(presetSource, { recursive: true })
    await writeFile(
      resolve(presetSource, 'agent.cordis.yml'),
      `- id: visibility\n  name: ../project-tool-visibility.mjs\n  config:\n    mode: ${index === 0 ? 'inherit-host-global' : 'local-only'}\n`,
      'utf8',
    )
    await writeFile(resolve(presetSource, 'preset.yml'), `name: Test ${index === 0 ? 'A' : 'B'}\n`, 'utf8')
  }
  return { repositoryRoot, sourceRoot, configPath }
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
    const paths = PRESET_IDS.map(id => resolve(repositoryRoot, 'agent-presets', id, 'agent.cordis.yml'))
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
    expect(control.map(row => row.name)).toEqual([
      '../project-tool-visibility.mjs',
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

describe('source Agent A/B materialization', () => {
  it('materializes one shared visibility plugin and both controlled Presets', async () => {
    const repositoryRoot = resolve(import.meta.dirname, '../..')
    const dshHome = await temporaryDirectory('harness-agent-ab-canonical-')

    const result = await materializeSourceAgentExperiment(repositoryRoot, dshHome)

    expect(result.presets.map(preset => preset.presetId)).toEqual(PRESET_IDS)
    expect(await readFile(resolve(result.installRoot, 'project-tool-visibility.mjs'), 'utf8'))
      .toBe(await readFile(resolve(repositoryRoot, 'agent-presets/project-tool-visibility.mjs'), 'utf8'))
    for (const preset of result.presets) {
      for (const filename of ['agent.cordis.yml', 'preset.yml']) {
        expect(await readFile(resolve(preset.targetDirectory, filename), 'utf8'))
          .toBe(await readFile(resolve(preset.sourceDirectory, filename), 'utf8'))
      }
    }
  })

  it('replaces only experiment-owned paths on repeated materialization', async () => {
    const fixture = await createRepositoryFixture()
    const dshHome = await temporaryDirectory('harness-agent-ab-replace-')
    const siblingDirectory = resolve(dshHome, '.agent-presets', 'user-owned')
    await mkdir(siblingDirectory, { recursive: true })
    await writeFile(resolve(siblingDirectory, 'keep.txt'), 'keep\n', 'utf8')
    await materializeSourceAgentExperiment(fixture.repositoryRoot, dshHome)
    const targetA = resolve(dshHome, '.agent-presets', PRESET_IDS[0])
    await writeFile(resolve(targetA, 'stale.txt'), 'stale\n', 'utf8')
    await writeFile(resolve(fixture.sourceRoot, PRESET_IDS[0], 'preset.yml'), 'name: Updated A\n', 'utf8')
    await writeFile(resolve(fixture.sourceRoot, 'project-tool-visibility.mjs'), 'export function apply() { return 1 }\n', 'utf8')

    await materializeSourceAgentExperiment(fixture.repositoryRoot, dshHome)

    expect(await pathExists(resolve(targetA, 'stale.txt'))).toBe(false)
    expect(await readFile(resolve(targetA, 'preset.yml'), 'utf8')).toBe('name: Updated A\n')
    expect(await readFile(resolve(dshHome, '.agent-presets/project-tool-visibility.mjs'), 'utf8'))
      .toBe('export function apply() { return 1 }\n')
    expect(await readFile(resolve(siblingDirectory, 'keep.txt'), 'utf8')).toBe('keep\n')
  })

  it('validates all canonical sources before creating the install root', async () => {
    const fixture = await createRepositoryFixture()
    const dshHome = await temporaryDirectory('harness-agent-ab-invalid-')
    await rm(resolve(fixture.sourceRoot, PRESET_IDS[1], 'agent.cordis.yml'))

    await expect(materializeSourceAgentExperiment(fixture.repositoryRoot, dshHome))
      .rejects.toThrow('canonical Agent Preset directory')
    expect(await pathExists(resolve(dshHome, '.agent-presets'))).toBe(false)
  })

  it.each([
    ['invalid module syntax', 'export function apply(\n', 'component cannot be loaded'],
    ['a missing apply export', 'export const name = "missing-apply"\n', 'must export apply'],
  ])('preserves the installed shared component when the source has %s', async (_name, source, message) => {
    const fixture = await createRepositoryFixture()
    const dshHome = await temporaryDirectory('harness-agent-ab-invalid-component-')
    await materializeSourceAgentExperiment(fixture.repositoryRoot, dshHome)
    const installedPath = resolve(dshHome, '.agent-presets/project-tool-visibility.mjs')
    const installedBeforeFailure = await readFile(installedPath, 'utf8')
    await writeFile(resolve(fixture.sourceRoot, 'project-tool-visibility.mjs'), source, 'utf8')

    await expect(materializeSourceAgentExperiment(fixture.repositoryRoot, dshHome)).rejects.toThrow(message)

    expect(await readFile(installedPath, 'utf8')).toBe(installedBeforeFailure)
  })

  it('rejects a symbolic-link install root without changing its external target', async () => {
    const fixture = await createRepositoryFixture()
    const dshHome = await temporaryDirectory('harness-agent-ab-linked-home-')
    const externalRoot = await temporaryDirectory('harness-agent-ab-external-')
    const sentinel = resolve(externalRoot, 'sentinel.txt')
    await writeFile(sentinel, 'outside remains unchanged\n', 'utf8')
    await symlink(externalRoot, resolve(dshHome, '.agent-presets'), 'dir')

    await expect(materializeSourceAgentExperiment(fixture.repositoryRoot, dshHome))
      .rejects.toThrow('install root must not be a symbolic link')

    expect(await readFile(sentinel, 'utf8')).toBe('outside remains unchanged\n')
    expect(await pathExists(resolve(externalRoot, PRESET_IDS[0]))).toBe(false)
  })

  it('restores an installed path when the staged rename fails', async () => {
    const root = await temporaryDirectory('harness-agent-ab-rollback-')
    const targetDirectory = resolve(root, PRESET_IDS[0])
    const missingStagingDirectory = resolve(root, '.missing.next')
    const backupDirectory = resolve(root, '.experiment.previous')
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
      message: 'must contain exactly experiment, schemaVersion',
    },
    {
      name: 'a different schema version',
      change: value => ({ ...value, schemaVersion: 2 }),
      message: 'schemaVersion must be 1',
    },
    {
      name: 'a missing B preset role',
      change: value => ({
        ...value,
        experiment: { ...value.experiment, presets: { schemaControl: PRESET_IDS[0] } },
      }),
      message: 'presets must contain exactly cliCandidate, schemaControl',
    },
    {
      name: 'a duplicated preset id',
      change: value => ({
        ...value,
        experiment: {
          ...value.experiment,
          presets: { schemaControl: PRESET_IDS[0], cliCandidate: PRESET_IDS[0] },
        },
      }),
      message: 'presets values must be unique',
    },
    {
      name: 'an escaping source root',
      change: value => ({ ...value, experiment: { ...value.experiment, sourceRootRelativePath: '../escape' } }),
      message: 'sourceRootRelativePath must identify a path inside its root',
    },
    {
      name: 'an escaping install root',
      change: value => ({ ...value, experiment: { ...value.experiment, installRootRelativePath: '../escape' } }),
      message: 'installRootRelativePath must identify a path inside its root',
    },
    {
      name: 'an invalid shared filename',
      change: value => ({ ...value, experiment: { ...value.experiment, sharedFiles: ['../escape.mjs'] } }),
      message: 'sharedFiles must contain .mjs basenames',
    },
  ])('rejects $name before creating the installation root', async ({ change, message }) => {
    const fixture = await createRepositoryFixture()
    const dshHome = await temporaryDirectory('harness-agent-ab-config-')
    await writeFile(fixture.configPath, `${JSON.stringify(experimentConfig(change), null, 2)}\n`, 'utf8')

    await expect(materializeSourceAgentExperiment(fixture.repositoryRoot, dshHome)).rejects.toThrow(message)
    expect(await pathExists(resolve(dshHome, '.agent-presets'))).toBe(false)
  })
})

describe('worktree-only Agent A/B preparation', () => {
  it('materializes both Presets after the shared source runtime is prepared', async () => {
    const fixture = await createRepositoryFixture()
    const dshHome = await temporaryDirectory('harness-agent-ab-worktree-')
    const context = { repositoryRoot: fixture.repositoryRoot, dshHome }
    const prepareRuntime = vi.fn(async () => ({ activeVersion: '0.31.4', dshHome }))

    const result = await prepareSourceWorktreeRuntime(context, { prepareRuntime })

    expect(prepareRuntime).toHaveBeenCalledOnce()
    expect(result.agentExperiment.presets.map(preset => preset.presetId)).toEqual(PRESET_IDS)
  })

  it('does not materialize either Preset when shared source runtime preparation fails', async () => {
    const fixture = await createRepositoryFixture()
    const dshHome = await temporaryDirectory('harness-agent-ab-worktree-failure-')
    const prepareRuntime = vi.fn(async () => { throw new Error('shared preparation failed') })

    await expect(prepareSourceWorktreeRuntime(
      { repositoryRoot: fixture.repositoryRoot, dshHome },
      { prepareRuntime },
    )).rejects.toThrow('shared preparation failed')

    expect(await pathExists(resolve(dshHome, '.agent-presets'))).toBe(false)
  })
})

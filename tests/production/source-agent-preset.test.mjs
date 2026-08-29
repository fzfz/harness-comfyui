import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  materializeSourceProductAgentPreset,
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
import { GENERATION_RUN_INPUT_TOOL_NAME } from '../../src/host/generation/generation-run-input-tool.ts'
import {
  GENERATION_RUN_MEDIA_TOOL_NAME,
  INSPECT_IMAGE_TOOL_NAME,
} from '../../src/host/image-reader/image-reader-tool.ts'

const temporaryPaths = []
const CONTROL_PRESET_ID = 'harness-comfyui-schema-control'
const PRODUCT_PRESET_ID = 'harness-comfyui-cli-candidate'
const PRESET_IDS = [CONTROL_PRESET_ID, PRODUCT_PRESET_ID]

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

function productConfig(change = value => value) {
  return change({
    schemaVersion: 1,
    preset: {
      id: PRODUCT_PRESET_ID,
      sourceRootRelativePath: 'agent-presets',
      installRootRelativePath: '.agent-presets',
      retiredManagedPresetIds: [CONTROL_PRESET_ID],
      sharedFiles: ['project-tool-visibility.mjs'],
    },
  })
}

async function createRepositoryFixture() {
  const repositoryRoot = await temporaryDirectory('harness-product-agent-source-')
  const sourceRoot = resolve(repositoryRoot, 'agent-presets')
  await mkdir(resolve(repositoryRoot, 'config'), { recursive: true })
  await mkdir(sourceRoot, { recursive: true })
  const configPath = resolve(repositoryRoot, 'config/product-agent.json')
  await writeFile(configPath, `${JSON.stringify(productConfig(), null, 2)}\n`, 'utf8')
  await writeFile(
    resolve(sourceRoot, 'project-tool-visibility.mjs'),
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

describe('source product Agent Preset materialization', () => {
  it('materializes only the ComfyUI workbench Preset with its product display name', async () => {
    const repositoryRoot = resolve(import.meta.dirname, '../..')
    const dshHome = await temporaryDirectory('harness-product-agent-canonical-')

    const result = await materializeSourceProductAgentPreset(repositoryRoot, dshHome)

    expect(result.presets.map(preset => preset.presetId)).toEqual([PRODUCT_PRESET_ID])
    expect(await readFile(resolve(result.installRoot, 'project-tool-visibility.mjs'), 'utf8'))
      .toBe(await readFile(resolve(repositoryRoot, 'agent-presets/project-tool-visibility.mjs'), 'utf8'))
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
      message: 'must contain exactly preset, schemaVersion',
    },
    {
      name: 'a different schema version',
      change: value => ({ ...value, schemaVersion: 2 }),
      message: 'schemaVersion must be 1',
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

import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const repositoryRoot = resolve(import.meta.dirname, '../../..')
const localRequire = createRequire(import.meta.url)
import { parsePresetYaml } from '../../support/preset-yaml.mjs'
const presetRows = parsePresetYaml(await readFile(resolve(repositoryRoot, 'agent-presets/presets.cordis.yml'), 'utf8'))

const installedRoot = await mkdtemp(resolve(repositoryRoot, '.local/installed presets with spaces-'))
await mkdir(resolve(installedRoot, 'agent-presets'))
await mkdir(resolve(installedRoot, 'config'))
await cp(resolve(repositoryRoot, 'config/workbench-translation.json'), resolve(installedRoot, 'config/workbench-translation.json'))
for (const name of ['project-installed-presets.mjs', 'presets.cordis.yml', 'translation-preset.mjs']) {
  await cp(resolve(repositoryRoot, 'agent-presets', name), resolve(installedRoot, 'agent-presets', name))
}
const { default: InstalledPresets } = await import(pathToFileURL(resolve(installedRoot, 'agent-presets/project-installed-presets.mjs')).href)
const includeRequire = createRequire(localRequire.resolve('@deepseek-ai/cordis-plugin-include'))
const runtimeCordis = await import(pathToFileURL(includeRequire.resolve('@deepseek-ai/cordis')).href)
const runtimeLoader = await import(pathToFileURL(includeRequire.resolve('@deepseek-ai/cordis-plugin-loader')).href)
const ctx = new runtimeCordis.Context()
const snapshots = new Map()
const disposed = []
const loader = ctx.plugin(runtimeLoader.Loader, {
  baseUrl: pathToFileURL(resolve(repositoryRoot, 'cordis.patch.yml')).href,
})
await loader
loader.ctx.loader.internal = {
  async import(name) {
    const component = name === '@deepseek-ai/dsh-agent-preset'
      ? await import(pathToFileURL(localRequire.resolve(name)).href)
      : await import(pathToFileURL(resolve(installedRoot, 'agent-presets/translation-preset.mjs')).href)
    return class PresetCapture {
      static Config = component.default.Config
      static [runtimeLoader.EntryGroup.key] = true
      constructor(child, config) {
        snapshots.set(config.id, config)
        child.effect(() => () => {
          if (snapshots.get(config.id) === config) snapshots.delete(config.id)
          disposed.push(config.id)
        })
      }
    }
  },
}
try {
  const fiber = ctx.extend({ baseUrl: pathToFileURL(resolve(repositoryRoot, 'cordis.patch.yml')).href }).plugin(InstalledPresets)
  await fiber
  await waitForPresetRows(() => snapshots.size === presetRows.length)
  const defaultPresetIds = [...snapshots.keys()].sort()
  assert.equal(snapshots.get('harness-comfyui-cli-candidate').order, 91)
  await fiber.update({ patches: [{
    id: 'preset-harness-comfyui-cli-candidate',
    config: { ...snapshots.get('harness-comfyui-cli-candidate'), order: 193,
      nested: { headers: { Authorization: { __jsExpr: 'process.env.INSTALLED_PRESET_TEST_TOKEN' } } } },
  }] })
  await waitForPresetRows(() => snapshots.get('harness-comfyui-cli-candidate')?.order === 193)
  const patchedOrder = snapshots.get('harness-comfyui-cli-candidate').order
  const nestedExpressionPreserved = snapshots.get('harness-comfyui-cli-candidate').nested.headers.Authorization.__jsExpr === 'process.env.INSTALLED_PRESET_TEST_TOKEN'
  assert.equal(nestedExpressionPreserved, true, 'nested expression must be evaluated only by its target row')
  await fiber.update({ patches: [] })
  await waitForPresetRows(() => snapshots.get('harness-comfyui-cli-candidate')?.order === 91)
  const reloadedOrder = snapshots.get('harness-comfyui-cli-candidate').order
  await fiber.dispose()
  console.log(JSON.stringify({ defaultPresetIds, patchedOrder, nestedExpressionPreserved,
    reloadedOrder, disposed: snapshots.size === 0 && disposed.length >= 2 }))
} finally {
  await ctx.fiber.dispose()
  await rm(installedRoot, { recursive: true, force: true })
}

async function waitForPresetRows(ready) {
  const deadline = Date.now() + 3000
  while (!ready()) {
    if (Date.now() > deadline) throw new Error('Installed Preset declarations did not become ready')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

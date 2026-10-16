import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import yaml from 'js-yaml'
import { applyEntryPatches, entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { afterEach, describe, expect, it } from 'vitest'
import { createOfficialPresetProfilePatch, writeOfficialPresetProfilePatch } from '../desktop/fixtures/official-preset-overrides.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const temporaryRoots = []
const readRows = async path => yaml.load(await readFile(path, 'utf8'), { schema: entryListSchema })
const apply = (rows, patches) => applyEntryPatches(rows, patches, message => { throw new Error(message) })

afterEach(async () => Promise.all(temporaryRoots.splice(0).map(path => rm(path, { recursive: true, force: true }))))

async function installedRoot() {
  const root = await mkdtemp(join(tmpdir(), 'installed preset resources with spaces-'))
  temporaryRoots.push(root)
  await cp(join(repositoryRoot, 'agent-presets'), join(root, 'agent-presets'), { recursive: true })
  await cp(join(repositoryRoot, 'config'), join(root, 'config'), { recursive: true })
  return root
}

async function resolvePatched(root, patch) {
  const original = await readRows(join(root, 'agent-presets/presets.cordis.yml'))
  const rows = apply(original, patch.config.patches)
  const result = []
  for (const row of rows) {
    const group = row.config.plugins.find(entry => entry.id === 'project-skill-scope')
    const composition = group.config.find(entry => entry.id === 'composition')
    const path = resolve(root, 'agent-presets', composition.config.path)
    const originalComposition = await readRows(path)
    const composed = apply(originalComposition, composition.config.patches)
    const mcpInclude = composed.find(entry => entry.id === 'noobai-mcp')
    const mcpPath = resolve(dirname(path), mcpInclude.config.path)
    const originalMcp = await readRows(mcpPath)
    result.push({ row, originalComposition, composed, originalMcp, mcp: apply(originalMcp, mcpInclude.config.patches) })
  }
  return { original, rows, result }
}

describe('installed Preset Profile overrides', () => {
  it('writes explicit overlays into an existing Profile without replacing other entries, and retries safely', async () => {
    const root = await installedRoot()
    const path = join(root, 'profile.patch.yml')
    const preserved = { id: 'agent-default-model', config: { provider: 'user', model: 'saved' } }
    const previous = [{ id: 'group', group: true, config: [preserved, { id: 'harness-comfyui-presets', config: { patches: [] } }] }]
    await writeFile(path, yaml.dump(previous, { schema: entryListSchema }))
    const options = { installedPackageRoot: root, mcpUrl: 'http://127.0.0.1:12345/mcp',
      profilePatchPath: path, profilePatchAdapter: {
        parse: text => yaml.load(text, { schema: entryListSchema }),
        serialize: rows => yaml.dump(rows, { schema: entryListSchema }),
      } }
    const patch = await writeOfficialPresetProfilePatch(options)
    await writeOfficialPresetProfilePatch(options)
    const rows = await readRows(path)
    expect(rows).toEqual([{ id: 'group', group: true, config: [preserved, patch] }])
    await writeOfficialPresetProfilePatch({ ...options, mcpUrl: undefined })
    const defaults = await resolvePatched(root, (await readRows(path))[0].config[1])
    for (const entry of defaults.result) expect(entry.mcp).toEqual(entry.originalMcp)
    await writeFile(path, yaml.dump([...rows, { id: 'harness-comfyui-presets' }], { schema: entryListSchema }))
    await expect(writeOfficialPresetProfilePatch(options)).rejects.toThrow(/duplicate entry/)
  })

  it.each(['missing', 'duplicate'])('rejects %s target entries at each include layer', async kind => {
    for (const [relativePath, id] of [
      ['agent-presets/presets.cordis.yml', 'preset-harness-comfyui-cli-candidate'],
      ['agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml', 'noobai-mcp'],
      ['agent-presets/noobai-mcp.cordis.yml', 'mcp-noobai'],
      ['agent-presets/harness-comfyui-iteration/agent.cordis.yml', 'composition-agent'],
    ]) {
      const root = await installedRoot()
      const path = join(root, relativePath)
      const original = await readRows(path)
      const target = original.find(row => row.id === id)
      const modified = kind === 'missing' ? original.filter(row => row.id !== id) : [...original, structuredClone(target)]
      await writeFile(path, yaml.dump(modified, { schema: entryListSchema }))
      await expect(createOfficialPresetProfilePatch({ installedPackageRoot: root, mcpUrl: 'http://127.0.0.1:12345/mcp',
        roleAgentOptions: { 'composition-agent': { provider: 'fixture', model: 'role' } } })).rejects.toThrow(/expected exactly one/)
    }
  })

  it('supports independent MCP and role overlays, and restores installed defaults when both are omitted', async () => {
    const root = await installedRoot()
    const defaults = await resolvePatched(root, await createOfficialPresetProfilePatch({ installedPackageRoot: root }))
    for (const entry of defaults.result) {
      expect(entry.composed).toEqual(entry.originalComposition)
      expect(entry.mcp).toEqual(entry.originalMcp)
    }
    const roleOnly = await resolvePatched(root, await createOfficialPresetProfilePatch({ installedPackageRoot: root,
      roleAgentOptions: { 'generation-agent': { provider: 'fixture', model: 'generation' } } }))
    for (const entry of roleOnly.result) expect(entry.mcp).toEqual(entry.originalMcp)
    const mcpOnly = await resolvePatched(root, await createOfficialPresetProfilePatch({ installedPackageRoot: root,
      mcpUrl: 'http://127.0.0.1:12345/mcp' }))
    for (const entry of mcpOnly.result) {
      expect(entry.composed.filter(row => row.id !== 'noobai-mcp')).toEqual(entry.originalComposition.filter(row => row.id !== 'noobai-mcp'))
    }
  })

  it('derives MCP and role overrides from installed resources while retaining every other field and expression', async () => {
    const root = await installedRoot()
    const roleAgentOptions = { 'composition-agent': { provider: 'fixture', model: 'composition', reasoningEffort: 'high' } }
    const patch = await createOfficialPresetProfilePatch({ installedPackageRoot: root, mcpUrl: 'http://127.0.0.1:31234/mcp', roleAgentOptions })
    expect(patch.id).toBe('harness-comfyui-presets')
    const { original, rows, result } = await resolvePatched(root, patch)
    expect(rows.map(row => row.config.plugins[0].isolate)).toEqual(original.map(row => row.config.plugins[0].isolate))
    for (const entry of result) {
      expect(entry.mcp[0].config).toEqual({ ...entry.originalMcp[0].config, url: 'http://127.0.0.1:31234/mcp' })
      expect(entry.mcp[0].config.headers.Authorization).toEqual({ __jsExpr: '`Bearer ${process.env.NOOBAI_MCP_TOKEN}`' })
      for (const composed of entry.composed.filter(row => row.id !== 'noobai-mcp')) {
        const before = entry.originalComposition.find(row => row.id === composed.id)
        expect(composed).toEqual(composed.id === 'composition-agent'
          ? { ...before, config: { ...before.config, agentOptions: roleAgentOptions['composition-agent'] } }
          : before)
      }
    }
    expect(roleAgentOptions).toEqual({ 'composition-agent': { provider: 'fixture', model: 'composition', reasoningEffort: 'high' } })
    expect(await readRows(join(root, 'agent-presets/presets.cordis.yml'))).toEqual(original)
    expect(apply(original, [])).toEqual(original)
  })
})

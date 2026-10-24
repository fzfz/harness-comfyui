import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

function entriesWithId(rows, id) {
  return rows.flatMap(row => [
    ...(row.id === id ? [row] : []),
    ...(row.group && Array.isArray(row.config) ? entriesWithId(row.config, id) : []),
  ])
}

function unique(rows, id, path) {
  const matches = entriesWithId(rows, id)
  if (matches.length !== 1) throw new Error(`${path}: expected exactly one entry ${id}; found ${matches.length}`)
  return matches[0]
}

async function readEntries(path) {
  const rows = yaml.load(await readFile(path, 'utf8'), { schema: entryListSchema })
  if (!Array.isArray(rows)) throw new TypeError(`${path}: expected an entry list`)
  return rows
}

export async function createOfficialPresetProfilePatch({ installedPackageRoot, mcpUrl, roleAgentOptions = {} }) {
  const product = JSON.parse(await readFile(resolve(installedPackageRoot, 'config/product-agent.json'), 'utf8'))
  const presetsPath = resolve(installedPackageRoot, product.preset.sourceRootRelativePath, 'presets.cordis.yml')
  const presets = await readEntries(presetsPath)
  const presetIds = [product.preset.id, ...product.preset.additionalManagedPresetIds]
  const unmatchedRoles = new Set(Object.keys(roleAgentOptions))
  const patches = []
  for (const presetId of presetIds) {
    const targets = presets.filter(row => row.config?.id === presetId)
    if (targets.length !== 1) throw new Error(`${presetsPath}: expected exactly one Preset ${presetId}; found ${targets.length}`)
    const preset = structuredClone(targets[0])
    const composition = unique(preset.config.plugins, 'composition', presetsPath)
    const compositionPath = resolve(dirname(presetsPath), composition.config.path)
    const rows = await readEntries(compositionPath)
    const compositionPatches = [...(composition.config.patches ?? [])]
    if (mcpUrl !== undefined) {
      const common = unique(rows, 'project-common', compositionPath)
      const commonPath = resolve(dirname(compositionPath), common.config.path)
      const shared = await readEntries(commonPath)
      const include = unique(shared, 'noobai-mcp', commonPath)
      const mcpPath = resolve(dirname(commonPath), include.config.path)
      const mcpRows = await readEntries(mcpPath)
      const client = unique(mcpRows, 'mcp-noobai', mcpPath)
      compositionPatches.push({ id: common.id, config: {
        ...structuredClone(common.config),
        patches: [...(common.config.patches ?? []), { id: include.id, config: {
          ...structuredClone(include.config),
          patches: [...(include.config.patches ?? []), { id: client.id, config: { ...structuredClone(client.config), url: mcpUrl } }],
        } }],
      } })
    }
    if (presetId !== product.preset.id) {
      for (const [id, agentOptions] of Object.entries(roleAgentOptions)) {
        if (entriesWithId(rows, id).length === 0) continue
        const role = unique(rows, id, compositionPath)
        if (!unmatchedRoles.has(id)) throw new Error(`expected exactly one role ${id} across installed Presets`)
        compositionPatches.push({ id, config: { ...structuredClone(role.config), agentOptions: structuredClone(agentOptions) } })
        unmatchedRoles.delete(id)
      }
    }
    if (compositionPatches.length > 0) composition.config.patches = compositionPatches
    patches.push({ id: preset.id, config: preset.config })
  }
  if (unmatchedRoles.size > 0) throw new Error(`expected exactly one entry for each requested role; missing: ${[...unmatchedRoles].join(', ')}`)
  return { id: 'harness-comfyui-presets', config: { patches } }
}

export async function writeOfficialPresetProfilePatch({ profilePatchPath, profilePatchAdapter, ...options }) {
  const patch = await createOfficialPresetProfilePatch(options)
  const rows = await profilePatchAdapter.parse(await readFile(profilePatchPath, 'utf8'))
  const matches = entriesWithId(rows, patch.id)
  if (matches.length > 1) throw new Error(`${profilePatchPath}: duplicate entry ${patch.id}`)
  if (matches.length === 0) rows.push(patch)
  else matches[0].config = patch.config
  await writeFile(profilePatchPath, await profilePatchAdapter.serialize(rows), 'utf8')
  return patch
}

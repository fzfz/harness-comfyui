import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import yaml from 'js-yaml'
import { applyEntryPatches, entryListSchema } from '@deepseek-ai/cordis-plugin-include'

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

export async function createOfficialPresetProfilePatch({ installedPackageRoot, mcpUrl, customSkillDirs }) {
  const product = JSON.parse(await readFile(resolve(installedPackageRoot, 'config/product-agent.json'), 'utf8'))
  const presetsPath = resolve(installedPackageRoot, product.preset.sourceRootRelativePath, 'presets.cordis.yml')
  const presets = await readEntries(presetsPath)
  const patches = []
  for (const presetId of [product.preset.id]) {
    const targets = presets.filter(row => row.config?.id === presetId)
    if (targets.length !== 1) throw new Error(`${presetsPath}: expected exactly one Preset ${presetId}; found ${targets.length}`)
    const preset = structuredClone(targets[0])
    const includes = preset.config.plugins.filter(row => row.name === 'cordis:include')
    if (includes.length !== 1) throw new Error(`${presetsPath}: expected exactly one Preset composition include; found ${includes.length}`)
    const composition = includes[0]
    const compositionPath = resolve(dirname(presetsPath), composition.config.path)
    const rows = await readEntries(compositionPath)
    const compositionPatches = [...(composition.config.patches ?? [])]
    if (mcpUrl !== undefined || customSkillDirs !== undefined) {
      const common = unique(rows, 'project-common', compositionPath)
      const commonPath = resolve(dirname(compositionPath), common.config.path)
      const shared = await readEntries(commonPath)
      const commonPatches = [...(common.config.patches ?? [])]
      if (mcpUrl !== undefined) {
        const include = unique(shared, 'noobai-mcp', commonPath)
        const mcpPath = resolve(dirname(commonPath), include.config.path)
        const client = unique(await readEntries(mcpPath), 'mcp-noobai', mcpPath)
        commonPatches.push({ id: include.id, config: {
          ...structuredClone(include.config),
          patches: [...(include.config.patches ?? []), { id: client.id, config: { ...structuredClone(client.config), url: mcpUrl } }],
        } })
      }
      if (customSkillDirs !== undefined) {
        const group = structuredClone(unique(shared, 'workbench-skills', commonPath))
        const filesystem = unique(group.config, 'skill-filesystem', commonPath)
        filesystem.config = { ...filesystem.config, customSkillDirs: [...customSkillDirs] }
        commonPatches.push({ id: group.id, config: group.config })
      }
      compositionPatches.push({ id: common.id, config: { ...structuredClone(common.config), patches: commonPatches } })
    }
    if (compositionPatches.length > 0) composition.config.patches = compositionPatches
    patches.push({ id: preset.id, config: preset.config })
  }
  if (mcpUrl !== undefined) {
    const configuration = JSON.parse(await readFile(resolve(installedPackageRoot, 'config/workbench-agent-roles.json'), 'utf8'))
    for (const role of configuration.roles.filter(role => role.mcpServices.length > 0)) {
      const targets = presets.filter(row => row.config?.roleId === role.id)
      if (targets.length !== 1) throw new Error(`${presetsPath}: expected exactly one Preset ${role.id}; found ${targets.length}`)
      const preset = targets[0]
      const compositionPatches = [...(preset.config.patches ?? [])]
      for (const service of role.mcpServices) {
        const definition = configuration.mcpServices[service]
        const includes = applyEntryPatches([{ id: definition.entryId, name: 'cordis:include', config: { path: resolve(dirname(presetsPath), definition.composition) } }],
          compositionPatches.filter(patch => patch.id === definition.entryId), message => { throw new Error(message) })
        const include = unique(includes, definition.entryId, presetsPath)
        const mcpPath = resolve(dirname(presetsPath), include.config.path)
        const clients = (await readEntries(mcpPath)).filter(row => row.name === '@deepseek-ai/dsh-mcp-client' && row.config.serverName === service)
        if (clients.length !== 1) throw new Error(`${mcpPath}: expected exactly one MCP client for ${service}; found ${clients.length}`)
        const client = clients[0]
        compositionPatches.push({ id: include.id, config: {
          ...structuredClone(include.config),
          patches: [...(include.config.patches ?? []), { id: client.id, config: { ...structuredClone(client.config), url: mcpUrl } }],
        } })
      }
      patches.push({ id: preset.id, config: { ...structuredClone(preset.config), patches: compositionPatches } })
    }
  }
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

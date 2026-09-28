import { randomUUID } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import {
  access,
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import { loadProductAgentConfiguration } from './product-agent-config.mjs'

const PRESET_FILES = Object.freeze(['agent.cordis.yml', 'preset.yml'])
const requireFromModule = createRequire(import.meta.url)
const requireFromDsh = createRequire(requireFromModule.resolve('@deepseek-ai/dsh/package.json'))

let dshPresetDialectPromise

async function loadDshPresetDialect() {
  dshPresetDialectPromise ??= Promise.all([
    import(pathToFileURL(requireFromDsh.resolve('js-yaml')).href),
    import(pathToFileURL(requireFromDsh.resolve('@deepseek-ai/cordis-plugin-include')).href),
  ]).then(([yaml, include]) => ({ load: yaml.load, dump: yaml.dump, entryListSchema: include.entryListSchema }))
  return dshPresetDialectPromise
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireContainedRelativePath(value, name, root) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\0') || isAbsolute(value)) {
    throw new TypeError(`${name} must be a non-empty relative path`)
  }
  const path = resolve(root, value)
  const fromRoot = relative(root, path)
  if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new TypeError(`${name} must identify a path inside its root`)
  }
  return path
}

function collectCompositionModuleNames(rows, location = 'top level') {
  if (!Array.isArray(rows)) throw new TypeError(`Agent Preset ${location} must be a list of plugin rows`)
  const names = []
  for (const [index, row] of rows.entries()) {
    const rowLocation = `${location} row ${index + 1}`
    if (!isRecord(row) || typeof row.name !== 'string' || row.name.length === 0) {
      throw new TypeError(`Agent Preset ${rowLocation} must name a plugin`)
    }
    names.push(row.name)
    if (row.group === true) names.push(...collectCompositionModuleNames(row.config, rowLocation))
  }
  return names
}

async function assertResolvableCompositionModule(name, compositionPath) {
  if (name.startsWith('.') || isAbsolute(name)) {
    const path = isAbsolute(name) ? name : resolve(dirname(compositionPath), name)
    await validateSharedAgentPresetComponent(path)
    return
  }
  requireFromDsh.resolve(name)
}

async function validateSharedAgentPresetComponent(path) {
  await assertRegularReadableFile(path, 'shared Agent Preset component')
  const url = pathToFileURL(path)
  url.searchParams.set('agent-preset-validation', randomUUID())
  let component
  try {
    component = await import(url.href)
  } catch (error) {
    throw new Error(`shared Agent Preset component cannot be loaded: ${path}`, { cause: error })
  }
  if (typeof component.apply !== 'function') {
    throw new TypeError(`shared Agent Preset component must export apply(): ${path}`)
  }
}

export async function validateAgentPresetComposition(path) {
  const { load, entryListSchema } = await loadDshPresetDialect()
  let rows
  try {
    rows = load(await readFile(path, 'utf8'), { schema: entryListSchema })
  } catch (error) {
    throw new Error(`Agent Preset composition is not valid DSH YAML: ${path}`, { cause: error })
  }
  for (const name of collectCompositionModuleNames(rows)) {
    if (name.startsWith('cordis:')) continue
    try {
      await assertResolvableCompositionModule(name, path)
    } catch (error) {
      throw new Error(`Agent Preset component cannot be resolved by DSH: ${name}`, { cause: error })
    }
  }
  return rows
}

async function assertRegularReadableFile(path, name) {
  let stats
  try {
    stats = await lstat(path)
    await access(path, fsConstants.R_OK)
  } catch (error) {
    throw new Error(`${name} is unavailable at ${path}`, { cause: error })
  }
  if (!stats.isFile()) throw new Error(`${name} must be a regular file: ${path}`)
  if ((await readFile(path)).byteLength === 0) throw new Error(`${name} must not be empty: ${path}`)
}

async function assertCanonicalPresetDirectory(sourceDirectory) {
  let sourceStats
  try {
    sourceStats = await lstat(sourceDirectory)
  } catch (error) {
    throw new Error(`canonical Agent Preset directory is unavailable at ${sourceDirectory}`, { cause: error })
  }
  if (!sourceStats.isDirectory()) {
    throw new Error(`canonical Agent Preset directory must be a regular directory: ${sourceDirectory}`)
  }
  const entries = (await readdir(sourceDirectory)).sort()
  if (JSON.stringify(entries) !== JSON.stringify([...PRESET_FILES].sort())) {
    throw new Error(`canonical Agent Preset directory must contain exactly ${PRESET_FILES.join(', ')}`)
  }
  for (const filename of PRESET_FILES) {
    await assertRegularReadableFile(resolve(sourceDirectory, filename), `canonical Agent Preset ${filename}`)
  }
  await validateAgentPresetComposition(resolve(sourceDirectory, 'agent.cordis.yml'))
}

async function stagePreset(sourceDirectory, stagingDirectory) {
  await mkdir(stagingDirectory, { mode: 0o700 })
  for (const filename of PRESET_FILES) {
    const target = resolve(stagingDirectory, filename)
    await copyFile(resolve(sourceDirectory, filename), target)
    await chmod(target, 0o600)
  }
}

async function requireDirectory(path, name) {
  let stats
  try {
    stats = await lstat(path)
  } catch (error) {
    throw new Error(`${name} is unavailable at ${path}`, { cause: error })
  }
  if (stats.isSymbolicLink()) throw new Error(`${name} must not be a symbolic link: ${path}`)
  if (!stats.isDirectory()) throw new Error(`${name} must be a directory: ${path}`)
}

async function createContainedDirectory(root, target, name) {
  await requireDirectory(root, 'DSH home')
  const pathFromRoot = relative(root, target)
  let current = root
  for (const segment of pathFromRoot.split(sep)) {
    current = resolve(current, segment)
    try {
      await mkdir(current, { mode: 0o700 })
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
    }
    await requireDirectory(current, name)
  }
}

export async function replaceOwnedAgentPresetDirectory(targetPath, stagingPath, backupPath) {
  let previousMoved = false
  try {
    try {
      await rename(targetPath, backupPath)
      previousMoved = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await rename(stagingPath, targetPath)
  } catch (error) {
    if (previousMoved) {
      try {
        await rename(backupPath, targetPath)
      } catch (restoreError) {
        throw new AggregateError([error, restoreError], `cannot replace or restore ${targetPath}`)
      }
    }
    throw error
  }
  if (previousMoved) await rm(backupPath, { recursive: true, force: true })
}

async function materializeSharedFile(sourceRoot, installRoot, filename) {
  const source = resolve(sourceRoot, filename)
  await validateSharedAgentPresetComponent(source)
  const suffix = randomUUID()
  const target = resolve(installRoot, filename)
  const staging = resolve(installRoot, `.${filename}.${suffix}.next`)
  const backup = resolve(installRoot, `.${filename}.${suffix}.previous`)
  try {
    await copyFile(source, staging)
    await chmod(staging, 0o600)
    await replaceOwnedAgentPresetDirectory(target, staging, backup)
  } finally {
    await rm(staging, { force: true })
  }
  return target
}

async function materializePreset(sourceRoot, installRoot, presetId) {
  const sourceDirectory = resolve(sourceRoot, presetId)
  const targetDirectory = resolve(installRoot, presetId)
  await assertCanonicalPresetDirectory(sourceDirectory)
  const suffix = randomUUID()
  const stagingDirectory = resolve(installRoot, `.${presetId}.${suffix}.next`)
  const backupDirectory = resolve(installRoot, `.${presetId}.${suffix}.previous`)
  try {
    await stagePreset(sourceDirectory, stagingDirectory)
    await validateAgentPresetComposition(resolve(stagingDirectory, 'agent.cordis.yml'))
    await replaceOwnedAgentPresetDirectory(targetDirectory, stagingDirectory, backupDirectory)
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true })
  }
  return { presetId, sourceDirectory, targetDirectory }
}

export async function materializeSourceProductAgentPreset(repositoryRoot, dshHome) {
  const sourceRoot = resolve(repositoryRoot)
  const home = resolve(dshHome)
  const { preset: config } = await loadProductAgentConfiguration(sourceRoot)
  const installRoot = requireContainedRelativePath(
    config.installRootRelativePath,
    'product Agent configuration.preset.installRootRelativePath',
    home,
  )
  for (const filename of config.sharedFiles) {
    await validateSharedAgentPresetComponent(resolve(config.sourceRoot, filename))
  }
  const managedPresetIds = [config.presetId, ...config.additionalManagedPresetIds]
  for (const presetId of managedPresetIds) {
    await assertCanonicalPresetDirectory(resolve(config.sourceRoot, presetId))
  }
  await createContainedDirectory(home, installRoot, 'install root')
  const sharedFiles = []
  for (const filename of config.sharedFiles) {
    sharedFiles.push(await materializeSharedFile(config.sourceRoot, installRoot, filename))
  }
  const presets = []
  for (const presetId of managedPresetIds) {
    presets.push(await materializePreset(config.sourceRoot, installRoot, presetId))
  }
  for (const presetId of config.retiredPresetIds) {
    await rm(resolve(installRoot, presetId), { recursive: true, force: true })
  }
  return { installRoot, sharedFiles, presets, retiredPresetIds: config.retiredPresetIds }
}

export async function materializeDeclaredAgentPresetPatch(productAgentPreset, profileDirectory) {
  const { load, dump, entryListSchema } = await loadDshPresetDialect()
  const declarations = []
  for (const { presetId, targetDirectory } of productAgentPreset.presets) {
    const metadata = load(await readFile(resolve(targetDirectory, 'preset.yml'), 'utf8'))
    if (typeof metadata?.name !== 'string' || metadata.name.length === 0) {
      throw new TypeError(`Agent Preset ${presetId} preset.yml must contain a non-empty name`)
    }
    const compositionPath = resolve(targetDirectory, 'agent.cordis.yml')
    const rows = await validateAgentPresetComposition(compositionPath)
    const absolute = entries => entries.map(row => ({
      ...row,
      name: row.name.startsWith('.') ? resolve(dirname(compositionPath), row.name) : row.name,
      ...(row.group === true ? { config: absolute(row.config) } : {}),
    }))
    declarations.push({
      id: `preset-${presetId}`,
      name: '@deepseek-ai/dsh-agent-preset',
      config: { id: presetId, name: metadata.name, plugins: absolute(rows) },
    })
  }
  const patchPath = resolve(profileDirectory, 'cordis.patch.yml')
  const current = load(await readFile(patchPath, 'utf8'), { schema: entryListSchema })
  if (!Array.isArray(current)) throw new TypeError(`Desktop Profile patch must be a list: ${patchPath}`)
  const ownedIds = new Set(declarations.map(row => row.id))
  const retained = current.flatMap(row => {
    if (ownedIds.has(row?.id)) return []
    if (!Array.isArray(row?.insert)) return [row]
    const insert = row.insert.filter(entry => !ownedIds.has(entry?.id))
    return insert.length === 0 ? [] : [{ ...row, insert }]
  })
  retained.push({ insert: declarations })
  const staging = `${patchPath}.${randomUUID()}.next`
  try {
    await writeFile(staging, dump(retained, { schema: entryListSchema }), { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await rename(staging, patchPath)
  } finally {
    await rm(staging, { force: true })
  }
  return patchPath
}

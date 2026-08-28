import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
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
} from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const PRODUCT_AGENT_CONFIG_RELATIVE_PATH = 'config/product-agent.json'
const PRESET_FILES = Object.freeze(['agent.cordis.yml', 'preset.yml'])
const requireFromModule = createRequire(import.meta.url)
const requireFromDsh = createRequire(requireFromModule.resolve('@deepseek-ai/dsh/package.json'))

let dshPresetDialectPromise

async function loadDshPresetDialect() {
  dshPresetDialectPromise ??= Promise.all([
    import(pathToFileURL(requireFromDsh.resolve('js-yaml')).href),
    import(pathToFileURL(requireFromDsh.resolve('@deepseek-ai/cordis-plugin-include')).href),
  ]).then(([yaml, include]) => ({ load: yaml.load, entryListSchema: include.entryListSchema }))
  return dshPresetDialectPromise
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireRecord(value, name) {
  if (!isRecord(value)) throw new TypeError(`${name} must be an object`)
  return value
}

function assertExactKeys(value, keys, name) {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${name} must contain exactly ${expected.join(', ')}`)
  }
}

function requirePresetId(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]*$/u.test(value)) {
    throw new TypeError('product Agent toolCanary.presetId must contain only lowercase letters, numbers, and hyphens')
  }
  return value
}

function requireContainedRelativePath(value, name, root) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\0') || isAbsolute(value)) {
    throw new TypeError(`${name} must be a non-empty relative path`)
  }
  const path = resolve(root, value)
  const fromRoot = relative(root, path)
  if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new TypeError(`${name} must identify a directory inside its root`)
  }
  return path
}

async function readJson(path, name) {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path)))
  } catch (error) {
    throw new Error(`cannot read ${name} ${path}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }
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
      requireFromDsh.resolve(name)
    } catch (error) {
      throw new Error(`Agent Preset component cannot be resolved by DSH: ${name}`, { cause: error })
    }
  }
  return rows
}

async function loadProductAgentConfig(repositoryRoot) {
  const path = resolve(repositoryRoot, PRODUCT_AGENT_CONFIG_RELATIVE_PATH)
  const config = requireRecord(await readJson(path, 'product Agent configuration'), 'product Agent configuration')
  assertExactKeys(config, ['schemaVersion', 'toolCanary'], 'product Agent configuration')
  if (config.schemaVersion !== 1) throw new TypeError('product Agent configuration.schemaVersion must be 1')
  const toolCanary = requireRecord(config.toolCanary, 'product Agent configuration.toolCanary')
  assertExactKeys(
    toolCanary,
    ['presetId', 'sourceRootRelativePath', 'installRootRelativePath'],
    'product Agent configuration.toolCanary',
  )
  return {
    presetId: requirePresetId(toolCanary.presetId),
    sourceRoot: requireContainedRelativePath(
      toolCanary.sourceRootRelativePath,
      'product Agent configuration.toolCanary.sourceRootRelativePath',
      repositoryRoot,
    ),
    installRootRelativePath: toolCanary.installRootRelativePath,
  }
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
    const path = resolve(sourceDirectory, filename)
    let stats
    try {
      stats = await lstat(path)
      await access(path, fsConstants.R_OK)
    } catch (error) {
      throw new Error(`canonical Agent Preset ${filename} is unavailable at ${path}`, { cause: error })
    }
    if (!stats.isFile()) throw new Error(`canonical Agent Preset ${filename} must be a regular file: ${path}`)
    if ((await readFile(path)).byteLength === 0) throw new Error(`canonical Agent Preset ${filename} must not be empty`)
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

export async function replaceOwnedAgentPresetDirectory(targetDirectory, stagingDirectory, backupDirectory) {
  let previousMoved = false
  try {
    try {
      await rename(targetDirectory, backupDirectory)
      previousMoved = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await rename(stagingDirectory, targetDirectory)
  } catch (error) {
    if (previousMoved) {
      try {
        await rename(backupDirectory, targetDirectory)
      } catch (restoreError) {
        throw new AggregateError([error, restoreError], `cannot replace or restore Agent Preset ${targetDirectory}`)
      }
    }
    throw error
  }
  if (previousMoved) await rm(backupDirectory, { recursive: true, force: true })
}

export async function materializeSourceAgentToolCanary(repositoryRoot, dshHome) {
  const sourceRoot = resolve(repositoryRoot)
  const home = resolve(dshHome)
  const config = await loadProductAgentConfig(sourceRoot)
  const installRoot = requireContainedRelativePath(
    config.installRootRelativePath,
    'product Agent configuration.toolCanary.installRootRelativePath',
    home,
  )
  const sourceDirectory = resolve(config.sourceRoot, config.presetId)
  const targetDirectory = resolve(installRoot, config.presetId)
  await assertCanonicalPresetDirectory(sourceDirectory)
  await createContainedDirectory(home, installRoot, 'install root')
  const suffix = randomUUID()
  const stagingDirectory = resolve(installRoot, `.${config.presetId}.${suffix}.next`)
  const backupDirectory = resolve(installRoot, `.${config.presetId}.${suffix}.previous`)
  try {
    await stagePreset(sourceDirectory, stagingDirectory)
    await assertCanonicalPresetDirectory(stagingDirectory)
    await replaceOwnedAgentPresetDirectory(targetDirectory, stagingDirectory, backupDirectory)
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true })
  }
  return { presetId: config.presetId, sourceDirectory, targetDirectory }
}

import webPluginPatch from '../../config/web-plugin-patch.json' with { type: 'json' }
import settingsEntryIds from '../../config/settings-entry-ids.json' with { type: 'json' }
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import {
  chmod,
  cp,
  lstat,
  mkdir,
  readFile,
  readlink,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'

import runtimeArtifacts from '../../config/runtime-artifacts.json' with { type: 'json' }

import { reserveDevelopmentPort } from '../development/port.mjs'
import {
  readProcessIdentity,
  redactSensitiveLine,
  waitForPortOwnedByProcessGroup,
  writeAtomicJson,
} from '../production/process.mjs'
import { loadProductAgentConfiguration } from '../profile/product-agent-config.mjs'
import { loadDesktopBaseline } from './baseline.mjs'

const defaultRepositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PROCESS_STATE_SCHEMA_VERSION = 1
const PROFILE_SETUP_DIRECTORY_MODE = 0o700
const PROFILE_SETUP_FILE_MODE = 0o600
const SOURCE_PLUGIN_PACKAGE_PATHS = Object.freeze([
  'package.json',
  'cordis.patch.yml',
  'config',
  'scripts/source-client',
  'scripts/cli/help.mjs',
  'scripts/cli/help-schema.mjs',
  'src',
  dirname(runtimeArtifacts.managedCli.outputEntryRelativePath),
  '.local/source-client',
  '.local/source-host',
])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function readJson(path, label = path) {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'))
    if (!isRecord(value)) throw new Error('root must be an object')
    return value
  } catch (error) {
    throw new Error(`cannot read ${label}: ${error instanceof Error ? error.message : String(error)}`)
  }
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

async function readDesktopEnvironment(path) {
  return parseEnv(await readFile(path, 'utf8'))
}

async function ensureEnvironmentLink(source, target) {
  await readFile(source)
  try {
    const info = await lstat(target)
    if (!info.isSymbolicLink()) throw new Error(`Desktop Profile environment path must be a symbolic link: ${target}`)
    const linked = resolve(dirname(target), await readlink(target))
    if (linked !== source) throw new Error(`Desktop Profile environment link must point to ${source}: ${target}`)
    return
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  await symlink(source, target, 'file')
}

function desktopContext(definition, sourceDefinition, baseline, mode, options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? defaultRepositoryRoot)
  const runtimeRoot = resolve(repositoryRoot, definition.runtimeRelativeRoot)
  return Object.freeze({
    mode,
    repositoryRoot,
    ...desktopRuntimePaths(runtimeRoot, baseline.profile.pluginPackageName),
    environmentFilePath: resolve(repositoryRoot, definition.environmentFileRelativePath),
    startupWorkspacePath: resolve(definition.startupWorkspacePath),
    catalogPort: sourceDefinition.source.catalogPort,
    agentsHome: resolve(options.homeDirectory ?? homedir(), '.agents'),
    developmentPortClaimRoot: definition.developmentPortClaimRoot
      ?? resolve(runtimeRoot, 'port-claims'),
    desktopRepository: baseline.desktopRepository,
    desktopWorkspace: baseline.desktopWorkspace,
    desktopSource: baseline.desktopWorkspace,
    desktopMain: baseline.desktopMain,
    baseline,
  })
}

export function desktopRuntimePaths(runtimeRoot, pluginPackageName = 'harness-comfyui') {
  const root = resolve(runtimeRoot)
  const runtimeHome = resolve(root, 'home')
  const userData = resolve(root, 'user-data')
  return Object.freeze({
    runtimeRoot: root,
    runtimeHome,
    userData,
    dshHome: resolve(runtimeHome, 'harness'),
    pidFile: resolve(root, 'desktop.pid'),
    stateFile: resolve(root, 'state/desktop.json'),
    logFile: resolve(root, 'anywhere.log'),
    lifecycleEvidenceFile: resolve(userData, 'lifecycle-events/startup.jsonl'),
    desktopBuildOutput: resolve(root, 'desktop-out'),
    managedPluginDirectory: resolve(root, 'managed-plugins', pluginPackageName),
  })
}

export function withDesktopRuntimeRoot(context, runtimeRoot) {
  return Object.freeze({
    ...context,
    ...desktopRuntimePaths(runtimeRoot, context.baseline.profile.pluginPackageName),
    developmentPortClaimRoot: context.mode === 'production'
      ? resolve(runtimeRoot, 'port-claims')
      : context.developmentPortClaimRoot,
  })
}

export async function loadDesktopWorktreeContext(options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? defaultRepositoryRoot)
  const worktreeDefinition = await readJson(
    resolve(options.definitionPath ?? resolve(repositoryRoot, 'config/desktop-worktree.json')),
    'config/desktop-worktree.json',
  )
  const productionDefinition = await readJson(
    resolve(options.productionDefinitionPath ?? resolve(repositoryRoot, 'config/desktop-production.json')),
    'config/desktop-production.json',
  )
  const sourceDefinition = await readJson(resolve(repositoryRoot, 'config/source-production.json'))
  const mainCheckoutPath = resolve(worktreeDefinition.mainCheckoutPath)
  const baseline = options.baseline ?? await loadDesktopBaseline({
    repositoryRoot,
    desktopSourceRoot: mainCheckoutPath,
    ...(options.baselineDefinitionPath === undefined ? {} : { definitionPath: options.baselineDefinitionPath }),
  })
  return desktopContext({
    ...productionDefinition,
    runtimeRelativeRoot: worktreeDefinition.runtimeRelativeRoot,
    developmentPortClaimRoot: resolve(mainCheckoutPath, '.local/development-port-claims'),
  }, sourceDefinition, baseline, 'development', { ...options, repositoryRoot })
}

export async function loadDesktopProductionContext(options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? defaultRepositoryRoot)
  const definition = await readJson(
    resolve(options.definitionPath ?? resolve(repositoryRoot, 'config/desktop-production.json')),
    'config/desktop-production.json',
  )
  const sourceDefinition = await readJson(resolve(repositoryRoot, 'config/source-production.json'))
  const baseline = options.baseline ?? await loadDesktopBaseline({
    repositoryRoot,
    ...(options.baselineDefinitionPath === undefined ? {} : { definitionPath: options.baselineDefinitionPath }),
  })
  return desktopContext(definition, sourceDefinition, baseline, 'production', { ...options, repositoryRoot })
}

export function packagedPluginManifest(manifest) {
  return {
    ...manifest,
    exports: {
      ...manifest.exports,
      '.': {
        ...manifest.exports?.['.'],
        default: './.local/source-host/index.js',
      },
    },
  }
}

function packageRequire(packageDirectory) {
  return createRequire(resolve(packageDirectory, 'package.json'))
}

async function resolvedPackage(requirePackage, packageName, expectedRange, satisfies) {
  const manifestPath = await resolveInstalledPackageManifest(requirePackage, packageName)
  const manifest = await readJson(manifestPath, `${packageName} package manifest`)
  if (manifest.name !== packageName || typeof manifest.version !== 'string') {
    throw new Error(`installed dependency ${packageName} has an invalid package manifest`)
  }
  if (!satisfies(manifest.version, expectedRange, { includePrerelease: true })) {
    throw new Error(`installed dependency ${packageName}@${manifest.version} does not satisfy ${expectedRange}`)
  }
  return { directory: dirname(manifestPath), version: manifest.version }
}

export async function resolveInstalledPackageManifest(requirePackage, packageName) {
  try {
    return requirePackage.resolve(`${packageName}/package.json`)
  } catch (error) {
    if (error?.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error
  }
  let directory = dirname(requirePackage.resolve(packageName))
  while (true) {
    const manifestPath = resolve(directory, 'package.json')
    try {
      const manifest = await readJson(manifestPath, `${packageName} package manifest`)
      if (manifest.name === packageName) return manifestPath
    } catch (error) {
      if (!/ENOENT/u.test(error.message)) throw error
    }
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  throw new Error(`cannot locate the installed ${packageName} package manifest from its exported entry`)
}

async function replaceSymbolicLink(source, target) {
  await mkdir(dirname(target), { recursive: true })
  await rm(target, { recursive: true, force: true })
  await symlink(source, target, 'dir')
}

function profileDependencySpecifier(profileDirectory, pluginDirectory) {
  const path = relative(profileDirectory, pluginDirectory).split(sep).join('/')
  return `link:${path.startsWith('.') ? path : `./${path}`}`
}

export function reconcileManagedProfileManifest(manifest, definition) {
  const dependencies = { ...(isRecord(manifest.dependencies) ? manifest.dependencies : {}) }
  dependencies[definition.packageName] = definition.specifier
  const dsh = isRecord(manifest.dsh) ? manifest.dsh : {}
  const profile = isRecord(dsh.profile) ? dsh.profile : {}
  const currentBundles = Array.isArray(profile.bundles) ? profile.bundles : []
  if (currentBundles.some(value => typeof value !== 'string')) {
    throw new Error('Desktop profile dsh.profile.bundles must contain only package names')
  }
  return {
    ...manifest,
    dependencies,
    dsh: {
      ...dsh,
      profile: {
        ...profile,
        bundles: [...new Set([...currentBundles, definition.packageName])],
      },
    },
  }
}

async function materializeManagedPlugin(context) {
  const staging = resolve(context.runtimeRoot, `.managed-plugin-${randomUUID()}`)
  try {
    await mkdir(staging, { recursive: true })
    for (const path of SOURCE_PLUGIN_PACKAGE_PATHS) {
      await cp(resolve(context.repositoryRoot, path), resolve(staging, path), { recursive: true })
    }
    const manifestPath = resolve(staging, 'package.json')
    const manifest = packagedPluginManifest(await readJson(manifestPath))
    if (manifest.name !== context.baseline.profile.pluginPackageName || typeof manifest.version !== 'string') {
      throw new Error(`managed plugin must be ${context.baseline.profile.pluginPackageName} with a package version`)
    }
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

    const candidateRequire = packageRequire(context.desktopWorkspace)
    const rootRequire = createRequire(resolve(context.repositoryRoot, 'package.json'))
    const { satisfies } = candidateRequire('semver')
    for (const [name, range] of Object.entries(manifest.dependencies ?? {})) {
      const dependency = await resolvedPackage(rootRequire, name, range, satisfies)
      await replaceSymbolicLink(dependency.directory, resolve(staging, 'node_modules', name))
    }
    for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
      const dependency = await resolvedPackage(candidateRequire, name, range, satisfies)
      await replaceSymbolicLink(dependency.directory, resolve(staging, 'node_modules', name))
    }
    await mkdir(dirname(context.managedPluginDirectory), { recursive: true })
    await rm(context.managedPluginDirectory, { recursive: true, force: true })
    await rename(staging, context.managedPluginDirectory)
    return { name: manifest.name, version: manifest.version }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

async function ensureManagedProfile(context, plugin) {
  const profileModule = await import(pathToFileURL(resolve(context.desktopWorkspace, 'lib/profile.js')).href)
  const profileDirectory = resolve(profileModule.ensureDesktopProfile(context.dshHome))
  const manifestPath = resolve(profileDirectory, 'package.json')
  const specifier = profileDependencySpecifier(profileDirectory, context.managedPluginDirectory)
  const manifest = reconcileManagedProfileManifest(await readJson(manifestPath), {
    packageName: plugin.name,
    specifier,
  })
  await writeAtomicJson(manifestPath, manifest)
  const patchPath = resolve(profileDirectory, 'cordis.patch.yml')
  const yaml = packageRequire(context.desktopWorkspace)('yaml')
  const document = parseDesktopProfileDocument(yaml, await readFile(patchPath, 'utf8'))
  const patch = document.toJS()
  if (!Array.isArray(patch)) throw new Error('Desktop profile cordis.patch.yml must contain a patch list.')
  const webId = webPluginPatch[0].insert[0].id
  for (let index = patch.length - 1; index >= 0; index -= 1) {
    const insert = patch[index]?.insert
    if (!Array.isArray(insert) || !insert.some(plugin => plugin?.id === webId)) continue
    const rowNode = document.getIn([index, 'insert'], true)
    rowNode.items = rowNode.items.filter((_node, entryIndex) => insert[entryIndex]?.id !== webId)
    if (rowNode.items.length === 0) document.contents.items.splice(index, 1)
  }
  for (const row of webPluginPatch) document.contents.add(document.createNode(row))
  await writePrivateText(patchPath, String(document))
  await replaceSymbolicLink(context.managedPluginDirectory, resolve(profileDirectory, 'node_modules', plugin.name))
  return { profileDirectory, manifestPath, specifier }
}

async function writePrivateText(path, source) {
  const temporary = `${path}.${randomUUID()}.next`
  try {
    await writeFile(temporary, source, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

async function writePrivateYaml(path, yaml, value) {
  return writePrivateText(path, yaml.stringify(value))
}

function parseDesktopProfileDocument(yaml, source) {
  const document = yaml.parseDocument(source, {
    customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }],
  })
  if (document.errors.length > 0) throw new Error(`Desktop Profile patch is invalid: ${document.errors[0].message}`)
  return document
}

async function readLegacyDesktopSettings(context, yaml) {
  const path = resolve(context.dshHome, 'settings.yaml')
  let source
  try { source = await readFile(path, 'utf8') } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
  if (await pathExists(`${path}.imported`)) {
    throw new Error('Desktop settings.yaml and settings.yaml.imported both exist; resolve the archive collision before startup')
  }
  const settings = yaml.parse(source)
  if (!isRecord(settings)) throw new Error('Desktop settings.yaml root must be an object')
  if (Object.hasOwn(settings, 'desktop-shell') && Object.hasOwn(settings, 'dsh-desktop')) {
    throw new Error('Desktop settings.yaml contains both desktop-shell and dsh-desktop; resolve the duplicate Desktop sections before startup')
  }
  const section = settings['desktop-shell'] ?? settings['dsh-desktop']
  if (section !== undefined && !isRecord(section)) throw new Error('Desktop settings section must be an object')
  return { path, settings, section }
}

function desktopPatchEntry(patch) {
  if (!Array.isArray(patch)) throw new Error('Desktop Profile cordis.patch.yml must contain a patch list')
  for (const [index, row] of patch.entries()) {
    if (row?.id === 'desktop-shell') return { entry: row, path: [index] }
    const nestedIndex = row?.insert?.findIndex(entry => entry?.id === 'desktop-shell') ?? -1
    if (nestedIndex >= 0) return { entry: row.insert[nestedIndex], path: [index, 'insert', nestedIndex] }
  }
  return { entry: undefined, path: undefined }
}

function checkedDesktopPort(value) {
  if (value === undefined) return undefined
  if (!Number.isSafeInteger(value) || value < 0 || value > 65_535) {
    throw new Error('desktop-shell.config.port must be an integer from 0 through 65535')
  }
  return value
}

async function readDesktopProfilePatch(profileDirectory, yaml) {
  const path = resolve(profileDirectory, 'cordis.patch.yml')
  const document = parseDesktopProfileDocument(yaml, await readFile(path, 'utf8'))
  const { entry, path: entryPath } = desktopPatchEntry(document.toJS())
  if (entry?.config !== undefined && !isRecord(entry.config)) {
    throw new Error('Desktop Profile desktop-shell.config must be an object')
  }
  return { path, document, entry, entryPath }
}

async function bundledDesktopConfig(context, yaml) {
  const path = resolve(context.desktopWorkspace, 'cordis.patch.yml')
  const document = parseDesktopProfileDocument(yaml, await readFile(path, 'utf8'))
  const { entry } = desktopPatchEntry(document.toJS())
  if (!isRecord(entry?.config)) throw new Error('Desktop bundle must contain desktop-shell.config')
  return entry.config
}

function profileEntryLocations(rows, id) {
  return rows.flatMap((row, index) => [
    ...(row?.id === id ? [{ entry: row, path: [index] }] : []),
    ...(Array.isArray(row?.insert) ? row.insert.flatMap((entry, nestedIndex) =>
      entry?.id === id ? [{ entry, path: [index, 'insert', nestedIndex] }] : []) : []),
  ])
}

async function bundledPluginConfig(context, yaml, id) {
  const document = parseDesktopProfileDocument(yaml, await readFile(resolve(context.repositoryRoot, 'cordis.patch.yml'), 'utf8'))
  const rows = document.toJS()
  if (!Array.isArray(rows)) throw new Error('Repository cordis.patch.yml must contain a patch list')
  const locations = profileEntryLocations(rows, id)
  if (locations.length !== 1) throw new Error(`Repository cordis.patch.yml must contain one entry ${id}`)
  const node = document.getIn([...locations[0].path, 'config'], true)
  if (node === undefined) throw new Error(`Repository cordis.patch.yml entry ${id} must contain config`)
  return { value: locations[0].entry.config, node }
}

async function mergeLegacyProjectSettings(context, yaml, profile, legacy) {
  if (legacy === undefined) return []
  const { SOURCE_SETTINGS_NAMESPACE, validateSourceSettingsSection } = await import('../../src/source-settings.ts')
  const {
    IMAGE_READER_LEGACY_SETTINGS_NAMESPACE,
    IMAGE_READER_SETTINGS_NAMESPACE,
    migrateLegacyImageReaderSettings,
    validateImageReaderSettingsSection,
  } = await import('../../src/image-reader/settings.ts')
  const settings = legacy.settings
  const migrated = [SOURCE_SETTINGS_NAMESPACE, IMAGE_READER_LEGACY_SETTINGS_NAMESPACE, IMAGE_READER_SETTINGS_NAMESPACE]
    .filter(name => Object.hasOwn(settings, name))
  if (migrated.length === 0) return migrated
  const source = settings[SOURCE_SETTINGS_NAMESPACE]
  const modernImage = settings[IMAGE_READER_SETTINGS_NAMESPACE]
  const olderImage = settings[IMAGE_READER_LEGACY_SETTINGS_NAMESPACE]
  if (source !== undefined) validateSourceSettingsSection(source)
  const image = modernImage ?? (olderImage === undefined ? undefined : migrateLegacyImageReaderSettings(olderImage))
  if (image !== undefined) validateImageReaderSettingsSection(image)
  for (const [id, value] of [[settingsEntryIds.core, source], [settingsEntryIds.imageReader, image]]) {
    if (value === undefined) continue
    const inherited = await bundledPluginConfig(context, yaml, id)
    const rows = profile.document.toJS()
    const locations = profileEntryLocations(rows, id)
    if (locations.length > 1) throw new Error(`Desktop Profile contains duplicate entry ${id}`)
    if (locations.length === 0) {
      const configNode = inherited.node.clone()
      for (const [field, fieldValue] of Object.entries(value)) configNode.set(field, profile.document.createNode(fieldValue))
      profile.document.contents.add(profile.document.createNode({ id, config: configNode }))
      continue
    }
    const { entry, path } = locations[0]
    const current = entry.config
    if (current !== undefined && !isRecord(current)) throw new Error(`Desktop Profile entry ${id}.config must be an object`)
    const hasSavedImage = id === settingsEntryIds.imageReader && current !== undefined
      && (Object.hasOwn(current, 'configuration') || Object.hasOwn(current, 'credentials'))
    const merged = { ...inherited.value, ...value, ...current }
    if (hasSavedImage) {
      delete merged.configuration
      delete merged.credentials
      Object.assign(merged, current)
    }
    const savedConfigurationNode = profile.document.getIn([...path, 'config', 'configuration'], true)
    const dynamicSourceConfiguration = id === settingsEntryIds.core
      && savedConfigurationNode?.tag === 'tag:yaml.org,2002:js'
    if (id === settingsEntryIds.core) {
      if (!dynamicSourceConfiguration) validateSourceSettingsSection(merged)
    } else if (!hasSavedImage) validateImageReaderSettingsSection(merged)
    for (const [field, fieldValue] of Object.entries(inherited.value)) {
      if (current?.[field] === undefined) profile.document.setIn([...path, 'config', field], inherited.node.get(field, true).clone())
    }
    if (!hasSavedImage) {
      for (const [field, fieldValue] of Object.entries(value)) {
        if (current?.[field] === undefined) profile.document.setIn([...path, 'config', field], fieldValue)
      }
    }
  }
  return migrated
}

async function initializeDesktopSettings(context, candidateRequire, webPort, profileDirectory) {
  const yaml = candidateRequire('yaml')
  const profile = await readDesktopProfilePatch(profileDirectory, yaml)
  const legacy = await readLegacyDesktopSettings(context, yaml)
  const current = profile.entry?.config ?? {}
  const inherited = legacy?.section ?? {}
  const currentPort = checkedDesktopPort(current.port)
  const inheritedPort = checkedDesktopPort(inherited.port)
  const migrateLegacy = legacy?.section !== undefined
  const preferLegacy = migrateLegacy && currentPort === undefined
  const resolvedPort = currentPort === 0 ? webPort
    : currentPort !== undefined ? currentPort
      : inheritedPort && inheritedPort > 0 ? inheritedPort : webPort
  const config = {
    ...current,
    mode: (preferLegacy ? inherited.mode ?? current.mode : current.mode ?? inherited.mode) ?? context.baseline.startup.mode,
    macosMaterial: current.macosMaterial ?? inherited.macosMaterial,
    windowsMaterial: current.windowsMaterial ?? inherited.windowsMaterial,
    linuxMaterial: current.linuxMaterial ?? inherited.linuxMaterial,
    networkExposure: (preferLegacy ? inherited.networkExposure ?? current.networkExposure : current.networkExposure ?? inherited.networkExposure) ?? context.baseline.startup.networkExposure,
    openBrowser: (preferLegacy ? inherited.openBrowser ?? current.openBrowser : current.openBrowser ?? inherited.openBrowser) ?? context.baseline.startup.openBrowser,
    logLevel: current.logLevel ?? inherited.logLevel,
    port: resolvedPort,
  }
  const changedFields = ['mode', 'macosMaterial', 'windowsMaterial', 'linuxMaterial', 'port', 'networkExposure', 'openBrowser', 'logLevel']
    .filter(field => current[field] !== config[field])
  const migratedProjectSections = await mergeLegacyProjectSettings(context, yaml, profile, legacy)
  const profileChanged = changedFields.length > 0 || migratedProjectSections.length > 0
  if (!profileChanged && !migrateLegacy) return false
  if (profileChanged) {
    if (profile.entryPath === undefined) {
      const inherited = await bundledDesktopConfig(context, yaml)
      const complete = Object.fromEntries(Object.entries({ ...inherited, ...config }).filter(([, value]) => value !== undefined))
      profile.document.contents.add(profile.document.createNode({ id: 'desktop-shell', config: complete }))
    } else {
      for (const field of changedFields) {
        profile.document.setIn([...profile.entryPath, 'config', field], config[field])
      }
    }
    await writePrivateText(profile.path, String(profile.document))
  }
  if (migrateLegacy || migratedProjectSections.length > 0) {
    const remaining = { ...legacy.settings }
    delete remaining['desktop-shell']
    delete remaining['dsh-desktop']
    for (const name of migratedProjectSections) delete remaining[name]
    if (Object.keys(remaining).length === 0) {
      await rename(legacy.path, `${legacy.path}.imported`)
    } else {
      await writePrivateYaml(legacy.path, yaml, remaining)
    }
  }
  return true
}

export function desktopSetupState(context, profileDirectory, recordedAt) {
  return Object.freeze({
    version: context.baseline.profile.setupStateVersion,
    profileHash: createHash('sha256').update(resolve(profileDirectory)).digest('hex'),
    outcome: 'skipped',
    desktopVersion: context.baseline.packages.desktop.version,
    dshVersion: context.baseline.packages.harness.version,
    setupRevision: context.baseline.profile.setupRevision,
    recordedAt,
  })
}

async function initializeSetupState(context, profileDirectory, recordedAt) {
  const state = desktopSetupState(context, profileDirectory, recordedAt)
  const root = resolve(context.userData, context.baseline.profile.setupStateRootDirectory)
  const directory = resolve(root, state.profileHash)
  const path = resolve(directory, context.baseline.profile.setupStateFilename)
  if (await pathExists(path)) return false
  await mkdir(directory, { recursive: true, mode: PROFILE_SETUP_DIRECTORY_MODE })
  await chmod(root, PROFILE_SETUP_DIRECTORY_MODE)
  await chmod(directory, PROFILE_SETUP_DIRECTORY_MODE)
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: 'utf8',
    mode: PROFILE_SETUP_FILE_MODE,
    flag: 'wx',
  })
  await chmod(path, PROFILE_SETUP_FILE_MODE)
  return true
}

async function readConfiguredWebPort(context, candidateRequire, profileDirectory) {
  const yaml = candidateRequire('yaml')
  const profile = await readDesktopProfilePatch(profileDirectory, yaml)
  const profilePort = checkedDesktopPort(profile.entry?.config?.port)
  if (profilePort !== undefined) return profilePort
  const legacy = await readLegacyDesktopSettings(context, yaml)
  return checkedDesktopPort(legacy?.section?.port)
}

function desktopEnvironment(context, productAgent, environment, candidateBinDirectory) {
  const dataDirectory = resolve(context.runtimeRoot, 'data')
  const shared = Object.fromEntries(Object.entries(environment).filter(([name]) =>
    name !== productAgent.repositorySkillsEnvironmentVariable
    && name !== 'ELECTRON_RUN_AS_NODE'))
  return {
    ...shared,
    HOME: context.runtimeHome,
    CFFIXED_USER_HOME: context.runtimeHome,
    DSH_HOME: context.dshHome,
    DSH_AGENTS_HOME: context.agentsHome,
    [productAgent.repositorySkillsEnvironmentVariable]: productAgent.repositorySkillsRoot,
    HARNESS_COMFYUI_CONFIGURATION_PROFILE: 'production',
    HARNESS_COMFYUI_STARTUP_WORKSPACE_PATH: context.startupWorkspacePath,
    HARNESS_COMFYUI_DATA_DIR: dataDirectory,
    HARNESS_COMFYUI_API_WORKFLOW_CACHE_DIRECTORY: resolve(dataDirectory, 'api-workflow-cache'),
    HARNESS_COMFYUI_RUN_REPOSITORY_FILE: resolve(dataDirectory, 'runs.sqlite'),
    HARNESS_COMFYUI_RUN_DIRECTORY: resolve(context.runtimeRoot, 'runs'),
    HARNESS_COMFYUI_SAVED_MEDIA_DIRECTORY: resolve(context.runtimeRoot, 'saved-media'),
    HARNESS_COMFYUI_LOG_DIRECTORY: resolve(context.runtimeRoot, 'logs'),
    HARNESS_COMFYUI_CATALOG_PORT: String(context.catalogPort),
    PATH: `${candidateBinDirectory}:${environment.PATH ?? ''}`,
  }
}

export async function prepareAnywhereDesktop(context, options = {}) {
  const productAgent = await (options.loadProductAgentConfiguration ?? loadProductAgentConfiguration)(context.repositoryRoot)
  const activeContext = Object.freeze({
    ...context,
    repositorySkillsRoot: productAgent.repositorySkillsRoot,
    repositorySkillsEnvironmentVariable: productAgent.repositorySkillsEnvironmentVariable,
  })
  const materializeCli = options.materializeCli ?? (await import('../production/cli-module.mjs')).materializeSourceCliModule
  const materializeClient = options.materializeClient ?? (await import('../production/client-module.mjs')).materializeSourceClientModule
  const materializeHost = options.materializeHost ?? (await import('../production/host-module.mjs')).materializeSourceHostModule
  const materializePreset = options.materializePreset ?? (await import('../profile/agent-preset.mjs')).materializeSourceProductAgentPreset
  await mkdir(activeContext.dshHome, { recursive: true })
  await ensureEnvironmentLink(activeContext.environmentFilePath, resolve(activeContext.dshHome, '.env'))
  await materializeCli(activeContext.repositoryRoot)
  await materializeClient(activeContext.repositoryRoot)
  await materializeHost(activeContext.repositoryRoot)
  const productAgentPreset = await materializePreset(activeContext.repositoryRoot, activeContext.dshHome)
  const plugin = await (options.materializeManagedPlugin ?? materializeManagedPlugin)(activeContext)
  const profile = await (options.ensureManagedProfile ?? ensureManagedProfile)(activeContext, plugin)
  const candidateRequire = packageRequire(activeContext.desktopWorkspace)
  const existingPort = await readConfiguredWebPort(activeContext, candidateRequire, profile.profileDirectory)
  const reservation = existingPort === undefined || existingPort === 0
    ? await (options.reservePort ?? reserveDevelopmentPort)(
      activeContext.baseline.startup.host,
      activeContext.developmentPortClaimRoot,
    )
    : undefined
  try {
    const webPort = reservation?.port ?? existingPort
    const recordedAt = options.recordedAt ?? new Date().toISOString()
    await (options.initializeDesktopSettings ?? initializeDesktopSettings)(activeContext, candidateRequire, webPort, profile.profileDirectory)
    await (options.initializeSetupState ?? initializeSetupState)(activeContext, profile.profileDirectory, recordedAt)
    const fileEnvironment = await readDesktopEnvironment(activeContext.environmentFilePath)
    const mergedEnvironment = { ...fileEnvironment, ...(options.environment ?? process.env) }
    const environment = desktopEnvironment(
      activeContext,
      productAgent,
      mergedEnvironment,
      resolve(activeContext.desktopWorkspace, 'node_modules/.bin'),
    )
    return { context: activeContext, environment, plugin, profile, productAgentPreset, webPort, reservation }
  } catch (error) {
    await reservation?.release()
    throw error
  }
}

export async function verifyManagedProfileInstallation(context, expected) {
  const manifest = await readJson(expected.profile.manifestPath)
  if (manifest.dependencies?.[expected.plugin.name] !== expected.profile.specifier
    || !manifest.dsh?.profile?.bundles?.includes(expected.plugin.name)) {
    throw new Error(`Desktop profile does not declare the managed ${expected.plugin.name} bundle`)
  }
  const linkedDirectory = await realpath(resolve(expected.profile.profileDirectory, 'node_modules', expected.plugin.name))
  if (linkedDirectory !== await realpath(context.managedPluginDirectory)) {
    throw new Error(`Desktop profile ${expected.plugin.name} link does not target the managed installation`)
  }
  const pluginManifest = await readJson(resolve(linkedDirectory, 'package.json'))
  if (pluginManifest.name !== expected.plugin.name || pluginManifest.version !== expected.plugin.version) {
    throw new Error(`Desktop profile loaded an unexpected ${expected.plugin.name} package`)
  }
  return Object.freeze({
    packageName: expected.plugin.name,
    version: expected.plugin.version,
    specifier: expected.profile.specifier,
    directory: linkedDirectory,
  })
}

function processIsRunning(pid, signalProcess = process.kill) {
  try {
    signalProcess(pid, 0)
    return true
  } catch (error) {
    if (error?.code === 'EPERM') return true
    if (error?.code === 'ESRCH') return false
    throw error
  }
}

async function readPid(path) {
  try {
    const text = (await readFile(path, 'utf8')).trim()
    if (!/^[1-9]\d*$/u.test(text)) throw new Error('Desktop PID file contains an invalid PID')
    const pid = Number(text)
    if (!Number.isSafeInteger(pid)) throw new Error('Desktop PID file contains an invalid PID')
    return pid
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

export async function verifiedAnywherePid(context, options = {}) {
  const pid = await readPid(context.pidFile)
  if (pid === undefined || !processIsRunning(pid, options.signalProcess)) return undefined
  const identity = await (options.readProcessIdentity ?? readProcessIdentity)(pid)
  if (identity === null) return undefined
  const expectedEntry = resolve(context.desktopBuildOutput, 'main.cjs')
  const pgidResult = (options.spawnSync ?? spawnSync)('ps', ['-p', String(pid), '-o', 'pgid='], { encoding: 'utf8' })
  const processGroupId = Number(pgidResult.stdout?.trim())
  if (pgidResult.status !== 0 || processGroupId !== pid || !identity.command.includes(expectedEntry)) {
    throw new Error(`Desktop PID ${pid} is not the process-group leader launched from ${expectedEntry}`)
  }
  const state = await readRecordedProcessState(context, pid)
  if (state.processIdentity?.startTime !== identity.startTime
    || state.processIdentity?.command !== identity.command) {
    throw new Error(`Desktop PID ${pid} does not match its recorded process identity`)
  }
  return { pid, identity, state }
}

function expectedRuntimeIdentity(context) {
  return {
    runtimeRoot: resolve(context.runtimeRoot),
    stateFile: resolve(context.stateFile),
    entryPath: resolve(context.desktopBuildOutput, 'main.cjs'),
  }
}

function validProcessGroupMember(value) {
  return isRecord(value)
    && Number.isSafeInteger(value.pid)
    && value.pid > 0
    && typeof value.startTime === 'string'
    && value.startTime.length > 0
    && typeof value.command === 'string'
    && value.command.length > 0
}

async function readRecordedProcessState(context, pid) {
  const state = await readJson(context.stateFile, 'Desktop process state')
  if (state.schemaVersion !== PROCESS_STATE_SCHEMA_VERSION || state.pid !== pid
    || !isRecord(state.processIdentity) || typeof state.processIdentity.startTime !== 'string'
    || typeof state.processIdentity.command !== 'string'
    || !isRecord(state.runtimeIdentity)
    || !Array.isArray(state.processGroupMembers)
    || state.processGroupMembers.some(member => !validProcessGroupMember(member))) {
    throw new Error(`Desktop PID ${pid} does not match its recorded process state`)
  }
  const expected = expectedRuntimeIdentity(context)
  if (state.runtimeIdentity.runtimeRoot !== expected.runtimeRoot
    || state.runtimeIdentity.stateFile !== expected.stateFile
    || state.runtimeIdentity.entryPath !== expected.entryPath) {
    throw new Error(`Desktop PID ${pid} process state belongs to a different worktree runtime`)
  }
  return state
}

function sameProcessGroupMember(left, right) {
  return left.pid === right.pid && left.startTime === right.startTime && left.command === right.command
}

export async function readAnywhereProcessGroupMembers(processGroupId, options = {}) {
  if (options.readProcessGroupMembers !== undefined) {
    const members = await options.readProcessGroupMembers(processGroupId)
    if (!Array.isArray(members) || members.some(member => !validProcessGroupMember(member))) {
      throw new Error(`Desktop process group ${processGroupId} member inspection returned invalid identities`)
    }
    return members.map(member => ({ pid: member.pid, startTime: member.startTime, command: member.command }))
  }
  const result = (options.spawnSync ?? spawnSync)('ps', ['-ax', '-o', 'pid=,pgid=,stat='], { encoding: 'utf8' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`cannot inspect Desktop process group ${processGroupId}`)
  const pids = result.stdout.split('\n').flatMap(line => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)/u)
    return Number(match?.[2]) === processGroupId && !match?.[3].startsWith('Z') ? [Number(match[1])] : []
  })
  const readIdentity = options.readProcessIdentity ?? readProcessIdentity
  const identities = await Promise.all(pids.map(async pid => ({ pid, identity: await readIdentity(pid) })))
  return identities.flatMap(({ pid, identity }) => identity === null ? [] : [{
    pid,
    startTime: identity.startTime,
    command: identity.command,
  }])
}

async function assertRecordedProcessGroupOwnership(context, processGroupId, state, options = {}) {
  const current = await readAnywhereProcessGroupMembers(processGroupId, options)
  if (current.length === 0) return current
  if (!current.some(member => state.processGroupMembers.some(recorded => sameProcessGroupMember(member, recorded)))) {
    throw new Error(
      `Desktop process group ${processGroupId} has no live member matching the recorded worktree process identities; state was preserved`,
    )
  }
  return current
}

async function managedAnywhereProcess(context, options = {}) {
  const pid = await readPid(context.pidFile)
  if (pid === undefined) return undefined
  if (processIsRunning(pid, options.signalProcess)) return verifiedAnywherePid(context, options)
  const state = await readRecordedProcessState(context, pid)
  const members = await assertRecordedProcessGroupOwnership(context, pid, state, options)
  if (members.length === 0) return undefined
  return { pid, identity: null, state, leaderExited: true, members }
}

function parseLifecycleLines(text, startedAt) {
  const minimumTimestamp = Date.parse(startedAt)
  const events = []
  for (const line of text.split(/\r?\n/u)) {
    if (line.length === 0) continue
    try {
      const event = JSON.parse(line)
      if (isRecord(event) && typeof event.timestamp === 'string' && Date.parse(event.timestamp) >= minimumTimestamp) {
        events.push(event)
      }
    } catch {
      // The Desktop owns this append-only evidence file and may be between writes.
    }
  }
  const started = events.find(event => event.eventName === 'startup.run.started' && typeof event.runId === 'string')
  if (started === undefined) return { status: 'starting' }
  const runEvents = events.filter(event => event.runId === started.runId)
  const failure = runEvents.find(event => event.eventName === 'startup.run.failed')
  if (failure !== undefined) return { status: 'failed', runId: started.runId, event: failure }
  const renderer = runEvents.find(event => event.eventName === 'renderer.boot.completed'
    && event.details?.rendererStatus === 'healthy')
  const completed = runEvents.find(event => event.eventName === 'startup.run.completed'
    && event.details?.rendererStatus === 'healthy')
  if (renderer !== undefined && completed !== undefined) return { status: 'ready', runId: started.runId, event: completed }
  return { status: 'starting', runId: started.runId }
}

export function currentStartupLifecycle(text, startedAt) {
  if (typeof startedAt !== 'string' || !Number.isFinite(Date.parse(startedAt))) {
    throw new Error('Desktop startup time must be an ISO timestamp')
  }
  return parseLifecycleLines(text, startedAt)
}

async function readCurrentStartupLifecycle(context, startedAt) {
  try {
    return currentStartupLifecycle(await readFile(context.lifecycleEvidenceFile, 'utf8'), startedAt)
  } catch (error) {
    if (error?.code === 'ENOENT') return { status: 'starting' }
    throw error
  }
}

async function waitForCurrentStartup(context, startedAt, timeoutMs, childOutcome) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const lifecycle = await readCurrentStartupLifecycle(context, startedAt)
    if (lifecycle.status === 'ready') return lifecycle
    if (lifecycle.status === 'failed') {
      throw new Error(`Desktop startup run ${lifecycle.runId} failed at ${String(lifecycle.event.details?.finalStage)}`)
    }
    const exited = await Promise.race([
      childOutcome.then(outcome => ({ outcome })),
      new Promise(resolveWait => setTimeout(() => resolveWait(undefined), 25)),
    ])
    if (exited !== undefined) throw new Error(`Desktop exited before startup completed: ${JSON.stringify(exited.outcome)}`)
  }
  throw new Error(`Desktop did not report a healthy current startup run within ${timeoutMs}ms`)
}

function childWatcher(child) {
  return new Promise((resolveOutcome, reject) => {
    let settled = false
    const resolveOnce = (code, signal) => {
      if (settled) return
      settled = true
      resolveOutcome({ code: code ?? 1, signal })
    }
    child.once('error', error => {
      if (settled) return
      settled = true
      reject(error)
    })
    child.once('exit', resolveOnce)
    child.once('close', resolveOnce)
  })
}

async function processGroupListeningPorts(processGroupId) {
  const lsof = spawnSync('lsof', ['-nP', '-a', '-iTCP', '-sTCP:LISTEN', '-Fp', '-Fn'], { encoding: 'utf8' })
  if (lsof.status !== 0 && !(lsof.status === 1 && lsof.stderr.trim().length === 0)) {
    throw new Error(`cannot inspect Desktop listening ports: lsof exited with status ${String(lsof.status)}`)
  }
  let pid
  const ports = new Set()
  for (const line of lsof.stdout.split('\n')) {
    if (line.startsWith('p')) {
      pid = Number(line.slice(1))
      continue
    }
    if (!line.startsWith('n') || !Number.isSafeInteger(pid)) continue
    const pgid = spawnSync('ps', ['-p', String(pid), '-o', 'pgid='], { encoding: 'utf8' })
    if (Number(pgid.stdout.trim()) !== processGroupId) continue
    const match = line.match(/:(\d+)(?:\s|$)/u)
    if (match !== null) ports.add(Number(match[1]))
  }
  return [...ports].sort((left, right) => left - right)
}

async function removeProcessFiles(context) {
  await Promise.all([rm(context.pidFile, { force: true }), rm(context.stateFile, { force: true })])
}

export async function desktopWorktreeStatus(context, options = {}) {
  const process = await managedAnywhereProcess(context, options)
  if (process === undefined) return { status: 'stopped' }
  if (process.leaderExited === true) {
    return { status: 'failed', pid: process.pid, runId: process.state.runId, webPorts: process.state.webPorts ?? [] }
  }
  const lifecycle = await readCurrentStartupLifecycle(context, process.state.startedAt)
  if (lifecycle.status === 'failed') {
    return { status: 'failed', pid: process.pid, runId: lifecycle.runId, webPorts: process.state.webPorts ?? [] }
  }
  if (lifecycle.status !== 'ready' || process.state.ready !== true) {
    return { status: 'starting', pid: process.pid, runId: lifecycle.runId, webPorts: process.state.webPorts ?? [] }
  }
  const ports = await (options.listeningPorts ?? processGroupListeningPorts)(process.pid)
  if (!Array.isArray(process.state.webPorts)
    || process.state.webPorts.some(port => !ports.includes(port))) {
    return { status: 'failed', pid: process.pid, runId: lifecycle.runId, webPorts: ports }
  }
  return { status: 'ready', pid: process.pid, runId: lifecycle.runId, webPorts: ports }
}

async function waitForExit(pid, options, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!await processGroupIsRunning(pid, options)) return true
    await new Promise(resolveWait => setTimeout(resolveWait, options.stopPollIntervalMs ?? 50))
  }
  return !await processGroupIsRunning(pid, options)
}

async function processGroupIsRunning(processGroupId, options = {}) {
  if (options.processGroupIsRunning !== undefined) return options.processGroupIsRunning(processGroupId)
  return (await readAnywhereProcessGroupMembers(processGroupId, options)).length > 0
}

async function assertSignalStillTargetsRecordedGroup(context, process, options) {
  if (processIsRunning(process.pid, options.signalProcess)) {
    const verified = await verifiedAnywherePid(context, options)
    if (verified !== undefined) return true
  }
  return (await assertRecordedProcessGroupOwnership(context, process.pid, process.state, options)).length > 0
}

async function assertLaunchedProcessGroupOwnership(context, pid, launchedIdentity, options = {}) {
  if (processIsRunning(pid, options.signalProcess)) {
    const currentIdentity = await (options.readProcessIdentity ?? readProcessIdentity)(pid)
    const expectedEntry = resolve(context.desktopBuildOutput, 'main.cjs')
    if (currentIdentity === null) {
      const state = await readRecordedProcessState(context, pid)
      return (await assertRecordedProcessGroupOwnership(context, pid, state, options)).length > 0
    }
    if (launchedIdentity === undefined || currentIdentity.startTime !== launchedIdentity.startTime
      || currentIdentity.command !== launchedIdentity.command
      || !currentIdentity.command.includes(expectedEntry)) {
      throw new Error(`Desktop process group ${pid} no longer matches the process launched by this worktree; state was preserved`)
    }
    return true
  }
  const state = await readRecordedProcessState(context, pid)
  return (await assertRecordedProcessGroupOwnership(context, pid, state, options)).length > 0
}

export async function stopDesktopWorktree(context, options = {}) {
  const process = await managedAnywhereProcess(context, options)
  if (process === undefined) {
    await removeProcessFiles(context)
    return { status: 'stopped' }
  }
  const signalProcess = options.signalProcess ?? globalThis.process.kill
  const stopTimeoutMs = options.stopTimeoutMs ?? context.baseline.startup.stopTimeoutMs
  if (!await assertSignalStillTargetsRecordedGroup(context, process, { ...options, signalProcess })) {
    await removeProcessFiles(context)
    return { status: 'stopped', pid: process.pid }
  }
  try {
    signalProcess(-process.pid, 'SIGTERM')
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
  if (!await waitForExit(process.pid, { ...options, signalProcess }, stopTimeoutMs)) {
    if (!await assertSignalStillTargetsRecordedGroup(context, process, { ...options, signalProcess })) {
      await removeProcessFiles(context)
      return { status: 'stopped', pid: process.pid }
    }
    try {
      signalProcess(-process.pid, 'SIGKILL')
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error
    }
    if (!await waitForExit(process.pid, { ...options, signalProcess }, stopTimeoutMs)) {
      throw new Error(`Desktop process group ${process.pid} did not exit after SIGKILL`)
    }
  }
  await removeProcessFiles(context)
  return { status: 'stopped', pid: process.pid }
}

async function writeDesktopEntry(context) {
  await rm(context.desktopBuildOutput, { recursive: true, force: true })
  await mkdir(context.desktopBuildOutput, { recursive: true })
  const entry = resolve(context.desktopBuildOutput, 'main.cjs')
  await writeFile(entry, `import(${JSON.stringify(pathToFileURL(context.desktopMain).href)});\n`)
  return entry
}

export async function startDesktopWorktree(context, options = {}) {
  const current = await managedAnywhereProcess(context, options)
  if (current !== undefined) throw new Error(`Desktop is already running with PID ${current.pid}`)
  await removeProcessFiles(context)
  const startedAt = (options.now ?? (() => new Date()))().toISOString()
  let prepared
  let child
  let launchedIdentity
  let outcome
  let forward
  let log
  try {
    prepared = await prepareAnywhereDesktop(context, { ...options, recordedAt: startedAt })
    if (options.prepareDesktopSettings !== undefined) await options.prepareDesktopSettings(prepared.profile.profileDirectory)
    if (prepared.productAgentPreset !== undefined) {
      const { materializeDeclaredAgentPresetPatch } = await import('../profile/agent-preset.mjs')
      await materializeDeclaredAgentPresetPatch(prepared.productAgentPreset, prepared.profile.profileDirectory)
    }
    const installation = await verifyManagedProfileInstallation(prepared.context, prepared)
    const entry = await writeDesktopEntry(prepared.context)
    const candidateRequire = packageRequire(prepared.context.desktopWorkspace)
    const electron = candidateRequire('electron')
    const args = [entry, `--user-data-dir=${prepared.context.userData}`]
    if (options.remoteDebuggingPort !== undefined) {
      if (!Number.isSafeInteger(options.remoteDebuggingPort) || options.remoteDebuggingPort < 1
        || options.remoteDebuggingPort > 65_535) throw new Error('remoteDebuggingPort must be an integer from 1 to 65535')
      args.push(`--remote-debugging-port=${options.remoteDebuggingPort}`, '--remote-debugging-address=127.0.0.1')
    }
    child = (options.spawnDesktop ?? spawn)(electron, args, {
      cwd: prepared.context.runtimeRoot,
      env: prepared.environment,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    })
    outcome = childWatcher(child)
    if (child.pid === undefined) {
      await outcome
      throw new Error('Desktop did not provide a process ID')
    }
    await mkdir(dirname(prepared.context.logFile), { recursive: true })
    log = createWriteStream(prepared.context.logFile, { flags: 'w' })
    child.stdout?.pipe(log, { end: false })
    child.stderr?.pipe(log, { end: false })
    child.once('close', () => log.end())
    const identity = await (options.readProcessIdentity ?? readProcessIdentity)(child.pid)
    if (identity === null || !identity.command.includes(entry)) {
      throw new Error(`Desktop process ${child.pid} did not retain its managed entry path`)
    }
    launchedIdentity = { startTime: identity.startTime, command: identity.command }
    const initialMembers = await readAnywhereProcessGroupMembers(child.pid, options)
    const recordedInitialMembers = initialMembers.length > 0 ? initialMembers : [{
      pid: child.pid,
      startTime: identity.startTime,
      command: identity.command,
    }]
    await writeAtomicJson(prepared.context.stateFile, {
      schemaVersion: PROCESS_STATE_SCHEMA_VERSION,
      pid: child.pid,
      startedAt,
      ready: false,
      processIdentity: { startTime: identity.startTime, command: identity.command },
      runtimeIdentity: expectedRuntimeIdentity(prepared.context),
      processGroupMembers: recordedInitialMembers,
      webPorts: [],
      installation,
    })
    await writeFile(prepared.context.pidFile, `${child.pid}\n`)
    const signalProcess = options.signalProcess ?? globalThis.process.kill
    forward = () => {
      void assertLaunchedProcessGroupOwnership(prepared.context, child.pid, launchedIdentity, {
        ...options,
        signalProcess,
      }).then(owned => {
        if (owned) signalProcess(-child.pid, 'SIGTERM')
      }).catch(() => undefined)
    }
    globalThis.process.once('SIGINT', forward)
    globalThis.process.once('SIGTERM', forward)
    const readyTimeoutMs = options.readyTimeoutMs ?? prepared.context.baseline.startup.readyTimeoutMs
    const readyDeadline = Date.now() + readyTimeoutMs
    const lifecycle = await waitForCurrentStartup(
      prepared.context,
      startedAt,
      readyTimeoutMs,
      outcome,
    )
    await (options.waitForPort ?? waitForPortOwnedByProcessGroup)(
      prepared.webPort,
      child.pid,
      Math.max(1, readyDeadline - Date.now()),
    )
    const webPorts = await (options.listeningPorts ?? processGroupListeningPorts)(child.pid)
    if (!webPorts.includes(prepared.webPort)) {
      throw new Error(`Desktop process group ${child.pid} does not own configured Web port ${prepared.webPort}`)
    }
    const readyMembers = await readAnywhereProcessGroupMembers(child.pid, options)
    if (readyMembers.length === 0) throw new Error(`Desktop process group ${child.pid} has no live members at readiness`)
    await writeAtomicJson(prepared.context.stateFile, {
      schemaVersion: PROCESS_STATE_SCHEMA_VERSION,
      pid: child.pid,
      startedAt,
      ready: true,
      runId: lifecycle.runId,
      processIdentity: { startTime: identity.startTime, command: identity.command },
      runtimeIdentity: expectedRuntimeIdentity(prepared.context),
      processGroupMembers: readyMembers,
      webPorts,
      installation,
    })
    await prepared.reservation?.release()
    const result = await outcome
    let residualProcessGroupTerminated = false
    if (await processGroupIsRunning(child.pid, options)) {
      const signalProcess = options.signalProcess ?? globalThis.process.kill
      const recorded = await readRecordedProcessState(prepared.context, child.pid)
      const members = await assertRecordedProcessGroupOwnership(prepared.context, child.pid, recorded, options)
      if (members.length > 0) {
        residualProcessGroupTerminated = true
        try { signalProcess(-child.pid, 'SIGTERM') } catch {}
        if (!await waitForExit(child.pid, { ...options, signalProcess }, context.baseline.startup.stopTimeoutMs)) {
          const remaining = await assertRecordedProcessGroupOwnership(
            prepared.context,
            child.pid,
            recorded,
            { ...options, signalProcess },
          )
          if (remaining.length > 0) {
            try { signalProcess(-child.pid, 'SIGKILL') } catch {}
            if (!await waitForExit(child.pid, { ...options, signalProcess }, context.baseline.startup.stopTimeoutMs)) {
              throw new Error(`Desktop process group ${child.pid} remained active after its leader exited and SIGKILL was sent`)
            }
          }
        }
      }
    }
    return {
      status: residualProcessGroupTerminated
        ? 'failed'
        : result.code === 0 || result.signal === 'SIGTERM' ? 'stopped' : 'failed',
      pid: child.pid,
      code: result.code,
      signal: result.signal,
      ...(residualProcessGroupTerminated ? { residualProcessGroupTerminated: true } : {}),
    }
  } catch (error) {
    if (child?.pid !== undefined && await processGroupIsRunning(child.pid, options)) {
      const signalProcess = options.signalProcess ?? globalThis.process.kill
      try {
        if (await assertLaunchedProcessGroupOwnership(
          prepared?.context ?? context,
          child.pid,
          launchedIdentity,
          { ...options, signalProcess },
        )) {
          try { signalProcess(-child.pid, 'SIGTERM') } catch {}
          if (!await waitForExit(child.pid, { ...options, signalProcess }, context.baseline.startup.stopTimeoutMs)) {
            if (await assertLaunchedProcessGroupOwnership(
              prepared?.context ?? context,
              child.pid,
              launchedIdentity,
              { ...options, signalProcess },
            )) {
              try { signalProcess(-child.pid, 'SIGKILL') } catch {}
              await waitForExit(child.pid, { ...options, signalProcess }, context.baseline.startup.stopTimeoutMs)
            }
          }
        }
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          `Desktop startup failed and process group ${child.pid} ownership could not be verified; state was preserved`,
        )
      }
    }
    throw error
  } finally {
    if (forward !== undefined) {
      globalThis.process.off('SIGINT', forward)
      globalThis.process.off('SIGTERM', forward)
    }
    await prepared?.reservation?.release()
    if (child?.pid === undefined || !await processGroupIsRunning(child.pid, options)) await removeProcessFiles(context)
  }
}

export async function readDesktopWorktreeLogs(context, lines = 120) {
  const paths = [context.logFile]
  try {
    const directory = resolve(context.userData, 'logs')
    for (const name of (await readdir(directory)).filter(name => name.endsWith('.log')).sort()) {
      paths.push(resolve(directory, name))
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const output = []
  for (const path of paths) {
    try {
      output.push((await readFile(path, 'utf8')).split(/\r?\n/u).slice(-lines).map(redactSensitiveLine).join('\n'))
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  return output.filter(Boolean).join('\n') || 'Desktop log has not been created.\n'
}

export async function runAnywhereCommand(command, context, options = {}) {
  if (command === 'status') return desktopWorktreeStatus(context, options)
  if (command === 'logs') return { status: 'logs', output: await readDesktopWorktreeLogs(context) }
  if (command === 'stop') return stopDesktopWorktree(context, options)
  if (command === 'restart') await stopDesktopWorktree(context, options)
  return startDesktopWorktree(context, options)
}

export {
  PROCESS_STATE_SCHEMA_VERSION,
  SOURCE_PLUGIN_PACKAGE_PATHS,
  initializeDesktopSettings,
  readConfiguredWebPort,
}

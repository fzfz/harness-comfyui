import { randomUUID } from 'node:crypto'
import { chmod, link, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

const requireFromModule = createRequire(import.meta.url)
let dshYaml
let imageReaderSettingsPromise
let profileYamlSchema

function loadDshYaml() {
  if (dshYaml === undefined) {
    const requireFromDsh = createRequire(requireFromModule.resolve('@deepseek-ai/dsh/package.json'))
    dshYaml = requireFromDsh('js-yaml')
  }
  return dshYaml
}

class ProfileJsExpression {
  constructor(source) { this.source = source }
}

function loadProfileYamlSchema() {
  if (profileYamlSchema === undefined) {
    const yaml = loadDshYaml()
    profileYamlSchema = yaml.DEFAULT_SCHEMA.extend([
      new yaml.Type('tag:yaml.org,2002:js', {
        kind: 'scalar',
        construct: source => new ProfileJsExpression(source),
        instanceOf: ProfileJsExpression,
        represent: value => value.source,
      }),
    ])
  }
  return profileYamlSchema
}

async function loadImageReaderSettings() {
  imageReaderSettingsPromise ??= import('../../src/image-reader/settings.ts')
  return imageReaderSettingsPromise
}

const SETTINGS_FILENAME = 'settings.yaml'
const IMPORTED_SETTINGS_FILENAME = 'settings.yaml.imported'
const CREDENTIALS_FILENAME = '.credentials.yaml'
const PROFILE_PATCH_FILENAME = 'cordis.patch.yml'
const SOURCE_NAMESPACE = 'harness-comfyui-source'
const LEGACY_IMAGE_READER_NAMESPACE = 'harness-comfyui-image-reader'
const IMAGE_READER_NAMESPACE = 'harness-comfyui-image-reader-profiles'
const PROVIDER_NAMESPACES = Object.freeze([
  'agent-default-model',
  'llm-deepseek',
  'llm-pi-ai',
])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertRecord(value, label) {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`)
  return value
}

function resolveContainedRelativePath(root, value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || isAbsolute(value)) {
    throw new TypeError(`${label} must be a non-empty relative path`)
  }
  const path = resolve(root, value)
  const fromRoot = relative(root, path)
  if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new TypeError(`${label} must identify a file inside the current checkout`)
  }
  return path
}

async function readRequiredFile(path, label) {
  let stats
  try {
    stats = await lstat(path)
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`${label} is unavailable: ${path}`)
    throw error
  }
  if (!stats.isFile()) throw new Error(`${label} must be a regular file: ${path}`)
  return readFile(path, 'utf8')
}

async function readRequiredJson(path, label) {
  const source = await readRequiredFile(path, label)
  try {
    return JSON.parse(source)
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${path}`, { cause: error })
  }
}

async function readRequiredYaml(path, label) {
  const source = await readRequiredFile(path, label)
  try {
    return loadDshYaml().load(source)
  } catch {
    throw new Error(`${label} is not valid DSH YAML: ${path}`)
  }
}

async function readOptionalYaml(path, label) {
  try {
    return loadDshYaml().load(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw new Error(`${label} is not valid DSH YAML: ${path}`)
  }
}

async function exists(path) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function readProfilePatch(path) {
  try {
    return loadDshYaml().load(await readFile(path, 'utf8'), { schema: loadProfileYamlSchema() })
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`Desktop profile patch is unavailable: ${path}`)
    throw new Error(`Desktop profile patch is not valid DSH YAML: ${path}`, { cause: error })
  }
}

function assertNoCredentialValues(value, label) {
  if (Array.isArray(value)) {
    for (const item of value) assertNoCredentialValues(item, label)
    return
  }
  if (!isRecord(value)) return
  for (const [key, item] of Object.entries(value)) {
    if (['apikey', 'credential', 'credentials'].includes(key.toLowerCase())) {
      throw new TypeError(`${label} must not contain credential values at ${key}`)
    }
    assertNoCredentialValues(item, label)
  }
}

function collectApiKeyEnvironmentNames(value, result = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectApiKeyEnvironmentNames(item, result)
    return result
  }
  if (!isRecord(value)) return result
  for (const [key, item] of Object.entries(value)) {
    if (key === 'apiKeyEnv' && typeof item === 'string' && item.length > 0) result.add(item)
    collectApiKeyEnvironmentNames(item, result)
  }
  return result
}

function validateProviderConfiguration(value) {
  const config = assertRecord(value, 'development Provider configuration')
  if (config.schemaVersion !== 1) {
    throw new TypeError('development Provider configuration.schemaVersion must equal 1')
  }
  const namespaces = assertRecord(
    config.managedNamespaces,
    'development Provider configuration.managedNamespaces',
  )
  const actualNamespaces = Object.keys(namespaces).sort()
  const expectedNamespaces = [...PROVIDER_NAMESPACES].sort()
  if (JSON.stringify(actualNamespaces) !== JSON.stringify(expectedNamespaces)) {
    throw new TypeError(`development Provider configuration.managedNamespaces must contain exactly ${expectedNamespaces.join(', ')}`)
  }
  for (const namespace of PROVIDER_NAMESPACES) {
    assertRecord(namespaces[namespace], `development Provider namespace ${namespace}`)
  }
  assertNoCredentialValues(namespaces, 'development Provider configuration.managedNamespaces')

  if (!Array.isArray(config.credentialRefs) || config.credentialRefs.length === 0) {
    throw new TypeError('development Provider configuration.credentialRefs must be a non-empty list')
  }
  const credentialRefs = config.credentialRefs.map((value, index) => {
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`development Provider configuration.credentialRefs[${index}] must be a non-empty string`)
    }
    return value
  })
  if (new Set(credentialRefs).size !== credentialRefs.length) {
    throw new TypeError('development Provider configuration.credentialRefs must not contain duplicates')
  }
  for (const name of collectApiKeyEnvironmentNames(namespaces)) {
    if (!credentialRefs.includes(name)) {
      throw new TypeError(`development Provider configuration.credentialRefs must include ${name}`)
    }
  }
  return { credentialRefs, namespaces }
}

async function validateTrackedImageReaderConfiguration(value) {
  const config = assertRecord(value, 'image reader configuration')
  if (config.schemaVersion !== 1) throw new TypeError('image reader configuration.schemaVersion must equal 1')
  assertNoCredentialValues(config, 'image reader configuration')
  const configuration = assertRecord(config.configuration, 'image reader configuration.configuration')
  const { validateImageReaderConfiguration } = await loadImageReaderSettings()
  validateImageReaderConfiguration(configuration)
  const credentialProfileIds = configuration.profiles
    .filter(profile => profile.hasApiKey)
    .map(profile => profile.id)
    .sort()
  return { configuration, credentialProfileIds: credentialProfileIds.sort() }
}

async function validatePrivateSettings(value, configuration, credentialProfileIds) {
  const settings = assertRecord(value, 'main checkout private DSH settings')
  const imageReader = assertRecord(
    settings[IMAGE_READER_NAMESPACE],
    `main checkout private DSH settings.${IMAGE_READER_NAMESPACE}`,
  )
  const credentials = assertRecord(
    imageReader.credentials,
    `main checkout private DSH settings.${IMAGE_READER_NAMESPACE}.credentials`,
  )
  const managedCredentials = {}
  for (const id of credentialProfileIds) {
    if (typeof credentials[id] !== 'string' || credentials[id].length === 0) {
      throw new TypeError(`main checkout image reader credential must be a non-empty string: ${id}`)
    }
    managedCredentials[id] = credentials[id]
  }
  const { validateImageReaderSettingsSection } = await loadImageReaderSettings()
  validateImageReaderSettingsSection({ configuration, credentials: managedCredentials })
  return managedCredentials
}

async function readPrivateImageReaderSource(home, profileName, entryId, trackedConfiguration, credentialProfileIds) {
  const profilePath = resolve(home, 'profiles', profileName, PROFILE_PATCH_FILENAME)
  const profilePatch = await readOptionalProfilePatch(profilePath)
  if (profilePatch !== undefined) {
    if (!Array.isArray(profilePatch)) throw new TypeError('main checkout DSH Profile patch must contain a patch list')
    const positions = profileEntryPositions(profilePatch, entryId)
    if (positions.length > 1) throw new TypeError(`main checkout DSH Profile contains duplicate entry ${entryId}`)
    if (positions.length === 1) {
      const { rowIndex, entryIndex } = positions[0]
      const entry = entryIndex === undefined ? profilePatch[rowIndex] : profilePatch[rowIndex].insert[entryIndex]
      const config = entry.config === undefined ? {} : assertRecord(entry.config, `main checkout DSH Profile entry ${entryId}.config`)
      if (Object.hasOwn(config, 'configuration') || Object.hasOwn(config, 'credentials')) {
        const section = {
          configuration: config.configuration ?? trackedConfiguration,
          credentials: config.credentials ?? {},
        }
        const { validateImageReaderSettingsSection } = await loadImageReaderSettings()
        validateImageReaderSettingsSection(section)
        return section
      }
    }
  }

  // The active legacy document supersedes its one-time imported archive.
  for (const filename of [SETTINGS_FILENAME, IMPORTED_SETTINGS_FILENAME]) {
    const value = await readOptionalYaml(resolve(home, filename), `main checkout private DSH ${filename}`)
    if (value === undefined) continue
    const settings = assertRecord(value, `main checkout private DSH ${filename}`)
    if (settings[IMAGE_READER_NAMESPACE] === undefined) continue
    return {
      configuration: trackedConfiguration,
      credentials: await validatePrivateSettings(settings, trackedConfiguration, credentialProfileIds),
    }
  }
  throw new Error('main checkout image reader settings are unavailable in the Desktop Profile, settings.yaml, and settings.yaml.imported')
}

async function readOptionalProfilePatch(path) {
  try {
    return loadDshYaml().load(await readFile(path, 'utf8'), { schema: loadProfileYamlSchema() })
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw new Error(`main checkout DSH Profile patch is not valid DSH YAML: ${path}`)
  }
}

function validatePrivateCredentials(value, credentialRefs) {
  const credentials = assertRecord(value, 'main checkout private DSH credentials')
  if (credentials.version !== 1) throw new TypeError('main checkout private DSH credentials.version must equal 1')
  const refs = assertRecord(credentials.refs, 'main checkout private DSH credentials.refs')
  const managedRefs = {}
  for (const name of credentialRefs) {
    if (typeof refs[name] !== 'string' || refs[name].length === 0) {
      throw new TypeError(`main checkout private DSH credential must be a non-empty string: ${name}`)
    }
    managedRefs[name] = refs[name]
  }
  return { managedRefs, version: credentials.version }
}

function mergeTargetSettings(value, namespaces, imageConfiguration, imageCredentials) {
  const target = value === undefined ? {} : assertRecord(value, 'worktree DSH settings')
  const legacyImageReader = target[IMAGE_READER_NAMESPACE]
  if (legacyImageReader !== undefined) assertRecord(legacyImageReader, `worktree DSH settings.${IMAGE_READER_NAMESPACE}`)
  const olderImageReader = target[LEGACY_IMAGE_READER_NAMESPACE]
  if (olderImageReader !== undefined) assertRecord(olderImageReader, `worktree DSH settings.${LEGACY_IMAGE_READER_NAMESPACE}`)
  const legacySource = target[SOURCE_NAMESPACE]
  if (legacySource !== undefined) assertRecord(legacySource, `worktree DSH settings.${SOURCE_NAMESPACE}`)
  return {
    legacy: target,
    source: legacySource,
    imageReader: legacyImageReader ?? { configuration: imageConfiguration, credentials: imageCredentials },
    olderImageReader,
    providers: Object.fromEntries(PROVIDER_NAMESPACES.map(name => [name, target[name] ?? namespaces[name]])),
  }
}

function mergeTargetCredentials(value, version, managedRefs) {
  if (value === undefined) return { version, refs: managedRefs }
  const target = assertRecord(value, 'worktree DSH credentials')
  if (target.version !== version) {
    throw new TypeError(`worktree DSH credentials.version must equal ${version}`)
  }
  const refs = assertRecord(target.refs, 'worktree DSH credentials.refs')
  return {
    ...target,
    version,
    refs: {
      ...managedRefs,
      ...refs,
    },
  }
}

async function writePrivateYamlAtomically(path, value, schema) {
  const temporaryPath = `${path}.${randomUUID()}.next`
  try {
    await writeFile(temporaryPath, loadDshYaml().dump(value, {
      lineWidth: -1,
      noCompatMode: true,
      noRefs: true,
      ...(schema ? { schema } : {}),
    }), {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
    await rename(temporaryPath, path)
    await chmod(path, 0o600)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

function fillMissing(current, defaults) {
  if (current instanceof ProfileJsExpression) return current
  if (!isRecord(current) || !isRecord(defaults)) return current === undefined ? defaults : current
  const merged = { ...current }
  for (const [key, value] of Object.entries(defaults)) {
    merged[key] = fillMissing(current[key], value)
  }
  return merged
}

function profileEntryIds(value) {
  const ids = assertRecord(value, 'settings entry IDs')
  for (const key of ['core', 'imageReader']) {
    if (typeof ids[key] !== 'string' || ids[key].length === 0) {
      throw new TypeError(`settings entry IDs.${key} must be a non-empty string`)
    }
  }
  return ids
}

function bundleEntryConfigs(value, ids) {
  if (!Array.isArray(value)) throw new TypeError('repository cordis.patch.yml must contain a patch list')
  const entries = value.flatMap(row => Array.isArray(row?.insert) ? row.insert : [])
  const configs = {}
  for (const id of [ids.core, ids.imageReader]) {
    const matches = entries.filter(entry => entry?.id === id)
    if (matches.length !== 1) throw new TypeError(`repository cordis.patch.yml must contain exactly one inserted entry ${id}`)
    configs[id] = assertRecord(matches[0].config, `repository cordis.patch.yml entry ${id}.config`)
  }
  return configs
}

function profileEntryPositions(patch, id) {
  const positions = []
  for (let rowIndex = 0; rowIndex < patch.length; rowIndex += 1) {
    const row = patch[rowIndex]
    if (row?.id === id) positions.push({ rowIndex })
    if (Array.isArray(row?.insert)) {
      for (let entryIndex = 0; entryIndex < row.insert.length; entryIndex += 1) {
        if (row.insert[entryIndex]?.id === id) positions.push({ rowIndex, entryIndex })
      }
    }
  }
  return positions
}

function mergeProfilePatch(value, legacy, defaults, ids, bundleConfigs) {
  if (!Array.isArray(value)) throw new TypeError('Desktop profile cordis.patch.yml must contain a patch list')
  const patch = [...value]
  const managed = {
    ...defaults.providers,
    [ids.imageReader]: fillMissing(defaults.imageReader, bundleConfigs[ids.imageReader]),
  }
  if (defaults.source !== undefined || profileEntryPositions(patch, ids.core).length > 0) {
    managed[ids.core] = fillMissing(defaults.source ?? {}, bundleConfigs[ids.core])
  }
  const legacyImage = legacy[IMAGE_READER_NAMESPACE]
  const legacySource = legacy[SOURCE_NAMESPACE]
  if (legacyImage !== undefined) managed[ids.imageReader] = fillMissing(legacyImage, bundleConfigs[ids.imageReader])
  if (legacySource !== undefined) managed[ids.core] = fillMissing(legacySource, bundleConfigs[ids.core])
  for (const [id, config] of Object.entries(managed)) {
    const positions = profileEntryPositions(patch, id)
    if (positions.length > 1) throw new TypeError(`Desktop profile cordis.patch.yml contains duplicate entry ${id}`)
    if (positions.length === 0) patch.push({ id, config })
    else {
      const { rowIndex, entryIndex } = positions[0]
      const existing = assertRecord(entryIndex === undefined ? patch[rowIndex] : patch[rowIndex].insert[entryIndex], `Desktop profile entry ${id}`)
      const existingConfig = existing.config === undefined ? {} : assertRecord(existing.config, `Desktop profile entry ${id}.config`)
      const hasImageReaderSettings = id === ids.imageReader
        && (Object.hasOwn(existingConfig, 'configuration') || Object.hasOwn(existingConfig, 'credentials'))
      const defaultsForEntry = hasImageReaderSettings ? bundleConfigs[ids.imageReader] : config
      const mergedConfig = fillMissing(existingConfig, defaultsForEntry)
      if (id === 'llm-pi-ai' && isRecord(existingConfig.providers)) {
        mergedConfig.providers = existingConfig.providers
      }
      const updated = { ...existing, config: mergedConfig }
      if (entryIndex === undefined) patch[rowIndex] = updated
      else {
        const parent = patch[rowIndex]
        const insert = [...parent.insert]
        insert[entryIndex] = updated
        patch[rowIndex] = { ...parent, insert }
      }
    }
  }
  return patch
}

function remainingLegacySettings(legacy) {
  const retained = { ...legacy }
  for (const name of [...PROVIDER_NAMESPACES, SOURCE_NAMESPACE, LEGACY_IMAGE_READER_NAMESPACE, IMAGE_READER_NAMESPACE]) delete retained[name]
  return retained
}

export async function prepareDesktopDevelopmentSettings({ context, checkout }) {
  const repositoryRoot = resolve(context.repositoryRoot)
  const mainCheckoutPath = resolve(checkout.mainCheckoutPath)
  const definition = assertRecord(checkout.definition, 'Desktop development checkout definition')
  const managedDefinition = assertRecord(
    definition.managedDshSettings,
    'Desktop development checkout definition.managedDshSettings',
  )
  const providerConfigurationPath = resolveContainedRelativePath(
    repositoryRoot,
    managedDefinition.providerConfigurationRelativePath,
    'managedDshSettings.providerConfigurationRelativePath',
  )
  const imageReaderConfigurationPath = resolveContainedRelativePath(
    repositoryRoot,
    managedDefinition.imageReaderConfigurationRelativePath,
    'managedDshSettings.imageReaderConfigurationRelativePath',
  )
  const targetDshHomeRelativePath = relative(repositoryRoot, resolve(context.dshHome))
  if (targetDshHomeRelativePath === '..'
    || targetDshHomeRelativePath.startsWith(`..${sep}`)
    || isAbsolute(targetDshHomeRelativePath)) {
    throw new TypeError('Desktop development DSH home must stay inside the current checkout')
  }
  const privateSourceDshHome = resolveContainedRelativePath(
    mainCheckoutPath,
    managedDefinition.privateSourceDshHomeRelativePath,
    'managedDshSettings.privateSourceDshHomeRelativePath',
  )

  const [providerValue, imageReaderValue, privateCredentialsValue] = await Promise.all([
    readRequiredJson(providerConfigurationPath, 'development Provider configuration'),
    readRequiredJson(imageReaderConfigurationPath, 'image reader configuration'),
    readRequiredYaml(resolve(privateSourceDshHome, CREDENTIALS_FILENAME), 'main checkout private DSH credentials'),
  ])
  const provider = validateProviderConfiguration(providerValue)
  const ids = profileEntryIds(await readRequiredJson(
    resolve(repositoryRoot, 'config/settings-entry-ids.json'),
    'settings entry IDs',
  ))
  const bundleConfigs = bundleEntryConfigs(
    await readProfilePatch(resolve(repositoryRoot, PROFILE_PATCH_FILENAME)),
    ids,
  )
  const imageReader = await validateTrackedImageReaderConfiguration(imageReaderValue)
  const profileName = context.baseline?.profile?.name
  if (typeof profileName !== 'string' || profileName.length === 0 || profileName.includes('/') || profileName.includes('\\')) {
    throw new TypeError('Desktop baseline profile.name must be a simple non-empty directory name')
  }
  const privateImageReader = await readPrivateImageReaderSource(
    privateSourceDshHome,
    profileName,
    ids.imageReader,
    imageReader.configuration,
    imageReader.credentialProfileIds,
  )
  const providerCredentials = validatePrivateCredentials(privateCredentialsValue, provider.credentialRefs)

  const targetSettingsPath = resolve(context.dshHome, SETTINGS_FILENAME)
  const importedSettingsPath = resolve(context.dshHome, IMPORTED_SETTINGS_FILENAME)
  const targetCredentialsPath = resolve(context.dshHome, CREDENTIALS_FILENAME)
  const readAndMergeTargets = async () => {
    const legacyDocumentExists = await exists(targetSettingsPath)
    if (legacyDocumentExists && !(await lstat(targetSettingsPath)).isFile()) {
      throw new Error('Desktop development settings.yaml must be a regular file')
    }
    if (legacyDocumentExists && await exists(importedSettingsPath)) {
      throw new Error('Desktop development settings.yaml and settings.yaml.imported both exist; resolve the archive collision before startup')
    }
    const [targetSettingsValue, targetCredentialsValue] = await Promise.all([
      readOptionalYaml(targetSettingsPath, 'worktree DSH settings'),
      readOptionalYaml(targetCredentialsPath, 'worktree DSH credentials'),
    ])
    const settings = mergeTargetSettings(
      targetSettingsValue,
      provider.namespaces,
      privateImageReader.configuration,
      privateImageReader.credentials,
    )
    if (settings.olderImageReader !== undefined && targetSettingsValue?.[IMAGE_READER_NAMESPACE] === undefined) {
      const { migrateLegacyImageReaderSettings } = await loadImageReaderSettings()
      settings.imageReader = migrateLegacyImageReaderSettings(settings.olderImageReader)
    }
    if (settings.source !== undefined) {
      const { validateSourceSettingsSection } = await import('../../src/source-settings.ts')
      validateSourceSettingsSection(settings.source)
    }
    if (settings.imageReader !== undefined) {
      const { validateImageReaderSettingsSection } = await loadImageReaderSettings()
      validateImageReaderSettingsSection(settings.imageReader)
    }
    for (const namespace of PROVIDER_NAMESPACES) {
      assertRecord(settings.providers[namespace], `worktree Provider namespace ${namespace}`)
    }
    return {
      legacyDocumentExists,
      credentials: mergeTargetCredentials(
        targetCredentialsValue,
        providerCredentials.version,
        providerCredentials.managedRefs,
      ),
      settings,
    }
  }
  await readAndMergeTargets()
  const evidence = {
    credentialRefCount: provider.credentialRefs.length,
    imageProfileCount: imageReader.configuration.profiles.length,
    providerNamespaces: [...PROVIDER_NAMESPACES],
  }
  return {
    ...evidence,
    materialize: async profileDirectory => {
      if (typeof profileDirectory !== 'string' || profileDirectory.length === 0) {
        throw new TypeError('Desktop profile directory must be a non-empty path')
      }
      const resolvedProfileDirectory = resolve(profileDirectory)
      const expectedParent = resolve(context.dshHome, 'profiles')
      const fromParent = relative(expectedParent, resolvedProfileDirectory)
      if (fromParent === '' || fromParent === '..' || fromParent.startsWith(`..${sep}`) || isAbsolute(fromParent)) {
        throw new TypeError('Desktop profile directory must be inside the development DSH home profiles directory')
      }
      const target = await readAndMergeTargets()
      const patchPath = resolve(resolvedProfileDirectory, PROFILE_PATCH_FILENAME)
      const patchValue = await readProfilePatch(patchPath)
      const patch = mergeProfilePatch(patchValue, target.settings.legacy, target.settings, ids, bundleConfigs)
      const remaining = remainingLegacySettings(target.settings.legacy)
      const migratedSectionCount = Object.keys(target.settings.legacy).length - Object.keys(remaining).length
      await mkdir(dirname(targetSettingsPath), { recursive: true, mode: 0o700 })
      await writePrivateYamlAtomically(patchPath, patch, loadProfileYamlSchema())
      await writePrivateYamlAtomically(targetCredentialsPath, target.credentials)
      if (target.legacyDocumentExists && migratedSectionCount > 0 && Object.keys(remaining).length === 0) {
        try {
          await link(targetSettingsPath, importedSettingsPath)
        } catch (error) {
          if (error?.code === 'EEXIST') {
            throw new Error('Desktop development settings.yaml.imported already exists; resolve the archive collision before startup')
          }
          throw error
        }
        await rm(targetSettingsPath)
      } else if (migratedSectionCount > 0) {
        await writePrivateYamlAtomically(targetSettingsPath, remaining)
      }
      return evidence
    },
  }
}

export async function materializeDesktopDevelopmentSettings(input, profileDirectory) {
  const prepared = await prepareDesktopDevelopmentSettings(input)
  return prepared.materialize(profileDirectory)
}

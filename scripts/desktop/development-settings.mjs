import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

const requireFromModule = createRequire(import.meta.url)
let dshYaml
let imageReaderSettingsPromise

function loadDshYaml() {
  if (dshYaml === undefined) {
    const requireFromDsh = createRequire(requireFromModule.resolve('@deepseek-ai/dsh/package.json'))
    dshYaml = requireFromDsh('js-yaml')
  }
  return dshYaml
}

async function loadImageReaderSettings() {
  imageReaderSettingsPromise ??= import('../../src/image-reader/settings.ts')
  return imageReaderSettingsPromise
}

const SETTINGS_FILENAME = 'settings.yaml'
const CREDENTIALS_FILENAME = '.credentials.yaml'
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
  } catch (error) {
    throw new Error(`${label} is not valid DSH YAML: ${path}`, { cause: error })
  }
}

async function readOptionalYaml(path, label) {
  try {
    return loadDshYaml().load(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw new Error(`${label} is not valid DSH YAML: ${path}`, { cause: error })
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
  return {
    ...target,
    ...namespaces,
    [IMAGE_READER_NAMESPACE]: {
      configuration: imageConfiguration,
      credentials: imageCredentials,
    },
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
      ...refs,
      ...managedRefs,
    },
  }
}

async function writePrivateYamlAtomically(path, value) {
  const temporaryPath = `${path}.${randomUUID()}.next`
  try {
    await writeFile(temporaryPath, loadDshYaml().dump(value, {
      lineWidth: -1,
      noCompatMode: true,
      noRefs: true,
    }), {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
    await rename(temporaryPath, path)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
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

  const [providerValue, imageReaderValue, privateSettingsValue, privateCredentialsValue] = await Promise.all([
    readRequiredJson(providerConfigurationPath, 'development Provider configuration'),
    readRequiredJson(imageReaderConfigurationPath, 'image reader configuration'),
    readRequiredYaml(resolve(privateSourceDshHome, SETTINGS_FILENAME), 'main checkout private DSH settings'),
    readRequiredYaml(resolve(privateSourceDshHome, CREDENTIALS_FILENAME), 'main checkout private DSH credentials'),
  ])
  const provider = validateProviderConfiguration(providerValue)
  const imageReader = await validateTrackedImageReaderConfiguration(imageReaderValue)
  const imageCredentials = await validatePrivateSettings(
    privateSettingsValue,
    imageReader.configuration,
    imageReader.credentialProfileIds,
  )
  const providerCredentials = validatePrivateCredentials(privateCredentialsValue, provider.credentialRefs)

  const targetSettingsPath = resolve(context.dshHome, SETTINGS_FILENAME)
  const targetCredentialsPath = resolve(context.dshHome, CREDENTIALS_FILENAME)
  const readAndMergeTargets = async () => {
    const [targetSettingsValue, targetCredentialsValue] = await Promise.all([
      readOptionalYaml(targetSettingsPath, 'worktree DSH settings'),
      readOptionalYaml(targetCredentialsPath, 'worktree DSH credentials'),
    ])
    return {
      credentials: mergeTargetCredentials(
        targetCredentialsValue,
        providerCredentials.version,
        providerCredentials.managedRefs,
      ),
      settings: mergeTargetSettings(
        targetSettingsValue,
        provider.namespaces,
        imageReader.configuration,
        imageCredentials,
      ),
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
    materialize: async () => {
      const target = await readAndMergeTargets()
      await mkdir(dirname(targetSettingsPath), { recursive: true, mode: 0o700 })
      await writePrivateYamlAtomically(targetSettingsPath, target.settings)
      await writePrivateYamlAtomically(targetCredentialsPath, target.credentials)
      return evidence
    },
  }
}

export async function materializeDesktopDevelopmentSettings(input) {
  const prepared = await prepareDesktopDevelopmentSettings(input)
  return prepared.materialize()
}

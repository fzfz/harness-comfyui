import { isIP } from 'node:net'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export const SOURCE_CONTRACT_ID = 'imagegen-source-contract'
export const SOURCE_CONTRACT_VERSION = 1
export const CONFIGURATION_PROFILES = Object.freeze(['development', 'test', 'release-smoke', 'production'])

const INSTALLATION_KEYS = [
  'schemaVersion', 'installationId', 'root', 'configurationProfile', 'host', 'port',
  'paths', 'comfyui', 'source', 'client', 'process',
]
const PATH_KEYS = ['dataDir', 'runRepositoryFile', 'runDirectory', 'savedMediaDirectory', 'logDirectory']
const COMFYUI_KEYS = ['defaultInstanceId']
const SOURCE_KEYS = ['catalogCliPath', 'sourceCliPath', 'contractId', 'supportedContractVersions']
const CLIENT_KEYS = ['runRefreshIntervalMs']
const PROCESS_KEYS = ['shutdownTimeoutMs']

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireRecord(value, name) {
  if (!isRecord(value)) throw new TypeError(`${name} must be an object`)
  return value
}

function assertExactKeys(value, keys, name) {
  const expected = new Set(keys)
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) throw new TypeError(`${name}.${key} is an unknown field`)
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) throw new TypeError(`${name}.${key} is required`)
  }
}

function requireString(value, name) {
  if (typeof value !== 'string' || value.length === 0 || value.trim().length === 0 || value.includes('\0')) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
  return value
}

function requireAbsolutePath(value, name) {
  const path = requireString(value, name)
  if (!isAbsolute(path)) throw new TypeError(`${name} must be an absolute path`)
  return resolve(path)
}

function requirePositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`)
  return value
}

function validateHost(value) {
  const host = requireString(value, 'host')
  const hostname = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u
  if (isIP(host) === 0 && !hostname.test(host)) throw new TypeError('host must be a valid IP address or hostname')
  return host
}

function validatePort(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 65535) {
    throw new TypeError('port must be an integer between 1 and 65535')
  }
  return value
}

function requirePathInside(path, root, name) {
  const pathFromRoot = relative(root, path)
  if (pathFromRoot === '' || pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
    throw new TypeError(`${name} must be inside paths.dataDir`)
  }
  return path
}

export function validateInstallation(input) {
  const installation = requireRecord(input, 'installation')
  assertExactKeys(installation, INSTALLATION_KEYS, 'installation')
  if (installation.schemaVersion !== 1) throw new TypeError('installation.schemaVersion must be 1')

  const installationId = requireString(installation.installationId, 'installation.installationId')
  const root = requireAbsolutePath(installation.root, 'installation.root')
  const configurationProfile = requireString(installation.configurationProfile, 'installation.configurationProfile')
  if (!CONFIGURATION_PROFILES.includes(configurationProfile)) {
    throw new TypeError(`installation.configurationProfile must be one of ${CONFIGURATION_PROFILES.join(', ')}`)
  }

  const host = validateHost(installation.host)
  const port = validatePort(installation.port)

  const paths = requireRecord(installation.paths, 'installation.paths')
  assertExactKeys(paths, PATH_KEYS, 'installation.paths')
  const normalizedPaths = Object.fromEntries(PATH_KEYS.map(key => [key, requireAbsolutePath(paths[key], `installation.paths.${key}`)]))
  const expectedPaths = {
    dataDir: resolve(root, 'shared/data'),
    runDirectory: resolve(root, 'shared/runs'),
    savedMediaDirectory: resolve(root, 'shared/saved-media'),
    logDirectory: resolve(root, 'shared/logs'),
  }
  for (const [key, expected] of Object.entries(expectedPaths)) {
    if (normalizedPaths[key] !== expected) throw new TypeError(`installation.paths.${key} must equal ${expected}`)
  }
  requirePathInside(normalizedPaths.runRepositoryFile, normalizedPaths.dataDir, 'installation.paths.runRepositoryFile')

  const comfyui = requireRecord(installation.comfyui, 'installation.comfyui')
  assertExactKeys(comfyui, COMFYUI_KEYS, 'installation.comfyui')
  const defaultInstanceId = requireString(comfyui.defaultInstanceId, 'installation.comfyui.defaultInstanceId')

  const source = requireRecord(installation.source, 'installation.source')
  assertExactKeys(source, SOURCE_KEYS, 'installation.source')
  const catalogCliPath = requireAbsolutePath(source.catalogCliPath, 'installation.source.catalogCliPath')
  const sourceCliPath = requireAbsolutePath(source.sourceCliPath, 'installation.source.sourceCliPath')
  if (source.contractId !== SOURCE_CONTRACT_ID) {
    throw new TypeError(`installation.source.contractId must be ${SOURCE_CONTRACT_ID}`)
  }
  if (!Array.isArray(source.supportedContractVersions)
    || source.supportedContractVersions.length !== 1
    || source.supportedContractVersions[0] !== SOURCE_CONTRACT_VERSION) {
    throw new TypeError('installation.source.supportedContractVersions must contain only 1')
  }

  const client = requireRecord(installation.client, 'installation.client')
  assertExactKeys(client, CLIENT_KEYS, 'installation.client')
  const runRefreshIntervalMs = requirePositiveInteger(client.runRefreshIntervalMs, 'installation.client.runRefreshIntervalMs')

  const process = requireRecord(installation.process, 'installation.process')
  assertExactKeys(process, PROCESS_KEYS, 'installation.process')
  const shutdownTimeoutMs = requirePositiveInteger(process.shutdownTimeoutMs, 'installation.process.shutdownTimeoutMs')

  return {
    schemaVersion: 1,
    installationId,
    root,
    configurationProfile,
    host,
    port,
    paths: normalizedPaths,
    comfyui: { defaultInstanceId },
    source: {
      catalogCliPath,
      sourceCliPath,
      contractId: SOURCE_CONTRACT_ID,
      supportedContractVersions: [SOURCE_CONTRACT_VERSION],
    },
    client: { runRefreshIntervalMs },
    process: { shutdownTimeoutMs },
  }
}

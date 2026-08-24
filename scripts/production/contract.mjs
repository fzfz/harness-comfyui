import { isIP } from 'node:net'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export const SOURCE_CONTRACT_ID = 'imagegen-source-contract'
export const SOURCE_RELEASE_VERSION = '0.82.2'

const RUNTIME_KEYS = [
  'schemaVersion', 'runtimeId', 'runtimeRoot', 'configurationProfile', 'host', 'port',
  'paths', 'comfyui', 'source', 'client', 'process',
]
const PATH_KEYS = ['dataDir', 'runRepositoryFile', 'runDirectory', 'savedMediaDirectory', 'logDirectory']

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

function requirePathInside(path, root, name) {
  const pathFromRoot = relative(root, path)
  if (pathFromRoot === '' || pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
    throw new TypeError(`${name} must be inside runtime.paths.dataDir`)
  }
  return path
}

function validateHost(value) {
  const host = requireString(value, 'runtime.host')
  const hostname = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u
  if (isIP(host) === 0 && !hostname.test(host)) throw new TypeError('runtime.host must be a valid IP address or hostname')
  return host
}

function validatePort(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 65535) {
    throw new TypeError('runtime.port must be an integer between 1 and 65535')
  }
  return value
}

export function validateSourceRuntime(input) {
  const runtime = requireRecord(input, 'runtime')
  assertExactKeys(runtime, RUNTIME_KEYS, 'runtime')
  if (runtime.schemaVersion !== 1) throw new TypeError('runtime.schemaVersion must be 1')

  const runtimeId = requireString(runtime.runtimeId, 'runtime.runtimeId')
  const runtimeRoot = requireAbsolutePath(runtime.runtimeRoot, 'runtime.runtimeRoot')
  if (runtime.configurationProfile !== 'production') {
    throw new TypeError('runtime.configurationProfile must be production')
  }
  const paths = requireRecord(runtime.paths, 'runtime.paths')
  assertExactKeys(paths, PATH_KEYS, 'runtime.paths')
  const normalizedPaths = Object.fromEntries(
    PATH_KEYS.map(key => [key, requireAbsolutePath(paths[key], `runtime.paths.${key}`)]),
  )
  const expectedPaths = {
    dataDir: resolve(runtimeRoot, 'shared/data'),
    runDirectory: resolve(runtimeRoot, 'shared/runs'),
    savedMediaDirectory: resolve(runtimeRoot, 'shared/saved-media'),
    logDirectory: resolve(runtimeRoot, 'shared/logs'),
  }
  for (const [key, expected] of Object.entries(expectedPaths)) {
    if (normalizedPaths[key] !== expected) throw new TypeError(`runtime.paths.${key} must equal ${expected}`)
  }
  requirePathInside(normalizedPaths.runRepositoryFile, normalizedPaths.dataDir, 'runtime.paths.runRepositoryFile')

  const comfyui = requireRecord(runtime.comfyui, 'runtime.comfyui')
  assertExactKeys(comfyui, ['defaultInstanceId'], 'runtime.comfyui')
  const source = requireRecord(runtime.source, 'runtime.source')
  assertExactKeys(source, ['catalogPort', 'catalogCliPath', 'sourceCliPath', 'contractId', 'sourceReleaseVersion'], 'runtime.source')
  if (source.contractId !== SOURCE_CONTRACT_ID) {
    throw new TypeError(`runtime.source.contractId must be ${SOURCE_CONTRACT_ID}`)
  }
  if (source.sourceReleaseVersion !== SOURCE_RELEASE_VERSION) {
    throw new TypeError(`runtime.source.sourceReleaseVersion must be ${SOURCE_RELEASE_VERSION}`)
  }
  const client = requireRecord(runtime.client, 'runtime.client')
  assertExactKeys(client, ['runRefreshIntervalMs'], 'runtime.client')
  const process = requireRecord(runtime.process, 'runtime.process')
  assertExactKeys(process, ['shutdownTimeoutMs'], 'runtime.process')

  return {
    schemaVersion: 1,
    runtimeId,
    runtimeRoot,
    configurationProfile: 'production',
    host: validateHost(runtime.host),
    port: validatePort(runtime.port),
    paths: normalizedPaths,
    comfyui: { defaultInstanceId: requireString(comfyui.defaultInstanceId, 'runtime.comfyui.defaultInstanceId') },
    source: {
      catalogPort: validatePort(source.catalogPort),
      catalogCliPath: requireAbsolutePath(source.catalogCliPath, 'runtime.source.catalogCliPath'),
      sourceCliPath: requireAbsolutePath(source.sourceCliPath, 'runtime.source.sourceCliPath'),
      contractId: SOURCE_CONTRACT_ID,
      sourceReleaseVersion: SOURCE_RELEASE_VERSION,
    },
    client: {
      runRefreshIntervalMs: requirePositiveInteger(client.runRefreshIntervalMs, 'runtime.client.runRefreshIntervalMs'),
    },
    process: {
      shutdownTimeoutMs: requirePositiveInteger(process.shutdownTimeoutMs, 'runtime.process.shutdownTimeoutMs'),
    },
  }
}

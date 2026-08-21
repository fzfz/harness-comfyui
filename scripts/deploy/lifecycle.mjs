import { randomUUID } from 'node:crypto'
import { createWriteStream, constants as fsConstants } from 'node:fs'
import {
  access,
  appendFile,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import { dirname, isAbsolute, join, resolve } from 'node:path'

export const PROCESS_STATE_SCHEMA_VERSION = 1
export const OPERATION_SCHEMA_VERSION = 1
const HARNESS_ENVIRONMENT_PREFIX = 'HARNESS_COMFYUI_'

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireRecord(value, name) {
  if (!isRecord(value)) throw new Error(`${name} must be an object`)
  return value
}

function requireNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new Error(`${name} must be a non-empty string`)
  }
  return value
}

function requirePositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`)
  return value
}

async function readJsonFile(path, name) {
  let value
  try {
    value = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new Error(`cannot read ${name}: ${error instanceof Error ? error.message : String(error)}`)
  }
  return requireRecord(value, name)
}

function operationsPath(root) {
  return resolve(root, 'state/operations.jsonl')
}

async function readActiveVersion(root) {
  try {
    const state = JSON.parse(await readFile(resolve(root, 'state/active-release.json'), 'utf8'))
    if (!isRecord(state) || typeof state.activeVersion !== 'string' || state.activeVersion.length === 0) return undefined
    return state.activeVersion
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    return undefined
  }
}

async function appendOperationEvent(event) {
  await mkdir(dirname(event.path), { recursive: true })
  const { path, ...record } = event
  await appendFile(path, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 })
}

export async function beginProductOperation(installation, command) {
  const operationId = randomUUID()
  const startedAt = new Date().toISOString()
  const activeVersion = await readActiveVersion(installation.root)
  const event = {
    path: operationsPath(installation.root),
    schemaVersion: OPERATION_SCHEMA_VERSION,
    operationId,
    command,
    status: 'started',
    startedAt,
    installationId: installation.installationId,
  }
  if (activeVersion !== undefined) event.activeVersion = activeVersion
  await appendOperationEvent(event)
  return { operationId, command, startedAt, installationId: installation.installationId }
}

export async function finishProductOperation(operation, installation, status) {
  const activeVersion = await readActiveVersion(installation.root)
  const event = {
    path: operationsPath(installation.root),
    schemaVersion: OPERATION_SCHEMA_VERSION,
    operationId: operation.operationId,
    command: operation.command,
    status,
    startedAt: operation.startedAt,
    finishedAt: new Date().toISOString(),
    installationId: operation.installationId,
  }
  if (activeVersion !== undefined) event.activeVersion = activeVersion
  await appendOperationEvent(event)
}

async function writeAtomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${randomUUID()}.next`
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    })
    await rename(temporaryPath, path)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

function processStatePath(root) {
  return resolve(root, 'state/process.json')
}

async function readProcessState(path) {
  try {
    await lstat(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
  const state = await readJsonFile(path, 'state/process.json')
  if (state.schemaVersion !== PROCESS_STATE_SCHEMA_VERSION) {
    throw new Error(`state/process.json.schemaVersion must be ${PROCESS_STATE_SCHEMA_VERSION}`)
  }
  requireNonEmptyString(state.installationId, 'state/process.json.installationId')
  requireNonEmptyString(state.activeVersion, 'state/process.json.activeVersion')
  requirePositiveInteger(state.pid, 'state/process.json.pid')
  requireNonEmptyString(state.operationId, 'state/process.json.operationId')
  requireNonEmptyString(state.startedAt, 'state/process.json.startedAt')
  requireNonEmptyString(state.host, 'state/process.json.host')
  requirePositiveInteger(state.port, 'state/process.json.port')
  const processIdentity = requireRecord(state.processIdentity, 'state/process.json.processIdentity')
  requireNonEmptyString(processIdentity.startTime, 'state/process.json.processIdentity.startTime')
  requireNonEmptyString(processIdentity.command, 'state/process.json.processIdentity.command')
  return {
    schemaVersion: PROCESS_STATE_SCHEMA_VERSION,
    installationId: state.installationId,
    activeVersion: state.activeVersion,
    pid: state.pid,
    operationId: state.operationId,
    startedAt: state.startedAt,
    host: state.host,
    port: state.port,
    processIdentity: {
      startTime: processIdentity.startTime,
      command: processIdentity.command,
    },
  }
}

function runExternal(command, args) {
  return new Promise((resolveResult, reject) => {
    let child
    try {
      child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      })
    } catch (error) {
      reject(error)
      return
    }
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.once('error', reject)
    child.once('close', (code, signal) => resolveResult({ code: code ?? 1, signal, stdout, stderr }))
  })
}

async function readPsField(pid, field) {
  if (process.platform === 'win32') {
    throw new Error('process identity is unsupported on Windows')
  }
  const result = await runExternal('ps', ['-p', String(pid), '-o', `${field}=`])
  if (result.code !== 0 || result.stdout.trim().length === 0) return null
  return result.stdout.trim()
}

export async function readProcessIdentity(pid) {
  const [startTime, command] = await Promise.all([
    readPsField(pid, 'lstart'),
    readPsField(pid, 'command'),
  ])
  if (startTime === null || command === null) return null
  return { startTime, command }
}

async function waitForStableProcessIdentity(pid) {
  let previous
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = await readProcessIdentity(pid)
    if (current === null) return null
    if (previous !== undefined && sameProcessIdentity(previous, current)) return current
    previous = current
    await new Promise(resolveResult => setTimeout(resolveResult, 10))
  }
  return previous
}

function sameProcessIdentity(left, right) {
  return left.startTime === right.startTime && left.command === right.command
}

function processIdentityMismatch(state, identity) {
  return `process identity mismatch for PID ${state.pid}: expected ${JSON.stringify(state.processIdentity)}, got ${JSON.stringify(identity)}`
}

async function readActiveRelease(root) {
  const statePath = resolve(root, 'state/active-release.json')
  const state = await readJsonFile(statePath, 'state/active-release.json')
  const activeVersion = requireNonEmptyString(state.activeVersion, 'state/active-release.json.activeVersion')
  const releasePath = requireNonEmptyString(state.releasePath, 'state/active-release.json.releasePath')
  if (!isAbsolute(releasePath)) throw new Error('state/active-release.json.releasePath must be absolute')
  const expectedReleasePath = resolve(root, 'releases', activeVersion)
  if (resolve(releasePath) !== expectedReleasePath) {
    throw new Error('state/active-release.json.releasePath does not match activeVersion')
  }
  const packageCliPath = resolve(releasePath, 'package/scripts/deploy/cli.mjs')
  const dshExecutable = resolve(releasePath, 'harness-runtime/node_modules/.bin/dsh')
  const dshHome = resolve(releasePath, 'dsh-home')
  try {
    await access(packageCliPath, fsConstants.R_OK)
    await access(dshExecutable, fsConstants.X_OK)
    await lstat(dshHome)
  } catch (error) {
    throw new Error(`active release is incomplete: ${error instanceof Error ? error.message : String(error)}`)
  }
  return { activeVersion, releasePath, packageCliPath, dshExecutable, dshHome }
}

function buildHostEnvironment(installation, dshHome) {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith(HARNESS_ENVIRONMENT_PREFIX)),
  )
  return {
    ...environment,
    DSH_HOME: dshHome,
    HARNESS_COMFYUI_CONFIGURATION_PROFILE: installation.configurationProfile,
    HARNESS_COMFYUI_DATA_DIR: installation.paths.dataDir,
    HARNESS_COMFYUI_RUN_REPOSITORY_FILE: installation.paths.runRepositoryFile,
    HARNESS_COMFYUI_RUN_DIRECTORY: installation.paths.runDirectory,
    HARNESS_COMFYUI_SAVED_MEDIA_DIRECTORY: installation.paths.savedMediaDirectory,
    HARNESS_COMFYUI_LOG_DIRECTORY: installation.paths.logDirectory,
    HARNESS_COMFYUI_DEFAULT_INSTANCE_ID: installation.comfyui.defaultInstanceId,
    HARNESS_COMFYUI_CATALOG_CLI_PATH: installation.source.catalogCliPath,
    HARNESS_COMFYUI_SOURCE_CLI_PATH: installation.source.sourceCliPath,
    HARNESS_COMFYUI_CLIENT_RUN_REFRESH_INTERVAL_MS: String(installation.client.runRefreshIntervalMs),
    HARNESS_COMFYUI_SERVER_HOST: installation.host,
    HARNESS_COMFYUI_SERVER_PORT: String(installation.port),
  }
}

function probePort(host, port) {
  return new Promise(resolveResult => {
    const socket = createConnection({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      resolveResult(false)
    }, 250)
    socket.once('connect', () => {
      clearTimeout(timer)
      socket.destroy()
      resolveResult(true)
    })
    socket.once('error', () => {
      clearTimeout(timer)
      resolveResult(false)
    })
  })
}

async function waitForPortClosed(host, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!(await probePort(host, port))) return
    await new Promise(resolveResult => setTimeout(resolveResult, 25))
  }
  throw new Error(`port ${host}:${port} did not become available before shutdown timeout`)
}

async function waitForProcessExit(state, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const identity = await readProcessIdentity(state.pid)
    if (identity === null) return
    const exitedProcess = identity.command.includes('<defunct>') || /^\([^)]*\)$/u.test(identity.command)
    if (exitedProcess && identity.startTime === state.processIdentity.startTime) return
    if (!sameProcessIdentity(state.processIdentity, identity)) {
      throw new Error(processIdentityMismatch(state, identity))
    }
    await new Promise(resolveResult => setTimeout(resolveResult, 25))
  }
  throw new Error(`Host PID ${state.pid} did not exit before shutdown timeout`)
}

async function removeOwnedProcessState(path, state) {
  const current = await readProcessState(path)
  if (current === null) return
  if (current.operationId !== state.operationId || current.pid !== state.pid) return
  await rm(path, { force: true })
}

function assertProcessStateOwnership(state, installation, activeVersion) {
  const expected = {
    installationId: installation.installationId,
    activeVersion,
    host: installation.host,
    port: installation.port,
  }
  for (const [field, value] of Object.entries(expected)) {
    if (state[field] !== value) {
      throw new Error(`state/process.json.${field} does not match current installation`)
    }
  }
}

async function clearStaleProcessState(path, state) {
  const identity = await readProcessIdentity(state.pid)
  if (identity === null) {
    await rm(path, { force: true })
    return null
  }
  if (!sameProcessIdentity(state.processIdentity, identity)) {
    throw new Error(processIdentityMismatch(state, identity))
  }
  return identity
}

async function assertNoRunningHost(path, installation, activeVersion) {
  const state = await readProcessState(path)
  if (state === null) return
  assertProcessStateOwnership(state, installation, activeVersion)
  const identity = await clearStaleProcessState(path, state)
  if (identity !== null) throw new Error(`Host is already running with PID ${state.pid}`)
}

function statusView(installation, activeVersion, state, status) {
  return {
    installationId: installation.installationId,
    activeVersion,
    pid: state?.pid ?? null,
    startedAt: state?.startedAt ?? null,
    host: installation.host,
    port: installation.port,
    status,
  }
}

export function redactSensitiveLine(line) {
  let redacted = line
  redacted = redacted.replace(
    /(authorization\s*(?::|=)\s*(?:(?:bearer|basic|token)\s+)?)("[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/giu,
    '$1[REDACTED]',
  )
  redacted = redacted.replace(
    /((?:credential|secret|token|password)\s*(?:=|:)\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/giu,
    '$1[REDACTED]',
  )
  redacted = redacted.replace(
    /(HARNESS_COMFYUI_[A-Z0-9_]*\s*=\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gu,
    '$1[REDACTED]',
  )
  return redacted
}

function attachRedactedOutput(logPath, output, destination) {
  const log = createWriteStream(logPath, { flags: 'a' })
  let pending = ''
  let closed = false

  const emit = line => {
    const redacted = redactSensitiveLine(line)
    log.write(redacted)
    destination.write(redacted)
  }
  const append = chunk => {
    if (closed) return
    pending += String(chunk)
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) emit(`${line}\n`)
  }
  const flush = () => {
    if (pending.length > 0) {
      emit(pending)
      pending = ''
    }
  }
  output?.on('data', append)
  return {
    close: () => {
      if (closed) return Promise.resolve()
      closed = true
      flush()
      return new Promise(resolveResult => log.end(resolveResult))
    },
  }
}

function attachHostOutput(logPath, output) {
  return attachRedactedOutput(logPath, output, process.stdout)
}

function attachHostErrorOutput(child, logPath) {
  return attachRedactedOutput(logPath, child.stderr, process.stderr)
}

function forwardSignal(child, signal) {
  if (child.pid === undefined) return
  try {
    child.kill(signal)
  } catch {
    // The child may have exited between the signal and close events.
  }
}

function waitForChildClose(child) {
  if (child.exitCode !== null) return Promise.resolve()
  return new Promise(resolveResult => child.once('close', resolveResult))
}

export {
  assertNoRunningHost,
  assertProcessStateOwnership,
  attachHostErrorOutput,
  attachHostOutput,
  buildHostEnvironment,
  clearStaleProcessState,
  forwardSignal,
  processStatePath,
  processIdentityMismatch,
  probePort,
  operationsPath,
  readActiveRelease,
  readProcessState,
  removeOwnedProcessState,
  sameProcessIdentity,
  statusView,
  waitForChildClose,
  waitForPortClosed,
  waitForProcessExit,
  waitForStableProcessIdentity,
  writeAtomicJson,
}

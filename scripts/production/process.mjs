import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import {
  appendFile,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createConnection, createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'

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

async function appendOperationEvent(event) {
  await mkdir(dirname(event.path), { recursive: true })
  const { path, ...record } = event
  await appendFile(path, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 })
}

export async function beginSourceOperation(runtime, command, activeVersion) {
  const operationId = randomUUID()
  const startedAt = new Date().toISOString()
  const baseEvent = {
    path: operationsPath(runtime.runtimeRoot),
    schemaVersion: OPERATION_SCHEMA_VERSION,
    operationId,
    command,
    startedAt,
    runtimeId: runtime.runtimeId,
  }
  await appendOperationEvent({ ...baseEvent, activeVersion, status: 'started' })
  return { operationId, command, startedAt, runtimeId: runtime.runtimeId }
}

export async function finishSourceOperation(operation, runtime, status, activeVersion) {
  const event = {
    path: operationsPath(runtime.runtimeRoot),
    schemaVersion: OPERATION_SCHEMA_VERSION,
    operationId: operation.operationId,
    command: operation.command,
    status,
    startedAt: operation.startedAt,
    finishedAt: new Date().toISOString(),
    runtimeId: operation.runtimeId,
  }
  event.activeVersion = activeVersion
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
  const runtimeId = requireNonEmptyString(state.runtimeId, 'state/process.json.runtimeId')
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
    runtimeId,
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
  const [startTime, command, processState] = await Promise.all([
    readPsField(pid, 'lstart'),
    readPsField(pid, 'command'),
    readPsField(pid, 'stat'),
  ])
  if (startTime === null || command === null) return null
  return { startTime, command, processState }
}

function isTransientDshLauncherCommand(command) {
  return /^(?:\/bin\/sh|\/usr\/bin\/env node) .*\/node_modules\/\.bin\/dsh(?:\s|$)/u.test(command)
}

async function waitForStableProcessIdentity(pid, timeoutMs = 2_500) {
  let previous
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const current = await readProcessIdentity(pid)
    if (current === null) return null
    if (previous !== undefined && sameProcessIdentity(previous, current)) {
      if (!isTransientDshLauncherCommand(current.command)) return current
    }
    previous = current
    await new Promise(resolveResult => setTimeout(resolveResult, 10))
  }
  return previous
}

function sameProcessIdentity(left, right) {
  return left.startTime === right.startTime && left.command === right.command
}

function isExitedProcessIdentity(expected, observed) {
  if (observed?.startTime !== expected.startTime) return false
  const zombieState = observed.processState?.startsWith('Z') === true
  const zombieCommand = observed.command.includes('<defunct>') || /^\([^)]*\)$/u.test(observed.command)
  return zombieState || zombieCommand
}

function isTransientNodeProcessCommand(command) {
  return command === '[node]'
}

function processIdentityMismatch(state, identity) {
  return `process identity mismatch for PID ${state.pid}: expected ${JSON.stringify(state.processIdentity)}, got ${JSON.stringify(identity)}`
}

async function buildHostEnvironment(runtime, runtimeTarget) {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith(HARNESS_ENVIRONMENT_PREFIX)),
  )
  return {
    ...environment,
    DSH_HOME: runtimeTarget.dshHome,
    HARNESS_COMFYUI_CONFIGURATION_PROFILE: runtime.configurationProfile,
    HARNESS_COMFYUI_DATA_DIR: runtime.paths.dataDir,
    HARNESS_COMFYUI_RUN_REPOSITORY_FILE: runtime.paths.runRepositoryFile,
    HARNESS_COMFYUI_RUN_DIRECTORY: runtime.paths.runDirectory,
    HARNESS_COMFYUI_SAVED_MEDIA_DIRECTORY: runtime.paths.savedMediaDirectory,
    HARNESS_COMFYUI_LOG_DIRECTORY: runtime.paths.logDirectory,
    HARNESS_COMFYUI_DEFAULT_INSTANCE_ID: runtime.comfyui.defaultInstanceId,
    HARNESS_COMFYUI_CATALOG_CLI_PATH: runtime.source.catalogCliPath,
    HARNESS_COMFYUI_CATALOG_PORT: String(runtime.source.catalogPort),
    HARNESS_COMFYUI_SOURCE_CLI_PATH: runtime.source.sourceCliPath,
    HARNESS_COMFYUI_CLIENT_RUN_REFRESH_INTERVAL_MS: String(runtime.client.runRefreshIntervalMs),
    HARNESS_COMFYUI_SERVER_HOST: runtime.host,
    HARNESS_COMFYUI_SERVER_PORT: String(runtime.port),
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

async function readListeningPortProcessIds(host, port) {
  if (process.platform === 'win32') {
    throw new Error('port ownership is unsupported on Windows')
  }
  const address = host.includes(':') ? `[${host}]` : host
  let result
  try {
    result = await runExternal('lsof', [
      '-nP',
      '-a',
      `-iTCP@${address}:${port}`,
      '-sTCP:LISTEN',
      '-Fp',
    ])
  } catch (error) {
    throw new Error(`cannot inspect port ownership: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (result.code !== 0 && !(result.code === 1 && result.stderr.trim().length === 0)) {
    throw new Error(`cannot inspect port ownership: lsof exited with code ${result.code}`)
  }
  return result.stdout
    .split('\n')
    .filter(line => line.startsWith('p'))
    .map(line => Number(line.slice(1)))
    .filter(pid => Number.isSafeInteger(pid) && pid > 0)
}

async function probePortOwnedByProcess(host, port, pid) {
  const processIds = await readListeningPortProcessIds(host, port)
  return processIds.includes(pid)
}

function waitForDelay(milliseconds) {
  return new Promise(resolveResult => setTimeout(resolveResult, milliseconds))
}

async function waitForPortClosed(host, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!(await probePort(host, port)) && await probePortAvailable(host, port)) {
      // Keep the port-release check stable across the close callback and the
      // next event-loop turn before a foreground Host attempts to bind it.
      await waitForDelay(Math.min(25, Math.max(1, deadline - Date.now())))
      if (!(await probePort(host, port)) && await probePortAvailable(host, port)) return
    }
    await new Promise(resolveResult => setTimeout(resolveResult, 25))
  }
  throw new Error(`port ${host}:${port} did not become available before shutdown timeout`)
}

function probePortAvailable(host, port) {
  return new Promise(resolveResult => {
    const server = createServer()
    let settled = false
    const finish = value => {
      if (settled) return
      settled = true
      resolveResult(value)
    }
    server.once('error', () => finish(false))
    server.listen({ host, port }, () => {
      server.close(() => finish(true))
    })
  })
}

async function waitForStopIdentityResolution(state, initialIdentity, deadline) {
  let identity = initialIdentity
  while (true) {
    if (identity === null || isExitedProcessIdentity(state.processIdentity, identity)) return null
    if (sameProcessIdentity(state.processIdentity, identity)) return identity
    if (
      identity.startTime !== state.processIdentity.startTime
      || !isTransientNodeProcessCommand(identity.command)
    ) {
      throw new Error(processIdentityMismatch(state, identity))
    }
    if (Date.now() >= deadline) throw new Error(processIdentityMismatch(state, identity))
    await new Promise(resolveResult => setTimeout(resolveResult, 25))
    identity = await readProcessIdentity(state.pid)
  }
}

async function waitForProcessExit(state, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    let identity = await readProcessIdentity(state.pid)
    if (identity === null) return
    if (isExitedProcessIdentity(state.processIdentity, identity)) return
    if (!sameProcessIdentity(state.processIdentity, identity)) {
      identity = await waitForStopIdentityResolution(state, identity, deadline)
      if (identity === null || isExitedProcessIdentity(state.processIdentity, identity)) return
      if (!sameProcessIdentity(state.processIdentity, identity)) {
        throw new Error(processIdentityMismatch(state, identity))
      }
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

function assertProcessStateOwnership(state, runtime, activeVersion) {
  const expected = {
    runtimeId: runtime.runtimeId,
    activeVersion,
    host: runtime.host,
    port: runtime.port,
  }
  for (const [field, value] of Object.entries(expected)) {
    if (state[field] !== value) {
      throw new Error(`state/process.json.${field} does not match current runtime`)
    }
  }
}

async function clearStaleProcessState(path, state) {
  const identity = await readProcessIdentity(state.pid)
  if (identity === null) {
    await rm(path, { force: true })
    return null
  }
  if (isExitedProcessIdentity(state.processIdentity, identity)) {
    await rm(path, { force: true })
    return null
  }
  if (!sameProcessIdentity(state.processIdentity, identity)) {
    throw new Error(processIdentityMismatch(state, identity))
  }
  return identity
}

async function assertNoRunningHost(path, runtime, activeVersion) {
  const state = await readProcessState(path)
  if (state === null) return
  assertProcessStateOwnership(state, runtime, activeVersion)
  const identity = await clearStaleProcessState(path, state)
  if (identity !== null) throw new Error(`Host is already running with PID ${state.pid}`)
}

function statusView(runtime, activeVersion, state, status) {
  return {
    runtimeId: runtime.runtimeId,
    activeVersion,
    pid: state?.pid ?? null,
    startedAt: state?.startedAt ?? null,
    host: runtime.host,
    port: runtime.port,
    status,
  }
}

export function redactSensitiveLine(line) {
  let redacted = line
  const replaceSensitiveValue = (_match, prefix, _keyQuote, sensitiveValue) => {
    const quote = sensitiveValue[0] === sensitiveValue.at(-1) && (sensitiveValue[0] === '"' || sensitiveValue[0] === "'") ? sensitiveValue[0] : ''
    return `${prefix}${quote}[REDACTED]${quote}`
  }
  const replaceEnvironmentValue = (_match, prefix, sensitiveValue) => {
    const quote = sensitiveValue[0] === sensitiveValue.at(-1) && (sensitiveValue[0] === '"' || sensitiveValue[0] === "'") ? sensitiveValue[0] : ''
    return `${prefix}${quote}[REDACTED]${quote}`
  }
  redacted = redacted.replace(
    /((['"]?)authorization\2\s*(?::|=)\s*(?:(?:bearer|basic|token)\s+)?)("[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}\]]+)/giu,
    replaceSensitiveValue,
  )
  redacted = redacted.replace(
    /((['"]?)(?:credential|secret|token|password)\2\s*(?:=|:)\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}\]]+)/giu,
    replaceSensitiveValue,
  )
  redacted = redacted.replace(
    /(HARNESS_COMFYUI_[A-Z0-9_]*\s*=\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}\]]+)/gu,
    replaceEnvironmentValue,
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
  isExitedProcessIdentity,
  processStatePath,
  processIdentityMismatch,
  probePort,
  probePortOwnedByProcess,
  operationsPath,
  readProcessState,
  removeOwnedProcessState,
  sameProcessIdentity,
  statusView,
  waitForChildClose,
  waitForPortClosed,
  waitForProcessExit,
  waitForStopIdentityResolution,
  waitForStableProcessIdentity,
  writeAtomicJson,
}

import { randomUUID } from 'node:crypto'
import { createWriteStream, constants as fsConstants } from 'node:fs'
import {
  access,
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

import { spawnForeground } from '../profile/start.mjs'
import { validateInstallation } from './contracts.mjs'

const PROCESS_STATE_SCHEMA_VERSION = 1
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
  return left.startTime === right.startTime
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

export function buildHostEnvironment(installation, dshHome) {
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
    if (identity.command.includes('<defunct>') && identity.startTime === state.processIdentity.startTime) return
    if (!sameProcessIdentity(state.processIdentity, identity)) {
      throw new Error(`process identity mismatch for PID ${state.pid}`)
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

async function clearStaleProcessState(path, state) {
  const identity = await readProcessIdentity(state.pid)
  if (identity === null) {
    await rm(path, { force: true })
    return null
  }
  if (!sameProcessIdentity(state.processIdentity, identity)) {
    throw new Error(`process identity mismatch for PID ${state.pid}`)
  }
  return identity
}

async function assertNoRunningHost(path) {
  const state = await readProcessState(path)
  if (state === null) return
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

function attachHostOutput(logPath, output) {
  const log = createWriteStream(logPath, { flags: 'a' })
  output?.on('data', chunk => {
    log.write(chunk)
    process.stdout.write(chunk)
  })
  return log
}

function attachHostErrorOutput(child, logPath) {
  const log = createWriteStream(logPath, { flags: 'a' })
  child.stderr?.on('data', chunk => {
    log.write(chunk)
    process.stderr.write(chunk)
  })
  return log
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

export async function runProductStart(input) {
  const installation = validateInstallation(input)
  const active = await readActiveRelease(installation.root)
  const statePath = processStatePath(installation.root)
  await assertNoRunningHost(statePath)
  if (await probePort(installation.host, installation.port)) {
    throw new Error(`Host is already running on ${installation.host}:${installation.port}`)
  }
  await mkdir(installation.paths.logDirectory, { recursive: true })

  const environment = buildHostEnvironment(installation, active.dshHome)
  const child = spawnForeground({
    dshExecutable: active.dshExecutable,
    dshHome: active.dshHome,
    configuration: installation.configurationProfile,
    host: installation.host,
    port: String(installation.port),
    cwd: resolve(active.releasePath, 'package'),
    environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (child.pid === undefined) throw new Error('Host process did not provide a PID')
  let forwardedSignal
  const onSigInt = () => {
    if (forwardedSignal === undefined) forwardedSignal = 'SIGINT'
    forwardSignal(child, 'SIGINT')
  }
  const onSigTerm = () => {
    if (forwardedSignal === undefined) forwardedSignal = 'SIGTERM'
    forwardSignal(child, 'SIGTERM')
  }
  process.once('SIGINT', onSigInt)
  process.once('SIGTERM', onSigTerm)
  let processIdentity
  try {
    processIdentity = await waitForStableProcessIdentity(child.pid)
    if (processIdentity === null) throw new Error(`cannot determine process identity for Host PID ${child.pid}`)
  } catch (error) {
    process.removeListener('SIGINT', onSigInt)
    process.removeListener('SIGTERM', onSigTerm)
    if (child.exitCode === null) {
      forwardSignal(child, 'SIGTERM')
      await waitForChildClose(child)
    }
    throw error
  }
  const state = {
    schemaVersion: PROCESS_STATE_SCHEMA_VERSION,
    installationId: installation.installationId,
    activeVersion: active.activeVersion,
    pid: child.pid,
    operationId: randomUUID(),
    startedAt: new Date().toISOString(),
    host: installation.host,
    port: installation.port,
    processIdentity,
  }
  let stateWritten = false
  const stdoutLog = attachHostOutput(join(installation.paths.logDirectory, 'host.stdout.log'), child.stdout)
  const stderrLog = attachHostErrorOutput(child, join(installation.paths.logDirectory, 'host.stderr.log'))
  try {
    await writeAtomicJson(statePath, state)
    stateWritten = true
    const exit = child.exitCode !== null
      ? { code: child.exitCode, signal: child.signalCode }
      : await new Promise(resolveResult => {
        child.once('close', (code, signal) => resolveResult({ code: code ?? 1, signal }))
        child.once('error', error => resolveResult({ code: 1, signal: null, error }))
      })
    stdoutLog.end()
    stderrLog.end()
    if (exit.error !== undefined) throw exit.error
    if (exit.code !== 0) {
      throw new Error(`Host exited with code ${exit.code}${exit.signal ? ` (${exit.signal})` : ''}`)
    }
    await removeOwnedProcessState(statePath, state)
    return {
      stage: 'start',
      status: 'stopped',
      installationId: installation.installationId,
      activeVersion: active.activeVersion,
      pid: state.pid,
      startedAt: state.startedAt,
      host: installation.host,
      port: installation.port,
      operationId: state.operationId,
      signal: forwardedSignal,
    }
  } catch (error) {
    if (child.exitCode === null) {
      forwardSignal(child, 'SIGTERM')
      await waitForChildClose(child)
    }
    if (stateWritten) await removeOwnedProcessState(statePath, state)
    throw error
  } finally {
    process.removeListener('SIGINT', onSigInt)
    process.removeListener('SIGTERM', onSigTerm)
  }
}

export async function runProductStop(input) {
  const installation = validateInstallation(input)
  const active = await readActiveRelease(installation.root)
  const statePath = processStatePath(installation.root)
  const state = await readProcessState(statePath)
  if (state === null) {
    return { stage: 'stop', ...statusView(installation, active.activeVersion, null, 'stopped') }
  }
  const identity = await readProcessIdentity(state.pid)
  if (identity === null) {
    await rm(statePath, { force: true })
    await waitForPortClosed(installation.host, installation.port, installation.process.shutdownTimeoutMs)
    return { stage: 'stop', ...statusView(installation, active.activeVersion, null, 'stopped') }
  }
  if (!sameProcessIdentity(state.processIdentity, identity)) {
    throw new Error(`process identity mismatch for PID ${state.pid}`)
  }
  try {
    process.kill(state.pid, 'SIGTERM')
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
  await waitForProcessExit(state, installation.process.shutdownTimeoutMs)
  await waitForPortClosed(installation.host, installation.port, installation.process.shutdownTimeoutMs)
  await removeOwnedProcessState(statePath, state)
  return { stage: 'stop', ...statusView(installation, active.activeVersion, null, 'stopped') }
}

export async function runProductStatus(input) {
  const installation = validateInstallation(input)
  const active = await readActiveRelease(installation.root)
  const statePath = processStatePath(installation.root)
  const state = await readProcessState(statePath)
  if (state === null) {
    const portOccupied = await probePort(installation.host, installation.port)
    return statusView(installation, active.activeVersion, null, portOccupied ? 'unhealthy' : 'stopped')
  }
  const identity = await clearStaleProcessState(statePath, state)
  if (identity === null) {
    const portOccupied = await probePort(installation.host, installation.port)
    return statusView(installation, active.activeVersion, null, portOccupied ? 'unhealthy' : 'stopped')
  }
  const portReady = await probePort(installation.host, installation.port)
  return statusView(installation, active.activeVersion, state, portReady ? 'running' : 'starting')
}

export { processStatePath, readActiveRelease, readProcessState, writeAtomicJson }

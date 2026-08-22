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
import { createConnection, createServer } from 'node:net'
import { dirname, isAbsolute, join, resolve } from 'node:path'

import { readProductAgentConfig, validateProductAgentRelease } from './preflight.mjs'

export const PROCESS_STATE_SCHEMA_VERSION = 1
export const OPERATION_SCHEMA_VERSION = 1
export const ACTIVE_RELEASE_STATE_SCHEMA_VERSION = 1
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

function requireReleaseVersion(value, name) {
  const version = requireNonEmptyString(value, name)
  if (version === '.' || version === '..' || version.includes('/') || version.includes('\\')) {
    throw new Error(`${name} must be a release directory name`)
  }
  return version
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

function validateReleaseDescription(value, root, name, { allowNull = false } = {}) {
  if (allowNull && value === null) return null
  const description = requireRecord(value, name)
  const keys = Object.keys(description).sort()
  if (JSON.stringify(keys) !== JSON.stringify(['activeVersion', 'releasePath'])) {
    throw new Error(`${name} must contain only activeVersion and releasePath`)
  }
  const activeVersion = requireReleaseVersion(description.activeVersion, `${name}.activeVersion`)
  const releasePath = requireNonEmptyString(description.releasePath, `${name}.releasePath`)
  if (!isAbsolute(releasePath)) throw new Error(`${name}.releasePath must be absolute`)
  const expectedReleasePath = resolve(root, 'releases', activeVersion)
  if (resolve(releasePath) !== expectedReleasePath) {
    throw new Error(`${name}.releasePath does not match activeVersion`)
  }
  return { activeVersion, releasePath: resolve(releasePath) }
}

function validateActiveReleaseState(value, root) {
  const state = requireRecord(value, 'state/active-release.json')
  const expectedKeys = ['activeVersion', 'installationId', 'previousRelease', 'releasePath', 'schemaVersion']
  const keys = Object.keys(state).sort()
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    throw new Error('state/active-release.json has an invalid schema')
  }
  if (state.schemaVersion !== ACTIVE_RELEASE_STATE_SCHEMA_VERSION) {
    throw new Error(`state/active-release.json.schemaVersion must be ${ACTIVE_RELEASE_STATE_SCHEMA_VERSION}`)
  }
  const installationId = requireNonEmptyString(state.installationId, 'state/active-release.json.installationId')
  const activeVersion = requireReleaseVersion(state.activeVersion, 'state/active-release.json.activeVersion')
  const releasePath = requireNonEmptyString(state.releasePath, 'state/active-release.json.releasePath')
  if (!isAbsolute(releasePath)) throw new Error('state/active-release.json.releasePath must be absolute')
  const expectedReleasePath = resolve(root, 'releases', activeVersion)
  if (resolve(releasePath) !== expectedReleasePath) {
    throw new Error('state/active-release.json.releasePath does not match activeVersion')
  }
  const previousRelease = validateReleaseDescription(state.previousRelease, root, 'state/active-release.json.previousRelease', { allowNull: true })
  if (previousRelease !== null && previousRelease.releasePath === resolve(releasePath)) {
    throw new Error('state/active-release.json.previousRelease must differ from active release')
  }
  return {
    schemaVersion: ACTIVE_RELEASE_STATE_SCHEMA_VERSION,
    installationId,
    activeVersion,
    releasePath: resolve(releasePath),
    previousRelease,
  }
}

export async function readActiveReleaseState(root, expectedInstallationId) {
  requireNonEmptyString(expectedInstallationId, 'expected installationId')
  const path = resolve(root, 'state/active-release.json')
  let value
  try {
    value = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    if (error instanceof SyntaxError) {
      throw new Error(`cannot read state/active-release.json: malformed JSON: ${error.message}`)
    }
    throw new Error(`cannot read state/active-release.json: ${error instanceof Error ? error.message : String(error)}`)
  }
  const state = validateActiveReleaseState(value, resolve(root))
  if (state.installationId !== expectedInstallationId) {
    throw new Error(`state/active-release.json.installationId does not match expected installation ${expectedInstallationId}`)
  }
  return state
}

export async function writeActiveReleaseState(root, state) {
  const normalized = validateActiveReleaseState(state, resolve(root))
  await writeAtomicJson(resolve(root, 'state/active-release.json'), normalized)
  return normalized
}

async function readActiveVersion(root, expectedInstallationId) {
  const state = await readActiveReleaseState(root, expectedInstallationId)
  return state?.activeVersion
}

async function appendOperationEvent(event) {
  await mkdir(dirname(event.path), { recursive: true })
  const { path, ...record } = event
  await appendFile(path, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 })
}

export async function beginProductOperation(installation, command) {
  const operationId = randomUUID()
  const startedAt = new Date().toISOString()
  const baseEvent = {
    path: operationsPath(installation.root),
    schemaVersion: OPERATION_SCHEMA_VERSION,
    operationId,
    command,
    startedAt,
    installationId: installation.installationId,
  }
  let activeVersion
  try {
    activeVersion = await readActiveVersion(installation.root, installation.installationId)
  } catch (error) {
    await appendOperationEvent({ ...baseEvent, status: 'started' })
    await appendOperationEvent({
      ...baseEvent,
      status: 'failed',
      finishedAt: new Date().toISOString(),
    })
    throw error
  }
  const event = { ...baseEvent, status: 'started' }
  if (activeVersion !== undefined) event.activeVersion = activeVersion
  await appendOperationEvent(event)
  return { operationId, command, startedAt, installationId: installation.installationId }
}

export async function finishProductOperation(operation, installation, status) {
  const activeVersion = await readActiveVersion(installation.root, installation.installationId)
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
  const [startTime, command, processState] = await Promise.all([
    readPsField(pid, 'lstart'),
    readPsField(pid, 'command'),
    readPsField(pid, 'stat'),
  ])
  if (startTime === null || command === null) return null
  return { startTime, command, processState }
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

async function readActiveRelease(root, expectedInstallationId) {
  const state = await readActiveReleaseState(root, expectedInstallationId)
  if (state === undefined) throw new Error('state/active-release.json does not exist')
  const { activeVersion, releasePath } = state
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

function agentPresetApiUrl(installation) {
  const host = installation.host.includes(':') ? `[${installation.host}]` : installation.host
  return `http://${host}:${installation.port}/api/agentPreset.list`
}

async function readAgentPresetRoster(installation) {
  const rpcId = randomUUID()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2_000)
  let response
  try {
    response = await fetch(agentPresetApiUrl(installation), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId,
        method: 'agentPreset.list',
        payload: {},
      }),
      signal: controller.signal,
    })
  } catch (error) {
    throw new Error(`agentPreset.list request failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    clearTimeout(timeout)
  }
  if (!response.ok) throw new Error(`agentPreset.list HTTP request returned status ${response.status}`)
  let wire
  try {
    wire = await response.json()
  } catch {
    throw new Error('agentPreset.list response is malformed JSON')
  }
  if (!isRecord(wire) || wire.type !== 'server-response' || wire.rpcId !== rpcId) {
    throw new Error('agentPreset.list response envelope is invalid')
  }
  if (!isRecord(wire.result) || wire.result.ok !== true || !isRecord(wire.result.value)) {
    throw new Error('agentPreset.list response result is invalid')
  }
  const value = wire.result.value
  if (!Array.isArray(value.presets)) throw new Error('agentPreset.list response presets are invalid')
  return value
}

function validateAgentPresetRoster(roster, productAgent) {
  if (!isRecord(roster) || !Array.isArray(roster.presets)) {
    throw new Error('agentPreset.list response presets are invalid')
  }
  const productRows = roster.presets.filter(row => isRecord(row) && row.id === productAgent.agentPresetId)
  if (productRows.length !== 1) {
    throw new Error(`agentPreset.list must return exactly one preset with id "${productAgent.agentPresetId}"; found ${productRows.length}`)
  }
  const productRow = productRows[0]
  if (productRow.trust !== 'user') {
    throw new Error(`agent preset "${productAgent.agentPresetId}" must have trust "user"`)
  }
  if (productRow.isDefault !== true) {
    throw new Error(`agent preset "${productAgent.agentPresetId}" must be the default preset`)
  }
  if (productRow.broken !== undefined) {
    throw new Error(`agent preset "${productAgent.agentPresetId}" is broken: ${String(productRow.broken)}`)
  }
  return {
    id: productRow.id,
    trust: productRow.trust,
    isDefault: productRow.isDefault,
    releaseRelativeRoot: `${productAgent.agentPresetInstallRelativeRoot}/${productAgent.agentPresetId}`,
  }
}

async function validateRunningAgentPresetRoster(installation, productAgent) {
  return validateAgentPresetRoster(await readAgentPresetRoster(installation), productAgent)
}

async function buildHostEnvironment(installation, active, productAgent = undefined) {
  const resolvedProductAgent = productAgent ?? await readProductAgentConfig(resolve(active.releasePath, 'package'))
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith(HARNESS_ENVIRONMENT_PREFIX)),
  )
  return {
    ...environment,
    DSH_HOME: active.dshHome,
    DSH_TOOLS_MODE: 'native',
    HARNESS_COMFYUI_SKILL_DIR: resolve(active.releasePath, 'package', resolvedProductAgent.skillRelativeRoot),
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

function waitForDelay(milliseconds) {
  return new Promise(resolveResult => setTimeout(resolveResult, milliseconds))
}

/**
 * Wait for a foreground Host to become fully product-ready.
 *
 * A listening port only proves that the Host process has bound its socket. The
 * product health contract also covers the Web boot graph, bundles, plugin
 * projection, discovery contracts, and shared directories. Upgrade and
 * rollback must use the same readiness gate so a transient Web bootstrap
 * cannot trigger recovery before the existing shutdown timeout expires.
 */
export async function waitForProductHealth(
  startPromise,
  installation,
  expectedVersion,
  runProductHealth,
  failureMessage,
) {
  if (typeof runProductHealth !== 'function') throw new TypeError('runProductHealth must be a function')
  const observedStart = startPromise.then(
    value => ({ status: 'stopped', value }),
    error => ({ status: 'failed', error }),
  )
  const deadline = Date.now() + installation.process.shutdownTimeoutMs
  const statePath = processStatePath(installation.root)
  let lastHealth
  let lastHealthError

  const failIfHostExited = async outcome => {
    if (outcome.status === 'failed') throw outcome.error
    throw new Error(`Host ${expectedVersion} exited before readiness`)
  }

  while (Date.now() < deadline) {
    const outcome = await Promise.race([
      observedStart,
      waitForDelay(Math.min(25, Math.max(1, deadline - Date.now()))).then(() => null),
    ])
    if (outcome !== null) await failIfHostExited(outcome)

    const state = await readProcessState(statePath)
    if (state?.activeVersion !== expectedVersion
      || state.host !== installation.host
      || state.port !== installation.port
      || !(await probePort(installation.host, installation.port))) {
      continue
    }

    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    const healthPromise = Promise.resolve().then(() => runProductHealth(installation))
    const healthOutcome = await Promise.race([
      observedStart,
      healthPromise.then(
        health => ({ status: 'health', health }),
        error => ({ status: 'health-failed', error }),
      ),
      waitForDelay(remaining).then(() => ({ status: 'timeout' })),
    ])
    if (healthOutcome.status === 'stopped' || healthOutcome.status === 'failed') {
      await failIfHostExited(healthOutcome)
    }
    if (healthOutcome.status === 'timeout') {
      // The health helper owns its own bounded probes. Attach a rejection
      // handler to the in-flight call before leaving the deadline gate.
      healthPromise.catch(() => undefined)
      break
    }
    if (healthOutcome.status === 'health-failed') {
      lastHealthError = healthOutcome.error
      continue
    }
    lastHealth = healthOutcome.health
    if (lastHealth?.status === 'passed') return lastHealth
  }

  const error = new Error(failureMessage)
  if (lastHealth !== undefined) error.health = lastHealth
  if (lastHealthError !== undefined) error.cause = lastHealthError
  throw error
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
  if (isExitedProcessIdentity(state.processIdentity, identity)) {
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
  validateActiveReleaseState,
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
  operationsPath,
  readActiveRelease,
  readAgentPresetRoster,
  validateAgentPresetRoster,
  validateRunningAgentPresetRoster,
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

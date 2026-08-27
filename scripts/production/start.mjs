import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { spawnForeground } from './spawn.mjs'
import { validateSourceRuntime } from './contract.mjs'
import {
  PROCESS_STATE_SCHEMA_VERSION,
  assertNoRunningHost,
  attachHostErrorOutput,
  attachHostOutput,
  buildHostEnvironment,
  forwardSignal,
  processStatePath,
  probePort,
  removeOwnedProcessState,
  waitForChildClose,
  waitForStableProcessIdentity,
  writeAtomicJson,
} from './process.mjs'

export async function runSourceStart(input, runtimeTarget, operation = {}) {
  const runtime = validateSourceRuntime(input)
  const statePath = processStatePath(runtime.runtimeRoot)
  await assertNoRunningHost(statePath, runtime, runtimeTarget.activeVersion)
  if (await probePort(runtime.host, runtime.port)) {
    throw new Error(`Host is already running on ${runtime.host}:${runtime.port}`)
  }
  await mkdir(runtime.paths.logDirectory, { recursive: true })

  const environment = {
    ...await buildHostEnvironment(runtime, runtimeTarget),
    ...(runtimeTarget.startupWorkspacePath === undefined
      ? {}
      : { HARNESS_COMFYUI_STARTUP_WORKSPACE_PATH: runtimeTarget.startupWorkspacePath }),
  }
  const child = spawnForeground({
    dshExecutable: runtimeTarget.dshExecutable,
    dshHome: runtimeTarget.dshHome,
    profile: runtimeTarget.dshProfile,
    configuration: runtime.configurationProfile,
    host: runtime.host,
    port: String(runtime.port),
    cwd: runtimeTarget.packageRoot,
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
    const startup = await Promise.race([
      waitForStableProcessIdentity(child.pid, runtime.process.shutdownTimeoutMs)
        .then(identity => ({ status: 'identity', identity })),
      new Promise(resolveResult => {
        child.once('close', (code, signal) => resolveResult({ status: 'exited', code: code ?? 1, signal }))
        child.once('error', error => resolveResult({ status: 'error', error }))
      }),
    ])
    if (startup.status === 'error') throw startup.error
    if (startup.status === 'exited') {
      throw new Error(`Host exited with code ${startup.code}${startup.signal ? ` (${startup.signal})` : ''}`)
    }
    processIdentity = startup.identity
    if (processIdentity === null) throw new Error(`cannot determine process identity for Host PID ${child.pid}`)
  } catch (error) {
    process.removeListener('SIGINT', onSigInt)
    process.removeListener('SIGTERM', onSigTerm)
    if (child.exitCode === null && child.signalCode === null) {
      forwardSignal(child, 'SIGTERM')
      await waitForChildClose(child)
    }
    throw error
  }
  const state = {
    schemaVersion: PROCESS_STATE_SCHEMA_VERSION,
    runtimeId: runtime.runtimeId,
    activeVersion: runtimeTarget.activeVersion,
    pid: child.pid,
    operationId: operation.operationId ?? randomUUID(),
    startedAt: new Date().toISOString(),
    host: runtime.host,
    port: runtime.port,
    processIdentity: {
      startTime: processIdentity.startTime,
      command: processIdentity.command,
    },
  }
  let stateWritten = false
  const stdoutLog = attachHostOutput(join(runtime.paths.logDirectory, 'host.stdout.log'), child.stdout)
  const stderrLog = attachHostErrorOutput(child, join(runtime.paths.logDirectory, 'host.stderr.log'))
  const closeLogs = async () => {
    await Promise.all([stdoutLog.close(), stderrLog.close()])
  }
  try {
    await writeAtomicJson(statePath, state)
    stateWritten = true
    const exit = child.exitCode !== null || child.signalCode !== null
      ? { code: child.exitCode, signal: child.signalCode }
      : await new Promise(resolveResult => {
        child.once('close', (code, signal) => resolveResult({ code, signal }))
        child.once('error', error => resolveResult({ code: 1, signal: null, error }))
      })
    await closeLogs()
    if (exit.error !== undefined) throw exit.error
    const stoppedBySigTerm = exit.code === null && exit.signal === 'SIGTERM'
    if (!stoppedBySigTerm && (exit.code !== 0 || exit.signal !== null)) {
      throw new Error(`Host exited with code ${exit.code}${exit.signal ? ` (${exit.signal})` : ''}`)
    }
    await removeOwnedProcessState(statePath, state)
    return {
      stage: 'start',
      status: 'stopped',
      runtimeId: runtime.runtimeId,
      activeVersion: runtimeTarget.activeVersion,
      pid: state.pid,
      startedAt: state.startedAt,
      host: runtime.host,
      port: runtime.port,
      operationId: state.operationId,
      signal: forwardedSignal,
    }
  } catch (error) {
    if (child.exitCode === null && child.signalCode === null) {
      forwardSignal(child, 'SIGTERM')
      await waitForChildClose(child)
    }
    await closeLogs()
    if (stateWritten) await removeOwnedProcessState(statePath, state)
    throw error
  } finally {
    process.removeListener('SIGINT', onSigInt)
    process.removeListener('SIGTERM', onSigTerm)
  }
}

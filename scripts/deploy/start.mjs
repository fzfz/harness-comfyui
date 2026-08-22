import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { spawnForeground } from '../profile/start.mjs'
import { validateInstallation } from './contracts.mjs'
import {
  PROCESS_STATE_SCHEMA_VERSION,
  assertNoRunningHost,
  attachHostErrorOutput,
  attachHostOutput,
  buildHostEnvironment,
  forwardSignal,
  processStatePath,
  probePort,
  readActiveRelease,
  removeOwnedProcessState,
  waitForChildClose,
  waitForStableProcessIdentity,
  writeAtomicJson,
} from './lifecycle.mjs'

export async function runProductStart(input, operation = {}) {
  const installation = validateInstallation(input)
  const active = await readActiveRelease(installation.root, installation.installationId)
  const statePath = processStatePath(installation.root)
  await assertNoRunningHost(statePath, installation, active.activeVersion)
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
    const startup = await Promise.race([
      waitForStableProcessIdentity(child.pid).then(identity => ({ status: 'identity', identity })),
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
    operationId: operation.operationId ?? randomUUID(),
    startedAt: new Date().toISOString(),
    host: installation.host,
    port: installation.port,
    processIdentity,
  }
  let stateWritten = false
  const stdoutLog = attachHostOutput(join(installation.paths.logDirectory, 'host.stdout.log'), child.stdout)
  const stderrLog = attachHostErrorOutput(child, join(installation.paths.logDirectory, 'host.stderr.log'))
  const closeLogs = async () => {
    await Promise.all([stdoutLog.close(), stderrLog.close()])
  }
  try {
    await writeAtomicJson(statePath, state)
    stateWritten = true
    const exit = child.exitCode !== null
      ? { code: child.exitCode, signal: child.signalCode }
      : await new Promise(resolveResult => {
        child.once('close', (code, signal) => resolveResult({ code: code ?? 1, signal }))
        child.once('error', error => resolveResult({ code: 1, signal: null, error }))
      })
    await closeLogs()
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
    await closeLogs()
    if (stateWritten) await removeOwnedProcessState(statePath, state)
    throw error
  } finally {
    process.removeListener('SIGINT', onSigInt)
    process.removeListener('SIGTERM', onSigTerm)
  }
}

#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { lstat, mkdir, readFile, rm, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  parseDesktopE2EPreparationFailureEvidence,
  parseDesktopE2ERunRecord,
  parseDesktopE2EConfig,
} from '../../config/desktop-e2e-schema.mjs'
import { parseOfficialLifecycleFixture } from './fixtures/official-lifecycle-schema.mjs'
import { writeOfficialCandidateSourceIdentity } from './fixtures/official-candidate-identity.mjs'
import {
  createCommandInvocationContext,
  readCommandRunDescriptors,
  requestCommandCancellation,
  writeCommandCancellationResult,
} from './fixtures/official-command-cancellation.mjs'
import { getProbeStatus as defaultGetProbeStatus, stopProbe as defaultStopProbe } from './fixtures/official-desktop-probe.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const desktopRegressionTestFiles = [
  'tests/desktop/official-desktop-live.test.mjs',
  'tests/desktop/official-desktop-lifecycle.test.mjs',
  'tests/desktop/fixtures/official-business-fixture.test.mjs',
  'tests/desktop/fixtures/official-business-media.test.mjs',
  'tests/production/official-desktop-lifecycle.test.mjs',
  'tests/production/official-desktop-probe.test.mjs',
  'tests/production/official-plugin-install.test.mjs',
  'tests/production/official-profile-patch.test.mjs',
  'tests/production/renderer-cdp.test.mjs',
  'tests/production/plugin-package.test.mjs',
  'tests/production/official-desktop-test-runner.test.mjs',
  'tests/production/official-command-cancellation.test.mjs',
  'tests/production/official-candidate-identity.test.mjs',
]

export async function runDesktopTests({
  repositoryRoot: requestedRepositoryRoot = repositoryRoot,
  spawnCommand = spawn,
  environment = process.env,
  signalSource = process,
  signalProcessGroup = signalCommandProcessGroup,
  processGroupExists = isCommandProcessGroupAlive,
  sleep = delay,
  now = Date.now,
  stopProbe = defaultStopProbe,
  getProbeStatus = defaultGetProbeStatus,
} = {}) {
  const root = resolve(requestedRepositoryRoot)
  const packageManifest = await readJson(resolve(root, 'package.json'), 'package manifest')
  if (typeof packageManifest.name !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/u.test(packageManifest.name)) {
    throw new TypeError('package manifest.name must be a lowercase package name without path separators')
  }
  if (typeof packageManifest.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(packageManifest.version)) {
    throw new TypeError('package manifest.version must be a valid numeric package version')
  }

  const lifecycleFixture = parseOfficialLifecycleFixture(await readJson(
    resolve(root, 'tests/desktop/fixtures/official-lifecycle-fixture.json'),
    'official lifecycle fixture',
  ))
  const desktopConfig = parseDesktopE2EConfig(await readJson(resolve(root, 'config/desktop-e2e.json'), 'Desktop E2E config'))
  const invocation = await createCommandInvocationContext({
    repositoryRoot: root,
    config: desktopConfig,
    runnerPid: process.pid,
    runnerCwd: root,
    now: () => new Date(now()),
  })
  const archivePath = resolve(root, '.local/desktop-e2e/desktop-test-runner/artifacts',
    `${packageManifest.name}-${packageManifest.version}.tgz`)
  const sourceIdentityPath = resolve(dirname(archivePath), lifecycleFixture.artifact.sourceIdentityFilename)
  const cleanEnvironment = { ...environment }
  const credentialNames = new Set([
    ...desktopConfig.modes.development.credentialEnvironmentNames,
    lifecycleFixture.credentials.testKeyEnvironmentName,
  ])
  for (const name of credentialNames) delete cleanEnvironment[name]
  delete cleanEnvironment[desktopConfig.commandRunner.invocationDirectoryEnvironmentName]
  delete cleanEnvironment[lifecycleFixture.runGateEnvironmentName]
  delete cleanEnvironment[lifecycleFixture.artifact.sourcePathEnvironmentName]
  delete cleanEnvironment[lifecycleFixture.artifact.sourceIdentityPathEnvironmentName]

  let cancellationSignal = null
  let cancellationPromise = null
  let cancellationResult = null
  let currentCommand = null
  let currentPhase = null

  const cancel = signal => {
    if (cancellationPromise !== null) return cancellationPromise
    cancellationSignal = signal
    const signalContext = {
      command: currentCommand,
      phase: currentPhase,
      requestedAt: new Date(now()).toISOString(),
    }
    cancellationPromise = performCommandCancellation(signal, signalContext)
    return cancellationPromise
  }
  const onInterrupt = () => { void cancel('SIGINT') }
  const onTerminate = () => { void cancel('SIGTERM') }
  signalSource.on('SIGINT', onInterrupt)
  signalSource.on('SIGTERM', onTerminate)

  try {
    await throwIfCancelled()
    currentPhase = 'build'
    await runChild({
      spawnCommand,
      command: 'pnpm',
      args: ['run', 'build'],
      cwd: root,
      env: cleanEnvironment,
      phase: 'build',
    })

    await throwIfCancelled()
    currentPhase = 'pack'
    await mkdir(dirname(archivePath), { recursive: true, mode: 0o700 })
    await rm(archivePath, { force: true })
    await rm(sourceIdentityPath, { force: true })
    await runChild({
      spawnCommand,
      command: process.execPath,
      args: ['scripts/build/cli.mjs', 'pack', '--out', archivePath],
      cwd: root,
      env: cleanEnvironment,
      phase: 'pack',
    })
    await throwIfCancelled()
    let archive
    try {
      archive = await stat(archivePath)
    } catch (cause) {
      throw createRunnerError('pack-output', 1, `Desktop test runner did not find the requested package archive at ${archivePath}`, cause)
    }
    if (!archive.isFile()) {
      throw createRunnerError('pack-output', 1, `Desktop test runner package output is not a regular file: ${archivePath}`)
    }
    await writeOfficialCandidateSourceIdentity({
      repositoryRoot: root,
      archivePath,
      identityPath: sourceIdentityPath,
      packageName: packageManifest.name,
      packageVersion: packageManifest.version,
    })

    await throwIfCancelled()
    currentPhase = 'tests'
    const testEnvironment = {
      ...cleanEnvironment,
      [desktopConfig.commandRunner.invocationDirectoryEnvironmentName]: invocation.directory,
      [lifecycleFixture.runGateEnvironmentName]: '1',
      [lifecycleFixture.artifact.sourcePathEnvironmentName]: archivePath,
      [lifecycleFixture.artifact.sourceIdentityPathEnvironmentName]: sourceIdentityPath,
    }
    await runChild({
      spawnCommand,
      command: 'pnpm',
      args: ['exec', 'vitest', 'run', ...desktopRegressionTestFiles,
        '--maxWorkers=1', '--no-file-parallelism', '--testTimeout=120000'],
      cwd: root,
      env: testEnvironment,
      phase: 'tests',
    })
    await throwIfCancelled()

    return {
      archivePath,
      sourceIdentityPath,
      invocationId: invocation.invocationId,
      invocationDirectory: invocation.directory,
      testFiles: [...desktopRegressionTestFiles],
    }
  } catch (error) {
    if (cancellationSignal !== null) {
      await cancellationPromise
      throw cancellationRunnerError(cancellationSignal, cancellationResult)
    }
    throw error
  } finally {
    signalSource.removeListener('SIGINT', onInterrupt)
    signalSource.removeListener('SIGTERM', onTerminate)
  }

  async function throwIfCancelled() {
    if (cancellationSignal === null) return
    await cancellationPromise
    throw cancellationRunnerError(cancellationSignal, cancellationResult)
  }

  async function performCommandCancellation(signal, signalContext) {
    const cleanupFailures = []
    const runs = []
    let requestedAt = signalContext.requestedAt
    try {
      const request = await requestCommandCancellation({
        invocationDirectory: invocation.directory,
        config: desktopConfig,
        signal,
        now: () => new Date(now()),
      })
      requestedAt = request.requestedAt
    } catch (error) {
      cleanupFailures.push(`command cancellation marker: ${errorMessage(error)}`)
    }
    const commandAtSignal = signalContext.command
    const phaseAtSignal = signalContext.phase

    if (commandAtSignal?.phase === 'tests') {
      try {
        await waitForPendingStarts({
          invocationDirectory: invocation.directory,
          config: desktopConfig,
          now,
          sleep,
        })
      } catch (error) {
        cleanupFailures.push(`pending Desktop starts: ${errorMessage(error)}`)
      }
    }

    let commandChild = commandAtSignal === null ? null : commandChildIdentity(commandAtSignal)
    if (commandAtSignal !== null) {
      try {
        await terminateCommandProcessGroup(commandAtSignal, {
          signalProcessGroup,
          processGroupExists,
          sleep,
          now,
          pollIntervalMs: desktopConfig.startup.pollIntervalMs,
          stopTimeoutMs: desktopConfig.commandRunner.commandStopTimeoutMs,
          killTimeoutMs: desktopConfig.commandRunner.commandKillTimeoutMs,
        })
      } catch (error) {
        cleanupFailures.push(`runner child process group: ${errorMessage(error)}`)
        if (!commandAtSignal.closed && typeof commandAtSignal.child?.unref === 'function') {
          try {
            commandAtSignal.child.unref()
          } catch (unrefError) {
            cleanupFailures.push(`runner child handle: ${errorMessage(unrefError)}`)
          }
        }
      }
    }

    let descriptors = []
    try {
      descriptors = await readCommandRunDescriptors({ invocationDirectory: invocation.directory, config: desktopConfig })
    } catch (error) {
      cleanupFailures.push(`command run descriptors: ${errorMessage(error)}`)
    }
    for (const descriptor of descriptors) {
      try {
        const run = await cleanupCommandRun({ descriptor, stopProbe, getProbeStatus })
        runs.push(run)
        if (run.cleanupError !== null) cleanupFailures.push(`Desktop run ${descriptor.runId}: ${run.cleanupError}`)
      } catch (error) {
        const run = await failedCommandRun(descriptor, error, getProbeStatus)
        runs.push(run)
        cleanupFailures.push(`Desktop run ${descriptor.runId}: ${run.cleanupError}`)
      }
    }

    const result = {
      schemaVersion: 1,
      invocationId: invocation.invocationId,
      runnerPid: invocation.runnerPid,
      runnerCwd: invocation.runnerCwd,
      signal,
      phase: phaseAtSignal,
      commandChild,
      requestedAt,
      completedAt: new Date(now()).toISOString(),
      exitCode: signal === 'SIGINT' ? 130 : 143,
      cleanupSucceeded: cleanupFailures.length === 0,
      cleanupFailures,
      runs,
    }
    try {
      const written = await writeCommandCancellationResult({
        invocationDirectory: invocation.directory,
        config: desktopConfig,
        result,
      })
      cancellationResult = written.result
    } catch (error) {
      result.cleanupSucceeded = false
      cancellationResult = result
      cleanupFailures.push(`command cancellation result: ${errorMessage(error)}`)
    }
    return cancellationResult
  }

  function runChild({ spawnCommand: spawnPhase, command, args, cwd, env, phase }) {
    return new Promise((resolvePromise, rejectPromise) => {
      if (cancellationSignal !== null) {
        const signal = cancellationSignal
        void cancellationPromise.then(
          () => rejectPromise(cancellationRunnerError(signal, cancellationResult)),
          cause => rejectPromise(cancellationRunnerError(signal, cancellationResult, cause)),
        )
        return
      }

      let state
      let settled = false
      const removeListeners = () => {
        signalSource.removeListener('SIGINT', onInterrupt)
        signalSource.removeListener('SIGTERM', onTerminate)
        if (state !== undefined) {
          state.child.removeListener('error', onError)
          state.child.removeListener('close', onClose)
        }
      }
      const settle = (settlePromise, value) => {
        if (settled) return
        settled = true
        removeListeners()
        settlePromise(value)
      }
      const finishCancellation = () => {
        if (settled || cancellationSignal === null || cancellationPromise === null) return
        const signal = cancellationSignal
        void cancellationPromise.then(
          () => settle(rejectPromise, cancellationRunnerError(signal, cancellationResult)),
          cause => settle(rejectPromise, cancellationRunnerError(signal, cancellationResult, cause)),
        )
      }
      const onInterrupt = () => finishCancellation()
      const onTerminate = () => finishCancellation()
      const onError = cause => {
        if (state !== undefined) state.spawnError = cause
        if (cancellationSignal !== null) {
          finishCancellation()
          return
        }
        settle(rejectPromise, createRunnerError(phase, 1, `Desktop test runner could not start ${phase}`, cause))
      }
      const onClose = (code, signal) => {
        state.closed = true
        if (currentCommand === state) currentCommand = null
        if (cancellationSignal !== null) {
          finishCancellation()
          return
        }
        if (code === 0) settle(resolvePromise)
        else {
          const exitCode = Number.isInteger(code) && code > 0 ? code : 1
          const signalSuffix = signal ? ` after ${signal}` : ''
          settle(rejectPromise, createRunnerError(phase, exitCode,
            `Desktop test runner ${phase} command exited with code ${code}${signalSuffix}`))
        }
      }

      let child
      try {
        child = spawnPhase(command, args, { cwd, env, stdio: 'inherit', detached: true })
      } catch (cause) {
        settle(rejectPromise, createRunnerError(phase, 1, `Desktop test runner could not start ${phase}`, cause))
        return
      }
      if (!child || typeof child.once !== 'function') {
        settle(rejectPromise, createRunnerError(phase, 1, `Desktop test runner received no child process for ${phase}`))
        return
      }
      state = { child, phase, command, cwd, closed: false, detached: true, processGroupId: child.pid }
      currentCommand = state
      signalSource.on('SIGINT', onInterrupt)
      signalSource.on('SIGTERM', onTerminate)
      child.once('error', onError)
      child.once('close', onClose)
      finishCancellation()
    })
  }
}

function createRunnerError(phase, exitCode, message, cause) {
  const error = cause === undefined ? new Error(message) : new Error(message, { cause })
  error.name = 'DesktopTestRunnerError'
  error.phase = phase
  error.exitCode = exitCode
  return error
}

function cancellationRunnerError(signal, result, cause) {
  const exitCode = signal === 'SIGINT' ? 130 : 143
  const failures = result?.cleanupFailures ?? []
  const summary = failures.length === 0 ? 'owned Desktop cleanup completed' : `cleanup failed: ${failures.join('; ')}`
  return createRunnerError('cancellation', exitCode, `Desktop test runner received ${signal}; ${summary}`, cause)
}

async function waitForPendingStarts({ invocationDirectory, config, now, sleep }) {
  const timeoutMs = config.commandRunner.pendingStartDrainTimeoutMs
  const deadline = now() + timeoutMs
  while (true) {
    const descriptors = await readCommandRunDescriptors({ invocationDirectory, config })
    const pending = descriptors.filter(descriptor => descriptor.state === 'pending')
    if (pending.length === 0) return descriptors
    const remainingMs = deadline - now()
    if (remainingMs <= 0) {
      throw new Error(`pending Desktop starts did not settle within ${timeoutMs}ms: ${pending.map(item => item.runId).join(', ')}`)
    }
    await sleep(Math.min(config.startup.pollIntervalMs, remainingMs))
  }
}

function commandChildIdentity(commandState) {
  const pid = commandState.child?.pid
  if (!Number.isSafeInteger(pid) || pid < 1 || commandState.processGroupId !== pid || commandState.detached !== true) return null
  return {
    pid,
    processGroupId: pid,
    command: commandState.command,
    workingDirectory: commandState.cwd,
  }
}

async function terminateCommandProcessGroup(commandState, {
  signalProcessGroup,
  processGroupExists,
  sleep,
  now,
  pollIntervalMs,
  stopTimeoutMs,
  killTimeoutMs,
}) {
  const identity = commandChildIdentity(commandState)
  if (identity === null) throw new Error('spawned command has no verified detached process-group identity')

  let groupExists = await processGroupExists(identity.processGroupId)
  if (groupExists) {
    await signalProcessGroup(identity.processGroupId, 'SIGTERM')
    groupExists = await waitForCommandGroupExit(identity.processGroupId, stopTimeoutMs, {
      processGroupExists, sleep, now, pollIntervalMs,
    })
  }
  if (groupExists) {
    if (commandState.processGroupId !== identity.processGroupId || commandState.detached !== true) {
      throw new Error('command process-group identity changed before forced stop; no further signal was sent')
    }
    if (await processGroupExists(identity.processGroupId)) {
      await signalProcessGroup(identity.processGroupId, 'SIGKILL')
      groupExists = await waitForCommandGroupExit(identity.processGroupId, killTimeoutMs, {
        processGroupExists, sleep, now, pollIntervalMs,
      })
    } else groupExists = false
  }
  if (groupExists) throw new Error(`command process group ${identity.processGroupId} remained after SIGKILL`)
  if (!await waitForCommandChildClose(commandState, killTimeoutMs)) {
    throw new Error(`command process ${identity.pid} did not close after its process group exited`)
  }
  return identity
}

async function waitForCommandGroupExit(processGroupId, timeoutMs, { processGroupExists, sleep, now, pollIntervalMs }) {
  const deadline = now() + timeoutMs
  while (now() < deadline) {
    if (!await processGroupExists(processGroupId)) return false
    await sleep(Math.min(pollIntervalMs, deadline - now()))
  }
  return processGroupExists(processGroupId)
}

async function waitForCommandChildClose(commandState, timeoutMs) {
  if (commandState.closed) return true
  return new Promise(resolvePromise => {
    let finished = false
    const finish = closed => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      commandState.child.removeListener('close', onClose)
      resolvePromise(closed)
    }
    const onClose = () => finish(true)
    const timer = setTimeout(() => finish(commandState.closed), Math.max(1, timeoutMs))
    commandState.child.once('close', onClose)
    if (commandState.closed) finish(true)
  })
}

async function cleanupCommandRun({ descriptor, stopProbe, getProbeStatus }) {
  if (descriptor.state === 'settled' && descriptor.outcome === 'cancelled-before-start') {
    return {
      runId: descriptor.runId,
      repositoryRoot: descriptor.repositoryRoot,
      paths: descriptor.paths,
      state: 'cancelled-before-start',
      processGroupAbsent: null,
      portsReleased: null,
      environmentLeaseReleased: null,
      evidencePaths: [],
      cleanupError: null,
    }
  }

  if (!await regularFileExists(descriptor.paths.record)) {
    if (!await regularFileExists(descriptor.paths.preparationFailure)) {
      throw new Error('run record and explicit preparation-failure evidence are both missing')
    }
    const preparationFailure = parseDesktopE2EPreparationFailureEvidence(
      JSON.parse(await readFile(descriptor.paths.preparationFailure, 'utf8')),
      descriptor.config,
    )
    if (preparationFailure.runId !== descriptor.runId) throw new Error('preparation-failure evidence belongs to another run')
    const portsReleased = preparationFailure.cleanup.portsReleased
    const environmentLeaseReleased = preparationFailure.cleanup.environmentLease !== 'retained'
    const cleanupError = portsReleased && environmentLeaseReleased
      ? null
      : 'preparation-failure evidence reports unreleased ports or development lease'
    return {
      runId: descriptor.runId,
      repositoryRoot: descriptor.repositoryRoot,
      paths: descriptor.paths,
      state: cleanupError === null ? 'preparation-failed' : 'cleanup-failed',
      processGroupAbsent: null,
      portsReleased,
      environmentLeaseReleased,
      evidencePaths: [descriptor.paths.preparationFailure],
      cleanupError,
    }
  }

  const initialStatus = await getProbeStatus({
    runId: descriptor.runId,
    repositoryRoot: descriptor.repositoryRoot,
    config: descriptor.config,
  })
  assertCommandStatusIdentity(initialStatus, descriptor)
  let status = initialStatus
  let observations = await observeCommandStatus(status)
  if (!isCleanTerminalStatus(status.record.state, observations)) {
    if (status.record.state === 'stopped' && !observations.clean) {
      throw new Error('stopped Desktop run has a process group, listening port owner, or retained development lease')
    }
    await stopProbe({
      runId: descriptor.runId,
      repositoryRoot: descriptor.repositoryRoot,
      config: descriptor.config,
    })
    status = await getProbeStatus({
      runId: descriptor.runId,
      repositoryRoot: descriptor.repositoryRoot,
      config: descriptor.config,
    })
    assertCommandStatusIdentity(status, descriptor)
    observations = await observeCommandStatus(status)
  }
  const evidencePaths = await existingCommandEvidencePaths(descriptor.paths)
  const cleanupError = observations.clean ? null : 'OS process group, run ports, or development lease remain after stopProbe'
  return {
    runId: descriptor.runId,
    repositoryRoot: descriptor.repositoryRoot,
    paths: descriptor.paths,
    state: cleanupError === null ? 'stopped' : 'cleanup-failed',
    processGroupAbsent: observations.processGroupAbsent,
    portsReleased: observations.portsReleased,
    environmentLeaseReleased: observations.environmentLeaseReleased,
    evidencePaths,
    cleanupError,
  }
}

async function observeCommandStatus(status) {
  const expectedPorts = Object.values(status.record.ports)
  if (!Array.isArray(status.ports)) throw new TypeError('getProbeStatus did not return OS port-owner observations')
  const observedPorts = new Set(status.ports.map(owner => owner.port))
  const portsReleased = expectedPorts.every(port => observedPorts.has(port)
    && status.ports.find(owner => owner.port === port)?.pids?.length === 0)
  const processGroupAbsent = status.processGroup === null
    || Array.isArray(status.processGroup?.members) && status.processGroup.members.length === 0
  const environmentLeaseReleased = await commandLeaseIsReleased(status.record.environment.leasePath)
  return {
    processGroupAbsent,
    portsReleased,
    environmentLeaseReleased,
    clean: processGroupAbsent && portsReleased && environmentLeaseReleased,
  }
}

function isCleanTerminalStatus(state, observations) {
  return ['stopped', 'failed', 'cancelled'].includes(state)
    && observations.clean
}

function assertCommandStatusIdentity(status, descriptor) {
  if (status?.record?.runId !== descriptor.runId || resolve(status.recordPath ?? '') !== descriptor.paths.record) {
    throw new Error('probe status does not match the exact command run descriptor')
  }
}

async function commandLeaseIsReleased(leasePath) {
  if (leasePath === null) return true
  try {
    const info = await lstat(leasePath)
    if (!info.isFile() || info.isSymbolicLink()) throw new TypeError(`development lease is not a regular file: ${leasePath}`)
    return false
  } catch (error) {
    if (error?.code === 'ENOENT') return true
    throw error
  }
}

async function regularFileExists(path) {
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink()) throw new TypeError(`expected a regular file: ${path}`)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function existingCommandEvidencePaths(paths) {
  const evidencePaths = []
  for (const key of ['preparationFailure', 'failure', 'cleanupFailure', 'stopRequest', 'stopResult']) {
    if (await regularFileExists(paths[key])) evidencePaths.push(paths[key])
  }
  return evidencePaths
}

async function failedCommandRun(descriptor, error, getProbeStatus) {
  let observations = {
    processGroupAbsent: null,
    portsReleased: null,
    environmentLeaseReleased: null,
  }
  try {
    if (await regularFileExists(descriptor.paths.record)) {
      const status = await getProbeStatus({
        runId: descriptor.runId,
        repositoryRoot: descriptor.repositoryRoot,
        config: descriptor.config,
      })
      assertCommandStatusIdentity(status, descriptor)
      observations = await observeCommandStatus(status)
    }
  } catch {
    // The exact descriptor path has already failed cleanup; retain unknown OS observations as null.
  }
  const evidencePaths = await existingCommandEvidencePaths(descriptor.paths).catch(() => [])
  return {
    runId: descriptor.runId,
    repositoryRoot: descriptor.repositoryRoot,
    paths: descriptor.paths,
    state: 'cleanup-failed',
    processGroupAbsent: observations.processGroupAbsent,
    portsReleased: observations.portsReleased,
    environmentLeaseReleased: observations.environmentLeaseReleased,
    evidencePaths,
    cleanupError: errorMessage(error),
  }
}

function signalCommandProcessGroup(processGroupId, signal) {
  try {
    process.kill(-processGroupId, signal)
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
}

function isCommandProcessGroupAlive(processGroupId) {
  try {
    process.kill(-processGroupId, 0)
    return true
  } catch (error) {
    if (error?.code === 'ESRCH') return false
    if (error?.code === 'EPERM') return true
    throw error
  }
}

function delay(timeoutMs) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, timeoutMs))
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (cause) {
    throw new TypeError(`Could not read ${label} at ${path}`, { cause })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runDesktopTests().then(result => {
    process.stdout.write(`Desktop regression candidate: ${result.archivePath}\n`)
  }).catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = Number.isInteger(error?.exitCode) && error.exitCode > 0 ? error.exitCode : 1
  })
}

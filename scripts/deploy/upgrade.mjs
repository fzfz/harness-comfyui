import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

import { validateInstallation } from './contracts.mjs'
import { activateProductRelease, restoreProductRelease } from './activate.mjs'
import { stageProductRelease } from './install.mjs'
import {
  probePort,
  processStatePath,
  readActiveRelease,
  readActiveReleaseState,
  readProcessState,
} from './lifecycle.mjs'

function waitForDelay(milliseconds) {
  return new Promise(resolveResult => setTimeout(resolveResult, milliseconds))
}

async function waitForHostReady(startPromise, installation, expectedVersion) {
  const observedStart = startPromise.then(
    value => ({ status: 'stopped', value }),
    error => ({ status: 'failed', error }),
  )
  const deadline = Date.now() + installation.process.shutdownTimeoutMs
  const statePath = processStatePath(installation.root)
  while (Date.now() < deadline) {
    const outcome = await Promise.race([
      observedStart,
      waitForDelay(25).then(() => null),
    ])
    if (outcome !== null) {
      if (outcome.status === 'failed') throw outcome.error
      throw new Error(`Host ${expectedVersion} exited before readiness`)
    }
    const state = await readProcessState(statePath)
    if (state?.activeVersion === expectedVersion && state.host === installation.host && state.port === installation.port
      && await probePort(installation.host, installation.port)) {
      return
    }
  }
  throw new Error(`Host ${expectedVersion} did not become ready before shutdown timeout`)
}

async function loadActiveLifecycle(installation, expectedVersion) {
  const active = await readActiveRelease(installation.root, installation.installationId)
  if (expectedVersion !== undefined && active.activeVersion !== expectedVersion) {
    throw new Error(`active release changed while upgrading: expected ${expectedVersion}, got ${active.activeVersion}`)
  }
  const packageRoot = join(active.releasePath, 'package', 'scripts', 'deploy')
  const [start, health, stop] = await Promise.all([
    import(pathToFileURL(join(packageRoot, 'start.mjs')).href),
    import(pathToFileURL(join(packageRoot, 'health.mjs')).href),
    import(pathToFileURL(join(packageRoot, 'stop.mjs')).href),
  ])
  for (const [name, module] of [['start', start], ['health', health], ['stop', stop]]) {
    if (typeof module[`runProduct${name[0].toUpperCase()}${name.slice(1)}`] !== 'function') {
      throw new Error(`active release ${active.activeVersion} has no product ${name} helper`)
    }
  }
  return {
    active,
    runProductStart: start.runProductStart,
    runProductHealth: health.runProductHealth,
    runProductStop: stop.runProductStop,
  }
}

async function startAndHealth(installation, operation, version) {
  let lifecycle
  let startPromise
  try {
    lifecycle = await loadActiveLifecycle(installation, version)
    startPromise = lifecycle.runProductStart(installation, operation)
    await waitForHostReady(startPromise, installation, version)
    const health = await lifecycle.runProductHealth(installation)
    if (health.status !== 'passed') {
      const error = new Error(`candidate health check failed for ${version}`)
      error.health = health
      throw error
    }
    return { startPromise, health }
  } catch (error) {
    if (startPromise !== undefined) {
      await stopRunningHost(installation, version)
      await startPromise.catch(() => undefined)
    }
    throw error
  }
}

async function stopRunningHost(installation, expectedVersion) {
  const state = await readActiveReleaseState(installation.root, installation.installationId)
  if (state === undefined || state.activeVersion !== expectedVersion) return { status: 'skipped' }
  try {
    const lifecycle = await loadActiveLifecycle(installation, expectedVersion)
    return await lifecycle.runProductStop(installation)
  } catch (error) {
    const wrapped = new Error(`could not stop Host ${expectedVersion}: ${error instanceof Error ? error.message : String(error)}`)
    wrapped.cause = error
    throw wrapped
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

export async function runProductUpgrade(input, artifactPath, operation = {}) {
  const installation = validateInstallation(input)
  const previous = await readActiveReleaseState(installation.root, installation.installationId)
  if (previous === undefined) throw new Error('cannot upgrade without an active release')
  if (previous.installationId !== installation.installationId) {
    throw new Error('active release installationId does not match installation')
  }

  const staged = await stageProductRelease(installation, artifactPath)
  let switched = false
  let candidateStart
  let failure
  try {
    await stopRunningHost(installation, previous.activeVersion)
    await activateProductRelease(installation, {
      activeVersion: staged.artifact.version,
      releasePath: staged.releaseRoot,
    })
    switched = true
    candidateStart = await startAndHealth(installation, operation, staged.artifact.version)
    await candidateStart.startPromise
    return {
      stage: 'upgrade',
      status: 'stopped',
      installationId: installation.installationId,
      activeVersion: staged.artifact.version,
      previousRelease: { activeVersion: previous.activeVersion, releasePath: previous.releasePath },
      health: candidateStart.health,
    }
  } catch (error) {
    failure = error
  }

  if (!switched) {
    throw failure
  }

  let candidateStopError
  try {
    await stopRunningHost(installation, staged.artifact.version)
  } catch (error) {
    candidateStopError = error
  }
  if (candidateStart !== undefined) await candidateStart.startPromise.catch(() => undefined)
  if (candidateStopError !== undefined) {
    throw new Error(`${errorMessage(failure)}; automatic recovery could not stop candidate: ${errorMessage(candidateStopError)}`)
  }

  try {
    await restoreProductRelease(installation, previous)
    const recovered = await startAndHealth(installation, operation, previous.activeVersion)
    await recovered.startPromise
    return {
      stage: 'upgrade',
      status: 'failed',
      installationId: installation.installationId,
      activeVersion: previous.activeVersion,
      error: errorMessage(failure),
      recovery: {
        status: 'passed',
        activeVersion: previous.activeVersion,
        health: recovered.health,
      },
    }
  } catch (recoveryError) {
    throw new Error(`${errorMessage(failure)}; automatic recovery failed: ${errorMessage(recoveryError)}`)
  }
}

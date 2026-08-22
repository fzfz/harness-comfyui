import { access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { validateInstallation } from './contracts.mjs'
import {
  readActiveRelease,
  readActiveReleaseState,
  waitForProductHealth,
  writeActiveReleaseState,
} from './lifecycle.mjs'

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

async function loadReleaseLifecycle(release) {
  const packageRoot = join(release.releasePath, 'package', 'scripts', 'deploy')
  const modulePaths = {
    start: join(packageRoot, 'start.mjs'),
    health: join(packageRoot, 'health.mjs'),
    stop: join(packageRoot, 'stop.mjs'),
  }
  for (const [name, path] of Object.entries(modulePaths)) {
    try {
      await access(path, fsConstants.R_OK)
    } catch (error) {
      throw new Error(`release ${release.activeVersion} has no product ${name} module: ${errorMessage(error)}`)
    }
  }
  const [start, health, stop] = await Promise.all(
    Object.values(modulePaths).map(path => import(pathToFileURL(path).href)),
  )
  const helpers = {
    start: start.runProductStart,
    health: health.runProductHealth,
    stop: stop.runProductStop,
  }
  for (const [name, helper] of Object.entries(helpers)) {
    if (typeof helper !== 'function') {
      throw new Error(`release ${release.activeVersion} has no product ${name} helper`)
    }
  }
  return {
    ...release,
    runProductStart: helpers.start,
    runProductHealth: helpers.health,
    runProductStop: helpers.stop,
  }
}

async function stopRestoredHost(installation, lifecycle, expectedVersion) {
  try {
    const active = await readActiveReleaseState(installation.root, installation.installationId)
    if (active?.activeVersion !== expectedVersion) return
    await lifecycle.runProductStop(installation)
  } catch (error) {
    throw new Error(`rollback cleanup could not stop Host ${expectedVersion}: ${errorMessage(error)}`)
  }
}

async function startAndHealth(installation, operation, lifecycle, expectedVersion) {
  let startPromise
  try {
    startPromise = lifecycle.runProductStart(installation, operation)
    const health = await waitForProductHealth(
      startPromise,
      installation,
      expectedVersion,
      lifecycle.runProductHealth,
      `rollback health check failed for ${expectedVersion}`,
    )
    return { startPromise, health }
  } catch (error) {
    let cleanupError
    try {
      await stopRestoredHost(installation, lifecycle, expectedVersion)
    } catch (candidateError) {
      cleanupError = candidateError
    }
    if (startPromise !== undefined) await startPromise.catch(() => undefined)
    if (cleanupError !== undefined) {
      throw new Error(`${errorMessage(error)}; ${errorMessage(cleanupError)}`)
    }
    throw error
  }
}

function swappedState(state) {
  return {
    schemaVersion: state.schemaVersion,
    installationId: state.installationId,
    activeVersion: state.previousRelease.activeVersion,
    releasePath: state.previousRelease.releasePath,
    previousRelease: {
      activeVersion: state.activeVersion,
      releasePath: state.releasePath,
    },
  }
}

export async function runProductRollback(input, operation = {}) {
  const installation = validateInstallation(input)
  const state = await readActiveReleaseState(installation.root, installation.installationId)
  if (state === undefined) throw new Error('cannot rollback without an active release')
  if (state.previousRelease === null) throw new Error('cannot rollback without a previous release')

  // Resolve every module before stopping the current Host. A malformed or
  // incomplete target therefore leaves the current release running.
  const current = await readActiveRelease(installation.root, installation.installationId)
  const currentLifecycle = await loadReleaseLifecycle({
    activeVersion: current.activeVersion,
    releasePath: current.releasePath,
  })
  const previousLifecycle = await loadReleaseLifecycle(state.previousRelease)

  await currentLifecycle.runProductStop(installation)
  const nextState = swappedState(state)
  await writeActiveReleaseState(installation.root, nextState)

  const restored = await startAndHealth(
    installation,
    operation,
    previousLifecycle,
    nextState.activeVersion,
  )
  await restored.startPromise
  return {
    stage: 'rollback',
    status: 'stopped',
    installationId: installation.installationId,
    activeVersion: nextState.activeVersion,
    previousRelease: nextState.previousRelease,
    health: restored.health,
  }
}

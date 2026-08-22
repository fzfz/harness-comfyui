import { rm } from 'node:fs/promises'

import { validateInstallation } from './contracts.mjs'
import {
  assertProcessStateOwnership,
  processStatePath,
  processIdentityMismatch,
  isExitedProcessIdentity,
  readActiveRelease,
  readProcessIdentity,
  readProcessState,
  removeOwnedProcessState,
  sameProcessIdentity,
  statusView,
  waitForPortClosed,
  waitForProcessExit,
} from './lifecycle.mjs'

export async function runProductStop(input) {
  const installation = validateInstallation(input)
  const active = await readActiveRelease(installation.root, installation.installationId)
  const statePath = processStatePath(installation.root)
  const state = await readProcessState(statePath)
  if (state === null) {
    return { stage: 'stop', ...statusView(installation, active.activeVersion, null, 'stopped') }
  }
  assertProcessStateOwnership(state, installation, active.activeVersion)
  const identity = await readProcessIdentity(state.pid)
  if (identity === null || isExitedProcessIdentity(state.processIdentity, identity)) {
    await rm(statePath, { force: true })
    await waitForPortClosed(installation.host, installation.port, installation.process.shutdownTimeoutMs)
    return { stage: 'stop', ...statusView(installation, active.activeVersion, null, 'stopped') }
  }
  if (!sameProcessIdentity(state.processIdentity, identity)) {
    throw new Error(processIdentityMismatch(state, identity))
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

import { rm } from 'node:fs/promises'

import { validateSourceRuntime } from './contract.mjs'
import {
  assertProcessStateOwnership,
  processStatePath,
  processIdentityMismatch,
  isExitedProcessIdentity,
  readProcessIdentity,
  readProcessState,
  removeOwnedProcessState,
  sameProcessIdentity,
  statusView,
  waitForPortClosed,
  waitForProcessExit,
  waitForStopIdentityResolution,
} from './process.mjs'

export async function runSourceStop(input, runtimeTarget) {
  const runtime = validateSourceRuntime(input)
  const statePath = processStatePath(runtime.runtimeRoot)
  const state = await readProcessState(statePath)
  if (state === null) {
    return { stage: 'stop', ...statusView(runtime, runtimeTarget.activeVersion, null, 'stopped') }
  }
  assertProcessStateOwnership(state, runtime, runtimeTarget.activeVersion)
  const deadline = Date.now() + runtime.process.shutdownTimeoutMs
  let identity = await readProcessIdentity(state.pid)
  if (identity !== null && !isExitedProcessIdentity(state.processIdentity, identity) && !sameProcessIdentity(state.processIdentity, identity)) {
    identity = await waitForStopIdentityResolution(state, identity, deadline)
  }
  if (identity === null || isExitedProcessIdentity(state.processIdentity, identity)) {
    await rm(statePath, { force: true })
    await waitForPortClosed(runtime.host, runtime.port, runtime.process.shutdownTimeoutMs)
    return { stage: 'stop', ...statusView(runtime, runtimeTarget.activeVersion, null, 'stopped') }
  }
  if (!sameProcessIdentity(state.processIdentity, identity)) {
    throw new Error(processIdentityMismatch(state, identity))
  }
  try {
    process.kill(state.pid, 'SIGTERM')
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
  await waitForProcessExit(state, runtime.process.shutdownTimeoutMs)
  await waitForPortClosed(runtime.host, runtime.port, runtime.process.shutdownTimeoutMs)
  await removeOwnedProcessState(statePath, state)
  return { stage: 'stop', ...statusView(runtime, runtimeTarget.activeVersion, null, 'stopped') }
}

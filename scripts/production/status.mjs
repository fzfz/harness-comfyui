import { validateSourceRuntime } from './contract.mjs'
import {
  assertProcessStateOwnership,
  clearStaleProcessState,
  processStatePath,
  probePort,
  probePortOwnedByProcess,
  readProcessState,
  statusView,
  validateRunningAgentPresetRoster,
} from './process.mjs'

export async function runSourceStatus(input, runtimeTarget) {
  const runtime = validateSourceRuntime(input)
  const statePath = processStatePath(runtime.runtimeRoot)
  const state = await readProcessState(statePath)
  if (state === null) {
    const portOccupied = await probePort(runtime.host, runtime.port)
    return statusView(runtime, runtimeTarget.activeVersion, null, portOccupied ? 'unhealthy' : 'stopped')
  }
  assertProcessStateOwnership(state, runtime, runtimeTarget.activeVersion)
  const identity = await clearStaleProcessState(statePath, state)
  if (identity === null) {
    const portOccupied = await probePort(runtime.host, runtime.port)
    return statusView(runtime, runtimeTarget.activeVersion, null, portOccupied ? 'unhealthy' : 'stopped')
  }
  const portReady = await probePort(runtime.host, runtime.port)
  if (!portReady) return statusView(runtime, runtimeTarget.activeVersion, state, 'starting')
  if (!(await probePortOwnedByProcess(runtime.host, runtime.port, state.pid))) {
    return statusView(runtime, runtimeTarget.activeVersion, state, 'unhealthy')
  }
  await validateRunningAgentPresetRoster(runtime, runtimeTarget.productAgent)
  return statusView(runtime, runtimeTarget.activeVersion, state, 'running')
}

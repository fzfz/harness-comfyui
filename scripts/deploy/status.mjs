import { validateInstallation } from './contracts.mjs'
import { validateProductAgentRelease } from './preflight.mjs'
import {
  assertProcessStateOwnership,
  clearStaleProcessState,
  processStatePath,
  probePort,
  probePortOwnedByProcess,
  readActiveRelease,
  readProcessState,
  statusView,
  validateRunningAgentPresetRoster,
} from './lifecycle.mjs'

export async function runProductStatus(input) {
  const installation = validateInstallation(input)
  const active = await readActiveRelease(installation.root, installation.installationId)
  const agentReadiness = await validateProductAgentRelease(active.releasePath)
  const statePath = processStatePath(installation.root)
  const state = await readProcessState(statePath)
  if (state === null) {
    const portOccupied = await probePort(installation.host, installation.port)
    return statusView(installation, active.activeVersion, null, portOccupied ? 'unhealthy' : 'stopped')
  }
  assertProcessStateOwnership(state, installation, active.activeVersion)
  const identity = await clearStaleProcessState(statePath, state)
  if (identity === null) {
    const portOccupied = await probePort(installation.host, installation.port)
    return statusView(installation, active.activeVersion, null, portOccupied ? 'unhealthy' : 'stopped')
  }
  const portReady = await probePort(installation.host, installation.port)
  if (!portReady) return statusView(installation, active.activeVersion, state, 'starting')
  if (!(await probePortOwnedByProcess(installation.host, installation.port, state.pid))) {
    return statusView(installation, active.activeVersion, state, 'unhealthy')
  }
  await validateRunningAgentPresetRoster(installation, agentReadiness.productAgent)
  return statusView(installation, active.activeVersion, state, 'running')
}

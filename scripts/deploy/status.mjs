import { validateInstallation } from './contracts.mjs'
import {
  assertProcessStateOwnership,
  clearStaleProcessState,
  processStatePath,
  probePort,
  readActiveRelease,
  readProcessState,
  statusView,
} from './lifecycle.mjs'

export async function runProductStatus(input) {
  const installation = validateInstallation(input)
  const active = await readActiveRelease(installation.root, installation.installationId)
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
  return statusView(installation, active.activeVersion, state, portReady ? 'running' : 'starting')
}

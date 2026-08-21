import { validateInstallation } from './contracts.mjs'
import { runProductStart } from './start.mjs'
import { runProductStop } from './stop.mjs'

export async function runProductRestart(input, operation = {}) {
  const installation = validateInstallation(input)
  await runProductStop(installation)
  const evidence = await runProductStart(installation, operation)
  return { ...evidence, stage: 'restart' }
}

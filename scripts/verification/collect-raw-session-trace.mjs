import { collectOfficialSessionTrace } from './collect-session-trace.mjs'

export async function collectRawSessionTrace({ capture, ...options }) {
  if (typeof capture?.collect !== 'function') throw new TypeError('collectRawSessionTrace requires the active raw capture returned by startRawTraceCapture()')
  const official = await collectOfficialSessionTrace(options)
  const raw = await capture.collect({ officialIndexPath: official.indexPath })
  return { official, raw, indexPath: raw.indexPath }
}

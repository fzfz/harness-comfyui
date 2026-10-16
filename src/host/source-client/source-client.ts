import configuration from '../../../config/source-client.json' with { type: 'json' }
import type { SourceAddress } from '../../source-settings.ts'
import { SourceClientError, sourceJsonRequest, withSourceRequest } from './http-client.ts'

export interface SourceReadRequest {
  readonly address: SourceAddress
  readonly operation: 'instance' | 'template-bundle'
  readonly id: string
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
}

export type SourceRead = (request: SourceReadRequest) => Promise<unknown>

export const readSourceRecord: SourceRead = async request => {
  if (!/^[1-9][0-9]{0,19}$/u.test(request.id)) throw new TypeError('ComfyUI source id is invalid.')
  const path = configuration.source.operations[request.operation].replace('{id}', encodeURIComponent(request.id))
  return withSourceRequest({
    address: request.address,
    timeoutMs: request.timeoutMs ?? configuration.source.queryTimeoutMs,
    maxResponseBytes: configuration.source.maxResponseBytes,
    signal: request.signal,
  }, async context => {
    const discovery = await sourceJsonRequest(context, configuration.source.discoveryPath, { discovery: true })
    if (discovery.status !== 200 || discovery.body === null || typeof discovery.body !== 'object' || Array.isArray(discovery.body)) throw new SourceClientError('DISCOVERY_PROTOCOL_ERROR', 'ComfyUI Source discovery must be a JSON object.')
    return (await sourceJsonRequest(context, path)).body
  })
}

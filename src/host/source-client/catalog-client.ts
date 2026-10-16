import configuration from '../../../config/source-client.json' with { type: 'json' }
import { ERROR_CATALOG } from '../../../config/error-catalog-schema.ts'
import type { SourceAddress } from '../../source-settings.ts'
import { prepareCatalogRequest } from './catalog-protocol.mjs'
import { sourceJsonRequest, withSourceRequest } from './http-client.ts'

export interface CatalogSourceRequest {
  readonly address: SourceAddress
  readonly path: string
  readonly input: Readonly<Record<string, unknown>>
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
}

export type CatalogQuery = (request: CatalogSourceRequest) => Promise<unknown>

export const queryCatalog: CatalogQuery = async request => withSourceRequest({
  address: request.address,
  timeoutMs: request.timeoutMs ?? configuration.catalog.queryTimeoutMs,
  maxResponseBytes: ERROR_CATALOG.CATALOG_RESPONSE_TOO_LARGE.output_limit,
  signal: request.signal,
}, async context => {
  const discovery = await sourceJsonRequest(context, configuration.catalog.discoveryPath, { discovery: true })
  const input = prepareCatalogRequest(discovery.body, request.path, request.input)
  return (await sourceJsonRequest(context, request.path, { body: input })).body
})

import { request as requestHttp } from 'node:http'
import { request as requestHttps } from 'node:https'
import { TextDecoder } from 'node:util'
import { readSourceAddress, type SourceAddress } from '../../source-settings.ts'

export class SourceClientError extends Error {
  readonly code: string
  readonly status?: number
  readonly responseBody?: unknown

  constructor(code: string, message: string, details?: { readonly status: number; readonly responseBody: unknown }) {
    super(message)
    this.name = 'SourceClientError'
    this.code = code
    this.status = details?.status
    this.responseBody = details?.responseBody
  }
}

export interface SourceRequestContext {
  readonly origin: string
  readonly signal: AbortSignal
  readonly maxResponseBytes: number
}

export interface SourceRequestOptions {
  readonly address: SourceAddress
  readonly timeoutMs: number
  readonly maxResponseBytes: number
  readonly signal?: AbortSignal
}

export async function withSourceRequest<T>(options: SourceRequestOptions, operation: (context: SourceRequestContext) => Promise<T>): Promise<T> {
  const address = readSourceAddress({ get: () => options.address })
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1) throw new TypeError('Source request timeout must be a positive integer.')
  if (!Number.isSafeInteger(options.maxResponseBytes) || options.maxResponseBytes < 1) throw new TypeError('Source response limit must be a positive integer.')
  options.signal?.throwIfAborted()
  const controller = new AbortController()
  const onAbort = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', onAbort, { once: true })
  const timeout = setTimeout(() => controller.abort(new SourceClientError('TOTAL_TIMEOUT', 'Source request timed out.')), options.timeoutMs)
  const url = new URL(address.url)
  url.port = String(address.port)
  try {
    const result = await operation({ origin: url.origin, signal: controller.signal, maxResponseBytes: options.maxResponseBytes })
    controller.signal.throwIfAborted()
    return result
  } catch (error) {
    controller.signal.throwIfAborted()
    throw error
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', onAbort)
  }
}

export async function sourceJsonRequest(context: SourceRequestContext, path: string, options: { readonly body?: Readonly<Record<string, unknown>>; readonly discovery?: boolean } = {}): Promise<{ readonly status: number; readonly body: unknown }> {
  const body = options.body === undefined ? undefined : JSON.stringify(options.body)
  const url = `${context.origin}${path}`
  const response = await new Promise<{ status: number; buffer: Buffer }>((resolve, reject) => {
    context.signal.throwIfAborted()
    const send = new URL(url).protocol === 'https:' ? requestHttps : requestHttp
    const outgoing = send(url, {
      method: body === undefined ? 'GET' : 'POST',
      signal: context.signal,
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }),
    }, incoming => {
      const chunks: Buffer[] = []
      let bytes = 0
      incoming.on('data', (chunk: Buffer) => {
        bytes += chunk.length
        if (bytes > context.maxResponseBytes) {
          const failure = new SourceClientError('RESPONSE_TOO_LARGE', 'Source response exceeded the configured size limit.')
          reject(failure)
          incoming.destroy(failure)
          outgoing.destroy(failure)
        } else chunks.push(Buffer.from(chunk))
      })
      incoming.once('error', reject)
      incoming.once('aborted', () => reject(new SourceClientError('SOURCE_CONNECTION_FAILED', 'Source response was interrupted.')))
      incoming.once('end', () => resolve({ status: incoming.statusCode ?? 0, buffer: Buffer.concat(chunks) }))
    })
    outgoing.once('error', reject)
    outgoing.end(body)
  }).catch((error: unknown) => {
    context.signal.throwIfAborted()
    if (error instanceof SourceClientError) throw error
    throw new SourceClientError('SOURCE_CONNECTION_FAILED', error instanceof Error ? error.message : String(error))
  })
  context.signal.throwIfAborted()
  if (options.discovery && (response.status < 200 || response.status >= 300)) throw new SourceClientError('DISCOVERY_HTTP_ERROR', 'Source discovery returned an HTTP error.', { status: response.status, responseBody: null })
  let parsed: unknown
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(response.buffer)
    if (text.trim().length === 0) throw new Error('empty response')
    parsed = JSON.parse(text) as unknown
  } catch {
    throw new SourceClientError(options.discovery ? 'DISCOVERY_PROTOCOL_ERROR' : 'CONTRACT_PROTOCOL_ERROR', 'Source response must contain one valid UTF-8 JSON value.')
  }
  if (response.status < 200 || response.status >= 300) throw new SourceClientError('SOURCE_HTTP_ERROR', 'Source service returned an HTTP error.', { status: response.status, responseBody: parsed })
  return { status: response.status, body: parsed }
}

import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryCatalog } from '../../src/host/source-client/catalog-client.ts'
import { readSourceRecord } from '../../src/host/source-client/source-client.ts'
import { sourceJsonRequest, withSourceRequest } from '../../src/host/source-client/http-client.ts'
import { semanticDiscovery, promptTermDiscovery, requestBody, startServer, startSecureServer, sendJson } from './fixtures/source-client-contract.mjs'

afterEach(() => vi.unstubAllEnvs())
const clients = [
  ['Catalog', (address, options = {}) => queryCatalog({ address, path: '/internal/semantic/base-models', input: { mode: 'search', query: '', page: 1, page_size: 20 }, ...options }), '/internal/semantic', semanticDiscovery],
  ['Source', (address, options = {}) => readSourceRecord({ address, operation: 'instance', id: '31', ...options }), '/internal/comfyui-source', () => ({ openapi: '3.1.0', paths: {} })],
]
const addressOf = server => ({ url: 'http://127.0.0.1', port: server.port })

describe('internal Catalog contract', () => {
  it('validates discovery and sends typed prompt-term filters', async () => {
    const requests = []
    const server = await startServer(async (request, response) => {
      requests.push({ method: request.method, path: request.url, body: await requestBody(request) })
      sendJson(response, 200, request.url === '/internal/semantic' ? promptTermDiscovery() : { results: [] })
    })
    const input = { mode: 'search', root_id: 'clothing', category_ids: ['skirts', 'dresses'], category_match: 'all', classification_status: 'classified' }
    try {
      await expect(queryCatalog({ address: addressOf(server), path: '/internal/semantic/prompt-terms', input })).resolves.toEqual({ results: [] })
      expect(requests).toEqual([{ method: 'GET', path: '/internal/semantic', body: '' }, { method: 'POST', path: '/internal/semantic/prompt-terms', body: JSON.stringify(input) }])
    } finally { await server.close() }
  })
  it.each([
    { mode: 'search', category_match: 'all' }, { mode: 'search', category_ids: [] },
    { mode: 'search', category_ids: ['skirts', 'skirts'] },
    { mode: 'search', category_ids: Array.from({ length: 17 }, (_, i) => 'category_' + i) },
    { mode: 'search', category_ids: ['INVALID'] }, { mode: 'search', root_id: 'INVALID' },
    { mode: 'search', classification_status: 'unknown' }, { mode: 'search', page: '1' },
    { mode: 'search', unsupported: true }, { mode: 'resolve' }, { mode: 'resolve', id: '1', query: 'extra' },
  ])('rejects invalid object input before the business request: %j', async input => {
    const paths = []
    const server = await startServer((request, response) => { paths.push(request.url); sendJson(response, 200, promptTermDiscovery()) })
    try {
      await expect(queryCatalog({ address: addressOf(server), path: '/internal/semantic/prompt-terms', input })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
      expect(paths).toEqual(['/internal/semantic'])
    } finally { await server.close() }
  })
  it.each(['operationId', 'toolName', 'schema', 'condition', 'root-example', 'root-default', 'branch-example', 'branch-default', 'named-example'])('rejects changed discovery %s before querying', async change => {
    const discovery = promptTermDiscovery()
    const operation = discovery.paths['/internal/semantic/prompt-terms'].post
    if (change === 'operationId') operation.operationId = 'different'
    if (change === 'toolName') operation['x-harness-tool-name'] = 'different'
    if (change === 'schema') operation.requestBody.content['application/json'].schema = { type: 'object' }
    if (change === 'condition') discovery.components.schemas.CatalogBaseModelSearchRequest.allOf = []
    if (change === 'root-example') discovery.components.schemas.CatalogBaseModelRequest.example = { mode: 'search', category_match: 'all' }
    if (change === 'root-default') discovery.components.schemas.CatalogBaseModelRequest.default = { mode: 'search', category_match: 'all' }
    if (change === 'branch-example') discovery.components.schemas.CatalogBaseModelSearchRequest.example = { mode: 'search', category_match: 'all' }
    if (change === 'branch-default') discovery.components.schemas.CatalogBaseModelSearchRequest.default = { mode: 'search', category_match: 'all' }
    if (change === 'named-example') operation.requestBody.content['application/json'].examples.search.value = { mode: 'search', category_match: 'all' }
    const server = await startServer((_request, response) => sendJson(response, 200, discovery))
    try { await expect(queryCatalog({ address: addressOf(server), path: '/internal/semantic/prompt-terms', input: { mode: 'search' } })).rejects.toMatchObject({ code: 'DISCOVERY_PROTOCOL_ERROR' }) } finally { await server.close() }
  })
  it('preserves empty successful results', async () => {
    const result = { status: 'ok', message: null, results: [], page: 1, page_size: 20, total_count: 0 }
    const server = await startServer((request, response) => sendJson(response, 200, request.url === '/internal/semantic' ? semanticDiscovery() : result))
    try { await expect(clients[0][1](addressOf(server))).resolves.toEqual(result) } finally { await server.close() }
  })
})

describe.each(clients)('%s internal data requests', (_name, invoke, discoveryPath, discovery) => {
  it.each([200, 503])('rejects malformed UTF-8 and JSON at HTTP %s', async status => {
    for (const bytes of [Buffer.alloc(0), Buffer.from(' '), Buffer.from('{broken'), Buffer.from('{} {}'), Buffer.from([0xc3, 0x28])]) {
      const server = await startServer((request, response) => {
        if (request.url === discoveryPath) sendJson(response, 200, discovery())
        else { response.writeHead(status); response.end(bytes) }
      })
      try { await expect(invoke(addressOf(server))).rejects.toMatchObject({ code: 'CONTRACT_PROTOCOL_ERROR' }) } finally { await server.close() }
    }
  })
  it('retains HTTP status and the service error', async () => {
    const errorBody = { error: { code: 'SOURCE_BUSY', message: 'retry later' } }
    const server = await startServer((request, response) => sendJson(response, request.url === discoveryPath ? 200 : 503, request.url === discoveryPath ? discovery() : errorBody))
    try { await expect(invoke(addressOf(server))).rejects.toMatchObject({ code: 'SOURCE_HTTP_ERROR', status: 503, responseBody: errorBody }) } finally { await server.close() }
  })
  it('reports a connection failure before discovery', async () => {
    const server = await startServer((_request, response) => response.end())
    const address = addressOf(server)
    await server.close()
    await expect(invoke(address)).rejects.toMatchObject({ code: 'SOURCE_CONNECTION_FAILED' })
  })
  it('reports a connection failure after discovery', async () => {
    const server = await startServer((request, response) => {
      if (request.url === discoveryPath) sendJson(response, 200, discovery())
      else request.socket.destroy()
    })
    try { await expect(invoke(addressOf(server))).rejects.toMatchObject({ code: 'SOURCE_CONNECTION_FAILED' }) } finally { await server.close() }
  })
  it('reports a response interrupted after its headers', async () => {
    const server = await startServer((request, response) => {
      if (request.url === discoveryPath) sendJson(response, 200, discovery())
      else { response.writeHead(200, { 'content-length': 100 }); response.write('{'); setImmediate(() => response.destroy()) }
    })
    try { await expect(invoke(addressOf(server))).rejects.toMatchObject({ code: 'SOURCE_CONNECTION_FAILED' }) } finally { await server.close() }
  })

  it.each(['discovery', 'business'])('enforces a total deadline during %s', async phase => {
    const server = await startServer((request, response) => {
      if (phase === 'business' && request.url === discoveryPath) sendJson(response, 200, discovery())
    })
    try { await expect(invoke(addressOf(server), { timeoutMs: 30 })).rejects.toMatchObject({ code: 'TOTAL_TIMEOUT' }) } finally { await server.close() }
  })
  it('rejects an already cancelled caller without a network request', async () => {
    const paths = []
    const server = await startServer((request, response) => { paths.push(request.url); response.end() })
    const controller = new AbortController()
    controller.abort()
    try {
      await expect(invoke(addressOf(server), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
      expect(paths).toEqual([])
    } finally { await server.close() }
  })
  it('cancels the active business request with the caller reason', async () => {
    const controller = new AbortController()
    const reason = new DOMException('cancel test', 'AbortError')
    const server = await startServer((request, response) => {
      if (request.url === discoveryPath) sendJson(response, 200, discovery())
      else controller.abort(reason)
    })
    try { await expect(invoke(addressOf(server), { signal: controller.signal })).rejects.toBe(reason) } finally { await server.close() }
  })
  it('uses HTTPS for discovery and the business request', async () => {
    vi.stubEnv('NODE_TLS_REJECT_UNAUTHORIZED', '0')
    const paths = []
    const server = await startSecureServer((request, response) => { paths.push(request.url); sendJson(response, 200, request.url === discoveryPath ? discovery() : { result: 'secure response' }) })
    try {
      await expect(invoke({ url: 'https://127.0.0.1', port: server.port })).resolves.toEqual({ result: 'secure response' })
      expect(paths).toHaveLength(2)
    } finally { await server.close() }
  })
})

describe('shared HTTP lifecycle', () => {
  it('rejects an oversized response while reading it', async () => {
    const server = await startServer((_request, response) => response.end('{"large":"0123456789"}'))
    try { await expect(withSourceRequest({ address: addressOf(server), timeoutMs: 1000, maxResponseBytes: 8 }, context => sourceJsonRequest(context, '/large'))).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' }) } finally { await server.close() }
  })
  it('keeps concurrent request cancellation independent', async () => {
    const first = new AbortController()
    const server = await startServer((request, response) => {
      if (request.url === '/internal/semantic') sendJson(response, 200, semanticDiscovery())
      else void requestBody(request).then(body => { if (JSON.parse(body).query === 'cancel') first.abort(); else sendJson(response, 200, { results: ['retained'] }) })
    })
    try {
      const address = addressOf(server)
      const results = await Promise.allSettled([
        queryCatalog({ address, path: '/internal/semantic/base-models', input: { mode: 'search', query: 'cancel' }, signal: first.signal }),
        queryCatalog({ address, path: '/internal/semantic/base-models', input: { mode: 'search', query: 'complete' } }),
      ])
      expect(results[0]).toMatchObject({ status: 'rejected', reason: { name: 'AbortError' } })
      expect(results[1]).toEqual({ status: 'fulfilled', value: { results: ['retained'] } })
    } finally { await server.close() }
  })
})

import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import { readSourceRecord } from '../../src/host/source-client/source-client.ts'
import { CatalogClient } from '../../src/host/catalog/catalog-client.ts'
import { GenerationSourceClient } from '../../src/host/generation/source-client.ts'
import { semanticDiscovery } from './fixtures/source-client-contract.mjs'

describe('internal Source reader', () => {
  it('reads discovery and a template bundle through an object request', async () => {
    const paths: string[] = []
    const bundle = { status: 'ok', message: null, results: [{ id: 29, title: 'WAI', workflow_json: { nodes: [] } }], page: 1, page_size: 1, total_count: 1 }
    const server = createServer((request, response) => {
      paths.push(request.url!)
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify(request.url === '/internal/comfyui-source' ? { openapi: '3.1.0', paths: {} } : bundle))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Test server has no port')
    try {
      await expect(readSourceRecord({ address: { url: 'http://127.0.0.1', port: address.port }, operation: 'template-bundle', id: '29' })).resolves.toEqual(bundle)
      expect(paths).toEqual(['/internal/comfyui-source', '/internal/comfyui-source/templates/29/bundle'])
    } finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})

describe('internal business consumers over HTTP', () => {
  it('serves UI search, details and base models through the internal Catalog client', async () => {
    const discovery = semanticDiscovery()
    discovery.paths['/internal/semantic/works'] = { post: {
      ...discovery.paths['/internal/semantic/base-models']!.post,
      operationId: 'querySemanticWorksForSkill',
      'x-harness-tool-name': 'query_semantic_works',
    } }
    const work = { id: 1, name: 'work', aliases_json: [], category_name: null, character_names: [], cover_url: null, sample_image_urls: [] }
    const requests: unknown[] = []
    const server = createServer(async (request, response) => {
      if (request.url === '/internal/semantic') { response.end(JSON.stringify(discovery)); return }
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      requests.push(input)
      response.end(JSON.stringify({ status: 'ok', message: null, results: request.url === '/internal/semantic/base-models' ? [{ id: 2, name: 'wai' }] : [work], page: input.page ?? 1, page_size: input.mode === 'resolve' ? 1 : input.page_size, total_count: 1 }))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Test server has no port')
    const client = new CatalogClient({ settings: { get: () => ({ url: 'http://127.0.0.1', port: address.port }) } })
    try {
      const signal = new AbortController().signal
      await expect(client.search({ kind: 'work', query: 'work', page: 1, baseModelId: null }, signal)).resolves.toMatchObject({ items: [{ label: 'work', context: { kind: 'work', id: '1', name: 'work' } }] })
      await expect(client.details({ kind: 'work', id: '1' }, signal)).resolves.toMatchObject({ kind: 'work', id: '1' })
      await expect(client.baseModels(signal)).resolves.toEqual({ items: [{ id: '2', label: 'wai' }] })
      expect(requests).toEqual([{ mode: 'search', query: 'work', page: 1, page_size: 8 }, { mode: 'resolve', id: '1' }, { mode: 'search', query: '', page: 1, page_size: 20 }])
    } finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('reads a generated Workflow and instance connection through GenerationSource', async () => {
    const server = createServer((request, response) => {
      const result = request.url?.includes('/instances/')
        ? { id: 2, title: 'ComfyUI', url: 'http://127.0.0.1:8188', credential_type: 'none' }
        : { id: 29, title: 'WAI', workflow_json: { nodes: [{ id: 1, type: 'SaveImage', widgets_values: ['output'] }] } }
      response.end(JSON.stringify(request.url === '/internal/comfyui-source' ? { openapi: '3.1.0', paths: {} } : { status: 'ok', message: null, results: [result], page: 1, page_size: 1, total_count: 1 }))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Test server has no port')
    const source = new GenerationSourceClient({ settings: { get: () => ({ url: 'http://127.0.0.1', port: address.port }) } })
    try {
      await expect(source.readInstance('2')).resolves.toEqual({ id: '2', title: 'ComfyUI', url: 'http://127.0.0.1:8188', credentialType: 'none', authorization: null })
      await expect(source.readTemplate('29')).resolves.toEqual({ id: '29', title: 'WAI', workflow: { nodes: [{ id: 1, type: 'SaveImage', widgets_values: ['output'] }] } })
    } finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})

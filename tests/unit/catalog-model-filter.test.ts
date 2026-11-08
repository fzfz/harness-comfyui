import { Context } from '@deepseek-ai/cordis'
import { createServer, type ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'

import { CatalogClient } from '../../src/host/catalog/catalog-client.ts'
import { CatalogRemoteService } from '../../src/host/catalog/catalog-service.ts'
import { semanticDiscovery } from './fixtures/source-client-contract.mjs'
import { createWorkbenchHostFixture } from '../support/workbench-host.ts'

type SourceInput = { mode: string; id?: string; query?: string; page?: number; page_size?: number; base_model_id?: string }
type SourceRequest = { path: string; input: SourceInput }
const MODEL = { id: 25, base_model_id: 4, file_name: 'selected.safetensors', description: null, usage: null, skill_name: null, cover_url: null, sample_image_urls: [] }

function scopedDiscovery() {
  const discovery = semanticDiscovery()
  const schemas = discovery.components.schemas as Record<string, { properties: Record<string, unknown> }>
  schemas.CatalogBaseModelSearchRequest!.properties.base_model_id = {
    type: 'string', minLength: 1, maxLength: 20, pattern: '^[1-9][0-9]{0,19}$', description: 'Exact base-model parent id', example: '4',
  }
  const operation = discovery.paths['/internal/semantic/base-models']!.post
  delete discovery.paths['/internal/semantic/base-models']
  for (const [slug, operationId, toolName] of [
    ['generation-models', 'querySemanticGenerationModelsForSkill', 'query_semantic_generation_models'],
    ['loras', 'querySemanticLorasForSkill', 'query_semantic_loras'],
    ['styles', 'querySemanticStylesForSkill', 'query_semantic_styles'],
    ['artist-prompt-strings', 'querySemanticArtistPromptStringsForSkill', 'query_semantic_artist_prompt_strings'],
    ['comfyui-templates', 'querySemanticComfyuiTemplatesForSkill', 'query_semantic_comfyui_templates'],
  ] as const) {
    discovery.paths[`/internal/semantic/${slug}`] = { post: { ...operation, operationId, 'x-harness-tool-name': toolName } }
  }
  return discovery
}

function sendPage(response: ServerResponse, input: SourceInput, results: readonly unknown[], totalCount = results.length) {
  response.end(JSON.stringify({
    status: 'ok', message: null, results, page: input.page ?? 1,
    page_size: input.mode === 'resolve' ? 1 : input.page_size, total_count: totalCount,
  }))
}

async function withSource(
  handler: (request: SourceRequest, response: ServerResponse) => void,
  run: (service: CatalogRemoteService, requests: SourceRequest[], catalog: CatalogClient) => Promise<void>,
) {
  const discovery = scopedDiscovery()
  const requests: SourceRequest[] = []
  const server = createServer(async (request, response) => {
    if (request.url === '/internal/semantic') { response.end(JSON.stringify(discovery)); return }
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const entry = { path: request.url!, input: JSON.parse(Buffer.concat(chunks).toString('utf8')) as SourceInput }
    requests.push(entry)
    handler(entry, response)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Catalog fixture has no TCP port')
  const catalog = new CatalogClient({ settings: { get: () => ({ url: 'http://127.0.0.1', port: address.port }) } })
  const context = new Context()
  try {
    await run(new CatalogRemoteService(context, catalog, () => ({ url: 'http://127.0.0.1', port: address.port })), requests, catalog)
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}


it('reads only the selected resources for a Workbench model preview and its confirmed change', async () => {
  const records = Array.from({ length: 19 }, (_, index) => ({
    id: index + 1, base_model_id: 4, model_id: index >= 8 && index < 18 ? 25 : 24,
    file_name: `lora-${index + 1}.safetensors`, file_format: 'safetensors', precision_or_quantization: 'fp16',
    author: null, version: null, description: '', usage: '', trigger_words_json: [], weight: 0.7, cover_url: null, sample_image_urls: [],
  }))
  await withSource(({ path, input }, response) => {
    if (path === '/internal/semantic/generation-models') {
      sendPage(response, input, [{ ...MODEL, file_format: 'safetensors', precision_or_quantization: 'fp16', author: null, version: null, description: 'Model guidance', usage: 'Use the selected model' }]); return
    }
    if (input.mode === 'resolve') { sendPage(response, input, records.filter(item => String(item.id) === input.id)); return }
    const start = (input.page! - 1) * input.page_size!
    sendPage(response, input, records.slice(start, start + input.page_size!), records.length)
  }, async (_service, requests, source) => {
    const host = await createWorkbenchHostFixture()
    try {
      const signal = new AbortController().signal
      const selected = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal)
      const scope = { workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId! }
      await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
      for (const id of ['9', '17', '19']) await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'lora', id } }, signal)
      Object.assign(host.catalog, {
        search: source.search.bind(source), details: source.details.bind(source), resolveGenerationModel: source.resolveGenerationModel.bind(source),
      })
      const before = (await host.remote.getProjection(scope, signal)).branches[0]!.draft
      expect(await host.remote.previewModelChange({ ...scope, modelId: '25' }, signal)).toEqual({
        model: { id: '25', label: 'selected.safetensors' }, removed: [{ kind: 'lora', id: '19', label: 'lora-19.safetensors' }],
      })
      expect(requests.filter(entry => entry.path === '/internal/semantic/loras').map(entry => entry.input)).toEqual(['9', '17', '19'].map(id => ({ mode: 'resolve', id })))
      expect(requests.some(entry => entry.input.mode === 'search')).toBe(false)
      expect((await host.remote.getProjection(scope, signal)).branches[0]!.draft).toEqual(before)
      requests.splice(0)

      await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '25', confirmedRemovals: [{ kind: 'lora', id: '19' }] } }, signal)
      expect(requests.filter(entry => entry.path === '/internal/semantic/loras').map(entry => entry.input)).toEqual(['9', '17', '19'].map(id => ({ mode: 'resolve', id })))
      expect(requests.some(entry => entry.input.mode === 'search')).toBe(false)
      const after = (await host.remote.getProjection(scope, signal)).branches[0]!.draft
      expect(after.generation_input.model).toEqual({ id: '25', file_name: 'selected.safetensors' })
      expect(after.generation_input.loras.map(lora => lora.id)).toEqual(['9', '17'])
    } finally { await host.dispose() }
  })
})


it.each([
  ['lora', ['2', '3']], ['comfyui-template', ['2', '3']],
  ['style', ['1', '2', '3']], ['artist-string', ['1', '2', '3']],
] as const)('keeps the Catalog %s association rules in the public search', async (kind, expected) => {
  const records = [24, null, 25].map((modelId, index) => ({
    id: index + 1, base_model_id: 4, model_id: modelId,
    file_name: 'resource.safetensors', title: 'Resource', name: 'Style', prompt_text: 'style', artist_string: '@artist',
    cover_url: null, sample_image_urls: [],
  }))
  await withSource(({ input }, response) => sendPage(response, input, input.mode === 'resolve' ? [MODEL] : records), async (service, requests) => {
    await expect(service.search({ kind, modelId: '25', baseModelId: null, query: '', page: 1 }, new AbortController().signal))
      .resolves.toMatchObject({ ok: true, value: { items: expected.map(id => ({ context: { id } })), totalCount: expected.length } })
    expect(requests.filter(entry => entry.input.mode === 'search').map(entry => entry.input)).toEqual([
      { mode: 'search', query: '', page: 1, page_size: 8, base_model_id: '4' },
    ])
  })
})

describe('Catalog model filtering through Remote and source HTTP', () => {
  it.each(['model', 'lora', 'comfyui-template', 'style', 'artist-string'] as const)('returns an empty %s page when the explicit base differs from the resolved model', async kind => {
    await withSource(({ input }, response) => sendPage(response, input, [MODEL]), async (service, requests) => {
      await expect(service.search({ kind, query: 'ink', page: 2, baseModelId: '1', modelId: '25' }, new AbortController().signal))
        .resolves.toEqual({ ok: true, value: { kind, query: 'ink', page: 2, items: [], totalCount: 0 } })
      expect(requests).toEqual([{ path: '/internal/semantic/generation-models', input: { mode: 'resolve', id: '25' } }])
    })
  })

  it('cancels an in-flight later source page without returning a partial Catalog page', async () => {
    const controller = new AbortController()
    await withSource(({ input }, response) => {
      if (input.mode === 'resolve') { sendPage(response, input, [MODEL]); return }
      if (input.page === 2) { controller.abort(); return }
      sendPage(response, input, Array.from({ length: 8 }, (_, index) => ({
        id: index + 1, base_model_id: 4, model_id: 25, file_name: `lora-${index + 1}`, cover_url: null, sample_image_urls: [],
      })), 24)
    }, async (service, requests) => {
      await expect(service.search({ kind: 'lora', query: 'ink', page: 1, baseModelId: '4', modelId: '25' }, controller.signal))
        .rejects.toMatchObject({ name: 'AbortError' })
      expect(requests.filter(entry => entry.input.mode === 'search').map(entry => entry.input.page)).toEqual([1, 2])
    })
  })

  it('returns a source failure on a later page and permits retrying the complete query', async () => {
    let failSecondPage = true
    await withSource(({ input }, response) => {
      if (input.mode === 'resolve') { sendPage(response, input, [MODEL]); return }
      if (input.page === 2 && failSecondPage) {
        failSecondPage = false
        response.statusCode = 503
        response.end(JSON.stringify({ status: 'error', message: 'Source unavailable' }))
        return
      }
      sendPage(response, input, input.page === 1
        ? Array.from({ length: 8 }, (_, index) => ({ id: index + 1, base_model_id: 4, model_id: 24, title: `template-${index + 1}`, cover_url: null, sample_image_urls: [] }))
        : [{ id: 9, base_model_id: 4, model_id: 25, title: 'matching template', cover_url: null, sample_image_urls: [] }], 9)
    }, async service => {
      const request = { kind: 'comfyui-template', query: 'ink', page: 1, baseModelId: '4', modelId: '25' } as const
      await expect(service.search(request, new AbortController().signal))
        .resolves.toMatchObject({ ok: false, error: { code: 'CATALOG_QUERY_FAILED', message: expect.stringContaining('Source unavailable') } })
      await expect(service.search(request, new AbortController().signal))
        .resolves.toMatchObject({ ok: true, value: { totalCount: 1, items: [{ context: { id: '9' } }] } })
    })
  })

  it.each([undefined, '0', 'invalid', 0] as const)('reports malformed source model associations %j through Remote', async modelId => {
    await withSource(({ input }, response) => sendPage(response, input, [input.mode === 'resolve' ? MODEL : {
      id: 1, base_model_id: 4, model_id: modelId, file_name: 'lora', cover_url: null, sample_image_urls: [],
    }]), async service => {
      await expect(service.search({ kind: 'lora', query: '', page: 1, baseModelId: '4', modelId: '25' }, new AbortController().signal))
        .resolves.toMatchObject({ ok: false, error: { code: 'CATALOG_PROTOCOL_ERROR' } })
    })
  })

  it('rejects an unrelated model returned by source resolution', async () => {
    await withSource(({ input }, response) => sendPage(response, input, [{ ...MODEL, id: 24 }]), async (service, requests) => {
      await expect(service.search({ kind: 'lora', query: '', page: 1, baseModelId: null, modelId: '25' }, new AbortController().signal))
        .resolves.toMatchObject({ ok: false, error: { code: 'CATALOG_PROTOCOL_ERROR' } })
      expect(requests).toHaveLength(1)
    })
  })

  it('finds the selected model beyond the first source page and keeps the source keyword result', async () => {
    const records = [
      { ...MODEL, id: 1 }, { ...MODEL, id: 2 }, { ...MODEL, id: 3 }, { ...MODEL, id: 4 },
      { ...MODEL, id: 5 }, { ...MODEL, id: 6 }, { ...MODEL, id: 7 }, { ...MODEL, id: 8 },
      MODEL, { ...MODEL, id: 26 },
    ]
    await withSource(({ input }, response) => {
      if (input.mode === 'resolve') { sendPage(response, input, [MODEL]); return }
      if (input.query === 'excluded by source') { sendPage(response, input, [], 0); return }
      const start = (input.page! - 1) * input.page_size!
      sendPage(response, input, records.slice(start, start + input.page_size!), 10)
    }, async (service, requests) => {
      const request = { kind: 'model', query: 'source phrase', page: 1, baseModelId: '4', modelId: '25' } as const
      const first = await service.search(request, new AbortController().signal)
      expect(first.ok).toBe(true)
      if (!first.ok) throw new Error(first.error.message)
      expect(first.value.totalCount).toBe(1)
      expect(first.value.items.map(item => item.context.id)).toEqual(['25'])
      await expect(service.search({ ...request, page: 2 }, new AbortController().signal))
        .resolves.toEqual({ ok: true, value: { kind: 'model', query: 'source phrase', page: 2, totalCount: 1, items: [] } })
      await expect(service.search({ ...request, query: 'excluded by source' }, new AbortController().signal))
        .resolves.toEqual({ ok: true, value: { kind: 'model', query: 'excluded by source', page: 1, totalCount: 0, items: [] } })
      expect(requests.at(-1)).toEqual({ path: '/internal/semantic/generation-models', input: { mode: 'search', query: 'excluded by source', page: 1, page_size: 8, base_model_id: '4' } })
    })
  })

  it.each(['lora', 'comfyui-template'] as const)('counts and paginates all matching %s records across source pages', async kind => {
    const records = [24, 24, 24, 24, 24, 24, 24, 24, 25, 25, 25, 25, 25, 25, 25, 25, null, 25, 26].map((modelId, index) => ({
      id: index + 1, base_model_id: 4, model_id: modelId, file_name: `lora-${index + 1}`, title: `template-${index + 1}`, cover_url: null, sample_image_urls: [],
    }))
    await withSource(({ input }, response) => {
      if (input.mode === 'resolve') { sendPage(response, input, [MODEL]); return }
      const start = (input.page! - 1) * input.page_size!
      sendPage(response, input, records.slice(start, start + input.page_size!), 19)
    }, async (service, requests) => {
      const request = { kind, query: 'source-ranked phrase', page: 1, baseModelId: '4', modelId: '25' } as const
      const first = await service.search(request, new AbortController().signal)
      expect(first.ok).toBe(true)
      if (!first.ok) throw new Error(first.error.message)
      expect(first.value.totalCount).toBe(10)
      expect(first.value.items.map(item => item.context.id)).toEqual(['9', '10', '11', '12', '13', '14', '15', '16'])
      const second = await service.search({ ...request, page: 2 }, new AbortController().signal)
      expect(second.ok).toBe(true)
      if (!second.ok) throw new Error(second.error.message)
      expect(second.value.totalCount).toBe(10)
      expect(second.value.items.map(item => item.context.id)).toEqual(['17', '18'])
      await expect(service.search({ ...request, page: 3 }, new AbortController().signal))
        .resolves.toEqual({ ok: true, value: { kind, query: 'source-ranked phrase', page: 3, totalCount: 10, items: [] } })
      expect(requests.filter(entry => entry.input.mode === 'search').map(entry => entry.input)).toEqual([
        { mode: 'search', query: 'source-ranked phrase', page: 1, page_size: 8, base_model_id: '4' },
        { mode: 'search', query: 'source-ranked phrase', page: 2, page_size: 8, base_model_id: '4' },
        { mode: 'search', query: 'source-ranked phrase', page: 3, page_size: 8, base_model_id: '4' },
        { mode: 'search', query: 'source-ranked phrase', page: 1, page_size: 8, base_model_id: '4' },
        { mode: 'search', query: 'source-ranked phrase', page: 2, page_size: 8, base_model_id: '4' },
        { mode: 'search', query: 'source-ranked phrase', page: 3, page_size: 8, base_model_id: '4' },
        { mode: 'search', query: 'source-ranked phrase', page: 1, page_size: 8, base_model_id: '4' },
        { mode: 'search', query: 'source-ranked phrase', page: 2, page_size: 8, base_model_id: '4' },
        { mode: 'search', query: 'source-ranked phrase', page: 3, page_size: 8, base_model_id: '4' },
      ])
    })
  })

  it.each([
    ['style', 'styles', { id: 1, base_model_id: 4, name: 'style', prompt_text: 'style', cover_url: null, sample_image_urls: [] }],
    ['artist-string', 'artist-prompt-strings', { id: 2, base_model_id: 4, title: 'artists', artist_string: '@artist', cover_url: null, sample_image_urls: [] }],
  ] as const)('limits %s to the resolved model base and preserves source search pagination', async (kind, slug, record) => {
    await withSource(({ input }, response) => sendPage(response, input, [input.mode === 'resolve' ? MODEL : record], input.mode === 'resolve' ? 1 : 9), async (service, requests) => {
      await expect(service.search({ kind, query: 'ink', page: 2, baseModelId: null, modelId: '25' }, new AbortController().signal))
        .resolves.toMatchObject({ ok: true, value: { kind, page: 2, query: 'ink', totalCount: 9, items: [{ baseModelId: '4' }] } })
      expect(requests).toEqual([
        { path: '/internal/semantic/generation-models', input: { mode: 'resolve', id: '25' } },
        { path: `/internal/semantic/${slug}`, input: { mode: 'search', query: 'ink', page: 2, page_size: 8, base_model_id: '4' } },
      ])
    })
  })
})

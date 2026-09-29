import { describe, expect, it, vi } from 'vitest'
import { CatalogCli, type CatalogCliProcess } from '../../src/host/catalog/catalog-cli.ts'

const work = { id: 1, name: '作品', aliases_json: ['别名'], category_name: '游戏', character_names: ['角色'], cover_url: null, sample_image_urls: [] }
function cli(source: unknown) {
  const process = vi.fn<CatalogCliProcess>(async () => ({ exitCode: 0, stderr: '', stdout: JSON.stringify({ status: 'ok', message: null, page: 1, page_size: 1, total_count: 1, results: [source] }) }))
  return { process, api: new CatalogCli({ executable: '/source/catalog.mjs', settings: { get: () => ({ url: 'http://127.0.0.1', port: 18093 }) }, process }) }
}
describe('Catalog details', () => {
  it('resolves a work by identity and projects its own readable fields', async () => {
    const { api, process } = cli({ ...work, workflow_json: { private: true } })
    const signal = new AbortController().signal
    const details = await api.details({ kind: 'work', id: '1' }, signal)
    expect(details).toEqual({ kind: 'work', id: '1', fields: [
      { key: 'id', value: '1' }, { key: 'name', value: '作品' }, { key: 'aliases_json', value: ['别名'] },
      { key: 'category_name', value: '游戏' }, { key: 'character_names', value: ['角色'] },
    ] })
    expect(process.mock.calls[0]?.[1]).toEqual(expect.arrayContaining(['--path', '/internal/semantic/works', '--mode', 'resolve', '--id', '1']))
    expect(process.mock.calls[0]?.[2]).toBe(signal)
  })
})

import { parseCatalogDetails, parseCatalogDetailsRequest, parseCatalogDetailsResult } from '../../src/catalog/details-schema.ts'
import { CATALOG_REMOTE } from '../../src/remote.ts'

it.each([
  null, [], {}, { kind: 'unknown', id: '1' }, { kind: 'work', id: '0' }, { kind: 'work', id: '1', extra: true },
])('rejects an invalid details request %j', value => {
  expect(() => parseCatalogDetailsRequest(value)).toThrow()
})
it.each([
  { ...work, id: 2 }, { ...work, category_name: 1 }, { ...work, aliases_json: {} },
  { ...work, aliases_json: [true] }, { ...work, character_names: undefined },
])('rejects malformed details or a response for another identity %#', async source => {
  await expect(cli(source).api.details({ kind: 'work', id: '1' }, new AbortController().signal)).rejects.toMatchObject({ code: 'CATALOG_PROTOCOL_ERROR' })
})
it('preserves nulls, empty lists and multiline text, with strict remote fields', async () => {
  const detail = await cli({ ...work, aliases_json: [], category_name: null, name: '第一行\n第二行' }).api.details({ kind: 'work', id: '1' }, new AbortController().signal)
  expect(detail.fields[1]?.value).toBe('第一行\n第二行')
  expect(detail.fields[2]?.value).toEqual([])
  expect(detail.fields[3]?.value).toBeNull()
  expect(parseCatalogDetailsResult({ ok: true, value: detail })).toEqual({ ok: true, value: detail })
  const descriptor = CATALOG_REMOTE.descriptors.find(item => item.method === 'details')!
  expect((descriptor.parameters[0]!.codec as { create: () => { parse: (value: unknown) => unknown } }).create().parse({ kind: 'work', id: '1' })).toEqual({ kind: 'work', id: '1' })
  expect((descriptor.result as { create: () => { parse: (value: unknown) => unknown } }).create().parse({ ok: true, value: detail })).toEqual({ ok: true, value: detail })
  for (const bad of [null, { ...detail, extra: true }, { ...detail, fields: [] }, { ...detail, fields: [{ key: 'secret', value: 'x' }, ...detail.fields.slice(1)] }]) expect(() => parseCatalogDetails(bad)).toThrow()
})
it('keeps zero-valued tag counts and numeric categories', async () => {
  const detail = await cli({ id: 1, canonical_tag: 'tag', aliases_json: [], category: 0, post_count: 0 }).api.details({ kind: 'prompt-term', id: '1' }, new AbortController().signal)
  expect(detail.fields).toEqual([{ key: 'id', value: '1' }, { key: 'canonical_tag', value: 'tag' }, { key: 'aliases_json', value: [] }, { key: 'category', value: 0 }, { key: 'post_count', value: 0 }])
  await expect(cli({ id: 1, canonical_tag: 'tag', aliases_json: [], category: '0', post_count: 0 }).api.details({ kind: 'prompt-term', id: '1' }, new AbortController().signal)).rejects.toMatchObject({ code: 'CATALOG_PROTOCOL_ERROR' })
})
it.each([
  ['model', { id: 1, base_model_id: 2, file_name: 'model', file_format: 'safetensors', precision_or_quantization: 'fp16', author: null, version: null, description: '模型', usage: '方法', skill_name: null }, ['id', 'base_model_id', 'file_name', 'file_format', 'precision_or_quantization', 'author', 'version', 'description', 'usage', 'skill_name']],
  ['lora', { id: 1, base_model_id: 2, model_id: 3, file_name: 'lora', file_format: 'safetensors', precision_or_quantization: 'fp16', author: '作者', version: 'v1', description: '说明', usage: '方法', trigger_words_json: ['a', 'b'], weight: 0 }, ['id', 'base_model_id', 'model_id', 'file_name', 'file_format', 'precision_or_quantization', 'author', 'version', 'description', 'usage', 'trigger_words_json', 'weight']],
  ['character', { id: 1, work_id: 2, 'works.name': '作品', name: '角色', aliases_json: [], prompt_text: '长文本\n第二行' }, ['id', 'work_id', 'works.name', 'name', 'aliases_json', 'prompt_text']],
  ['style', { id: 1, base_model_id: 2, name: '画风', aliases_json: [], prompt_text: 'tag', style_description: '描述' }, ['id', 'base_model_id', 'name', 'aliases_json', 'prompt_text', 'style_description']],
  ['artist-string', { id: 1, base_model_id: 2, title: '画师串', description: '描述', artist_string: 'a,b', style_ids: [1, 2] }, ['id', 'base_model_id', 'title', 'description', 'artist_string', 'style_ids']],
  ['comfyui-template', { id: 1, base_model_id: 2, model_id: null, lora_id: null, title: '模板', template_type: 'text_to_image', workflow_json: { nodes: [] } }, ['id', 'base_model_id', 'model_id', 'lora_id', 'title', 'template_type']],
] as const)('uses the approved %s detail fields', async (kind, source, keys) => {
  const details = await cli(source).api.details({ kind, id: '1' }, new AbortController().signal)
  expect(details.kind).toBe(kind)
  expect(details.fields.map(field => field.key)).toEqual(keys)
  expect(JSON.stringify(details)).not.toContain('workflow_json')
})

import { CATALOG_PRESENTATION, parseCatalogPresentation } from '../../src/catalog/presentation-schema.ts'
it('validates the shared card and detail presentation configuration', () => {
  expect(parseCatalogPresentation(CATALOG_PRESENTATION).pageSize).toBe(8)
  const bad = [{ ...CATALOG_PRESENTATION, fields: { ...CATALOG_PRESENTATION.fields, name: { label: 'Name', type: ['text'] } } }, null, {}, { ...CATALOG_PRESENTATION, pageSize: 9 }, { ...CATALOG_PRESENTATION, copy: {} },
    { ...CATALOG_PRESENTATION, fields: { ...CATALOG_PRESENTATION.fields, id: { label: '', type: 'id' } } },
    { ...CATALOG_PRESENTATION, fields: { ...CATALOG_PRESENTATION.fields, id: { label: 'ID', type: 'unknown' } } },
    { ...CATALOG_PRESENTATION, kinds: { ...CATALOG_PRESENTATION.kinds, work: { details: ['id', 'unknown'], summary: [] } } },
    { ...CATALOG_PRESENTATION, kinds: { ...CATALOG_PRESENTATION.kinds, work: { details: ['id', 'name'], summary: ['name', 'name'] } } },
    { ...CATALOG_PRESENTATION, kinds: { ...CATALOG_PRESENTATION.kinds, work: { details: ['name'], summary: [] } } },
    { ...CATALOG_PRESENTATION, kinds: { ...CATALOG_PRESENTATION.kinds, work: { details: ['id'], summary: ['name'] } } },
  ]
  for (const value of bad) expect(() => parseCatalogPresentation(value)).toThrow()
})

it.each([
  { exitCode: 0, stderr: '', stdout: JSON.stringify({ status: 'ok', message: null, results: [], page: 1, page_size: 1, total_count: 0 }), code: 'CATALOG_PROTOCOL_ERROR' },
  { exitCode: 1, stderr: 'unavailable', stdout: '', code: 'CATALOG_QUERY_FAILED' },
])('reports missing records and failed source queries %#', async ({ code, ...result }) => {
  const api = new CatalogCli({ executable: '/source/catalog.mjs', settings: { get: () => ({ url: 'http://127.0.0.1', port: 18093 }) }, process: async () => result })
  await expect(api.details({ kind: 'work', id: '1' }, new AbortController().signal)).rejects.toMatchObject({ code })
})

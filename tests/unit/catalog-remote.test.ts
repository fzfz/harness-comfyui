import { describe, expect, it } from 'vitest'

import {
  CATALOG_REMOTE,
  HARNESS_COMFYUI_REMOTE,
} from '../../src/remote.ts'

describe('Catalog Remote contribution', () => {
  it('assembles every plugin method under one Typert package registration', () => {
    expect(HARNESS_COMFYUI_REMOTE.package).toBe('harness-comfyui')
    expect(HARNESS_COMFYUI_REMOTE.descriptors.map(descriptor => descriptor.id)).toEqual([
      'harness-comfyui#harnessComfyuiCatalog/search',
      'harness-comfyui#harnessComfyuiCatalog/baseModels',
      'harness-comfyui#harnessComfyuiGeneration/list',
    ])
  })

  it('mounts strict cancellable catalog and base-model methods', () => {
    expect(CATALOG_REMOTE.package).toBe('harness-comfyui')
    expect(CATALOG_REMOTE.descriptors).toHaveLength(2)
    expect(CATALOG_REMOTE.descriptors[0]).toMatchObject({
      service: 'harnessComfyuiCatalog',
      namespace: 'harnessComfyuiCatalog',
      method: 'search',
      invocation: { kind: 'direct' },
      cancellation: { parameter: 'signal' },
      result: { mode: 'strict' },
    })
    expect(CATALOG_REMOTE.descriptors[0]!.parameters[0]).toMatchObject({
      name: 'request',
      wire: 'request',
      source: 'json',
      codec: { mode: 'strict' },
    })
    expect(CATALOG_REMOTE.descriptors[1]).toMatchObject({
      service: 'harnessComfyuiCatalog',
      namespace: 'harnessComfyuiCatalog',
      method: 'baseModels',
      parameters: [],
      cancellation: { parameter: 'signal' },
      result: { mode: 'strict' },
    })
  })

  it('uses the shared strict parsers for request and result values', () => {
    const descriptor = CATALOG_REMOTE.descriptors[0]!
    const request = descriptor.parameters[0]!.codec
    if (request.mode !== 'strict' || descriptor.result.mode !== 'strict') throw new Error('strict codecs required')
    expect(request.schema.parse({ kind: 'model', query: '', page: 1, baseModelId: null }))
      .toEqual({ kind: 'model', query: '', page: 1, baseModelId: null })
    expect(descriptor.result.schema.parse({
      kind: 'model',
      query: '',
      page: 1,
      items: [{
        context: { kind: 'model', id: '1', file_name: 'model.safetensors' },
        label: 'model.safetensors',
        subtitle: 'safetensors',
        coverUrl: null,
      }],
      totalCount: 1,
    })).toEqual({
      kind: 'model',
      query: '',
      page: 1,
      items: [{
        context: { kind: 'model', id: '1', file_name: 'model.safetensors' },
        label: 'model.safetensors',
        subtitle: 'safetensors',
        coverUrl: null,
      }],
      totalCount: 1,
    })
    const baseModels = CATALOG_REMOTE.descriptors[1]!
    if (baseModels.result.mode !== 'strict') throw new Error('strict codec required')
    expect(baseModels.result.schema.parse({ items: [{ id: '2', label: 'wai' }] }))
      .toEqual({ items: [{ id: '2', label: 'wai' }] })
  })
})

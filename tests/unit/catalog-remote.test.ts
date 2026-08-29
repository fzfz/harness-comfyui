import { describe, expect, it } from 'vitest'

import {
  CATALOG_REMOTE,
  HARNESS_COMFYUI_REMOTE,
} from '../../src/remote.ts'
import IMAGE_READER_REMOTE from '../../src/image-reader/remote.ts'

describe('Catalog Remote contribution', () => {
  it('assembles every plugin method under one Typert package registration', () => {
    expect(HARNESS_COMFYUI_REMOTE.package).toBe('harness-comfyui')
    expect(HARNESS_COMFYUI_REMOTE.descriptors.map(descriptor => descriptor.id)).toEqual([
      'harness-comfyui#harnessComfyuiCatalog/search',
      'harness-comfyui#harnessComfyuiCatalog/baseModels',
      'harness-comfyui#harnessComfyuiGeneration/list',
      'harness-comfyui#harnessComfyuiImageReader/models',
      'harness-comfyui#harnessComfyuiImageReader/saveSettings',
    ])
  })

  it('mounts a strict cancellable image-reader settings write method', () => {
    const descriptor = IMAGE_READER_REMOTE.descriptors[1]!
    expect(descriptor).toMatchObject({
      service: 'harnessComfyuiImageReader',
      namespace: 'harnessComfyuiImageReader',
      method: 'saveSettings',
      cancellation: { parameter: 'signal' },
      result: { mode: 'strict' },
    })
    const request = descriptor.parameters[0]!.codec
    if (request.mode !== 'strict' || descriptor.result.mode !== 'strict') throw new Error('strict codecs required')
    const configuration = {
      activeProfileId: 'runtime',
      profiles: [{
        id: 'runtime', name: '系统视觉', connectionType: 'runtime', provider: 'provider-a', endpoint: '',
        model: 'vision-a', hasApiKey: false, defaultPrompt: '描述图片', temperature: 0.2, maxTokens: 2048,
      }],
    }
    const credentialUpdates = [
      { profileId: 'runtime', apiKey: 'replacement' },
      { profileId: 'custom', apiKey: null },
    ]
    expect(request.schema.parse({ configuration, credentialUpdates })).toEqual({ configuration, credentialUpdates })
    expect(descriptor.result.schema.parse({ configuration })).toEqual({ configuration })
    expect(() => request.schema.parse({ configuration, credentialUpdates: [], apiKey: 'leak' })).toThrow('properties')
    expect(() => request.schema.parse({
      configuration,
      credentialUpdates: [{ profileId: 'runtime', apiKey: 'first' }, { profileId: 'runtime', apiKey: 'second' }],
    })).toThrow('duplicate profile ids')
  })

  it('mounts the strict cancellable runtime visual-model catalog', () => {
    const descriptor = IMAGE_READER_REMOTE.descriptors[0]!
    expect(descriptor).toMatchObject({
      service: 'harnessComfyuiImageReader',
      namespace: 'harnessComfyuiImageReader',
      method: 'models',
      parameters: [],
      cancellation: { parameter: 'signal' },
      result: { mode: 'strict' },
    })
    const result = descriptor.result
    if (result.mode !== 'strict') throw new Error('strict codec required')
    expect(result.schema.parse({
      groups: [{
        provider: 'provider-a',
        name: 'Provider A',
        models: [{ id: 'vision-a', name: 'Vision A', description: null }],
      }],
      failures: [{ provider: 'provider-b', message: 'catalog unavailable' }],
    })).toEqual({
      groups: [{
        provider: 'provider-a',
        name: 'Provider A',
        models: [{ id: 'vision-a', name: 'Vision A', description: null }],
      }],
      failures: [{ provider: 'provider-b', message: 'catalog unavailable' }],
    })
    expect(() => result.schema.parse({ groups: [], failures: [], provider: 'hardcoded' })).toThrow('properties')
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
      ok: true,
      value: {
        kind: 'model',
        query: '',
        page: 1,
        items: [{
          context: { kind: 'model', id: '1', file_name: 'model.safetensors' },
          label: 'model.safetensors',
          subtitle: 'safetensors',
          coverUrl: null,
          sampleImageUrls: [],
        }],
        totalCount: 1,
      },
    })).toEqual({
      ok: true,
      value: {
        kind: 'model',
        query: '',
        page: 1,
        items: [{
          context: { kind: 'model', id: '1', file_name: 'model.safetensors' },
          label: 'model.safetensors',
          subtitle: 'safetensors',
          coverUrl: null,
          sampleImageUrls: [],
        }],
        totalCount: 1,
      },
    })
    const baseModels = CATALOG_REMOTE.descriptors[1]!
    if (baseModels.result.mode !== 'strict') throw new Error('strict codec required')
    expect(baseModels.result.schema.parse({ ok: true, value: { items: [{ id: '2', label: 'wai' }] } }))
      .toEqual({ ok: true, value: { items: [{ id: '2', label: 'wai' }] } })
  })

  it('rejects an old Host result that omits sampleImageUrls', () => {
    const descriptor = CATALOG_REMOTE.descriptors[0]!
    const result = descriptor.result
    if (result.mode !== 'strict') throw new Error('strict codec required')
    expect(() => result.schema.parse({
      ok: true,
      value: {
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
      },
    })).toThrow('properties')
  })
})

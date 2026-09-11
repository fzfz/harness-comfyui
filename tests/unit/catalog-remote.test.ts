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
      'harness-comfyui#harnessComfyuiCatalog/details',
      'harness-comfyui#harnessComfyuiGeneration/list',
      'harness-comfyui#harnessComfyuiImageReader/models',
      'harness-comfyui#harnessComfyuiImageReader/activateProfile',
      'harness-comfyui#harnessComfyuiImageReader/saveProfile',
      'harness-comfyui#harnessComfyuiImageReader/deleteProfile',
    ])
  })

  it('mounts strict cancellable current-profile save and delete methods', () => {
    const descriptor = IMAGE_READER_REMOTE.descriptors.find(candidate => candidate.method === 'saveProfile')!
    expect(descriptor).toMatchObject({
      service: 'harnessComfyuiImageReader',
      namespace: 'harnessComfyuiImageReader',
      method: 'saveProfile',
      cancellation: { parameter: 'signal' },
      result: { mode: 'strict' },
    })
    const request = descriptor.parameters[0]!.codec
    if (request.mode !== 'strict' || descriptor.result.mode !== 'strict') throw new Error('strict codecs required')
    const savedConfiguration = {
      activeProfileId: 'runtime',
      profiles: [{
        id: 'runtime', name: '系统视觉', connectionType: 'runtime', provider: 'provider-a', endpoint: '',
        model: 'vision-a', hasApiKey: false, defaultPrompt: '描述图片', temperature: 0.2, maxTokens: 2048,
      }],
    }
    const runtime = {
      operation: 'create',
      activateProfileId: 'runtime',
      profile: {
        id: 'runtime', name: '', connectionType: 'runtime', provider: '', model: '',
        defaultPrompt: '', temperature: Number.NaN, maxTokens: 0,
      },
    }
    const custom = {
      operation: 'update',
      activateProfileId: 'custom',
      profile: {
        id: 'custom', name: '本地视觉', connectionType: 'openai-compatible', endpoint: 'not-a-url', model: 'qwen-vl',
        defaultPrompt: '描述图片', temperature: 0.2, maxTokens: 2048,
      },
      credential: { action: 'replace', apiKey: '' },
    }
    expect(request.schema.parse(runtime)).toEqual(runtime)
    expect(request.schema.parse(custom)).toEqual(custom)
    expect(descriptor.result.schema.parse({ configuration: savedConfiguration })).toEqual({ configuration: savedConfiguration })
    expect(() => request.schema.parse({ ...runtime, credential: { action: 'keep' } })).toThrow('properties')
    expect(() => request.schema.parse({ ...runtime, profile: { ...runtime.profile, endpoint: '' } })).toThrow('properties')
    expect(() => request.schema.parse({ ...custom, profile: { ...custom.profile, provider: '' }, credential: { action: 'keep' } })).toThrow('properties')
    expect(() => request.schema.parse({ profile: runtime.profile })).toThrow()

    const activation = IMAGE_READER_REMOTE.descriptors.find(candidate => candidate.method === 'activateProfile')!
    expect(activation).toMatchObject({
      service: 'harnessComfyuiImageReader',
      namespace: 'harnessComfyuiImageReader',
      method: 'activateProfile',
      cancellation: { parameter: 'signal' },
      result: { mode: 'strict' },
    })
    const activateRequest = activation.parameters[0]!.codec
    if (activateRequest.mode !== 'strict' || activation.result.mode !== 'strict') throw new Error('strict codecs required')
    expect(activateRequest.schema.parse({ profileId: '' })).toEqual({ profileId: '' })
    expect(activation.result.schema.parse({ configuration: savedConfiguration })).toEqual({ configuration: savedConfiguration })
    expect(() => activateRequest.schema.parse({ profileId: 'runtime', force: true })).toThrow('properties')

    const deletion = IMAGE_READER_REMOTE.descriptors.find(candidate => candidate.method === 'deleteProfile')!
    expect(deletion).toMatchObject({
      service: 'harnessComfyuiImageReader',
      namespace: 'harnessComfyuiImageReader',
      method: 'deleteProfile',
      cancellation: { parameter: 'signal' },
      result: { mode: 'strict' },
    })
    const deleteRequest = deletion.parameters[0]!.codec
    if (deleteRequest.mode !== 'strict' || deletion.result.mode !== 'strict') throw new Error('strict codecs required')
    expect(deleteRequest.schema.parse({ profileId: '' })).toEqual({ profileId: '' })
    expect(deletion.result.schema.parse({ configuration: savedConfiguration })).toEqual({ configuration: savedConfiguration })
    expect(() => deleteRequest.schema.parse({ profileId: 'runtime', force: true })).toThrow('properties')
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
    expect(CATALOG_REMOTE.descriptors).toHaveLength(3)
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

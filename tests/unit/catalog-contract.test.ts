import { describe, expect, it } from 'vitest'

import {
  CATALOG_COMFYUI_INSTANCE_QUERY,
  CATALOG_KIND_DEFINITIONS,
  catalogPageCount,
  catalogResourceCompatible,
  contextLabel,
  parseBaseModelList,
  parseBaseModelResult,
  parseCatalogComfyuiInstancePage,
  parseCatalogComfyuiInstanceQueryRequest,
  parseCatalogContext,
  parseCatalogPage,
  parseCatalogPageNumber,
  parseCatalogPageResult,
  parseCatalogQueryRequest,
  parseCatalogQueryText,
  parseCatalogResolvedGenerationModel,
  parseCatalogResolvedLora,
  parseCatalogResolvedTemplate,
  parseCatalogStableId,
} from '../../src/catalog/contract.ts'

const COVER = 'https://catalog.example.com/media/images/model.webp'
const SAMPLE = 'http://192.168.1.20:18092/media/images/model-sample.webp'

describe('catalog Remote contract', () => {
  it('requires an explicit nullable generation-model filter in scoped query requests', () => {
    const request = { kind: 'lora', query: '', page: 1, baseModelId: '2', modelId: '15' } as const
    expect(parseCatalogQueryRequest(request)).toEqual(request)
    expect(parseCatalogQueryRequest({ ...request, modelId: null })).toEqual({ ...request, modelId: null })
    const { modelId: omitted, ...withoutModel } = request
    expect(() => parseCatalogQueryRequest(withoutModel)).toThrow('properties')
    expect(() => parseCatalogQueryRequest({ ...request, modelId: '0' })).toThrow('id')
    expect(() => parseCatalogQueryRequest({ ...request, kind: 'work', baseModelId: null })).toThrow(TypeError)
  })

  it('defines the eight insertable CLI catalog kinds in product order', () => {
    expect(CATALOG_KIND_DEFINITIONS.map(definition => [definition.kind, definition.label])).toEqual([
      ['model', '生成模型'],
      ['lora', 'LoRA'],
      ['work', '作品'],
      ['character', '角色'],
      ['style', '画师或画风'],
      ['prompt-term', '提示词条目'],
      ['artist-string', '画师串'],
      ['comfyui-template', 'Workflow 模板'],
    ])
  })

  it('detaches valid filtered query, card page, and base-model values', () => {
    const request = { kind: 'model', query: 'soft', page: 2, baseModelId: '2', modelId: null } as const
    const page = {
      kind: 'model',
      query: 'soft',
      page: 2,
      items: [{ modelId: null,
        context: { kind: 'model', id: '15', file_name: 'rinSoftsketch_v20.safetensors' },
        baseModelId: '2',
        label: 'rinSoftsketch_v20.safetensors',
        subtitle: 'safetensors',
        coverUrl: COVER,
        sampleImageUrls: [SAMPLE],
      }],
      totalCount: 15,
    } as const

    expect(parseCatalogQueryRequest(request)).toEqual(request)
    const parsedPage = parseCatalogPage(page)
    expect(parsedPage).toEqual(page)
    expect(Object.isFrozen(parsedPage.items[0]!.sampleImageUrls)).toBe(true)
    expect(parseBaseModelList({ items: [{ id: '2', label: 'wai' }] }))
      .toEqual({ items: [{ id: '2', label: 'wai' }] })
    expect(contextLabel(page.items[0].context)).toBe('生成模型 · rinSoftsketch_v20.safetensors')
    expect(catalogPageCount(0)).toBe(1)
    expect(catalogPageCount(13)).toBe(2)
  })

  it.each([null, '2', '12345678901234567890'])('preserves nullable base-model ids in public card pages: %j', baseModelId => {
    const page = {
      kind: 'model',
      query: '',
      page: 1,
      items: [{ modelId: null,
        context: { kind: 'model', id: '15', file_name: 'model.safetensors' },
        baseModelId,
        label: 'model.safetensors',
        subtitle: '',
        coverUrl: null,
        sampleImageUrls: [],
      }],
      totalCount: 1,
    }

    expect(parseCatalogPage(page)).toEqual(page)
  })

  it.each([undefined, 2, '0', '02', 'model-2', '123456789012345678901'])('rejects malformed public card base-model ids: %j', baseModelId => {
    expect(() => parseCatalogPage({
      kind: 'model',
      query: '',
      page: 1,
      items: [{ modelId: null,
        context: { kind: 'model', id: '15', file_name: 'model.safetensors' },
        baseModelId,
        label: 'model.safetensors',
        subtitle: '',
        coverUrl: null,
        sampleImageUrls: [],
      }],
      totalCount: 1,
    })).toThrow('id')
  })

  it('exposes the query scalar contract for persisted Client navigation state', () => {
    expect(parseCatalogQueryText('Age refined')).toBe('Age refined')
    expect(parseCatalogPageNumber(100_000)).toBe(100_000)
    expect(parseCatalogStableId('12345678901234567890')).toBe('12345678901234567890')
    expect(() => parseCatalogQueryText('Age\u0000')).toThrow('query')
    expect(() => parseCatalogPageNumber(100_001)).toThrow('page')
    expect(() => parseCatalogStableId('model-2')).toThrow('id')
  })

  it('parses the fixed ComfyUI instance query and its closed safe response', () => {
    expect(parseCatalogComfyuiInstanceQueryRequest(CATALOG_COMFYUI_INSTANCE_QUERY))
      .toBe(CATALOG_COMFYUI_INSTANCE_QUERY)
    expect(parseCatalogComfyuiInstancePage({
      status: 'ok',
      message: null,
      results: [{ id: '2', title: 'win3080' }],
      page: 1,
      page_size: 100,
      total_count: 1,
    })).toEqual({
      status: 'ok',
      message: null,
      results: [{ id: '2', title: 'win3080' }],
      page: 1,
      page_size: 100,
      total_count: 1,
    })
  })

  it.each([
    [{ mode: 'resolve', query: '', page: 1, page_size: 100 }, 'fixed search request'],
    [{ mode: 'search', query: 'win', page: 1, page_size: 100 }, 'fixed search request'],
    [{ mode: 'search', query: '', page: 2, page_size: 100 }, 'fixed search request'],
    [{ mode: 'search', query: '', page: 1, page_size: 99 }, 'fixed search request'],
    [{ ...CATALOG_COMFYUI_INSTANCE_QUERY, extra: true }, 'properties'],
  ])('rejects invalid fixed ComfyUI instance query %j', (value, message) => {
    expect(() => parseCatalogComfyuiInstanceQueryRequest(value)).toThrow(message)
  })

  it.each([
    [{ status: 'error', message: null, results: [], page: 1, page_size: 100, total_count: 0 }, 'envelope'],
    [{ status: 'ok', message: 'failed', results: [], page: 1, page_size: 100, total_count: 0 }, 'envelope'],
    [{ status: 'ok', message: null, results: [], page: 2, page_size: 100, total_count: 0 }, 'envelope'],
    [{ status: 'ok', message: null, results: [], page: 1, page_size: 99, total_count: 0 }, 'envelope'],
    [{ status: 'ok', message: null, results: [{ id: '0', title: 'win3080' }], page: 1, page_size: 100, total_count: 1 }, 'id'],
    [{ status: 'ok', message: null, results: [{ id: '2', title: 'win3080', authorization: 'private' }], page: 1, page_size: 100, total_count: 1 }, 'properties'],
    [{ status: 'ok', message: null, results: [{ id: '2', title: 'win3080' }], page: 1, page_size: 100, total_count: 0 }, 'total count'],
    [{ status: 'ok', message: null, results: [], page: 1, page_size: 100, total_count: 0, extra: true }, 'properties'],
  ])('rejects invalid ComfyUI instance response %j', (value, message) => {
    expect(() => parseCatalogComfyuiInstancePage(value)).toThrow(message)
  })

  it.each([null, '', '   ', 12])('rejects an invalid public instance title %j', (title) => {
    expect(() => parseCatalogComfyuiInstancePage({
      status: 'ok', message: null, results: [{ id: '2', title }], page: 1, page_size: 100, total_count: 1,
    })).toThrow('title')
  })

  it('accepts one complete eight-card page and rejects a ninth card', () => {
    const items = Array.from({ length: 8 }, (_, index) => ({ modelId: null,
      context: { kind: 'model' as const, id: String(index + 1), file_name: `model-${index + 1}` },
      baseModelId: '2',
      label: `model-${index + 1}`,
      subtitle: 'safetensors',
      coverUrl: COVER,
      sampleImageUrls: [],
    }))
    const page = { kind: 'model' as const, query: '', page: 1, items, totalCount: 8 }

    expect(parseCatalogPage(page).items).toHaveLength(8)
    expect(() => parseCatalogPage({
      ...page,
      items: [...items, { ...items[0]!, context: { ...items[0]!.context, id: '10' } }],
    }))
      .toThrow('items')
  })

  it('parses the exact self-describing Agent context branch for every catalog kind', () => {
    const contexts = [
      { kind: 'model', id: '15', file_name: 'rinSoftsketch_v20.safetensors' },
      { kind: 'lora', id: '91', file_name: 'StS_Age_Slider_Illustrious_v1.safetensors' },
      { kind: 'work', id: '3761', name: '.flow' },
      {
        kind: 'character', id: '39933', work_name: '尼尔机械纪元', character_name: '2b', prompt_text: '2b, yorha no. 2 type b',
      },
      { kind: 'style', id: '12415', name: 'say_hana', prompt_text: 'say_hana' },
      { kind: 'prompt-term', id: '49856', tag: 'ryuujin_no_senpai' },
      { kind: 'artist-string', id: '1', title: 'watercolor', prompt_text: '@artist_a, @artist_b' },
      {
        kind: 'comfyui-template',
        id: '37',
        title: 'wai_txt2img_lora',
      },
    ] as const

    expect(contexts.map(parseCatalogContext)).toEqual(contexts)
  })

  it('parses successful values and stable Catalog business failures', () => {
    const page = { kind: 'model', query: '', page: 1, items: [], totalCount: 0 } as const
    expect(parseCatalogPageResult({ ok: true, value: page })).toEqual({ ok: true, value: page })
    expect(parseBaseModelResult({ ok: true, value: { items: [] } }))
      .toEqual({ ok: true, value: { items: [] } })
    expect(parseCatalogPageResult({
      ok: false,
      error: { code: 'CATALOG_PROTOCOL_ERROR', message: 'Catalog result item is invalid.' },
    })).toEqual({
      ok: false,
      error: { code: 'CATALOG_PROTOCOL_ERROR', message: 'Catalog result item is invalid.' },
    })
    expect(() => parseCatalogPageResult({
      ok: false,
      error: { code: 'internal', message: 'unexpected' },
    })).toThrow('error code')
  })

  it('parses closed Agent resolver values for templates, LoRAs, and generation models', () => {
    expect(parseCatalogResolvedTemplate({
      id: '37',
      title: 'wai_txt2img_lora',
      base_model_id: '2',
      model_id: '1',
    })).toEqual({
      id: '37',
      title: 'wai_txt2img_lora',
      base_model_id: '2',
      model_id: '1',
    })
    expect(parseCatalogResolvedLora({
      id: '68',
      base_model_id: '2',
      model_id: '1',
      file_name: 'USNR_STYLE_ILL_V1_lokr3-000024.safetensors',
      description: '手绘质感。',
      usage: '使用 usnr。',
      trigger_words: ['usnr'],
      weight: 1,
    })).toEqual({
      id: '68',
      base_model_id: '2',
      model_id: '1',
      file_name: 'USNR_STYLE_ILL_V1_lokr3-000024.safetensors',
      description: '手绘质感。',
      usage: '使用 usnr。',
      trigger_words: ['usnr'],
      weight: 1,
    })
    expect(parseCatalogResolvedGenerationModel({
      id: '1',
      base_model_id: '2',
      file_name: 'waiIllustriousSDXL_v170.safetensors',
      description: 'WAI model.',
      usage: 'Use WAI prompts.',
      skill_name: 'wai-sdxl-prompt-builder',
    })).toEqual({
      id: '1',
      base_model_id: '2',
      file_name: 'waiIllustriousSDXL_v170.safetensors',
      description: 'WAI model.',
      usage: 'Use WAI prompts.',
      skill_name: 'wai-sdxl-prompt-builder',
    })
  })

  it('rejects resolver values with missing semantic fields or duplicated LoRA trigger words', () => {
    expect(() => parseCatalogResolvedLora({
      id: '68', base_model_id: '2', model_id: '1', file_name: 'lora.safetensors',
      description: 'effect', usage: 'usage', trigger_words: ['usnr', 'usnr'], weight: 1,
    })).toThrow('duplicates')
    expect(() => parseCatalogResolvedGenerationModel({
      id: '1', base_model_id: '2', file_name: 'model.safetensors', description: 'model', skill_name: null,
    })).toThrow('properties')
  })

  it.each([
    [{ kind: 'base-model', query: '', page: 1, baseModelId: null, modelId: null }, 'kind'],
    [{ kind: 'model', query: 'x'.repeat(201), page: 1, baseModelId: null, modelId: null }, 'query'],
    [{ kind: 'model', query: '', page: 0, baseModelId: null, modelId: null }, 'page'],
    [{ kind: 'model', query: '', page: 1, baseModelId: '0', modelId: null }, 'id'],
    [{ kind: 'work', query: '', page: 1, baseModelId: '1', modelId: null }, TypeError],
    [{ kind: 'model', query: '', page: 1, baseModelId: null, modelId: null, extra: true }, 'properties'],
  ])('rejects invalid query request %j', (value, message) => {
    expect(() => parseCatalogQueryRequest(value)).toThrow(message)
  })

  it.each([
    [{ kind: 'model', query: '', page: 1, items: [{ modelId: null, context: { kind: 'lora', id: '1', file_name: 'x' }, baseModelId: '2', label: 'x', subtitle: 'y', coverUrl: null, sampleImageUrls: [] }], totalCount: 1 }, 'kind'],
    [{ kind: 'model', query: '', page: 1, items: [{ modelId: null, context: { kind: 'model', id: '0', file_name: 'x' }, baseModelId: '2', label: 'x', subtitle: 'y', coverUrl: null, sampleImageUrls: [] }], totalCount: 1 }, 'id'],
    [{ kind: 'model', query: '', page: 1, items: [{ modelId: null, context: { kind: 'model', id: '1', file_name: 'x' }, baseModelId: '2', label: '', subtitle: 'y', coverUrl: null, sampleImageUrls: [] }], totalCount: 1 }, 'label'],
    [{ kind: 'model', query: '', page: 1, items: [{ modelId: null, context: { kind: 'model', id: '1', file_name: 'x' }, baseModelId: '2', label: 'x', subtitle: false, coverUrl: null, sampleImageUrls: [] }], totalCount: 1 }, 'subtitle'],
    [{ kind: 'model', query: '', page: 1, items: [{ modelId: null, context: { kind: 'model', id: '1', file_name: 'x' }, baseModelId: '2', label: 'x', subtitle: 'y', coverUrl: 'file:///tmp/x.png', sampleImageUrls: [] }], totalCount: 1 }, 'cover URL'],
    [{ kind: 'model', query: '', page: 1, items: [{ modelId: null, context: { kind: 'model', id: '1', file_name: 'x' }, baseModelId: '2', label: 'x', subtitle: 'y', coverUrl: null, sampleImageUrls: [] }], totalCount: 0 }, 'total count'],
    [{ kind: 'model', query: '', page: 1, items: [{ context: { kind: 'model', id: '1', file_name: 'x' }, baseModelId: '2', label: 'x', subtitle: 'y', coverUrl: null }], totalCount: 1 }, 'properties'],
    [{ kind: 'model', query: '', page: 1, items: [{ modelId: null, context: { kind: 'model', id: '1', file_name: 'x' }, baseModelId: '2', label: 'x', subtitle: 'y', coverUrl: null, sampleImageUrls: null }], totalCount: 1 }, 'sample image URLs'],
    [{ kind: 'model', query: '', page: 1, items: [{ modelId: null, context: { kind: 'model', id: '1', file_name: 'x' }, baseModelId: '2', label: 'x', subtitle: 'y', coverUrl: null, sampleImageUrls: ['data:image/png;base64,AAAA'] }], totalCount: 1 }, 'sample image URL'],
    [{ kind: 'model', query: '', page: 1, items: [{ modelId: null, context: { kind: 'model', id: '1', file_name: 'x' }, baseModelId: '2', label: 'x', subtitle: 'y', coverUrl: null, sampleImageUrls: [SAMPLE, SAMPLE] }], totalCount: 1 }, 'duplicated'],
    [{ kind: 'model', query: '', page: 1, items: [{ modelId: null, context: { kind: 'model', id: '1', file_name: 'x' }, baseModelId: '2', label: 'x', subtitle: 'y', coverUrl: COVER, sampleImageUrls: [COVER] }], totalCount: 1 }, 'cover URL'],
  ])('rejects invalid catalog page %j', (value, message) => {
    expect(() => parseCatalogPage(value)).toThrow(message)
  })

  it.each([
    [{ kind: 'character', id: '1', character_name: '2b', prompt_text: '2b' }, 'properties'],
    [{ kind: 'character', id: '1', work_name: '尼尔机械纪元', character_name: '2b', prompt_text: '' }, 'prompt text'],
    [{ kind: 'prompt-term', id: '1', tag: '2b', label: '2b' }, 'properties'],
  ])('rejects incomplete or display-contaminated Agent context %j', (value, message) => {
    expect(() => parseCatalogContext(value)).toThrow(message)
  })

  it.each([
    [{ items: [{ id: '0', label: 'wai' }] }, 'id'],
    [{ items: [{ id: '2', label: '' }] }, 'label'],
    [{ items: [], extra: true }, 'properties'],
    [{ items: new Array(21).fill({ id: '1', label: 'wai' }) }, 'items'],
  ])('rejects invalid base-model list %j', (value, message) => {
    expect(() => parseBaseModelList(value)).toThrow(message)
  })
})

it.each([
  [{ baseModelId: null, modelId: null }, { baseModelId: null, modelId: null }, true],
  [{ baseModelId: '4', modelId: null }, { baseModelId: null, modelId: null }, false],
  [{ baseModelId: null, modelId: '25' }, { baseModelId: '4', modelId: null }, false],
  [{ baseModelId: '4', modelId: null }, { baseModelId: '4', modelId: '25' }, true],
  [{ baseModelId: '4', modelId: '25' }, { baseModelId: '4', modelId: '25' }, true],
  [{ baseModelId: '4', modelId: '24' }, { baseModelId: '4', modelId: '25' }, false],
  [{ baseModelId: '3', modelId: '25' }, { baseModelId: '4', modelId: '25' }, false],
] as const)('compares Catalog constraints %j with the current generation %j', (resource, target, expected) => {
  expect(catalogResourceCompatible(resource, target)).toBe(expected)
})

it.each([undefined, '0', 'invalid', 25])('rejects a malformed public card model association %j', modelId => {
  expect(() => parseCatalogPage({
    kind: 'lora', query: '', page: 1, totalCount: 1,
    items: [{ context: { kind: 'lora', id: '1', file_name: 'resource.safetensors' }, baseModelId: '4', modelId, label: 'Resource', subtitle: '', coverUrl: null, sampleImageUrls: [] }],
  })).toThrow(TypeError)
})

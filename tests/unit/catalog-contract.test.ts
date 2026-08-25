import { describe, expect, it } from 'vitest'

import {
  CATALOG_KIND_DEFINITIONS,
  catalogPageCount,
  contextLabel,
  parseBaseModelList,
  parseBaseModelResult,
  parseCatalogContext,
  parseCatalogPage,
  parseCatalogPageResult,
  parseCatalogQueryRequest,
  parseCatalogResolvedGenerationModel,
  parseCatalogResolvedLora,
  parseCatalogResolvedTemplate,
} from '../../src/catalog/contract.ts'

const COVER = 'http://127.0.0.1:18092/media/images/model.webp'

describe('catalog Remote contract', () => {
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
    const request = { kind: 'model', query: 'soft', page: 2, baseModelId: '2' } as const
    const page = {
      kind: 'model',
      query: 'soft',
      page: 2,
      items: [{
        context: { kind: 'model', id: '15', file_name: 'rinSoftsketch_v20.safetensors' },
        label: 'rinSoftsketch_v20.safetensors',
        subtitle: 'safetensors',
        coverUrl: COVER,
      }],
      totalCount: 15,
    } as const

    expect(parseCatalogQueryRequest(request)).toEqual(request)
    expect(parseCatalogPage(page)).toEqual(page)
    expect(parseBaseModelList({ items: [{ id: '2', label: 'wai' }] }))
      .toEqual({ items: [{ id: '2', label: 'wai' }] })
    expect(contextLabel(page.items[0].context)).toBe('生成模型 · rinSoftsketch_v20.safetensors')
    expect(catalogPageCount(0)).toBe(1)
    expect(catalogPageCount(13)).toBe(2)
  })

  it('accepts one complete nine-card page and rejects a tenth card', () => {
    const items = Array.from({ length: 9 }, (_, index) => ({
      context: { kind: 'model' as const, id: String(index + 1), file_name: `model-${index + 1}` },
      label: `model-${index + 1}`,
      subtitle: 'safetensors',
      coverUrl: COVER,
    }))
    const page = { kind: 'model' as const, query: '', page: 1, items, totalCount: 9 }

    expect(parseCatalogPage(page).items).toHaveLength(9)
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
      parameters: [{ parameter_id: 'lora_model', kind: 'lora_model', value_type: 'asset_reference', required: false }],
    })).toEqual({
      id: '37',
      title: 'wai_txt2img_lora',
      base_model_id: '2',
      model_id: '1',
      parameters: [{ parameter_id: 'lora_model', kind: 'lora_model', value_type: 'asset_reference', required: false }],
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
    })).toThrow('duplicated')
    expect(() => parseCatalogResolvedGenerationModel({
      id: '1', base_model_id: '2', file_name: 'model.safetensors', description: 'model', skill_name: null,
    })).toThrow('properties')
  })

  it.each([
    [{ kind: 'base-model', query: '', page: 1, baseModelId: null }, 'kind'],
    [{ kind: 'model', query: 'x'.repeat(201), page: 1, baseModelId: null }, 'query'],
    [{ kind: 'model', query: '', page: 0, baseModelId: null }, 'page'],
    [{ kind: 'model', query: '', page: 1, baseModelId: '0' }, 'id'],
    [{ kind: 'work', query: '', page: 1, baseModelId: '1' }, 'filter'],
    [{ kind: 'model', query: '', page: 1, baseModelId: null, extra: true }, 'properties'],
  ])('rejects invalid query request %j', (value, message) => {
    expect(() => parseCatalogQueryRequest(value)).toThrow(message)
  })

  it.each([
    [{ kind: 'model', query: '', page: 1, items: [{ context: { kind: 'lora', id: '1', file_name: 'x' }, label: 'x', subtitle: 'y', coverUrl: null }], totalCount: 1 }, 'kind'],
    [{ kind: 'model', query: '', page: 1, items: [{ context: { kind: 'model', id: '0', file_name: 'x' }, label: 'x', subtitle: 'y', coverUrl: null }], totalCount: 1 }, 'id'],
    [{ kind: 'model', query: '', page: 1, items: [{ context: { kind: 'model', id: '1', file_name: 'x' }, label: '', subtitle: 'y', coverUrl: null }], totalCount: 1 }, 'label'],
    [{ kind: 'model', query: '', page: 1, items: [{ context: { kind: 'model', id: '1', file_name: 'x' }, label: 'x', subtitle: '', coverUrl: null }], totalCount: 1 }, 'subtitle'],
    [{ kind: 'model', query: '', page: 1, items: [{ context: { kind: 'model', id: '1', file_name: 'x' }, label: 'x', subtitle: 'y', coverUrl: 'https://example.com/x.png' }], totalCount: 1 }, 'cover URL'],
    [{ kind: 'model', query: '', page: 1, items: [{ context: { kind: 'model', id: '1', file_name: 'x' }, label: 'x', subtitle: 'y', coverUrl: null }], totalCount: 0 }, 'total count'],
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

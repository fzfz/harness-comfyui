import { describe, expect, it, vi } from 'vitest'

import {
  createGenerationModelResolverTool,
  createLoraResolverTool,
  createTemplateResolverTool,
} from '../../src/host/catalog/catalog-tool.ts'

describe('query_semantic_comfyui_templates Tool', () => {
  it('resolves one template id through the Catalog CLI and excludes Workflow JSON', async () => {
    const resolveTemplate = vi.fn(async () => Object.freeze({
      id: '37',
      title: 'wai_txt2img_lora',
      base_model_id: '2',
      model_id: '1',
      parameters: Object.freeze([
        Object.freeze({ parameter_id: 'positive_prompt', kind: 'positive_prompt', value_type: 'string' as const, required: false }),
      ]),
    }))
    const tool = createTemplateResolverTool({ resolveTemplate })
    const signal = new AbortController().signal

    const result = await tool.execute({ id: '37' }, { signal } as never)

    expect(tool.name).toBe('query_semantic_comfyui_templates')
    expect(resolveTemplate).toHaveBeenCalledWith('37', signal)
    expect(result).toEqual({
      id: '37',
      title: 'wai_txt2img_lora',
      base_model_id: '2',
      model_id: '1',
      parameters: [{ parameter_id: 'positive_prompt', kind: 'positive_prompt', value_type: 'string', required: false }],
    })
    expect(JSON.stringify(result)).not.toContain('workflow')
    expect(tool.parameters).toMatchObject({ type: 'object', additionalProperties: false })
    expect(tool.output.schema).toMatchObject({
      properties: {
        id: { description: expect.stringContaining('template') },
        title: { description: expect.stringContaining('title') },
        base_model_id: { description: expect.stringContaining('Base-model') },
        model_id: { description: expect.stringContaining('Generation-model') },
        parameters: {
          description: expect.stringContaining('runtime parameter'),
          items: {
            properties: {
              parameter_id: { description: expect.stringContaining('generate_with_comfyui.parameters') },
              kind: { description: expect.stringContaining('user value') },
              value_type: { description: expect.stringContaining('string, enum, image_reference, and asset_reference use JSON strings') },
              required: { description: expect.stringContaining('must receive') },
            },
          },
        },
      },
    })
    expect(tool.output.render({ id: '37' }, result as never)).toEqual([
      { type: 'text', text: JSON.stringify(result) },
    ])
  })
})

describe('query_semantic_loras Tool', () => {
  it('returns every Agent field required for LoRA prompt rewriting and Workflow parameter mapping', async () => {
    const resolveLora = vi.fn(async () => Object.freeze({
      id: '68',
      base_model_id: '2',
      model_id: '1',
      file_name: 'USNR_STYLE_ILL_V1_lokr3-000024.safetensors',
      description: '手绘质感、块面化明暗和冷暖对比。',
      usage: '使用 usnr，默认模型权重 1.0。',
      trigger_words: Object.freeze(['usnr']),
      weight: 1,
    }))
    const tool = createLoraResolverTool({ resolveLora })
    const signal = new AbortController().signal

    const result = await tool.execute({ id: '68' }, { signal } as never)

    expect(tool.name).toBe('query_semantic_loras')
    expect(resolveLora).toHaveBeenCalledWith('68', signal)
    expect(result).toEqual({
      id: '68',
      base_model_id: '2',
      model_id: '1',
      file_name: 'USNR_STYLE_ILL_V1_lokr3-000024.safetensors',
      description: '手绘质感、块面化明暗和冷暖对比。',
      usage: '使用 usnr，默认模型权重 1.0。',
      trigger_words: ['usnr'],
      weight: 1,
    })
    expect(tool.parameters).toMatchObject({ type: 'object', additionalProperties: false })
    expect(tool.output.schema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      properties: {
        file_name: { description: expect.stringContaining('Host') },
        description: { description: expect.stringContaining('visual effect') },
        usage: { description: expect.stringContaining('prompt') },
        trigger_words: { description: expect.stringContaining('rewriting') },
        weight: { description: expect.stringContaining('lora_model_weight') },
      },
    })
    expect(tool.output.render({ id: '68' }, result as never)).toEqual([
      { type: 'text', text: JSON.stringify(result) },
    ])
  })
})

describe('query_semantic_generation_models Tool', () => {
  it('returns model semantics and omits an unavailable Prompt Skill', async () => {
    const resolveGenerationModel = vi.fn(async () => Object.freeze({
      id: '1',
      base_model_id: '2',
      file_name: 'waiIllustriousSDXL_v170.safetensors',
      description: 'WAI model.',
      usage: 'Use WAI prompts.',
      skill_name: null,
    }))
    const tool = createGenerationModelResolverTool({ resolveGenerationModel })
    const signal = new AbortController().signal

    const result = await tool.execute({ id: '1' }, { signal } as never)

    expect(tool.name).toBe('query_semantic_generation_models')
    expect(resolveGenerationModel).toHaveBeenCalledWith('1', signal)
    expect(result).toEqual({
      id: '1',
      base_model_id: '2',
      file_name: 'waiIllustriousSDXL_v170.safetensors',
      description: 'WAI model.',
      usage: 'Use WAI prompts.',
    })
    expect(tool.parameters).toMatchObject({ type: 'object', additionalProperties: false })
    expect(tool.output.schema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      properties: {
        description: { description: expect.stringContaining('prompting') },
        usage: { description: expect.stringContaining('run parameters') },
        skill_name: { description: expect.stringContaining('Prompt Skill') },
      },
    })
    expect(tool.output.render({ id: '1' }, result as never)).toEqual([
      { type: 'text', text: JSON.stringify(result) },
    ])
  })
})

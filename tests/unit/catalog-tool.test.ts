import { describe, expect, it, vi } from 'vitest'

import { createTemplateResolverTool } from '../../src/host/catalog/catalog-tool.ts'

describe('query_semantic_comfyui_templates Tool', () => {
  it('resolves one template id through the Catalog CLI and excludes Workflow JSON', async () => {
    const resolveTemplate = vi.fn(async () => Object.freeze({
      id: '37',
      title: 'wai_txt2img_lora',
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
      parameters: [{ parameter_id: 'positive_prompt', kind: 'positive_prompt', value_type: 'string', required: false }],
    })
    expect(JSON.stringify(result)).not.toContain('workflow')
    expect(tool.parameters).toMatchObject({ type: 'object', additionalProperties: false })
    expect(tool.output.schema).toMatchObject({
      properties: {
        id: { description: expect.stringContaining('template') },
        title: { description: expect.stringContaining('title') },
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

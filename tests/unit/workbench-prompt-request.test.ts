import { describe, expect, it } from 'vitest'
import { buildPromptRequest, DEFAULT_PROMPT_REQUEST_PARTS, requestTemplateProblem, requestTemplateVariables } from '../../src/workbench/request-template.ts'

describe('prompt request blocks', () => {
  it('renders first-generation input without empty edit or reference blocks and preserves user braces', () => {
    expect(buildPromptRequest('{{requirements_block}}\n{{prompt_edit_block}}\n{{references_block}}', {
      base_model_id: 'wai', base_model_name: 'WAI', original_request: '保留 {{prompt_edit_block}} 与 $&',
      positive_prompt: '', negative_prompt: '', change_request: '', reference_context: {},
    })).toBe('图像底模：WAI\n底模 ID：wai\n\n原始需求：\n保留 {{prompt_edit_block}} 与 $&')
  })
  it('uses edited block templates and includes only selected references with their configured purpose', () => {
    expect(buildPromptRequest('{{requirements_block}}|{{prompt_edit_block}}|{{references_block}}', {
      base_model_id: 'wai', base_model_name: 'WAI', original_request: '肖像',
      positive_prompt: 'portrait', negative_prompt: '', change_request: '增加侧光',
      reference_context: { requested_skill: null, experiences: [], run_ids: ['run-1'] },
    }, {
      block_templates: { requirements_block: '{{original_request}}', prompt_edit_block: '{{change_request}}:{{positive_prompt}}/{{negative_prompt}}', references_block: '{{reference_context}}' },
      reference_descriptions: { ...DEFAULT_PROMPT_REQUEST_PARTS.reference_descriptions, run_ids: '保留构图' },
    })).toBe('肖像|增加侧光:portrait/""|{\n  "run_ids": {\n    "purpose": "保留构图",\n    "data": [\n      "run-1"\n    ]\n  }\n}')
  })
  it('lists and validates variables for each editor scope', () => {
    expect(requestTemplateVariables('prompt').map(item => item.name)).toEqual(['requirements_block', 'prompt_edit_block', 'references_block'])
    expect(requestTemplateVariables('prompt', 'references_block').map(item => item.name)).toEqual(['reference_context'])
    expect(requestTemplateVariables('translate').map(item => item.name)).toEqual(['source_text'])
    expect(requestTemplateVariables('review').map(item => item.name)).toEqual(['task_id'])
    expect(requestTemplateProblem('{{requirements_block}}', 'prompt')).toBe('')
    expect(requestTemplateProblem('{{original_request}}', 'prompt')).not.toBe('')
    expect(requestTemplateProblem('{{original_request}}', 'prompt', 'requirements_block')).toBe('')
    expect(requestTemplateProblem('{{task_id}}', 'prompt', 'requirements_block')).not.toBe('')
  })
})

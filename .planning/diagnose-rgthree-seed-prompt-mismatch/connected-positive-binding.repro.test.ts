import { describe, expect, it, vi } from 'vitest'

import { ComfyWorkflowCompiler } from '../../src/host/generation/workflow-compiler.ts'
import type { UiWorkflow } from '../../src/host/generation/source-preparer.ts'

describe('template 39 connected positive prompt binding reproduction', () => {
  it('writes positive_prompt to the executable upstream wildcard input', async () => {
    const workflow: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 3,
          type: 'ImpactWildcardProcessor',
          title: 'POSITIVE',
          mode: 0,
          inputs: [],
          outputs: [{ name: 'processed text', type: 'STRING', links: [110] }],
          widgets_values: ['template scene prompt', 'template scene prompt', 'populate'],
          widgets_values_named: {
            wildcard_text: 'template scene prompt',
            populated_text: 'template scene prompt',
            mode: 'populate',
          },
        },
        {
          id: 5,
          type: 'Lora Loader (LoraManager)',
          mode: 0,
          inputs: [],
          outputs: [],
          widgets_values: ['<lora:template-lora:1>'],
          widgets_values_named: { text: '<lora:template-lora:1>' },
        },
        {
          id: 54,
          type: 'CLIPTextEncode',
          title: 'CLIP Text Encode (Positive Prompt)',
          mode: 0,
          inputs: [{ name: 'text', type: 'STRING', link: 110, widget: { name: 'text' } }],
          outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING', links: [2] }],
          widgets_values: [''],
          widgets_values_named: { text: '' },
        },
        {
          id: 6,
          type: 'KSampler',
          mode: 0,
          inputs: [{ name: 'positive', type: 'CONDITIONING', link: 2 }],
          outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [13] }],
          widgets_values: [],
        },
        {
          id: 13,
          type: 'SaveImage',
          mode: 0,
          inputs: [{ name: 'images', type: 'IMAGE', link: 13 }],
          outputs: [],
          widgets_values: ['output'],
          widgets_values_named: { filename_prefix: 'output' },
        },
      ],
      links: [
        [110, 3, 0, 54, 0, 'STRING'],
        [2, 54, 0, 6, 0, 'CONDITIONING'],
        [13, 6, 0, 13, 0, 'IMAGE'],
      ],
    }
    const objectInfo = {
      ImpactWildcardProcessor: {
        input: { required: {
          wildcard_text: ['STRING', {}],
          populated_text: ['STRING', {}],
          mode: [['populate', 'fixed'], {}],
        } },
        input_order: { required: ['wildcard_text', 'populated_text', 'mode'], optional: [] },
        output_node: false,
      },
      'Lora Loader (LoraManager)': {
        input: { required: { text: ['STRING', {}] } },
        input_order: { required: ['text'], optional: [] },
        output_node: false,
      },
      CLIPTextEncode: {
        input: { required: { text: ['STRING', {}] } },
        input_order: { required: ['text'], optional: [] },
        output_node: false,
      },
      KSampler: {
        input: { required: { positive: ['CONDITIONING', {}] } },
        input_order: { required: ['positive'], optional: [] },
        output_node: false,
      },
      SaveImage: {
        input: { required: { images: ['IMAGE', {}], filename_prefix: ['STRING', {}] } },
        input_order: { required: ['images', 'filename_prefix'], optional: [] },
        output_node: true,
      },
    }
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(objectInfo), { status: 200 })),
    })
    const requestedPrompt = '1 girl, solo, requested artist string'

    const compiled = await compiler.compile({
      workflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['13'],
      runtimeParameters: [{
        definition: { parameterId: 'positive_prompt', kind: 'positive_prompt', valueType: 'string', required: false },
        value: requestedPrompt,
      }],
      bindingHints: [{
        parameterId: 'positive_prompt',
        operation: 'replace_input',
        nodeId: '54',
        inputName: 'text',
        widgetIndex: 0,
      }],
      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 3)?.widgets_values_named)
      .toMatchObject({ wildcard_text: requestedPrompt })
    expect(compiled.apiWorkflow['3']).toMatchObject({
      inputs: { wildcard_text: requestedPrompt },
    })
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 5)?.widgets_values_named)
      .toMatchObject({ text: '<lora:template-lora:1>' })
  })
})

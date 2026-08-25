import { describe, expect, it, vi } from 'vitest'

import type { JsonValue } from '../../src/host/generation/generation-runtime.ts'
import { ComfyWorkflowCompiler } from '../../src/host/generation/workflow-compiler.ts'
import type { UiWorkflow } from '../../src/host/generation/source-preparer.ts'

const workflow: UiWorkflow = {
  version: 0.4,
  nodes: [
    {
      id: 1,
      type: 'ImageProducer',
      title: 'Image source',
      mode: 0,
      inputs: [],
      outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [11] }],
      widgets_values: ['source.png'],
    },
    {
      id: 2,
      type: 'CLIPTextEncode',
      mode: 0,
      inputs: [
        { name: 'clip', type: 'CLIP', link: 10 },
        { name: 'text', type: 'STRING', link: null, widget: { name: 'text' } },
      ],
      outputs: [],
      widgets_values: ['1girl, white hair'],
    },
    {
      id: 3,
      type: 'SaveImage',
      mode: 0,
      inputs: [
        { name: 'images', type: 'IMAGE', link: 11 },
        { name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } },
      ],
      outputs: [],
      widgets_values: ['harness-comfyui'],
    },
  ],
  links: [
    [10, 1, 0, 2, 0, 'CLIP'],
    [11, 1, 0, 3, 0, 'IMAGE'],
  ],
}

const objectInfo = {
  ImageProducer: {
    input: { required: { source: ['STRING', {}] } },
    input_order: { required: ['source'], optional: [] },
    output_node: false,
  },
  CLIPTextEncode: {
    input: { required: { clip: ['CLIP'], text: ['STRING', {}] } },
    input_order: { required: ['clip', 'text'], optional: [] },
    output_node: false,
  },
  SaveImage: {
    input: { required: { images: ['IMAGE'], filename_prefix: ['STRING', {}] } },
    input_order: { required: ['images', 'filename_prefix'], optional: [] },
    output_node: true,
  },
}

describe('ComfyWorkflowCompiler', () => {
  it('compiles connected inputs and widget values from the UI Workflow with live node definitions', async () => {
    const fetchImplementation = vi.fn(async () => new Response(JSON.stringify(objectInfo), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    const compiler = new ComfyWorkflowCompiler({ fetchImplementation })

    const compiled = await compiler.compile({
      workflow,
      connection: { url: 'http://127.0.0.1:8188/', origin: 'http://127.0.0.1:8188', authorization: 'Bearer token' },
      expectedOutputNodeIds: ['3'],
      loras: [],
    })

    expect(compiled).toEqual({
      actualWorkflow: workflow,
      apiWorkflow: {
        '1': {
        class_type: 'ImageProducer',
        inputs: { source: 'source.png' },
        _meta: { title: 'Image source' },
        },
        '2': {
        class_type: 'CLIPTextEncode',
        inputs: { clip: ['1', 0], text: '1girl, white hair' },
        },
        '3': {
        class_type: 'SaveImage',
        inputs: { images: ['1', 0], filename_prefix: 'harness-comfyui' },
        },
      },
      activeOutputNodeIds: ['3'],
    })
    expect(fetchImplementation).toHaveBeenCalledWith(
      'http://127.0.0.1:8188/object_info',
      expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer token' }) }),
    )
  })

  it('uses a valid binding as the preferred target without making the binding mandatory', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 4,
      type: 'CLIPTextEncode',
      mode: 0,
      inputs: [{ name: 'text', type: 'STRING', link: null, widget: { name: 'text' } }],
      outputs: [],
      widgets_values: ['1girl, white hair'],
    })
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(objectInfo), { status: 200 })),
    })

    const compiled = await compiler.compile({
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      runtimeParameters: [{
        definition: {
          parameterId: 'positive_prompt',
          kind: 'positive_prompt',
          valueType: 'string',
          defaultValue: '1girl, white hair',
          required: false,
        },
        value: '1girl, black hair',
      }],
      bindingHints: [{
        parameterId: 'positive_prompt',
        operation: 'replace_input',
        nodeId: '2',
        inputName: 'text',
        widgetIndex: 0,
      }, {
        parameterId: 'positive_prompt',
        operation: 'replace_input',
        nodeId: '2',
        inputName: 'text',
        widgetIndex: 0,
      }],
      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 2)?.widgets_values).toEqual(['1girl, black hair'])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 4)?.widgets_values).toEqual(['1girl, white hair'])
  })

  it('resolves every declared generation parameter when a stale binding cannot resolve', async () => {
    const actual = structuredClone(workflow)
    const positive = actual.nodes.find(node => node.id === 2) as { title?: string; widgets_values: JsonValue[] }
    positive.title = 'CLIP Text Encode (Positive Prompt)'
    positive.widgets_values = ['positive default']
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push(
      {
        id: 4,
        type: 'CLIPTextEncode',
        title: 'CLIP Text Encode (Negative Prompt)',
        mode: 0,
        inputs: [{ name: 'text', type: 'STRING', link: null, widget: { name: 'text' } }],
        outputs: [],
        widgets_values: ['negative default'],
      },
      {
        id: 5,
        type: 'EmptyLatentImage',
        mode: 0,
        inputs: [],
        outputs: [],
        widgets_values: [1024, 1344, 1],
      },
      {
        id: 6,
        type: 'KSampler',
        mode: 0,
        inputs: [],
        outputs: [],
        widgets_values: [0, 'fixed'],
      },
    )
    const definitions = {
      ...objectInfo,
      EmptyLatentImage: {
        input: { required: { width: ['INT', {}], height: ['INT', {}], batch_size: ['INT', {}] } },
        input_order: { required: ['width', 'height', 'batch_size'], optional: [] },
        output_node: false,
      },
      KSampler: {
        input: { required: { seed: ['INT', { control_after_generate: true }] } },
        input_order: { required: ['seed'], optional: [] },
        output_node: false,
      },
    }
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(definitions), { status: 200 })),
    })

    const compiled = await compiler.compile({
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      runtimeParameters: [
        { definition: { parameterId: 'positive_prompt', kind: 'positive_prompt', valueType: 'string', defaultValue: 'positive default', required: false }, value: 'positive final' },
        { definition: { parameterId: 'negative_prompt', kind: 'negative_prompt', valueType: 'string', defaultValue: 'negative default', required: false }, value: 'negative final' },
        { definition: { parameterId: 'width', kind: 'width', valueType: 'integer', defaultValue: 1024, required: false }, value: 768 },
        { definition: { parameterId: 'height', kind: 'height', valueType: 'integer', defaultValue: 1344, required: false }, value: 1024 },
        { definition: { parameterId: 'seed', kind: 'seed', valueType: 'integer', defaultValue: 0, required: false }, value: 42 },
      ],
      bindingHints: [{ parameterId: 'positive_prompt', operation: 'replace_input', nodeId: '999', inputName: 'text', widgetIndex: 0 }],
      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 2)?.widgets_values).toEqual(['positive final'])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 4)?.widgets_values).toEqual(['negative final'])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 5)?.widgets_values).toEqual([768, 1024, 1])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 6)?.widgets_values).toEqual([42, 'fixed'])
    expect(compiled.apiWorkflow['2']).toMatchObject({ inputs: { text: 'positive final' } })
    expect(compiled.apiWorkflow['4']).toMatchObject({ inputs: { text: 'negative final' } })
    expect(compiled.apiWorkflow['5']).toMatchObject({ inputs: { width: 768, height: 1024 } })
    expect(compiled.apiWorkflow['6']).toMatchObject({ inputs: { seed: 42 } })
  })

  it('resolves a reference image to the LoadImage widget without a binding hint', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 4,
      type: 'LoadImage',
      mode: 0,
      inputs: [],
      outputs: [],
      widgets_values: ['source.png', 'image'],
    })
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        LoadImage: {
          input: { required: { image: ['STRING', {}] } },
          input_order: { required: ['image'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      runtimeParameters: [{
        definition: {
          parameterId: 'reference_image',
          kind: 'reference_image',
          valueType: 'image_reference',
          defaultValue: 'source.png',
          required: true,
        },
        value: 'input.png',
      }],
      bindingHints: [],
      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 4)?.widgets_values).toEqual(['input.png', 'image'])
    expect(compiled.apiWorkflow['4']).toMatchObject({ inputs: { image: 'input.png' } })
  })

  it('uses node-id suffixes to resolve multiple parameters of the same kind', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push(
      { id: 6, type: 'KSampler', mode: 0, inputs: [], outputs: [], widgets_values: [0, 'fixed'] },
      { id: 7, type: 'KSampler', mode: 0, inputs: [], outputs: [], widgets_values: [0, 'fixed'] },
    )
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        KSampler: {
          input: { required: { seed: ['INT', { control_after_generate: true }] } },
          input_order: { required: ['seed'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      runtimeParameters: [
        { definition: { parameterId: 'seed', kind: 'seed', valueType: 'integer', defaultValue: 0, required: false }, value: 11 },
        { definition: { parameterId: 'seed_7', kind: 'seed', valueType: 'integer', defaultValue: 0, required: false }, value: 22 },
      ],
      bindingHints: [],
      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 6)?.widgets_values).toEqual([11, 'fixed'])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 7)?.widgets_values).toEqual([22, 'fixed'])
  })

  it('reports the parameter id and candidate widgets when structural resolution is missing or ambiguous', async () => {
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(objectInfo), { status: 200 })),
    })
    await expect(compiler.compile({
      workflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      runtimeParameters: [{ definition: { parameterId: 'unknown_value', kind: 'unknown_value', valueType: 'string', required: true }, value: 'x' }],
      bindingHints: [],
      loras: [],
    })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_TARGET_NOT_FOUND',
      message: expect.stringContaining('unknown_value'),
    })

    const ambiguous = structuredClone(workflow)
    ;(ambiguous.nodes[0] as { widgets_values: JsonValue[] }).widgets_values = ['same default']
    ;(ambiguous.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 4,
      type: 'ImageProducer',
      mode: 0,
      inputs: [],
      outputs: [],
      widgets_values: ['same default'],
    })
    await expect(compiler.compile({
      workflow: ambiguous,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      runtimeParameters: [{
        definition: { parameterId: 'custom_value', kind: 'custom_value', valueType: 'string', defaultValue: 'same default', required: true },
        value: 'changed',
      }],
      bindingHints: [],
      loras: [],
    })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_TARGET_AMBIGUOUS',
      message: expect.stringMatching(/custom_value.*1:ImageProducer\.source.*4:ImageProducer\.source/u),
    })
  })

  it('discovers active output nodes when the template output declaration is null', async () => {
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(objectInfo), { status: 200 })),
    })

    const compiled = await compiler.compile({
      workflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: null,
      loras: [],
    })

    expect(compiled.activeOutputNodeIds).toEqual(['3'])
  })

  it('leaves missing instance-required inputs for the ComfyUI prompt endpoint to validate', async () => {
    const missingImagesWorkflow = structuredClone(workflow)
    const saveNode = missingImagesWorkflow.nodes[2] as { inputs: Array<{ link: number | null }> }
    saveNode.inputs[0]!.link = null
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(objectInfo), { status: 200 })),
    })

    const compiled = await compiler.compile({
      workflow: missingImagesWorkflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      loras: [],
    })

    expect(compiled.apiWorkflow['3']).toEqual({
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'harness-comfyui' },
    })
  })

  it.each([
    ['wai\\USNR_STYLE_ILL_V1_lokr3-000024.safetensors', 'wai/USNR_STYLE_ILL_V1_lokr3-000024.safetensors'],
    ['wai/USNR_STYLE_ILL_V1_lokr3-000024.safetensors', 'wai\\USNR_STYLE_ILL_V1_lokr3-000024.safetensors'],
  ])('uses the target instance path separator for COMBO asset values', async (templateValue, instanceValue) => {
    const assetWorkflow = structuredClone(workflow)
    ;(assetWorkflow.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 4,
      type: 'LoraLoader',
      mode: 0,
      inputs: [],
      outputs: [],
      widgets_values: [templateValue, 0.8, 0.8],
    })
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        LoraLoader: {
          input: {
            required: {
              lora_name: [[instanceValue], {}],
              strength_model: ['FLOAT', {}],
              strength_clip: ['FLOAT', {}],
            },
          },
          input_order: { required: ['lora_name', 'strength_model', 'strength_clip'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      workflow: assetWorkflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      loras: [],
    })

    expect((compiled.apiWorkflow['4'] as { inputs: { lora_name: string } }).inputs.lora_name).toBe(instanceValue)
  })

  it('keeps the template COMBO value when separator-insensitive matching is not unique', async () => {
    const templateValue = 'root\\folder/file.safetensors'
    const assetWorkflow = structuredClone(workflow)
    ;(assetWorkflow.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 4,
      type: 'LoraLoader',
      mode: 0,
      inputs: [],
      outputs: [],
      widgets_values: [templateValue],
    })
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        LoraLoader: {
          input: { required: { lora_name: [['root/folder/file.safetensors', 'root\\folder\\file.safetensors'], {}] } },
          input_order: { required: ['lora_name'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      workflow: assetWorkflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      loras: [],
    })

    expect((compiled.apiWorkflow['4'] as { inputs: { lora_name: string } }).inputs.lora_name).toBe(templateValue)
  })

  it.each([
    ['LoraLoader', 'wai/USNR_STYLE_ILL_V1_lokr3-000024.safetensors', true],
    ['LoraLoaderModelOnly', 'wai\\USNR_STYLE_ILL_V1_lokr3-000024.safetensors', false],
  ])('injects a resolved LoRA into %s without template bindings', async (nodeType, instancePath, hasClipWeight) => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 4,
      type: nodeType,
      mode: 0,
      inputs: [],
      outputs: [],
      widgets_values: hasClipWeight ? ['old.safetensors', 0.5, 0.5] : ['old.safetensors', 0.5],
    })
    const weightInputs = {
      strength_model: ['FLOAT', {}],
      ...(hasClipWeight ? { strength_clip: ['FLOAT', {}] } : {}),
    }
    const order = ['lora_name', 'strength_model', ...(hasClipWeight ? ['strength_clip'] : [])]
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        [nodeType]: {
          input: { required: { lora_name: [[instancePath], {}], ...weightInputs } },
          input_order: { required: order, optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      loras: [{ id: '68', fileName: 'USNR_STYLE_ILL_V1_lokr3-000024.safetensors', weight: 1, triggerWords: ['usnr'] }],
    })

    const actualNode = compiled.actualWorkflow.nodes.find(node => node.id === 4)!
    expect(actualNode.widgets_values).toEqual(hasClipWeight ? [instancePath, 1, 1] : [instancePath, 1])
    expect(compiled.apiWorkflow['4']).toMatchObject({
      class_type: nodeType,
      inputs: {
        lora_name: instancePath,
        strength_model: 1,
        ...(hasClipWeight ? { strength_clip: 1 } : {}),
      },
    })
  })

  it('injects multiple LoRAs into a LoraManager text widget through its serialized widget identities', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 4,
      type: 'Lora Loader (LoraManager)',
      mode: 0,
      properties: { __lm_widget_ids: ['__lm_autocomplete_meta_text', 'text', 'loras'] },
      inputs: [],
      outputs: [],
      widgets_values: [{ version: 1, textWidgetName: 'text' }, '', []],
    })
    const managerDefinition = {
      input: {
        required: {
          model: ['MODEL'],
          text: ['AUTOCOMPLETE_TEXT_LORAS', { tooltip: 'Format: <lora:lora_name:strength>' }],
        },
      },
      input_order: { required: ['model', 'text'], optional: [] },
      output_node: false,
    }
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        'Lora Loader (LoraManager)': managerDefinition,
        LoraLoader: {
          input: { required: { lora_name: [[
            'wai\\USNR_STYLE_ILL_V1_lokr3-000024.safetensors',
            'wai\\GTHAN-EQ.safetensors',
          ], {}] } },
          input_order: { required: ['lora_name'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      loras: [
        { id: '68', fileName: 'USNR_STYLE_ILL_V1_lokr3-000024.safetensors', weight: 1, triggerWords: ['usnr'] },
        { id: '69', fileName: 'GTHAN-EQ.safetensors', weight: 0.8, triggerWords: ['gthan'] },
      ],
    })

    const syntax = '<lora:wai\\USNR_STYLE_ILL_V1_lokr3-000024.safetensors:1> <lora:wai\\GTHAN-EQ.safetensors:0.8>'
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 4)?.widgets_values).toEqual([
      { version: 1, textWidgetName: 'text' }, syntax, [],
    ])
    expect(compiled.apiWorkflow['4']).toMatchObject({ inputs: { text: syntax } })
  })

  it('injects a resolved LoRA into a LoraManager lora_syntax widget', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 4,
      type: 'LoRA Text Loader (LoraManager)',
      mode: 0,
      inputs: [],
      outputs: [],
      widgets_values: [''],
    })
    const instancePath = 'wai/USNR_STYLE_ILL_V1_lokr3-000024.safetensors'
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        'LoRA Text Loader (LoraManager)': {
          input: { required: { lora_syntax: ['STRING', { tooltip: 'Format: <lora:lora_name:strength>' }] } },
          input_order: { required: ['lora_syntax'], optional: [] },
          output_node: false,
        },
        LoraLoader: {
          input: { required: { lora_name: [[instancePath], {}] } },
          input_order: { required: ['lora_name'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      loras: [{ id: '68', fileName: 'USNR_STYLE_ILL_V1_lokr3-000024.safetensors', weight: 0.9, triggerWords: ['usnr'] }],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 4)?.widgets_values).toEqual([
      '<lora:wai/USNR_STYLE_ILL_V1_lokr3-000024.safetensors:0.9>',
    ])
    expect(compiled.apiWorkflow['4']).toMatchObject({
      inputs: { lora_syntax: '<lora:wai/USNR_STYLE_ILL_V1_lokr3-000024.safetensors:0.9>' },
    })
  })

  it.each([
    ['COMFYUI_LORA_ASSET_NOT_FOUND', ['wai/another.safetensors']],
    ['COMFYUI_LORA_ASSET_AMBIGUOUS', ['wai/selected.safetensors', 'anima/selected.safetensors']],
  ])('reports %s with the selected file name and target instance choices', async (code, choices) => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 4,
      type: 'LoraLoader',
      mode: 0,
      inputs: [],
      outputs: [],
      widgets_values: ['old.safetensors', 0.5, 0.5],
    })
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        LoraLoader: {
          input: { required: {
            lora_name: [choices, {}],
            strength_model: ['FLOAT', {}],
            strength_clip: ['FLOAT', {}],
          } },
          input_order: { required: ['lora_name', 'strength_model', 'strength_clip'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      loras: [{ id: '68', fileName: 'selected.safetensors', weight: 1, triggerWords: ['selected'] }],
    })).rejects.toMatchObject({ code, message: expect.stringContaining('selected.safetensors') })
  })

  it('reports when selected LoRAs exceed the standard Workflow slot count', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 4,
      type: 'LoraLoader',
      mode: 0,
      inputs: [],
      outputs: [],
      widgets_values: ['old.safetensors', 0.5, 0.5],
    })
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        LoraLoader: {
          input: { required: {
            lora_name: [['wai/one.safetensors', 'wai/two.safetensors'], {}],
            strength_model: ['FLOAT', {}],
            strength_clip: ['FLOAT', {}],
          } },
          input_order: { required: ['lora_name', 'strength_model', 'strength_clip'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      loras: [
        { id: '1', fileName: 'one.safetensors', weight: 1, triggerWords: [] },
        { id: '2', fileName: 'two.safetensors', weight: 0.8, triggerWords: [] },
      ],
    })).rejects.toMatchObject({ code: 'COMFYUI_LORA_CAPACITY_EXCEEDED' })
  })

  it.each([
    ['standard and manager inputs', true],
    ['multiple manager inputs', false],
  ])('reports ambiguous LoRA targets for %s', async (_label, includeStandard) => {
    const actual = structuredClone(workflow)
    const managerNode = (id: number): UiWorkflow['nodes'][number] => ({
      id,
      type: 'Lora Loader (LoraManager)',
      mode: 0,
      properties: { __lm_widget_ids: ['__lm_autocomplete_meta_text', 'text', 'loras'] },
      inputs: [],
      outputs: [],
      widgets_values: [{ version: 1, textWidgetName: 'text' }, '', []],
    })
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push(managerNode(4))
    if (includeStandard) {
      ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
        id: 5,
        type: 'LoraLoader',
        mode: 0,
        inputs: [],
        outputs: [],
        widgets_values: ['old.safetensors', 0.5, 0.5],
      })
    } else {
      ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push(managerNode(5))
    }
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        'Lora Loader (LoraManager)': {
          input: { required: { model: ['MODEL'], text: ['AUTOCOMPLETE_TEXT_LORAS', {}] } },
          input_order: { required: ['model', 'text'], optional: [] },
          output_node: false,
        },
        LoraLoader: {
          input: { required: {
            lora_name: [['wai/selected.safetensors'], {}],
            strength_model: ['FLOAT', {}],
            strength_clip: ['FLOAT', {}],
          } },
          input_order: { required: ['lora_name', 'strength_model', 'strength_clip'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      loras: [{ id: '68', fileName: 'selected.safetensors', weight: 1, triggerWords: [] }],
    })).rejects.toMatchObject({ code: 'COMFYUI_LORA_INPUT_AMBIGUOUS' })
  })

  it('uses legacy LoRA parameters as defaults only when structured selections are absent', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 4,
      type: 'LoraLoader',
      mode: 0,
      inputs: [],
      outputs: [],
      widgets_values: ['old.safetensors', 0.5, 0.5],
    })
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        LoraLoader: {
          input: { required: {
            lora_name: [['wai/default.safetensors', 'wai/selected.safetensors'], {}],
            strength_model: ['FLOAT', {}],
            strength_clip: ['FLOAT', {}],
          } },
          input_order: { required: ['lora_name', 'strength_model', 'strength_clip'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })
    const runtimeParameters = [
      { definition: { parameterId: 'lora_model', kind: 'lora_model', valueType: 'asset_reference' as const, required: false }, value: 'default.safetensors' },
      { definition: { parameterId: 'lora_model_weight', kind: 'lora_model_weight', valueType: 'number' as const, required: false }, value: 0.7 },
    ]

    const legacy = await compiler.compile({
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      runtimeParameters,
      loras: [],
    })
    expect(legacy.actualWorkflow.nodes.find(node => node.id === 4)?.widgets_values).toEqual([
      'wai/default.safetensors', 0.7, 0.7,
    ])

    const structured = await compiler.compile({
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      runtimeParameters,
      loras: [{ id: '68', fileName: 'selected.safetensors', weight: 1, triggerWords: ['selected'] }],
    })
    expect(structured.actualWorkflow.nodes.find(node => node.id === 4)?.widgets_values).toEqual([
      'wai/selected.safetensors', 1, 1,
    ])
  })

  it('reports a Workflow without an executable LoRA input before submitting it to ComfyUI', async () => {
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(objectInfo), { status: 200 })),
    })

    await expect(compiler.compile({
      workflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      loras: [{ id: '68', fileName: 'USNR_STYLE_ILL_V1_lokr3-000024.safetensors', weight: 1, triggerWords: ['usnr'] }],
    })).rejects.toMatchObject({ code: 'COMFYUI_LORA_INPUT_UNAVAILABLE' })
  })

  it('rejects a declared output node that is not an active ComfyUI output node', async () => {
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(objectInfo), { status: 200 })),
    })

    await expect(compiler.compile({
      workflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['2'],
      loras: [],
    })).rejects.toMatchObject({ code: 'WORKFLOW_COMPILE_FAILED' })
  })

  it('aborts a live node-definition request at the configured timeout', async () => {
    const compiler = new ComfyWorkflowCompiler({
      timeoutMs: 1,
      fetchImplementation: vi.fn<typeof fetch>(async (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
      })),
    })
    await expect(compiler.compile({
      workflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: null,
      loras: [],
    })).rejects.toMatchObject({ code: 'COMFYUI_CONNECTION_FAILED' })
  })

  it('rejects invalid timeout, HTTP status and node-definition JSON', async () => {
    expect(() => new ComfyWorkflowCompiler({ timeoutMs: 0 })).toThrow('timeout')
    await expect(new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response('{}', { status: 503 })),
    }).compile({ workflow, connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null }, expectedOutputNodeIds: null, loras: [] }))
      .rejects.toMatchObject({ code: 'COMFYUI_HTTP_ERROR' })
    await expect(new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response('{', { status: 200 })),
    }).compile({ workflow, connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null }, expectedOutputNodeIds: null, loras: [] }))
      .rejects.toMatchObject({ code: 'COMFYUI_PROTOCOL_ERROR' })
  })
})

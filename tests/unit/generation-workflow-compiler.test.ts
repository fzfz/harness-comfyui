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

  it('uses the sole live COMBO choice when a saved UI label is not an API value', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 4,
      type: 'ChoiceNode',
      mode: 0,
      inputs: [],
      outputs: [],
      widgets_values: ['Saved display label'],
      widgets_values_named: { choice: 'Saved display label' },
    })
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        ChoiceNode: {
          input: { required: { choice: [['Only accepted API value'], {}] } },
          input_order: { required: ['choice'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      loras: [],
    })

    expect(compiled.apiWorkflow['4']).toMatchObject({ inputs: { choice: 'Only accepted API value' } })
  })

  it('projects bypassed links to their upstream source and keeps the target widget value for an unresolved bypass source', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 1,
          type: 'ImageProducer',
          mode: 0,
          inputs: [],
          outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [10] }],
          widgets_values: ['source.png'],
        },
        {
          id: 4,
          type: 'BypassImage',
          mode: 4,
          inputs: [
            { name: 'pipe', type: 'PIPE', link: null },
            { name: 'image', type: 'IMAGE', link: 10 },
          ],
          outputs: [
            { name: 'pipe', type: 'PIPE', links: null },
            { name: 'image', type: 'IMAGE', links: [11] },
          ],
          widgets_values: [],
        },
        {
          id: 5,
          type: 'BypassImage',
          mode: 4,
          inputs: [{ name: 'image', type: 'IMAGE', link: 11 }],
          outputs: [{ name: 'image', type: 'IMAGE', links: [12] }],
          widgets_values: [],
        },
        {
          id: 6,
          type: 'PrimitiveInt',
          mode: 4,
          inputs: [],
          outputs: [{ name: 'INT', type: 'INT', links: [13] }],
          widgets_values: [2, 'fixed'],
          widgets_values_named: { value: 2, fixed: 'fixed' },
        },
        {
          id: 7,
          type: 'CountSink',
          mode: 0,
          inputs: [{ name: 'value', type: 'INT', link: 13, widget: { name: 'value' } }],
          outputs: [],
          widgets_values: [1],
          widgets_values_named: { value: 1 },
        },
        {
          id: 3,
          type: 'SaveImage',
          mode: 0,
          inputs: [
            { name: 'images', type: 'IMAGE', link: 12 },
            { name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } },
          ],
          outputs: [],
          widgets_values: ['output'],
        },
      ],
      links: [
        [10, 1, 0, 4, 1, 'IMAGE'],
        [11, 4, 1, 5, 0, 'IMAGE'],
        [12, 5, 0, 3, 0, 'IMAGE'],
        [13, 6, 0, 7, 0, 'INT'],
      ],
    }
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ImageProducer: objectInfo.ImageProducer,
        PrimitiveInt: {
          input: { required: { value: ['INT', {}] } },
          input_order: { required: ['value'], optional: [] },
          output_node: false,
        },
        CountSink: {
          input: { required: { value: ['INT', {}] } },
          input_order: { required: ['value'], optional: [] },
          output_node: false,
        },
        SaveImage: objectInfo.SaveImage,
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      loras: [],
    })

    expect(compiled.apiWorkflow).not.toHaveProperty('4')
    expect(compiled.apiWorkflow).not.toHaveProperty('5')
    expect(compiled.apiWorkflow).not.toHaveProperty('6')
    expect(compiled.apiWorkflow['3']).toMatchObject({ inputs: { images: ['1', 0] } })
    expect(compiled.apiWorkflow['7']).toMatchObject({ inputs: { value: 1 } })
  })

  it('omits an unresolved bypass branch only when the live target input is optional', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 1,
          type: 'ImageProducer',
          mode: 0,
          inputs: [],
          outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [20, 21] }],
          widgets_values: ['source.png'],
        },
        {
          id: 2,
          type: 'BypassEncoder',
          mode: 4,
          inputs: [{ name: 'pixels', type: 'IMAGE', link: 20 }],
          outputs: [{ name: 'LATENT', type: 'LATENT', links: [22] }],
          widgets_values: [],
        },
        {
          id: 3,
          type: 'OptionalSave',
          mode: 0,
          inputs: [
            { name: 'images', type: 'IMAGE', link: 21 },
            { name: 'latent', type: 'LATENT', link: 22 },
          ],
          outputs: [],
          widgets_values: [],
        },
      ],
      links: [
        [20, 1, 0, 2, 0, 'IMAGE'],
        [21, 1, 0, 3, 0, 'IMAGE'],
        [22, 2, 0, 3, 1, 'LATENT'],
      ],
    }
    const definitions = {
      ImageProducer: objectInfo.ImageProducer,
      BypassEncoder: {
        input: { required: { pixels: ['IMAGE'] } },
        input_order: { required: ['pixels'], optional: [] },
        output_node: false,
      },
      OptionalSave: {
        input: { required: { images: ['IMAGE'] }, optional: { latent: ['LATENT'] } },
        input_order: { required: ['images'], optional: ['latent'] },
        output_node: true,
      },
    }
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(definitions), { status: 200 })),
    })

    const compiled = await compiler.compile({
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      loras: [],
    })

    expect(compiled.apiWorkflow['3']).toMatchObject({ inputs: { images: ['1', 0] } })
    expect((compiled.apiWorkflow['3'] as { inputs: Record<string, JsonValue> }).inputs).not.toHaveProperty('latent')

    const requiredCompiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...definitions,
        OptionalSave: {
          input: { required: { images: ['IMAGE'], latent: ['LATENT'] }, optional: {} },
          input_order: { required: ['images', 'latent'], optional: [] },
          output_node: true,
        },
      }), { status: 200 })),
    })
    await expect(requiredCompiler.compile({
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      loras: [],
    })).rejects.toMatchObject({ code: 'WORKFLOW_COMPILE_FAILED' })
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

  it('rewrites the executable upstream Prompt when a binding points to a connected CLIP widget', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 1,
          type: 'ImpactWildcardProcessor',
          title: 'POSITIVE',
          mode: 0,
          inputs: [{ name: 'seed', type: 'INT', link: null, widget: { name: 'seed' } }],
          outputs: [{ name: 'processed text', type: 'STRING', links: [10] }],
          widgets_values: ['template prompt', 'template prompt', 'populate', 7, 'randomize', 'Select Wildcard'],
          widgets_values_named: {
            wildcard_text: 'template prompt',
            populated_text: 'template prompt',
            mode: 'populate',
            seed: 7,
            control_after_generate: 'randomize',
            'Select to add Wildcard': 'Select Wildcard',
          },
        },
        {
          id: 2,
          type: 'CLIPTextEncode',
          title: 'CLIP Text Encode (Positive)',
          mode: 0,
          inputs: [
            { name: 'clip', type: 'CLIP', link: null },
            { name: 'text', type: 'STRING', link: 10, widget: { name: 'text' } },
          ],
          outputs: [],
          widgets_values: ['template prompt'],
          widgets_values_named: { text: 'template prompt' },
        },
        {
          id: 3,
          type: 'SaveImage',
          mode: 0,
          inputs: [{ name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } }],
          outputs: [],
          widgets_values: ['output'],
        },
      ],
      links: [[10, 1, 0, 2, 1, 'STRING']],
    }
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ImpactWildcardProcessor: {
          input: { required: {
            wildcard_text: ['STRING', {}],
            populated_text: ['STRING', {}],
            mode: [['populate', 'fixed'], {}],
            seed: ['INT', { control_after_generate: true }],
            'Select to add Wildcard': [['Select Wildcard'], {}],
          } },
          input_order: { required: ['wildcard_text', 'populated_text', 'mode', 'seed', 'Select to add Wildcard'], optional: [] },
          output_node: false,
        },
        CLIPTextEncode: objectInfo.CLIPTextEncode,
        SaveImage: objectInfo.SaveImage,
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      runtimeParameters: [{
        definition: { parameterId: 'positive_prompt', kind: 'positive_prompt', valueType: 'string', required: false },
        value: 'usnr, gthan, 1girl',
      }],
      bindingHints: [{ parameterId: 'positive_prompt', operation: 'replace_input', nodeId: '2', inputName: 'text', widgetIndex: 0 }],
      loras: [],
    })

    expect(compiled.apiWorkflow['1']).toMatchObject({ inputs: { wildcard_text: 'usnr, gthan, 1girl' } })
    expect(compiled.apiWorkflow['2']).toMatchObject({ inputs: { text: ['1', 0] } })
    const upstreamValues = compiled.actualWorkflow.nodes[0]?.widgets_values
    expect(Array.isArray(upstreamValues) ? upstreamValues[0] : undefined).toBe('usnr, gthan, 1girl')
    expect(compiled.actualWorkflow.nodes[0]?.widgets_values_named).toMatchObject({ wildcard_text: 'usnr, gthan, 1girl' })
  })

  it('materializes only the rgthree frontend random seed sentinel before API Workflow compilation', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push(
      {
        id: 40,
        type: 'Seed (rgthree)',
        mode: 0,
        inputs: [],
        outputs: [{ name: 'SEED', type: 'INT', links: [] }],
        widgets_values: [-1],
        widgets_values_named: { seed: -1 },
      },
      {
        id: 41,
        type: 'Seed (rgthree)',
        mode: 0,
        inputs: [],
        outputs: [{ name: 'SEED', type: 'INT', links: [] }],
        widgets_values: [7711],
        widgets_values_named: { seed: 7711 },
      },
      {
        id: 42,
        type: 'KSampler',
        mode: 0,
        inputs: [],
        outputs: [],
        widgets_values: [-1, 'fixed'],
        widgets_values_named: { seed: -1 },
      },
      {
        id: 43,
        type: 'Seed (rgthree)',
        mode: 4,
        inputs: [],
        outputs: [{ name: 'SEED', type: 'INT', links: [] }],
        widgets_values: [-1],
        widgets_values_named: { seed: -1 },
      },
    )
    const createRandomSeed = vi.fn(() => 38_521_047)
    const compiler = new ComfyWorkflowCompiler({
      createRandomSeed,
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        'Seed (rgthree)': {
          input: { required: { seed: ['INT', { default: 0, min: -1125899906842624, max: 1125899906842624 }] } },
          input_order: { required: ['seed'], optional: [] },
          output_node: false,
        },
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
      loras: [],
    })

    expect(createRandomSeed).toHaveBeenCalledOnce()
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 40)?.widgets_values).toEqual([38_521_047])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 40)?.widgets_values_named).toEqual({ seed: 38_521_047 })
    expect(compiled.apiWorkflow['40']).toMatchObject({ inputs: { seed: 38_521_047 } })
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 41)?.widgets_values).toEqual([7711])
    expect(compiled.apiWorkflow['41']).toMatchObject({ inputs: { seed: 7711 } })
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 42)?.widgets_values).toEqual([-1, 'fixed'])
    expect(compiled.apiWorkflow['42']).toMatchObject({ inputs: { seed: -1 } })
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 43)?.widgets_values).toEqual([-1])
    expect(compiled.apiWorkflow).not.toHaveProperty('43')
  })

  it('uses the default rgthree random seed generator within the frontend seed range', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 40,
      type: 'Seed (rgthree)',
      mode: 0,
      inputs: [],
      outputs: [{ name: 'SEED', type: 'INT', links: [] }],
      widgets_values: [-1],
      widgets_values_named: { seed: -1 },
    })
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        'Seed (rgthree)': {
          input: { required: { seed: ['INT', { default: 0, min: -1125899906842624, max: 1125899906842624 }] } },
          input_order: { required: ['seed'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      loras: [],
    })
    const apiNode = compiled.apiWorkflow['40']
    const inputs = apiNode !== null && typeof apiNode === 'object' && !Array.isArray(apiNode)
      ? (apiNode as Readonly<Record<string, JsonValue>>).inputs
      : undefined
    const value = inputs !== null && typeof inputs === 'object' && !Array.isArray(inputs)
      ? (inputs as Readonly<Record<string, JsonValue>>).seed
      : undefined

    expect(value).toEqual(expect.any(Number))
    expect(Number.isSafeInteger(value)).toBe(true)
    expect(value).toBeGreaterThanOrEqual(0)
    expect(value).toBeLessThan(1125899906842624)
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 40)?.widgets_values).toEqual([value as number])
  })

  it('rejects an invalid concrete seed returned for the rgthree frontend random sentinel', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 40,
      type: 'Seed (rgthree)',
      mode: 0,
      inputs: [],
      outputs: [{ name: 'SEED', type: 'INT', links: [] }],
      widgets_values: [-1],
    })
    const compiler = new ComfyWorkflowCompiler({
      createRandomSeed: () => -1,
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        'Seed (rgthree)': {
          input: { required: { seed: ['INT', { default: 0, min: -1125899906842624, max: 1125899906842624 }] } },
          input_order: { required: ['seed'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      loras: [],
    })).rejects.toMatchObject({
      code: 'WORKFLOW_COMPILE_FAILED',
      message: 'Seed (rgthree) random seed generator returned an invalid seed.',
    })
  })

  it('rewrites an upstream dimension scalar when the latent-image binding points to a connected widget', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 1,
          type: 'easy int',
          title: 'Width',
          mode: 0,
          inputs: [],
          outputs: [{ name: 'int', type: 'INT', links: [10] }],
          widgets_values: [1024],
          widgets_values_named: { value: 1024 },
        },
        {
          id: 2,
          type: 'EmptyLatentImage',
          mode: 0,
          inputs: [{ name: 'width', type: 'INT', link: 10, widget: { name: 'width' } }],
          outputs: [],
          widgets_values: [512],
          widgets_values_named: { width: 512 },
        },
        {
          id: 3,
          type: 'SaveImage',
          mode: 0,
          inputs: [{ name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } }],
          outputs: [],
          widgets_values: ['output'],
        },
      ],
      links: [[10, 1, 0, 2, 0, 'INT']],
    }
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        'easy int': {
          input: { required: { value: ['INT', {}] } },
          input_order: { required: ['value'], optional: [] },
          output_node: false,
        },
        EmptyLatentImage: {
          input: { required: { width: ['INT', {}] } },
          input_order: { required: ['width'], optional: [] },
          output_node: false,
        },
        SaveImage: objectInfo.SaveImage,
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      runtimeParameters: [{
        definition: { parameterId: 'width', kind: 'width', valueType: 'integer', defaultValue: 512, required: false },
        value: 640,
      }],
      bindingHints: [{ parameterId: 'width', operation: 'replace_input', nodeId: '2', inputName: 'width', widgetIndex: 0 }],
      loras: [],
    })

    expect(compiled.apiWorkflow['1']).toMatchObject({ inputs: { value: 640 } })
    expect(compiled.apiWorkflow['2']).toMatchObject({ inputs: { width: ['1', 0] } })
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

  it('uses an active SeedNode when an unsuffixed seed binding targets a bypassed node', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push(
      { id: 5, type: 'SeedNode', mode: 0, inputs: [], outputs: [], widgets_values: [501, 'randomize'] },
      { id: 6, type: 'KSampler', mode: 0, inputs: [], outputs: [], widgets_values: [601, 'fixed'] },
      { id: 7, type: 'KSampler', mode: 0, inputs: [], outputs: [], widgets_values: [701, 'fixed'] },
      { id: 25, type: 'KSampler', mode: 4, inputs: [], outputs: [], widgets_values: [801, 'fixed'] },
    )
    const seedDefinition = {
      input: { required: { seed: ['INT', { control_after_generate: true }] } },
      input_order: { required: ['seed'], optional: [] },
      output_node: false,
    }
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        SeedNode: seedDefinition,
        KSampler: seedDefinition,
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      runtimeParameters: [
        { definition: { parameterId: 'seed', kind: 'seed', valueType: 'integer', required: false, defaultValue: 801 }, value: 101 },
        { definition: { parameterId: 'seed_6', kind: 'seed', valueType: 'integer', required: false, defaultValue: 601 }, value: 202 },
      ],
      bindingHints: [{ parameterId: 'seed', operation: 'replace_input', nodeId: '25', inputName: 'seed', widgetIndex: 0 }],
      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 5)?.widgets_values).toEqual([101, 'randomize'])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 6)?.widgets_values).toEqual([202, 'fixed'])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 7)?.widgets_values).toEqual([701, 'fixed'])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 25)?.widgets_values).toEqual([801, 'fixed'])
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

  it('replaces a Power Lora Loader with resolved dynamic LoRA inputs in selection order', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 4,
      type: 'Power Lora Loader (rgthree)',
      mode: 0,
      properties: { 'Show Strengths': 'Single Strength' },
      inputs: [],
      outputs: [],
      widgets_values: [
        {},
        { type: 'PowerLoraLoaderHeaderWidget' },
        { on: true, lora: 'wai\\template-one.safetensors', strength: 1.5, strengthTwo: null },
        { on: true, lora: 'wai\\template-two.safetensors', strength: 0.7, strengthTwo: null },
        {},
        '',
      ],
      widgets_values_named: {
        divider: {},
        PowerLoraLoaderHeaderWidget: { type: 'PowerLoraLoaderHeaderWidget' },
        lora_1: { on: true, lora: 'wai\\template-one.safetensors', strength: 1.5, strengthTwo: null },
        lora_2: { on: true, lora: 'wai\\template-two.safetensors', strength: 0.7, strengthTwo: null },
        '➕ Add Lora': '',
      },
    })
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        'Power Lora Loader (rgthree)': {
          input: { required: { model: ['MODEL'], clip: ['CLIP'] } },
          input_order: { required: ['model', 'clip'], optional: [] },
          output_node: false,
        },
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
        { id: '68', fileName: 'USNR_STYLE_ILL_V1_lokr3-000024.safetensors', weight: 0.85, triggerWords: ['usnr'] },
        { id: '69', fileName: 'GTHAN-EQ.safetensors', weight: 0.65, triggerWords: ['gthan'] },
      ],
    })

    const expectedWidgets = [
      { on: true, lora: 'wai\\USNR_STYLE_ILL_V1_lokr3-000024.safetensors', strength: 0.85 },
      { on: true, lora: 'wai\\GTHAN-EQ.safetensors', strength: 0.65 },
    ]
    const actualNode = compiled.actualWorkflow.nodes.find(node => node.id === 4)
    expect(actualNode?.widgets_values).toEqual([
      {},
      { type: 'PowerLoraLoaderHeaderWidget' },
      ...expectedWidgets,
      {},
      '',
    ])
    expect(actualNode?.widgets_values_named).toEqual({
      divider: {},
      PowerLoraLoaderHeaderWidget: { type: 'PowerLoraLoaderHeaderWidget' },
      lora_1: expectedWidgets[0],
      lora_2: expectedWidgets[1],
      '➕ Add Lora': '',
    })
    expect(compiled.apiWorkflow['4']).toEqual({
      class_type: 'Power Lora Loader (rgthree)',
      inputs: {
        lora_1: expectedWidgets[0],
        lora_2: expectedWidgets[1],
      },
    })
  })

  it('inserts the first selected LoRA after an empty Power Lora Loader header', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 4,
      type: 'Power Lora Loader (rgthree)',
      mode: 0,
      inputs: [],
      outputs: [],
      widgets_values: [{}, { type: 'PowerLoraLoaderHeaderWidget' }, {}, ''],
      widgets_values_named: {
        divider: {},
        PowerLoraLoaderHeaderWidget: { type: 'PowerLoraLoaderHeaderWidget' },
        '➕ Add Lora': '',
      },
    })
    const instancePath = 'wai\\USNR_STYLE_ILL_V1_lokr3-000024.safetensors'
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        'Power Lora Loader (rgthree)': {
          input: { required: { model: ['MODEL'], clip: ['CLIP'] } },
          input_order: { required: ['model', 'clip'], optional: [] },
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
      loras: [{ id: '68', fileName: 'USNR_STYLE_ILL_V1_lokr3-000024.safetensors', weight: 0.85, triggerWords: ['usnr'] }],
    })
    const selected = { on: true, lora: instancePath, strength: 0.85 }

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 4)?.widgets_values).toEqual([
      {}, { type: 'PowerLoraLoaderHeaderWidget' }, selected, {}, '',
    ])
    expect(compiled.apiWorkflow['4']).toMatchObject({ inputs: { lora_1: selected } })
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

  it('replaces the template checkpoint with the selected model using the target instance path', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 4,
      type: 'CheckpointLoaderSimple',
      mode: 0,
      inputs: [{ name: 'ckpt_name', type: 'COMBO', link: null, widget: { name: 'ckpt_name' } }],
      outputs: [],
      widgets_values: ['wai\\rinSoftsketch_v20.safetensors'],
      widgets_values_named: { ckpt_name: 'wai\\rinSoftsketch_v20.safetensors' },
    })
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        CheckpointLoaderSimple: {
          input: { required: { ckpt_name: [[
            'wai\\rinSoftsketch_v20.safetensors',
            'wai\\waiIllustriousSDXL_v170.safetensors',
          ], {}] } },
          input_order: { required: ['ckpt_name'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      model: { id: '1', fileName: 'waiIllustriousSDXL_v170.safetensors' },
      loras: [],
    })

    const actualNode = compiled.actualWorkflow.nodes.find(node => node.id === 4)
    expect(actualNode?.widgets_values).toEqual(['wai\\waiIllustriousSDXL_v170.safetensors'])
    expect(actualNode?.widgets_values_named).toEqual({ ckpt_name: 'wai\\waiIllustriousSDXL_v170.safetensors' })
    expect(compiled.apiWorkflow['4']).toMatchObject({
      inputs: { ckpt_name: 'wai\\waiIllustriousSDXL_v170.safetensors' },
    })
  })

  it.each([
    ['COMFYUI_MODEL_ASSET_NOT_FOUND', ['wai/another.safetensors']],
    ['COMFYUI_MODEL_ASSET_AMBIGUOUS', ['wai/selected.safetensors', 'anima/selected.safetensors']],
  ])('reports %s when the selected model basename does not resolve uniquely', async (code, choices) => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 4,
      type: 'CheckpointLoaderSimple',
      mode: 0,
      inputs: [{ name: 'ckpt_name', type: 'COMBO', link: null, widget: { name: 'ckpt_name' } }],
      outputs: [],
      widgets_values: ['wai/default.safetensors'],
    })
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        CheckpointLoaderSimple: {
          input: { required: { ckpt_name: [choices, {}] } },
          input_order: { required: ['ckpt_name'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      model: { id: '1', fileName: 'selected.safetensors' },
      loras: [],
    })).rejects.toMatchObject({ code })
  })

  it('reports a Workflow without one unique executable model input', async () => {
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(objectInfo), { status: 200 })),
    })

    await expect(compiler.compile({
      workflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      model: { id: '1', fileName: 'selected.safetensors' },
      loras: [],
    })).rejects.toMatchObject({ code: 'COMFYUI_MODEL_INPUT_UNAVAILABLE' })
  })

  it('reports multiple executable model inputs instead of replacing an arbitrary node', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push(
      {
        id: 4,
        type: 'CheckpointLoaderSimple',
        mode: 0,
        inputs: [{ name: 'ckpt_name', type: 'COMBO', link: null, widget: { name: 'ckpt_name' } }],
        outputs: [],
        widgets_values: ['wai/default.safetensors'],
      },
      {
        id: 5,
        type: 'UNETLoader',
        mode: 0,
        inputs: [{ name: 'unet_name', type: 'COMBO', link: null, widget: { name: 'unet_name' } }],
        outputs: [],
        widgets_values: ['wai/default.safetensors'],
      },
    )
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        CheckpointLoaderSimple: {
          input: { required: { ckpt_name: [['wai/default.safetensors', 'wai/selected.safetensors'], {}] } },
          input_order: { required: ['ckpt_name'], optional: [] },
          output_node: false,
        },
        UNETLoader: {
          input: { required: { unet_name: [['wai/default.safetensors', 'wai/selected.safetensors'], {}] } },
          input_order: { required: ['unet_name'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      model: { id: '1', fileName: 'selected.safetensors' },
      loras: [],
    })).rejects.toMatchObject({ code: 'COMFYUI_MODEL_INPUT_AMBIGUOUS' })
  })

  it('replaces a UNET model input and preserves the instance path separator', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 4,
      type: 'UNETLoader',
      mode: 0,
      inputs: [{ name: 'unet_name', type: 'COMBO', link: null, widget: { name: 'unet_name' } }],
      outputs: [],
      widgets_values: ['anima\\default.safetensors'],
    })
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        UNETLoader: {
          input: { required: { unet_name: [['anima\\default.safetensors', 'anima\\selected.safetensors'], {}] } },
          input_order: { required: ['unet_name'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['3'],
      model: { id: '3', fileName: 'anima/selected.safetensors' },
      loras: [],
    })

    expect(compiled.apiWorkflow['4']).toMatchObject({ inputs: { unet_name: 'anima\\selected.safetensors' } })
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

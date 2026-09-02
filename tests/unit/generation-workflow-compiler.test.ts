import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import type { JsonValue } from '../../src/host/generation/generation-runtime.ts'
import {
  OfficialApiWorkflowCompiler,
  overlayRuntimeApiWorkflow,
  type ComfyFrontendExporter,
} from '../../src/host/generation/official-api-workflow.ts'
import {
  ComfyWorkflowCompiler,
  type ComfyWorkflowCompilerOptions,
} from '../../src/host/generation/workflow-compiler.ts'
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

const fixtureOutputInfo = {
  input: { required: { filename_prefix: ['STRING', {}] } },
  input_order: { required: ['filename_prefix'], optional: [] },
  output_node: true,
}

function sizeOutputWorkflow(options: {
  readonly includeValidOutput: boolean
  readonly maskRequired: boolean
}): UiWorkflow {
  const nodes: Array<UiWorkflow['nodes'][number]> = [
    {
      id: 1,
      type: 'EmptyLatentImage',
      mode: 0,
      inputs: [
        { name: 'width', type: 'INT', link: null, widget: { name: 'width' } },
        { name: 'height', type: 'INT', link: null, widget: { name: 'height' } },
        { name: 'batch_size', type: 'INT', link: null, widget: { name: 'batch_size' } },
      ],
      outputs: [{ name: 'LATENT', type: 'LATENT', links: [11] }],
      widgets_values: [768, 1024, 1],
    },
    {
      id: 2,
      type: 'VAEDecode',
      mode: 0,
      inputs: [{ name: 'samples', type: 'LATENT', link: 11 }],
      outputs: [{ name: 'IMAGE', type: 'IMAGE', links: options.includeValidOutput ? [21] : [22] }],
      widgets_values: [],
    },
    {
      id: 4,
      type: 'SaveWithMask',
      mode: 0,
      inputs: [
        { name: 'images', type: 'IMAGE', link: options.includeValidOutput ? 23 : 22 },
        { name: 'mask', type: 'MASK', link: null },
        { name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } },
      ],
      outputs: [],
      widgets_values: ['masked-output'],
    },
  ]
  if (options.includeValidOutput) {
    nodes.splice(2, 0, {
      id: 3,
      type: 'SaveImage',
      mode: 0,
      inputs: [
        { name: 'images', type: 'IMAGE', link: 21 },
        { name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } },
      ],
      outputs: [],
      widgets_values: ['valid-output'],
    })
    nodes.splice(3, 0, {
      id: 5,
      type: 'ImageProducer',
      mode: 0,
      inputs: [],
      outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [23] }],
      widgets_values: ['independent-source'],
    })
  }
  return {
    version: 0.4,
    nodes,
    links: [
      [11, 1, 0, 2, 0, 'LATENT'],
      ...(options.includeValidOutput ? [[21, 2, 0, 3, 0, 'IMAGE'] as const] : []),
      ...(options.includeValidOutput
        ? [[23, 5, 0, 4, 0, 'IMAGE'] as const]
        : [[22, 2, 0, 4, 0, 'IMAGE'] as const]),
    ],
  }
}

function sizeOutputObjectInfo(maskRequired: boolean) {
  return {
    EmptyLatentImage: {
      input: { required: {
        width: ['INT', { min: 256, max: 2048 }],
        height: ['INT', { min: 256, max: 2048 }],
        batch_size: ['INT', { min: 1, max: 8 }],
      } },
      input_order: { required: ['width', 'height', 'batch_size'], optional: [] },
      output_node: false,
    },
    VAEDecode: {
      input: { required: { samples: ['LATENT'] } },
      input_order: { required: ['samples'], optional: [] },
      output_node: false,
    },
    ImageProducer: objectInfo.ImageProducer,
    SaveImage: objectInfo.SaveImage,
    SaveWithMask: {
      input: {
        required: {
          images: ['IMAGE'],
          ...(maskRequired ? { mask: ['MASK'] } : {}),
          filename_prefix: ['STRING', {}],
        },
        optional: maskRequired ? {} : { mask: ['MASK'] },
      },
      input_order: {
        required: maskRequired ? ['images', 'mask', 'filename_prefix'] : ['images', 'filename_prefix'],
        optional: maskRequired ? [] : ['mask'],
      },
      output_node: true,
    },
  }
}

function createCompiler(
  options: Omit<ComfyWorkflowCompilerOptions, 'officialApiWorkflowCompiler'> = {},
): ComfyWorkflowCompiler {
  return new ComfyWorkflowCompiler({
    ...options,
    officialApiWorkflowCompiler: {
      compile: async input => ({
        apiWorkflow: input.runtimeProjection,
        cacheKey: 'test-cache-key',
        cacheStatus: 'miss',
      }),
    },
  })
}

describe('ComfyWorkflowCompiler', () => {
  it('inspects a paired width and height contract without running the official compiler', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 4,
          type: 'EmptyLatentImage',
          mode: 0,
          inputs: [
            { name: 'width', type: 'INT', link: null, widget: { name: 'width' } },
            { name: 'height', type: 'INT', link: null, widget: { name: 'height' } },
            { name: 'batch_size', type: 'INT', link: null, widget: { name: 'batch_size' } },
          ],
          outputs: [],
          widgets_values: [768, 1024, 1],
        },
      ],
      links: [],
    }
    const officialCompile = vi.fn()
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        EmptyLatentImage: {
          input: { required: {
            width: ['INT', { min: 256, max: 2048, step: 8 }],
            height: ['INT', { min: 256, max: 2048, step: 8 }],
            batch_size: ['INT', { min: 1, max: 8 }],
          } },
          input_order: { required: ['width', 'height', 'batch_size'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
      officialApiWorkflowCompiler: { compile: officialCompile },
    })

    const inspection = await compiler.inspectRuntimeParameters({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })

    expect(inspection).toEqual({
      parameters: [
        {
          parameter_id: 'batch_size',
          kind: 'batch_size',
          value_type: 'integer',
          current_value: 1,
          minimum: 1,
          maximum: 8,
        },
      ],
      size_candidates: [
        {
          candidate_id: 'width_height:width:height',
          representation: 'width_height',
          width: {
            parameter_id: 'width',
            kind: 'width',
            value_type: 'integer',
            current_value: 768,
            minimum: 256,
            maximum: 2048,
          },
          height: {
            parameter_id: 'height',
            kind: 'height',
            value_type: 'integer',
            current_value: 1024,
            minimum: 256,
            maximum: 2048,
          },
        },
      ],
    })
    expect(officialCompile).not.toHaveBeenCalled()
    expect(actual.nodes[0]?.widgets_values).toEqual([768, 1024, 1])
  })

  it('inspects the terminal adjustable size pair when a downstream latent upscale controls saved output dimensions', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 4,
          type: 'EmptyLatentImage',
          mode: 0,
          inputs: [
            { name: 'width', type: 'INT', link: null, widget: { name: 'width' } },
            { name: 'height', type: 'INT', link: null, widget: { name: 'height' } },
            { name: 'batch_size', type: 'INT', link: null, widget: { name: 'batch_size' } },
          ],
          outputs: [{ name: 'LATENT', type: 'LATENT', links: [45] }],
          widgets_values: [1024, 1024, 1],
        },
        {
          id: 5,
          type: 'KSampler',
          mode: 0,
          inputs: [
            { name: 'latent_image', type: 'LATENT', link: 45 },
            { name: 'seed', type: 'INT', link: null, widget: { name: 'seed' } },
          ],
          outputs: [{ name: 'LATENT', type: 'LATENT', links: [40] }],
          widgets_values: [101],
        },
        {
          id: 6,
          type: 'LatentUpscale',
          mode: 0,
          inputs: [
            { name: 'samples', type: 'LATENT', link: 40 },
            { name: 'upscale_method', type: 'COMBO', link: null, widget: { name: 'upscale_method' } },
            { name: 'width', type: 'INT', link: null, widget: { name: 'width' } },
            { name: 'height', type: 'INT', link: null, widget: { name: 'height' } },
            { name: 'crop', type: 'COMBO', link: null, widget: { name: 'crop' } },
          ],
          outputs: [{ name: 'LATENT', type: 'LATENT', links: [67] }],
          widgets_values: ['bicubic', 1152, 1512, 'disabled'],
        },
        {
          id: 7,
          type: 'KSampler',
          mode: 0,
          inputs: [
            { name: 'latent_image', type: 'LATENT', link: 67 },
            { name: 'seed', type: 'INT', link: null, widget: { name: 'seed' } },
          ],
          outputs: [{ name: 'LATENT', type: 'LATENT', links: [78] }],
          widgets_values: [202],
        },
        {
          id: 8,
          type: 'VAEDecode',
          mode: 0,
          inputs: [{ name: 'samples', type: 'LATENT', link: 78 }],
          outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [80] }],
          widgets_values: [],
        },
        {
          id: 9,
          type: 'SaveImage',
          mode: 0,
          inputs: [
            { name: 'images', type: 'IMAGE', link: 80 },
            { name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } },
          ],
          outputs: [],
          widgets_values: ['output'],
        },
        {
          id: 10,
          type: 'SamplerName',
          mode: 0,
          inputs: [{ name: 'value', type: 'COMBO', link: null, widget: { name: 'value' } }],
          outputs: [{ name: 'COMBO', type: 'COMBO', links: [90] }],
          widgets_values: ['euler'],
        },
        {
          id: 11,
          type: 'ShowAnything',
          mode: 0,
          inputs: [{ name: 'anything', type: '*', link: 90 }],
          outputs: [],
          widgets_values: [],
        },
      ],
      links: [
        [45, 4, 0, 5, 0, 'LATENT'],
        [40, 5, 0, 6, 0, 'LATENT'],
        [67, 6, 0, 7, 0, 'LATENT'],
        [78, 7, 0, 8, 0, 'LATENT'],
        [80, 8, 0, 9, 0, 'IMAGE'],
        [90, 10, 0, 11, 0, 'COMBO'],
      ],
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        EmptyLatentImage: {
          input: { required: {
            width: ['INT', { min: 256, max: 2048 }],
            height: ['INT', { min: 256, max: 2048 }],
            batch_size: ['INT', { min: 1, max: 8 }],
          } },
          input_order: { required: ['width', 'height', 'batch_size'], optional: [] },
          output_node: false,
        },
        LatentUpscale: {
          input: { required: {
            samples: ['LATENT'],
            upscale_method: [['bicubic'], {}],
            width: ['INT', { min: 256, max: 2048 }],
            height: ['INT', { min: 256, max: 2048 }],
            crop: [['disabled'], {}],
          } },
          input_order: { required: ['samples', 'upscale_method', 'width', 'height', 'crop'], optional: [] },
          output_node: false,
        },
        KSampler: {
          input: { required: {
            latent_image: ['LATENT'],
            seed: ['INT', { min: 0, max: 2147483647 }],
          } },
          input_order: { required: ['latent_image', 'seed'], optional: [] },
          output_node: false,
        },
        VAEDecode: {
          input: { required: { samples: ['LATENT'] } },
          input_order: { required: ['samples'], optional: [] },
          output_node: false,
        },
        SamplerName: {
          input: { required: { value: [['euler'], {}] } },
          input_order: { required: ['value'], optional: [] },
          output_node: false,
        },
        ShowAnything: {
          input: { required: { anything: ['*'] } },
          input_order: { required: ['anything'], optional: [] },
          output_node: true,
        },
        SaveImage: objectInfo.SaveImage,
      }), { status: 200 })),
    })

    const inspection = await compiler.inspectRuntimeParameters({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })

    expect(inspection.size_candidates).toEqual([
      {
        candidate_id: 'width_height:width_6:height_6',
        representation: 'width_height',
        width: {
          parameter_id: 'width_6',
          kind: 'width',
          value_type: 'integer',
          current_value: 1152,
          minimum: 256,
          maximum: 2048,
        },
        height: {
          parameter_id: 'height_6',
          kind: 'height',
          value_type: 'integer',
          current_value: 1512,
          minimum: 256,
          maximum: 2048,
        },
      },
    ])
    expect(inspection.parameters.filter(parameter => parameter.kind === 'seed')).toEqual([
      {
        parameter_id: 'seed',
        kind: 'seed',
        value_type: 'integer',
        current_value: 101,
        minimum: 0,
        maximum: 2147483647,
      },
    ])

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { width_6: 1024, height_6: 1024 },
      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 4)?.widgets_values).toEqual([1024, 1024, 1])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 6)?.widgets_values).toEqual([
      'bicubic', 1024, 1024, 'disabled',
    ])
    expect(compiled.apiWorkflow['6']).toMatchObject({ inputs: { width: 1024, height: 1024 } })
  })

  it('inspects selector and mapped resolution-preset size representations without active outputs', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 10,
          type: 'ResolutionSelector',
          mode: 0,
          inputs: [
            { name: 'aspect_ratio', type: 'COMBO', link: null, widget: { name: 'aspect_ratio' } },
            { name: 'megapixels', type: 'FLOAT', link: null, widget: { name: 'megapixels' } },
          ],
          outputs: [],
          widgets_values: ['9:16', 1],
        },
        {
          id: 11,
          type: 'ResolutionPreset',
          mode: 0,
          inputs: [{ name: 'resolution', type: 'COMBO', link: null, widget: { name: 'resolution' } }],
          outputs: [],
          widgets_values: ['1024x1024'],
        },
      ],
      links: [],
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ResolutionSelector: {
          input: { required: {
            aspect_ratio: [['1:1', '9:16', '16:9'], {}],
            megapixels: ['FLOAT', { min: 0.5, max: 2 }],
          } },
          input_order: { required: ['aspect_ratio', 'megapixels'], optional: [] },
          output_node: false,
        },
        ResolutionPreset: {
          input: { required: {
            resolution: [['1024x1024', '768 × 1344', 'custom'], {}],
          } },
          input_order: { required: ['resolution'], optional: [] },
          output_node: false,
        },
        ResultSink: fixtureOutputInfo,
      }), { status: 200 })),
    })

    const inspection = await compiler.inspectRuntimeParameters({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })

    expect(inspection.size_candidates).toEqual([
      {
        candidate_id: 'aspect_ratio_megapixels:aspect_ratio:megapixels',
        representation: 'aspect_ratio_megapixels',
        aspect_ratio: {
          parameter_id: 'aspect_ratio',
          kind: 'aspect_ratio',
          value_type: 'choice',
          current_value: '9:16',
          allowed_values: ['1:1', '9:16', '16:9'],
        },
        megapixels: {
          parameter_id: 'megapixels',
          kind: 'megapixels',
          value_type: 'number',
          current_value: 1,
          minimum: 0.5,
          maximum: 2,
        },
      },
      {
        candidate_id: 'resolution_preset:resolution_preset',
        representation: 'resolution_preset',
        parameter: {
          parameter_id: 'resolution_preset',
          kind: 'resolution_preset',
          value_type: 'choice',
          current_value: '1024x1024',
          allowed_values: ['1024x1024', '768 × 1344', 'custom'],
        },
        mapped_options: [
          { value: '1024x1024', width: 1024, height: 1024 },
          { value: '768 × 1344', width: 768, height: 1344 },
        ],
        unmapped_values: ['custom'],
      },
    ])

    const selectorCandidate = inspection.size_candidates[0]
    expect(selectorCandidate?.representation).toBe('aspect_ratio_megapixels')
    if (!selectorCandidate || selectorCandidate.representation !== 'aspect_ratio_megapixels') {
      throw new Error('Expected an aspect-ratio and megapixels size candidate')
    }
    const compileWorkflow: UiWorkflow = {
      ...actual,
      nodes: [
        ...actual.nodes,
        {
          id: 12,
          type: 'ResultSink',
          mode: 0,
          inputs: [{ name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } }],
          outputs: [],
          widgets_values: ['output'],
        },
      ],
    }
    const selectorCompiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: compileWorkflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: {
        [selectorCandidate.aspect_ratio.parameter_id]: '16:9',
        [selectorCandidate.megapixels.parameter_id]: 2,
      },
      loras: [],
    })
    expect(selectorCompiled.actualWorkflow.nodes.find(node => node.id === 10)?.widgets_values).toEqual(['16:9', 2])
    expect(selectorCompiled.apiWorkflow['10']).toMatchObject({
      inputs: { aspect_ratio: '16:9', megapixels: 2 },
    })

    const presetCandidate = inspection.size_candidates[1]
    expect(presetCandidate?.representation).toBe('resolution_preset')
    if (!presetCandidate || presetCandidate.representation !== 'resolution_preset') {
      throw new Error('Expected a resolution-preset size candidate')
    }
    const presetCompiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: compileWorkflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { [presetCandidate.parameter.parameter_id]: '768 × 1344' },
      loras: [],
    })
    expect(presetCompiled.actualWorkflow.nodes.find(node => node.id === 11)?.widgets_values).toEqual(['768 × 1344'])
    expect(presetCompiled.apiWorkflow['11']).toMatchObject({ inputs: { resolution: '768 × 1344' } })

    expect(actual.nodes.find(node => node.id === 10)?.widgets_values).toEqual(['9:16', 1])
    expect(actual.nodes.find(node => node.id === 11)?.widgets_values).toEqual(['1024x1024'])
  })

  it('omits size candidates that cannot control any active image output', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 10,
          type: 'ResolutionSelector',
          mode: 0,
          inputs: [
            { name: 'aspect_ratio', type: 'COMBO', link: null, widget: { name: 'aspect_ratio' } },
            { name: 'megapixels', type: 'FLOAT', link: null, widget: { name: 'megapixels' } },
          ],
          outputs: [],
          widgets_values: ['9:16', 1],
        },
        {
          id: 12,
          type: 'SaveImage',
          mode: 0,
          inputs: [{ name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } }],
          outputs: [],
          widgets_values: ['output'],
        },
      ],
      links: [],
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ResolutionSelector: {
          input: { required: {
            aspect_ratio: [['1:1', '9:16', '16:9'], {}],
            megapixels: ['FLOAT', { min: 0.5, max: 2 }],
          } },
          input_order: { required: ['aspect_ratio', 'megapixels'], optional: [] },
          output_node: false,
        },
        SaveImage: fixtureOutputInfo,
      }), { status: 200 })),
    })

    const inspection = await compiler.inspectRuntimeParameters({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })

    expect(inspection.size_candidates).toEqual([])
  })

  it('ignores an image output that is missing a required connection when retaining a valid output size candidate', async () => {
    const actual = sizeOutputWorkflow({ includeValidOutput: true, maskRequired: true })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(sizeOutputObjectInfo(true)), { status: 200 })),
    })
    const input = {
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    } as const

    const inspection = await compiler.inspectRuntimeParameters(input)
    const compiled = await compiler.compile({ ...input, loras: [] })

    expect(inspection.size_candidates.map(candidate => candidate.candidate_id)).toEqual([
      'width_height:width:height',
    ])
    expect(compiled.activeOutputNodeIds).toEqual(['3'])
  })

  it('does not expose a size candidate when every image output is missing a required connection', async () => {
    const actual = sizeOutputWorkflow({ includeValidOutput: false, maskRequired: true })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(sizeOutputObjectInfo(true)), { status: 200 })),
    })
    const input = {
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    } as const

    const inspection = await compiler.inspectRuntimeParameters(input)

    expect(inspection.size_candidates).toEqual([])
    await expect(compiler.compile({ ...input, loras: [] })).rejects.toMatchObject({
      code: 'WORKFLOW_COMPILE_FAILED',
      message: 'Workflow does not contain an active output node.',
    })
  })

  it('keeps an image output with a disconnected optional input active for inspection and compilation', async () => {
    const actual = sizeOutputWorkflow({ includeValidOutput: false, maskRequired: false })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(sizeOutputObjectInfo(false)), { status: 200 })),
    })
    const input = {
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    } as const

    const inspection = await compiler.inspectRuntimeParameters(input)
    const compiled = await compiler.compile({ ...input, loras: [] })

    expect(inspection.size_candidates.map(candidate => candidate.candidate_id)).toEqual([
      'width_height:width:height',
    ])
    expect(compiled.activeOutputNodeIds).toEqual(['4'])
  })

  it('pairs upstream width and height value widgets through their shared downstream size consumer', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 1,
          type: 'PrimitiveInt',
          mode: 0,
          inputs: [{ name: 'value', type: 'INT', link: null, widget: { name: 'value' } }],
          outputs: [{ name: 'INT', type: 'INT', links: [11] }],
          widgets_values: [768],
        },
        {
          id: 2,
          type: 'PrimitiveInt',
          mode: 0,
          inputs: [{ name: 'value', type: 'INT', link: null, widget: { name: 'value' } }],
          outputs: [{ name: 'INT', type: 'INT', links: [12] }],
          widgets_values: [1024],
        },
        {
          id: 3,
          type: 'EmptyLatentImage',
          mode: 0,
          inputs: [
            { name: 'width', type: 'INT', link: 11, widget: { name: 'width' } },
            { name: 'height', type: 'INT', link: 12, widget: { name: 'height' } },
            { name: 'batch_size', type: 'INT', link: null, widget: { name: 'batch_size' } },
          ],
          outputs: [],
          widgets_values: [768, 1024, 1],
        },
      ],
      links: [
        [11, 1, 0, 3, 0, 'INT'],
        [12, 2, 0, 3, 1, 'INT'],
      ],
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        PrimitiveInt: {
          input: { required: { value: ['INT', { min: 256, max: 2048 }] } },
          input_order: { required: ['value'], optional: [] },
          output_node: false,
        },
        EmptyLatentImage: {
          input: { required: {
            width: ['INT', { min: 256, max: 2048 }],
            height: ['INT', { min: 256, max: 2048 }],
            batch_size: ['INT', { min: 1, max: 8 }],
          } },
          input_order: { required: ['width', 'height', 'batch_size'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const inspection = await compiler.inspectRuntimeParameters({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })

    expect(inspection.size_candidates).toEqual([
      {
        candidate_id: 'width_height:width:height',
        representation: 'width_height',
        width: {
          parameter_id: 'width',
          kind: 'width',
          value_type: 'integer',
          current_value: 768,
          minimum: 256,
          maximum: 2048,
        },
        height: {
          parameter_id: 'height',
          kind: 'height',
          value_type: 'integer',
          current_value: 1024,
          minimum: 256,
          maximum: 2048,
        },
      },
    ])
  })

  it('returns one candidate when a unique upstream size pair feeds multiple downstream consumers', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 1,
          type: 'PrimitiveInt',
          mode: 0,
          inputs: [{ name: 'value', type: 'INT', link: null, widget: { name: 'value' } }],
          outputs: [{ name: 'INT', type: 'INT', links: [11, 13] }],
          widgets_values: [768],
        },
        {
          id: 2,
          type: 'PrimitiveInt',
          mode: 0,
          inputs: [{ name: 'value', type: 'INT', link: null, widget: { name: 'value' } }],
          outputs: [{ name: 'INT', type: 'INT', links: [12, 14] }],
          widgets_values: [1024],
        },
        ...[3, 4].map((id, index) => ({
          id,
          type: 'EmptyLatentImage',
          mode: 0,
          inputs: [
            { name: 'width', type: 'INT', link: index === 0 ? 11 : 13, widget: { name: 'width' } },
            { name: 'height', type: 'INT', link: index === 0 ? 12 : 14, widget: { name: 'height' } },
            { name: 'batch_size', type: 'INT', link: null, widget: { name: 'batch_size' } },
          ],
          outputs: [],
          widgets_values: [768, 1024, 1],
        })),
      ],
      links: [
        [11, 1, 0, 3, 0, 'INT'],
        [12, 2, 0, 3, 1, 'INT'],
        [13, 1, 0, 4, 0, 'INT'],
        [14, 2, 0, 4, 1, 'INT'],
      ],
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        PrimitiveInt: {
          input: { required: { value: ['INT', { min: 256, max: 2048 }] } },
          input_order: { required: ['value'], optional: [] },
          output_node: false,
        },
        EmptyLatentImage: {
          input: { required: {
            width: ['INT', { min: 256, max: 2048 }],
            height: ['INT', { min: 256, max: 2048 }],
            batch_size: ['INT', { min: 1, max: 8 }],
          } },
          input_order: { required: ['width', 'height', 'batch_size'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const inspection = await compiler.inspectRuntimeParameters({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })

    expect(inspection.size_candidates).toEqual([
      {
        candidate_id: 'width_height:width:height',
        representation: 'width_height',
        width: {
          parameter_id: 'width',
          kind: 'width',
          value_type: 'integer',
          current_value: 768,
          minimum: 256,
          maximum: 2048,
        },
        height: {
          parameter_id: 'height',
          kind: 'height',
          value_type: 'integer',
          current_value: 1024,
          minimum: 256,
          maximum: 2048,
        },
      },
    ])
  })

  it('reports every competing height target when one upstream width feeds two size consumers', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 1,
          type: 'PrimitiveInt',
          mode: 0,
          inputs: [{ name: 'value', type: 'INT', link: null, widget: { name: 'value' } }],
          outputs: [{ name: 'INT', type: 'INT', links: [11, 13] }],
          widgets_values: [768],
        },
        ...[2, 3].map((id, index) => ({
          id,
          type: 'PrimitiveInt',
          mode: 0,
          inputs: [{ name: 'value', type: 'INT', link: null, widget: { name: 'value' } }],
          outputs: [{ name: 'INT', type: 'INT', links: [index === 0 ? 12 : 14] }],
          widgets_values: [index === 0 ? 1024 : 1152],
        })),
        ...[4, 5].map((id, index) => ({
          id,
          type: 'EmptyLatentImage',
          mode: 0,
          inputs: [
            { name: 'width', type: 'INT', link: index === 0 ? 11 : 13, widget: { name: 'width' } },
            { name: 'height', type: 'INT', link: index === 0 ? 12 : 14, widget: { name: 'height' } },
            { name: 'batch_size', type: 'INT', link: null, widget: { name: 'batch_size' } },
          ],
          outputs: [],
          widgets_values: [768, index === 0 ? 1024 : 1152, 1],
        })),
      ],
      links: [
        [11, 1, 0, 4, 0, 'INT'],
        [12, 2, 0, 4, 1, 'INT'],
        [13, 1, 0, 5, 0, 'INT'],
        [14, 3, 0, 5, 1, 'INT'],
      ],
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        PrimitiveInt: {
          input: { required: { value: ['INT', { min: 256, max: 2048 }] } },
          input_order: { required: ['value'], optional: [] },
          output_node: false,
        },
        EmptyLatentImage: {
          input: { required: {
            width: ['INT', { min: 256, max: 2048 }],
            height: ['INT', { min: 256, max: 2048 }],
            batch_size: ['INT', { min: 1, max: 8 }],
          } },
          input_order: { required: ['width', 'height', 'batch_size'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.inspectRuntimeParameters({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_TARGET_AMBIGUOUS',
      message: expect.stringContaining('matches multiple paired height Workflow widgets'),
    })
  })

  it('omits separately paired dimensions when no single pair controls every active output', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        ...[1, 2].map((id): UiWorkflow['nodes'][number] => ({
          id,
          type: 'EmptyLatentImage',
          mode: 0,
          inputs: [
            { name: 'width', type: 'INT', link: null, widget: { name: 'width' } },
            { name: 'height', type: 'INT', link: null, widget: { name: 'height' } },
            { name: 'batch_size', type: 'INT', link: null, widget: { name: 'batch_size' } },
          ],
          outputs: [{ name: 'LATENT', type: 'LATENT', links: [id === 1 ? 21 : 22] }],
          widgets_values: id === 1 ? [512, 768, 1] : [768, 1024, 1],
        })),
        ...[3, 4].map((id): UiWorkflow['nodes'][number] => ({
          id,
          type: 'VAEDecode',
          mode: 0,
          inputs: [{ name: 'samples', type: 'LATENT', link: id === 3 ? 21 : 22 }],
          outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [id === 3 ? 31 : 32] }],
          widgets_values: [],
        })),
        ...[5, 6].map((id): UiWorkflow['nodes'][number] => ({
          id,
          type: 'SaveImage',
          mode: 0,
          inputs: [
            { name: 'images', type: 'IMAGE', link: id === 5 ? 31 : 32 },
            { name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } },
          ],
          outputs: [],
          widgets_values: [`output-${id}`],
        })),
      ],
      links: [
        [21, 1, 0, 3, 0, 'LATENT'],
        [22, 2, 0, 4, 0, 'LATENT'],
        [31, 3, 0, 5, 0, 'IMAGE'],
        [32, 4, 0, 6, 0, 'IMAGE'],
      ],
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        EmptyLatentImage: {
          input: { required: {
            width: ['INT', { min: 256, max: 2048 }],
            height: ['INT', { min: 256, max: 2048 }],
            batch_size: ['INT', { min: 1, max: 8 }],
          } },
          input_order: { required: ['width', 'height', 'batch_size'], optional: [] },
          output_node: false,
        },
        VAEDecode: {
          input: { required: { samples: ['LATENT'] } },
          input_order: { required: ['samples'], optional: [] },
          output_node: false,
        },
        SaveImage: objectInfo.SaveImage,
      }), { status: 200 })),
    })
    const input = {
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    } as const

    const inspection = await compiler.inspectRuntimeParameters(input)

    expect(inspection.parameters).toEqual([
      {
        parameter_id: 'batch_size_1',
        kind: 'batch_size',
        value_type: 'integer',
        current_value: 1,
        minimum: 1,
        maximum: 8,
      },
      {
        parameter_id: 'batch_size_2',
        kind: 'batch_size',
        value_type: 'integer',
        current_value: 1,
        minimum: 1,
        maximum: 8,
      },
    ])
    expect(inspection.size_candidates).toEqual([])
    const compiled = await compiler.compile({
      ...input,
      runtimeParameters: { width_2: 896, height_2: 1152 },
      loras: [],
    })
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 1)?.widgets_values).toEqual([512, 768, 1])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 2)?.widgets_values).toEqual([896, 1152, 1])
  })

  it('reports absent and restricted batch-size contracts without inventing support for one image', async () => {
    const inspect = async (includeBatchSize: boolean) => {
      const inputs = [
        { name: 'width', type: 'INT', link: null, widget: { name: 'width' } },
        { name: 'height', type: 'INT', link: null, widget: { name: 'height' } },
        ...(includeBatchSize
          ? [{ name: 'batch_size', type: 'INT', link: null, widget: { name: 'batch_size' } }]
          : []),
      ]
      const compiler = createCompiler({
        fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
          EmptyLatentImage: {
            input: { required: {
              width: ['INT', { min: 256, max: 2048 }],
              height: ['INT', { min: 256, max: 2048 }],
              ...(includeBatchSize ? { batch_size: ['INT', { min: 2, max: 8 }] } : {}),
            } },
            input_order: {
              required: includeBatchSize ? ['width', 'height', 'batch_size'] : ['width', 'height'],
              optional: [],
            },
            output_node: false,
          },
        }), { status: 200 })),
      })

      return compiler.inspectRuntimeParameters({
        instanceId: 'test-instance',
        workflow: {
          version: 0.4,
          nodes: [{
            id: 1,
            type: 'EmptyLatentImage',
            mode: 0,
            inputs,
            outputs: [],
            widgets_values: includeBatchSize ? [768, 1024, 2] : [768, 1024],
          }],
          links: [],
        },
        connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      })
    }

    await expect(inspect(false)).resolves.toMatchObject({ parameters: [] })
    await expect(inspect(true)).resolves.toMatchObject({
      parameters: [{
        parameter_id: 'batch_size',
        kind: 'batch_size',
        value_type: 'integer',
        current_value: 2,
        minimum: 2,
        maximum: 8,
      }],
    })
  })

  it('inspects positive Prompt, negative Prompt, and Seed contracts required before generation', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 1,
          type: 'CLIPTextEncode',
          title: 'Positive Prompt',
          mode: 0,
          inputs: [{ name: 'text', type: 'STRING', link: null, widget: { name: 'text' } }],
          outputs: [],
          widgets_values: ['1girl'],
        },
        {
          id: 2,
          type: 'CLIPTextEncode',
          title: 'Negative Prompt',
          mode: 0,
          inputs: [{ name: 'text', type: 'STRING', link: null, widget: { name: 'text' } }],
          outputs: [],
          widgets_values: ['low quality'],
        },
        {
          id: 3,
          type: 'KSampler',
          mode: 0,
          inputs: [{ name: 'seed', type: 'INT', link: null, widget: { name: 'seed' } }],
          outputs: [],
          widgets_values: [41, 'fixed'],
        },
        {
          id: 4,
          type: 'SaveImage',
          mode: 0,
          inputs: [{ name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } }],
          outputs: [],
          widgets_values: ['output'],
        },
      ],
      links: [],
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        CLIPTextEncode: {
          input: { required: { text: ['STRING', { multiline: true }] } },
          input_order: { required: ['text'], optional: [] },
          output_node: false,
        },
        KSampler: {
          input: { required: { seed: ['INT', { min: 0, max: 2_147_483_647, control_after_generate: true }] } },
          input_order: { required: ['seed'], optional: [] },
          output_node: false,
        },
        SaveImage: fixtureOutputInfo,
      }), { status: 200 })),
    })

    const inspection = await compiler.inspectRuntimeParameters({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })

    expect(inspection.parameters).toEqual([
      { parameter_id: 'positive_prompt', kind: 'positive_prompt', value_type: 'string', current_value: '1girl' },
      { parameter_id: 'negative_prompt', kind: 'negative_prompt', value_type: 'string', current_value: 'low quality' },
      {
        parameter_id: 'seed', kind: 'seed', value_type: 'integer', current_value: 41,
        minimum: 0, maximum: 2_147_483_647,
      },
    ])

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: {
        positive_prompt: '2girls, separate silhouettes',
        negative_prompt: 'blurry, malformed hands',
        seed: 99,
      },
      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 1)?.widgets_values).toEqual(['2girls, separate silhouettes'])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 2)?.widgets_values).toEqual(['blurry, malformed hands'])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 3)?.widgets_values).toEqual([99, 'fixed'])
    expect(actual.nodes.find(node => node.id === 3)?.widgets_values).toEqual([41, 'fixed'])
  })

  it('reports the same malformed dynamic standard-parameter contract during inspection and compilation', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [{
        id: 1,
        type: 'DynamicResolutionPreset',
        mode: 0,
        inputs: [{ name: 'resolution_preset', type: 'COMFY_DYNAMICCOMBO_V3', link: null, widget: { name: 'resolution_preset' } }],
        outputs: [],
        widgets_values: ['fixed'],
      }],
      links: [],
    }
    const definition = {
      DynamicResolutionPreset: {
        input: { required: {
          resolution_preset: ['COMFY_DYNAMICCOMBO_V3', { options: [{
            key: 'fixed', inputs: { required: {} },
          }] }],
        } },
        input_order: { required: ['resolution_preset'], optional: [] },
        output_node: false,
      },
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(definition), { status: 200 })),
    })
    const input = {
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    } as const

    await expect(compiler.inspectRuntimeParameters(input)).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_CONTRACT_UNSUPPORTED',
      message: expect.stringContaining('inputs.required and inputs.optional'),
    })
    await expect(compiler.compile({
      ...input,
      runtimeParameters: { resolution_preset: 'fixed' },
      loras: [],
    })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_CONTRACT_UNSUPPORTED',
      message: expect.stringContaining('inputs.required and inputs.optional'),
    })
  })

  it('receives exact numeric source tokens from the supported JSON.parse reviver contract', () => {
    type ParseWithSource = (
      text: string,
      reviver: (this: unknown, key: string, value: unknown, context?: { readonly source?: string }) => unknown,
    ) => unknown
    const sources: string[] = []
    const parsed = (JSON.parse as ParseWithSource)('{"integer":9223372036854775807,"decimal":1.0}', function (_key, value, context) {
      if (typeof value === 'number') sources.push(context?.source ?? '')
      return value
    })

    expect(parsed).toEqual({ integer: 9223372036854776000, decimal: 1 })
    expect(sources).toEqual(['9223372036854775807', '1.0'])
  })

  it('uses the official finalizer output and preserves an official virtual connection rewrite', async () => {
    const officialApiWorkflowCompiler = {
      compile: vi.fn(async input => {
        const base = structuredClone(input.runtimeProjection) as Record<string, JsonValue>
        const promptNode = base['2'] as { inputs: Record<string, JsonValue> }
        promptNode.inputs.clip = ['official-virtual-node', 3]
        base['official-virtual-node'] = { class_type: 'OfficialVirtualNode', inputs: { source: ['1', 0] } }
        return {
          apiWorkflow: overlayRuntimeApiWorkflow(base, input.runtimeProjection),
          cacheKey: 'official-cache-key',
          cacheStatus: 'miss' as const,
        }
      }),
    }
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(objectInfo), { status: 200 })),
      officialApiWorkflowCompiler,
    })

    const compiled = await compiler.compile({
      instanceId: 'win3080',
      workflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [],
    })

    expect((compiled.apiWorkflow['2'] as { inputs: { clip: JsonValue } }).inputs.clip).toEqual(['official-virtual-node', 3])
    expect(compiled.apiWorkflow['official-virtual-node']).toBeDefined()
    expect(officialApiWorkflowCompiler.compile).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'win3080',
      templateWorkflow: workflow,
      actualWorkflow: compiled.actualWorkflow,
      runtimeProjection: expect.objectContaining({ '2': expect.any(Object) }),
    }))
  })

  it('makes cached official output equal fresh export after common parameter, model, LoRA, bypass, and dimension compilation', async () => {
    const cacheDirectories: string[] = []
    const makeCache = async () => {
      const directory = await mkdtemp(join(tmpdir(), 'harness-comfyui-representative-'))
      cacheDirectories.push(directory)
      return directory
    }
    const representative = structuredClone(workflow)
    ;(representative.nodes as Array<UiWorkflow['nodes'][number]>).push(
      {
        id: 4,
        type: 'EmptyLatentImage',
        mode: 0,
        inputs: [],
        outputs: [{ name: 'LATENT', type: 'LATENT', links: [12] }],
        widgets_values: [512, 768, 1],
      },
      {
        id: 5,
        type: 'Lora Loader (LoraManager)',
        mode: 0,
        properties: { __lm_widget_ids: ['__lm_autocomplete_meta_text', 'text', 'loras'] },
        inputs: [],
        outputs: [],
        widgets_values: [
          { version: 1, textWidgetName: 'text' },
          '<lora:wai\\template.safetensors:1>',
          [{ name: 'wai\\template.safetensors', strength: 1, clipStrength: 1, active: true }],
        ],
      },
      {
        id: 6,
        type: 'SaveImage',
        mode: 2,
        inputs: [],
        outputs: [],
        widgets_values: ['inactive-output'],
      },
      {
        id: 7,
        type: 'CheckpointLoaderSimple',
        mode: 0,
        inputs: [],
        outputs: [],
        widgets_values: ['models\\template.safetensors'],
      },
      {
        id: 8,
        type: 'LatentUpscale',
        mode: 0,
        inputs: [{ name: 'samples', type: 'LATENT', link: 12 }],
        outputs: [],
        widgets_values: ['nearest-exact', 1024, 1536, 'disabled'],
      },
    )
    ;(representative.links as JsonValue[]).push([12, 4, 0, 8, 0, 'LATENT'])
    const definitions = {
      ...objectInfo,
      EmptyLatentImage: {
        input: { required: { width: ['INT', {}], height: ['INT', {}], batch_size: ['INT', {}] } },
        input_order: { required: ['width', 'height', 'batch_size'], optional: [] },
        output_node: false,
      },
      'Lora Loader (LoraManager)': {
        input: { required: { model: ['MODEL'], text: ['AUTOCOMPLETE_TEXT_LORAS', {}] } },
        input_order: { required: ['model', 'text'], optional: [] },
        output_node: false,
      },
      LoraLoader: {
        input: { required: { lora_name: [[
          'wai\\one.safetensors',
          'wai\\two.safetensors',
        ], {}] } },
        input_order: { required: ['lora_name'], optional: [] },
        output_node: false,
      },
      CheckpointLoaderSimple: {
        input: { required: { ckpt_name: [[
          'models\\first.safetensors',
          'models\\second.safetensors',
        ], {}] } },
        input_order: { required: ['ckpt_name'], optional: [] },
        output_node: false,
      },
      LatentUpscale: {
        input: { required: {
          samples: ['LATENT'],
          upscale_method: [['nearest-exact'], {}],
          width: ['INT', {}],
          height: ['INT', {}],
          crop: [['disabled'], {}],
        } },
        input_order: { required: ['samples', 'upscale_method', 'width', 'height', 'crop'], optional: [] },
        output_node: false,
      },
    }
    const officialExporter = (): ComfyFrontendExporter & { exportWorkflow: ReturnType<typeof vi.fn> } => ({
      exportWorkflow: vi.fn<ComfyFrontendExporter['exportWorkflow']>(async input => {
        const nodes = new Map(input.workflow.nodes.map(node => [String(node.id), node]))
        const widgets = (id: string): readonly JsonValue[] => {
          const value = nodes.get(id)?.widgets_values
          if (!Array.isArray(value)) throw new Error(`Workflow node ${id} has no widgets_values array.`)
          return value as readonly JsonValue[]
        }
        return {
          '1': { class_type: 'ImageProducer', inputs: { source: widgets('1')[0]! }, _meta: { title: 'Image source' } },
          '2': { class_type: 'CLIPTextEncode', inputs: { clip: ['official-virtual', 4], text: widgets('2')[0]! } },
          '3': { class_type: 'SaveImage', inputs: { images: ['1', 0], filename_prefix: widgets('3')[0]! } },
          '4': { class_type: 'EmptyLatentImage', inputs: { width: widgets('4')[0]!, height: widgets('4')[1]!, batch_size: widgets('4')[2]! } },
          '5': { class_type: 'Lora Loader (LoraManager)', inputs: { text: widgets('5')[1]!, loras: { __value__: widgets('5')[2]! } } },
          '7': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: widgets('7')[0]! } },
          '8': { class_type: 'LatentUpscale', inputs: { samples: ['4', 0], upscale_method: widgets('8')[0]!, width: widgets('8')[1]!, height: widgets('8')[2]!, crop: widgets('8')[3]! } },
          'official-virtual': { class_type: 'OfficialVirtualNode', inputs: { source: ['1', 0] } },
        }
      }),
    })
    const cachedExporter = officialExporter()
    const cachedCompiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(definitions), { status: 200 })),
      officialApiWorkflowCompiler: new OfficialApiWorkflowCompiler({
        cacheDirectory: await makeCache(),
        instanceCacheEpoch: '1',
        frontend: cachedExporter,
      }),
    })
    const request = (
      prompt: string,
      width: number,
      height: number,
      model: string,
      loras: readonly { id: string; fileName: string; weight: number; triggerWords: readonly string[] }[],
    ) => ({
      instanceId: 'test-instance',
      workflow: representative,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { "positive_prompt": prompt, "width": width, "height": height },

      model: { id: model, fileName: model },
      loras,
    })
    const variants = [
      request('first prompt', 640, 960, 'first.safetensors', [{ id: '1', fileName: 'one.safetensors', weight: 0.8, triggerWords: [] }]),
      request('second prompt', 832, 1216, 'second.safetensors', [
        { id: '1', fileName: 'one.safetensors', weight: 0.7, triggerWords: [] },
        { id: '2', fileName: 'two.safetensors', weight: 0.6, triggerWords: [] },
      ]),
      request('empty LoRA prompt', 768, 1152, 'first.safetensors', []),
    ]

    try {
      for (const [index, variant] of variants.entries()) {
        const cached = await cachedCompiler.compile(variant)
        const freshExporter = officialExporter()
        const fresh = await new ComfyWorkflowCompiler({
          fetchImplementation: vi.fn(async () => new Response(JSON.stringify(definitions), { status: 200 })),
          officialApiWorkflowCompiler: new OfficialApiWorkflowCompiler({
            cacheDirectory: await makeCache(),
            instanceCacheEpoch: '1',
            frontend: freshExporter,
          }),
        }).compile(variant)

        expect(cached.apiWorkflow).toEqual(fresh.apiWorkflow)
        expect(cached.actualWorkflow.nodes.find(node => node.id === 5)?.mode).toBe(0)
        expect(cached.apiWorkflow).not.toHaveProperty('6')
        expect(cached.apiWorkflow['8']).toMatchObject({ inputs: { width: 1024, height: 1536 } })
        expect(freshExporter.exportWorkflow).toHaveBeenCalledOnce()
        if (index === 0) expect(cachedExporter.exportWorkflow).toHaveBeenCalledOnce()
      }
      expect(cachedExporter.exportWorkflow).toHaveBeenCalledOnce()
    } finally {
      await Promise.all(cacheDirectories.map(directory => rm(directory, { recursive: true, force: true })))
    }
  })

  it('compiles connected inputs and widget values from the UI Workflow with live node definitions', async () => {
    const fetchImplementation = vi.fn(async () => new Response(JSON.stringify(objectInfo), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    const compiler = createCompiler({ fetchImplementation })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow,
      connection: { url: 'http://127.0.0.1:8188/', origin: 'http://127.0.0.1:8188', authorization: 'Bearer token' },
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

  it('shares one in-flight object_info request across forty concurrent compiles', async () => {
    let releaseRequest!: () => void
    const requestGate = new Promise<void>(resolve => { releaseRequest = resolve })
    const fetchImplementation = vi.fn(async () => {
      await requestGate
      return new Response(JSON.stringify(objectInfo), { status: 200 })
    })
    const compiler = createCompiler({ fetchImplementation })
    const input = {
      instanceId: 'test-instance',
      workflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [],
    } as const

    const compiles = Array.from({ length: 40 }, async () => compiler.compile(input))
    releaseRequest()
    await Promise.all(compiles)

    expect(fetchImplementation).toHaveBeenCalledOnce()
  })

  it('reuses object_info for ten minutes and refreshes it after expiration', async () => {
    let now = 1_000
    const fetchImplementation = vi.fn(async () => new Response(JSON.stringify(objectInfo), { status: 200 }))
    const compiler = createCompiler({ fetchImplementation, now: () => now })
    const input = {
      instanceId: 'test-instance',
      workflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [],
    } as const

    await compiler.compile(input)
    now += 599_999
    await compiler.compile(input)
    expect(fetchImplementation).toHaveBeenCalledOnce()

    now += 1
    await compiler.compile(input)
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
  })

  it('keeps exact numeric source metadata with first fetch, cache hit, and TTL refresh snapshots', async () => {
    let now = 1_000
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 31,
      type: 'SeedNode',
      mode: 0,
      inputs: [{ name: 'seed', type: 'INT', link: null, widget: { name: 'seed' } }],
      outputs: [],
      widgets_values: [1, 'fixed'],
    })
    const definitionsJson = (maximum: string) => JSON.stringify({
      ...objectInfo,
      SeedNode: {
        input: { required: { seed: ['INT', { min: 0, max: '__MAXIMUM__' }] } },
        input_order: { required: ['seed'], optional: [] },
        output_node: false,
      },
    }).replace('"__MAXIMUM__"', maximum)
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(new Response(definitionsJson('9223372036854775807'), { status: 200 }))
      .mockResolvedValueOnce(new Response(definitionsJson('12130929238470859000'), { status: 200 }))
    const compiler = createCompiler({ fetchImplementation, now: () => now })
    const input = {
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { seed: 12130929238470859000 },
      loras: [],
    } as const

    await expect(compiler.compile(input)).rejects.toMatchObject({ code: 'GENERATION_PARAMETER_INVALID' })
    now += 599_999
    await expect(compiler.compile(input)).rejects.toMatchObject({ code: 'GENERATION_PARAMETER_INVALID' })
    expect(fetchImplementation).toHaveBeenCalledOnce()

    now += 1
    await expect(compiler.compile(input)).resolves.toMatchObject({
      actualWorkflow: expect.objectContaining({
        nodes: expect.arrayContaining([expect.objectContaining({ id: 31, widgets_values: [12130929238470859000, 'fixed'] })]),
      }),
    })
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
  })

  it('shares one exact numeric metadata snapshot across concurrent compiles', async () => {
    let releaseRequest!: () => void
    const requestGate = new Promise<void>(resolve => { releaseRequest = resolve })
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 31,
      type: 'SeedNode',
      mode: 0,
      inputs: [{ name: 'seed', type: 'INT', link: null, widget: { name: 'seed' } }],
      outputs: [],
      widgets_values: [1, 'fixed'],
    })
    const nodeDefinitionsJson = JSON.stringify({
      ...objectInfo,
      SeedNode: {
        input: { required: { seed: ['INT', { min: 0, max: '__MAX_SEED__' }] } },
        input_order: { required: ['seed'], optional: [] },
        output_node: false,
      },
    }).replace('"__MAX_SEED__"', '9223372036854775807')
    const fetchImplementation = vi.fn(async () => {
      await requestGate
      return new Response(nodeDefinitionsJson, { status: 200 })
    })
    const compiler = createCompiler({ fetchImplementation })
    const input = {
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { seed: 12130929238470859000 },
      loras: [],
    } as const

    const compiles = Array.from({ length: 10 }, async () => compiler.compile(input))
    releaseRequest()
    const results = await Promise.allSettled(compiles)

    expect(results).toHaveLength(10)
    expect(results.every(result => result.status === 'rejected'
      && (result.reason as { code?: string }).code === 'GENERATION_PARAMETER_INVALID')).toBe(true)
    expect(fetchImplementation).toHaveBeenCalledOnce()
  })

  it('isolates object_info cache entries by instance identity and URL', async () => {
    const fetchImplementation = vi.fn(async () => new Response(JSON.stringify(objectInfo), { status: 200 }))
    const compiler = createCompiler({ fetchImplementation })
    const compile = async (instanceId: string, url: string) => compiler.compile({
      instanceId,
      workflow,
      connection: { url, origin: new URL(url).origin, authorization: null },
      loras: [],
    })

    await compile('instance-a', 'http://127.0.0.1:8188')
    await compile('instance-b', 'http://127.0.0.1:8188')
    await compile('instance-a', 'http://127.0.0.1:8288')
    await compile('instance-a', 'http://127.0.0.1:8188')

    expect(fetchImplementation).toHaveBeenCalledTimes(3)
  })

  it('does not cache a failed object_info response', async () => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(objectInfo), { status: 200 }))
    const compiler = createCompiler({ fetchImplementation })
    const input = {
      instanceId: 'test-instance',
      workflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [],
    } as const

    await expect(compiler.compile(input)).rejects.toMatchObject({ code: 'COMFYUI_HTTP_ERROR' })
    await expect(compiler.compile(input)).resolves.toMatchObject({ activeOutputNodeIds: ['3'] })
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
  })

  it('inlines serialized TextInput_ and Float value sources that are absent from the live instance', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 1,
          type: 'TextInput_',
          mode: 0,
          inputs: [{ name: 'text', type: 'STRING', link: null, widget: { name: 'text' } }],
          outputs: [{ name: 'STRING', type: 'STRING', links: [10] }],
          widgets_values: ['a blue ceramic teapot'],
        },
        {
          id: 2,
          type: 'Float',
          mode: 0,
          inputs: [{ name: 'value', type: 'FLOAT', link: null, widget: { name: 'value' } }],
          outputs: [{ name: 'FLOAT', type: 'FLOAT', links: [11] }],
          widgets_values: [0.72],
        },
        {
          id: 3,
          type: 'ValueConsumer',
          mode: 0,
          inputs: [
            { name: 'text', type: 'STRING', link: 10 },
            { name: 'strength', type: 'FLOAT', link: 11 },
          ],
          outputs: [],
          widgets_values: [],
        },
        {
          id: 4,
          type: 'SaveImage',
          mode: 0,
          inputs: [{ name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } }],
          outputs: [],
          widgets_values: ['output'],
        },
      ],
      links: [
        [10, 1, 0, 3, 0, 'STRING'],
        [11, 2, 0, 3, 1, 'FLOAT'],
      ],
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ValueConsumer: {
          input: { required: { text: ['STRING', {}], strength: ['FLOAT', {}] } },
          input_order: { required: ['text', 'strength'], optional: [] },
          output_node: false,
        },
        SaveImage: fixtureOutputInfo,
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [],
    })

    expect(compiled.apiWorkflow).not.toHaveProperty('1')
    expect(compiled.apiWorkflow).not.toHaveProperty('2')
    expect(compiled.apiWorkflow['3']).toMatchObject({
      inputs: { text: 'a blue ceramic teapot', strength: 0.72 },
    })
  })

  it('keeps a TextInput_ API node when the live instance provides its backend definition', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 4,
      type: 'TextInput_',
      mode: 0,
      inputs: [{ name: 'text', type: 'STRING', link: null, widget: { name: 'text' } }],
      outputs: [{ name: 'STRING', type: 'STRING', links: [] }],
      widgets_values: ['backend value'],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        TextInput_: {
          input: { required: { text: ['STRING', {}] } },
          input_order: { required: ['text'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [],
    })

    expect(compiled.apiWorkflow['4']).toEqual({ class_type: 'TextInput_', inputs: { text: 'backend value' } })
  })

  it('rejects a malformed serialized value source instead of guessing its API value', async () => {
    const malformed = structuredClone(workflow)
    ;(malformed.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 4,
      type: 'TextInput_',
      mode: 0,
      inputs: [{ name: 'text', type: 'STRING', link: null, widget: { name: 'text' } }],
      outputs: [{ name: 'STRING', type: 'STRING', links: [] }],
      widgets_values: [],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(objectInfo), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: malformed,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [],
    })).rejects.toMatchObject({
      code: 'WORKFLOW_COMPILE_FAILED',
      message: expect.stringContaining('TextInput_'),
    })
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
    const compiler = createCompiler({
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
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [],
    })

    expect(compiled.apiWorkflow['4']).toMatchObject({ inputs: { choice: 'Only accepted API value' } })
  })

  it('maps dynamic-combo child widgets immediately after their serialized parent widget', async () => {
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
          id: 2,
          type: 'IntValue',
          mode: 0,
          inputs: [{ name: 'value', type: 'INT', link: null, widget: { name: 'value' } }],
          outputs: [{ name: 'INT', type: 'INT', links: [11, 12] }],
          widgets_values: [1024],
        },
        {
          id: 3,
          type: 'ResizeImageMaskNode',
          mode: 0,
          inputs: [
            { name: 'input', type: 'IMAGE,MASK', link: 10 },
            { name: 'resize_type', type: 'COMFY_DYNAMICCOMBO_V3', link: null, widget: { name: 'resize_type' } },
            { name: 'scale_method', type: 'COMBO', link: null, widget: { name: 'scale_method' } },
            { name: 'resize_type.width', type: 'INT', link: 11, widget: { name: 'resize_type.width' } },
            { name: 'resize_type.height', type: 'INT', link: 12, widget: { name: 'resize_type.height' } },
            { name: 'resize_type.crop', type: 'COMBO', link: null, widget: { name: 'resize_type.crop' } },
          ],
          outputs: [{ name: 'resized', type: '*', links: [13] }],
          widgets_values: ['scale dimensions', 1024, 1024, 'center', 'area'],
        },
        {
          id: 4,
          type: 'SaveImage',
          mode: 0,
          inputs: [
            { name: 'images', type: 'IMAGE', link: 13 },
            { name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } },
          ],
          outputs: [],
          widgets_values: ['output'],
        },
      ],
      links: [
        [10, 1, 0, 3, 0, 'IMAGE'],
        [11, 2, 0, 3, 2, 'INT'],
        [12, 2, 0, 3, 3, 'INT'],
        [13, 3, 0, 4, 0, 'IMAGE'],
      ],
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ImageProducer: objectInfo.ImageProducer,
        IntValue: {
          input: { required: { value: ['INT', {}] } },
          input_order: { required: ['value'], optional: [] },
          output_node: false,
        },
        ResizeImageMaskNode: {
          input: {
            required: {
              input: ['IMAGE,MASK'],
              resize_type: ['COMFY_DYNAMICCOMBO_V3', {}],
              scale_method: [['nearest-exact', 'bilinear', 'area', 'bicubic', 'lanczos'], {}],
            },
          },
          input_order: { required: ['input', 'resize_type', 'scale_method'], optional: [] },
          output_node: false,
        },
        SaveImage: fixtureOutputInfo,
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [],
    })

    expect(compiled.apiWorkflow['3']).toMatchObject({
      inputs: {
        input: ['1', 0],
        resize_type: 'scale dimensions',
        'resize_type.width': ['2', 0],
        'resize_type.height': ['2', 0],
        'resize_type.crop': 'center',
        scale_method: 'area',
      },
    })
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
    const compiler = createCompiler({
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
        SaveImage: fixtureOutputInfo,
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
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
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(definitions), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [],
    })

    expect(compiled.apiWorkflow['3']).toMatchObject({ inputs: { images: ['1', 0] } })
    expect((compiled.apiWorkflow['3'] as { inputs: Record<string, JsonValue> }).inputs).not.toHaveProperty('latent')

    const requiredCompiler = createCompiler({
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
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [],
    })).rejects.toMatchObject({ code: 'WORKFLOW_COMPILE_FAILED' })
  })

  it('reports ambiguous prompt widgets when the Workflow contains no structural distinction', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 4,
      type: 'CLIPTextEncode',
      mode: 0,
      inputs: [{ name: 'text', type: 'STRING', link: null, widget: { name: 'text' } }],
      outputs: [],
      widgets_values: ['1girl, white hair'],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(objectInfo), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { "positive_prompt": '1girl, black hair' },

      loras: [],
    })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_TARGET_AMBIGUOUS',
      message: expect.stringMatching(/positive_prompt.*2:CLIPTextEncode\.text.*4:CLIPTextEncode\.text/u),
    })
  })

  it('distinguishes unnamed positive and negative Prompt widgets by downstream input ports', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 1,
          type: 'CLIPTextEncode',
          mode: 0,
          inputs: [{ name: 'text', type: 'STRING', link: null, widget: { name: 'text' } }],
          outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING', links: [10] }],
          widgets_values: ['template positive'],
        },
        {
          id: 2,
          type: 'CLIPTextEncode',
          mode: 0,
          inputs: [{ name: 'text', type: 'STRING', link: null, widget: { name: 'text' } }],
          outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING', links: [11] }],
          widgets_values: ['template negative'],
        },
        {
          id: 3,
          type: 'KSampler',
          mode: 0,
          inputs: [
            { name: 'positive', type: 'CONDITIONING', link: 10 },
            { name: 'negative', type: 'CONDITIONING', link: 11 },
          ],
          outputs: [],
          widgets_values: [],
        },
        {
          id: 4,
          type: 'SaveImage',
          mode: 0,
          inputs: [{ name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } }],
          outputs: [],
          widgets_values: ['output'],
        },
        {
          id: 5,
          type: 'CLIPTextEncode',
          title: 'Unused negative Prompt',
          mode: 0,
          inputs: [{ name: 'text', type: 'STRING', link: null, widget: { name: 'text' } }],
          outputs: [],
          widgets_values: ['disconnected prompt'],
        },
      ],
      links: [
        [10, 1, 0, 3, 0, 'CONDITIONING'],
        [11, 2, 0, 3, 1, 'CONDITIONING'],
      ],
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        CLIPTextEncode: objectInfo.CLIPTextEncode,
        KSampler: {
          input: { required: { positive: ['CONDITIONING'], negative: ['CONDITIONING'] } },
          input_order: { required: ['positive', 'negative'], optional: [] },
          output_node: false,
        },
        SaveImage: fixtureOutputInfo,
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { positive_prompt: 'runtime positive', negative_prompt: 'runtime negative' },
      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 1)?.widgets_values).toEqual(['runtime positive'])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 2)?.widgets_values).toEqual(['runtime negative'])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 5)?.widgets_values).toEqual(['disconnected prompt'])
  })

  it('exposes one shared Prompt control as positive when its second branch is zeroed for negative conditioning', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 1,
          type: 'CLIPTextEncode',
          mode: 0,
          inputs: [{ name: 'text', type: 'STRING', link: null, widget: { name: 'text' } }],
          outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING', links: [10, 11] }],
          widgets_values: ['template prompt'],
        },
        {
          id: 2,
          type: 'ConditioningZeroOut',
          mode: 0,
          inputs: [{ name: 'conditioning', type: 'CONDITIONING', link: 11 }],
          outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING', links: [12] }],
          widgets_values: [],
        },
        {
          id: 3,
          type: 'KSampler',
          mode: 0,
          inputs: [
            { name: 'positive', type: 'CONDITIONING', link: 10 },
            { name: 'negative', type: 'CONDITIONING', link: 12 },
          ],
          outputs: [],
          widgets_values: [],
        },
        {
          id: 4,
          type: 'SaveImage',
          mode: 0,
          inputs: [{ name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } }],
          outputs: [],
          widgets_values: ['output'],
        },
      ],
      links: [
        [10, 1, 0, 3, 0, 'CONDITIONING'],
        [11, 1, 0, 2, 0, 'CONDITIONING'],
        [12, 2, 0, 3, 1, 'CONDITIONING'],
      ],
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        CLIPTextEncode: objectInfo.CLIPTextEncode,
        ConditioningZeroOut: {
          input: { required: { conditioning: ['CONDITIONING'] } },
          input_order: { required: ['conditioning'], optional: [] },
          output_node: false,
        },
        KSampler: {
          input: { required: { positive: ['CONDITIONING'], negative: ['CONDITIONING'] } },
          input_order: { required: ['positive', 'negative'], optional: [] },
          output_node: false,
        },
        SaveImage: fixtureOutputInfo,
      }), { status: 200 })),
    })

    const positive = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { positive_prompt: 'runtime prompt' },
      loras: [],
    })
    expect(positive.actualWorkflow.nodes.find(node => node.id === 1)?.widgets_values).toEqual(['runtime prompt'])

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { negative_prompt: 'must not replace the shared positive Prompt' },
      loras: [],
    })).rejects.toMatchObject({ code: 'GENERATION_PARAMETER_TARGET_NOT_FOUND' })
  })

  it('rewrites the executable upstream positive Prompt and preserves an unselected connected LoraManager input', async () => {
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
          id: 4,
          type: 'Lora Loader (LoraManager)',
          mode: 0,
          inputs: [],
          outputs: [{ name: 'trigger_words', type: 'STRING', links: [11] }],
          properties: { __lm_widget_ids: ['__lm_autocomplete_meta_text', 'text', 'loras'] },
          widgets_values: [{}, '<lora:template-lora:1>', [{ name: 'template-lora', strength: 1, clipStrength: 1, active: true }]],
          widgets_values_named: { __lm_autocomplete_meta_text: {}, text: '<lora:template-lora:1>', loras: [{ name: 'template-lora', strength: 1, clipStrength: 1, active: true }] },
        },
        {
          id: 5,
          type: 'StringConcatenate',
          mode: 0,
          inputs: [
            { name: 'string_a', type: 'STRING', link: 11 },
            { name: 'string_b', type: 'STRING', link: 10 },
          ],
          outputs: [{ name: 'STRING', type: 'STRING', links: [12] }],
          widgets_values: [','],
          widgets_values_named: { delimiter: ',' },
        },
        {
          id: 2,
          type: 'CLIPTextEncode',
          title: 'CLIP Text Encode (Positive)',
          mode: 0,
          inputs: [
            { name: 'clip', type: 'CLIP', link: null },
            { name: 'text', type: 'STRING', link: 12, widget: { name: 'text' } },
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
      links: [
        [10, 1, 0, 5, 1, 'STRING'],
        [11, 4, 0, 5, 0, 'STRING'],
        [12, 5, 0, 2, 1, 'STRING'],
      ],
    }
    const compiler = createCompiler({
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
        'Lora Loader (LoraManager)': {
          input: { required: { text: ['AUTOCOMPLETE_TEXT_LORAS', { tooltip: 'Use <lora:name:weight> syntax.' }] } },
          input_order: { required: ['text'], optional: [] },
          output_node: false,
        },
        StringConcatenate: {
          input: { required: { string_a: ['STRING', {}], string_b: ['STRING', {}], delimiter: ['STRING', {}] } },
          input_order: { required: ['string_a', 'string_b', 'delimiter'], optional: [] },
          output_node: false,
        },
        CLIPTextEncode: objectInfo.CLIPTextEncode,
        SaveImage: fixtureOutputInfo,
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { "positive_prompt": 'usnr, gthan, 1girl' },

      loras: [],
    })

    expect(compiled.apiWorkflow['1']).toMatchObject({ inputs: { wildcard_text: 'usnr, gthan, 1girl' } })
    expect(compiled.apiWorkflow['2']).toMatchObject({ inputs: { text: ['5', 0] } })
    expect(compiled.apiWorkflow['4']).toMatchObject({ inputs: {
      text: '<lora:template-lora:1>',
      loras: [{ name: 'template-lora', strength: 1, clipStrength: 1, active: true }],
    } })
    const upstreamValues = compiled.actualWorkflow.nodes[0]?.widgets_values
    expect(Array.isArray(upstreamValues) ? upstreamValues[0] : undefined).toBe('usnr, gthan, 1girl')
    expect(compiled.actualWorkflow.nodes[0]?.widgets_values_named).toMatchObject({ wildcard_text: 'usnr, gthan, 1girl' })
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 4)?.widgets_values_named)
      .toEqual(actual.nodes.find(node => node.id === 4)?.widgets_values_named)
  })

  it('rewrites the only multiline STRING widget feeding a connected positive Prompt', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 33,
          type: 'StringConcatenate',
          mode: 0,
          inputs: [
            { name: 'string_a', type: 'STRING', link: null, widget: { name: 'string_a' } },
            { name: 'string_b', type: 'STRING', link: 56, widget: { name: 'string_b' } },
            { name: 'delimiter', type: 'STRING', link: null, widget: { name: 'delimiter' } },
          ],
          outputs: [{ name: 'STRING', type: 'STRING', links: [55] }],
          widgets_values: ['template prompt', '', ''],
        },
        {
          id: 34,
          type: 'StringConstant',
          mode: 0,
          inputs: [{ name: 'string', type: 'STRING', link: null, widget: { name: 'string' } }],
          outputs: [{ name: 'STRING', type: 'STRING', links: [56] }],
          widgets_values: ['supplement'],
        },
        {
          id: 10,
          type: 'CLIPTextEncode',
          mode: 0,
          inputs: [{ name: 'text', type: 'STRING', link: 55, widget: { name: 'text' } }],
          outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING', links: [12] }],
          widgets_values: ['template prompt'],
        },
        {
          id: 9,
          type: 'KSampler',
          mode: 0,
          inputs: [{ name: 'positive', type: 'CONDITIONING', link: 12 }],
          outputs: [],
          widgets_values: [],
        },
        {
          id: 16,
          type: 'SaveImage',
          mode: 0,
          inputs: [{ name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } }],
          outputs: [],
          widgets_values: ['output'],
        },
      ],
      links: [
        [12, 10, 0, 9, 0, 'CONDITIONING'],
        [55, 33, 0, 10, 0, 'STRING'],
        [56, 34, 0, 33, 1, 'STRING'],
      ],
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        StringConcatenate: {
          input: { required: {
            string_a: ['STRING', { multiline: true }],
            string_b: ['STRING', { multiline: true }],
            delimiter: ['STRING', { multiline: false }],
          } },
          input_order: { required: ['string_a', 'string_b', 'delimiter'], optional: [] },
          output_node: false,
        },
        StringConstant: {
          input: { required: { string: ['STRING', { multiline: false }] } },
          input_order: { required: ['string'], optional: [] },
          output_node: false,
        },
        CLIPTextEncode: objectInfo.CLIPTextEncode,
        KSampler: {
          input: { required: { positive: ['CONDITIONING'] } },
          input_order: { required: ['positive'], optional: [] },
          output_node: false,
        },
        SaveImage: fixtureOutputInfo,
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { positive_prompt: 'runtime prompt' },
      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 33)?.widgets_values)
      .toEqual(['runtime prompt', '', ''])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 34)?.widgets_values).toEqual(['supplement'])
    expect(compiled.apiWorkflow['33']).toMatchObject({ inputs: {
      string_a: 'runtime prompt',
      string_b: ['34', 0],
      delimiter: '',
    } })
    expect(compiled.apiWorkflow['10']).toMatchObject({ inputs: { text: ['33', 0] } })
  })

  it('rejects multiple multiline STRING widgets feeding one connected positive Prompt', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 33,
          type: 'StringConcatenate',
          mode: 0,
          inputs: [
            { name: 'string_a', type: 'STRING', link: null, widget: { name: 'string_a' } },
            { name: 'string_b', type: 'STRING', link: null, widget: { name: 'string_b' } },
            { name: 'delimiter', type: 'STRING', link: null, widget: { name: 'delimiter' } },
          ],
          outputs: [{ name: 'STRING', type: 'STRING', links: [55] }],
          widgets_values: ['first prompt fragment', 'second prompt fragment', ''],
        },
        {
          id: 10,
          type: 'CLIPTextEncode',
          mode: 0,
          inputs: [{ name: 'text', type: 'STRING', link: 55, widget: { name: 'text' } }],
          outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING', links: [12] }],
          widgets_values: ['template prompt'],
        },
        {
          id: 9,
          type: 'KSampler',
          mode: 0,
          inputs: [{ name: 'positive', type: 'CONDITIONING', link: 12 }],
          outputs: [],
          widgets_values: [],
        },
        {
          id: 16,
          type: 'SaveImage',
          mode: 0,
          inputs: [{ name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } }],
          outputs: [],
          widgets_values: ['output'],
        },
      ],
      links: [
        [12, 10, 0, 9, 0, 'CONDITIONING'],
        [55, 33, 0, 10, 0, 'STRING'],
      ],
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        StringConcatenate: {
          input: { required: {
            string_a: ['STRING', { multiline: true }],
            string_b: ['STRING', { multiline: true }],
            delimiter: ['STRING', { multiline: false }],
          } },
          input_order: { required: ['string_a', 'string_b', 'delimiter'], optional: [] },
          output_node: false,
        },
        CLIPTextEncode: objectInfo.CLIPTextEncode,
        KSampler: {
          input: { required: { positive: ['CONDITIONING'] } },
          input_order: { required: ['positive'], optional: [] },
          output_node: false,
        },
        SaveImage: fixtureOutputInfo,
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { positive_prompt: 'runtime prompt' },
      loras: [],
    })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_TARGET_AMBIGUOUS',
      message: expect.stringMatching(/positive_prompt.*33:StringConcatenate\.string_a.*33:StringConcatenate\.string_b/u),
    })
  })

  it('rewrites the executable upstream negative Prompt and preserves an unselected connected LoraManager input', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 1,
          type: 'ImpactWildcardProcessor',
          title: 'NEGATIVE',
          mode: 0,
          inputs: [],
          outputs: [{ name: 'processed text', type: 'STRING', links: [10] }],
          widgets_values: ['template negative', 'template negative', 'populate'],
          widgets_values_named: {
            wildcard_text: 'template negative',
            populated_text: 'template negative',
            mode: 'populate',
          },
        },
        {
          id: 4,
          type: 'Lora Loader (LoraManager)',
          mode: 0,
          inputs: [],
          outputs: [{ name: 'trigger_words', type: 'STRING', links: [11] }],
          properties: { __lm_widget_ids: ['__lm_autocomplete_meta_text', 'text', 'loras'] },
          widgets_values: [{}, '<lora:template-lora:1>', [{ name: 'template-lora', strength: 1, clipStrength: 1, active: true }]],
          widgets_values_named: { __lm_autocomplete_meta_text: {}, text: '<lora:template-lora:1>', loras: [{ name: 'template-lora', strength: 1, clipStrength: 1, active: true }] },
        },
        {
          id: 5,
          type: 'StringConcatenate',
          mode: 0,
          inputs: [
            { name: 'string_a', type: 'STRING', link: 11 },
            { name: 'string_b', type: 'STRING', link: 10 },
          ],
          outputs: [{ name: 'STRING', type: 'STRING', links: [12] }],
          widgets_values: [','],
          widgets_values_named: { delimiter: ',' },
        },
        {
          id: 2,
          type: 'CLIPTextEncode',
          title: 'CLIP Text Encode (Negative)',
          mode: 0,
          inputs: [{ name: 'text', type: 'STRING', link: 12, widget: { name: 'text' } }],
          outputs: [],
          widgets_values: [''],
          widgets_values_named: { text: '' },
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
      links: [
        [10, 1, 0, 5, 1, 'STRING'],
        [11, 4, 0, 5, 0, 'STRING'],
        [12, 5, 0, 2, 0, 'STRING'],
      ],
    }
    const definitions = {
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
        input: { required: { text: ['AUTOCOMPLETE_TEXT_LORAS', { tooltip: 'Use <lora:name:weight> syntax.' }] } },
        input_order: { required: ['text'], optional: [] },
        output_node: false,
      },
      StringConcatenate: {
        input: { required: { string_a: ['STRING', {}], string_b: ['STRING', {}], delimiter: ['STRING', {}] } },
        input_order: { required: ['string_a', 'string_b', 'delimiter'], optional: [] },
        output_node: false,
      },
      CLIPTextEncode: objectInfo.CLIPTextEncode,
      SaveImage: fixtureOutputInfo,
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(definitions), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { "negative_prompt": 'low quality, blurry' },

      loras: [],
    })

    expect(compiled.apiWorkflow['1']).toMatchObject({ inputs: { wildcard_text: 'low quality, blurry' } })
    expect(compiled.apiWorkflow['4']).toMatchObject({ inputs: {
      text: '<lora:template-lora:1>',
      loras: [{ name: 'template-lora', strength: 1, clipStrength: 1, active: true }],
    } })
  })

  it('rejects a connected Prompt binding with multiple semantic upstream widgets', async () => {
    const promptNode = (id: number, link: number): UiWorkflow['nodes'][number] => ({
      id,
      type: 'ImpactWildcardProcessor',
      title: `POSITIVE ${id}`,
      mode: 0,
      inputs: [],
      outputs: [{ name: 'processed text', type: 'STRING', links: [link] }],
      widgets_values: [`template prompt ${id}`, `template prompt ${id}`, 'populate'],
      widgets_values_named: {
        wildcard_text: `template prompt ${id}`,
        populated_text: `template prompt ${id}`,
        mode: 'populate',
      },
    })
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        promptNode(1, 10),
        promptNode(4, 11),
        {
          id: 5,
          type: 'StringConcatenate',
          mode: 0,
          inputs: [
            { name: 'string_a', type: 'STRING', link: 10 },
            { name: 'string_b', type: 'STRING', link: 11 },
          ],
          outputs: [{ name: 'STRING', type: 'STRING', links: [12] }],
          widgets_values: [','],
          widgets_values_named: { delimiter: ',' },
        },
        {
          id: 2,
          type: 'CLIPTextEncode',
          title: 'CLIP Text Encode (Positive)',
          mode: 0,
          inputs: [{ name: 'text', type: 'STRING', link: 12, widget: { name: 'text' } }],
          outputs: [],
          widgets_values: [''],
          widgets_values_named: { text: '' },
        },
        {
          id: 6,
          type: 'Lora Loader (LoraManager)',
          mode: 0,
          inputs: [],
          outputs: [],
          properties: { __lm_widget_ids: ['__lm_autocomplete_meta_text', 'text', 'loras'] },
          widgets_values: [{}, '<lora:template-lora:1>', [{ name: 'template-lora', strength: 1, clipStrength: 1, active: true }]],
          widgets_values_named: { __lm_autocomplete_meta_text: {}, text: '<lora:template-lora:1>', loras: [{ name: 'template-lora', strength: 1, clipStrength: 1, active: true }] },
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
      links: [
        [10, 1, 0, 5, 0, 'STRING'],
        [11, 4, 0, 5, 1, 'STRING'],
        [12, 5, 0, 2, 0, 'STRING'],
      ],
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ImpactWildcardProcessor: {
          input: { required: {
            wildcard_text: ['STRING', {}],
            populated_text: ['STRING', {}],
            mode: [['populate', 'fixed'], {}],
          } },
          input_order: { required: ['wildcard_text', 'populated_text', 'mode'], optional: [] },
          output_node: false,
        },
        StringConcatenate: {
          input: { required: { string_a: ['STRING', {}], string_b: ['STRING', {}], delimiter: ['STRING', {}] } },
          input_order: { required: ['string_a', 'string_b', 'delimiter'], optional: [] },
          output_node: false,
        },
        'Lora Loader (LoraManager)': {
          input: { required: { text: ['AUTOCOMPLETE_TEXT_LORAS', { tooltip: 'Use <lora:name:weight> syntax.' }] } },
          input_order: { required: ['text'], optional: [] },
          output_node: false,
        },
        CLIPTextEncode: objectInfo.CLIPTextEncode,
        SaveImage: fixtureOutputInfo,
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { "positive_prompt": 'requested prompt' },

      loras: [],
    })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_TARGET_AMBIGUOUS',
      message: expect.stringMatching(/positive_prompt.*1:ImpactWildcardProcessor\.wildcard_text.*4:ImpactWildcardProcessor\.wildcard_text/u),
    })
  })

  it('rejects a connected Prompt input without an executable upstream Prompt widget', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 1,
          type: 'StringConcatenate',
          mode: 0,
          inputs: [],
          outputs: [{ name: 'STRING', type: 'STRING', links: [12] }],
          widgets_values: [','],
          widgets_values_named: { delimiter: ',' },
        },
        {
          id: 2,
          type: 'CLIPTextEncode',
          title: 'CLIP Text Encode (Positive)',
          mode: 0,
          inputs: [{ name: 'text', type: 'STRING', link: 12, widget: { name: 'text' } }],
          outputs: [],
          widgets_values: [''],
          widgets_values_named: { text: '' },
        },
        {
          id: 4,
          type: 'Lora Loader (LoraManager)',
          mode: 0,
          inputs: [],
          outputs: [],
          properties: { __lm_widget_ids: ['__lm_autocomplete_meta_text', 'text', 'loras'] },
          widgets_values: [{}, '<lora:template-lora:1>', [{ name: 'template-lora', strength: 1, clipStrength: 1, active: true }]],
          widgets_values_named: { __lm_autocomplete_meta_text: {}, text: '<lora:template-lora:1>', loras: [{ name: 'template-lora', strength: 1, clipStrength: 1, active: true }] },
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
      links: [[12, 1, 0, 2, 0, 'STRING']],
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        StringConcatenate: {
          input: { required: { delimiter: ['STRING', {}] } },
          input_order: { required: ['delimiter'], optional: [] },
          output_node: false,
        },
        'Lora Loader (LoraManager)': {
          input: { required: { text: ['AUTOCOMPLETE_TEXT_LORAS', { tooltip: 'Use <lora:name:weight> syntax.' }] } },
          input_order: { required: ['text'], optional: [] },
          output_node: false,
        },
        CLIPTextEncode: objectInfo.CLIPTextEncode,
        SaveImage: fixtureOutputInfo,
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { "positive_prompt": 'requested prompt' },

      loras: [],
    })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_TARGET_NOT_FOUND',
      message: expect.stringContaining('does not match a Workflow widget'),
    })
  })

  it('rejects a connected Prompt input whose only upstream text widget is LoraManager syntax', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 1,
          type: 'Lora Loader (LoraManager)',
          mode: 0,
          inputs: [],
          outputs: [{ name: 'trigger_words', type: 'STRING', links: [10] }],
          properties: { __lm_widget_ids: ['__lm_autocomplete_meta_text', 'text', 'loras'] },
          widgets_values: [{}, '<lora:template-lora:1>', [{ name: 'template-lora', strength: 1, clipStrength: 1, active: true }]],
          widgets_values_named: { __lm_autocomplete_meta_text: {}, text: '<lora:template-lora:1>', loras: [{ name: 'template-lora', strength: 1, clipStrength: 1, active: true }] },
        },
        {
          id: 2,
          type: 'CLIPTextEncode',
          title: 'CLIP Text Encode (Positive)',
          mode: 0,
          inputs: [{ name: 'text', type: 'STRING', link: 10, widget: { name: 'text' } }],
          outputs: [],
          widgets_values: [''],
          widgets_values_named: { text: '' },
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
      links: [[10, 1, 0, 2, 0, 'STRING']],
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        'Lora Loader (LoraManager)': {
          input: { required: { text: ['AUTOCOMPLETE_TEXT_LORAS', { tooltip: 'Use <lora:name:weight> syntax.' }] } },
          input_order: { required: ['text'], optional: [] },
          output_node: false,
        },
        CLIPTextEncode: objectInfo.CLIPTextEncode,
        SaveImage: fixtureOutputInfo,
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { "positive_prompt": 'requested prompt' },

      loras: [],
    })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_TARGET_NOT_FOUND',
      message: expect.stringContaining('does not match a Workflow widget'),
    })
    expect(actual.nodes[0]?.widgets_values_named).toMatchObject({ text: '<lora:template-lora:1>' })
  })

  it('selects an unmarked upstream Prompt widget and excludes reachable LoraManager syntax', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 1,
          type: 'ImpactWildcardProcessor',
          mode: 0,
          inputs: [],
          outputs: [{ name: 'processed text', type: 'STRING', links: [10] }],
          widgets_values: ['template prompt', 'template prompt', 'populate'],
          widgets_values_named: { wildcard_text: 'template prompt', populated_text: 'template prompt', mode: 'populate' },
        },
        {
          id: 4,
          type: 'Lora Loader (LoraManager)',
          mode: 0,
          inputs: [],
          outputs: [{ name: 'trigger_words', type: 'STRING', links: [11] }],
          properties: { __lm_widget_ids: ['__lm_autocomplete_meta_text', 'text', 'loras'] },
          widgets_values: [{}, '<lora:template-lora:1>', [{ name: 'template-lora', strength: 1, clipStrength: 1, active: true }]],
          widgets_values_named: { __lm_autocomplete_meta_text: {}, text: '<lora:template-lora:1>', loras: [{ name: 'template-lora', strength: 1, clipStrength: 1, active: true }] },
        },
        {
          id: 5,
          type: 'StringConcatenate',
          mode: 0,
          inputs: [
            { name: 'string_a', type: 'STRING', link: 11 },
            { name: 'string_b', type: 'STRING', link: 10 },
          ],
          outputs: [{ name: 'STRING', type: 'STRING', links: [12] }],
          widgets_values: [','],
          widgets_values_named: { delimiter: ',' },
        },
        {
          id: 2,
          type: 'CLIPTextEncode',
          mode: 0,
          inputs: [{ name: 'text', type: 'STRING', link: 12, widget: { name: 'text' } }],
          outputs: [],
          widgets_values: [''],
          widgets_values_named: { text: '' },
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
      links: [
        [10, 1, 0, 5, 1, 'STRING'],
        [11, 4, 0, 5, 0, 'STRING'],
        [12, 5, 0, 2, 0, 'STRING'],
      ],
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
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
          input: { required: { text: ['AUTOCOMPLETE_TEXT_LORAS', { tooltip: 'Use <lora:name:weight> syntax.' }] } },
          input_order: { required: ['text'], optional: [] },
          output_node: false,
        },
        StringConcatenate: {
          input: { required: { string_a: ['STRING', {}], string_b: ['STRING', {}], delimiter: ['STRING', {}] } },
          input_order: { required: ['string_a', 'string_b', 'delimiter'], optional: [] },
          output_node: false,
        },
        CLIPTextEncode: objectInfo.CLIPTextEncode,
        SaveImage: fixtureOutputInfo,
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { "positive_prompt": 'requested prompt' },

      loras: [],
    })

    expect(compiled.apiWorkflow['1']).toMatchObject({ inputs: { wildcard_text: 'requested prompt' } })
    expect(compiled.apiWorkflow['4']).toMatchObject({ inputs: {
      text: '<lora:template-lora:1>',
      loras: [{ name: 'template-lora', strength: 1, clipStrength: 1, active: true }],
    } })
  })

  it('follows only the effective input of a bypassed upstream Prompt branch', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 1,
          type: 'ImpactWildcardProcessor',
          title: 'POSITIVE',
          mode: 0,
          inputs: [],
          outputs: [{ name: 'processed text', type: 'STRING', links: [10] }],
          widgets_values: ['template prompt', 'template prompt', 'populate'],
          widgets_values_named: { wildcard_text: 'template prompt', populated_text: 'template prompt', mode: 'populate' },
        },
        {
          id: 4,
          type: 'Lora Loader (LoraManager)',
          mode: 0,
          inputs: [],
          outputs: [{ name: 'trigger_words', type: 'STRING', links: [11] }],
          properties: { __lm_widget_ids: ['__lm_autocomplete_meta_text', 'text', 'loras'] },
          widgets_values: [{}, '<lora:template-lora:1>', [{ name: 'template-lora', strength: 1, clipStrength: 1, active: true }]],
          widgets_values_named: { __lm_autocomplete_meta_text: {}, text: '<lora:template-lora:1>', loras: [{ name: 'template-lora', strength: 1, clipStrength: 1, active: true }] },
        },
        {
          id: 5,
          type: 'StringConcatenate',
          mode: 4,
          inputs: [
            { name: 'string_a', type: 'STRING', link: 11 },
            { name: 'string_b', type: 'STRING', link: 10 },
          ],
          outputs: [{ name: 'STRING', type: 'STRING', links: [12] }],
          widgets_values: [','],
          widgets_values_named: { delimiter: ',' },
        },
        {
          id: 2,
          type: 'CLIPTextEncode',
          title: 'CLIP Text Encode (Positive)',
          mode: 0,
          inputs: [{ name: 'text', type: 'STRING', link: 12, widget: { name: 'text' } }],
          outputs: [],
          widgets_values: [''],
          widgets_values_named: { text: '' },
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
      links: [
        [10, 1, 0, 5, 1, 'STRING'],
        [11, 4, 0, 5, 0, 'STRING'],
        [12, 5, 0, 2, 0, 'STRING'],
      ],
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
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
          input: { required: { text: ['AUTOCOMPLETE_TEXT_LORAS', { tooltip: 'Use <lora:name:weight> syntax.' }] } },
          input_order: { required: ['text'], optional: [] },
          output_node: false,
        },
        StringConcatenate: {
          input: { required: { string_a: ['STRING', {}], string_b: ['STRING', {}], delimiter: ['STRING', {}] } },
          input_order: { required: ['string_a', 'string_b', 'delimiter'], optional: [] },
          output_node: false,
        },
        CLIPTextEncode: objectInfo.CLIPTextEncode,
        SaveImage: fixtureOutputInfo,
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { "positive_prompt": 'requested prompt' },

      loras: [],
    })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_TARGET_NOT_FOUND',
      message: expect.stringContaining('does not match an executable Workflow widget'),
    })
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
    const compiler = createCompiler({
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
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
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
    const compiler = createCompiler({
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
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
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
    const compiler = createCompiler({
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
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
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
    const compiler = createCompiler({
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
        SaveImage: fixtureOutputInfo,
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { "width": 640 },

      loras: [],
    })

    expect(compiled.apiWorkflow['1']).toMatchObject({ inputs: { value: 640 } })
    expect(compiled.apiWorkflow['2']).toMatchObject({ inputs: { width: ['1', 0] } })
  })

  it('rejects exact dimensions when a connected selector cannot represent width and height widgets', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 1,
          type: 'ResolutionSelector',
          title: 'Resolution selector',
          mode: 0,
          inputs: [
            { name: 'aspect_ratio', type: 'COMBO', link: null, widget: { name: 'aspect_ratio' } },
            { name: 'megapixels', type: 'FLOAT', link: null, widget: { name: 'megapixels' } },
            { name: 'multiple', type: 'INT', link: null, widget: { name: 'multiple' } },
          ],
          outputs: [
            { name: 'width', type: 'INT', links: [10] },
            { name: 'height', type: 'INT', links: [11] },
          ],
          widgets_values: ['9:16', 1, 8],
        },
        {
          id: 2,
          type: 'EmptyLatentImage',
          mode: 0,
          inputs: [
            { name: 'width', type: 'INT', link: 10, widget: { name: 'width' } },
            { name: 'height', type: 'INT', link: 11, widget: { name: 'height' } },
            { name: 'batch_size', type: 'INT', link: null, widget: { name: 'batch_size' } },
          ],
          outputs: [],
          widgets_values: [1024, 1024, 1],
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
      links: [
        [10, 1, 0, 2, 0, 'INT'],
        [11, 1, 1, 2, 1, 'INT'],
      ],
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ResolutionSelector: {
          input: {
            required: {
              aspect_ratio: [['9:16'], {}],
              megapixels: ['FLOAT', {}],
              multiple: ['INT', {}],
            },
          },
          input_order: { required: ['aspect_ratio', 'megapixels', 'multiple'], optional: [] },
          output_node: false,
        },
        EmptyLatentImage: {
          input: { required: { width: ['INT', {}], height: ['INT', {}], batch_size: ['INT', {}] } },
          input_order: { required: ['width', 'height', 'batch_size'], optional: [] },
          output_node: false,
        },
        SaveImage: fixtureOutputInfo,
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { "width": 640, "height": 768 },

      loras: [],
    })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_TARGET_NOT_FOUND',
      message: expect.stringContaining('width'),
    })
    expect(actual.links).toHaveLength(2)
  })

  it('does not rewrite independent latent-upscale dimensions when source dimensions change', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 1,
          type: 'EmptyLatentImage',
          mode: 0,
          inputs: [
            { name: 'width', type: 'INT', link: null, widget: { name: 'width' } },
            { name: 'height', type: 'INT', link: null, widget: { name: 'height' } },
            { name: 'batch_size', type: 'INT', link: null, widget: { name: 'batch_size' } },
          ],
          outputs: [{ name: 'LATENT', type: 'LATENT', links: [10] }],
          widgets_values: [768, 1008, 1],
        },
        {
          id: 2,
          type: 'LatentUpscale',
          mode: 0,
          inputs: [
            { name: 'samples', type: 'LATENT', link: 10 },
            { name: 'upscale_method', type: 'COMBO', link: null, widget: { name: 'upscale_method' } },
            { name: 'width', type: 'INT', link: null, widget: { name: 'width' } },
            { name: 'height', type: 'INT', link: null, widget: { name: 'height' } },
            { name: 'crop', type: 'COMBO', link: null, widget: { name: 'crop' } },
          ],
          outputs: [{ name: 'LATENT', type: 'LATENT', links: [] }],
          widgets_values: ['bicubic', 1152, 1512, 'disabled'],
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
      links: [[10, 1, 0, 2, 0, 'LATENT']],
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        EmptyLatentImage: {
          input: { required: { width: ['INT', {}], height: ['INT', {}], batch_size: ['INT', {}] } },
          input_order: { required: ['width', 'height', 'batch_size'], optional: [] },
          output_node: false,
        },
        LatentUpscale: {
          input: { required: {
            samples: ['LATENT'],
            upscale_method: [['nearest-exact', 'bilinear', 'area', 'bicubic'], {}],
            width: ['INT', { step: 8 }],
            height: ['INT', { step: 8 }],
            crop: [['disabled', 'center'], {}],
          } },
          input_order: { required: ['samples', 'upscale_method', 'width', 'height', 'crop'], optional: [] },
          output_node: false,
        },
        SaveImage: fixtureOutputInfo,
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { "width": 704, "height": 832 },

      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 1)?.widgets_values).toEqual([704, 832, 1])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 2)?.widgets_values).toEqual([
      'bicubic', 1152, 1512, 'disabled',
    ])
    expect(compiled.apiWorkflow['2']).toMatchObject({ inputs: { width: 1152, height: 1512 } })

    const fixedAspectWorkflow = structuredClone(actual)
    const fixedAspectUpscale = fixedAspectWorkflow.nodes.find(node => node.id === 2) as { widgets_values: JsonValue[] }
    fixedAspectUpscale.widgets_values = ['bicubic', 1152, 1536, 'disabled']
    const fixedAspect = await compiler.compile({
      instanceId: 'test-instance',
      workflow: fixedAspectWorkflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { "width": 704, "height": 832 },

      loras: [],
    })
    expect(fixedAspect.apiWorkflow['2']).toMatchObject({ inputs: { width: 1152, height: 1536 } })
  })

  it('uses a parameter node suffix to rewrite the seed source connected to that consumer', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 1,
          type: 'SeedNode',
          mode: 0,
          inputs: [],
          outputs: [{ name: 'seed', type: 'INT', links: [10] }],
          widgets_values: [101, 'fixed'],
        },
        {
          id: 2,
          type: 'KSampler',
          mode: 0,
          inputs: [{ name: 'seed', type: 'INT', link: 10, widget: { name: 'seed' } }],
          outputs: [],
          widgets_values: [999, 'fixed'],
        },
        {
          id: 3,
          type: 'SaveImage',
          mode: 0,
          inputs: [{ name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } }],
          outputs: [],
          widgets_values: ['output'],
        },
        {
          id: 4,
          type: 'SeedNode',
          mode: 0,
          inputs: [],
          outputs: [],
          widgets_values: [202, 'fixed'],
        },
      ],
      links: [[10, 1, 0, 2, 0, 'INT']],
    }
    const seedDefinition = {
      input: { required: { seed: ['INT', { control_after_generate: true }] } },
      input_order: { required: ['seed'], optional: [] },
      output_node: false,
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        SeedNode: seedDefinition,
        KSampler: seedDefinition,
        SaveImage: fixtureOutputInfo,
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { "seed_2": 303 },

      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 1)?.widgets_values).toEqual([303, 'fixed'])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 4)?.widgets_values).toEqual([202, 'fixed'])
    expect(compiled.apiWorkflow['2']).toMatchObject({ inputs: { seed: ['1', 0] } })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { "seed": 404, "seed_2": 303 },

      loras: [],
    })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_TARGET_AMBIGUOUS',
      message: expect.stringMatching(/seed.*seed_2/u),
    })
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
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(definitions), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { "positive_prompt": 'positive final', "negative_prompt": 'negative final', "width": 768, "height": 1024, "seed": 42 },

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
    const compiler = createCompiler({
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
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { "reference_image": 'input.png' },

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
    const compiler = createCompiler({
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
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { "seed": 11, "seed_7": 22 },

      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 6)?.widgets_values).toEqual([11, 'fixed'])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 7)?.widgets_values).toEqual([22, 'fixed'])
  })

  it('applies node-id suffixes to every published standard runtime parameter', async () => {
    const controls = [
      ['positive_prompt', 101, 'positive prompt'],
      ['negative_prompt', 102, 'negative prompt'],
      ['width', 103, 768],
      ['height', 104, 1024],
      ['seed', 105, 41],
      ['cfg', 106, 7],
      ['steps', 107, 20],
      ['sampler_name', 108, 'euler'],
      ['scheduler', 109, 'normal'],
      ['denoise', 110, 1],
      ['batch_size', 111, 1],
      ['resolution_preset', 112, '1024x1024'],
      ['reference_image', 113, 'source.png'],
      ['aspect_ratio', 114, '1:1'],
      ['megapixels', 115, 1],
    ] as const
    const controlType = (kind: string, initial: string | number): 'INT' | 'FLOAT' | 'STRING' => {
      if (typeof initial === 'string') return 'STRING'
      return ['cfg', 'denoise', 'megapixels'].includes(kind) ? 'FLOAT' : 'INT'
    }
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        ...controls.map(([kind, id, initial]) => ({
          id,
          type: `Control${id}`,
          title: kind,
          mode: 0,
          inputs: [{ name: kind, type: controlType(kind, initial), link: null, widget: { name: kind } }],
          outputs: [],
          widgets_values: [initial],
        })),
        {
          id: 200,
          type: 'SaveImage',
          mode: 0,
          inputs: [{ name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } }],
          outputs: [],
          widgets_values: ['output'],
        },
      ],
      links: [],
    }
    const definitions = Object.fromEntries(controls.map(([kind, id, initial]) => [
      `Control${id}`,
      {
        input: { required: { [kind]: [controlType(kind, initial), {}] } },
        input_order: { required: [kind], optional: [] },
        output_node: false,
      },
    ]))
    const runtimeParameters = Object.fromEntries(controls.map(([kind, id], index) => [
      `${kind}_${id}`,
      typeof controls[index]![2] === 'number' ? 900 + index : `runtime-${kind}`,
    ]))
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...definitions,
        SaveImage: fixtureOutputInfo,
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters,
      loras: [],
    })

    controls.forEach(([kind, id]) => {
      expect(compiled.actualWorkflow.nodes.find(node => node.id === id)?.widgets_values).toEqual([
        runtimeParameters[`${kind}_${id}`],
      ])
    })
  })

  it('canonicalizes runtime enum values through a unique case-insensitive live instance match', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 41,
      type: 'KSampler',
      mode: 0,
      inputs: [
        { name: 'sampler_name', type: 'COMBO', link: null, widget: { name: 'sampler_name' } },
        { name: 'scheduler', type: 'COMBO', link: null, widget: { name: 'scheduler' } },
      ],
      outputs: [],
      widgets_values: ['lcm', 'normal'],
      widgets_values_named: { sampler_name: 'lcm', scheduler: 'normal' },
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        KSampler: {
          input: { required: {
            sampler_name: [['euler', 'lcm'], {}],
            scheduler: [['simple', 'normal'], {}],
          } },
          input_order: { required: ['sampler_name', 'scheduler'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { sampler_name: 'LCM', scheduler: 'NORMAL' },
      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 41)?.widgets_values).toEqual(['lcm', 'normal'])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 41)?.widgets_values_named)
      .toEqual({ sampler_name: 'lcm', scheduler: 'normal' })
    expect(compiled.apiWorkflow['41']).toMatchObject({ inputs: { sampler_name: 'lcm', scheduler: 'normal' } })
  })

  it('canonicalizes an exact custom runtime parameter through its live enum definition', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 42,
      type: 'ColorMethod',
      mode: 0,
      inputs: [{ name: 'method', type: 'COMBO', link: null, widget: { name: 'method' } }],
      outputs: [],
      widgets_values: ['mkl'],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        ColorMethod: {
          input: { required: { method: [['mkl', 'hm'], {}] } },
          input_order: { required: ['method'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { method: 'MKL' },
      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 42)?.widgets_values).toEqual(['mkl'])
    expect(compiled.apiWorkflow['42']).toMatchObject({ inputs: { method: 'mkl' } })
  })

  it('rejects the production SeedNode value above its exact live maximum before official compilation', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 31,
      type: 'SeedNode',
      mode: 0,
      inputs: [{ name: 'seed', type: 'INT', link: null, widget: { name: 'seed' } }],
      outputs: [],
      widgets_values: [1, 'fixed'],
      widgets_values_named: { seed: 1 },
    })
    const nodeDefinitionsJson = JSON.stringify({
      ...objectInfo,
      SeedNode: {
        input: { required: { seed: ['INT', { min: 0, max: '__MAX_SEED__', control_after_generate: 'fixed' }] } },
        input_order: { required: ['seed'], optional: [] },
        output_node: false,
      },
    }).replace('"__MAX_SEED__"', '9223372036854775807')
    const officialApiWorkflowCompiler = {
      compile: vi.fn(async input => ({
        apiWorkflow: input.runtimeProjection,
        cacheKey: 'test-cache-key',
        cacheStatus: 'miss' as const,
      })),
    }
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(nodeDefinitionsJson, { status: 200 })),
      officialApiWorkflowCompiler,
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { seed: 12130929238470859000 },
      loras: [],
    })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_INVALID',
      message: expect.stringContaining('maximum 9223372036854775807'),
    })
    expect(officialApiWorkflowCompiler.compile).not.toHaveBeenCalled()
  })

  it.each([
    ['INT fractional number', ['INT', { min: 0, max: 100 }], 1.5],
    ['INT string', ['INT', { min: 0, max: 100 }], '1'],
    ['INT boolean', ['INT', { min: 0, max: 100 }], true],
    ['INT null', ['INT', { min: 0, max: 100 }], null],
    ['INT array', ['INT', { min: 0, max: 100 }], [1]],
    ['INT object', ['INT', { min: 0, max: 100 }], { value: 1 }],
    ['INT NaN', ['INT', { min: 0, max: 100 }], Number.NaN],
    ['INT negative infinity', ['INT', { min: 0, max: 100 }], Number.NEGATIVE_INFINITY],
    ['INT non-finite number', ['INT', { min: 0, max: 100 }], Number.POSITIVE_INFINITY],
    ['INT below minimum', ['INT', { min: -2, max: 100 }], -3],
    ['INT above maximum', ['INT', { min: 0, max: 100 }], 101],
    ['FLOAT string', ['FLOAT', { min: 0, max: 10 }], '1.5'],
    ['FLOAT boolean', ['FLOAT', { min: 0, max: 10 }], false],
    ['FLOAT null', ['FLOAT', { min: 0, max: 10 }], null],
    ['FLOAT array', ['FLOAT', { min: 0, max: 10 }], [1.5]],
    ['FLOAT object', ['FLOAT', { min: 0, max: 10 }], { value: 1.5 }],
    ['FLOAT non-finite number', ['FLOAT', { min: 0, max: 10 }], Number.NaN],
    ['FLOAT positive infinity', ['FLOAT', { min: 0, max: 10 }], Number.POSITIVE_INFINITY],
    ['FLOAT negative infinity', ['FLOAT', { min: 0, max: 10 }], Number.NEGATIVE_INFINITY],
    ['FLOAT below minimum', ['FLOAT', { min: -1.25, max: 10 }], -1.5],
    ['FLOAT above maximum', ['FLOAT', { min: 0, max: 1e2 }], 101],
    ['STRING number', ['STRING', {}], 1],
    ['STRING boolean', ['STRING', {}], true],
    ['STRING null', ['STRING', {}], null],
    ['STRING array', ['STRING', {}], ['text']],
    ['STRING object', ['STRING', {}], { text: 'value' }],
    ['AUTOCOMPLETE_TEXT_LORAS number', ['AUTOCOMPLETE_TEXT_LORAS', {}], 1],
    ['AUTOCOMPLETE_TEXT_LORAS boolean', ['AUTOCOMPLETE_TEXT_LORAS', {}], false],
    ['AUTOCOMPLETE_TEXT_LORAS null', ['AUTOCOMPLETE_TEXT_LORAS', {}], null],
    ['AUTOCOMPLETE_TEXT_LORAS array', ['AUTOCOMPLETE_TEXT_LORAS', {}], ['text']],
    ['AUTOCOMPLETE_TEXT_LORAS object', ['AUTOCOMPLETE_TEXT_LORAS', {}], { text: 'value' }],
    ['BOOLEAN number', ['BOOLEAN', {}], 1],
    ['BOOLEAN string', ['BOOLEAN', {}], 'true'],
    ['BOOLEAN null', ['BOOLEAN', {}], null],
    ['BOOLEAN array', ['BOOLEAN', {}], [true]],
    ['BOOLEAN object', ['BOOLEAN', {}], { value: true }],
  ])('rejects a runtime parameter that violates its %s contract', async (_label, inputDescriptor, suppliedValue) => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 43,
      type: 'ContractNode',
      mode: 0,
      inputs: [{ name: 'custom', type: String(inputDescriptor[0]), link: null, widget: { name: 'custom' } }],
      outputs: [],
      widgets_values: [inputDescriptor[0] === 'BOOLEAN' ? false : null],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        ContractNode: {
          input: { required: { custom: inputDescriptor } },
          input_order: { required: ['custom'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { custom: suppliedValue as JsonValue },
      loras: [],
    })).rejects.toMatchObject({ code: 'GENERATION_PARAMETER_INVALID' })
  })

  it.each([
    ['INT accepts an ordinary integer', ['INT', { min: -10, max: 10 }], 7],
    ['INT accepts its exact minimum', ['INT', { min: -10, max: 10 }], -10],
    ['FLOAT accepts an integer', ['FLOAT', { min: 0, max: 10 }], 5],
    ['FLOAT accepts an ordinary decimal', ['FLOAT', { min: -1.25, max: 10.5 }], 2.75],
    ['FLOAT accepts its exact minimum', ['FLOAT', { min: -1.25, max: 10.5 }], -1.25],
    ['FLOAT accepts its exact maximum', ['FLOAT', { min: -1.25, max: 10.5 }], 10.5],
    ['STRING accepts a string outside UI metadata options', ['STRING', { options: ['listed'] }], 'unlisted'],
    ['STRING accepts a string outside UI metadata choices', ['STRING', { choices: ['listed'] }], 'unlisted'],
    ['INT ignores UI metadata options', ['INT', { min: 0, max: 10, options: [1, 2] }], 7],
    ['AUTOCOMPLETE_TEXT_LORAS accepts a string', ['AUTOCOMPLETE_TEXT_LORAS', {}], '<lora:model:1>'],
    ['BOOLEAN accepts a boolean', ['BOOLEAN', {}], false],
  ])('accepts a runtime parameter when %s', async (_label, inputDescriptor, suppliedValue) => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 43,
      type: 'ContractNode',
      mode: 0,
      inputs: [{ name: 'custom', type: String(inputDescriptor[0]), link: null, widget: { name: 'custom' } }],
      outputs: [],
      widgets_values: [null],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        ContractNode: {
          input: { required: { custom: inputDescriptor } },
          input_order: { required: ['custom'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { custom: suppliedValue as JsonValue },
      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 43)?.widgets_values).toEqual([suppliedValue])
  })

  it.each([
    ['an empty descriptor array', []],
    ['a descriptor with a non-string type', [123, {}]],
    ['an INT descriptor with an array configuration', ['INT', []]],
    ['an INT descriptor with a string minimum', ['INT', { min: '0', max: 10 }]],
    ['a FLOAT descriptor with an object maximum', ['FLOAT', { min: 0, max: { value: 10 } }]],
    ['an INT descriptor whose minimum is greater than its maximum', ['INT', { min: 11, max: 10 }]],
    ['a COMBO descriptor with non-array options', ['COMBO', { options: 'not-an-array' }]],
    ['a COMBO descriptor with a non-boolean multiselect flag', ['COMBO', { options: ['a'], multiselect: 'yes' }]],
  ])('rejects malformed /object_info contract: %s', async (_label, inputDescriptor) => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 43,
      type: 'MalformedContractNode',
      mode: 0,
      inputs: [{ name: 'custom', type: String(inputDescriptor[0]), link: null, widget: { name: 'custom' } }],
      outputs: [],
      widgets_values: [0],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        MalformedContractNode: {
          input: { required: { custom: inputDescriptor } },
          input_order: { required: ['custom'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { custom: 0 },
      loras: [],
    })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_CONTRACT_UNSUPPORTED',
      message: expect.stringContaining('malformed'),
    })
  })

  it('rejects a non-array published descriptor reached through explicit widget identities', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 43,
      type: 'MalformedContractNode',
      mode: 0,
      inputs: [],
      outputs: [],
      properties: { __lm_widget_ids: ['custom'] },
      widgets_values: [0],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        MalformedContractNode: {
          input: { required: { custom: { type: 'INT' } } },
          input_order: { required: ['custom'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { custom: 0 },
      loras: [],
    })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_CONTRACT_UNSUPPORTED',
      message: expect.stringContaining('malformed'),
    })
  })

  it('accepts the exact successful unsafe integer seed observed in the regression history', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 31,
      type: 'SeedNode',
      mode: 0,
      inputs: [{ name: 'seed', type: 'INT', link: null, widget: { name: 'seed' } }],
      outputs: [],
      widgets_values: [1, 'fixed'],
    })
    const nodeDefinitionsJson = JSON.stringify({
      ...objectInfo,
      SeedNode: {
        input: { required: { seed: ['INT', { min: 0, max: '__MAX_SEED__' }] } },
        input_order: { required: ['seed'], optional: [] },
        output_node: false,
      },
    }).replace('"__MAX_SEED__"', '9223372036854775807')
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(nodeDefinitionsJson, { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { seed: 8777816296766206976 },
      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 31)?.widgets_values).toEqual([8777816296766206976, 'fixed'])
  })

  it.each([
    ['1.0 and 1e0 bounds', '1.0', '1e0', 1],
    ['negative zero bounds', '-0', '0e1000000', -0],
    ['negative exponent bounds', '-2.5e1', '-1.5e1', -20],
  ])('accepts exact decimal equivalence for %s', async (_label, minimum, maximum, suppliedValue) => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 43,
      type: 'ExactFloatNode',
      mode: 0,
      inputs: [{ name: 'custom', type: 'FLOAT', link: null, widget: { name: 'custom' } }],
      outputs: [],
      widgets_values: [0],
    })
    const nodeDefinitionsJson = JSON.stringify({
      ...objectInfo,
      ExactFloatNode: {
        input: { required: { custom: ['FLOAT', { min: '__MINIMUM__', max: '__MAXIMUM__' }] } },
        input_order: { required: ['custom'], optional: [] },
        output_node: false,
      },
    })
      .replace('"__MINIMUM__"', minimum)
      .replace('"__MAXIMUM__"', maximum)
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(nodeDefinitionsJson, { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { custom: suppliedValue },
      loras: [],
    })).resolves.toMatchObject({
      actualWorkflow: expect.objectContaining({
        nodes: expect.arrayContaining([expect.objectContaining({ id: 43, widgets_values: [suppliedValue] })]),
      }),
    })
  })

  it('compares a finite runtime number with a huge exact exponent without materializing zero strings', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 43,
      type: 'ExactFloatNode',
      mode: 0,
      inputs: [{ name: 'custom', type: 'FLOAT', link: null, widget: { name: 'custom' } }],
      outputs: [],
      widgets_values: [0],
    })
    const nodeDefinitionsJson = JSON.stringify({
      ...objectInfo,
      ExactFloatNode: {
        input: { required: { custom: ['FLOAT', { min: '__MINIMUM__' }] } },
        input_order: { required: ['custom'], optional: [] },
        output_node: false,
      },
    }).replace('"__MINIMUM__"', '1e1000000')
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(nodeDefinitionsJson, { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { custom: 1e308 },
      loras: [],
    })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_INVALID',
      message: expect.stringContaining('minimum 1e1000000'),
    })
  })

  it.each([
    ['a numeric legacy candidate', [[1, 2, 3], {}], 2, 2],
    ['a boolean legacy candidate', [[true, false], {}], false, false],
    ['a null legacy candidate', [[null, 'value'], {}], null, null],
    ['an array legacy candidate', [[['a', 'b'], 'other'], {}], ['a', 'b'], ['a', 'b']],
    ['an object legacy candidate independent of key insertion order', [[{ a: 1, b: [2] }], {}], { b: [2], a: 1 }, { a: 1, b: [2] }],
    ['a mixed legacy candidate without string case folding', [['Exact', 1], {}], 'Exact', 'Exact'],
    ['a COMBO object option independent of key insertion order', ['COMBO', { options: [{ id: 1, labels: ['a'] }, 2] }], { labels: ['a'], id: 1 }, { id: 1, labels: ['a'] }],
    ['an array that is itself a single-select COMBO option', ['COMBO', { options: [['a', 'b'], 'other'] }], ['a', 'b'], ['a', 'b']],
    ['a scalar COMBO option when non-standard multi_select is true', ['COMBO', { options: ['a', 'b'], multi_select: true }], 'a', 'a'],
    ['a scalar COMBO option when non-standard multi_select is an object', ['COMBO', { options: ['a', 'b'], multi_select: { enabled: true } }], 'a', 'a'],
    ['an empty multiselect COMBO value', ['COMBO', { options: ['a', 'b'], multiselect: true }], [], []],
    ['every member of a multiselect COMBO', ['COMBO', { options: ['a', 'b', 'c'], multiselect: true }], ['a', 'c'], ['a', 'c']],
  ])('accepts %s through JSON-deep candidate matching', async (_label, inputDescriptor, suppliedValue, expectedValue) => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 44,
      type: 'ChoiceContractNode',
      mode: 0,
      inputs: [{ name: 'custom', type: 'COMBO', link: null, widget: { name: 'custom' } }],
      outputs: [],
      widgets_values: [null],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        ChoiceContractNode: {
          input: { required: { custom: inputDescriptor } },
          input_order: { required: ['custom'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { custom: suppliedValue as JsonValue },
      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 44)?.widgets_values).toEqual([expectedValue])
  })

  it.each([
    ['Foo', ['Foo', 'foo']],
    ['foo', ['Foo', 'foo']],
    ['same', ['same', 'same']],
  ])('accepts the exact string candidate %s despite case-fold or duplicate collisions', async (suppliedValue, choices) => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 44,
      type: 'ChoiceContractNode',
      mode: 0,
      inputs: [{ name: 'custom', type: 'COMBO', link: null, widget: { name: 'custom' } }],
      outputs: [],
      widgets_values: [choices[0]],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        ChoiceContractNode: {
          input: { required: { custom: [choices, {}] } },
          input_order: { required: ['custom'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { custom: suppliedValue },
      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 44)?.widgets_values).toEqual([suppliedValue])
  })

  it.each([
    ['a legacy candidate with a different JSON type', [[1, 2], {}], '2'],
    ['a mixed legacy string candidate that differs only by case', [['Exact', 1], {}], 'exact'],
    ['an absent COMBO object option', ['COMBO', { options: [{ id: 1 }] }], { id: 2 }],
    ['an array supplied when non-standard multi_select is true', ['COMBO', { options: ['a', 'b'], multi_select: true }], ['a']],
    ['an array supplied when non-standard multi_select is an object', ['COMBO', { options: ['a', 'b'], multi_select: { enabled: true } }], ['a']],
    ['a scalar supplied to a multiselect COMBO', ['COMBO', { options: ['a', 'b'], multiselect: true }], 'a'],
    ['an absent member supplied to a multiselect COMBO', ['COMBO', { options: ['a', 'b'], multiselect: true }], ['a', 'c']],
  ])('rejects %s', async (_label, inputDescriptor, suppliedValue) => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 44,
      type: 'ChoiceContractNode',
      mode: 0,
      inputs: [{ name: 'custom', type: 'COMBO', link: null, widget: { name: 'custom' } }],
      outputs: [],
      widgets_values: [null],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        ChoiceContractNode: {
          input: { required: { custom: inputDescriptor } },
          input_order: { required: ['custom'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { custom: suppliedValue as JsonValue },
      loras: [],
    })).rejects.toMatchObject({ code: 'GENERATION_PARAMETER_INVALID' })
  })

  it('distinguishes an exact unsafe numeric candidate from the rounded JavaScript number', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 44,
      type: 'ChoiceContractNode',
      mode: 0,
      inputs: [{ name: 'custom', type: 'COMBO', link: null, widget: { name: 'custom' } }],
      outputs: [],
      widgets_values: [1],
    })
    const nodeDefinitionsJson = JSON.stringify({
      ...objectInfo,
      ChoiceContractNode: {
        input: { required: { custom: [['__EXACT_CANDIDATE__'], {}] } },
        input_order: { required: ['custom'], optional: [] },
        output_node: false,
      },
    }).replace('"__EXACT_CANDIDATE__"', '9223372036854775807')
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(nodeDefinitionsJson, { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { custom: 9223372036854776000 },
      loras: [],
    })).rejects.toMatchObject({ code: 'GENERATION_PARAMETER_INVALID' })
  })

  it('distinguishes an unsafe numeric leaf nested inside an object and array candidate', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 44,
      type: 'ChoiceContractNode',
      mode: 0,
      inputs: [{ name: 'custom', type: 'COMBO', link: null, widget: { name: 'custom' } }],
      outputs: [],
      widgets_values: [null],
    })
    const nodeDefinitionsJson = JSON.stringify({
      ...objectInfo,
      ChoiceContractNode: {
        input: { required: { custom: ['COMBO', { options: [{ nested: ['__EXACT_CANDIDATE__'] }] }] } },
        input_order: { required: ['custom'], optional: [] },
        output_node: false,
      },
    }).replace('"__EXACT_CANDIDATE__"', '9223372036854775807')
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(nodeDefinitionsJson, { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { custom: { nested: [9223372036854776000] } },
      loras: [],
    })).rejects.toMatchObject({ code: 'GENERATION_PARAMETER_INVALID' })
  })

  it('allows a JSON-deep-equal no-op for an unpublished custom widget contract', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 45,
      type: 'UnpublishedContractNode',
      mode: 0,
      inputs: [{ name: 'custom', type: 'UNPUBLISHED_VALUE', link: null, widget: { name: 'custom' } }],
      outputs: [],
      widgets_values: [{ a: 1, b: [2] }],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        UnpublishedContractNode: {
          input: { required: { custom: ['UNPUBLISHED_VALUE', {}] } },
          input_order: { required: ['custom'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { custom: { b: [2], a: 1 } },
      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 45)?.widgets_values).toEqual([{ a: 1, b: [2] }])
  })

  it.each([
    ['a different object', { a: 2 }],
    ['an array', ['changed']],
    ['a scalar', 2],
  ])('rejects %s when an object widget contract is unpublished', async (_label, suppliedValue) => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 45,
      type: 'UnpublishedContractNode',
      mode: 0,
      inputs: [{ name: 'custom', type: 'UNPUBLISHED_VALUE', link: null, widget: { name: 'custom' } }],
      outputs: [],
      widgets_values: [{ a: 1 }],
    })
    const officialApiWorkflowCompiler = {
      compile: vi.fn(async input => ({
        apiWorkflow: input.runtimeProjection,
        cacheKey: 'test-cache-key',
        cacheStatus: 'miss' as const,
      })),
    }
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        UnpublishedContractNode: {
          input: { required: { custom: ['UNPUBLISHED_VALUE', {}] } },
          input_order: { required: ['custom'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
      officialApiWorkflowCompiler,
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { custom: suppliedValue as JsonValue },
      loras: [],
    })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_CONTRACT_UNSUPPORTED',
      message: expect.stringMatching(/45:UnpublishedContractNode\.custom.*UNPUBLISHED_VALUE/u),
    })
    expect(officialApiWorkflowCompiler.compile).not.toHaveBeenCalled()
  })

  it('rejects an object supplied for an unpublished array widget contract', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 45,
      type: 'UnpublishedContractNode',
      mode: 0,
      inputs: [{ name: 'custom', type: 'UNPUBLISHED_VALUE', link: null, widget: { name: 'custom' } }],
      outputs: [],
      widgets_values: [['value']],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        UnpublishedContractNode: {
          input: { required: { custom: ['UNPUBLISHED_VALUE', {}] } },
          input_order: { required: ['custom'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { custom: { 0: 'value' } },
      loras: [],
    })).rejects.toMatchObject({ code: 'GENERATION_PARAMETER_CONTRACT_UNSUPPORTED' })
  })

  it('validates dynamic-combo assignments against the final parent selection independent of parameter order', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 46,
      type: 'DynamicContractNode',
      mode: 0,
      inputs: [
        { name: 'dynamic', type: 'COMFY_DYNAMICCOMBO_V3', link: null, widget: { name: 'dynamic' } },
        { name: 'dynamic.value', type: 'FLOAT', link: null, widget: { name: 'dynamic.value' } },
        { name: 'dynamic.note', type: 'STRING', link: null, widget: { name: 'dynamic.note' } },
        { name: 'dynamic.method', type: 'COMBO', link: null, widget: { name: 'dynamic.method' } },
      ],
      outputs: [],
      widgets_values: ['integer', 5, '', 'a'],
      widgets_values_named: { dynamic: 'integer', 'dynamic.value': 5, 'dynamic.note': '', 'dynamic.method': 'a' },
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        DynamicContractNode: {
          input: { required: {
            dynamic: ['COMFY_DYNAMICCOMBO_V3', { options: [
              { key: 'integer', inputs: { required: { value: ['INT', { min: 0, max: 10 }] }, optional: {} } },
              { key: 'float', inputs: { required: {
                value: ['FLOAT', { min: 0, max: 1 }],
                method: ['COMBO', { options: ['a', 'b'] }],
              }, optional: { note: ['STRING', {}] } } },
            ] }],
          } },
          input_order: { required: ['dynamic'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { 'dynamic.value': 0.5, dynamic: 'float', 'dynamic.note': 'final', 'dynamic.method': 'b' },
      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 46)?.widgets_values).toEqual(['float', 0.5, 'final', 'b'])
    expect(compiled.apiWorkflow['46']).toMatchObject({ inputs: {
      dynamic: 'float',
      'dynamic.value': 0.5,
      'dynamic.note': 'final',
      'dynamic.method': 'b',
    } })
  })

  it.each([
    ['an absent parent key', 'missing', 1],
    ['a child value outside the selected branch range', 'float', 2],
  ])('rejects %s in a dynamic-combo final state', async (_label, parentValue, childValue) => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 46,
      type: 'DynamicContractNode',
      mode: 0,
      inputs: [
        { name: 'dynamic', type: 'COMFY_DYNAMICCOMBO_V3', link: null, widget: { name: 'dynamic' } },
        { name: 'dynamic.value', type: 'FLOAT', link: null, widget: { name: 'dynamic.value' } },
      ],
      outputs: [],
      widgets_values: ['float', 0.5],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        DynamicContractNode: {
          input: { required: {
            dynamic: ['COMFY_DYNAMICCOMBO_V3', { options: [
              { key: 'float', inputs: { required: { value: ['FLOAT', { min: 0, max: 1 }] }, optional: {} } },
            ] }],
          } },
          input_order: { required: ['dynamic'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { 'dynamic.value': childValue, dynamic: parentValue },
      loras: [],
    })).rejects.toMatchObject({ code: 'GENERATION_PARAMETER_INVALID' })
  })

  it('rejects an absent COMBO member in the selected dynamic-combo branch', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 46,
      type: 'DynamicContractNode',
      mode: 0,
      inputs: [
        { name: 'dynamic', type: 'COMFY_DYNAMICCOMBO_V3', link: null, widget: { name: 'dynamic' } },
        { name: 'dynamic.method', type: 'COMBO', link: null, widget: { name: 'dynamic.method' } },
      ],
      outputs: [],
      widgets_values: ['choice', 'a'],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        DynamicContractNode: {
          input: { required: {
            dynamic: ['COMFY_DYNAMICCOMBO_V3', { options: [
              { key: 'choice', inputs: { required: { method: ['COMBO', { options: ['a', 'b'] }] }, optional: {} } },
            ] }],
          } },
          input_order: { required: ['dynamic'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { 'dynamic.method': 'c' },
      loras: [],
    })).rejects.toMatchObject({ code: 'GENERATION_PARAMETER_INVALID' })
  })

  it('rejects a dynamic-combo branch whose required unconnected child is not serialized', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 46,
      type: 'DynamicContractNode',
      mode: 0,
      inputs: [{ name: 'dynamic', type: 'COMFY_DYNAMICCOMBO_V3', link: null, widget: { name: 'dynamic' } }],
      outputs: [],
      widgets_values: ['float'],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        DynamicContractNode: {
          input: { required: {
            dynamic: ['COMFY_DYNAMICCOMBO_V3', { options: [
              { key: 'float', inputs: { required: { value: ['FLOAT', { min: 0, max: 1 }] }, optional: {} } },
            ] }],
          } },
          input_order: { required: ['dynamic'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { dynamic: 'float' },
      loras: [],
    })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_INVALID',
      message: expect.stringContaining('dynamic.value'),
    })
  })

  it('rejects stale serialized children from an unselected dynamic-combo branch', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 46,
      type: 'DynamicContractNode',
      mode: 0,
      inputs: [{ name: 'dynamic', type: 'COMFY_DYNAMICCOMBO_V3', link: null, widget: { name: 'dynamic' } }],
      outputs: [],
      widgets_values: ['old', 'stale', 0.5],
      widgets_values_named: { dynamic: 'old', 'dynamic.old': 'stale', 'dynamic.value': 0.5 },
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        DynamicContractNode: {
          input: { required: {
            dynamic: ['COMFY_DYNAMICCOMBO_V3', { options: [
              { key: 'old', inputs: { required: { old: ['STRING', {}] }, optional: {} } },
              { key: 'float', inputs: { required: { value: ['FLOAT', { min: 0, max: 1 }] }, optional: {} } },
            ] }],
          } },
          input_order: { required: ['dynamic'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { dynamic: 'float', 'dynamic.value': 0.75 },
      loras: [],
    })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_INVALID',
      message: expect.stringContaining('dynamic.old'),
    })
  })

  it('rejects a connected child retained from an unselected dynamic-combo branch', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 47,
          type: 'FloatSource',
          mode: 0,
          inputs: [],
          outputs: [{ name: 'FLOAT', type: 'FLOAT', links: [20] }],
          widgets_values: [],
        },
        {
          id: 46,
          type: 'DynamicContractNode',
          mode: 0,
          inputs: [
            { name: 'dynamic', type: 'COMFY_DYNAMICCOMBO_V3', link: null, widget: { name: 'dynamic' } },
            { name: 'dynamic.old', type: 'FLOAT', link: 20, widget: { name: 'dynamic.old' } },
          ],
          outputs: [],
          widgets_values: ['old'],
        },
        ...workflow.nodes,
      ],
      links: [[20, 47, 0, 46, 1, 'FLOAT'], ...(workflow.links as JsonValue[])],
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        FloatSource: {
          input: { required: {}, optional: {} },
          input_order: { required: [], optional: [] },
          output_node: false,
        },
        DynamicContractNode: {
          input: { required: {
            dynamic: ['COMFY_DYNAMICCOMBO_V3', { options: [
              { key: 'old', inputs: { required: { old: ['FLOAT', {}] }, optional: {} } },
              { key: 'new', inputs: { required: {}, optional: {} } },
            ] }],
          } },
          input_order: { required: ['dynamic'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { dynamic: 'new' },
      loras: [],
    })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_INVALID',
      message: expect.stringContaining('dynamic.old'),
    })
  })

  it('rejects a dynamic-combo contract with duplicate or empty option keys as unsupported', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 46,
      type: 'DynamicContractNode',
      mode: 0,
      inputs: [{ name: 'dynamic', type: 'COMFY_DYNAMICCOMBO_V3', link: null, widget: { name: 'dynamic' } }],
      outputs: [],
      widgets_values: ['duplicate'],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        DynamicContractNode: {
          input: { required: {
            dynamic: ['COMFY_DYNAMICCOMBO_V3', { options: [
              { key: 'duplicate', inputs: { required: {}, optional: {} } },
              { key: 'duplicate', inputs: { required: {}, optional: {} } },
              { key: '', inputs: { required: {}, optional: {} } },
            ] }],
          } },
          input_order: { required: ['dynamic'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { dynamic: 'duplicate' },
      loras: [],
    })).rejects.toMatchObject({ code: 'GENERATION_PARAMETER_CONTRACT_UNSUPPORTED' })
  })

  it('rejects duplicate non-empty dynamic-combo option keys as unsupported', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 46,
      type: 'DynamicContractNode',
      mode: 0,
      inputs: [{ name: 'dynamic', type: 'COMFY_DYNAMICCOMBO_V3', link: null, widget: { name: 'dynamic' } }],
      outputs: [],
      widgets_values: ['duplicate'],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        DynamicContractNode: {
          input: { required: {
            dynamic: ['COMFY_DYNAMICCOMBO_V3', { options: [
              { key: 'duplicate', inputs: { required: {}, optional: {} } },
              { key: 'duplicate', inputs: { required: {}, optional: {} } },
            ] }],
          } },
          input_order: { required: ['dynamic'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { dynamic: 'duplicate' },
      loras: [],
    })).rejects.toMatchObject({ code: 'GENERATION_PARAMETER_CONTRACT_UNSUPPORTED' })
  })

  it.each([
    ['required', { optional: {} }],
    ['optional', { required: {} }],
  ])('rejects a dynamic-combo option without its %s child contract map', async (_missingMap, inputs) => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 46,
      type: 'DynamicContractNode',
      mode: 0,
      inputs: [{ name: 'dynamic', type: 'COMFY_DYNAMICCOMBO_V3', link: null, widget: { name: 'dynamic' } }],
      outputs: [],
      widgets_values: ['choice'],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        DynamicContractNode: {
          input: { required: {
            dynamic: ['COMFY_DYNAMICCOMBO_V3', { options: [{ key: 'choice', inputs }] }],
          } },
          input_order: { required: ['dynamic'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { dynamic: 'choice' },
      loras: [],
    })).rejects.toMatchObject({ code: 'GENERATION_PARAMETER_CONTRACT_UNSUPPORTED' })
  })

  it('recursively validates nested dynamic-combo branches against their final selections', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 46,
      type: 'DynamicContractNode',
      mode: 0,
      inputs: [
        { name: 'dynamic', type: 'COMFY_DYNAMICCOMBO_V3', link: null, widget: { name: 'dynamic' } },
        { name: 'dynamic.mode', type: 'COMFY_DYNAMICCOMBO_V3', link: null, widget: { name: 'dynamic.mode' } },
        { name: 'dynamic.mode.value', type: 'FLOAT', link: null, widget: { name: 'dynamic.mode.value' } },
      ],
      outputs: [],
      widgets_values: ['advanced', 'integer', 5],
    })
    const nestedDescriptor = ['COMFY_DYNAMICCOMBO_V3', { options: [
      { key: 'integer', inputs: { required: { value: ['INT', { min: 0, max: 10 }] }, optional: {} } },
      { key: 'float', inputs: { required: { value: ['FLOAT', { min: 0, max: 1 }] }, optional: {} } },
    ] }]
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        DynamicContractNode: {
          input: { required: {
            dynamic: ['COMFY_DYNAMICCOMBO_V3', { options: [
              { key: 'advanced', inputs: { required: { mode: nestedDescriptor }, optional: {} } },
            ] }],
          } },
          input_order: { required: ['dynamic'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { 'dynamic.mode.value': 0.25, 'dynamic.mode': 'float', dynamic: 'advanced' },
      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 46)?.widgets_values).toEqual(['advanced', 'float', 0.25])
  })

  it('allows an absent optional dynamic child and a connected required dynamic child', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 47,
          type: 'FloatSource',
          mode: 0,
          inputs: [],
          outputs: [{ name: 'FLOAT', type: 'FLOAT', links: [20] }],
          widgets_values: [],
        },
        {
          id: 46,
          type: 'DynamicContractNode',
          mode: 0,
          inputs: [
            { name: 'dynamic', type: 'COMFY_DYNAMICCOMBO_V3', link: null, widget: { name: 'dynamic' } },
            { name: 'dynamic.value', type: 'FLOAT', link: 20, widget: { name: 'dynamic.value' } },
          ],
          outputs: [],
          widgets_values: ['float'],
        },
        ...workflow.nodes,
      ],
      links: [[20, 47, 0, 46, 1, 'FLOAT'], ...(workflow.links as JsonValue[])],
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        FloatSource: {
          input: { required: {}, optional: {} },
          input_order: { required: [], optional: [] },
          output_node: false,
        },
        DynamicContractNode: {
          input: { required: {
            dynamic: ['COMFY_DYNAMICCOMBO_V3', { options: [
              { key: 'float', inputs: { required: { value: ['FLOAT', { min: 0, max: 1 }] }, optional: { note: ['STRING', {}] } } },
            ] }],
          } },
          input_order: { required: ['dynamic'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { dynamic: 'float' },
      loras: [],
    })

    expect(compiled.apiWorkflow['46']).toMatchObject({ inputs: { dynamic: 'float', 'dynamic.value': ['47', 0] } })
    expect(compiled.apiWorkflow['46']).not.toHaveProperty('inputs.dynamic.note')
  })

  it('rejects a live dynamic contract change that makes an existing child value invalid before any write', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 46,
      type: 'DynamicContractNode',
      mode: 0,
      inputs: [
        { name: 'dynamic', type: 'COMFY_DYNAMICCOMBO_V3', link: null, widget: { name: 'dynamic' } },
        { name: 'dynamic.value', type: 'FLOAT', link: null, widget: { name: 'dynamic.value' } },
      ],
      outputs: [],
      widgets_values: ['float', 5],
    })
    const officialApiWorkflowCompiler = {
      compile: vi.fn(async input => ({
        apiWorkflow: input.runtimeProjection,
        cacheKey: 'test-cache-key',
        cacheStatus: 'miss' as const,
      })),
    }
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        DynamicContractNode: {
          input: { required: {
            dynamic: ['COMFY_DYNAMICCOMBO_V3', { options: [
              { key: 'float', inputs: { required: { value: ['FLOAT', { min: 0, max: 1 }] }, optional: {} } },
            ] }],
          } },
          input_order: { required: ['dynamic'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
      officialApiWorkflowCompiler,
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { dynamic: 'float' },
      loras: [],
    })).rejects.toMatchObject({ code: 'GENERATION_PARAMETER_INVALID' })
    expect(officialApiWorkflowCompiler.compile).not.toHaveBeenCalled()
    expect(actual.nodes.find(node => node.id === 46)?.widgets_values).toEqual(['float', 5])
  })

  it.each([
    ['an absent live enum value', ['euler', 'lcm'], 'not-a-sampler'],
    ['a non-unique case-insensitive live enum value', ['lcm', 'LCM'], 'LcM'],
  ])('rejects %s before API Workflow submission', async (_label, choices, suppliedValue) => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 41,
      type: 'KSampler',
      mode: 0,
      inputs: [{ name: 'sampler_name', type: 'COMBO', link: null, widget: { name: 'sampler_name' } }],
      outputs: [],
      widgets_values: ['lcm'],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        KSampler: {
          input: { required: { sampler_name: [choices, {}] } },
          input_order: { required: ['sampler_name'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { sampler_name: suppliedValue },
      loras: [],
    })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_INVALID',
      message: `Generation parameter "sampler_name" for 41:KSampler.sampler_name received ${JSON.stringify(suppliedValue)}; allowed values ${JSON.stringify(choices)}. Correct the value and call generate_with_comfyui again.`,
    })
  })

  it('rejects a node-id suffix that does not identify a matching target', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 6,
      type: 'KSampler',
      mode: 0,
      inputs: [],
      outputs: [],
      widgets_values: [101, 'fixed'],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        KSampler: {
          input: { required: { seed: ['INT', { control_after_generate: true }] } },
          input_order: { required: ['seed'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { seed_999: 303 },
      loras: [],
    })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_TARGET_NOT_FOUND',
      message: expect.stringMatching(/seed_999.*999/u),
    })
  })

  it('rejects canonical and suffixed advanced parameters that claim the same target with different values', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 7,
      type: 'KSampler',
      mode: 0,
      inputs: [],
      outputs: [],
      widgets_values: [20],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        KSampler: {
          input: { required: { steps: ['INT', {}] } },
          input_order: { required: ['steps'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { steps: 21, steps_7: 22 },
      loras: [],
    })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_TARGET_AMBIGUOUS',
      message: expect.stringMatching(/steps.*steps_7|steps_7.*steps/u),
    })
  })

  it('normalizes and validates aliases before merging equal assignments to one target', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 41,
      type: 'KSampler',
      mode: 0,
      inputs: [{ name: 'sampler_name', type: 'COMBO', link: null, widget: { name: 'sampler_name' } }],
      outputs: [],
      widgets_values: ['euler'],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        KSampler: {
          input: { required: { sampler_name: [['euler', 'lcm'], {}] } },
          input_order: { required: ['sampler_name'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { sampler_name: 'LCM', sampler_name_41: 'lcm' },
      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 41)?.widgets_values).toEqual(['lcm'])
  })

  it('rejects an invalid alias before a valid assignment can merge into the same target', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 7,
      type: 'KSampler',
      mode: 0,
      inputs: [{ name: 'steps', type: 'INT', link: null, widget: { name: 'steps' } }],
      outputs: [],
      widgets_values: [20],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        KSampler: {
          input: { required: { steps: ['INT', { min: 1, max: 100 }] } },
          input_order: { required: ['steps'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { steps: 21, steps_7: 1.5 },
      loras: [],
    })).rejects.toMatchObject({ code: 'GENERATION_PARAMETER_INVALID' })
  })

  it('merges object aliases after JSON-deep normalization ignores key insertion order', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 45,
      type: 'KSampler',
      mode: 0,
      inputs: [{ name: 'sampler_name', type: 'UNPUBLISHED_VALUE', link: null, widget: { name: 'sampler_name' } }],
      outputs: [],
      widgets_values: [{ a: 1, b: [2] }],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        KSampler: {
          input: { required: { sampler_name: ['UNPUBLISHED_VALUE', {}] } },
          input_order: { required: ['sampler_name'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { sampler_name: { b: [2], a: 1 }, sampler_name_45: { a: 1, b: [2] } },
      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 45)?.widgets_values).toEqual([{ a: 1, b: [2] }])
  })

  it('uses the upstream sampling stage as the canonical unsuffixed parameter target', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 1,
          type: 'KSampler',
          mode: 0,
          inputs: [{ name: 'seed', type: 'INT', link: null, widget: { name: 'seed' } }],
          outputs: [{ name: 'LATENT', type: 'LATENT', links: [10] }],
          widgets_values: [101, 'fixed'],
        },
        {
          id: 2,
          type: 'KSampler',
          mode: 0,
          inputs: [
            { name: 'samples', type: 'LATENT', link: 10 },
            { name: 'seed', type: 'INT', link: null, widget: { name: 'seed' } },
          ],
          outputs: [],
          widgets_values: [202, 'fixed'],
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
      links: [[10, 1, 0, 2, 0, 'LATENT']],
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        KSampler: {
          input: { required: { seed: ['INT', { control_after_generate: true }] }, optional: { samples: ['LATENT'] } },
          input_order: { required: ['seed'], optional: ['samples'] },
          output_node: false,
        },
        SaveImage: fixtureOutputInfo,
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { seed: 303 },
      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 1)?.widgets_values).toEqual([303, 'fixed'])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 2)?.widgets_values).toEqual([202, 'fixed'])
  })

  it('resolves connected sampler controls through explicitly named upstream value widgets', async () => {
    const actual: UiWorkflow = {
      version: 0.4,
      nodes: [
        {
          id: 10,
          type: 'PrimitiveFloat',
          title: 'CFG',
          mode: 0,
          inputs: [],
          outputs: [{ name: 'FLOAT', type: 'FLOAT', links: [20] }],
          widgets_values: [1.8],
        },
        {
          id: 11,
          type: 'EasyInt',
          title: 'Batch Size',
          mode: 0,
          inputs: [],
          outputs: [{ name: 'INT', type: 'INT', links: [21] }],
          widgets_values: [1],
        },
        {
          id: 12,
          type: 'InputParameters',
          mode: 0,
          inputs: [],
          outputs: [{ name: 'sampler', type: 'COMBO', links: [22] }],
          widgets_values: ['euler'],
        },
        {
          id: 13,
          type: 'KSampler',
          mode: 0,
          inputs: [
            { name: 'cfg', type: 'FLOAT', link: 20, widget: { name: 'cfg' } },
            { name: 'sampler_name', type: 'COMBO', link: 22, widget: { name: 'sampler_name' } },
          ],
          outputs: [],
          widgets_values: [1.8, 'euler'],
        },
        {
          id: 14,
          type: 'EmptyLatentImage',
          mode: 0,
          inputs: [{ name: 'batch_size', type: 'INT', link: 21, widget: { name: 'batch_size' } }],
          outputs: [],
          widgets_values: [1],
        },
        ...workflow.nodes,
      ],
      links: [
        [20, 10, 0, 13, 0, 'FLOAT'],
        [21, 11, 0, 14, 0, 'INT'],
        [22, 12, 0, 13, 1, 'COMBO'],
        ...(workflow.links as JsonValue[]),
      ],
    }
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        PrimitiveFloat: {
          input: { required: { value: ['FLOAT', {}] } },
          input_order: { required: ['value'], optional: [] },
          output_node: false,
        },
        EasyInt: {
          input: { required: { value: ['INT', {}] } },
          input_order: { required: ['value'], optional: [] },
          output_node: false,
        },
        InputParameters: {
          input: { required: { sampler: [['euler', 'dpmpp_2m'], {}] } },
          input_order: { required: ['sampler'], optional: [] },
          output_node: false,
        },
        KSampler: {
          input: { required: { cfg: ['FLOAT', {}], sampler_name: [['euler', 'dpmpp_2m'], {}] } },
          input_order: { required: ['cfg', 'sampler_name'], optional: [] },
          output_node: false,
        },
        EmptyLatentImage: {
          input: { required: { batch_size: ['INT', {}] } },
          input_order: { required: ['batch_size'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { cfg: 5.5, batch_size: 2, sampler_name: 'dpmpp_2m' },
      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 10)?.widgets_values).toEqual([5.5])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 11)?.widgets_values).toEqual([2])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 12)?.widgets_values).toEqual(['dpmpp_2m'])
  })

  it('prefers the latent-construction batch size over an unrelated batch widget', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push(
      {
        id: 10,
        type: 'EmptyLatentImage',
        mode: 0,
        inputs: [{ name: 'batch_size', type: 'INT', link: null, widget: { name: 'batch_size' } }],
        outputs: [],
        widgets_values: [1],
      },
      {
        id: 11,
        type: 'BatchConsumer',
        mode: 0,
        inputs: [{ name: 'batch_size', type: 'INT', link: null, widget: { name: 'batch_size' } }],
        outputs: [],
        widgets_values: [4],
      },
    )
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        EmptyLatentImage: {
          input: { required: { batch_size: ['INT', {}] } },
          input_order: { required: ['batch_size'], optional: [] },
          output_node: false,
        },
        BatchConsumer: {
          input: { required: { batch_size: ['INT', {}] } },
          input_order: { required: ['batch_size'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { batch_size: 2 },
      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 10)?.widgets_values).toEqual([2])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 11)?.widgets_values).toEqual([4])
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
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        SeedNode: seedDefinition,
        KSampler: seedDefinition,
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { "seed": 101, "seed_6": 202 },

      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 5)?.widgets_values).toEqual([101, 'randomize'])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 6)?.widgets_values).toEqual([202, 'fixed'])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 7)?.widgets_values).toEqual([701, 'fixed'])
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 25)?.widgets_values).toEqual([801, 'fixed'])
  })

  it('reports the parameter id and candidate widgets when structural resolution is missing or ambiguous', async () => {
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(objectInfo), { status: 200 })),
    })
    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { "unknown_value": 'x' },

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
      instanceId: 'test-instance',
      workflow: ambiguous,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters: { "custom_value": 'changed' },

      loras: [],
    })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_TARGET_NOT_FOUND',
      message: expect.stringContaining('custom_value'),
    })
  })

  it('discovers active output nodes from live definitions and Workflow connections', async () => {
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(objectInfo), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [],
    })

    expect(compiled.activeOutputNodeIds).toEqual(['3'])
  })

  it('omits disconnected output nodes during output discovery', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push(
      {
        id: 4,
        type: 'ImageProducer',
        mode: 0,
        inputs: [],
        outputs: [],
        widgets_values: ['unused.png'],
      },
      {
        id: 5,
        type: 'SaveImage',
        mode: 0,
        inputs: [
          { name: 'images', type: 'IMAGE', link: null },
          { name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } },
        ],
        outputs: [],
        widgets_values: ['disconnected'],
      },
    )
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(objectInfo), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [],
    })

    expect(compiled.activeOutputNodeIds).toEqual(['3'])
    expect(compiled.apiWorkflow).not.toHaveProperty('5')
  })

  it('rejects a Workflow without an active output node', async () => {
    const missingImagesWorkflow = structuredClone(workflow)
    const saveNode = missingImagesWorkflow.nodes[2] as { inputs: Array<{ link: number | null }> }
    saveNode.inputs[0]!.link = null
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(objectInfo), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: missingImagesWorkflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [],
    })).rejects.toMatchObject({
      code: 'WORKFLOW_COMPILE_FAILED',
      message: 'Workflow does not contain an active output node.',
    })
  })

  it('uses the live BOOLEAN default when a serialized named widget contains an incompatible array', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 37,
      type: 'TriggerWord Toggle (LoraManager)',
      mode: 0,
      inputs: [],
      outputs: [],
      widgets_values: [true, false, [], [], ''],
      widgets_values_named: {
        group_mode: true,
        default_active: false,
        allow_strength_adjustment: [],
        toggle_trigger_words: [],
        orinalMessage: '',
      },
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        'TriggerWord Toggle (LoraManager)': {
          input: {
            required: {
              group_mode: ['BOOLEAN', { default: true }],
              default_active: ['BOOLEAN', { default: false }],
              allow_strength_adjustment: ['BOOLEAN', { default: false }],
            },
          },
          input_order: {
            required: ['group_mode', 'default_active', 'allow_strength_adjustment'],
            optional: [],
          },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [],
    })

    expect(compiled.apiWorkflow['37']).toMatchObject({
      inputs: {
        group_mode: true,
        default_active: false,
        allow_strength_adjustment: false,
      },
    })
  })

  it('rejects an incompatible serialized BOOLEAN when the live definition has no BOOLEAN default', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 37,
      type: 'BooleanNode',
      mode: 0,
      inputs: [],
      outputs: [],
      widgets_values: [[]],
      widgets_values_named: { enabled: [] },
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        BooleanNode: {
          input: { required: { enabled: ['BOOLEAN', {}] } },
          input_order: { required: ['enabled'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [],
    })).rejects.toMatchObject({
      code: 'WORKFLOW_COMPILE_FAILED',
      message: expect.stringContaining('no live BOOLEAN default'),
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
    const compiler = createCompiler({
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
      instanceId: 'test-instance',
      workflow: assetWorkflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
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
    const compiler = createCompiler({
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
      instanceId: 'test-instance',
      workflow: assetWorkflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
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
    const compiler = createCompiler({
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
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
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
    const compiler = createCompiler({
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
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [
        { id: '68', fileName: 'USNR_STYLE_ILL_V1_lokr3-000024.safetensors', weight: 1, triggerWords: ['usnr'] },
        { id: '69', fileName: 'GTHAN-EQ.safetensors', weight: 0.8, triggerWords: ['gthan'] },
      ],
    })

    const syntax = '<lora:wai\\USNR_STYLE_ILL_V1_lokr3-000024.safetensors:1> <lora:wai\\GTHAN-EQ.safetensors:0.8>'
    const structuredLoras = [
      { name: 'wai\\USNR_STYLE_ILL_V1_lokr3-000024.safetensors', strength: 1, clipStrength: 1, active: true },
      { name: 'wai\\GTHAN-EQ.safetensors', strength: 0.8, clipStrength: 0.8, active: true },
    ]
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 4)?.widgets_values).toEqual([
      { version: 1, textWidgetName: 'text' }, syntax, structuredLoras,
    ])
    expect(compiled.apiWorkflow['4']).toMatchObject({ inputs: { text: syntax, loras: structuredLoras } })
  })

  it('preserves template LoraManager text and structured LoRAs when the request selects no LoRA', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 4,
      type: 'Lora Loader (LoraManager)',
      mode: 0,
      properties: { __lm_widget_ids: ['__lm_autocomplete_meta_text', 'text', 'loras'] },
      inputs: [],
      outputs: [],
      widgets_values: [
        { version: 1, textWidgetName: 'text' },
        '<lora:wai\\template.safetensors:1>',
        [{ name: 'wai\\template.safetensors', strength: 1, clipStrength: 1, active: true }],
      ],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        'Lora Loader (LoraManager)': {
          input: { required: { model: ['MODEL'], text: ['AUTOCOMPLETE_TEXT_LORAS', {}] } },
          input_order: { required: ['model', 'text'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 4)?.widgets_values).toEqual([
      { version: 1, textWidgetName: 'text' },
      '<lora:wai\\template.safetensors:1>',
      [{ name: 'wai\\template.safetensors', strength: 1, clipStrength: 1, active: true }],
    ])
    expect(compiled.apiWorkflow['4']).toMatchObject({ inputs: {
      text: '<lora:wai\\template.safetensors:1>',
      loras: [{ name: 'wai\\template.safetensors', strength: 1, clipStrength: 1, active: true }],
    } })
  })

  it.each([
    ['standard and Power loaders', ['standard', 'power']],
    ['LoraManager and standard loaders', ['manager', 'standard']],
    ['multiple LoraManager loaders', ['manager', 'manager']],
  ] as const)('preserves empty-selection behavior for %s without reporting LoRA ambiguity', async (_label, routes) => {
    const actual = structuredClone(workflow)
    const routeList: readonly ('manager' | 'standard' | 'power')[] = routes
    const addedNodes = routeList.map((route, index): UiWorkflow['nodes'][number] => {
      const id = index + 4
      if (route === 'manager') {
        return {
          id,
          type: 'Lora Loader (LoraManager)',
          mode: 0,
          properties: { __lm_widget_ids: ['__lm_autocomplete_meta_text', 'text', 'loras'] },
          inputs: [],
          outputs: [],
          widgets_values: [
            { version: 1, textWidgetName: 'text' },
            `<lora:wai\\template-${id}.safetensors:1>`,
            [{ name: `wai\\template-${id}.safetensors`, strength: 1, clipStrength: 1, active: true }],
          ],
        }
      }
      if (route === 'standard') {
        return {
          id,
          type: 'LoraLoader',
          mode: 0,
          inputs: [],
          outputs: [],
          widgets_values: ['wai\\standard.safetensors', 0.5, 0.5],
        }
      }
      return {
        id,
        type: 'Power Lora Loader (rgthree)',
        mode: 0,
        inputs: [],
        outputs: [],
        widgets_values: [
          {},
          { type: 'PowerLoraLoaderHeaderWidget' },
          { on: true, lora: 'wai\\power.safetensors', strength: 0.7, strengthTwo: null },
          {},
          '',
        ],
      }
    })
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push(...addedNodes)
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        'Lora Loader (LoraManager)': {
          input: { required: { model: ['MODEL'], text: ['AUTOCOMPLETE_TEXT_LORAS', {}] } },
          input_order: { required: ['model', 'text'], optional: [] },
          output_node: false,
        },
        LoraLoader: {
          input: { required: {
            lora_name: [['wai\\standard.safetensors'], {}],
            strength_model: ['FLOAT', {}],
            strength_clip: ['FLOAT', {}],
          } },
          input_order: { required: ['lora_name', 'strength_model', 'strength_clip'], optional: [] },
          output_node: false,
        },
        'Power Lora Loader (rgthree)': {
          input: { required: { model: ['MODEL'], clip: ['CLIP'] } },
          input_order: { required: ['model', 'clip'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [],
    })

    for (const [index] of routeList.entries()) {
      const widgets = compiled.actualWorkflow.nodes.find(node => node.id === index + 4)?.widgets_values
      expect(widgets).toEqual(addedNodes[index]?.widgets_values)
    }
  })

  it('rejects an exact LoraManager node whose serialized loras widget identity is missing', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 4,
      type: 'Lora Loader (LoraManager)',
      mode: 0,
      properties: { __lm_widget_ids: ['__lm_autocomplete_meta_text', 'text'] },
      inputs: [],
      outputs: [],
      widgets_values: [{ version: 1, textWidgetName: 'text' }, ''],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        'Lora Loader (LoraManager)': {
          input: { required: { model: ['MODEL'], text: ['AUTOCOMPLETE_TEXT_LORAS', {}] } },
          input_order: { required: ['model', 'text'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [],
    })).rejects.toMatchObject({ code: 'COMFYUI_LORA_INPUT_INVALID' })
  })

  it('rejects an exact LoraManager node whose serialized widget identities are missing', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 4,
      type: 'Lora Loader (LoraManager)',
      mode: 0,
      properties: {},
      inputs: [],
      outputs: [],
      widgets_values: [''],
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        'Lora Loader (LoraManager)': {
          input: { required: { model: ['MODEL'], text: ['AUTOCOMPLETE_TEXT_LORAS', {}] } },
          input_order: { required: ['model', 'text'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [],
    })).rejects.toMatchObject({ code: 'COMFYUI_LORA_INPUT_INVALID' })
  })

  it.each([
    ['out-of-range', [{ version: 1, textWidgetName: 'text' }, '']],
    ['non-array', [{ version: 1, textWidgetName: 'text' }, '', { invalid: true }]],
  ] as const)('rejects an exact LoraManager node whose serialized loras widget value is %s', async (_label, widgetsValues) => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 4,
      type: 'Lora Loader (LoraManager)',
      mode: 0,
      properties: { __lm_widget_ids: ['__lm_autocomplete_meta_text', 'text', 'loras'] },
      inputs: [],
      outputs: [],
      widgets_values: widgetsValues,
    })
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        'Lora Loader (LoraManager)': {
          input: { required: { model: ['MODEL'], text: ['AUTOCOMPLETE_TEXT_LORAS', {}] } },
          input_order: { required: ['model', 'text'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [],
    })).rejects.toMatchObject({ code: 'COMFYUI_LORA_INPUT_INVALID' })
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
    const compiler = createCompiler({
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
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
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
    const compiler = createCompiler({
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
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
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
    const compiler = createCompiler({
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
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
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
    const compiler = createCompiler({
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
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
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
    const compiler = createCompiler({
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
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
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
    const compiler = createCompiler({
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
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [{ id: '68', fileName: 'selected.safetensors', weight: 1, triggerWords: [] }],
    })).rejects.toMatchObject({ code: 'COMFYUI_LORA_INPUT_AMBIGUOUS' })
  })

  it('does not reinterpret ordinary runtime parameters as structured LoRA selections', async () => {
    const actual = structuredClone(workflow)
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push({
      id: 4,
      type: 'LoraLoader',
      mode: 0,
      inputs: [],
      outputs: [],
      widgets_values: ['old.safetensors', 0.5, 0.5],
    })
    const compiler = createCompiler({
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
    const runtimeParameters = {
      lora_model: 'default.safetensors',
      lora_model_weight: 0.7,
    }

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      runtimeParameters,
      loras: [],
    })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_TARGET_NOT_FOUND',
      message: expect.stringContaining('lora_model'),
    })

    const structured = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [{ id: '68', fileName: 'selected.safetensors', weight: 1, triggerWords: ['selected'] }],
    })
    expect(structured.actualWorkflow.nodes.find(node => node.id === 4)?.widgets_values).toEqual([
      'wai/selected.safetensors', 1, 1,
    ])
  })

  it('reports a Workflow without an executable LoRA input before submitting it to ComfyUI', async () => {
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(objectInfo), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [{ id: '68', fileName: 'USNR_STYLE_ILL_V1_lokr3-000024.safetensors', weight: 1, triggerWords: ['usnr'] }],
    })).rejects.toMatchObject({ code: 'COMFYUI_LORA_INPUT_UNAVAILABLE' })
  })

  it('uses active LoRA capacity and leaves bypass loaders unchanged', async () => {
    const actual = structuredClone(workflow)
    const loraNode = (id: number, mode: number, fileName: string, weight: number): UiWorkflow['nodes'][number] => ({
      id,
      type: 'LoraLoaderModelOnly',
      mode,
      inputs: [
        { name: 'model', type: 'MODEL', link: null },
        { name: 'lora_name', type: 'COMBO', link: null, widget: { name: 'lora_name' } },
        { name: 'strength_model', type: 'FLOAT', link: null, widget: { name: 'strength_model' } },
      ],
      outputs: [{ name: 'MODEL', type: 'MODEL', links: [] }],
      widgets_values: [fileName, weight],
    })
    ;(actual.nodes as Array<UiWorkflow['nodes'][number]>).push(
      loraNode(4, 0, 'active.safetensors', 0.4),
      loraNode(5, 4, 'template.safetensors', 0.8),
    )
    const firstPath = 'Krea2-功能\\selected-first.safetensors'
    const secondPath = 'Krea2-功能\\selected-second.safetensors'
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        ...objectInfo,
        LoraLoaderModelOnly: {
          input: { required: {
            model: ['MODEL'],
            lora_name: [['active.safetensors', firstPath, secondPath], {}],
            strength_model: ['FLOAT', {}],
          } },
          input_order: { required: ['model', 'lora_name', 'strength_model'], optional: [] },
          output_node: false,
        },
      }), { status: 200 })),
    })

    const compiled = await compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },

      loras: [{ id: '68', fileName: 'selected-first.safetensors', weight: 0.65, triggerWords: [] }],
    })

    expect(compiled.actualWorkflow.nodes.find(node => node.id === 4)).toMatchObject({
      mode: 0,
      widgets_values: [firstPath, 0.65],
    })
    expect(compiled.actualWorkflow.nodes.find(node => node.id === 5)).toMatchObject({
      mode: 4,
      widgets_values: ['template.safetensors', 0.8],
    })
    expect(compiled.apiWorkflow['4']).toMatchObject({
      inputs: { lora_name: firstPath, strength_model: 0.65 },
    })
    expect(compiled.apiWorkflow).not.toHaveProperty('5')

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },

      loras: [
        { id: '68', fileName: 'selected-first.safetensors', weight: 0.65, triggerWords: [] },
        { id: '69', fileName: 'selected-second.safetensors', weight: 0.75, triggerWords: [] },
      ],
    })).rejects.toMatchObject({ code: 'COMFYUI_LORA_CAPACITY_EXCEEDED' })
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
    const compiler = createCompiler({
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
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
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
    const compiler = createCompiler({
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
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      model: { id: '1', fileName: 'selected.safetensors' },
      loras: [],
    })).rejects.toMatchObject({ code })
  })

  it('reports a Workflow without one unique executable model input', async () => {
    const compiler = createCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(objectInfo), { status: 200 })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
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
    const compiler = createCompiler({
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
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
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
    const compiler = createCompiler({
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
      instanceId: 'test-instance',
      workflow: actual,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      model: { id: '3', fileName: 'anima/selected.safetensors' },
      loras: [],
    })

    expect(compiled.apiWorkflow['4']).toMatchObject({ inputs: { unet_name: 'anima\\selected.safetensors' } })
  })

  it('aborts a live node-definition request at the configured timeout', async () => {
    const compiler = createCompiler({
      timeoutMs: 1,
      fetchImplementation: vi.fn<typeof fetch>(async (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
      })),
    })
    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [],
    })).rejects.toMatchObject({ code: 'COMFYUI_CONNECTION_FAILED' })
  })

  it.each(['before', 'during'] as const)('reports caller cancellation %s the node-definition request', async timing => {
    const controller = new AbortController()
    if (timing === 'before') controller.abort()
    const compiler = createCompiler({
      fetchImplementation: vi.fn<typeof fetch>(async (_url, init) => new Promise<Response>((_resolve, reject) => {
        const abort = () => reject(new DOMException('aborted', 'AbortError'))
        init?.signal?.addEventListener('abort', abort, { once: true })
        if (init?.signal?.aborted === true) abort()
        if (timing === 'during') queueMicrotask(() => controller.abort())
      })),
    })

    await expect(compiler.compile({
      instanceId: 'test-instance',
      workflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      loras: [],
      signal: controller.signal,
    })).rejects.toMatchObject({ code: 'COMFYUI_REQUEST_CANCELED' })
  })

  it('rejects invalid timeout, HTTP status and node-definition JSON', async () => {
    expect(() => createCompiler({ timeoutMs: 0 })).toThrow('timeout')
    await expect(createCompiler({
      fetchImplementation: vi.fn(async () => new Response('{}', { status: 503 })),
    }).compile({ instanceId: 'test-instance', workflow, connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null }, loras: [] }))
      .rejects.toMatchObject({ code: 'COMFYUI_HTTP_ERROR' })
    await expect(createCompiler({
      fetchImplementation: vi.fn(async () => new Response('{', { status: 200 })),
    }).compile({ instanceId: 'test-instance', workflow, connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null }, loras: [] }))
      .rejects.toMatchObject({ code: 'COMFYUI_PROTOCOL_ERROR' })
  })
})

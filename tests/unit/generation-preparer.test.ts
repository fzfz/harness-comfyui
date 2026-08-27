import { describe, expect, it, vi } from 'vitest'

import type { GenerationRequest } from '../../src/host/generation/generation-runtime.ts'
import {
  SourceGenerationPreparer,
  type ComfyInstanceSource,
  type ComfyTemplateBundle,
  type GenerationSource,
  type WorkflowCompiler,
} from '../../src/host/generation/source-preparer.ts'

const request: GenerationRequest = {
  title: '角色立绘',
  instanceId: '2',
  templateId: '34',
  model: {
    id: '1',
    fileName: 'waiIllustriousSDXL_v170.safetensors',
  },
  parameters: {
    positive_prompt: '1girl, white hair',
    width: 1024,
  },
  loras: [],
}

const instance: ComfyInstanceSource = {
  id: '2',
  title: 'ComfyUI',
  url: 'http://127.0.0.1:8188',
  credentialType: 'bearer',
  authorization: 'Bearer secret-token',
}

function template(expectedOutputNodeIds: readonly string[] | null = ['3']): ComfyTemplateBundle {
  return {
    id: '34',
    title: 'Anima Aesthetic 1.1｜文生图',
    revisionNumber: 7,
    workflowSha256: 'a'.repeat(64),
    configRevision: 2,
    dimensionStrategy: 'explicit',
    workflow: {
      version: 0.4,
      nodes: [
        { id: 2, type: 'CLIPTextEncode', widgets_values: ['old prompt', 512] },
        { id: 3, type: 'SaveImage', widgets_values: ['output'] },
      ],
      links: [],
    },
    parameters: [
      {
        parameterId: 'positive_prompt',
        kind: 'positive_prompt',
        valueType: 'string',
        required: true,
      },
      {
        parameterId: 'width',
        kind: 'width',
        valueType: 'integer',
        required: true,
        minimum: 64,
        maximum: 4096,
      },
    ],
    bindings: [
      { parameterId: 'positive_prompt', operation: 'replace_input', nodeId: '2', inputName: 'text', widgetIndex: 0 },
      { parameterId: 'width', operation: 'replace_input', nodeId: '2', inputName: 'width', widgetIndex: 1 },
    ],
    expectedOutputNodeIds,
  }
}

function source(bundle: ComfyTemplateBundle): GenerationSource {
  return {
    readInstance: vi.fn(async () => instance),
    readTemplate: vi.fn(async () => bundle),
  }
}

describe('SourceGenerationPreparer', () => {
  it('passes resolved parameters and advisory bindings to the compiler and excludes connection secrets from the source snapshot', async () => {
    const compile = vi.fn<WorkflowCompiler['compile']>(async input => ({
      actualWorkflow: input.workflow,
      apiWorkflow: {
        '3': { class_type: 'SaveImage', inputs: { source: '2' } },
        actual_prompt: Array.isArray(input.workflow.nodes[0]?.widgets_values)
          ? input.workflow.nodes[0]?.widgets_values[0] ?? null
          : null,
      },
      activeOutputNodeIds: ['3'],
    }))
    const preparer = new SourceGenerationPreparer({
      defaultInstanceId: '1',
      source: source(template()),
      compiler: { compile },
    })

    const prepared = await preparer.prepare(request)

    expect(prepared.connection).toEqual({
      url: 'http://127.0.0.1:8188',
      origin: 'http://127.0.0.1:8188',
      authorization: 'Bearer secret-token',
    })
    expect((prepared.actualWorkflow as unknown as { nodes: readonly unknown[] }).nodes[0]).toMatchObject({
      id: 2,
      widgets_values: ['old prompt', 512],
    })
    expect(prepared.sourceSnapshot).toEqual({
      instance: { id: '2', title: 'ComfyUI', origin: 'http://127.0.0.1:8188' },
      template: {
        id: '34',
        title: 'Anima Aesthetic 1.1｜文生图',
        revision_number: 7,
        workflow_sha256: 'a'.repeat(64),
        config_revision: 2,
        dimension_strategy: 'explicit',
        expected_output_node_ids: ['3'],
      },
    })
    expect(JSON.stringify(prepared.sourceSnapshot)).not.toContain('secret-token')
    expect(JSON.stringify(prepared.sourceSnapshot)).toContain('http://127.0.0.1:8188')
    expect(compile).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: '2',
      workflow: template().workflow,
      runtimeParameters: [
        {
          definition: expect.objectContaining({ parameterId: 'positive_prompt', kind: 'positive_prompt' }),
          value: '1girl, white hair',
        },
        {
          definition: expect.objectContaining({ parameterId: 'width', kind: 'width' }),
          value: 1024,
        },
      ],
      bindingHints: template().bindings,
      model: request.model,
      loras: [],
    }))
  })

  it('uses the compiler active output nodes when the source template does not declare an output-node filter', async () => {
    const compile = vi.fn<WorkflowCompiler['compile']>(async () => ({
      actualWorkflow: template(null).workflow,
      apiWorkflow: { '3': { class_type: 'SaveImage', inputs: {} } },
      activeOutputNodeIds: ['3'],
    }))
    const preparer = new SourceGenerationPreparer({
      defaultInstanceId: '1',
      source: source(template(null)),
      compiler: { compile },
    })

    const prepared = await preparer.prepare(request)

    expect(prepared.expectedOutputNodeIds).toEqual(['3'])
    expect(prepared.sourceSnapshot).toMatchObject({
      template: { expected_output_node_ids: null },
    })
    expect(compile).toHaveBeenCalledWith(expect.objectContaining({ expectedOutputNodeIds: null }))
  })

  it('rejects unknown runtime parameters instead of editing undeclared workflow values', async () => {
    const preparer = new SourceGenerationPreparer({
      defaultInstanceId: '1',
      source: source(template()),
      compiler: { compile: vi.fn() },
    })

    await expect(preparer.prepare({
      ...request,
      parameters: { ...request.parameters, sampler_name: 'euler' },
    })).rejects.toMatchObject({ code: 'GENERATION_PARAMETER_INVALID' })
  })

  it('does not turn metadata defaults into runtime overrides for omitted optional parameters', async () => {
    const compile = vi.fn<WorkflowCompiler['compile']>(async input => ({
      actualWorkflow: input.workflow,
      apiWorkflow: { '3': { class_type: 'SaveImage', inputs: {} } },
      activeOutputNodeIds: ['3'],
    }))
    const bundle: ComfyTemplateBundle = {
      ...template(),
      parameters: [
        template().parameters[0]!,
        {
          parameterId: 'negative_prompt',
          kind: 'negative_prompt',
          valueType: 'string',
          defaultValue: '',
          required: false,
        },
        {
          parameterId: 'width',
          kind: 'width',
          valueType: 'integer',
          defaultValue: 512,
          required: false,
        },
        {
          parameterId: 'height',
          kind: 'height',
          valueType: 'integer',
          defaultValue: 512,
          required: false,
        },
        {
          parameterId: 'seed',
          kind: 'seed',
          valueType: 'integer',
          defaultValue: 1022776966395948,
          required: false,
        },
      ],
    }
    const preparer = new SourceGenerationPreparer({
      defaultInstanceId: '1',
      source: source(bundle),
      compiler: { compile },
    })

    await preparer.prepare({
      ...request,
      parameters: { positive_prompt: '1girl, white hair' },
    })

    expect(compile).toHaveBeenCalledWith(expect.objectContaining({
      runtimeParameters: [{
        definition: expect.objectContaining({ parameterId: 'positive_prompt' }),
        value: '1girl, white hair',
      }],
    }))
  })

  it('requires an explicit request value for required parameters even when metadata declares a default', async () => {
    const bundle: ComfyTemplateBundle = {
      ...template(),
      parameters: [{
        parameterId: 'positive_prompt',
        kind: 'positive_prompt',
        valueType: 'string',
        defaultValue: 'metadata prompt',
        required: true,
      }],
    }
    const preparer = new SourceGenerationPreparer({
      defaultInstanceId: '1',
      source: source(bundle),
      compiler: { compile: vi.fn() },
    })

    await expect(preparer.prepare({ ...request, parameters: {} })).rejects.toMatchObject({
      code: 'GENERATION_PARAMETER_INVALID',
      message: 'Generation parameter "positive_prompt" is required.',
    })
  })
})

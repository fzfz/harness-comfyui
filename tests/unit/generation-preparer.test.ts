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
  it('passes request parameters directly to the compiler and excludes connection secrets from the source snapshot', async () => {
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
      runtimeParameters: request.parameters,
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

  it('does not require request parameters to be declared by Source metadata', async () => {
    const compile = vi.fn<WorkflowCompiler['compile']>(async input => ({
      actualWorkflow: input.workflow,
      apiWorkflow: { '3': { class_type: 'SaveImage', inputs: {} } },
      activeOutputNodeIds: ['3'],
    }))
    const preparer = new SourceGenerationPreparer({
      defaultInstanceId: '1',
      source: source(template()),
      compiler: { compile },
    })

    await preparer.prepare({
      ...request,
      parameters: { ...request.parameters, sampler_name: 'euler' },
    })

    expect(compile).toHaveBeenCalledWith(expect.objectContaining({
      runtimeParameters: { positive_prompt: '1girl, white hair', width: 1024, sampler_name: 'euler' },
    }))
  })
})

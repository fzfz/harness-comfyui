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

function template(): ComfyTemplateBundle {
  return {
    id: '34',
    title: 'Anima Aesthetic 1.1｜文生图',
    workflow: {
      version: 0.4,
      nodes: [
        { id: 2, type: 'CLIPTextEncode', widgets_values: ['old prompt', 512] },
        { id: 3, type: 'SaveImage', widgets_values: ['output'] },
      ],
      links: [],
    },
  }
}

function source(bundle: ComfyTemplateBundle): GenerationSource {
  return {
    readInstance: vi.fn(async () => instance),
    readTemplate: vi.fn(async () => bundle),
  }
}

function workflowCompiler(compile: WorkflowCompiler['compile']): WorkflowCompiler {
  return {
    compile,
    inspectRuntimeParameters: vi.fn(async () => ({ parameters: [], size_candidates: [] })),
  }
}

describe('SourceGenerationPreparer', () => {
  it('inspects the explicit template and instance through the Workflow compiler without using the default instance', async () => {
    const generationSource = source(template())
    const inspectRuntimeParameters = vi.fn<WorkflowCompiler['inspectRuntimeParameters']>(async () => ({
      parameters: [],
      size_candidates: [],
    }))
    const preparer = new SourceGenerationPreparer({
      defaultInstanceId: 'default-instance',
      source: generationSource,
      compiler: {
        inspectRuntimeParameters,
        compile: vi.fn<WorkflowCompiler['compile']>(),
      },
    })

    const result = await preparer.inspectRuntimeParameters({ templateId: 'brand-new-template', instanceId: '2' })

    expect(result).toEqual({ parameters: [], size_candidates: [] })
    expect(generationSource.readTemplate).toHaveBeenCalledWith('brand-new-template', undefined)
    expect(generationSource.readInstance).toHaveBeenCalledWith('2', undefined)
    expect(inspectRuntimeParameters).toHaveBeenCalledWith({
      instanceId: '2',
      workflow: template().workflow,
      connection: {
        url: 'http://127.0.0.1:8188',
        origin: 'http://127.0.0.1:8188',
        authorization: 'Bearer secret-token',
      },
      signal: undefined,
    })
  })

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
      compiler: workflowCompiler(compile),
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
    expect(compile.mock.calls[0]?.[0]).not.toHaveProperty('expectedOutputNodeIds')
  })

  it('uses the compiler active output nodes as the runtime output filter', async () => {
    const compile = vi.fn<WorkflowCompiler['compile']>(async () => ({
      actualWorkflow: template().workflow,
      apiWorkflow: { '3': { class_type: 'SaveImage', inputs: {} } },
      activeOutputNodeIds: ['3'],
    }))
    const preparer = new SourceGenerationPreparer({
      defaultInstanceId: '1',
      source: source(template()),
      compiler: workflowCompiler(compile),
    })

    const prepared = await preparer.prepare(request)

    expect(prepared.expectedOutputNodeIds).toEqual(['3'])
    expect(compile.mock.calls[0]?.[0]).not.toHaveProperty('expectedOutputNodeIds')
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
      compiler: workflowCompiler(compile),
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

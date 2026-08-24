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
  parameters: {
    positive_prompt: '1girl, white hair',
    width: 1024,
  },
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
  it('builds the Actual Workflow only through declared bindings and excludes connection secrets from the source snapshot', async () => {
    const compile = vi.fn<WorkflowCompiler['compile']>(async input => ({
      apiWorkflow: {
        '3': { class_type: 'SaveImage', inputs: { source: '2' } },
        actual_prompt: input.workflow.nodes[0]?.widgets_values[0] ?? null,
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
      widgets_values: ['1girl, white hair', 1024],
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
    expect(compile).toHaveBeenCalledOnce()
  })

  it('uses the compiler active output nodes when the source template does not declare an output-node filter', async () => {
    const compile = vi.fn<WorkflowCompiler['compile']>(async () => ({
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
})

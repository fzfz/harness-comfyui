import { describe, expect, it, vi } from 'vitest'
import { SourceGenerationPreparer, type UiWorkflow } from '../../src/host/generation/source-preparer.ts'
import { ComfyWorkflowCompiler } from '../../src/host/generation/workflow-compiler.ts'
import type { GenerationRequest } from '../../src/generation/submission-contract.ts'

function fixture({ required = true, active = true, muted = false, restoreFrontendDefault = false } = {}) {
  const workflow: UiWorkflow = {
    version: 0.4,
    nodes: [
      { id: 1, type: 'LoadImage', mode: muted ? 2 : 0, inputs: [], outputs: [{ name: 'IMAGE', type: 'IMAGE', links: active ? [1] : [] }], widgets_values: ['previous.png'] },
      { id: 2, type: 'BlankImage', mode: 0, inputs: [], outputs: [{ name: 'IMAGE', type: 'IMAGE', links: active ? [] : [1] }], widgets_values: [] },
      { id: 3, type: 'SaveImage', mode: 0, inputs: [{ name: 'images', type: 'IMAGE', link: 1 }], outputs: [], widgets_values: ['result'] },
    ],
    links: [[1, active ? 1 : 2, 0, 3, 0, 'IMAGE']],
  }
  const definitions = {
    LoadImage: { input: { required: required ? { image: ['STRING', {}] } : {}, optional: required ? {} : { image: ['STRING', {}] } }, input_order: { required: required ? ['image'] : [], optional: required ? [] : ['image'] }, output: ['IMAGE'], output_node: false },
    BlankImage: { input: { required: {} }, input_order: { required: [], optional: [] }, output: ['IMAGE'], output_node: false },
    SaveImage: { input: { required: { images: ['IMAGE', {}], filename_prefix: ['STRING', {}] } }, input_order: { required: ['images', 'filename_prefix'], optional: [] }, output_node: true },
  }
  const compiler = new ComfyWorkflowCompiler({
    fetchImplementation: vi.fn(async () => new Response(JSON.stringify(definitions), { status: 200 })),
    officialApiWorkflowCompiler: { compile: async input => {
      const apiWorkflow = structuredClone(input.runtimeProjection)
      if (restoreFrontendDefault) (apiWorkflow['1'] as { inputs: Record<string, string> }).inputs.image = 'frontend-default.png'
      return { apiWorkflow, cacheKey: 'image-selection', cacheStatus: 'miss' }
    } },
  })
  const images = {
    resolve: vi.fn(async () => ({ filePath: '/selected.png', filename: 'selected.png', mediaType: 'image/png' })),
    upload: vi.fn(async () => ({ name: 'uploaded.png', subfolder: 'workbench', type: 'input' as const })),
  }
  const preparer = new SourceGenerationPreparer({
    defaultInstanceId: '2', compiler, images,
    source: { readInstance: async () => ({ id: '2', title: 'fixture', url: 'http://127.0.0.1:8188', credentialType: 'none', authorization: null }), readTemplate: async () => ({ id: '27', title: 'Image selection', workflow }) },
  })
  const request: GenerationRequest = { title: 'Image selection', templateId: '27', instanceId: '2', model: null, parameters: {}, loras: [] }
  return { preparer, compiler, images, workflow, request }
}

describe('submitted Workflow image selection', () => {
  it('keeps an unselected image absent after the official compiler applies its template cache', async () => {
    const { preparer, request } = fixture({ required: false, restoreFrontendDefault: true })
    const prepared = await preparer.prepare(request)
    expect((prepared.apiWorkflow['1'] as { inputs: object }).inputs).not.toHaveProperty('image')
  })

  it.each([{ muted: false }, { muted: true }])('allows an unselected image outside the active output graph with $muted muting', async ({ muted }) => {
    const { preparer, compiler, workflow, request, images } = fixture({ active: false, muted })
    await expect(preparer.validateInput(request)).resolves.toBeUndefined()
    const description = await compiler.inspectRuntimeParameters({
      instanceId: '2', workflow, connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })
    expect(description.parameters.filter(parameter => parameter.kind === 'reference_image').every(parameter => !parameter.image_required)).toBe(true)
    const prepared = await preparer.prepare(request)
    if (!muted) expect((prepared.apiWorkflow['1'] as { inputs: object }).inputs).not.toHaveProperty('image')
    else expect(prepared.apiWorkflow).not.toHaveProperty('1')
    expect(images.upload).not.toHaveBeenCalled()
  })

  it('compiles an uploaded binding while keeping submitted file names absent', async () => {
    const { preparer, request, images, workflow } = fixture()
    const selected: GenerationRequest = { ...request,
      imageRefs: [{ image_ref_id: 'selected', source: { kind: 'uploaded_file', file_id: 'file-selected' }, purpose: 'both', reference_requirement: '' }],
      workflowImageBindings: [{ parameter_id: 'reference_image', image_ref_ids: ['selected'] }],
    }
    await expect(preparer.validateInput(selected)).resolves.toBeUndefined()
    expect(images.upload).not.toHaveBeenCalled()
    const prepared = await preparer.prepare(selected)
    expect(prepared.apiWorkflow['1']).toMatchObject({ inputs: { image: 'workbench/uploaded.png' } })
    expect(prepared.effectiveInput?.parameters).toEqual({ reference_image: 'workbench/uploaded.png' })
    expect(prepared.imageUploads).toEqual([{ image_ref_id: 'selected', parameter_id: 'reference_image', instance_id: '2', name: 'uploaded.png', subfolder: 'workbench', type: 'input' }])
    expect(selected.parameters).toEqual({})
    expect(workflow.nodes[0]?.widgets_values).toEqual(['previous.png'])
    expect(images.upload).toHaveBeenCalledOnce()
  })

  it('omits an unselected optional image instead of retaining the template file name', async () => {
    const { preparer, request, images } = fixture({ required: false })
    await expect(preparer.validateInput(request)).resolves.toBeUndefined()
    const prepared = await preparer.prepare(request)
    expect(prepared.apiWorkflow['1']).toMatchObject({ inputs: {} })
    expect((prepared.apiWorkflow['1'] as { inputs: object }).inputs).not.toHaveProperty('image')
    expect((prepared.actualWorkflow as UiWorkflow).nodes.find(node => node.id === 1)?.widgets_values).toEqual([null])
    expect(images.upload).not.toHaveBeenCalled()
  })

  it.each(['validateInput', 'prepare'] as const)('rejects an Agent-only reference bound to Workflow input during %s', async operation => {
    const { preparer, request } = fixture()
    await expect(preparer[operation]({ ...request,
      imageRefs: [{ image_ref_id: 'agent', source: { kind: 'uploaded_file', file_id: 'file-agent' }, purpose: 'agent', reference_requirement: '' }],
      workflowImageBindings: [{ parameter_id: 'reference_image', image_ref_ids: ['agent'] }],
    })).rejects.toMatchObject({ code: 'GENERATION_IMAGE_BINDING_INVALID' })
  })

  it.each(['validateInput', 'prepare'] as const)('rejects file names in submitted parameters during %s', async operation => {
    const { preparer, request } = fixture()
    for (const parameterId of ['reference_image', 'reference_image_1', 'image']) {
      await expect(preparer[operation]({ ...request, parameters: { [parameterId]: 'previous.png' } })).rejects.toMatchObject({
        code: 'GENERATION_IMAGE_BINDING_INVALID', inputPath: `parameters.${parameterId}`,
      })
    }
  })

  it.each(['validateInput', 'prepare'] as const)('requires an image binding for an active required input during %s', async operation => {
    const { preparer, request } = fixture()
    await expect(preparer[operation](request)).rejects.toMatchObject({
      code: 'GENERATION_IMAGE_BINDING_REQUIRED', inputPath: 'workflow_image_bindings.reference_image',
    })
  })
})

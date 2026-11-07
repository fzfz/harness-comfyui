import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GenerationRuntime } from '../../src/host/generation/generation-runtime.js'
import { SourceGenerationPreparer } from '../../src/host/generation/source-preparer.js'
import { GenerationInputValidationError } from '../../src/host/generation/workflow-compiler.js'
import { describe, expect, it, vi } from 'vitest'
import { createWorkbenchInputAdapter } from '../../src/host/workbench/input-adapter.js'
import { ComfyWorkflowCompiler } from '../../src/host/generation/workflow-compiler.js'
import type { UiWorkflow } from '../../src/host/generation/source-preparer.js'
import { flattenWorkflowRuntimeParameters, type WorkflowRuntimeSizeCandidate } from '../../src/generation/inspection-contract.ts'
import type { GenerationRequest } from '../../src/generation/submission-contract.js'
import type { JsonValue, TaskDraft } from '../../src/workbench/contract.js'

const draft: TaskDraft = { prompt_input: { positive_prompt: 'rain on glass', negative_prompt: '' }, generation_input: { title: 'rain', instance_id: '1', template_id: '2', model: null, parameters: {}, loras: [] }, context_refs: [], base_model_id: null }
const workflow: UiWorkflow = { version: 0.4, nodes: [
  { id: 1, type: 'Generator', mode: 0, inputs: [{ name: 'width', type: 'INT', link: null, widget: { name: 'width' } }, { name: 'steps', type: 'INT', link: null, widget: { name: 'steps' } }, { name: 'sampler_name', type: 'COMBO', link: null, widget: { name: 'sampler_name' } }], outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [1] }], widgets_values: [512, 5, 'euler'] },
  { id: 2, type: 'SaveImage', mode: 0, inputs: [{ name: 'images', type: 'IMAGE', link: 1 }, { name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } }], outputs: [], widgets_values: ['test'] },
], links: [[1, 1, 0, 2, 0, 'IMAGE']] }
const definitions = {
  Generator: { input: { required: { width: ['INT', { min: 64, max: 2048 }], steps: ['INT', { min: 1, max: 50 }], sampler_name: [['euler', 'ddim'], {}] } }, input_order: { required: ['width', 'steps', 'sampler_name'], optional: [] }, output_node: false },
  SaveImage: { input: { required: { images: ['IMAGE'], filename_prefix: ['STRING', {}] } }, input_order: { required: ['images', 'filename_prefix'], optional: [] }, output_node: true },
}

const sizes: { candidate: WorkflowRuntimeSizeCandidate; defaults: Record<string, JsonValue> }[] = [
  { candidate: { candidate_id: 'wh', representation: 'width_height', width: { parameter_id: 'width_66', kind: 'width', value_type: 'integer', current_value: 1024 }, height: { parameter_id: 'height_66', kind: 'height', value_type: 'integer', current_value: 1536 } }, defaults: { width_66: 1024, height_66: 1536 } },
  { candidate: { candidate_id: 'ar', representation: 'aspect_ratio_megapixels', aspect_ratio: { parameter_id: 'aspect_ratio_3', kind: 'aspect_ratio', value_type: 'choice', current_value: '2:3', allowed_values: ['2:3'] }, megapixels: { parameter_id: 'megapixels_3', kind: 'megapixels', value_type: 'number', current_value: 1.5 } }, defaults: { aspect_ratio_3: '2:3', megapixels_3: 1.5 } },
  { candidate: { candidate_id: 'preset', representation: 'resolution_preset', parameter: { parameter_id: 'resolution_preset_7', kind: 'resolution_preset', value_type: 'choice', current_value: 'portrait', allowed_values: ['portrait'] }, mapped_options: [{ value: 'portrait', width: 1024, height: 1536 }], unmapped_values: [] }, defaults: { resolution_preset_7: 'portrait' } },
]

describe('workbench generation input adapter', () => {
  it.each(sizes)('includes $candidate.representation fields in parameter admission and template defaults', async ({ candidate, defaults }) => {
    const description = { parameters: [{ parameter_id: 'positive_prompt_9', kind: 'positive_prompt' as const, value_type: 'string' as const, current_value: 'template prompt' }], size_candidates: [candidate] }
    const validate = vi.fn(async (_request: GenerationRequest) => {})
    const adapter = createWorkbenchInputAdapter({ runtime: { inspectTemplateRuntimeParameters: async () => description, validateGenerationRequest: validate }, catalog: { details: vi.fn(), resolveGenerationModel: vi.fn(), resolveLora: vi.fn(), resolveTemplate: async () => ({ id: '2', title: 'template', base_model_id: '5', model_id: null }) } })
    expect(await adapter.parameterIds(draft.generation_input)).toEqual(['positive_prompt_9', ...Object.keys(defaults)])
    await adapter.validateParameters(draft.generation_input, defaults)
    expect(validate.mock.calls[0]![0].parameters).toEqual(defaults)
    const selected = await adapter.resolveResourceRefs([{ kind: 'comfyui-template', id: '2' }], draft)
    expect(selected.generation_input.parameters).toEqual({ positive_prompt_9: 'template prompt', ...defaults })
    expect(flattenWorkflowRuntimeParameters({ parameters: description.parameters, size_candidates: [candidate, candidate] }).map(parameter => parameter.parameter_id)).toEqual(['positive_prompt_9', ...Object.keys(defaults)])
  })

  it('uses the real compiler parameter contract without invoking official export or random seed materialization', async () => {
    const official = vi.fn(async () => { throw new Error('preflight must not export') })
    const random = vi.fn(() => 123)
    const compiler = new ComfyWorkflowCompiler({ fetchImplementation: vi.fn(async () => new Response(JSON.stringify(definitions))), officialApiWorkflowCompiler: { compile: official }, createRandomSeed: random })
    const input = { instanceId: '1', workflow, connection: { url: 'http://comfy.test', origin: 'http://comfy.test', authorization: null }, runtimeParameters: { width_1: 768, steps_1: 10, sampler_name_1: 'ddim' }, model: null, loras: [] }
    await expect(compiler.validateInput(input)).resolves.toBeUndefined()
    for (const parameters of [{ width_1: 1 }, { steps_1: 1.5 }, { sampler_name_1: 'missing' }, { width_404: 512 }] as Record<string, JsonValue>[]) await expect(compiler.validateInput({ ...input, runtimeParameters: parameters })).rejects.toHaveProperty('code')
    expect(official).not.toHaveBeenCalled(); expect(random).not.toHaveBeenCalled()
    expect(workflow.nodes[0]!.widgets_values).toEqual([512, 5, 'euler'])
  })

  it('restores actual prompt fields and model classification before preparing reused generation input', async () => {
    const description = { parameters: [{ parameter_id: 'positive_prompt_9', kind: 'positive_prompt' as const, value_type: 'string' as const, current_value: 'template positive' }, { parameter_id: 'negative_prompt_10', kind: 'negative_prompt' as const, value_type: 'string' as const, current_value: 'template negative' }], size_candidates: [sizes[0]!.candidate] }
    let templateModel: string | null = '7'
    const adapter = createWorkbenchInputAdapter({ runtime: { inspectTemplateRuntimeParameters: async () => description, validateGenerationRequest: async () => {} }, catalog: { details: vi.fn(), resolveLora: vi.fn(), resolveGenerationModel: async id => ({ id, file_name: 'model.safetensors', base_model_id: id === '3' ? '5' : '6', description: '', usage: '', skill_name: null }), resolveTemplate: async () => ({ id: '2', title: 'template', base_model_id: '9', model_id: templateModel }) } })
    const input = { ...draft.generation_input, model: { id: '3', file_name: 'model.safetensors' }, parameters: { positive_prompt_9: 'candidate warm glass', width_66: 1024 }, title: 'candidate' }
    const restored = await adapter.resolveGenerationDraft(input, [{ kind: 'character', id: '90071992547409931234' }])
    expect(restored).toEqual({ generation_input: input, prompt_input: { positive_prompt: 'candidate warm glass', negative_prompt: 'template negative' }, base_model_id: '5', context_refs: [{ kind: 'character', id: '90071992547409931234' }] })
    expect((await adapter.prepareGenerationInput(restored)).parameters).toEqual({ positive_prompt_9: 'candidate warm glass', negative_prompt_10: 'template negative', width_66: 1024 })
    expect((await adapter.resolveGenerationDraft({ ...input, model: null }, [])).base_model_id).toBe('6')
    templateModel = null
    expect((await adapter.resolveGenerationDraft({ ...input, model: null, parameters: {} }, [])).base_model_id).toBe('9')
    await expect(adapter.resolveGenerationDraft({ ...input, parameters: { positive_prompt_9: 1 } }, [])).rejects.toMatchObject({ issues: [{ path: 'generation_input.parameters.positive_prompt_9' }] })
  })

  it('preflights instance model and LoRA slots and reports structured resource paths', async () => {
    const resourceWorkflow = structuredClone(workflow)
    const generator = resourceWorkflow.nodes[0]! as Record<string, JsonValue>
    generator.inputs = [...generator.inputs as JsonValue[], { name: 'ckpt_name', type: 'COMBO', link: null, widget: { name: 'ckpt_name' } }, { name: 'lora_name', type: 'COMBO', link: null, widget: { name: 'lora_name' } }, { name: 'strength_model', type: 'FLOAT', link: null, widget: { name: 'strength_model' } }]
    generator.widgets_values = [...generator.widgets_values as JsonValue[], 'model.safetensors', 'glass.safetensors', 0.7]
    const resourceDefinitions = { ...definitions, Generator: { ...definitions.Generator, input: { required: { ...definitions.Generator.input.required, ckpt_name: [['model.safetensors'], {}], lora_name: [['glass.safetensors'], {}], strength_model: ['FLOAT', { min: -20, max: 20 }] } }, input_order: { required: ['width', 'steps', 'sampler_name', 'ckpt_name', 'lora_name', 'strength_model'], optional: [] } } }
    const official = vi.fn(async () => { throw new Error('preflight must not export') })
    const compiler = new ComfyWorkflowCompiler({ fetchImplementation: vi.fn(async () => new Response(JSON.stringify(resourceDefinitions))), officialApiWorkflowCompiler: { compile: official } })
    const input = { instanceId: '1', workflow: resourceWorkflow, connection: { url: 'http://comfy.test', origin: 'http://comfy.test', authorization: null }, runtimeParameters: {}, model: { id: '3', fileName: 'model.safetensors' }, loras: [{ id: '4', fileName: 'glass.safetensors', weight: 0.8, triggerWords: ['glass'] }] }
    await expect(compiler.validateInput(input)).resolves.toBeUndefined()
    await expect(compiler.validateInput({ ...input, model: { id: '3', fileName: 'missing.safetensors' } })).rejects.toMatchObject({ inputPath: 'model' })
    await expect(compiler.validateInput({ ...input, loras: [{ ...input.loras[0]!, fileName: 'missing.safetensors' }] })).rejects.toMatchObject({ inputPath: 'loras' })
    expect(official).not.toHaveBeenCalled()
  })

  it('forwards runtime preflight through the actual source preparer without accepting a Run', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'workbench-preflight-'))
    const database = new DatabaseSync(':memory:')
    const official = vi.fn(async () => { throw new Error('preflight must not export') })
    const compiler = new ComfyWorkflowCompiler({ fetchImplementation: vi.fn(async () => new Response(JSON.stringify(definitions))), officialApiWorkflowCompiler: { compile: official } })
    const source = { readTemplate: vi.fn(async () => ({ id: '2', title: 'template', workflow })), readInstance: vi.fn(async () => ({ id: '1', title: 'instance', url: 'http://comfy.test', credentialType: 'none' as const, authorization: null })) }
    const preparer = new SourceGenerationPreparer({ defaultInstanceId: '1', source, compiler })
    const runtime = new GenerationRuntime({ database, preparer, runRepositoryFile: join(directory, 'runs.sqlite'), runDirectory: join(directory, 'runs'), savedMediaDirectory: join(directory, 'media') })
    try {
      const request = { title: 'rain', instanceId: '1', templateId: '2', model: null, loras: [], parameters: { width_1: 512 } }
      await runtime.validateGenerationRequest(request)
      expect(source.readTemplate).toHaveBeenCalledWith('2', undefined)
      expect(source.readInstance).toHaveBeenCalledWith('1', undefined)
      await expect(runtime.validateGenerationRequest({ ...request, parameters: { width_1: 2 } })).rejects.toMatchObject({ inputPath: 'parameters.width_1' })
      await expect(runtime.validateGenerationRequest(request, AbortSignal.abort())).rejects.toBeDefined()
      expect(official).not.toHaveBeenCalled()
      expect(runtime.queryRuns({ workspaceId: 'workspace', sessionId: 'session' })).toEqual([])
    } finally { runtime.close(); database.close(); rmSync(directory, { recursive: true, force: true }) }
  })

  it('resolves all resource classes using catalog files and template defaults while preserving existing selections', async () => {
    const catalog = { details: vi.fn(async () => ({} as never)), resolveGenerationModel: vi.fn(async (id: string) => ({ id, file_name: 'model.safetensors', base_model_id: '5', description: '', usage: '', skill_name: null })), resolveLora: vi.fn(async (id: string) => ({ id, file_name: 'glass.safetensors', weight: 0.7, trigger_words: ['glass'], base_model_id: '5', model_id: '3', description: '', usage: '' })), resolveTemplate: vi.fn(async (id: string) => ({ id, title: 'template', base_model_id: '5', model_id: '3' })) }
    const adapter = createWorkbenchInputAdapter({ runtime: { inspectTemplateRuntimeParameters: async () => ({ parameters: [{ parameter_id: 'width_1', kind: 'width', value_type: 'integer', current_value: 512 }], size_candidates: [] }), validateGenerationRequest: async () => {} }, catalog })
    const current = structuredClone(draft); current.generation_input.loras = [{ id: '4', file_name: 'old.safetensors', weight: 1, trigger_words: [] }]; current.context_refs = [{ kind: 'character', id: '7' }, { kind: 'style', id: '8' }]
    const resolved = await adapter.resolveResourceRefs([{ kind: 'model', id: '3' }, { kind: 'lora', id: '4' }, { kind: 'comfyui-template', id: '2' }, { kind: 'character', id: '7' }], current)
    expect(resolved).toMatchObject({ base_model_id: '5', context_refs: [{ kind: 'style', id: '8' }, { kind: 'character', id: '7' }], generation_input: { model: { id: '3', file_name: 'model.safetensors' }, parameters: { width_1: 512 }, loras: [{ id: '4', file_name: 'glass.safetensors', weight: 0.7, trigger_words: ['glass'] }] } })
    const unselected = await adapter.resolveResourceRefs([{ kind: 'comfyui-template', id: '2' }], { ...draft, generation_input: { ...draft.generation_input, instance_id: null } })
    expect(unselected.base_model_id).toBe('5')
    expect(await adapter.parameterIds(draft.generation_input)).toEqual(['width_1'])
    await adapter.validateReferences([{ kind: 'work', id: '6' }])
    expect(current.generation_input.loras[0]!.file_name).toBe('old.safetensors')
  })

  it('reports catalog failures, filename mismatches and runtime field errors at the published artifact path', async () => {
    let failure: unknown
    const runtime = { inspectTemplateRuntimeParameters: async () => ({ parameters: [{ parameter_id: 'width_1', kind: 'width' as const, value_type: 'integer' as const, current_value: 512 }], size_candidates: [] }), validateGenerationRequest: async () => { if (failure) throw failure } }
    const catalog = { details: vi.fn(async () => ({} as never)), resolveGenerationModel: vi.fn(async () => ({ id: '3', file_name: 'model.safetensors', base_model_id: '5', description: '', usage: '', skill_name: null })), resolveLora: vi.fn(async () => ({ id: '4', file_name: 'glass.safetensors', weight: 0.7, trigger_words: [], base_model_id: '5', model_id: '3', description: '', usage: '' })), resolveTemplate: vi.fn(async () => ({ id: '2', title: 'template', base_model_id: '5', model_id: '3' })) }
    const adapter = createWorkbenchInputAdapter({ runtime, catalog })
    const input = { ...draft.generation_input, model: { id: '3', file_name: 'model.safetensors' }, loras: [{ id: '4', file_name: 'glass.safetensors', weight: 0.7, trigger_words: [] }] }
    await adapter.validateGenerationInput(input)
    await expect(adapter.validateGenerationInput({ ...input, model: { id: '3', file_name: 'stale' } }, [], 'artifact.generation_input')).rejects.toMatchObject({ issues: [{ path: 'artifact.generation_input.model.file_name' }] })
    await expect(adapter.validateGenerationInput({ ...input, loras: [{ ...input.loras[0]!, file_name: 'stale' }] }, [], 'artifact.generation_input')).rejects.toMatchObject({ issues: [{ path: 'artifact.generation_input.loras.0.file_name' }] })
    failure = new GenerationInputValidationError('GENERATION_PARAMETER_INVALID', 'invalid width', 'parameters.width_1')
    await expect(adapter.validateParameters(input, { width_1: 2 })).rejects.toMatchObject({ issues: [{ path: 'artifact.parameters.width_1' }] })
    failure = new Error('instance offline')
    await expect(adapter.validateGenerationInput(input, [], 'artifact.candidate.generation_input')).rejects.toMatchObject({ issues: [{ path: 'artifact.candidate.generation_input' }] })
    failure = 'disconnected'
    await expect(adapter.validateGenerationInput(input)).rejects.toMatchObject({ issues: [{ message: 'disconnected' }] })
    catalog.details.mockRejectedValueOnce(new Error('missing character'))
    await expect(adapter.validateGenerationInput(input, [{ kind: 'character', id: '9' }], 'artifact.generation_input')).rejects.toMatchObject({ issues: [{ path: 'artifact.context_refs.0.id' }] })
    catalog.resolveTemplate.mockRejectedValueOnce('missing template')
    await expect(adapter.validateGenerationInput(input)).rejects.toMatchObject({ issues: [{ path: 'generation_input.template_id', message: 'missing template' }] })
    catalog.details.mockRejectedValueOnce('missing work')
    await expect(adapter.validateReferences([{ kind: 'work', id: '9' }])).rejects.toMatchObject({ issues: [{ path: 'context_refs.0.id', message: 'missing work' }] })
  })

  it('requires each nonempty prompt to have one actual template target', async () => {
    const runtime = { inspectTemplateRuntimeParameters: vi.fn(async () => ({ parameters: [], size_candidates: [] })), validateGenerationRequest: vi.fn(async () => {}) }
    const adapter = createWorkbenchInputAdapter({ runtime, catalog: { details: vi.fn(), resolveGenerationModel: vi.fn(), resolveLora: vi.fn(), resolveTemplate: vi.fn() } })
    await expect(adapter.prepareGenerationInput(draft)).rejects.toMatchObject({ issues: [{ path: 'prompt_input.positive_prompt' }] })
    await expect(adapter.prepareGenerationInput({ ...draft, generation_input: { ...draft.generation_input, instance_id: null } })).rejects.toMatchObject({ code: 'WORKBENCH_TEMPLATE_REQUIRED' })
  })

  it('maps prompts to inspected parameter ids and delegates proposed parameter values to runtime validation', async () => {
    const validate = vi.fn(async (_request: GenerationRequest) => {})
    const adapter = createWorkbenchInputAdapter({ runtime: { inspectTemplateRuntimeParameters: async () => ({ parameters: [{ parameter_id: 'positive_prompt_9', kind: 'positive_prompt', value_type: 'string', current_value: '' }, { parameter_id: 'width_1', kind: 'width', value_type: 'integer', current_value: 512, minimum: 64, maximum: 2048 }], size_candidates: [] }), validateGenerationRequest: validate }, catalog: { details: vi.fn(async () => ({} as never)), resolveGenerationModel: vi.fn(), resolveLora: vi.fn(), resolveTemplate: vi.fn() } })
    const prepared = await adapter.prepareGenerationInput(draft)
    expect(prepared.parameters).toEqual({ positive_prompt_9: 'rain on glass' })
    await adapter.validateParameters(prepared, { width_1: 1024 }, 'artifact.parameters')
    expect(validate.mock.calls[0]![0]).toMatchObject({ parameters: { positive_prompt_9: 'rain on glass', width_1: 1024 } })
    await expect(adapter.validateParameters(prepared, { width_404: 512 }, 'artifact.parameters')).rejects.toMatchObject({ issues: [{ path: 'artifact.parameters.width_404' }] })
  })
})

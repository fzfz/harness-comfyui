import { ContractError, type JsonValue } from '#contracts'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GenerationRuntime, GenerationRuntimeError } from '../../src/host/generation/generation-runtime.js'
import { SourceGenerationPreparer } from '../../src/host/generation/source-preparer.js'
import { GenerationInputValidationError } from '../../src/host/generation/workflow-compiler.js'
import { describe, expect, it, vi } from 'vitest'
import { createWorkbenchInputAdapter } from '../../src/host/workbench/input-adapter.js'
import { ComfyWorkflowCompiler } from '../../src/host/generation/workflow-compiler.js'
import type { UiWorkflow } from '../../src/host/generation/source-preparer.js'
import { flattenWorkflowRuntimeParameters, type WorkflowRuntimeSizeCandidate } from '../../src/generation/inspection-contract.ts'
import type { GenerationRequest } from '../../src/generation/submission-contract.js'
import type { TaskDraft } from '../../src/workbench/contract.js'

import { CATALOG_PRESENTATION, parseCatalogDetails, type CatalogDetailsRequest } from '../../src/catalog/details-schema.ts'

function catalogDetails({ kind, id }: CatalogDetailsRequest) {
  const context = {
    model: { kind: 'model', id, file_name: 'model.safetensors' },
    lora: { kind: 'lora', id, file_name: 'glass.safetensors' },
    work: { kind: 'work', id, name: 'Work' },
    character: { kind: 'character', id, work_name: 'Work', character_name: 'Character', prompt_text: 'character' },
    style: { kind: 'style', id, name: 'Style', prompt_text: 'style' },
    'prompt-term': { kind: 'prompt-term', id, tag: 'rain' },
    'artist-string': { kind: 'artist-string', id, title: 'Artists', prompt_text: '@artist' },
    'comfyui-template': { kind: 'comfyui-template', id, title: 'Template' },
  }[kind]
  return parseCatalogDetails({ kind, id, item: {
    context, baseModelId: kind === 'model' ? '5' : null, modelId: null, label: 'Catalog item', subtitle: '', coverUrl: null, sampleImageUrls: [],
  }, fields: CATALOG_PRESENTATION.kinds[kind].details.map(key => ({ key, value: key === 'id' ? id : null })) })
}
const draft: TaskDraft = {
  prompt_resource_refs: [],
  parameter_mapping: null, prompt_input: { positive_prompt: 'rain on glass', negative_prompt: '' }, generation_input: { title: 'rain', instance_id: '1', template_id: '2', model: null, parameters: {}, loras: [] }, instructions: '', reference_task_ids: [], reference_run_ids: [], reference_experiences: [], image_refs: [], workflow_image_bindings: [], base_model_id: null }
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
    expect(await adapter.parameterIds(draft.generation_input)).toEqual(Object.keys(defaults))
    await adapter.validateParameters(draft.generation_input, defaults)
    expect(validate).not.toHaveBeenCalled()
    const selected = await adapter.resolveResourceSelection({ kind: 'comfyui-template', id: '2' }, draft)
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
    const restored = await adapter.resolveGenerationDraft(input)
    expect(restored).toEqual({ parameter_mapping: { positive_prompt_9: 'positive_prompt', negative_prompt_10: 'negative_prompt', width_66: 'width', height_66: 'height' }, generation_input: input, prompt_input: { positive_prompt: 'candidate warm glass', negative_prompt: 'template negative' }, base_model_id: '5', instructions: '', prompt_resource_refs: [], reference_task_ids: [], reference_run_ids: [], reference_experiences: [], image_refs: [], workflow_image_bindings: [] })
    expect((await adapter.prepareGenerationInput(restored)).parameters).toEqual({ positive_prompt_9: 'candidate warm glass', negative_prompt_10: 'template negative', width_66: 1024 })
    expect((await adapter.resolveGenerationDraft({ ...input, model: null })).base_model_id).toBe('6')
    templateModel = null
    expect((await adapter.resolveGenerationDraft({ ...input, model: null, parameters: {} })).base_model_id).toBe('9')
    await expect(adapter.resolveGenerationDraft({ ...input, parameters: { positive_prompt_9: 1 } })).rejects.toMatchObject({ issues: [{ path: 'generation_input.parameters.positive_prompt_9' }] })
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
      const adapter = createWorkbenchInputAdapter({ runtime, catalog: { details: vi.fn(), resolveGenerationModel: vi.fn(), resolveLora: vi.fn(), resolveTemplate: vi.fn(async () => ({ id: '2', title: 'template', base_model_id: '5', model_id: null })) } })
      await expect(adapter.validateGenerationInput({ ...draft.generation_input, parameters: { width_1: 2 } })).rejects.toMatchObject({ issues: [{ path: 'generation_input.parameters.width_1' }] })
      await expect(runtime.validateGenerationRequest(request, AbortSignal.abort())).rejects.toBeDefined()
      expect(official).not.toHaveBeenCalled()
      expect(runtime.queryRuns({ workspaceId: 'workspace', sessionId: 'session' })).toEqual([])
    } finally { runtime.close(); database.close(); rmSync(directory, { recursive: true, force: true }) }
  })

  it.each(['prepare', 'validate'].flatMap(entry => ['instance', 'cancel', 'template'].map(failureKind => ({ entry, failureKind }))))('reports a $failureKind source read failure during $entry before accepting a Run', async ({ entry, failureKind }) => {
    const directory = mkdtempSync(join(tmpdir(), 'workbench-instance-preflight-'))
    const database = new DatabaseSync(':memory:')
    const failure = failureKind === 'cancel' ? new DOMException('Canceled', 'AbortError') : new GenerationRuntimeError('SOURCE_QUERY_FAILED', 'Source record is unavailable.')
    const source = {
      readTemplate: vi.fn(async () => { if (failureKind === 'template') throw failure; return { id: '2', title: 'template', workflow } }),
      readInstance: vi.fn(async () => { throw failure }),
    }
    const fetchDefinitions = vi.fn(async () => new Response(JSON.stringify(definitions)))
    const official = vi.fn(async () => { throw new Error('preflight must not export') })
    const compiler = new ComfyWorkflowCompiler({ fetchImplementation: fetchDefinitions, officialApiWorkflowCompiler: { compile: official } })
    const preparer = new SourceGenerationPreparer({ defaultInstanceId: 'default-instance', source, compiler })
    const runtime = new GenerationRuntime({ database, preparer, runRepositoryFile: join(directory, 'runs.sqlite'), runDirectory: join(directory, 'runs'), savedMediaDirectory: join(directory, 'media') })
    const catalog = { details: vi.fn(), resolveGenerationModel: vi.fn(), resolveLora: vi.fn(), resolveTemplate: vi.fn(async () => ({ id: '2', title: 'template', base_model_id: '5', model_id: null })) }
    const adapter = createWorkbenchInputAdapter({ runtime, catalog })
    try {
      const operation = entry === 'prepare' ? adapter.prepareGenerationInput(draft) : adapter.validateGenerationInput(draft.generation_input)
      if (failureKind === 'cancel') await expect(operation).rejects.toBe(failure)
      else await expect(operation).rejects.toMatchObject({
        code: 'SOURCE_QUERY_FAILED', issues: [{ path: failureKind === 'instance' ? 'generation_input.instance_id' : 'generation_input', message: failure.message }],
      })
      if (failureKind === 'template') expect(source.readInstance).not.toHaveBeenCalled()
      else expect(source.readInstance).toHaveBeenCalledExactlyOnceWith('1', expect.any(AbortSignal))
      expect(fetchDefinitions).not.toHaveBeenCalled()
      expect(official).not.toHaveBeenCalled()
      expect(runtime.queryRuns({ workspaceId: 'workspace', sessionId: 'session' })).toEqual([])
    } finally { runtime.close(); database.close(); rmSync(directory, { recursive: true, force: true }) }
  })

  it.each(['prepare', 'validate'].flatMap(entry => [
    { failure: 'offline', code: 'COMFYUI_CONNECTION_FAILED', message: 'ComfyUI node definitions request failed.' },
    { failure: '401', code: 'COMFYUI_HTTP_ERROR', message: 'ComfyUI returned HTTP 401 for /object_info.' },
    { failure: '503', code: 'COMFYUI_HTTP_ERROR', message: 'ComfyUI returned HTTP 503 for /object_info.' },
  ].map(failure => ({ entry, ...failure }))))('locates object_info $failure at the instance field during $entry', async ({ entry, failure, code, message }) => {
    const directory = mkdtempSync(join(tmpdir(), 'workbench-object-info-preflight-'))
    const database = new DatabaseSync(':memory:')
    const source = {
      readTemplate: vi.fn(async () => ({ id: '2', title: 'template', workflow })),
      readInstance: vi.fn(async () => ({ id: '1', title: 'instance', url: 'http://comfy.test', credentialType: 'none' as const, authorization: null })),
    }
    const fetchDefinitions = vi.fn(async () => {
      if (failure === 'offline') throw new TypeError('offline')
      return new Response('', { status: Number(failure) })
    })
    const official = vi.fn(async () => { throw new Error('preflight must not export') })
    const compiler = new ComfyWorkflowCompiler({ fetchImplementation: fetchDefinitions, officialApiWorkflowCompiler: { compile: official } })
    const preparer = new SourceGenerationPreparer({ defaultInstanceId: 'default-instance', source, compiler })
    const runtime = new GenerationRuntime({ database, preparer, runRepositoryFile: join(directory, 'runs.sqlite'), runDirectory: join(directory, 'runs'), savedMediaDirectory: join(directory, 'media') })
    const catalog = { details: vi.fn(), resolveGenerationModel: vi.fn(), resolveLora: vi.fn(), resolveTemplate: vi.fn(async () => ({ id: '2', title: 'template', base_model_id: '5', model_id: null })) }
    const adapter = createWorkbenchInputAdapter({ runtime, catalog })
    try {
      await expect(entry === 'prepare' ? adapter.prepareGenerationInput(draft) : adapter.validateGenerationInput(draft.generation_input)).rejects.toMatchObject({
        code, issues: [{ path: 'generation_input.instance_id', message }],
      })
      expect(source.readInstance).toHaveBeenCalledExactlyOnceWith('1', expect.any(AbortSignal))
      expect(fetchDefinitions).toHaveBeenCalledExactlyOnceWith('http://comfy.test/object_info', expect.objectContaining({ signal: expect.any(AbortSignal) }))
      expect(official).not.toHaveBeenCalled()
      expect(runtime.queryRuns({ workspaceId: 'workspace', sessionId: 'session' })).toEqual([])
    } finally { runtime.close(); database.close(); rmSync(directory, { recursive: true, force: true }) }
  })

  it.each(['prepare', 'validate'])('preserves cancellation during object_info in %s', async (entry) => {
    const directory = mkdtempSync(join(tmpdir(), 'workbench-object-info-cancel-'))
    const database = new DatabaseSync(':memory:')
    const controller = new AbortController()
    const source = {
      readTemplate: vi.fn(async () => ({ id: '2', title: 'template', workflow })),
      readInstance: vi.fn(async () => ({ id: '1', title: 'instance', url: 'http://comfy.test', credentialType: 'none' as const, authorization: null })),
    }
    const fetchDefinitions = vi.fn(async () => { controller.abort(); return new Response(JSON.stringify(definitions)) })
    const official = vi.fn(async () => { throw new Error('preflight must not export') })
    const compiler = new ComfyWorkflowCompiler({ fetchImplementation: fetchDefinitions, officialApiWorkflowCompiler: { compile: official } })
    const preparer = new SourceGenerationPreparer({ defaultInstanceId: 'default-instance', source, compiler })
    const runtime = new GenerationRuntime({ database, preparer, runRepositoryFile: join(directory, 'runs.sqlite'), runDirectory: join(directory, 'runs'), savedMediaDirectory: join(directory, 'media') })
    const catalog = { details: vi.fn(), resolveGenerationModel: vi.fn(), resolveLora: vi.fn(), resolveTemplate: vi.fn(async () => ({ id: '2', title: 'template', base_model_id: '5', model_id: null })) }
    const adapter = createWorkbenchInputAdapter({ runtime, catalog, signal: controller.signal })
    try {
      const operation = entry === 'prepare' ? adapter.prepareGenerationInput(draft) : adapter.validateGenerationInput(draft.generation_input)
      const error: unknown = await operation.catch(error => error)
      expect(error).toMatchObject({ code: 'COMFYUI_REQUEST_CANCELED' })
      expect(error).not.toHaveProperty('inputPath')
      expect(error).not.toHaveProperty('issues')
      expect(fetchDefinitions).toHaveBeenCalledOnce()
      expect(official).not.toHaveBeenCalled()
      expect(runtime.queryRuns({ workspaceId: 'workspace', sessionId: 'session' })).toEqual([])
    } finally { runtime.close(); database.close(); rmSync(directory, { recursive: true, force: true }) }
  })

  it('combines resources with different catalog model scopes while preserving selections and template defaults', async () => {
    const catalog = { details: vi.fn(async (request: CatalogDetailsRequest) => {
      const details = catalogDetails(request)
      return { ...details, item: { ...details.item, baseModelId: request.kind === 'model' ? '5' : '99', modelId: request.kind === 'model' ? null : '98' } }
    }), resolveGenerationModel: vi.fn(async (id: string) => ({ id, file_name: 'model.safetensors', base_model_id: '5', description: '', usage: '', skill_name: null })), resolveLora: vi.fn(async (id: string) => ({ id, file_name: 'glass.safetensors', weight: 0.7, trigger_words: ['glass'], base_model_id: '5', model_id: '3', description: '', usage: '' })), resolveTemplate: vi.fn(async (id: string) => ({ id, title: 'template', base_model_id: '5', model_id: '3' })) }
    const adapter = createWorkbenchInputAdapter({ runtime: { inspectTemplateRuntimeParameters: async () => ({ parameters: [{ parameter_id: 'width_1', kind: 'width', value_type: 'integer', current_value: 512 }], size_candidates: [] }), validateGenerationRequest: async () => {} }, catalog })
    const current = structuredClone(draft); current.generation_input.template_id = null; current.generation_input.loras = [{ id: '4', file_name: 'old.safetensors', weight: 1, trigger_words: [] }]
    const resolved = await adapter.resolveResourceRefs([{ kind: 'model', id: '3' }, { kind: 'lora', id: '4' }, { kind: 'comfyui-template', id: '2' }], current)
    expect(resolved).toMatchObject({ base_model_id: '5', generation_input: { model: { id: '3', file_name: 'model.safetensors' }, parameters: { width_1: 512 }, loras: [{ id: '4', file_name: 'glass.safetensors', weight: 1, trigger_words: ['glass'] }] } })
    const unselected = await adapter.resolveResourceSelection({ kind: 'comfyui-template', id: '2' }, { ...draft, generation_input: { ...draft.generation_input, instance_id: null } })
    expect(unselected.base_model_id).toBe('5')
    expect(await adapter.parameterIds(draft.generation_input)).toEqual(['width_1'])
    await adapter.validateReferences([{ kind: 'model', id: '6' }])
    expect(current.generation_input.loras[0]!.file_name).toBe('old.safetensors')
  })

  it('discards previous template parameters when the replacement has no selected instance', async () => {
    const catalog = { details: vi.fn(), resolveGenerationModel: vi.fn(), resolveLora: vi.fn(), resolveTemplate: vi.fn(async (id: string) => ({ id, title: 'replacement', base_model_id: '5', model_id: null })) }
    const runtime = { inspectTemplateRuntimeParameters: vi.fn(), validateGenerationRequest: vi.fn() }
    const current: TaskDraft = { ...structuredClone(draft), generation_input: { ...draft.generation_input, instance_id: null, parameters: { steps_1: 18, positive_prompt_9: 'previous template prompt' } } }
    const adapter = createWorkbenchInputAdapter({ runtime, catalog })

    const selected = await adapter.resolveResourceRefs([{ kind: 'comfyui-template', id: '8' }], current)

    expect(selected.generation_input.template_id).toBe('8')
    expect(selected.generation_input.parameters).toEqual({})
    expect(selected.prompt_input).toEqual(current.prompt_input)
    expect(current.generation_input.parameters).toEqual({ steps_1: 18, positive_prompt_9: 'previous template prompt' })
    expect(runtime.inspectTemplateRuntimeParameters).not.toHaveBeenCalled()
  })

  it('forwards a synchronous CLI validation error with its contract identity and field path', async () => {
    const runtime = { inspectTemplateRuntimeParameters: vi.fn(), validateGenerationRequest: vi.fn() }
    const catalog = { details: vi.fn(), resolveGenerationModel: vi.fn(), resolveLora: vi.fn(), resolveTemplate: vi.fn(async () => ({ id: '2', title: 'template', base_model_id: '5', model_id: null })) }
    const adapter = createWorkbenchInputAdapter({ runtime, catalog })
    const failure: unknown = await adapter.validateGenerationInput({ ...draft.generation_input, title: '' }, 'artifact.generation_input').catch(error => error)
    expect(failure).toBeInstanceOf(ContractError)
    expect(failure).toMatchObject({
      contractId: 'cliGenerationRequest', direction: 'input', issues: [{ path: '$.title', message: expect.stringContaining('length >= 1') }],
    })
    expect(runtime.validateGenerationRequest).not.toHaveBeenCalled()
  })

  it('forwards the original contract error object returned by runtime validation', async () => {
    const failure = new ContractError('generationRequest', 'input', new TypeError('Invalid width'), '$.parameters.width_1')
    const runtime = { inspectTemplateRuntimeParameters: vi.fn(), validateGenerationRequest: vi.fn(async () => { throw failure }) }
    const catalog = { details: vi.fn(), resolveGenerationModel: vi.fn(), resolveLora: vi.fn(), resolveTemplate: vi.fn(async () => ({ id: '2', title: 'template', base_model_id: '5', model_id: null })) }
    const adapter = createWorkbenchInputAdapter({ runtime, catalog })
    await expect(adapter.validateGenerationInput(draft.generation_input, 'artifact.generation_input')).rejects.toBe(failure)
  })

  it('reports catalog failures, filename mismatches and runtime field errors at the published artifact path', async () => {
    let failure: unknown
    const runtime = { inspectTemplateRuntimeParameters: async () => ({ parameters: [{ parameter_id: 'width_1', kind: 'width' as const, value_type: 'integer' as const, current_value: 512, minimum: 64 }], size_candidates: [] }), validateGenerationRequest: async () => { if (failure) throw failure } }
    const catalog = { details: vi.fn(async (request: CatalogDetailsRequest) => catalogDetails(request)), resolveGenerationModel: vi.fn(async () => ({ id: '3', file_name: 'model.safetensors', base_model_id: '5', description: '', usage: '', skill_name: null })), resolveLora: vi.fn(async () => ({ id: '4', file_name: 'glass.safetensors', weight: 0.7, trigger_words: [], base_model_id: '5', model_id: '3', description: '', usage: '' })), resolveTemplate: vi.fn(async () => ({ id: '2', title: 'template', base_model_id: '5', model_id: '3' })) }
    const adapter = createWorkbenchInputAdapter({ runtime, catalog })
    const input = { ...draft.generation_input, model: { id: '3', file_name: 'model.safetensors' }, loras: [{ id: '4', file_name: 'glass.safetensors', weight: 0.7, trigger_words: [] }] }
    await adapter.validateGenerationInput(input)
    await expect(adapter.validateGenerationInput({ ...input, model: { id: '3', file_name: 'stale' } }, 'artifact.generation_input')).rejects.toMatchObject({ issues: [{ path: 'artifact.generation_input.model.file_name' }] })
    await expect(adapter.validateGenerationInput({ ...input, loras: [{ ...input.loras[0]!, file_name: 'stale' }] }, 'artifact.generation_input')).rejects.toMatchObject({ issues: [{ path: 'artifact.generation_input.loras.0.file_name' }] })
    failure = new GenerationInputValidationError('GENERATION_PARAMETER_INVALID', 'invalid width', 'parameters.width_1')
    await expect(adapter.validateGenerationInput({ ...input, parameters: { width_1: 2 } }, 'artifact.generation_input')).rejects.toMatchObject({ issues: [{ path: 'artifact.generation_input.parameters.width_1' }] })
    await expect(adapter.validateParameters(input, { width_1: 2 })).rejects.toMatchObject({ issues: [{ path: 'artifact.parameters.width_1' }] })
    failure = new Error('instance offline')
    await expect(adapter.validateGenerationInput(input, 'artifact.candidate.generation_input')).rejects.toMatchObject({ issues: [{ path: 'artifact.candidate.generation_input' }] })
    failure = 'disconnected'
    await expect(adapter.validateGenerationInput(input)).rejects.toMatchObject({ issues: [{ message: 'disconnected' }] })
    catalog.resolveTemplate.mockRejectedValueOnce('missing template')
    await expect(adapter.validateGenerationInput(input)).rejects.toMatchObject({ issues: [{ path: 'generation_input.template_id', message: 'missing template' }] })
    catalog.details.mockRejectedValueOnce('missing work')
    await expect(adapter.validateReferences([{ kind: 'model', id: '9' }])).rejects.toMatchObject({ issues: [{ path: 'resources.0.id', message: 'missing work' }] })
  })

  it('requires each nonempty prompt to have one actual template target', async () => {
    const runtime = { inspectTemplateRuntimeParameters: vi.fn(async () => ({ parameters: [], size_candidates: [] })), validateGenerationRequest: vi.fn(async () => {}) }
    const adapter = createWorkbenchInputAdapter({ runtime, catalog: { details: vi.fn(), resolveGenerationModel: vi.fn(), resolveLora: vi.fn(), resolveTemplate: vi.fn() } })
    await expect(adapter.prepareGenerationInput(draft)).rejects.toMatchObject({ issues: [{ path: 'prompt_input.positive_prompt' }] })
    await expect(adapter.prepareGenerationInput({ ...draft, generation_input: { ...draft.generation_input, instance_id: null } })).rejects.toMatchObject({ code: 'WORKBENCH_TEMPLATE_REQUIRED' })
  })

  it('replaces cached template prompts with edited or cleared text at the actual parameter ids', async () => {
    const adapter = createWorkbenchInputAdapter({
      runtime: {
        inspectTemplateRuntimeParameters: async () => ({ parameters: [
          { parameter_id: 'positive_prompt_9', kind: 'positive_prompt', value_type: 'string', current_value: 'template positive' },
          { parameter_id: 'negative_prompt_10', kind: 'negative_prompt', value_type: 'string', current_value: 'template negative' },
          { parameter_id: 'steps_8', kind: 'steps', value_type: 'integer', current_value: 20 },
        ], size_candidates: [] }),
        validateGenerationRequest: async () => {},
      },
      catalog: { details: vi.fn(), resolveGenerationModel: vi.fn(), resolveLora: vi.fn(), resolveTemplate: vi.fn() },
    })
    const selected: TaskDraft = {
      ...structuredClone(draft),
      prompt_input: { positive_prompt: '手工正向\n玻璃温室', negative_prompt: '手工负向\n模糊' },
      generation_input: { ...draft.generation_input, parameters: { positive_prompt_9: 'cached positive', negative_prompt_10: 'cached negative', steps_8: 24 } },
    }
    expect((await adapter.prepareGenerationInput(selected)).parameters).toEqual({ positive_prompt_9: '手工正向\n玻璃温室', negative_prompt_10: '手工负向\n模糊', steps_8: 24 })
    const cleared = { ...selected, prompt_input: { positive_prompt: '', negative_prompt: '' } }
    expect((await adapter.prepareGenerationInput(cleared)).parameters).toEqual({ positive_prompt_9: '', negative_prompt_10: '', steps_8: 24 })
  })

  it('maps prompts and validates parameter artifacts from their published value contracts', async () => {
    const validate = vi.fn(async (_request: GenerationRequest) => {})
    const adapter = createWorkbenchInputAdapter({ runtime: { inspectTemplateRuntimeParameters: async () => ({ parameters: [{ parameter_id: 'positive_prompt_9', kind: 'positive_prompt', value_type: 'string', current_value: '' }, { parameter_id: 'width_1', kind: 'width', value_type: 'integer', current_value: 512, minimum: 64, maximum: 2048 }], size_candidates: [] }), validateGenerationRequest: validate }, catalog: { details: vi.fn(async (request: CatalogDetailsRequest) => catalogDetails(request)), resolveGenerationModel: vi.fn(), resolveLora: vi.fn(), resolveTemplate: vi.fn() } })
    const prepared = await adapter.prepareGenerationInput(draft)
    expect(prepared.parameters).toEqual({ positive_prompt_9: 'rain on glass' })
    await expect(adapter.prepareGenerationInput({ ...draft, prompt_input: { positive_prompt: 'rain on glass', negative_prompt: 'blur' } })).rejects.toMatchObject({ code: 'WORKBENCH_PROMPT_PARAMETER_REQUIRED', issues: [{ path: 'prompt_input.negative_prompt' }] })
    await adapter.validateParameters(prepared, { width_1: 1024 }, 'artifact.parameters')
    expect(validate).not.toHaveBeenCalled()
    for (const value of [63, 2049, '512', null]) await expect(adapter.validateParameters(prepared, { width_1: value }, 'artifact.parameters')).rejects.toMatchObject({ code: 'WORKBENCH_INVALID_INPUT', issues: [{ path: 'artifact.parameters.width_1' }] })
    await expect(adapter.validateParameters(prepared, { positive_prompt_9: 'changed' }, 'artifact.parameters')).rejects.toMatchObject({ code: 'WORKBENCH_PARAMETER_NOT_ALLOWED' })
    await expect(adapter.validateParameters(prepared, { width_404: 512 }, 'artifact.parameters')).rejects.toMatchObject({ issues: [{ path: 'artifact.parameters.width_404' }] })
  })
})

it('keeps template and restored upload filenames out of editable image parameters', async () => {
  const adapter = createWorkbenchInputAdapter({ runtime: { inspectTemplateRuntimeParameters: async () => ({ parameters: [
    { parameter_id: 'steps', kind: 'steps', value_type: 'integer', current_value: 20 },
    { parameter_id: 'image', kind: 'reference_image', value_type: 'string', current_value: 'template-default.png', image_cardinality: 'one' },
    { parameter_id: 'positive', kind: 'positive_prompt', value_type: 'string', current_value: 'Fixed prompt' },
    { parameter_id: 'negative', kind: 'negative_prompt', value_type: 'string', current_value: '' },
  ], size_candidates: [] }), validateGenerationRequest: async () => {} }, catalog: { details: async () => ({} as never), resolveTemplate: async () => ({ id: '2', title: 'Template', base_model_id: '5', model_id: null }), resolveGenerationModel: async () => ({} as never), resolveLora: async () => ({} as never) } })
  const selected = await adapter.resolveResourceSelection({ kind: 'comfyui-template', id: '2' }, { ...draft, prompt_input: { positive_prompt: null, negative_prompt: null } })
  expect(selected.generation_input.parameters).toEqual({ steps: 20, positive: 'Fixed prompt', negative: '' })
  expect(selected.parameter_mapping).toEqual({ steps: 'steps', image: 'reference_image', positive: 'positive_prompt', negative: 'negative_prompt' })
  expect(await adapter.parameterIds(selected.generation_input)).toEqual(['steps'])
  for (const id of ['positive', 'negative', 'image', 'unknown']) await expect(adapter.validateParameters(selected.generation_input, { [id]: 'filename.png' })).rejects.toMatchObject({ code: 'WORKBENCH_PARAMETER_NOT_ALLOWED', issues: [{ path: `artifact.parameters.${id}` }] })
  const restored = await adapter.resolveGenerationDraft({ ...selected.generation_input, parameters: { steps: 24, image: 'previous-upload.png', positive: 'Fixed prompt', negative: '' } })
  expect(restored.generation_input.parameters).toEqual({ steps: 24, positive: 'Fixed prompt', negative: '' })
  expect((await adapter.prepareGenerationInput({ ...selected, generation_input: { ...selected.generation_input, parameters: { steps: 24, image: 'previous-upload.png', positive: 'Fixed prompt', negative: '' } } })).parameters).toEqual({ steps: 24, positive: 'Fixed prompt', negative: '' })
})

it('validates complete draft parameters before saving and leaves bound images for upload preparation', async () => {
  const validateGenerationRequest = vi.fn(async (_request: GenerationRequest) => {})
  const adapter = createWorkbenchInputAdapter({ runtime: { inspectTemplateRuntimeParameters: async () => ({ parameters: [{ parameter_id: 'steps', kind: 'steps', value_type: 'integer', current_value: 20, minimum: 1, maximum: 50 }, { parameter_id: 'image', kind: 'reference_image', value_type: 'string', current_value: 'existing.png', image_cardinality: 'one' }], size_candidates: [] }), validateGenerationRequest }, catalog: { details: async () => ({} as never), resolveTemplate: async () => ({ id: '2', title: 'Template', base_model_id: '5', model_id: null }), resolveGenerationModel: async () => ({} as never), resolveLora: async () => ({} as never) } })
  const input = { ...draft, generation_input: { ...draft.generation_input, parameters: { steps: 24 } }, image_refs: [{ image_ref_id: 'image-a', source: { kind: 'uploaded_file' as const, file_id: 'file-a' }, purpose: 'workflow' as const, reference_requirement: '' }], workflow_image_bindings: [{ parameter_id: 'image', image_ref_ids: ['image-a'] }] }
  await adapter.validateDraft(input)
  expect(validateGenerationRequest).not.toHaveBeenCalled()
  await expect(adapter.validateDraft({ ...input, generation_input: { ...input.generation_input, parameters: { steps: 24, image: 'previous-upload.png' } } })).rejects.toMatchObject({ code: 'WORKBENCH_PARAMETER_NOT_ALLOWED', issues: [{ path: 'generation_input.parameters.image' }] })
  await expect(adapter.validateParameters(input.generation_input, { image: 'previous-upload.png' })).rejects.toMatchObject({ code: 'WORKBENCH_PARAMETER_NOT_ALLOWED', issues: [{ path: 'artifact.parameters.image' }] })
  expect(await adapter.parameterIds(input.generation_input)).toEqual(['steps'])
  await expect(adapter.validateDraft({ ...input, parameter_mapping: { steps: 'steps' }, generation_input: { ...input.generation_input, parameters: { missing: 1 } } })).rejects.toMatchObject({ code: 'WORKBENCH_PARAMETER_NOT_ALLOWED' })
  await expect(adapter.validateDraft({ ...input, generation_input: { ...input.generation_input, parameters: { steps: 0 } } })).rejects.toMatchObject({ code: 'WORKBENCH_INVALID_INPUT' })
})

import { flattenWorkflowRuntimeParameters } from '../../generation/inspection-contract.ts'
import type { WorkbenchModelChangePreview, WorkbenchModelChangeRef } from '../../workbench-remote.ts'
import { catalogDefinition, catalogResourceCompatible, catalogResourceConflicts } from '../../catalog/contract.ts'
import type { CatalogClient } from '../catalog/catalog-client.ts'
import type { GenerationRuntime } from '../generation/generation-runtime.ts'
import { GenerationInputValidationError } from '../generation/workflow-compiler.ts'
import { parseCliGenerationRequest, toGenerationRequest } from '../../cli/contract.ts'
import type { ContextRef, GenerationInput, JsonValue, ResourceRef, TaskDraft } from '../../workbench/contract.ts'
import { validateGenerationInput as validateStructure, validateContextRefs, WorkbenchError } from '../../workbench/validation.ts'

import resourceSelectionErrors from '../../workbench/resource-selection-errors.json' with { type: 'json' }

import { promptParameter, readGenerationPromptInput } from '../../workbench/prompt-input.ts'

export interface WorkbenchInputAdapterOptions {
  runtime: Pick<GenerationRuntime, 'inspectTemplateRuntimeParameters' | 'validateGenerationRequest'>
  catalog: Pick<CatalogClient, 'details' | 'resolveGenerationModel' | 'resolveLora' | 'resolveTemplate'>
  signal?: AbortSignal
}

export function createWorkbenchInputAdapter({ runtime, catalog, signal = new AbortController().signal }: WorkbenchInputAdapterOptions) {
  const resourceAt = async <T>(read: Promise<T>, path: string): Promise<T> => {
    try { return await read }
    catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error
      throw new WorkbenchError('WORKBENCH_RESOURCE_UNAVAILABLE', error instanceof Error ? error.message : String(error), path)
    }
  }
  const generationAt = async <T>(read: () => Promise<T>, path: string, operationSignal = signal): Promise<T> => {
    try { return await read() }
    catch (error) {
      if (operationSignal.aborted || error instanceof Error && error.name === 'AbortError') throw error
      const message = error instanceof Error ? error.message : String(error)
      const inputPath = error instanceof GenerationInputValidationError ? error.inputPath : null
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'WORKBENCH_GENERATION_INVALID'
      throw new WorkbenchError(code, message, inputPath ? `${path}.${inputPath}` : path)
    }
  }
  const inspect = async (input: GenerationInput, operationSignal = signal) => {
    operationSignal.throwIfAborted()
    const instanceId = input.instance_id, templateId = input.template_id
    if (!instanceId || !templateId) throw new WorkbenchError('WORKBENCH_TEMPLATE_REQUIRED', '请选择 ComfyUI 实例和 Workflow 模板。', 'generation_input')
    return generationAt(() => runtime.inspectTemplateRuntimeParameters({ instanceId, templateId }, operationSignal), 'generation_input', operationSignal)
  }
  const validateReferences = async (refs: readonly ResourceRef[], path = 'context_refs', operationSignal = signal): Promise<void> => {
    operationSignal.throwIfAborted()
    await Promise.all(refs.map(async (ref, index) => {
      try { await catalog.details(ref, operationSignal) }
      catch (error) { throw new WorkbenchError('WORKBENCH_RESOURCE_UNAVAILABLE', error instanceof Error ? error.message : String(error), `${path}.${index}.id`) }
    }))
  }
  const validateGenerationInput = async (raw: GenerationInput, refs: ContextRef[] = [], path = 'generation_input', requestSignal?: AbortSignal): Promise<void> => {
    const operationSignal = requestSignal ? AbortSignal.any([signal, requestSignal]) : signal
    operationSignal.throwIfAborted()
    const input = validateStructure(raw, path, true)
    await validateReferences(refs, path === 'generation_input' ? 'context_refs' : path.replace(/generation_input$/u, 'context_refs'), operationSignal)
    await resourceAt(catalog.resolveTemplate(input.template_id!, operationSignal), `${path}.template_id`)
    if (input.model) {
      const model = await resourceAt(catalog.resolveGenerationModel(input.model.id, operationSignal), `${path}.model.id`)
      if (model.file_name !== input.model.file_name) throw new WorkbenchError('WORKBENCH_RESOURCE_MISMATCH', '模型文件名与目录记录不一致，请重新选择模型。', `${path}.model.file_name`)
    }
    for (const [index, selection] of input.loras.entries()) {
      const lora = await resourceAt(catalog.resolveLora(selection.id, operationSignal), `${path}.loras.${index}.id`)
      if (lora.file_name !== selection.file_name) throw new WorkbenchError('WORKBENCH_RESOURCE_MISMATCH', 'LoRA 文件名与目录记录不一致，请重新选择 LoRA。', `${path}.loras.${index}.file_name`)
    }
    await generationAt(() => runtime.validateGenerationRequest(toGenerationRequest(parseCliGenerationRequest(input)), operationSignal), path, operationSignal)
  }
  const prepareGenerationInput = async (draft: TaskDraft): Promise<GenerationInput> => {
    const input = structuredClone(draft.generation_input)
    if (draft.prompt_input.positive_prompt === null && draft.prompt_input.negative_prompt === null) return input
    const parameters = flattenWorkflowRuntimeParameters(await inspect(input))
    for (const kind of ['positive_prompt', 'negative_prompt'] as const) {
      const value = draft.prompt_input[kind]
      if (value === null) continue
      const descriptor = promptParameter(parameters, kind, kind === 'negative_prompt' && value === '')
      if (descriptor) input.parameters[descriptor.parameter_id] = value
    }
    return input
  }
  const resolveGenerationBaseModelId = async (input: GenerationInput): Promise<string> => {
    if (input.model) return (await resourceAt(catalog.resolveGenerationModel(input.model.id, signal), 'generation_input.model.id')).base_model_id
    const template = await resourceAt(catalog.resolveTemplate(input.template_id!, signal), 'generation_input.template_id')
    return template.model_id ? (await resourceAt(catalog.resolveGenerationModel(template.model_id, signal), 'generation_input.template_id')).base_model_id : template.base_model_id
  }
  const resolveGenerationDraft = async (generationInput: GenerationInput, contextRefs: ContextRef[]): Promise<TaskDraft> => {
    const input = validateStructure(generationInput, 'generation_input', true)
    const parameters = flattenWorkflowRuntimeParameters(await inspect(input))
    const promptInput = readGenerationPromptInput(input, parameters)
    return { prompt_input: promptInput, generation_input: input, context_refs: validateContextRefs(contextRefs), base_model_id: await resolveGenerationBaseModelId(input) }
  }
  const validateParameters = async (input: GenerationInput, parameters: Record<string, JsonValue>, path = 'artifact.parameters', requestSignal?: AbortSignal): Promise<void> => {
    const operationSignal = requestSignal ? AbortSignal.any([signal, requestSignal]) : signal
    const description = await inspect(input, operationSignal)
    const allowed = new Set(flattenWorkflowRuntimeParameters(description).map(parameter => parameter.parameter_id))
    for (const id of Object.keys(parameters)) if (!allowed.has(id)) throw new WorkbenchError('WORKBENCH_PARAMETER_NOT_ALLOWED', '请使用当前模板参数描述中的 parameter_id。', `${path}.${id}`)
    try { await validateGenerationInput({ ...input, parameters: { ...input.parameters, ...parameters } }, [], 'generation_input', operationSignal) }
    catch (error) {
      if (error instanceof WorkbenchError) throw new WorkbenchError(error.code, error.issues.map(issue => ({ ...issue, path: issue.path.startsWith('generation_input.parameters.') ? `${path}.${issue.path.slice('generation_input.parameters.'.length)}` : issue.path })))
      throw error
    }
    operationSignal.throwIfAborted()
  }
  const resolveResources = async (refs: ResourceRef[], current: TaskDraft, templateParameters: 'initialize' | 'preserve-selected', confirmedModelChange?: WorkbenchModelChangePreview): Promise<TaskDraft> => {
    const draft = structuredClone(current)
    for (const ref of refs) {
      const preview = ref.kind === 'model' ? confirmedModelChange ?? await previewModelChange(ref.id, draft) : null
      const details = ref.kind !== 'model'
        ? await resourceAt(catalog.details(ref, signal), 'value.id') : null
      if (details) {
        const error = resourceSelectionErrors.incompatible
        const target = { baseModelId: draft.base_model_id, modelId: draft.generation_input.model?.id ?? null }
        const conflicts = catalogResourceConflicts(details.item, target).map(({ field, required, actual }) => {
          const message = error.constraints[field][actual === null ? 'unselected' : 'selected']
          return message.replaceAll('{required}', required).replaceAll('{actual}', actual ?? '')
        })
        if (conflicts.length) {
          const message = error.message.replaceAll('{conflicts}', conflicts.join(error.separator)).replaceAll('{id}', ref.id).replaceAll('{name}', details.item.label)
          throw new WorkbenchError(error.code, message, error.path)
        }
      }
      if (ref.kind === 'model') {
        const model = await catalog.resolveGenerationModel(ref.id, signal)
        draft.generation_input.model = { id: model.id, file_name: model.file_name }; draft.base_model_id = model.base_model_id
        if (preview) removeResources(draft, preview.removed)
      } else if (ref.kind === 'lora') {
        const lora = await catalog.resolveLora(ref.id, signal)
        const selected = draft.generation_input.loras.find(item => item.id === ref.id)
        if (selected) {
          selected.file_name = lora.file_name
          selected.trigger_words = [...lora.trigger_words]
        } else draft.generation_input.loras.push({ id: lora.id, file_name: lora.file_name, weight: lora.weight, trigger_words: [...lora.trigger_words] })
      } else if (ref.kind === 'comfyui-template') {
        const template = await catalog.resolveTemplate(ref.id, signal)
        if (templateParameters === 'preserve-selected' && draft.generation_input.template_id === template.id) continue
        draft.generation_input.template_id = template.id
        if (draft.base_model_id === null) draft.base_model_id = template.base_model_id
        draft.generation_input.parameters = draft.generation_input.instance_id
          ? Object.fromEntries(flattenWorkflowRuntimeParameters(await inspect(draft.generation_input)).map(parameter => [parameter.parameter_id, parameter.current_value]))
          : {}
      } else {
        draft.context_refs = [...draft.context_refs.filter(item => item.kind !== ref.kind || item.id !== ref.id), { kind: ref.kind, id: ref.id }]
      }
    }
    return draft
  }
  const resolveResourceRefs = (refs: ResourceRef[], current: TaskDraft) => resolveResources([...refs].sort((left, right) => Number(right.kind === 'model') - Number(left.kind === 'model')), current, 'preserve-selected')
  const resolveResourceSelection = (ref: ResourceRef, current: TaskDraft, confirmedModelChange?: WorkbenchModelChangePreview) => {
    if (confirmedModelChange && (ref.kind !== 'model' || confirmedModelChange.model.id !== ref.id)) {
      const error = resourceSelectionErrors.modelChangeMismatch
      throw new WorkbenchError(error.code, error.message, error.path)
    }
    return resolveResources([ref], current, 'initialize', confirmedModelChange)
  }
  const removeResources = (draft: TaskDraft, removed: readonly ResourceRef[]) => {
    if (removed.some(ref => ref.kind === 'model')) draft.generation_input.model = null
    if (removed.some(ref => ref.kind === 'comfyui-template')) {
      draft.generation_input.template_id = null
      draft.generation_input.parameters = {}
    }
    draft.generation_input.loras = draft.generation_input.loras.filter(lora => !removed.some(ref => ref.kind === 'lora' && ref.id === lora.id))
    draft.context_refs = draft.context_refs.filter(context => !removed.some(ref => ref.kind === context.kind && ref.id === context.id))
  }
  const scopedResources = (current: TaskDraft): WorkbenchModelChangeRef[] => [
    ...(current.generation_input.template_id ? [{ kind: 'comfyui-template' as const, id: current.generation_input.template_id }] : []),
    ...current.generation_input.loras.map(lora => ({ kind: 'lora' as const, id: lora.id })),
    ...current.context_refs.filter(ref => catalogDefinition(ref.kind).baseModelScoped),
  ]
  const incompatibleResources = async <T extends ResourceRef>(target: { baseModelId: string | null; modelId: string | null }, resources: readonly T[], requestSignal: AbortSignal): Promise<(T & { label: string })[]> => {
    requestSignal.throwIfAborted()
    const removed: (T & { label: string })[] = []
    for (const ref of resources) {
      const { kind, id } = ref
      const details = await resourceAt(catalog.details({ kind, id }, requestSignal), kind === 'model' ? 'generation_input.model.id' : kind === 'comfyui-template' ? 'generation_input.template_id' : kind === 'lora' ? 'generation_input.loras' : 'context_refs')
      if (!catalogResourceCompatible(details.item, target)) {
        removed.push({ ...ref, label: details.item.label })
      }
    }
    requestSignal.throwIfAborted()
    return removed
  }
  const previewModelChange = async (modelId: string, current: TaskDraft, requestSignal = signal): Promise<WorkbenchModelChangePreview> => {
    requestSignal.throwIfAborted()
    const model = await resourceAt(catalog.details({ kind: 'model', id: modelId }, requestSignal), 'generation_input.model.id')
    const removed = await incompatibleResources({ baseModelId: model.item.baseModelId, modelId }, scopedResources(current), requestSignal)
    return { model: { id: modelId, label: model.item.label }, removed }
  }
  const resolveBaseModelDraft = async (baseModelId: string, current: TaskDraft): Promise<TaskDraft> => {
    const resources: ResourceRef[] = [...(current.generation_input.model ? [{ kind: 'model' as const, id: current.generation_input.model.id }] : []), ...scopedResources(current)]
    const removed = await incompatibleResources({ baseModelId, modelId: null }, resources, signal)
    const draft = structuredClone(current)
    draft.base_model_id = baseModelId
    removeResources(draft, removed)
    return draft
  }
  return { resolveBaseModelDraft, previewModelChange, prepareGenerationInput, resolveGenerationDraft, resolveResourceRefs, resolveResourceSelection, validateGenerationInput, validateParameters, validateReferences, parameterIds: async (input: GenerationInput) => flattenWorkflowRuntimeParameters(await inspect(input)).map(parameter => parameter.parameter_id) }
}

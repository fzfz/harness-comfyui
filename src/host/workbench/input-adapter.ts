import { flattenWorkflowRuntimeParameters, type WorkflowRuntimeParameterInspectionParameter } from '../../generation/inspection-contract.ts'
import type { WorkbenchModelChangePreview, WorkbenchModelChangeRef } from '../../workbench-remote.ts'
import { catalogDefinition, catalogResourceCompatible } from '../../catalog/contract.ts'
import type { CatalogClient } from '../catalog/catalog-client.ts'
import type { GenerationRuntime } from '../generation/generation-runtime.ts'
import { GenerationInputValidationError } from '../generation/workflow-compiler.ts'
import { parseCliGenerationRequest, toGenerationRequest } from '../../cli/contract.ts'
import type { ContextRef, GenerationInput, JsonValue, ResourceRef, TaskDraft } from '../../workbench/contract.ts'
import { validateGenerationInput as validateStructure, validateContextRefs, WorkbenchError } from '../../workbench/validation.ts'

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
  const generationAt = async <T>(read: () => Promise<T>, path: string): Promise<T> => {
    try { return await read() }
    catch (error) {
      if (signal.aborted || error instanceof Error && error.name === 'AbortError') throw error
      const message = error instanceof Error ? error.message : String(error)
      const inputPath = error instanceof GenerationInputValidationError ? error.inputPath : null
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'WORKBENCH_GENERATION_INVALID'
      throw new WorkbenchError(code, message, inputPath ? `${path}.${inputPath}` : path)
    }
  }
  const inspect = async (input: GenerationInput) => {
    const instanceId = input.instance_id, templateId = input.template_id
    if (!instanceId || !templateId) throw new WorkbenchError('WORKBENCH_TEMPLATE_REQUIRED', '请选择 ComfyUI 实例和 Workflow 模板。', 'generation_input')
    return generationAt(() => runtime.inspectTemplateRuntimeParameters({ instanceId, templateId }, signal), 'generation_input')
  }
  const validateReferences = async (refs: readonly ResourceRef[], path = 'context_refs'): Promise<void> => {
    await Promise.all(refs.map(async (ref, index) => {
      try { await catalog.details(ref, signal) }
      catch (error) { throw new WorkbenchError('WORKBENCH_RESOURCE_UNAVAILABLE', error instanceof Error ? error.message : String(error), `${path}.${index}.id`) }
    }))
  }
  const validateGenerationInput = async (raw: GenerationInput, refs: ContextRef[] = [], path = 'generation_input'): Promise<void> => {
    const input = validateStructure(raw, path, true)
    await validateReferences(refs, path === 'generation_input' ? 'context_refs' : path.replace(/generation_input$/u, 'context_refs'))
    await resourceAt(catalog.resolveTemplate(input.template_id!, signal), `${path}.template_id`)
    if (input.model) {
      const model = await resourceAt(catalog.resolveGenerationModel(input.model.id, signal), `${path}.model.id`)
      if (model.file_name !== input.model.file_name) throw new WorkbenchError('WORKBENCH_RESOURCE_MISMATCH', '模型文件名与目录记录不一致，请重新选择模型。', `${path}.model.file_name`)
    }
    for (const [index, selection] of input.loras.entries()) {
      const lora = await resourceAt(catalog.resolveLora(selection.id, signal), `${path}.loras.${index}.id`)
      if (lora.file_name !== selection.file_name) throw new WorkbenchError('WORKBENCH_RESOURCE_MISMATCH', 'LoRA 文件名与目录记录不一致，请重新选择 LoRA。', `${path}.loras.${index}.file_name`)
    }
    await generationAt(() => runtime.validateGenerationRequest(toGenerationRequest(parseCliGenerationRequest(input)), signal), path)
  }
  const promptParameter = (parameters: readonly WorkflowRuntimeParameterInspectionParameter[], kind: 'positive_prompt' | 'negative_prompt', allowMissing: boolean) => {
    const matching = parameters.filter(parameter => parameter.kind === kind)
    if (matching.length === 0 && allowMissing) return undefined
    if (matching.length !== 1) throw new WorkbenchError('WORKBENCH_PROMPT_PARAMETER_REQUIRED', `模板必须提供 1 个 ${kind} 参数，请重新选择模板。`, `prompt_input.${kind}`)
    return matching[0]!
  }
  const prepareGenerationInput = async (draft: TaskDraft): Promise<GenerationInput> => {
    const input = structuredClone(draft.generation_input)
    const parameters = flattenWorkflowRuntimeParameters(await inspect(input))
    for (const kind of ['positive_prompt', 'negative_prompt'] as const) {
      const descriptor = promptParameter(parameters, kind, kind === 'negative_prompt' && !draft.prompt_input[kind])
      if (descriptor) input.parameters[descriptor.parameter_id] = draft.prompt_input[kind]
    }
    return input
  }
  const resolveGenerationDraft = async (generationInput: GenerationInput, contextRefs: ContextRef[]): Promise<TaskDraft> => {
    const input = validateStructure(generationInput, 'generation_input', true)
    const parameters = flattenWorkflowRuntimeParameters(await inspect(input))
    const promptInput = { positive_prompt: '', negative_prompt: '' }
    for (const kind of ['positive_prompt', 'negative_prompt'] as const) {
      const descriptor = promptParameter(parameters, kind, kind === 'negative_prompt')
      if (!descriptor) continue
      const value = Object.hasOwn(input.parameters, descriptor.parameter_id) ? input.parameters[descriptor.parameter_id] : descriptor.current_value
      if (typeof value !== 'string') throw new WorkbenchError('WORKBENCH_PROMPT_VALUE_INVALID', '请填写提示词文本。', `generation_input.parameters.${descriptor.parameter_id}`)
      promptInput[kind] = value
    }
    let baseModelId: string
    if (input.model) baseModelId = (await resourceAt(catalog.resolveGenerationModel(input.model.id, signal), 'generation_input.model.id')).base_model_id
    else {
      const template = await resourceAt(catalog.resolveTemplate(input.template_id!, signal), 'generation_input.template_id')
      baseModelId = template.model_id ? (await resourceAt(catalog.resolveGenerationModel(template.model_id, signal), 'generation_input.template_id')).base_model_id : template.base_model_id
    }
    return { prompt_input: promptInput, generation_input: input, context_refs: validateContextRefs(contextRefs), base_model_id: baseModelId }
  }
  const validateParameters = async (input: GenerationInput, parameters: Record<string, JsonValue>, path = 'artifact.parameters'): Promise<void> => {
    const description = await inspect(input)
    const allowed = new Set(flattenWorkflowRuntimeParameters(description).map(parameter => parameter.parameter_id))
    for (const id of Object.keys(parameters)) if (!allowed.has(id)) throw new WorkbenchError('WORKBENCH_PARAMETER_NOT_ALLOWED', '请使用当前模板参数描述中的 parameter_id。', `${path}.${id}`)
    try { await validateGenerationInput({ ...input, parameters: { ...input.parameters, ...parameters } }, [], 'generation_input') }
    catch (error) {
      if (error instanceof WorkbenchError) throw new WorkbenchError(error.code, error.issues.map(issue => ({ ...issue, path: issue.path.startsWith('generation_input.parameters.') ? `${path}.${issue.path.slice('generation_input.parameters.'.length)}` : issue.path })))
      throw error
    }
  }
  const resolveResources = async (refs: ResourceRef[], current: TaskDraft, requireCompatible: boolean): Promise<TaskDraft> => {
    const draft = structuredClone(current)
    for (const ref of refs) {
      const details = requireCompatible && ref.kind !== 'model'
        ? await resourceAt(catalog.details(ref, signal), 'value.id') : null
      if (details && !catalogResourceCompatible(details.item, { baseModelId: draft.base_model_id, modelId: draft.generation_input.model?.id ?? null })) {
        throw new WorkbenchError('WORKBENCH_RESOURCE_INCOMPATIBLE', '请更换生成模型后选择此资源。', 'value.id')
      }
      if (ref.kind === 'model') {
        const model = await catalog.resolveGenerationModel(ref.id, signal)
        draft.generation_input.model = { id: model.id, file_name: model.file_name }; draft.base_model_id = model.base_model_id
      } else if (ref.kind === 'lora') {
        const lora = await catalog.resolveLora(ref.id, signal)
        draft.generation_input.loras = [...draft.generation_input.loras.filter(item => item.id !== ref.id), { id: lora.id, file_name: lora.file_name, weight: lora.weight, trigger_words: [...lora.trigger_words] }]
      } else if (ref.kind === 'comfyui-template') {
        const template = await catalog.resolveTemplate(ref.id, signal)
        draft.generation_input.template_id = template.id
        if (draft.base_model_id === null) draft.base_model_id = template.base_model_id
        draft.generation_input.parameters = draft.generation_input.instance_id
          ? Object.fromEntries(flattenWorkflowRuntimeParameters(await inspect(draft.generation_input)).map(parameter => [parameter.parameter_id, parameter.current_value]))
          : {}
      } else {
        if (!details) await validateReferences([ref])
        draft.context_refs = [...draft.context_refs.filter(item => item.kind !== ref.kind || item.id !== ref.id), { kind: ref.kind, id: ref.id }]
      }
    }
    return draft
  }
  const resolveResourceRefs = (refs: ResourceRef[], current: TaskDraft) => resolveResources(refs, current, false)
  const resolveResourceSelection = (ref: ResourceRef, current: TaskDraft) => resolveResources([ref], current, true)
  const previewModelChange = async (modelId: string, current: TaskDraft, requestSignal = signal): Promise<WorkbenchModelChangePreview> => {
    requestSignal.throwIfAborted()
    const model = await resourceAt(catalog.details({ kind: 'model', id: modelId }, requestSignal), 'generation_input.model.id')
    const removed: (WorkbenchModelChangePreview['removed'][number])[] = []
    const resources: WorkbenchModelChangeRef[] = [
      ...(current.generation_input.template_id ? [{ kind: 'comfyui-template' as const, id: current.generation_input.template_id }] : []),
      ...current.generation_input.loras.map(lora => ({ kind: 'lora' as const, id: lora.id })),
      ...current.context_refs.filter(ref => catalogDefinition(ref.kind).baseModelScoped),
    ]
    for (const { kind, id } of resources) {
      const details = await resourceAt(catalog.details({ kind, id }, requestSignal), kind === 'comfyui-template' ? 'generation_input.template_id' : kind === 'lora' ? 'generation_input.loras' : 'context_refs')
      if (!catalogResourceCompatible(details.item, { baseModelId: model.item.baseModelId, modelId })) {
        removed.push({ kind, id, label: details.item.label })
      }
    }
    requestSignal.throwIfAborted()
    return { model: { id: modelId, label: model.item.label }, removed }
  }
  return { previewModelChange, prepareGenerationInput, resolveGenerationDraft, resolveResourceRefs, resolveResourceSelection, validateGenerationInput, validateParameters, validateReferences, parameterIds: async (input: GenerationInput) => flattenWorkflowRuntimeParameters(await inspect(input)).map(parameter => parameter.parameter_id) }
}

import { flattenWorkflowRuntimeParameters } from '../../generation/inspection-contract.ts'
import type { CatalogClient } from '../catalog/catalog-client.ts'
import { GenerationRuntimeError, type GenerationRuntime } from '../generation/generation-runtime.ts'
import { GenerationInputValidationError } from '../generation/workflow-compiler.ts'
import { parseCliGenerationRequest, toGenerationRequest } from '../../cli/contract.ts'
import type { ContextRef, GenerationInput, JsonValue, ResourceRef, TaskDraft } from '../../workbench/contract.ts'
import { validateGenerationInput as validateStructure, validateContextRefs, WorkbenchError } from '../../workbench/validation.ts'

import { parameterMapping, promptParameter, readGenerationPromptInput } from '../../workbench/prompt-input.ts'

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
  const resolveParameterMapping = async (input: GenerationInput) => {
    signal.throwIfAborted()
    if (!input.instance_id || !input.template_id) return null
    try {
      const description = await runtime.inspectTemplateRuntimeParameters({ instanceId: input.instance_id, templateId: input.template_id }, signal)
      signal.throwIfAborted()
      return parameterMapping(flattenWorkflowRuntimeParameters(description))
    } catch (error) {
      if (signal.aborted || error instanceof Error && error.name === 'AbortError') throw error
      if (error instanceof GenerationRuntimeError && ['SOURCE_CONNECTION_FAILED', 'SOURCE_REQUEST_TIMEOUT', 'SOURCE_QUERY_FAILED', 'COMFYUI_CONNECTION_FAILED', 'COMFYUI_HTTP_ERROR'].includes(error.code)) return null
      throw error
    }
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
    return { prompt_input: promptInput, generation_input: input, parameter_mapping: parameterMapping(parameters), context_refs: validateContextRefs(contextRefs), base_model_id: await resolveGenerationBaseModelId(input) }
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
  const resolveResources = async (refs: ResourceRef[], current: TaskDraft, templateParameters: 'initialize' | 'preserve-selected'): Promise<TaskDraft> => {
    const draft = structuredClone(current)
    for (const ref of refs) {
      if (ref.kind === 'model') {
        const model = await resourceAt(catalog.resolveGenerationModel(ref.id, signal), 'value.id')
        draft.generation_input.model = { id: model.id, file_name: model.file_name }; draft.base_model_id = model.base_model_id
      } else if (ref.kind === 'lora') {
        const lora = await resourceAt(catalog.resolveLora(ref.id, signal), 'value.id')
        const selected = draft.generation_input.loras.find(item => item.id === ref.id)
        if (selected) {
          selected.file_name = lora.file_name
          selected.trigger_words = [...lora.trigger_words]
        } else draft.generation_input.loras.push({ id: lora.id, file_name: lora.file_name, weight: lora.weight, trigger_words: [...lora.trigger_words] })
      } else if (ref.kind === 'comfyui-template') {
        const template = await resourceAt(catalog.resolveTemplate(ref.id, signal), 'value.id')
        if (templateParameters === 'preserve-selected' && draft.generation_input.template_id === template.id) continue
        draft.generation_input.template_id = template.id
        if (draft.base_model_id === null) draft.base_model_id = template.base_model_id
        const parameters = draft.generation_input.instance_id ? flattenWorkflowRuntimeParameters(await inspect(draft.generation_input)) : null
        draft.generation_input.parameters = Object.fromEntries((parameters ?? []).map(parameter => [parameter.parameter_id, parameter.current_value]))
        draft.parameter_mapping = parameters ? parameterMapping(parameters) : null
      } else {
        await resourceAt(catalog.details(ref, signal), 'value.id')
        draft.context_refs = [...draft.context_refs.filter(item => item.kind !== ref.kind || item.id !== ref.id), { kind: ref.kind, id: ref.id }]
      }
    }
    return draft
  }
  const resolveResourceRefs = (refs: ResourceRef[], current: TaskDraft) => resolveResources(refs, current, 'preserve-selected')
  const resolveResourceSelection = (ref: ResourceRef, current: TaskDraft) => resolveResources([ref], current, 'initialize')
  return { resolveParameterMapping, prepareGenerationInput, resolveGenerationDraft, resolveResourceRefs, resolveResourceSelection, validateGenerationInput, validateParameters, validateReferences, parameterIds: async (input: GenerationInput) => flattenWorkflowRuntimeParameters(await inspect(input)).map(parameter => parameter.parameter_id) }
}

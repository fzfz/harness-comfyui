import type { WorkflowRuntimeParameterInspectionParameter } from '../generation/inspection-contract.ts'
import type { GenerationInput, PromptInput } from './contract.ts'
import { WorkbenchError } from './validation.ts'

export function promptParameter(parameters: readonly WorkflowRuntimeParameterInspectionParameter[], kind: keyof PromptInput, allowMissing: boolean) {
  const matching = parameters.filter(parameter => parameter.kind === kind)
  if (matching.length === 0 && allowMissing) return undefined
  if (matching.length !== 1) throw new WorkbenchError('WORKBENCH_PROMPT_PARAMETER_REQUIRED', `模板必须提供 1 个 ${kind} 参数，请重新选择模板。`, `prompt_input.${kind}`)
  return matching[0]!
}

function readPromptSlot(input: GenerationInput, parameters: readonly WorkflowRuntimeParameterInspectionParameter[], kind: keyof PromptInput, allowMissing: boolean): string | null {
  const descriptor = promptParameter(parameters, kind, allowMissing)
  if (!descriptor) return null
  const value = Object.hasOwn(input.parameters, descriptor.parameter_id) ? input.parameters[descriptor.parameter_id] : descriptor.current_value
  if (typeof value !== 'string') throw new WorkbenchError('WORKBENCH_PROMPT_VALUE_INVALID', '请填写提示词文本。', `generation_input.parameters.${descriptor.parameter_id}`)
  return value
}

export function readGenerationPromptInput(input: GenerationInput, parameters: readonly WorkflowRuntimeParameterInspectionParameter[]): PromptInput {
  return {
    positive_prompt: readPromptSlot(input, parameters, 'positive_prompt', false),
    negative_prompt: readPromptSlot(input, parameters, 'negative_prompt', true) ?? '',
  }
}

export function readSavedPromptInput(input: GenerationInput, parameters: readonly WorkflowRuntimeParameterInspectionParameter[]): PromptInput {
  const result: PromptInput = { positive_prompt: null, negative_prompt: null }
  for (const kind of ['positive_prompt', 'negative_prompt'] as const) {
    try { result[kind] = readPromptSlot(input, parameters, kind, true) }
    catch (error) {
      if (!(error instanceof WorkbenchError) || !['WORKBENCH_PROMPT_PARAMETER_REQUIRED', 'WORKBENCH_PROMPT_VALUE_INVALID'].includes(error.code)) throw error
    }
  }
  return result
}

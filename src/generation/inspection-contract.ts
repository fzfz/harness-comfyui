import type { JsonValue } from '#contracts'
import type { ContractReadonlyValue } from '#contracts'
import { equalValue } from '../shared/json-contract.ts'



import parameterAliases from './runtime-parameter-aliases.json' with { type: 'json' }
import imageInputErrors from './image-input-errors.json' with { type: 'json' }

import type { ImageRef } from '../workbench/contract.ts'
export const RUNTIME_PARAMETER_INPUT_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze(
  Object.fromEntries(Object.entries(parameterAliases).map(([kind, names]) => [kind, Object.freeze(names)])),
)

export type WorkflowRuntimeParameterInspectionParameter = ContractReadonlyValue<'workflowRuntimeParameter'>
export type WorkflowWidthHeightSizeCandidate = Extract<WorkflowRuntimeSizeCandidate, { representation: 'width_height' }>
export type WorkflowAspectRatioMegapixelsSizeCandidate = Extract<WorkflowRuntimeSizeCandidate, { representation: 'aspect_ratio_megapixels' }>
export type WorkflowResolutionPresetMapping = WorkflowResolutionPresetSizeCandidate['mapped_options'][number]
export type WorkflowResolutionPresetSizeCandidate = Extract<WorkflowRuntimeSizeCandidate, { representation: 'resolution_preset' }>
export type WorkflowRuntimeSizeCandidate = ContractReadonlyValue<'workflowRuntimeSizeCandidate'>
export type WorkflowRuntimeParameterInspection = ContractReadonlyValue<'workflowRuntimeParameterInspection'>
export function flattenWorkflowRuntimeParameters(description: WorkflowRuntimeParameterInspection): readonly WorkflowRuntimeParameterInspectionParameter[] {
  const parameters = new Map<string, WorkflowRuntimeParameterInspectionParameter>()
  for (const parameter of description.parameters) parameters.set(parameter.parameter_id, parameter)
  for (const candidate of description.size_candidates) {
    const fields = candidate.representation === 'width_height' ? [candidate.width, candidate.height]
      : candidate.representation === 'aspect_ratio_megapixels' ? [candidate.aspect_ratio, candidate.megapixels]
        : [candidate.parameter]
    for (const parameter of fields) if (!parameters.has(parameter.parameter_id)) parameters.set(parameter.parameter_id, parameter)
  }
  return [...parameters.values()]
}

export interface WorkflowImageInputProblem {
  readonly code: string
  readonly inputPath: string
  readonly message: string
}

export function workflowImageInputProblem(
  description: WorkflowRuntimeParameterInspection,
  bindings: readonly ContractReadonlyValue<'workflowImageBinding'>[],
  parameters: Readonly<Record<string, JsonValue>> = {},
  refs: readonly ImageRef[] = [],
): WorkflowImageInputProblem | undefined {
  const imageParameters = description.parameters.filter(parameter => parameter.kind === 'reference_image')
  const rawParameter = imageParameters.length > 0 ? Object.keys(parameters).find(id => imageParameters.some(parameter => parameter.parameter_id === id)
    || RUNTIME_PARAMETER_INPUT_ALIASES.reference_image!.includes(id) || id.startsWith('reference_image_')) : undefined
  if (rawParameter) return { code: imageInputErrors.rawParameter.code, inputPath: `parameters.${rawParameter}`,
    message: imageInputErrors.rawParameter.message.replaceAll('{parameter}', rawParameter) }
  const invalid = (inputPath: string, message: string): WorkflowImageInputProblem => ({ code: imageInputErrors.invalidBinding.code, inputPath, message })
  const byId = new Map(refs.map(ref => [ref.image_ref_id, ref]))
  if (byId.size !== refs.length) return invalid('image_refs', imageInputErrors.invalidBinding.messages.duplicateReference)
  const seen = new Set<string>()
  for (const binding of bindings) {
    const path = `workflow_image_bindings.${binding.parameter_id}`
    const parameter = imageParameters.find(parameter => parameter.parameter_id === binding.parameter_id)
    if (!parameter?.image_cardinality) return invalid(path,
      imageInputErrors.invalidBinding.messages.unknownParameter.replaceAll('{parameter}', binding.parameter_id))
    if (seen.has(binding.parameter_id) || binding.image_ref_ids.length === 0
      || (parameter.image_cardinality === 'one' && binding.image_ref_ids.length !== 1)) return invalid(path,
      imageInputErrors.invalidBinding.messages.cardinality.replaceAll('{parameter}', binding.parameter_id))
    seen.add(binding.parameter_id)
    for (const id of binding.image_ref_ids) {
      const ref = byId.get(id)
      if (!ref || ref.purpose === 'agent') return invalid(path,
        imageInputErrors.invalidBinding.messages.unavailableReference.replaceAll('{image}', id).replaceAll('{parameter}', binding.parameter_id))
    }
  }
  const missing = imageParameters.find(parameter => parameter.image_required && !seen.has(parameter.parameter_id))
  if (missing) return {
    code: imageInputErrors.missingBinding.code, inputPath: `workflow_image_bindings.${missing.parameter_id}`,
    message: imageInputErrors.missingBinding.message.replaceAll('{parameter}', missing.parameter_id),
  }
  const unbound = refs.find(ref => ref.purpose !== 'agent' && !bindings.some(binding => binding.image_ref_ids.includes(ref.image_ref_id)))
  if (unbound) return invalid(`image_refs.${unbound.image_ref_id}`,
    imageInputErrors.invalidBinding.messages.unboundReference.replaceAll('{image}', unbound.image_ref_id))
  return undefined
}

export function validateWorkflowRuntimeParameterValue(parameter: WorkflowRuntimeParameterInspectionParameter, value: JsonValue): boolean {
  if (parameter.allowed_values && !parameter.allowed_values.some(allowed => equalValue(allowed, value))) return false
  if (parameter.value_type === 'choice') return parameter.allowed_values !== undefined
  if (parameter.value_type === 'string') return typeof value === 'string'
  if (parameter.value_type === 'boolean') return typeof value === 'boolean'
  return typeof value === 'number' && Number.isFinite(value) && (parameter.value_type !== 'integer' || Number.isSafeInteger(value)) && (parameter.minimum === undefined || value >= parameter.minimum) && (parameter.maximum === undefined || value <= parameter.maximum)
}

export const WORKFLOW_RUNTIME_PARAMETER_VALUE_TYPES = ['integer', 'number', 'string', 'boolean', 'choice'] as const

export const STANDARD_RUNTIME_PARAMETER_KINDS = Object.freeze([
  'positive_prompt', 'negative_prompt', 'width', 'height', 'seed', 'cfg', 'steps',
  'sampler_name', 'scheduler', 'denoise', 'batch_size', 'resolution_preset',
  'reference_image', 'aspect_ratio', 'megapixels',
] as const)
export type StandardRuntimeParameterKind = typeof STANDARD_RUNTIME_PARAMETER_KINDS[number]

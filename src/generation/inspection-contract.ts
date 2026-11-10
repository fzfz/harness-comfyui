import Schema from '@deepseek-ai/schemastery'
import { contractObject, requiredNullable } from '../shared/field-contract.ts'
import { equalValue, jsonArraySchema } from '../shared/json-contract.ts'
import { GENERATION_JSON_CONTRACT, generationJsonValueSchema } from './json-contract.ts'
import type { JsonValue } from '../shared/json-contract.ts'

import parameterAliases from './runtime-parameter-aliases.json' with { type: 'json' }
import imageInputErrors from './image-input-errors.json' with { type: 'json' }

import type { ImageRef, WorkflowImageBinding } from '../workbench/contract.ts'
export const RUNTIME_PARAMETER_INPUT_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze(
  Object.fromEntries(Object.entries(parameterAliases).map(([kind, names]) => [kind, Object.freeze(names)])),
)

export interface WorkflowRuntimeParameterInspectionParameter {
  readonly parameter_id: string
  readonly image_cardinality?: 'one' | 'many'
  readonly image_required?: boolean
  readonly kind: StandardRuntimeParameterKind
  readonly value_type: typeof WORKFLOW_RUNTIME_PARAMETER_VALUE_TYPES[number]
  readonly current_value: JsonValue
  readonly minimum?: number
  readonly maximum?: number
  readonly allowed_values?: readonly JsonValue[]
}
export interface WorkflowWidthHeightSizeCandidate {
  readonly candidate_id: string
  readonly representation: 'width_height'
  readonly width: WorkflowRuntimeParameterInspectionParameter
  readonly height: WorkflowRuntimeParameterInspectionParameter
}
export interface WorkflowAspectRatioMegapixelsSizeCandidate {
  readonly candidate_id: string
  readonly representation: 'aspect_ratio_megapixels'
  readonly aspect_ratio: WorkflowRuntimeParameterInspectionParameter
  readonly megapixels: WorkflowRuntimeParameterInspectionParameter
}
export interface WorkflowResolutionPresetMapping {
  readonly value: JsonValue
  readonly width: number
  readonly height: number
}
export interface WorkflowResolutionPresetSizeCandidate {
  readonly candidate_id: string
  readonly representation: 'resolution_preset'
  readonly parameter: WorkflowRuntimeParameterInspectionParameter
  readonly mapped_options: readonly WorkflowResolutionPresetMapping[]
  readonly unmapped_values: readonly JsonValue[]
}
export type WorkflowRuntimeSizeCandidate = WorkflowWidthHeightSizeCandidate | WorkflowAspectRatioMegapixelsSizeCandidate | WorkflowResolutionPresetSizeCandidate
export interface WorkflowRuntimeParameterInspection {
  readonly parameters: readonly WorkflowRuntimeParameterInspectionParameter[]
  readonly size_candidates: readonly WorkflowRuntimeSizeCandidate[]
}
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
  bindings: readonly WorkflowImageBinding[],
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

export const workflowRuntimeParameterSchema = contractObject({
  image_cardinality: Schema.union(['one', 'many']),
  image_required: Schema.boolean(),
  parameter_id: Schema.string().required(), kind: Schema.union(STANDARD_RUNTIME_PARAMETER_KINDS).required(),
  value_type: Schema.union(WORKFLOW_RUNTIME_PARAMETER_VALUE_TYPES).required(),
  current_value: requiredNullable(generationJsonValueSchema),
  minimum: Schema.number(), maximum: Schema.number(), allowed_values: jsonArraySchema(GENERATION_JSON_CONTRACT),
}).required() satisfies Schema<any, WorkflowRuntimeParameterInspectionParameter>
export const workflowRuntimeSizeCandidateSchema = Schema.union([
  contractObject({ candidate_id: Schema.string().required(), representation: Schema.const('width_height').required(), width: workflowRuntimeParameterSchema, height: workflowRuntimeParameterSchema }).required(),
  contractObject({ candidate_id: Schema.string().required(), representation: Schema.const('aspect_ratio_megapixels').required(), aspect_ratio: workflowRuntimeParameterSchema, megapixels: workflowRuntimeParameterSchema }).required(),
  contractObject({
    candidate_id: Schema.string().required(), representation: Schema.const('resolution_preset').required(), parameter: workflowRuntimeParameterSchema,
    mapped_options: Schema.array(contractObject({ value: requiredNullable(generationJsonValueSchema), width: Schema.natural().min(1).required(), height: Schema.natural().min(1).required() }).required()).required(),
    unmapped_values: jsonArraySchema(GENERATION_JSON_CONTRACT).required(),
  }).required(),
]).required() satisfies Schema<any, WorkflowRuntimeSizeCandidate>
export const workflowRuntimeParameterInspectionSchema = contractObject({
  parameters: Schema.array(workflowRuntimeParameterSchema).required(), size_candidates: Schema.array(workflowRuntimeSizeCandidateSchema).required(),
}).required() satisfies Schema<any, WorkflowRuntimeParameterInspection>

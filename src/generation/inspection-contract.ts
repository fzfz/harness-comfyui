import Schema from '@deepseek-ai/schemastery'
import { contractObject, requiredNullable } from '../shared/field-contract.ts'
import { jsonArraySchema } from '../shared/json-contract.ts'
import { GENERATION_JSON_CONTRACT, generationJsonValueSchema, type JsonValue } from './run-input-contract.ts'

export interface WorkflowRuntimeParameterInspectionParameter {
  readonly parameter_id: string
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
export const WORKFLOW_RUNTIME_PARAMETER_VALUE_TYPES = ['integer', 'number', 'string', 'boolean', 'choice'] as const

export const STANDARD_RUNTIME_PARAMETER_KINDS = Object.freeze([
  'positive_prompt', 'negative_prompt', 'width', 'height', 'seed', 'cfg', 'steps',
  'sampler_name', 'scheduler', 'denoise', 'batch_size', 'resolution_preset',
  'reference_image', 'aspect_ratio', 'megapixels',
] as const)
export type StandardRuntimeParameterKind = typeof STANDARD_RUNTIME_PARAMETER_KINDS[number]

export const workflowRuntimeParameterSchema = contractObject({
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

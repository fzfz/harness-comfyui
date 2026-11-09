import Schema from '@deepseek-ai/schemastery'
import { imageRefSchema, imageUploadSchema, workflowImageBindingSchema } from '../workbench/schema.ts'
import type { ImageRef, WorkflowImageBinding } from '../workbench/contract.ts'
import type { GenerationImageUpload } from './submission-contract.ts'
import { loraWeightSchema } from './lora-contract.ts'
import { contractObject, requiredNullable } from '../shared/field-contract.ts'
import type { JsonValue } from '../shared/json-contract.ts'
import { generationParametersSchema } from './json-contract.ts'
export { GENERATION_JSON_CONTRACT, generationJsonValueSchema, generationParametersSchema } from './json-contract.ts'
export type { JsonPrimitive, JsonValue } from '../shared/json-contract.ts'

import { workflowRuntimeParameterInspectionSchema, type WorkflowRuntimeParameterInspection } from './inspection-contract.ts'
export const MAX_RUN_INPUT_QUERY_IDS = 20
export const MIN_RUN_INPUT_ID_PREFIX_LENGTH = 8

export interface GenerationRunInputRequest {
  readonly run_ids: readonly string[]
}

export interface GenerationRunInputError {
  readonly code: string
  readonly message: string
}

export interface GenerationRunInputLora {
  readonly id: string
  readonly file_name: string
  readonly weight: number
  readonly trigger_words: readonly string[]
}

export interface GenerationRunInputModel {
  readonly id: string
  readonly file_name: string
}

export interface GenerationRunInputArguments {
  readonly image_refs?: readonly ImageRef[]
  readonly workflow_image_bindings?: readonly WorkflowImageBinding[]
  readonly title: string
  readonly instance_id?: string
  readonly template_id: string
  readonly model?: GenerationRunInputModel
  readonly parameters: Readonly<Record<string, JsonValue>>
  readonly loras: readonly GenerationRunInputLora[]
}

interface AvailableGenerationRunInputBase {
  readonly workspace_id: string
  readonly submitted_input: GenerationRunInputArguments
  readonly effective_input: GenerationRunInputArguments | null
  readonly image_uploads: readonly GenerationImageUpload[]
  readonly run_id: string
  readonly lookup_status: 'available'
  readonly arguments: GenerationRunInputArguments
  readonly input_description: WorkflowRuntimeParameterInspection | null
}

export interface AvailableWorkflowGenerationRunInput extends AvailableGenerationRunInputBase {
  readonly workflow_status: 'available'
  readonly workflow: Readonly<Record<string, JsonValue>>
}

export interface UnavailableWorkflowGenerationRunInput extends AvailableGenerationRunInputBase {
  readonly workflow_status: 'unavailable'
  readonly workflow_error: GenerationRunInputError
}

export type AvailableGenerationRunInput =
  | AvailableWorkflowGenerationRunInput
  | UnavailableWorkflowGenerationRunInput

export interface FailedGenerationRunInput {
  readonly run_id: string
  readonly lookup_status: 'error'
  readonly error: GenerationRunInputError
}

export type GenerationRunInput = AvailableGenerationRunInput | FailedGenerationRunInput

export interface GenerationRunInputResult {
  readonly runs: readonly GenerationRunInput[]
}

export const generationRunErrorSchema = Schema.object({ code: Schema.string().required(), message: Schema.string().required() }).required()
export const generationRunInputModelSchema = Schema.object({ id: Schema.string().required(), file_name: Schema.string().required() }).default(undefined as never)
export const generationRunInputLoraSchema = Schema.object({
  id: Schema.string().required(), file_name: Schema.string().required(), weight: loraWeightSchema,
  trigger_words: Schema.array(Schema.string().required()).required(),
}).required()
export const generationRunInputArgumentsSchema = contractObject({
  image_refs: Schema.array(imageRefSchema), workflow_image_bindings: Schema.array(workflowImageBindingSchema),
  title: Schema.string().required(), instance_id: Schema.string(), template_id: Schema.string().required(),
  model: generationRunInputModelSchema,
  parameters: generationParametersSchema,
  loras: Schema.array(generationRunInputLoraSchema).required(),
}).required()
const availableRunInput = {
  run_id: Schema.string().required(), lookup_status: Schema.const('available').required(),
  arguments: generationRunInputArgumentsSchema,
  workspace_id: Schema.string().required(), submitted_input: generationRunInputArgumentsSchema,
  effective_input: requiredNullable(generationRunInputArgumentsSchema),
  image_uploads: Schema.array(imageUploadSchema).required(),
  input_description: requiredNullable(workflowRuntimeParameterInspectionSchema),
}
export const generationRunLookupErrorSchema = Schema.object({
  run_id: Schema.string().required(), lookup_status: Schema.const('error').required(), error: generationRunErrorSchema,
}).required()
export const generationRunInputSchema = Schema.union([
  Schema.object({ ...availableRunInput, workflow_status: Schema.const('available').required(), workflow: generationParametersSchema }).required(),
  Schema.object({ ...availableRunInput, workflow_status: Schema.const('unavailable').required(), workflow_error: generationRunErrorSchema }).required(),
  generationRunLookupErrorSchema,
]).required()
export const generationRunInputResultSchema = Schema.object({ runs: Schema.array(generationRunInputSchema).required() }).required() satisfies Schema<any, GenerationRunInputResult>

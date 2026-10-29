import Schema from '@deepseek-ai/schemastery'
import { loraWeightSchema } from './lora-contract.ts'
import { contractObject } from '../shared/field-contract.ts'
import { jsonValueSchema, jsonObjectSchema, type JsonValue } from '../shared/json-contract.ts'
export type { JsonPrimitive, JsonValue } from '../shared/json-contract.ts'

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
  readonly title: string
  readonly instance_id?: string
  readonly template_id: string
  readonly model?: GenerationRunInputModel
  readonly parameters: Readonly<Record<string, JsonValue>>
  readonly loras: readonly GenerationRunInputLora[]
}

interface AvailableGenerationRunInputBase {
  readonly run_id: string
  readonly lookup_status: 'available'
  readonly arguments: GenerationRunInputArguments
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

export const GENERATION_JSON_CONTRACT = Object.freeze({ keySchema: Schema.string().required() })
export const generationJsonValueSchema = jsonValueSchema(GENERATION_JSON_CONTRACT)
export const generationParametersSchema = jsonObjectSchema(GENERATION_JSON_CONTRACT)
export const generationRunErrorSchema = Schema.object({ code: Schema.string().required(), message: Schema.string().required() }).required()
export const generationRunInputModelSchema = Schema.object({ id: Schema.string().required(), file_name: Schema.string().required() }).default(undefined as never)
export const generationRunInputLoraSchema = Schema.object({
  id: Schema.string().required(), file_name: Schema.string().required(), weight: loraWeightSchema,
  trigger_words: Schema.array(Schema.string().required()).required(),
}).required()
export const generationRunInputArgumentsSchema = contractObject({
  title: Schema.string().required(), instance_id: Schema.string(), template_id: Schema.string().required(),
  model: generationRunInputModelSchema,
  parameters: generationParametersSchema,
  loras: Schema.array(generationRunInputLoraSchema).required(),
}).required()
const availableRunInput = {
  run_id: Schema.string().required(), lookup_status: Schema.const('available').required(),
  arguments: generationRunInputArgumentsSchema,
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

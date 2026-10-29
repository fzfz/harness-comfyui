import Schema from '@deepseek-ai/schemastery'
import { contractObject, requiredNullable } from '../shared/field-contract.ts'
import { generationParametersSchema, generationRunErrorSchema, generationRunLookupErrorSchema } from '../generation/run-input-contract.ts'
import { GENERATION_RUN_STATUSES } from '../generation/run-status.ts'
import type { GenerationRunInputError, JsonValue } from '../generation/run-input-contract.ts'
import type { GenerationRunStatus } from '../generation/run-status.ts'

export interface GenerationRunMediaImage {
  readonly media_id: string
  readonly node_id: string
  readonly output_index: number
  readonly filename: string
  readonly media_type: string
  readonly file_path: string
}

export interface AvailableGenerationRunMedia {
  readonly run_id: string
  readonly request_id: string
  readonly lookup_status: 'available'
  readonly title: string
  readonly status: GenerationRunStatus
  readonly revision: number
  readonly updated_at: number
  readonly instance_id: string | null
  readonly prompt_id: string | null
  readonly run_error: GenerationRunInputError | null
  readonly parameters?: Readonly<Record<string, JsonValue>>
  readonly images: readonly GenerationRunMediaImage[]
}

export interface FailedGenerationRunMedia {
  readonly run_id: string
  readonly lookup_status: 'error'
  readonly error: GenerationRunInputError
}

export type GenerationRunMedia = AvailableGenerationRunMedia | FailedGenerationRunMedia

export interface GenerationRunMediaResult {
  readonly runs: readonly GenerationRunMedia[]
}

export const generationRunMediaImageSchema = Schema.object({
  media_id: Schema.string().required(), node_id: Schema.string().required(), output_index: Schema.natural().required(),
  filename: Schema.string().required(), media_type: Schema.string().required(), file_path: Schema.string().required(),
}).required()
export const generationRunMediaSchema = Schema.union([
  contractObject({
    run_id: Schema.string().required(), request_id: Schema.string().required(), lookup_status: Schema.const('available').required(),
    title: Schema.string().required(), status: Schema.union(GENERATION_RUN_STATUSES).required(), revision: Schema.natural().required(), updated_at: Schema.number().required(),
    instance_id: requiredNullable(Schema.string().required()),
    prompt_id: requiredNullable(Schema.string().required()),
    run_error: requiredNullable(generationRunErrorSchema),
    parameters: Schema(generationParametersSchema).required(false), images: Schema.array(generationRunMediaImageSchema).required(),
  }).required(),
  generationRunLookupErrorSchema,
]).required()
export const generationRunMediaResultSchema = Schema.object({ runs: Schema.array(generationRunMediaSchema).required() }).required() satisfies Schema<any, GenerationRunMediaResult>

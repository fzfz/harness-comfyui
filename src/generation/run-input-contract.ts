export const MAX_RUN_INPUT_QUERY_IDS = 20

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | { readonly [key: string]: JsonValue } | readonly JsonValue[]

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

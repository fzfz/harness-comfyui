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

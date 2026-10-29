import Schema from '@deepseek-ai/schemastery'
import type { JsonValue } from './run-input-contract.ts'

export const GENERATION_ACCEPTANCE_STATUSES = ['accepted', 'reused'] as const
export const generationAcceptanceSchema = Schema.union(GENERATION_ACCEPTANCE_STATUSES).required()
export const generationSubmissionResultSchema = Schema.object({
  items: Schema.array(Schema.object({
    requestId: Schema.string().required(),
    runId: Schema.string().required(),
    acceptance: generationAcceptanceSchema,
  }).required()).required(),
}).required() satisfies Schema<any, GenerationSubmissionResult>
export const RANDOM_SEED_MAX_EXCLUSIVE = 2 ** 31

export interface GenerationLoraSelection {
  readonly id: string
  readonly fileName: string
  readonly weight: number
  readonly triggerWords: readonly string[]
}

export interface GenerationModelSelection {
  readonly id: string
  readonly fileName: string
}

export interface GenerationRequest {
  readonly title: string
  readonly instanceId: string | null
  readonly templateId: string
  readonly model: GenerationModelSelection | null
  readonly parameters: Readonly<Record<string, JsonValue>>
  readonly loras: readonly GenerationLoraSelection[]
}

export interface GenerationSubmissionItem {
  readonly requestId: string
  readonly request: GenerationRequest
}

export interface GenerationSubmissionResult {
  readonly items: readonly {
    readonly requestId: string
    readonly runId: string
    readonly acceptance: typeof GENERATION_ACCEPTANCE_STATUSES[number]
  }[]
}

export const GENERATION_REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isGenerationRequestId(value: unknown): value is string {
  return typeof value === 'string' && GENERATION_REQUEST_ID.test(value)
}

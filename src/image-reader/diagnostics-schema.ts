import Schema from '@deepseek-ai/schemastery'

export const IMAGE_READER_DIAGNOSTIC_STAGES = [
  'preparing', 'input_prepared', 'request_sent', 'response_headers',
  'response_complete', 'completed', 'failed', 'cancelled',
] as const

export interface ImageReaderDiagnostic {
  readonly stage: typeof IMAGE_READER_DIAGNOSTIC_STAGES[number]
  readonly elapsedMs: number
  readonly stageElapsedMs: number
  readonly profileId: string
  readonly model: string
  readonly requestId?: string
}

export const imageReaderDiagnosticSchema = Schema.object({
  stage: Schema.union(IMAGE_READER_DIAGNOSTIC_STAGES.map(value => Schema.const(value))).required(),
  elapsedMs: Schema.number().min(0).required(),
  stageElapsedMs: Schema.number().min(0).required(),
  profileId: Schema.string().min(1).required(),
  model: Schema.string().min(1).required(),
  requestId: Schema.string().min(1),
})

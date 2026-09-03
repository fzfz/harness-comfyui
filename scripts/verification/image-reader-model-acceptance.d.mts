export const IMAGE_READER_MODEL_ACCEPTANCE_TIMEOUT_MS: 60000

export type ImageReaderModelAcceptanceKind =
  | 'stop-success'
  | 'provider-error-finish'
  | 'provider-aborted-finish'
  | 'caller-cancelled'
  | 'timeout-without-output'
  | 'timeout-with-partial-output'
  | 'unexpected-error-code'
  | 'invalid-output'

export interface ImageReaderModelAcceptanceInput {
  readonly timedOut: boolean
  readonly callerErrorName?: string
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
}

export interface ImageReaderModelAcceptanceResult {
  readonly kind: ImageReaderModelAcceptanceKind
  readonly passed: boolean
}

export function classifyImageReaderModelAcceptance(
  input: ImageReaderModelAcceptanceInput,
): ImageReaderModelAcceptanceResult

export class GenerationRuntimeError extends Error {
  readonly code: string
  readonly stage: string | undefined
  readonly operation: string | undefined

  constructor(code: string, message: string, details?: { readonly stage?: string; readonly operation?: string }) {
    super(message)
    this.code = code
    this.stage = details?.stage
    this.operation = details?.operation
    this.name = 'GenerationRuntimeError'
  }
}

export class GenerationSubmissionNotSentError extends GenerationRuntimeError {
  constructor(code: string, message: string) {
    super(code, message)
    this.name = 'GenerationSubmissionNotSentError'
  }
}

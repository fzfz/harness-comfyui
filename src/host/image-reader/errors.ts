import type { ImageReaderErrorCode } from '../../image-reader/contract.ts'
import type { ImageReaderCredentialFailure } from '../../image-reader/credential-schema.ts'

export const IMAGE_READER_FAILURE_DIAGNOSTIC_LIMITS = Object.freeze({
  fieldChars: 96,
  totalChars: 2048,
})

export interface RuntimeImageReaderFailureContext {
  readonly finishKind: 'error' | 'aborted'
  readonly profileId: string
  readonly profileName: string
  readonly connectionType: 'runtime'
  readonly provider: string
  readonly model: string
  readonly temperature: number
  readonly maxTokens: number
  readonly failureCode: string
  readonly failureStatus?: number
  readonly providerRetryAfterMs?: number
  readonly requestId?: string
}

export type RuntimeImageReaderFailureInput = RuntimeImageReaderFailureContext

export interface ImageReaderErrorOptions extends ErrorOptions {
  readonly runtimeFailure?: RuntimeImageReaderFailureContext
  readonly credentialFailure?: ImageReaderCredentialFailure
}

function replaceMalformedUtf16(value: string): string {
  let result = ''
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        result += value[index]! + value[index + 1]!
        index += 1
      } else {
        result += '\uFFFD'
      }
      continue
    }
    result += code >= 0xdc00 && code <= 0xdfff ? '\uFFFD' : value[index]!
  }
  return result
}

export function normalizeImageReaderFailureDiagnosticField(value: string): string {
  const singleLine = replaceMalformedUtf16(value)
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/gu, ' ')
    .trim()
  if (singleLine.length <= IMAGE_READER_FAILURE_DIAGNOSTIC_LIMITS.fieldChars) return singleLine
  let prefix = singleLine.slice(0, IMAGE_READER_FAILURE_DIAGNOSTIC_LIMITS.fieldChars - 1)
  const finalCodeUnit = prefix.charCodeAt(prefix.length - 1)
  const nextCodeUnit = singleLine.charCodeAt(prefix.length)
  if (
    finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff
    && nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff
  ) {
    prefix = prefix.slice(0, -1)
  }
  return `${prefix}…`
}

export function createRuntimeImageReaderFailureContext(
  input: RuntimeImageReaderFailureInput,
): RuntimeImageReaderFailureContext {
  return Object.freeze({
    finishKind: input.finishKind,
    profileId: normalizeImageReaderFailureDiagnosticField(input.profileId),
    profileName: normalizeImageReaderFailureDiagnosticField(input.profileName),
    connectionType: 'runtime',
    provider: normalizeImageReaderFailureDiagnosticField(input.provider),
    model: normalizeImageReaderFailureDiagnosticField(input.model),
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    failureCode: normalizeImageReaderFailureDiagnosticField(input.failureCode),
    ...(Number.isInteger(input.failureStatus) && input.failureStatus! >= 100 && input.failureStatus! <= 599
      ? { failureStatus: input.failureStatus }
      : {}),
    ...(Number.isFinite(input.providerRetryAfterMs) && input.providerRetryAfterMs! > 0
      ? { providerRetryAfterMs: input.providerRetryAfterMs }
      : {}),
    ...(input.requestId === undefined
      ? {}
      : { requestId: normalizeImageReaderFailureDiagnosticField(input.requestId) }),
  })
}

export function runtimeImageReaderFailureMessage(context: RuntimeImageReaderFailureContext): string {
  const json = (value: string) => JSON.stringify(value)
  const fields = [
    `profile_name=${json(context.profileName)}`,
    `profile_id=${json(context.profileId)}`,
    'connection_type="runtime"',
    `provider=${json(context.provider)}`,
    `model=${json(context.model)}`,
    `temperature=${String(context.temperature)}`,
    `max_tokens=${String(context.maxTokens)}`,
    `finish_kind=${json(context.finishKind)}`,
    `failure_code=${json(context.failureCode)}`,
    ...(context.failureStatus === undefined ? [] : [`failure_status=${String(context.failureStatus)}`]),
    ...(context.providerRetryAfterMs === undefined ? [] : [`provider_retry_after_ms=${String(context.providerRetryAfterMs)}`]),
    ...(context.requestId === undefined ? [] : [`request_id=${json(context.requestId)}`]),
  ]
  const message = `The runtime visual model did not complete the image inspection. ${fields.join('; ')}.`
  if (message.length > IMAGE_READER_FAILURE_DIAGNOSTIC_LIMITS.totalChars) {
    throw new RangeError('The image reader failure diagnostic exceeds its fixed total character limit.')
  }
  return message
}

export class ImageReaderError extends Error {
  readonly code: ImageReaderErrorCode
  readonly runtimeFailure?: RuntimeImageReaderFailureContext
  readonly credentialFailure?: ImageReaderCredentialFailure

  constructor(code: ImageReaderErrorCode, message: string, options?: ImageReaderErrorOptions) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'ImageReaderError'
    this.code = code
    this.runtimeFailure = options?.runtimeFailure
    this.credentialFailure = options?.credentialFailure
  }
}

export function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof DOMException && error.name === 'AbortError')
}

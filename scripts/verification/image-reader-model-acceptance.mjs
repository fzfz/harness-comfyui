export const IMAGE_READER_MODEL_ACCEPTANCE_TIMEOUT_MS = 60_000

const JSON_STRING_PATTERN = String.raw`"(?:[^"\\\r\n]|\\.)*"`
const NUMBER_PATTERN = String.raw`-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?`
const PROVIDER_FAILURE_PATTERN = new RegExp(
  String.raw`^IMAGE_READER_PROVIDER_FAILED: The runtime visual model did not complete the image inspection\. profile_name=${JSON_STRING_PATTERN}; profile_id=${JSON_STRING_PATTERN}; connection_type="runtime"; provider=${JSON_STRING_PATTERN}; model=${JSON_STRING_PATTERN}; temperature=${NUMBER_PATTERN}; max_tokens=${NUMBER_PATTERN}; finish_kind="(error|aborted)"; failure_code=${JSON_STRING_PATTERN}(?:; failure_status=\d+)?(?:; provider_retry_after_ms=${NUMBER_PATTERN})?(?:; request_id=${JSON_STRING_PATTERN})?\.$`,
  'iu',
)

function oneOutputLine(value) {
  const withoutFinalNewline = value.endsWith('\n') ? value.slice(0, -1) : value
  return withoutFinalNewline.length > 0 && !/[\r\n\u2028\u2029]/u.test(withoutFinalNewline)
    ? withoutFinalNewline
    : undefined
}

function validInspectionOutput(stdout) {
  const line = oneOutputLine(stdout)
  if (line === undefined) return false
  let value
  try {
    value = JSON.parse(line)
  } catch {
    return false
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(['file_path', 'model', 'observation', 'provider'])) return false
  return typeof value.provider === 'string'
    && typeof value.model === 'string'
    && typeof value.file_path === 'string'
    && typeof value.observation === 'string'
}

export function classifyImageReaderModelAcceptance(input) {
  if (input.timedOut) {
    return Object.freeze({
      kind: input.stdout.length === 0 && input.stderr.length === 0
        ? 'timeout-without-output'
        : 'timeout-with-partial-output',
      passed: false,
    })
  }
  if (input.callerErrorName === 'AbortError') {
    return input.exitCode === null && !input.stderr.includes('IMAGE_READER_PROVIDER_FAILED')
      ? Object.freeze({ kind: 'caller-cancelled', passed: true })
      : Object.freeze({ kind: 'invalid-output', passed: false })
  }
  if (input.exitCode === 0 && input.stderr.length === 0 && validInspectionOutput(input.stdout)) {
    return Object.freeze({ kind: 'stop-success', passed: true })
  }
  const failureLine = input.stdout.length === 0 ? oneOutputLine(input.stderr) : undefined
  if (input.exitCode === 1 && failureLine !== undefined) {
    const providerFailure = PROVIDER_FAILURE_PATTERN.exec(failureLine)
    if (providerFailure?.[1] === 'error') {
      return Object.freeze({ kind: 'provider-error-finish', passed: true })
    }
    if (providerFailure?.[1] === 'aborted') {
      return Object.freeze({ kind: 'provider-aborted-finish', passed: true })
    }
    if (/^[A-Z][A-Z0-9_]*: /u.test(failureLine)) {
      return Object.freeze({ kind: 'unexpected-error-code', passed: false })
    }
  }
  return Object.freeze({ kind: 'invalid-output', passed: false })
}

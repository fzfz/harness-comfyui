import configuration from '../../config/managed-cli-limits.json' with { type: 'json' }

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new TypeError(`Managed CLI ${field} must be a positive integer`)
  }
  return value as number
}

export const CLI_MAX_BODY_BYTES = positiveInteger(configuration.maxRequestBytes, 'maxRequestBytes')
export const GENERATION_MAX_SUBMISSION_ITEMS = positiveInteger(configuration.maxSubmissionItems, 'maxSubmissionItems')

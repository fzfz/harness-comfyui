import type { SaveImageReaderProfileRequest } from './contract.ts'
import {
  IMAGE_READER_API_KEY_MAX_LENGTH,
  IMAGE_READER_ENDPOINT_MAX_LENGTH,
  IMAGE_READER_MAX_PROFILES,
  IMAGE_READER_MAX_TOKENS_MAX,
  IMAGE_READER_MAX_TOKENS_MIN,
  IMAGE_READER_MODEL_MAX_LENGTH,
  IMAGE_READER_PROFILE_ID_PATTERN,
  IMAGE_READER_PROFILE_NAME_MAX_LENGTH,
  IMAGE_READER_PROMPT_MAX_LENGTH,
  IMAGE_READER_PROVIDER_MAX_LENGTH,
  IMAGE_READER_TEMPERATURE_MAX,
  IMAGE_READER_TEMPERATURE_MIN,
} from './settings.ts'

export const IMAGE_READER_SETTINGS_FIELD_BY_CODE = Object.freeze({
  IMAGE_READER_PROFILE_ID_FORMAT_INVALID: 'profile',
  IMAGE_READER_PROFILE_NAME_REQUIRED: 'name',
  IMAGE_READER_PROFILE_NAME_TOO_LONG: 'name',
  IMAGE_READER_RUNTIME_PROVIDER_REQUIRED: 'provider',
  IMAGE_READER_RUNTIME_PROVIDER_TOO_LONG: 'provider',
  IMAGE_READER_ENDPOINT_REQUIRED: 'endpoint',
  IMAGE_READER_ENDPOINT_TOO_LONG: 'endpoint',
  IMAGE_READER_ENDPOINT_WHITESPACE_INVALID: 'endpoint',
  IMAGE_READER_ENDPOINT_URL_INVALID: 'endpoint',
  IMAGE_READER_ENDPOINT_PROTOCOL_INVALID: 'endpoint',
  IMAGE_READER_ENDPOINT_CREDENTIALS_FORBIDDEN: 'endpoint',
  IMAGE_READER_ENDPOINT_FRAGMENT_FORBIDDEN: 'endpoint',
  IMAGE_READER_MODEL_REQUIRED: 'model',
  IMAGE_READER_MODEL_TOO_LONG: 'model',
  IMAGE_READER_DEFAULT_PROMPT_REQUIRED: 'defaultPrompt',
  IMAGE_READER_DEFAULT_PROMPT_TOO_LONG: 'defaultPrompt',
  IMAGE_READER_TEMPERATURE_NUMBER_INVALID: 'temperature',
  IMAGE_READER_TEMPERATURE_RANGE_INVALID: 'temperature',
  IMAGE_READER_MAX_TOKENS_INTEGER_INVALID: 'maxTokens',
  IMAGE_READER_MAX_TOKENS_RANGE_INVALID: 'maxTokens',
  IMAGE_READER_API_KEY_REQUIRED: 'credential',
  IMAGE_READER_API_KEY_TOO_LONG: 'credential',
  IMAGE_READER_PROFILE_LIMIT_REACHED: 'profile',
} as const)

export type ImageReaderProfileValidationCode = keyof typeof IMAGE_READER_SETTINGS_FIELD_BY_CODE
export type ImageReaderSettingsField = typeof IMAGE_READER_SETTINGS_FIELD_BY_CODE[ImageReaderProfileValidationCode]

export class ImageReaderProfileValidationError extends Error {
  readonly code: ImageReaderProfileValidationCode
  readonly field: ImageReaderSettingsField

  constructor(code: ImageReaderProfileValidationCode) {
    super(code)
    this.name = 'ImageReaderProfileValidationError'
    this.code = code
    this.field = IMAGE_READER_SETTINGS_FIELD_BY_CODE[code]
  }
}

function invalid(code: ImageReaderProfileValidationCode): never {
  throw new ImageReaderProfileValidationError(code)
}

export interface ImageReaderProfileValidationContext {
  readonly persistedProfileCount: number
  readonly profileExists: boolean
}

export function validateSaveImageReaderProfileRequest(
  request: SaveImageReaderProfileRequest,
  context: ImageReaderProfileValidationContext,
): void {
  const profile = request.profile
  if (!IMAGE_READER_PROFILE_ID_PATTERN.test(profile.id)) invalid('IMAGE_READER_PROFILE_ID_FORMAT_INVALID')
  if (profile.name.trim().length === 0) invalid('IMAGE_READER_PROFILE_NAME_REQUIRED')
  if (profile.name.length > IMAGE_READER_PROFILE_NAME_MAX_LENGTH) invalid('IMAGE_READER_PROFILE_NAME_TOO_LONG')

  if (profile.connectionType === 'runtime') {
    if (profile.provider.trim().length === 0) invalid('IMAGE_READER_RUNTIME_PROVIDER_REQUIRED')
    if (profile.provider.length > IMAGE_READER_PROVIDER_MAX_LENGTH) invalid('IMAGE_READER_RUNTIME_PROVIDER_TOO_LONG')
  } else {
    if (profile.endpoint.trim().length === 0) invalid('IMAGE_READER_ENDPOINT_REQUIRED')
    if (profile.endpoint.length > IMAGE_READER_ENDPOINT_MAX_LENGTH) invalid('IMAGE_READER_ENDPOINT_TOO_LONG')
    if (profile.endpoint.trim() !== profile.endpoint) invalid('IMAGE_READER_ENDPOINT_WHITESPACE_INVALID')
    let endpoint: URL
    try {
      endpoint = new URL(profile.endpoint)
    } catch {
      invalid('IMAGE_READER_ENDPOINT_URL_INVALID')
    }
    if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') invalid('IMAGE_READER_ENDPOINT_PROTOCOL_INVALID')
    if (endpoint.username.length > 0 || endpoint.password.length > 0) invalid('IMAGE_READER_ENDPOINT_CREDENTIALS_FORBIDDEN')
    if (endpoint.hash.length > 0) invalid('IMAGE_READER_ENDPOINT_FRAGMENT_FORBIDDEN')
  }

  if (profile.model.trim().length === 0) invalid('IMAGE_READER_MODEL_REQUIRED')
  if (profile.model.length > IMAGE_READER_MODEL_MAX_LENGTH) invalid('IMAGE_READER_MODEL_TOO_LONG')
  if (profile.defaultPrompt.trim().length === 0) invalid('IMAGE_READER_DEFAULT_PROMPT_REQUIRED')
  if (profile.defaultPrompt.length > IMAGE_READER_PROMPT_MAX_LENGTH) invalid('IMAGE_READER_DEFAULT_PROMPT_TOO_LONG')
  if (!Number.isFinite(profile.temperature)) invalid('IMAGE_READER_TEMPERATURE_NUMBER_INVALID')
  if (profile.temperature < IMAGE_READER_TEMPERATURE_MIN || profile.temperature > IMAGE_READER_TEMPERATURE_MAX) {
    invalid('IMAGE_READER_TEMPERATURE_RANGE_INVALID')
  }
  if (!Number.isSafeInteger(profile.maxTokens)) invalid('IMAGE_READER_MAX_TOKENS_INTEGER_INVALID')
  if (profile.maxTokens < IMAGE_READER_MAX_TOKENS_MIN || profile.maxTokens > IMAGE_READER_MAX_TOKENS_MAX) {
    invalid('IMAGE_READER_MAX_TOKENS_RANGE_INVALID')
  }
  if ('credential' in request && request.credential.action === 'replace') {
    if (request.credential.apiKey.length === 0) invalid('IMAGE_READER_API_KEY_REQUIRED')
    if (request.credential.apiKey.length > IMAGE_READER_API_KEY_MAX_LENGTH) invalid('IMAGE_READER_API_KEY_TOO_LONG')
  }
  if (!context.profileExists && context.persistedProfileCount >= IMAGE_READER_MAX_PROFILES) {
    invalid('IMAGE_READER_PROFILE_LIMIT_REACHED')
  }
}

export function validateImageReaderProfileId(profileId: string): void {
  if (!IMAGE_READER_PROFILE_ID_PATTERN.test(profileId)) invalid('IMAGE_READER_PROFILE_ID_FORMAT_INVALID')
}

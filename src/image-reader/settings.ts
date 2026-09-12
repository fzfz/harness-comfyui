import bundledProfiles from '../../config/image-reader-profiles.json' with { type: 'json' }
import Schema from '@deepseek-ai/schemastery'

export const IMAGE_READER_CONNECTION_TYPES = Object.freeze(['runtime', 'openai-compatible'] as const)
export type ImageReaderConnectionType = typeof IMAGE_READER_CONNECTION_TYPES[number]

export const IMAGE_READER_MAX_PROFILES = 20
export const IMAGE_READER_PROMPT_MAX_LENGTH = 32_768
export const IMAGE_READER_PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/
export const IMAGE_READER_PROFILE_ID_MAX_LENGTH = 80
export const IMAGE_READER_PROFILE_NAME_MAX_LENGTH = 80
export const IMAGE_READER_PROVIDER_MAX_LENGTH = 10_000
export const IMAGE_READER_ENDPOINT_MAX_LENGTH = 2048
export const IMAGE_READER_MODEL_MAX_LENGTH = 10_000
export const IMAGE_READER_API_KEY_MAX_LENGTH = 8192
export const IMAGE_READER_TEMPERATURE_MIN = 0
export const IMAGE_READER_TEMPERATURE_MAX = 2
export const IMAGE_READER_MAX_TOKENS_MIN = 1
export const IMAGE_READER_MAX_TOKENS_MAX = 32_768
export const IMAGE_READER_DEFAULT_PROFILE_ID = 'default'

export const IMAGE_READER_DEFAULT_PROMPT = bundledProfiles.configuration.profiles.find(profile => profile.id === IMAGE_READER_DEFAULT_PROFILE_ID)!.defaultPrompt

export interface ImageReaderProfile {
  readonly id: string
  readonly name: string
  readonly connectionType: ImageReaderConnectionType
  readonly provider: string
  readonly endpoint: string
  readonly model: string
  readonly hasApiKey: boolean
  readonly defaultPrompt: string
  readonly temperature: number
  readonly maxTokens: number
}

export interface ImageReaderConfiguration {
  readonly activeProfileId: string
  readonly profiles: readonly ImageReaderProfile[]
}

export interface ImageReaderSettingsSection {
  readonly configuration: ImageReaderConfiguration
  readonly credentials: Readonly<Record<string, string>>
}

export interface ImageReaderSettingsView {
  readonly configuration: ImageReaderConfiguration
}

export interface ImageReaderDefaultModel {
  readonly provider: string
  readonly model: string
}

export interface LegacyImageReaderSettingsSection {
  readonly configuration: {
    readonly provider: string
    readonly model: string
    readonly defaultPrompt: string
    readonly temperature: number
    readonly maxTokens: number
  }
}

export const IMAGE_READER_LEGACY_SETTINGS_NAMESPACE = 'harness-comfyui-image-reader'
export const IMAGE_READER_SETTINGS_NAMESPACE = 'harness-comfyui-image-reader-profiles'
export const IMAGE_READER_SETTINGS_SECTION_ID = 'harness-comfyui-image-reader'

export const IMAGE_READER_LEGACY_SETTINGS_DEFAULTS: LegacyImageReaderSettingsSection = Object.freeze({
  configuration: Object.freeze({
    provider: '',
    model: '',
    defaultPrompt: IMAGE_READER_DEFAULT_PROMPT,
    temperature: 0.2,
    maxTokens: 2048,
  }),
})

export function createImageReaderProfile(id: string, name = '默认配置'): ImageReaderProfile {
  return Object.freeze({
    id,
    name,
    connectionType: 'runtime',
    provider: '',
    endpoint: '',
    model: '',
    hasApiKey: false,
    defaultPrompt: IMAGE_READER_DEFAULT_PROMPT,
    temperature: 0.2,
    maxTokens: 2048,
  })
}

export const IMAGE_READER_DEFAULT_PROFILE = createImageReaderProfile(IMAGE_READER_DEFAULT_PROFILE_ID)

export const IMAGE_READER_DEFAULT_CONFIGURATION: ImageReaderConfiguration = Object.freeze({
  activeProfileId: IMAGE_READER_DEFAULT_PROFILE_ID,
  profiles: Object.freeze([IMAGE_READER_DEFAULT_PROFILE]),
})

export const IMAGE_READER_SETTINGS_DEFAULTS: ImageReaderSettingsSection = Object.freeze({
  configuration: IMAGE_READER_DEFAULT_CONFIGURATION,
  credentials: Object.freeze({}),
})

export function createImageReaderSettingsDefaults(
  input: ImageReaderDefaultModel,
): ImageReaderSettingsSection {
  const profile = Object.freeze({
    ...createImageReaderProfile(IMAGE_READER_DEFAULT_PROFILE_ID),
    connectionType: 'runtime' as const,
    provider: input.provider,
    model: input.model,
  })
  return Object.freeze({
    configuration: Object.freeze({
      activeProfileId: IMAGE_READER_DEFAULT_PROFILE_ID,
      profiles: Object.freeze([profile]),
    }),
    credentials: Object.freeze({}),
  })
}

const connectionTypeSchema = Schema.union(IMAGE_READER_CONNECTION_TYPES.map(value => Schema.const(value)))
const imageReaderProfileSchema = Schema.object({
  id: Schema.string().min(1).max(IMAGE_READER_PROFILE_ID_MAX_LENGTH).required(),
  name: Schema.string().min(1).max(IMAGE_READER_PROFILE_NAME_MAX_LENGTH).required(),
  connectionType: connectionTypeSchema.required(),
  provider: Schema.string().max(IMAGE_READER_PROVIDER_MAX_LENGTH).required(),
  endpoint: Schema.string().max(IMAGE_READER_ENDPOINT_MAX_LENGTH).required(),
  model: Schema.string().max(IMAGE_READER_MODEL_MAX_LENGTH).required(),
  hasApiKey: Schema.boolean().required(),
  defaultPrompt: Schema.string().min(1).max(IMAGE_READER_PROMPT_MAX_LENGTH).required(),
  temperature: Schema.number().min(IMAGE_READER_TEMPERATURE_MIN).max(IMAGE_READER_TEMPERATURE_MAX).required(),
  maxTokens: Schema.natural().min(IMAGE_READER_MAX_TOKENS_MIN).max(IMAGE_READER_MAX_TOKENS_MAX).required(),
})

const imageReaderConfigurationSchema = Schema.object({
  activeProfileId: Schema.string().min(1).max(80).required(),
  profiles: Schema.array(imageReaderProfileSchema).min(1).max(IMAGE_READER_MAX_PROFILES).required(),
})

export const IMAGE_READER_LEGACY_SETTINGS_SCHEMA = Schema.object({
  configuration: Schema.object({
    provider: Schema.string().required(),
    model: Schema.string().required(),
    defaultPrompt: Schema.string().min(1).required(),
    temperature: Schema.number().min(IMAGE_READER_TEMPERATURE_MIN).max(IMAGE_READER_TEMPERATURE_MAX).required(),
    maxTokens: Schema.natural().min(IMAGE_READER_MAX_TOKENS_MIN).max(IMAGE_READER_MAX_TOKENS_MAX).required(),
  }).required(),
})

export const IMAGE_READER_SETTINGS_SCHEMA = Schema.object({
  configuration: imageReaderConfigurationSchema.required(),
  credentials: Schema.dict(Schema.string().max(IMAGE_READER_API_KEY_MAX_LENGTH).role('secret')).required(),
})

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function connectionType(value: unknown): value is ImageReaderConnectionType {
  return IMAGE_READER_CONNECTION_TYPES.some(candidate => candidate === value)
}

function decodeImageReaderProfile(value: unknown): ImageReaderProfile | undefined {
  const source = record(value)
  if (
    source === undefined
    || typeof source.id !== 'string'
    || !IMAGE_READER_PROFILE_ID_PATTERN.test(source.id)
    || typeof source.name !== 'string'
    || source.name.trim().length === 0
    || source.name.length > IMAGE_READER_PROFILE_NAME_MAX_LENGTH
    || !connectionType(source.connectionType)
    || typeof source.provider !== 'string'
    || source.provider.length > IMAGE_READER_PROVIDER_MAX_LENGTH
    || typeof source.endpoint !== 'string'
    || source.endpoint.length > IMAGE_READER_ENDPOINT_MAX_LENGTH
    || typeof source.model !== 'string'
    || source.model.length > IMAGE_READER_MODEL_MAX_LENGTH
    || typeof source.hasApiKey !== 'boolean'
    || typeof source.defaultPrompt !== 'string'
    || source.defaultPrompt.trim().length === 0
    || source.defaultPrompt.length > IMAGE_READER_PROMPT_MAX_LENGTH
    || typeof source.temperature !== 'number'
    || !Number.isFinite(source.temperature)
    || source.temperature < IMAGE_READER_TEMPERATURE_MIN
    || source.temperature > IMAGE_READER_TEMPERATURE_MAX
    || typeof source.maxTokens !== 'number'
    || !Number.isSafeInteger(source.maxTokens)
    || source.maxTokens < IMAGE_READER_MAX_TOKENS_MIN
    || source.maxTokens > IMAGE_READER_MAX_TOKENS_MAX
  ) return undefined
  return Object.freeze({
    id: source.id,
    name: source.name,
    connectionType: source.connectionType,
    provider: source.provider,
    endpoint: source.endpoint,
    model: source.model,
    hasApiKey: source.hasApiKey,
    defaultPrompt: source.defaultPrompt,
    temperature: source.temperature,
    maxTokens: source.maxTokens,
  })
}

export function decodeImageReaderConfiguration(value: unknown): ImageReaderConfiguration | undefined {
  const source = record(value)
  if (
    source === undefined
    || typeof source.activeProfileId !== 'string'
    || !Array.isArray(source.profiles)
    || source.profiles.length < 1
    || source.profiles.length > IMAGE_READER_MAX_PROFILES
  ) return undefined
  const profiles: ImageReaderProfile[] = []
  const ids = new Set<string>()
  for (const value of source.profiles) {
    const profile = decodeImageReaderProfile(value)
    if (profile === undefined || ids.has(profile.id)) return undefined
    ids.add(profile.id)
    profiles.push(profile)
  }
  if (!ids.has(source.activeProfileId)) return undefined
  return Object.freeze({
    activeProfileId: source.activeProfileId,
    profiles: Object.freeze(profiles),
  })
}

export function decodeImageReaderSettingsView(value: unknown): ImageReaderSettingsView | undefined {
  const source = record(value)
  const configuration = decodeImageReaderConfiguration(source?.configuration)
  return configuration === undefined ? undefined : Object.freeze({ configuration })
}

export function activeImageReaderProfile(configuration: ImageReaderConfiguration): ImageReaderProfile {
  const profile = configuration.profiles.find(candidate => candidate.id === configuration.activeProfileId)
  if (profile === undefined) throw new TypeError('Image reader active profile does not exist.')
  return profile
}

export function migrateLegacyImageReaderSettings(
  legacy: LegacyImageReaderSettingsSection,
): ImageReaderSettingsSection {
  const configuration = legacy.configuration
  const profile = Object.freeze({
    ...createImageReaderProfile(IMAGE_READER_DEFAULT_PROFILE_ID, '原图片读取配置'),
    provider: configuration.provider,
    model: configuration.model,
    defaultPrompt: configuration.defaultPrompt,
    temperature: configuration.temperature,
    maxTokens: configuration.maxTokens,
  })
  return Object.freeze({
    configuration: Object.freeze({
      activeProfileId: profile.id,
      profiles: Object.freeze([profile]),
    }),
    credentials: Object.freeze({}),
  })
}

function validHttpEndpoint(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && url.username.length === 0
      && url.password.length === 0
      && url.hash.length === 0
  } catch {
    return false
  }
}

export function validateImageReaderConfiguration(configuration: ImageReaderConfiguration): void {
  const decoded = decodeImageReaderConfiguration(configuration)
  if (decoded === undefined) throw new TypeError('Image reader configuration is invalid.')
  for (const profile of decoded.profiles) {
    if (profile.connectionType === 'runtime') {
      if (
        profile.provider.trim().length === 0
        || profile.model.trim().length === 0
        || profile.endpoint.length !== 0
        || profile.hasApiKey
      ) throw new TypeError(`Image reader runtime profile "${profile.name}" is invalid.`)
      continue
    }
    if (
      profile.provider.length !== 0
      || profile.endpoint.trim() !== profile.endpoint
      || !validHttpEndpoint(profile.endpoint)
      || profile.model.trim().length === 0
    ) throw new TypeError(`Image reader OpenAI-compatible profile "${profile.name}" is invalid.`)
  }
}

export function validateImageReaderSettingsSection(section: ImageReaderSettingsSection): void {
  const configuration = decodeImageReaderConfiguration(section.configuration)
  if (configuration === undefined) throw new TypeError('Image reader settings are invalid.')
  const profileById = new Map(configuration.profiles.map(profile => [profile.id, profile]))
  for (const [profileId, apiKey] of Object.entries(section.credentials)) {
    const profile = profileById.get(profileId)
    if (profile === undefined || profile.connectionType !== 'openai-compatible' || apiKey.length === 0 || apiKey.length > IMAGE_READER_API_KEY_MAX_LENGTH) {
      throw new TypeError('Image reader credentials are invalid.')
    }
  }
  for (const profile of configuration.profiles) {
    if (profile.hasApiKey !== (section.credentials[profile.id] !== undefined)) {
      throw new TypeError('Image reader credential state is inconsistent.')
    }
  }
}

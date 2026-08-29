import Schema from '@deepseek-ai/schemastery'

export interface ImageReaderSettings {
  readonly provider: string
  readonly model: string
  readonly defaultPrompt: string
  readonly temperature: number
  readonly maxTokens: number
}

export interface ImageReaderSettingsSection {
  readonly configuration: ImageReaderSettings
}

export const IMAGE_READER_SETTINGS_NAMESPACE = 'harness-comfyui-image-reader'
export const IMAGE_READER_SETTINGS_SECTION_ID = IMAGE_READER_SETTINGS_NAMESPACE

export const IMAGE_READER_DEFAULTS: ImageReaderSettings = Object.freeze({
  provider: '',
  model: '',
  defaultPrompt: '请准确描述图片中的主体、构图、姿态、服装、环境、光线、风格、明显缺陷和可见文字。只报告图片中可以观察到的内容。',
  temperature: 0.2,
  maxTokens: 2048,
})

export const IMAGE_READER_SETTINGS_DEFAULTS: ImageReaderSettingsSection = Object.freeze({
  configuration: IMAGE_READER_DEFAULTS,
})

const imageReaderConfigurationSchema = Schema.object({
  provider: Schema.string().required(),
  model: Schema.string().required(),
  defaultPrompt: Schema.string().min(1).required(),
  temperature: Schema.number().min(0).max(2).required(),
  maxTokens: Schema.natural().min(1).max(32768).required(),
})

export const IMAGE_READER_SETTINGS_SCHEMA = Schema.object({
  configuration: imageReaderConfigurationSchema.required(),
})

export function decodeImageReaderSettings(value: unknown): ImageReaderSettings | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const source = value as Record<string, unknown>
  if (
    typeof source.provider !== 'string'
    || typeof source.model !== 'string'
    || typeof source.defaultPrompt !== 'string'
    || source.defaultPrompt.trim().length === 0
    || typeof source.temperature !== 'number'
    || !Number.isFinite(source.temperature)
    || source.temperature < 0
    || source.temperature > 2
    || typeof source.maxTokens !== 'number'
    || !Number.isSafeInteger(source.maxTokens)
    || source.maxTokens < 1
    || source.maxTokens > 32768
  ) return undefined
  return Object.freeze({
    provider: source.provider,
    model: source.model,
    defaultPrompt: source.defaultPrompt,
    temperature: source.temperature,
    maxTokens: source.maxTokens,
  })
}

export function decodeImageReaderSettingsSection(value: unknown): ImageReaderSettingsSection | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const configuration = decodeImageReaderSettings((value as Record<string, unknown>).configuration)
  if (configuration === undefined) return undefined
  return Object.freeze({ configuration })
}

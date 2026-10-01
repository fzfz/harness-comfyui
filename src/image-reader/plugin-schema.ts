import runtime from '../../config/image-reader-runtime.json' with { type: 'json' }
import Schema from '@deepseek-ai/schemastery'
import type { Volatile } from '@deepseek-ai/cordis'
import { imageReaderConfigurationSchema, imageReaderCredentialsSchema, type ImageReaderDefaultModel, type ImageReaderSettingsSection } from './settings.ts'

export const imageReaderRuntimeSchema = Schema.object({
  shutdownTimeoutMs: Schema.natural().min(1).required(),
  diagnosticLogFormat: Schema.string().min(1).required(),
  credentialReferencePrefix: Schema.string().min(1).pattern(/^[A-Za-z_][A-Za-z0-9_]*$/u).required(),
})
imageReaderRuntimeSchema(runtime)

export interface Config {
  readonly shutdownTimeoutMs?: number
  readonly imageReaderDefaultModel?: ImageReaderDefaultModel
  readonly configuration?: Volatile<ImageReaderSettingsSection['configuration']>
  readonly credentialRefs?: Volatile<ImageReaderSettingsSection['credentialRefs']>
}
export const Config = Schema.object({
  shutdownTimeoutMs: Schema.natural().min(1).default(runtime.shutdownTimeoutMs),
  imageReaderDefaultModel: Schema.object({ provider: Schema.string().max(10_000).required(), model: Schema.string().min(1).max(10_000).required() }).default(undefined as never),
  configuration: imageReaderConfigurationSchema.default(undefined as never).volatile(),
  credentialRefs: imageReaderCredentialsSchema.default(undefined as never).volatile(),
})

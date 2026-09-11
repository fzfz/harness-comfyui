import runtime from '../../config/image-reader-runtime.json' with { type: 'json' }
import Schema from '@deepseek-ai/schemastery'
import type { ImageReaderDefaultModel } from './settings.ts'

export interface Config { readonly shutdownTimeoutMs?: number; readonly imageReaderDefaultModel?: ImageReaderDefaultModel }
export const Config = Schema.object({
  shutdownTimeoutMs: Schema.natural().min(1).default(runtime.shutdownTimeoutMs),
  imageReaderDefaultModel: Schema.object({ provider: Schema.string().max(10_000).required(), model: Schema.string().min(1).max(10_000).required() }).default(undefined as never),
})

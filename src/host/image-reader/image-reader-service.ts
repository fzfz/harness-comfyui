import { basename, isAbsolute } from 'node:path'
import { open } from 'node:fs/promises'

import type { ImageAttachmentLimits, ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import { createUserMessage, type LlmCallConfig, type PreparedLlmCall, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'

import type { ImageReaderSettingsSection } from '../../image-reader/settings.ts'
import { ImageReaderError, isAbortError } from './errors.ts'

export interface ImageInspection {
  readonly provider: string
  readonly model: string
  readonly filePath: string
  readonly observation: string
}

export interface ImageReaderServiceOptions {
  readonly scope: Pick<SettingsScope<ImageReaderSettingsSection>, 'get'>
  readonly attachments: {
    readonly imageLimits: ImageAttachmentLimits
    saveImage(input: { readonly data: Uint8Array; readonly mediaType: ImageMediaType; readonly name?: string }): Promise<ImageAttachmentRef>
  }
  readonly llm: {
    prepareCall(config: LlmCallConfig, signal?: AbortSignal): Promise<PreparedLlmCall>
  }
}

function abort(signal?: AbortSignal): never {
  throw signal?.reason instanceof Error ? signal.reason : new DOMException('Image inspection was cancelled.', 'AbortError')
}

function imageMediaType(data: Uint8Array): ImageMediaType | undefined {
  if (
    data.length >= 8
    && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47
    && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a
  ) return 'image/png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  const ascii = (offset: number, value: string) => value
    .split('')
    .every((character, index) => data[offset + index] === character.charCodeAt(0))
  if (data.length >= 6 && (ascii(0, 'GIF87a') || ascii(0, 'GIF89a'))) return 'image/gif'
  if (data.length >= 12 && ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp'
  return undefined
}

async function imageInput(
  filePath: string,
  maxImageBytes: number,
  signal?: AbortSignal,
): Promise<{ data: Uint8Array; mediaType: ImageMediaType; name: string }> {
  if (signal?.aborted === true) abort(signal)
  if (!isAbsolute(filePath)) {
    throw new ImageReaderError('IMAGE_READER_FILE_INVALID', 'The image path must be an absolute path to a PNG, JPEG, WebP, or GIF file.')
  }
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(filePath, 'r')
    const file = await handle.stat()
    if (!file.isFile() || file.size < 1 || file.size > maxImageBytes) throw new Error('invalid image file size')
    const data = new Uint8Array(file.size)
    let offset = 0
    while (offset < data.byteLength) {
      signal?.throwIfAborted()
      const { bytesRead } = await handle.read(data, offset, data.byteLength - offset, offset)
      if (bytesRead === 0) throw new Error('image file changed while reading')
      offset += bytesRead
    }
    const mediaType = imageMediaType(data)
    if (mediaType === undefined) throw new Error('unsupported image signature')
    return { data, mediaType, name: basename(filePath) }
  } catch (error) {
    if (isAbortError(error, signal)) abort(signal)
    throw new ImageReaderError('IMAGE_READER_FILE_INVALID', 'The image file could not be read.', { cause: error })
  } finally {
    await handle?.close()
  }
}

function preparedOptions(prepared: PreparedLlmCall, messages: ReturnType<typeof createUserMessage>[]) {
  return {
    ...prepared.config,
    messages,
  }
}

async function observation(prepared: PreparedLlmCall, messages: ReturnType<typeof createUserMessage>[], signal?: AbortSignal): Promise<string> {
  const deltas: string[] = []
  const completed: string[] = []
  try {
    for await (const chunk of prepared.stream({ ...preparedOptions(prepared, messages), signal })) {
      const value = chunk as StreamChunk
      if (value.type === 'text-delta') deltas.push(value.text)
      if (value.type === 'block-end' && value.block.type === 'text') completed.push(value.block.text)
      if (value.type === 'finish' && (value.reason.kind === 'error' || value.reason.kind === 'aborted')) {
        if (value.reason.kind === 'aborted' && signal?.aborted === true) abort(signal)
        throw new ImageReaderError('IMAGE_READER_PROVIDER_FAILED', 'The configured visual model did not complete the image inspection.')
      }
    }
  } catch (error) {
    if (isAbortError(error, signal)) abort(signal)
    if (error instanceof ImageReaderError) throw error
    throw new ImageReaderError('IMAGE_READER_PROVIDER_FAILED', 'The configured visual model failed while inspecting the image.', { cause: error })
  }
  const result = (deltas.length > 0 ? deltas.join('') : completed.join('\n')).trim()
  if (result.length === 0) {
    throw new ImageReaderError('IMAGE_READER_EMPTY_RESPONSE', 'The configured visual model returned no image observation.')
  }
  return result
}

export class ImageReaderService {
  private readonly options: ImageReaderServiceOptions

  constructor(options: ImageReaderServiceOptions) {
    this.options = options
  }

  async inspect(filePath: string, prompt?: string, signal?: AbortSignal): Promise<ImageInspection> {
    const settings = this.options.scope.get().configuration
    if (settings.provider.trim().length === 0 || settings.model.trim().length === 0) {
      throw new ImageReaderError('IMAGE_READER_MODEL_NOT_CONFIGURED', 'Image reading requires a configured provider and visual model.')
    }
    const input = await imageInput(filePath, this.options.attachments.imageLimits.maxImageBytes, signal)
    let attachment: ImageAttachmentRef
    try {
      attachment = await this.options.attachments.saveImage(input)
    } catch (error) {
      if (isAbortError(error, signal)) abort(signal)
      throw new ImageReaderError('IMAGE_READER_ATTACHMENT_FAILED', 'The image could not be admitted into Harness attachment storage.', { cause: error })
    }
    const config = {
      provider: settings.provider,
      model: settings.model,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
    }
    let prepared: PreparedLlmCall
    try {
      prepared = await this.options.llm.prepareCall(config, signal)
    } catch (error) {
      if (isAbortError(error, signal)) abort(signal)
      throw new ImageReaderError('IMAGE_READER_MODEL_UNAVAILABLE', 'The configured visual model is unavailable.', { cause: error })
    }
    if (prepared.inputModalities?.includes('image') !== true) {
      throw new ImageReaderError('IMAGE_READER_MODEL_IMAGE_UNSUPPORTED', 'The configured model does not declare image input capability.')
    }
    const effectivePrompt = prompt?.trim() || settings.defaultPrompt
    const messages = [createUserMessage({
      content: [
        { type: 'text', text: effectivePrompt },
        { type: 'image', attachment },
      ],
      source: { kind: 'plugin', plugin: 'harness-comfyui' },
    })]
    return Object.freeze({
      provider: prepared.config.provider,
      model: prepared.config.model,
      filePath,
      observation: await observation(prepared, messages, signal),
    })
  }
}

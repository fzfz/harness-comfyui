import { Buffer } from 'node:buffer'
import { basename, isAbsolute } from 'node:path'
import { open } from 'node:fs/promises'

import type { ImageAttachmentLimits, ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import { createUserMessage, type LlmCallConfig, type PreparedLlmCall, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'

import {
  activeImageReaderProfile,
  IMAGE_READER_PROMPT_MAX_LENGTH,
  type ImageReaderProfile,
  type ImageReaderSettingsSection,
} from '../../image-reader/settings.ts'
import {
  ImageReaderError,
  createRuntimeImageReaderFailureContext,
  isAbortError,
  runtimeImageReaderFailureMessage,
} from './errors.ts'

const IMAGE_READER_MAX_RESPONSE_BYTES = 1_048_576

export interface ImageInspection {
  readonly provider: string
  readonly model: string
  readonly filePath: string
  readonly observation: string
}

export interface ImageInspectionOptions {
  readonly sessionId?: string
  readonly prompt?: string
  readonly signal?: AbortSignal
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
  readonly fetch?: typeof globalThis.fetch
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

async function observation(
  prepared: PreparedLlmCall,
  messages: ReturnType<typeof createUserMessage>[],
  profile: ImageReaderProfile,
  sessionId: string | undefined,
  signal?: AbortSignal,
): Promise<string> {
  const deltas: string[] = []
  const completed: string[] = []
  try {
    for await (const chunk of prepared.stream({
      ...preparedOptions(prepared, messages),
      ...(sessionId === undefined ? {} : { sessionId: sessionId as SessionId }),
      signal,
    })) {
      const value = chunk as StreamChunk
      if (value.type === 'text-delta') deltas.push(value.text)
      if (value.type === 'block-end' && value.block.type === 'text') completed.push(value.block.text)
      if (value.type === 'finish' && (value.reason.kind === 'error' || value.reason.kind === 'aborted')) {
        if (value.reason.kind === 'aborted' && signal?.aborted === true) abort(signal)
        const failure = value.reason.failure
        const runtimeFailure = createRuntimeImageReaderFailureContext({
          finishKind: value.reason.kind,
          profileId: profile.id,
          profileName: profile.name,
          connectionType: 'runtime',
          provider: profile.provider,
          model: profile.model,
          temperature: profile.temperature,
          maxTokens: profile.maxTokens,
          failureCode: failure.code,
          failureStatus: failure.status,
          providerRetryAfterMs: failure.providerRetryAfterMs,
          requestId: failure.requestId,
        })
        throw new ImageReaderError(
          'IMAGE_READER_PROVIDER_FAILED',
          runtimeImageReaderFailureMessage(runtimeFailure),
          { runtimeFailure },
        )
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

function responseRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function chatCompletionText(value: unknown): string | undefined {
  const body = responseRecord(value)
  const choice = Array.isArray(body?.choices) ? responseRecord(body.choices[0]) : undefined
  const message = responseRecord(choice?.message)
  return typeof message?.content === 'string' ? message.content.trim() : undefined
}

function declaredResponseBytes(response: Response): number | undefined {
  const value = response.headers.get('content-length')
  if (value === null || !/^\d+$/.test(value)) return undefined
  const bytes = Number(value)
  return Number.isSafeInteger(bytes) ? bytes : undefined
}

async function limitedResponseJson(response: Response, signal?: AbortSignal): Promise<unknown> {
  if ((declaredResponseBytes(response) ?? 0) > IMAGE_READER_MAX_RESPONSE_BYTES) {
    throw new ImageReaderError(
      'IMAGE_READER_PROVIDER_FAILED',
      'The configured OpenAI-compatible endpoint returned a response larger than 1 MiB.',
    )
  }
  signal?.throwIfAborted()
  const reader = response.body?.getReader()
  if (reader === undefined) {
    throw new ImageReaderError(
      'IMAGE_READER_PROVIDER_FAILED',
      'The configured OpenAI-compatible endpoint returned invalid JSON.',
    )
  }
  const chunks: Uint8Array[] = []
  let bytes = 0
  const cancelReader = () => { void reader.cancel(signal?.reason).catch(String) }
  signal?.addEventListener('abort', cancelReader, { once: true })
  try {
    while (true) {
      signal?.throwIfAborted()
      const next = await reader.read()
      signal?.throwIfAborted()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > IMAGE_READER_MAX_RESPONSE_BYTES) {
        void reader.cancel().catch(String)
        throw new ImageReaderError(
          'IMAGE_READER_PROVIDER_FAILED',
          'The configured OpenAI-compatible endpoint returned a response larger than 1 MiB.',
        )
      }
      chunks.push(next.value)
    }
    const body = new Uint8Array(bytes)
    let offset = 0
    for (const chunk of chunks) {
      body.set(chunk, offset)
      offset += chunk.byteLength
    }
    const result = JSON.parse(new TextDecoder().decode(body)) as unknown
    signal?.throwIfAborted()
    return result
  } catch (error) {
    if (isAbortError(error, signal)) abort(signal)
    if (error instanceof ImageReaderError) throw error
    throw new ImageReaderError(
      'IMAGE_READER_PROVIDER_FAILED',
      'The configured OpenAI-compatible endpoint returned invalid JSON.',
      { cause: error },
    )
  } finally {
    signal?.removeEventListener('abort', cancelReader)
    reader.releaseLock()
  }
}

export class ImageReaderService {
  private readonly options: ImageReaderServiceOptions
  private readonly fetch: typeof globalThis.fetch

  constructor(options: ImageReaderServiceOptions) {
    this.options = options
    this.fetch = options.fetch ?? globalThis.fetch
  }

  async inspect(filePath: string, options: ImageInspectionOptions = {}): Promise<ImageInspection> {
    const { prompt, signal } = options
    const settings = this.options.scope.get()
    const profile = activeImageReaderProfile(settings.configuration)
    if (
      profile.model.trim().length === 0
      || (profile.connectionType === 'runtime' && profile.provider.trim().length === 0)
      || (profile.connectionType === 'openai-compatible' && profile.endpoint.trim().length === 0)
    ) {
      throw new ImageReaderError('IMAGE_READER_MODEL_NOT_CONFIGURED', 'Image reading requires a configured provider and visual model.')
    }
    if (prompt !== undefined && prompt.trim().length === 0) {
      throw new ImageReaderError('IMAGE_READER_PROMPT_REQUIRED', 'The per-call image reading prompt must contain non-whitespace text.')
    }
    if (prompt !== undefined && prompt.length > IMAGE_READER_PROMPT_MAX_LENGTH) {
      throw new ImageReaderError(
        'IMAGE_READER_PROMPT_TOO_LONG',
        `The per-call image reading prompt must contain at most ${IMAGE_READER_PROMPT_MAX_LENGTH} characters.`,
      )
    }
    const inspectionPrompt = prompt ?? profile.defaultPrompt
    const input = await imageInput(filePath, this.options.attachments.imageLimits.maxImageBytes, signal)
    if (profile.connectionType === 'openai-compatible') {
      return this.inspectOpenAiCompatible(profile, settings.credentials[profile.id], input, filePath, inspectionPrompt, signal)
    }
    return this.inspectRuntime(profile, input, filePath, inspectionPrompt, options.sessionId, signal)
  }

  private async inspectRuntime(
    profile: ImageReaderProfile,
    input: Awaited<ReturnType<typeof imageInput>>,
    filePath: string,
    prompt: string,
    sessionId: string | undefined,
    signal?: AbortSignal,
  ): Promise<ImageInspection> {
    let attachment: ImageAttachmentRef
    try {
      attachment = await this.options.attachments.saveImage(input)
    } catch (error) {
      if (isAbortError(error, signal)) abort(signal)
      throw new ImageReaderError('IMAGE_READER_ATTACHMENT_FAILED', 'The image could not be admitted into Harness attachment storage.', { cause: error })
    }
    const config = {
      provider: profile.provider,
      model: profile.model,
      temperature: profile.temperature,
      maxTokens: profile.maxTokens,
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
    const messages = [createUserMessage({
      content: [
        { type: 'text', text: prompt },
        { type: 'image', attachment },
      ],
      source: { kind: 'plugin', plugin: 'harness-comfyui' },
    })]
    return Object.freeze({
      provider: prepared.config.provider,
      model: prepared.config.model,
      filePath,
      observation: await observation(prepared, messages, profile, sessionId, signal),
    })
  }

  private async inspectOpenAiCompatible(
    profile: ImageReaderProfile,
    apiKey: string | undefined,
    input: Awaited<ReturnType<typeof imageInput>>,
    filePath: string,
    prompt: string,
    signal?: AbortSignal,
  ): Promise<ImageInspection> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey !== undefined) headers.Authorization = `Bearer ${apiKey}`
    let response: Response
    try {
      response = await this.fetch(profile.endpoint, {
        method: 'POST',
        headers,
        signal,
        body: JSON.stringify({
          model: profile.model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${input.mediaType};base64,${Buffer.from(input.data).toString('base64')}` } },
            ],
          }],
          temperature: profile.temperature,
          max_tokens: profile.maxTokens,
        }),
      })
    } catch (error) {
      if (isAbortError(error, signal)) abort(signal)
      throw new ImageReaderError(
        'IMAGE_READER_PROVIDER_FAILED',
        'The configured OpenAI-compatible endpoint could not be reached.',
        { cause: error },
      )
    }
    if (!response.ok) {
      throw new ImageReaderError(
        'IMAGE_READER_PROVIDER_FAILED',
        `The configured OpenAI-compatible endpoint returned HTTP ${response.status}.`,
      )
    }
    const body = await limitedResponseJson(response, signal)
    const result = chatCompletionText(body)
    if (result === undefined) {
      throw new ImageReaderError(
        'IMAGE_READER_PROVIDER_FAILED',
        'The configured OpenAI-compatible endpoint returned an invalid Chat Completions response.',
      )
    }
    if (result.length === 0) {
      throw new ImageReaderError('IMAGE_READER_EMPTY_RESPONSE', 'The configured visual model returned no image observation.')
    }
    return Object.freeze({
      provider: 'openai-compatible',
      model: profile.model,
      filePath,
      observation: result,
    })
  }
}

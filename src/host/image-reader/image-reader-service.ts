import { imageReaderDiagnosticSchema, type ImageReaderDiagnostic } from '../../image-reader/diagnostics-schema.ts'

import type { ImageAttachmentLimits, ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import { createUserMessage, type LlmCallConfig, type PreparedLlmCall, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'harness-comfyui-image-reader': { kind: 'harness-comfyui-image-reader' }
  }
}

import {
  activeImageReaderProfile,
  IMAGE_READER_PROMPT_MAX_LENGTH,
  type ImageReaderProfile,
} from '../../image-reader/settings.ts'
import {
  ImageReaderError,
  createRuntimeImageReaderFailureContext,
  isAbortError,
  runtimeImageReaderFailureMessage,
} from './errors.ts'
import { prepareImageReaderInput, type PreparedImageReaderInput } from './image-reader-input.ts'
import type { ImageReaderSettingsStore } from './settings-registration.ts'

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
  readonly scope: Pick<ImageReaderSettingsStore, 'get' | 'prepare'>
  readonly prepareInput?: typeof prepareImageReaderInput
  readonly attachments: {
    readonly imageLimits: ImageAttachmentLimits
    saveImage(input: { readonly data: Uint8Array; readonly mediaType: ImageMediaType; readonly name?: string }): Promise<ImageAttachmentRef>
  }
  readonly llm: {
    prepareCall(config: LlmCallConfig, signal?: AbortSignal): Promise<PreparedLlmCall>
  }
  readonly onDiagnostic?: (record: ImageReaderDiagnostic) => void
}

function abort(signal?: AbortSignal): never {
  throw signal?.reason instanceof Error ? signal.reason : new DOMException('Image inspection was cancelled.', 'AbortError')
}

function ensureNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) abort(signal)
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
      if (value.type === 'finish' && value.reason.kind === 'max-tokens') {
        throw new ImageReaderError('IMAGE_READER_OUTPUT_LIMIT', 'The image observation reached the output limit. Increase maxTokens and retry.')
      }
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

export class ImageReaderService {
  private readonly options: ImageReaderServiceOptions

  constructor(options: ImageReaderServiceOptions) {
    this.options = options
  }

  async inspect(filePath: string, options: ImageInspectionOptions = {}): Promise<ImageInspection> {
    const { prompt, signal } = options
    ensureNotAborted(signal)
    let profile = activeImageReaderProfile(this.options.scope.get().configuration)
    if (profile.model.trim().length === 0 || (profile.provider.trim().length === 0 && this.options.scope.prepare === undefined)) {
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
    const started = performance.now()
    let previous = started
    let requestId: string | undefined
    const emit = (stage: ImageReaderDiagnostic['stage'], providerRequestId?: string) => {
      if (providerRequestId !== undefined && providerRequestId.length > 0) requestId = providerRequestId
      const now = performance.now()
      const record: ImageReaderDiagnostic = {
        stage, elapsedMs: now - started, stageElapsedMs: now - previous,
        profileId: profile.id, model: profile.model,
        ...(requestId === undefined ? {} : { requestId }),
      }
      previous = now
      imageReaderDiagnosticSchema(record)
      this.options.onDiagnostic?.(Object.freeze(record))
    }
    emit('preparing')
    try {
      if (this.options.scope.prepare !== undefined) {
        await this.options.scope.prepare(signal)
        profile = activeImageReaderProfile(this.options.scope.get().configuration)
      }
      if (profile.model.trim().length === 0 || profile.provider.trim().length === 0) {
        throw new ImageReaderError('IMAGE_READER_MODEL_NOT_CONFIGURED', 'Image reading requires a configured provider and visual model.')
      }
      const inspectionPrompt = prompt ?? profile.defaultPrompt
      const input = await (this.options.prepareInput ?? prepareImageReaderInput)(
        filePath, this.options.attachments.imageLimits.maxImageBytes, signal,
      )
      emit('input_prepared')
      const result = await this.inspectRuntime(profile, input, filePath, inspectionPrompt, options.sessionId, emit, signal)
      emit('completed')
      return result
    } catch (error) {
      const providerRequestId = error instanceof ImageReaderError ? error.runtimeFailure?.requestId : undefined
      emit(isAbortError(error, signal) ? 'cancelled' : 'failed', providerRequestId)
      throw error
    }
  }

  private async inspectRuntime(
    profile: ImageReaderProfile,
    input: PreparedImageReaderInput,
    filePath: string,
    prompt: string,
    sessionId: string | undefined,
    emit: (stage: ImageReaderDiagnostic['stage'], requestId?: string) => void,
    signal?: AbortSignal,
  ): Promise<ImageInspection> {
    let attachment: ImageAttachmentRef
    try {
      ensureNotAborted(signal)
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
      ensureNotAborted(signal)
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
      source: { kind: 'harness-comfyui-image-reader' },
    })]
    ensureNotAborted(signal)
    emit('request_sent')
    return Object.freeze({
      provider: prepared.config.provider,
      model: prepared.config.model,
      filePath,
      observation: await observation(prepared, messages, profile, sessionId, signal),
    })
  }

}

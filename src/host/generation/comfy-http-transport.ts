import { randomUUID } from 'node:crypto'
import { ERROR_CATALOG } from '../../../config/error-catalog-schema.ts'

import type { GenerationMediaKind } from '../../generation/contract.ts'

import {
  GenerationRuntimeError,
  GenerationSubmissionNotSentError,
  type GenerationObservation,
  type GenerationOutputDescriptor,
  type GenerationTransport,
} from './generation-runtime.ts'
import { comfyInstanceOrigin, type ComfyInstanceSource, type GenerationSource } from './source-preparer.ts'

const PROMPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

export interface ComfyHttpTransportOptions {
  readonly source: GenerationSource
  readonly fetchImplementation?: typeof fetch
  readonly timeoutMs?: number
  readonly maxMediaBytes?: number
}

class ComfyHttpError extends GenerationRuntimeError {
  readonly status: number | null

  constructor(code: string, message: string, status: number | null = null) {
    super(code, message)
    this.status = status
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new GenerationRuntimeError('COMFYUI_PROTOCOL_ERROR', `${label} is invalid.`)
  }
  return value as Record<string, unknown>
}

function validatePromptId(value: string): void {
  if (!PROMPT_ID.test(value)) throw new TypeError('ComfyUI prompt id is invalid.')
}

function outputDescriptor(
  value: unknown,
  nodeId: string,
  outputIndex: number,
  mediaKind: GenerationMediaKind,
): GenerationOutputDescriptor | null {
  const source = record(value, 'ComfyUI output descriptor')
  if (source.type === 'temp') return null
  if (
    typeof source.filename !== 'string'
    || source.filename.length === 0
    || source.filename.includes('/')
    || source.filename.includes('\\')
    || source.filename.includes('..')
    || typeof source.subfolder !== 'string'
    || source.subfolder.startsWith('/')
    || source.subfolder.includes('\\')
    || source.subfolder.includes('..')
    || source.type !== 'output'
  ) {
    throw new GenerationRuntimeError('COMFYUI_OUTPUT_INVALID', 'ComfyUI returned an invalid output media descriptor.')
  }
  return Object.freeze({
    nodeId,
    outputIndex,
    mediaKind,
    filename: source.filename,
    subfolder: source.subfolder,
    type: 'output',
  })
}

function normalizeOutputs(value: unknown, outputNodeIds: readonly string[]): readonly GenerationOutputDescriptor[] {
  const source = record(value, 'ComfyUI outputs')
  const allowed = new Set(outputNodeIds)
  const outputs: GenerationOutputDescriptor[] = []
  for (const nodeId of Object.keys(source).sort()) {
    if (!allowed.has(nodeId)) continue
    const node = record(source[nodeId], `ComfyUI output node "${nodeId}"`)
    const collections: readonly [GenerationMediaKind, 'images' | 'video'][] = [
      ['image', 'images'],
      ['video', 'video'],
    ]
    for (const [mediaKind, key] of collections) {
      if (node[key] === undefined) continue
      if (!Array.isArray(node[key])) throw new GenerationRuntimeError('COMFYUI_OUTPUT_INVALID', `ComfyUI output node "${nodeId}" ${key} is invalid.`)
      node[key].forEach((item, index) => {
        const descriptor = outputDescriptor(item, nodeId, index, mediaKind)
        if (descriptor !== null) outputs.push(descriptor)
      })
    }
  }
  return Object.freeze(outputs)
}

function remoteErrorMessage(job: Record<string, unknown>): string {
  if (job.status === 'cancelled') return 'ComfyUI Job status is cancelled.'
  const detail = job.execution_error ?? job.error ?? job
  return `ComfyUI Job failed: ${JSON.stringify(detail)}`
}

function promptRejectionMessage(error: unknown, nodeErrors: unknown): string {
  return `ComfyUI rejected the API Workflow: ${JSON.stringify({ error: error ?? null, node_errors: nodeErrors ?? null })}`
}

function bytesMatch(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[offset + index] === value)
}

function validMediaSignature(bytes: Uint8Array, mediaType: string): boolean {
  switch (mediaType) {
    case 'image/png':
      return bytes.length >= 8 && bytesMatch(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'image/jpeg':
      return bytes.length >= 4 && bytesMatch(bytes, 0, [0xff, 0xd8, 0xff])
        && bytesMatch(bytes, bytes.length - 2, [0xff, 0xd9])
    case 'image/webp':
      return bytes.length >= 12 && bytesMatch(bytes, 0, [0x52, 0x49, 0x46, 0x46])
        && bytesMatch(bytes, 8, [0x57, 0x45, 0x42, 0x50])
    case 'video/mp4':
      return bytes.length >= 12 && bytesMatch(bytes, 4, [0x66, 0x74, 0x79, 0x70])
    case 'video/webm':
      return bytes.length >= 4 && bytesMatch(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3])
    default:
      return false
  }
}

export class ComfyHttpTransport implements GenerationTransport {
  private readonly options: ComfyHttpTransportOptions
  private readonly fetchImplementation: typeof fetch
  private readonly timeoutMs: number
  private readonly maxMediaBytes: number

  constructor(options: ComfyHttpTransportOptions) {
    this.options = options
    this.fetchImplementation = options.fetchImplementation ?? fetch
    this.timeoutMs = options.timeoutMs ?? 120_000
    this.maxMediaBytes = options.maxMediaBytes ?? 536_870_912
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1) throw new TypeError('ComfyUI transport timeout is invalid.')
    if (!Number.isSafeInteger(this.maxMediaBytes) || this.maxMediaBytes < 1) throw new TypeError('ComfyUI media byte limit is invalid.')
  }

  async submit(input: Parameters<GenerationTransport['submit']>[0]): Promise<{ readonly promptId: string }> {
    validatePromptId(input.promptId)
    let instance: ComfyInstanceSource
    try {
      instance = await this.instance(input.instanceId, input.instanceOrigin, input.signal)
    } catch (error) {
      if (input.signal?.aborted === true || error instanceof DOMException && error.name === 'AbortError') throw error
      if (error instanceof GenerationRuntimeError) {
        throw new GenerationSubmissionNotSentError(error.code, error.message)
      }
      throw error
    }
    if (input.signal?.aborted === true) throw new DOMException('ComfyUI submission was cancelled.', 'AbortError')
    if (!input.onRequestStart()) {
      throw new GenerationSubmissionNotSentError('GENERATION_TRANSPORT_UNAVAILABLE', 'ComfyUI submission was superseded before the request started.')
    }
    const body = await this.requestPrompt(instance, {
      method: 'POST',
      body: JSON.stringify({
        prompt: input.apiWorkflow,
        prompt_id: input.promptId,
        client_id: `harness-comfyui-${randomUUID()}`,
        extra_data: {
          extra_pnginfo: {
            workflow: input.actualWorkflow,
          },
        },
      }),
      signal: input.signal,
    })
    const nodeErrors = body.node_errors === undefined ? {} : record(body.node_errors, 'ComfyUI node errors')
    if (body.error !== undefined || Object.keys(nodeErrors).length > 0) {
      throw new GenerationRuntimeError('COMFYUI_PROMPT_REJECTED', promptRejectionMessage(body.error, nodeErrors))
    }
    if (body.prompt_id !== input.promptId) {
      throw new GenerationRuntimeError(
        'COMFYUI_PROTOCOL_ERROR',
        `ComfyUI /prompt returned prompt_id "${String(body.prompt_id)}" for requested prompt_id "${input.promptId}".`,
      )
    }
    return Object.freeze({ promptId: input.promptId })
  }

  async observe(input: Parameters<GenerationTransport['observe']>[0]): Promise<GenerationObservation> {
    validatePromptId(input.promptId)
    const instance = await this.instance(input.instanceId, input.instanceOrigin, input.signal)
    let response: unknown
    try {
      response = await this.requestJson(instance, `/api/jobs/${encodeURIComponent(input.promptId)}`, { signal: input.signal })
    } catch (error) {
      if (error instanceof ComfyHttpError && error.status === 404) return Object.freeze({ status: 'unknown', outputs: [] as const })
      throw error
    }
    const job = record(response, 'ComfyUI job response')
    if (job.id !== input.promptId || typeof job.status !== 'string') {
      throw new GenerationRuntimeError('COMFYUI_PROTOCOL_ERROR', 'ComfyUI job response identity is invalid.')
    }
    if (job.status === 'pending') return Object.freeze({ status: 'pending', outputs: [] as const })
    if (job.status === 'in_progress') return Object.freeze({ status: 'running', outputs: [] as const })
    if (job.status === 'completed') {
      return Object.freeze({ status: 'success', outputs: normalizeOutputs(job.outputs ?? {}, input.outputNodeIds) })
    }
    if (job.status === 'failed' || job.status === 'cancelled') {
      return Object.freeze({
        status: 'error',
        outputs: [] as const,
        error: Object.freeze({ code: 'COMFYUI_REMOTE_ERROR', message: remoteErrorMessage(job) }),
      })
    }
    throw new GenerationRuntimeError('COMFYUI_PROTOCOL_ERROR', 'ComfyUI job status is not recognized.')
  }

  async download(input: Parameters<GenerationTransport['download']>[0]): Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }> {
    const output = outputDescriptor(input.output, input.output.nodeId, input.output.outputIndex, input.output.mediaKind)
    if (output === null) throw new GenerationRuntimeError('COMFYUI_OUTPUT_INVALID', 'ComfyUI returned a temporary media descriptor for download.')
    const instance = await this.instance(input.instanceId, input.instanceOrigin, input.signal)
    const query = new URLSearchParams({ filename: output.filename, subfolder: output.subfolder, type: output.type })
    return this.withResponse(instance, `/view?${query}`, { signal: input.signal, accept: '*/*' }, async response => {
      if (!response.ok) throw new ComfyHttpError('COMFYUI_HTTP_ERROR', `ComfyUI returned HTTP ${response.status} for /view.`, response.status)
      const mediaType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
      const requiredPrefix = output.mediaKind === 'image' ? 'image/' : 'video/'
      if (mediaType === undefined || !mediaType.startsWith(requiredPrefix)) {
        throw new GenerationRuntimeError('COMFYUI_OUTPUT_INVALID', 'ComfyUI output media type does not match its descriptor.')
      }
      const bytes = await this.readMediaBytes(response)
      if (!validMediaSignature(bytes, mediaType)) {
        throw new GenerationRuntimeError('COMFYUI_OUTPUT_INVALID', 'ComfyUI output media signature does not match its media type.')
      }
      return Object.freeze({ bytes, mediaType })
    })
  }

  private async requestJson(instance: ComfyInstanceSource, path: string, init: RequestInit & { readonly signal?: AbortSignal }): Promise<unknown> {
    return this.withResponse(instance, path, init, async response => {
      let body: unknown
      try {
        body = await response.json()
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error
        throw new ComfyHttpError('COMFYUI_PROTOCOL_ERROR', `ComfyUI returned invalid JSON for ${path}.`, response.status)
      }
      if (!response.ok) throw new ComfyHttpError('COMFYUI_HTTP_ERROR', `ComfyUI returned HTTP ${response.status} for ${path}.`, response.status)
      return body
    })
  }

  private async requestPrompt(
    instance: ComfyInstanceSource,
    init: RequestInit & { readonly signal?: AbortSignal },
  ): Promise<Record<string, unknown>> {
    return this.withResponse(instance, '/prompt', init, async response => {
      let body: unknown
      try {
        body = await response.json()
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error
        if (!response.ok) throw new ComfyHttpError('COMFYUI_HTTP_ERROR', `ComfyUI returned HTTP ${response.status} for /prompt.`, response.status)
        throw new ComfyHttpError('COMFYUI_PROTOCOL_ERROR', 'ComfyUI returned invalid JSON for /prompt.', response.status)
      }
      if (!response.ok) {
        const source = body !== null && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null
        const nodeErrors = source?.node_errors
        if (
          response.status >= 400 && response.status < 500
          && source !== null
          && (source.error !== undefined || nodeErrors !== undefined)
        ) {
          throw new GenerationRuntimeError('COMFYUI_PROMPT_REJECTED', promptRejectionMessage(source.error, nodeErrors))
        }
        throw new ComfyHttpError('COMFYUI_HTTP_ERROR', `ComfyUI returned HTTP ${response.status} for /prompt.`, response.status)
      }
      return record(body, 'ComfyUI prompt response')
    })
  }

  private async instance(instanceId: string, expectedOrigin: string, signal?: AbortSignal): Promise<ComfyInstanceSource> {
    const instance = await this.options.source.readInstance(instanceId, signal)
    if (comfyInstanceOrigin(instance.url) !== expectedOrigin) {
      throw new GenerationRuntimeError(
        'COMFYUI_INSTANCE_SOURCE_CHANGED',
        'The ComfyUI instance origin changed after this Generation Run was prepared.',
      )
    }
    return instance
  }

  private async readMediaBytes(response: Response): Promise<Uint8Array> {
    const declaredLength = response.headers.get('content-length')
    if (declaredLength !== null) {
      const parsedLength = Number(declaredLength)
      if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > this.maxMediaBytes) {
        throw new GenerationRuntimeError('COMFYUI_OUTPUT_TOO_LARGE', 'ComfyUI output media exceeds the configured byte limit.')
      }
    }
    if (response.body === null) throw new GenerationRuntimeError('COMFYUI_OUTPUT_INVALID', 'ComfyUI returned an empty media response.')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      total += chunk.value.byteLength
      if (total > this.maxMediaBytes) {
        await reader.cancel()
        throw new GenerationRuntimeError('COMFYUI_OUTPUT_TOO_LARGE', 'ComfyUI output media exceeds the configured byte limit.')
      }
      chunks.push(chunk.value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return bytes
  }

  private async withResponse<Result>(
    instance: ComfyInstanceSource,
    path: string,
    init: RequestInit & { readonly accept?: string },
    consume: (response: Response) => Promise<Result>,
  ): Promise<Result> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    const callerSignal = init.signal ?? undefined
    const signal = callerSignal === undefined ? controller.signal : AbortSignal.any([controller.signal, callerSignal])
    try {
      try {
        const response = await this.fetchImplementation(`${instance.url.replace(/\/$/u, '')}${path}`, {
          ...init,
          signal,
          headers: {
            accept: init.accept ?? 'application/json',
            ...(instance.authorization === null ? {} : { authorization: instance.authorization }),
            ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
          },
        })
        return await consume(response)
      } catch (error) {
        if (error instanceof GenerationRuntimeError) throw error
        const code = error instanceof DOMException && error.name === 'AbortError'
          ? callerSignal?.aborted === true ? 'COMFYUI_REQUEST_CANCELED' : 'COMFYUI_REQUEST_TIMEOUT'
          : 'COMFYUI_CONNECTION_FAILED'
        const cause = error instanceof Error && error.cause instanceof Error ? error.cause : null
        const causeDiagnostic = cause instanceof AggregateError
          ? [cause.toString(), ...cause.errors.map(String)].join('\n')
          : cause?.toString()
        const diagnostic = error instanceof Error
          ? causeDiagnostic === undefined ? error.message : `${error.message}\n${causeDiagnostic}`
          : String(error)
        const message = ERROR_CATALOG.COMFYUI_CONNECTION_FAILED.diagnostic_template
          .replaceAll('{origin}', new URL(instance.url).origin).replaceAll('{path}', path)
          .replaceAll('{diagnostic}', diagnostic)
        throw new ComfyHttpError(code, message)
      }
    } finally {
      clearTimeout(timeout)
    }
  }
}

import { spawn } from 'node:child_process'

import type { SettingsScope } from '@deepseek-ai/dsh-settings'

import {
  CATALOG_BASE_MODEL_PAGE_SIZE,
  CATALOG_BASE_MODEL_PATH,
  CATALOG_COMFYUI_INSTANCE_PATH,
  CATALOG_COMFYUI_INSTANCE_QUERY,
  CATALOG_PAGE_SIZE,
  CATALOG_QUERY_TIMEOUT_MS,
  catalogDefinition,
  parseBaseModelList,
  parseCatalogComfyuiInstancePage,
  parseCatalogComfyuiInstanceQueryRequest,
  parseCatalogPage,
  parseCatalogQueryRequest,
  parseCatalogResolvedGenerationModel,
  parseCatalogResolvedLora,
  parseCatalogResolvedTemplate,
  type BaseModelItem,
  type BaseModelList,
  type CatalogItem,
  type CatalogComfyuiInstancePage,
  type CatalogComfyuiInstanceQueryRequest,
  type CatalogContext,
  type CatalogErrorCode,
  type CatalogPage,
  type CatalogQueryRequest,
  type CatalogResolvedGenerationModel,
  type CatalogResolvedLora,
  type CatalogResolvedTemplate,
} from '../../catalog/contract.ts'
import {
  readSourceAddress,
  type SourceSettingsSection,
} from '../../source-settings.ts'

const MAX_CLI_OUTPUT_BYTES = 32 * 1024 * 1024

export type CatalogCliErrorCode = CatalogErrorCode

export class CatalogCliError extends Error {
  readonly code: CatalogCliErrorCode
  readonly exitCode?: number

  constructor(code: CatalogCliErrorCode, message: string, exitCode?: number) {
    super(message)
    this.name = 'CatalogCliError'
    this.code = code
    this.exitCode = exitCode
  }
}

export interface CatalogCliProcessResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export type CatalogCliProcess = (
  executable: string,
  args: readonly string[],
  signal: AbortSignal,
) => Promise<CatalogCliProcessResult>

export interface CatalogCliOptions {
  readonly executable: string
  readonly settings: Pick<SettingsScope<SourceSettingsSection>, 'get'>
  readonly process?: CatalogCliProcess
}

function abortError(): Error {
  return new DOMException('Catalog query was cancelled.', 'AbortError')
}

export const runCatalogCliProcess: CatalogCliProcess = (executable, args, signal) => new Promise((resolve, reject) => {
  if (signal.aborted) {
    reject(abortError())
    return
  }
  const command = executable.endsWith('.mjs') ? process.execPath : executable
  const commandArguments = executable.endsWith('.mjs') ? [executable, ...args] : args
  const child = spawn(command, commandArguments, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  let outputBytes = 0
  let settled = false

  const finish = (callback: () => void) => {
    if (settled) return
    settled = true
    signal.removeEventListener('abort', onAbort)
    callback()
  }
  const onAbort = () => {
    child.kill('SIGTERM')
    finish(() => reject(abortError()))
  }
  const collect = (target: Buffer[], chunk: Buffer) => {
    outputBytes += chunk.length
    if (outputBytes > MAX_CLI_OUTPUT_BYTES) {
      child.kill('SIGTERM')
      finish(() => reject(new CatalogCliError('CATALOG_RESPONSE_TOO_LARGE', 'Catalog CLI output exceeded the limit.')))
      return
    }
    target.push(chunk)
  }

  signal.addEventListener('abort', onAbort, { once: true })
  child.stdout.on('data', chunk => collect(stdout, Buffer.from(chunk)))
  child.stderr.on('data', chunk => collect(stderr, Buffer.from(chunk)))
  child.once('error', error => finish(() => reject(new CatalogCliError('CATALOG_QUERY_FAILED', error.message))))
  child.once('close', code => finish(() => resolve({
    exitCode: code ?? 1,
    stdout: Buffer.concat(stdout).toString('utf8'),
    stderr: Buffer.concat(stderr).toString('utf8'),
  })))
})

function sourceRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new CatalogCliError('CATALOG_PROTOCOL_ERROR', 'Catalog result item must be an object.')
  }
  return value as Record<string, unknown>
}

function sourceId(value: unknown): string {
  const normalized = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value
  if (typeof normalized !== 'string' || !/^[1-9][0-9]{0,19}$/u.test(normalized)) {
    throw new CatalogCliError('CATALOG_PROTOCOL_ERROR', 'Catalog result id is invalid.')
  }
  return normalized
}

function sourceNullableId(value: unknown): string | null {
  return value === null ? null : sourceId(value)
}

function sourceLabel(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 500) {
    throw new CatalogCliError('CATALOG_PROTOCOL_ERROR', 'Catalog result label is invalid.')
  }
  return value
}

function sourceSubtitle(result: Record<string, unknown>, fields: readonly string[], fallback: string): string {
  for (const field of fields) {
    const value = result[field]
    if ((typeof value === 'string' && value.trim().length > 0) || typeof value === 'number') {
      return String(value).slice(0, 500)
    }
  }
  return fallback
}

function sourceCoverUrl(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') {
    throw new CatalogCliError('CATALOG_PROTOCOL_ERROR', 'Catalog result cover URL is invalid.')
  }
  return value
}

function sourceSampleImageUrls(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    throw new CatalogCliError('CATALOG_PROTOCOL_ERROR', 'Catalog result sample image URLs are invalid.')
  }
  return Object.freeze(value.map((item) => {
    if (typeof item !== 'string') {
      throw new CatalogCliError('CATALOG_PROTOCOL_ERROR', 'Catalog result sample image URL is invalid.')
    }
    return item
  }))
}

function sourcePromptText(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 100_000) {
    throw new CatalogCliError('CATALOG_PROTOCOL_ERROR', 'Catalog result prompt text is invalid.')
  }
  return value
}

function sourceNullableLabel(value: unknown): string | null {
  return value === null ? null : sourceLabel(value)
}

function sourceTriggerWords(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new CatalogCliError('CATALOG_PROTOCOL_ERROR', 'Catalog LoRA trigger words are invalid.')
  }
  const words = value.map(sourceLabel)
  if (new Set(words).size !== words.length) {
    throw new CatalogCliError('CATALOG_PROTOCOL_ERROR', 'Catalog LoRA trigger words are duplicated.')
  }
  return Object.freeze(words)
}

function sourceNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CatalogCliError('CATALOG_PROTOCOL_ERROR', `${label} is invalid.`)
  }
  return value
}

function sourceContext(kind: CatalogQueryRequest['kind'], id: string, result: Record<string, unknown>): CatalogContext {
  switch (kind) {
    case 'model':
    case 'lora':
      return Object.freeze({ kind, id, file_name: sourceLabel(result.file_name) })
    case 'work':
      return Object.freeze({ kind, id, name: sourceLabel(result.name) })
    case 'character':
      return Object.freeze({
        kind,
        id,
        work_name: sourceLabel(result['works.name']),
        character_name: sourceLabel(result.name),
        prompt_text: sourcePromptText(result.prompt_text),
      })
    case 'style':
      return Object.freeze({
        kind,
        id,
        name: sourceLabel(result.name),
        prompt_text: sourcePromptText(result.prompt_text),
      })
    case 'prompt-term':
      return Object.freeze({ kind, id, tag: sourceLabel(result.canonical_tag) })
    case 'artist-string':
      return Object.freeze({
        kind,
        id,
        title: sourceLabel(result.title),
        prompt_text: sourcePromptText(result.artist_string),
      })
    case 'comfyui-template':
      return Object.freeze({
        kind,
        id,
        title: sourceLabel(result.title),
      })
  }
}

function resolvedRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new CatalogCliError('CATALOG_PROTOCOL_ERROR', 'Catalog response must be an object.')
  }
  const envelope = value as Record<string, unknown>
  if (
    envelope.status !== 'ok'
    || envelope.message !== null
    || !Array.isArray(envelope.results)
    || envelope.results.length !== 1
    || envelope.page !== 1
    || envelope.page_size !== 1
    || envelope.total_count !== 1
  ) {
    throw new CatalogCliError('CATALOG_PROTOCOL_ERROR', `Catalog ${label} resolve response is invalid.`)
  }
  return sourceRecord(envelope.results[0])
}

function normalizeResolvedTemplate(value: unknown): CatalogResolvedTemplate {
  const result = resolvedRecord(value, 'template')
  return parseCatalogResolvedTemplate({
    id: sourceId(result.id),
    title: sourceLabel(result.title),
    base_model_id: sourceId(result.base_model_id),
    model_id: sourceNullableId(result.model_id),
  })
}

function normalizeResolvedLora(value: unknown): CatalogResolvedLora {
  const result = resolvedRecord(value, 'LoRA')
  return parseCatalogResolvedLora({
    id: sourceId(result.id),
    base_model_id: sourceId(result.base_model_id),
    model_id: sourceId(result.model_id),
    file_name: sourceLabel(result.file_name),
    description: sourcePromptText(result.description),
    usage: sourcePromptText(result.usage),
    trigger_words: sourceTriggerWords(result.trigger_words_json),
    weight: sourceNumber(result.weight, 'Catalog LoRA weight'),
  })
}

function normalizeResolvedGenerationModel(value: unknown): CatalogResolvedGenerationModel {
  const result = resolvedRecord(value, 'generation model')
  return parseCatalogResolvedGenerationModel({
    id: sourceId(result.id),
    base_model_id: sourceId(result.base_model_id),
    file_name: sourceLabel(result.file_name),
    description: sourcePromptText(result.description),
    usage: sourcePromptText(result.usage),
    skill_name: sourceNullableLabel(result.skill_name),
  })
}

function normalizeEnvelope(request: CatalogQueryRequest, value: unknown): CatalogPage {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new CatalogCliError('CATALOG_PROTOCOL_ERROR', 'Catalog response must be an object.')
  }
  const envelope = value as Record<string, unknown>
  if (
    envelope.status !== 'ok'
    || envelope.message !== null
    || !Array.isArray(envelope.results)
    || envelope.results.length > CATALOG_PAGE_SIZE
    || envelope.page !== request.page
    || envelope.page_size !== CATALOG_PAGE_SIZE
    || !Number.isSafeInteger(envelope.total_count)
    || (envelope.total_count as number) < envelope.results.length
  ) {
    throw new CatalogCliError('CATALOG_PROTOCOL_ERROR', 'Catalog response envelope is invalid.')
  }
  const definition = catalogDefinition(request.kind)
  const items: CatalogItem[] = envelope.results.map(value => {
    const result = sourceRecord(value)
    const id = sourceId(result.id)
    return Object.freeze({
      context: sourceContext(request.kind, id, result),
      label: sourceLabel(result[definition.labelField]),
      subtitle: sourceSubtitle(result, definition.subtitleFields, definition.label),
      coverUrl: sourceCoverUrl(result.cover_url),
      sampleImageUrls: sourceSampleImageUrls(result.sample_image_urls),
    })
  })
  try {
    return parseCatalogPage({
      kind: request.kind,
      query: request.query,
      page: request.page,
      items,
      totalCount: envelope.total_count,
    })
  } catch (error) {
    if (error instanceof CatalogCliError) throw error
    throw new CatalogCliError(
      'CATALOG_PROTOCOL_ERROR',
      error instanceof Error ? error.message : 'Catalog response is invalid.',
    )
  }
}

function normalizeBaseModels(value: unknown): BaseModelList {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new CatalogCliError('CATALOG_PROTOCOL_ERROR', 'Base model response must be an object.')
  }
  const envelope = value as Record<string, unknown>
  if (
    envelope.status !== 'ok'
    || envelope.message !== null
    || !Array.isArray(envelope.results)
    || envelope.results.length > CATALOG_BASE_MODEL_PAGE_SIZE
    || envelope.page !== 1
    || envelope.page_size !== CATALOG_BASE_MODEL_PAGE_SIZE
    || !Number.isSafeInteger(envelope.total_count)
    || (envelope.total_count as number) !== envelope.results.length
  ) {
    throw new CatalogCliError('CATALOG_PROTOCOL_ERROR', 'Base model response envelope is invalid.')
  }
  const items: BaseModelItem[] = envelope.results.map(value => {
    const result = sourceRecord(value)
    return Object.freeze({ id: sourceId(result.id), label: sourceLabel(result.name) })
  })
  return parseBaseModelList({ items })
}

function normalizeComfyuiInstances(value: unknown): CatalogComfyuiInstancePage {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new CatalogCliError('CATALOG_PROTOCOL_ERROR', 'ComfyUI instance catalog response must be an object.')
  }
  const envelope = value as Record<string, unknown>
  if (
    envelope.status !== 'ok'
    || envelope.message !== null
    || !Array.isArray(envelope.results)
    || envelope.results.length > CATALOG_COMFYUI_INSTANCE_QUERY.page_size
    || envelope.page !== CATALOG_COMFYUI_INSTANCE_QUERY.page
    || envelope.page_size !== CATALOG_COMFYUI_INSTANCE_QUERY.page_size
    || !Number.isSafeInteger(envelope.total_count)
    || (envelope.total_count as number) < envelope.results.length
  ) {
    throw new CatalogCliError('CATALOG_PROTOCOL_ERROR', 'ComfyUI instance catalog response envelope is invalid.')
  }
  try {
    return parseCatalogComfyuiInstancePage({
      status: 'ok',
      message: null,
      results: envelope.results.map((value) => {
        const result = sourceRecord(value)
        return { id: sourceId(result.id) }
      }),
      page: CATALOG_COMFYUI_INSTANCE_QUERY.page,
      page_size: CATALOG_COMFYUI_INSTANCE_QUERY.page_size,
      total_count: envelope.total_count,
    })
  } catch (error) {
    if (error instanceof CatalogCliError) throw error
    throw new CatalogCliError(
      'CATALOG_PROTOCOL_ERROR',
      error instanceof Error ? error.message : 'ComfyUI instance catalog response is invalid.',
    )
  }
}

function parseCliJson(result: CatalogCliProcessResult): unknown {
  if (result.exitCode !== 0 || result.stderr.length > 0 || result.stdout.length === 0) {
    throw new CatalogCliError('CATALOG_QUERY_FAILED', 'Catalog CLI query failed.', result.exitCode)
  }
  try {
    return JSON.parse(result.stdout) as unknown
  } catch {
    throw new CatalogCliError('CATALOG_PROTOCOL_ERROR', 'Catalog CLI returned invalid JSON.')
  }
}

export class CatalogCli {
  private readonly options: CatalogCliOptions
  private readonly execute: CatalogCliProcess

  constructor(options: CatalogCliOptions) {
    if (options.executable.trim().length === 0) throw new TypeError('Catalog CLI executable is required.')
    this.options = options
    this.execute = options.process ?? runCatalogCliProcess
  }

  private run(args: readonly string[], signal: AbortSignal): Promise<CatalogCliProcessResult> {
    const address = readSourceAddress(this.options.settings)
    return this.execute(this.options.executable, [
      '--url', address.url,
      '--port', String(address.port),
      ...args,
    ], signal)
  }

  async search(input: CatalogQueryRequest, signal: AbortSignal): Promise<CatalogPage> {
    const request = parseCatalogQueryRequest(input)
    const definition = catalogDefinition(request.kind)
    const args = [
      '--timeout-ms', String(CATALOG_QUERY_TIMEOUT_MS),
      '--path', definition.path,
      '--mode', 'search',
      '--query', request.query,
      '--page', String(request.page),
      '--page_size', String(CATALOG_PAGE_SIZE),
      ...(request.baseModelId === null ? [] : ['--base_model_id', request.baseModelId]),
    ]
    const result = await this.run(args, signal)
    return normalizeEnvelope(request, parseCliJson(result))
  }

  async baseModels(signal: AbortSignal): Promise<BaseModelList> {
    const args = [
      '--timeout-ms', String(CATALOG_QUERY_TIMEOUT_MS),
      '--path', CATALOG_BASE_MODEL_PATH,
      '--mode', 'search',
      '--query', '',
      '--page', '1',
      '--page_size', String(CATALOG_BASE_MODEL_PAGE_SIZE),
    ]
    const result = await this.run(args, signal)
    return normalizeBaseModels(parseCliJson(result))
  }

  async queryComfyuiInstances(
    input: CatalogComfyuiInstanceQueryRequest,
    signal: AbortSignal,
  ): Promise<CatalogComfyuiInstancePage> {
    const request = parseCatalogComfyuiInstanceQueryRequest(input)
    const args = [
      '--timeout-ms', String(CATALOG_QUERY_TIMEOUT_MS),
      '--path', CATALOG_COMFYUI_INSTANCE_PATH,
      '--mode', request.mode,
      '--query', request.query,
      '--page', String(request.page),
      '--page_size', String(request.page_size),
    ]
    const result = await this.run(args, signal)
    return normalizeComfyuiInstances(parseCliJson(result))
  }

  async resolveTemplate(id: string, signal: AbortSignal): Promise<CatalogResolvedTemplate> {
    const templateId = sourceId(id)
    const args = [
      '--timeout-ms', String(CATALOG_QUERY_TIMEOUT_MS),
      '--path', catalogDefinition('comfyui-template').path,
      '--mode', 'resolve',
      '--id', templateId,
    ]
    const result = await this.run(args, signal)
    return normalizeResolvedTemplate(parseCliJson(result))
  }

  async resolveLora(id: string, signal: AbortSignal): Promise<CatalogResolvedLora> {
    const loraId = sourceId(id)
    const args = [
      '--timeout-ms', String(CATALOG_QUERY_TIMEOUT_MS),
      '--path', catalogDefinition('lora').path,
      '--mode', 'resolve',
      '--id', loraId,
    ]
    const result = await this.run(args, signal)
    return normalizeResolvedLora(parseCliJson(result))
  }

  async resolveGenerationModel(id: string, signal: AbortSignal): Promise<CatalogResolvedGenerationModel> {
    const modelId = sourceId(id)
    const args = [
      '--timeout-ms', String(CATALOG_QUERY_TIMEOUT_MS),
      '--path', catalogDefinition('model').path,
      '--mode', 'resolve',
      '--id', modelId,
    ]
    const result = await this.run(args, signal)
    return normalizeResolvedGenerationModel(parseCliJson(result))
  }
}

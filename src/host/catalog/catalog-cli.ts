import { spawn } from 'node:child_process'

import {
  CATALOG_BASE_MODEL_PAGE_SIZE,
  CATALOG_BASE_MODEL_PATH,
  CATALOG_PAGE_SIZE,
  CATALOG_QUERY_TIMEOUT_MS,
  catalogDefinition,
  parseBaseModelList,
  parseCatalogPage,
  parseCatalogQueryRequest,
  type BaseModelItem,
  type BaseModelList,
  type CatalogItem,
  type CatalogContext,
  type CatalogPage,
  type CatalogQueryRequest,
} from '../../catalog/contract.ts'

const MAX_CLI_OUTPUT_BYTES = 32 * 1024 * 1024

export type CatalogCliErrorCode =
  | 'CATALOG_QUERY_FAILED'
  | 'CATALOG_RESPONSE_TOO_LARGE'
  | 'CATALOG_PROTOCOL_ERROR'

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
  readonly port: number
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
  const child = spawn(executable, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
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

function sourcePromptText(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 100_000) {
    throw new CatalogCliError('CATALOG_PROTOCOL_ERROR', 'Catalog result prompt text is invalid.')
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
      return Object.freeze({ kind, id, title: sourceLabel(result.title) })
  }
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
    })
  })
  return parseCatalogPage({
    kind: request.kind,
    query: request.query,
    page: request.page,
    items,
    totalCount: envelope.total_count,
  })
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
    if (!Number.isSafeInteger(options.port) || options.port < 1 || options.port > 65535) {
      throw new TypeError('Catalog CLI port is invalid.')
    }
    this.options = options
    this.execute = options.process ?? runCatalogCliProcess
  }

  async search(input: CatalogQueryRequest, signal: AbortSignal): Promise<CatalogPage> {
    const request = parseCatalogQueryRequest(input)
    const definition = catalogDefinition(request.kind)
    const args = [
      '--port', String(this.options.port),
      '--timeout-ms', String(CATALOG_QUERY_TIMEOUT_MS),
      '--path', definition.path,
      '--mode', 'search',
      '--query', request.query,
      '--page', String(request.page),
      '--page_size', String(CATALOG_PAGE_SIZE),
      ...(request.baseModelId === null ? [] : ['--base_model_id', request.baseModelId]),
    ]
    const result = await this.execute(this.options.executable, args, signal)
    return normalizeEnvelope(request, parseCliJson(result))
  }

  async baseModels(signal: AbortSignal): Promise<BaseModelList> {
    const args = [
      '--port', String(this.options.port),
      '--timeout-ms', String(CATALOG_QUERY_TIMEOUT_MS),
      '--path', CATALOG_BASE_MODEL_PATH,
      '--mode', 'search',
      '--query', '',
      '--page', '1',
      '--page_size', String(CATALOG_BASE_MODEL_PAGE_SIZE),
    ]
    const result = await this.execute(this.options.executable, args, signal)
    return normalizeBaseModels(parseCliJson(result))
  }
}

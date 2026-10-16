import { CATALOG_PRESENTATION, CATALOG_FIELDS, parseCatalogDetails, parseCatalogDetailsRequest, type CatalogDetails, type CatalogDetailsRequest } from '../../catalog/details-schema.ts'
import { queryCatalog, type CatalogQuery } from '../source-client/catalog-client.ts'
import { SourceClientError } from '../source-client/http-client.ts'
import { ERROR_CATALOG } from '../../../config/error-catalog-schema.ts'
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
  type SourceAddress,
} from '../../source-settings.ts'

export class CatalogError extends Error {
  readonly code: CatalogErrorCode

  constructor(code: CatalogErrorCode, message: string) {
    super(message)
    this.name = 'CatalogError'
    this.code = code
  }
}

export interface CatalogClientOptions {
  readonly settings: { get(): SourceAddress }
  readonly query?: CatalogQuery
}

function sourceRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new CatalogError('CATALOG_PROTOCOL_ERROR', 'Catalog result item must be an object.')
  }
  return value as Record<string, unknown>
}

function sourceId(value: unknown): string {
  const normalized = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value
  if (typeof normalized !== 'string' || !/^[1-9][0-9]{0,19}$/u.test(normalized)) {
    throw new CatalogError('CATALOG_PROTOCOL_ERROR', 'Catalog result id is invalid.')
  }
  return normalized
}

function sourceNullableId(value: unknown): string | null {
  return value === null ? null : sourceId(value)
}

function sourceLabel(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 500) {
    throw new CatalogError('CATALOG_PROTOCOL_ERROR', 'Catalog result label is invalid.')
  }
  return value
}

function sourceSubtitle(result: Record<string, unknown>, fields: readonly string[], label: string): string {
  const values = new Set<string>()
  const parts: string[] = []
  for (const field of fields) {
    const value = result[field]
    if (typeof value !== 'string' && typeof value !== 'number') continue
    const text = String(value).trim()
    if (text === '' || text === label.trim() || values.has(text)) continue
    values.add(text)
    parts.push(`${CATALOG_FIELDS[field]!.label}：${text}`)
  }
  return parts.join(' · ').slice(0, 500)
}

function sourceCoverUrl(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') {
    throw new CatalogError('CATALOG_PROTOCOL_ERROR', 'Catalog result cover URL is invalid.')
  }
  return value
}

function sourceSampleImageUrls(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    throw new CatalogError('CATALOG_PROTOCOL_ERROR', 'Catalog result sample image URLs are invalid.')
  }
  return Object.freeze(value.map((item) => {
    if (typeof item !== 'string') {
      throw new CatalogError('CATALOG_PROTOCOL_ERROR', 'Catalog result sample image URL is invalid.')
    }
    return item
  }))
}

function sourcePromptText(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 100_000) {
    throw new CatalogError('CATALOG_PROTOCOL_ERROR', 'Catalog result prompt text is invalid.')
  }
  return value
}

function sourceNullableLabel(value: unknown): string | null {
  return value === null ? null : sourceLabel(value)
}

function sourceTriggerWords(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new CatalogError('CATALOG_PROTOCOL_ERROR', 'Catalog LoRA trigger words are invalid.')
  }
  const words = value.map(sourceLabel)
  if (new Set(words).size !== words.length) {
    throw new CatalogError('CATALOG_PROTOCOL_ERROR', 'Catalog LoRA trigger words are duplicated.')
  }
  return Object.freeze(words)
}

function sourceNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CatalogError('CATALOG_PROTOCOL_ERROR', `${label} is invalid.`)
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
    throw new CatalogError('CATALOG_PROTOCOL_ERROR', 'Catalog response must be an object.')
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
    throw new CatalogError('CATALOG_PROTOCOL_ERROR', `Catalog ${label} resolve response is invalid.`)
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
    throw new CatalogError('CATALOG_PROTOCOL_ERROR', 'Catalog response must be an object.')
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
    throw new CatalogError('CATALOG_PROTOCOL_ERROR', 'Catalog response envelope is invalid.')
  }
  const definition = catalogDefinition(request.kind)
  const items: CatalogItem[] = envelope.results.map(value => {
    const result = sourceRecord(value)
    const id = sourceId(result.id)
    return Object.freeze({
      context: sourceContext(request.kind, id, result),
      label: sourceLabel(result[definition.labelField]),
      subtitle: sourceSubtitle(result, definition.subtitleFields, sourceLabel(result[definition.labelField])),
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
    if (error instanceof CatalogError) throw error
    throw new CatalogError(
      'CATALOG_PROTOCOL_ERROR',
      error instanceof Error ? error.message : 'Catalog response is invalid.',
    )
  }
}

function normalizeBaseModels(value: unknown): BaseModelList {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new CatalogError('CATALOG_PROTOCOL_ERROR', 'Base model response must be an object.')
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
    throw new CatalogError('CATALOG_PROTOCOL_ERROR', 'Base model response envelope is invalid.')
  }
  const items: BaseModelItem[] = envelope.results.map(value => {
    const result = sourceRecord(value)
    return Object.freeze({ id: sourceId(result.id), label: sourceLabel(result.name) })
  })
  return parseBaseModelList({ items })
}

function normalizeComfyuiInstances(value: unknown): CatalogComfyuiInstancePage {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new CatalogError('CATALOG_PROTOCOL_ERROR', 'ComfyUI instance catalog response must be an object.')
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
    throw new CatalogError('CATALOG_PROTOCOL_ERROR', 'ComfyUI instance catalog response envelope is invalid.')
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
    if (error instanceof CatalogError) throw error
    throw new CatalogError(
      'CATALOG_PROTOCOL_ERROR',
      error instanceof Error ? error.message : 'ComfyUI instance catalog response is invalid.',
    )
  }
}

export class CatalogClient {
  private readonly options: CatalogClientOptions
  private readonly query: CatalogQuery

  constructor(options: CatalogClientOptions) {
    this.options = options
    this.query = options.query ?? queryCatalog
  }

  private async run(path: string, input: Readonly<Record<string, unknown>>, signal: AbortSignal): Promise<unknown> {
    const address = readSourceAddress(this.options.settings)
    try {
      return await this.query({ address, path, input, timeoutMs: CATALOG_QUERY_TIMEOUT_MS, signal })
    } catch (error) {
      if (signal.aborted || error instanceof Error && error.name === 'AbortError' || error instanceof CatalogError) throw error
      if (error instanceof SourceClientError && error.code === 'RESPONSE_TOO_LARGE') throw new CatalogError('CATALOG_RESPONSE_TOO_LARGE', error.message)
      if (error instanceof SourceClientError && ['CONTRACT_PROTOCOL_ERROR', 'DISCOVERY_PROTOCOL_ERROR', 'INVALID_ARGUMENT'].includes(error.code)) throw new CatalogError('CATALOG_PROTOCOL_ERROR', error.message)
      const diagnostic = error instanceof SourceClientError && error.responseBody !== undefined
        ? JSON.stringify(error.responseBody) : error instanceof Error ? error.message : String(error)
      throw new CatalogError('CATALOG_QUERY_FAILED', ERROR_CATALOG.CATALOG_QUERY_FAILED.diagnostic_template
        .replaceAll('{url}', address.url).replaceAll('{port}', String(address.port)).replaceAll('{diagnostic}', diagnostic))
    }
  }

  async search(input: CatalogQueryRequest, signal: AbortSignal): Promise<CatalogPage> {
    const request = parseCatalogQueryRequest(input)
    const result = await this.run(catalogDefinition(request.kind).path, {
      mode: 'search', query: request.query, page: request.page, page_size: CATALOG_PAGE_SIZE,
      ...(request.baseModelId === null ? {} : { base_model_id: request.baseModelId }),
    }, signal)
    return normalizeEnvelope(request, result)
  }

  async details(input: CatalogDetailsRequest, signal: AbortSignal): Promise<CatalogDetails> {
    const request = parseCatalogDetailsRequest(input)
    const source = resolvedRecord(await this.run(catalogDefinition(request.kind).path, { mode: 'resolve', id: request.id }, signal), 'details')
    try {
      return parseCatalogDetails({
        ...request,
        fields: CATALOG_PRESENTATION.kinds[request.kind].details.map(key => ({
          key, value: CATALOG_FIELDS[key]!.type === 'id' && source[key] !== null ? sourceId(source[key]) : source[key],
        })),
      })
    } catch (error) {
      throw new CatalogError('CATALOG_PROTOCOL_ERROR', error instanceof Error ? error.message : String(error))
    }
  }

  async baseModels(signal: AbortSignal): Promise<BaseModelList> {
    return normalizeBaseModels(await this.run(CATALOG_BASE_MODEL_PATH, {
      mode: 'search', query: '', page: 1, page_size: CATALOG_BASE_MODEL_PAGE_SIZE,
    }, signal))
  }

  async queryComfyuiInstances(input: CatalogComfyuiInstanceQueryRequest, signal: AbortSignal): Promise<CatalogComfyuiInstancePage> {
    const request = parseCatalogComfyuiInstanceQueryRequest(input)
    return normalizeComfyuiInstances(await this.run(CATALOG_COMFYUI_INSTANCE_PATH, { ...request }, signal))
  }

  async resolveTemplate(id: string, signal: AbortSignal): Promise<CatalogResolvedTemplate> {
    return normalizeResolvedTemplate(await this.run(catalogDefinition('comfyui-template').path, { mode: 'resolve', id: sourceId(id) }, signal))
  }

  async resolveLora(id: string, signal: AbortSignal): Promise<CatalogResolvedLora> {
    return normalizeResolvedLora(await this.run(catalogDefinition('lora').path, { mode: 'resolve', id: sourceId(id) }, signal))
  }

  async resolveGenerationModel(id: string, signal: AbortSignal): Promise<CatalogResolvedGenerationModel> {
    return normalizeResolvedGenerationModel(await this.run(catalogDefinition('model').path, { mode: 'resolve', id: sourceId(id) }, signal))
  }
}

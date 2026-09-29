import { CATALOG_PRESENTATION as presentation } from './presentation-schema.ts'
import { validateSourceSettingsSection, type SourceAddress } from '../source-settings.ts'
export const CATALOG_PAGE_SIZE = presentation.pageSize
export const CATALOG_BASE_MODEL_PAGE_SIZE = 20
export const CATALOG_COMFYUI_INSTANCE_PAGE_SIZE = 100
export const CATALOG_QUERY_TIMEOUT_MS = 15_000
export const CATALOG_REMOTE_NAMESPACE = 'harnessComfyuiCatalog'
export const CATALOG_REMOTE_SERVICE = `remote.${CATALOG_REMOTE_NAMESPACE}`
export const CATALOG_BASE_MODEL_PATH = '/internal/semantic/base-models'
export const CATALOG_COMFYUI_INSTANCE_PATH = '/internal/semantic/comfyui-instances'
export const CATALOG_COMFYUI_INSTANCE_QUERY = Object.freeze({
  mode: 'search',
  query: '',
  page: 1,
  page_size: CATALOG_COMFYUI_INSTANCE_PAGE_SIZE,
} as const)
export const CATALOG_ERROR_CODES = Object.freeze([
  'CATALOG_QUERY_FAILED',
  'CATALOG_RESPONSE_TOO_LARGE',
  'CATALOG_PROTOCOL_ERROR',
] as const)
export const CATALOG_KIND_DEFINITIONS = Object.freeze([
  Object.freeze({
    kind: 'model',
    label: '生成模型',
    path: '/internal/semantic/generation-models',
    labelField: 'file_name',
    subtitleFields: Object.freeze(presentation.kinds['model'].summary),
    baseModelScoped: true,
  }),
  Object.freeze({
    kind: 'lora',
    label: 'LoRA',
    path: '/internal/semantic/loras',
    labelField: 'file_name',
    subtitleFields: Object.freeze(presentation.kinds['lora'].summary),
    baseModelScoped: true,
  }),
  Object.freeze({
    kind: 'work',
    label: '作品',
    path: '/internal/semantic/works',
    labelField: 'name',
    subtitleFields: Object.freeze(presentation.kinds['work'].summary),
    baseModelScoped: false,
  }),
  Object.freeze({
    kind: 'character',
    label: '角色',
    path: '/internal/semantic/characters',
    labelField: 'name',
    subtitleFields: Object.freeze(presentation.kinds['character'].summary),
    baseModelScoped: false,
  }),
  Object.freeze({
    kind: 'style',
    label: '画师或画风',
    path: '/internal/semantic/styles',
    labelField: 'name',
    subtitleFields: Object.freeze(presentation.kinds['style'].summary),
    baseModelScoped: true,
  }),
  Object.freeze({
    kind: 'prompt-term',
    label: '提示词条目',
    path: '/internal/semantic/prompt-terms',
    labelField: 'canonical_tag',
    subtitleFields: Object.freeze(presentation.kinds['prompt-term'].summary),
    baseModelScoped: false,
  }),
  Object.freeze({
    kind: 'artist-string',
    label: '画师串',
    path: '/internal/semantic/artist-prompt-strings',
    labelField: 'title',
    subtitleFields: Object.freeze(presentation.kinds['artist-string'].summary),
    baseModelScoped: true,
  }),
  Object.freeze({
    kind: 'comfyui-template',
    label: 'Workflow 模板',
    path: '/internal/semantic/comfyui-templates',
    labelField: 'title',
    subtitleFields: Object.freeze(presentation.kinds['comfyui-template'].summary),
    baseModelScoped: true,
  }),
] as const)

export type CatalogKind = (typeof CATALOG_KIND_DEFINITIONS)[number]['kind']
export type CatalogErrorCode = (typeof CATALOG_ERROR_CODES)[number]

export interface CatalogQueryRequest {
  readonly kind: CatalogKind
  readonly query: string
  readonly page: number
  readonly baseModelId: string | null
}

export type CatalogComfyuiInstanceQueryRequest = typeof CATALOG_COMFYUI_INSTANCE_QUERY

export interface CatalogComfyuiInstanceItem {
  readonly id: string
}

export interface CatalogComfyuiInstancePage {
  readonly status: 'ok'
  readonly message: null
  readonly results: readonly CatalogComfyuiInstanceItem[]
  readonly page: 1
  readonly page_size: typeof CATALOG_COMFYUI_INSTANCE_PAGE_SIZE
  readonly total_count: number
}

interface CatalogContextIdentity {
  readonly id: string
}

export interface CatalogResolvedTemplate {
  readonly id: string
  readonly title: string
  readonly base_model_id: string
  readonly model_id: string | null
}

export interface CatalogResolvedLora {
  readonly id: string
  readonly base_model_id: string
  readonly model_id: string
  readonly file_name: string
  readonly description: string
  readonly usage: string
  readonly trigger_words: readonly string[]
  readonly weight: number
}

export interface CatalogResolvedGenerationModel {
  readonly id: string
  readonly base_model_id: string
  readonly file_name: string
  readonly description: string
  readonly usage: string
  readonly skill_name: string | null
}

export type CatalogContext =
  | (CatalogContextIdentity & { readonly kind: 'model'; readonly file_name: string })
  | (CatalogContextIdentity & { readonly kind: 'lora'; readonly file_name: string })
  | (CatalogContextIdentity & { readonly kind: 'work'; readonly name: string })
  | (CatalogContextIdentity & {
    readonly kind: 'character'
    readonly work_name: string
    readonly character_name: string
    readonly prompt_text: string
  })
  | (CatalogContextIdentity & { readonly kind: 'style'; readonly name: string; readonly prompt_text: string })
  | (CatalogContextIdentity & { readonly kind: 'prompt-term'; readonly tag: string })
  | (CatalogContextIdentity & { readonly kind: 'artist-string'; readonly title: string; readonly prompt_text: string })
  | (CatalogContextIdentity & { readonly kind: 'comfyui-template'; readonly title: string })

export interface CatalogItem {
  readonly context: CatalogContext
  readonly label: string
  readonly subtitle: string
  readonly coverUrl: string | null
  readonly sampleImageUrls: readonly string[]
}

export interface CatalogPage {
  readonly kind: CatalogKind
  readonly query: string
  readonly page: number
  readonly items: readonly CatalogItem[]
  readonly totalCount: number
}

export interface BaseModelItem {
  readonly id: string
  readonly label: string
}

export interface BaseModelList {
  readonly items: readonly BaseModelItem[]
}

export interface CatalogOperationError {
  readonly code: CatalogErrorCode
  readonly message: string
}

export type CatalogOperationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: CatalogOperationError }

const definitionByKind = new Map<CatalogKind, (typeof CATALOG_KIND_DEFINITIONS)[number]>(
  CATALOG_KIND_DEFINITIONS.map(definition => [definition.kind, definition]),
)

function record(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${subject} must be an object`)
  }
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], subject: string): void {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${subject} has invalid properties`)
  }
}

function catalogKind(value: unknown): CatalogKind {
  if (typeof value !== 'string' || !definitionByKind.has(value as CatalogKind)) {
    throw new TypeError('catalog kind is invalid')
  }
  return value as CatalogKind
}

export function parseCatalogQueryText(value: unknown): string {
  if (typeof value !== 'string' || value.length > 200 || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    throw new TypeError('catalog query is invalid')
  }
  return value
}

export function parseCatalogPageNumber(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 100_000) {
    throw new TypeError('catalog page is invalid')
  }
  return value as number
}

export function parseCatalogStableId(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,19}$/u.test(value)) {
    throw new TypeError('catalog item id is invalid')
  }
  return value
}

function nullableStableId(value: unknown): string | null {
  return value === null ? null : parseCatalogStableId(value)
}

function itemText(value: unknown, subject: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw new TypeError(`${subject} is invalid`)
  }
  return value
}

function catalogImageUrl(value: unknown, subject: string): string {
  if (typeof value !== 'string' || value.length > 2_000) throw new TypeError(`${subject} is invalid`)
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new TypeError(`${subject} is invalid`)
  }
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.hostname.length === 0) {
    throw new TypeError(`${subject} is invalid`)
  }
  return parsed.href
}

function coverUrl(value: unknown): string | null {
  return value === null ? null : catalogImageUrl(value, 'catalog item cover URL')
}

function sampleImageUrls(value: unknown, cover: string | null): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError('catalog item sample image URLs are invalid')
  const urls = value.map(item => catalogImageUrl(item, 'catalog item sample image URL'))
  if (new Set(urls).size !== urls.length) {
    throw new TypeError('catalog item sample image URLs are duplicated')
  }
  if (cover !== null && urls.includes(cover)) {
    throw new TypeError('catalog item sample image URLs contain the cover URL')
  }
  return Object.freeze(urls)
}

export function catalogDefinition(kind: CatalogKind): (typeof CATALOG_KIND_DEFINITIONS)[number] {
  return definitionByKind.get(kind)!
}

export function parseCatalogQueryRequest(value: unknown): CatalogQueryRequest {
  const input = record(value, 'catalog query')
  exactKeys(input, ['kind', 'query', 'page', 'baseModelId'], 'catalog query')
  const kind = catalogKind(input.kind)
  const baseModelId = input.baseModelId === null ? null : parseCatalogStableId(input.baseModelId)
  if (baseModelId !== null && !catalogDefinition(kind).baseModelScoped) {
    throw new TypeError('catalog base model filter is invalid')
  }
  return Object.freeze({
    kind,
    query: parseCatalogQueryText(input.query),
    page: parseCatalogPageNumber(input.page),
    baseModelId,
  })
}

export function parseCatalogComfyuiInstanceQueryRequest(value: unknown): CatalogComfyuiInstanceQueryRequest {
  const input = record(value, 'ComfyUI instance catalog query')
  exactKeys(input, ['mode', 'query', 'page', 'page_size'], 'ComfyUI instance catalog query')
  if (
    input.mode !== CATALOG_COMFYUI_INSTANCE_QUERY.mode
    || input.query !== CATALOG_COMFYUI_INSTANCE_QUERY.query
    || input.page !== CATALOG_COMFYUI_INSTANCE_QUERY.page
    || input.page_size !== CATALOG_COMFYUI_INSTANCE_QUERY.page_size
  ) {
    throw new TypeError('ComfyUI instance catalog query must use the fixed search request')
  }
  return CATALOG_COMFYUI_INSTANCE_QUERY
}

function parseCatalogComfyuiInstanceItem(value: unknown, index: number): CatalogComfyuiInstanceItem {
  const input = record(value, `ComfyUI instance catalog result ${index}`)
  exactKeys(input, ['id'], `ComfyUI instance catalog result ${index}`)
  return Object.freeze({
    id: parseCatalogStableId(input.id),
  })
}

export function parseCatalogComfyuiInstancePage(value: unknown): CatalogComfyuiInstancePage {
  const input = record(value, 'ComfyUI instance catalog response')
  exactKeys(
    input,
    ['status', 'message', 'results', 'page', 'page_size', 'total_count'],
    'ComfyUI instance catalog response',
  )
  if (
    input.status !== 'ok'
    || input.message !== null
    || input.page !== CATALOG_COMFYUI_INSTANCE_QUERY.page
    || input.page_size !== CATALOG_COMFYUI_INSTANCE_QUERY.page_size
    || !Array.isArray(input.results)
    || input.results.length > CATALOG_COMFYUI_INSTANCE_PAGE_SIZE
  ) {
    throw new TypeError('ComfyUI instance catalog response envelope is invalid')
  }
  const results = input.results.map(parseCatalogComfyuiInstanceItem)
  if (!Number.isSafeInteger(input.total_count) || (input.total_count as number) < results.length) {
    throw new TypeError('ComfyUI instance catalog response total count is invalid')
  }
  return Object.freeze({
    status: 'ok',
    message: null,
    results: Object.freeze(results),
    page: CATALOG_COMFYUI_INSTANCE_QUERY.page,
    page_size: CATALOG_COMFYUI_INSTANCE_QUERY.page_size,
    total_count: input.total_count as number,
  })
}

export function parseCatalogContext(value: unknown): CatalogContext {
  const input = record(value, 'catalog context')
  const kind = catalogKind(input.kind)
  const id = parseCatalogStableId(input.id)
  switch (kind) {
    case 'model':
    case 'lora':
      exactKeys(input, ['kind', 'id', 'file_name'], 'catalog context')
      return Object.freeze({ kind, id, file_name: itemText(input.file_name, 'catalog context file name', 500) })
    case 'work':
      exactKeys(input, ['kind', 'id', 'name'], 'catalog context')
      return Object.freeze({ kind, id, name: itemText(input.name, 'catalog context name', 500) })
    case 'character':
      exactKeys(input, ['kind', 'id', 'work_name', 'character_name', 'prompt_text'], 'catalog context')
      return Object.freeze({
        kind,
        id,
        work_name: itemText(input.work_name, 'catalog context work name', 500),
        character_name: itemText(input.character_name, 'catalog context character name', 500),
        prompt_text: itemText(input.prompt_text, 'catalog context prompt text', 100_000),
      })
    case 'style':
      exactKeys(input, ['kind', 'id', 'name', 'prompt_text'], 'catalog context')
      return Object.freeze({
        kind,
        id,
        name: itemText(input.name, 'catalog context name', 500),
        prompt_text: itemText(input.prompt_text, 'catalog context prompt text', 100_000),
      })
    case 'prompt-term':
      exactKeys(input, ['kind', 'id', 'tag'], 'catalog context')
      return Object.freeze({ kind, id, tag: itemText(input.tag, 'catalog context tag', 500) })
    case 'artist-string':
      exactKeys(input, ['kind', 'id', 'title', 'prompt_text'], 'catalog context')
      return Object.freeze({
        kind,
        id,
        title: itemText(input.title, 'catalog context title', 500),
        prompt_text: itemText(input.prompt_text, 'catalog context prompt text', 100_000),
      })
    case 'comfyui-template':
      exactKeys(input, ['kind', 'id', 'title'], 'catalog context')
      return Object.freeze({
        kind,
        id,
        title: itemText(input.title, 'catalog context title', 500),
      })
  }
}

export function parseCatalogResolvedTemplate(value: unknown): CatalogResolvedTemplate {
  const input = record(value, 'resolved Workflow template')
  exactKeys(input, ['id', 'title', 'base_model_id', 'model_id'], 'resolved Workflow template')
  return Object.freeze({
    id: parseCatalogStableId(input.id),
    title: itemText(input.title, 'resolved Workflow template title', 500),
    base_model_id: parseCatalogStableId(input.base_model_id),
    model_id: nullableStableId(input.model_id),
  })
}

function resolvedTriggerWords(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new TypeError('resolved LoRA trigger words are invalid')
  }
  const words = value.map((word, index) => itemText(word, `resolved LoRA trigger word ${index}`, 500))
  if (new Set(words).size !== words.length) throw new TypeError('resolved LoRA trigger words are duplicated')
  return Object.freeze(words)
}

export function parseCatalogResolvedLora(value: unknown): CatalogResolvedLora {
  const input = record(value, 'resolved LoRA')
  exactKeys(input, [
    'id', 'base_model_id', 'model_id', 'file_name', 'description', 'usage', 'trigger_words', 'weight',
  ], 'resolved LoRA')
  if (typeof input.weight !== 'number' || !Number.isFinite(input.weight)) {
    throw new TypeError('resolved LoRA weight is invalid')
  }
  return Object.freeze({
    id: parseCatalogStableId(input.id),
    base_model_id: parseCatalogStableId(input.base_model_id),
    model_id: parseCatalogStableId(input.model_id),
    file_name: itemText(input.file_name, 'resolved LoRA file name', 500),
    description: itemText(input.description, 'resolved LoRA description', 100_000),
    usage: itemText(input.usage, 'resolved LoRA usage', 100_000),
    trigger_words: resolvedTriggerWords(input.trigger_words),
    weight: input.weight,
  })
}

export function parseCatalogResolvedGenerationModel(value: unknown): CatalogResolvedGenerationModel {
  const input = record(value, 'resolved generation model')
  exactKeys(input, [
    'id', 'base_model_id', 'file_name', 'description', 'usage', 'skill_name',
  ], 'resolved generation model')
  return Object.freeze({
    id: parseCatalogStableId(input.id),
    base_model_id: parseCatalogStableId(input.base_model_id),
    file_name: itemText(input.file_name, 'resolved generation model file name', 500),
    description: itemText(input.description, 'resolved generation model description', 100_000),
    usage: itemText(input.usage, 'resolved generation model usage', 100_000),
    skill_name: input.skill_name === null
      ? null
      : itemText(input.skill_name, 'resolved generation model Skill name', 500),
  })
}

export function parseCatalogItem(value: unknown): CatalogItem {
  const input = record(value, 'catalog item')
  exactKeys(input, ['context', 'label', 'subtitle', 'coverUrl', 'sampleImageUrls'], 'catalog item')
  const parsedCoverUrl = coverUrl(input.coverUrl)
  return Object.freeze({
    context: parseCatalogContext(input.context),
    label: itemText(input.label, 'catalog item label', 500),
    subtitle: input.subtitle === '' ? '' : itemText(input.subtitle, 'catalog item subtitle', 500),
    coverUrl: parsedCoverUrl,
    sampleImageUrls: sampleImageUrls(input.sampleImageUrls, parsedCoverUrl),
  })
}

export function parseCatalogPage(value: unknown): CatalogPage {
  const input = record(value, 'catalog page')
  exactKeys(input, ['kind', 'query', 'page', 'items', 'totalCount'], 'catalog page')
  const kind = catalogKind(input.kind)
  const query = parseCatalogQueryText(input.query)
  const page = parseCatalogPageNumber(input.page)
  if (!Array.isArray(input.items) || input.items.length > CATALOG_PAGE_SIZE) {
    throw new TypeError('catalog page items are invalid')
  }
  const items = input.items.map(parseCatalogItem)
  if (items.some(item => item.context.kind !== kind)) throw new TypeError('catalog page item kind is invalid')
  if (!Number.isSafeInteger(input.totalCount) || (input.totalCount as number) < items.length) {
    throw new TypeError('catalog page total count is invalid')
  }
  return Object.freeze({
    kind,
    query,
    page,
    items: Object.freeze(items),
    totalCount: input.totalCount as number,
  })
}

export function parseBaseModelItem(value: unknown): BaseModelItem {
  const input = record(value, 'base model item')
  exactKeys(input, ['id', 'label'], 'base model item')
  return Object.freeze({
    id: parseCatalogStableId(input.id),
    label: itemText(input.label, 'base model label', 500),
  })
}

export function parseBaseModelList(value: unknown): BaseModelList {
  const input = record(value, 'base model list')
  exactKeys(input, ['items'], 'base model list')
  if (!Array.isArray(input.items) || input.items.length > CATALOG_BASE_MODEL_PAGE_SIZE) {
    throw new TypeError('base model list items are invalid')
  }
  return Object.freeze({ items: Object.freeze(input.items.map(parseBaseModelItem)) })
}

export function parseCatalogOperationResult<T>(
  value: unknown,
  parseValue: (input: unknown) => T,
  subject: string,
): CatalogOperationResult<T> {
  const input = record(value, subject)
  if (input.ok === true) {
    exactKeys(input, ['ok', 'value'], subject)
    return Object.freeze({ ok: true, value: parseValue(input.value) })
  }
  if (input.ok !== false) throw new TypeError(`${subject} status is invalid`)
  exactKeys(input, ['ok', 'error'], subject)
  const error = record(input.error, `${subject} error`)
  exactKeys(error, ['code', 'message'], `${subject} error`)
  if (!CATALOG_ERROR_CODES.includes(error.code as CatalogErrorCode)) {
    throw new TypeError(`${subject} error code is invalid`)
  }
  return Object.freeze({
    ok: false,
    error: Object.freeze({
      code: error.code as CatalogErrorCode,
      message: itemText(error.message, `${subject} error message`, 1_000),
    }),
  })
}

export function parseCatalogPageResult(value: unknown): CatalogOperationResult<CatalogPage> {
  return parseCatalogOperationResult(value, parseCatalogPage, 'catalog page result')
}

export function parseBaseModelResult(value: unknown): CatalogOperationResult<BaseModelList> {
  return parseCatalogOperationResult(value, parseBaseModelList, 'base model result')
}

export function parseCatalogSourceAddress(value: unknown): SourceAddress {
  const input = record(value, 'catalog source address')
  exactKeys(input, ['url', 'port'], 'catalog source address')
  const address = { url: input.url, port: input.port } as SourceAddress
  validateSourceSettingsSection({ configuration: address })
  return Object.freeze(address)
}

export function parseCatalogSourceAddressResult(value: unknown): CatalogOperationResult<SourceAddress> {
  return parseCatalogOperationResult(value, parseCatalogSourceAddress, 'catalog source address result')
}

export function catalogOperationSuccess<T>(value: T): CatalogOperationResult<T> {
  return Object.freeze({ ok: true, value })
}

export function catalogOperationFailure(error: CatalogOperationError): CatalogOperationResult<never> {
  return Object.freeze({ ok: false, error: Object.freeze({ ...error }) })
}

export function catalogPageCount(totalCount: number): number {
  return Math.max(1, Math.ceil(totalCount / CATALOG_PAGE_SIZE))
}

export function contextTitle(context: CatalogContext): string {
  switch (context.kind) {
    case 'model':
    case 'lora':
      return context.file_name
    case 'work':
    case 'style':
      return context.name
    case 'character':
      return `${context.work_name} · ${context.character_name}`
    case 'prompt-term':
      return context.tag
    case 'artist-string':
    case 'comfyui-template':
      return context.title
  }
}

export function contextLabel(context: CatalogContext): string {
  return `${catalogDefinition(context.kind).label} · ${contextTitle(context)}`
}

export const CATALOG_PAGE_SIZE = 9
export const CATALOG_BASE_MODEL_PAGE_SIZE = 20
export const CATALOG_QUERY_TIMEOUT_MS = 15_000
export const CATALOG_REMOTE_NAMESPACE = 'harnessComfyuiCatalog'
export const CATALOG_REMOTE_SERVICE = `remote.${CATALOG_REMOTE_NAMESPACE}`
export const CATALOG_BASE_MODEL_PATH = '/internal/semantic/base-models'

export const CATALOG_KIND_DEFINITIONS = Object.freeze([
  Object.freeze({
    kind: 'model',
    label: '生成模型',
    path: '/internal/semantic/generation-models',
    labelField: 'file_name',
    subtitleFields: Object.freeze(['author', 'file_format']),
    baseModelScoped: true,
  }),
  Object.freeze({
    kind: 'lora',
    label: 'LoRA',
    path: '/internal/semantic/loras',
    labelField: 'file_name',
    subtitleFields: Object.freeze(['author', 'version']),
    baseModelScoped: true,
  }),
  Object.freeze({
    kind: 'work',
    label: '作品',
    path: '/internal/semantic/works',
    labelField: 'name',
    subtitleFields: Object.freeze(['category_name']),
    baseModelScoped: false,
  }),
  Object.freeze({
    kind: 'character',
    label: '角色',
    path: '/internal/semantic/characters',
    labelField: 'name',
    subtitleFields: Object.freeze(['works.name']),
    baseModelScoped: false,
  }),
  Object.freeze({
    kind: 'style',
    label: '画师或画风',
    path: '/internal/semantic/styles',
    labelField: 'name',
    subtitleFields: Object.freeze(['prompt_text']),
    baseModelScoped: true,
  }),
  Object.freeze({
    kind: 'prompt-term',
    label: '提示词条目',
    path: '/internal/semantic/prompt-terms',
    labelField: 'canonical_tag',
    subtitleFields: Object.freeze(['post_count']),
    baseModelScoped: false,
  }),
  Object.freeze({
    kind: 'artist-string',
    label: '画师串',
    path: '/internal/semantic/artist-prompt-strings',
    labelField: 'title',
    subtitleFields: Object.freeze(['description']),
    baseModelScoped: true,
  }),
  Object.freeze({
    kind: 'comfyui-template',
    label: 'Workflow 模板',
    path: '/internal/semantic/comfyui-templates',
    labelField: 'title',
    subtitleFields: Object.freeze(['template_type']),
    baseModelScoped: true,
  }),
] as const)

export type CatalogKind = (typeof CATALOG_KIND_DEFINITIONS)[number]['kind']

export interface CatalogQueryRequest {
  readonly kind: CatalogKind
  readonly query: string
  readonly page: number
  readonly baseModelId: string | null
}

interface CatalogContextIdentity {
  readonly id: string
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

function queryText(value: unknown): string {
  if (typeof value !== 'string' || value.length > 200 || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    throw new TypeError('catalog query is invalid')
  }
  return value
}

function pageNumber(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 100_000) {
    throw new TypeError('catalog page is invalid')
  }
  return value as number
}

function stableId(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,19}$/u.test(value)) {
    throw new TypeError('catalog item id is invalid')
  }
  return value
}

function itemText(value: unknown, subject: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw new TypeError(`${subject} is invalid`)
  }
  return value
}

function coverUrl(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || value.length > 2_000) throw new TypeError('catalog item cover URL is invalid')
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new TypeError('catalog item cover URL is invalid')
  }
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1') {
    throw new TypeError('catalog item cover URL is invalid')
  }
  return parsed.href
}

export function catalogDefinition(kind: CatalogKind): (typeof CATALOG_KIND_DEFINITIONS)[number] {
  return definitionByKind.get(kind)!
}

export function parseCatalogQueryRequest(value: unknown): CatalogQueryRequest {
  const input = record(value, 'catalog query')
  exactKeys(input, ['kind', 'query', 'page', 'baseModelId'], 'catalog query')
  const kind = catalogKind(input.kind)
  const baseModelId = input.baseModelId === null ? null : stableId(input.baseModelId)
  if (baseModelId !== null && !catalogDefinition(kind).baseModelScoped) {
    throw new TypeError('catalog base model filter is invalid')
  }
  return Object.freeze({
    kind,
    query: queryText(input.query),
    page: pageNumber(input.page),
    baseModelId,
  })
}

export function parseCatalogContext(value: unknown): CatalogContext {
  const input = record(value, 'catalog context')
  const kind = catalogKind(input.kind)
  const id = stableId(input.id)
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
      return Object.freeze({ kind, id, title: itemText(input.title, 'catalog context title', 500) })
  }
}

export function parseCatalogItem(value: unknown): CatalogItem {
  const input = record(value, 'catalog item')
  exactKeys(input, ['context', 'label', 'subtitle', 'coverUrl'], 'catalog item')
  return Object.freeze({
    context: parseCatalogContext(input.context),
    label: itemText(input.label, 'catalog item label', 500),
    subtitle: itemText(input.subtitle, 'catalog item subtitle', 500),
    coverUrl: coverUrl(input.coverUrl),
  })
}

export function parseCatalogPage(value: unknown): CatalogPage {
  const input = record(value, 'catalog page')
  exactKeys(input, ['kind', 'query', 'page', 'items', 'totalCount'], 'catalog page')
  const kind = catalogKind(input.kind)
  const query = queryText(input.query)
  const page = pageNumber(input.page)
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
    id: stableId(input.id),
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

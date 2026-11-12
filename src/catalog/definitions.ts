import { CATALOG_PRESENTATION as presentation } from './presentation-schema.ts'
import sourceClientConfiguration from '../../config/source-client.json' with { type: 'json' }
function sourceCatalogPath(toolName: string): string {
  const operation = Object.entries(sourceClientConfiguration.catalog.operations).find(([, entry]) => entry.toolName === toolName)
  if (operation === undefined) throw new TypeError(`Catalog operation is not configured: ${toolName}`)
  return operation[0]
}
export const CATALOG_PAGE_SIZE = presentation.pageSize
export const CATALOG_BASE_MODEL_PAGE_SIZE = sourceClientConfiguration.catalog.baseModelPageSize
export const CATALOG_COMFYUI_INSTANCE_PAGE_SIZE = sourceClientConfiguration.catalog.instancePageSize
export const CATALOG_QUERY_TIMEOUT_MS = sourceClientConfiguration.catalog.queryTimeoutMs
export const CATALOG_REMOTE_NAMESPACE = 'harnessComfyuiCatalog'
export const CATALOG_REMOTE_SERVICE = `remote.${CATALOG_REMOTE_NAMESPACE}`
export const CATALOG_BASE_MODEL_PATH = sourceCatalogPath('query_semantic_base_models')
export const CATALOG_COMFYUI_INSTANCE_PATH = sourceCatalogPath('query_semantic_comfyui_instances')
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
    path: sourceCatalogPath('query_semantic_generation_models'),
    labelField: 'file_name',
    subtitleFields: Object.freeze(presentation.kinds['model'].summary),
    multiple: presentation.kinds['model'].multiple,
    baseModelScoped: true,
  }),
  Object.freeze({
    kind: 'lora',
    label: 'LoRA',
    path: sourceCatalogPath('query_semantic_loras'),
    labelField: 'file_name',
    subtitleFields: Object.freeze(presentation.kinds['lora'].summary),
    multiple: presentation.kinds['lora'].multiple,
    baseModelScoped: true,
  }),
  Object.freeze({
    kind: 'work',
    label: '作品',
    path: sourceCatalogPath('query_semantic_works'),
    labelField: 'name',
    subtitleFields: Object.freeze(presentation.kinds['work'].summary),
    multiple: presentation.kinds['work'].multiple,
    baseModelScoped: false,
  }),
  Object.freeze({
    kind: 'character',
    label: '角色',
    path: sourceCatalogPath('query_semantic_characters'),
    labelField: 'name',
    subtitleFields: Object.freeze(presentation.kinds['character'].summary),
    multiple: presentation.kinds['character'].multiple,
    baseModelScoped: false,
  }),
  Object.freeze({
    kind: 'style',
    label: '画师或画风',
    path: sourceCatalogPath('query_semantic_styles'),
    labelField: 'name',
    subtitleFields: Object.freeze(presentation.kinds['style'].summary),
    multiple: presentation.kinds['style'].multiple,
    baseModelScoped: true,
  }),
  Object.freeze({
    kind: 'prompt-term',
    label: '提示词条目',
    path: sourceCatalogPath('query_semantic_prompt_terms'),
    labelField: 'canonical_tag',
    subtitleFields: Object.freeze(presentation.kinds['prompt-term'].summary),
    multiple: presentation.kinds['prompt-term'].multiple,
    baseModelScoped: false,
  }),
  Object.freeze({
    kind: 'artist-string',
    label: '画师串',
    path: sourceCatalogPath('query_semantic_artist_prompt_strings'),
    labelField: 'title',
    subtitleFields: Object.freeze(presentation.kinds['artist-string'].summary),
    multiple: presentation.kinds['artist-string'].multiple,
    baseModelScoped: true,
  }),
  Object.freeze({
    kind: 'comfyui-template',
    label: 'Workflow 模板',
    path: sourceCatalogPath('query_semantic_comfyui_templates'),
    labelField: 'title',
    subtitleFields: Object.freeze(presentation.kinds['comfyui-template'].summary),
    multiple: presentation.kinds['comfyui-template'].multiple,
    baseModelScoped: true,
  }),
] as const)

export type CatalogKind = (typeof CATALOG_KIND_DEFINITIONS)[number]['kind']
export type CatalogErrorCode = (typeof CATALOG_ERROR_CODES)[number]

export const CATALOG_STABLE_ID_PATTERN = /^[1-9][0-9]{0,19}$/u

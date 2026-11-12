import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  CATALOG_KIND_DEFINITIONS,
  CATALOG_PAGE_SIZE,
  catalogPageCount,
  catalogDefinition,
  type BaseModelList,
  type CatalogContext,
  type CatalogItem,
  type CatalogPage,
  type CatalogQueryRequest,
} from '../../catalog/contract.ts'
import {
  CATALOG_FIELDS,
  CATALOG_PRESENTATION,
  type CatalogDetails,
  type CatalogDetailsRequest,
} from '../../catalog/details-schema.ts'
import { catalogFailureText, workbenchContextKey } from './contract.ts'

export interface CatalogApi {
  readonly details: (request: CatalogDetailsRequest, signal: AbortSignal) => Promise<CatalogDetails>
  readonly search: (request: CatalogQueryRequest, signal: AbortSignal) => Promise<CatalogPage>
  readonly baseModels: (signal: AbortSignal) => Promise<BaseModelList>
}

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'
export type CatalogReference = Pick<CatalogContext, 'kind' | 'id'>

interface CatalogPageEntry {
  status: LoadStatus
  page: CatalogPage | null
  error: string | null
  readonly controller: AbortController
}

export function useCatalogBrowser({ catalog, enabled = true, query, onInvalidBaseModel, modelOptions = false }: {
  readonly catalog?: CatalogApi
  readonly enabled?: boolean
  readonly query: Omit<CatalogQueryRequest, 'kind'> & { readonly kind: string }
  readonly onInvalidBaseModel?: (id: string) => void
  readonly modelOptions?: boolean
}) {
  const definition = CATALOG_KIND_DEFINITIONS.find(item => item.kind === query.kind) ?? CATALOG_KIND_DEFINITIONS[0]
  const [baseModels, setBaseModels] = useState<BaseModelList | null>(null)
  const [baseModelStatus, setBaseModelStatus] = useState<LoadStatus>('idle')
  const [baseModelError, setBaseModelError] = useState<string | null>(null)
  const [models, setModels] = useState<readonly CatalogItem[]>([])
  const [modelStatus, setModelStatus] = useState<LoadStatus>('idle')
  const [modelError, setModelError] = useState<string | null>(null)
  const [modelAttempt, setModelAttempt] = useState(0)
  const pageCache = useMemo(() => new Map<string, CatalogPageEntry>(), [catalog])
  const [, renderPages] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [baseAttempt, setBaseAttempt] = useState(0)
  useEffect(() => {
    setBaseModels(null)
    setBaseModelError(null)
    setBaseModelStatus(enabled && catalog ? 'loading' : 'idle')
    if (!enabled || !catalog) return
    const controller = new AbortController()
    void catalog.baseModels(controller.signal).then(result => {
      if (controller.signal.aborted) return
      setBaseModels(result)
      setBaseModelStatus('ready')
    }).catch(reason => {
      if (controller.signal.aborted) return
      setBaseModelError(catalogFailureText(reason))
      setBaseModelStatus('error')
    })
    return () => controller.abort()
  }, [catalog, enabled, baseAttempt])
  const baseModelReady = !onInvalidBaseModel || !definition.baseModelScoped || query.baseModelId === null
    || baseModelStatus === 'ready' && !!baseModels?.items.some(item => item.id === query.baseModelId)
  useEffect(() => {
    if (enabled && onInvalidBaseModel && query.baseModelId !== null && baseModelStatus === 'ready'
      && !baseModels?.items.some(item => item.id === query.baseModelId)) onInvalidBaseModel(query.baseModelId)
  }, [enabled, onInvalidBaseModel, query.baseModelId, baseModelStatus, baseModels])
  useEffect(() => {
    setModels([])
    setModelError(null)
    setModelStatus(enabled && catalog && modelOptions ? 'loading' : 'idle')
    if (!enabled || !catalog || !modelOptions) return
    const controller = new AbortController()
    const load = async () => {
      const items: CatalogItem[] = []
      let page = 1
      let pages = 1
      do {
        const result = await catalog.search({ kind: 'model', query: '', page, baseModelId: query.baseModelId, modelId: null }, controller.signal)
        if (controller.signal.aborted) return
        items.push(...result.items)
        pages = catalogPageCount(result.totalCount)
        page++
      } while (page <= pages)
      setModels(items)
      setModelStatus('ready')
    }
    void load().catch(reason => {
      if (controller.signal.aborted) return
      setModelError(catalogFailureText(reason))
      setModelStatus('error')
    })
    return () => controller.abort()
  }, [catalog, enabled, modelOptions, query.baseModelId, modelAttempt])
  const request: CatalogQueryRequest = {
    kind: definition.kind,
    query: query.query,
    page: query.page,
    baseModelId: definition.baseModelScoped ? query.baseModelId : null,
    modelId: definition.baseModelScoped ? query.modelId : null,
  }
  const pageKey = JSON.stringify([request.kind, request.query, request.baseModelId, request.modelId, request.page, CATALOG_PAGE_SIZE])
  useEffect(() => () => {
    for (const entry of pageCache.values()) entry.controller.abort()
    pageCache.clear()
  }, [pageCache, enabled])
  useEffect(() => {
    if (!enabled || !catalog || !baseModelReady || pageCache.has(pageKey)) return
    const entry: CatalogPageEntry = { status: 'loading', page: null, error: null, controller: new AbortController() }
    pageCache.set(pageKey, entry)
    renderPages(value => value + 1)
    const current = () => !entry.controller.signal.aborted && pageCache.get(pageKey) === entry
    void catalog.search(request, entry.controller.signal).then(result => {
      if (!current()) return
      entry.page = result
      entry.status = 'ready'
      renderPages(value => value + 1)
    }).catch(reason => {
      if (!current()) return
      entry.error = catalogFailureText(reason)
      entry.status = 'error'
      renderPages(value => value + 1)
    })
  }, [catalog, enabled, baseModelReady, pageCache, pageKey, attempt])
  const currentPage = enabled && catalog && baseModelReady ? pageCache.get(pageKey) : undefined
  const page = currentPage?.page ?? null
  const status: LoadStatus = currentPage?.status ?? (enabled && catalog && baseModelReady ? 'loading' : 'idle')
  const error = currentPage?.error ?? null
  const retry = () => {
    pageCache.get(pageKey)?.controller.abort()
    pageCache.delete(pageKey)
    if (baseModelStatus === 'error') setBaseAttempt(value => value + 1)
    if (modelStatus === 'error') setModelAttempt(value => value + 1)
    setAttempt(value => value + 1)
  }
  return { definition, baseModels, baseModelStatus, baseModelError, models, modelError, page, status, error, retry }
}

export function useCatalogDetails(request: CatalogDetailsRequest | null, load?: CatalogApi['details']) {
  const [details, setDetails] = useState<CatalogDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const kind = request?.kind
  const id = request?.id
  useEffect(() => {
    setDetails(null)
    setError(null)
    if (kind === undefined || id === undefined || !load) return
    const controller = new AbortController()
    void load({ kind, id }, controller.signal).then(result => {
      if (!controller.signal.aborted) setDetails(result)
    }).catch(reason => {
      if (!controller.signal.aborted) setError(catalogFailureText(reason))
    })
    return () => controller.abort()
  }, [kind, id, load, attempt])
  return { details, error, retry: () => setAttempt(value => value + 1) }
}

export function CatalogKinds({ selected, children }: {
  readonly selected: CatalogQueryRequest['kind']
  readonly children: (definition: typeof CATALOG_KIND_DEFINITIONS[number], selected: boolean) => ReactNode
}) {
  return <>{CATALOG_KIND_DEFINITIONS.map(definition => <Fragment key={definition.kind}>
    {children(definition, definition.kind === selected)}
  </Fragment>)}</>
}

export function CatalogItems({ items, selection, children }: {
  readonly items: readonly CatalogItem[]
  readonly selection: Iterable<CatalogReference>
  readonly children: (item: CatalogItem, selected: boolean, key: string) => ReactNode
}) {
  const selectedKeys = new Set(Array.from(selection, workbenchContextKey))
  return <>{items.map(item => {
    const key = workbenchContextKey(item.context)
    return <Fragment key={key}>{children(item, selectedKeys.has(key), key)}</Fragment>
  })}</>
}


export function catalogImageUrls(item: CatalogItem | null): readonly string[] {
  if (item === null) return []
  return item.coverUrl === null ? item.sampleImageUrls : [item.coverUrl, ...item.sampleImageUrls]
}

export function CatalogDetailFields({ details, presentation, baseModels = [] }: {
  readonly details: CatalogDetails
  readonly presentation: 'chat' | 'resource'
  readonly baseModels?: BaseModelList['items']
}) {
  const values = new Map(details.fields.map(field => [field.key, field.value]))
  values.set('resource_type', catalogDefinition(details.kind).label)
  values.set('base_model', baseModels.find(item => item.id === details.item.baseModelId)?.label ?? null)
  const sources = CATALOG_PRESENTATION.resourceSources[details.kind] ?? {}
  const fields = presentation === 'resource'
    ? CATALOG_PRESENTATION.resourceDetails.flatMap(key => {
      const value = values.get(sources[key] ?? key)
      return value === undefined || value === null ? [] : [{ key, value }]
    })
    : details.fields
  const shown = new Set(fields.map(field => sources[field.key] ?? field.key))
  const remaining = presentation === 'resource' ? details.fields.filter(field => !shown.has(field.key) && field.value !== null) : []
  const displayValue = (key: string, value: unknown, original: boolean) => {
    if (original) return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    if (presentation === 'chat' && (value === null || value === '' || Array.isArray(value) && value.length === 0)) return CATALOG_PRESENTATION.copy.emptyValue
    if (presentation === 'resource' && key === 'template_type') return CATALOG_PRESENTATION.templateTypes[String(value)] ?? String(value)
    if (Array.isArray(value)) return value.join('、')
    return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
  }
  const rows = (entries: readonly { readonly key: string; readonly value: unknown }[], original = false) => <dl>{entries.map(field => <div key={field.key}>
    <dt>{CATALOG_FIELDS[field.key]?.label ?? field.key}</dt>
    <dd>{displayValue(field.key, field.value, original)}</dd>
  </div>)}</dl>
  return <>{rows(fields)}
    {!!remaining.length && <details className="catalog-extra-fields"><summary>更多资料</summary>{rows(remaining)}</details>}
    {presentation === 'resource' && !!Object.keys(details.extra_fields ?? {}).length && <details className="catalog-extra-fields"><summary>其他字段</summary>{rows(Object.entries(details.extra_fields!).map(([key, value]) => ({ key, value })), true)}</details>}
  </>
}

import { Fragment, useEffect, useState, type ReactNode } from 'react'
import {
  CATALOG_KIND_DEFINITIONS,
  catalogPageCount,
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
  const [page, setPage] = useState<CatalogPage | null>(null)
  const [status, setStatus] = useState<LoadStatus>('idle')
  const [error, setError] = useState<string | null>(null)
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
  useEffect(() => {
    setPage(null)
    setError(null)
    setStatus(enabled && catalog && baseModelReady ? 'loading' : 'idle')
    if (!enabled || !catalog || !baseModelReady) return
    const controller = new AbortController()
    void catalog.search({
      kind: definition.kind,
      query: query.query,
      page: query.page,
      baseModelId: definition.baseModelScoped ? query.baseModelId : null,
      modelId: definition.baseModelScoped ? query.modelId : null,
    }, controller.signal).then(result => {
      if (controller.signal.aborted) return
      setPage(result)
      setStatus('ready')
    }).catch(reason => {
      if (controller.signal.aborted) return
      setError(catalogFailureText(reason))
      setStatus('error')
    })
    return () => controller.abort()
  }, [catalog, enabled, baseModelReady, definition, query.kind, query.query, query.page, query.baseModelId, query.modelId, attempt])
  const retry = () => {
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

export function CatalogDetailFields({ details, presentation }: {
  readonly details: CatalogDetails
  readonly presentation: 'chat' | 'resource'
}) {
  return <dl>{details.fields.filter(field => presentation === 'chat' || field.value !== null).map(field => <div key={field.key}>
    <dt>{CATALOG_FIELDS[field.key]!.label}</dt>
    <dd>{presentation === 'chat' && (field.value === null || field.value === '' || Array.isArray(field.value) && field.value.length === 0)
      ? CATALOG_PRESENTATION.copy.emptyValue
      : Array.isArray(field.value) ? field.value.join('、') : String(field.value)}</dd>
  </div>)}</dl>
}

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import {
  Button,
  IconCheckOutline16,
  IconChevronDownOutline14,
  IconSearchOutline16,
  IconSparkle16,
  Input,
  Menu,
  Modal,
  Pill,
} from '@deepseek-ai/dsh-client-ui-primitives'

import {
  CATALOG_KIND_DEFINITIONS,
  catalogDefinition,
  catalogPageCount,
  contextLabel,
  type BaseModelList,
  type CatalogContext,
  type CatalogItem,
  type CatalogKind,
  type CatalogPage,
  type CatalogQueryRequest,
} from '../../catalog/contract.ts'

import {
  WORKBENCH_COPY,
  catalogFailureText,
  workbenchContextsFromDraft,
  workbenchContextKey,
} from './contract.ts'
import {
  removeWorkbenchContext,
  setWorkbenchContexts,
  type WorkbenchController,
  type WorkbenchSessionInput,
} from './controller.ts'

export interface WorkbenchEntryProps {
  readonly wide: boolean
  readonly workbench: WorkbenchController
}

export function WorkbenchEntry({ wide, workbench }: WorkbenchEntryProps) {
  const active = useSyncExternalStore(
    workbench.subscribe,
    workbench.getSnapshot,
    workbench.getSnapshot,
  )

  return (
    <Button
      className="harness-comfyui-sidebar-entry"
      variant="toolbar"
      size="sm"
      icon={<IconSparkle16 />}
      aria-label={WORKBENCH_COPY.entry}
      aria-pressed={active}
      title={WORKBENCH_COPY.entry}
      onClick={() => workbench.toggle()}
    >
      {wide ? WORKBENCH_COPY.entry : null}
    </Button>
  )
}

export interface CatalogApi {
  readonly search: (request: CatalogQueryRequest, signal: AbortSignal) => Promise<CatalogPage>
  readonly baseModels: (signal: AbortSignal) => Promise<BaseModelList>
}

export interface WorkbenchDockProps {
  readonly catalog: CatalogApi
  readonly input: ReturnType<WorkbenchSessionInput['state']['getSnapshot']>
  readonly sessionInput: WorkbenchSessionInput
  readonly workbench: WorkbenchController
}

const INITIAL_KIND: CatalogKind = 'comfyui-template'

export function WorkbenchDock({ catalog, input, sessionInput, workbench }: WorkbenchDockProps) {
  const active = useSyncExternalStore(
    workbench.subscribe,
    workbench.getSnapshot,
    workbench.getSnapshot,
  )
  const selectedContexts = workbenchContextsFromDraft(input.draft)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [baseModelMenuOpen, setBaseModelMenuOpen] = useState(false)
  const [baseModels, setBaseModels] = useState<BaseModelList | null>(null)
  const [baseModelStatus, setBaseModelStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [baseModelError, setBaseModelError] = useState<string | null>(null)
  const [selectedBaseModelId, setSelectedBaseModelId] = useState<string | null>(null)
  const [selectedKind, setSelectedKind] = useState<CatalogKind>(INITIAL_KIND)
  const [queryText, setQueryText] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [requestVersion, setRequestVersion] = useState(0)
  const [page, setPage] = useState<CatalogPage | null>(null)
  const [selectedOptions, setSelectedOptions] = useState<ReadonlyMap<string, CatalogContext>>(new Map())
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [catalogError, setCatalogError] = useState<string | null>(null)

  useEffect(() => {
    if (!dialogOpen) return
    const controller = new AbortController()
    let current = true
    setBaseModelStatus('loading')
    setBaseModelError(null)
    setBaseModels(null)
    void catalog.baseModels(controller.signal).then(result => {
      if (!current || controller.signal.aborted) return
      setBaseModels(result)
      setBaseModelStatus('ready')
    }).catch((error: unknown) => {
      if (!current || controller.signal.aborted) return
      setBaseModelError(catalogFailureText(error))
      setBaseModelStatus('error')
    })
    return () => {
      current = false
      controller.abort()
    }
  }, [catalog, dialogOpen])

  useEffect(() => {
    if (!dialogOpen) return
    const controller = new AbortController()
    let current = true
    const definition = catalogDefinition(selectedKind)
    setStatus('loading')
    setCatalogError(null)
    setPage(null)
    void catalog.search({
      kind: selectedKind,
      query: submittedQuery,
      page: currentPage,
      baseModelId: definition.baseModelScoped ? selectedBaseModelId : null,
    }, controller.signal).then(result => {
      if (!current || controller.signal.aborted) return
      setPage(result)
      setStatus('ready')
    }).catch((error: unknown) => {
      if (!current || controller.signal.aborted) return
      setCatalogError(catalogFailureText(error))
      setStatus('error')
    })
    return () => {
      current = false
      controller.abort()
    }
  }, [catalog, currentPage, dialogOpen, requestVersion, selectedBaseModelId, selectedKind, submittedQuery])

  const activeBaseModelLabel = selectedBaseModelId === null
    ? WORKBENCH_COPY.allBaseModels
    : baseModels?.items.find(item => item.id === selectedBaseModelId)?.label ?? WORKBENCH_COPY.allBaseModels
  const baseModelMenuItems = useMemo(() => [
    { id: 'all', label: WORKBENCH_COPY.allBaseModels },
    ...(baseModels?.items.map(item => ({ id: item.id, label: item.label })) ?? []),
  ], [baseModels])
  const totalPages = catalogPageCount(page?.totalCount ?? 0)

  if (!active) return null

  const closeDialog = () => {
    setDialogOpen(false)
    setBaseModelMenuOpen(false)
    setSelectedOptions(new Map())
  }

  const openDialog = () => {
    setSelectedKind(INITIAL_KIND)
    setSelectedBaseModelId(null)
    setQueryText('')
    setSubmittedQuery('')
    setCurrentPage(1)
    setSelectedOptions(new Map(selectedContexts.map(option => [workbenchContextKey(option), option])))
    setDialogOpen(true)
  }

  const insertSelectedContexts = () => {
    setWorkbenchContexts(sessionInput, selectedOptions.values())
    closeDialog()
  }

  const selectKind = (kind: CatalogKind) => {
    setSelectedKind(kind)
    setQueryText('')
    setSubmittedQuery('')
    setCurrentPage(1)
  }

  const search = () => {
    setSubmittedQuery(queryText.trim())
    setCurrentPage(1)
    setRequestVersion(version => version + 1)
  }

  const toggleOption = (option: CatalogItem) => {
    setSelectedOptions(current => {
      const next = new Map(current)
      const key = workbenchContextKey(option.context)
      if (next.has(key)) next.delete(key)
      else next.set(key, option.context)
      return next
    })
  }

  return (
    <section className="harness-comfyui-dock" aria-label={WORKBENCH_COPY.entry}>
      <div className="harness-comfyui-dock-row">
        <strong className="harness-comfyui-dock-title">{WORKBENCH_COPY.entry}</strong>
        <div className="harness-comfyui-dock-actions">
          <Button variant="toolbar" size="sm" onClick={() => workbench.openResults()}>
            {WORKBENCH_COPY.openResults}
          </Button>
          <Button variant="outline" size="sm" onClick={openDialog}>
            {WORKBENCH_COPY.insertContext}
          </Button>
        </div>
      </div>

      {selectedContexts.length > 0 ? (
        <div className="harness-comfyui-selected-contexts" aria-label={WORKBENCH_COPY.selectedContexts}>
          <span className="harness-comfyui-selected-label">{WORKBENCH_COPY.selectedContexts}</span>
          {selectedContexts.map(option => (
            <Pill
              key={workbenchContextKey(option)}
              active
              className="harness-comfyui-selected-context-pill"
              aria-label={`${WORKBENCH_COPY.removeContext} ${contextLabel(option)}`}
              onClick={() => removeWorkbenchContext(sessionInput, option)}
            >
              {contextLabel(option)}
              <span className="harness-comfyui-selected-context-remove" aria-hidden="true">×</span>
            </Pill>
          ))}
        </div>
      ) : null}

      <Modal
        open={dialogOpen}
        onClose={closeDialog}
        title={WORKBENCH_COPY.dialogTitle}
        closeLabel={WORKBENCH_COPY.closeDialog}
        className="harness-comfyui-catalog-modal"
        contentClassName="harness-comfyui-catalog-modal-content"
        footer={(
          <>
            <span className="harness-comfyui-selection-count">
              {WORKBENCH_COPY.selected} {selectedOptions.size}
            </span>
            <Button variant="ghost" onClick={closeDialog}>
              {WORKBENCH_COPY.cancel}
            </Button>
            <Button variant="primary" disabled={selectedOptions.size === 0} onClick={insertSelectedContexts}>
              {WORKBENCH_COPY.confirm}
            </Button>
          </>
        )}
      >
        <div className="harness-comfyui-base-model-row">
          <span>{WORKBENCH_COPY.baseModel}</span>
          <Menu
            open={baseModelMenuOpen}
            onClose={() => setBaseModelMenuOpen(false)}
            items={baseModelMenuItems}
            selectedId={selectedBaseModelId ?? 'all'}
            onSelect={id => {
              setSelectedBaseModelId(id === 'all' ? null : id)
              setCurrentPage(1)
              setBaseModelMenuOpen(false)
            }}
            portal
            anchor={(
              <Button
                variant="outline"
                size="sm"
                aria-haspopup="menu"
                aria-expanded={baseModelMenuOpen}
                disabled={baseModelStatus === 'loading'}
                onClick={() => setBaseModelMenuOpen(open => !open)}
              >
                <span>{activeBaseModelLabel}</span>
                <IconChevronDownOutline14 />
              </Button>
            )}
          />
          {baseModelStatus === 'error' ? <span>{baseModelError}</span> : null}
        </div>

        <div className="harness-comfyui-catalog">
          <nav className="harness-comfyui-catalog-kinds" aria-label="资源类型">
            {CATALOG_KIND_DEFINITIONS.map(definition => (
              <Button
                key={definition.kind}
                variant={definition.kind === selectedKind ? 'primary' : 'toolbar'}
                size="sm"
                icon={definition.kind === selectedKind ? <IconCheckOutline16 /> : undefined}
                aria-pressed={definition.kind === selectedKind}
                onClick={() => selectKind(definition.kind)}
              >
                {definition.label}
              </Button>
            ))}
          </nav>
          <div className="harness-comfyui-catalog-results">
            <form
              className="harness-comfyui-catalog-search"
              onSubmit={event => {
                event.preventDefault()
                search()
              }}
            >
              <Input
                icon={<IconSearchOutline16 />}
                value={queryText}
                maxLength={200}
                placeholder={`${WORKBENCH_COPY.search}${catalogDefinition(selectedKind).label}`}
                aria-label={WORKBENCH_COPY.search}
                onChange={event => setQueryText(event.currentTarget.value)}
              />
              <Button variant="outline" size="sm" type="submit">
                {WORKBENCH_COPY.search}
              </Button>
            </form>

            <div className="harness-comfyui-catalog-items" aria-label="资源卡片">
              {status === 'loading' ? <span className="harness-comfyui-catalog-state">{WORKBENCH_COPY.loading}</span> : null}
              {status === 'error' ? <span className="harness-comfyui-catalog-state">{catalogError}</span> : null}
              {status === 'ready' && page?.items.length === 0 ? <span className="harness-comfyui-catalog-state">{WORKBENCH_COPY.empty}</span> : null}
              {status === 'ready' ? page?.items.map(option => {
                const selected = selectedOptions.has(workbenchContextKey(option.context))
                return (
                  <Button
                    key={workbenchContextKey(option.context)}
                    className="harness-comfyui-catalog-card"
                    variant="toolbar"
                    aria-pressed={selected}
                    aria-label={`${selected ? WORKBENCH_COPY.selectedItem : WORKBENCH_COPY.selectItem} ${option.label}`}
                    onClick={() => toggleOption(option)}
                  >
                    <span className="harness-comfyui-card-cover">
                      {option.coverUrl === null ? (
                        <span className="harness-comfyui-card-placeholder">{WORKBENCH_COPY.noCover}</span>
                      ) : (
                        <img src={option.coverUrl} alt={`${option.label} 封面`} loading="lazy" />
                      )}
                      <span className="harness-comfyui-card-selection" aria-hidden="true">
                        {selected ? <IconCheckOutline16 /> : null}
                        {selected ? WORKBENCH_COPY.selectedItem : WORKBENCH_COPY.selectItem}
                      </span>
                    </span>
                    <span className="harness-comfyui-card-copy">
                      <strong>{option.label}</strong>
                      <small>{option.subtitle}</small>
                    </span>
                  </Button>
                )
              }) : null}
            </div>

            <div className="harness-comfyui-catalog-pagination">
              <Button
                variant="outline"
                size="sm"
                disabled={status !== 'ready' || currentPage <= 1}
                onClick={() => setCurrentPage(value => value - 1)}
              >
                {WORKBENCH_COPY.previousPage}
              </Button>
              <span>{currentPage} / {totalPages}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={status !== 'ready' || currentPage >= totalPages}
                onClick={() => setCurrentPage(value => value + 1)}
              >
                {WORKBENCH_COPY.nextPage}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </section>
  )
}

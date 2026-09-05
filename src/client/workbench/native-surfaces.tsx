import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import {
  Button,
  IconCheckOutline16,
  IconChevronDownOutline14,
  IconChevronLeftOutline14,
  IconChevronRightOutline14,
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
  workbenchErrorText,
  workbenchContextsFromDraft,
  workbenchContextKey,
} from './contract.ts'
import {
  removeWorkbenchContext,
  setWorkbenchContexts,
  type WorkbenchController,
  type WorkbenchSessionInput,
} from './controller.ts'
import type { ContextDialogNavigation } from './context-dialog-navigation.ts'

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
  readonly dialogNavigation: ContextDialogNavigation
  readonly input: ReturnType<WorkbenchSessionInput['state']['getSnapshot']>
  readonly sessionId: string
  readonly sessionInput: WorkbenchSessionInput
  readonly workbench: WorkbenchController
}

type WorkbenchDockSessionProps = Omit<WorkbenchDockProps, 'sessionId'>

const DETAILS_COLLAPSED_ATTRIBUTE = 'data-details-collapsed'
const WORKBENCH_DOCK_ACTIONS_SELECTOR = '.harness-comfyui-dock-actions'

interface DetailsLayoutTarget extends EventTarget {
  hasAttribute(name: string): boolean
  querySelector(selector: string): Element | null
}

function detailsOpenFromLayoutTarget(target: EventTarget): boolean | undefined {
  const candidate = target as Partial<DetailsLayoutTarget>
  if (typeof candidate.hasAttribute !== 'function' || typeof candidate.querySelector !== 'function') {
    return undefined
  }
  if (candidate.querySelector(WORKBENCH_DOCK_ACTIONS_SELECTOR) === null) return undefined
  return !candidate.hasAttribute(DETAILS_COLLAPSED_ATTRIBUTE)
}

export function WorkbenchDock({ sessionId, ...props }: WorkbenchDockProps) {
  useEffect(() => props.workbench.syncCurrentSession(sessionId), [sessionId, props.workbench])
  useEffect(() => {
    if (typeof MutationObserver === 'undefined' || document.body === undefined) return undefined
    const syncTarget = (target: EventTarget) => {
      const open = detailsOpenFromLayoutTarget(target)
      if (open !== undefined) props.workbench.syncDetailsOpen(open)
    }
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.attributeName === DETAILS_COLLAPSED_ATTRIBUTE) syncTarget(record.target)
      }
    })
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: [DETAILS_COLLAPSED_ATTRIBUTE],
      subtree: true,
    })
    const collapsedFrame = document.querySelector(`[${DETAILS_COLLAPSED_ATTRIBUTE}]`)
    if (collapsedFrame !== null) syncTarget(collapsedFrame)
    return () => observer.disconnect()
  }, [props.workbench])
  return <WorkbenchDockSession key={sessionId} {...props} />
}

function WorkbenchDockSession({
  catalog,
  dialogNavigation,
  input,
  sessionInput,
  workbench,
}: WorkbenchDockSessionProps) {
  const active = useSyncExternalStore(
    workbench.subscribe,
    workbench.getSnapshot,
    workbench.getSnapshot,
  )
  const resultsOpen = useSyncExternalStore(
    workbench.subscribeResults,
    workbench.getResultsSnapshot,
    workbench.getResultsSnapshot,
  )
  const navigationSnapshot = useSyncExternalStore(
    dialogNavigation.subscribe,
    dialogNavigation.getSnapshot,
    dialogNavigation.getSnapshot,
  )
  const {
    selectedBaseModelId,
    selectedKind,
    queryText,
    submittedQuery,
    currentPage,
  } = navigationSnapshot.state
  const selectedContexts = workbenchContextsFromDraft(input.draft)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [baseModelMenuOpen, setBaseModelMenuOpen] = useState(false)
  const [baseModels, setBaseModels] = useState<BaseModelList | null>(null)
  const [baseModelStatus, setBaseModelStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [baseModelError, setBaseModelError] = useState<string | null>(null)
  const [requestVersion, setRequestVersion] = useState(0)
  const [page, setPage] = useState<CatalogPage | null>(null)
  const [selectedOptions, setSelectedOptions] = useState<ReadonlyMap<string, CatalogContext>>(new Map())
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [galleryItem, setGalleryItem] = useState<CatalogItem | null>(null)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [galleryLoadFailed, setGalleryLoadFailed] = useState(false)
  const galleryFocusRef = useRef<HTMLDivElement | null>(null)
  const galleryOpenerCardRef = useRef<HTMLDivElement | null>(null)
  const galleryOpenerKeyRef = useRef<string | null>(null)
  const restoreGalleryFocusRef = useRef(false)

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
      if (
        selectedBaseModelId !== null
        && !result.items.some(item => item.id === selectedBaseModelId)
      ) {
        setPage(null)
        setStatus('idle')
        dialogNavigation.update(navigation => (
          navigation.selectedBaseModelId === selectedBaseModelId
            ? { ...navigation, selectedBaseModelId: null, currentPage: 1 }
            : navigation
        ))
      }
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

  const selectedCatalogDefinition = catalogDefinition(selectedKind)
  const baseModelQueryReadiness = !selectedCatalogDefinition.baseModelScoped || selectedBaseModelId === null
    ? 'ready'
    : baseModelStatus !== 'ready'
      ? 'pending'
      : baseModels?.items.some(item => item.id === selectedBaseModelId)
        ? 'ready'
        : 'invalid'

  useEffect(() => {
    if (!dialogOpen) return
    if (baseModelQueryReadiness !== 'ready') {
      setStatus('idle')
      setCatalogError(null)
      setPage(null)
      return
    }
    const controller = new AbortController()
    let current = true
    setStatus('loading')
    setCatalogError(null)
    setPage(null)
    void catalog.search({
      kind: selectedKind,
      query: submittedQuery,
      page: currentPage,
      baseModelId: selectedCatalogDefinition.baseModelScoped ? selectedBaseModelId : null,
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
  }, [
    baseModelQueryReadiness,
    catalog,
    currentPage,
    dialogOpen,
    requestVersion,
    selectedBaseModelId,
    selectedKind,
    selectedCatalogDefinition,
    submittedQuery,
  ])

  const activeBaseModelLabel = selectedBaseModelId === null
    ? WORKBENCH_COPY.allBaseModels
    : baseModels?.items.find(item => item.id === selectedBaseModelId)?.label ?? WORKBENCH_COPY.allBaseModels
  const baseModelMenuItems = useMemo(() => [
    { id: 'all', label: WORKBENCH_COPY.allBaseModels },
    ...(baseModels?.items.map(item => ({ id: item.id, label: item.label })) ?? []),
  ], [baseModels])
  const totalPages = catalogPageCount(page?.totalCount ?? 0)
  const navigationPersistenceError = navigationSnapshot.persistenceErrorCode === null
    ? null
    : workbenchErrorText(navigationSnapshot.persistenceErrorCode)
  const galleryImageUrls = useMemo(() => (
    galleryItem?.coverUrl === null || galleryItem?.coverUrl === undefined
      ? []
      : [galleryItem.coverUrl, ...galleryItem.sampleImageUrls]
  ), [galleryItem])
  const galleryCurrentUrl = galleryImageUrls[galleryIndex] ?? null
  const moveGallery = useCallback((offset: -1 | 1) => {
    setGalleryIndex(current => Math.max(0, Math.min(galleryImageUrls.length - 1, current + offset)))
    setGalleryLoadFailed(false)
  }, [galleryImageUrls.length])

  useEffect(() => {
    if (!dialogOpen || galleryItem === null || typeof document === 'undefined') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      moveGallery(event.key === 'ArrowLeft' ? -1 : 1)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [dialogOpen, galleryItem, moveGallery])

  useEffect(() => {
    if (galleryItem !== null) {
      galleryFocusRef.current?.focus()
      return
    }
    if (!restoreGalleryFocusRef.current) return
    restoreGalleryFocusRef.current = false
    galleryOpenerCardRef.current
      ?.querySelector<HTMLButtonElement>('.harness-comfyui-card-preview')
      ?.focus()
  }, [galleryItem])

  if (!active) return null

  const closeDialog = () => {
    restoreGalleryFocusRef.current = false
    galleryOpenerCardRef.current = null
    galleryOpenerKeyRef.current = null
    setGalleryItem(null)
    setGalleryIndex(0)
    setGalleryLoadFailed(false)
    setDialogOpen(false)
    setBaseModelMenuOpen(false)
    setSelectedOptions(new Map())
  }

  const openDialog = () => {
    setBaseModels(null)
    setBaseModelStatus('idle')
    setBaseModelError(null)
    setPage(null)
    setStatus('idle')
    setCatalogError(null)
    restoreGalleryFocusRef.current = false
    galleryOpenerCardRef.current = null
    galleryOpenerKeyRef.current = null
    setGalleryItem(null)
    setGalleryIndex(0)
    setGalleryLoadFailed(false)
    setSelectedOptions(new Map(selectedContexts.map(option => [workbenchContextKey(option), option])))
    setDialogOpen(true)
  }

  const insertSelectedContexts = () => {
    setWorkbenchContexts(sessionInput, selectedOptions.values())
    closeDialog()
  }

  const selectKind = (kind: CatalogKind) => {
    dialogNavigation.update(current => ({
      ...current,
      selectedKind: kind,
      queryText: '',
      submittedQuery: '',
      currentPage: 1,
    }))
  }

  const search = () => {
    dialogNavigation.update(current => ({
      ...current,
      submittedQuery: current.queryText.trim(),
      currentPage: 1,
    }))
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

  const openGallery = (option: CatalogItem) => {
    if (option.coverUrl === null) return
    galleryOpenerKeyRef.current = workbenchContextKey(option.context)
    setGalleryIndex(0)
    setGalleryLoadFailed(false)
    setGalleryItem(option)
  }

  const closeGallery = () => {
    restoreGalleryFocusRef.current = true
    setGalleryItem(null)
    setGalleryIndex(0)
    setGalleryLoadFailed(false)
  }

  return (
    <section className="harness-comfyui-dock" aria-label={WORKBENCH_COPY.entry}>
      <div className="harness-comfyui-dock-row">
        <strong className="harness-comfyui-dock-title">{WORKBENCH_COPY.entry}</strong>
        <div className="harness-comfyui-dock-actions">
          <Button
            variant="toolbar"
            size="sm"
            onClick={() => resultsOpen ? workbench.closeResults() : workbench.openResults()}
          >
            {resultsOpen ? WORKBENCH_COPY.closeResults : WORKBENCH_COPY.openResults}
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
        onClose={galleryItem === null ? closeDialog : closeGallery}
        title={galleryItem === null ? WORKBENCH_COPY.dialogTitle : `${WORKBENCH_COPY.galleryTitle}：${galleryItem.label}`}
        closeLabel={galleryItem === null ? WORKBENCH_COPY.closeDialog : WORKBENCH_COPY.closeGallery}
        className={`harness-comfyui-catalog-modal${galleryItem === null ? '' : ' harness-comfyui-gallery-modal'}`}
        contentClassName={`harness-comfyui-catalog-modal-content${galleryItem === null ? '' : ' harness-comfyui-gallery-modal-content'}`}
        footer={galleryItem === null ? (
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
        ) : null}
      >
        {galleryItem === null ? (
          <>
            {navigationPersistenceError === null ? null : (
              <span className="harness-comfyui-catalog-state">{navigationPersistenceError}</span>
            )}
            <div className="harness-comfyui-base-model-row">
          <span>{WORKBENCH_COPY.baseModel}</span>
          <Menu
            open={baseModelMenuOpen}
            onClose={() => setBaseModelMenuOpen(false)}
            items={baseModelMenuItems}
            selectedId={selectedBaseModelId ?? 'all'}
            onSelect={id => {
              dialogNavigation.update(current => ({
                ...current,
                selectedBaseModelId: id === 'all' ? null : id,
                currentPage: 1,
              }))
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
                onChange={event => dialogNavigation.update(current => ({
                  ...current,
                  queryText: event.currentTarget.value,
                }))}
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
                const optionKey = workbenchContextKey(option.context)
                const selected = selectedOptions.has(optionKey)
                return (
                  <div
                    key={optionKey}
                    ref={galleryOpenerKeyRef.current === optionKey ? galleryOpenerCardRef : undefined}
                    className="harness-comfyui-catalog-card"
                    data-selected={selected ? 'true' : 'false'}
                  >
                    {option.coverUrl === null ? (
                      <span className="harness-comfyui-card-cover harness-comfyui-card-cover-placeholder">
                        <span className="harness-comfyui-card-placeholder">{WORKBENCH_COPY.noCover}</span>
                      </span>
                    ) : (
                      <Button
                        className="harness-comfyui-card-cover harness-comfyui-card-preview"
                        variant="toolbar"
                        aria-label={`${WORKBENCH_COPY.openGallery} ${option.label}`}
                        onClick={() => openGallery(option)}
                      >
                        <img src={option.coverUrl} alt={`${option.label} 封面`} loading="lazy" />
                      </Button>
                    )}
                    <Button
                      className="harness-comfyui-card-select"
                      variant="toolbar"
                      aria-pressed={selected}
                      aria-label={`${selected ? WORKBENCH_COPY.selectedItem : WORKBENCH_COPY.selectItem} ${option.label}`}
                      onClick={() => toggleOption(option)}
                    >
                      <span className="harness-comfyui-card-selection" aria-hidden="true">
                        {selected ? <IconCheckOutline16 /> : null}
                        {selected ? WORKBENCH_COPY.selectedItem : WORKBENCH_COPY.selectItem}
                      </span>
                      <span className="harness-comfyui-card-copy">
                        <strong>{option.label}</strong>
                        <small>{option.subtitle}</small>
                      </span>
                    </Button>
                  </div>
                )
              }) : null}
            </div>

            <div className="harness-comfyui-catalog-pagination">
              <Button
                variant="outline"
                size="sm"
                disabled={status !== 'ready' || currentPage <= 1}
                onClick={() => dialogNavigation.update(current => ({
                  ...current,
                  currentPage: current.currentPage - 1,
                }))}
              >
                {WORKBENCH_COPY.previousPage}
              </Button>
              <span>{currentPage} / {totalPages}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={status !== 'ready' || currentPage >= totalPages}
                onClick={() => dialogNavigation.update(current => ({
                  ...current,
                  currentPage: current.currentPage + 1,
                }))}
              >
                {WORKBENCH_COPY.nextPage}
              </Button>
            </div>
          </div>
            </div>
          </>
        ) : (
          <div className="harness-comfyui-gallery">
            <div className="harness-comfyui-gallery-stage">
              <Button
                className="harness-comfyui-gallery-arrow"
                variant="toolbar"
                aria-label={WORKBENCH_COPY.previousImage}
                disabled={galleryIndex === 0}
                onClick={() => moveGallery(-1)}
              >
                <IconChevronLeftOutline14 />
              </Button>
              <div
                ref={galleryFocusRef}
                className="harness-comfyui-gallery-current"
                tabIndex={-1}
                aria-label={`${WORKBENCH_COPY.currentImage} ${galleryIndex + 1} / ${galleryImageUrls.length}`}
              >
                {galleryLoadFailed || galleryCurrentUrl === null ? (
                  <span className="harness-comfyui-gallery-error" role="status">
                    {WORKBENCH_COPY.imageLoadFailed}
                  </span>
                ) : (
                  <img
                    key={galleryCurrentUrl}
                    src={galleryCurrentUrl}
                    alt={`${galleryItem.label} ${WORKBENCH_COPY.image} ${galleryIndex + 1}`}
                    onError={() => setGalleryLoadFailed(true)}
                  />
                )}
              </div>
              <Button
                className="harness-comfyui-gallery-arrow"
                variant="toolbar"
                aria-label={WORKBENCH_COPY.nextImage}
                disabled={galleryIndex >= galleryImageUrls.length - 1}
                onClick={() => moveGallery(1)}
              >
                <IconChevronRightOutline14 />
              </Button>
            </div>
            <span className="harness-comfyui-gallery-count" aria-live="polite">
              {galleryIndex + 1} / {galleryImageUrls.length}
            </span>
          </div>
        )}
      </Modal>
    </section>
  )
}

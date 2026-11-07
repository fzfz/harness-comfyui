import { CatalogDetailsPanel } from './catalog-details.tsx'
import { CATALOG_PRESENTATION } from '../../catalog/details-schema.ts'
import { catalogImageUrls, CatalogItems, CatalogKinds, useCatalogBrowser, type CatalogApi } from './catalog-browser.tsx'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import {
  Button,
  IconCheckOutlineRegular,
  IconChevronDownOutlineRegular,
  IconChevronLeftOutlineRegular,
  IconChevronRightOutlineRegular,
  IconSearchOutlineRegular,
  IconSparkleRegular,
  Input,
  Menu,
  Modal,
  Pill,
} from '@deepseek-ai/dsh-client-ui-primitives'

import {
  catalogDefinition,
  catalogPageCount,
  contextLabel,
  type CatalogContext,
  type CatalogItem,
  type CatalogKind,
} from '../../catalog/contract.ts'

import {
  WORKBENCH_COPY,
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
      icon={<IconSparkleRegular size={16} />}
      aria-label={WORKBENCH_COPY.entry}
      aria-pressed={active}
      title={WORKBENCH_COPY.entry}
      onClick={() => workbench.toggle()}
    >
      {wide ? WORKBENCH_COPY.entry : null}
    </Button>
  )
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

export function WorkbenchDock({ sessionId, ...props }: WorkbenchDockProps) {
  useEffect(() => props.workbench.syncCurrentSession(sessionId), [sessionId, props.workbench])
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
  const [selectedOptions, setSelectedOptions] = useState<ReadonlyMap<string, CatalogContext>>(new Map())
  const resetInvalidBaseModel = useCallback((id: string) => {
    dialogNavigation.update(navigation => navigation.selectedBaseModelId === id
      ? { ...navigation, selectedBaseModelId: null, currentPage: 1 }
      : navigation)
  }, [dialogNavigation])
  const { baseModels, baseModelStatus, baseModelError, page, status, error: catalogError, retry } = useCatalogBrowser({
    catalog,
    enabled: dialogOpen,
    query: { kind: selectedKind, query: submittedQuery, page: currentPage, baseModelId: selectedBaseModelId },
    onInvalidBaseModel: resetInvalidBaseModel,
  })
  const [detailsItem, setDetailsItem] = useState<CatalogItem | null>(null)
  const detailOpenerRef = useRef<HTMLButtonElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const listScroll = useRef(0)
  const galleryScroll = useRef(0)
  const restoreDetailFocus = useRef(false)
  const detailPanelRef = useRef<HTMLDivElement | null>(null)
  const [galleryItem, setGalleryItem] = useState<CatalogItem | null>(null)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [galleryLoadFailed, setGalleryLoadFailed] = useState(false)
  const galleryFocusRef = useRef<HTMLDivElement | null>(null)
  const galleryOpenerCardRef = useRef<HTMLDivElement | null>(null)
  const galleryOpenerKeyRef = useRef<string | null>(null)
  const restoreGalleryFocusRef = useRef(false)

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
  const galleryImageUrls = useMemo(() => catalogImageUrls(galleryItem), [galleryItem])
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
    const content = detailsItem !== null ? detailPanelRef.current?.querySelector('.harness-comfyui-catalog-detail') : listRef.current?.closest('.harness-comfyui-catalog-modal-content')
    if (content) content.scrollTop = galleryScroll.current
    if (detailsItem !== null) {
      detailPanelRef.current?.querySelector<HTMLButtonElement>('.harness-comfyui-detail-preview')?.focus({ preventScroll: true })
      return
    }
    galleryOpenerCardRef.current
      ?.querySelector<HTMLButtonElement>('.harness-comfyui-card-preview')
      ?.focus({ preventScroll: true })
  }, [galleryItem, detailsItem])

  useEffect(() => {
    if (detailsItem !== null || !restoreDetailFocus.current) return
    restoreDetailFocus.current = false
    const content = listRef.current?.closest('.harness-comfyui-catalog-modal-content')
    if (content) content.scrollTop = listScroll.current
    detailOpenerRef.current?.focus({ preventScroll: true })
  }, [detailsItem])

  if (!active) return null

  const closeDialog = () => {
    restoreGalleryFocusRef.current = false
    galleryOpenerCardRef.current = null
    galleryOpenerKeyRef.current = null
    setGalleryItem(null)
    setGalleryIndex(0)
    setGalleryLoadFailed(false)
    setDetailsItem(null)
    setDialogOpen(false)
    setBaseModelMenuOpen(false)
    setSelectedOptions(new Map())
  }

  const closeDetails = () => {
    restoreDetailFocus.current = true
    setDetailsItem(null)
  }

  const openDialog = () => {
    setDetailsItem(null)
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
    retry()
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
    if (catalogImageUrls(option).length === 0) return
    galleryScroll.current = (detailsItem !== null ? detailPanelRef.current?.querySelector('.harness-comfyui-catalog-detail') : listRef.current?.closest('.harness-comfyui-catalog-modal-content'))?.scrollTop ?? 0
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
        onClose={galleryItem !== null ? closeGallery : detailsItem !== null ? closeDetails : closeDialog}
        title={galleryItem === null ? (detailsItem === null ? WORKBENCH_COPY.dialogTitle : `${CATALOG_PRESENTATION.copy.details}：${detailsItem.label}`) : `${WORKBENCH_COPY.galleryTitle}：${galleryItem.label}`}
        closeLabel={galleryItem !== null && detailsItem !== null ? CATALOG_PRESENTATION.copy.returnToDetails : detailsItem !== null ? CATALOG_PRESENTATION.copy.returnToList : galleryItem === null ? WORKBENCH_COPY.closeDialog : WORKBENCH_COPY.closeGallery}
        className={`harness-comfyui-catalog-modal${galleryItem === null ? '' : ' harness-comfyui-gallery-modal'}`}
        contentClassName={`harness-comfyui-catalog-modal-content${galleryItem !== null ? ' harness-comfyui-gallery-modal-content' : detailsItem !== null ? ' harness-comfyui-detail-modal-content' : ''}`}
        footer={galleryItem === null && detailsItem === null ? (
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
        ) : detailsItem !== null && galleryItem === null ? <Button variant="ghost" onClick={closeDetails}>{CATALOG_PRESENTATION.copy.returnToList}</Button> : null}
      >
          <div ref={listRef} hidden={galleryItem !== null || detailsItem !== null}>
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
                <IconChevronDownOutlineRegular size={14} />
              </Button>
            )}
          />
          {baseModelStatus === 'error' ? <span>{baseModelError}</span> : null}
            </div>

            <div className="harness-comfyui-catalog">
          <nav className="harness-comfyui-catalog-kinds" aria-label="资源类型">
            <CatalogKinds selected={selectedKind}>{(definition, selected) => (
              <Button
                key={definition.kind}
                variant={selected ? 'primary' : 'toolbar'}
                size="sm"
                icon={selected ? <IconCheckOutlineRegular size={16} /> : undefined}
                aria-pressed={selected}
                onClick={() => selectKind(definition.kind)}
              >
                {definition.label}
              </Button>
            )}</CatalogKinds>
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
                icon={<IconSearchOutlineRegular size={16} />}
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
              {status === 'ready' ? <CatalogItems items={page?.items ?? []} selection={selectedOptions.values()}>{(option, selected, optionKey) => {
                const previewUrl = catalogImageUrls(option)[0]
                return (
                  <div
                    key={optionKey}
                    ref={galleryOpenerKeyRef.current === optionKey ? galleryOpenerCardRef : undefined}
                    className="harness-comfyui-catalog-card"
                    data-selected={selected ? 'true' : 'false'}
                  >
                    {previewUrl === undefined ? (
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
                        <img src={previewUrl} alt={`${option.label} 封面`} loading="lazy" />
                      </Button>
                    )}
                    <span className="harness-comfyui-card-copy">
                      <strong title={option.label}>{option.label}</strong>
                      <small>{option.subtitle}</small>
                    </span>
                    <div className="harness-comfyui-card-actions">
                      <Button className="harness-comfyui-card-select" variant={selected ? 'primary' : 'toolbar'} size="sm"
                        aria-pressed={selected} aria-label={`${selected ? WORKBENCH_COPY.selectedItem : WORKBENCH_COPY.selectItem} ${option.label}`}
                        onClick={() => toggleOption(option)}>
                        {selected ? WORKBENCH_COPY.selectedItem : WORKBENCH_COPY.selectItem}
                      </Button>
                      <Button variant="toolbar" size="sm" aria-label={`${CATALOG_PRESENTATION.copy.details} ${option.label}`}
                        onClick={event => {
                          listScroll.current = listRef.current?.closest('.harness-comfyui-catalog-modal-content')?.scrollTop ?? 0
                          detailOpenerRef.current = event.currentTarget
                          setDetailsItem(option)
                        }}>
                        {CATALOG_PRESENTATION.copy.details}
                      </Button>
                    </div>
                  </div>
                )}}</CatalogItems> : null}
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
          </div>
        {detailsItem !== null && <div ref={detailPanelRef} hidden={galleryItem !== null} className="harness-comfyui-detail-container">
          <CatalogDetailsPanel request={{ kind: detailsItem.context.kind, id: detailsItem.context.id }} load={catalog.details}
            preview={catalogImageUrls(detailsItem).length === 0 ? null : () => openGallery(detailsItem)} />
        </div>}
        {galleryItem !== null && (
          <div className="harness-comfyui-gallery">
            <div className="harness-comfyui-gallery-stage">
              <Button
                className="harness-comfyui-gallery-arrow"
                variant="toolbar"
                aria-label={WORKBENCH_COPY.previousImage}
                disabled={galleryIndex === 0}
                onClick={() => moveGallery(-1)}
              >
                <IconChevronLeftOutlineRegular size={14} />
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
                <IconChevronRightOutlineRegular size={14} />
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

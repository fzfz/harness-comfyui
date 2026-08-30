import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import {
  generationMediaContentUrl,
  generationMediaViewerUrl,
  generationMediaWorkflowUrl,
  type GenerationMediaProjection,
  type GenerationRunProjection,
  type GenerationRunProjectionStatus,
} from '../../generation/contract.ts'

import {
  Button,
  IconChevronDownOutline14,
  IconChevronLeftOutline14,
  IconChevronRightOutline14,
  IconCloseOutline16,
  IconDownloadOutline16,
  Menu,
  Modal,
  Pill,
} from '@deepseek-ai/dsh-client-ui-primitives'

import type { WorkbenchController } from './controller.ts'
import type { GenerationProjectionStore, GenerationStoreSnapshot } from './generation-store.ts'
import {
  MEDIA_PAGE_SIZE,
  GENERATION_ERROR_COPY,
  RESULTS_COPY,
  generationErrorCopy,
  type ResultTab,
} from './results-contract.ts'

type FilterKey = 'turn' | 'kind'

interface SessionListView {
  readonly current?: string
  readonly byId: Readonly<Record<string, { readonly blank: boolean } | undefined>>
}

type UseSessionSnapshot = <Selected>(selector: (snapshot: unknown) => Selected) => Selected

export interface WorkbenchDetailsProps {
  readonly sessionId: string
  readonly useSession: UseSessionSnapshot
  readonly workbench: WorkbenchController
  readonly generationStore: GenerationProjectionStore
}

export interface WorkbenchResultsOverlayProps {
  readonly workbench: WorkbenchController
  readonly useSessions: <Selected>(selector: (state: SessionListView) => Selected) => Selected
}

interface FilterMenuProps {
  readonly id: FilterKey
  readonly label: string
  readonly value: string
  readonly options: readonly { readonly id: string; readonly label: string }[]
  readonly open: boolean
  readonly onOpen: (id: FilterKey) => void
  readonly onClose: () => void
  readonly onSelect: (value: string) => void
}

function FilterMenu(props: FilterMenuProps) {
  const selected = props.options.find(option => option.id === props.value) ?? props.options[0]!
  return (
    <div className="harness-comfyui-result-filter">
      <span>{props.label}</span>
      <Menu
        open={props.open}
        onClose={props.onClose}
        items={props.options}
        selectedId={props.value}
        onSelect={props.onSelect}
        portal
        anchor={(
          <Button
            variant="outline"
            size="sm"
            aria-haspopup="menu"
            aria-expanded={props.open}
            onClick={() => props.onOpen(props.id)}
          >
            <span>{selected.label}</span>
            <IconChevronDownOutline14 />
          </Button>
        )}
      />
    </div>
  )
}

const RUN_STATUS_LABELS: Readonly<Record<GenerationRunProjectionStatus, string>> = Object.freeze({
  created: '已创建',
  prepared: '已准备',
  submitting: '提交中',
  submission_unknown: '提交状态未知',
  remote_pending: '排队中',
  remote_running: '生成中',
  downloading: '保存中',
  succeeded: '已完成',
  failed: '失败',
  cancelling: '取消中',
  cancelled: '已取消',
})

function runTone(status: GenerationRunProjectionStatus): string {
  if (status === 'succeeded') return 'success'
  if (status === 'failed' || status === 'submission_unknown') return 'danger'
  if (status === 'cancelled') return 'muted'
  return 'running'
}

function ProjectionRunList({ runs }: { readonly runs: readonly GenerationRunProjection[] }) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [errorRunId, setErrorRunId] = useState<string | null>(null)
  const errorRun = runs.find(run => run.runId === errorRunId) ?? null
  if (runs.length === 0) return <div className="harness-comfyui-results-empty">暂无运行</div>
  return (
    <>
      <div className="harness-comfyui-run-list" aria-label="ComfyUI 运行">
        {runs.map(run => (
          <article
            key={run.runId}
            className="harness-comfyui-run-card-shell"
            data-selected={selectedRunId === run.runId}
          >
            <Button
              className="harness-comfyui-run-card"
              variant="toolbar"
              aria-pressed={selectedRunId === run.runId}
              onClick={() => setSelectedRunId(run.runId)}
            >
              <span className="harness-comfyui-run-card-heading">
                <span><strong>{run.title}</strong><code>{run.runId}</code></span>
                <Pill className={`harness-comfyui-run-status is-${runTone(run.status)}`} active={selectedRunId === run.runId}>
                  {RUN_STATUS_LABELS[run.status]}
                </Pill>
              </span>
              <span className="harness-comfyui-run-meta">
                <span><small>实例</small><strong>{run.instanceTitle ?? '—'}</strong></span>
                <span><small>工作流</small><strong>{run.templateTitle ?? '—'}</strong></span>
              </span>
            </Button>
            {run.errorCode === null ? null : (
              <div className="harness-comfyui-run-error-summary">
                <code>{run.errorCode}</code>
                <Button variant="outline" size="sm" onClick={() => setErrorRunId(run.runId)}>
                  {RESULTS_COPY.errorDetails}
                </Button>
              </div>
            )}
          </article>
        ))}
      </div>
      <Modal
        open={errorRun !== null}
        onClose={() => setErrorRunId(null)}
        title={RESULTS_COPY.errorDetails}
        closeLabel={RESULTS_COPY.closeErrorDetails}
        className="harness-comfyui-run-error-modal"
        footer={(
          <Button variant="primary" onClick={() => setErrorRunId(null)}>
            关闭
          </Button>
        )}
      >
        {errorRun === null ? null : (
          <div className="harness-comfyui-run-error-content">
            <div className="harness-comfyui-run-error-identifiers">
              <span><small>{RESULTS_COPY.runId}</small><code>{errorRun.runId}</code></span>
              <span><small>{RESULTS_COPY.errorCode}</small><code>{errorRun.errorCode}</code></span>
            </div>
            <pre>{errorRun.errorMessage ?? generationErrorCopy(errorRun.errorCode ?? '')}</pre>
          </div>
        )}
      </Modal>
    </>
  )
}

function MediaPreview({
  item,
  sessionId,
  errorCode,
  onError,
  onOpen,
}: {
  readonly item: GenerationMediaProjection
  readonly sessionId: string
  readonly errorCode: string | null
  readonly onError: (source: string) => void
  readonly onOpen: () => void
}) {
  const source = generationMediaContentUrl(item.mediaId, sessionId)
  if (errorCode !== null) return <div className="harness-comfyui-media-preview-error"><code>{errorCode}</code></div>
  return (
    <button
      type="button"
      className="harness-comfyui-media-viewer-button"
      aria-label={`${RESULTS_COPY.openMediaViewer}：${item.filename}`}
      onClick={onOpen}
    >
      {item.mediaKind === 'video'
        ? <video src={source} preload="metadata" aria-label={`${item.filename} 视频`} onError={() => onError(source)} />
        : <img src={source} alt={`${item.filename} 图片`} onError={() => onError(source)} />}
    </button>
  )
}

async function responseErrorCode(response: Response): Promise<string> {
  try {
    const body = await response.json() as { code?: unknown }
    if (typeof body.code === 'string' && GENERATION_ERROR_COPY[body.code] !== undefined) return body.code
  } catch {
    // The route response is not a Harness ComfyUI error envelope.
  }
  return 'GENERATION_MEDIA_REQUEST_FAILED'
}

async function inspectMediaError(source: string): Promise<string> {
  try {
    const response = await fetch(source)
    return response.ok ? 'GENERATION_MEDIA_REQUEST_FAILED' : responseErrorCode(response)
  } catch {
    return 'GENERATION_MEDIA_REQUEST_FAILED'
  }
}

async function downloadMediaWorkflow(item: GenerationMediaProjection, sessionId: string): Promise<string | null> {
  let response: Response
  try {
    response = await fetch(generationMediaWorkflowUrl(item.mediaId, sessionId))
  } catch {
    return 'GENERATION_MEDIA_REQUEST_FAILED'
  }
  if (!response.ok) return responseErrorCode(response)
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = `comfyui-run-${item.runId}-workflow.json`
  document.body.append(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    URL.revokeObjectURL(objectUrl)
  }
  return null
}

function ProjectionMediaGallery({ media, sessionId }: { readonly media: readonly GenerationMediaProjection[]; readonly sessionId: string }) {
  const [turn, setTurn] = useState('all')
  const [kind, setKind] = useState('all')
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null)
  const [page, setPage] = useState(1)
  const [viewerMediaId, setViewerMediaId] = useState<string | null>(null)
  const [mediaErrors, setMediaErrors] = useState<Readonly<Record<string, string>>>({})
  const filtered = useMemo(() => media.filter(item => (turn === 'all' || String(item.turn) === turn)
    && (kind === 'all' || item.mediaKind === kind)), [kind, media, turn])
  const pageCount = Math.max(1, Math.ceil(filtered.length / MEDIA_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageItems = filtered.slice((currentPage - 1) * MEDIA_PAGE_SIZE, currentPage * MEDIA_PAGE_SIZE)
  const viewerMedia = media.find(item => item.mediaId === viewerMediaId) ?? null
  const viewerTitle = viewerMedia === null
    ? RESULTS_COPY.mediaViewer
    : `${RESULTS_COPY.mediaViewer}：${viewerMedia.filename}`
  const turnOptions = useMemo(() => [
    { id: 'all', label: RESULTS_COPY.allTurns },
    ...[...new Set(media.map(item => item.turn))].sort((left, right) => right - left)
      .map(value => ({ id: String(value), label: `第 ${value} 轮` })),
  ], [media])
  const update = (key: FilterKey, value: string) => {
    if (key === 'turn') setTurn(value)
    else setKind(value)
    setPage(1)
    setOpenFilter(null)
  }

  return (
    <div className="harness-comfyui-session-results">
      <div className="harness-comfyui-media-count">{filtered.length} {RESULTS_COPY.mediaCount}</div>
      <div className="harness-comfyui-result-filters">
        <FilterMenu
          id="turn" label={RESULTS_COPY.turnFilter} value={turn} options={turnOptions}
          open={openFilter === 'turn'} onOpen={setOpenFilter} onClose={() => setOpenFilter(null)}
          onSelect={value => update('turn', value)}
        />
        <FilterMenu
          id="kind" label={RESULTS_COPY.kindFilter} value={kind}
          options={[
            { id: 'all', label: RESULTS_COPY.allKinds },
            { id: 'image', label: RESULTS_COPY.image },
            { id: 'video', label: RESULTS_COPY.video },
          ]}
          open={openFilter === 'kind'} onOpen={setOpenFilter} onClose={() => setOpenFilter(null)}
          onSelect={value => update('kind', value)}
        />
      </div>
      {pageItems.length === 0 ? <div className="harness-comfyui-results-empty">{RESULTS_COPY.noMedia}</div> : (
        <div className="harness-comfyui-media-grid" aria-label="本会话媒体">
          {pageItems.map(item => (
            <article key={item.mediaId} className="harness-comfyui-media-card">
              <div className="harness-comfyui-media-preview">
                <MediaPreview
                  item={item}
                  sessionId={sessionId}
                  errorCode={mediaErrors[item.mediaId] ?? null}
                  onOpen={() => setViewerMediaId(item.mediaId)}
                  onError={source => {
                    void inspectMediaError(source).then(errorCode => {
                      setMediaErrors(current => ({ ...current, [item.mediaId]: errorCode }))
                    })
                  }}
                />
                <Pill active>{item.mediaKind === 'image' ? RESULTS_COPY.image : RESULTS_COPY.video}</Pill>
              </div>
              <div className="harness-comfyui-media-body">
                <strong>{item.filename}</strong>
                <small>第 {item.turn} 轮</small>
                <small>{new Date(item.createdAt).toLocaleString('zh-CN')} · {RESULTS_COPY.outputIndex} {item.outputIndex}</small>
                <div className="harness-comfyui-media-workflow-row">
                  <code>{item.runId}</code>
                  <Button
                    variant="toolbar" size="sm" icon={<IconDownloadOutline16 />}
                    aria-label={`下载 ${item.filename} 所属 Workflow`}
                    title={RESULTS_COPY.downloadWorkflow}
                    onClick={async () => {
                      const errorCode = await downloadMediaWorkflow(item, sessionId)
                      if (errorCode !== null) setMediaErrors(current => ({ ...current, [item.mediaId]: errorCode }))
                    }}
                  />
                </div>
                {mediaErrors[item.mediaId] === undefined ? null : (
                  <small className="harness-comfyui-media-error">
                    <code>{mediaErrors[item.mediaId]}</code> {generationErrorCopy(mediaErrors[item.mediaId])}
                  </small>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <Modal
        open={viewerMedia !== null}
        onClose={() => setViewerMediaId(null)}
        title={viewerTitle}
        closeLabel={RESULTS_COPY.closeMediaViewer}
        className="harness-comfyui-media-viewer-modal"
        contentClassName="harness-comfyui-media-viewer-modal-content"
        footer={(
          <Button variant="primary" onClick={() => setViewerMediaId(null)}>
            {RESULTS_COPY.closeMediaViewer}
          </Button>
        )}
      >
        {viewerMedia === null ? null : (
          <iframe
            className="harness-comfyui-media-viewer-frame"
            src={generationMediaViewerUrl(viewerMedia.mediaId, sessionId)}
            title={viewerTitle}
            allow="clipboard-write"
          />
        )}
      </Modal>
      <nav className="harness-comfyui-media-pagination" aria-label="本会话媒体分页">
        <Button
          variant="outline" size="sm" icon={<IconChevronLeftOutline14 />}
          aria-label={RESULTS_COPY.previousPage} disabled={currentPage <= 1}
          onClick={() => setPage(value => Math.max(1, value - 1))}
        />
        <span>第 {currentPage} / {pageCount} 页</span>
        <Button
          variant="outline" size="sm" icon={<IconChevronRightOutline14 />}
          aria-label={RESULTS_COPY.nextPage} disabled={currentPage >= pageCount}
          onClick={() => setPage(value => Math.min(pageCount, value + 1))}
        />
      </nav>
    </div>
  )
}

interface WorkbenchResultsProps {
  readonly sessionId: string
  readonly surface: 'details' | 'overlay'
  readonly workbench: WorkbenchController
  readonly snapshot: GenerationStoreSnapshot
}

function WorkbenchResults({ sessionId, surface, workbench, snapshot }: WorkbenchResultsProps) {
  const [activeTab, setActiveTab] = useState<ResultTab>('current')
  const { runs, media } = snapshot.projection
  return (
    <aside
      className={`harness-comfyui-results-drawer${surface === 'overlay' ? ' harness-comfyui-results-overlay' : ''}`}
      data-plugin={`harness-comfyui-${surface}`}
      data-session-id={sessionId}
    >
      <header className="harness-comfyui-results-header">
        <div>
          <strong>{RESULTS_COPY.title}</strong>
          <small>{runs.length} 个运行 · {media.length} 个媒体</small>
        </div>
        <div className="harness-comfyui-results-header-actions">
          <Button
            variant="toolbar" size="sm" icon={<IconCloseOutline16 />}
            aria-label={RESULTS_COPY.close} onClick={() => workbench.closeResults()}
          />
        </div>
      </header>

      <div className="harness-comfyui-results-tabs" role="tablist" aria-label={RESULTS_COPY.title}>
        <Button
          variant="toolbar" size="sm" role="tab" aria-selected={activeTab === 'current'}
          onClick={() => setActiveTab('current')}
        >
          {RESULTS_COPY.currentTab}
        </Button>
        <Button
          variant="toolbar" size="sm" role="tab" aria-selected={activeTab === 'session'}
          onClick={() => setActiveTab('session')}
        >
          {RESULTS_COPY.sessionTab}
        </Button>
      </div>

      <div className="harness-comfyui-results-scroll">
        {snapshot.errorCode === null ? null : (
          <div className="harness-comfyui-results-empty"><code>{snapshot.errorCode}</code> {generationErrorCopy(snapshot.errorCode)}</div>
        )}
        <section role="tabpanel" hidden={activeTab !== 'current'}>
          <ProjectionRunList runs={runs} />
        </section>
        <section role="tabpanel" hidden={activeTab !== 'session'}>
          <ProjectionMediaGallery media={media} sessionId={sessionId} />
        </section>
      </div>
    </aside>
  )
}

export function WorkbenchDetails({ sessionId, useSession, workbench, generationStore }: WorkbenchDetailsProps) {
  const wakeRevision = useSession(snapshot => snapshot)
  useEffect(() => generationStore.refreshSession(sessionId), [generationStore, sessionId, wakeRevision])
  const subscribe = useCallback((listener: () => void) => generationStore.subscribe(sessionId, listener), [generationStore, sessionId])
  const getSnapshot = useCallback(() => generationStore.getSnapshot(sessionId), [generationStore, sessionId])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return <WorkbenchResults sessionId={sessionId} surface="details" workbench={workbench} snapshot={snapshot} />
}

export function WorkbenchResultsOverlay({ useSessions, workbench }: WorkbenchResultsOverlayProps) {
  const resultsOpen = useSyncExternalStore(
    workbench.subscribeResults,
    workbench.getResultsSnapshot,
    workbench.getResultsSnapshot,
  )
  const blankSessionId = useSessions(state => {
    const current = state.current
    if (current === undefined || state.byId[current]?.blank === false) return undefined
    return current
  })
  const snapshot = useMemo<GenerationStoreSnapshot>(() => Object.freeze({
    projection: Object.freeze({
      sessionId: blankSessionId ?? '',
      runs: Object.freeze([]),
      media: Object.freeze([]),
      hasActiveRuns: false,
      refreshAfterMs: 0,
    }),
    errorCode: null,
  }), [blankSessionId])

  if (!resultsOpen || blankSessionId === undefined) return null
  return (
    <WorkbenchResults
      sessionId={blankSessionId}
      surface="overlay"
      workbench={workbench}
      snapshot={snapshot}
    />
  )
}

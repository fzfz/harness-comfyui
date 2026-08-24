import { useMemo, useState, useSyncExternalStore } from 'react'

import type { SessionListState } from '@deepseek-ai/dsh-client-runtime/client'

import {
  Button,
  IconChevronDownOutline14,
  IconChevronLeftOutline14,
  IconChevronRightOutline14,
  IconCloseOutline16,
  IconDownloadOutline16,
  Menu,
  Pill,
} from '@deepseek-ai/dsh-client-ui-primitives'

import type { WorkbenchController } from './controller.ts'
import {
  filterStaticMedia,
  getMediaWorkflowDownloadLabel,
  STATIC_MEDIA,
  STATIC_MEDIA_PAGE_SIZE,
  STATIC_RESULTS_COPY,
  STATIC_RUNS,
  type StaticMediaFilters,
  type StaticMediaItem,
  type StaticResultTab,
} from './static-results.ts'
import { downloadStaticWorkflow } from './static-workflow.ts'

type FilterKey = keyof StaticMediaFilters

export interface WorkbenchDetailsProps {
  readonly sessionId: string
  readonly workbench: WorkbenchController
}

export interface WorkbenchResultsOverlayProps {
  readonly workbench: WorkbenchController
  readonly useSessions: <Selected>(selector: (state: SessionListState) => Selected) => Selected
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

function StaticRunList() {
  const [selectedRunId, setSelectedRunId] = useState(STATIC_RUNS[0]!.id)
  return (
    <div className="harness-comfyui-run-list" aria-label="当前轮次运行">
      {STATIC_RUNS.map(run => (
        <Button
          key={run.id}
          className="harness-comfyui-run-card"
          variant="toolbar"
          aria-pressed={selectedRunId === run.id}
          onClick={() => setSelectedRunId(run.id)}
        >
          <span className="harness-comfyui-run-card-heading">
            <span>
              <strong>{run.title}</strong>
              <code>{run.id}</code>
            </span>
            <Pill className={`harness-comfyui-run-status is-${run.tone}`} active={selectedRunId === run.id}>
              {run.status}
            </Pill>
          </span>
          <span className="harness-comfyui-run-meta">
            <span><small>实例</small><strong>{run.instance}</strong></span>
            <span><small>工作流</small><strong>{run.workflow}</strong></span>
          </span>
          <span className="harness-comfyui-run-progress-copy">
            <strong>{run.progressLabel}</strong>
            <small>{run.progress}%</small>
          </span>
          <progress value={run.progress} max={100} aria-label={`${run.title} ${run.progressLabel}`} />
          <small className="harness-comfyui-run-detail">{run.detail}</small>
        </Button>
      ))}
    </div>
  )
}

function MediaPreview({ item }: { readonly item: StaticMediaItem }) {
  if (item.kind === 'audio') {
    return (
      <span className="harness-comfyui-audio-preview" role="img" aria-label={`${item.title} 音频波形`}>
        {[18, 34, 24, 48, 29, 42, 21, 38, 27, 45, 20, 32].map((height, index) => (
          <i key={index} style={{ height }} />
        ))}
      </span>
    )
  }
  return <img src={item.previewUrl ?? ''} alt={`${item.title}${item.kind === 'video' ? '视频封面' : '图片预览'}`} />
}

function StaticMediaGallery() {
  const [filters, setFilters] = useState<StaticMediaFilters>({ turn: 'all', kind: 'all', time: 'all' })
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null)
  const [page, setPage] = useState(1)
  const filtered = useMemo(() => filterStaticMedia(STATIC_MEDIA, filters), [filters])
  const pageCount = Math.max(1, Math.ceil(filtered.length / STATIC_MEDIA_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageItems = filtered.slice(
    (currentPage - 1) * STATIC_MEDIA_PAGE_SIZE,
    currentPage * STATIC_MEDIA_PAGE_SIZE,
  )
  const updateFilter = (key: FilterKey, value: string) => {
    setFilters(current => ({ ...current, [key]: value }))
    setPage(1)
    setOpenFilter(null)
  }
  const turnOptions = useMemo(() => [
    { id: 'all', label: STATIC_RESULTS_COPY.allTurns },
    ...Array.from(new Map(STATIC_MEDIA.map(item => [item.turnId, item.turnLabel])))
      .map(([id, label]) => ({ id, label })),
  ], [])

  return (
    <div className="harness-comfyui-session-results">
      <div className="harness-comfyui-media-count">
        {filtered.length} {STATIC_RESULTS_COPY.mediaCount}
      </div>
      <div className="harness-comfyui-result-filters">
        <FilterMenu
          id="turn" label={STATIC_RESULTS_COPY.turnFilter} value={filters.turn} options={turnOptions}
          open={openFilter === 'turn'} onOpen={setOpenFilter} onClose={() => setOpenFilter(null)}
          onSelect={value => updateFilter('turn', value)}
        />
        <FilterMenu
          id="kind" label={STATIC_RESULTS_COPY.kindFilter} value={filters.kind}
          options={[
            { id: 'all', label: STATIC_RESULTS_COPY.allKinds },
            { id: 'image', label: STATIC_RESULTS_COPY.image },
            { id: 'video', label: STATIC_RESULTS_COPY.video },
            { id: 'audio', label: STATIC_RESULTS_COPY.audio },
          ]}
          open={openFilter === 'kind'} onOpen={setOpenFilter} onClose={() => setOpenFilter(null)}
          onSelect={value => updateFilter('kind', value)}
        />
        <FilterMenu
          id="time" label={STATIC_RESULTS_COPY.timeFilter} value={filters.time}
          options={[
            { id: 'all', label: STATIC_RESULTS_COPY.allTimes },
            { id: 'today', label: STATIC_RESULTS_COPY.today },
            { id: 'yesterday', label: STATIC_RESULTS_COPY.yesterday },
            { id: 'older', label: STATIC_RESULTS_COPY.older },
          ]}
          open={openFilter === 'time'} onOpen={setOpenFilter} onClose={() => setOpenFilter(null)}
          onSelect={value => updateFilter('time', value)}
        />
      </div>

      {pageItems.length === 0 ? (
        <div className="harness-comfyui-results-empty">{STATIC_RESULTS_COPY.noMedia}</div>
      ) : (
        <div className="harness-comfyui-media-grid" aria-label="本会话媒体">
          {pageItems.map(item => (
            <article key={item.id} className="harness-comfyui-media-card">
              <div className="harness-comfyui-media-preview">
                <MediaPreview item={item} />
                <Pill active>{item.kindLabel}</Pill>
              </div>
              <div className="harness-comfyui-media-body">
                <strong>{item.title}</strong>
                <small>{item.turnLabel}</small>
                <small>{item.savedAt} · output {item.outputIndex}</small>
                <div className="harness-comfyui-media-workflow-row">
                  <code>{item.runId}</code>
                  <Button
                    variant="toolbar"
                    size="sm"
                    icon={<IconDownloadOutline16 />}
                    aria-label={getMediaWorkflowDownloadLabel(item)}
                    title={STATIC_RESULTS_COPY.downloadWorkflow}
                    onClick={() => downloadStaticWorkflow(item.runId)}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <nav className="harness-comfyui-media-pagination" aria-label="本会话媒体分页">
        <Button
          variant="outline" size="sm" icon={<IconChevronLeftOutline14 />}
          aria-label={STATIC_RESULTS_COPY.previousPage} disabled={currentPage <= 1}
          onClick={() => setPage(value => Math.max(1, value - 1))}
        />
        <span>第 {currentPage} / {pageCount} 页</span>
        <Button
          variant="outline" size="sm" icon={<IconChevronRightOutline14 />}
          aria-label={STATIC_RESULTS_COPY.nextPage} disabled={currentPage >= pageCount}
          onClick={() => setPage(value => Math.min(pageCount, value + 1))}
        />
      </nav>
    </div>
  )
}

interface WorkbenchResultsProps {
  readonly sessionId?: string
  readonly surface: 'details' | 'overlay'
  readonly workbench: WorkbenchController
}

function WorkbenchResults({ sessionId, surface, workbench }: WorkbenchResultsProps) {
  const [activeTab, setActiveTab] = useState<StaticResultTab>('current')
  return (
    <aside
      className={`harness-comfyui-results-drawer${surface === 'overlay' ? ' harness-comfyui-results-overlay' : ''}`}
      data-plugin={`harness-comfyui-${surface}`}
      data-session-id={sessionId}
    >
      <header className="harness-comfyui-results-header">
        <div>
          <strong>{STATIC_RESULTS_COPY.title}</strong>
          <small>{STATIC_RESULTS_COPY.total}</small>
        </div>
        <div className="harness-comfyui-results-header-actions">
          <Button
            variant="toolbar" size="sm" icon={<IconCloseOutline16 />}
            aria-label={STATIC_RESULTS_COPY.close} onClick={() => workbench.closeResults()}
          />
        </div>
      </header>

      <div className="harness-comfyui-results-tabs" role="tablist" aria-label={STATIC_RESULTS_COPY.title}>
        <Button
          variant="toolbar" size="sm" role="tab" aria-selected={activeTab === 'current'}
          onClick={() => setActiveTab('current')}
        >
          {STATIC_RESULTS_COPY.currentTab}
        </Button>
        <Button
          variant="toolbar" size="sm" role="tab" aria-selected={activeTab === 'session'}
          onClick={() => setActiveTab('session')}
        >
          {STATIC_RESULTS_COPY.sessionTab}
        </Button>
      </div>

      <div className="harness-comfyui-results-scroll">
        <section role="tabpanel" hidden={activeTab !== 'current'}>
          <div className="harness-comfyui-turn-binding">
            <span>
              <small>{STATIC_RESULTS_COPY.currentFrom}</small>
              <strong>{STATIC_RESULTS_COPY.currentTurn}</strong>
            </span>
            <code>{STATIC_RESULTS_COPY.currentTurnId}</code>
          </div>
          <StaticRunList />
        </section>
        <section role="tabpanel" hidden={activeTab !== 'session'}>
          <StaticMediaGallery />
        </section>
      </div>
    </aside>
  )
}

export function WorkbenchDetails({ sessionId, workbench }: WorkbenchDetailsProps) {
  return <WorkbenchResults sessionId={sessionId} surface="details" workbench={workbench} />
}

export function WorkbenchResultsOverlay({ useSessions, workbench }: WorkbenchResultsOverlayProps) {
  const resultsOpen = useSyncExternalStore(
    workbench.subscribeResults,
    workbench.getResultsSnapshot,
    workbench.getResultsSnapshot,
  )
  const blankSession = useSessions(state => {
    const current = state.current
    return current === undefined || state.byId[current]?.blank !== false
  })

  if (!resultsOpen || !blankSession) return null
  return <WorkbenchResults surface="overlay" workbench={workbench} />
}

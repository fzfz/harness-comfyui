import { useState, type ReactNode } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'

export type ResultsTab = 'current' | 'session'

export type ResultsPanelViewProps = {
  readonly sessionId: SessionId
  readonly activeTab: ResultsTab
  readonly onTabChange: (tab: ResultsTab) => void
}

function emptyResults(title: string, description: string): ReactNode {
  return (
    <div className="empty-results">
      <svg viewBox="0 0 90 62" aria-hidden="true">
        <rect x="3" y="17" width="22" height="18" />
        <rect x="64" y="28" width="22" height="18" />
        <path d="M25 26h18v11h21M43 26v-14h21" />
      </svg>
      <h3>{title}</h3>
      <p className="empty-results-description">{description}</p>
    </div>
  )
}

/** Render the Issue #3 empty result tabs through a public controlled view seam. */
export function renderResultsPanel(props: ResultsPanelViewProps): ReactNode {
  const currentSelected = props.activeTab === 'current'
  return (
    <aside className="results-panel" data-panel="results" aria-label="生成结果">
      <div className="panel-heading results-heading">
        <div>
          <p className="section-kicker">OUTPUT</p>
          <h2>生成结果</h2>
        </div>
        <span className="result-total">本会话共 0 项运行</span>
      </div>

      <div className="details-tabs" role="tablist" aria-label="生成结果区域">
        <button
          id="tab-current"
          type="button"
          role="tab"
          aria-selected={currentSelected}
          aria-controls="panel-current"
          tabIndex={currentSelected ? 0 : -1}
          data-result-tab="current"
          onClick={() => props.onTabChange('current')}
        >
          当前轮次结果
        </button>
        <button
          id="tab-session"
          type="button"
          role="tab"
          aria-selected={!currentSelected}
          aria-controls="panel-session"
          tabIndex={currentSelected ? -1 : 0}
          data-result-tab="session"
          onClick={() => props.onTabChange('session')}
        >
          本会话结果
        </button>
      </div>

      <div className="results-scroll">
        <section
          id="panel-current"
          className="result-tab-panel"
          role="tabpanel"
          aria-labelledby="tab-current"
          hidden={!currentSelected}
        >
          {emptyResults('此轮对话没有创建 ComfyUI 运行', '当前聊天轮次没有关联的生成运行。')}
        </section>
        <section
          id="panel-session"
          className="result-tab-panel"
          role="tabpanel"
          aria-labelledby="tab-session"
          hidden={currentSelected}
        >
          {emptyResults('当前会话还没有生成运行', '当前会话中没有可显示的生成运行。')}
        </section>
      </div>
    </aside>
  )
}

/** Create the session-scoped empty results occupant for the project details slot. */
export function createResultsPanel() {
  return function ResultsPanel(props: { readonly sessionId: SessionId }): ReactNode {
    const [selection, setSelection] = useState<{
      readonly sessionId: SessionId
      readonly tab: ResultsTab
    }>({ sessionId: props.sessionId, tab: 'current' })
    const activeTab = selection.sessionId === props.sessionId ? selection.tab : 'current'

    return renderResultsPanel({
      sessionId: props.sessionId,
      activeTab,
      onTabChange: tab => setSelection({ sessionId: props.sessionId, tab }),
    })
  }
}

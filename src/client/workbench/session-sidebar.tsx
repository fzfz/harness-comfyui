import { useState, type ReactNode } from 'react'
import type {
  ISessions,
  SessionListState,
  SessionSummary,
} from '@deepseek-ai/dsh-client-runtime/client'

import { isWorkbenchSession } from './workbench-session-binding.ts'

export type SessionSidebarProps = {
  collapsed: boolean
  width: number
  useSessions: <S>(selector: (snapshot: SessionListState) => S) => S
}

export type SessionSidebarViewProps = {
  collapsed: boolean
  width: number
  state: SessionListState
  query: string
  onQueryChange: (value: string) => void
  onOpen: (id: SessionSummary['id']) => void
}

function formatUpdatedAt(updatedAt: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(updatedAt)
}

function visibleSessions(state: SessionListState, query: string): SessionSummary[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  return state.ids
    .map(id => state.byId[id])
    .filter(isWorkbenchSession)
    .filter(session => normalizedQuery.length === 0
      || session.displayTitle.toLocaleLowerCase('zh-CN').includes(normalizedQuery))
}

function calendarDay(updatedAt: number): number {
  const date = new Date(updatedAt)
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
}

function dateGroupLabel(updatedAt: number, now: Date): string {
  const age = (calendarDay(now.getTime()) - calendarDay(updatedAt)) / 86_400_000
  if (age === 0) return '今天'
  if (age === 1) return '昨天'
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(updatedAt)
}

type SessionGroup = {
  key: string
  label: string
  sessions: SessionSummary[]
}

function groupSessions(sessions: SessionSummary[], now: Date): SessionGroup[] {
  const groups: SessionGroup[] = []
  for (const session of sessions) {
    const key = String(calendarDay(session.updatedAt))
    const group = groups.at(-1)
    if (group?.key === key) {
      group.sessions.push(session)
      continue
    }
    groups.push({
      key,
      label: dateGroupLabel(session.updatedAt, now),
      sessions: [session],
    })
  }
  return groups
}

/** Render the project-owned Session list from an explicit public list snapshot. */
export function renderSessionSidebar(props: SessionSidebarViewProps): ReactNode {
  const sessions = visibleSessions(props.state, props.query)
  const groups = groupSessions(sessions, new Date())

  return (
    <aside
      className="session-panel"
      data-sidebar-collapsed={props.collapsed ? 'true' : 'false'}
      data-sidebar-width={props.width}
      aria-label="会话列表"
    >
      <div className="panel-heading session-heading">
        <div className="session-heading-copy">
          <p className="section-kicker">SESSION</p>
          <h2>会话</h2>
        </div>
      </div>
      <label className="search-field" htmlFor="session-search">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="4.5" />
          <path d="m12 12 4 4" />
        </svg>
        <input
          id="session-search"
          name="session-search"
          type="search"
          aria-label="搜索会话"
          placeholder="搜索会话"
          autoComplete="off"
          value={props.query}
          onChange={event => props.onQueryChange(event.currentTarget.value)}
        />
        <kbd>⌘ K</kbd>
      </label>
      <div className="session-list" id="session-list">
        {sessions.length > 0
          ? groups.flatMap(group => [
            <p className="list-date" key={`${group.key}-heading`}>{group.label}</p>,
            ...group.sessions.map(session => {
              const isCurrent = session.id === props.state.current
              return (
                <button
                  className={`session-row${isCurrent ? ' is-current' : ''}`}
                  key={session.id}
                  type="button"
                  data-session-id={session.id}
                  aria-current={isCurrent ? 'true' : undefined}
                  onClick={() => props.onOpen(session.id)}
                >
                  <span className="session-title">{session.displayTitle}</span>
                  <span className="session-meta">{formatUpdatedAt(session.updatedAt)}</span>
                  <span className="run-count">0 项运行</span>
                </button>
              )
            }),
          ])
          : <p className="session-empty" data-session-state="no-match">当前搜索没有匹配的会话</p>}
      </div>
      <div className="session-footer">
        <span className="storage-glyph" aria-hidden="true"></span>
        <span>会话历史由 Harness 保存</span>
      </div>
    </aside>
  )
}

/** Create the global sidebar slot component backed by the injected Sessions service. */
export function createSessionSidebar(sessions: Pick<ISessions, 'open'>) {
  return function SessionSidebar(props: SessionSidebarProps): ReactNode {
    const sessionState = props.useSessions(snapshot => snapshot)
    const [query, setQuery] = useState('')
    return renderSessionSidebar({
      collapsed: props.collapsed,
      width: props.width,
      state: sessionState,
      query,
      onQueryChange: setQuery,
      onOpen: id => sessions.open(id),
    })
  }
}

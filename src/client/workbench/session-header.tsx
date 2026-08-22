import type {
  SessionId,
  SessionListState,
} from '@deepseek-ai/dsh-client-runtime/client'
import { type ReactNode } from 'react'

type SelectorHook<T> = <S>(selector: (snapshot: T) => S) => S

export type SessionHeaderProps = {
  sessionId: SessionId
  useSessions: SelectorHook<SessionListState>
}

export function renderSessionHeader(title: string): ReactNode {
  return (
    <header className="conversation-header">
      <div>
        <p className="section-kicker">CONVERSATION</p>
        <h2 id="conversation-title">{title}</h2>
      </div>
      <div className="conversation-actions">
        <span className="agent-status">
          <span aria-hidden="true"></span>
          Agent 就绪
        </span>
      </div>
    </header>
  )
}

/** Render the current real Session through the strict session slot's public hooks. */
export function createSessionHeader() {
  return function SessionHeader(props: SessionHeaderProps): ReactNode {
    const session = props.useSessions(snapshot => snapshot.byId[props.sessionId])
    return renderSessionHeader(session.displayTitle)
  }
}

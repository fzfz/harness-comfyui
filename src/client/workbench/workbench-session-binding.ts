import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {
  ISessions,
  SessionListState,
  SessionSummary,
} from '@deepseek-ai/dsh-client-runtime/client'

export const WORKBENCH_AGENT_PRESET = 'harness-comfyui' as const

export type WorkbenchSessionConnection = Pick<ConnectionHandle, 'hostDescription'>
export type WorkbenchSessionService = Pick<ISessions, 'list' | 'open'>

/** A Session belongs in the project Workbench only when Harness marked it as a root project Session. */
export function isWorkbenchSession(session: SessionSummary): boolean {
  return session.origin !== 'subagent' && session.agentPreset === WORKBENCH_AGENT_PRESET
}

/** Read project Sessions from the Harness list snapshot without creating a local Session collection. */
export function workbenchSessions(state: SessionListState): SessionSummary[] {
  return state.ids
    .map(id => state.byId[id])
    .filter(isWorkbenchSession)
}

function compareByRecency(left: SessionSummary, right: SessionSummary): number {
  const recency = right.updatedAt - left.updatedAt
  if (recency !== 0) return recency
  if (left.id < right.id) return -1
  if (left.id > right.id) return 1
  return 0
}

/**
 * Start the one Workbench binding for a Client connection. This slice owns only
 * already-published project Sessions; an empty project list intentionally stays
 * empty until the Session-creation slice is applied.
 */
export function startWorkbenchSessionBinding(dependencies: {
  connection: WorkbenchSessionConnection
  sessions: WorkbenchSessionService
}): () => void {
  let disposed = false
  let openIssued = false

  const reconcile = () => {
    if (disposed || dependencies.connection.hostDescription.getSnapshot() === undefined) return

    const snapshot = dependencies.sessions.list.getSnapshot()
    if (snapshot.phase !== 'ready') return

    const current = snapshot.current === undefined
      ? undefined
      : snapshot.byId[snapshot.current]
    if (current !== undefined && isWorkbenchSession(current)) return
    if (openIssued) return

    const target = workbenchSessions(snapshot).sort(compareByRecency)[0]
    if (target === undefined) return

    openIssued = true
    dependencies.sessions.open(target.id)
  }

  const unsubscribeHost = dependencies.connection.hostDescription.subscribe(reconcile)
  const unsubscribeSessions = dependencies.sessions.list.subscribe(reconcile)
  reconcile()

  return () => {
    if (disposed) return
    disposed = true
    unsubscribeSessions()
    unsubscribeHost()
  }
}

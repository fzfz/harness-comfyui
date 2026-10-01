import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'

import { GenerationRuntimeError } from './generation-runtime.ts'

export interface WorkspaceProjection {
  readonly id: string
  readonly sessionIds: readonly string[]
}

export interface WorkspaceRegistryProjection {
  list(): readonly WorkspaceProjection[]
}

export type SessionPersistenceProjection = Pick<SessionPersistence, 'stat'>

interface SessionAncestryProjection {
  readonly parentSession?: string
}

export interface WorkspaceSessionScope {
  readonly workspaceId: string
  readonly sessionIds: readonly string[]
}

function workspaceForSession(registry: WorkspaceRegistryProjection, sessionId: string): WorkspaceProjection {
  const matches = registry.list().filter(workspace => workspace.sessionIds.includes(sessionId))
  if (matches.length !== 1) {
    throw new GenerationRuntimeError('GENERATION_SESSION_NOT_FOUND', 'The Harness Session is not attached to one Workspace.')
  }
  return matches[0]!
}

export async function workspaceSessionScopeForSession(
  workspaceRegistry: WorkspaceRegistryProjection,
  sessionPersistence: SessionPersistenceProjection,
  sessionId: string,
  signal: AbortSignal,
): Promise<WorkspaceSessionScope> {
  signal.throwIfAborted()
  const workspace = workspaceForSession(workspaceRegistry, sessionId)
  const workspaceSessionIds = new Set(workspace.sessionIds)
  const sessionRecords = new Map<string, Promise<SessionAncestryProjection | undefined>>()
  const sessionRecord = async (id: string): Promise<SessionAncestryProjection | undefined> => {
    let record = sessionRecords.get(id)
    if (record === undefined) {
      record = sessionPersistence.stat(SessionId(id), { signal }).then(snapshot => {
        signal.throwIfAborted()
        if (snapshot === undefined || snapshot.header.id !== id) return undefined
        return { parentSession: snapshot.header.parentSession }
      })
      sessionRecords.set(id, record)
    }
    return record
  }

  const scopedSessionIds = new Set([sessionId])
  for (const candidateId of workspaceSessionIds) {
    if (candidateId === sessionId) continue
    let parentSessionId = (await sessionRecord(candidateId))?.parentSession
    signal.throwIfAborted()
    const visited = new Set([candidateId])
    while (typeof parentSessionId === 'string' && parentSessionId.length > 0) {
      if (parentSessionId === sessionId) {
        scopedSessionIds.add(candidateId)
        break
      }
      if (!workspaceSessionIds.has(parentSessionId) || visited.has(parentSessionId)) break
      visited.add(parentSessionId)
      parentSessionId = (await sessionRecord(parentSessionId))?.parentSession
      signal.throwIfAborted()
    }
  }

  return Object.freeze({
    workspaceId: workspace.id,
    sessionIds: Object.freeze([...scopedSessionIds]),
  })
}

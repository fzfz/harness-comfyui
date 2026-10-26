import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'
import type { SubagentRuntime } from '@deepseek-ai/dsh-subagent'

import { ERROR_CATALOG } from '../../../config/error-catalog-schema.ts'
import { GenerationRuntimeError } from './generation-error.ts'

export interface WorkspaceRegistryProjection {
  resolveByPath(path: string): Promise<{ readonly id: string | number } | undefined>
}

export type SessionPersistenceProjection = Pick<SessionPersistence, 'stat'>
export type SubagentQueryProjection = Pick<SubagentRuntime, 'listDescendants'>

export interface WorkspaceSessionScope {
  readonly workspaceId: string
  readonly sessionIds: readonly string[]
}

export async function resolveGenerationWorkspaceId(
  workspaceRegistry: WorkspaceRegistryProjection,
  originalProjectDirectory: string | undefined,
): Promise<string> {
  const workspace = originalProjectDirectory
    ? await workspaceRegistry.resolveByPath(originalProjectDirectory)
    : undefined
  if (workspace === undefined) {
    const error = ERROR_CATALOG.GENERATION_WORKSPACE_REQUIRED
    throw new GenerationRuntimeError(error.code, `${error.reason} ${error.next_step}`)
  }
  return String(workspace.id)
}

function sessionUnavailable(sessionId: string, reason: string): never {
  const error = ERROR_CATALOG.GENERATION_SESSION_UNAVAILABLE
  throw new GenerationRuntimeError(error.code, error.diagnostic_template
    .replace('{session_id}', sessionId).replace('{reason}', reason))
}

export async function workspaceSessionScopeForSession(
  workspaceRegistry: WorkspaceRegistryProjection,
  sessionPersistence: SessionPersistenceProjection,
  subagents: SubagentQueryProjection,
  sessionId: string,
  signal: AbortSignal,
): Promise<WorkspaceSessionScope> {
  signal.throwIfAborted()
  const root = await sessionPersistence.stat(SessionId(sessionId), { signal })
  signal.throwIfAborted()
  if (root === undefined) {
    const error = ERROR_CATALOG.GENERATION_SESSION_NOT_FOUND
    throw new GenerationRuntimeError(error.code, `${error.reason} ${error.next_step}`)
  }
  const workspaceId = await resolveGenerationWorkspaceId(workspaceRegistry, root.header.cwd)
  signal.throwIfAborted()
  const descendants = await subagents.listDescendants(SessionId(sessionId), signal)
  signal.throwIfAborted()
  const sessionIds = [sessionId]
  for (const descendant of descendants) {
    if (descendant.kind === 'diagnostic') sessionUnavailable(descendant.id, descendant.reason)
    if (descendant.mode === 'external') continue
    const snapshot = await sessionPersistence.stat(descendant.id, { signal })
    signal.throwIfAborted()
    if (!snapshot?.header.cwd) sessionUnavailable(descendant.id, 'unavailable')
    const workspace = await workspaceRegistry.resolveByPath(snapshot.header.cwd)
    signal.throwIfAborted()
    if (workspace !== undefined && String(workspace.id) === workspaceId) sessionIds.push(descendant.id)
  }
  return Object.freeze({ workspaceId, sessionIds: Object.freeze(sessionIds) })
}

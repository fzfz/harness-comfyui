import { GenerationRuntimeError } from './generation-runtime.ts'

export interface WorkspaceProjection {
  readonly id: string
  readonly sessionIds: readonly string[]
}

export interface WorkspaceRegistryProjection {
  list(): readonly WorkspaceProjection[]
}

export function workspaceIdForSession(registry: WorkspaceRegistryProjection, sessionId: string): string {
  const matches = registry.list().filter(workspace => workspace.sessionIds.includes(sessionId))
  if (matches.length !== 1) {
    throw new GenerationRuntimeError('GENERATION_SESSION_NOT_FOUND', 'The Harness Session is not attached to one Workspace.')
  }
  return matches[0]!.id
}

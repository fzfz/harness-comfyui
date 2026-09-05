import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'

import {
  GenerationRuntimeError,
  type GenerationIdentity,
} from './generation-runtime.ts'

function toolContextInvalid(toolName: string): never {
  throw new GenerationRuntimeError(
    'GENERATION_TOOL_CONTEXT_INVALID',
    `The Generation Tool execution context does not contain one matching ${toolName} Tool Call.`,
  )
}

export async function deriveGenerationToolExecutionIdentity(
  workspaceRegistry: Pick<WorkspaceRegistry, 'resolveByPath'>,
  exec: ToolRunContext,
  toolName: string,
): Promise<GenerationIdentity> {
  if (exec.agent === undefined) toolContextInvalid(toolName)
  const session = exec.agent.session
  const calls = session.snapshotEvents().flatMap(event => (
    event.type === 'tool/call' && String(event.data.callId) === String(exec.callId) ? [event] : []
  ))
  if (calls.length !== 1) toolContextInvalid(toolName)
  const call = calls[0]!
  if (call.data.name !== toolName) toolContextInvalid(toolName)
  const cwd = session.header.cwd
  if (typeof cwd !== 'string' || cwd.length === 0) {
    throw new GenerationRuntimeError(
      'GENERATION_WORKSPACE_REQUIRED',
      'The current Session does not declare a Workspace directory.',
    )
  }
  const workspace = await workspaceRegistry.resolveByPath(cwd)
  if (workspace === undefined || !workspace.sessionIds.some(sessionId => String(sessionId) === String(session.id))) {
    throw new GenerationRuntimeError(
      'GENERATION_WORKSPACE_REQUIRED',
      'The current Session is not attached to a Harness Workspace.',
    )
  }
  return Object.freeze({
    workspaceId: String(workspace.id),
    sessionId: String(session.id),
    turn: call.data.turn,
    callId: String(exec.callId),
  })
}

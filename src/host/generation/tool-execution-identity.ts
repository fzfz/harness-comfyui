import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { resolveGenerationWorkspaceId, type WorkspaceRegistryProjection } from './workspace-access.ts'

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
  workspaceRegistry: WorkspaceRegistryProjection,
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
  const workspaceId = await resolveGenerationWorkspaceId(workspaceRegistry, session.header.cwd)
  return Object.freeze({
    workspaceId,
    sessionId: String(session.id),
    turn: call.data.turn,
    callId: String(exec.callId),
  })
}

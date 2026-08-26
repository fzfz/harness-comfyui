import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolDefinition, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'

import {
  GenerationRuntimeError,
  type GenerationIdentity,
  type GenerationRequest,
  type GenerationRuntime,
  type JsonValue,
} from './generation-runtime.ts'

export const GENERATION_TOOL_NAME = 'generate_with_comfyui'

export interface CreateGenerationToolOptions {
  readonly runtime: Pick<GenerationRuntime, 'acceptGeneration'>
  readonly workspaceRegistry: Pick<WorkspaceRegistry, 'resolveByPath'>
}

function toolContextInvalid(): never {
  throw new GenerationRuntimeError(
    'GENERATION_TOOL_CONTEXT_INVALID',
    'The Generation Tool execution context does not contain one matching generate_with_comfyui Tool Call.',
  )
}

async function deriveIdentity(
  workspaceRegistry: Pick<WorkspaceRegistry, 'resolveByPath'>,
  exec: ToolRunContext,
): Promise<GenerationIdentity> {
  if (exec.agent === undefined) toolContextInvalid()
  const session = exec.agent.session
  const calls = session.events.flatMap(event => event.type === 'tool/call' && String(event.data.callId) === String(exec.callId) ? [event] : [])
  if (calls.length !== 1) toolContextInvalid()
  const call = calls[0]!
  if (call.data.name !== GENERATION_TOOL_NAME) toolContextInvalid()
  const cwd = session.header.cwd
  if (typeof cwd !== 'string' || cwd.length === 0) {
    throw new GenerationRuntimeError('GENERATION_WORKSPACE_REQUIRED', 'The current Session does not declare a Workspace directory.')
  }
  const workspace = await workspaceRegistry.resolveByPath(cwd)
  if (workspace === undefined || !workspace.sessionIds.some(sessionId => String(sessionId) === String(session.id))) {
    throw new GenerationRuntimeError('GENERATION_WORKSPACE_REQUIRED', 'The current Session is not attached to a Harness Workspace.')
  }
  return Object.freeze({
    workspaceId: String(workspace.id),
    sessionId: String(session.id),
    turn: call.data.turn,
    callId: String(exec.callId),
  })
}

export function createGenerationTool(options: CreateGenerationToolOptions): ToolDefinition {
  const definition = defineTool({
    name: GENERATION_TOOL_NAME,
    description: 'Create one durable ComfyUI Generation Run from one approved template, an optional resolved generation model, explicit runtime parameters, resolved LoRA selections, and an optional safe instance route; return the accepted run_id without waiting for remote completion.',
    parameters: {
      title: { type: 'string', required: true, description: 'Title shown for this Generation Run.' },
      instance_id: { type: 'string', description: 'Approved ComfyUI instance identity.' },
      template_id: { type: 'string', required: true, description: 'Approved ComfyUI template identity.' },
      model: {
        type: 'object',
        additionalProperties: false,
        description: 'Generation model resolved by query_semantic_generation_models; the Host replaces the template default model with this model on the target ComfyUI instance.',
        properties: {
          id: { type: 'string', required: true, description: 'Resolved generation-model catalog identity.' },
          file_name: { type: 'string', required: true, description: 'Resolved catalog file name; the Host maps it to the target instance path.' },
        },
      },
      parameters: {
        type: 'object',
        additionalProperties: true,
        required: true,
        description: 'Runtime values keyed by the template parameter_id.',
      },
      loras: {
        type: 'array',
        description: 'LoRAs resolved by query_semantic_loras and applied to the current Workflow through the target ComfyUI instance node definitions.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', required: true, description: 'Resolved LoRA catalog identity.' },
            file_name: { type: 'string', required: true, description: 'Resolved catalog file name; the Host maps it to the target instance path.' },
            weight: { type: 'number', required: true, description: 'Model weight selected for this LoRA.' },
            trigger_words: { type: 'array', required: true, description: 'Trigger words actually used in the rewritten final prompt.', items: { type: 'string' } },
          },
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { run_id: { type: 'string', required: true } },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      presentationMeta: (_args, value) => ({
        contract_id: 'harness-comfyui-generation-run',
        contract_version: 1,
        run_id: value.run_id,
      }),
    },
    async execute(args, exec) {
      const identity = await deriveIdentity(options.workspaceRegistry, exec)
      const request: GenerationRequest = {
        title: args.title,
        instanceId: args.instance_id ?? null,
        templateId: args.template_id,
        model: args.model === undefined ? null : Object.freeze({
          id: args.model.id,
          fileName: args.model.file_name,
        }),
        parameters: args.parameters as Readonly<Record<string, JsonValue>>,
        loras: Object.freeze((args.loras ?? []).map(lora => Object.freeze({
          id: lora.id,
          fileName: lora.file_name,
          weight: lora.weight,
          triggerWords: Object.freeze([...lora.trigger_words]),
        }))),
      }
      const accepted = await options.runtime.acceptGeneration(identity, request, exec.signal)
      return Object.freeze({ run_id: accepted.runId })
    },
  })

  return Object.freeze({
    ...definition,
    parameters: Object.freeze({ ...definition.parameters, additionalProperties: false }),
  }) as ToolDefinition
}

export function generationToolForContext(ctx: Context, runtime: GenerationRuntime): ToolDefinition {
  return createGenerationTool({ runtime, workspaceRegistry: ctx.workspaceRegistry })
}

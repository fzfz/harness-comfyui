import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'

import {
  type GenerationRequest,
  type GenerationRuntime,
  type JsonValue,
} from './generation-runtime.ts'
import { STANDARD_RUNTIME_PARAMETER_KINDS } from './runtime-parameters.ts'
import { deriveGenerationToolExecutionIdentity } from './tool-execution-identity.ts'

export const GENERATION_TOOL_NAME = 'generate_with_comfyui'
const STANDARD_RUNTIME_PARAMETER_DESCRIPTION = STANDARD_RUNTIME_PARAMETER_KINDS.join(', ')

export interface CreateGenerationToolOptions {
  readonly runtime: Pick<GenerationRuntime, 'acceptGeneration'>
  readonly workspaceRegistry: Pick<WorkspaceRegistry, 'resolveByPath'>
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
        description: `Explicit Workflow runtime values. Standard semantic keys include ${STANDARD_RUNTIME_PARAMETER_DESCRIPTION}. An exact user-supplied Workflow input key is also accepted. The Host resolves every supplied key against the executable Workflow and the target ComfyUI instance.`,
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
      const identity = await deriveGenerationToolExecutionIdentity(
        options.workspaceRegistry,
        exec,
        GENERATION_TOOL_NAME,
      )
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

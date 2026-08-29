import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolDefinition, type ValueSchemaSpec } from '@deepseek-ai/dsh-tools'
import type { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'

import {
  MAX_RUN_INPUT_QUERY_IDS,
  type JsonValue,
} from '../../generation/run-input-contract.ts'
import type { GenerationRuntime } from './generation-runtime.ts'
import { deriveGenerationToolExecutionIdentity } from './tool-execution-identity.ts'

export const GENERATION_RUN_INPUT_TOOL_NAME = 'read_comfyui_run_inputs'

export interface CreateGenerationRunInputToolOptions {
  readonly runtime: Pick<GenerationRuntime, 'readGenerationRunInputs'>
  readonly workspaceRegistry: Pick<WorkspaceRegistry, 'resolveByPath'>
}

const errorSchema = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    code: { type: 'string' as const, required: true },
    message: { type: 'string' as const, required: true },
  },
} as const satisfies ValueSchemaSpec

type MutableJsonValue = string | number | boolean | null | { [key: string]: MutableJsonValue } | MutableJsonValue[]
type MutableJsonObject = { [key: string]: MutableJsonValue }

function copyJson(value: JsonValue): MutableJsonValue {
  if (Array.isArray(value)) return value.map(item => copyJson(item))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyJson(item)]))
  }
  return value
}

function copyJsonObject(value: Readonly<Record<string, JsonValue>>): MutableJsonObject {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyJson(item)]))
}

const loraSchema = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    id: { type: 'string' as const, required: true },
    file_name: { type: 'string' as const, required: true },
    weight: { type: 'number' as const, required: true },
    trigger_words: {
      type: 'array' as const,
      required: true,
      items: { type: 'string' as const },
    },
  },
} as const satisfies ValueSchemaSpec

const modelSchema = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    id: { type: 'string' as const, required: true },
    file_name: { type: 'string' as const, required: true },
  },
} as const satisfies ValueSchemaSpec

const argumentsSchema = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    title: { type: 'string' as const, required: true },
    instance_id: { type: 'string' as const },
    template_id: { type: 'string' as const, required: true },
    model: modelSchema,
    parameters: { type: 'object' as const, required: true, additionalProperties: true },
    loras: { type: 'array' as const, required: true, items: loraSchema },
  },
} as const satisfies ValueSchemaSpec

const availableWorkflowItemSchema = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    run_id: { type: 'string' as const, required: true },
    lookup_status: { type: 'string' as const, const: 'available', required: true },
    arguments: { ...argumentsSchema, required: true },
    workflow_status: { type: 'string' as const, const: 'available', required: true },
    workflow: { type: 'object' as const, required: true, additionalProperties: true },
  },
} as const satisfies ValueSchemaSpec

const unavailableWorkflowItemSchema = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    run_id: { type: 'string' as const, required: true },
    lookup_status: { type: 'string' as const, const: 'available', required: true },
    arguments: { ...argumentsSchema, required: true },
    workflow_status: { type: 'string' as const, const: 'unavailable', required: true },
    workflow_error: { ...errorSchema, required: true },
  },
} as const satisfies ValueSchemaSpec

const failedItemSchema = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    run_id: { type: 'string' as const, required: true },
    lookup_status: { type: 'string' as const, const: 'error', required: true },
    error: { ...errorSchema, required: true },
  },
} as const satisfies ValueSchemaSpec

const outputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    runs: {
      type: 'array',
      required: true,
      items: {
        oneOf: [
          availableWorkflowItemSchema,
          unavailableWorkflowItemSchema,
          failedItemSchema,
        ],
      },
    },
  },
} as const satisfies ValueSchemaSpec

export function createGenerationRunInputTool(options: CreateGenerationRunInputToolOptions): ToolDefinition {
  const definition = defineTool({
    name: GENERATION_RUN_INPUT_TOOL_NAME,
    description: 'Read the complete persisted generate_with_comfyui arguments and saved Actual Workflow for one to twenty Run IDs in the current Workspace; return one ordered success or error item for every requested run_id.',
    parameters: {
      run_ids: {
        type: 'array',
        required: true,
        description: `One to ${MAX_RUN_INPUT_QUERY_IDS} Generation Run IDs. Every ID is queried independently and results keep this order.`,
        items: { type: 'string' },
      },
    },
    output: {
      schema: outputSchema,
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      if (args.run_ids.length === 0 || args.run_ids.length > MAX_RUN_INPUT_QUERY_IDS) {
        throw new TypeError(`run_ids must contain between 1 and ${MAX_RUN_INPUT_QUERY_IDS} strings`)
      }
      const identity = await deriveGenerationToolExecutionIdentity(
        options.workspaceRegistry,
        exec,
        GENERATION_RUN_INPUT_TOOL_NAME,
      )
      const result = await options.runtime.readGenerationRunInputs({
        workspaceId: identity.workspaceId,
        runIds: args.run_ids,
      }, exec.signal)
      return {
        runs: result.runs.map((item) => {
          if (item.lookup_status === 'error') {
            return {
              run_id: item.run_id,
              lookup_status: item.lookup_status,
              error: { ...item.error },
            }
          }
          const argumentsValue = {
            title: item.arguments.title,
            ...(item.arguments.instance_id === undefined ? {} : { instance_id: item.arguments.instance_id }),
            template_id: item.arguments.template_id,
            ...(item.arguments.model === undefined ? {} : { model: { ...item.arguments.model } }),
            parameters: copyJsonObject(item.arguments.parameters),
            loras: item.arguments.loras.map(lora => ({
              id: lora.id,
              file_name: lora.file_name,
              weight: lora.weight,
              trigger_words: [...lora.trigger_words],
            })),
          }
          if (item.workflow_status === 'available') {
            return {
              run_id: item.run_id,
              lookup_status: item.lookup_status,
              arguments: argumentsValue,
              workflow_status: item.workflow_status,
              workflow: copyJsonObject(item.workflow),
            }
          }
          return {
            run_id: item.run_id,
            lookup_status: item.lookup_status,
            arguments: argumentsValue,
            workflow_status: item.workflow_status,
            workflow_error: { ...item.workflow_error },
          }
        }),
      }
    },
  })

  return Object.freeze({
    ...definition,
    parameters: Object.freeze({ ...definition.parameters, additionalProperties: false }),
  }) as ToolDefinition
}

export function generationRunInputToolForContext(ctx: Context, runtime: GenerationRuntime): ToolDefinition {
  return createGenerationRunInputTool({ runtime, workspaceRegistry: ctx.workspaceRegistry })
}

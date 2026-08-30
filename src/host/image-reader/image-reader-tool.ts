import { defineTool, type ToolDefinition, type ValueSchemaSpec } from '@deepseek-ai/dsh-tools'
import type { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'

import { MAX_RUN_INPUT_QUERY_IDS, type JsonValue } from '../../generation/run-input-contract.ts'
import type { GenerationRuntime } from '../generation/generation-runtime.ts'
import { deriveGenerationToolExecutionIdentity } from '../generation/tool-execution-identity.ts'
import type { ImageReaderService } from './image-reader-service.ts'

export const GENERATION_RUN_MEDIA_TOOL_NAME = 'get_generation_run_media'
export const INSPECT_IMAGE_TOOL_NAME = 'inspect_image'

export interface CreateGenerationRunMediaToolOptions {
  readonly runtime: Pick<GenerationRuntime, 'readGenerationRunMedia'>
  readonly workspaceRegistry: Pick<WorkspaceRegistry, 'resolveByPath'>
}

function closed(definition: ToolDefinition): ToolDefinition {
  return Object.freeze({
    ...definition,
    parameters: Object.freeze({ ...definition.parameters, additionalProperties: false }),
  }) as ToolDefinition
}

type MutableJsonValue = string | number | boolean | null | { [key: string]: MutableJsonValue } | MutableJsonValue[]

function copyJson(value: JsonValue): MutableJsonValue {
  if (Array.isArray(value)) return value.map(item => copyJson(item))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyJson(item)]))
  }
  return value
}

const errorSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    code: { type: 'string', required: true },
    message: { type: 'string', required: true },
  },
} as const satisfies ValueSchemaSpec

const imageSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    media_id: { type: 'string', required: true },
    node_id: { type: 'string', required: true },
    output_index: { type: 'number', required: true },
    filename: { type: 'string', required: true },
    media_type: { type: 'string', required: true },
    file_path: { type: 'string', required: true },
  },
} as const satisfies ValueSchemaSpec

const availableRunSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    run_id: { type: 'string', required: true },
    lookup_status: { type: 'string', const: 'available', required: true },
    title: { type: 'string', required: true },
    parameters: { type: 'object', required: true, additionalProperties: true },
    images: { type: 'array', required: true, items: imageSchema },
  },
} as const satisfies ValueSchemaSpec

const failedRunSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    run_id: { type: 'string', required: true },
    lookup_status: { type: 'string', const: 'error', required: true },
    error: { ...errorSchema, required: true },
  },
} as const satisfies ValueSchemaSpec

export function createGenerationRunMediaTool(options: CreateGenerationRunMediaToolOptions): ToolDefinition {
  return closed(defineTool({
    name: GENERATION_RUN_MEDIA_TOOL_NAME,
    description: `Read saved local image paths and original parameters for one to ${MAX_RUN_INPUT_QUERY_IDS} full Generation Run IDs or unique Run ID prefixes in the current Workspace. Every Run returns one ordered success or error item. This Tool does not inspect images.`,
    parameters: {
      run_ids: {
        type: 'array',
        required: true,
        description: `One to ${MAX_RUN_INPUT_QUERY_IDS} Generation Run identities. Results preserve this order and duplicate identities.`,
        items: { type: 'string' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          runs: {
            type: 'array',
            required: true,
            items: { oneOf: [availableRunSchema, failedRunSchema] },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      if (args.run_ids.length === 0 || args.run_ids.length > MAX_RUN_INPUT_QUERY_IDS) {
        throw new TypeError(`run_ids must contain between 1 and ${MAX_RUN_INPUT_QUERY_IDS} strings`)
      }
      const identity = await deriveGenerationToolExecutionIdentity(
        options.workspaceRegistry,
        exec,
        GENERATION_RUN_MEDIA_TOOL_NAME,
      )
      const result = await options.runtime.readGenerationRunMedia({
        workspaceId: identity.workspaceId,
        runIds: args.run_ids,
      }, exec.signal)
      return {
        runs: result.runs.map((run) => {
          if (run.lookup_status === 'error') {
            return {
              run_id: run.run_id,
              lookup_status: run.lookup_status,
              error: { ...run.error },
            }
          }
          return {
            run_id: run.run_id,
            lookup_status: run.lookup_status,
            title: run.title,
            parameters: Object.fromEntries(
              Object.entries(run.parameters).map(([key, value]) => [key, copyJson(value)]),
            ),
            images: run.images.map(image => ({
              media_id: image.media_id,
              node_id: image.node_id,
              output_index: image.output_index,
              filename: image.filename,
              media_type: image.media_type,
              file_path: image.file_path,
            })),
          }
        }),
      }
    },
  }))
}

export function createInspectImageTool(service: Pick<ImageReaderService, 'inspect'>): ToolDefinition {
  return closed(defineTool({
    name: INSPECT_IMAGE_TOOL_NAME,
    description: 'Inspect exactly one local image with the visual provider, model, prompt, temperature, and output limit selected in Harness settings. Return only observable image content.',
    parameters: {
      file_path: { type: 'string', required: true, description: 'Absolute local path of exactly one image.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          provider: { type: 'string', required: true },
          model: { type: 'string', required: true },
          file_path: { type: 'string', required: true },
          observation: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      const result = await service.inspect(args.file_path, exec.signal)
      return Object.freeze({
        provider: result.provider,
        model: result.model,
        file_path: result.filePath,
        observation: result.observation,
      })
    },
  }))
}

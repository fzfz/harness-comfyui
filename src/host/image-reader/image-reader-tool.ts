import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { ImageReaderService } from './image-reader-service.ts'
export const INSPECT_IMAGE_TOOL_NAME = 'inspect_image'

function closed(definition: ToolDefinition): ToolDefinition {
  return Object.freeze({
    ...definition,
    parameters: Object.freeze({ ...definition.parameters, additionalProperties: false }),
  }) as ToolDefinition
}

export function createInspectImageTool(service: Pick<ImageReaderService, 'inspect'>): ToolDefinition {
  return closed(defineTool({
    name: INSPECT_IMAGE_TOOL_NAME,
    description: 'Inspect exactly one local image with the visual provider, model, temperature, and output limit selected in Harness settings. An optional prompt overrides defaultPrompt for this inspection only; omit it to use the active image-reader profile defaultPrompt. The visual model may return ordinary text; this Tool wraps that text in provider, model, file_path, and observation properties.',
    parameters: {
      file_path: { type: 'string', required: true, description: 'Absolute local path of exactly one image.' },
      prompt: {
        type: 'string',
        description: 'Optional image-reading prompt for this inspection only. Omit it to use the active image-reader profile defaultPrompt.',
      },
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
      const result = await service.inspect(args.file_path, {
        prompt: args.prompt,
        sessionId: exec.agent === undefined ? undefined : String(exec.agent.session.id),
        signal: exec.signal,
      })
      return Object.freeze({
        provider: result.provider,
        model: result.model,
        file_path: result.filePath,
        observation: result.observation,
      })
    },
  }))
}

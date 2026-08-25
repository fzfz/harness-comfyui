import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'

import type { CatalogResolvedTemplate } from '../../catalog/contract.ts'

export const TEMPLATE_RESOLVER_TOOL_NAME = 'query_semantic_comfyui_templates'

export interface TemplateResolverCatalog {
  resolveTemplate(id: string, signal: AbortSignal): Promise<CatalogResolvedTemplate>
}

export function createTemplateResolverTool(catalog: TemplateResolverCatalog): ToolDefinition {
  const definition = defineTool({
    name: TEMPLATE_RESOLVER_TOOL_NAME,
    description: 'Resolve one approved ComfyUI Workflow template ID to its title and safe runtime parameter definitions.',
    parameters: {
      id: { type: 'string', required: true, description: 'Approved ComfyUI Workflow template identity.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true, description: 'Stable identity of the resolved ComfyUI Workflow template.' },
          title: { type: 'string', required: true, description: 'Human-readable title of the resolved ComfyUI Workflow template.' },
          parameters: {
            type: 'array',
            required: true,
            description: 'Definitions for each runtime parameter accepted by the resolved ComfyUI Workflow template.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                parameter_id: {
                  type: 'string',
                  required: true,
                  description: 'Exact key to write in generate_with_comfyui.parameters.',
                },
                kind: {
                  type: 'string',
                  required: true,
                  description: 'Semantic purpose used to match a user value to this runtime parameter.',
                },
                value_type: {
                  type: 'string',
                  required: true,
                  description: 'Template-declared runtime value type: string, enum, image_reference, and asset_reference use JSON strings; integer, number, and boolean use their corresponding JSON scalar values.',
                },
                required: {
                  type: 'boolean',
                  required: true,
                  description: 'Whether generate_with_comfyui must receive a value for this runtime parameter.',
                },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: async (args, exec) => {
      const template = await catalog.resolveTemplate(args.id, exec.signal)
      return {
        id: template.id,
        title: template.title,
        parameters: template.parameters.map(parameter => ({ ...parameter })),
      }
    },
  })
  return Object.freeze({
    ...definition,
    parameters: Object.freeze({ ...definition.parameters, additionalProperties: false }),
  }) as ToolDefinition
}

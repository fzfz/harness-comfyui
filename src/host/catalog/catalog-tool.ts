import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'

import type {
  CatalogComfyuiInstancePage,
  CatalogComfyuiInstanceQueryRequest,
  CatalogResolvedGenerationModel,
  CatalogResolvedLora,
  CatalogResolvedTemplate,
} from '../../catalog/contract.ts'
import {
  CATALOG_COMFYUI_INSTANCE_QUERY,
} from '../../catalog/contract.ts'

export const TEMPLATE_RESOLVER_TOOL_NAME = 'query_semantic_comfyui_templates'
export const LORA_RESOLVER_TOOL_NAME = 'query_semantic_loras'
export const GENERATION_MODEL_RESOLVER_TOOL_NAME = 'query_semantic_generation_models'
export const COMFYUI_INSTANCE_QUERY_TOOL_NAME = 'query_semantic_comfyui_instances'

export interface TemplateResolverCatalog {
  resolveTemplate(id: string, signal: AbortSignal): Promise<CatalogResolvedTemplate>
}

export interface LoraResolverCatalog {
  resolveLora(id: string, signal: AbortSignal): Promise<CatalogResolvedLora>
}

export interface GenerationModelResolverCatalog {
  resolveGenerationModel(id: string, signal: AbortSignal): Promise<CatalogResolvedGenerationModel>
}

export interface ComfyuiInstanceCatalog {
  queryComfyuiInstances(
    input: CatalogComfyuiInstanceQueryRequest,
    signal: AbortSignal,
  ): Promise<CatalogComfyuiInstancePage>
}

function closedDefinition(definition: ToolDefinition): ToolDefinition {
  return Object.freeze({
    ...definition,
    parameters: Object.freeze({ ...definition.parameters, additionalProperties: false }),
  }) as ToolDefinition
}

export function createTemplateResolverTool(catalog: TemplateResolverCatalog): ToolDefinition {
  const definition = defineTool({
    name: TEMPLATE_RESOLVER_TOOL_NAME,
    description: 'Resolve one approved ComfyUI Workflow template ID to its title and model compatibility identities.',
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
          base_model_id: { type: 'string', required: true, description: 'Base-model family ID required by the resolved Workflow template.' },
          model_id: { type: 'string', description: 'Generation-model ID currently saved as the resolved Workflow template default when the template declares one.' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: async (args, exec) => {
      const template = await catalog.resolveTemplate(args.id, exec.signal)
      return {
        id: template.id,
        title: template.title,
        base_model_id: template.base_model_id,
        ...(template.model_id === null ? {} : { model_id: template.model_id }),
      }
    },
  })
  return closedDefinition(definition)
}

export function createLoraResolverTool(catalog: LoraResolverCatalog): ToolDefinition {
  const definition = defineTool({
    name: LORA_RESOLVER_TOOL_NAME,
    description: 'Resolve one selected LoRA ID to its semantic guidance, trigger words, default model weight, and catalog file name.',
    parameters: {
      id: { type: 'string', required: true, description: 'Selected LoRA catalog identity from the current message context.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true, description: 'Stable identity of the resolved LoRA.' },
          base_model_id: { type: 'string', required: true, description: 'Base-model family ID required by the resolved LoRA.' },
          model_id: { type: 'string', required: true, description: 'Generation-model ID associated with the resolved LoRA.' },
          file_name: { type: 'string', required: true, description: 'Catalog file name used by the Host to resolve the target ComfyUI instance asset path.' },
          description: { type: 'string', required: true, description: 'LoRA introduction used to understand its visual effect and suitable subjects or scenes.' },
          usage: { type: 'string', required: true, description: 'LoRA usage guidance used to choose trigger words and adjust the prompt.' },
          trigger_words: {
            type: 'array',
            required: true,
            description: 'Catalog trigger words available for the Agent to select while rewriting the final prompt.',
            items: { type: 'string' },
          },
          weight: { type: 'number', required: true, description: 'Default model weight for the current generate_with_comfyui loras item when the user does not specify another weight.' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: async (args, exec) => {
      const lora = await catalog.resolveLora(args.id, exec.signal)
      return {
        id: lora.id,
        base_model_id: lora.base_model_id,
        model_id: lora.model_id,
        file_name: lora.file_name,
        description: lora.description,
        usage: lora.usage,
        trigger_words: [...lora.trigger_words],
        weight: lora.weight,
      }
    },
  })
  return closedDefinition(definition)
}

export function createGenerationModelResolverTool(catalog: GenerationModelResolverCatalog): ToolDefinition {
  const definition = defineTool({
    name: GENERATION_MODEL_RESOLVER_TOOL_NAME,
    description: 'Resolve one selected generation-model ID to its catalog file name, model guidance, and compatible Prompt Skill.',
    parameters: {
      id: { type: 'string', required: true, description: 'Selected generation-model catalog identity from the current message context.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true, description: 'Stable identity of the resolved generation model.' },
          base_model_id: { type: 'string', required: true, description: 'Base-model family ID of the resolved generation model.' },
          file_name: { type: 'string', required: true, description: 'Catalog file name of the resolved generation model.' },
          description: { type: 'string', required: true, description: 'Generation-model introduction used to understand its visual and prompting behavior.' },
          usage: { type: 'string', required: true, description: 'Generation-model usage guidance applied while preparing the final prompt and run parameters.' },
          skill_name: { type: 'string', description: 'Prompt Skill associated with the generation model when the catalog declares one.' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: async (args, exec) => {
      const model = await catalog.resolveGenerationModel(args.id, exec.signal)
      return {
        id: model.id,
        base_model_id: model.base_model_id,
        file_name: model.file_name,
        description: model.description,
        usage: model.usage,
        ...(model.skill_name === null ? {} : { skill_name: model.skill_name }),
      }
    },
  })
  return closedDefinition(definition)
}

export function createComfyuiInstanceQueryTool(catalog: ComfyuiInstanceCatalog): ToolDefinition {
  const definition = defineTool({
    name: COMFYUI_INSTANCE_QUERY_TOOL_NAME,
    description: 'List the current approved ComfyUI instance IDs for generate_with_comfyui.',
    parameters: {
      mode: { type: 'string', required: true, const: CATALOG_COMFYUI_INSTANCE_QUERY.mode, description: 'Fixed Catalog search mode.' },
      query: { type: 'string', required: true, const: CATALOG_COMFYUI_INSTANCE_QUERY.query, description: 'Fixed empty instance search text.' },
      page: { type: 'integer', required: true, const: CATALOG_COMFYUI_INSTANCE_QUERY.page, description: 'Fixed first Catalog result page.' },
      page_size: { type: 'integer', required: true, const: CATALOG_COMFYUI_INSTANCE_QUERY.page_size, description: 'Fixed maximum number of instance records returned by the Catalog CLI.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'string', required: true, const: 'ok', description: 'Successful Catalog response status.' },
          message: { type: 'null', required: true, const: null, description: 'Null error message for a successful Catalog response.' },
          results: {
            type: 'array',
            required: true,
            description: 'Current approved ComfyUI instance IDs in Catalog CLI order.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true, description: 'Positive decimal ComfyUI instance identity.' },
              },
            },
          },
          page: { type: 'integer', required: true, const: CATALOG_COMFYUI_INSTANCE_QUERY.page, description: 'Catalog result page.' },
          page_size: { type: 'integer', required: true, const: CATALOG_COMFYUI_INSTANCE_QUERY.page_size, description: 'Catalog result page size.' },
          total_count: { type: 'integer', required: true, description: 'Total number of matching ComfyUI instances.' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: async (args, exec) => {
      const response = await catalog.queryComfyuiInstances(args, exec.signal)
      return {
        status: response.status,
        message: response.message,
        results: response.results.map(instance => ({ ...instance })),
        page: response.page,
        page_size: response.page_size,
        total_count: response.total_count,
      }
    },
  })
  return closedDefinition(definition)
}

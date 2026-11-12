import Schema from '@deepseek-ai/schemastery'
import { agentModelSchema } from './agent-model-schema.ts'
import type { AgentModel, TaskDraft } from './contract.ts'
import { PROMPT_REFERENCES, type PromptRequestInput, type PromptRequestParts } from './request-template.ts'
import { contractObject, requiredNullable } from '../shared/field-contract.ts'
import { jsonObjectSchema } from '../shared/json-contract.ts'

export interface PromptStartRequest {
  workspace_id: string
  work_id: string
  branch_id: string
  function_id: string
  request_id: string
  intent: 'generate' | 'rewrite'
  task_id?: string
  draft?: TaskDraft
  input: Omit<PromptRequestInput, 'base_model_name' | 'reference_context'>
}
export interface PromptLookupRequest { workspace_id: string; request_id: string }
export interface PromptListRequest { workspace_id: string; task_id: string }
export interface PromptAdoptRequest extends PromptLookupRequest { positive_prompt: string; negative_prompt: string }
export interface PromptReply { type: 'prompt'; positive_prompt: string; negative_prompt: string }
export interface PromptTurn {
  request_id: string
  task_id: string
  turn_index: number
  function_id: string
  kind: 'prompt'
  intent: 'generate' | 'rewrite'
  candidate: { positive_prompt: string; negative_prompt: string } | null
  session_id: string
  harness_turn: number | null
  preset_id: string
  agent_model: AgentModel
  input: PromptRequestInput
  request_template: string
  request_parts: PromptRequestParts
  request_text: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'interrupted'
  error: { code: string; message: string } | null
  artifact_id: string | null
  result: PromptReply | null
  adopted: { positive_prompt: string; negative_prompt: string } | null
  applied_at: number | null
  created_at: number
  finished_at: number | null
  start_seq: number
}

const text = () => Schema.string().required()
const id = () => Schema.string().min(1).pattern(/^\S+$/u).required()
const object = (fields: Record<string, Schema>) => contractObject(fields, { exact: true })
const json = () => jsonObjectSchema({ keySchema: text(), maxDepth: 100 }).required()
export const promptRequestPartsSchema = object({
  block_templates: object({ requirements_block: text(), prompt_edit_block: text(), references_block: text() }),
  reference_descriptions: object(Object.fromEntries(Object.entries(PROMPT_REFERENCES).map(([name, reference]) => [name, Schema.string().default(reference.description)]))),
})
const inputFields = { original_request: text(), base_model_id: text(), positive_prompt: text(), negative_prompt: text(), change_request: text() }
export const promptStartFields = { workspace_id: id(), work_id: id(), branch_id: id(), function_id: id(), request_id: id(), intent: Schema.union(['generate', 'rewrite']).required(), task_id: id().required(false), input: object(inputFields) }
export const promptLookupSchema = object({ workspace_id: id(), request_id: id() })
export const promptListSchema = object({ workspace_id: id(), task_id: id() })
export const promptAdoptSchema = object({ workspace_id: id(), request_id: id(), positive_prompt: text(), negative_prompt: text() })
const reply = object({ type: Schema.const('prompt').required(), positive_prompt: text(), negative_prompt: text() })
export const promptRequestInputSchema = object({ ...inputFields, base_model_name: text(), reference_context: json() })
export const promptTurnSchema = object({
  request_id: id(), task_id: id(), turn_index: Schema.natural().required(), function_id: id(), kind: Schema.const('prompt').required(), intent: Schema.union(['generate', 'rewrite']).required(), candidate: requiredNullable(object({ positive_prompt: text(), negative_prompt: text() })),
  session_id: text(), harness_turn: requiredNullable(Schema.natural().required()), preset_id: text(),
  agent_model: agentModelSchema,
  input: promptRequestInputSchema, request_template: text(), request_parts: promptRequestPartsSchema,
  request_text: text(), status: Schema.union(['queued', 'running', 'succeeded', 'failed', 'interrupted']).required(),
  error: requiredNullable(object({ code: text(), message: text() })), artifact_id: requiredNullable(text()), result: requiredNullable(reply),
  adopted: requiredNullable(object({ positive_prompt: text(), negative_prompt: text() })), applied_at: requiredNullable(Schema.number().required()),
  created_at: Schema.number().required(), finished_at: requiredNullable(Schema.number().required()), start_seq: Schema.number().required(),
})

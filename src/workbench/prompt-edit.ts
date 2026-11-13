import type { ContractValue } from '#contracts'
import type { TaskDraft } from './contract.ts'
import { type PromptRequestInput } from './request-template.ts'

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
export type PromptLookupRequest = ContractValue<'promptLookup'>
export type PromptListRequest = ContractValue<'promptList'>
export type PromptAdoptRequest = ContractValue<'promptAdopt'>
export interface PromptReply { type: 'prompt'; positive_prompt: string; negative_prompt: string }
export type PromptTurn = ContractValue<'promptTurn'>

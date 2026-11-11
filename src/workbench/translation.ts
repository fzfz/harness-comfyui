import Schema from '@deepseek-ai/schemastery'
import { contractObject } from '../shared/field-contract.ts'

export const translationResultSchema = Schema.union([
  contractObject({ request_id: Schema.string().min(1).required(), status: Schema.const('running').required() }, { exact: true }),
  contractObject({ request_id: Schema.string().min(1).required(), status: Schema.const('succeeded').required(), text: Schema.string().min(1).required() }, { exact: true }),
  contractObject({ request_id: Schema.string().min(1).required(), status: Schema.const('failed').required(), error: Schema.string().min(1).required() }, { exact: true }),
]).required()

export interface TranslationRequest { request_id: string; workspace_id: string; work_id: string; branch_id: string; field: 'positive_prompt' | 'negative_prompt'; source_text: string }
export interface TranslationRecord extends TranslationRequest, TranslationResult {
  session_id: string
  harness_turn: number | null
  start_seq: number
  created_at: number
  finished_at: number | null
}
export interface TranslationResult { request_id: string; status: 'running' | 'succeeded' | 'failed'; text?: string; error?: string }

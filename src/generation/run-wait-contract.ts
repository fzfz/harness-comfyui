import Schema from '@deepseek-ai/schemastery'
import { MAX_RUN_INPUT_QUERY_IDS } from './run-input-contract.ts'
import { GENERATION_RUN_TERMINAL_STATUSES } from './run-status.ts'

const runId = Schema.string().min(1).required()
export const generationRunWaitReceiptSchema = Schema.object({
  job_id: Schema.string().min(1).required(),
  run_ids: Schema.array(runId).min(1).max(MAX_RUN_INPUT_QUERY_IDS).required(),
}).required()

export const generationRunWaitSummarySchema = Schema.object({
  runs: Schema.array(Schema.object({
    run_id: runId,
    status: Schema.union(GENERATION_RUN_TERMINAL_STATUSES.map(status => Schema.const(status))).required(),
  }).required()).min(1).max(MAX_RUN_INPUT_QUERY_IDS).required(),
}).required()

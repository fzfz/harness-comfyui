import Schema from '@deepseek-ai/schemastery'
import { generationRunWaitReceiptSchema, generationRunWaitSummarySchema } from '../generation/run-wait-contract.ts'
import { workflowRuntimeParameterInspectionSchema } from '../generation/inspection-contract.ts'
import { generationRunInputResultSchema } from '../generation/run-input-contract.ts'
import { generationSubmissionResultSchema, RANDOM_SEED_MAX_EXCLUSIVE } from '../generation/submission-contract.ts'
import { generationRunMediaResultSchema } from '../image-reader/run-media-contract.ts'

const submissionItem = generationSubmissionResultSchema.dict!.items!.inner!.dict!
export const cliResultSchemas = {
  'generation submit': Schema.object({ items: Schema.array(Schema.object({
    request_id: submissionItem.requestId!, run_id: submissionItem.runId!, acceptance: submissionItem.acceptance!,
  }).required()).required() }).required(),
  'generation inspect-template-parameters': workflowRuntimeParameterInspectionSchema,
  'generation random-seeds': Schema.object({ seeds: Schema.array(Schema.natural().max(RANDOM_SEED_MAX_EXCLUSIVE - 1).required()).required() }).required(),
  'generation run-inputs': generationRunInputResultSchema,
  'generation wait': generationRunWaitReceiptSchema,
  'generation resolve-media': generationRunMediaResultSchema,
  'image inspect': Schema.object({ provider: Schema.string().required(), model: Schema.string().required(), file_path: Schema.string().required(), observation: Schema.string().required() }).required(),
} as const

export const cliJobResultSchemas = {
  'generation wait': generationRunWaitSummarySchema,
} as const

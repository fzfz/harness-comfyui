import Schema from '@deepseek-ai/schemastery'
import { cliParameterFiles, cliParameterFileKeySchema, registerCliRequestId } from './submission-fields.ts'
import type { CliGenerationModel, CliGenerationLora, CliGenerationRequest, CliGenerationManifestItem } from './contract.ts'
import { CATALOG_STABLE_ID_PATTERN } from '../catalog/contract.ts'
import { imageReaderPromptSchema } from '../image-reader/prompt-contract.ts'
import { loraWeightSchema, loraTriggerWordsAreUnique, LORA_TRIGGER_WORDS_ROLE, LORA_TRIGGER_WORDS_MAX_COUNT } from '../generation/lora-contract.ts'
import { contractObject, requiredNullable } from '../shared/field-contract.ts'
import { jsonObjectSchema } from '../shared/json-contract.ts'
import { MAX_RUN_INPUT_QUERY_IDS } from '../generation/run-input-contract.ts'
import { GENERATION_REQUEST_ID } from '../generation/submission-contract.ts'
import { GENERATION_MAX_SUBMISSION_ITEMS } from './limits.ts'

function cliInputObject<const Fields extends Record<string, Schema>>(fields: Fields) {
  return contractObject(fields, { exact: true })
}

export const cliTextSchema = Schema.string().min(1).max(500).pattern(/^[^\u0000-\u001f\u007f-\u009f]*$/u).required()
export const cliFilePathSchema = Schema(cliTextSchema).max(10_000)
export const cliStableIdSchema = Schema.string().pattern(CATALOG_STABLE_ID_PATTERN).required()
export const cliInspectionIdSchema = Schema(cliTextSchema).pattern(/^(?!\s*$)[^\u0000-\u001f\u007f-\u009f]*$/u)
export const cliRunIdsSchema = Schema.array(Schema.string().required()).min(1).max(MAX_RUN_INPUT_QUERY_IDS).required()
export const cliSeedCountSchema = Schema.natural().min(1).max(20).required()
export const CLI_JSON_MAX_DEPTH = 64
export const CLI_JSON_CONTRACT = Object.freeze({ maxDepth: CLI_JSON_MAX_DEPTH, keySchema: cliTextSchema })
export const cliParametersSchema = jsonObjectSchema(CLI_JSON_CONTRACT)
export const cliModelSchema = cliInputObject({ id: cliStableIdSchema, file_name: cliTextSchema }).required() satisfies Schema<any, CliGenerationModel>
export const cliLoraTriggerWordsSchema = Schema.transform(Schema.array(cliTextSchema).max(LORA_TRIGGER_WORDS_MAX_COUNT).required(), words => {
  if (!loraTriggerWordsAreUnique(words)) throw new TypeError('LoRA trigger_words contains duplicates')
  return words
}, true).required().role(LORA_TRIGGER_WORDS_ROLE)
export const cliLoraSchema = cliInputObject({
  id: cliStableIdSchema,
  file_name: cliTextSchema,
  weight: loraWeightSchema,
  trigger_words: cliLoraTriggerWordsSchema,
}).required() satisfies Schema<any, CliGenerationLora>
export const cliGenerationRequestSchema = cliInputObject({
  title: cliTextSchema,
  instance_id: cliStableIdSchema,
  template_id: cliStableIdSchema,
  model: requiredNullable(cliModelSchema),
  parameters: cliParametersSchema,
  loras: Schema.array(cliLoraSchema).max(100).required(),
}).required() satisfies Schema<any, CliGenerationRequest>
export const cliSubmissionItemSchema = cliInputObject({
  request_id: Schema.string().pattern(GENERATION_REQUEST_ID).required(),
  request: cliGenerationRequestSchema,
}).required()
const cliManifestItemFields = cliInputObject({
  ...cliSubmissionItemSchema.dict,
  parameter_files: Schema.dict(cliFilePathSchema, cliParameterFileKeySchema).default(undefined as never),
}).required()
export const cliManifestItemSchema = Schema.transform(cliManifestItemFields, value => {
  const item = value as CliGenerationManifestItem
  if (Object.hasOwn(item, 'parameter_files')) cliParameterFiles(item.parameter_files, item.request.parameters, 'Generation item')
  return item
}, true).required()
export const cliSubmissionItemsSchema = Schema.transform(Schema.array(cliManifestItemSchema).min(1).max(GENERATION_MAX_SUBMISSION_ITEMS).required(), value => {
  const items = value as readonly CliGenerationManifestItem[]
  const requestIds = new Set<string>()
  items.forEach((item, index) => registerCliRequestId(requestIds, item.request_id, `Generation items[${index}]`))
  return items
}, true).required()
export const cliInputSchemas = {
  'generation submit': cliInputObject({ items: cliSubmissionItemsSchema }).required(),
  'generation inspect-template-parameters': cliInputObject({ template_id: cliInspectionIdSchema, instance_id: cliInspectionIdSchema }).required(),
  'generation random-seeds': cliInputObject({ count: cliSeedCountSchema }).required(),
  'generation run-inputs': cliInputObject({ run_ids: cliRunIdsSchema }).required(),
  'generation wait': cliInputObject({ run_ids: cliRunIdsSchema }).required(),
  'generation resolve-media': cliInputObject({ run_ids: cliRunIdsSchema, include_parameters: Schema.boolean().default(false) }).required(),
  'image inspect': cliInputObject({ file_path: cliFilePathSchema, prompt: imageReaderPromptSchema }).required(),
} as const

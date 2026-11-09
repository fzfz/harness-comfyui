import Schema from '@deepseek-ai/schemastery'
import { TASK_KINDS } from './functions.ts'
import { CATALOG_KIND_DEFINITIONS } from '../catalog/contract.ts'
import { contractObject, requiredNullable } from '../shared/field-contract.ts'
import { jsonValueSchema } from '../shared/json-contract.ts'
import { WORKBENCH_BRANCH_NAME_MAX_LENGTH, WORKBENCH_FAVORITE_TARGET_TYPES, isBranchNonGenerationTaskKind, type ArtifactType } from './contract.ts'

import { STANDARD_RUNTIME_PARAMETER_KINDS, workflowRuntimeParameterInspectionSchema } from '../generation/inspection-contract.ts'
const text = () => Schema.string().required()
const id = () => Schema.string().pattern(/^[1-9]\d*$/).required()
const nonempty = () => Schema.string().min(1).required()
const strings = () => Schema.array(text()).required()
const object = (fields: Record<string, Schema>) => contractObject(fields, { exact: true })
const json = () => jsonValueSchema({ keySchema: text(), maxDepth: 100 }).required()
const jsonObject = () => Schema.dict(json()).required()
export const functionBindingEditableSchema = object({
  name: text(), kind: Schema.union([...TASK_KINDS]).required(), preset_id: text(),
  agent_model: object({ provider: text(), model: text(), reasoningEffort: Schema.string().default(undefined as never) }),
  requested_skill: requiredNullable(text()), request_template: text(),
})
export const taskRequestResourcesSchema = object({
  instance_id: Schema.union([id(), Schema.const(null)]).required(false).default(undefined as never),
  template_id: Schema.union([id(), Schema.const(null)]).required(false).default(undefined as never),
})
export const taskRequestDraftSchema = object({ instructions: text(), resources: taskRequestResourcesSchema.required() })
export const reviewDraftSchema = object({
  verdict: Schema.union(['unrated', 'met', 'needs-work']).required(),
  observation: text(), conclusion: text(), title: text(), conditions: text(), note: text(),
  evidence_run_ids: strings().min(1),
  review_artifact_id: requiredNullable(nonempty()), experience_artifact_id: requiredNullable(nonempty()), experience_id: requiredNullable(nonempty()),
})
export const reviewDraftUpdateSchema = object({ expected: reviewDraftSchema.required(), draft: reviewDraftSchema.required() })
export const contextRefSchema = object({ kind: Schema.union(['work', 'character', 'style', 'prompt-term', 'artist-string']).required(), id: id() })
export const resourceRefSchema = object({ kind: Schema.union(CATALOG_KIND_DEFINITIONS.map(definition => definition.kind)).required(), id: id() })
export const generationInputSchema = object({
  title: text(), instance_id: requiredNullable(id()), template_id: requiredNullable(id()),
  model: requiredNullable(object({ id: id(), file_name: nonempty() })), parameters: jsonObject(),
  loras: Schema.array(object({ id: id(), file_name: nonempty(), weight: Schema.number().required(), trigger_words: strings() })).required(),
})
const candidateSchema = object({ generation_input: generationInputSchema, context_refs: Schema.array(contextRefSchema).required() })
const promptInputFields = { positive_prompt: requiredNullable(text()), negative_prompt: requiredNullable(text()) }
export const promptInputSchema = object(promptInputFields)
const taskDraftFields = { prompt_input: promptInputSchema, generation_input: generationInputSchema, context_refs: Schema.array(contextRefSchema).required(), base_model_id: requiredNullable(id()) }
export const favoriteUpdateSchema = object({ targetType: Schema.union([...WORKBENCH_FAVORITE_TARGET_TYPES]).required(), favorite: Schema.boolean().required() })
export const experienceReuseInputSchema = object({ name: Schema.string().min(1).max(WORKBENCH_BRANCH_NAME_MAX_LENGTH).pattern(/\S/u).required(), baseModelId: requiredNullable(id()) })
export const taskDraftSchema = object({ ...taskDraftFields, parameter_mapping: requiredNullable(Schema.dict(Schema.union([...STANDARD_RUNTIME_PARAMETER_KINDS]).required()).required()) })
export const artifactSchemas = {
  prompt: object({ type: Schema.const('prompt').required(), ...promptInputFields, source_files: Schema.array(text()).default(undefined as never) }),
  parameters: object({ type: Schema.const('parameters').required(), parameters: jsonObject(), source_files: Schema.array(text()).default(undefined as never) }),
  generation_input: object({ type: Schema.const('generation_input').required(), generation_input: generationInputSchema, context_refs: Schema.array(contextRefSchema).required(), source_files: Schema.array(text()).default(undefined as never) }),
  resources: object({ type: Schema.const('resources').required(), refs: Schema.array(resourceRefSchema).required(), reason: Schema.string(), source_files: Schema.array(text()).default(undefined as never) }),
  review: object({ type: Schema.const('review').required(), observation: text(), conclusion: text(), run_ids: strings(), candidate: candidateSchema.required(false).default(undefined as never), source_files: Schema.array(text()).default(undefined as never) }),
  experience: object({ type: Schema.const('experience').required(), title: nonempty(), conditions: nonempty(), note: nonempty(), base_model_id: requiredNullable(id()), model_id: requiredNullable(id()), run_ids: strings(), source_files: Schema.array(text()).default(undefined as never) }),
  question: object({ type: Schema.const('question').required(), question: nonempty(), options: Schema.array(text()).default([]), source_files: Schema.array(text()).default(undefined as never) }),
} satisfies Record<ArtifactType, Schema>
export const taskArtifactSchema = Schema.union(Object.values(artifactSchemas)).required()
export const taskGetRequestSchema = object({ task_id: nonempty() })
export const taskPublishRequestSchema = object({ task_id: nonempty(), artifact: taskArtifactSchema })
export const taskPublishReceiptSchema = object({ task_id: nonempty(), artifact_id: nonempty(), disposition: Schema.union(['applied', 'candidate', 'recorded', 'waiting_input']).required() })
export const experimentEndRequestSchema = object({ task_id: nonempty(), reason: Schema.union(['goal_met', 'user_ended']).required() })
export const workbenchRunInputSchema = object({
  run_id: nonempty(), branch_id: nonempty(), generation_input: generationInputSchema.required(),
  context_refs: Schema.array(contextRefSchema).required(), input_description: requiredNullable(workflowRuntimeParameterInspectionSchema),
  prompt_input: promptInputSchema,
})
const taskGetResultFields = {
  task_id: nonempty(), status: text(),
  ...taskDraftFields,
  requirements: object({ original_request: text(), instructions: text() }), reference_run_ids: strings(),
  evaluation_input: object({ run_id: nonempty(), verdict: text(), observation: text(), conclusion: text(), experience: object({ title: text(), conditions: text(), note: text() }) }).required(false).default(undefined as never),
  requested_skill: requiredNullable(text()), max_runs: Schema.natural().required(),
  output_contract: object({ artifact_types: strings(), required_artifact_types: strings(), parameter_ids: strings(), apply_mode: text(), requires_finished_runs: Schema.boolean().required() }),
  artifacts: Schema.array(object({ artifact_id: nonempty(), artifact: taskArtifactSchema, disposition: text() })).required(),
  iterations: Schema.array(object({ index: Schema.natural().required(), run_id: nonempty(), generation_input: generationInputSchema, context_refs: Schema.array(contextRefSchema).required(), review_artifact_id: requiredNullable(text()) })).required(),
  answers: Schema.array(object({ question_artifact_id: nonempty(), answer: text() })).required(),
}
export const taskGetResultSchema = Schema.union(TASK_KINDS.map(kind => object({ ...taskGetResultFields, kind: Schema.const(kind).required(), ...(isBranchNonGenerationTaskKind(kind) ? { unresolved_parameters: jsonObject() } : {}) }))).required()

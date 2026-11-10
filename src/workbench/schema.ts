import Schema from '@deepseek-ai/schemastery'
import { TASK_KINDS } from './functions.ts'
import { contractFields, contractObject, requiredNullable } from '../shared/field-contract.ts'
import { GENERATION_RUN_STATUSES } from '../generation/run-status.ts'
import { jsonObjectSchema } from '../shared/json-contract.ts'
import { WORKBENCH_BRANCH_NAME_MAX_LENGTH, WORKBENCH_FAVORITE_TARGET_TYPES, WORKBENCH_RESOURCE_KINDS, isBranchNonGenerationTaskKind, type ArtifactType, type ImageRef, type WorkflowImageBinding, type Experiment, type ImageSource, type ImageUpload, type WorkbenchRecord } from './contract.ts'

import { agentModelSchema } from './agent-model-schema.ts'
export { agentModelSchema } from './agent-model-schema.ts'
import { promptRequestPartsSchema } from './prompt-edit.ts'
import { STANDARD_RUNTIME_PARAMETER_KINDS, workflowRuntimeParameterInspectionSchema } from '../generation/inspection-contract.ts'
const text = () => Schema.string().required()
const id = () => Schema.string().pattern(/^[1-9]\d*$/).required()
const nonempty = () => Schema.string().min(1).required()
const strings = () => Schema.array(text()).required()
const object = (fields: Record<string, Schema>) => contractObject(fields, { exact: true })
const jsonObject = () => jsonObjectSchema({ keySchema: text(), maxDepth: 100 }).required()
export const functionBindingEditableSchema = object({
  name: text(), kind: Schema.union([...TASK_KINDS, 'translate']).required(), preset_id: text(),
  agent_model: agentModelSchema,
  requested_skill: requiredNullable(text()), request_template: text(), request_parts: promptRequestPartsSchema.required(false).default(undefined as never),
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
export const resourceRefSchema = object({ kind: Schema.union([...WORKBENCH_RESOURCE_KINDS]).required(), id: id() })
export const imageRefSchema = object({ image_ref_id: nonempty(), source: Schema.union([object({ kind: Schema.const('run_media').required(), run_id: nonempty(), media_id: nonempty() }), object({ kind: Schema.const('uploaded_file').required(), file_id: nonempty() })]).required(), purpose: Schema.union(['workflow', 'agent', 'both']).required(), reference_requirement: text() }) as Schema<any, ImageRef>
export const imageSourceSchema = object({ image_ref_id: nonempty(), file_path: requiredNullable(nonempty()), name: text(), url: requiredNullable(text()), error: Schema.string().default(undefined as never) }) as Schema<any, ImageSource>
export const workflowImageBindingSchema = object({ parameter_id: nonempty(), image_ref_ids: Schema.array(nonempty()).min(1).required() }) as Schema<any, WorkflowImageBinding>
export const experienceProvenanceSchema = object({ created_by_task_id: requiredNullable(nonempty()), evidence: Schema.array(object({ run_id: nonempty(), generation_task_id: requiredNullable(nonempty()), role: Schema.union(['supporting_evidence', 'counterexample']).required() })).required() })
export const referenceExperienceSchema = object({ experience_id: nonempty(), title: text(), conditions: text(), note: text(), provenance: experienceProvenanceSchema.required() })
export const inputReferenceFields = { reference_task_ids: Schema.array(nonempty()).default([]), reference_run_ids: Schema.array(nonempty()).default([]), reference_experiences: Schema.array(referenceExperienceSchema).default([]), image_refs: Schema.array(imageRefSchema).default([]), workflow_image_bindings: Schema.array(workflowImageBindingSchema).default([]) }
export const inputReferencesSchema = object(inputReferenceFields)
const generationInputFields = {
  title: text(), instance_id: requiredNullable(id()), template_id: requiredNullable(id()),
  model: requiredNullable(object({ id: id(), file_name: nonempty() })), parameters: jsonObject(),
  loras: Schema.array(object({ id: id(), file_name: nonempty(), weight: Schema.number().required(), trigger_words: strings() })).required(),
}
export const generationInputBaseSchema = object(generationInputFields)
export const generationInputSchema = object({ ...generationInputFields,
  image_refs: Schema.array(imageRefSchema).default(undefined as never), workflow_image_bindings: Schema.array(workflowImageBindingSchema).default(undefined as never),
})
const candidateSchema = object({ generation_input: generationInputBaseSchema, image_refs: Schema.array(imageRefSchema).default([]), workflow_image_bindings: Schema.array(workflowImageBindingSchema).default([]) })
const promptInputFields = { positive_prompt: requiredNullable(text()), negative_prompt: requiredNullable(text()) }
export const promptInputSchema = object(promptInputFields)
const taskDraftFields = { prompt_edit_task_id: Schema.union([text(), Schema.const(null)]).default(undefined as never), prompt_change_request: Schema.string().default(undefined as never), prompt_input: promptInputSchema, generation_input: generationInputBaseSchema, ...inputReferenceFields, instructions: Schema.string().default(''), base_model_id: requiredNullable(id()) }
export const favoriteUpdateSchema = object({ targetType: Schema.union([...WORKBENCH_FAVORITE_TARGET_TYPES]).required(), favorite: Schema.boolean().required() })
export const experienceReuseInputSchema = object({ name: Schema.string().min(1).max(WORKBENCH_BRANCH_NAME_MAX_LENGTH).pattern(/\S/u).required(), baseModelId: requiredNullable(id()) })
export const taskDraftSchema = object({ ...taskDraftFields, parameter_mapping: requiredNullable(Schema.dict(Schema.union([...STANDARD_RUNTIME_PARAMETER_KINDS]).required()).required()) })

export const artifactSchemas = {
  prompt: object({ type: Schema.const('prompt').required(), ...promptInputFields, source_files: Schema.array(text()).default(undefined as never) }),
  parameters: object({ type: Schema.const('parameters').required(), parameters: jsonObject(), source_files: Schema.array(text()).default(undefined as never) }),
  generation_input: object({ type: Schema.const('generation_input').required(), generation_input: generationInputBaseSchema, image_refs: Schema.array(imageRefSchema).default([]), workflow_image_bindings: Schema.array(workflowImageBindingSchema).default([]), plan_artifact_id: Schema.union([text(), Schema.const(null)]).required(false).default(undefined as never), source_files: Schema.array(text()).default(undefined as never) }),
  iteration_plan: object({ type: Schema.const('iteration_plan').required(), source_run_id: nonempty(), changes: Schema.array(nonempty()).min(1).required(), reason: nonempty(), expected_result: nonempty(), source_files: Schema.array(text()).default(undefined as never) }),
  resources: object({ type: Schema.const('resources').required(), refs: Schema.array(resourceRefSchema).required(), reason: Schema.string(), source_files: Schema.array(text()).default(undefined as never) }),
  review: object({ type: Schema.const('review').required(), observation: text(), conclusion: text(), run_ids: strings(), candidate: candidateSchema.required(false).default(undefined as never), source_files: Schema.array(text()).default(undefined as never) }),
  experience: object({ type: Schema.const('experience').required(), title: nonempty(), conditions: nonempty(), note: nonempty(), base_model_id: requiredNullable(id()), model_id: requiredNullable(id()), run_ids: strings(), source_files: Schema.array(text()).default(undefined as never) }),
  question: object({ type: Schema.const('question').required(), question: nonempty(), options: Schema.array(text()).default([]), source_files: Schema.array(text()).default(undefined as never) }),
} satisfies Record<ArtifactType, Schema>
export const taskArtifactSchema = Schema.union(Object.values(artifactSchemas)).required()
export const outputContractSchema = object({ artifact_types: strings(), required_artifact_types: strings(), parameter_ids: strings(), apply_mode: Schema.union(['automatic', 'candidate', 'record']).required(), requires_finished_runs: Schema.boolean().required() })
const taskSnapshotDraftFields = Object.fromEntries(Object.entries(taskDraftFields).filter(([key]) => key !== 'instructions'))
export const experimentInputSourceSchema = Schema.union([
  object({ type: Schema.const('initial').required() }),
  object({ type: Schema.const('candidate').required(), artifact_id: nonempty() }),
  object({ type: Schema.const('run').required(), run_id: nonempty() }),
]).required()
export const taskInputSchema = object({ delegation_source: experimentInputSourceSchema.required(false).default(undefined as never), ...taskSnapshotDraftFields, parameter_mapping: contractFields(taskDraftSchema)!.parameter_mapping!, requirements: object({ original_request: text(), instructions: text() }), reference_task_artifacts: Schema.array(object({ task_id: nonempty(), artifact_id: nonempty(), artifact: taskArtifactSchema })).default([]), evaluation_input: object({ run_id: nonempty(), verdict: Schema.union(['unrated', 'met', 'needs-work']).required(), observation: text(), conclusion: text(), experience: object({ title: text(), conditions: text(), note: text() }) }).required(false).default(undefined as never), requested_skill: requiredNullable(text()), max_runs: Schema.natural().required() })
const errorSchema = object({ code: text(), message: text() })
export const taskSchema = object({
  task_id: nonempty(), parent_experiment_task_id: requiredNullable(text()), branch_id: nonempty(), function_id: nonempty(), title: text(), kind: Schema.union([...TASK_KINDS]).required(), status: Schema.union(['pending', 'running', 'waiting_input', 'waiting_generation', 'needs_attention', 'paused', 'interrupted', 'succeeded', 'failed']).required(), input: taskInputSchema.required(), output_contract: outputContractSchema.required(),
  apply_target: object({ kind: Schema.union(['branch', 'run_review']).required(), id: nonempty(), expected: jsonObject() }), binding_snapshot: object({ function_id: nonempty(), name: text(), kind: Schema.union([...TASK_KINDS, 'translate', 'rewrite']).required(), preset_id: text(), agentModel: agentModelSchema, requested_skill: requiredNullable(text()), request_template: text(), request_parts: promptRequestPartsSchema.required(false).default(undefined as never) }),
  session_id: requiredNullable(text()), request_text: text(), selected_model: requiredNullable(jsonObject()), answers: Schema.array(object({ question_artifact_id: nonempty(), answer: text() })).required(), error: requiredNullable(errorSchema), created_at: Schema.number().required(), updated_at: Schema.number().required(), execution_state: Schema.union(['pending', 'running', 'idle', 'interrupted', 'failed']).required(), initiator: Schema.union(['human', 'agent']).required(), retry_of_run_id: requiredNullable(text()),
})
export const taskChildSummarySchema = object({
  ...Object.fromEntries(['task_id', 'function_id', 'kind', 'title', 'status', 'session_id', 'execution_state', 'error'].map(key => [key, contractFields(taskSchema)![key]!])),
  preset_id: text(), agent_model: agentModelSchema,
})
export const storedArtifactSchema = object({ artifact_id: nonempty(), task_id: nonempty(), type: Schema.union(Object.keys(artifactSchemas)).required(), artifact: taskArtifactSchema, source_files: strings(), session_id: text(), turn: Schema.natural().required(), call_id: text(), skill_refs: Schema.array(object({ name: text(), session_id: text(), turn: Schema.natural().required(), call_id: text(), source_file: requiredNullable(text()) })).required(), disposition: Schema.union(['applied', 'candidate', 'recorded', 'waiting_input']).required(), applied_target: requiredNullable(object({ kind: text(), id: text(), fields: strings() })), created_at: Schema.number().required() })
export const experienceSchema = object({ experience_id: nonempty(), work_id: requiredNullable(text()), branch_id: requiredNullable(text()), task_id: requiredNullable(text()), title: text(), conditions: text(), note: text(), base_model_id: requiredNullable(id()), model_id: requiredNullable(id()), evidence_run_ids: strings(), source_run_id: requiredNullable(text()), source_experience_id: requiredNullable(text()), source_artifact_id: requiredNullable(text()), provenance: experienceProvenanceSchema })
export const workbenchRunMediaSchema = object({ media_id: nonempty(), run_id: nonempty(), filename: text(), media_type: text(), media_kind: text(), byte_size: Schema.natural().required(), url: Schema.string().default(undefined as never), download_url: Schema.string().default(undefined as never) })
export const workbenchRunSchema = object({ session_id: text(), created_at: Schema.number().required(), updated_at: Schema.number().required(), media: Schema.array(workbenchRunMediaSchema).required(), run_id: nonempty(), workbench_task_id: text(), execution_task_id: requiredNullable(text()), iteration_index: requiredNullable(Schema.natural().required()), status: Schema.union([...GENERATION_RUN_STATUSES]).required(), title: text(), generation_input: generationInputSchema.required(), candidate_artifact_id: requiredNullable(text()), review_artifact_id: requiredNullable(text()), retry_of_run_id: requiredNullable(text()), initiator: Schema.union(['human', 'agent']).required(), review: requiredNullable(object({ verdict: Schema.union(['unrated', 'met', 'needs-work']).required(), observation: text(), conclusion: text(), source_artifact_id: requiredNullable(text()) })), review_draft: requiredNullable(reviewDraftSchema), error: requiredNullable(errorSchema) })
const recordFields = { id: nonempty(), workspace_id: requiredNullable(text()), work_id: requiredNullable(text()), branch_id: requiredNullable(text()), task_id: requiredNullable(text()), title: text(), base_model_id: Schema.union([text(), Schema.const(null)]).default(null) }
export const workbenchRecordSchema = Schema.union([
  object({ ...recordFields, type: Schema.const('task').required(), task: taskSchema.required(), artifacts: Schema.array(storedArtifactSchema).required(), runs: Schema.array(workbenchRunSchema).required() }),
  object({ ...recordFields, type: Schema.const('run').required(), run: workbenchRunSchema.required() }),
  object({ ...recordFields, type: Schema.const('experience').required(), experience: experienceSchema.required() }),
]).required() as Schema<any, WorkbenchRecord>
export const taskGetRequestSchema = object({ task_id: nonempty() })
export const taskPublishRequestSchema = object({ task_id: nonempty(), artifact: taskArtifactSchema })
export const taskPublishReceiptSchema = object({ task_id: nonempty(), artifact_id: nonempty(), disposition: Schema.union(['applied', 'candidate', 'recorded', 'waiting_input']).required() })
export const experimentSchema = object({ task_id: nonempty(), control_state: Schema.union(['running', 'paused', 'ended', 'completed']).required(), end_reason: requiredNullable(Schema.union(['goal_met', 'budget_used', 'user_ended']).required()), submitted_count: Schema.natural().required(), max_runs: Schema.natural().required() }) as Schema<any, Experiment>
export const experimentEndRequestSchema = object({ task_id: nonempty(), reason: Schema.union(['goal_met', 'user_ended']).required() })
export const imageUploadSchema = object({ image_ref_id: nonempty(), parameter_id: nonempty(), instance_id: nonempty(), name: text(), subfolder: text(), type: Schema.const('input').required() }) as Schema<any, ImageUpload>
export const workbenchRunInputSchema = object({
  submitted_input: generationInputSchema.required(), effective_input: requiredNullable(generationInputSchema), image_uploads: Schema.array(imageUploadSchema).default([]),
  parameter_mapping: requiredNullable(Schema.dict(Schema.union([...STANDARD_RUNTIME_PARAMETER_KINDS]).required()).required()), base_model_id: requiredNullable(id()),
  run_id: nonempty(), branch_id: nonempty(), generation_input: generationInputSchema.required(),
  image_refs: Schema.array(imageRefSchema).default([]), workflow_image_bindings: Schema.array(workflowImageBindingSchema).default([]), input_description: requiredNullable(workflowRuntimeParameterInspectionSchema),
  prompt_input: promptInputSchema,
})
const taskGetResultFields = {
  task_id: nonempty(), parent_experiment_task_id: requiredNullable(text()), children: Schema.array(taskChildSummarySchema).required(), status: text(), image_sources: Schema.array(imageSourceSchema).default([]),
  ...taskSnapshotDraftFields,
  delegation_source: experimentInputSourceSchema.required(false).default(undefined as never),
  requirements: object({ original_request: text(), instructions: text() }), reference_task_artifacts: Schema.array(object({ task_id: nonempty(), artifact_id: nonempty(), artifact: taskArtifactSchema })).default([]),
  evaluation_input: object({ run_id: nonempty(), verdict: text(), observation: text(), conclusion: text(), experience: object({ title: text(), conditions: text(), note: text() }) }).required(false).default(undefined as never),
  requested_skill: requiredNullable(text()), max_runs: Schema.natural().required(),
  output_contract: outputContractSchema,
  artifacts: Schema.array(object({ task_id: nonempty(), artifact_id: nonempty(), artifact: taskArtifactSchema, disposition: text() })).required(),
  iterations: Schema.array(object({ index: Schema.natural().required(), run_id: nonempty(), execution_task_id: requiredNullable(text()), generation_input: generationInputSchema, image_refs: Schema.array(imageRefSchema).default([]), workflow_image_bindings: Schema.array(workflowImageBindingSchema).default([]), review_artifact_id: requiredNullable(text()) })).required(),
  answers: Schema.array(object({ question_artifact_id: nonempty(), answer: text() })).required(),
}
export const taskGetResultSchema = Schema.union(TASK_KINDS.map(kind => object({ ...taskGetResultFields, kind: Schema.const(kind).required(), ...(isBranchNonGenerationTaskKind(kind) ? { unresolved_parameters: jsonObject() } : {}) }))).required()

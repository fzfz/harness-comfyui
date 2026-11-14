import { refineInputReferences, refineTaskDraft, refineGenerationInput, refineGenerationInputReady, refineTaskInputForKind, refineArtifact, refineFunctionBinding, refinePromptResourceRefs, refineRemoteAction, refineTask, refineTaskResult } from './workbench-refinements.ts';
import { remapGeneration } from './runtime-adapter.ts';
import roleConfiguration from '../../../config/workbench-agent-roles.json' with { type: 'json' };
import { normalizeCliRequest, parseCliArguments } from './cli-adapter.ts';
import Schema from '@deepseek-ai/schemastery';
import { contractObject, contractFields, refined, projected, dictionary, resolveValue, resolveContext, requiredNullable, optional, defaulted, transform, clone, type ObjectValue, jsonObjectSchema, jsonValueSchema, jsonArraySchema, type JsonValue } from './structure.ts';
import type { TaskKind, BranchNonGenerationTaskKind } from '../../workbench/contract.ts';
import { TASK_KINDS } from '../../workbench/functions.ts';
import { GENERATION_RUN_STATUSES, GENERATION_RUN_TERMINAL_STATUSES } from '../../generation/run-status.ts';
import { WORKBENCH_BRANCH_NAME_MAX_LENGTH, WORKBENCH_FAVORITE_TARGET_TYPES, WORKBENCH_RESOURCE_KINDS, isBranchNonGenerationTaskKind } from '../../workbench/contract.ts';
import { PROMPT_RESOURCE_KINDS } from '../../workbench/resources.ts';
import { CATALOG_KIND_DEFINITIONS, CATALOG_STABLE_ID_PATTERN } from '../../catalog/definitions.ts';
import { CATALOG_PRESENTATION } from '../../catalog/presentation-schema.ts';
import templateConfiguration from '../../workbench/request-template.json' with { type: 'json' };
import { requestTemplateProblem, requestTemplateVariables, type TemplateBlockName } from './template-rules.ts';
import { STANDARD_RUNTIME_PARAMETER_KINDS, WORKFLOW_RUNTIME_PARAMETER_VALUE_TYPES } from '../../generation/inspection-contract.ts';
import { MAX_RUN_INPUT_QUERY_IDS } from '../../generation/run-input-contract.ts';
import { GENERATION_REQUEST_ID, RANDOM_SEED_MAX_EXCLUSIVE, GENERATION_ACCEPTANCE_STATUSES } from '../../generation/submission-contract.ts';
import { IMAGE_READER_PROMPT_MAX_LENGTH } from '../../image-reader/prompt-contract.ts';
import { GENERATION_MAX_SUBMISSION_ITEMS, CLI_MAX_BODY_BYTES } from '../../cli/limits.ts';
type Parsed<S> = S extends (...args: never[]) => infer O ? O : never;
function mapFields<const Source extends Record<string, {
  description: string;
}>>(source: Source) {
  return Object.fromEntries(Object.entries(source).map(([name, value]) => [name, defaulted(Schema.string(), value.description)])) as {
    [Key in keyof Source]: ReturnType<typeof defaulted<Schema<string>>>;
  };
}
function pickFields<const F extends Record<string, Schema>, const K extends readonly (keyof F)[]>(fields: F, keys: K): Pick<F, K[number]> { return Object.fromEntries(keys.map(key => [key, fields[key]])) as Pick<F, K[number]>; }
type Dotted<Value extends string> = Value extends `${infer First} ${infer Rest}` ? `${First}.${Dotted<Rest>}` : Value;
const WORKBENCH_ACTION_TYPES = ["new-workspace", "new-work", "save-draft", "edit-draft", "create-branch", "update-execution", "run", "experiment", "pause-experiment", "resume-experiment", "stop-experiment", "retry", "favorite", "update-review-draft", "evaluate", "reuse", "agent-action", "function-add", "function-edit", "function-remove", "function-preset", "resource-select", "resource-remove", "task-interrupt", "task-resume", "task-answer", "task-apply", "task-generation-apply", "task-branch"] as const;
const agent = (() => {
  const agentModelSchema = contractObject({
    provider: Schema.string().required(),
    model: Schema.string().required(),
    reasoningEffort: optional(Schema.string()),
  }, { exact: true });
  return { agentModelSchema };
})();
const prompt = (() => {
  const { agentModelSchema } = agent;
  const text = () => Schema.string().required();
  const id = () => Schema.string().min(1).pattern(/^\S+$/u).required();
  const object = <const Fields extends Record<string, Schema>>(fields: Fields) => contractObject(fields, { exact: true });
  const json = () => jsonObjectSchema({ keySchema: text(), maxDepth: 100 }).required();
  const promptRequestPartsSchema = object({
    block_templates: object({
      requirements_block: text(),
      prompt_edit_block: text(),
      references_block: text()
    }),
    reference_descriptions: object(mapFields(templateConfiguration.references)),
  });
  const inputFields = {
    original_request: text(),
    base_model_id: text(),
    positive_prompt: text(),
    negative_prompt: text(),
    change_request: text()
  };
  const promptStartFields = {
    workspace_id: id(),
    work_id: id(),
    branch_id: id(),
    function_id: id(),
    request_id: id(),
    intent: Schema.union(['generate', 'rewrite']).required(),
    task_id: optional(id()),
    input: object(inputFields)
  };
  const promptLookupSchema = object({ workspace_id: id(), request_id: id() });
  const promptListSchema = object({ workspace_id: id(), task_id: id() });
  const promptAdoptSchema = object({
    workspace_id: id(),
    request_id: id(),
    positive_prompt: text(),
    negative_prompt: text()
  });
  const reply = object({
    type: Schema.const('prompt').required(),
    positive_prompt: text(),
    negative_prompt: text()
  });
  const promptRequestInputSchema = object({
    ...inputFields,
    base_model_name: text(),
    reference_context: json()
  });
  const promptTurnSchema = object({
    request_id: id(),
    task_id: id(),
    turn_index: Schema.natural().required(),
    function_id: id(),
    kind: Schema.const('prompt').required(),
    intent: Schema.union(['generate', 'rewrite']).required(),
    candidate: requiredNullable(object({ positive_prompt: text(), negative_prompt: text() })),
    session_id: text(),
    harness_turn: requiredNullable(Schema.natural().required()),
    preset_id: text(),
    agent_model: agentModelSchema,
    input: promptRequestInputSchema,
    request_template: text(),
    request_parts: promptRequestPartsSchema,
    request_text: text(),
    status: Schema.union(['queued', 'running', 'succeeded', 'failed', 'interrupted']).required(),
    error: requiredNullable(object({ code: text(), message: text() })),
    artifact_id: requiredNullable(text()),
    result: requiredNullable(reply),
    adopted: requiredNullable(object({ positive_prompt: text(), negative_prompt: text() })),
    applied_at: requiredNullable(Schema.number().required()),
    created_at: Schema.number().required(),
    finished_at: requiredNullable(Schema.number().required()),
    start_seq: Schema.number().required(),
  });
  return {
    text,
    id,
    object,
    json,
    promptRequestPartsSchema,
    inputFields,
    promptStartFields,
    promptLookupSchema,
    promptListSchema,
    promptAdoptSchema,
    reply,
    promptRequestInputSchema,
    promptTurnSchema
  };
})();
const generationJson = (() => {
  const GENERATION_JSON_CONTRACT = Object.freeze({ keySchema: Schema.string().required() });
  const generationJsonValueSchema = jsonValueSchema(GENERATION_JSON_CONTRACT);
  const generationParametersSchema = jsonObjectSchema(GENERATION_JSON_CONTRACT);
  return {
    GENERATION_JSON_CONTRACT,
    generationJsonValueSchema,
    generationParametersSchema
  };
})();
export const LORA_TRIGGER_WORDS_ROLE = 'unique-lora-trigger-words';
const lora = (() => {
  const LORA_WEIGHT_ROLE = 'finite-lora-weight';
  const LORA_TRIGGER_WORDS_MAX_COUNT = 100;
  function isLoraWeight(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }
  const loraWeightSchema = transform(Schema.number().required(), value => {
    if (!isLoraWeight(value))
      throw new TypeError('LoRA weight is invalid');
    return value;
  }, true).required().role(LORA_WEIGHT_ROLE);
  function loraTriggerWordsAreUnique(words: readonly string[]): boolean {
    return new Set(words).size === words.length;
  }
  const catalogLoraTriggerWordsSchema = refined(Schema.array(Schema.string().min(1).max(500).pattern(/\S/u).required()).max(LORA_TRIGGER_WORDS_MAX_COUNT).required(), words => {
    if (!loraTriggerWordsAreUnique(words)) throw new TypeError('LoRA trigger words must not contain duplicates');
  }).role(LORA_TRIGGER_WORDS_ROLE);
  return {
    catalogLoraTriggerWordsSchema,
    LORA_WEIGHT_ROLE,
    LORA_TRIGGER_WORDS_ROLE,
    LORA_TRIGGER_WORDS_MAX_COUNT,
    isLoraWeight,
    loraWeightSchema,
    loraTriggerWordsAreUnique
  };
})();
const inspection = (() => {
  const { generationJsonValueSchema, GENERATION_JSON_CONTRACT } = generationJson;
  const workflowRuntimeParameterSchema = contractObject({
    image_cardinality: Schema.union(['one', 'many']),
    image_required: Schema.boolean(),
    parameter_id: Schema.string().required(),
    kind: Schema.union(STANDARD_RUNTIME_PARAMETER_KINDS).required(),
    value_type: Schema.union(WORKFLOW_RUNTIME_PARAMETER_VALUE_TYPES).required(),
    current_value: requiredNullable(generationJsonValueSchema),
    minimum: Schema.number(),
    maximum: Schema.number(),
    allowed_values: jsonArraySchema(GENERATION_JSON_CONTRACT),
  }).required();
  const workflowRuntimeSizeCandidateSchema = Schema.union([
    contractObject({
      candidate_id: Schema.string().required(),
      representation: Schema.const('width_height').required(),
      width: workflowRuntimeParameterSchema,
      height: workflowRuntimeParameterSchema
    }).required(),
    contractObject({
      candidate_id: Schema.string().required(),
      representation: Schema.const('aspect_ratio_megapixels').required(),
      aspect_ratio: workflowRuntimeParameterSchema,
      megapixels: workflowRuntimeParameterSchema
    }).required(),
    contractObject({
      candidate_id: Schema.string().required(),
      representation: Schema.const('resolution_preset').required(),
      parameter: workflowRuntimeParameterSchema,
      mapped_options: Schema.array(contractObject({
        value: requiredNullable(generationJsonValueSchema),
        width: Schema.natural().min(1).required(),
        height: Schema.natural().min(1).required()
      }).required()).required(),
      unmapped_values: jsonArraySchema(GENERATION_JSON_CONTRACT).required(),
    }).required(),
  ]).required();
  const workflowRuntimeParameterInspectionSchema = contractObject({
    parameters: Schema.array(workflowRuntimeParameterSchema).required(), size_candidates: Schema.array(workflowRuntimeSizeCandidateSchema).required(),
  }).required();
  return {
    workflowRuntimeParameterSchema,
    workflowRuntimeSizeCandidateSchema,
    workflowRuntimeParameterInspectionSchema
  };
})();
const wb = (() => {
  const { agentModelSchema } = agent;
  const { promptRequestPartsSchema } = prompt;
  const { workflowRuntimeParameterInspectionSchema } = inspection;
  const text = () => Schema.string().required();
  const id = () => Schema.string().pattern(/^[1-9]\d*$/).required();
  const nonempty = () => Schema.string().min(1).pattern(/\S/u).required();
  const strings = () => Schema.array(text()).required();
  const object = <const Fields extends Record<string, Schema>>(fields: Fields) => contractObject(fields, { exact: true });
  const jsonObject = () => jsonObjectSchema({ keySchema: nonempty(), maxDepth: 100 }).required();
  const functionBindingEditableFields = {
    name: Schema.string().min(1).max(30).pattern(/\S/u).required(),
    kind: Schema.union([...TASK_KINDS, 'translate']).required(),
    preset_id: nonempty(),
    agent_model: agentModelSchema,
    requested_skill: requiredNullable(nonempty()),
    request_template: text(),
    request_parts: optional(promptRequestPartsSchema),
  };
  const functionBindingEditableSchema = refined(object(functionBindingEditableFields), refineFunctionBinding);
  const taskRequestResourcesSchema = object({
    instance_id: optional(Schema.union([id(), Schema.const(null)])),
    template_id: optional(Schema.union([id(), Schema.const(null)])),
  });
  const taskRequestDraftSchema = object({ instructions: text(), resources: taskRequestResourcesSchema.required() });
  const reviewDraftSchema = object({
    verdict: Schema.union(['unrated', 'met', 'needs-work']).required(),
    observation: text(),
    conclusion: text(),
    title: text(),
    conditions: text(),
    note: text(),
    evidence_run_ids: strings().min(1),
    review_artifact_id: requiredNullable(nonempty()),
    experience_artifact_id: requiredNullable(nonempty()),
    experience_id: requiredNullable(nonempty()),
  });
  const reviewDraftUpdateSchema = object({ expected: reviewDraftSchema.required(), draft: reviewDraftSchema.required() });
  const resourceRefSchema = object({ kind: Schema.union([...WORKBENCH_RESOURCE_KINDS]).required(), id: id() });
  const promptResourceRefSchema = object({ kind: Schema.union([...PROMPT_RESOURCE_KINDS]).required(), id: id() });
  const promptResourceRefsSchema = refined(Schema.array(promptResourceRefSchema), refinePromptResourceRefs);
  const resourceSnapshotSchema = Schema.union(CATALOG_KIND_DEFINITIONS.map(({ kind }) => object({
    kind: Schema.const(kind).required(),
    id: id(),
    name: text(),
    fields: object(Object.fromEntries(CATALOG_PRESENTATION.kinds[kind].prompt_fields.map(key => [key, requiredNullable(jsonValueSchema({ keySchema: text(), maxDepth: 100 }).required())]))).required(),
    ...(kind === 'lora' ? { selected_weight: optional(Schema.number()) } : {})
  })));
  const resourceSnapshotFields = { selected_resources: optional(Schema.array(resourceSnapshotSchema)) };
  const imageRefSchema = object({
    image_ref_id: nonempty(),
    source: Schema.union([object({
      kind: Schema.const('run_media').required(),
      run_id: nonempty(),
      media_id: nonempty()
    }), object({ kind: Schema.const('uploaded_file').required(), file_id: nonempty() })]).required(),
    purpose: Schema.union(['workflow', 'agent', 'both']).required(),
    reference_requirement: text()
  });
  const imageSourceSchema = object({
    image_ref_id: nonempty(),
    file_path: requiredNullable(nonempty()),
    name: text(),
    url: requiredNullable(text()),
    error: optional(Schema.string())
  });
  const workflowImageBindingSchema = object({ parameter_id: nonempty(), image_ref_ids: Schema.array(nonempty()).min(1).required() });
  const experienceProvenanceSchema = object({
    created_by_task_id: requiredNullable(nonempty()), evidence: Schema.array(object({
      run_id: nonempty(),
      generation_task_id: requiredNullable(nonempty()),
      role: Schema.union(['supporting_evidence', 'counterexample']).required()
    })).required()
  });
  const referenceExperienceSchema = object({
    experience_id: nonempty(),
    title: text(),
    conditions: text(),
    note: text(),
    provenance: experienceProvenanceSchema.required()
  });
  const inputReferenceFields = {
    reference_task_ids: defaulted(Schema.array(nonempty()), []),
    reference_run_ids: defaulted(Schema.array(nonempty()), []),
    reference_experiences: defaulted(Schema.array(referenceExperienceSchema), []),
    image_refs: defaulted(Schema.array(imageRefSchema), []),
    workflow_image_bindings: defaulted(Schema.array(workflowImageBindingSchema), [])
  };
  const inputReferencesSchema = projected(refined(object(inputReferenceFields), refineInputReferences));
  const generationInputFields = {
    title: text(),
    instance_id: requiredNullable(id()),
    template_id: requiredNullable(id()),
    model: requiredNullable(object({ id: id(), file_name: nonempty() })),
    parameters: jsonObject(),
    loras: Schema.array(object({
      id: id(),
      file_name: nonempty(),
      weight: Schema.number().required(),
      trigger_words: strings()
    })).required(),
  };
  const generationInputBaseSchema = refined(object(generationInputFields), refineGenerationInput);
  const generationInputSchema = refined(object({
    ...generationInputFields,
    image_refs: optional(Schema.array(imageRefSchema)),
    workflow_image_bindings: optional(Schema.array(workflowImageBindingSchema)),
  }), refineGenerationInput);
  const candidateSchema = object({
    prompt_resource_refs: defaulted(promptResourceRefsSchema, []),
    ...resourceSnapshotFields,
    generation_input: generationInputBaseSchema,
    image_refs: defaulted(Schema.array(imageRefSchema), []),
    workflow_image_bindings: defaulted(Schema.array(workflowImageBindingSchema), [])
  });
  const promptInputFields = { positive_prompt: requiredNullable(text()), negative_prompt: requiredNullable(text()) };
  const promptInputSchema = object(promptInputFields);
  const taskDraftFields = {
    prompt_resource_refs: defaulted(promptResourceRefsSchema, []),
    prompt_edit_task_id: optional(Schema.union([text(), Schema.const(null)])),
    prompt_change_request: optional(Schema.string()),
    prompt_input: promptInputSchema,
    generation_input: generationInputBaseSchema,
    ...inputReferenceFields,
    instructions: defaulted(Schema.string(), ''),
    base_model_id: requiredNullable(id())
  };
  const favoriteUpdateSchema = object({ targetType: Schema.union([...WORKBENCH_FAVORITE_TARGET_TYPES]).required(), favorite: Schema.boolean().required() });
  const experienceReuseInputSchema = object({ name: Schema.string().min(1).max(WORKBENCH_BRANCH_NAME_MAX_LENGTH).pattern(/\S/u).required(), baseModelId: requiredNullable(id()) });
  const parameterMappingSchema = requiredNullable(dictionary(Schema.union([...STANDARD_RUNTIME_PARAMETER_KINDS]).required()).required());
  const taskDraftSchema = refined(object({ ...taskDraftFields, parameter_mapping: parameterMappingSchema }), refineTaskDraft);
  const artifactSchemas = {
    prompt: object({
      type: Schema.const('prompt').required(),
      ...promptInputFields,
      source_files: optional(Schema.array(text()))
    }),
    parameters: object({
      type: Schema.const('parameters').required(),
      parameters: jsonObject(),
      source_files: optional(Schema.array(text()))
    }),
    generation_input: object({
      type: Schema.const('generation_input').required(),
      prompt_resource_refs: defaulted(promptResourceRefsSchema, []),
      ...resourceSnapshotFields,
      generation_input: generationInputBaseSchema,
      image_refs: defaulted(Schema.array(imageRefSchema), []),
      workflow_image_bindings: defaulted(Schema.array(workflowImageBindingSchema), []),
      plan_artifact_id: optional(Schema.union([nonempty(), Schema.const(null)])),
      source_files: optional(Schema.array(text()))
    }),
    iteration_plan: object({
      type: Schema.const('iteration_plan').required(),
      source_run_id: nonempty(),
      changes: Schema.array(nonempty()).min(1).required(),
      reason: nonempty(),
      expected_result: nonempty(),
      source_files: optional(Schema.array(text()))
    }),
    resources: object({
      type: Schema.const('resources').required(),
      refs: Schema.array(resourceRefSchema).required(),
      reason: Schema.string(),
      source_files: optional(Schema.array(text()))
    }),
    review: object({
      type: Schema.const('review').required(),
      observation: text(),
      conclusion: text(),
      run_ids: strings().min(1),
      candidate: optional(candidateSchema),
      source_files: optional(Schema.array(text()))
    }),
    experience: object({
      type: Schema.const('experience').required(),
      title: nonempty(),
      conditions: nonempty(),
      note: nonempty(),
      base_model_id: requiredNullable(id()),
      model_id: requiredNullable(id()),
      run_ids: strings().min(1),
      source_files: optional(Schema.array(text()))
    }),
    question: object({ type: Schema.const('question').required(), question: nonempty(), options: defaulted(Schema.array(text()), []), source_files: optional(Schema.array(text())) }),
  };
  const taskArtifactSchema = refined(Schema.union(Object.values(artifactSchemas)).required(), refineArtifact);
  const outputContractSchema = object({
    artifact_types: strings(),
    required_artifact_types: strings(),
    parameter_ids: strings(),
    apply_mode: Schema.union(['automatic', 'candidate', 'record']).required(),
    requires_finished_runs: Schema.boolean().required()
  });
  const { instructions: _draftInstructions, ...taskSnapshotDraftFields } = taskDraftFields;
  const experimentInputSourceSchema = Schema.union([
    object({ type: Schema.const('initial').required() }),
    object({ type: Schema.const('candidate').required(), artifact_id: nonempty() }),
    object({ type: Schema.const('run').required(), run_id: nonempty() }),
  ]).required();
  const taskInputSchema = refined(object({
    ...resourceSnapshotFields,
    delegation_source: optional(experimentInputSourceSchema),
    ...taskSnapshotDraftFields,
    parameter_mapping: parameterMappingSchema,
    requirements: object({ original_request: nonempty(), instructions: text() }),
    reference_task_artifacts: defaulted(Schema.array(object({
      task_id: nonempty(),
      artifact_id: nonempty(),
      artifact: taskArtifactSchema
    })), []),
    evaluation_input: optional(object({
      run_id: nonempty(),
      verdict: Schema.union(['unrated', 'met', 'needs-work']).required(),
      observation: text(),
      conclusion: text(),
      experience: object({
        title: text(),
        conditions: text(),
        note: text()
      })
    })),
    requested_skill: requiredNullable(text()),
    max_runs: Schema.natural().required()
  }), refineTaskDraft);
  const errorSchema = object({ code: text(), message: text() });
  const taskFields = {
    task_id: nonempty(),
    parent_experiment_task_id: requiredNullable(text()),
    branch_id: nonempty(),
    function_id: nonempty(),
    title: text(),
    kind: Schema.union([...TASK_KINDS]).required(),
    status: Schema.union(['pending', 'running', 'waiting_input', 'waiting_generation', 'needs_attention', 'paused', 'interrupted', 'succeeded', 'failed']).required(),
    input: taskInputSchema.required(),
    output_contract: outputContractSchema.required(),
    apply_target: object({
      kind: Schema.union(['branch', 'run_review']).required(),
      id: nonempty(),
      expected: jsonObject()
    }),
    binding_snapshot: object({
      function_id: nonempty(),
      name: text(),
      kind: Schema.union([...TASK_KINDS, 'translate', 'rewrite']).required(),
      preset_id: text(),
      agentModel: agentModelSchema,
      requested_skill: requiredNullable(text()),
      request_template: text(),
      request_parts: optional(promptRequestPartsSchema)
    }),
    session_id: requiredNullable(text()),
    request_text: text(),
    selected_model: requiredNullable(jsonObject()),
    answers: Schema.array(object({ question_artifact_id: nonempty(), answer: text() })).required(),
    error: requiredNullable(errorSchema),
    created_at: Schema.number().required(),
    updated_at: Schema.number().required(),
    execution_state: Schema.union(['pending', 'running', 'idle', 'interrupted', 'failed']).required(),
    initiator: Schema.union(['human', 'agent']).required(),
    retry_of_run_id: requiredNullable(text()),
  };
  const taskSchema = refined(object(taskFields), refineTask);
  const taskChildSummarySchema = object({
    ...pickFields(taskFields, ['task_id', 'function_id', 'kind', 'title', 'status', 'session_id', 'execution_state', 'error']),
    preset_id: text(),
    agent_model: agentModelSchema,
  });
  const storedArtifactSchema = object({
    artifact_id: nonempty(),
    task_id: nonempty(),
    type: Schema.union(Object.keys(artifactSchemas)).required(),
    artifact: taskArtifactSchema,
    source_files: strings(),
    session_id: text(),
    turn: Schema.natural().required(),
    call_id: text(),
    skill_refs: Schema.array(object({
      name: text(),
      session_id: text(),
      turn: Schema.natural().required(),
      call_id: text(),
      source_file: requiredNullable(text())
    })).required(),
    disposition: Schema.union(['applied', 'candidate', 'recorded', 'waiting_input']).required(),
    applied_target: requiredNullable(object({
      kind: text(),
      id: text(),
      fields: strings()
    })),
    created_at: Schema.number().required()
  });
  const experienceSchema = object({
    experience_id: nonempty(),
    work_id: requiredNullable(text()),
    branch_id: requiredNullable(text()),
    task_id: requiredNullable(text()),
    title: text(),
    conditions: text(),
    note: text(),
    base_model_id: requiredNullable(id()),
    model_id: requiredNullable(id()),
    evidence_run_ids: strings(),
    source_run_id: requiredNullable(text()),
    source_experience_id: requiredNullable(text()),
    source_artifact_id: requiredNullable(text()),
    provenance: experienceProvenanceSchema
  });
  const workbenchRunMediaSchema = object({
    media_id: nonempty(),
    run_id: nonempty(),
    filename: text(),
    media_type: text(),
    media_kind: text(),
    byte_size: Schema.natural().required(),
    url: optional(Schema.string()),
    download_url: optional(Schema.string())
  });
  const workbenchRunSchema = object({
    ...resourceSnapshotFields,
    session_id: text(),
    created_at: Schema.number().required(),
    updated_at: Schema.number().required(),
    media: Schema.array(workbenchRunMediaSchema).required(),
    run_id: nonempty(),
    workbench_task_id: text(),
    execution_task_id: requiredNullable(text()),
    iteration_index: requiredNullable(Schema.natural().required()),
    status: Schema.union([...GENERATION_RUN_STATUSES]).required(),
    title: text(),
    generation_input: generationInputSchema.required(),
    candidate_artifact_id: requiredNullable(text()),
    review_artifact_id: requiredNullable(text()),
    retry_of_run_id: requiredNullable(text()),
    initiator: Schema.union(['human', 'agent']).required(),
    review: requiredNullable(object({
      verdict: Schema.union(['unrated', 'met', 'needs-work']).required(),
      observation: text(),
      conclusion: text(),
      source_artifact_id: requiredNullable(text())
    })),
    review_draft: requiredNullable(reviewDraftSchema),
    error: requiredNullable(errorSchema)
  });
  const recordFields = {
    id: nonempty(),
    workspace_id: requiredNullable(text()),
    work_id: requiredNullable(text()),
    branch_id: requiredNullable(text()),
    task_id: requiredNullable(text()),
    title: text(),
    base_model_id: defaulted(Schema.union([text(), Schema.const(null)]), null)
  };
  const workbenchRecordSchema = Schema.union([
    object({
      ...recordFields,
      type: Schema.const('task').required(),
      task: taskSchema.required(),
      artifacts: Schema.array(storedArtifactSchema).required(),
      runs: Schema.array(workbenchRunSchema).required()
    }),
    object({
      ...recordFields,
      type: Schema.const('run').required(),
      run: workbenchRunSchema.required()
    }),
    object({
      ...recordFields,
      type: Schema.const('experience').required(),
      experience: experienceSchema.required()
    }),
  ]).required();
  const taskGetRequestSchema = object({ task_id: nonempty() });
  const taskPublishRequestSchema = object({ task_id: nonempty(), artifact: taskArtifactSchema });
  const taskPublishReceiptSchema = object({
    task_id: nonempty(),
    artifact_id: nonempty(),
    disposition: Schema.union(['applied', 'candidate', 'recorded', 'waiting_input']).required()
  });
  const experimentSchema = object({
    task_id: nonempty(),
    control_state: Schema.union(['running', 'paused', 'ended', 'completed']).required(),
    end_reason: requiredNullable(Schema.union(['goal_met', 'budget_used', 'user_ended']).required()),
    submitted_count: Schema.natural().required(),
    max_runs: Schema.natural().required()
  });
  const experimentEndRequestSchema = object({ task_id: nonempty(), reason: Schema.union(['goal_met', 'user_ended']).required() });
  const imageUploadSchema = object({
    image_ref_id: nonempty(),
    parameter_id: nonempty(),
    instance_id: nonempty(),
    name: text(),
    subfolder: text(),
    type: Schema.const('input').required()
  });
  const workbenchRunInputSchema = object({
    prompt_resource_refs: optional(promptResourceRefsSchema),
    ...resourceSnapshotFields,
    submitted_input: generationInputSchema.required(),
    effective_input: requiredNullable(generationInputSchema),
    image_uploads: defaulted(Schema.array(imageUploadSchema), []),
    parameter_mapping: requiredNullable(dictionary(Schema.union([...STANDARD_RUNTIME_PARAMETER_KINDS]).required()).required()),
    base_model_id: requiredNullable(id()),
    run_id: nonempty(),
    branch_id: nonempty(),
    generation_input: generationInputSchema.required(),
    image_refs: defaulted(Schema.array(imageRefSchema), []),
    workflow_image_bindings: defaulted(Schema.array(workflowImageBindingSchema), []),
    input_description: requiredNullable(workflowRuntimeParameterInspectionSchema),
    prompt_input: promptInputSchema,
  });
  const taskGetResultFields = {
    ...resourceSnapshotFields,
    task_id: nonempty(),
    parent_experiment_task_id: requiredNullable(text()),
    children: Schema.array(taskChildSummarySchema).required(),
    status: text(),
    image_sources: defaulted(Schema.array(imageSourceSchema), []),
    ...taskSnapshotDraftFields,
    delegation_source: optional(experimentInputSourceSchema),
    requirements: object({ original_request: text(), instructions: text() }),
    reference_task_artifacts: defaulted(Schema.array(object({
      task_id: nonempty(),
      artifact_id: nonempty(),
      artifact: taskArtifactSchema
    })), []),
    evaluation_input: optional(object({
      run_id: nonempty(),
      verdict: text(),
      observation: text(),
      conclusion: text(),
      experience: object({
        title: text(),
        conditions: text(),
        note: text()
      })
    })),
    requested_skill: requiredNullable(text()),
    max_runs: Schema.natural().required(),
    output_contract: outputContractSchema,
    artifacts: Schema.array(object({
      task_id: nonempty(),
      artifact_id: nonempty(),
      artifact: taskArtifactSchema,
      disposition: text()
    })).required(),
    iterations: Schema.array(object({
      prompt_resource_refs: optional(promptResourceRefsSchema),
      ...resourceSnapshotFields,
      index: Schema.natural().required(),
      run_id: nonempty(),
      execution_task_id: requiredNullable(text()),
      generation_input: generationInputSchema,
      image_refs: defaulted(Schema.array(imageRefSchema), []),
      workflow_image_bindings: defaulted(Schema.array(workflowImageBindingSchema), []),
      review_artifact_id: requiredNullable(text())
    })).required(),
    answers: Schema.array(object({ question_artifact_id: nonempty(), answer: text() })).required(),
  };
  type TaskGetValue = {
    [Kind in TaskKind]: ObjectValue<typeof taskGetResultFields> & {
      kind: Kind;
    } & (Kind extends BranchNonGenerationTaskKind ? {
      unresolved_parameters: Parsed<ReturnType<typeof jsonObject>>;
    } : {});
  }[TaskKind];
  const taskGetResultSchema = refined(Schema.union(TASK_KINDS.map(kind => object({
    ...taskGetResultFields,
    kind: Schema.const(kind).required(),
    ...(isBranchNonGenerationTaskKind(kind) ? { unresolved_parameters: jsonObject() } : {})
  }))).required() as Schema<unknown, TaskGetValue, 'defined'>, refineTaskResult);
  return {
    text,
    id,
    nonempty,
    strings,
    object,
    jsonObject,
    functionBindingEditableFields,
    functionBindingEditableSchema,
    taskRequestResourcesSchema,
    taskRequestDraftSchema,
    reviewDraftSchema,
    reviewDraftUpdateSchema,
    resourceRefSchema,
    promptResourceRefSchema,
    resourceSnapshotSchema,
    resourceSnapshotFields,
    imageRefSchema,
    imageSourceSchema,
    workflowImageBindingSchema,
    experienceProvenanceSchema,
    referenceExperienceSchema,
    inputReferenceFields,
    inputReferencesSchema,
    generationInputFields,
    generationInputBaseSchema,
    generationInputSchema,
    candidateSchema,
    promptInputFields,
    promptInputSchema,
    taskDraftFields,
    favoriteUpdateSchema,
    experienceReuseInputSchema,
    taskDraftSchema,
    artifactSchemas,
    taskArtifactSchema,
    outputContractSchema,
    taskSnapshotDraftFields,
    experimentInputSourceSchema,
    taskInputSchema,
    errorSchema,
    taskSchema,
    taskChildSummarySchema,
    storedArtifactSchema,
    experienceSchema,
    workbenchRunMediaSchema,
    workbenchRunSchema,
    recordFields,
    workbenchRecordSchema,
    taskGetRequestSchema,
    taskPublishRequestSchema,
    taskPublishReceiptSchema,
    experimentSchema,
    experimentEndRequestSchema,
    imageUploadSchema,
    workbenchRunInputSchema,
    taskGetResultFields,
    taskGetResultSchema
  };
})();
const delegation = (() => {
  const { agentModelSchema } = agent;
  const { experimentInputSourceSchema } = wb;
  const delegatableKinds = TASK_KINDS.filter(kind => kind !== 'experiment');
  const id = () => Schema.string().required();
  const functionListRequestSchema = contractObject({ task_id: id() });
  const functionListResultSchema = contractObject({
    task_id: id(),
    functions: Schema.array(contractObject({
      function_id: id(),
      name: id(),
      kind: id(),
      purpose: id(),
      artifact_types: Schema.array(Schema.string()).required(),
      preset_id: id(),
      agent_model: agentModelSchema,
    })).required(),
  });
  const delegateFunctionRequestSchema = contractObject({
    task_id: id(),
    function_id: id(),
    instructions: Schema.string().required(),
    source: experimentInputSourceSchema.required(),
    reference_artifact_ids: defaulted(Schema.array(Schema.string()), []),
  });
  const delegateFunctionResultSchema = contractObject({
    task_id: id(),
    parent_experiment_task_id: id(),
    session_id: id(),
    function_id: id(),
    status: id(),
  });
  return {
    delegatableKinds,
    id,
    functionListRequestSchema,
    functionListResultSchema,
    delegateFunctionRequestSchema,
    delegateFunctionResultSchema
  };
})();
const runInput = (() => {
  const { imageRefSchema, imageUploadSchema, workflowImageBindingSchema } = wb;
  const { loraWeightSchema } = lora;
  const { generationParametersSchema } = generationJson;
  const { workflowRuntimeParameterInspectionSchema } = inspection;
  const generationRunErrorSchema = contractObject({ code: Schema.string().required(), message: Schema.string().required() }).required();
  const generationRunInputModelSchema = optional(contractObject({ id: Schema.string().required(), file_name: Schema.string().required() }));
  const generationRunInputLoraSchema = contractObject({
    id: Schema.string().required(),
    file_name: Schema.string().required(),
    weight: loraWeightSchema,
    trigger_words: Schema.array(Schema.string().required()).required(),
  }).required();
  const generationRunInputArgumentsSchema = contractObject({
    image_refs: Schema.array(imageRefSchema),
    workflow_image_bindings: Schema.array(workflowImageBindingSchema),
    title: Schema.string().required(),
    instance_id: Schema.string(),
    template_id: Schema.string().required(),
    model: generationRunInputModelSchema,
    parameters: generationParametersSchema,
    loras: Schema.array(generationRunInputLoraSchema).required(),
  }).required();
  const availableRunInput = {
    run_id: Schema.string().required(),
    lookup_status: Schema.const('available').required(),
    arguments: generationRunInputArgumentsSchema,
    workspace_id: Schema.string().required(),
    submitted_input: generationRunInputArgumentsSchema,
    effective_input: requiredNullable(generationRunInputArgumentsSchema),
    image_uploads: Schema.array(imageUploadSchema).required(),
    input_description: requiredNullable(workflowRuntimeParameterInspectionSchema),
  };
  const generationRunLookupErrorSchema = contractObject({
    run_id: Schema.string().required(),
    lookup_status: Schema.const('error').required(),
    error: generationRunErrorSchema,
  }).required();
  const generationRunInputSchema = Schema.union([
    contractObject({
      ...availableRunInput,
      workflow_status: Schema.const('available').required(),
      workflow: generationParametersSchema
    }).required(),
    contractObject({
      ...availableRunInput,
      workflow_status: Schema.const('unavailable').required(),
      workflow_error: generationRunErrorSchema
    }).required(),
    generationRunLookupErrorSchema,
  ]).required();
  const generationRunInputResultSchema = contractObject({ runs: Schema.array(generationRunInputSchema).required() }).required();
  return {
    generationRunErrorSchema,
    generationRunInputModelSchema,
    generationRunInputLoraSchema,
    generationRunInputArgumentsSchema,
    availableRunInput,
    generationRunLookupErrorSchema,
    generationRunInputSchema,
    generationRunInputResultSchema
  };
})();
const media = (() => {
  const { generationParametersSchema } = generationJson;
  const { generationRunErrorSchema, generationRunLookupErrorSchema } = runInput;
  const generationRunMediaImageSchema = contractObject({
    media_id: Schema.string().required(),
    node_id: Schema.string().required(),
    output_index: Schema.natural().required(),
    filename: Schema.string().required(),
    media_type: Schema.string().required(),
    file_path: Schema.string().required(),
  }).required();
  const generationRunMediaSchema = Schema.union([
    contractObject({
      workspace_id: Schema.string().required(),
      run_id: Schema.string().required(),
      request_id: Schema.string().required(),
      lookup_status: Schema.const('available').required(),
      title: Schema.string().required(),
      status: Schema.union(GENERATION_RUN_STATUSES).required(),
      revision: Schema.natural().required(),
      updated_at: Schema.number().required(),
      instance_id: requiredNullable(Schema.string().required()),
      prompt_id: requiredNullable(Schema.string().required()),
      run_error: requiredNullable(generationRunErrorSchema),
      parameters: optional(clone(generationParametersSchema)),
      images: Schema.array(generationRunMediaImageSchema).required(),
    }).required(),
    generationRunLookupErrorSchema,
  ]).required();
  const generationRunMediaResultSchema = contractObject({ runs: Schema.array(generationRunMediaSchema).required() }).required();
  return {
    generationRunMediaImageSchema,
    generationRunMediaSchema,
    generationRunMediaResultSchema
  };
})();
const wait = (() => {
  const runId = Schema.string().min(1).required();
  const generationRunWaitReceiptSchema = contractObject({
    job_id: Schema.string().min(1).required(),
    run_ids: Schema.array(runId).min(1).max(MAX_RUN_INPUT_QUERY_IDS).required(),
  }).required();
  const generationRunWaitSummarySchema = contractObject({
    runs: Schema.array(contractObject({
      run_id: runId,
      status: Schema.union(GENERATION_RUN_TERMINAL_STATUSES.map(status => Schema.const(status))).required(),
    }).required()).min(1).max(MAX_RUN_INPUT_QUERY_IDS).required(),
  }).required();
  return {
    runId,
    generationRunWaitReceiptSchema,
    generationRunWaitSummarySchema
  };
})();
const submission = (() => {
  const generationAcceptanceSchema = Schema.union(GENERATION_ACCEPTANCE_STATUSES).required();
  const generationSubmissionResultSchema = contractObject({
    items: Schema.array(contractObject({
      requestId: Schema.string().required(),
      runId: Schema.string().required(),
      acceptance: generationAcceptanceSchema,
    }).required()).required(),
  }).required();
  return { generationAcceptanceSchema, generationSubmissionResultSchema };
})();
const image = (() => {
  const imageReaderPromptSchema = Schema.string().min(1).max(IMAGE_READER_PROMPT_MAX_LENGTH).pattern(/\S/u);
  const imageReaderDefaultPromptSchema = imageReaderPromptSchema.required();
  return { imageReaderPromptSchema, imageReaderDefaultPromptSchema };
})();
const parameterFiles = (() => {
  const cliParameterFileKeySchema = Schema.string().min(1).required();
  function registerCliRequestId(requestIds: Set<string>, value: string, label: string): string {
    const requestId = value.toLowerCase();
    if (requestIds.has(requestId))
      throw new TypeError(`${label} request_id duplicates ${requestId}`);
    requestIds.add(requestId);
    return requestId;
  }
  function cliParameterFiles(value: unknown, parameters: Readonly<Record<string, unknown>>, label: string): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError(`${label} parameter_files must be an object`);
    }
    const files = value as Record<string, unknown>;
    for (const [parameter, path] of Object.entries(files)) {
      try {
        Schema.resolve(parameter, cliParameterFileKeySchema, {});
      }
      catch {
        throw new TypeError(`${label} parameter_files requires a parameter ID`);
      }
      if (Object.hasOwn(parameters, parameter)) {
        throw new TypeError(`${label} parameter ${parameter} is present in both parameters and parameter_files (${String(path)})`);
      }
    }
    return files;
  }
  return {
    cliParameterFileKeySchema,
    registerCliRequestId,
    cliParameterFiles
  };
})();
const cli = (() => {
  const { taskGetRequestSchema, taskPublishRequestSchema, experimentEndRequestSchema, imageRefSchema, workflowImageBindingSchema } = wb;
  const { imageReaderPromptSchema } = image;
  const { loraWeightSchema, loraTriggerWordsAreUnique, LORA_TRIGGER_WORDS_ROLE, LORA_TRIGGER_WORDS_MAX_COUNT } = lora;
  const { cliParameterFiles, cliParameterFileKeySchema, registerCliRequestId } = parameterFiles;
  function cliInputObject<const Fields extends Record<string, Schema>>(fields: Fields) {
    return contractObject(fields, { exact: true });
  }
  const cliTextSchema = Schema.string().min(1).max(500).pattern(/^[^\u0000-\u001f\u007f-\u009f]*$/u).required();
  const cliFilePathSchema = clone(cliTextSchema).max(10000);
  const cliStableIdSchema = Schema.string().pattern(CATALOG_STABLE_ID_PATTERN).required();
  const cliInspectionIdSchema = clone(cliTextSchema).pattern(/^(?!\s*$)[^\u0000-\u001f\u007f-\u009f]*$/u);
  const cliRunIdsSchema = Schema.array(Schema.string().required()).min(1).max(MAX_RUN_INPUT_QUERY_IDS).required();
  const cliSeedCountSchema = Schema.natural().min(1).max(20).required();
  const CLI_JSON_MAX_DEPTH = 64;
  const CLI_JSON_CONTRACT = Object.freeze({ maxDepth: CLI_JSON_MAX_DEPTH, keySchema: cliTextSchema });
  const cliParametersSchema = jsonObjectSchema(CLI_JSON_CONTRACT);
  const cliModelSchema = cliInputObject({ id: cliStableIdSchema, file_name: cliTextSchema }).required();
  const cliLoraTriggerWordsSchema = transform(Schema.array(cliTextSchema).max(LORA_TRIGGER_WORDS_MAX_COUNT).required(), words => {
    if (!loraTriggerWordsAreUnique(words))
      throw new TypeError('LoRA trigger_words contains duplicates');
    return words;
  }, true).required().role(LORA_TRIGGER_WORDS_ROLE);
  const cliLoraSchema = cliInputObject({
    id: cliStableIdSchema,
    file_name: cliTextSchema,
    weight: loraWeightSchema,
    trigger_words: cliLoraTriggerWordsSchema,
  }).required();
  const cliGenerationRequestSchema = cliInputObject({
    title: cliTextSchema,
    instance_id: cliStableIdSchema,
    template_id: cliStableIdSchema,
    model: requiredNullable(cliModelSchema),
    parameters: cliParametersSchema,
    loras: Schema.array(cliLoraSchema).max(100).required(),
    image_refs: optional(Schema.array(imageRefSchema)),
    workflow_image_bindings: optional(Schema.array(workflowImageBindingSchema)),
  }).required();
  const cliSubmissionItemFields = {
    request_id: transform(Schema.string().pattern(GENERATION_REQUEST_ID).required(), value => value.toLowerCase(), true).required(),
    request: cliGenerationRequestSchema,
  };
  const cliSubmissionItemSchema = cliInputObject(cliSubmissionItemFields);
  const cliManifestItemFields = cliInputObject({
    ...cliSubmissionItemFields,
    parameter_files: optional(dictionary(cliFilePathSchema, cliParameterFileKeySchema)),
  }).required();
  const cliManifestItemSchema = transform(cliManifestItemFields, value => {
    const item = value;
    if (Object.hasOwn(item, 'parameter_files'))
      cliParameterFiles(item.parameter_files, item.request.parameters, 'Generation item');
    return item;
  }, true).required();
  const cliSubmissionItemsSchema = transform(Schema.array(cliManifestItemSchema).min(1).max(GENERATION_MAX_SUBMISSION_ITEMS).required(), value => {
    const items = value;
    const requestIds = new Set<string>();
    items.forEach((item, index) => registerCliRequestId(requestIds, item.request_id, `Generation items[${index}]`));
    return items;
  }, true).required();
  const cliGenerationSubmitFields = { items: cliSubmissionItemsSchema, workbench_task_id: optional(Schema.string().min(1).max(500).pattern(/^[^\s]+$/u)) };
  const cliInputSchemas = {
    'workbench task get': taskGetRequestSchema,
    'workbench task publish': taskPublishRequestSchema,
    'workbench experiment end': experimentEndRequestSchema,
    'generation submit': cliInputObject(cliGenerationSubmitFields),
    'generation inspect-template-parameters': cliInputObject({ template_id: cliInspectionIdSchema, instance_id: cliInspectionIdSchema }).required(),
    'generation random-seeds': cliInputObject({ count: cliSeedCountSchema }).required(),
    'generation run-inputs': cliInputObject({ run_ids: cliRunIdsSchema }).required(),
    'generation wait': cliInputObject({ run_ids: cliRunIdsSchema }).required(),
    'generation resolve-media': cliInputObject({ run_ids: cliRunIdsSchema, include_parameters: defaulted(Schema.boolean(), false) }).required(),
    'image inspect': cliInputObject({ file_path: cliFilePathSchema, prompt: imageReaderPromptSchema }).required(),
  } as const;
  return {
    cliInputObject,
    cliTextSchema,
    cliFilePathSchema,
    cliStableIdSchema,
    cliInspectionIdSchema,
    cliRunIdsSchema,
    cliSeedCountSchema,
    CLI_JSON_MAX_DEPTH,
    CLI_JSON_CONTRACT,
    cliParametersSchema,
    cliModelSchema,
    cliLoraTriggerWordsSchema,
    cliLoraSchema,
    cliGenerationRequestSchema,
    cliSubmissionItemSchema,
    cliManifestItemFields,
    cliManifestItemSchema,
    cliSubmissionItemsSchema,
    cliGenerationSubmitFields,
    cliInputSchemas
  };
})();
const results = (() => {
  const { taskGetResultSchema, taskPublishReceiptSchema } = wb;
  const { generationRunWaitReceiptSchema, generationRunWaitSummarySchema } = wait;
  const { workflowRuntimeParameterInspectionSchema } = inspection;
  const { generationRunInputResultSchema } = runInput;
  const { generationSubmissionResultSchema } = submission;
  const { generationRunMediaResultSchema } = media;
  const submissionItem = generationSubmissionResultSchema.dict!.items!.inner!.dict!;
  const cliResultSchemas = {
    'workbench task get': taskGetResultSchema,
    'workbench task publish': taskPublishReceiptSchema,
    'workbench experiment end': contractObject({
      task_id: Schema.string().required(),
      control_state: Schema.string().required(),
      end_reason: Schema.string().required(),
      submitted_count: Schema.natural().required(),
      max_runs: Schema.natural().required()
    }).required(),
    'generation submit': contractObject({
      items: Schema.array(contractObject({
        request_id: submissionItem.requestId!,
        run_id: submissionItem.runId!,
        acceptance: submissionItem.acceptance!,
      }).required()).required()
    }).required(),
    'generation inspect-template-parameters': workflowRuntimeParameterInspectionSchema,
    'generation random-seeds': contractObject({ seeds: Schema.array(Schema.natural().max(RANDOM_SEED_MAX_EXCLUSIVE - 1).required()).required() }).required(),
    'generation run-inputs': generationRunInputResultSchema,
    'generation wait': generationRunWaitReceiptSchema,
    'generation resolve-media': generationRunMediaResultSchema,
    'image inspect': contractObject({
      provider: Schema.string().required(),
      model: Schema.string().required(),
      file_path: Schema.string().required(),
      observation: Schema.string().required()
    }).required(),
  } as const;
  const cliJobResultSchemas = {
    'generation wait': generationRunWaitSummarySchema,
  } as const;
  return {
    submissionItem,
    cliResultSchemas,
    cliJobResultSchemas
  };
})();
const translation = (() => {
  const translationResultSchema = Schema.union([
    contractObject({ request_id: Schema.string().min(1).required(), status: Schema.const('running').required() }, { exact: true }),
    contractObject({
      request_id: Schema.string().min(1).required(),
      status: Schema.const('succeeded').required(),
      text: Schema.string().min(1).required()
    }, { exact: true }),
    contractObject({
      request_id: Schema.string().min(1).required(),
      status: Schema.const('failed').required(),
      error: Schema.string().min(1).required()
    }, { exact: true }),
  ]).required();
  return { translationResultSchema };
})();
const remote = (() => {
  const { workflowRuntimeParameterInspectionSchema } = inspection;
  const { functionBindingEditableSchema, favoriteUpdateSchema, experienceReuseInputSchema, reviewDraftUpdateSchema, taskDraftSchema, taskRequestDraftSchema, workbenchRunInputSchema, imageRefSchema, generationInputSchema, imageSourceSchema, workbenchRecordSchema } = wb;
  const { promptStartFields, promptLookupSchema, promptListSchema, promptAdoptSchema, promptTurnSchema, promptRequestInputSchema } = prompt;
  const { translationResultSchema } = translation;
  const json = jsonValueSchema({ keySchema: Schema.string().min(1).required(), maxDepth: 64 });
  const identifier = () => Schema.string().min(1).max(500).pattern(/^\S+$/u);
  const scopeSchema = contractObject({
    workspaceId: identifier().required(),
    workId: identifier(),
    branchId: identifier()
  }, { exact: true });
  const environmentSchema = contractObject({ workspaceId: identifier(), presetId: identifier() }, { exact: true });
  const actionSchema = refined(contractObject({
    workspaceId: Schema.string().required(),
    workId: identifier(),
    branchId: identifier(),
    type: Schema.union([...WORKBENCH_ACTION_TYPES]).required(),
    referenceRunIds: Schema.array(identifier()).max(20),
    runId: identifier(),
    taskId: identifier(),
    id: identifier(),
    requestId: identifier(),
    field: Schema.string().min(1),
    value: json,
    expectedValue: Schema.string(),
  }, { exact: true }), value => refineRemoteAction(value, parseData));
  const inputDescriptionResultSchema = contractObject({ value: requiredNullable(workflowRuntimeParameterInspectionSchema) }, { exact: true });
  const runInputSchema = contractObject({
    workspaceId: identifier().required(),
    workId: identifier().required(),
    runId: identifier().required()
  }, { exact: true });
  const inputDescriptionSchema = contractObject({
    workspaceId: identifier().required(),
    workId: identifier().required(),
    branchId: identifier().required(),
    generationInput: optional(generationInputSchema)
  }, { exact: true });
  const taskDraftFields = {
    workspaceId: identifier().required(),
    workId: identifier().required(),
    branchId: identifier().required(),
    functionId: identifier().required()
  };
  const taskDraftRequestSchema = contractObject(taskDraftFields, { exact: true });
  const taskDraftSaveSchema = contractObject({ ...taskDraftFields, draft: taskRequestDraftSchema.required() }, { exact: true });
  const taskDraftResultSchema = contractObject({ value: requiredNullable(taskRequestDraftSchema) }, { exact: true });
  const queryRecordsSchema = contractObject({
    type: Schema.union(['task', 'run', 'experience', 'favorite']).required(),
    workspaceId: identifier(),
    workId: identifier(),
    taskId: identifier(),
    keyword: Schema.string()
  }, { exact: true });
  const imageImportSchema = contractObject({
    files: Schema.array(contractObject({
      name: Schema.string().min(1).required(),
      media_type: Schema.string().min(1).required(),
      bytes: Schema.array(Schema.natural().max(255).required()).min(1).required()
    }, { exact: true })).min(1).required()
  }, { exact: true });
  const imageResolveSchema = contractObject({ image_refs: Schema.array(imageRefSchema).required() }, { exact: true });
  const promptStartSchema = contractObject({ ...promptStartFields, draft: optional(taskDraftSchema) }, { exact: true });
  const translationStartSchema = contractObject({
    request_id: identifier().required(),
    workspace_id: identifier().required(),
    work_id: identifier().required(),
    branch_id: identifier().required(),
    field: Schema.union(['positive_prompt', 'negative_prompt']).required(),
    source_text: Schema.string().min(1).required()
  }, { exact: true });
  const translationLookupSchema = contractObject({ request_id: identifier().required() }, { exact: true });
  const recordResultSchema = Schema.array(workbenchRecordSchema).required();
  const imageImportResultSchema = contractObject({ images: Schema.array(imageRefSchema).required() }, { exact: true });
  const imageResolveResultSchema = contractObject({ images: Schema.array(imageSourceSchema).required() }, { exact: true });
  const editorUpdateSchema = contractObject({ expected: requiredNullable(taskDraftSchema), draft: requiredNullable(taskDraftSchema) }, { exact: true });
  const branchMetadataFields = {
    name: Schema.string().min(1).max(WORKBENCH_BRANCH_NAME_MAX_LENGTH).pattern(/\S/u),
    expectedName: Schema.string(),
    originalRequest: Schema.string().min(1).pattern(/\S/u),
    expectedOriginalRequest: Schema.string()
  };
  function branchMetadataPairs<Value extends Record<string, unknown>>(value: Value): Value {
    for (const [field, expected] of [['name', 'expectedName'], ['originalRequest', 'expectedOriginalRequest']] as const)
      if (Object.hasOwn(value, field) && !Object.hasOwn(value, expected))
        throw Object.assign(new TypeError(`Property ${expected} is required when ${field} is supplied`), { issues: [{ path: expected, message: `请同时提交 ${expected}。` }] });
    return value;
  }
  const branchMetadataSchema = transform(contractObject(branchMetadataFields), branchMetadataPairs, true).required();
  const branchSaveSchema = transform(contractObject({
    ...branchMetadataFields,
    expected: taskDraftSchema,
    expectedEditingDraft: requiredNullable(taskDraftSchema),
    draft: taskDraftSchema
  }, { exact: true }), branchMetadataPairs, true).required();
  const actionReceiptSchema = contractObject({
    workspaceId: identifier().required(),
    workId: identifier(),
    branchId: identifier(),
    taskId: identifier(),
    editingDraft: Schema.union([Schema.const(null), taskDraftSchema])
  }, { exact: true });
  const supplementalResultSchemas = {
    promptSaveCandidate: promptTurnSchema,
    promptPreview: promptRequestInputSchema,
    promptStart: promptTurnSchema,
    promptGet: promptTurnSchema,
    promptCancel: promptTurnSchema,
    promptAdopt: promptTurnSchema,
    promptList: Schema.array(promptTurnSchema).required(),
    mutate: actionReceiptSchema,
    queryRecords: recordResultSchema,
    importImages: imageImportResultSchema,
    resolveImages: imageResolveResultSchema,
    translateStart: translationResultSchema,
    translateGet: translationResultSchema,
    translateCancel: translationResultSchema
  };
  const subscriptionSchema = contractObject({ workspaceId: identifier().required(), workIds: Schema.array(identifier().required()) }, { exact: true });
  const requestSchemas = {
    promptSaveCandidate: promptAdoptSchema,
    subscribe: subscriptionSchema,
    promptPreview: promptStartSchema,
    promptStart: promptStartSchema,
    promptGet: promptLookupSchema,
    promptCancel: promptLookupSchema,
    promptAdopt: promptAdoptSchema,
    promptList: promptListSchema,
    queryRecords: queryRecordsSchema,
    importImages: imageImportSchema,
    resolveImages: imageResolveSchema,
    translateStart: translationStartSchema,
    translateGet: translationLookupSchema,
    translateCancel: translationLookupSchema,
    getRunInput: runInputSchema,
    getTaskDraft: taskDraftRequestSchema,
    saveTaskDraft: taskDraftSaveSchema,
    getInputDescription: inputDescriptionSchema,
    getProjection: scopeSchema,
    getEnvironment: environmentSchema,
    mutate: actionSchema
  };
  return {
    json,
    identifier,
    scopeSchema,
    environmentSchema,
    actionSchema,
    inputDescriptionResultSchema,
    runInputSchema,
    inputDescriptionSchema,
    taskDraftFields,
    taskDraftRequestSchema,
    taskDraftSaveSchema,
    taskDraftResultSchema,
    queryRecordsSchema,
    imageImportSchema,
    imageResolveSchema,
    promptStartSchema,
    translationStartSchema,
    translationLookupSchema,
    recordResultSchema,
    imageImportResultSchema,
    imageResolveResultSchema,
    editorUpdateSchema,
    branchSaveSchema,
    branchMetadataSchema,
    actionReceiptSchema,
    supplementalResultSchemas,
    subscriptionSchema,
    requestSchemas
  };
})();
const baseDataSchemas = {
  "agentModel": agent.agentModelSchema,
  "promptRequestParts": prompt.promptRequestPartsSchema,
  "promptLookup": prompt.promptLookupSchema,
  "promptList": prompt.promptListSchema,
  "promptAdopt": prompt.promptAdoptSchema,
  "promptRequestInput": prompt.promptRequestInputSchema,
  "promptTurn": prompt.promptTurnSchema,
  "generationJsonValue": generationJson.generationJsonValueSchema,
  "generationParameters": generationJson.generationParametersSchema,
  "loraWeight": lora.loraWeightSchema,
  "workflowRuntimeParameter": inspection.workflowRuntimeParameterSchema,
  "workflowRuntimeSizeCandidate": inspection.workflowRuntimeSizeCandidateSchema,
  "workflowRuntimeParameterInspection": inspection.workflowRuntimeParameterInspectionSchema,
  "functionBindingEditable": wb.functionBindingEditableSchema,
  "taskRequestResources": wb.taskRequestResourcesSchema,
  "taskRequestDraft": wb.taskRequestDraftSchema,
  "reviewDraft": wb.reviewDraftSchema,
  "reviewDraftUpdate": wb.reviewDraftUpdateSchema,
  "resourceRef": wb.resourceRefSchema,
  "promptResourceRef": wb.promptResourceRefSchema,
  "resourceSnapshot": wb.resourceSnapshotSchema,
  "imageRef": wb.imageRefSchema,
  "imageSource": wb.imageSourceSchema,
  "workflowImageBinding": wb.workflowImageBindingSchema,
  "experienceProvenance": wb.experienceProvenanceSchema,
  "referenceExperience": wb.referenceExperienceSchema,
  "inputReferences": wb.inputReferencesSchema,
  "generationInputBase": wb.generationInputBaseSchema,
  "generationInput": wb.generationInputSchema,
  "candidate": wb.candidateSchema,
  "promptInput": wb.promptInputSchema,
  "favoriteUpdate": wb.favoriteUpdateSchema,
  "experienceReuseInput": wb.experienceReuseInputSchema,
  "taskDraft": wb.taskDraftSchema,
  "taskArtifact": wb.taskArtifactSchema,
  "outputContract": wb.outputContractSchema,
  "experimentInputSource": wb.experimentInputSourceSchema,
  "taskInput": wb.taskInputSchema,
  "error": wb.errorSchema,
  "task": wb.taskSchema,
  "taskChildSummary": wb.taskChildSummarySchema,
  "storedArtifact": wb.storedArtifactSchema,
  "experience": wb.experienceSchema,
  "workbenchRunMedia": wb.workbenchRunMediaSchema,
  "workbenchRun": wb.workbenchRunSchema,
  "workbenchRecord": wb.workbenchRecordSchema,
  "taskGetRequest": wb.taskGetRequestSchema,
  "taskPublishRequest": wb.taskPublishRequestSchema,
  "taskPublishReceipt": wb.taskPublishReceiptSchema,
  "experiment": wb.experimentSchema,
  "experimentEndRequest": wb.experimentEndRequestSchema,
  "imageUpload": wb.imageUploadSchema,
  "workbenchRunInput": wb.workbenchRunInputSchema,
  "taskGetResult": wb.taskGetResultSchema,
  "functionListRequest": delegation.functionListRequestSchema,
  "functionListResult": delegation.functionListResultSchema,
  "delegateFunctionRequest": delegation.delegateFunctionRequestSchema,
  "delegateFunctionResult": delegation.delegateFunctionResultSchema,
  "generationRunError": runInput.generationRunErrorSchema,
  "generationRunInputModel": runInput.generationRunInputModelSchema,
  "generationRunInputLora": runInput.generationRunInputLoraSchema,
  "generationRunInputArguments": runInput.generationRunInputArgumentsSchema,
  "generationRunLookupError": runInput.generationRunLookupErrorSchema,
  "generationRunInput": runInput.generationRunInputSchema,
  "generationRunInputResult": runInput.generationRunInputResultSchema,
  "generationRunMediaImage": media.generationRunMediaImageSchema,
  "generationRunMedia": media.generationRunMediaSchema,
  "generationRunMediaResult": media.generationRunMediaResultSchema,
  "generationRunWaitReceipt": wait.generationRunWaitReceiptSchema,
  "generationRunWaitSummary": wait.generationRunWaitSummarySchema,
  "generationAcceptance": submission.generationAcceptanceSchema,
  "generationSubmissionResult": submission.generationSubmissionResultSchema,
  "imageReaderPrompt": image.imageReaderPromptSchema,
  "imageReaderDefaultPrompt": image.imageReaderDefaultPromptSchema,
  "cliParameterFileKey": parameterFiles.cliParameterFileKeySchema,
  "cliText": cli.cliTextSchema,
  "cliFilePath": cli.cliFilePathSchema,
  "cliStableId": cli.cliStableIdSchema,
  "cliInspectionId": cli.cliInspectionIdSchema,
  "cliRunIds": cli.cliRunIdsSchema,
  "cliSeedCount": cli.cliSeedCountSchema,
  "cliParameters": cli.cliParametersSchema,
  "cliModel": cli.cliModelSchema,
  "cliLoraTriggerWords": cli.cliLoraTriggerWordsSchema,
  "cliLora": cli.cliLoraSchema,
  "cliGenerationRequest": cli.cliGenerationRequestSchema,
  "cliSubmissionItem": cli.cliSubmissionItemSchema,
  "cliManifestItem": cli.cliManifestItemSchema,
  "cliSubmissionItems": cli.cliSubmissionItemsSchema,
  "translationResult": translation.translationResultSchema,
  "scope": remote.scopeSchema,
  "environment": remote.environmentSchema,
  "action": remote.actionSchema,
  "inputDescriptionResult": remote.inputDescriptionResultSchema,
  "runInput": remote.runInputSchema,
  "inputDescription": remote.inputDescriptionSchema,
  "taskDraftRequest": remote.taskDraftRequestSchema,
  "taskDraftSave": remote.taskDraftSaveSchema,
  "taskDraftResult": remote.taskDraftResultSchema,
  "queryRecords": remote.queryRecordsSchema,
  "imageImport": remote.imageImportSchema,
  "imageResolve": remote.imageResolveSchema,
  "promptStart": remote.promptStartSchema,
  "translationStart": remote.translationStartSchema,
  "translationLookup": remote.translationLookupSchema,
  "recordResult": remote.recordResultSchema,
  "imageImportResult": remote.imageImportResultSchema,
  "imageResolveResult": remote.imageResolveResultSchema,
  "editorUpdate": remote.editorUpdateSchema,
  "branchSave": remote.branchSaveSchema,
  "branchMetadata": remote.branchMetadataSchema,
  "actionReceipt": remote.actionReceiptSchema,
  "subscription": remote.subscriptionSchema
} as const;
export { wb, cli, results, remote, delegation, inspection, media, prompt, image, generationJson, parameterFiles, lora };
const cliSubmissionRequestItems = transform(Schema.array(cli.cliSubmissionItemSchema).min(1).max(GENERATION_MAX_SUBMISSION_ITEMS).required(), items => { const seen = new Set<string>(); return items.map(item => ({ ...item, request_id: parameterFiles.registerCliRequestId(seen, item.request_id, 'Generation items') })); }, true).required();
const cliRequestInputs = { ...cli.cliInputSchemas, 'generation submit': contractObject({ ...cli.cliGenerationSubmitFields, items: cliSubmissionRequestItems }, { exact: true }) } as const;
type CliRequestValue = {
  [Key in keyof typeof cliRequestInputs]: {
    command: Dotted<Key>;
  } & Parsed<(typeof cliRequestInputs)[Key]>;
}[keyof typeof cliRequestInputs];
const cliRequestSchema = refined(transform(Schema.any<unknown>().required(), value => normalizeCliRequest(value, (key, input) => resolveContext(cliRequestInputs[key as keyof typeof cliRequestInputs], input), Object.keys(cliRequestInputs)) as CliRequestValue, true).required(), value => {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > CLI_MAX_BODY_BYTES)
    throw Object.assign(new TypeError(`CLI request exceeds ${CLI_MAX_BODY_BYTES} bytes`), { code: 'CLI_REQUEST_TOO_LARGE' });
});
const cliGenerationManifestSchema = transform(cli.cliInputSchemas['generation submit'], value => value.items, true).required();
const generationRequestFields = {
  title: Schema.string().required(),
  instanceId: requiredNullable(Schema.string().required()),
  templateId: Schema.string().required(),
  model: defaulted(Schema.union([contractObject({ id: Schema.string().required(), fileName: Schema.string().required() }), Schema.const(null)]), null),
  parameters: generationJson.generationParametersSchema,
  loras: Schema.array(contractObject({
    id: Schema.string().required(),
    fileName: Schema.string().required(),
    weight: lora.loraWeightSchema,
    triggerWords: Schema.array(Schema.string().required()).required()
  })).required(),
  imageRefs: optional(Schema.array(wb.imageRefSchema)),
  workflowImageBindings: optional(Schema.array(wb.workflowImageBindingSchema))
};
const generationRequestSchema = contractObject(generationRequestFields);
const generationFieldMapping = {
  title: 'title',
  instance_id: { name: 'instanceId', omitNull: 'snake' as const },
  template_id: 'templateId',
  model: {
    name: 'model',
    omitNull: 'snake' as const,
    fields: { id: 'id', file_name: 'fileName' }
  },
  parameters: 'parameters',
  loras: {
    name: 'loras',
    array: true,
    fields: {
      id: 'id',
      file_name: 'fileName',
      weight: 'weight',
      trigger_words: 'triggerWords'
    }
  },
  image_refs: 'imageRefs',
  workflow_image_bindings: 'workflowImageBindings'
} as const;
const runtimeGenerationRequestSchema = transform(cli.cliGenerationRequestSchema, value => Schema.resolve(remapGeneration(value, 'camel', generationFieldMapping), generationRequestSchema, {})[0] as Parsed<typeof generationRequestSchema>, true).required();
const historicalGenerationRequestSchema = contractObject({ ...generationRequestFields, loras: defaulted(generationRequestFields.loras, []) });
const generationRunArgumentsSchema = transform(generationRequestSchema, value => Schema.resolve(remapGeneration(value, 'snake', generationFieldMapping), runInput.generationRunInputArgumentsSchema, {})[0] as Parsed<typeof runInput.generationRunInputArgumentsSchema>, true).required();
const cliArgumentsSchema = transform(contractObject({ argv: Schema.array(Schema.string().required()).required(), stdin: Schema.string().required() }, { exact: true }), value => parseCliArguments(value, request => resolveContext(cliRequestSchema, request), Object.keys(cliRequestInputs)) as CliRequestValue, true).required();
const IMAGE_READER_PROMPT_ISSUES = ['required', 'too-long'] as const;
const imageReaderPromptIssueValueSchema = Schema.union(IMAGE_READER_PROMPT_ISSUES).required();
const imageReaderPromptIssueSchema = transform(Schema.any(), value => {
  if (typeof value !== 'string' || !/\S/u.test(value))
    return IMAGE_READER_PROMPT_ISSUES[0];
  if (value.length > IMAGE_READER_PROMPT_MAX_LENGTH)
    return IMAGE_READER_PROMPT_ISSUES[1];
  return undefined;
}, true);
const fileReadSchema = contractObject({
  file_path: Schema.string().min(1).required(),
  offset: defaulted(Schema.natural(), 0),
  limit: defaulted(Schema.natural().min(1).max(roleConfiguration.fileRead.maxLines), roleConfiguration.fileRead.defaultLines),
  search: optional(Schema.string().min(1))
});
const fileWriteSchema = contractObject({ file_path: Schema.string().min(1).required(), content: Schema.string().required() });
const promptValidateSchema = contractObject({
  skill_name: Schema.string().min(1).required(),
  mode: optional(Schema.string()),
  help: defaulted(Schema.boolean(), false),
  input: optional(generationJson.generationJsonValueSchema)
});
const fileReadCommonFields = { file_path: Schema.string().required(), next_offset: requiredNullable(Schema.number().required()) };
const fileReadResultSchema = Schema.union([
  contractObject({
    ...fileReadCommonFields,
    entries: Schema.array(contractObject({ name: Schema.string().required(), kind: Schema.union(['directory', 'file']).required() }, { exact: true })).required(),
    total_entries: Schema.number().required()
  }, { exact: true }),
  contractObject({
    ...fileReadCommonFields,
    offset: Schema.number().required(),
    total_lines: Schema.number().required(),
    text: Schema.string().required(),
    matches: optional(Schema.array(contractObject({ line: Schema.number().required(), text: Schema.string().required() }, { exact: true })))
  }, { exact: true }),
]).required();
const fileWriteResultSchema = contractObject({ file_path: Schema.string().required() }, { exact: true });
const promptValidateResultSchema = contractObject({
  exit_code: Schema.number().required(),
  stdout: Schema.string().required(),
  stderr: Schema.string().required(),
  result: requiredNullable(generationJson.generationJsonValueSchema),
  draft_path: requiredNullable(Schema.string().required()),
  output_path: requiredNullable(Schema.string().required())
}, { exact: true });
const genericObjectSchema = jsonObjectSchema({ keySchema: Schema.string().min(1).required(), maxDepth: 64 });
const taskInputForKindInputSchema = refined(contractObject({ kind: Schema.union(TASK_KINDS).required(), value: wb.taskInputSchema }, { exact: true }), refineTaskInputForKind);
const taskInputForKindSchema = transform(taskInputForKindInputSchema, value => value.value, true).required();
const generationInputReadySchema = refined(wb.generationInputSchema, refineGenerationInputReady);
const functionBindingSchema = refined(contractObject({
  ...wb.functionBindingEditableFields,
  workspace_id: Schema.string().min(1).required(),
  function_id: Schema.string().min(1).required(),
  builtin: Schema.boolean().required()
}, { exact: true }), refineFunctionBinding);
const executionDraftSchema = contractObject({ mode: Schema.union(['once', 'continuous']).required(), max_runs: Schema.number().required() });
const workSchema = contractObject({
  work_id: Schema.string().required(),
  workspace_id: Schema.string().required(),
  name: Schema.string().required(),
  goal: Schema.string().required()
});
const branchSchema = contractObject({
  branch_id: Schema.string().required(),
  work_id: Schema.string().required(),
  parent_branch_id: requiredNullable(Schema.string().required()),
  name: Schema.string().required(),
  original_request: Schema.string().required(),
  source_run_id: requiredNullable(Schema.string().required()),
  source_artifact_id: requiredNullable(Schema.string().required()),
  source_experience_id: requiredNullable(Schema.string().required()),
  draft: wb.taskDraftSchema,
  editing_draft: requiredNullable(wb.taskDraftSchema),
  execution: executionDraftSchema
});
const favoriteSchema = contractObject({ target_type: Schema.union(WORKBENCH_FAVORITE_TARGET_TYPES).required(), target_id: Schema.string().required() });
const referenceDestinationSchema = contractObject({
  workspace_id: Schema.string().required(),
  work_id: Schema.string().required(),
  work_name: Schema.string().required(),
  branch_id: Schema.string().required(),
  branch_name: Schema.string().required()
});
const workbenchModelCatalogSchema = contractObject({
  default: agent.agentModelSchema,
  groups: Schema.array(contractObject({
    id: Schema.string().required(),
    name: Schema.string().required(),
    models: Schema.array(contractObject({
      id: Schema.string().required(),
      name: Schema.string().required(),
      reasoning: optional(contractObject({ efforts: Schema.array(contractObject({ id: Schema.string().required(), name: Schema.string().required() })).required(), defaultEffort: optional(Schema.string()) }))
    })).required()
  })).required(),
  routableProviders: Schema.array(Schema.string().required()).required(),
  failures: Schema.array(contractObject({
    id: Schema.string().required(),
    name: Schema.string().required(),
    message: Schema.string().required()
  })).required()
});
const workbenchProjectionSchema = contractObject({
  reference_destinations: Schema.array(referenceDestinationSchema).required(),
  workspace_id: Schema.string().required(),
  total_branch_count: Schema.number().required(),
  work_id: requiredNullable(Schema.string().required()),
  works: Schema.array(workSchema).required(),
  branches: Schema.array(branchSchema).required(),
  tasks: Schema.array(wb.taskSchema).required(),
  artifacts: Schema.array(wb.storedArtifactSchema).required(),
  runs: Schema.array(wb.workbenchRunSchema).required(),
  experiments: Schema.array(wb.experimentSchema).required(),
  experiences: Schema.array(wb.experienceSchema).required(),
  favorites: Schema.array(favoriteSchema).required(),
  functions: Schema.array(functionBindingSchema).required()
});
const workbenchEnvironmentSchema = contractObject({
  workspaces: Schema.array(contractObject({
    id: Schema.string().required(),
    name: Schema.string().required(),
    path: Schema.string().required()
  })).required(),
  presets: Schema.array(contractObject({
    id: Schema.string().required(),
    name: Schema.string().required(),
    broken: optional(Schema.string())
  })).required(),
  defaultPresetId: Schema.string().required(),
  models: workbenchModelCatalogSchema,
  skills: Schema.array(contractObject({ name: Schema.string().required(), description: Schema.string().required() })).required(),
  instances: Schema.array(contractObject({ id: Schema.string().required(), name: Schema.string().required() })).required()
});
const translationRecordFields = {
  ...contractFields(remote.translationStartSchema),
  session_id: Schema.string().required(),
  harness_turn: requiredNullable(Schema.number().required()),
  start_seq: Schema.number().required(),
  created_at: Schema.number().required(),
  finished_at: requiredNullable(Schema.number().required())
};
type TranslationRecordValue = Parsed<typeof remote.translationStartSchema> & Parsed<typeof translation.translationResultSchema> & ObjectValue<typeof translationRecordFields>;
const translationRecordSchema = Schema.union(translation.translationResultSchema.list!.map(branch => contractObject({ ...translationRecordFields, ...contractFields(branch) }))) as Schema<unknown, TranslationRecordValue, 'defined'>;
const workbenchUpdateSchema = contractObject({
  kind: Schema.union(['snapshot', 'change']).required(),
  sequence: Schema.number().required(),
  projection: workbenchProjectionSchema,
  promptTurns: Schema.array(prompt.promptTurnSchema).required(),
  translations: Schema.array(translationRecordSchema).required()
});
const requestTemplateSelectionFields = {
  kind: defaulted(Schema.string(), 'run'),
  block: optional(Schema.union(Object.keys(templateConfiguration.blocks) as TemplateBlockName[])),
};
const requestTemplateVariablesResultSchema = Schema.array(contractObject({ name: Schema.string().required(), label: Schema.string().required() }, { exact: true })).required();
const requestTemplateVariablesSchema = transform(contractObject(requestTemplateSelectionFields, { exact: true }), value => resolveValue(requestTemplateVariablesResultSchema, requestTemplateVariables(value.kind, value.block)) as Parsed<typeof requestTemplateVariablesResultSchema>, true).required();
const requestTemplateProblemSchema = transform(contractObject({ template: Schema.string().required(), ...requestTemplateSelectionFields }, { exact: true }), value => requestTemplateProblem(value.template, value.kind, value.block), true).required();
export const dataSchemas = {
  ...baseDataSchemas,
  executionDraft: executionDraftSchema,
  work: workSchema,
  branch: branchSchema,
  favorite: favoriteSchema,
  referenceDestination: referenceDestinationSchema,
  workbenchModelCatalog: workbenchModelCatalogSchema,
  workbenchProjection: workbenchProjectionSchema,
  workbenchEnvironment: workbenchEnvironmentSchema,
  workbenchUpdate: workbenchUpdateSchema,
  translationRequest: remote.translationStartSchema,
  translationRecord: translationRecordSchema,
  taskInputForKindInput: taskInputForKindInputSchema,
  taskInputForKind: taskInputForKindSchema,
  generationInputReady: generationInputReadySchema,
  functionBinding: functionBindingSchema,
  cliRequest: cliRequestSchema,
  cliGenerationManifest: cliGenerationManifestSchema,
  runtimeGenerationRequest: runtimeGenerationRequestSchema,
  generationRequest: generationRequestSchema,
  historicalGenerationRequest: historicalGenerationRequestSchema,
  generationRunArguments: generationRunArgumentsSchema,
  cliArguments: cliArgumentsSchema,
  imageReaderPromptIssue: imageReaderPromptIssueSchema,
  imageRefs: Schema.array(wb.imageRefSchema).required(),
  workflowImageBindings: Schema.array(wb.workflowImageBindingSchema).required(),
  catalogExtraValue: jsonValueSchema({ keySchema: Schema.string().required(), maxDepth: 100 }),
  loraWeightValid: transform(Schema.any(), value => lora.isLoraWeight(value), true),
  loraTriggerWordsUnique: transform(Schema.any(), value => Array.isArray(value) && lora.loraTriggerWordsAreUnique(value), true),
  catalogLoraTriggerWords: lora.catalogLoraTriggerWordsSchema,
  requestTemplateVariables: requestTemplateVariablesSchema,
  requestTemplateProblem: requestTemplateProblemSchema,
  generationRequestIdValid: transform(Schema.any(), value => typeof value === 'string' && GENERATION_REQUEST_ID.test(value), true),
  fileRead: fileReadSchema,
  fileReadResult: fileReadResultSchema,
  fileWrite: fileWriteSchema,
  fileWriteResult: fileWriteResultSchema,
  promptValidate: promptValidateSchema,
  promptValidateResult: promptValidateResultSchema,
  actionFields: genericObjectSchema,
  actionText: Schema.string().min(1).pattern(/\S/u).required(),
  resourceSnapshots: Schema.array(wb.resourceSnapshotSchema).required(),
};
export const dataOutputSchemas = {
  taskInputForKind: wb.taskInputSchema,
  generationInputReady: generationInputReadySchema,
  runtimeGenerationRequest: generationRequestSchema,
  historicalGenerationRequest: generationRequestSchema,
  generationRunArguments: runInput.generationRunInputArgumentsSchema,
  cliRequest: cliRequestSchema,
  cliArguments: cliRequestSchema,
  cliGenerationManifest: cli.cliSubmissionItemsSchema,
  loraWeightValid: Schema.boolean().required(),
  loraTriggerWordsUnique: Schema.boolean().required(),
  requestTemplateVariables: requestTemplateVariablesResultSchema,
  requestTemplateProblem: Schema.string().required(),
  generationRequestIdValid: Schema.boolean().required(),
  imageReaderPromptIssue: transform(Schema.any<unknown>(), value => value === undefined ? undefined : Schema.resolve(value, imageReaderPromptIssueValueSchema, {})[0] as typeof IMAGE_READER_PROMPT_ISSUES[number], true),
} as const;
const operation = <I extends Schema, O extends Schema>(input: I, output: O) => ({ input, output });
export const operationSchemas = {
  ...Object.fromEntries(Object.entries(cli.cliInputSchemas).map(([name, input]) => [name, operation(input, results.cliResultSchemas[name as keyof typeof results.cliResultSchemas])])) as {
    [Key in keyof typeof cli.cliInputSchemas]: {
      input: (typeof cli.cliInputSchemas)[Key];
      output: (typeof results.cliResultSchemas)[Key];
    };
  },
  'workbench_function_list': operation(delegation.functionListRequestSchema, delegation.functionListResultSchema),
  'workbench_function_delegate': operation(delegation.delegateFunctionRequestSchema, delegation.delegateFunctionResultSchema),
  'workbench_task_get': operation(wb.taskGetRequestSchema, wb.taskGetResultSchema),
  'workbench_task_publish': operation(wb.taskPublishRequestSchema, wb.taskPublishReceiptSchema),
  'workbench_experiment_end': operation(wb.experimentEndRequestSchema, wb.experimentSchema),
  'workbench_run_submit': operation(contractObject({ ...cli.cliGenerationSubmitFields, items: cliSubmissionRequestItems }), contractObject({ ...contractFields(results.cliResultSchemas['generation submit']), runs: contractFields(media.generationRunMediaResultSchema)!.runs! })),
  'workbench_run_media': operation(cliRequestInputs['generation resolve-media'], media.generationRunMediaResultSchema),
  'workbench_run_inputs': operation(cliRequestInputs['generation run-inputs'], runInput.generationRunInputResultSchema),
  'workbench_workflow_parameters': operation(cliRequestInputs['generation inspect-template-parameters'], inspection.workflowRuntimeParameterInspectionSchema),
  'workbench_image_read': operation(cliRequestInputs['image inspect'], results.cliResultSchemas['image inspect']),
  'workbench_file_read': operation(fileReadSchema, fileReadResultSchema),
  'workbench_file_write': operation(fileWriteSchema, fileWriteResultSchema),
  'workbench_prompt_validate': operation(promptValidateSchema, promptValidateResultSchema),
} as const;
export const remoteMethods = remote.requestSchemas;
export const remoteResultSchemas = {
  ...remote.supplementalResultSchemas,
  getRunInput: wb.workbenchRunInputSchema,
  getTaskDraft: requiredNullable(wb.taskRequestDraftSchema),
  saveTaskDraft: wb.taskRequestDraftSchema,
  getInputDescription: requiredNullable(inspection.workflowRuntimeParameterInspectionSchema),
  getProjection: workbenchProjectionSchema,
  getEnvironment: workbenchEnvironmentSchema,
  subscribe: workbenchUpdateSchema
} as const;
export function remoteOutput<Method extends keyof typeof remote.requestSchemas>(method: Method) { return remoteResultSchemas[method]; }
function parseData(id: string, value: unknown): unknown {
  const schema = dataSchemas[id as keyof typeof dataSchemas];
  if (!schema)
    throw new TypeError('Unknown contract ' + id);
  return resolveContext(schema, value);
}

import libraryConfig from './library-config.json' with { type: 'json' }
import type { CatalogKind as CatalogResourceKind } from '../catalog/contract.ts'
import type { StandardRuntimeParameterKind } from '../generation/inspection-contract.ts'
import type { JsonValue } from '../shared/json-contract.ts'

export type { JsonValue }
const RUN_REVIEW_FUNCTION_KINDS = ['review', 'compare', 'diagnose', 'experience'] as const
export type RunReviewFunctionKind = typeof RUN_REVIEW_FUNCTION_KINDS[number]
const BRANCH_NON_GENERATION_TASK_KINDS = ['prompt', 'parameters', 'resources'] as const
export type BranchNonGenerationTaskKind = typeof BRANCH_NON_GENERATION_TASK_KINDS[number]
export type TaskKind = BranchNonGenerationTaskKind | RunReviewFunctionKind | 'run' | 'experiment'
export function isRunReviewFunctionKind(kind: TaskKind): kind is RunReviewFunctionKind { return RUN_REVIEW_FUNCTION_KINDS.some(reviewKind => reviewKind === kind) }
export type TaskStatus = 'pending' | 'running' | 'waiting_input' | 'waiting_generation' | 'needs_attention' | 'paused' | 'interrupted' | 'succeeded' | 'failed'
export type ArtifactType = ArtifactPayload['type']
export type ArtifactDisposition = 'applied' | 'candidate' | 'recorded' | 'waiting_input'
export type ExecutionState = 'pending' | 'running' | 'idle' | 'interrupted' | 'failed'
export type CatalogKind = CatalogResourceKind
export const WORKBENCH_RESOURCE_KINDS = ['model', 'lora', 'comfyui-template'] as const
export interface ResourceRef { kind: typeof WORKBENCH_RESOURCE_KINDS[number]; id: string }
export interface ImageRef { image_ref_id: string; source: { kind: 'run_media'; run_id: string; media_id: string } | { kind: 'uploaded_file'; file_id: string }; purpose: 'workflow' | 'agent' | 'both'; reference_requirement: string }
export interface ImageSource { image_ref_id: string; file_path: string | null; name: string; url: string | null; error?: string }
export interface WorkflowImageBinding { parameter_id: string; image_ref_ids: string[] }
export interface ExperienceProvenance { created_by_task_id: string | null; evidence: { run_id: string; generation_task_id: string | null; role: 'supporting_evidence' | 'counterexample' }[] }
export interface ReferenceExperience { experience_id: string; title: string; conditions: string; note: string; provenance: ExperienceProvenance }
export interface InputReferences { reference_task_ids: string[]; reference_run_ids: string[]; reference_experiences: ReferenceExperience[]; image_refs: ImageRef[]; workflow_image_bindings: WorkflowImageBinding[] }
export interface ReferenceTaskArtifact { task_id: string; artifact_id: string; artifact: ArtifactPayload }
export type FunctionKind = TaskKind | 'translate'
export interface PromptInput { positive_prompt: string | null; negative_prompt: string | null }
export interface GenerationInputBase {
  title: string
  instance_id: string | null
  template_id: string | null
  model: { id: string; file_name: string } | null
  parameters: Record<string, JsonValue>
  loras: { id: string; file_name: string; weight: number; trigger_words: string[] }[]
}
export interface GenerationInput extends GenerationInputBase {
  image_refs?: ImageRef[]
  workflow_image_bindings?: WorkflowImageBinding[]
}
export interface ImageUpload { image_ref_id: string; parameter_id: string; instance_id: string; name: string; subfolder: string; type: 'input' }
export interface WorkbenchRunInput {
  submitted_input: GenerationInput
  effective_input: GenerationInput | null
  image_uploads: ImageUpload[]
  parameter_mapping: ParameterMapping
  base_model_id: string | null
  run_id: string
  branch_id: string
  generation_input: GenerationInput
  image_refs: ImageRef[]
  workflow_image_bindings: WorkflowImageBinding[]
  input_description: import('../generation/inspection-contract.ts').WorkflowRuntimeParameterInspection | null
  prompt_input: PromptInput
}

export type ParameterMapping = Record<string, StandardRuntimeParameterKind> | null
export function isBranchNonGenerationTaskKind(kind: TaskKind): kind is BranchNonGenerationTaskKind { return BRANCH_NON_GENERATION_TASK_KINDS.some(branchKind => branchKind === kind) }

export interface WorkbenchRecordQuery { type: 'task' | 'run' | 'experience' | 'favorite'; workspaceId?: string; workId?: string; taskId?: string; keyword?: string }
export interface WorkbenchRecord { type: 'task' | 'run' | 'experience'; id: string; workspace_id: string | null; work_id: string | null; branch_id: string | null; task_id: string | null; title: string; base_model_id?: string | null; task?: Task; artifacts?: StoredArtifact[]; runs?: WorkbenchRun[]; run?: WorkbenchRun; experience?: Experience }
export interface TaskDraft extends InputReferences { prompt_edit_task_id?: string | null; prompt_change_request?: string; prompt_input: PromptInput; generation_input: GenerationInputBase; parameter_mapping: ParameterMapping; base_model_id: string | null; instructions: string }

export interface TaskRequestDraft {
  instructions: string
  resources: { instance_id?: string | null; template_id?: string | null }
}
export interface ExecutionDraft { mode: 'once' | 'continuous'; max_runs: number }
export interface AgentModel { provider: string; model: string; reasoningEffort?: string }

export interface WorkbenchModelCatalog {
  default: AgentModel
  groups: { id: string; name: string; models: { id: string; name: string; reasoning?: { efforts: { id: string; name: string }[]; defaultEffort?: string } }[] }[]
  routableProviders: string[]
  failures: { id: string; name: string; message: string }[]
}
export type WorkbenchModelGroup = WorkbenchModelCatalog['groups'][number]
export interface ReviewDraft {
  verdict: 'unrated' | 'met' | 'needs-work'
  observation: string
  conclusion: string
  title: string
  conditions: string
  note: string
  evidence_run_ids: string[]
  review_artifact_id: string | null
  experience_artifact_id: string | null
  experience_id: string | null
}

export interface ReviewDraftUpdate { expected: ReviewDraft; draft: ReviewDraft }
export interface SavedReview { verdict: ReviewDraft['verdict']; observation: string; conclusion: string; source_artifact_id: string | null }
export interface EvaluationInput { run_id: string; verdict: ReviewDraft['verdict']; observation: string; conclusion: string; experience: { title: string; conditions: string; note: string } }
export type ExperimentInputSource = { type: 'initial' } | { type: 'candidate'; artifact_id: string } | { type: 'run'; run_id: string }
export interface TaskInput extends Omit<TaskDraft, 'instructions'> {
  delegation_source?: ExperimentInputSource
  requirements: { original_request: string; instructions: string }
  reference_task_artifacts: ReferenceTaskArtifact[]
  evaluation_input?: EvaluationInput
  requested_skill: string | null
  max_runs: number
}
export interface OutputContract {
  artifact_types: ArtifactType[]
  required_artifact_types: ArtifactType[]
  parameter_ids: string[]
  apply_mode: 'automatic' | 'candidate' | 'record'
  requires_finished_runs: boolean
}
export interface FunctionDescriptor { kind: FunctionKind; execution_mode?: 'task' | 'text'; name: string; default_request_template: string; output_contract: OutputContract; ui_location: string; ui_result: string }
export interface FunctionBindingEditable {
  name: string
  kind: FunctionKind
  preset_id: string
  agent_model: AgentModel
  requested_skill: string | null
  request_template: string
  request_parts?: import('./request-template.ts').PromptRequestParts
}
export interface FunctionBinding extends FunctionBindingEditable {
  workspace_id: string
  function_id: string
  builtin: boolean
}
export interface BindingSnapshot { function_id: string; name: string; kind: FunctionKind | 'rewrite'; preset_id: string; agentModel: AgentModel; requested_skill: string | null; request_template: string; request_parts?: import('./request-template.ts').PromptRequestParts }
export interface ApplyTarget { kind: 'branch' | 'run_review'; id: string; expected: Record<string, JsonValue> }
export interface Work { work_id: string; workspace_id: string; name: string; goal: string }
export interface Branch {
  branch_id: string
  work_id: string
  parent_branch_id: string | null
  name: string
  original_request: string
  source_run_id: string | null
  source_artifact_id: string | null
  source_experience_id: string | null
  draft: TaskDraft
  editing_draft: TaskDraft | null
  execution: ExecutionDraft
}
export interface TaskAnswer { question_artifact_id: string; answer: string }
export interface Task {
  task_id: string
  parent_experiment_task_id: string | null
  branch_id: string
  function_id: string
  title: string
  kind: TaskKind
  status: TaskStatus
  input: TaskInput
  output_contract: OutputContract
  apply_target: ApplyTarget
  binding_snapshot: BindingSnapshot
  session_id: string | null
  request_text: string
  selected_model: Record<string, JsonValue> | null
  answers: TaskAnswer[]
  error: { code: string; message: string } | null
  created_at: number
  updated_at: number
  execution_state: ExecutionState
  initiator: 'human' | 'agent'
  retry_of_run_id: string | null
}

export interface TaskChildSummary extends Pick<Task, 'task_id' | 'function_id' | 'kind' | 'title' | 'status' | 'session_id' | 'execution_state' | 'error'> {
  preset_id: string
  agent_model: AgentModel
}
export type ArtifactPayload = (
  | ({ type: 'prompt' } & PromptInput)
  | { type: 'parameters'; parameters: Record<string, JsonValue> }
  | { type: 'generation_input'; generation_input: GenerationInputBase; image_refs?: ImageRef[]; workflow_image_bindings?: WorkflowImageBinding[]; plan_artifact_id?: string | null }
  | { type: 'iteration_plan'; source_run_id: string; changes: string[]; reason: string; expected_result: string }
  | { type: 'resources'; refs: ResourceRef[]; reason?: string }
  | { type: 'review'; observation: string; conclusion: string; run_ids: string[]; candidate?: { generation_input: GenerationInputBase; image_refs?: ImageRef[]; workflow_image_bindings?: WorkflowImageBinding[] } }
  | { type: 'experience'; title: string; conditions: string; note: string; base_model_id: string | null; model_id: string | null; run_ids: string[] }
  | { type: 'question'; question: string; options: string[] }
) & { source_files?: string[] }
export interface SkillReadRef { name: string; session_id: string; turn: number; call_id: string; source_file: string | null }
export interface StoredArtifact {
  artifact_id: string
  task_id: string
  type: ArtifactType
  artifact: ArtifactPayload
  source_files: string[]
  session_id: string
  turn: number
  call_id: string
  skill_refs: SkillReadRef[]
  disposition: ArtifactDisposition
  applied_target: { kind: string; id: string; fields: string[] } | null
  created_at: number
}
export interface PublishReceipt { task_id: string; artifact_id: string; disposition: ArtifactDisposition }
export interface WorkbenchIdentity { workspaceId: string; sessionId: string; turn: number; callId: string }
export interface WorkbenchRunMedia { media_id: string; run_id: string; filename: string; media_type: string; media_kind: string; byte_size: number; url?: string; download_url?: string }
export interface WorkbenchRun {
  session_id: string
  created_at: number
  updated_at: number
  media: WorkbenchRunMedia[]
  run_id: string
  workbench_task_id: string
  execution_task_id: string | null
  iteration_index: number | null
  status: import('../generation/run-status.ts').GenerationRunStatus
  title: string
  generation_input: GenerationInput
  candidate_artifact_id: string | null
  review_artifact_id: string | null
  retry_of_run_id: string | null
  initiator: 'human' | 'agent'
  review: SavedReview | null
  review_draft: ReviewDraft | null
  error: { code: string; message: string } | null
}
export interface Experiment { task_id: string; control_state: 'running' | 'paused' | 'ended' | 'completed'; end_reason: 'goal_met' | 'budget_used' | 'user_ended' | null; submitted_count: number; max_runs: number }
export interface Experience {
  experience_id: string
  work_id: string | null
  branch_id: string | null
  task_id: string | null
  provenance: ExperienceProvenance
  title: string
  conditions: string
  note: string
  base_model_id: string | null
  model_id: string | null
  evidence_run_ids: string[]
  source_run_id: string | null
  source_experience_id: string | null
  source_artifact_id: string | null
}
export const WORKBENCH_BRANCH_NAME_MAX_LENGTH = libraryConfig.branchNameMaxLength
export const WORKBENCH_FAVORITE_TARGET_TYPES = ['run', 'experience'] as const

export interface FavoriteUpdate { targetType: Favorite['target_type']; favorite: boolean }
export interface ExperienceReuseInput { name: string; baseModelId: string | null }

export interface Favorite { target_type: typeof WORKBENCH_FAVORITE_TARGET_TYPES[number]; target_id: string }
export interface WorkbenchViewState {
  workspace_id: string | null; work_id: string | null; branch_id: string | null
  page: string; selected_run_id: string | null; inspect_run: boolean; compare_run_id: string | null
  catalog_filters: Record<string, JsonValue>; scroll_positions: Record<string, JsonValue>; expanded_branches: string[]; preset_override: string | null
}
export interface ReferenceDestination { workspace_id: string; work_id: string; work_name: string; branch_id: string; branch_name: string }
export interface WorkbenchProjection {
  reference_destinations: ReferenceDestination[]
  workspace_id: string
  total_branch_count: number
  work_id: string | null
  works: Work[]
  branches: Branch[]
  tasks: Task[]
  artifacts: StoredArtifact[]
  runs: WorkbenchRun[]
  experiments: Experiment[]
  experiences: Experience[]
  favorites: Favorite[]
  functions: FunctionBinding[]
}
export interface TaskGetCommon extends Omit<TaskInput, 'generation_input' | 'parameter_mapping'> {
  image_sources: ImageSource[]
  task_id: string; parent_experiment_task_id: string | null; children: TaskChildSummary[]; status: TaskStatus; output_contract: OutputContract
  artifacts: { task_id: string; artifact_id: string; artifact: ArtifactPayload; disposition: ArtifactDisposition }[]
  iterations: { index: number; run_id: string; execution_task_id: string | null; generation_input: GenerationInput; image_refs: ImageRef[]; workflow_image_bindings: WorkflowImageBinding[]; review_artifact_id: string | null }[]
  answers: TaskAnswer[]
}

export interface BranchNonGenerationTaskGetResult extends TaskGetCommon { kind: BranchNonGenerationTaskKind; generation_input: GenerationInputBase; unresolved_parameters: Record<string, JsonValue> }
export interface GenerationTaskGetResult extends TaskGetCommon { kind: 'run' | 'experiment'; generation_input: GenerationInputBase }
export interface HistoricalTaskGetResult extends TaskGetCommon { kind: RunReviewFunctionKind; generation_input: GenerationInputBase }
export type TaskGetResult = BranchNonGenerationTaskGetResult | GenerationTaskGetResult | HistoricalTaskGetResult

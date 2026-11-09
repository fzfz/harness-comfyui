import libraryConfig from './library-config.json' with { type: 'json' }
import type { CatalogKind as CatalogResourceKind } from '../catalog/contract.ts'
import type { StandardRuntimeParameterKind } from '../generation/inspection-contract.ts'
import type { JsonValue } from '../shared/json-contract.ts'

export type { JsonValue }
const RUN_REVIEW_FUNCTION_KINDS = ['review', 'compare', 'diagnose', 'experience'] as const
export type RunReviewFunctionKind = typeof RUN_REVIEW_FUNCTION_KINDS[number]
const BRANCH_NON_GENERATION_TASK_KINDS = ['prompt', 'rewrite', 'parameters', 'resources'] as const
export type BranchNonGenerationTaskKind = typeof BRANCH_NON_GENERATION_TASK_KINDS[number]
export type TaskKind = BranchNonGenerationTaskKind | RunReviewFunctionKind | 'run' | 'experiment'
export function isRunReviewFunctionKind(kind: TaskKind): kind is RunReviewFunctionKind { return RUN_REVIEW_FUNCTION_KINDS.some(reviewKind => reviewKind === kind) }
export type TaskStatus = 'pending' | 'running' | 'waiting_input' | 'waiting_generation' | 'needs_attention' | 'paused' | 'interrupted' | 'succeeded' | 'failed'
export type ArtifactType = ArtifactPayload['type']
export type ArtifactDisposition = 'applied' | 'candidate' | 'recorded' | 'waiting_input'
export type ExecutionState = 'pending' | 'running' | 'idle' | 'interrupted' | 'failed'
export type CatalogKind = CatalogResourceKind
export type ContextKind = Exclude<CatalogKind, 'model' | 'lora' | 'comfyui-template'>
export interface ContextRef { kind: ContextKind; id: string }
export interface ResourceRef { kind: CatalogKind; id: string }
export interface PromptInput { positive_prompt: string | null; negative_prompt: string | null }
export interface GenerationInput {
  title: string
  instance_id: string | null
  template_id: string | null
  model: { id: string; file_name: string } | null
  parameters: Record<string, JsonValue>
  loras: { id: string; file_name: string; weight: number; trigger_words: string[] }[]
}
export interface WorkbenchRunInput {
  run_id: string
  branch_id: string
  generation_input: GenerationInput
  context_refs: ContextRef[]
  input_description: import('../generation/inspection-contract.ts').WorkflowRuntimeParameterInspection | null
  prompt_input: PromptInput
}

export type ParameterMapping = Record<string, StandardRuntimeParameterKind> | null
export function isBranchNonGenerationTaskKind(kind: TaskKind): kind is BranchNonGenerationTaskKind { return BRANCH_NON_GENERATION_TASK_KINDS.some(branchKind => branchKind === kind) }
export interface TaskDraft { prompt_input: PromptInput; generation_input: GenerationInput; parameter_mapping: ParameterMapping; context_refs: ContextRef[]; base_model_id: string | null }

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
export interface TaskInput extends TaskDraft {
  requirements: { original_request: string; instructions: string }
  reference_run_ids: string[]
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
export interface FunctionDescriptor { kind: TaskKind; name: string; default_request_template: string; output_contract: OutputContract; ui_location: string; ui_result: string }
export interface FunctionBindingEditable {
  name: string
  kind: TaskKind
  preset_id: string
  agent_model: AgentModel
  requested_skill: string | null
  request_template: string
}
export interface FunctionBinding extends FunctionBindingEditable {
  workspace_id: string
  function_id: string
  builtin: boolean
}
export interface BindingSnapshot { function_id: string; name: string; kind: TaskKind; preset_id: string; agentModel: AgentModel; requested_skill: string | null; request_template: string }
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
  execution: ExecutionDraft
}
export interface TaskAnswer { question_artifact_id: string; answer: string }
export interface Task {
  task_id: string
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
export type ArtifactPayload = (
  | ({ type: 'prompt' } & PromptInput)
  | { type: 'parameters'; parameters: Record<string, JsonValue> }
  | { type: 'generation_input'; generation_input: GenerationInput; context_refs: ContextRef[] }
  | { type: 'resources'; refs: ResourceRef[]; reason?: string }
  | { type: 'review'; observation: string; conclusion: string; run_ids: string[]; candidate?: { generation_input: GenerationInput; context_refs: ContextRef[] } }
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
  work_id: string
  branch_id: string
  task_id: string | null
  title: string
  conditions: string
  note: string
  base_model_id: string | null
  model_id: string | null
  evidence_run_ids: string[]
  source_run_id: string
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
export interface WorkbenchProjection {
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
  refreshAfterMs: number
}
export interface TaskGetCommon extends Omit<TaskInput, 'generation_input' | 'parameter_mapping'> {
  task_id: string; status: TaskStatus; output_contract: OutputContract
  artifacts: { artifact_id: string; artifact: ArtifactPayload; disposition: ArtifactDisposition }[]
  iterations: { index: number; run_id: string; generation_input: GenerationInput; context_refs: ContextRef[]; review_artifact_id: string | null }[]
  answers: TaskAnswer[]
}

export interface BranchNonGenerationTaskGetResult extends TaskGetCommon { kind: BranchNonGenerationTaskKind; generation_input: GenerationInput; unresolved_parameters: Record<string, JsonValue> }
export interface GenerationTaskGetResult extends TaskGetCommon { kind: 'run' | 'experiment'; generation_input: GenerationInput }
export interface HistoricalTaskGetResult extends TaskGetCommon { kind: RunReviewFunctionKind; generation_input: GenerationInput }
export type TaskGetResult = BranchNonGenerationTaskGetResult | GenerationTaskGetResult | HistoricalTaskGetResult

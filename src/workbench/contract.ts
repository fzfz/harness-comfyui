import type { JsonValue } from '#contracts'
import type { ContractValue } from '#contracts'
import libraryConfig from './library-config.json' with { type: 'json' }
import { CATALOG_KIND_DEFINITIONS, type CatalogKind as CatalogResourceKind } from '../catalog/definitions.ts'



const RUN_REVIEW_FUNCTION_KINDS = ['review', 'compare', 'diagnose', 'experience'] as const
export type RunReviewFunctionKind = typeof RUN_REVIEW_FUNCTION_KINDS[number]
const BRANCH_NON_GENERATION_TASK_KINDS = ['prompt', 'parameters', 'resources'] as const
export type BranchNonGenerationTaskKind = typeof BRANCH_NON_GENERATION_TASK_KINDS[number]
export type TaskKind = BranchNonGenerationTaskKind | RunReviewFunctionKind | 'run' | 'experiment'
export function isRunReviewFunctionKind(kind: TaskKind): kind is RunReviewFunctionKind { return RUN_REVIEW_FUNCTION_KINDS.some(reviewKind => reviewKind === kind) }
export type TaskStatus = Task['status']
export type ArtifactType = ArtifactPayload['type']
export type ArtifactDisposition = StoredArtifact['disposition']
export type ExecutionState = Task['execution_state']
export type CatalogKind = CatalogResourceKind
export const WORKBENCH_RESOURCE_KINDS = CATALOG_KIND_DEFINITIONS.map(definition => definition.kind)
export type PromptResourceKind = Exclude<CatalogKind, 'model' | 'lora' | 'comfyui-template'>
export type ResourceRef = ContractValue<'resourceRef'>
export type PromptResourceRef = ContractValue<'promptResourceRef'>
export type ResourceSnapshot = ContractValue<'resourceSnapshot'>
export type ImageRef = ContractValue<'imageRef'>
export type ImageSource = ContractValue<'imageSource'>
export type WorkflowImageBinding = ContractValue<'workflowImageBinding'>
export type ExperienceProvenance = ContractValue<'experienceProvenance'>
export type ReferenceExperience = ContractValue<'referenceExperience'>
export type InputReferences = ContractValue<'inputReferences'>
export type ReferenceTaskArtifact = TaskInput['reference_task_artifacts'][number]
export type FunctionKind = TaskKind | 'translate'
export type PromptInput = ContractValue<'promptInput'>
export type GenerationInputBase = ContractValue<'generationInputBase'>
export type GenerationInput = ContractValue<'generationInput'>
export type ImageUpload = ContractValue<'imageUpload'>
export type WorkbenchRunInput = ContractValue<'workbenchRunInput'>

export type ParameterMapping = TaskDraft['parameter_mapping']
export function isBranchNonGenerationTaskKind(kind: TaskKind): kind is BranchNonGenerationTaskKind { return BRANCH_NON_GENERATION_TASK_KINDS.some(branchKind => branchKind === kind) }

export type WorkbenchRecordQuery = ContractValue<'queryRecords'>
export type WorkbenchRecord = ContractValue<'workbenchRecord'>
export type TaskDraft = ContractValue<'taskDraft'>

export type TaskRequestDraft = ContractValue<'taskRequestDraft'>
export type ExecutionDraft = ContractValue<'executionDraft'>
export type AgentModel = ContractValue<'agentModel'>

export type WorkbenchModelCatalog = ContractValue<'workbenchModelCatalog'>
export type WorkbenchModelGroup = WorkbenchModelCatalog['groups'][number]
export type ReviewDraft = ContractValue<'reviewDraft'>

export type ReviewDraftUpdate = ContractValue<'reviewDraftUpdate'>
export type SavedReview = NonNullable<WorkbenchRun['review']>
export type EvaluationInput = NonNullable<TaskInput['evaluation_input']>
export type ExperimentInputSource = ContractValue<'experimentInputSource'>
export type TaskInput = ContractValue<'taskInput'>
export type OutputContract = ContractValue<'outputContract'>
export interface FunctionDescriptor { kind: FunctionKind; execution_mode?: 'task' | 'text'; name: string; default_request_template: string; output_contract: OutputContract; ui_location: string; ui_result: string }
export type FunctionBindingEditable = ContractValue<'functionBindingEditable'>
export type FunctionBinding = ContractValue<'functionBinding'>
export type BindingSnapshot = Task['binding_snapshot']
export type ApplyTarget = Task['apply_target']
export type Work = ContractValue<'work'>
export type Branch = ContractValue<'branch'>
export type TaskAnswer = Task['answers'][number]
export type Task = ContractValue<'task'>

export type TaskChildSummary = ContractValue<'taskChildSummary'>
export type ArtifactPayload = ContractValue<'taskArtifact'>
export type SkillReadRef = StoredArtifact['skill_refs'][number]
export type StoredArtifact = ContractValue<'storedArtifact'>
export type PublishReceipt = ContractValue<'taskPublishReceipt'>
export interface WorkbenchIdentity { workspaceId: string; sessionId: string; turn: number; callId: string }
export type WorkbenchRunMedia = ContractValue<'workbenchRunMedia'>
export type WorkbenchRun = ContractValue<'workbenchRun'>
export type Experiment = ContractValue<'experiment'>
export type Experience = ContractValue<'experience'>
export const WORKBENCH_BRANCH_NAME_MAX_LENGTH = libraryConfig.branchNameMaxLength
export const WORKBENCH_FAVORITE_TARGET_TYPES = ['run', 'experience'] as const

export type FavoriteUpdate = ContractValue<'favoriteUpdate'>
export type ExperienceReuseInput = ContractValue<'experienceReuseInput'>

export type Favorite = ContractValue<'favorite'>
export interface WorkbenchViewState {
  workspace_id: string | null; work_id: string | null; branch_id: string | null
  page: string; selected_run_id: string | null; inspect_run: boolean; compare_run_id: string | null
  catalog_filters: Record<string, JsonValue>; scroll_positions: Record<string, JsonValue>; expanded_branches: string[]; preset_override: string | null
}
export type ReferenceDestination = ContractValue<'referenceDestination'>
export type WorkbenchProjection = ContractValue<'workbenchProjection'>

export type BranchNonGenerationTaskGetResult = Extract<TaskGetResult, { kind: BranchNonGenerationTaskKind }>
export type GenerationTaskGetResult = Extract<TaskGetResult, { kind: 'run' | 'experiment' }>
export type HistoricalTaskGetResult = Extract<TaskGetResult, { kind: RunReviewFunctionKind }>
export type TaskGetResult = ContractValue<'taskGetResult'>

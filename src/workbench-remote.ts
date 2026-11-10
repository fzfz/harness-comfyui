import Schema from '@deepseek-ai/schemastery'
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkbenchProjection, WorkbenchModelCatalog, TaskRequestDraft, WorkbenchRunInput, WorkbenchRecord, WorkbenchRecordQuery, ImageRef, ImageSource, GenerationInput, TaskDraft } from './workbench/contract.ts'
import { jsonValueSchema } from './shared/json-contract.ts'
import { workflowRuntimeParameterInspectionSchema, type WorkflowRuntimeParameterInspection } from './generation/inspection-contract.ts'
import { contractObject, requiredNullable } from './shared/field-contract.ts'
import { functionBindingEditableSchema, favoriteUpdateSchema, experienceReuseInputSchema, reviewDraftUpdateSchema, taskDraftSchema, taskRequestDraftSchema, workbenchRunInputSchema, imageRefSchema, generationInputSchema, imageSourceSchema, workbenchRecordSchema } from './workbench/schema.ts'

import { translationResultSchema, type TranslationRequest, type TranslationResult } from './workbench/translation.ts'
export interface WorkbenchImageImportRequest { files: { name: string; media_type: string; bytes: number[] }[] }
export interface WorkbenchImageResolveRequest { image_refs: ImageRef[] }
export interface WorkbenchTranslationLookup { request_id: string }

export const WORKBENCH_REMOTE_NAMESPACE = 'harnessComfyuiWorkbenchRemote'
export const WORKBENCH_REMOTE_SERVICE = `remote.${WORKBENCH_REMOTE_NAMESPACE}`
export interface WorkbenchScope { workspaceId: string; workId?: string; branchId?: string }

export interface WorkbenchActionReceipt extends WorkbenchScope { taskId?: string; editingDraft?: TaskDraft | null }
export interface WorkbenchTaskDraftRequest extends WorkbenchScope { workId: string; branchId: string; functionId: string }
export interface WorkbenchSaveTaskDraftRequest extends WorkbenchTaskDraftRequest { draft: TaskRequestDraft }
export const WORKBENCH_ACTION_TYPES = ["new-workspace", "new-work", "save-draft", "edit-draft", "create-branch", "update-execution", "run", "experiment", "pause-experiment", "resume-experiment", "stop-experiment", "retry", "favorite", "update-review-draft", "evaluate", "reuse", "agent-action", "function-add", "function-edit", "function-remove", "function-preset", "resource-select", "resource-remove", "task-interrupt", "task-resume", "task-answer", "task-apply", "task-generation-apply", "task-branch"] as const
export type ExperimentActionType = typeof WORKBENCH_ACTION_TYPES[number]
export interface ExperimentWorkbenchAction extends WorkbenchScope {
  readonly type: ExperimentActionType
  readonly runId?: string
  readonly referenceRunIds?: readonly string[]
  readonly taskId?: string
  readonly id?: string
  readonly field?: string
  readonly value?: unknown
  readonly expectedValue?: string
}
export interface WorkbenchEnvironment {
  workspaces: { id: string; name: string; path: string }[]
  presets: { id: string; name: string; broken?: string }[]
  defaultPresetId: string
  models: WorkbenchModelCatalog
  skills: { name: string; description: string }[]
  instances: { id: string; name: string }[]
}
export interface WorkbenchEnvironmentRequest { workspaceId?: string; presetId?: string }
export interface WorkbenchRunInputRequest { workspaceId: string; workId: string; runId: string }

export interface WorkbenchInputDescriptionRequest extends WorkbenchScope { workId: string; branchId: string; generationInput?: GenerationInput }
export interface WorkbenchRemoteMethods {
  queryRecords(request: WorkbenchRecordQuery): Promise<RemoteResult<WorkbenchRecord[]>>
  importImages(request: WorkbenchImageImportRequest): Promise<RemoteResult<{ images: ImageRef[] }>>
  resolveImages(request: WorkbenchImageResolveRequest): Promise<RemoteResult<{ images: ImageSource[] }>>
  translateStart(request: TranslationRequest): Promise<RemoteResult<TranslationResult>>
  translateGet(request: WorkbenchTranslationLookup): Promise<RemoteResult<TranslationResult>>
  translateCancel(request: WorkbenchTranslationLookup): Promise<RemoteResult<TranslationResult>>
  getRunInput(request: WorkbenchRunInputRequest): Promise<RemoteResult<WorkbenchRunInput>>
  getTaskDraft(request: WorkbenchTaskDraftRequest): Promise<RemoteResult<TaskRequestDraft | null>>
  saveTaskDraft(request: WorkbenchSaveTaskDraftRequest): Promise<RemoteResult<TaskRequestDraft>>
  getInputDescription(request: WorkbenchInputDescriptionRequest): Promise<RemoteResult<WorkflowRuntimeParameterInspection | null>>
  getProjection(request: WorkbenchScope): Promise<RemoteResult<WorkbenchProjection>>
  getEnvironment(request: WorkbenchEnvironmentRequest): Promise<RemoteResult<WorkbenchEnvironment>>
  mutate(request: ExperimentWorkbenchAction): Promise<RemoteResult<WorkbenchActionReceipt>>
}
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap { 'workbench/operation-failed': { code: string; issues: { path: string; message: string }[] } }
  interface TypertRemoteNamespaceMap { harnessComfyuiWorkbenchRemote: WorkbenchRemoteMethods }
  interface TypertRemoteMap {
    'harnessComfyuiWorkbenchRemote/queryRecords': WorkbenchRemoteMethods['queryRecords']
    'harnessComfyuiWorkbenchRemote/importImages': WorkbenchRemoteMethods['importImages']
    'harnessComfyuiWorkbenchRemote/resolveImages': WorkbenchRemoteMethods['resolveImages']
    'harnessComfyuiWorkbenchRemote/translateStart': WorkbenchRemoteMethods['translateStart']
    'harnessComfyuiWorkbenchRemote/translateGet': WorkbenchRemoteMethods['translateGet']
    'harnessComfyuiWorkbenchRemote/translateCancel': WorkbenchRemoteMethods['translateCancel']
    'harnessComfyuiWorkbenchRemote/getRunInput': WorkbenchRemoteMethods['getRunInput']
    'harnessComfyuiWorkbenchRemote/getTaskDraft': WorkbenchRemoteMethods['getTaskDraft']
    'harnessComfyuiWorkbenchRemote/saveTaskDraft': WorkbenchRemoteMethods['saveTaskDraft']
    'harnessComfyuiWorkbenchRemote/getInputDescription': WorkbenchRemoteMethods['getInputDescription']
    'harnessComfyuiWorkbenchRemote/getProjection': WorkbenchRemoteMethods['getProjection']
    'harnessComfyuiWorkbenchRemote/getEnvironment': WorkbenchRemoteMethods['getEnvironment']
    'harnessComfyuiWorkbenchRemote/mutate': WorkbenchRemoteMethods['mutate']
  }
}
const json = jsonValueSchema({ keySchema: Schema.string().min(1).required(), maxDepth: 64 })
function object<T>(value: unknown): T {
  const parsed = Schema.resolve(value, json, {})[0]
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('Workbench RPC requires an object.')
  return parsed as T
}
const identifier = () => Schema.string().min(1).max(500).pattern(/^\S+$/u)
const scopeSchema = contractObject({ workspaceId: identifier().required(), workId: identifier(), branchId: identifier() }, { exact: true })
const environmentSchema = contractObject({ workspaceId: identifier(), presetId: identifier() }, { exact: true })
const actionSchema = contractObject({
  workspaceId: Schema.string().required(), workId: identifier(), branchId: identifier(),
  type: Schema.union([...WORKBENCH_ACTION_TYPES]).required(), referenceRunIds: Schema.array(identifier()).max(20), runId: identifier(), taskId: identifier(), id: identifier(),
  field: Schema.string().min(1), value: json, expectedValue: Schema.string(),
}, { exact: true })
const inputDescriptionResultSchema = contractObject({ value: requiredNullable(workflowRuntimeParameterInspectionSchema) }, { exact: true })
const runInputSchema = contractObject({ workspaceId: identifier().required(), workId: identifier().required(), runId: identifier().required() }, { exact: true })
const inputDescriptionSchema = contractObject({ workspaceId: identifier().required(), workId: identifier().required(), branchId: identifier().required(), generationInput: generationInputSchema.required(false).default(undefined as never) }, { exact: true })
const taskDraftFields = { workspaceId: identifier().required(), workId: identifier().required(), branchId: identifier().required(), functionId: identifier().required() }
const taskDraftRequestSchema = contractObject(taskDraftFields, { exact: true })
const taskDraftSaveSchema = contractObject({ ...taskDraftFields, draft: taskRequestDraftSchema.required() }, { exact: true })
const taskDraftResultSchema = contractObject({ value: requiredNullable(taskRequestDraftSchema) }, { exact: true })
const queryRecordsSchema = contractObject({ type: Schema.union(['task', 'run', 'experience', 'favorite']).required(), workspaceId: identifier(), workId: identifier(), taskId: identifier(), keyword: Schema.string() }, { exact: true })
const imageImportSchema = contractObject({ files: Schema.array(contractObject({ name: Schema.string().min(1).required(), media_type: Schema.string().min(1).required(), bytes: Schema.array(Schema.natural().max(255).required()).min(1).required() }, { exact: true })).min(1).required() }, { exact: true })
const imageResolveSchema = contractObject({ image_refs: Schema.array(imageRefSchema).required() }, { exact: true })
const translationStartSchema = contractObject({ request_id: identifier().required(), workspace_id: identifier().required(), source_text: Schema.string().min(1).required() }, { exact: true })
const translationLookupSchema = contractObject({ request_id: identifier().required() }, { exact: true })
const recordResultSchema = Schema.array(workbenchRecordSchema).required()
const imageImportResultSchema = contractObject({ images: Schema.array(imageRefSchema).required() }, { exact: true })
const imageResolveResultSchema = contractObject({ images: Schema.array(imageSourceSchema).required() }, { exact: true })
const editorUpdateSchema = contractObject({ expected: requiredNullable(taskDraftSchema), draft: requiredNullable(taskDraftSchema) }, { exact: true })
const branchSaveSchema = contractObject({ expected: taskDraftSchema, expectedEditingDraft: requiredNullable(taskDraftSchema), draft: taskDraftSchema, name: Schema.string(), expectedName: Schema.string(), originalRequest: Schema.string(), expectedOriginalRequest: Schema.string() }, { exact: true })
const actionReceiptSchema = contractObject({ workspaceId: identifier().required(), workId: identifier(), branchId: identifier(), taskId: identifier(), editingDraft: Schema.union([Schema.const(null), taskDraftSchema]) }, { exact: true })
const supplementalResultSchemas = { mutate: actionReceiptSchema, queryRecords: recordResultSchema, importImages: imageImportResultSchema, resolveImages: imageResolveResultSchema, translateStart: translationResultSchema, translateGet: translationResultSchema, translateCancel: translationResultSchema }
const requestSchemas = { queryRecords: queryRecordsSchema, importImages: imageImportSchema, resolveImages: imageResolveSchema, translateStart: translationStartSchema, translateGet: translationLookupSchema, translateCancel: translationLookupSchema, getRunInput: runInputSchema, getTaskDraft: taskDraftRequestSchema, saveTaskDraft: taskDraftSaveSchema, getInputDescription: inputDescriptionSchema, getProjection: scopeSchema, getEnvironment: environmentSchema, mutate: actionSchema }
function parseRequest(method: keyof typeof requestSchemas, value: unknown) {
  const parsed = Schema.resolve(value, requestSchemas[method], {})[0]
  if (method === 'mutate') {
    const action = parsed as ExperimentWorkbenchAction
    if (action.type !== 'new-workspace') Schema.resolve(action.workspaceId, identifier().required(), {})
    if (action.type === 'edit-draft') Schema.resolve(action.value, editorUpdateSchema, {})
    if (action.type === 'save-draft') Schema.resolve(action.value, branchSaveSchema, {})
    if (action.type === 'function-add' || action.type === 'function-edit') {
      if (action.type === 'function-edit') Schema.resolve(action.id, identifier().required(), {})
      Schema.resolve(action.value, functionBindingEditableSchema, {})
    }
    if (action.type === 'favorite' || action.type === 'reuse') {
      Schema.resolve(action.id, identifier().required(), {})
      Schema.resolve(action.value, action.type === 'favorite' ? favoriteUpdateSchema : experienceReuseInputSchema, {})
    }
    if (action.type === 'task-generation-apply') {
      Schema.resolve(action.id, identifier().required(), {})
      Schema.resolve(action.value, taskDraftSchema, {})
    }
    if (action.type === 'update-review-draft') {
      Schema.resolve(action.runId, identifier().required(), {})
      Schema.resolve(action.value, reviewDraftUpdateSchema, {})
    }
    if (action.type === 'agent-action' && action.value && typeof action.value === 'object' && 'evaluationDraft' in action.value) Schema.resolve(action.value.evaluationDraft, reviewDraftUpdateSchema, {})

  }
  return parsed
}
export const WORKBENCH_REMOTE = {
  package: 'harness-comfyui',
  descriptors: (['queryRecords', 'importImages', 'resolveImages', 'translateStart', 'translateGet', 'translateCancel', 'getRunInput', 'getProjection', 'getEnvironment', 'getInputDescription', 'getTaskDraft', 'saveTaskDraft', 'mutate'] as const).map(method => ({
    id: `harness-comfyui#${WORKBENCH_REMOTE_NAMESPACE}/${method}`,
    service: WORKBENCH_REMOTE_NAMESPACE, namespace: WORKBENCH_REMOTE_NAMESPACE, method,
    invocation: { kind: 'direct' as const },
    parameters: [{ name: 'request', wire: 'request', source: 'json' as const, codec: {
      mode: 'strict' as const, typeSymbol: `harness-comfyui/workbench#${method}Request`,
      create: () => ({ parse: value => parseRequest(method, value) }),
    } }],
    cancellation: { parameter: 'signal' as const },
    result: { mode: 'strict' as const, typeSymbol: `harness-comfyui/workbench#${method}Result`, create: () => ({ parse: method in supplementalResultSchemas ? value => Schema.resolve(value, supplementalResultSchemas[method as keyof typeof supplementalResultSchemas], {})[0] : method === 'getRunInput' ? value => Schema.resolve(value, workbenchRunInputSchema, {})[0] : method === 'getTaskDraft' ? value => Schema.resolve({ value }, taskDraftResultSchema, {})[0].value : method === 'saveTaskDraft' ? value => Schema.resolve(value, taskRequestDraftSchema, {})[0] : method === 'getInputDescription' ? value => Schema.resolve({ value }, inputDescriptionResultSchema, {})[0].value : object }) },
  })),
} satisfies TypertRemoteContribution

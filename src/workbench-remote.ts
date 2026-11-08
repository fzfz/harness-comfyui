import Schema from '@deepseek-ai/schemastery'
import { CATALOG_KIND_DEFINITIONS, type CatalogKind } from './catalog/contract.ts'
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkbenchProjection, AgentModel, TaskRequestDraft, WorkbenchRunInput } from './workbench/contract.ts'
import { jsonValueSchema } from './shared/json-contract.ts'
import { workflowRuntimeParameterInspectionSchema, type WorkflowRuntimeParameterInspection } from './generation/inspection-contract.ts'
import { contractObject, requiredNullable } from './shared/field-contract.ts'
import { favoriteUpdateSchema, experienceReuseInputSchema, reviewDraftUpdateSchema, taskDraftSchema, taskRequestDraftSchema, workbenchRunInputSchema } from './workbench/schema.ts'

export const WORKBENCH_REMOTE_NAMESPACE = 'harnessComfyuiWorkbenchRemote'
export const WORKBENCH_REMOTE_SERVICE = `remote.${WORKBENCH_REMOTE_NAMESPACE}`
export interface WorkbenchScope { workspaceId: string; workId?: string; branchId?: string }

export interface WorkbenchActionReceipt extends WorkbenchScope { taskId?: string }
export interface WorkbenchTaskDraftRequest extends WorkbenchScope { workId: string; branchId: string; functionId: string }
export interface WorkbenchSaveTaskDraftRequest extends WorkbenchTaskDraftRequest { draft: TaskRequestDraft }
export const WORKBENCH_ACTION_TYPES = ["new-workspace", "new-work", "create-branch", "update-branch", "update-draft", "update-execution", "run", "experiment", "pause-experiment", "resume-experiment", "stop-experiment", "retry", "favorite", "update-review-draft", "evaluate", "reuse", "agent-action", "function-add", "function-edit", "function-remove", "function-preset", "resource-select", "resource-remove", "task-interrupt", "task-resume", "task-answer", "task-apply", "task-generation-apply", "task-branch"] as const
export type ExperimentActionType = typeof WORKBENCH_ACTION_TYPES[number]
export const WORKBENCH_BRANCH_EDIT_FIELDS = ['name', 'original_request'] as const
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
  models: {
    default: AgentModel
    groups: { id: string; name: string; models: { id: string; name: string; reasoning?: { efforts: { id: string; name: string }[]; defaultEffort?: string } }[] }[]
    routableProviders: string[]
    failures: { id: string; name: string; message: string }[]
  }
  skills: { name: string; description: string }[]
  instances: { id: string; name: string }[]
}
export interface WorkbenchEnvironmentRequest { workspaceId?: string; presetId?: string }
export interface WorkbenchRunInputRequest { workspaceId: string; workId: string; runId: string }

export interface WorkbenchInputDescriptionRequest extends WorkbenchScope { workId: string; branchId: string }
export interface WorkbenchModelChangeRequest extends WorkbenchScope { workId: string; branchId: string; modelId: string }
export interface WorkbenchModelChangeRef { readonly kind: Exclude<CatalogKind, 'model'>; readonly id: string }
export interface WorkbenchModelChangePreview {
  readonly model: { readonly id: string; readonly label: string }
  readonly removed: readonly (WorkbenchModelChangeRef & { readonly label: string })[]
}
export interface WorkbenchRemoteMethods {
  getRunInput(request: WorkbenchRunInputRequest): Promise<RemoteResult<WorkbenchRunInput>>
  getTaskDraft(request: WorkbenchTaskDraftRequest): Promise<RemoteResult<TaskRequestDraft | null>>
  saveTaskDraft(request: WorkbenchSaveTaskDraftRequest): Promise<RemoteResult<TaskRequestDraft>>
  previewModelChange(request: WorkbenchModelChangeRequest): Promise<RemoteResult<WorkbenchModelChangePreview>>
  getInputDescription(request: WorkbenchInputDescriptionRequest): Promise<RemoteResult<WorkflowRuntimeParameterInspection | null>>
  getProjection(request: WorkbenchScope): Promise<RemoteResult<WorkbenchProjection>>
  getEnvironment(request: WorkbenchEnvironmentRequest): Promise<RemoteResult<WorkbenchEnvironment>>
  mutate(request: ExperimentWorkbenchAction): Promise<RemoteResult<WorkbenchActionReceipt>>
}
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap { 'workbench/operation-failed': { code: string; issues: { path: string; message: string }[] } }
  interface TypertRemoteNamespaceMap { harnessComfyuiWorkbenchRemote: WorkbenchRemoteMethods }
  interface TypertRemoteMap {
    'harnessComfyuiWorkbenchRemote/getRunInput': WorkbenchRemoteMethods['getRunInput']
    'harnessComfyuiWorkbenchRemote/getTaskDraft': WorkbenchRemoteMethods['getTaskDraft']
    'harnessComfyuiWorkbenchRemote/saveTaskDraft': WorkbenchRemoteMethods['saveTaskDraft']
    'harnessComfyuiWorkbenchRemote/previewModelChange': WorkbenchRemoteMethods['previewModelChange']
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
const inputDescriptionSchema = contractObject({ workspaceId: identifier().required(), workId: identifier().required(), branchId: identifier().required() }, { exact: true })
const modelChangeSchema = contractObject({ workspaceId: identifier().required(), workId: identifier().required(), branchId: identifier().required(), modelId: identifier().required() }, { exact: true })
const modelChangeResultSchema = contractObject({
  model: contractObject({ id: identifier().required(), label: Schema.string().min(1).required() }, { exact: true }).required(),
  removed: Schema.array(contractObject({ kind: Schema.union(CATALOG_KIND_DEFINITIONS.filter(definition => definition.kind !== 'model').map(definition => definition.kind)).required(), id: identifier().required(), label: Schema.string().min(1).required() }, { exact: true })).required(),
}, { exact: true })
const taskDraftFields = { workspaceId: identifier().required(), workId: identifier().required(), branchId: identifier().required(), functionId: identifier().required() }
const taskDraftRequestSchema = contractObject(taskDraftFields, { exact: true })
const taskDraftSaveSchema = contractObject({ ...taskDraftFields, draft: taskRequestDraftSchema.required() }, { exact: true })
const taskDraftResultSchema = contractObject({ value: requiredNullable(taskRequestDraftSchema) }, { exact: true })
const requestSchemas = { getRunInput: runInputSchema, getTaskDraft: taskDraftRequestSchema, saveTaskDraft: taskDraftSaveSchema, previewModelChange: modelChangeSchema, getInputDescription: inputDescriptionSchema, getProjection: scopeSchema, getEnvironment: environmentSchema, mutate: actionSchema }
function parseRequest(method: keyof typeof requestSchemas, value: unknown) {
  const parsed = Schema.resolve(value, requestSchemas[method], {})[0]
  if (method === 'mutate') {
    const action = parsed as ExperimentWorkbenchAction
    if (action.type !== 'new-workspace') Schema.resolve(action.workspaceId, identifier().required(), {})
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
    if (action.type === 'update-branch') {
      Schema.resolve(action.field, Schema.union([...WORKBENCH_BRANCH_EDIT_FIELDS]).required(), {})
      Schema.resolve(action.expectedValue, Schema.string().required(), {})
    }
  }
  return parsed
}
export const WORKBENCH_REMOTE = {
  package: 'harness-comfyui',
  descriptors: (['getRunInput', 'getProjection', 'getEnvironment', 'getInputDescription', 'previewModelChange', 'getTaskDraft', 'saveTaskDraft', 'mutate'] as const).map(method => ({
    id: `harness-comfyui#${WORKBENCH_REMOTE_NAMESPACE}/${method}`,
    service: WORKBENCH_REMOTE_NAMESPACE, namespace: WORKBENCH_REMOTE_NAMESPACE, method,
    invocation: { kind: 'direct' as const },
    parameters: [{ name: 'request', wire: 'request', source: 'json' as const, codec: {
      mode: 'strict' as const, typeSymbol: `harness-comfyui/workbench#${method}Request`,
      create: () => ({ parse: value => parseRequest(method, value) }),
    } }],
    cancellation: { parameter: 'signal' as const },
    result: { mode: 'strict' as const, typeSymbol: `harness-comfyui/workbench#${method}Result`, create: () => ({ parse: method === 'getRunInput' ? value => Schema.resolve(value, workbenchRunInputSchema, {})[0] : method === 'getTaskDraft' ? value => Schema.resolve({ value }, taskDraftResultSchema, {})[0].value : method === 'saveTaskDraft' ? value => Schema.resolve(value, taskRequestDraftSchema, {})[0] : method === 'getInputDescription' ? value => Schema.resolve({ value }, inputDescriptionResultSchema, {})[0].value : method === 'previewModelChange' ? value => Schema.resolve(value, modelChangeResultSchema, {})[0] : object }) },
  })),
} satisfies TypertRemoteContribution

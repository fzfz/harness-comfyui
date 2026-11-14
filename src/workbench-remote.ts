import { WORKBENCH_REMOTE_CONFIG } from './workbench/remote-config.ts'
import { contracts, type ContractValue, type ContractInput, type ContractOutput } from '#contracts'
import type { RemoteResult, RemoteStream, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkbenchProjection, TaskRequestDraft, WorkbenchRunInput, WorkbenchRecord, WorkbenchRecordQuery, ImageRef, ImageSource } from './workbench/contract.ts'
import type { WorkflowRuntimeParameterInspection } from './generation/inspection-contract.ts'
import type { PromptStartRequest, PromptLookupRequest, PromptListRequest, PromptAdoptRequest, PromptTurn } from './workbench/prompt-edit.ts'
import type { TranslationRequest, TranslationResult } from './workbench/translation.ts'

export const WORKBENCH_REMOTE_NAMESPACE = WORKBENCH_REMOTE_CONFIG.namespace
export const WORKBENCH_REMOTE_SERVICE = `remote.${WORKBENCH_REMOTE_NAMESPACE}` as const

export type WorkbenchImageImportRequest = ContractInput<'workbench remote importImages'>
export type WorkbenchImageResolveRequest = ContractInput<'workbench remote resolveImages'>
export type WorkbenchTranslationLookup = ContractInput<'workbench remote translateGet'>
export type WorkbenchScope = ContractInput<'workbench remote getProjection'>
export type WorkbenchActionReceipt = ContractOutput<'workbench remote mutate'>
export type WorkbenchTaskDraftRequest = ContractInput<'workbench remote getTaskDraft'>
export type WorkbenchSaveTaskDraftRequest = ContractInput<'workbench remote saveTaskDraft'>
export type ExperimentWorkbenchAction = ContractInput<'workbench remote mutate'>
export type ExperimentActionType = ExperimentWorkbenchAction['type']
export type WorkbenchEnvironmentRequest = ContractInput<'workbench remote getEnvironment'>
export type WorkbenchRunInputRequest = ContractInput<'workbench remote getRunInput'>
export type WorkbenchInputDescriptionRequest = ContractInput<'workbench remote getInputDescription'>
export type WorkbenchSubscription = ContractInput<'workbench remote subscribe'>

export type WorkbenchEnvironment = ContractValue<'workbenchEnvironment'>

export type WorkbenchUpdate = ContractValue<'workbenchUpdate'>


export interface WorkbenchRemoteMethods {
  subscribe(request: WorkbenchSubscription, signal?: AbortSignal): RemoteStream<WorkbenchUpdate>
  queryRecords(request: WorkbenchRecordQuery): Promise<RemoteResult<WorkbenchRecord[]>>
  importImages(request: WorkbenchImageImportRequest): Promise<RemoteResult<{ images: ImageRef[] }>>
  resolveImages(request: WorkbenchImageResolveRequest): Promise<RemoteResult<{ images: ImageSource[] }>>
  promptPreview(request: PromptStartRequest): Promise<RemoteResult<import('./workbench/request-template.ts').PromptRequestInput>>
  promptStart(request: PromptStartRequest): Promise<RemoteResult<PromptTurn>>
  promptGet(request: PromptLookupRequest): Promise<RemoteResult<PromptTurn>>
  promptList(request: PromptListRequest): Promise<RemoteResult<PromptTurn[]>>
  promptCancel(request: PromptLookupRequest): Promise<RemoteResult<PromptTurn>>
  promptSaveCandidate(request: PromptAdoptRequest): Promise<RemoteResult<PromptTurn>>
  promptAdopt(request: PromptAdoptRequest): Promise<RemoteResult<PromptTurn>>
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
type WorkbenchRemoteMap = {
  [Method in keyof WorkbenchRemoteMethods as `${typeof WORKBENCH_REMOTE_NAMESPACE}/${Method}`]: WorkbenchRemoteMethods[Method]
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap { 'workbench/operation-failed': { code: string; issues: { path: string; message: string }[] } }
  interface TypertRemoteNamespaceMap { [WORKBENCH_REMOTE_NAMESPACE]: WorkbenchRemoteMethods }
  interface TypertRemoteMap extends WorkbenchRemoteMap {}
}

export const WORKBENCH_REMOTE = contracts.bind('workbench remote', 'remote') satisfies TypertRemoteContribution

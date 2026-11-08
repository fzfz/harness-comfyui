import type { WorkbenchEnvironmentRequest, WorkbenchInputDescriptionRequest, WorkbenchModelChangeRequest, WorkbenchModelChangePreview } from '../../workbench-remote.ts'
import type { WorkflowRuntimeParameterInspection } from '../../generation/inspection-contract.ts'
import type { WorkbenchEnvironment } from '../../workbench-remote.ts'
import type { BaseModelItem } from '../../catalog/contract.ts'
import type { CatalogApi } from './catalog-browser.tsx'
import type { CatalogDetailsRequest } from '../../catalog/details-schema.ts'

import type { WorkbenchProjection } from '../../workbench/contract.ts'

export const EXPERIMENT_CATALOG_SCROLL_PREFIX = 'catalog:'

export type ExperimentPage =
  | 'workbench'
  | 'resources'
  | 'tasks'
  | 'experiences'
  | 'favorites'
  | 'graph'
  | 'settings'
export interface ExperimentWorkspace {
  readonly id: string
  readonly name: string
  readonly path: string
}
export interface ExperimentScope {
  readonly workspaceId: string
  readonly workId?: string
  readonly branchId?: string
}
export interface ExperimentRemote {
  readonly previewModelChange: (request: WorkbenchModelChangeRequest) => Promise<WorkbenchModelChangePreview>
  readonly getEnvironment: (request: WorkbenchEnvironmentRequest) => Promise<WorkbenchEnvironment>
  readonly getInputDescription: (
    scope: WorkbenchInputDescriptionRequest,
  ) => Promise<WorkflowRuntimeParameterInspection | null>
  readonly getProjection: (
    scope: ExperimentScope,
  ) => Promise<WorkbenchProjection>
}
export type {
  ExperimentActionType,
  ExperimentWorkbenchAction,
} from '../../workbench-remote.ts'
import type { ExperimentWorkbenchAction } from '../../workbench-remote.ts'
export interface ExperimentSelection {
  readonly workspaceId: string
  readonly workId?: string
  readonly branchId?: string
}
export interface ExperimentWorkbenchProps {
  readonly remote: ExperimentRemote
  readonly workspaces: readonly ExperimentWorkspace[]
  readonly workspaceId: string | null
  readonly environmentError?: string | null
  readonly onWorkspaceChange: (id: string) => void
  readonly onAction: (
    action: ExperimentWorkbenchAction,
  ) => void | ExperimentSelection | Promise<void | ExperimentSelection>
  readonly catalog?: CatalogApi
  readonly baseModels?: readonly BaseModelItem[]
  readonly agentModelGroups?: WorkbenchEnvironment['models']['groups']
  readonly instances?: readonly { readonly id: string; readonly name: string }[]
  readonly presets?: ReadonlyArray<WorkbenchEnvironment['presets'][number]>
  readonly storage?: Pick<Storage, 'getItem' | 'setItem'>
  readonly visible?: boolean
}
export interface ExperimentViewState {
  readonly workId: string | null
  readonly branchId: string | null
  readonly page: ExperimentPage
  readonly selectedRunId: string | null
  readonly inspectRun: boolean
  readonly compareRunId: string | null
  readonly collapsedBranches: readonly string[]
  readonly catalogDetail: CatalogDetailsRequest | null
  readonly catalogGallery: (CatalogDetailsRequest & { readonly index: number }) | null
  readonly catalogFilters: {
    readonly kind: string
    readonly baseModelId: string
    readonly modelId: string
    readonly query: string
    readonly page: number
  }
  readonly scrollPositions: Readonly<
    Record<string, { readonly top: number; readonly left: number }>
  >
  readonly presetOverride: string | null
}

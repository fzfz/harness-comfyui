import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { ConnectionStateSource } from '@deepseek-ai/dsh-client-connection/client'
import type { ILayout, MainPanelId, PanelInfo, UsePanelInfo } from '@deepseek-ai/dsh-client-ui-layout/client'
import {
  Button,
  IconSparkleRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchEnvironmentRequest, WorkbenchInputDescriptionRequest, WorkbenchTaskDraftRequest, WorkbenchSaveTaskDraftRequest } from '../../workbench-remote.ts'
import type { WorkflowRuntimeParameterInspection } from '../../generation/inspection-contract.ts'
import type { WorkbenchEnvironment } from '../../workbench-remote.ts'
import type { BaseModelItem } from '../../catalog/contract.ts'
import type { WorkbenchProjection, TaskRequestDraft, WorkbenchRunInput } from '../../workbench/contract.ts'
import type { CatalogApi } from './catalog-browser.tsx'
import type {
  ExperimentScope,
  ExperimentSelection,
  ExperimentWorkbenchAction,
  ExperimentWorkspace,
} from './experiment-contract.ts'
import { ExperimentWorkbench } from './experiment-workbench.tsx'
import { experimentWorkbenchStyles } from './experiment-style.ts'
import { promptEditingStyles } from './experiment-prompt-styles.ts'

export const EXPERIMENT_PANEL_ID = 'harness-comfyui-experiment' as MainPanelId
type RemoteReply<T> = RemoteResult<T>
export type ExperimentEnvironment = WorkbenchEnvironment
export interface ExperimentHostRemote extends Pick<import('../../workbench-remote.ts').WorkbenchRemoteMethods, 'queryRecords' | 'importImages' | 'resolveImages' | 'translateStart' | 'translateGet' | 'translateCancel' | 'promptPreview' | 'promptStart' | 'promptGet' | 'promptList' | 'promptCancel' | 'promptAdopt'> {
  readonly getRunInput: (request: import('../../workbench-remote.ts').WorkbenchRunInputRequest) => Promise<RemoteReply<WorkbenchRunInput>>
  readonly getTaskDraft: (request: WorkbenchTaskDraftRequest) => Promise<RemoteReply<TaskRequestDraft | null>>
  readonly saveTaskDraft: (request: WorkbenchSaveTaskDraftRequest) => Promise<RemoteReply<TaskRequestDraft>>
  readonly getInputDescription: (
    scope: WorkbenchInputDescriptionRequest,
  ) => Promise<RemoteReply<WorkflowRuntimeParameterInspection | null>>
  readonly getEnvironment: (request: {
    readonly workspaceId?: string
    readonly presetId?: string
  }) => Promise<RemoteReply<ExperimentEnvironment>>
  readonly getProjection: (
    scope: ExperimentScope,
  ) => Promise<RemoteReply<WorkbenchProjection>>
  readonly mutate: (
    request: ExperimentWorkbenchAction,
  ) => Promise<RemoteReply<ExperimentSelection>>
}
function unwrap<T>(reply: RemoteReply<T>): T {
  if (!reply.ok) throw reply.error
  return reply.value
}
export function ExperimentWorkbenchEntry({
  wide,
  usePanelInfo,
  selectPanel,
}: {
  readonly wide: boolean
  readonly usePanelInfo: UsePanelInfo
  readonly selectPanel: ILayout['selectPanel']
}) {
  const active = usePanelInfo((info: PanelInfo) => info.activePanelId === EXPERIMENT_PANEL_ID)
  return (
    <Button
      className="harness-comfyui-sidebar-entry"
      variant="toolbar"
      size="sm"
      icon={<IconSparkleRegular size={16} />}
      aria-label="实验工作台"
      title="实验工作台"
      aria-pressed={active}
      onClick={() => selectPanel(active ? null : EXPERIMENT_PANEL_ID)}
    >
      {wide ? '实验工作台' : null}
    </Button>
  )
}
function ExperimentWorkbenchSurface({ children }: { readonly children: ReactNode }) {
  const [root, setRoot] = useState<ShadowRoot | null>(null)
  const mount = useCallback((element: HTMLDivElement | null) => {
    if (element) setRoot(element.shadowRoot ?? element.attachShadow({ mode: 'open' }))
  }, [])
  return (
    <div data-experiment-workbench-root="" ref={mount}>
      {root && createPortal(
        <><style>{experimentWorkbenchStyles + promptEditingStyles}</style>{children}</>,
        root,
      )}
    </div>
  )
}

export function ExperimentWorkbenchHost({
  remote,
  catalog,
  connectionState,
}: {
  readonly remote: ExperimentHostRemote
  readonly catalog: CatalogApi
  readonly connectionState: ConnectionStateSource
}) {
  const [environment, setEnvironment] = useState<ExperimentEnvironment | null>(
    null,
  )
  const [workspaceId, setWorkspaceId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('harness-comfyui:experiment-workspace')
    } catch {
      return null
    }
  })
  const [baseModels, setBaseModels] = useState<readonly BaseModelItem[]>([])
  useEffect(() => {
    const abort = new AbortController()
    void catalog
      .baseModels(abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) setBaseModels(value.items)
      })
      .catch(() => {})
    return () => abort.abort()
  }, [catalog])
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const environmentLoaded = useRef(false)
  const api = useMemo(
    () => ({
      queryRecords: async (request: import('../../workbench/contract.ts').WorkbenchRecordQuery) => unwrap(await remote.queryRecords(request)),
      importImages: async (request: import('../../workbench-remote.ts').WorkbenchImageImportRequest) => unwrap(await remote.importImages(request)),
      resolveImages: async (request: import('../../workbench-remote.ts').WorkbenchImageResolveRequest) => unwrap(await remote.resolveImages(request)),
      promptPreview: async (request: import('../../workbench/prompt-edit.ts').PromptStartRequest) => unwrap(await remote.promptPreview(request)),
      promptStart: async (request: import('../../workbench/prompt-edit.ts').PromptStartRequest) => unwrap(await remote.promptStart(request)),
      promptGet: async (request: import('../../workbench/prompt-edit.ts').PromptLookupRequest) => unwrap(await remote.promptGet(request)),
      promptList: async (request: import('../../workbench/prompt-edit.ts').PromptListRequest) => unwrap(await remote.promptList(request)),
      promptCancel: async (request: import('../../workbench/prompt-edit.ts').PromptLookupRequest) => unwrap(await remote.promptCancel(request)),
      promptAdopt: async (request: import('../../workbench/prompt-edit.ts').PromptAdoptRequest) => unwrap(await remote.promptAdopt(request)),
      translateStart: async (request: import('../../workbench/translation.ts').TranslationRequest) => unwrap(await remote.translateStart(request)),
      translateGet: async (request: import('../../workbench-remote.ts').WorkbenchTranslationLookup) => unwrap(await remote.translateGet(request)),
      translateCancel: async (request: import('../../workbench-remote.ts').WorkbenchTranslationLookup) => unwrap(await remote.translateCancel(request)),
      getRunInput: async (request: import('../../workbench-remote.ts').WorkbenchRunInputRequest) => unwrap(await remote.getRunInput(request)),
      getTaskDraft: async (request: WorkbenchTaskDraftRequest) =>
        unwrap(await remote.getTaskDraft(request)),
      saveTaskDraft: async (request: WorkbenchSaveTaskDraftRequest) =>
        unwrap(await remote.saveTaskDraft(request)),
      getEnvironment: async (request: WorkbenchEnvironmentRequest) =>
        unwrap(await remote.getEnvironment(request)),
      getInputDescription: async (scope: WorkbenchInputDescriptionRequest) =>
        unwrap(await remote.getInputDescription(scope)),
      getProjection: async (scope: ExperimentScope) =>
        unwrap(await remote.getProjection(scope)),
    }),
    [remote],
  )
  useEffect(() => {
    let active = true
    void remote
      .getEnvironment(workspaceId ? { workspaceId } : {})
      .then((reply) => {
        if (!active) return
        const value = unwrap(reply)
        setEnvironment(value)
        setError(null)
        if (
          (!environmentLoaded.current || workspaceId !== null) &&
          !value.workspaces.some((workspace) => workspace.id === workspaceId)
        )
          setWorkspaceId(value.workspaces[0]?.id ?? null)
        environmentLoaded.current = true
      })
      .catch((error) => {
        if (active)
          setError(
            error instanceof Error ? error.message : '工作区加载失败，请重试。',
          )
      })
    return () => {
      active = false
    }
  }, [remote, workspaceId, attempt])
  const selectWorkspace = (id: string) => {
    setWorkspaceId(id)
    try {
      localStorage.setItem('harness-comfyui:experiment-workspace', id)
    } catch {
      /* Workspace selection remains available in memory. */
    }
  }
  const mutate = async (
    request: ExperimentWorkbenchAction,
  ): Promise<ExperimentSelection> => {
    const selection = unwrap(await remote.mutate(request))
    setAttempt((value) => value + 1)
    return selection
  }
  const content = error && !environment ? (
    <div role="alert">
      <p>{error}</p>
      <button type="button" onClick={() => setAttempt((value) => value + 1)}>
        重试
      </button>
    </div>
  ) : !environment ? <div role="status">正在加载工作区…</div> : (
    <ExperimentWorkbench
      remote={api}
      connectionState={connectionState}
      catalog={catalog}
      workspaces={environment.workspaces}
      workspaceId={workspaceId}
      environmentError={error}
      presets={environment.presets}
      instances={environment.instances}
      baseModels={baseModels}
      agentModelGroups={environment.models.groups}
      routableProviders={environment.models.routableProviders}
      onWorkspaceChange={selectWorkspace}
      onAction={mutate}
    />
  )
  return <ExperimentWorkbenchSurface>{content}</ExperimentWorkbenchSurface>
}

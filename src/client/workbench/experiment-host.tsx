import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  IconSparkleRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchEnvironmentRequest, WorkbenchInputDescriptionRequest } from '../../workbench-remote.ts'
import type { WorkflowRuntimeParameterInspection } from '../../generation/inspection-contract.ts'
import type { WorkbenchEnvironment } from '../../workbench-remote.ts'
import type { BaseModelItem } from '../../catalog/contract.ts'
import type { WorkbenchProjection } from '../../workbench/contract.ts'
import type { CatalogApi } from './native-surfaces.tsx'
import type {
  ExperimentScope,
  ExperimentSelection,
  ExperimentWorkbenchAction,
  ExperimentWorkspace,
} from './experiment-contract.ts'
import { ExperimentWorkbench } from './experiment-workbench.tsx'

export const EXPERIMENT_PANEL_ID = 'harness-comfyui-experiment'
type RemoteReply<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false
      readonly error: { readonly code: string; readonly message?: string }
    }
export type ExperimentEnvironment = WorkbenchEnvironment
export interface ExperimentHostRemote {
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
  if (!reply.ok) throw new Error(reply.error.message || reply.error.code)
  return reply.value
}
export function ExperimentWorkbenchEntry({
  wide,
  open,
}: {
  readonly wide: boolean
  readonly open: () => void
}) {
  return (
    <Button
      className="harness-comfyui-sidebar-entry"
      variant="toolbar"
      size="sm"
      icon={<IconSparkleRegular size={16} />}
      aria-label="实验工作台"
      title="实验工作台"
      onClick={open}
    >
      {wide ? '实验工作台' : null}
    </Button>
  )
}
export function ExperimentWorkbenchHost({
  remote,
  catalog,
}: {
  readonly remote: ExperimentHostRemote
  readonly catalog: CatalogApi
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
  if (error && !environment)
    return (
      <div role="alert">
        <p>{error}</p>
        <button type="button" onClick={() => setAttempt((value) => value + 1)}>
          重试
        </button>
      </div>
    )
  if (!environment) return <div role="status">正在加载工作区…</div>
  return (
    <ExperimentWorkbench
      remote={api}
      catalog={catalog}
      workspaces={environment.workspaces}
      workspaceId={workspaceId}
      environmentError={error}
      presets={environment.presets}
      instances={environment.instances}
      baseModels={baseModels}
      agentModelGroups={environment.models.groups}
      onWorkspaceChange={selectWorkspace}
      onAction={mutate}
    />
  )
}

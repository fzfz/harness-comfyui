import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import {
  catalogPageCount,
  catalogDefinition,
  catalogResourceCompatible,
  type CatalogItem,
  type CatalogKind,
} from '../../catalog/contract.ts'
import type {
  Branch,
  FunctionBinding,
  JsonValue,
  Task,
  TaskDraft,
  WorkbenchRun,
} from '../../workbench/contract.ts'
import type { WorkbenchModelChangeRequest, WorkbenchModelChangePreview } from '../../workbench-remote.ts'
import type {
  ExperimentActionType,
  ExperimentPage,
  ExperimentWorkbenchAction,
  ExperimentWorkbenchProps,
} from './experiment-contract.ts'
import { EXPERIMENT_CATALOG_SCROLL_PREFIX } from './experiment-contract.ts'
import type { CatalogDetailsRequest } from '../../catalog/details-schema.ts'
import {
  ExperimentInputDescriptionCache,
  findExperimentParameter,
  readExperimentParameter,
  experimentSizeOptions,
} from './experiment-input.ts'
import type {
  WorkflowRuntimeParameterInspection,
  StandardRuntimeParameterKind,
} from '../../generation/inspection-contract.ts'
import { Button, Icon, trapDialogFocus, useToastMessage } from './experiment-controls.tsx'
import { ExperimentFunctionSettings, formatExperimentAgentModel } from './experiment-function-settings.tsx'
import { ExperimentWorkbenchStore } from './experiment-store.ts'
import { catalogImageUrls, CatalogDetailFields, CatalogItems, CatalogKinds, useCatalogBrowser, useCatalogDetails, type CatalogApi, type CatalogReference } from './catalog-browser.tsx'
import { workbenchContextKey } from './contract.ts'

export type {
  ExperimentWorkbenchAction,
  ExperimentWorkbenchProps,
} from './experiment-contract.ts'
const shortId = (value: string) => value.length > 16 ? `${value.slice(0, 12)}…` : value
function Identifier({ value }: { readonly value: string }) {
  return <span title={value}>{shortId(value)}</span>
}
const pendingRun = (run: WorkbenchRun) =>
  !['succeeded', 'failed', 'cancelled', 'canceled'].includes(run.status)
const busyTask = (task: Task) =>
  ['pending', 'running', 'waiting_input', 'waiting_generation'].includes(
    task.status,
  )
function Status({ run }: { readonly run: WorkbenchRun }) {
  const running = pendingRun(run)
  return (
    <span
      className={`pill ${run.status === 'failed' ? 'red' : running ? 'amber' : ''}`}
    >
      <i className="dot" />
      {run.status === 'succeeded'
        ? '成功'
        : run.status === 'failed'
          ? '运行失败'
          : running
            ? '运行中'
            : '已取消'}
    </span>
  )
}
function PanelHead({
  title,
  description,
  children,
}: {
  readonly title: string
  readonly description?: string
  readonly children?: ReactNode
}) {
  return (
    <div className="workbench-head">
      <div className="row between">
        <h1>{title}</h1>
        {children}
      </div>
      {description && <p>{description}</p>}
    </div>
  )
}

interface FieldOptions {
  multiline?: boolean
  saveOnChange?: boolean
  short?: boolean
  type?: string
  min?: number
  max?: number
  step?: number
  maxLength?: number
  branch?: boolean
  disabled?: boolean
}

type SaveField = (value: string, expectedValue: string) => Promise<boolean>

function createFieldEditor(isCurrent = () => true) {
  let edit: { value: string; expected: string } | undefined
  let queued: { value: string; original: string; save: SaveField } | undefined
  let saving = false
  const listeners = new Set<() => void>()
  const update = (next: typeof edit) => {
    edit = next
    for (const listener of listeners) listener()
  }
  const flush = async () => {
    if (saving) return
    saving = true
    while (queued) {
      const submission = queued
      queued = undefined
      if (!isCurrent()) break
      const expected = edit?.expected ?? submission.original
      if (submission.value !== expected) {
        const saved = await submission.save(submission.value, expected)
        if (!saved || !isCurrent()) { queued = undefined; break }
        if (edit) update({ ...edit, expected: submission.value })
      }
      if (edit?.value === submission.value && !queued) update(undefined)
    }
    saving = false
  }
  return {
    getSnapshot: () => edit?.value,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    change: (value: string, original: string) =>
      update({ value, expected: edit?.expected ?? original }),
    commit: (value: string, original: string, save: SaveField) => {
      queued = { value, original, save }
      void flush()
    },
  }
}

function useBranchFieldEdits(workspaceId: string | null, workId: string | null, branchId: string | null, inputScope?: string) {
  const branchFields = useRef(new Map<string, Map<string, ReturnType<typeof createFieldEditor>>>())
  const fields = useMemo(() => {
    if (inputScope !== undefined) return new Map<string, ReturnType<typeof createFieldEditor>>()
    const scope = JSON.stringify([workspaceId, workId, branchId])
    let current = branchFields.current.get(scope)
    if (!current) {
      current = new Map()
      branchFields.current.set(scope, current)
    }
    return current
  }, [workspaceId, workId, branchId, inputScope])
  const activeFields = useRef<typeof fields | null>(fields)
  useLayoutEffect(() => {
    activeFields.current = fields
    return () => { activeFields.current = null }
  }, [fields])
  return (id: string) => {
    let editor = fields.get(id)
    if (!editor) {
      editor = createFieldEditor(inputScope === undefined ? undefined : () => activeFields.current === fields)
      fields.set(id, editor)
    }
    return editor
  }
}

function AutosaveField({ label, inputLabel = label, className, id, value, options, save, editor, locked }: {
  readonly label: string
  readonly inputLabel?: string
  readonly className?: string
  readonly id?: string
  readonly value: string
  readonly options: FieldOptions
  readonly save: SaveField
  readonly editor: ReturnType<typeof createFieldEditor>
  readonly locked: boolean
}) {
  const edited = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot)
  const common = {
    id,
    'aria-label': inputLabel,
    value: (!locked ? edited : undefined) ?? value,
    disabled: options.disabled,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (options.disabled) return
      editor.change(event.target.value, value)
      if (options.saveOnChange) editor.commit(event.target.value, value, save)
    },
    onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!options.disabled) editor.commit(event.target.value, value, save)
    },
  }
  return <label className={className}>
    <span>{label}</span>
    {options.multiline ? (
      <textarea {...common} className={options.short ? id === 'original_request' ? 'short branch-goal' : 'short' : ''} />
    ) : (
      <input {...common} type={options.type ?? 'text'} min={options.min} max={options.max} step={options.step} maxLength={options.maxLength} />
    )}
  </label>
}

function LoraSummary({ scope, item, load, save, locked, onError, onRemove }: {
  readonly scope: { workspaceId: string | null; workId: string | null; branchId: string | null }
  readonly item: TaskDraft['generation_input']['loras'][number]
  readonly load?: CatalogApi['details']
  readonly save: SaveField
  readonly locked: boolean
  readonly onError: (message: string) => void
  readonly onRemove: () => void
}) {
  const editor = useBranchFieldEdits(scope.workspaceId, scope.workId, scope.branchId, item.id)(item.id)
  const { details, error } = useCatalogDetails({ kind: 'lora', id: item.id }, load)
  const name = details?.kind === 'lora' && details.id === item.id ? details.item.label : item.file_name
  useEffect(() => { if (error) onError(error) }, [error, onError])
  return <div className="picked-lora">
    <b>{name}</b>
    <AutosaveField label="权重" inputLabel={`${name} 权重`} value={String(item.weight)}
      options={{ type: 'number', step: 0.05 }} editor={editor} save={save} locked={locked} />
    <Button kind="quiet small" label={`移除 ${name}`} onClick={onRemove}>×</Button>
  </div>
}

function ContextSummary({ item, load, onError, onDetail, onRemove }: {
  readonly item: TaskDraft['context_refs'][number]
  readonly load?: CatalogApi['details']
  readonly onError: (message: string) => void
  readonly onDetail: () => void
  readonly onRemove: () => void
}) {
  const { details, error } = useCatalogDetails(item, load)
  const name = details?.kind === item.kind && details.id === item.id ? details.item.label : item.id
  useEffect(() => { if (error) onError(error) }, [error, onError])
  return <div className="context-item">
    <Button kind="quiet small" onClick={onDetail}>{name}</Button>
    <small>{catalogDefinition(item.kind).label}</small>
    <Button kind="quiet small" label={`移除 ${name}`} onClick={onRemove}>×</Button>
  </div>
}

export function ExperimentWorkbench(props: ExperimentWorkbenchProps) {
  const storage = useMemo(() => {
    if (props.storage) return props.storage
    try {
      return typeof localStorage === 'undefined' ? undefined : localStorage
    } catch {
      return undefined
    }
  }, [props.storage])
  const store = useMemo(
    () => new ExperimentWorkbenchStore(props.remote, storage),
    [props.remote, storage],
  )
  const inputDescriptionCache = useMemo(
    () => new ExperimentInputDescriptionCache(props.remote.getInputDescription),
    [props.remote],
  )
  const [inputDescriptions, setInputDescriptions] = useState<
    Readonly<Record<string, WorkflowRuntimeParameterInspection | null>>
  >({})
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  )
  const [catalogQueryDraft, setCatalogQueryDraft] = useState<{ workspaceId: string | null; value: string } | null>(null)
  const catalogQueryText = catalogQueryDraft?.workspaceId === state.workspaceId
    ? catalogQueryDraft.value : state.view.catalogFilters.query
  const catalogQueryRef = useRef({ workspaceId: state.workspaceId, value: catalogQueryText })
  catalogQueryRef.current = { workspaceId: state.workspaceId, value: catalogQueryText }
  const navigate = useCallback((change: () => void) => {
    const current = store.getSnapshot(), draft = catalogQueryRef.current
    if (draft.workspaceId === current.workspaceId && current.view.page === 'resources' && draft.value !== current.view.catalogFilters.query) {
      store.updateView({ catalogFilters: { ...current.view.catalogFilters, query: draft.value } })
    }
    change()
  }, [store])
  const selectWorkspace = useCallback((workspaceId: string | null) => {
    if (workspaceId !== store.getSnapshot().workspaceId) navigate(() => store.setWorkspace(workspaceId))
  }, [store, navigate])
  const selectWork = (workId: string) => navigate(() => store.selectWork(workId))
  const selectBranch = (branchId: string) => navigate(() => store.selectBranch(branchId))
  const selectRun = (runId: string, inspectRun = true) => navigate(() => store.selectRun(runId, inspectRun))
  const [message, setMessage] = useToastMessage()
  const functionWrites = useRef(new Map<string, Promise<void>>())
  const [functionBindings, setFunctionBindings] = useState<ReadonlyMap<string, FunctionBinding>>(() => new Map())
  useEffect(() => {
    if (props.environmentError) setMessage(props.environmentError)
  }, [props.environmentError])
  const [formSubmitting, setFormSubmitting] = useState(false)
  const formSubmissionPending = useRef<number | null>(null)
  const modalInstance = useRef(0)
  const [sheet, setSheet] = useState(false)
  const [modelChange, setModelChange] = useState<{
    readonly request: WorkbenchModelChangeRequest
    readonly preview: WorkbenchModelChangePreview
    readonly navigation: number
  } | null>(null)
  const [modal, setModalState] = useState<
    'new-work' | 'new-workspace' | 'branch' | 'image' | 'model-change' | null
  >(null)
  const setModal = useCallback((value: typeof modal) => {
    modalInstance.current++
    setFormSubmitting(false)
    if (value !== 'model-change') setModelChange(null)
    setModalState(value)
  }, [])
  const [search, setSearch] = useState('')
  const fieldEditor = useBranchFieldEdits(state.workspaceId, state.view.workId, state.view.branchId)
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    selectWorkspace(props.workspaceId)
  }, [selectWorkspace, props.workspaceId])
  useEffect(() => {
    const sync = () =>
      store.setVisible(
        props.visible !== false &&
          (typeof document === 'undefined' || !document.hidden),
      )
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [store, props.visible])
  useEffect(() => () => {
    modalInstance.current++
    store.dispose()
  }, [store])
  const navigationSequence = store.getNavigationSequence()
  useEffect(() => {
    if (modelChange && (modelChange.navigation !== navigationSequence || props.visible === false)) setModal(null)
  }, [navigationSequence, props.visible, modelChange, setModal])
  useEffect(() => {
    setModal(null)
    setSheet(false)
    setMessage(null)
  }, [state.workspaceId, state.view.workId, state.view.branchId, props.visible])
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setModal(null)
        setSheet(false)
      }
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [])
  const p = state.projection,
    view = state.view
  const workspace = props.workspaces.find(
    (item) => item.id === state.workspaceId,
  )
  const work = p?.works.find((item) => item.work_id === view.workId)
  const branch = p?.branches.find((item) => item.branch_id === view.branchId)
  const run = p?.runs.find((item) => item.run_id === view.selectedRunId)
  const taskFor = (item: WorkbenchRun) =>
    p?.tasks.find((task) => task.task_id === item.workbench_task_id)
  const branchFor = (item: WorkbenchRun) =>
    p?.branches.find((branch) => branch.branch_id === taskFor(item)?.branch_id)
  const branchRuns = (id: string) =>
    p?.runs.filter((item) => taskFor(item)?.branch_id === id) ?? []
  useEffect(() => {
    if (
      !state.workspaceId ||
      !view.workId ||
      !branch ||
      props.visible === false
    )
      return
    let active = true
    const workspaceId = state.workspaceId,
      workId = view.workId
    const requests = [
      {
        scope: { workspaceId, workId, branchId: branch.branch_id },
        input: branch.draft.generation_input,
      },
      ...(p?.runs ?? []).flatMap((run) => {
        const task = p?.tasks.find(
          (task) => task.task_id === run.workbench_task_id,
        )
        return task
          ? [
              {
                scope: {
                  workspaceId,
                  workId,
                  branchId: task.branch_id,
                  runId: run.run_id,
                },
                input: run.generation_input,
              },
            ]
          : []
      }),
    ]
    for (const request of requests)
      void inputDescriptionCache
        .load(request.scope, request.input)
        .then((description) => {
          if (active)
            setInputDescriptions((current) => ({
              ...current,
              [inputDescriptionCache.key(workspaceId, request.input)]:
                description,
            }))
        })
        .catch((error) => {
          if (active)
            setMessage(
              error instanceof Error
                ? error.message
                : '输入字段读取失败，请刷新工作台。',
            )
        })
    return () => {
      active = false
    }
  }, [
    inputDescriptionCache,
    state.workspaceId,
    view.workId,
    branch?.branch_id,
    branch?.draft.generation_input.instance_id,
    branch?.draft.generation_input.template_id,
    p?.runs,
    p?.tasks,
    props.visible,
  ])
  const descriptionFor = (input: WorkbenchRun['generation_input']) =>
    state.workspaceId
      ? inputDescriptions[inputDescriptionCache.key(state.workspaceId, input)]
      : undefined
  const runParameter = (
    run: WorkbenchRun,
    kind: StandardRuntimeParameterKind,
  ) =>
    readExperimentParameter(
      descriptionFor(run.generation_input),
      run.generation_input.parameters,
      kind,
    )
  const binding = (kind: string) =>
    p?.functions.find((item) => item.kind === kind && item.builtin) ??
    p?.functions.find((item) => item.kind === kind)
  const presetName = (id?: string) =>
    props.presets?.find((preset) => preset.id === id)?.name ?? id ?? '未配置'
  const modelLabel = (draft: TaskDraft) =>
    props.baseModels?.find((item) => item.id === draft.base_model_id)?.label ||
    draft.base_model_id ||
    draft.generation_input.model?.file_name ||
    '未选择底模'
  const formatAgentModel = (model: FunctionBinding['agent_model'] | undefined) =>
    formatExperimentAgentModel(model, props.agentModelGroups ?? [])
  const agentModel = (binding: FunctionBinding | undefined) =>
    formatAgentModel(binding?.agent_model)
  const runModelLabel = (item: WorkbenchRun) => {
    const draft = taskFor(item)?.input
    return draft
      ? modelLabel(draft)
      : item.generation_input.model?.file_name || '未选择底模'
  }
  const changePage = (page: ExperimentPage) => {
    navigate(() => store.updateView({ page, compareRunId: null }))
    setSearch('')
  }
  const action = async (
    type: ExperimentActionType,
    extra: Partial<ExperimentWorkbenchAction> = {},
    isCurrent?: () => boolean,
  ) => {
    if (!state.workspaceId && type !== 'new-workspace') return false
    const navigation = store.getNavigationSequence()
    const stillCurrent = () => store.getNavigationSequence() === navigation &&
      (!isCurrent || isCurrent())
    try {
      const selection = await props.onAction({
        type,
        workspaceId: state.workspaceId ?? '',
        ...(view.workId ? { workId: view.workId } : {}),
        ...(view.branchId ? { branchId: view.branchId } : {}),
        ...(run ? { runId: run.run_id } : {}),
        ...extra,
      })
      if (!stillCurrent()) return false
      const keepsCatalogNavigation = selection && (type === 'resource-select' || type === 'resource-remove')
        && selection.workspaceId === state.workspaceId && selection.workId === view.workId && selection.branchId === view.branchId
      if (selection && !keepsCatalogNavigation) navigate(() => {
        selectWorkspace(selection.workspaceId)
        props.onWorkspaceChange(selection.workspaceId)
        if (type === 'new-workspace') changePage('workbench')
        if (selection.workId) store.selectWork(selection.workId)
        if (selection.branchId)
          store.updateView({
            branchId: selection.branchId,
            selectedRunId: null,
            inspectRun: false,
            compareRunId: null,
            page: 'workbench',
          })
      })
      const refreshNavigation = store.getNavigationSequence()
      await store.refresh()
      if (store.getNavigationSequence() !== refreshNavigation) return false
      if (selection?.branchId && selection.branchId !== view.branchId)
        selectBranch(selection.branchId)
      return !isCurrent || isCurrent()
    } catch (error) {
      if (stillCurrent())
        setMessage(error instanceof Error ? error.message : '操作失败，请重试。')
      return false
    }
  }
  const selectResource = async (item: CatalogItem) => {
    if (locked) return
    if (item.context.kind !== 'model') {
      void action('resource-select', { id: item.context.id, value: item.context })
      return
    }
    if (!state.workspaceId || !view.workId || !view.branchId) return
    const request = { workspaceId: state.workspaceId, workId: view.workId, branchId: view.branchId, modelId: item.context.id }
    setModal(null)
    const instance = modalInstance.current, navigation = store.getNavigationSequence()
    const isCurrent = () => modalInstance.current === instance && store.getNavigationSequence() === navigation
    try {
      const preview = await props.remote.previewModelChange(request)
      if (!isCurrent()) return
      if (preview.removed.length) {
        setModelChange({ request, preview, navigation })
        setModal('model-change')
      } else {
        await action('resource-select', { id: request.modelId, value: { kind: 'model', id: request.modelId } }, isCurrent)
      }
    } catch (error) {
      if (isCurrent()) setMessage(error instanceof Error ? error.message : '模型兼容性读取失败，请重新选择生成模型。')
    }
  }
  const referenceRunIds =
    run && view.compareRunId ? [run.run_id, view.compareRunId] : []
  const agentButton = (label: string, kind: string, disabled = false) => (
    <Button
      kind="small agent-action"
      disabled={disabled || !binding(kind)}
      onClick={() =>
        void action('agent-action', {
          id: binding(kind)?.function_id,
          ...(kind === 'compare' ? { referenceRunIds } : {}),
        })
      }
    >
      {label}
    </Button>
  )
  const customActions = (kinds: readonly string[], disabled = false) =>
    p?.functions
      .filter((item) => !item.builtin && kinds.includes(item.kind))
      .map((item) => (
        <Button
          key={item.function_id}
          kind="small agent-action"
          disabled={disabled}
          onClick={() =>
            void action('agent-action', {
              id: item.function_id,
              ...(item.kind === 'compare' ? { referenceRunIds } : {}),
            })
          }
        >
          {item.name}
        </Button>
      ))
  const back = (
    <Button kind="small" onClick={() => changePage('workbench')}>
      返回结果
    </Button>
  )
  const media = (item: WorkbenchRun) =>
    (item as WorkbenchRun & { media?: readonly { url: string }[] }).media?.[0]
      ?.url
  const runVisual = (item: WorkbenchRun, large = false) =>
    item.status === 'succeeded' ? (
      media(item) ? (
        large ? (
          <button
            type="button"
            className="artwork preview-image"
            onClick={() => {
              selectRun(item.run_id, view.inspectRun)
              setModal('image')
            }}
            aria-label={`查看原图 ${item.run_id}`}
          >
            <img src={media(item)} alt={item.title} />
          </button>
        ) : (
          <img src={media(item)} alt={item.title} />
        )
      ) : (
        <span className="muted">暂无图片</span>
      )
    ) : pendingRun(item) ? (
      <span className="loading-ring" aria-hidden="true" />
    ) : (
      <span className="run-failure-symbol" aria-hidden="true">
        ×
      </span>
    )
  const renderRunCard = (item: WorkbenchRun, comparing = false) => (
    <button
      key={item.run_id}
      type="button"
      className={`run-card status-${pendingRun(item) ? 'running' : item.status} ${(comparing ? view.compareRunId : view.selectedRunId) === item.run_id ? 'active' : ''}`}
      aria-label={`${comparing ? '比较运行' : '查看运行'} ${item.run_id}`}
      aria-pressed={
        (comparing ? view.compareRunId : view.selectedRunId) === item.run_id
      }
      onClick={() =>
        comparing
          ? store.updateView({ compareRunId: item.run_id })
          : selectRun(item.run_id)
      }
    >
      <div className="run-card-art">{runVisual(item)}</div>
      <div className="run-card-heading">
        <b className="mono"><Identifier value={item.run_id} /></b>
        <Status run={item} />
      </div>
      <small>任务 <Identifier value={item.workbench_task_id} /></small>
      <small>发起者：{item.initiator === 'human' ? '人工' : 'Agent'}</small>
      <small>
        {new Date(item.created_at).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })}
        {item.retry_of_run_id ? ` · 重试来源 ${item.retry_of_run_id}` : ''}
      </small>
      <small className="run-preset">
        {presetName(taskFor(item)?.binding_snapshot.preset_id)}
      </small>
    </button>
  )
  const treeNode = (item: Branch, depth: number): ReactNode => {
    const children = p!.branches.filter(
        (child) => child.parent_branch_id === item.branch_id,
      ),
      open = !view.collapsedBranches.includes(item.branch_id),
      active = item.branch_id === view.branchId
    return (
      <div
        key={item.branch_id}
        role="treeitem"
        aria-selected={active}
        aria-level={depth + 1}
        aria-expanded={children.length ? open : undefined}
      >
        <div className={`tree-row ${active ? 'active' : ''}`}>
          {children.length ? (
            <button
              type="button"
              className="tree-toggle"
              aria-label={`${open ? '收起' : '展开'}${item.name}`}
              onClick={() =>
                store.updateView({
                  collapsedBranches: open
                    ? [...view.collapsedBranches, item.branch_id]
                    : view.collapsedBranches.filter(
                        (id) => id !== item.branch_id,
                      ),
                })
              }
            >
              {open ? '⌄' : '›'}
            </button>
          ) : (
            <span className="tree-toggle" />
          )}
          <button
            type="button"
            className={`branch-item ${active ? 'active' : ''}`}
            aria-label={`切换分支 ${item.name}`}
            onClick={() => selectBranch(item.branch_id)}
          >
            <span className="branch-name">
              {item.name}
              {branchRuns(item.branch_id).some(pendingRun) && (
                <span className="pill amber">
                  <i className="dot" />
                  运行中
                </span>
              )}
              {p!.tasks.some(
                (task) => task.branch_id === item.branch_id && busyTask(task),
              ) && <span className="pill amber">Agent 执行中</span>}
            </span>
            <small>
              {modelLabel(item.draft)} · {branchRuns(item.branch_id).length}{' '}
              次运行
            </small>
            <span className="branch-origin" title={item.source_run_id ?? item.source_artifact_id ?? undefined}>
              {item.parent_branch_id
                ? `来源 ${p!.branches.find((parent) => parent.branch_id === item.parent_branch_id)?.name ?? ''} · ${shortId(item.source_run_id || item.source_artifact_id || '任务输入')}`
                : '主分支'}
            </span>
          </button>
        </div>
        {children.length > 0 && open && (
          <div className="tree-children" role="group">
            {children.map((child) => treeNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }
  const scrollPanel = (key: string, ready = true) => ({
    ref: (element: HTMLDivElement | null) => {
      if (!ready) {
        if (element) delete element.dataset.restored
        return
      }
      const position = view.scrollPositions[key]
      if (element && position && element.dataset.restored !== key) {
        element.scrollTop = position.top
        element.scrollLeft = position.left
        element.dataset.restored = key
      }
    },
    onScroll: (event: React.UIEvent<HTMLDivElement>) => {
      if (!ready) return
      const element = event.currentTarget
      store.updateView({
        scrollPositions: {
          ...store.getSnapshot().view.scrollPositions,
          [key]: { top: element.scrollTop, left: element.scrollLeft },
        },
      })
    },
  })
  const sidebar = (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="row between">
          <h3>当前工作的分支</h3>
          <small>共 {p?.branches.length ?? 0} 条</small>
        </div>
      </div>
      <div
        className="branch-list"
        role="tree"
        aria-label="当前工作分支树"
        {...scrollPanel(`branches:${view.workId}`)}
      >
        {p?.branches
          .filter((item) => !item.parent_branch_id)
          .map((item) => treeNode(item, 0))}
      </div>
      <div className="sidebar-foot">
        <Button icon="grid" onClick={() => changePage('graph')}>
          查看分支图
        </Button>
      </div>
    </aside>
  )
  const compare = p?.runs.find((item) => item.run_id === view.compareRunId)
  const results = (
    <main className="center">
      <PanelHead title={work?.name ?? ''} description={work?.goal}>
        <Button
          kind="small"
          icon="compare"
          disabled={!run || (p?.runs.length ?? 0) < 2}
          onClick={() =>
            store.updateView({
              compareRunId:
                p?.runs.find((item) => item.run_id !== run?.run_id)?.run_id ??
                null,
            })
          }
        >
          比较运行
        </Button>
      </PanelHead>
      <div className="contextbar">
        <Icon name="branch" />
        <b>{branch?.name}</b>
        {run && (
          <>
            <span className="muted">/</span>
            <b className="mono"><Identifier value={run.run_id} /></b>
            <span>任务 <Identifier value={run.workbench_task_id} /></span>
          </>
        )}
        <span className="spacer" />
        <Button
          kind="small quiet"
          icon="branch"
          onClick={() => setModal('branch')}
        >
          {run ? '从此运行创建分支' : '创建子分支'}
        </Button>
      </div>
      {compare && run ? (
        <>
          <div className="contextbar">
            <span className="muted">比较</span>
            <b className="mono">
              <Identifier value={compare.run_id} /> / <Identifier value={run.run_id} />
            </b>
            <span className="spacer" />
            {agentButton(
              '比较结果',
              'compare',
              [compare, run].some((item) => item.status !== 'succeeded'),
            )}
            {customActions(['compare'])}
            <Button
              kind="small quiet"
              onClick={() => store.updateView({ compareRunId: null })}
            >
              结束比较
            </Button>
          </div>
          <div className="canvas">
            <div className="compare-grid">
              {[compare, run].map((item) => (
                <div key={item.run_id} className="compare-cell">
                  {runVisual(item, true)}
                  <h3>
                    <Identifier value={item.run_id} /> · {branchFor(item)?.name}
                  </h3>
                  <p>
                    {runModelLabel(item)} · Seed{' '}
                    {String(runParameter(item, 'seed') ?? '')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="canvas">
          {!run ? (
            <div className="empty">当前分支暂无运行记录。</div>
          ) : run.status === 'failed' ? (
            <div className="error-stage">
              <span className="pill red"><Identifier value={run.run_id} /></span>
              <h3 style={{ marginTop: 12 }}>运行失败</h3>
              <p>{run.error?.message}</p>
              <Button
                kind="primary"
                icon="run"
                onClick={() => void action('retry')}
              >
                重试任务
              </Button>
              {agentButton('诊断失败', 'diagnose')}
              {customActions(['diagnose'])}
            </div>
          ) : pendingRun(run) ? (
            <div className="empty running-stage">
              <span className="loading-ring" aria-hidden="true" />
              <h3>运行中</h3>
            </div>
          ) : (
            runVisual(run, true)
          )}
        </div>
      )}
      {run && (
        <div className="stage-caption">
          <div>
            <div className="row">
              <h3>{run.title}</h3>
              <span role="status" aria-live="polite">
                <Status run={run} />
              </span>
            </div>
            <small>
              <Identifier value={run.run_id} /> · 发起者：
              {run.initiator === 'human' ? '人工' : 'Agent'} ·{' '}
              {runModelLabel(run)} · Seed{' '}
              {String(runParameter(run, 'seed') ?? '')} ·{' '}
              {String(runParameter(run, 'steps') ?? '')} 步
            </small>
            <small className="preset-provenance">
              执行预设：{presetName(taskFor(run)?.binding_snapshot.preset_id)}
            </small>
            <small className="run-agent-model">
              Agent 模型：
              {formatAgentModel(taskFor(run)?.binding_snapshot.agentModel)}
            </small>
          </div>
          <div className="actions">
            <Button
              kind="small"
              icon="star"
              disabled={run.status !== 'succeeded'}
              onClick={() =>
                void action('favorite', { id: run.run_id, value: 'run' })
              }
            >
              {p?.favorites.some(
                (item) =>
                  item.target_type === 'run' && item.target_id === run.run_id,
              )
                ? '移除收藏'
                : '收藏运行'}
            </Button>
            <Button
              kind="small"
              disabled={pendingRun(run)}
              onClick={() => void action('evaluate')}
            >
              记录评价与经验
            </Button>
          </div>
        </div>
      )}
      {run?.review && (
        <details className="saved-review">
          <summary>运行评价</summary>
          {run.review.observation && <p>观察：{run.review.observation}</p>}
          <p>评价：{run.review.conclusion}</p>
        </details>
      )}
      <section
        className="run-strip"
        aria-label={compare ? '比较对象' : '当前分支的运行'}
      >
        <div className="strip-head">
          <span>{compare ? '比较对象' : '当前分支的运行'}</span>
          <span className="muted">
            {
              (compare
                ? p?.runs.filter((item) => item.run_id !== run?.run_id)
                : branchRuns(branch?.branch_id ?? '')
              )?.length
            }{' '}
            次运行
          </span>
        </div>
        <div
          className="run-cards"
          {...scrollPanel(`runs:${view.workId}:${view.branchId}:${!!compare}`)}
        >
          {(compare
            ? p?.runs.filter((item) => item.run_id !== run?.run_id)
            : branchRuns(branch?.branch_id ?? '')
          )?.map((item) => renderRunCard(item, !!compare))}
          {!branchRuns(branch?.branch_id ?? '').length && (
            <span className="muted">暂无运行记录</span>
          )}
        </div>
      </section>
    </main>
  )

  const graphNode = (item: Branch): ReactNode => {
    const children = p!.branches.filter(
      (child) => child.parent_branch_id === item.branch_id,
    )
    return (
      <li key={item.branch_id}>
        <article className="branch-graph-node">
          <div className="row between">
            <h3>{item.name}</h3>
            <Button
              kind="small"
              onClick={() => {
                selectBranch(item.branch_id)
                changePage('workbench')
              }}
            >
              进入分支
            </Button>
          </div>
          <p title={item.source_run_id ?? item.source_artifact_id ?? undefined}>
            {item.parent_branch_id
              ? `来源：${p!.branches.find((parent) => parent.branch_id === item.parent_branch_id)?.name} · ${shortId(item.source_run_id || item.source_artifact_id || '任务输入')}`
              : '主分支'}
          </p>
          <div className="branch-graph-runs">
            {branchRuns(item.branch_id).map((item) => (
              <Button
                key={item.run_id}
                kind="small"
                onClick={() => selectRun(item.run_id)}
              >
                <span title={item.run_id}>
                  {`${shortId(item.run_id)} · ${item.status === 'succeeded'
                    ? '成功'
                    : item.status === 'failed'
                      ? '运行失败'
                      : '运行中'}`}
                </span>
              </Button>
            ))}
            {!branchRuns(item.branch_id).length && <small>暂无运行记录</small>}
          </div>
        </article>
        {children.length > 0 && <ul>{children.map(graphNode)}</ul>}
      </li>
    )
  }
  const graph = (
    <main className="center">
      <PanelHead title="分支图">{back}</PanelHead>
      <div className="graph" {...scrollPanel(`graph:${view.workId}`)}>
        <ul className="branch-graph">
          {p?.branches.filter((item) => !item.parent_branch_id).map(graphNode)}
        </ul>
      </div>
    </main>
  )
  const favoritePage = view.page === 'favorites'
  const experiences =
    p?.experiences.filter(
      (item) =>
        (!favoritePage ||
          p.favorites.some(
            (favorite) =>
              favorite.target_type === 'experience' &&
              favorite.target_id === item.experience_id,
          )) &&
        [item.title, item.conditions, item.note, item.base_model_id]
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) ?? []
  const library = (
    <main className="center">
      <PanelHead title={favoritePage ? '收藏' : '经验'}>{back}</PanelHead>
      <div className="library" {...scrollPanel(`${view.page}:${view.workId}`)}>
        <div className="library-tools">
          <input
            type="search"
            placeholder="搜索结论、底模或适用条件"
            aria-label="搜索经验与收藏"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {favoritePage && (
          <div className="eyebrow" style={{ margin: '5px 0 14px' }}>
            收藏的经验
          </div>
        )}
        <div>
          {experiences.map((item) => (
            <article className="experience-card" key={item.experience_id}>
              <span className="eyebrow">{item.base_model_id}</span>
              <h3>{item.title}</h3>
              <p>
                {item.conditions}
                <br />
                {item.note}
              </p>
              <div className="evidence">
                <span className="muted">支持记录</span>
                {item.evidence_run_ids.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => selectRun(id)}
                  >
                    {id} ↗
                  </button>
                ))}
              </div>
              <div className="row">
                <Button
                  kind="small"
                  icon="branch"
                  onClick={() =>
                    void action('reuse', { id: item.experience_id })
                  }
                >
                  复用经验
                </Button>
                <Button
                  kind="small quiet"
                  icon="star"
                  onClick={() =>
                    void action('favorite', {
                      id: item.experience_id,
                      value: 'experience',
                    })
                  }
                >
                  {p?.favorites.some(
                    (favorite) =>
                      favorite.target_type === 'experience' &&
                      favorite.target_id === item.experience_id,
                  )
                    ? '移除收藏'
                    : '添加收藏'}
                </Button>
              </div>
            </article>
          ))}
          {!experiences.length && (
            <div className="empty">
              <h3>{favoritePage ? '尚未收藏经验' : '尚未保存经验'}</h3>
              <Button
                kind="small"
                onClick={() =>
                  changePage(favoritePage ? 'experiences' : 'workbench')
                }
              >
                {favoritePage ? '查看经验' : '查看结果'}
              </Button>
            </div>
          )}
          {favoritePage &&
            p?.favorites
              .filter((item) => item.target_type === 'run')
              .map((item) =>
                p.runs.find((run) => run.run_id === item.target_id),
              )
              .filter((item): item is WorkbenchRun => !!item)
              .map((item) => (
                <article className="experience-card" key={item.run_id}>
                  <h3>
                    <Identifier value={item.run_id} /> · {item.title}
                  </h3>
                  <p>
                    {item.generation_input.model?.file_name} ·{' '}
                    {branchFor(item)?.name} · 任务 {item.workbench_task_id}
                  </p>
                  <div className="row">
                    <Button
                      kind="small"
                      onClick={() => selectRun(item.run_id)}
                    >
                      查看运行
                    </Button>
                    <Button
                      kind="small quiet"
                      onClick={() =>
                        void action('favorite', {
                          id: item.run_id,
                          value: 'run',
                        })
                      }
                    >
                      移除收藏
                    </Button>
                  </div>
                </article>
              ))}
        </div>
      </div>
    </main>
  )
  const taskStatus: Record<Task['status'], string> = {
    pending: '等待执行',
    running: 'Agent 执行中',
    waiting_input: '等待输入',
    waiting_generation: '等待生成',
    needs_attention: '需要处理',
    paused: '已暂停',
    succeeded: '已完成',
    failed: '失败',
    interrupted: '已中断',
  }
  const tasks = (
    <main className="center">
      <PanelHead title="任务">{back}</PanelHead>
      <div className="agent-task-list" {...scrollPanel(`tasks:${view.workId}`)}>
        {p?.tasks
          .slice()
          .reverse()
          .map((item) => {
            const artifacts = p.artifacts.filter(
                (artifact) => artifact.task_id === item.task_id,
              ),
              question = artifacts
                .slice()
                .reverse()
                .find((artifact) => artifact.type === 'question'),
              taskRuns = p.runs.filter(
                (run) => run.workbench_task_id === item.task_id,
              )
            return (
              <article
                className="agent-task-card"
                data-task={item.task_id}
                data-session={item.session_id ?? undefined}
                key={item.task_id}
              >
                <div className="row between">
                  <h2>{item.title}</h2>
                  <span
                    className={`pill ${item.status === 'succeeded' ? '' : item.status === 'failed' ? 'red' : 'amber'}`}
                  >
                    {taskStatus[item.status]}
                  </span>
                </div>
                <div className="task-meta">
                  <span className="mono"><Identifier value={item.task_id} /></span>
                  <Button
                    kind="small quiet"
                    onClick={() => {
                      selectBranch(item.branch_id)
                      changePage('workbench')
                    }}
                  >
                    {
                      p.branches.find(
                        (branch) => branch.branch_id === item.branch_id,
                      )?.name
                    }
                  </Button>
                </div>
                <p className="task-preset">
                  Agent 预设：{presetName(item.binding_snapshot.preset_id)}
                </p>
                <p className="task-model">
                  Agent 模型：
                  {formatAgentModel(item.binding_snapshot.agentModel)}
                </p>
                <p className="task-request">
                  {item.input.requirements.instructions ||
                    item.input.requirements.original_request}
                </p>
                <div className="task-skills">
                  {item.input.requested_skill ? (
                    <>
                      <span>Skill</span>
                      <code>{item.input.requested_skill}</code>
                    </>
                  ) : (
                    <span>使用预设中的工具</span>
                  )}
                </div>
                {item.status === 'running' && (
                  <div className="task-progress">
                    <span className="loading-ring" />
                    Agent 执行中
                  </div>
                )}
                {item.error && (
                  <p className="task-conflict">{item.error.message}</p>
                )}
                {item.status === 'waiting_input' &&
                  question?.artifact.type === 'question' && (
                    <form
                      className="task-answer"
                      onSubmit={(event) => {
                        event.preventDefault()
                        const form = event.currentTarget
                        void action('task-answer', {
                          taskId: item.task_id,
                          id: question.artifact_id,
                          value: new FormData(form).get('answer'),
                        })
                      }}
                    >
                      <label className="field">
                        <span>{question.artifact.question}</span>
                        <textarea
                          aria-label="补充需求"
                          name="answer"
                          required
                        />
                      </label>
                      <button className="btn primary" type="submit">
                        回复并继续
                      </button>
                    </form>
                  )}
                {artifacts
                  .filter((artifact) => artifact.type !== 'question')
                  .map((artifact) => (
                    <div className="task-output" key={artifact.artifact_id}>
                      {artifact.artifact.type === 'prompt' ? (
                        <>
                          <h3>正向提示词</h3>
                          <p>{artifact.artifact.positive_prompt}</p>
                          <h3>负向提示词</h3>
                          <p>{artifact.artifact.negative_prompt || '—'}</p>
                        </>
                      ) : artifact.artifact.type === 'review' ? (
                        <>
                          <h3>观察</h3>
                          <p>{artifact.artifact.observation}</p>
                          <h3>评价结论</h3>
                          <p>{artifact.artifact.conclusion}</p>
                        </>
                      ) : artifact.artifact.type === 'experience' ? (
                        <>
                          <h3>{artifact.artifact.title}</h3>
                          <p>{artifact.artifact.conditions}</p>
                          <p>{artifact.artifact.note}</p>
                        </>
                      ) : (
                        <pre>{JSON.stringify(artifact.artifact, null, 2)}</pre>
                      )}
                      {artifact.disposition === 'candidate' && (
                        <Button
                          kind="small primary"
                          onClick={() =>
                            void action('task-apply', {
                              taskId: item.task_id,
                              id: artifact.artifact_id,
                            })
                          }
                        >
                          {artifact.type === 'prompt'
                            ? '采用提示词'
                            : artifact.type === 'parameters'
                              ? '采用参数'
                              : artifact.type === 'resources'
                                ? '采用资源'
                                : artifact.type === 'review'
                                  ? '填入评价'
                                  : artifact.type === 'experience'
                                    ? '填入经验'
                                    : '采用建议输入'}
                        </Button>
                      )}
                    </div>
                  ))}
                {taskRuns.map((run) => (
                  <div className="task-output" key={run.run_id}>
                    <Button
                      kind="small"
                      onClick={() => selectRun(run.run_id)}
                    >
                      查看运行 <Identifier value={run.run_id} />
                    </Button>
                  </div>
                ))}
                <details className="task-input">
                  <summary>查看任务详情</summary>
                  <p>执行要求</p>
                  <pre className="request-snapshot">{item.request_text}</pre>
                  <p>任务输入</p>
                  <pre className="request-snapshot" aria-label="任务输入 JSON">
                    {JSON.stringify(item.input, null, 2)}
                  </pre>
                </details>
                <div className="row task-actions">
                  {item.status === 'running' && (
                    <Button
                      kind="small"
                      onClick={() =>
                        void action('task-interrupt', { taskId: item.task_id })
                      }
                    >
                      中断任务
                    </Button>
                  )}
                  {item.status === 'interrupted' && (
                    <Button
                      kind="small primary"
                      onClick={() =>
                        void action('task-resume', { taskId: item.task_id })
                      }
                    >
                      继续任务
                    </Button>
                  )}
                </div>
              </article>
            )
          })}
        {!p?.tasks.length && (
          <div className="empty">
            <h3>暂无任务</h3>
            {agentButton('生成提示词', 'prompt')}
          </div>
        )}
      </div>
    </main>
  )
  const inputs =
    view.inspectRun && run && branch
      ? {
          ...branch.draft,
          generation_input: run.generation_input,
          prompt_input: {
            positive_prompt: String(runParameter(run, 'positive_prompt') ?? ''),
            negative_prompt: String(runParameter(run, 'negative_prompt') ?? ''),
          },
        }
      : branch?.draft
  const selectedTemplateId = inputs?.generation_input.template_id ?? null
  const { details: selectedTemplate, error: selectedTemplateError } = useCatalogDetails(
    selectedTemplateId ? { kind: 'comfyui-template', id: selectedTemplateId } : null,
    props.catalog?.details,
  )
  const selectedTemplateName = selectedTemplate?.kind === 'comfyui-template' && selectedTemplate.id === selectedTemplateId
    ? selectedTemplate.item.label : ''
  useEffect(() => {
    if (selectedTemplateError) setMessage(selectedTemplateError)
  }, [selectedTemplateError, setMessage])
  const parameterScope = branch && state.workspaceId
    ? inputDescriptionCache.key(state.workspaceId, branch.draft.generation_input) : ''
  const parameterFieldEditor = useBranchFieldEdits(state.workspaceId, view.workId, view.branchId, parameterScope)
  const inputDescription = inputs
    ? descriptionFor(inputs.generation_input)
    : null
  const inputParameter = (kind: StandardRuntimeParameterKind) =>
    inputs
      ? readExperimentParameter(
          inputDescription,
          inputs.generation_input.parameters,
          kind,
        )
      : undefined
  const sizes = inputs
    ? experimentSizeOptions(
        inputDescription,
        inputs.generation_input.parameters,
      )
    : []
  const currentSize = sizes.find((size) => size.current)?.value ?? ''
  const experiment = p?.experiments.find(
    (item) =>
      p.tasks.find((task) => task.task_id === item.task_id)?.branch_id ===
        branch?.branch_id && ['running', 'paused'].includes(item.control_state),
  )
  const locked = view.inspectRun || !!experiment
  const pending = branchRuns(branch?.branch_id ?? '').some(pendingRun)
  const saveField = async (id: string, options: FieldOptions, value: string, expectedValue: string, resourceId?: string) => {
    const currentWork = () => {
      const current = store.getSnapshot()
      return current.workspaceId === state.workspaceId && current.view.workId === view.workId
    }
    const currentBranch = () => currentWork() && store.getSnapshot().view.branchId === view.branchId
    try {
      await props.onAction({
        type: options.branch ? 'update-branch' : 'update-draft',
        workspaceId: state.workspaceId ?? '',
        workId: view.workId ?? undefined,
        branchId: view.branchId ?? undefined,
        field: id,
        ...(resourceId === undefined ? {} : { id: resourceId }),
        value: options.type === 'number' ? Number(value) : value,
        ...(options.branch ? { expectedValue } : {}),
      })
    } catch (error) {
      if (currentBranch()) setMessage(error instanceof Error ? error.message : '操作失败，请重试。')
      return false
    }
    if (currentWork()) await store.refresh()
    return true
  }
  const field = (
    label: string,
    id: string,
    value: JsonValue | undefined,
    options: FieldOptions = {},
    identity = id,
    editor = fieldEditor(identity),
  ) => <AutosaveField
    key={JSON.stringify([state.workspaceId, view.workId, branch?.branch_id, locked, identity])}
    label={label}
    className="field"
    id={id}
    value={value === null || value === undefined ? '' : String(value)}
    options={options}
    editor={editor}
    locked={locked}
    save={(nextValue, expectedValue) => saveField(id, options, nextValue, expectedValue)}
  />
  const parameterField = (label: string, id: string, kind: StandardRuntimeParameterKind, options: FieldOptions = {}) => {
    const parameter = findExperimentParameter(inputDescription, kind)
    return field(label, id, inputParameter(kind), { ...options, disabled: !parameter }, JSON.stringify([
      inputs?.generation_input.instance_id, inputs?.generation_input.template_id, kind, parameter?.parameter_id,
    ]), parameterFieldEditor(parameter?.parameter_id ?? kind))
  }
  const openCatalog = (kind: CatalogKind) => {
    setCatalogQueryDraft({ workspaceId: state.workspaceId, value: '' })
    store.updateView({
      page: 'resources',
      catalogFilters: { ...view.catalogFilters, kind, baseModelId: branch?.draft.base_model_id ?? '', modelId: '', query: '', page: 1 },
      catalogDetail: null,
      catalogGallery: null,
    })
  }
  const openContextDetails = (item: CatalogReference) => {
    const changedKind = view.catalogFilters.kind !== item.kind
    if (changedKind) setCatalogQueryDraft({ workspaceId: state.workspaceId, value: '' })
    navigate(() => store.updateView({
      page: 'resources',
      ...(changedKind ? { catalogFilters: { ...store.getSnapshot().view.catalogFilters, kind: item.kind, query: '', page: 1 } } : {}),
      catalogDetail: item,
      catalogGallery: null,
    }))
  }
  const inspector = branch && inputs && (
    <aside className="inspector">
      <header className="config-head">
        <span className="muted">当前分支</span>
        <h2>{branch.name}</h2>
        <p>所属工作：{work?.name}</p>
        <p title={branch.source_run_id ?? branch.source_artifact_id ?? undefined}>
          起点：
          {branch.parent_branch_id
            ? `${p?.branches.find((item) => item.branch_id === branch.parent_branch_id)?.name} / ${shortId(branch.source_run_id || branch.source_artifact_id || '任务输入')}`
            : '新建主分支'}
        </p>
      </header>
      <div
        className="inspector-body"
        {...scrollPanel(`inspector:${view.workId}:${view.branchId}`)}
      >
        {run && (
          <label className="snapshot-toggle">
            <input
              type="checkbox"
              aria-label="查看运行输入"
              checked={view.inspectRun}
              onChange={(event) =>
                store.updateView({ inspectRun: event.target.checked })
              }
            />
            查看运行输入 · <Identifier value={run.run_id} />
          </label>
        )}
        <div className="section-label">
          <span title={view.inspectRun ? run?.run_id : undefined}>
            {view.inspectRun
              ? `${shortId(run?.run_id ?? '')} · 运行输入`
              : experiment
                ? '实验初始输入'
                : '任务输入'}
          </span>
        </div>
        {experiment && (
          <div className="taskbox">
            <span className="pill amber">
              {experiment.control_state === 'paused' ? '已暂停' : '实验运行中'}
            </span>
            <p>
              已完成 {experiment.submitted_count} / {experiment.max_runs} 次
            </p>
          </div>
        )}
        <fieldset className="configuration" disabled={locked}>
          {field('分支名称', 'name', branch.name, {
            maxLength: 40,
            branch: true,
          })}
          {field('原始需求', 'original_request', branch.original_request, {
            multiline: true,
            short: true,
            branch: true,
          })}
          <div className="agent-inputs">
            {agentButton('生成提示词', 'prompt', locked)}
            <small className="function-preset">
              Agent 预设：{presetName(binding('prompt')?.preset_id)}
            </small>
            <small className="execution-model">
              Agent 模型：{agentModel(binding('prompt'))}
            </small>
            {customActions(['prompt'], locked)}
          </div>
          <label className="field">
            <span>ComfyUI 实例</span>
            <select
              aria-label="ComfyUI 实例"
              value={inputs.generation_input.instance_id ?? ''}
              onChange={(event) =>
                void action('update-draft', {
                  field: 'instance_id',
                  value: event.target.value || null,
                })
              }
            >
              <option value="">请选择</option>
              {props.instances?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
              {inputs.generation_input.instance_id &&
                !props.instances?.some(
                  (item) => item.id === inputs.generation_input.instance_id,
                ) && (
                  <option value={inputs.generation_input.instance_id}>
                    {inputs.generation_input.instance_id}
                  </option>
                )}
            </select>
          </label>
          <section aria-label="已选资源" className="selected-resources">
            <div className="row between">
              <h3>已选资源</h3>
              <Button
                kind="small quiet"
                icon="plus"
                onClick={() => openCatalog('model')}
              >
                选择资源
              </Button>
            </div>
            <div className="agent-field-action">
              {agentButton('推荐资源', 'resources', locked)}
            </div>
            <div className="picked-item">
              <span>生成模型 · {modelLabel(inputs)}</span>
              <b>{inputs.generation_input.model?.file_name ?? '未选择'}</b>
              <Button
                kind="small quiet"
                label="更换生成模型"
                onClick={() => openCatalog('model')}
              >
                更换
              </Button>
            </div>
            <div className="picked-item">
              <span>Workflow 模板</span>
              <b>{selectedTemplateId ? selectedTemplateName : '未选择'}</b>
              <Button
                kind="small quiet"
                label="选择 Workflow 模板"
                onClick={() => openCatalog('comfyui-template')}
              >
                {inputs.generation_input.template_id ? '更换' : '选择'}
              </Button>
            </div>
            <div className="picked-loras">
              <div className="row between">
                <span>LoRA</span>
                <Button
                  kind="small quiet"
                  icon="plus"
                  label="添加 LoRA"
                  onClick={() => openCatalog('lora')}
                >
                  添加
                </Button>
              </div>
              {inputs.generation_input.loras.map((item) => (
                <LoraSummary
                  key={item.id}
                  scope={{ workspaceId: state.workspaceId, workId: view.workId, branchId: view.branchId }}
                  item={item}
                  load={props.catalog?.details}
                  locked={locked}
                  onError={setMessage}
                  save={(value, expectedValue) => saveField('lora-weight', { type: 'number' }, value, expectedValue, item.id)}
                  onRemove={() => void action('resource-remove', { id: item.id, value: 'lora' })}
                />
              ))}
              {!inputs.generation_input.loras.length && (
                <p className="muted">未选择 LoRA</p>
              )}
            </div>
          </section>
          <section aria-label="参考上下文" className="selected-contexts">
            <div className="row between">
              <h3>参考上下文</h3>
              <Button
                kind="small quiet"
                icon="plus"
                label="添加参考上下文"
                onClick={() => openCatalog('character')}
              >
                添加
              </Button>
            </div>
            {inputs.context_refs.map((item) => (
              <ContextSummary
                key={workbenchContextKey(item)}
                item={item}
                load={props.catalog?.details}
                onError={setMessage}
                onDetail={() => openContextDetails(item)}
                onRemove={() => {
                  if (!locked) void action('resource-remove', { id: item.id, value: item.kind })
                }}
              />
            ))}
            {!inputs.context_refs.length && (
              <p className="muted">未添加参考上下文</p>
            )}
          </section>
          {customActions(['resources'], locked)}
          <details className="config-section" open>
            <summary>提示词与参考图路径</summary>
            <div className="agent-field-action">
              {agentButton('改写提示词', 'rewrite', locked)}
              {customActions(['rewrite'], locked)}
            </div>
            {field(
              '正向提示词',
              'positive_prompt',
              inputs.prompt_input.positive_prompt,
              { multiline: true, saveOnChange: true },
            )}
            {field(
              '负向提示词',
              'negative_prompt',
              inputs.prompt_input.negative_prompt,
              { multiline: true, short: true, saveOnChange: true },
            )}
            {parameterField('参考图路径', 'references', 'reference_image')}
          </details>
          <details className="config-section" open>
            <summary>生成参数</summary>
            <div className="agent-field-action">
              {agentButton('建议参数', 'parameters', locked)}
              {customActions(['parameters'], locked)}
            </div>
            <div className="fields2">
              {parameterField('采样步数', 'steps', 'steps', {
                type: 'number',
                min: 1,
                max: 100,
              })}
              {parameterField('引导强度', 'cfg', 'cfg', {
                type: 'number',
                min: 0,
                max: 30,
                step: 0.5,
              })}
            </div>
            <div className="fields2">
              {parameterField('Seed', 'seed', 'seed', {
                type: 'number',
                min: 0,
              })}
              <label className="field">
                <span>画面尺寸</span>
                <select
                  aria-label="画面尺寸"
                  disabled={!sizes.length}
                  value={currentSize}
                  onChange={(event) => {
                    const size = sizes.find(
                      (size) => size.value === event.target.value,
                    )
                    if (size)
                      void action('update-draft', {
                        field: 'size',
                        value: {
                          candidate_id: size.candidate_id,
                          parameters: size.parameters,
                        },
                      })
                  }}
                >
                  {!currentSize && <option value="">请选择</option>}
                  {sizes.map((size) => (
                    <option key={size.value} value={size.value}>
                      {size.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </details>
        </fieldset>
        {branch.source_experience_id && (
          <div className="note">
            <Button
              kind="small quiet"
              onClick={() => changePage('experiences')}
            >
              查看来源经验
            </Button>
          </div>
        )}
      </div>
      <div className="inspector-foot execution-controls">
        {!experiment && !view.inspectRun && (
          <div className="preset-picker">
            <label className="field">
              <span>
                {branch.execution.mode === 'continuous'
                  ? '持续实验'
                  : '运行任务'}{' '}
                · 本次预设
              </span>
              <select
                aria-label="本次执行预设"
                value={view.presetOverride ?? ''}
                onChange={(event) =>
                  store.updateView({
                    presetOverride: event.target.value || null,
                  })
                }
              >
                <option value="">
                  默认 ·{' '}
                  {presetName(
                    binding(
                      branch.execution.mode === 'continuous'
                        ? 'experiment'
                        : 'run',
                    )?.preset_id,
                  )}
                </option>
                {props.presets?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="execution-model">
              Agent 模型：
              {agentModel(
                binding(
                  branch.execution.mode === 'continuous' ? 'experiment' : 'run',
                ),
              )}
            </p>
          </div>
        )}
        {experiment ? (
          <div className="row">
            <Button
              kind="primary"
              icon={experiment.control_state === 'paused' ? 'run' : 'history'}
              onClick={() =>
                void action(
                  experiment.control_state === 'paused'
                    ? 'resume-experiment'
                    : 'pause-experiment',
                  { taskId: experiment.task_id },
                )
              }
            >
              {experiment.control_state === 'paused' ? '继续实验' : '暂停实验'}
            </Button>
            <Button
              kind="small"
              onClick={() =>
                void action('stop-experiment', { taskId: experiment.task_id })
              }
            >
              结束实验
            </Button>
          </div>
        ) : view.inspectRun ? (
          <Button
            kind="primary"
            onClick={() => store.updateView({ inspectRun: false })}
          >
            编辑任务输入
          </Button>
        ) : (
          <>
            <fieldset className="configuration">
              <legend>执行方式</legend>
              <div className="execution-modes">
                {[
                  ['once', '运行一次'],
                  ['continuous', '持续实验'],
                ].map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="execution-mode"
                      value={value}
                      aria-label={label}
                      checked={branch.execution.mode === value}
                      disabled={pending}
                      onChange={() =>
                        void action('update-execution', {
                          field: 'mode',
                          value,
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            {branch.execution.mode === 'continuous' && (
              <div className="experiment-options">
                <label className="row between">
                  最多运行次数
                  <select
                    aria-label="最多运行次数"
                    value={branch.execution.max_runs}
                    onChange={(event) =>
                      void action('update-execution', {
                        field: 'max_runs',
                        value: Number(event.target.value),
                      })
                    }
                  >
                    {[2, 3, 5].map((count) => (
                      <option key={count} value={count}>
                        {count} 次
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <Button
              kind="primary"
              icon="run"
              disabled={
                pending ||
                !binding(
                  branch.execution.mode === 'continuous' ? 'experiment' : 'run',
                )
              }
              onClick={() => {
                void action(
                  branch.execution.mode === 'continuous' ? 'experiment' : 'run',
                  { value: { preset_override: view.presetOverride } },
                )
                store.updateView({ presetOverride: null })
              }}
            >
              {pending
                ? '正在运行'
                : branch.execution.mode === 'continuous'
                  ? '开始实验'
                  : '运行任务'}
            </Button>
            <div className="custom-run-actions">
              {customActions(
                [branch.execution.mode === 'continuous' ? 'experiment' : 'run'],
                pending,
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  )

  const settings = (
    <ExperimentFunctionSettings
      key={state.workspaceId}
      workspaceId={state.workspaceId ?? ''}
      workspaceName={workspace?.name}
      functions={p?.functions.map(item => functionBindings.get(JSON.stringify([item.workspace_id, item.function_id])) ?? item) ?? []}
      presets={props.presets ?? []}
      models={props.agentModelGroups ?? []}
      remote={props.remote}
      onToast={setMessage}
      onBack={() => changePage('workbench')}
      onChange={async change => {
        if (!state.workspaceId) return
        const request: ExperimentWorkbenchAction = {
          workspaceId: state.workspaceId,
          ...(view.workId ? { workId: view.workId } : {}),
          ...(view.branchId ? { branchId: view.branchId } : {}),
          ...change,
        }
        const save = async () => { await props.onAction(request); await store.refresh() }
        if (!('id' in change)) return save()
        const key = JSON.stringify([request.workspaceId, change.id])
        const currentBinding = functionBindings.get(key) ?? p?.functions.find(item => item.function_id === change.id)
        const submittedBinding = change.type === 'function-edit' ? change.value : change.type === 'function-preset' && currentBinding ? { ...currentBinding, preset_id: change.value } : null
        if (submittedBinding) setFunctionBindings(current => new Map(current).set(key, submittedBinding))
        const pending = (functionWrites.current.get(key) ?? Promise.resolve()).then(save, save)
        functionWrites.current.set(key, pending)
        try { await pending }
        finally {
          if (functionWrites.current.get(key) === pending) functionWrites.current.delete(key)
          if (submittedBinding) setFunctionBindings(current => {
            if (current.get(key) !== submittedBinding) return current
            const next = new Map(current)
            next.delete(key)
            return next
          })
        }
      }}
    />
  )
  const modalTitle =
    modal === 'new-work'
      ? '新建工作'
      : modal === 'new-workspace'
        ? '添加工作区'
        : modal === 'branch'
          ? '创建子分支'
          : modal === 'model-change'
            ? '更换生成模型'
            : `${run?.run_id} · 图片 1`
  return (
    <div className="experiment-workbench" ref={host}>
      <div className="experiment-workbench-content">
        <header className="titlebar">
          <span className="brandmark">h</span>
          <span className="brand">
            HARNESS{' '}
            <span style={{ fontWeight: 400, color: '#8a958c' }}>/ COMFYUI</span>
          </span>
          <span className="divider" />
          <div className="row workspace-switch">
            <label className="muted" htmlFor="experiment-workspace-picker">
              工作区
            </label>
            <select
              id="experiment-workspace-picker"
              aria-label="切换工作区"
              title={workspace?.path}
              value={state.workspaceId ?? ''}
              onChange={(event) => {
                selectWorkspace(event.target.value)
                props.onWorkspaceChange(event.target.value)
              }}
            >
              {!state.workspaceId && <option value="">请选择工作区</option>}
              {props.workspaces.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <Button
              kind="small quiet"
              icon="plus"
              onClick={() => setModal('new-workspace')}
            >
              添加工作区
            </Button>
            <small className="workspace-path">{workspace?.path}</small>
          </div>
          <span className="divider" />
          <b>实验工作台</b>
          <span className="spacer" />
          <Button kind="small quiet" onClick={() => changePage('settings')}>
            配置中心
          </Button>
        </header>
        {work && (
          <div className="workbar">
            <div className="row">
              <label className="muted" htmlFor="experiment-work-picker">
                工作
              </label>
              <select
                className="work-picker"
                id="experiment-work-picker"
                aria-label="切换工作"
                value={view.workId ?? ''}
                onChange={(event) => selectWork(event.target.value)}
              >
                {p?.works.map((item) => (
                  <option key={item.work_id} value={item.work_id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <Button
                kind="small quiet"
                icon="plus"
                onClick={() => setModal('new-work')}
              >
                新建工作
              </Button>
            </div>
            <nav className="nav" aria-label="工作导航">
              {(
                [
                  ['workbench', '运行结果'],
                  ['resources', '资源'],
                  ['tasks', '任务'],
                  ['experiences', '经验'],
                  ['favorites', '收藏'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-label={label}
                  className={
                    view.page === id ||
                    (id === 'workbench' && view.page === 'graph')
                      ? 'active'
                      : ''
                  }
                  onClick={() => changePage(id)}
                >
                  {label}
                  {['tasks', 'experiences', 'favorites'].includes(id) && (
                    <span className="count">
                      {id === 'tasks'
                        ? p?.tasks.length
                        : id === 'experiences'
                          ? p?.experiences.length
                          : p?.favorites.length}
                    </span>
                  )}
                </button>
              ))}
            </nav>
            <span className="spacer" />
            <Button
              kind={
                p?.runs.some(pendingRun) ? 'small running-link' : 'small quiet'
              }
              icon="history"
              label="查看运行记录"
              onClick={() => setSheet(true)}
            >
              {p?.runs.some(pendingRun)
                ? `运行记录 · ${p.runs.filter(pendingRun).length} 项运行中`
                : '运行记录'}
            </Button>
          </div>
        )}
        {state.error ? (
          <main className="empty workspace-empty">
            <h1>工作台加载失败</h1>
            <p role="alert">{state.error}</p>
            <Button onClick={() => void store.refresh()}>重试</Button>
          </main>
        ) : view.page === 'settings' ? (
          settings
        ) : state.loading && !p ? (
          <main className="empty workspace-empty" aria-label="加载工作台">
            <span className="loading-ring" />
          </main>
        ) : !work ? (
          <main className="empty workspace-empty">
            <h1>{workspace?.name ?? '实验工作台'}</h1>
            <p>{state.workspaceId ? '尚未创建工作' : '请选择工作区'}</p>
            <Button
              kind="primary"
              icon="plus"
              disabled={!state.workspaceId}
              onClick={() => setModal('new-work')}
            >
              新建工作
            </Button>
          </main>
        ) : (
          <div className="layout">
            {sidebar}
            {view.page === 'resources' ? (
              <ExperimentCatalog
                catalog={props.catalog}
                filters={view.catalogFilters}
                detailRequest={view.catalogDetail}
                gallery={view.catalogGallery}
                onGallery={catalogGallery => navigate(() => store.updateView({ catalogGallery }))}
                onDetail={catalogDetail => navigate(() => store.updateView({ catalogDetail, catalogGallery: null }))}
                queryText={catalogQueryText}
                onQueryChange={value => setCatalogQueryDraft({ workspaceId: state.workspaceId, value })}
                onFilters={(patch) => {
                  if (patch.query !== undefined) setCatalogQueryDraft({ workspaceId: state.workspaceId, value: patch.query })
                  store.updateView({ catalogFilters: { ...store.getSnapshot().view.catalogFilters, ...patch }, ...(patch.query !== undefined ? { catalogDetail: null, catalogGallery: null } : {}) })
                }}
                back={back}
                selected={inputs}
                onSelect={(item) =>
                  void selectResource(item)
                }
                onRemove={(item) =>
                  void action('resource-remove', {
                    id: item.context.id,
                    value: item.context.kind,
                  })
                }
                locked={locked}
                scroll={(panel, ready) => scrollPanel(
                  `${EXPERIMENT_CATALOG_SCROLL_PREFIX}${view.workId}:${JSON.stringify(view.catalogFilters)}:${panel}`, ready,
                )}
              />
            ) : view.page === 'tasks' ? (
              tasks
            ) : view.page === 'graph' ? (
              graph
            ) : ['favorites', 'experiences'].includes(view.page) ? (
              library
            ) : (
              results
            )}
            {inspector}
          </div>
        )}
        {sheet && (
          <div
            className="sheet-backdrop"
            onClick={(event) => {
              if (event.target === event.currentTarget) setSheet(false)
            }}
          >
            <section
              className="sheet"
              role="dialog"
              aria-modal="true"
              aria-label="运行记录"
            >
              <div className="sheet-head">
                <h2>运行记录</h2>
                <Button
                  kind="small"
                  label="关闭面板"
                  onClick={() => setSheet(false)}
                >
                  关闭
                </Button>
              </div>
              <div className="sheet-body">
                {p?.runs
                  .slice()
                  .reverse()
                  .map((item) => (
                    <article className="run-row" key={item.run_id}>
                      <div className="row between">
                        <h3>
                          <Identifier value={item.run_id} /> · {branchFor(item)?.name}
                        </h3>
                        <Status run={item} />
                      </div>
                      <p>
                        任务 {item.workbench_task_id} · 发起者：
                        {item.initiator === 'human' ? '人工' : 'Agent'} ·{' '}
                        {runModelLabel(item)} · Seed{' '}
                        {String(runParameter(item, 'seed') ?? '')}
                      </p>
                      <p>
                        执行预设：
                        {presetName(taskFor(item)?.binding_snapshot.preset_id)}
                      </p>
                      <p>
                        Agent 模型：
                        {formatAgentModel(
                          taskFor(item)?.binding_snapshot.agentModel,
                        )}
                      </p>
                      {item.error && (
                        <p style={{ color: 'var(--red)' }}>
                          {item.error.message}
                        </p>
                      )}
                      {item.review && <p>评价：{item.review.conclusion}</p>}
                      {item.retry_of_run_id && (
                        <p>重试来源：{item.retry_of_run_id}</p>
                      )}
                      <Button
                        kind="small"
                        onClick={() => {
                          selectRun(item.run_id)
                          setSheet(false)
                        }}
                      >
                        查看运行
                      </Button>
                    </article>
                  ))}
                {!p?.runs.length && <div className="empty">暂无运行记录</div>}
              </div>
            </section>
          </div>
        )}
        {modal && (
          <div
            className="modal-backdrop"
          >
            <section
              className={`modal ${modal === 'image' ? 'image-modal' : ''}`}
              role="dialog"
              aria-modal="true"
              aria-label={modal === 'model-change' ? undefined : modalTitle}
              aria-labelledby={modal === 'model-change' ? 'modal-title' : undefined}
              onKeyDown={trapDialogFocus}
            >
              <div className="modal-head">
                <h2 id={modal === 'model-change' ? 'modal-title' : undefined}>{modalTitle}</h2>
                <Button
                  kind="small quiet"
                  label={modal === 'image' ? '关闭原图' : '关闭对话框'}
                  autoFocus={modal !== 'image'}
                  onClick={() => setModal(null)}
                >
                  {modal === 'image' ? '关闭' : '×'}
                </Button>
              </div>
              {modal === 'image' ? (
                <div className="original-image">
                  {run && media(run) && <img src={media(run)} alt={run.title} />}
                </div>
              ) : modal === 'model-change' ? (
                <form id="modal-form" onSubmit={async event => {
                  event.preventDefault()
                  if (!modelChange || modelChange.navigation !== store.getNavigationSequence()) return
                  const instance = modalInstance.current
                  if (formSubmissionPending.current === instance) return
                  const isCurrent = () => modalInstance.current === instance && modelChange.navigation === store.getNavigationSequence()
                  formSubmissionPending.current = instance
                  setFormSubmitting(true)
                  setMessage(null)
                  const saved = await action('resource-select', {
                    workspaceId: modelChange.request.workspaceId,
                    workId: modelChange.request.workId,
                    branchId: modelChange.request.branchId,
                    id: modelChange.request.modelId,
                    value: {
                      kind: 'model', id: modelChange.request.modelId,
                      confirmedRemovals: modelChange.preview.removed.map(({ kind, id }) => ({ kind, id })),
                    },
                  }, isCurrent)
                  if (formSubmissionPending.current === instance) formSubmissionPending.current = null
                  if (isCurrent()) {
                    setFormSubmitting(false)
                    if (saved) setModal(null)
                  }
                }}>
                  <p>更换为 {modelChange?.preview.model.label} 后，将移除以下不兼容的资源：</p>
                  <ul className="incompatible-resources">
                    {modelChange?.preview.removed.map(item => (
                      <li key={`${item.kind}:${item.id}`}><b>{item.label}</b><small>{catalogDefinition(item.kind).label}</small></li>
                    ))}
                  </ul>
                  <div className="modal-actions">
                    <Button kind="quiet" onClick={() => setModal(null)}>取消</Button>
                    <button className="btn primary" type="submit" disabled={formSubmitting}>更换模型</button>
                  </div>
                </form>
              ) : (
                <form
                  onSubmit={async (event) => {
                    event.preventDefault()
                    const instance = modalInstance.current
                    if (formSubmissionPending.current === instance) return
                    const isCurrent = () => modalInstance.current === instance
                    setMessage(null)
                    const data = new FormData(event.currentTarget),
                      type = modal === 'branch' ? 'create-branch' : modal
                    if (!type) return
                    formSubmissionPending.current = instance
                    setFormSubmitting(true)
                    const saved = await action(type, {
                      value: {
                        name: data.get('name'),
                        ...(modal === 'new-workspace'
                          ? { path: data.get('path') }
                          : modal === 'branch'
                            ? { original_request: data.get('goal') }
                            : { goal: data.get('goal') }),
                      },
                    }, isCurrent)
                    if (formSubmissionPending.current === instance)
                      formSubmissionPending.current = null
                    if (isCurrent()) {
                      setFormSubmitting(false)
                      if (saved) setModal(null)
                    }
                  }}
                >
                  {modal === 'new-work' && <p>工作区：{workspace?.name}</p>}
                  {modal === 'branch' && (
                    <p>
                      来源：{branch?.name} · {run ? <Identifier value={run.run_id} /> : '任务输入'}
                    </p>
                  )}
                  <label className="field">
                    <span>
                      {modal === 'new-workspace'
                        ? '工作区名称'
                        : modal === 'new-work'
                          ? '工作名称'
                          : '分支名称'}
                    </span>
                    <input
                      name="name"
                      readOnly={formSubmitting}
                      aria-label={
                        modal === 'new-workspace'
                          ? '工作区名称'
                          : modal === 'new-work'
                            ? '工作名称'
                            : '分支名称'
                      }
                      maxLength={40}
                      required
                      autoComplete={modal === 'new-workspace' ? 'off' : undefined}
                      defaultValue={
                        modal === 'branch'
                          ? `探索 ${(p?.total_branch_count ?? 0) + 1}`
                          : ''
                      }
                    />
                  </label>
                  {modal === 'new-workspace' ? (
                    <label className="field">
                      <span>项目目录</span>
                      <input
                        name="path"
                        readOnly={formSubmitting}
                        aria-label="项目目录"
                        required
                        placeholder="/Users/用户名/Projects/项目目录"
                        autoComplete="off"
                      />
                    </label>
                  ) : (
                    <label className="field">
                      <span>{modal === 'branch' ? '原始需求' : '总目标'}</span>
                      <textarea
                        name="goal"
                        readOnly={formSubmitting}
                        aria-label={modal === 'branch' ? '原始需求' : '总目标'}
                        required
                        defaultValue={
                          modal === 'branch' ? branch?.original_request : ''
                        }
                      />
                    </label>
                  )}
                  <div className="modal-actions">
                    <Button kind="quiet" onClick={() => setModal(null)}>取消</Button>
                    <button className="btn primary" type="submit" disabled={formSubmitting}>
                      {modal === 'new-workspace'
                        ? '添加工作区'
                        : modal === 'branch'
                          ? '创建分支'
                          : '创建工作'}
                    </button>
                  </div>
                </form>
              )}
            </section>
          </div>
        )}
        {message && (
          <div className="toast" role="alert">
            <span>{message}</span>
          </div>
        )}
      </div>
    </div>
  )
}

interface ExperimentCatalogProps {
  readonly catalog: ExperimentWorkbenchProps['catalog']
  readonly detailRequest: CatalogDetailsRequest | null
  readonly gallery: import('./experiment-contract.ts').ExperimentViewState['catalogGallery']
  readonly onGallery: (gallery: import('./experiment-contract.ts').ExperimentViewState['catalogGallery']) => void
  readonly onDetail: (request: CatalogDetailsRequest | null) => void
  readonly filters: import('./experiment-contract.ts').ExperimentViewState['catalogFilters']
  readonly onFilters: (
    filters: Partial<import('./experiment-contract.ts').ExperimentViewState['catalogFilters']>,
  ) => void
  readonly queryText: string
  readonly onQueryChange: (query: string) => void
  readonly back: ReactNode
  readonly selected?: TaskDraft
  readonly locked: boolean
  readonly onSelect: (item: CatalogItem) => void
  readonly onRemove: (item: CatalogItem) => void
  readonly scroll: (panel: string, ready: boolean) => {
    readonly ref: (element: HTMLDivElement | null) => void
    readonly onScroll: (event: React.UIEvent<HTMLDivElement>) => void
  }
}
function ExperimentCatalog({
  catalog,
  detailRequest,
  gallery,
  onGallery,
  onDetail,
  filters,
  onFilters,
  queryText,
  onQueryChange,
  back,
  selected,
  locked,
  onSelect,
  onRemove,
  scroll,
}: ExperimentCatalogProps) {
  const { definition: kind, page: result, baseModels, baseModelStatus, models, modelError, status, error: listError, baseModelError, retry } = useCatalogBrowser({
    catalog,
    query: { kind: filters.kind, query: filters.query, page: filters.page, baseModelId: filters.baseModelId || null, modelId: filters.modelId || null },
    modelOptions: true,
  })
  const resourceRequest = gallery ?? detailRequest
  const { details: loadedDetails, error: detailError, retry: retryDetails } = useCatalogDetails(resourceRequest, catalog?.details)
  const details = loadedDetails?.kind === resourceRequest?.kind && loadedDetails?.id === resourceRequest?.id ? loadedDetails : null
  const resourceItem = details?.item ?? (resourceRequest && result?.items.find(item => item.context.kind === resourceRequest.kind && item.context.id === resourceRequest.id)) ?? null
  const detail = gallery === null ? resourceItem : null
  const galleryItem = gallery ? resourceItem : null
  const needsBaseModels = detailRequest ? !!detail?.baseModelId : (result?.items.some(item => item.baseModelId !== null) ?? false)
  const error = detailRequest === null ? listError ?? baseModelError ?? (kind.baseModelScoped ? modelError : null) : detailError ?? (needsBaseModels ? baseModelError : null)
  const retryError = detailRequest && detailError ? retryDetails : retry
  const loading = status === 'loading'
  const bases = baseModels?.items ?? []
  const selection: CatalogReference[] = [
    ...(selected?.generation_input.model ? [{ kind: 'model' as const, id: selected.generation_input.model.id }] : []),
    ...(selected?.generation_input.template_id ? [{ kind: 'comfyui-template' as const, id: selected.generation_input.template_id }] : []),
    ...(selected?.generation_input.loras.map(lora => ({ kind: 'lora' as const, id: lora.id })) ?? []),
    ...(selected?.context_refs ?? []),
  ]
  const chosen = (item: CatalogItem) => selection.some(ref => workbenchContextKey(ref) === workbenchContextKey(item.context))
  const compatibilityTarget = { baseModelId: selected?.base_model_id ?? null, modelId: selected?.generation_input.model?.id ?? null }
  const selectButton = (item: CatalogItem, selected = chosen(item)) => {
    const multiple = item.context.kind !== 'model' && item.context.kind !== 'comfyui-template'
    const compatible = item.context.kind === 'model' || catalogResourceCompatible(item, compatibilityTarget)
    const label = !compatible ? '需更换生成模型' : selected ? multiple ? '移除' : '已选择' : '选择'
    return <Button kind={selected ? 'small' : 'small primary'} disabled={locked || !compatible || selected && !multiple}
      label={`${label} ${item.label}`} pressed={selected} onClick={() => selected && multiple ? onRemove(item) : onSelect(item)}>{label}</Button>
  }
  const openGallery = (item: CatalogItem) => onGallery({ kind: item.context.kind, id: item.context.id, index: 0 })
  const galleryImages = catalogImageUrls(galleryItem)
  const galleryIndex = Math.min(gallery?.index ?? 0, Math.max(0, galleryImages.length - 1))
  useEffect(() => {
    if (!gallery || !details) return
    if (galleryImages.length === 0) onGallery(null)
    else if (gallery.index !== galleryIndex) onGallery({ ...gallery, index: galleryIndex })
  }, [gallery, details, galleryImages.length, galleryIndex, onGallery])
  const detailPreviewUrl = catalogImageUrls(detail)[0]
  const panel = gallery ? `gallery:${workbenchContextKey(gallery)}:${detailRequest ? workbenchContextKey(detailRequest) : 'list'}` : detailRequest ? `detail:${workbenchContextKey(detailRequest)}` : 'list'
  const baseModelsPending = needsBaseModels && (baseModelStatus === 'idle' || baseModelStatus === 'loading')
  const contentReady = gallery ? galleryItem !== null && detailError === null : error === null && !baseModelsPending && (detailRequest ? details !== null : status === 'ready')
  const pages = catalogPageCount(result?.totalCount ?? 0)
  useEffect(() => {
    if (result && result.kind === filters.kind && result.query === filters.query
      && result.page === filters.page && result.page > pages) {
      onFilters({ page: pages })
    }
  }, [result, filters, pages, onFilters])
  const reset = () =>
    onFilters({ ...filters, baseModelId: '', modelId: '', query: '', page: 1 })
  return (
    <main className="center">
      <PanelHead title="资源目录">{back}</PanelHead>
      <div className="catalog-browser">
        <nav className="catalog-kinds" aria-label="资源类型">
          <CatalogKinds selected={kind.kind}>{(item, selected) => (
            <button
              type="button"
              key={item.kind}
              aria-pressed={selected}
              onClick={() =>
                onFilters({ ...filters, kind: item.kind, query: '', page: 1 })
              }
            >
              {item.label}
            </button>
          )}</CatalogKinds>
        </nav>
        <div key={panel} className="catalog-content" {...scroll(panel, contentReady)}>
          {gallery ? (
            <div className="catalog-gallery">
              <div className="row between">
                <Button kind="small quiet" onClick={() => onGallery(null)}>
                  {detailRequest ? '返回详情' : '返回资源列表'}
                </Button>
                {galleryItem && <><h3>{galleryItem.label}</h3>
                <span className="mono">
                  {`${galleryIndex + 1} / ${galleryImages.length}`}
                </span></>}
              </div>
              {detailError ? <div className="empty">
                <p role="alert">{detailError}</p>
                <Button kind="small" onClick={retryDetails}>重试</Button>
              </div> : galleryItem ? <div className="gallery-stage">
                <Button
                  kind="quiet"
                  label="上一张图片"
                  disabled={galleryIndex === 0}
                  onClick={() =>
                    onGallery({ ...gallery, index: galleryIndex - 1 })
                  }
                >
                  ‹
                </Button>
                <div className="artwork">
                  <img
                    src={galleryImages[galleryIndex]}
                    alt={galleryItem.label}
                  />
                </div>
                <Button
                  kind="quiet"
                  label="下一张图片"
                  disabled={
                    galleryIndex >= galleryImages.length - 1
                  }
                  onClick={() =>
                    onGallery({ ...gallery, index: galleryIndex + 1 })
                  }
                >
                  ›
                </Button>
              </div> : <div className="empty"><span className="loading-ring" /></div>}
            </div>
          ) : detailRequest ? (
            <div className="catalog-detail">
              <div className="row between">
                <Button kind="small quiet" onClick={() => onDetail(null)}>
                  <Icon name="arrow" />返回资源列表
                </Button>
                {detail && selectButton(detail)}
              </div>
              {detail && <h2>{detail.label}</h2>}
              {detail && detailPreviewUrl !== undefined && (
                <button
                  className="detail-cover"
                  type="button"
                  aria-label={`预览图片 ${detail.label}`}
                  onClick={() => openGallery(detail)}
                >
                  <img src={detailPreviewUrl} alt={detail.label} />
                </button>
              )}
              {error ? (
                <div className="empty">
                  <p role="alert">{error}</p>
                  <Button
                    kind="small"
                    onClick={retryError}
                  >
                    重试
                  </Button>
                </div>
              ) : details ? (
                <CatalogDetailFields details={details} presentation="resource" baseModels={bases} />
              ) : (
                <div className="empty">
                  <span className="loading-ring" />
                </div>
              )}
            </div>
          ) : (
            <div className="catalog-list-panel">
              {kind.baseModelScoped && (
                <div className="catalog-filters">
                  <label>
                    底模
                    <select
                      aria-label="筛选底模"
                      value={filters.baseModelId}
                      onChange={(event) =>
                        onFilters({
                          ...filters,
                          baseModelId: event.target.value,
                          query: queryText,
                          modelId: '',
                          page: 1,
                        })
                      }
                    >
                      <option value="">全部底模</option>
                      {bases.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    生成模型
                    <select
                      aria-label="筛选生成模型"
                      value={filters.modelId}
                      onChange={(event) =>
                        onFilters({
                          ...filters,
                          modelId: event.target.value,
                          query: queryText,
                          page: 1,
                        })
                      }
                    >
                      <option value="">全部生成模型</option>
                      {models.map((item) => (
                        <option key={item.context.id} value={item.context.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              <form
                className="catalog-search"
                onSubmit={(event) => {
                  event.preventDefault()
                  onFilters({ ...filters, query: queryText.trim(), page: 1 })
                }}
              >
                <input
                  aria-label="搜索资源"
                  placeholder={`搜索${kind.label}`}
                  value={queryText}
                  onChange={(event) => onQueryChange(event.target.value)}
                />
                <button className="btn" type="submit">
                  搜索
                </button>
              </form>
              <div className="row between catalog-results-head">
                <b>{kind.label}</b>
                <small>{`${result?.totalCount ?? 0} 项`}</small>
              </div>
              {error ? (
                <div className="empty">
                  <p role="alert">{error}</p>
                  <Button
                    kind="small"
                    onClick={retryError}
                  >
                    重试
                  </Button>
                </div>
              ) : loading ? (
                <div className="empty">
                  <span className="loading-ring" />
                </div>
              ) : (
                <div className="catalog-grid">
                  <CatalogItems items={result?.items ?? []} selection={selection}>{(item, selected, key) => {
                    const previewUrl = catalogImageUrls(item)[0]
                    return (
                    <article key={key} className={`catalog-card ${selected ? 'chosen' : ''}`}>
                      {previewUrl !== undefined ? <button type="button" className="catalog-cover"
                        aria-label={`预览图片 ${item.label}`} onClick={() => openGallery(item)}>
                        <img src={previewUrl} alt={item.label} />
                      </button> : <div className="catalog-cover no-cover"><span><Icon name={item.context.kind === 'comfyui-template' ? 'grid' : 'book'} /></span></div>}
                      <div className="catalog-card-body">
                        <div className="row between"><small>{bases.find(base => base.id === item.baseModelId)?.label ?? kind.label}</small>{selected ? <span className="pill"><Icon name="check" />已选</span> : null}</div>
                        <h3 title={item.label}>{item.label}</h3>
                        <p>{item.subtitle}</p>
                        <div className="row between">
                          {selectButton(item, selected)}
                          <Button kind="small quiet" label={`查看详情 ${item.label}`} onClick={() => onDetail({ kind: item.context.kind, id: item.context.id })}>查看详情</Button>
                        </div>
                      </div>
                    </article>
                  )}}</CatalogItems>
                  {!result?.items.length && (
                    <div className="empty">
                      <h3>{catalog ? '没有匹配的资源' : '资源目录尚未连接'}</h3>
                      <Button kind="small" onClick={reset}>
                        清除筛选
                      </Button>
                    </div>
                  )}
                </div>
              )}
              <div className="catalog-pagination">
                <Button
                  kind="small"
                  disabled={filters.page <= 1 || loading}
                  onClick={() =>
                    onFilters({ ...filters, query: queryText, page: filters.page - 1 })
                  }
                >
                  上一页
                </Button>
                <span>{`${filters.page} / ${pages}`}</span>
                <Button
                  kind="small"
                  disabled={filters.page >= pages || loading}
                  onClick={() =>
                    onFilters({ ...filters, query: queryText, page: filters.page + 1 })
                  }
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

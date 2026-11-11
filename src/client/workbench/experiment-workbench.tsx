import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import {
  catalogPageCount,
  catalogDefinition,
  type CatalogItem,
  type CatalogKind,
} from '../../catalog/contract.ts'
import type {
  Branch,
  FunctionBinding,
  JsonValue,
  Task,
  StoredArtifact,
  TaskDraft,
  WorkbenchRun,
} from '../../workbench/contract.ts'
import { isRunReviewFunctionKind, WORKBENCH_BRANCH_NAME_MAX_LENGTH, WORKBENCH_RESOURCE_KINDS } from '../../workbench/contract.ts'
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
  readExperimentParameterValue,
  readExperimentParameter,
  experimentSizeOptions,
} from './experiment-input.ts'
import { flattenWorkflowRuntimeParameters } from '../../generation/inspection-contract.ts'
import type {
  WorkflowRuntimeParameterInspection,
  WorkflowRuntimeParameterInspectionParameter,
  StandardRuntimeParameterKind,
} from '../../generation/inspection-contract.ts'
import { Button, Icon, trapDialogFocus, useToastMessage } from './experiment-controls.tsx'
import { ExperimentFunctionSettings, formatExperimentAgentModel, agentModelProblem } from './experiment-function-settings.tsx'
import { ExperimentWorkbenchStore } from './experiment-store.ts'
import { AutosaveField, useBranchFieldEdits, type FieldOptions, type SaveField } from './experiment-fields.tsx'
import { RuntimeParameterField, RuntimeSizeField } from './experiment-parameter-fields.tsx'
import { RuntimeParameterSummary } from './experiment-parameter-summary.tsx'
import { TaskRequestEditor } from './experiment-task-request.ts'
import { ExperimentTaskRequestDialog } from './experiment-task-request-dialog.tsx'
import { catalogImageUrls, CatalogDetailFields, CatalogItems, CatalogKinds, useCatalogBrowser, useCatalogDetails, type CatalogApi, type CatalogReference } from './catalog-browser.tsx'
import { workbenchContextKey } from './contract.ts'
import inputOptions from './experiment-input-options.json' with { type: 'json' }
import taskPresentation from './experiment-task-presentation.json' with { type: 'json' }
import connectionPresentation from './experiment-connection-presentation.json' with { type: 'json' }
import { isGenerationRunTerminal } from '../../generation/run-status.ts'
import runPresentation from './experiment-run-presentation.json' with { type: 'json' }
import { readRunParameterValues, useRunInputs } from './experiment-run-input.ts'
import { RunReviewEditor } from './experiment-review-editor.ts'
import { ExperimentReviewDialog } from './experiment-review-dialog.tsx'
import reviewPresentation from './experiment-review-presentation.json' with { type: 'json' }
import statusPresentation from './experiment-status-presentation.json' with { type: 'json' }
import libraryPresentation from './experiment-library-presentation.json' with { type: 'json' }
import { ExperimentStatus, ExperimentTaskRounds, ExperimentRunReview } from './experiment-status.tsx'
import { ExperimentTranslationDialog } from './experiment-translation-dialog.tsx'
import { PromptEditingController } from './experiment-prompt-editor.ts'
import { ExperimentPromptDialog, PromptTaskTurns } from './experiment-prompt-dialog.tsx'
import { ExperimentImages, mergeImagePurpose } from './experiment-images.tsx'
import { taskDraftFromRunInput } from '../../workbench/validation.ts'
import { Identifier, shortId } from './experiment-identifier.tsx'
import { ExperimentReferencePicker } from './experiment-reference-picker.tsx'
import { PreparationEditor } from './experiment-preparation.ts'
import { ExperienceKnowledge, ExperienceProvenance } from './experiment-experience.tsx'
const emptyPreparation = () => null
const noPreparationSubscription = () => () => undefined

export type {
  ExperimentWorkbenchAction,
  ExperimentWorkbenchProps,
} from './experiment-contract.ts'

const pendingRun = (run: WorkbenchRun) => !isGenerationRunTerminal(run.status)
const runTime = (run: WorkbenchRun) => new Date(run.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
const runStatusLabel = (run: WorkbenchRun) => runPresentation[run.status]
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
      {runStatusLabel(run)}
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

function useRunModelName({ model, load, baseModels }: {
  readonly model: WorkbenchRun['generation_input']['model']
  readonly load?: CatalogApi['details']
  readonly baseModels: ExperimentWorkbenchProps['baseModels']
}) {
  const { details } = useCatalogDetails(model ? { kind: 'model', id: model.id } : null, load)
  const baseModel = baseModels?.find(item => details?.id === model?.id && item.id === details?.item.baseModelId)
  return baseModel?.label ?? model?.file_name ?? model?.id ?? taskPresentation.unrecorded
}

function RunModelName(props: Parameters<typeof useRunModelName>[0]) {
  return <>{useRunModelName(props)}</>
}

function FavoriteRunCard({ run, branchName, query, load, baseModels, onOpen, onRemove }: {
  readonly run: WorkbenchRun
  readonly branchName: string
  readonly query: string
  readonly load?: CatalogApi['details']
  readonly baseModels: ExperimentWorkbenchProps['baseModels']
  readonly onOpen: () => void
  readonly onRemove: () => void
}) {
  const modelName = useRunModelName({ model: run.generation_input.model, load, baseModels })
  const source = libraryPresentation.runSource.replace(/\{modelName\}|\{branchName\}|\{taskId\}/g,
    token => token === '{modelName}' ? modelName : token === '{branchName}' ? branchName : run.workbench_task_id)
  return <article className="experience-card"
    hidden={![`${shortId(run.run_id)} · ${run.title}`, source, libraryPresentation.openRun, libraryPresentation.removeFavorite]
      .join('').toLowerCase().includes(query.trim().toLowerCase())}>
    <h3><Identifier value={run.run_id} /> · {run.title}</h3>
    <p>{source}</p>
    <div className="row">
      <Button kind="small" onClick={onOpen}>{libraryPresentation.openRun}</Button>
      <Button kind="small quiet" onClick={onRemove}>{libraryPresentation.removeFavorite}</Button>
    </div>
  </article>
}


interface TaskNotificationTarget {
  readonly workspaceId: string
  readonly workId: string
  readonly taskId: string
}

function TaskResourceCandidate({ resource, load, onError, onDetail }: {
  readonly resource: CatalogReference
  readonly load: CatalogApi['details'] | undefined
  readonly onError: (message: string) => void
  readonly onDetail: () => void
}) {
  const { details, error } = useCatalogDetails(resource, load)
  useEffect(() => { if (error) onError(error) }, [error, onError])
  return <div className="row between">
    <b>{details?.item.label ?? resource.id}</b>
    <Button kind="small quiet" onClick={onDetail}>{taskPresentation.resourceDetails}</Button>
  </div>
}

function latestTaskArtifact(artifacts: readonly StoredArtifact[]) {
  return artifacts.slice().reverse().find(artifact => artifact.type !== 'question')
}

function taskConflicts(task: Task, artifacts: readonly StoredArtifact[]) {
  const artifact = latestTaskArtifact(artifacts)
  return task.output_contract.apply_mode === 'automatic' && artifact?.disposition === 'candidate' ? [artifact] : []
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
  const [message, setMessage, messageTarget, clearTransientMessage] = useToastMessage<TaskNotificationTarget | 'connection'>()
  const messageTask = messageTarget && messageTarget !== 'connection' ? messageTarget : undefined
  const connectionObservation = useRef<{
    source: ExperimentWorkbenchProps['connectionState']
    status: 'connected' | 'disconnected' | undefined
  }>({
    source: props.connectionState,
    status: props.connectionState.getSnapshot() === 'connected' ? 'connected' : undefined,
  })
  const taskCards = useRef(new Map<string, HTMLElement>())
  const [taskToReveal, setTaskToReveal] = useState<string | null>(null)
  const taskNotifications = useRef<{ readonly workspaceId: string; readonly workId: string; readonly states: Map<string, string> } | null>(null)
  const functionWrites = useRef(new Map<string, Promise<void>>())
  const [functionBindings, setFunctionBindings] = useState<ReadonlyMap<string, FunctionBinding>>(() => new Map())
  useEffect(() => {
    if (props.environmentError) setMessage(props.environmentError)
  }, [props.environmentError])
  const [formSubmitting, setFormSubmitting] = useState(false)
  const formSubmissionPending = useRef<number | null>(null)
  const modalInstance = useRef(0)
  const [sheet, setSheet] = useState(false)
  const taskRequestEditors = useMemo(() => new Map<string, TaskRequestEditor>(), [props.remote])
  const reviewEditors = useMemo(() => new Map<string, RunReviewEditor>(), [props.remote])
  const [promptTaskToOpen, setPromptTaskToOpen] = useState<{ taskId: string; branchId: string; functionId: string } | null>(null)
  const promptEditors = useMemo(() => new Map<string, PromptEditingController>(), [props.remote])
  useEffect(() => () => { for (const editor of promptEditors.values()) editor.dispose() }, [promptEditors])
  const reviewAction = useRef(props.onAction)
  reviewAction.current = props.onAction
  const [reviewEditor, setReviewEditor] = useState<RunReviewEditor | null>(null)
  const [taskRequest, setTaskRequest] = useState<{ editor: TaskRequestEditor; preparation: PreparationEditor; binding: FunctionBinding; navigation: number } | null>(null)
  const [imageRunId, setImageRunId] = useState<string | null>(null)
  const [focusExperienceId, setFocusExperienceId] = useState<string | null>(null)
  const [modal, setModalState] = useState<
    'new-work' | 'new-workspace' | 'branch' | 'image' | 'evaluate' | null
  >(null)
  const setModal = useCallback((value: typeof modal) => {
    modalInstance.current++
    setFormSubmitting(false)
    if (value !== 'image') setImageRunId(null)
    setModalState(value)
  }, [])
  const [search, setSearch] = useState('')
  const preparationEditors = useRef(new Map<string, PreparationEditor>())
  const preparationAction = useRef(props.onAction)
  preparationAction.current = props.onAction
  const [translation, setTranslation] = useState<{ field: 'positive_prompt' | 'negative_prompt'; prompts: { positive_prompt: string; negative_prompt: string }; returnFocus: HTMLElement | null } | null>(null)
  const [referencePicker, setReferencePicker] = useState<'task' | 'run' | 'experience' | 'favorite' | 'image-workflow' | 'image-agent' | null>(null)
  const [librarySelection, setLibrarySelection] = useState<readonly string[]>([])
  const [libraryRecords, setLibraryRecords] = useState<readonly import('../../workbench/contract.ts').WorkbenchRecord[]>([])
  const [sourceRecords, setSourceRecords] = useState<ReadonlyMap<string, import('../../workbench/contract.ts').WorkbenchRecord>>(() => new Map())
  useEffect(() => {
    if (!['experiences', 'favorites'].includes(state.view.page)) return
    let active = true
    void props.remote.queryRecords({ type: state.view.page === 'favorites' ? 'favorite' : 'experience' }).then(records => { if (active) setLibraryRecords(records) }).catch(error => { if (active) setMessage(error instanceof Error ? error.message : '记录加载失败，请重试。') })
    return () => { active = false }
  }, [state.view.page, state.projection?.favorites, state.projection?.experiences, props.remote])
  const [referenceDetail, setReferenceDetail] = useState<import('../../workbench/contract.ts').WorkbenchRecord | null>(null)
  const [referenceRunData, setReferenceRunData] = useState<{ input: import('../../workbench/contract.ts').WorkbenchRunInput; task?: Task; sources: import('../../workbench/contract.ts').ImageSource[] } | null>(null)
  const [referenceReadError, setReferenceReadError] = useState('')
  useEffect(() => {
    let active = true
    setReferenceRunData(null)
    setReferenceReadError('')
    if (!referenceDetail?.run) return
    const record = referenceDetail
    void Promise.all([
      props.remote.getRunInput({ workspaceId: record.workspace_id ?? '', workId: record.work_id ?? '', runId: record.id }),
      props.remote.queryRecords({ type: 'task', ...(record.task_id ? { taskId: record.task_id } : {}) }),
    ]).then(async ([input, tasks]) => {
      const sources = await props.remote.resolveImages({ image_refs: input.image_refs })
      if (active) setReferenceRunData({ input, task: tasks.find(item => item.id === record.task_id)?.task, sources: sources.images })
    }).catch(error => { if (active) setReferenceReadError(error instanceof Error ? error.message : '来源读取失败，请重新打开。') })
    return () => { active = false }
  }, [referenceDetail, props.remote])
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
  useEffect(() => {
    setModal(null)
    setReferencePicker(null)
    setReferenceDetail(null)
    setTranslation(null)
    setSheet(false)
    clearTransientMessage()
  }, [state.workspaceId, state.view.workId, state.view.branchId, props.visible])
  useEffect(() => {
    setMessage(null)
    setFocusExperienceId(null)
  }, [state.workspaceId, state.view.workId, props.visible])
  useEffect(() => {
    const source = props.connectionState
    if (connectionObservation.current.source !== source) {
      connectionObservation.current = {
        source,
        status: source.getSnapshot() === 'connected' ? 'connected' : undefined,
      }
    }
    const observe = () => {
      if (props.visible === false || document.hidden) return
      const current = source.getSnapshot(), previous = connectionObservation.current.status
      if (current === 'connected') {
        connectionObservation.current.status = 'connected'
        if (previous === 'disconnected') setMessage(connectionPresentation.connected, 'connection')
      } else if (current && previous === 'connected') {
        connectionObservation.current.status = 'disconnected'
        setMessage(connectionPresentation.disconnected, 'connection')
      }
    }
    const unsubscribe = source.subscribe(observe)
    document.addEventListener('visibilitychange', observe)
    observe()
    return () => {
      unsubscribe()
      document.removeEventListener('visibilitychange', observe)
    }
  }, [props.connectionState, props.visible, setMessage])
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTaskRequest(null)
        setReferencePicker(null)
        setReferenceDetail(null)
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
  const preparationKey = JSON.stringify([state.workspaceId, view.workId, view.branchId])
  let preparationEditor = preparationEditors.current.get(preparationKey) ?? null
  if (!preparationEditor && branch && state.workspaceId && view.workId) {
    const scope = { workspaceId: state.workspaceId, workId: view.workId, branchId: branch.branch_id }
    preparationEditor = new PreparationEditor(branch, {
      edit: async (expected, draft) => {
        const receipt = await preparationAction.current({ type: 'edit-draft', ...scope, value: { expected, draft } as unknown as JsonValue })
        return receipt && 'editingDraft' in receipt ? receipt.editingDraft ?? null : draft
      },
      save: async value => { await preparationAction.current({ type: 'save-draft', ...scope, value: value as unknown as JsonValue }) },
      onError: message => {
        const current = store.getSnapshot()
        if (current.workspaceId === scope.workspaceId && current.view.branchId === scope.branchId) setMessage(message)
      },
    })
    preparationEditors.current.set(preparationKey, preparationEditor)
  }
  const preparation = useSyncExternalStore(preparationEditor?.subscribe ?? noPreparationSubscription,
    preparationEditor?.getSnapshot ?? emptyPreparation, preparationEditor?.getSnapshot ?? emptyPreparation)
  useEffect(() => { if (branch) preparationEditor?.sync(branch) }, [preparationEditor, branch])
  const run = p?.runs.find((item) => item.run_id === view.selectedRunId)
  const taskFor = (item: WorkbenchRun) =>
    p?.tasks.find((task) => task.task_id === item.workbench_task_id)
  const executionTaskFor = (item: WorkbenchRun) => p?.tasks.find(task => task.task_id === (item.execution_task_id ?? item.workbench_task_id))
  const branchFor = (item: WorkbenchRun) =>
    p?.branches.find((branch) => branch.branch_id === taskFor(item)?.branch_id)
  const branchExperiments = p?.experiments.filter(
    item => p.tasks.find(task => task.task_id === item.task_id)?.branch_id === branch?.branch_id,
  ) ?? []
  const experiment = branchExperiments.find(item => ['running', 'paused'].includes(item.control_state))
  const displayedExperiment = experiment ?? branchExperiments.at(-1)
  const displayedExperimentTask = p?.tasks.find(task => task.task_id === displayedExperiment?.task_id)
  const displayedActiveTask = p?.tasks.filter(task => task.parent_experiment_task_id === displayedExperiment?.task_id && busyTask(task)).sort((a, b) => b.updated_at - a.updated_at)[0]
  const displayedExperimentRuns = p?.runs.filter(item => item.workbench_task_id === displayedExperiment?.task_id) ?? []
  const experimentTask = p?.tasks.find(task => task.task_id === experiment?.task_id)
  const experimentRuns = p?.runs.filter(item => item.workbench_task_id === experiment?.task_id) ?? []
  const firstExperimentRun = experimentRuns.find(item => item.iteration_index === 1)
  const runInputs = useRunInputs(props.remote.getRunInput, state.workspaceId, view.workId,
    p?.runs.filter(item => sheet || item.run_id === view.selectedRunId || item.run_id === view.compareRunId || item.run_id === firstExperimentRun?.run_id) ?? [], setMessage)
  const branchRuns = (id: string) =>
    p?.runs.filter((item) => taskFor(item)?.branch_id === id) ?? []
  const editedInput = preparation?.draft.generation_input ?? branch?.editing_draft?.generation_input ?? branch?.draft.generation_input
  useEffect(() => {
    if (
      !state.workspaceId ||
      !view.workId ||
      !branch ||
      view.inspectRun ||
      !!experiment ||
      props.visible === false
    )
      return
    let active = true
    const workspaceId = state.workspaceId,
      workId = view.workId
    const input = editedInput ?? branch.draft.generation_input
    void inputDescriptionCache
      .load({ workspaceId, workId, branchId: branch.branch_id }, input)
      .then(description => {
        if (active)
          setInputDescriptions(current => ({
            ...current,
            [inputDescriptionCache.key(workspaceId, input)]: description,
          }))
      })
      .catch(error => {
        if (active)
          setMessage(error instanceof Error ? error.message : '输入字段读取失败，请刷新工作台。')
      })
    return () => {
      active = false
    }
  }, [
    inputDescriptionCache,
    state.workspaceId,
    view.workId,
    branch?.branch_id,
    editedInput?.instance_id,
    editedInput?.template_id,
    experiment?.task_id,
    view.inspectRun,
    props.visible,
  ])
  const descriptionFor = (input: WorkbenchRun['generation_input']) =>
    state.workspaceId
      ? inputDescriptions[inputDescriptionCache.key(state.workspaceId, input)]
      : undefined
  const runParameterValues = (run: WorkbenchRun) => readRunParameterValues(runInputs.get(run.run_id), run.generation_input.parameters)
  const runParameter = (
    run: WorkbenchRun,
    kind: StandardRuntimeParameterKind,
  ) =>
    readExperimentParameter(
      runInputs.get(run.run_id)?.input_description,
      runParameterValues(run),
      kind,
    )
  const binding = (kind: string) =>
    p?.functions.find((item) => item.kind === kind && item.builtin) ??
    p?.functions.find((item) => item.kind === kind)
  const functionProblem = (selected: FunctionBinding | undefined) => {
    if (!selected) return '请先在配置中心配置此功能。'
    const preset = props.presets?.find(item => item.id === selected.preset_id)
    if (!preset || preset.broken) return preset?.broken || '执行预设不可用，请重新选择预设。'
    return agentModelProblem(selected.agent_model, props.agentModelGroups ?? [], props.routableProviders ?? [])
  }
  const executionProblem = functionProblem(binding(branch?.execution.mode === 'continuous' ? 'experiment' : 'run'))
  const presetName = (id?: string) =>
    props.presets?.find((preset) => preset.id === id)?.name ?? id ?? '未配置'
  const modelLabel = (draft: Pick<TaskDraft, 'base_model_id' | 'generation_input'>) =>
    props.baseModels?.find((item) => item.id === draft.base_model_id)?.label ||
    draft.base_model_id ||
    draft.generation_input.model?.id ||
    '未选择底模'
  const formatAgentModel = (model: FunctionBinding['agent_model'] | undefined) =>
    formatExperimentAgentModel(model, props.agentModelGroups ?? [])
  const agentModel = (binding: FunctionBinding | undefined) =>
    formatAgentModel(binding?.agent_model)
  const runModelLabel = (item: WorkbenchRun) =>
    <RunModelName model={item.generation_input.model} load={props.catalog?.details} baseModels={props.baseModels} />
  const notifyTask = (title: string, taskId: string, workId: string, kind: Exclude<keyof typeof taskPresentation.notifications, 'open'>) => {
    if (!state.workspaceId) return
    setMessage(taskPresentation.notifications[kind].replace('{title}', title).replace('{taskId}', taskId), { workspaceId: state.workspaceId, taskId, workId })
  }
  useEffect(() => {
    if (!p || !state.workspaceId || !view.workId || p.workspace_id !== state.workspaceId || p.work_id !== view.workId) return
    const previous = taskNotifications.current
    const sameWork = previous?.workspaceId === state.workspaceId && previous.workId === view.workId
    const states = new Map<string, string>()
    for (const task of p.tasks) {
      const artifacts = p.artifacts.filter(artifact => artifact.task_id === task.task_id)
      const conflicts = taskConflicts(task, artifacts)
      const kind = task.status === 'waiting_input' ? 'waiting_input'
        : conflicts.length ? 'conflict' : task.status === 'succeeded' ? 'completed' : null
      const signature = JSON.stringify([kind, kind === 'conflict' ? conflicts.map(artifact => artifact.artifact_id)
        : kind === 'waiting_input' ? artifacts.filter(artifact => artifact.type === 'question' && !task.answers.some(answer => answer.question_artifact_id === artifact.artifact_id)).map(artifact => artifact.artifact_id) : []])
      states.set(task.task_id, signature)
      if (kind && sameWork && previous.states.get(task.task_id) !== signature)
        notifyTask(task.title, task.task_id, view.workId, kind)
    }
    taskNotifications.current = { workspaceId: state.workspaceId, workId: view.workId, states }
  }, [p, state.workspaceId, view.workId])
  useEffect(() => {
    if (view.page !== 'tasks' || !taskToReveal) return
    const card = taskCards.current.get(taskToReveal)
    if (!card) return
    card.focus({ preventScroll: true })
    card.scrollIntoView({ block: 'start' })
    setTaskToReveal(null)
  }, [view.page, p?.tasks, taskToReveal])
  const openTask = (target: TaskNotificationTarget) => {
    if (target.workspaceId !== store.getSnapshot().workspaceId) return
    setTaskRequest(null)
    setModal(null)
    setSheet(false)
    navigate(() => {
      if (view.workId !== target.workId) store.selectWork(target.workId)
      const task = p?.tasks.find(item => item.task_id === target.taskId)
      if (task) store.selectBranch(task.branch_id)
      store.updateView({ page: 'tasks', compareRunId: null })
    })
    setTaskToReveal(target.taskId)
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
      const current = store.getSnapshot()
      if (!stillCurrent()) return false
      const keepsCurrentNavigation = type === 'favorite' || !!selection?.taskId || type === 'task-answer' || type === 'task-interrupt' || type === 'task-resume' || type === 'pause-experiment' || type === 'resume-experiment' || type === 'stop-experiment' || type === 'task-apply' || type === 'task-generation-apply'
      const keepsCatalogNavigation = selection && (type === 'resource-select' || type === 'resource-remove')
        && selection.workspaceId === state.workspaceId && selection.workId === view.workId && selection.branchId === view.branchId
      if (selection?.taskId && view.workId) {
        const functionId = type === 'agent-action' ? extra.id : type === 'retry' ? 'run' : type
        const functionName = p?.functions.find(item => item.function_id === functionId)?.name ?? selection.taskId
        notifyTask(functionName, selection.taskId, view.workId, 'submitted')
      }
      if (selection && !keepsCatalogNavigation && !keepsCurrentNavigation) navigate(() => {
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
      if (!keepsCurrentNavigation && selection?.branchId && selection.branchId !== view.branchId)
        selectBranch(selection.branchId)
      return !isCurrent || isCurrent()
    } catch (error) {
      if (stillCurrent())
        setMessage(error instanceof Error ? error.message : '操作失败，请重试。')
      return false
    }
  }
  const changeResource = async (type: 'resource-select' | 'resource-remove', item: CatalogItem) => {
    if (locked || !branch || !state.workspaceId || !view.workId || !preparationEditor) return
    const scope = { workspaceId: state.workspaceId, workId: view.workId, branchId: branch.branch_id }
    try {
      await preparationEditor.flush()
      await props.onAction({ type, ...scope, id: item.context.id, value: type === 'resource-select' ? item.context : item.context.kind })
      await store.refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : '资源选择失败，请重试。') }
  }
  const selectResource = (item: CatalogItem) => void changeResource('resource-select', item)
  const editorForReview = (runId: string) => {
    const target = p?.runs.find(item => item.run_id === runId)
    if (!target?.review_draft || !p?.work_id || !state.workspaceId) return null
    const targetBranch = p.tasks.find(item => item.task_id === target.workbench_task_id)?.branch_id
    if (!targetBranch) return null
    const scope = { workspaceId: state.workspaceId, workId: p.work_id, branchId: targetBranch, runId }
    const key = JSON.stringify([scope.workspaceId, scope.workId, runId])
    let editor = reviewEditors.get(key)
    if (!editor) {
      editor = new RunReviewEditor(scope, target.review_draft, async value => {
        await reviewAction.current({ ...scope, type: 'update-review-draft', value })
        if (store.getSnapshot().workspaceId === scope.workspaceId) await store.refresh()
      })
      reviewEditors.set(key, editor)
    }
    return editor
  }
  const openReview = (runId: string) => {
    const editor = editorForReview(runId)
    if (editor) { setReviewEditor(editor); setModal('evaluate') }
  }
  const openExperience = (artifact: StoredArtifact) => {
    if (artifact.artifact.type !== 'experience') return
    const runId = artifact.artifact.run_ids[0]
    const editor = runId ? editorForReview(runId) : null
    if (!editor) return
    editor.changeFields({
      title: artifact.artifact.title, conditions: artifact.artifact.conditions, note: artifact.artifact.note,
      evidence_run_ids: artifact.artifact.run_ids, experience_artifact_id: artifact.artifact_id,
    })
    setReviewEditor(editor)
    setModal('evaluate')
  }
  useEffect(() => {
    if (!p) return
    for (const editor of reviewEditors.values()) {
      if (editor.scope.workspaceId !== state.workspaceId || editor.scope.workId !== p.work_id) continue
      const target = p.runs.find(item => item.run_id === editor.scope.runId)
      if (target?.review_draft) editor.sync(target.review_draft)
    }
  }, [p, state.workspaceId, reviewEditors])
  const referenceRunIds =
    run && view.compareRunId ? [run.run_id, view.compareRunId] : []
  const invokeAgentFunction = (selected: FunctionBinding | undefined, evaluationEditor?: RunReviewEditor) => {
    if (!selected || selected.kind === 'translate') return
    const problem = functionProblem(selected)
    if (problem) { setMessage(problem); return }
    if (selected.kind === 'prompt') {
      if (!promptEditor) return
      const draft = preparationEditor?.getSnapshot().draft
      if (!draft?.base_model_id) { setMessage('请先选择底模。'); return }
      if (draft.prompt_input.positive_prompt?.trim() || draft.prompt_input.negative_prompt?.trim()) promptEditor.open(selected)
      else void promptEditor.start(selected)
      return
    }
    if (isRunReviewFunctionKind(selected.kind)) {
      const editor = evaluationEditor ?? (run ? editorForReview(run.run_id) : null)
      if (!editor) return
      const references = selected.kind === 'compare' ? [...referenceRunIds] : [editor.scope.runId]
      void editor.submit(async evaluationDraft => {
        const receipt = await props.onAction({ ...editor.scope, type: 'agent-action', id: selected.function_id,
          referenceRunIds: references, value: { evaluationDraft } })
        if (store.getSnapshot().workspaceId === editor.scope.workspaceId && store.getSnapshot().view.workId === editor.scope.workId && receipt?.taskId)
          notifyTask(selected.name, receipt.taskId, editor.scope.workId, 'submitted')
      }).then(async () => {
        if (store.getSnapshot().workspaceId === editor.scope.workspaceId) await store.refresh()
      }).catch(error => {
        if (store.getSnapshot().workspaceId === editor.scope.workspaceId) setMessage(error instanceof Error ? error.message : String(error))
      })
      return
    }
    if (inputOptions.taskRequest.kinds.includes(selected.kind) && state.workspaceId && view.workId && view.branchId && branch) {
      const scope = { workspaceId: state.workspaceId, workId: view.workId, branchId: view.branchId, functionId: selected.function_id }
      const key = JSON.stringify(Object.values(scope))
      let editor = taskRequestEditors.get(key)
      if (!editor) {
        editor = new TaskRequestEditor(scope, props.remote, preparation?.originalRequest ?? branch.original_request)
        taskRequestEditors.set(key, editor)
      }
      setTaskRequest({ editor, preparation: preparationEditor!, binding: selected, navigation: store.getNavigationSequence() })
    } else void action('agent-action', { id: selected.function_id })
  }
  const agentButton = (label: string, kind: string, disabled = false) => (
    <Button
      kind="small agent-action"
      disabled={disabled || !!functionProblem(binding(kind))}
      onClick={() => invokeAgentFunction(binding(kind))}
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
          disabled={disabled || !!functionProblem(item)}
          onClick={() => invokeAgentFunction(item)}
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
              setImageRunId(item.run_id)
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
        {runTime(item)}
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
    <main className="center review-scroll" tabIndex={0} aria-label={statusPresentation.resultContent}>
      <PanelHead title={work?.name ?? ''} description={work?.goal}>
        <Button
          kind="small"
          icon="compare"
          disabled={!run || (p?.runs.length ?? 0) < 2}
          onClick={() =>
            store.updateView({
              compareRunId:
                p?.runs.filter((item) => item.run_id !== run?.run_id).at(-1)?.run_id ??
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
            {customActions(['compare'], [compare, run].some(item => item.status !== 'succeeded'))}
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
                  {item.status === 'succeeded' ? runVisual(item, true) : <div className={`compare-run-state ${item.status}`}>
                    {pendingRun(item) && <span className="loading-ring" />}
                    <Status run={item} />
                    {item.error && <p className="execution-error">{item.error.message}</p>}
                  </div>}
                  <h3>
                    <Identifier value={item.run_id} /> · {branchFor(item)?.name}
                  </h3>
                  <p>
                    {runModelLabel(item)} · 引导强度 {String(runParameter(item, 'cfg') ?? taskPresentation.unrecorded)} · Seed{' '}
                    {String(runParameter(item, 'seed') ?? taskPresentation.unrecorded)}
                  </p>
                  <p style={{ marginTop: 6, color: 'var(--green)' }}>{runInputs.get(item.run_id)?.prompt_input?.positive_prompt ?? inputOptions.unresolved}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="canvas">
          {!run ? (
            <div className="empty">当前分支暂无运行记录。</div>
          ) : run.status === 'failed' || run.status === 'submission_unknown' ? (
            <div className="error-stage">
              <span className="pill red"><Identifier value={run.run_id} /></span>
              <h3 style={{ marginTop: 12 }}>{runStatusLabel(run)}</h3>
              <p className="execution-error">{run.error?.message}</p>
              {run.status === 'failed' && <><Button
                kind="primary"
                icon="run"
                onClick={() => void action('retry')}
              >
                重试任务
              </Button>
              {agentButton('诊断失败', 'diagnose')}
              {customActions(['diagnose'])}</>}
            </div>
          ) : pendingRun(run) ? (
            <div className="empty running-stage">
              <span className="loading-ring" aria-hidden="true" />
              <h3>{runStatusLabel(run)}</h3>
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
              {String(runParameter(run, 'seed') ?? taskPresentation.unrecorded)} ·{' '}
              {String(runParameter(run, 'steps') ?? taskPresentation.unrecorded)} 步
            </small>
            <small className="preset-provenance">
              执行预设：{presetName(executionTaskFor(run)?.binding_snapshot.preset_id)}
            </small>
            <small className="run-agent-model">
              Agent 模型：
              {formatAgentModel(executionTaskFor(run)?.binding_snapshot.agentModel)}
            </small>
          </div>
          <div className="actions">
            <Button
              kind="small"
              icon="star"
              disabled={run.status !== 'succeeded'}
              onClick={() =>
                void action('favorite', { id: run.run_id, value: { targetType: 'run', favorite: !p?.favorites.some(item => item.target_type === 'run' && item.target_id === run.run_id) } })
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
              onClick={() => openReview(run.run_id)}
            >
              {reviewPresentation.title}
            </Button>
          </div>
        </div>
      )}
      {run && <ExperimentRunReview run={run} runs={p?.runs ?? []} artifacts={p?.artifacts ?? []} onRun={selectRun} />}
      {run?.review && (
        <details className="saved-review">
          <summary>{reviewPresentation.manualReview}</summary>
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
  const referenceLocation = (branchId: string | null, workspaceId?: string | null, workId?: string | null) => {
    const target = p?.reference_destinations.find(item => item.branch_id === branchId)
    const sourceWorkspace = workspaceId ?? target?.workspace_id
    return [props.workspaces.find(item => item.id === sourceWorkspace)?.name ?? sourceWorkspace, target?.work_name ?? workId, target?.branch_name].filter(Boolean).join(' / ')
  }
  const openLibraryRun = async (id: string) => {
    try {
      const local = p?.runs.find(item => item.run_id === id)
      let record = libraryRecords.find(item => item.type === 'run' && item.id === id) ?? sourceRecords.get(`run:${id}`)
      if (!record && local) record = { type: 'run', id, run: local, title: local.title, workspace_id: state.workspaceId, work_id: view.workId, branch_id: taskFor(local)?.branch_id ?? null, task_id: local.workbench_task_id }
      if (!record) record = (await props.remote.queryRecords({ type: 'run' })).find(item => item.id === id)
      if (!record?.workspace_id || !record.work_id || !record.branch_id) { setMessage('来源记录已不可用，请重新选择。'); return }
      const target = record
      navigate(() => {
        selectWorkspace(target.workspace_id!)
        props.onWorkspaceChange(target.workspace_id!)
        store.updateView({ workId: target.work_id, branchId: target.branch_id, selectedRunId: id, inspectRun: true, compareRunId: null, page: 'workbench' })
      })
      await store.refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : '来源读取失败，请重试。') }
  }
  const favoritePage = view.page === 'favorites'
  const experiences =
    p?.experiences.filter(
      (item) => !favoritePage ||
        p.favorites.some(
          (favorite) => favorite.target_type === 'experience' &&
            favorite.target_id === item.experience_id,
        ),
    ).sort((a, b) => Number(b.experience_id === focusExperienceId) - Number(a.experience_id === focusExperienceId)) ?? []
  const favoriteRuns = favoritePage ? p?.favorites.filter(item => item.target_type === 'run')
    .map(item => p.runs.find(run => run.run_id === item.target_id) ?? libraryRecords.find(record => record.id === item.target_id)?.run)
    .filter((item): item is WorkbenchRun => !!item) ?? [] : []
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
        <div className="library-reference-tools"><label className="field"><span>添加到下次运行</span><select aria-label="引用目标分支" value={view.branchId ?? ''} onChange={event => {
          const destination = p?.reference_destinations.find(item => item.branch_id === event.target.value)
          if (destination) { selectWorkspace(destination.workspace_id); props.onWorkspaceChange(destination.workspace_id); store.updateView({ workId: destination.work_id, branchId: destination.branch_id, inspectRun: false, page: view.page }) ; void store.refresh() }
        }}><option value="">选择已有工作与分支</option>{p?.reference_destinations.map(item => <option key={item.branch_id} value={item.branch_id}>{[props.workspaces.find(workspace => workspace.id === item.workspace_id)?.name ?? item.workspace_id, item.work_name, item.branch_name].join(' / ')}</option>)}</select></label><Button kind="small primary" disabled={!librarySelection.length} onClick={() => addReferences(librarySelection.map(key => {
          const [type, id] = key.split(':')
          return libraryRecords.find(item => item.type === type && item.id === id) ?? (type === 'experience' ? { type: 'experience', id, title: p?.experiences.find(item => item.experience_id === id)?.title ?? id, workspace_id: null, work_id: null, branch_id: null, task_id: null, experience: p?.experiences.find(item => item.experience_id === id) } : { type: 'run', id, title: id, workspace_id: null, work_id: null, branch_id: null, task_id: null, run: p?.runs.find(item => item.run_id === id) })
        }))}>添加所选引用（{librarySelection.length}）</Button>{!work && <Button kind="small" onClick={() => setModal('new-work')}>新建工作</Button>}</div>
        {favoritePage && (
          <div className="eyebrow" style={{ margin: '5px 0 14px' }}>
            {libraryPresentation.favoriteExperiences}
          </div>
        )}
        <div>
          {experiences.map((item) => {
            const baseModelName = props.baseModels?.find(model => model.id === item.base_model_id)?.label ?? item.base_model_id ?? ''
            const favorite = p?.favorites.some(target => target.target_type === 'experience' && target.target_id === item.experience_id) ?? false
            return <article className="experience-card" key={item.experience_id} data-experience={item.experience_id}
              hidden={![baseModelName, item.title, item.conditions, item.note, ...item.provenance.evidence.map(evidence => evidence.run_id), '添加引用', favorite ? libraryPresentation.removeFavorite : libraryPresentation.addFavorite].join('').toLowerCase().includes(search.trim().toLowerCase())}>
              <label className="row reference-choice"><input type="checkbox" aria-label={`选择经验 ${item.experience_id}`} checked={librarySelection.includes(`experience:${item.experience_id}`)} onChange={event => setLibrarySelection(before => event.target.checked ? [...before, `experience:${item.experience_id}`] : before.filter(id => id !== `experience:${item.experience_id}`))} /><span title={item.experience_id}>选择经验 {shortId(item.experience_id)}</span></label>
              <span className="eyebrow">{baseModelName}</span>
              <h3>{item.title}</h3>
              <ExperienceKnowledge experience={item} />
              <ExperienceProvenance experience={item} location={referenceLocation(item.branch_id, libraryRecords.find(record => record.id === item.experience_id)?.workspace_id, item.work_id)} onRun={id => void openLibraryRun(id)} onTask={id => void inspectReference('task', id)} />
              <div className="row">
                <Button
                  kind="small"
                  onClick={() => addReferences([{ branch_id: null,  type: 'experience', id: item.experience_id, title: item.title, workspace_id: null, work_id: item.work_id, task_id: item.task_id, experience: item }])}
                >
                  添加引用
                </Button>
                <Button
                  kind="small quiet"
                  icon="star"
                  onClick={() =>
                    void action('favorite', {
                      id: item.experience_id,
                      value: { targetType: 'experience', favorite: !favorite },
                    })
                  }
                >
                  {favorite ? libraryPresentation.removeFavorite : libraryPresentation.addFavorite}
                </Button>
              </div>
            </article>
          })}
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
          {favoriteRuns.length > 0 && <>
            <div className="eyebrow" style={{ margin: '22px 0 14px' }}>{libraryPresentation.favoriteRuns}</div>
            {favoriteRuns.map(item => <div key={item.run_id}><label className="reference-choice"><input type="checkbox" aria-label={`选择运行 ${item.run_id}`} checked={librarySelection.includes(`run:${item.run_id}`)} onChange={event => setLibrarySelection(before => event.target.checked ? [...before, `run:${item.run_id}`] : before.filter(id => id !== `run:${item.run_id}`))} /> 选择引用</label><FavoriteRunCard run={item} branchName={branchFor(item)?.name ?? ''}
              query={search} load={props.catalog?.details} baseModels={props.baseModels}
              onOpen={() => void openLibraryRun(item.run_id)}
              onRemove={() => { void action('favorite', { id: item.run_id, value: { targetType: 'run', favorite: false } }) }} /></div>)}
          </>}
        </div>
      </div>
    </main>
  )
  const taskStatus: Record<Task['status'], string> = taskPresentation.statusLabels
  const renderTask = (item: Task): ReactNode => {
    if (!p) return null
    const artifacts = p.artifacts.filter(
                (artifact) => artifact.task_id === item.task_id,
              ),
              question = artifacts
                .slice()
                .reverse()
                .find((artifact) => artifact.type === 'question'),
              artifact = latestTaskArtifact(artifacts),
              sourceBranch = p.branches.find(branch => branch.branch_id === item.branch_id),
              canCreateBranch = artifact && item.kind !== 'experiment' && (
                artifact.type === 'prompt' || artifact.type === 'parameters' || artifact.type === 'generation_input'
                || (artifact.artifact.type === 'review' && !!artifact.artifact.candidate)
              ),
              taskExperiment = p.experiments.find(experiment => experiment.task_id === item.task_id),
              taskRuns = p.runs.filter(
                (run) => run.workbench_task_id === item.task_id || run.execution_task_id === item.task_id,
              ),
              targetDraft = item.apply_target.kind === 'branch'
                ? p.branches.find(branch => branch.branch_id === item.apply_target.id)?.draft
                : p.runs.find(run => run.run_id === item.apply_target.id)?.review_draft,
              expected = targetDraft ? structuredClone(targetDraft) : undefined
            return (
              <article
                className="agent-task-card"
                data-task={item.task_id}
                data-session={item.session_id ?? undefined}
                key={item.task_id}
                tabIndex={-1}
                ref={element => {
                  if (element) taskCards.current.set(item.task_id, element)
                  else taskCards.current.delete(item.task_id)
                }}
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
                {item.kind === 'prompt' && !item.parent_experiment_task_id && <PromptTaskTurns workspaceId={state.workspaceId ?? ''} taskId={item.task_id} remote={props.remote} pollIntervalMs={p.refreshAfterMs} onEdit={() => {
                  selectBranch(item.branch_id); changePage('workbench')
                  setPromptTaskToOpen({ taskId: item.task_id, branchId: item.branch_id, functionId: item.function_id })
                }} />}
                <p className="task-function">{taskPresentation.function.replace('{name}', item.binding_snapshot.name)}</p>
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
                    {taskStatus.running}
                  </div>
                )}
                {item.error && (
                  <p className="task-conflict">{item.error.message}</p>
                )}
                {taskConflicts(item, artifacts).length > 0 && (
                  <p className="task-conflict">{taskPresentation.conflict[item.apply_target.kind]}</p>
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
                {artifact && artifact.type !== 'generation_input' && (
                    <div className="task-output" key={artifact.artifact_id}>
                      {artifact.artifact.type === 'prompt' ? (
                        <>
                          <h3>正向提示词</h3>
                          <p>{artifact.artifact.positive_prompt}</p>
                          <h3>负向提示词</h3>
                          <p>{artifact.artifact.negative_prompt || '—'}</p>
                        </>
                      ) : artifact.artifact.type === 'parameters' ? (
                        <><h3>{taskPresentation.parameters}</h3><dl>
                          {Object.entries(artifact.artifact.parameters).map(([id, value]) => <React.Fragment key={id}>
                            <dt>{id}</dt><dd>{typeof value === 'string' ? value : JSON.stringify(value)}</dd>
                          </React.Fragment>)}
                        </dl></>
                      ) : artifact.artifact.type === 'review' ? (
                        <>
                          <h3>{item.kind === 'diagnose' ? reviewPresentation.errorTitle : reviewPresentation.fields[1]!.label}</h3>
                          <p>{artifact.artifact.observation}</p>
                          <h3>{reviewPresentation.fields[2]!.label}</h3>
                          <p>{artifact.artifact.conclusion}</p>
                          {artifact.artifact.candidate && <details>
                            <summary>{taskPresentation.candidate}</summary>
                            <pre>{JSON.stringify(artifact.artifact.candidate, null, 2)}</pre>
                          </details>}
                        </>
                      ) : artifact.artifact.type === 'resources' ? (
                        artifact.artifact.refs.map(resource => <TaskResourceCandidate key={`${resource.kind}:${resource.id}`}
                          resource={resource} load={props.catalog?.details} onError={setMessage} onDetail={() => { openCatalog(resource.kind); store.updateView({ catalogDetail: resource }) }} />)
                      ) : artifact.artifact.type === 'experience' ? (
                        <>
                          <h3>{artifact.artifact.title}</h3>
                          <p>{artifact.artifact.conditions}</p>
                          <p>{artifact.artifact.note}</p>
                        </>
                      ) : (
                        <pre>{JSON.stringify(artifact.artifact, null, 2)}</pre>
                      )}
                    </div>
                )}
                {taskExperiment ? <ExperimentTaskRounds experiment={taskExperiment} runs={taskRuns} artifacts={p.artifacts} onRun={selectRun} /> : taskRuns.map((run) => (
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
                  <pre className="request-snapshot">{item.request_text || taskPresentation.unrecorded}</pre>
                  <p>{taskPresentation.details.model}</p>
                  <pre className="request-snapshot" aria-label="Agent 调用配置 JSON">
                    {JSON.stringify({
                      create: item.session_id ? { workspaceId: p.workspace_id, sessionId: item.session_id, agentPreset: item.binding_snapshot.preset_id } : taskPresentation.unrecorded,
                      selectModel: item.session_id ? { sessionId: item.session_id, ...item.binding_snapshot.agentModel } : taskPresentation.unrecorded,
                      selectModelResult: item.selected_model ? { selected: item.selected_model } : taskPresentation.unrecorded,
                    }, null, 2)}
                  </pre>
                  <p>任务输入</p>
                  <pre className="request-snapshot" aria-label="任务输入 JSON">
                    {JSON.stringify(item.input, null, 2)}
                  </pre>
                  <p>{taskPresentation.details.artifacts}</p>
                  <pre className="request-snapshot" aria-label="产物 JSON">
                    {artifacts.length ? JSON.stringify(artifacts.map(artifact => artifact.artifact), null, 2) : taskPresentation.unrecorded}
                  </pre>
                  {item.input.reference_run_ids.length > 0 && <div className="row">
                    <span>{taskPresentation.details.runs}</span>
                    {item.input.reference_run_ids.map(runId => <Button key={runId} kind="small quiet" onClick={() => selectRun(runId)}>{runId}</Button>)}
                  </div>}
                </details>
                <div className="row task-actions">
                  {item.kind !== 'experiment' && !(item.kind === 'prompt' && !item.parent_experiment_task_id) && (item.status === 'running' || (item.status === 'waiting_generation' && item.execution_state === 'running')) && (
                    <Button
                      kind="small"
                      onClick={() =>
                        void action('task-interrupt', { taskId: item.task_id })
                      }
                    >
                      中断任务
                    </Button>
                  )}
                  {item.kind !== 'experiment' && !(item.kind === 'prompt' && !item.parent_experiment_task_id) && item.status === 'interrupted' && (
                    <Button
                      kind="small primary"
                      onClick={() =>
                        void action('task-resume', { taskId: item.task_id })
                      }
                    >
                      继续任务
                    </Button>
                  )}
                  {artifact?.disposition === 'candidate' && artifact.type !== 'generation_input' && item.kind !== 'experiment' && (
                    <Button kind="small primary" onClick={() => void action('task-apply', {
                      taskId: item.task_id, branchId: item.branch_id, id: artifact.artifact_id, value: expected,
                    })}>
                      {artifact.type === 'prompt' ? '采用提示词' : artifact.type === 'parameters' ? '采用参数'
                        : artifact.type === 'resources' ? '采用资源' : artifact.type === 'review' ? '填入评价'
                          : artifact.type === 'experience' ? '填入经验' : '采用建议输入'}
                    </Button>
                  )}
                  {sourceBranch && artifact && canCreateBranch && (
                    <Button kind="small" onClick={() => void action('task-branch', {
                      taskId: item.task_id, branchId: item.branch_id, id: artifact.artifact_id,
                      value: { name: taskPresentation.branchName.replace(/\{parent\}|\{task\}/g, token => token === '{parent}' ? sourceBranch.name : item.title) },
                    })}>{taskPresentation.branch}</Button>
                  )}
                  {artifact?.disposition === 'applied' && item.apply_target.kind === 'branch' && (
                    <Button kind="small" onClick={() => {
                      selectBranch(item.branch_id)
                      store.updateView({ page: 'workbench', selectedRunId: null, inspectRun: false, compareRunId: null })
                    }}>{taskPresentation.inputs}</Button>
                  )}
                  {artifact?.disposition === 'applied' && item.input.evaluation_input && <Button kind="small"
                    onClick={() => openReview(item.input.evaluation_input!.run_id)}>{reviewPresentation.open}</Button>}
                  {item.parent_experiment_task_id && artifact?.artifact.type === 'experience' && <Button kind="small"
                    disabled={!artifact.artifact.run_ids.some(id => p.runs.some(run => run.run_id === id && !!run.review_draft))}
                    onClick={() => openExperience(artifact)}>{reviewPresentation.open}</Button>}
                  {sourceBranch && artifact?.artifact.type === 'review' && artifact.artifact.candidate && <Button kind="small" onClick={() => void action('task-generation-apply', {
                    taskId: item.task_id, branchId: item.branch_id, id: artifact.artifact_id, value: structuredClone(sourceBranch.draft),
                  })}>{reviewPresentation.candidate}</Button>}
                </div>
                {item.kind === 'experiment' && <div className="experiment-subtasks">
                  {p.tasks.filter(child => child.parent_experiment_task_id === item.task_id).map(renderTask)}
                </div>}
              </article>
            )
  }
  const tasks = (
    <main className="center">
      <PanelHead title="任务">{back}</PanelHead>
      <div className="agent-task-list" {...scrollPanel(`tasks:${view.workId}`)}>
        {p?.tasks.filter(item => !item.parent_experiment_task_id).slice().reverse().map(renderTask)}
        {!p?.tasks.length && (
          <div className="empty">
            <h3>暂无任务</h3>
            {agentButton('生成提示词', 'prompt')}
          </div>
        )}
      </div>
    </main>
  )
  const historical = run ? runInputs.get(run.run_id) : undefined
  const editing = !view.inspectRun && !experiment && !!preparation?.editing
  const preparedDraft = preparation?.draft ?? branch?.editing_draft ?? branch?.draft
  const inputs = view.inspectRun && run ? historical ? {
    ...branch!.draft, generation_input: historical.generation_input, prompt_input: historical.prompt_input,
    image_refs: historical.image_refs, workflow_image_bindings: historical.workflow_image_bindings, parameter_mapping: historical.parameter_mapping, base_model_id: historical.base_model_id,
    reference_run_ids: taskFor(run)?.input.reference_run_ids ?? [], reference_task_ids: taskFor(run)?.input.reference_task_ids ?? [], reference_experiences: taskFor(run)?.input.reference_experiences ?? [], instructions: taskFor(run)?.input.requirements.instructions ?? '',
  } : branch?.draft : experimentTask ? { ...experimentTask.input, instructions: experimentTask.input.requirements.instructions } : (editing ? preparedDraft : branch?.draft)
  const [imageSources, setImageSources] = useState<readonly import('../../workbench/contract.ts').ImageSource[]>([])
  useEffect(() => {
    let active = true
    if (!inputs?.image_refs.length) { setImageSources([]); return }
    void props.remote.resolveImages({ image_refs: inputs.image_refs }).then(result => { if (active) setImageSources(result.images) }).catch(error => { if (active) setMessage(error instanceof Error ? error.message : '图片读取失败，请重试。') })
    return () => { active = false }
  }, [inputs?.image_refs, props.remote])
  useEffect(() => {
    let active = true
    const types = (['run', 'task'] as const).filter(type => (type === 'run' ? inputs?.reference_run_ids : inputs?.reference_task_ids)?.some(id => !sourceRecords.has(`${type}:${id}`)))
    if (!types.length) return
    void Promise.all(types.map(type => props.remote.queryRecords({ type }))).then(groups => { if (active) setSourceRecords(before => { const next = new Map(before); for (const record of groups.flat()) next.set(`${record.type}:${record.id}`, record); return next }) }).catch(error => { if (active) setMessage(error instanceof Error ? error.message : '来源读取失败，请重试。') })
    return () => { active = false }
  }, [inputs?.reference_run_ids, inputs?.reference_task_ids, props.remote])
  const promptEditorKey = state.workspaceId && view.workId && branch ? JSON.stringify([state.workspaceId, view.workId, branch.branch_id]) : null
  let promptEditor = promptEditorKey ? promptEditors.get(promptEditorKey) : undefined
  if (!promptEditor && promptEditorKey && state.workspaceId && view.workId && branch && preparationEditor) {
    promptEditor = new PromptEditingController({ workspace_id: state.workspaceId, work_id: view.workId, branch_id: branch.branch_id }, props.remote, preparationEditor, p?.refreshAfterMs ?? 0)
    promptEditors.set(promptEditorKey, promptEditor)
  }
  const promptEditing = useSyncExternalStore(promptEditor?.subscribe ?? noPreparationSubscription, promptEditor?.getSnapshot ?? emptyPreparation, promptEditor?.getSnapshot ?? emptyPreparation)
  useEffect(() => { void promptEditor?.restore() }, [promptEditor, preparedDraft?.prompt_edit_task_id])
  useEffect(() => {
    if (!promptTaskToOpen || !promptEditor || branch?.branch_id !== promptTaskToOpen.branchId) return
    const selected = p?.functions.find(item => item.function_id === promptTaskToOpen.functionId) ?? binding('prompt')
    if (!selected) return
    preparationEditor?.begin()
    promptEditor.open(selected, promptTaskToOpen.taskId)
    setPromptTaskToOpen(null)
  }, [promptTaskToOpen, promptEditor, branch?.branch_id])
  const locked = !editing
  const pending = branchRuns(branch?.branch_id ?? '').some(pendingRun)
  const beginPreparation = () => { preparationEditor?.begin(); store.updateView({ inspectRun: false }) }
  const updatePreparation = (change: Partial<TaskDraft>, branchChange?: { name?: string; originalRequest?: string }) => preparationEditor?.change(change, branchChange)
  const useReferenceRun = async (record: import('../../workbench/contract.ts').WorkbenchRecord) => {
    if (!branch || !record.run) return
    try {
      const source = await props.remote.getRunInput({ workspaceId: record.workspace_id ?? state.workspaceId ?? '', workId: record.work_id ?? '', runId: record.id })
      const restored = taskDraftFromRunInput(source, preparedDraft ?? branch.draft)
      updatePreparation({ ...restored, reference_run_ids: [source.run_id, ...restored.reference_run_ids.filter(id => id !== source.run_id)], instructions: '' })
      store.updateView({ inspectRun: false })
      setReferencePicker(null)
      setReferenceDetail(null)
    } catch (failure) { setMessage(failure instanceof Error ? failure.message : '运行输入读取失败，请重试。') }
  }
  const addReferences = (records: readonly import('../../workbench/contract.ts').WorkbenchRecord[]) => {
    if (!branch) { setMessage('请先选择已有工作与分支，或新建工作。'); return }
    setSourceRecords(before => { const next = new Map(before); for (const record of records) next.set(`${record.type}:${record.id}`, record); return next })
    const current = preparedDraft ?? branch.draft
    const experiences = [...current.reference_experiences]
    for (const record of records) if (record.type === 'experience' && record.experience && !experiences.some(item => item.experience_id === record.id)) {
      const { experience_id, title, conditions, note, provenance } = record.experience
      experiences.push({ experience_id, title, conditions, note, provenance })
    }
    updatePreparation({
      reference_experiences: experiences,
      reference_run_ids: [...new Set([...current.reference_run_ids, ...records.filter(item => item.type === 'run').map(item => item.id)])],
      reference_task_ids: [...new Set([...current.reference_task_ids, ...records.filter(item => item.type === 'task').map(item => item.id)])],
    })
    store.updateView({ inspectRun: false })
    setReferencePicker(null)
    setLibrarySelection([])
  }
  const inspectReference = async (type: 'task' | 'run' | 'experience', id: string) => {
    try {
      const records = await props.remote.queryRecords({ type })
      const record = records.find(item => item.id === id)
      if (record) { setSourceRecords(before => new Map(before).set(`${record.type}:${record.id}`, record)); setReferenceDetail(record) }
      else setMessage('来源记录已不可用，请重新选择。')
    } catch (failure) { setMessage(failure instanceof Error ? failure.message : '来源读取失败，请重试。') }
  }
  const selectedTemplateId = inputs?.generation_input.template_id ?? null
  const { details: selectedTemplate, error: selectedTemplateError } = useCatalogDetails(
    selectedTemplateId ? { kind: 'comfyui-template', id: selectedTemplateId } : null, props.catalog?.details)
  const selectedTemplateName = selectedTemplate?.kind === 'comfyui-template' && selectedTemplate.id === selectedTemplateId ? selectedTemplate.item.label : selectedTemplateId ?? ''
  useEffect(() => { if (selectedTemplateError) setMessage(selectedTemplateError) }, [selectedTemplateError, setMessage])
  const parameterScope = branch && state.workspaceId ? inputDescriptionCache.key(state.workspaceId, (preparedDraft ?? branch.draft).generation_input) : ''
  const parameterFieldEditor = useBranchFieldEdits(state.workspaceId, view.workId, view.branchId, parameterScope)
  const inputDescription = view.inspectRun ? historical?.input_description : experiment ? firstExperimentRun ? runInputs.get(firstExperimentRun.run_id)?.input_description : null : inputs ? descriptionFor(inputs.generation_input) : null
  const displayedParameters = inputs ? view.inspectRun && run ? runParameterValues(run) : inputs.generation_input.parameters : {}
  const describedParameters = inputDescription ? flattenWorkflowRuntimeParameters(inputDescription) : []
  const sizes = inputs ? experimentSizeOptions(inputDescription, displayedParameters) : []
  const currentSize = sizes.find(size => size.current)?.value ?? ''
  const saveGenerationInput = async (change: Pick<ExperimentWorkbenchAction, 'field' | 'id' | 'value'>) => {
    if (!preparedDraft) return
    if (change.field === 'parameter' && change.id) updatePreparation({ generation_input: { ...preparedDraft.generation_input, parameters: { ...preparedDraft.generation_input.parameters, [change.id]: change.value as JsonValue } } })
    else if (change.field === 'size' && change.value && typeof change.value === 'object' && !Array.isArray(change.value)) updatePreparation({ generation_input: { ...preparedDraft.generation_input, parameters: { ...preparedDraft.generation_input.parameters, ...((change.value as { parameters: Record<string, JsonValue> }).parameters) } } })
  }
  const field = (label: string, id: string, value: JsonValue | undefined, options: FieldOptions = {}) => {
    const common = { id, 'aria-label': label, value: value === null || value === undefined ? '' : String(value), onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (id === 'name') updatePreparation({}, { name: event.target.value })
      else if (id === 'original_request') updatePreparation({}, { originalRequest: event.target.value })
      else if (id === 'instructions') updatePreparation({ instructions: event.target.value })
      else if (id === 'positive_prompt' || id === 'negative_prompt') updatePreparation({ prompt_input: { ...(preparedDraft?.prompt_input ?? { positive_prompt: '', negative_prompt: '' }), [id]: event.target.value } })
    } }
    return <label className="field" key={id}><span>{label}</span>{options.multiline ? <textarea {...common} className={options.short ? id === 'original_request' ? 'short branch-goal' : 'short' : ''} /> : <input {...common} maxLength={options.maxLength} type={options.type ?? 'text'} />}</label>
  }
  const renderParameter = (parameter: WorkflowRuntimeParameterInspectionParameter) => <RuntimeParameterField key={parameter.parameter_id}
    label={describedParameters.filter(item => item.kind === parameter.kind).length > 1 ? `${inputOptions.parameterLabels[parameter.kind]}（${parameter.parameter_id}）` : inputOptions.parameterLabels[parameter.kind]} id={parameter.parameter_id} parameter={parameter} locked={locked}
    value={readExperimentParameterValue(parameter, displayedParameters)} editor={parameterFieldEditor(parameter.parameter_id)}
    save={value => saveGenerationInput({ field: 'parameter', id: parameter.parameter_id, value })} />
  const parameterField = (kind: StandardRuntimeParameterKind) => {
    const found = describedParameters.filter(item => item.kind === kind)
    return found.length ? found.map(renderParameter) : <RuntimeParameterField label={inputOptions.parameterLabels[kind]} id={kind} value={undefined} editor={parameterFieldEditor(kind)} locked={locked} />
  }
  const openCatalog = (kind: CatalogKind) => {
    setCatalogQueryDraft({ workspaceId: state.workspaceId, value: '' })
    store.updateView({ page: 'resources', catalogDetail: null, catalogGallery: null,
      catalogFilters: { ...view.catalogFilters, kind, baseModelId: inputs?.base_model_id ?? '', modelId: '', query: '', page: 1 } })
  }
  const openTranslation = (field: 'positive_prompt' | 'negative_prompt', prompts = { positive_prompt: inputs?.prompt_input.positive_prompt ?? '', negative_prompt: inputs?.prompt_input.negative_prompt ?? '' }) => {
    const root = host.current?.getRootNode() as Document | ShadowRoot | undefined
    setTranslation({ field, prompts, returnFocus: (root?.activeElement ?? document.activeElement) as HTMLElement | null })
  }
  const prompt = (id: 'positive_prompt' | 'negative_prompt') => {
    const value = inputs?.prompt_input[id] ?? '', label = inputOptions.parameterLabels[id]
    return <div className={editing ? 'field prompt-field' : 'input-readout prompt-readout'} aria-label={editing ? undefined : label} key={id}>
      <div className="row between">{editing ? <label htmlFor={id}>{label}</label> : <span>{label}</span>}{editing && promptEditing?.busy && <span role="status">正在生成提示词…</span>}<Button kind="small quiet" disabled={!value.trim()} onClick={() => openTranslation(id)}>翻译</Button></div>
      {editing ? <textarea id={id} aria-label={label} placeholder={inputs?.prompt_input[id] === null ? inputOptions.unresolved : undefined} className={id === 'negative_prompt' ? 'short' : ''} value={value}
        onChange={event => updatePreparation({ prompt_input: { ...preparedDraft!.prompt_input, [id]: event.target.value } })} /> : <div>{inputs?.prompt_input[id] === null ? inputOptions.unresolved : value || '未填写'}</div>}
    </div>
  }
  const imageInputs = inputs && <ExperimentImages input={inputs} parameters={describedParameters.filter(item => item.kind === 'reference_image')}
    {...(editing ? { editable: true as const, onChange: updatePreparation, onPick: purpose => setReferencePicker(purpose === 'workflow' ? 'image-workflow' : 'image-agent'),
    onImport: async (files, purpose) => {
      const result = await props.remote.importImages({ files: await Promise.all(files.map(async file => ({ name: file.name, media_type: file.type, bytes: [...new Uint8Array(await file.arrayBuffer())] }))) })
      let refs = preparedDraft?.image_refs ?? []
      for (const image of result.images) refs = mergeImagePurpose(refs, image, purpose)
      updatePreparation({ image_refs: refs })
    }, onError: setMessage } : { editable: false as const })} display={image => {
      const source = imageSources.find(item => item.image_ref_id === image.image_ref_id)
      if (source) return { name: source.name, url: source.url ?? undefined, source: image.source.kind === 'run_media' ? image.source.run_id : '本机图片' }
      if (image.source.kind === 'uploaded_file') return { name: image.source.file_id, source: '本机图片' }
      const media = p?.runs.flatMap(item => item.media).find(item => item.media_id === (image.source.kind === 'run_media' ? image.source.media_id : ''))
      return { name: media?.filename ?? image.source.media_id, url: media?.url, source: image.source.run_id }
    }} />
  const readout = (label: string, value: ReactNode) => <div className="input-readout" aria-label={label}><span>{label}</span><div>{value || '未填写'}</div></div>
  const referenceInputs = (referenceDraft: Pick<TaskDraft, 'reference_run_ids' | 'reference_experiences' | 'reference_task_ids'>, editable: boolean) => <section className="preparation-reference" aria-label="参考来源">
    <div className="row between"><b>参考来源</b>{editable && <Button kind="small quiet" onClick={() => setReferencePicker('run')}>引用运行</Button>}</div>
    {!!referenceDraft.reference_run_ids.length && <h3 className="reference-group-title">直接参考运行</h3>}
    {referenceDraft.reference_run_ids.map(id => {
      const record = sourceRecords.get(`run:${id}`), reference = record?.run, thumbnail = reference?.media.find(item => item.media_kind === 'image')
      return <div key={id}><div className="reference-preview"><div className="reference-thumbnail">{thumbnail?.url && <img src={thumbnail.url} alt={reference?.title} />}</div><div><strong>{id} · 任务 {record?.task_id ?? reference?.workbench_task_id}</strong><small>{record && referenceLocation(record.branch_id, record.workspace_id, record.work_id)}</small>{reference && <Status run={reference} />}</div></div><div className="row reference-actions"><Button kind="small quiet" onClick={() => void inspectReference('run', id)}>查看来源</Button>{editable && <Button kind="small quiet" onClick={() => updatePreparation({ reference_run_ids: referenceDraft.reference_run_ids.filter(item => item !== id) })}>移除引用</Button>}</div></div>
    })}
    {!!referenceDraft.reference_experiences.length && <h3 className="reference-group-title">引用经验</h3>}
    {referenceDraft.reference_experiences.map(item => <div className="reference-experience" key={item.experience_id} data-reference-experience={item.experience_id}><b>{item.title}</b><ExperienceKnowledge experience={item} /><ExperienceProvenance experience={item} onRun={id => void inspectReference('run', id)} onTask={id => void inspectReference('task', id)} /><Button kind="small quiet" onClick={() => void inspectReference('experience', item.experience_id)}>查看来源</Button>{editable && <Button kind="small quiet" onClick={() => updatePreparation({ reference_experiences: referenceDraft.reference_experiences.filter(ref => ref !== item) })}>移除引用</Button>}</div>)}
    {!!referenceDraft.reference_task_ids.length && <h3 className="reference-group-title">直接参考任务</h3>}
    {referenceDraft.reference_task_ids.map(id => {
      const record = sourceRecords.get(`task:${id}`)
      return <div className="reference-experience" key={id}><b>任务 {id} · {record?.title}</b><small>{record && referenceLocation(record.branch_id, record.workspace_id, record.work_id)}</small><div className="row"><Button kind="small quiet" onClick={() => void inspectReference('task', id)}>查看产物</Button>{editable && <Button kind="small quiet" onClick={() => updatePreparation({ reference_task_ids: referenceDraft.reference_task_ids.filter(item => item !== id) })}>移除引用</Button>}</div></div>
    })}
    {!referenceDraft.reference_run_ids.length && !referenceDraft.reference_experiences.length && !referenceDraft.reference_task_ids.length && <p className="reference-empty">尚未添加参考来源。</p>}
    {editable && <div className="row"><Button kind="small quiet" onClick={() => setReferencePicker('experience')}>引用经验</Button><Button kind="small quiet" onClick={() => setReferencePicker('favorite')}>引用收藏</Button><Button kind="small quiet" onClick={() => setReferencePicker('task')}>引用任务</Button></div>}
  </section>
  const resources = inputs && <section aria-label="已选资源" className="selected-resources">
    <div className="row between"><h3>已选资源</h3><Button kind="small quiet" icon="plus" onClick={() => openCatalog('model')}>选择资源</Button></div>
    <div className="agent-field-action">{agentButton('推荐资源', 'resources', locked)}</div>
    <div className="picked-item"><span>生成模型 · {modelLabel(inputs)}</span><b>{inputs.generation_input.model?.file_name ?? '未选择'}</b><Button kind="small quiet" label="更换生成模型" onClick={() => openCatalog('model')}>更换</Button></div>
    <div className="picked-item"><span>Workflow 模板</span><b>{selectedTemplateId ? selectedTemplateName : '未选择'}</b><Button kind="small quiet" label="选择 Workflow 模板" onClick={() => openCatalog('comfyui-template')}>{selectedTemplateId ? '更换' : '选择'}</Button></div>
    <div className="picked-loras"><div className="row between"><span>LoRA</span><Button kind="small quiet" icon="plus" label="添加 LoRA" onClick={() => openCatalog('lora')}>添加</Button></div>
      {inputs.generation_input.loras.map(item => <LoraSummary key={item.id} scope={{ workspaceId: state.workspaceId, workId: view.workId, branchId: view.branchId }} item={item} load={props.catalog?.details} locked={locked} onError={setMessage}
        save={async value => { updatePreparation({ generation_input: { ...preparedDraft!.generation_input, loras: preparedDraft!.generation_input.loras.map(lora => lora.id === item.id ? { ...lora, weight: Number(value) } : lora) } }); return true }}
        onRemove={() => updatePreparation({ generation_input: { ...preparedDraft!.generation_input, loras: preparedDraft!.generation_input.loras.filter(lora => lora.id !== item.id) } })} />)}
      {!inputs.generation_input.loras.length && <p className="muted">未选择 LoRA</p>}
    </div>
  </section>
  const savedSummary = inputs && <div className="input-summary">
    {view.inspectRun && readout('任务名称', run?.title)}
    {readout('原始需求', view.inspectRun ? taskFor(run!)?.input.requirements.original_request : experimentTask?.input.requirements.original_request ?? branch?.original_request)}
    {!!inputs.instructions && readout('本次改进要求', inputs.instructions)}
    <details className="config-section" open><summary>生成资源</summary><dl className="input-facts">
      <div><dt>ComfyUI 实例</dt><dd>{props.instances?.find(item => item.id === inputs.generation_input.instance_id)?.name ?? inputs.generation_input.instance_id ?? '未选择'}</dd></div>
      <div><dt>生成模型</dt><dd>{inputs.generation_input.model?.file_name ?? '未选择'}</dd></div><div><dt>Workflow 模板</dt><dd>{selectedTemplateName || '未选择'}</dd></div>
      <div><dt>LoRA</dt><dd>{inputs.generation_input.loras.map(item => item.file_name + ' · ' + item.weight).join('、') || '未选择'}</dd></div>
    </dl></details>
    <details className="config-section" open><summary>提示词与图片</summary>{prompt('positive_prompt')}{prompt('negative_prompt')}{imageInputs}</details>
    <details className="config-section" open><summary>生成参数</summary><RuntimeParameterSummary parameters={displayedParameters} description={inputDescription} /></details>
  </div>
  const inspector = branch && inputs && <aside className="inspector">
    <header className="config-head"><span className="muted">当前分支</span><h2>{branch.name}</h2><p>所属工作：{work?.name}</p><p>起点：{branch.parent_branch_id ? `${p?.branches.find(item => item.branch_id === branch.parent_branch_id)?.name} / ${shortId(branch.source_run_id || branch.source_artifact_id || '任务输入')}` : '新建主分支'}</p></header>
    <div className="inspector-mode"><button type="button" aria-pressed={!view.inspectRun} className={!view.inspectRun ? 'active' : ''} onClick={() => store.updateView({ inspectRun: false })}>准备运行</button><button type="button" aria-label="查看运行输入" aria-pressed={view.inspectRun} className={view.inspectRun ? 'active' : ''} disabled={!run} title={run?.run_id} onClick={() => store.updateView({ inspectRun: true })}>查看运行{run ? ` · ${shortId(run.run_id)}` : ''}</button></div>
    <div className="inspector-body" {...scrollPanel(`inspector:${view.workId}:${view.branchId}`)}>
      <div className="preparation-heading"><h3>{view.inspectRun ? `运行 ${run?.run_id}` : experiment ? '实验初始输入' : editing ? '编辑下次运行' : '下次运行'}</h3><span className={`input-state ${editing ? 'editing' : ''}`} id="preparation-state">{view.inspectRun || experiment ? '只读' : editing ? JSON.stringify(preparedDraft) === JSON.stringify(branch.draft) ? '编辑中' : '未保存' : '已保存的参数'}</span></div>
      {view.inspectRun && run && <div className="run-input-identity"><span>任务 {run.workbench_task_id}</span><Status run={run} /><span>{runTime(run)}</span></div>}
      {displayedExperiment && displayedExperimentTask && <ExperimentStatus experiment={displayedExperiment} task={displayedExperimentTask} activeTask={displayedActiveTask} runs={displayedExperimentRuns} presetName={presetName((displayedActiveTask ?? displayedExperimentTask).binding_snapshot.preset_id)} modelName={formatAgentModel((displayedActiveTask ?? displayedExperimentTask).binding_snapshot.agentModel)} onRun={selectRun} />}
      {referenceInputs(inputs, editing)}
      {view.inspectRun && !historical ? <div className="empty" aria-label="加载运行输入"><span className="loading-ring" /></div> : editing ? <fieldset className="configuration">
        {field('分支名称', 'name', preparation?.name ?? branch.name, { maxLength: WORKBENCH_BRANCH_NAME_MAX_LENGTH })}
        {field('原始需求', 'original_request', preparation?.originalRequest ?? branch.original_request, { multiline: true, short: true })}
        {!!inputs.reference_run_ids.length && field('本次改进要求', 'instructions', inputs.instructions, { multiline: true, short: true })}
        <label className="field"><span>图像底模</span><select aria-label="图像底模" value={inputs.base_model_id ?? ''} disabled={!!inputs.generation_input.model && !!inputs.base_model_id} onChange={event => updatePreparation({ base_model_id: event.target.value || null })}><option value="">请选择底模</option>{props.baseModels?.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <div className="agent-inputs">{agentButton(promptEditing?.busy ? '正在生成提示词…' : inputs.prompt_input.positive_prompt?.trim() || inputs.prompt_input.negative_prompt?.trim() ? '对比提示词' : '生成提示词', 'prompt', !!promptEditing?.busy)}<small className="function-preset">Agent 预设：{presetName(binding('prompt')?.preset_id)}</small><small className="execution-model">Agent 模型：{agentModel(binding('prompt'))}</small>{customActions(['prompt'], !!promptEditing?.busy)}</div>
        {promptEditing?.error && <p className="binding-problem" role="alert">{promptEditing.error}</p>}
        {prompt('positive_prompt')}{prompt('negative_prompt')}
        <label className="field"><span>ComfyUI 实例</span><select aria-label="ComfyUI 实例" value={inputs.generation_input.instance_id ?? ''} onChange={event => updatePreparation({ generation_input: { ...preparedDraft!.generation_input, instance_id: event.target.value || null } })}><option value="">请选择</option>{props.instances?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {resources}{customActions(['resources'], false)}
        <details className="config-section" open><summary>输入图片</summary>{imageInputs}</details>
        <details className="config-section" open><summary>生成参数</summary><div className="agent-field-action">{agentButton('建议参数', 'parameters', false)}{customActions(['parameters'], false)}</div>
          <div className="fields2">{parameterField('steps')}{parameterField('cfg')}</div>
          <div className="fields2">{parameterField('seed')}<RuntimeSizeField sizes={sizes} value={currentSize} editor={parameterFieldEditor('size')} locked={false} save={size => saveGenerationInput({ field: 'size', value: { candidate_id: size.candidate_id, parameters: size.parameters } })} /></div>
          <div className="fields2">{describedParameters.filter(item => !['positive_prompt', 'negative_prompt', 'reference_image', 'steps', 'cfg', 'seed', 'width', 'height'].includes(item.kind)).map(renderParameter)}</div>
        </details>
      </fieldset> : savedSummary}
      {view.inspectRun && historical && <><details className="task-input"><summary>提交输入</summary><pre>{JSON.stringify({ generation_input: historical.submitted_input, image_refs: historical.image_refs, workflow_image_bindings: historical.workflow_image_bindings }, null, 2)}</pre></details><details className="task-input"><summary>实际输入</summary>{historical.effective_input ? <pre>{JSON.stringify({ generation_input: historical.effective_input, image_uploads: historical.image_uploads }, null, 2)}</pre> : <p>实际输入尚未准备完成。</p>}</details></>}
      <div className="inspector-foot execution-controls">
        {view.inspectRun ? <div className="preparation-footer"><Button kind="primary" disabled={!!experiment} onClick={() => run && void useReferenceRun({ branch_id: null,  type: 'run', id: run.run_id, workspace_id: state.workspaceId, work_id: view.workId, task_id: run.workbench_task_id, title: run.title, run })}>用于下次运行</Button></div>
          : experiment ? <div className="row"><Button kind="primary" onClick={() => void action(experiment.control_state === 'paused' ? 'resume-experiment' : 'pause-experiment', { taskId: experiment.task_id })}>{experiment.control_state === 'paused' ? '继续实验' : '暂停实验'}</Button><Button kind="small" onClick={() => void action('stop-experiment', { taskId: experiment.task_id })}>结束实验</Button></div>
          : editing ? <div className="preparation-actions"><Button kind="quiet" disabled={preparation?.saving} onClick={() => {
            void preparationEditor?.cancel().then(() => store.refresh()).catch(() => undefined)
          }}>取消</Button><Button kind="primary" disabled={preparation?.saving} onClick={() => {
            void preparationEditor?.save().then(() => store.refresh()).catch(() => undefined)
          }}>保存参数</Button></div>
          : <><fieldset className="configuration"><legend>执行方式</legend><div className="execution-modes">{[['once', '运行一次'], ['continuous', '持续实验']].map(([value, label]) => <label key={value}><input type="radio" name="execution-mode" value={value} aria-label={label} checked={branch.execution.mode === value} disabled={pending} onChange={() => void action('update-execution', { field: 'mode', value })} />{label}</label>)}</div></fieldset>
            {branch.execution.mode === 'continuous' && <div className="experiment-options"><label className="row between">最多运行次数<select aria-label="最多运行次数" value={branch.execution.max_runs} onChange={event => void action('update-execution', { field: 'max_runs', value: Number(event.target.value) })}>{[...new Set([2, 3, 5, branch.execution.max_runs])].sort((a, b) => a - b).map(count => <option key={count} value={count}>{count} 次</option>)}</select></label></div>}
            {executionProblem && <p className="binding-problem">{executionProblem}</p>}<div className="preparation-actions"><Button onClick={beginPreparation}>编辑参数</Button><Button kind="primary" icon="run" disabled={pending || !!executionProblem} onClick={() => void action(branch.execution.mode === 'continuous' ? 'experiment' : 'run')}>{pending ? '正在运行' : branch.execution.mode === 'continuous' ? '开始实验' : '运行任务'}</Button></div><div className="custom-run-actions">{customActions([branch.execution.mode === 'continuous' ? 'experiment' : 'run'], pending)}</div></>}
      </div>
    </div>
  </aside>

  const settings = (
    <ExperimentFunctionSettings
      key={state.workspaceId}
      workspaceId={state.workspaceId ?? ''}
      workspaceName={workspace?.name}
      functions={p?.functions.map(item => functionBindings.get(JSON.stringify([item.workspace_id, item.function_id])) ?? item) ?? []}
      previewRequest={preparedDraft && branch && state.workspaceId && view.workId ? {
        workspace_id: state.workspaceId, work_id: view.workId, branch_id: branch.branch_id, function_id: 'prompt', request_id: 'preview', draft: preparedDraft,
        input: { original_request: preparation?.originalRequest ?? branch.original_request, base_model_id: preparedDraft.base_model_id ?? '',
          positive_prompt: preparedDraft.prompt_input.positive_prompt ?? '', negative_prompt: preparedDraft.prompt_input.negative_prompt ?? '', change_request: preparedDraft.prompt_change_request ?? '' },
      } : undefined}
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
        const submittedBinding = change.type === 'function-edit' && currentBinding ? { ...currentBinding, ...change.value } : change.type === 'function-preset' && currentBinding ? { ...currentBinding, preset_id: change.value } : null
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
  const imageRun = p?.runs.find(item => item.run_id === imageRunId)
  const ModalHeading = modal === 'image' ? 'header' : 'div'
  const modalHeadingId = modal === 'image' ? 'image-title' : undefined
  const modalTitle =
    modal === 'new-work'
      ? '新建工作'
      : modal === 'new-workspace'
        ? '添加工作区'
        : modal === 'branch'
          ? '创建子分支'
          : `${imageRun?.run_id} · 图片 1`
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
        {state.workspaceId && (
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
        {state.error && !p ? (
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
        ) : !work && ['experiences', 'favorites'].includes(view.page) ? <div className="global-library">{library}</div> : !work ? (
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
          <div className={view.page === 'workbench' ? 'layout review-layout' : 'layout'}>
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
                onRemove={item => void changeResource('resource-remove', item)}
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
                        {String(runParameter(item, 'seed') ?? taskPresentation.unrecorded)}
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
                        <p className="execution-error" style={{ color: 'var(--red)' }}>
                          {item.error.message}
                        </p>
                      )}
                      {item.review?.conclusion && <p>评价：{item.review.conclusion}</p>}
                      {item.retry_of_run_id && (
                        <p>重试来源：{item.retry_of_run_id}</p>
                      )}
                      <div className="detail-line"><span>{runTime(item)}</span></div>
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
        {taskRequest && branch && taskRequest.navigation === store.getNavigationSequence() && <ExperimentTaskRequestDialog
          editor={taskRequest.editor} binding={taskRequest.binding} branch={{ ...branch, draft: taskRequest.preparation.getSnapshot().draft, original_request: taskRequest.preparation.getSnapshot().originalRequest }} currentTemplateLabel={selectedTemplateName}
          catalog={props.catalog} instances={props.instances ?? []}
          references={taskRequest.preparation.getSnapshot().draft.reference_run_ids.length ? referenceInputs(taskRequest.preparation.getSnapshot().draft, false) : undefined}
          presetName={presetName(taskRequest.binding.preset_id)} modelName={agentModel(taskRequest.binding)}
          onClose={() => setTaskRequest(null)} onSubmit={async draft => {
            const { functionId, ...scope } = taskRequest.editor.scope
            const preparation = taskRequest.preparation
            const current = preparation.getSnapshot().draft.generation_input
            if ('instance_id' in draft.resources && draft.resources.instance_id !== current.instance_id)
              preparation.change({ generation_input: { ...current, instance_id: draft.resources.instance_id ?? null } })
            await preparation.flush()
            if ('template_id' in draft.resources && draft.resources.template_id && draft.resources.template_id !== preparation.getSnapshot().draft.generation_input.template_id) {
              await props.onAction({ ...scope, type: 'resource-select', id: draft.resources.template_id, value: { kind: 'comfyui-template', id: draft.resources.template_id } })
              const projection = await props.remote.getProjection(scope)
              const updated = projection.branches.find(item => item.branch_id === scope.branchId)
              if (updated) preparation.sync(updated)
            }
            await preparation.save()
            const receipt = await props.onAction({ ...scope, type: 'agent-action', id: functionId, value: { draft: { ...draft } } })
            const key = JSON.stringify(Object.values(taskRequest.editor.scope))
            if (taskRequest.editor.getSnapshot().draft === draft) taskRequestEditors.delete(key)
            setTaskRequest(current => current === taskRequest ? null : current)
            if (taskRequest.navigation === store.getNavigationSequence()) {
              if (receipt?.taskId) notifyTask(taskRequest.binding.name, receipt.taskId, scope.workId, 'submitted')
              await store.refresh()
            }
          }} />}
        {modal === 'evaluate' && reviewEditor && <ExperimentReviewDialog key={`${reviewEditor.scope.runId}:${modalInstance.current}`}
          editor={reviewEditor} branchName={p?.branches.find(item => item.branch_id === reviewEditor.scope.branchId)?.name ?? ''}
          actions={kind => <>
            {[binding(kind), ...p?.functions.filter(item => !item.builtin && item.kind === kind) ?? []].filter((item): item is FunctionBinding => !!item).map(item =>
              <Button key={item.function_id} kind="small agent-action" disabled={!!functionProblem(item) || !!p?.tasks.some(task => task.branch_id === reviewEditor.scope.branchId && busyTask(task))}
                onClick={() => invokeAgentFunction(item, reviewEditor)}>
                {item.builtin ? kind === 'review' ? reviewPresentation.analyze : reviewPresentation.organize : item.name}
              </Button>)}
          </>} onClose={() => setModal(null)} onSave={async saveExperience => {
            const instance = modalInstance.current
            await reviewEditor.submit(async value => {
              await props.onAction({ ...reviewEditor.scope, type: 'evaluate', value: { ...value, saveExperience } })
            })
            if (store.getSnapshot().workspaceId === reviewEditor.scope.workspaceId) await store.refresh()
            if (modalInstance.current === instance) {
              setModal(null)
              setMessage(saveExperience ? reviewPresentation.experienceSaved : reviewPresentation.saved)
            }
          }}
        />}
        {modal && modal !== 'evaluate' && (
          <div
            className="modal-backdrop"
          >
            <section
              className={`modal ${modal === 'image' ? 'image-modal' : ''}`}
              role="dialog"
              aria-modal="true"
              aria-label={modalHeadingId ? undefined : modalTitle}
              aria-labelledby={modalHeadingId}
              onKeyDown={trapDialogFocus}
            >
              <ModalHeading className={modal === 'image' ? 'row between' : 'modal-head'}>
                <h2 id={modalHeadingId}>{modalTitle}</h2>
                <Button
                  kind={modal === 'image' ? 'small' : 'small quiet'}
                  label={modal === 'image' ? '关闭原图' : '关闭对话框'}
                  autoFocus={modal !== 'image'}
                  onClick={() => setModal(null)}
                >
                  {modal === 'image' ? '关闭' : '×'}
                </Button>
              </ModalHeading>
              {modal === 'image' ? (
                <div className="original-image">
                  {imageRun && media(imageRun) && <img src={media(imageRun)} alt={imageRun.title} />}
                </div>
              ) : (
                <form
                  onSubmit={async (event) => {
                    event.preventDefault()
                    const instance = modalInstance.current
                    if (formSubmissionPending.current === instance) return
                    const isCurrent = () => modalInstance.current === instance
                    clearTransientMessage()
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
                      maxLength={modal === 'branch' ? WORKBENCH_BRANCH_NAME_MAX_LENGTH : 40}
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
        {referencePicker && <ExperimentReferencePicker kind={referencePicker} workspaces={props.workspaces} destinations={p?.reference_destinations} baseModels={props.baseModels} remote={props.remote}
          onClose={() => setReferencePicker(null)} onAdd={addReferences} onUseRun={record => void useReferenceRun(record)} onInspect={setReferenceDetail}
          onImages={(images, purpose) => {
            let refs = preparedDraft?.image_refs ?? []
            for (const image of images) refs = mergeImagePurpose(refs, image, purpose)
            updatePreparation({ image_refs: refs })
            setReferencePicker(null)
          }} />}
        {referenceDetail && <div className="modal-backdrop"><section className="modal reference-modal" role="dialog" aria-modal="true" aria-label="参考内容" onKeyDown={trapDialogFocus}>
          <div className="modal-head"><h2>{referenceDetail.type === 'task' ? `任务 ${referenceDetail.id}` : referenceDetail.type === 'run' ? `来源运行 ${referenceDetail.id}` : referenceDetail.title}</h2><Button kind="small quiet" label="关闭参考内容" onClick={() => setReferenceDetail(null)}>×</Button></div>
          <div className="reference-origin">{referenceLocation(referenceDetail.branch_id, referenceDetail.workspace_id, referenceDetail.work_id)}</div>
          {referenceDetail.experience && <>{readout('适用条件', referenceDetail.experience.conditions)}{readout('经验结论', referenceDetail.experience.note)}
            {referenceDetail.experience.provenance.evidence.map(item => <Button key={item.run_id} kind="small quiet" onClick={() => void inspectReference('run', item.run_id)}>查看来源 {item.run_id}</Button>)}</>}
          {referenceDetail.run && <><div className="run-input-identity"><span>任务 {referenceDetail.task_id}</span><Status run={referenceDetail.run} /></div><div className={`reference-detail-image${referenceDetail.run.status === 'failed' ? ' reference-detail-error' : ''}`}>{referenceDetail.run.status === 'failed' ? referenceDetail.run.error?.message : referenceDetail.run.media.filter(item => item.media_kind === 'image').slice(0, 1).map(item => <img key={item.media_id} src={item.url} alt={item.filename} />)}</div>
            {referenceDetail.run.review?.conclusion && readout('评价', referenceDetail.run.review.conclusion)}
            {referenceReadError && <p role="alert">{referenceReadError}</p>}
            {referenceRunData ? <div className="input-summary">{readout('任务名称', referenceDetail.run.title)}{readout('原始需求', referenceRunData.task?.input.requirements.original_request)}{!!referenceRunData.task?.input.requirements.instructions && readout('本次改进要求', referenceRunData.task.input.requirements.instructions)}
              <details className="config-section" open><summary>生成资源</summary><dl className="input-facts"><div><dt>ComfyUI 实例</dt><dd>{props.instances?.find(item => item.id === referenceRunData.input.generation_input.instance_id)?.name ?? referenceRunData.input.generation_input.instance_id ?? '未选择'}</dd></div><div><dt>生成模型</dt><dd>{referenceRunData.input.generation_input.model?.file_name ?? '未选择'}</dd></div><div><dt>Workflow 模板</dt><dd>{referenceRunData.input.generation_input.template_id ?? '未选择'}</dd></div><div><dt>LoRA</dt><dd>{referenceRunData.input.generation_input.loras.map(item => `${item.file_name} · ${item.weight}`).join('、') || '未选择'}</dd></div></dl></details>
              <details className="config-section" open><summary>提示词与图片</summary>{(['positive_prompt', 'negative_prompt'] as const).map(field => <div className="input-readout prompt-readout" key={field}><div className="row between"><span>{inputOptions.parameterLabels[field]}</span><Button kind="small quiet" disabled={!referenceRunData.input.prompt_input[field]?.trim()} onClick={() => openTranslation(field, { positive_prompt: referenceRunData.input.prompt_input.positive_prompt ?? '', negative_prompt: referenceRunData.input.prompt_input.negative_prompt ?? '' })}>翻译</Button></div><div>{referenceRunData.input.prompt_input[field] === null ? inputOptions.unresolved : referenceRunData.input.prompt_input[field] || '未填写'}</div></div>)}
                <ExperimentImages input={referenceRunData.input} editable={false} parameters={referenceRunData.input.input_description ? flattenWorkflowRuntimeParameters(referenceRunData.input.input_description).filter(item => item.kind === 'reference_image') : []} display={image => { const source = referenceRunData.sources.find(item => item.image_ref_id === image.image_ref_id); return { name: source?.name ?? image.image_ref_id, url: source?.url ?? undefined, source: image.source.kind === 'run_media' ? image.source.run_id : '本机图片' } }} />
              </details><details className="config-section" open><summary>生成参数</summary><RuntimeParameterSummary parameters={readRunParameterValues(referenceRunData.input)} description={referenceRunData.input.input_description} /></details>
            </div> : !referenceReadError && <div className="translation-progress"><span className="loading-ring" /></div>}
          </>}
          {referenceDetail.task && <>{readout('原始需求', referenceDetail.task.input.requirements.original_request)}{readout('本次要求', referenceDetail.task.input.requirements.instructions)}
            {referenceDetail.artifacts?.filter(item => item.artifact.type !== 'question').map(item => <section key={item.artifact_id}><h3>{item.artifact_id}</h3><pre>{JSON.stringify(item.artifact, null, 2)}</pre></section>)}
            {referenceDetail.runs?.map(item => <Button key={item.run_id} kind="small quiet" onClick={() => void inspectReference('run', item.run_id)}>查看运行 {item.run_id}</Button>)}</>}
          <div className="modal-actions"><Button kind="quiet" onClick={() => setReferenceDetail(null)}>取消</Button></div>
        </section></div>}
        {promptEditor && promptEditing?.open && !view.inspectRun && <ExperimentPromptDialog pollIntervalMs={state.projection?.refreshAfterMs ?? 0} controller={promptEditor} state={promptEditing} workspaceId={state.workspaceId ?? ''}
          originalRequest={preparation?.originalRequest ?? branch?.original_request ?? ''} baseModelName={preparedDraft ? modelLabel(preparedDraft) : ''} remote={props.remote} />}
        {translation && <ExperimentTranslationDialog workspaceId={state.workspaceId ?? ''} initialField={translation.field} prompts={translation.prompts}
          remote={props.remote} modelLabel={`${presetName(binding('translate')?.preset_id)} · ${agentModel(binding('translate'))}`} onClose={() => {
            const target = translation.returnFocus
            setTranslation(null)
            target?.focus?.({ preventScroll: true })
          }} />}
        {message && (
          <div className="toast" role="alert">
            <span>{message}</span>
            {messageTask && <Button kind="small quiet" onClick={() => openTask(messageTask)}>{taskPresentation.notifications.open}</Button>}
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
  readonly selected?: Pick<TaskDraft, 'base_model_id' | 'generation_input'>
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
  ]
  const chosen = (item: CatalogItem) => selection.some(ref => workbenchContextKey(ref) === workbenchContextKey(item.context))
  const selectButton = (item: CatalogItem, selected = chosen(item)) => {
    const multiple = item.context.kind !== 'model' && item.context.kind !== 'comfyui-template'
    const label = selected ? multiple ? '移除' : '已选择' : '选择'
    return <Button kind={selected ? 'small' : 'small primary'} disabled={locked || selected && !multiple}
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
          <CatalogKinds selected={kind.kind}>{(item, selected) => WORKBENCH_RESOURCE_KINDS.some(kind => kind === item.kind) ? (
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
          ) : null}</CatalogKinds>
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

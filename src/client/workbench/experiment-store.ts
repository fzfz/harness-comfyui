import type { WorkbenchProjection } from '../../workbench/contract.ts'
import type {
  ExperimentPage,
  ExperimentRemote,
  ExperimentViewState,
} from './experiment-contract.ts'

const pages: readonly ExperimentPage[] = [
  'workbench',
  'resources',
  'tasks',
  'experiences',
  'favorites',
  'graph',
  'settings',
]
const initialView = (): ExperimentViewState => ({
  workId: null,
  branchId: null,
  page: 'workbench',
  selectedRunId: null,
  inspectRun: false,
  compareRunId: null,
  expandedBranches: [],
  catalogFilters: {
    kind: 'model',
    baseModelId: '',
    modelId: '',
    query: '',
    page: 1,
  },
  scrollPositions: {},
  presetOverride: null,
})
export interface ExperimentSnapshot {
  readonly workspaceId: string | null
  readonly projection: WorkbenchProjection | null
  readonly view: ExperimentViewState
  readonly loading: boolean
  readonly error: string | null
}

export class ExperimentWorkbenchStore {
  private snapshot: ExperimentSnapshot = {
    workspaceId: null,
    projection: null,
    view: initialView(),
    loading: false,
    error: null,
  }
  private readonly listeners = new Set<() => void>()
  private sequence = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private visible = true
  private disposed = false
  constructor(
    private readonly remote: Pick<ExperimentRemote, 'getProjection'>,
    private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>,
  ) {}
  readonly getSnapshot = (): ExperimentSnapshot => this.snapshot
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  private emit(patch: Partial<ExperimentSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener()
  }
  private key(id: string): string {
    return `harness-comfyui:experiment-workbench:${id}`
  }
  private save(): void {
    if (!this.snapshot.workspaceId) return
    try {
      this.storage?.setItem(
        this.key(this.snapshot.workspaceId),
        JSON.stringify({ ...this.snapshot.view, compareRunId: null }),
      )
    } catch {
      /* Browsing remains available when storage is full. */
    }
  }
  private restore(id: string): ExperimentViewState {
    try {
      const value: unknown = JSON.parse(
        this.storage?.getItem(this.key(id)) ?? 'null',
      )
      if (!value || typeof value !== 'object') return initialView()
      const raw = value as Partial<ExperimentViewState>,
        base = initialView()
      return {
        ...base,
        workId: typeof raw.workId === 'string' ? raw.workId : null,
        branchId: typeof raw.branchId === 'string' ? raw.branchId : null,
        page: pages.includes(raw.page!) ? raw.page! : 'workbench',
        selectedRunId:
          typeof raw.selectedRunId === 'string' ? raw.selectedRunId : null,
        inspectRun: raw.inspectRun === true,
        expandedBranches: Array.isArray(raw.expandedBranches)
          ? raw.expandedBranches.filter(
              (id): id is string => typeof id === 'string',
            )
          : [],
        catalogFilters:
          raw.catalogFilters && typeof raw.catalogFilters.kind === 'string'
            ? { ...base.catalogFilters, ...raw.catalogFilters }
            : base.catalogFilters,
        scrollPositions:
          raw.scrollPositions && typeof raw.scrollPositions === 'object'
            ? raw.scrollPositions
            : {},
        presetOverride:
          typeof raw.presetOverride === 'string' ? raw.presetOverride : null,
      }
    } catch {
      return initialView()
    }
  }
  setWorkspace(workspaceId: string | null): void {
    if (this.disposed || workspaceId === this.snapshot.workspaceId) return
    this.save()
    this.sequence++
    clearTimeout(this.timer)
    this.emit({
      workspaceId,
      projection: null,
      view: workspaceId ? this.restore(workspaceId) : initialView(),
      loading: !!workspaceId,
      error: null,
    })
    if (workspaceId && this.visible) void this.refresh(true)
  }
  updateView(patch: Partial<ExperimentViewState>): void {
    this.emit({ view: { ...this.snapshot.view, ...patch } })
    this.save()
  }
  selectWork(workId: string): void {
    if (workId === this.snapshot.view.workId) return
    this.sequence++
    clearTimeout(this.timer)
    this.updateView({
      workId,
      branchId: null,
      selectedRunId: null,
      inspectRun: false,
      compareRunId: null,
      expandedBranches: [],
    })
    this.emit({ projection: null, loading: true, error: null })
    if (this.visible) void this.refresh()
  }
  selectBranch(branchId: string): void {
    const projection = this.snapshot.projection
    const taskIds = new Set(
      projection?.tasks
        .filter((task) => task.branch_id === branchId)
        .map((task) => task.task_id),
    )
    const runs =
      projection?.runs.filter((run) => taskIds.has(run.workbench_task_id)) ?? []
    this.updateView({
      branchId,
      selectedRunId: runs.at(-1)?.run_id ?? null,
      inspectRun: false,
      compareRunId: null,
    })
  }
  selectRun(runId: string, inspectRun = true): void {
    const projection = this.snapshot.projection,
      run = projection?.runs.find((run) => run.run_id === runId)
    const task = projection?.tasks.find(
      (task) => task.task_id === run?.workbench_task_id,
    )
    if (!run || !task) return
    const expanded = new Set(this.snapshot.view.expandedBranches)
    for (
      let branch = projection?.branches.find(
        (branch) => branch.branch_id === task.branch_id,
      );
      branch;
      branch = projection?.branches.find(
        (parent) => parent.branch_id === branch?.parent_branch_id,
      )
    )
      expanded.add(branch.branch_id)
    this.updateView({
      branchId: task.branch_id,
      selectedRunId: runId,
      inspectRun,
      page: 'workbench',
      expandedBranches: [...expanded],
    })
  }
  setVisible(visible: boolean): void {
    if (this.visible === visible) return
    this.visible = visible
    this.sequence++
    clearTimeout(this.timer)
    if (visible && this.snapshot.workspaceId) void this.refresh()
  }
  readonly refresh = async (restoreWork = false): Promise<void> => {
    const workspaceId = this.snapshot.workspaceId
    if (!workspaceId || !this.visible || this.disposed) return
    const sequence = ++this.sequence,
      requestedWork = this.snapshot.view.workId
    clearTimeout(this.timer)
    try {
      const projection = await this.remote.getProjection({
        workspaceId,
        ...(!restoreWork && requestedWork ? { workId: requestedWork } : {}),
      })
      if (
        this.disposed ||
        !this.visible ||
        sequence !== this.sequence ||
        projection.workspace_id !== workspaceId
      )
        return
      const availableWork =
        projection.works.find((work) => work.work_id === requestedWork)
          ?.work_id ??
        projection.works.find((work) => work.work_id === projection.work_id)
          ?.work_id ??
        projection.works[0]?.work_id ??
        null
      if (availableWork !== projection.work_id) {
        if (!restoreWork && availableWork === requestedWork)
          throw new Error('工作加载失败，请重试。')
        this.updateView({ workId: availableWork })
        await this.refresh()
        return
      }
      const previous = this.snapshot.view,
        workId = projection.work_id
      const branches = projection.branches.filter(
        (branch) => branch.work_id === workId,
      )
      const branchId = branches.some(
        (branch) => branch.branch_id === previous.branchId,
      )
        ? previous.branchId
        : (branches.find((branch) => branch.parent_branch_id === null)
            ?.branch_id ??
          branches[0]?.branch_id ??
          null)
      const taskIds = new Set(
          projection.tasks
            .filter((task) => task.branch_id === branchId)
            .map((task) => task.task_id),
        ),
        runs = projection.runs.filter((run) =>
          taskIds.has(run.workbench_task_id),
        )
      const selectedRunId = runs.some(
        (run) => run.run_id === previous.selectedRunId,
      )
        ? previous.selectedRunId
        : (runs.at(-1)?.run_id ?? null)
      const view = {
        ...previous,
        workId,
        branchId,
        selectedRunId,
        inspectRun: !!selectedRunId && previous.inspectRun,
        compareRunId: projection.runs.some(
          (run) =>
            run.run_id === previous.compareRunId &&
            run.run_id !== selectedRunId,
        )
          ? previous.compareRunId
          : null,
        expandedBranches:
          previous.workId === workId
            ? previous.expandedBranches.filter((id) =>
                branches.some((branch) => branch.branch_id === id),
              )
            : branches.map((branch) => branch.branch_id),
      }
      this.emit({ projection, view, loading: false, error: null })
      this.save()
      if (projection.refreshAfterMs > 0)
        this.timer = setTimeout(() => {
          void this.refresh()
        }, projection.refreshAfterMs)
    } catch (error) {
      if (this.disposed || !this.visible || sequence !== this.sequence) return
      this.emit({
        loading: false,
        error:
          error instanceof Error ? error.message : '工作台加载失败，请重试。',
      })
    }
  }
  dispose(): void {
    this.save()
    this.disposed = true
    this.sequence++
    clearTimeout(this.timer)
    this.listeners.clear()
  }
}

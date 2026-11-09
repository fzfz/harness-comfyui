import { afterEach, describe, expect, it, vi } from 'vitest'
import { fullProjection, treeProjection } from './experiment-workbench-fixtures.ts'
import { ExperimentWorkbenchStore } from '../../src/client/workbench/experiment-store.ts'
import type { WorkbenchProjection } from '../../src/workbench/contract.ts'

const projection = (
  workspaceId: string,
  workId: string,
): WorkbenchProjection => ({
  reference_destinations: [],
  workspace_id: workspaceId,
  total_branch_count: 0,
  work_id: workId,
  works: [
    { work_id: workId, workspace_id: workspaceId, name: workId, goal: '目标' },
  ],
  branches: [],
  tasks: [],
  artifacts: [],
  runs: [],
  experiments: [],
  experiences: [],
  favorites: [],
  functions: [],
  refreshAfterMs: 1000,
})
const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('experiment workbench browsing', () => {
  it('restores gallery state per workspace and resets resource scroll only on a fresh Store', async () => {
    const memory = new Map<string, string>()
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
    const remote = { getProjection: async ({ workspaceId }: { workspaceId: string }) => projection(workspaceId, `work-${workspaceId}`) }
    const store = new ExperimentWorkbenchStore(remote, storage)
    store.setWorkspace('a')
    await flush()
    const gallery = { kind: 'lora' as const, id: '99', index: 1 }
    store.updateView({
      page: 'resources', catalogGallery: gallery,
      scrollPositions: { 'catalog:work-a:list': { top: 407, left: 0 }, 'tasks:work-a': { top: 120, left: 0 } },
    })
    expect(JSON.parse(memory.get('harness-comfyui:experiment-workbench:a')!).catalogGallery).toEqual(gallery)
    store.setWorkspace('b')
    await flush()
    store.setWorkspace('a')
    await flush()
    expect(store.getSnapshot().view.catalogGallery).toEqual(gallery)
    expect(store.getSnapshot().view.scrollPositions['catalog:work-a:list']).toEqual({ top: 407, left: 0 })
    store.dispose()
    const reopened = new ExperimentWorkbenchStore(remote, storage)
    reopened.setWorkspace('a')
    await flush()
    expect(reopened.getSnapshot().view.catalogGallery).toEqual(gallery)
    expect(reopened.getSnapshot().view.catalogDetail).toBeNull()
    expect(reopened.getSnapshot().view.scrollPositions).toEqual({ 'tasks:work-a': { top: 120, left: 0 } })
    reopened.dispose()
  })

  it.each([
    { kind: 'lora', id: '99', index: -1 },
    { kind: 'lora', id: '99', index: 0.5 },
    { kind: 'unknown', id: '99', index: 0 },
  ])('ignores invalid saved gallery state $kind / $index', async (catalogGallery) => {
    const store = new ExperimentWorkbenchStore(
      { getProjection: async () => projection('a', 'work-a') },
      { getItem: () => JSON.stringify({ catalogGallery }), setItem() {} },
    )
    store.setWorkspace('a')
    await flush()
    expect(store.getSnapshot().view.catalogGallery).toBeNull()
    store.dispose()
  })

  it('preserves a list scroll position on reopening when no detail is selected', async () => {
    const memory = new Map<string, string>()
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
    const remote = { getProjection: async () => projection('a', 'work-a') }
    const store = new ExperimentWorkbenchStore(remote, storage)
    store.setWorkspace('a')
    await flush()
    store.updateView({ page: 'resources', scrollPositions: { 'catalog:work-a:list': { top: 360, left: 12 } } })
    store.dispose()
    const reopened = new ExperimentWorkbenchStore(remote, storage)
    reopened.setWorkspace('a')
    await flush()
    expect(reopened.getSnapshot().view.catalogDetail).toBeNull()
    expect(reopened.getSnapshot().view.scrollPositions).toEqual({ 'catalog:work-a:list': { top: 360, left: 12 } })
    reopened.dispose()
  })

  it('restores detail identity while resetting resource scroll only for a reopened workspace', async () => {
    const memory = new Map<string, string>()
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
    const remote = { getProjection: async ({ workspaceId }: { workspaceId: string }) => projection(workspaceId, `work-${workspaceId}`) }
    const store = new ExperimentWorkbenchStore(remote, storage)
    store.setWorkspace('a')
    await flush()
    store.updateView({
      page: 'resources', catalogDetail: { kind: 'lora', id: '99' },
      catalogFilters: { kind: 'lora', query: 'light', page: 2, baseModelId: '1', modelId: '9' },
      scrollPositions: { 'catalog:work-a:list': { top: 407, left: 0 }, 'catalog:work-a:detail:lora:99': { top: 142, left: 0 }, 'tasks:work-a': { top: 120, left: 0 } },
    })
    store.setWorkspace('b')
    await flush()
    store.setWorkspace('a')
    await flush()
    expect(store.getSnapshot().view.scrollPositions['catalog:work-a:list']).toEqual({ top: 407, left: 0 })
    expect(store.getSnapshot().view.catalogDetail).toEqual({ kind: 'lora', id: '99' })
    store.dispose()
    const reopened = new ExperimentWorkbenchStore(remote, storage)
    reopened.setWorkspace('a')
    await flush()
    expect(reopened.getSnapshot().view.catalogDetail).toEqual({ kind: 'lora', id: '99' })
    expect(reopened.getSnapshot().view.catalogFilters).toEqual({ kind: 'lora', query: 'light', page: 2, baseModelId: '1', modelId: '9' })
    expect(reopened.getSnapshot().view.scrollPositions).toEqual({ 'tasks:work-a': { top: 120, left: 0 } })
    reopened.dispose()
  })

  afterEach(() => vi.useRealTimers())
  it.each([null, 'deleted-work'])(
    'selects the first existing work from a workspace-only response with cached selection %s',
    async (savedWork) => {
      const data = fullProjection()
      const remote = {
        getProjection: vi.fn(
          async (scope: { workspaceId: string; workId?: string }) =>
            scope.workId
              ? { ...data, work_id: scope.workId }
              : { ...data, work_id: null, branches: [], tasks: [], runs: [] },
        ),
      }
      const storage = {
        getItem: () =>
          savedWork ? JSON.stringify({ workId: savedWork }) : null,
        setItem: vi.fn(),
      }
      const store = new ExperimentWorkbenchStore(remote, storage)
      store.setWorkspace('workspace-a')
      await flush()
      expect(remote.getProjection).toHaveBeenLastCalledWith({
        workspaceId: 'workspace-a',
        workId: 'work-a',
      })
      expect(store.getSnapshot().view.workId).toBe('work-a')
      expect(store.getSnapshot().projection?.branches).toHaveLength(2)
      store.dispose()
    },
  )

  it('validates a saved work selection before restoring its query scope', async () => {
    const data = fullProjection()
    const storage = {
      getItem: () =>
        JSON.stringify({
          workId: 'work-b',
          collapsedBranches: ['root', 12],
          page: 'graph',
          catalogFilters: { kind: 'model' },
        }),
      setItem: vi.fn(),
    }
    const remote = {
      getProjection: vi.fn(
        async (scope: { workspaceId: string; workId?: string }) => ({
          ...data,
          work_id: scope.workId ?? 'work-a',
        }),
      ),
    }
    const store = new ExperimentWorkbenchStore(remote, storage)
    store.setWorkspace('workspace-a')
    await flush()
    expect(remote.getProjection).toHaveBeenLastCalledWith({
      workspaceId: 'workspace-a',
      workId: 'work-b',
    })
    expect(store.getSnapshot().view.workId).toBe('work-b')
    expect(store.getSnapshot().view.page).toBe('graph')
    expect(store.getSnapshot().view.collapsedBranches).toEqual(['root'])
    store.dispose()
  })
  it('opens the selected work results and clears the previous work inspection', async () => {
    const first = fullProjection()
    const second: WorkbenchProjection = {
      ...projection('workspace-a', 'work-b'),
      works: first.works,
      branches: [{ ...first.branches[0]!, work_id: 'work-b', branch_id: 'second-root' }],
      refreshAfterMs: 0,
    }
    const remote = {
      getProjection: vi.fn(async ({ workId }: { workspaceId: string; workId?: string }) =>
        workId === 'work-b' ? second : first),
    }
    const store = new ExperimentWorkbenchStore(remote)
    store.setWorkspace('workspace-a')
    await flush()
    store.selectRun('r2')
    store.updateView({ page: 'resources', compareRunId: 'r1' })
    store.selectWork('work-b')
    expect(store.getSnapshot().projection).toBeNull()
    await flush()
    expect(remote.getProjection).toHaveBeenLastCalledWith({ workspaceId: 'workspace-a', workId: 'work-b' })
    expect(store.getSnapshot().view).toMatchObject({
      workId: 'work-b', branchId: 'second-root', page: 'workbench',
      selectedRunId: null, inspectRun: false, compareRunId: null,
    })
    expect(store.getSnapshot().projection?.tasks).toEqual([])
    expect(store.getSnapshot().projection?.experiences).toEqual([])
    expect(store.getSnapshot().projection?.favorites).toEqual([])
    store.dispose()
  })

  it('reveals a selected Run branch through all collapsed ancestors', async () => {
    const data = treeProjection()
    const store = new ExperimentWorkbenchStore({ getProjection: async () => data })
    store.setWorkspace('workspace-a')
    await flush()
    store.updateView({ page: 'tasks', collapsedBranches: ['root', 'warm', 'cool', 'detail'] })
    store.selectRun('detail-r4')
    expect(store.getSnapshot().view).toMatchObject({
      page: 'workbench', branchId: 'detail', selectedRunId: 'detail-r4',
      inspectRun: true, collapsedBranches: ['cool'],
    })
    store.dispose()
  })

  it('keeps the last projection and browsing selection while retrying failures at the last server interval', async () => {
    vi.useFakeTimers()
    const first = { ...fullProjection(), refreshAfterMs: 37 }
    const recovered = { ...first, refreshAfterMs: 71, favorites: [{ target_type: 'run' as const, target_id: 'r1' }] }
    const remote = { getProjection: vi.fn()
      .mockResolvedValueOnce(first).mockRejectedValueOnce(new Error('Connection interrupted'))
      .mockRejectedValueOnce('Connection interrupted').mockResolvedValue(recovered) }
    const store = new ExperimentWorkbenchStore(remote)
    store.setWorkspace('workspace-a')
    await flush()
    store.selectRun('r1')
    store.updateView({ page: 'favorites', catalogFilters: { ...store.getSnapshot().view.catalogFilters, query: 'glass' } })
    const view = store.getSnapshot().view
    await vi.advanceTimersByTimeAsync(37)
    expect(store.getSnapshot()).toMatchObject({ projection: first, view, error: 'Connection interrupted', loading: false })
    await vi.advanceTimersByTimeAsync(36)
    expect(remote.getProjection).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(remote.getProjection).toHaveBeenCalledTimes(3)
    expect(store.getSnapshot().projection).toBe(first)
    await vi.advanceTimersByTimeAsync(37)
    expect(remote.getProjection).toHaveBeenCalledTimes(4)
    expect(store.getSnapshot()).toMatchObject({ projection: recovered, view, error: null })
    await vi.advanceTimersByTimeAsync(70)
    expect(remote.getProjection).toHaveBeenCalledTimes(4)
    store.dispose()
    await vi.advanceTimersByTimeAsync(1000)
    expect(remote.getProjection).toHaveBeenCalledTimes(4)
  })

  it.each(['success', 'failure'] as const)('ignores a late %s after hiding or disposal and resumes a failed connection immediately when visible', async outcome => {
    vi.useFakeTimers()
    const data = projection('a', 'wa')
    let resolveHidden!: (value: WorkbenchProjection) => void
    let rejectHidden!: (error: unknown) => void
    const hidden = new Promise<WorkbenchProjection>((resolve, reject) => { resolveHidden = resolve; rejectHidden = reject })
    let resolveDisposed!: (value: WorkbenchProjection) => void
    let rejectDisposed!: (error: unknown) => void
    const disposed = new Promise<WorkbenchProjection>((resolve, reject) => { resolveDisposed = resolve; rejectDisposed = reject })
    const remote = { getProjection: vi.fn().mockResolvedValueOnce(data).mockRejectedValueOnce(new Error('Connection interrupted'))
      .mockReturnValueOnce(hidden).mockResolvedValueOnce(data).mockReturnValueOnce(disposed) }
    const store = new ExperimentWorkbenchStore(remote)
    store.setWorkspace('a')
    await flush()
    await vi.advanceTimersByTimeAsync(1000)
    expect(store.getSnapshot().error).toBe('Connection interrupted')
    store.setVisible(false)
    await vi.advanceTimersByTimeAsync(5000)
    expect(remote.getProjection).toHaveBeenCalledTimes(2)
    store.setVisible(true)
    expect(remote.getProjection).toHaveBeenCalledTimes(3)
    store.setVisible(false)
    if (outcome === 'success') resolveHidden({ ...data, works: [{ ...data.works[0]!, name: 'Hidden late result' }] })
    else rejectHidden(new Error('Hidden late error'))
    await flush()
    expect(store.getSnapshot().projection).toBe(data)
    expect(store.getSnapshot().error).toBe('Connection interrupted')
    await vi.advanceTimersByTimeAsync(5000)
    expect(remote.getProjection).toHaveBeenCalledTimes(3)
    store.setVisible(true)
    await flush()
    expect(store.getSnapshot().error).toBeNull()
    await vi.advanceTimersByTimeAsync(1000)
    expect(remote.getProjection).toHaveBeenCalledTimes(5)
    const before = store.getSnapshot()
    store.dispose()
    if (outcome === 'success') resolveDisposed({ ...data, works: [] })
    else rejectDisposed(new Error('Disposed late error'))
    await flush()
    await vi.advanceTimersByTimeAsync(5000)
    expect(store.getSnapshot()).toBe(before)
    expect(remote.getProjection).toHaveBeenCalledTimes(5)
  })

  it('follows the server refresh interval and stops in a hidden page', async () => {
    vi.useFakeTimers()
    const remote = { getProjection: vi.fn(async () => projection('a', 'wa')) }
    const store = new ExperimentWorkbenchStore(remote)
    store.setWorkspace('a')
    await flush()
    expect(remote.getProjection).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(999)
    expect(remote.getProjection).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(remote.getProjection).toHaveBeenCalledTimes(2)
    store.setVisible(false)
    await vi.advanceTimersByTimeAsync(5000)
    expect(remote.getProjection).toHaveBeenCalledTimes(2)
    store.setVisible(true)
    await flush()
    expect(remote.getProjection).toHaveBeenCalledTimes(3)
    store.dispose()
    await vi.advanceTimersByTimeAsync(5000)
    expect(remote.getProjection).toHaveBeenCalledTimes(3)
  })

  it('keeps pending navigation valid through a projection refresh and expires it after user navigation', async () => {
    const data = fullProjection()
    let available = { ...data, runs: [] as WorkbenchProjection['runs'] }
    const store = new ExperimentWorkbenchStore({ getProjection: async () => available })
    store.setWorkspace('workspace-a')
    await flush()
    const pendingNavigation = store.getNavigationSequence()
    available = data
    await store.refresh()
    expect(store.getSnapshot().view.selectedRunId).toBe('r1')
    expect(store.getNavigationSequence()).toBe(pendingNavigation)
    store.updateView({ page: 'settings' })
    expect(store.getNavigationSequence()).not.toBe(pendingNavigation)
    store.dispose()
  })

  it('keeps configuration open across workspaces while restoring their saved browsing positions', async () => {
    const memory = new Map<string, string>()
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value) },
    }
    const remote = { getProjection: vi.fn(async ({ workspaceId }: { workspaceId: string }) => projection(workspaceId, `work-${workspaceId}`)) }
    const store = new ExperimentWorkbenchStore(remote, storage)
    store.setWorkspace('a')
    await flush()
    store.updateView({ page: 'tasks', scrollPositions: { 'tasks:work-a': { top: 120, left: 0 } } })
    store.setWorkspace('b')
    await flush()
    store.updateView({ page: 'settings', scrollPositions: { 'tasks:work-b': { top: 240, left: 0 } }, compareRunId: 'previous-comparison' })
    store.setWorkspace('a')
    await flush()
    expect(store.getSnapshot().view).toMatchObject({ page: 'settings', workId: 'work-a', compareRunId: null, scrollPositions: { 'tasks:work-a': { top: 120, left: 0 } } })
    expect(store.getSnapshot().projection?.workspace_id).toBe('a')
    store.updateView({ page: 'workbench' })
    store.setWorkspace('b')
    await flush()
    expect(store.getSnapshot().view).toMatchObject({ page: 'settings', workId: 'work-b', compareRunId: null, scrollPositions: { 'tasks:work-b': { top: 240, left: 0 } } })
    store.dispose()
  })

  it('keeps each workspace browsing position and rejects a previous scope response', async () => {
    const memory = new Map<string, string>()
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value)
      },
    }
    let finishA!: (value: WorkbenchProjection) => void
    const remote = {
      getProjection: vi.fn(({ workspaceId }: { workspaceId: string }) =>
        workspaceId === 'a'
          ? new Promise<WorkbenchProjection>((resolve) => {
              finishA = resolve
            })
          : Promise.resolve(projection('b', 'wb')),
      ),
    }
    const store = new ExperimentWorkbenchStore(remote, storage)
    store.setWorkspace('a')
    store.setWorkspace('b')
    await flush()
    store.updateView({ page: 'favorites', compareRunId: 'stale', catalogFilters: { kind: 'comfyui-template', baseModelId: '2', modelId: '', query: 'glass', page: 3 } })
    finishA(projection('a', 'wa'))
    await flush()
    expect(store.getSnapshot().projection?.workspace_id).toBe('b')
    expect(store.getSnapshot().view.page).toBe('favorites')
    store.dispose()
    const restored = new ExperimentWorkbenchStore(remote, storage)
    restored.setWorkspace('b')
    await flush()
    expect(restored.getSnapshot().view.page).toBe('favorites')
    expect(restored.getSnapshot().view.compareRunId).toBeNull()
    expect(restored.getSnapshot().view.catalogFilters).toEqual({ kind: 'comfyui-template', baseModelId: '2', modelId: '', query: 'glass', page: 3 })
    restored.dispose()
  })
})

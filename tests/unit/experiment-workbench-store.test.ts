import { afterEach, describe, expect, it, vi } from 'vitest'
import { fullProjection } from './experiment-workbench-fixtures.ts'
import { ExperimentWorkbenchStore } from '../../src/client/workbench/experiment-store.ts'
import type { WorkbenchProjection } from '../../src/workbench/contract.ts'

const projection = (
  workspaceId: string,
  workId: string,
): WorkbenchProjection => ({
  workspace_id: workspaceId,
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
          expandedBranches: ['root', 12],
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
    store.dispose()
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
    store.updateView({ page: 'favorites', compareRunId: 'stale' })
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
    restored.dispose()
  })
})

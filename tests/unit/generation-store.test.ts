import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GenerationProjection } from '../../src/generation/contract.ts'

import { GenerationProjectionStore } from '../../src/client/workbench/generation-store.ts'

afterEach(() => vi.useRealTimers())

describe('GenerationProjectionStore', () => {
  it('discovers a Run created after an empty response while the Session keeps running', async () => {
    vi.useFakeTimers()
    let projection: GenerationProjection = {
      sessionId: 'session_1', runs: [], media: [], hasActiveRuns: false, refreshAfterMs: 1000,
    }
    const list = vi.fn(async () => projection)
    const store = new GenerationProjectionStore({ list }, 500)
    const stop = store.subscribe('session_1', vi.fn())
    store.setSessionRunning('session_1', true)
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getSnapshot('session_1').projection.runs).toEqual([])

    projection = {
      ...projection,
      runs: [{
        runId: 'run_later', turn: 1, title: 'Later Run', instanceTitle: null, templateTitle: null,
        status: 'remote_running', errorCode: null, errorMessage: null, createdAt: 1, updatedAt: 1,
      }],
      hasActiveRuns: true,
    }
    await vi.advanceTimersByTimeAsync(1000)
    expect(store.getSnapshot('session_1').projection.runs.map(run => run.runId)).toEqual(['run_later'])
    stop()
  })

  it('shares polling for active Runs and stops after the final Run becomes terminal', async () => {
    vi.useFakeTimers()
    const list = vi.fn()
      .mockImplementationOnce(async (sessionId: string) => ({
        sessionId, runs: [], media: [], hasActiveRuns: true, refreshAfterMs: 1000,
      } as const))
      .mockImplementation(async (sessionId: string) => ({
        sessionId, runs: [], media: [], hasActiveRuns: false, refreshAfterMs: 1000,
      } as const))
    const store = new GenerationProjectionStore({ list }, 500)
    expect(store.getSnapshot('session_1').projection.sessionId).toBe('session_1')
    const first = vi.fn()
    const second = vi.fn()

    const stopFirst = store.subscribe('session_1', first)
    const stopSecond = store.subscribe('session_1', second)
    await vi.advanceTimersByTimeAsync(0)

    expect(list).toHaveBeenCalledOnce()
    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1000)
    expect(list).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(5000)
    expect(list).toHaveBeenCalledTimes(2)
    stopFirst()
    stopSecond()
  })

  it('stops idle polling and refreshes when the Session lifecycle explicitly wakes it', async () => {
    vi.useFakeTimers()
    const list = vi.fn(async (sessionId: string) => ({
      sessionId, runs: [], media: [], hasActiveRuns: false, refreshAfterMs: 1000,
    } as const))
    const store = new GenerationProjectionStore({ list }, 500)
    const stop = store.subscribe('session_1', vi.fn())
    await vi.advanceTimersByTimeAsync(5000)
    expect(list).toHaveBeenCalledOnce()
    store.refreshSession('session_1')
    await vi.advanceTimersByTimeAsync(0)
    expect(list).toHaveBeenCalledTimes(2)
    stop()
    store.refreshSession('session_1')
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('publishes one Remote error and aborts pending work on dispose', async () => {
    const list = vi.fn(async () => { throw new Error('GENERATION_REMOTE_FAILED') })
    const store = new GenerationProjectionStore({ list }, 500)
    const listener = vi.fn()
    store.subscribe('session_2', listener)

    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce())
    expect(store.getSnapshot('session_2').errorCode).toBe('GENERATION_REMOTE_FAILED')
    store.dispose()
    expect(store.getSnapshot('session_2').errorCode).toBeNull()
  })

  it('does not publish or restart polling when an ignored abort resolves after dispose', async () => {
    vi.useFakeTimers()
    let resolve!: (projection: GenerationProjection) => void
    const list = vi.fn(() => new Promise<GenerationProjection>(complete => { resolve = complete }))
    const store = new GenerationProjectionStore({ list }, 500)
    const listener = vi.fn()
    store.subscribe('session_1', listener)
    store.setSessionRunning('session_1', true)
    store.dispose()
    resolve({ sessionId: 'session_1', runs: [], media: [], hasActiveRuns: true, refreshAfterMs: 1000 })
    await vi.advanceTimersByTimeAsync(5000)
    expect(listener).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    { running: false, active: false, polls: false },
    { running: true, active: false, polls: true },
    { running: false, active: true, polls: true },
    { running: true, active: true, polls: true },
  ])('polls with Session running=$running and active Runs=$active', async ({ running, active, polls }) => {
    vi.useFakeTimers()
    const list = vi.fn(async (sessionId: string) => ({
      sessionId, runs: [], media: [], hasActiveRuns: active, refreshAfterMs: 1000,
    }))
    const store = new GenerationProjectionStore({ list }, 500)
    const stop = store.subscribe('session_1', vi.fn())
    store.setSessionRunning('session_1', running)
    await vi.advanceTimersByTimeAsync(0)
    const initialCalls = list.mock.calls.length
    store.setSessionRunning('session_1', running)
    await vi.advanceTimersByTimeAsync(1000)
    expect(list).toHaveBeenCalledTimes(initialCalls + (polls ? 1 : 0))
    stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('discovers another batch after completed Runs and drains active Runs after the Session stops', async () => {
    vi.useFakeTimers()
    const first = {
      runId: 'run_first', turn: 1, title: 'First Run', instanceTitle: null, templateTitle: null,
      status: 'succeeded' as const, errorCode: null, errorMessage: null, createdAt: 1, updatedAt: 2,
    }
    const second = { ...first, runId: 'run_second', status: 'remote_pending' as const }
    let latest: GenerationProjection = {
      sessionId: 'session_1', runs: [first], media: [], hasActiveRuns: false, refreshAfterMs: 1000,
    }
    const list = vi.fn(async () => latest)
    const store = new GenerationProjectionStore({ list }, 500)
    const stop = store.subscribe('session_1', vi.fn())
    store.setSessionRunning('session_1', true)
    await vi.advanceTimersByTimeAsync(1000)
    latest = { ...latest, runs: [second, first], hasActiveRuns: true }
    await vi.advanceTimersByTimeAsync(1000)
    expect(store.getSnapshot('session_1').projection.runs.map(run => run.runId)).toEqual(['run_second', 'run_first'])
    store.setSessionRunning('session_1', false)
    await vi.advanceTimersByTimeAsync(0)
    latest = { ...latest, runs: [{ ...second, status: 'succeeded' }, first], hasActiveRuns: false }
    await vi.advanceTimersByTimeAsync(1000)
    expect(store.getSnapshot('session_1').projection.runs.every(run => run.status === 'succeeded')).toBe(true)
    const finalCalls = list.mock.calls.length
    await vi.advanceTimersByTimeAsync(3000)
    expect(list).toHaveBeenCalledTimes(finalCalls)
    expect(vi.getTimerCount()).toBe(0)
    stop()
  })

  it('retries a first error while running, retains the last projection on later errors, and clears errors after recovery', async () => {
    vi.useFakeTimers()
    const successful: GenerationProjection = {
      sessionId: 'session_1', runs: [], media: [], hasActiveRuns: true, refreshAfterMs: 1000,
    }
    const list = vi.fn<() => Promise<GenerationProjection>>().mockRejectedValue('INITIAL_FAILURE')
    const store = new GenerationProjectionStore({ list }, 500)
    const stop = store.subscribe('session_1', vi.fn())
    store.setSessionRunning('session_1', true)
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getSnapshot('session_1')).toMatchObject({ errorCode: 'INITIAL_FAILURE', projection: { runs: [], media: [] } })
    list.mockResolvedValue(successful)
    await vi.advanceTimersByTimeAsync(500)
    expect(store.getSnapshot('session_1')).toEqual({ errorCode: null, projection: successful })
    list.mockRejectedValue(new Error('LATER_FAILURE'))
    store.setSessionRunning('session_1', false)
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getSnapshot('session_1')).toEqual({ errorCode: 'LATER_FAILURE', projection: successful })
    const finished = { ...successful, hasActiveRuns: false }
    list.mockResolvedValue(finished)
    await vi.advanceTimersByTimeAsync(1000)
    expect(store.getSnapshot('session_1')).toEqual({ errorCode: null, projection: finished })
    expect(vi.getTimerCount()).toBe(0)
    stop()
  })

  it('ignores running updates without subscribers and forgets running state after the final unsubscribe', async () => {
    vi.useFakeTimers()
    const list = vi.fn(async (sessionId: string) => ({
      sessionId, runs: [], media: [], hasActiveRuns: false, refreshAfterMs: 1000,
    }))
    const store = new GenerationProjectionStore({ list }, 500)
    store.setSessionRunning('missing', true)
    store.getSnapshot('session_1')
    store.setSessionRunning('session_1', true)
    expect(list).not.toHaveBeenCalled()
    const stopFirst = store.subscribe('session_1', vi.fn())
    const stopSecond = store.subscribe('session_1', vi.fn())
    store.setSessionRunning('session_1', true)
    await vi.advanceTimersByTimeAsync(0)
    const sharedCalls = list.mock.calls.length
    stopFirst()
    await vi.advanceTimersByTimeAsync(1000)
    expect(list).toHaveBeenCalledTimes(sharedCalls + 1)
    stopSecond()
    store.setSessionRunning('session_1', true)
    const stopReopened = store.subscribe('session_1', vi.fn())
    await vi.advanceTimersByTimeAsync(3000)
    expect(list).toHaveBeenCalledTimes(sharedCalls + 2)
    expect(vi.getTimerCount()).toBe(0)
    stopReopened()
  })

  it('keeps another Session polling when one unsubscribes and cancels all timers on dispose', async () => {
    vi.useFakeTimers()
    const list = vi.fn(async (sessionId: string) => ({
      sessionId, runs: [], media: [], hasActiveRuns: false, refreshAfterMs: 1000,
    }))
    const store = new GenerationProjectionStore({ list }, 500)
    const stop = store.subscribe('session_1', vi.fn())
    store.subscribe('session_2', vi.fn())
    store.setSessionRunning('session_1', true)
    store.setSessionRunning('session_2', true)
    await vi.advanceTimersByTimeAsync(0)
    stop()
    list.mockClear()
    await vi.advanceTimersByTimeAsync(1000)
    expect(list.mock.calls).toEqual([['session_2', expect.any(AbortSignal)]])
    store.dispose()
    await vi.advanceTimersByTimeAsync(3000)
    expect(list).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores a superseded request and an old subscription response after reopening the same Session', async () => {
    vi.useFakeTimers()
    const requests: Array<{ resolve: (value: GenerationProjection) => void; reject: (error: Error) => void }> = []
    const list = vi.fn(() => new Promise<GenerationProjection>((resolve, reject) => requests.push({ resolve, reject })))
    const store = new GenerationProjectionStore({ list }, 500)
    const listener = vi.fn()
    const stop = store.subscribe('session_1', listener)
    store.setSessionRunning('session_1', true)
    const empty: GenerationProjection = { sessionId: 'session_1', runs: [], media: [], hasActiveRuns: false, refreshAfterMs: 1000 }
    requests[0]!.reject(new Error('STALE_ERROR'))
    await vi.advanceTimersByTimeAsync(0)
    expect(listener).not.toHaveBeenCalled()
    stop()
    const stopReopened = store.subscribe('session_1', listener)
    requests[2]!.resolve(empty)
    await vi.advanceTimersByTimeAsync(0)
    requests[1]!.resolve({ ...empty, hasActiveRuns: true })
    await vi.advanceTimersByTimeAsync(2000)
    expect(listener).toHaveBeenCalledOnce()
    expect(store.getSnapshot('session_1')).toEqual({ errorCode: null, projection: empty })
    expect(vi.getTimerCount()).toBe(0)
    stopReopened()
  })

  it('rejects invalid polling intervals', () => {
    expect(() => new GenerationProjectionStore({ list: vi.fn() }, 0)).toThrow('interval')
  })
})

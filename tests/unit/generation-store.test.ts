import { afterEach, describe, expect, it, vi } from 'vitest'

import { GenerationProjectionStore } from '../../src/client/workbench/generation-store.ts'

afterEach(() => vi.useRealTimers())

describe('GenerationProjectionStore', () => {
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

  it('rejects invalid polling intervals', () => {
    expect(() => new GenerationProjectionStore({ list: vi.fn() }, 0)).toThrow('interval')
  })
})

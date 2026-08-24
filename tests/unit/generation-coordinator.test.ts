import { afterEach, describe, expect, it, vi } from 'vitest'

import { GenerationCoordinator } from '../../src/host/generation/generation-coordinator.ts'

afterEach(() => vi.useRealTimers())

describe('GenerationCoordinator', () => {
  it('advances immediately, waits between completed passes, and stops without cancelling remote jobs', async () => {
    vi.useFakeTimers()
    const advance = vi.fn(async () => undefined)
    const coordinator = new GenerationCoordinator({ runtime: { advance }, pollIntervalMs: 1000 })

    coordinator.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(advance).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1000)
    expect(advance).toHaveBeenCalledTimes(2)
    await coordinator.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(advance).toHaveBeenCalledTimes(2)
  })

  it('reports a failed pass and continues scheduling', async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    const advance = vi.fn()
      .mockRejectedValueOnce(new Error('worker failed'))
      .mockResolvedValueOnce(undefined)
    const coordinator = new GenerationCoordinator({ runtime: { advance }, pollIntervalMs: 1000, onError })

    coordinator.start()
    coordinator.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'worker failed' }))
    await vi.advanceTimersByTimeAsync(1000)
    expect(advance).toHaveBeenCalledTimes(2)
    await coordinator.stop()
  })

  it('rejects invalid polling intervals', () => {
    expect(() => new GenerationCoordinator({ runtime: { advance: vi.fn() }, pollIntervalMs: 0 })).toThrow('interval')
  })
})

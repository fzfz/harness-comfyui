import { describe, expect, it, vi } from 'vitest'
import type { JobHooks, JobSpec } from '@deepseek-ai/dsh-jobs'
import { GenerationRunWaitService } from '../../src/host/generation/run-wait-service.ts'

describe('Generation Run completion observation', () => {
  it('honors observation cancellation while the read is in flight and contains read failures', async () => {
    vi.useFakeTimers()
    try {
      let hooks!: JobHooks
      let release!: (value: unknown) => void
      let first = true
      const readGenerationRunMedia = vi.fn(async () => {
        if (first) { first = false; return { runs: [{ run_id: 'run_1', lookup_status: 'available', status: 'remote_running' }] } }
        return new Promise(resolve => { release = resolve })
      })
      const service = new GenerationRunWaitService({
        runtime: { readGenerationRunMedia } as never,
        jobs: { start(spec) { hooks = spec.run({ id: 'generation-wait-1', append() {}, updateProgress() {} } as never); return 'generation-wait-1' as never } }, pollIntervalMs: 10,
      })
      const identity = { workspaceId: 'workspace-1', sessionId: 'session-1', callId: 'call-1', rootCallId: 'call-1' }
      await service.register(identity, ['run_1'])
      await vi.advanceTimersByTimeAsync(10)
      hooks.cancel()
      release({ runs: [{ run_id: 'run_1', lookup_status: 'available', status: 'succeeded' }] })
      expect(await hooks.done).toEqual({ status: 'killed' })
      first = true
      await service.register(identity, ['run_1'])
      readGenerationRunMedia.mockRejectedValueOnce(new Error('Storage is unavailable. Reopen the Run query.'))
      await vi.advanceTimersByTimeAsync(10)
      expect(await hooks.done).toEqual({ status: 'failed', detail: 'Storage is unavailable. Reopen the Run query.' })
      expect(vi.getTimerCount()).toBe(0)
      await service.close()
    } finally { vi.useRealTimers() }
  })

  it('normalizes duplicate prefixes and returns one terminal fact for each canonical Run', async () => {
    let hooks!: JobHooks
    const service = new GenerationRunWaitService({
      runtime: { readGenerationRunMedia: async () => ({ runs: [
        { run_id: 'run_b', lookup_status: 'available', status: 'cancelled' },
        { run_id: 'run_a', lookup_status: 'available', status: 'succeeded' },
        { run_id: 'run_b', lookup_status: 'available', status: 'cancelled' },
      ] }) } as never,
      jobs: { start(spec) { hooks = spec.run({ id: 'generation-wait-1', append() {}, updateProgress() {} } as never); return 'generation-wait-1' as never } }, pollIntervalMs: 10,
    })
    expect(await service.register({ workspaceId: 'workspace-1', sessionId: 'session-1', callId: 'call-1', rootCallId: 'call-1' }, ['run_b_prefix', 'run_a', 'run_b'])).toEqual({ job_id: 'generation-wait-1', run_ids: ['run_a', 'run_b'] })
    expect(JSON.parse((await hooks.done).result!)).toEqual({ runs: [{ run_id: 'run_a', status: 'succeeded' }, { run_id: 'run_b', status: 'cancelled' }] })
    await service.close()
  })

  it('rejects registration after cancellation or service disposal and explains Job admission failures', async () => {
    let release!: (value: unknown) => void
    const start = vi.fn(() => { throw new Error('no job controller serves this agent') })
    const read = vi.fn(async () => ({ runs: [{ run_id: 'run_1', lookup_status: 'available', status: 'succeeded' }] }))
    const service = new GenerationRunWaitService({ runtime: { readGenerationRunMedia: read } as never, jobs: { start }, pollIntervalMs: 10 })
    await expect(service.register({ workspaceId: 'workspace-1', sessionId: 'session-1', callId: 'call-1', rootCallId: 'call-1' }, ['run_1'])).rejects.toMatchObject({ code: 'GENERATION_WAIT_UNAVAILABLE', message: expect.stringContaining('job_list') })
    read.mockImplementationOnce(() => new Promise(resolve => { release = resolve }) as never)
    const controller = new AbortController()
    const pending = service.register({ workspaceId: 'workspace-1', sessionId: 'session-1', callId: 'call-1', rootCallId: 'call-1' }, ['run_1'], controller.signal)
    controller.abort()
    release({ runs: [{ run_id: 'run_1', lookup_status: 'available', status: 'succeeded' }] })
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(start).toHaveBeenCalledTimes(1)
    read.mockImplementationOnce(() => new Promise(resolve => { release = resolve }) as never)
    const duringDisposal = service.register({ workspaceId: 'workspace-1', sessionId: 'session-1', callId: 'call-1', rootCallId: 'call-1' }, ['run_1'])
    await service.close()
    release({ runs: [{ run_id: 'run_1', lookup_status: 'available', status: 'succeeded' }] })
    await expect(duringDisposal).rejects.toMatchObject({ code: 'GENERATION_WAIT_UNAVAILABLE' })
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('reuses concurrent registrations for one owner and canonical Run set and cancels only observation', async () => {
    vi.useFakeTimers()
    try {
      const hooks: JobHooks[] = []
      const start = vi.fn((spec: JobSpec) => {
        const id = ('generation-wait-' + (hooks.length + 1)) as never
        hooks.push(spec.run({ id, append() {}, updateProgress() {} }))
        return id
      })
      const statuses = new Map([['run_1', 'remote_running'], ['run_2', 'succeeded']])
      const readGenerationRunMedia = vi.fn(async ({ runIds }: { runIds: string[] }) => ({ runs: runIds.map(run_id => ({ run_id: run_id === 'run_1_prefix' ? 'run_1' : run_id, lookup_status: 'available', status: statuses.get(run_id === 'run_1_prefix' ? 'run_1' : run_id) })) }))
      const service = new GenerationRunWaitService({ runtime: { readGenerationRunMedia } as never, jobs: { start }, pollIntervalMs: 10 })
      const owner = { workspaceId: 'workspace-1', sessionId: 'session-1', callId: 'call-1', rootCallId: 'call-1' }
      const receipts = await Promise.all([
        service.register(owner, ['run_1', 'run_2']),
        service.register({ ...owner, callId: 'call-2' }, ['run_2', 'run_1_prefix', 'run_1']),
      ])
      expect(receipts[0]).toEqual(receipts[1])
      expect(start).toHaveBeenCalledTimes(1)
      hooks[0]!.cancel()
      expect(await hooks[0]!.done).toMatchObject({ status: 'killed' })
      expect(statuses.get('run_1')).toBe('remote_running')
      expect(vi.getTimerCount()).toBe(0)
      await service.register(owner, ['run_1', 'run_2'])
      expect(start).toHaveBeenCalledTimes(2)
      await service.close()
      expect(await hooks[1]!.done).toMatchObject({ status: 'killed' })
      expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })

  it('rejects an inaccessible or invalid Run before registering any Job', async () => {
    const start = vi.fn()
    const service = new GenerationRunWaitService({
      runtime: { readGenerationRunMedia: async () => ({ runs: [{ run_id: 'run_foreign', lookup_status: 'error', error: { code: 'GENERATION_RUN_NOT_FOUND', message: 'Run not found in this Workspace.' } }] }) } as never,
      jobs: { start }, pollIntervalMs: 10,
    })
    await expect(service.register({ workspaceId: 'workspace-1', sessionId: 'session-1', callId: 'call-1', rootCallId: 'call-1' }, ['run_foreign'])).rejects.toMatchObject({ code: 'GENERATION_RUN_NOT_FOUND' })
    expect(start).not.toHaveBeenCalled()
    await service.close()
  })

  it('waits for every Run and keeps observation alive after the foreground signal aborts', async () => {
    vi.useFakeTimers()
    try {
      let hooks: JobHooks | undefined
      const start = vi.fn((spec: JobSpec) => {
        hooks = spec.run({ id: 'generation-wait-2', append() {}, updateProgress() {} } as never)
        return 'generation-wait-2' as never
      })
      let status = 'remote_running'
      const readGenerationRunMedia = vi.fn(async (_input?: unknown, _signal?: AbortSignal) => ({ runs: [
        { run_id: 'run_1', lookup_status: 'available', status: 'failed' },
        { run_id: 'run_2', lookup_status: 'available', status },
      ] }))
      const service = new GenerationRunWaitService({ runtime: { readGenerationRunMedia } as never, jobs: { start }, pollIntervalMs: 10 })
      const foreground = new AbortController()
      await service.register({ workspaceId: 'workspace-1', sessionId: 'session-1', callId: 'call-1', rootCallId: 'call-1' }, ['run_1', 'run_2'], foreground.signal)
      let settled = false
      void hooks!.done.then(() => { settled = true })
      foreground.abort()
      await vi.advanceTimersByTimeAsync(10)
      expect(settled).toBe(false)
      status = 'submission_unknown'
      await vi.advanceTimersByTimeAsync(10)
      expect(await hooks!.done).toEqual({ status: 'completed', result: '{"runs":[{"run_id":"run_1","status":"failed"},{"run_id":"run_2","status":"submission_unknown"}]}' })
      expect(readGenerationRunMedia.mock.calls.slice(1).every(call => call[1] !== foreground.signal)).toBe(true)
      await service.close()
    } finally { vi.useRealTimers() }
  })

  it('registers an owned official Job and completes with terminal Run facts', async () => {
    let hooks: JobHooks | undefined
    const start = vi.fn((spec: JobSpec) => {
      hooks = spec.run({ id: 'generation-wait-1', append() {}, updateProgress() {} } as never)
      return 'generation-wait-1' as never
    })
    const readGenerationRunMedia = vi.fn(async (_input?: unknown, _signal?: AbortSignal) => ({ runs: [{
      run_id: 'run_1', lookup_status: 'available', status: 'succeeded',
    }] }))
    const service = new GenerationRunWaitService({ runtime: { readGenerationRunMedia } as never, jobs: { start }, pollIntervalMs: 10 })
    const result = await service.register({ workspaceId: 'workspace-1', sessionId: 'session-1', callId: 'call-1', rootCallId: 'root-1' }, ['run_1'])

    expect(result).toEqual({ job_id: 'generation-wait-1', run_ids: ['run_1'] })
    expect(start.mock.calls[0]![0]).toMatchObject({ owner: 'session-1', toolCall: { callId: 'call-1', rootCallId: 'root-1' } })
    expect(await hooks!.done).toEqual({ status: 'completed', result: '{"runs":[{"run_id":"run_1","status":"succeeded"}]}' })
    expect(readGenerationRunMedia).toHaveBeenCalledWith({ workspaceId: 'workspace-1', runIds: ['run_1'] }, undefined)
    await service.close()
  })
})

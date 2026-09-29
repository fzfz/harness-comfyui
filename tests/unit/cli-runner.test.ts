import { describe, expect, it, vi } from 'vitest'
vi.mock('@deepseek-ai/dsh-agent', () => ({ installModelSelection: vi.fn() }))
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import { apply, runCliTask } from '../../src/host/cli/runner.ts'

function fixture(events: unknown[] = []) {
  const agent = { whenIdle: vi.fn(async () => undefined), followup: vi.fn(), session: { seq: 1, snapshotEvents: () => events } }
  const ctx = {
    get: vi.fn(() => ({ await: async (): Promise<void> => undefined })),
    agentDefaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    agentPresets: { mount: vi.fn(async (_ctx: unknown, id: string) => ({ id })) },
    agents: { create: vi.fn(async (options: any) => { await options.setup(ctx); return { agent } }) },
    sessions: { flush: vi.fn(async () => undefined) }, appExit: vi.fn(),
  }
  return { ctx, agent }
}

describe('pure CLI task runner', () => {
  it('mounts the selected Preset before starting the real task and flushes its result', async () => {
    const f = fixture([
      { seq: 0, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'old' }] } } },
      { seq: 1, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'done' }, { type: 'reasoning', text: 'hidden' }] } } },
      { seq: 2, type: 'turn/end', data: { reason: { kind: 'completed' } } },
    ])
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    try {
      expect(await runCliTask(f.ctx as never, { task: 'test task', preset: 'harness-comfyui-cli-candidate' })).toBe(0)
      expect(f.ctx.agentPresets.mount).toHaveBeenCalledWith(f.ctx, 'harness-comfyui-cli-candidate')
      expect(installModelSelection).toHaveBeenCalledWith(f.ctx, { current: { provider: 'test', model: 'test' }, assembled: undefined })
      expect(f.ctx.agents.create.mock.calls[0]![0].meta.cwd).toBe(process.cwd())
      expect(f.ctx.agents.create.mock.calls[0]![0].meta.agentPreset).toBe('harness-comfyui-cli-candidate')
      expect(f.agent.followup).toHaveBeenCalledOnce()
      expect(f.ctx.sessions.flush).toHaveBeenCalledWith(f.agent.session)
      expect(stdout).toHaveBeenCalledWith('done\n')
    } finally { stdout.mockRestore() }
  })
  it('waits for asynchronous host assembly before creating a Session', async () => {
    const f = fixture()
    let ready!: () => void
    const assembly = new Promise<void>(resolve => { ready = resolve })
    f.ctx.get.mockReturnValue({ await: () => assembly })
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    try {
      const task = runCliTask(f.ctx as never, { task: 'test', preset: 'standard' })
      await Promise.resolve()
      expect(f.ctx.agents.create).not.toHaveBeenCalled()
      expect(f.ctx.sessions.flush).not.toHaveBeenCalled()
      ready()
      await task
      expect(f.ctx.agents.create).toHaveBeenCalledOnce()
      expect(f.ctx.sessions.flush).toHaveBeenCalledOnce()
    } finally { stdout.mockRestore() }
  })
  it('returns failure for an incomplete or failed turn and reports the recorded error', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      expect(await runCliTask(fixture().ctx as never, { task: 'test', preset: 'standard' })).toBe(1)
      const f = fixture([{ seq: 1, type: 'turn/end', data: { reason: { kind: 'error', error: { code: 'TEST', message: 'failed' } } } }])
      expect(await runCliTask(f.ctx as never, { task: 'test', preset: 'standard' })).toBe(1)
      expect(stderr).toHaveBeenCalledWith('TEST: failed\n')
    } finally { stdout.mockRestore(); stderr.mockRestore() }
  })
  it('requests launcher exit after completion', async () => {
    const f = fixture([{ seq: 1, type: 'turn/end', data: { reason: { kind: 'completed' } } }])
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    try {
      apply(f.ctx as never, { task: 'test', preset: 'standard' })
      await vi.waitFor(() => expect(f.ctx.appExit).toHaveBeenCalledWith(0))
    } finally { stdout.mockRestore() }
  })
  it.each([new Error('mount failed'), 'mount failed'])('requests failure exit after setup rejection %#', async error => {
    const f = fixture()
    f.ctx.agentPresets.mount.mockRejectedValue(error)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      apply(f.ctx as never, { task: 'test', preset: 'standard' })
      await vi.waitFor(() => expect(f.ctx.appExit).toHaveBeenCalledWith(1))
      expect(f.agent.followup).not.toHaveBeenCalled()
      expect(stderr).toHaveBeenCalledWith('mount failed\n')
    } finally { stderr.mockRestore() }
  })
})

import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { expect, it, vi } from 'vitest'
import { HarnessWorkbenchSessions } from '../../src/host/workbench/harness-adapter.ts'

it('starts a reserved child with the selected function route and retains its terminal state after release', async () => {
  let finish!: (value: { stopReason: string }) => void
  const activation = { result: new Promise<{ stopReason: string }>(resolve => { finish = resolve }), dispose: vi.fn(async () => {}) }
  const start = vi.fn(async () => activation)
  const adapter = new HarnessWorkbenchSessions({
    controller: { create: vi.fn(), selectModel: vi.fn(), prompt: vi.fn(), cancel: vi.fn() },
    events: () => [], workspaceForTask: () => 'workspace',
    scopeForSession: async id => ({ workspaceId: 'workspace', sessionIds: [id] }), agent: () => undefined,
    delegation: { start, interrupt: vi.fn(), disposeDescendants: vi.fn(), skills: async () => [{ name: 'builder', invocation: { modelInvocable: true } }] },
  })
  const input = { parentSessionId: 'experiment-session', sessionId: 'reserved-child', taskId: 'child-task', label: '提示词', text: '改写窗外光线', presetId: 'prompt-preset', agentModel: { provider: 'lan', model: 'luna', reasoningEffort: 'off' }, requestedSkill: 'builder', signal: new AbortController().signal }
  await adapter.delegate(input)
  expect(start).toHaveBeenCalledWith(input)
  expect(await adapter.status({ sessionId: input.sessionId })).toBe('running')
  finish({ stopReason: 'error' })
  await activation.result
  expect(await adapter.status({ sessionId: input.sessionId })).toBe('failed')
})

it('records a rejected child activation as failed after its session is released', async () => {
  let reject!: (error: Error) => void
  const result = new Promise<{ stopReason: string }>((_resolve, fail) => { reject = fail })
  const adapter = new HarnessWorkbenchSessions({
    controller: { create: vi.fn(), selectModel: vi.fn(), prompt: vi.fn(), cancel: vi.fn() },
    events: () => [], workspaceForTask: () => 'workspace', agent: () => undefined,
    scopeForSession: async id => ({ workspaceId: 'workspace', sessionIds: [id] }),
    delegation: { start: async () => ({ result, dispose: vi.fn(async () => {}) }), interrupt: vi.fn(), disposeDescendants: vi.fn(), skills: async () => [] },
  })
  await adapter.delegate({ parentSessionId: 'parent', sessionId: 'child', taskId: 'task', label: 'Prompt', text: 'prompt', presetId: 'prompt', agentModel: { provider: 'lan', model: 'luna' }, requestedSkill: null, signal: new AbortController().signal })
  reject(new Error('Provider disconnected'))
  await expect(result).rejects.toThrow('Provider disconnected')
  expect(await adapter.status({ sessionId: 'child' })).toBe('failed')
})

it('refuses an unavailable Skill before creating a child and uses official interrupt for a paused child', async () => {
  const start = vi.fn(), interrupt = vi.fn(async () => {}), disposeDescendants = vi.fn(async () => {})
  const adapter = new HarnessWorkbenchSessions({
    controller: { create: vi.fn(), selectModel: vi.fn(), prompt: vi.fn(), cancel: vi.fn() },
    events: () => [], workspaceForTask: () => 'workspace', agent: () => undefined,
    scopeForSession: async () => ({ workspaceId: 'workspace', sessionIds: ['parent', 'child'] }),
    delegation: { start, interrupt, disposeDescendants, skills: async () => [] },
  })
  await expect(adapter.delegate({ parentSessionId: 'parent', sessionId: 'child', taskId: 'task', label: 'Prompt', text: 'prompt', presetId: 'prompt', agentModel: { provider: 'lan', model: 'luna' }, requestedSkill: 'missing', signal: new AbortController().signal })).rejects.toThrow('Skill missing')
  expect(start).not.toHaveBeenCalled()
  await adapter.control({ sessionId: 'parent', action: 'pause', signal: new AbortController().signal })
  expect(interrupt).toHaveBeenCalledWith('parent', 'child')
  await adapter.control({ sessionId: 'parent', action: 'interrupt', signal: new AbortController().signal })
  expect(disposeDescendants).toHaveBeenCalledWith('parent')
})

it.each(['completed', 'error', 'blocked'] as const)('reads the latest durable turn after a %s child has been released', async reason => {
  const events = [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'turn/end', data: { turn: 1, reason: { kind: reason === 'completed' ? 'error' : 'completed' } } },
    { type: 'turn/start', data: { turn: 2 } },
    { type: 'turn/end', data: { turn: 2, reason: { kind: reason } } },
  ] as SessionEvent[]
  const adapter = new HarnessWorkbenchSessions({
    controller: { create: vi.fn(), selectModel: vi.fn(), prompt: vi.fn(), cancel: vi.fn() },
    events: async () => events, workspaceForTask: () => 'workspace', agent: () => undefined,
    scopeForSession: async id => ({ workspaceId: 'workspace', sessionIds: [id] }),
  })
  expect(await adapter.status({ sessionId: 'released-child' })).toBe(reason === 'completed' ? 'idle' : 'failed')
})

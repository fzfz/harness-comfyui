import { expect, it, vi } from 'vitest'
import { createToolResultMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { HarnessWorkbenchSessions } from '../../src/host/workbench/harness-adapter.ts'

const signal = () => new AbortController().signal

function fixture() {
  const controller = {
    create: vi.fn(async () => ({ sessionId: 'session-task', agentPreset: 'chosen' })),
    selectModel: vi.fn(async (input: { provider: string; model: string; reasoningEffort?: string }) => ({ selected: { provider: input.provider, model: input.model, reasoningEffort: input.reasoningEffort } })),
    prompt: vi.fn(async () => ({ accepted: true as const })),
    cancel: vi.fn(() => ({ accepted: true as const })),
  }
  const host = {
    controller,
    events: vi.fn((_id: string): readonly SessionEvent[] => []),
    workspaceForTask: () => 'workspace-a',
    scopeForSession: vi.fn(async () => ({ workspaceId: 'workspace-a', sessionIds: ['session-task', 'session-child'] })),
    agent: (id: string) => id === 'session-task' ? { status: 'idle' as const, skills: async () => [{ name: 'prompt-builder', invocation: { modelInvocable: true } }] } : id === 'session-child' ? { status: 'running' as const, skills: async () => [] } : undefined,
  }
  return { host, controller, adapter: new HarnessWorkbenchSessions(host) }
}

function sessionEvent(type: SessionEvent['type'], data: unknown): SessionEvent {
  return { type, data, seq: 1, time: 1 } as SessionEvent
}
function skillCall(callId: string, name: string, turn = 2) {
  return sessionEvent('tool/call', { callId, name: 'skill', arguments: JSON.stringify({ name }), turn, step: 1 })
}
function toolResult(callId: string, isError = false) {
  return sessionEvent('tool/result', { turn: 2, step: 1, message: createToolResultMessage({ callId: callId as never, isError, content: [{ type: 'text', text: 'Rendered skill body with /unverified/SKILL.md' }] }) })
}

it('records successful native and PTC Skill reads in the publishing session scope', async () => {
  const { host, adapter } = fixture()
  const root = [
    skillCall('root-read', 'prompt-builder'), toolResult('root-read'),
    sessionEvent('tool/call', { callId: 'program', name: 'run_code', arguments: '{}', turn: 3, step: 1 }),
    sessionEvent('tool/ptc-dispatch', { rootCallId: 'program', parentCallId: 'program:ptc:1', subCallId: 'program:ptc:2', name: 'skill', arguments: { name: 'image-review' }, isError: false, content: [] }),
  ]
  const child = [skillCall('child-read', 'child-builder', 4), toolResult('child-read')]
  host.events.mockImplementation(id => id === 'session-task' ? root : child)
  expect(await adapter.skillReadRefs({ sessionId: 'session-task' })).toEqual([
    { name: 'prompt-builder', session_id: 'session-task', turn: 2, call_id: 'root-read', source_file: null },
    { name: 'image-review', session_id: 'session-task', turn: 3, call_id: 'program:ptc:2', source_file: null },
    { name: 'child-builder', session_id: 'session-child', turn: 4, call_id: 'child-read', source_file: null },
  ])
  host.scopeForSession.mockResolvedValue({ workspaceId: 'workspace-a', sessionIds: ['session-child'] })
  expect(await adapter.skillReadRefs({ sessionId: 'session-child' })).toEqual([
    { name: 'child-builder', session_id: 'session-child', turn: 4, call_id: 'child-read', source_file: null },
  ])
  expect(host.events.mock.calls.map(([id]) => id)).toEqual(['session-task', 'session-child', 'session-child'])
})

it('ignores failed, unfinished, malformed and unrelated tool calls when recording Skill reads', async () => {
  const { host, adapter } = fixture()
  host.scopeForSession.mockResolvedValue({ workspaceId: 'workspace-a', sessionIds: ['session-task'] })
  host.events.mockReturnValue([
    skillCall('failed', 'missing'), toolResult('failed', true),
    skillCall('pending', 'pending'),
    sessionEvent('tool/call', { callId: 'shell', name: 'bash', arguments: '{"name":"fake"}', turn: 1, step: 1 }), toolResult('shell'),
    sessionEvent('tool/call', { callId: 'bad-json', name: 'skill', arguments: '{', turn: 1, step: 1 }), toolResult('bad-json'),
    sessionEvent('tool/call', { callId: 'bad-name', name: 'skill', arguments: '{"name":1}', turn: 1, step: 1 }), toolResult('bad-name'),
    sessionEvent('tool/call', { callId: 'empty-name', name: 'skill', arguments: '{"name":""}', turn: 1, step: 1 }), toolResult('empty-name'),
    toolResult('orphan'),
    sessionEvent('tool/call', { callId: 'program', name: 'run_code', arguments: '{}', turn: 3, step: 1 }),
    sessionEvent('tool/ptc-dispatch', { rootCallId: 'program', parentCallId: 'program', subCallId: 'failed-ptc', name: 'skill', arguments: { name: 'missing' }, isError: true, content: [] }),
    sessionEvent('tool/ptc-dispatch', { rootCallId: 'program', parentCallId: 'program', subCallId: 'other-ptc', name: 'bash', arguments: { name: 'fake' }, isError: false, content: [] }),
    sessionEvent('tool/ptc-dispatch', { rootCallId: 'absent', parentCallId: 'absent', subCallId: 'orphan-ptc', name: 'skill', arguments: { name: 'unknown-turn' }, isError: false, content: [] }),
  ])
  expect(await adapter.skillReadRefs({ sessionId: 'session-task' })).toEqual([])
})

it('cancels live sessions in the official scope and clears a failure on redispatch', async () => {
  const { controller, adapter, host } = fixture()
  adapter.recordFailure('session-child')
  adapter.recordFailure('another-task')
  expect(await adapter.status({ sessionId: 'session-task' })).toBe('failed')
  await adapter.dispatch({ sessionId: 'session-task', taskId: 'task-a', text: 'Continue', signal: signal() })
  expect(await adapter.status({ sessionId: 'session-task' })).toBe('running')
  host.scopeForSession.mockResolvedValueOnce({ workspaceId: 'workspace-a', sessionIds: ['another-task'] })
  expect(await adapter.status({ sessionId: 'another-task' })).toBe('failed')
  host.scopeForSession.mockResolvedValue({ workspaceId: 'workspace-a', sessionIds: ['session-task', 'session-child', 'unloaded'] })
  await adapter.control({ sessionId: 'session-task', action: 'pause', signal: signal() })
  expect(controller.cancel.mock.calls).toEqual([[{ sessionId: 'session-task' }], [{ sessionId: 'session-child' }]])
  controller.cancel.mockClear()
  await adapter.control({ sessionId: 'session-task', action: 'continue', signal: signal() })
  expect(controller.cancel).not.toHaveBeenCalled()
  host.scopeForSession.mockResolvedValue({ workspaceId: 'workspace-a', sessionIds: ['session-task'] })
  expect(await adapter.status({ sessionId: 'session-task' })).toBe('idle')
  expect(await adapter.status({ sessionId: 'unloaded' })).toBeNull()
  expect(await adapter.authorize({ task: { task_id: 'task-a', session_id: null }, identity: { workspaceId: 'workspace-a', sessionId: 'session-task', turn: 1, callId: 'a' } })).toBe(false)
})

it('rejects a substituted preset before selecting a model or dispatching', async () => {
  const { controller, adapter } = fixture()
  controller.create.mockResolvedValue({ sessionId: 'session-task', agentPreset: 'other' })
  await expect(adapter.create({ task: { task_id: 'task-a' }, presetId: 'chosen', agentModel: { provider: 'p', model: 'm' }, requestedSkill: null })).rejects.toThrow('chosen')
  expect(controller.selectModel).not.toHaveBeenCalled()
  expect(controller.prompt).not.toHaveBeenCalled()
})

it('creates the selected preset in the task workspace and selects its exact model before dispatch', async () => {
  const { controller, adapter } = fixture()
  const selected = await adapter.create({ task: { task_id: 'task-a' }, presetId: 'chosen', agentModel: { provider: 'provider-a', model: 'model-a', reasoningEffort: 'high' }, requestedSkill: 'prompt-builder' })
  expect(controller.create).toHaveBeenCalledWith({ workspaceId: 'workspace-a', agentPreset: 'chosen' })
  expect(controller.selectModel).toHaveBeenCalledWith({ sessionId: 'session-task', provider: 'provider-a', model: 'model-a', reasoningEffort: 'high' })
  expect(selected.selectedModel).toEqual({ provider: 'provider-a', model: 'model-a', reasoningEffort: 'high' })
  await adapter.dispatch({ sessionId: selected.sessionId, text: 'Read task-a.', taskId: 'task-a', signal: signal() })
  expect(controller.prompt).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session-task', mode: 'queue', content: [{ type: 'text', text: 'Read task-a.' }] }), expect.any(AbortSignal))
})

it('authorizes the task session and its official descendants after workspace changes', async () => {
  const { adapter } = fixture()
  const task = { task_id: 'task-a', session_id: 'session-task' }
  const identity = { workspaceId: 'workspace-a', sessionId: 'session-child', turn: 1, callId: 'call-a' }
  expect(await adapter.authorize({ task, identity })).toBe(true)
  expect(await adapter.authorize({ task, identity: { ...identity, sessionId: 'unrelated' } })).toBe(false)
  expect(await adapter.authorize({ task, identity: { ...identity, workspaceId: 'workspace-b' } })).toBe(true)
})

it('observes active descendants and refuses an unavailable requested Skill', async () => {
  const { adapter } = fixture()
  expect(await adapter.status({ sessionId: 'session-task' })).toBe('running')
  await expect(adapter.create({ task: { task_id: 'task-a' }, presetId: 'chosen', agentModel: { provider: 'p', model: 'm' }, requestedSkill: 'missing' })).rejects.toThrow('missing')
})

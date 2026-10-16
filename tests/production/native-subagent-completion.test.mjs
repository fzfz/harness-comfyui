import { describe, expect, it, vi } from 'vitest'

import { apply } from '../../agent-presets/project-iteration-dispatch.mjs'

function setup(dispatch) {
  const listeners = new Map()
  const disposers = new Set()
  let tool
  const emit = (name, ...args) => {
    for (const callback of [...(listeners.get(name) ?? [])]) callback(...args)
  }
  const accepted = (childId, messageId) => emit('session/event', { id: childId, header: { parentSession: 'parent-1' } }, {
    type: 'agent/inbox/spliced', data: { inserted: [{ id: messageId }] },
  })
  const end = (childId, runId = 'activation-1', stopReason = 'completed') => emit('subagent/end', {
    id: childId, runId, provider: 'spawn', local: true, stopReason,
  })
  const subagents = {
    startContinuable: vi.fn(() => dispatch({ accepted, end, emit })),
    sendMessage: vi.fn(async () => (await dispatch({ accepted, end, emit })).messageId),
  }
  const ctx = {
    effect(callback) {
      const cleanup = callback()
      const dispose = () => { if (disposers.delete(dispose)) cleanup() }
      disposers.add(dispose)
      return dispose
    },
    on(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name).add(callback)
      return () => listeners.get(name).delete(callback)
    },
    tools: { register(value) { tool = value } },
    subagents,
  }
  apply(ctx, {
    toolName: 'test-dispatch', parameters: {}, outputSchema: {},
    taskTemplate: { title: 'Task', sections: [] }, provider: 'spawn',
  })
  return {
    tool, subagents, accepted, end, emit,
    unload: () => { for (const dispose of [...disposers]) dispose() },
    listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
  }
}

const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
const execution = () => ({ agent: { id: 'parent-1' }, signal: new AbortController().signal, deferContext: vi.fn() })

describe('project dispatch native completion boundary', () => {
  it.each([false, true])('keeps %s dispatch pending after acceptance until its child ends', async continuation => {
    const env = setup(({ accepted }) => {
      accepted('child-1', 'message-1')
      return { childId: 'child-1', messageId: 'message-1' }
    })
    let resolved = false
    const result = env.tool.execute({ description: 'task', ...(continuation ? { agent_id: 'child-1' } : {}) }, execution())
    void result.then(() => { resolved = true })
    await tick()
    try {
      expect(resolved).toBe(false)
      env.end('sibling-child')
      await tick()
      expect(resolved).toBe(false)
    } finally { env.end('child-1') }
    expect(await result).toEqual(continuation ? { messageId: 'message-1' } : { kind: 'continuable', subagentId: 'child-1' })
    expect(env.listenerCount()).toBe(0)
  })

  it('ignores a previous activation ending before the continuation is accepted', async () => {
    const env = setup(({ accepted, end }) => {
      end('child-1', 'previous-activation')
      accepted('child-1', 'message-2')
      return { childId: 'child-1', messageId: 'message-2' }
    })
    let resolved = false
    const result = env.tool.execute({ description: 'continue', agent_id: 'child-1' }, execution())
    void result.then(() => { resolved = true })
    await tick()
    try { expect(resolved).toBe(false) }
    finally { env.end('child-1', 'resumed-activation') }
    expect(await result).toEqual({ messageId: 'message-2' })
    expect(env.subagents.sendMessage).toHaveBeenCalledTimes(1)
    expect(env.subagents.startContinuable).not.toHaveBeenCalled()
    expect(env.listenerCount()).toBe(0)
  })

  it('recognizes completion emitted before the SDK acceptance promise returns', async () => {
    const env = setup(({ accepted, end }) => {
      accepted('child-1', 'message-1')
      end('child-1')
      return { childId: 'child-1', messageId: 'message-1' }
    })
    expect(await env.tool.execute({ description: 'task' }, execution())).toEqual({ kind: 'continuable', subagentId: 'child-1' })
    expect(env.listenerCount()).toBe(0)
  })
  it('retains accepted identity when waiting is cancelled and releases its listeners', async () => {
    const env = setup(({ accepted }) => {
      accepted('child-1', 'message-1')
      return { childId: 'child-1', messageId: 'message-1' }
    })
    const controller = new AbortController()
    const exec = { ...execution(), signal: controller.signal, callId: 'call-1' }
    const result = env.tool.execute({ description: 'task' }, exec)
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    await tick()
    controller.abort()
    await rejected
    expect(exec.deferContext).toHaveBeenCalledTimes(1)
    const context = exec.deferContext.mock.calls[0][0]
    expect(context).toMatchObject({ role: 'user', source: { kind: 'harness-subagent-accepted' } })
    expect(JSON.parse(context.content[0].text)).toEqual({ toolName: 'test-dispatch', callId: 'call-1', subagentId: 'child-1', messageId: 'message-1', status: 'accepted' })
    expect(env.listenerCount()).toBe(0)
    expect(env.subagents.startContinuable).toHaveBeenCalledTimes(1)
  })

  it('rejects an unloaded dispatch without restarting accepted work', async () => {
    const env = setup(({ accepted }) => {
      accepted('child-1', 'message-1')
      return { childId: 'child-1', messageId: 'message-1' }
    })
    const result = env.tool.execute({ description: 'task' }, execution())
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    await tick()
    env.unload()
    await rejected
    expect(env.listenerCount()).toBe(0)
    expect(env.subagents.startContinuable).toHaveBeenCalledTimes(1)
  })

  it('cleans up when the SDK refuses acceptance', async () => {
    const error = new Error('acceptance refused')
    const env = setup(() => { throw error })
    const exec = execution()
    await expect(env.tool.execute({ description: 'task' }, exec)).rejects.toBe(error)
    expect(exec.deferContext).not.toHaveBeenCalled()
    expect(env.listenerCount()).toBe(0)
  })

  it('requires the direct-parent inbox event before accepting a matching child end', async () => {
    const env = setup(() => ({ childId: 'child-1', messageId: 'message-1' }))
    let resolved = false
    const result = env.tool.execute({ description: 'task' }, execution())
    void result.then(() => { resolved = true })
    await tick()
    env.emit('session/event', { id: 'child-1', header: { parentSession: 'other-parent' } }, {
      type: 'agent/inbox/spliced', data: { inserted: [{ id: 'message-1' }] },
    })
    env.end('child-1')
    await tick()
    try { expect(resolved).toBe(false) }
    finally { env.accepted('child-1', 'message-1'); env.end('child-1') }
    await result
    expect(env.listenerCount()).toBe(0)
  })

  it.each(['completed', 'aborted', 'error', 'max-tokens', 'refusal'])('leaves %s business interpretation to the native notice', async stopReason => {
    const env = setup(({ accepted, end }) => {
      accepted('child-1', 'message-1')
      end('child-1', 'activation-1', stopReason)
      return { childId: 'child-1', messageId: 'message-1' }
    })
    expect(await env.tool.execute({ description: 'task' }, execution())).toEqual({ kind: 'continuable', subagentId: 'child-1' })
    expect(env.listenerCount()).toBe(0)
  })

  it('checks the observed activation ID while accepting an already running epoch without a new start', async () => {
    const env = setup(({ accepted, emit }) => {
      emit('subagent/start', { id: 'child-1', runId: 'activation-current' })
      accepted('child-1', 'message-1')
      return { childId: 'child-1', messageId: 'message-1' }
    })
    let resolved = false
    const result = env.tool.execute({ description: 'task' }, execution())
    void result.then(() => { resolved = true })
    await tick()
    env.end('child-1', 'activation-other')
    await tick()
    try { expect(resolved).toBe(false) }
    finally { env.end('child-1', 'activation-current') }
    await result
    expect(env.listenerCount()).toBe(0)
  })

})

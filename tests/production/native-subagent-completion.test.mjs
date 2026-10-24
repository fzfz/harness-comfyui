import { describe, expect, it, vi } from 'vitest'

import { apply } from '../../agent-presets/project-iteration-dispatch.mjs'

function setup() {
  const pending = Promise.withResolvers()
  const activation = { childId: 'child-1', messageId: 'message-1', result: pending.promise, dispose: vi.fn() }
  const subagents = {
    startActivation: vi.fn(async () => activation),
    sendMessage: vi.fn(async () => 'message-2'),
  }
  let tool
  apply({ tools: { register(value) { tool = value } }, subagents }, {
    toolName: 'test-dispatch', parameters: {},
    taskTemplate: { title: 'Task', sections: [] }, provider: 'spawn',
    agentPreset: 'harness-comfyui-task',
  })
  return { tool, subagents, activation, pending }
}

const execution = () => ({ agent: { id: 'parent-1' }, signal: new AbortController().signal, deferContext: vi.fn(), callId: 'call-1' })

describe('project dispatch native acceptance boundary', () => {
  it('rejects a call without its parent Agent before accepting work', async () => {
    const env = setup()
    const exec = { ...execution(), agent: undefined }
    await expect(env.tool.execute({ description: 'task' }, exec)).rejects.toThrow('parent Agent')
    expect(env.subagents.startActivation).not.toHaveBeenCalled()
    expect(exec.deferContext).not.toHaveBeenCalled()
  })

  it('continues the existing identity and returns its accepted message', async () => {
    const env = setup()
    const exec = execution()
    expect(await env.tool.execute({ description: 'continue', agent_id: 'saved-child' }, exec))
      .toEqual({ status: 'accepted', operation: 'continue', subagentId: 'saved-child', messageId: 'message-2' })
    expect(env.subagents.startActivation).not.toHaveBeenCalled()
    expect(env.subagents.sendMessage).toHaveBeenCalledWith(exec.agent, 'saved-child',
      expect.any(Array), { signal: exec.signal })
    expect(JSON.parse(exec.deferContext.mock.calls[0][0].content[0].text))
      .toMatchObject({ subagentId: 'saved-child', messageId: 'message-2', status: 'accepted' })
  })

  it.each([false, true])('preserves a host rejection without publishing acceptance, continuation=%s', async continuation => {
    const env = setup()
    const error = new Error('host rejected work')
    const service = continuation ? env.subagents.sendMessage : env.subagents.startActivation
    service.mockRejectedValue(error)
    const exec = execution()
    await expect(env.tool.execute({ description: 'task', ...(continuation ? { agent_id: 'saved-child' } : {}) }, exec))
      .rejects.toBe(error)
    expect(exec.deferContext).not.toHaveBeenCalled()
    expect(env.activation.dispose).not.toHaveBeenCalled()
  })

  it('keeps parallel acceptance receipts attached to their own Tool Calls', async () => {
    const env = setup()
    env.subagents.startActivation.mockImplementation(async ({ label }) => ({
      ...env.activation, childId: `child-${label}`, messageId: `message-${label}`,
    }))
    const executions = ['a', 'b'].map(label => ({ ...execution(), callId: `call-${label}` }))
    const results = await Promise.all(executions.map((exec, index) =>
      env.tool.execute({ description: ['a', 'b'][index] }, exec)))
    expect(results).toEqual([
      { status: 'accepted', operation: 'create', subagentId: 'child-a', messageId: 'message-a' },
      { status: 'accepted', operation: 'create', subagentId: 'child-b', messageId: 'message-b' },
    ])
    expect(executions.map(exec => JSON.parse(exec.deferContext.mock.calls[0][0].content[0].text)))
      .toEqual(['a', 'b'].map(label => ({
        toolName: 'test-dispatch', callId: `call-${label}`, subagentId: `child-${label}`,
        messageId: `message-${label}`, status: 'accepted', operation: 'create',
      })))
    env.pending.resolve({ stopReason: 'completed' })
  })

  it('returns the child identity while the host activation is still running', async () => {
    const env = setup()
    const exec = execution()
    expect(await env.tool.execute({ description: 'task' }, exec))
      .toEqual({ status: 'accepted', operation: 'create', subagentId: 'child-1', messageId: 'message-1' })
    expect(env.subagents.startActivation).toHaveBeenCalledWith(expect.objectContaining({
      delivery: 'parent',
      request: expect.objectContaining({ agentPreset: 'harness-comfyui-task', parent: exec.agent }),
    }))
    expect(env.activation.dispose).not.toHaveBeenCalled()
    expect(JSON.parse(exec.deferContext.mock.calls[0][0].content[0].text)).toEqual({
      toolName: 'test-dispatch', callId: 'call-1', subagentId: 'child-1', messageId: 'message-1', status: 'accepted', operation: 'create',
    })
    env.pending.resolve({ stopReason: 'completed' })
  })
})

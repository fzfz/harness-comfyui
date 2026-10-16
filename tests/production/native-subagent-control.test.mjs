import { describe, expect, it, vi } from 'vitest'

import { apply } from '../../agent-presets/project-subagent-control.mjs'

function setup() {
  const definitions = []
  const ctx = {
    tools: { register: vi.fn(tool => definitions.push(tool)) },
    subagents: { interrupt: vi.fn() },
  }
  apply(ctx)
  return { ctx, definitions, tool: definitions[0] }
}

describe('project interrupt tool official service boundary', () => {
  it('registers one interrupt tool with required agent identity and accepted output', () => {
    const { ctx, definitions, tool } = setup()
    expect(definitions.map(tool => tool.name)).toEqual(['interrupt_agent'])
    expect(ctx.tools.register).toHaveBeenCalledOnce()
    expect(tool.parameters).toMatchObject({
      type: 'object', required: ['agent_id'],
      properties: { agent_id: { type: 'string' } },
    })
    expect(tool.output.schema).toMatchObject({
      type: 'object', required: ['accepted'], additionalProperties: false,
      properties: { accepted: { type: 'boolean' } },
    })
  })

  it('passes the exact calling Agent and target to the official service once', async () => {
    const { ctx, tool } = setup()
    const agent = { id: 'parent-1', session: {} }
    const result = await tool.execute({ agent_id: 'child-1' }, { agent })
    expect(result).toEqual({ accepted: true })
    expect(ctx.subagents.interrupt).toHaveBeenCalledExactlyOnceWith('child-1', { kind: 'ancestor', agent })
    expect(ctx.subagents.interrupt.mock.calls[0][1].agent).toBe(agent)
    expect(tool.output.render({ agent_id: 'child-1' }, result)).toEqual([
      { type: 'text', text: '已向子 Agent child-1 发出中断请求。' },
    ])
  })

  it.each([{}, { agent_id: null }, { agent_id: 1 }])(
    'rejects invalid parameters %j before contacting the official service', async args => {
      const { ctx, tool } = setup()
      await expect(Promise.resolve().then(() => tool.execute(args, { agent: { id: 'parent-1' } })))
        .rejects.toMatchObject({ name: 'ToolArgsError' })
      expect(ctx.subagents.interrupt).not.toHaveBeenCalled()
    },
  )

  it('requires a calling Agent before contacting the official service', async () => {
    const { ctx, tool } = setup()
    await expect(tool.execute({ agent_id: 'child-1' }, {}))
      .rejects.toThrow('interrupt_agent 未取得调用者的 Agent 身份；请在父 Agent 会话中调用。')
    expect(ctx.subagents.interrupt).not.toHaveBeenCalled()
  })

  it.each(['UNAUTHORIZED', 'SERVICE_FAILURE'])(
    'preserves the official %s error instead of returning accepted', async code => {
      const { ctx, tool } = setup()
      const error = Object.assign(new Error('official interrupt failure'), { code })
      ctx.subagents.interrupt.mockImplementationOnce(() => { throw error })
      await expect(tool.execute({ agent_id: 'outside-child' }, { agent: { id: 'parent-1' } })).rejects.toBe(error)
      expect(ctx.subagents.interrupt).toHaveBeenCalledOnce()
    },
  )
})

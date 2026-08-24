import { describe, expect, it, vi } from 'vitest'

import { createGenerationTool } from '../../src/host/generation/generation-tool.ts'

function execution(events: readonly unknown[]) {
  return {
    callId: 'call_generation_1',
    rootCallId: 'call_generation_1',
    name: 'generate_with_comfyui',
    arguments: {},
    signal: new AbortController().signal,
    token: Symbol('execution'),
    deferContext: vi.fn(),
    concludeTurn: vi.fn(),
    agent: {
      id: 'session_1',
      session: {
        id: 'session_1',
        header: { cwd: '/workspace' },
        events,
      },
    },
  }
}

const toolArguments = {
  title: '角色立绘',
  instance_id: '2',
  template_id: '34',
  parameters: { positive_prompt: '1girl' },
}

describe('generate_with_comfyui Tool', () => {
  it('derives Run ownership from the current Tool call and matching same-turn Skill invocation', async () => {
    const acceptGeneration = vi.fn(async () => ({ runId: 'run_1' }))
    const tool = createGenerationTool({
      runtime: { acceptGeneration } as never,
      workspaceRegistry: {
        resolveByPath: vi.fn(async () => ({ id: 'workspace_1', sessionIds: ['session_1'] })),
      } as never,
    })
    const events = [
      { type: 'turn/start', seq: 0, data: { turn: 7 } },
      { type: 'turn/start', seq: -1, data: { turn: 7 } },
      {
        type: 'user/message',
        seq: 1,
        data: { turn: 7, content: [], source: { kind: 'skill-invocation', name: 'comfyui-generate', form: 'instructions' } },
      },
      { type: 'tool/call', seq: 2, data: { turn: 7, step: 0, callId: 'call_generation_1', name: 'generate_with_comfyui', arguments: '{}' } },
    ]

    await expect(tool.execute(toolArguments, execution(events) as never)).resolves.toEqual({ run_id: 'run_1' })
    expect(acceptGeneration).toHaveBeenCalledWith(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 7, callId: 'call_generation_1' },
      {
        title: '角色立绘',
        instanceId: '2',
        templateId: '34',
        parameters: { positive_prompt: '1girl' },
      },
      expect.any(AbortSignal),
    )
    expect(tool.output.presentationMeta?.(toolArguments, { run_id: 'run_1' })).toEqual({
      contract_id: 'harness-comfyui-generation-run',
      contract_version: 1,
      run_id: 'run_1',
    })
    expect(tool.output.render(toolArguments, { run_id: 'run_1' })).toEqual([
      { type: 'text', text: '{"run_id":"run_1"}' },
    ])
  })

  it('rejects a Tool call without the same-turn comfyui-generate invocation before creating a Run', async () => {
    const acceptGeneration = vi.fn()
    const tool = createGenerationTool({
      runtime: { acceptGeneration } as never,
      workspaceRegistry: { resolveByPath: vi.fn(async () => ({ id: 'workspace_1', sessionIds: ['session_1'] })) } as never,
    })
    const events = [
      { type: 'turn/start', seq: 0, data: { turn: 7 } },
      { type: 'tool/call', seq: 1, data: { turn: 7, step: 0, callId: 'call_generation_1', name: 'generate_with_comfyui', arguments: '{}' } },
    ]

    await expect(tool.execute(toolArguments, execution(events) as never)).rejects.toMatchObject({
      code: 'GENERATION_SKILL_INVOCATION_REQUIRED',
    })
    expect(acceptGeneration).not.toHaveBeenCalled()
  })

  it('publishes closed input and output JSON schemas', () => {
    const tool = createGenerationTool({
      runtime: {} as never,
      workspaceRegistry: {} as never,
    })

    expect(tool.parameters).toMatchObject({ type: 'object', additionalProperties: false })
    expect(tool.parameters).not.toHaveProperty('lora_applications')
    expect(tool.output.schema).toMatchObject({ type: 'object', additionalProperties: false, required: ['run_id'] })
  })
})

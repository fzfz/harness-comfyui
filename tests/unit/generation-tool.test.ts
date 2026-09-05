import { describe, expect, it, vi } from 'vitest'

import { createGenerationTool } from '../../src/host/generation/generation-tool.ts'

function execution(events: readonly unknown[], callId = 'call_generation_1') {
  return {
    callId,
    rootCallId: callId,
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
        snapshotEvents: () => events,
      },
    },
  }
}

const toolArguments = {
  title: '角色立绘',
  instance_id: '2',
  template_id: '34',
  model: {
    id: '1',
    file_name: 'waiIllustriousSDXL_v170.safetensors',
  },
  parameters: { positive_prompt: '1girl' },
  loras: [{
    id: '68',
    file_name: 'USNR_STYLE_ILL_V1_lokr3-000024.safetensors',
    weight: 1,
    trigger_words: ['usnr'],
  }],
}

describe('generate_with_comfyui Tool', () => {
  it('derives Run ownership from the current Tool call without a user-triggered Skill invocation', async () => {
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
      { type: 'tool/call', seq: 2, data: { turn: 7, step: 0, callId: 'call_generation_1', name: 'generate_with_comfyui', arguments: '{}' } },
    ]

    await expect(tool.execute(toolArguments, execution(events) as never)).resolves.toEqual({ run_id: 'run_1' })
    expect(acceptGeneration).toHaveBeenCalledWith(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 7, callId: 'call_generation_1' },
      {
        title: '角色立绘',
        instanceId: '2',
        templateId: '34',
        model: {
          id: '1',
          fileName: 'waiIllustriousSDXL_v170.safetensors',
        },
        parameters: { positive_prompt: '1girl' },
        loras: [{
          id: '68',
          fileName: 'USNR_STYLE_ILL_V1_lokr3-000024.safetensors',
          weight: 1,
          triggerWords: ['usnr'],
        }],
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

  it('accepts a Generation Tool call after an Agent-side Skill Tool call without an injected user message', async () => {
    const acceptGeneration = vi.fn(async () => ({ runId: 'run_agent_skill' }))
    const tool = createGenerationTool({
      runtime: { acceptGeneration } as never,
      workspaceRegistry: { resolveByPath: vi.fn(async () => ({ id: 'workspace_1', sessionIds: ['session_1'] })) } as never,
    })
    const events = [
      { type: 'turn/start', seq: 0, data: { turn: 7 } },
      { type: 'tool/call', seq: 1, data: { turn: 7, step: 0, callId: 'call_skill_1', name: 'skill', arguments: '{"name":"comfyui-generate"}' } },
      { type: 'tool/result', seq: 2, data: { turn: 7, step: 0, callId: 'call_skill_1', name: 'skill' } },
      { type: 'tool/call', seq: 3, data: { turn: 7, step: 1, callId: 'call_generation_1', name: 'generate_with_comfyui', arguments: '{}' } },
    ]

    await expect(tool.execute(toolArguments, execution(events) as never)).resolves.toEqual({ run_id: 'run_agent_skill' })
    expect(acceptGeneration).toHaveBeenCalledOnce()
  })

  it('rejects an execution context without the matching Generation Tool call', async () => {
    const acceptGeneration = vi.fn()
    const tool = createGenerationTool({
      runtime: { acceptGeneration } as never,
      workspaceRegistry: { resolveByPath: vi.fn(async () => ({ id: 'workspace_1', sessionIds: ['session_1'] })) } as never,
    })
    const events = [
      { type: 'turn/start', seq: 0, data: { turn: 7 } },
      { type: 'tool/call', seq: 1, data: { turn: 7, step: 0, callId: 'call_other', name: 'generate_with_comfyui', arguments: '{}' } },
    ]

    await expect(tool.execute(toolArguments, execution(events) as never)).rejects.toMatchObject({
      code: 'GENERATION_TOOL_CONTEXT_INVALID',
    })
    expect(acceptGeneration).not.toHaveBeenCalled()
  })

  it('returns a preparation error to the caller so the Agent can correct parameters and call the Tool again', async () => {
    const error = Object.assign(new Error(
      'Generation parameter "sampler_name" for 41:KSampler.sampler_name received "invalid"; allowed values ["euler","lcm"]. Correct the value and call generate_with_comfyui again.',
    ), { code: 'GENERATION_PARAMETER_INVALID' })
    const tool = createGenerationTool({
      runtime: { acceptGeneration: vi.fn(async () => { throw error }) } as never,
      workspaceRegistry: { resolveByPath: vi.fn(async () => ({ id: 'workspace_1', sessionIds: ['session_1'] })) } as never,
    })
    const events = [
      { type: 'turn/start', seq: 0, data: { turn: 7 } },
      { type: 'tool/call', seq: 2, data: { turn: 7, step: 0, callId: 'call_generation_1', name: 'generate_with_comfyui', arguments: '{}' } },
    ]

    await expect(tool.execute(toolArguments, execution(events) as never)).rejects.toBe(error)
  })

  it('uses the template default model when the Tool call omits a selected model', async () => {
    const acceptGeneration = vi.fn(async () => ({ runId: 'run_default_model' }))
    const tool = createGenerationTool({
      runtime: { acceptGeneration } as never,
      workspaceRegistry: {
        resolveByPath: vi.fn(async () => ({ id: 'workspace_1', sessionIds: ['session_1'] })),
      } as never,
    })
    const events = [
      { type: 'turn/start', seq: 0, data: { turn: 7 } },
      { type: 'tool/call', seq: 2, data: { turn: 7, step: 0, callId: 'call_generation_1', name: 'generate_with_comfyui', arguments: '{}' } },
    ]
    const { model: _model, ...withoutModel } = toolArguments

    await tool.execute(withoutModel, execution(events) as never)

    expect(acceptGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ model: null }),
      expect.any(AbortSignal),
    )
  })

  it('creates independent Runs for multiple same-turn Tool calls', async () => {
    const acceptGeneration = vi.fn()
      .mockResolvedValueOnce({ runId: 'run_portrait' })
      .mockResolvedValueOnce({ runId: 'run_landscape' })
    const tool = createGenerationTool({
      runtime: { acceptGeneration } as never,
      workspaceRegistry: {
        resolveByPath: vi.fn(async () => ({ id: 'workspace_1', sessionIds: ['session_1'] })),
      } as never,
    })
    const events = [
      { type: 'turn/start', seq: 0, data: { turn: 8 } },
      { type: 'tool/call', seq: 2, data: { turn: 8, step: 0, callId: 'call_portrait', name: 'generate_with_comfyui', arguments: '{}' } },
      { type: 'tool/result', seq: 3, data: { turn: 8, step: 0, callId: 'call_portrait', name: 'generate_with_comfyui' } },
      { type: 'tool/call', seq: 4, data: { turn: 8, step: 1, callId: 'call_landscape', name: 'generate_with_comfyui', arguments: '{}' } },
    ]
    const portrait = {
      ...toolArguments,
      title: '竖图',
      parameters: { positive_prompt: 'white-haired girl', width: 384, height: 512, seed: 28101 },
    }
    const landscape = {
      ...toolArguments,
      title: '横图',
      parameters: { positive_prompt: 'black-haired girl', width: 512, height: 384, seed: 28102 },
    }

    await expect(tool.execute(portrait, execution(events, 'call_portrait') as never))
      .resolves.toEqual({ run_id: 'run_portrait' })
    await expect(tool.execute(landscape, execution(events, 'call_landscape') as never))
      .resolves.toEqual({ run_id: 'run_landscape' })
    expect(acceptGeneration).toHaveBeenNthCalledWith(1,
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 8, callId: 'call_portrait' },
      expect.objectContaining({ title: '竖图', parameters: portrait.parameters }),
      expect.any(AbortSignal),
    )
    expect(acceptGeneration).toHaveBeenNthCalledWith(2,
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 8, callId: 'call_landscape' },
      expect.objectContaining({ title: '横图', parameters: landscape.parameters }),
      expect.any(AbortSignal),
    )
  })

  it('publishes closed input and output JSON schemas', () => {
    const tool = createGenerationTool({
      runtime: {} as never,
      workspaceRegistry: {} as never,
    })

    expect(tool.parameters).toMatchObject({ type: 'object', additionalProperties: false })
    expect(tool.parameters).toMatchObject({
      properties: {
        model: {
          type: 'object',
          additionalProperties: false,
        },
        loras: {
          type: 'array',
          items: { type: 'object', additionalProperties: false },
        },
      },
    })
    expect(tool.parameters).not.toHaveProperty('lora_applications')
    const parameterSchema = (tool.parameters as { properties: { parameters: { description: string } } }).properties.parameters
    expect(parameterSchema.description).toContain('positive_prompt')
    expect(parameterSchema.description).toContain('sampler_name')
    expect(parameterSchema.description).toContain('batch_size')
    expect(parameterSchema.description).toContain('exact user-supplied Workflow input key')
    expect(parameterSchema.description).not.toContain('template parameter_id')
    expect(tool.output.schema).toMatchObject({ type: 'object', additionalProperties: false, required: ['run_id'] })
  })
})

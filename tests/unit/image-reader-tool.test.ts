import { describe, expect, it, vi } from 'vitest'

import {
  createGenerationRunMediaTool,
  createInspectImageTool,
} from '../../src/host/image-reader/image-reader-tool.ts'

function execution(name: string, events: readonly unknown[], callId: string) {
  return {
    callId,
    rootCallId: callId,
    name,
    arguments: {},
    signal: new AbortController().signal,
    token: Symbol('execution'),
    deferContext: vi.fn(),
    concludeTurn: vi.fn(),
    agent: {
      id: 'session_1',
      session: { id: 'session_1', header: { cwd: '/workspace' }, events },
    },
  }
}

describe('image reader Tools', () => {
  it('resolves multiple run_ids in caller order under current ownership', async () => {
    const readGenerationRunMedia = vi.fn(async () => ({
      runs: [
        {
          run_id: 'run_2', lookup_status: 'available', title: 'title-run_2',
          parameters: { prompt: 'run_2', nested: { weights: [0.4, 0.6] } },
          images: [{ media_id: 'media-2', node_id: '3', output_index: 0, filename: 'run_2.png', media_type: 'image/png', file_path: '/media/run_2.png' }],
        },
        { run_id: 'run_missing', lookup_status: 'error', error: { code: 'GENERATION_RUN_NOT_FOUND', message: 'not found' } },
        {
          run_id: 'run_2', lookup_status: 'available', title: 'title-run_2',
          parameters: { prompt: 'run_2', nested: { weights: [0.4, 0.6] } },
          images: [{ media_id: 'media-2', node_id: '3', output_index: 0, filename: 'run_2.png', media_type: 'image/png', file_path: '/media/run_2.png' }],
        },
      ],
    }))
    const tool = createGenerationRunMediaTool({
      runtime: { readGenerationRunMedia },
      workspaceRegistry: { resolveByPath: vi.fn(async () => ({ id: 'workspace_1', sessionIds: ['session_1'] })) },
    } as never)
    const events = [{
      type: 'tool/call', seq: 1,
      data: { turn: 8, step: 0, callId: 'call_media', name: 'get_generation_run_media', arguments: '{}' },
    }]

    await expect(tool.execute(
      { run_ids: ['run_2', 'run_missing', 'run_2'] },
      execution('get_generation_run_media', events, 'call_media') as never,
    )).resolves.toEqual({
      runs: [
        expect.objectContaining({
          run_id: 'run_2', lookup_status: 'available',
          parameters: { prompt: 'run_2', nested: { weights: [0.4, 0.6] } },
        }),
        { run_id: 'run_missing', lookup_status: 'error', error: { code: 'GENERATION_RUN_NOT_FOUND', message: 'not found' } },
        expect.objectContaining({
          run_id: 'run_2', lookup_status: 'available',
          parameters: { prompt: 'run_2', nested: { weights: [0.4, 0.6] } },
        }),
      ],
    })
    expect(readGenerationRunMedia).toHaveBeenCalledWith({
      workspaceId: 'workspace_1',
      runIds: ['run_2', 'run_missing', 'run_2'],
    }, expect.any(AbortSignal))
  })

  it('rejects an empty run_ids list before runtime access', async () => {
    const readGenerationRunMedia = vi.fn()
    const tool = createGenerationRunMediaTool({ runtime: { readGenerationRunMedia }, workspaceRegistry: {} } as never)
    await expect(tool.execute({ run_ids: [] }, execution('get_generation_run_media', [], 'call_media') as never))
      .rejects.toThrow('between 1 and 20')
    expect(readGenerationRunMedia).not.toHaveBeenCalled()
    await expect(tool.execute(
      { run_ids: Array.from({ length: 21 }, (_, index) => `run_${index}`) },
      execution('get_generation_run_media', [], 'call_media') as never,
    )).rejects.toThrow('between 1 and 20')
    expect(readGenerationRunMedia).not.toHaveBeenCalled()
  })

  it('rejects a mismatched Tool call and a Session without a Workspace', async () => {
    const runtime = { readGenerationRunMedia: vi.fn() }
    const mismatched = createGenerationRunMediaTool({
      runtime,
      workspaceRegistry: { resolveByPath: vi.fn() },
    } as never)
    await expect(mismatched.execute(
      { run_ids: ['run_1'] },
      execution('get_generation_run_media', [{
        type: 'tool/call', seq: 1,
        data: { turn: 1, step: 0, callId: 'call_media', name: 'another_tool', arguments: '{}' },
      }], 'call_media') as never,
    )).rejects.toMatchObject({ code: 'GENERATION_TOOL_CONTEXT_INVALID' })

    const noWorkspace = createGenerationRunMediaTool({
      runtime,
      workspaceRegistry: { resolveByPath: vi.fn(async () => undefined) },
    } as never)
    await expect(noWorkspace.execute(
      { run_ids: ['run_1'] },
      execution('get_generation_run_media', [{
        type: 'tool/call', seq: 1,
        data: { turn: 1, step: 0, callId: 'call_media', name: 'get_generation_run_media', arguments: '{}' },
      }], 'call_media') as never,
    )).rejects.toMatchObject({ code: 'GENERATION_WORKSPACE_REQUIRED' })
    expect(runtime.readGenerationRunMedia).not.toHaveBeenCalled()
  })

  it('inspects exactly one local image with an optional per-call prompt', async () => {
    const inspect = vi.fn(async () => ({
      provider: 'provider-a', model: 'vision-a', filePath: '/media/a.png', observation: '可见一个人物。',
    }))
    const tool = createInspectImageTool({ inspect } as never)

    await expect(tool.execute(
      { file_path: '/media/a.png' },
      execution('inspect_image', [], 'call_inspect') as never,
    )).resolves.toEqual({
      provider: 'provider-a', model: 'vision-a', file_path: '/media/a.png', observation: '可见一个人物。',
    })
    expect(inspect).toHaveBeenLastCalledWith('/media/a.png', {
      prompt: undefined,
      signal: expect.any(AbortSignal),
    })

    await tool.execute(
      { file_path: '/media/a.png', prompt: '只描述可见服饰。' },
      execution('inspect_image', [], 'call_inspect_prompt') as never,
    )
    expect(inspect).toHaveBeenLastCalledWith('/media/a.png', {
      prompt: '只描述可见服饰。',
      signal: expect.any(AbortSignal),
    })
  })

  it('publishes closed command schemas for the Skill CLI contract', () => {
    const media = createGenerationRunMediaTool({ runtime: {}, workspaceRegistry: {} } as never)
    const inspect = createInspectImageTool({} as never)
    expect(media.parameters).toMatchObject({ type: 'object', additionalProperties: false })
    expect(media.output.schema).toMatchObject({ type: 'object', additionalProperties: false, required: ['runs'] })
    expect(inspect.parameters).toMatchObject({ type: 'object', additionalProperties: false })
    expect(inspect.parameters).toMatchObject({
      required: ['file_path'],
      properties: {
        prompt: {
          type: 'string',
          description: expect.stringMatching(/optional|omit|defaultPrompt|this inspection/i),
        },
      },
    })
    expect(inspect.description).toMatch(/optional|omit|defaultPrompt|this inspection/i)
    expect(inspect.output.schema).toMatchObject({ type: 'object', additionalProperties: false, required: ['provider', 'model', 'file_path', 'observation'] })
    expect(media.output.render({}, { runs: [] })).toEqual([{ type: 'text', text: '{"runs":[]}' }])
    expect(inspect.output.render({}, { observation: '可见人物' })).toEqual([
      { type: 'text', text: '{"observation":"可见人物"}' },
    ])
  })
})

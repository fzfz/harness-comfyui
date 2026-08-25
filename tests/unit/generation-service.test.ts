import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'

import { GenerationRemoteService } from '../../src/host/generation/generation-service.ts'

describe('GenerationRemoteService', () => {
  it('returns the specific Run error without artifact paths or ComfyUI credentials', async () => {
    const context = new Context()
    const queryRuns = vi.fn(() => [{
      runId: 'run_1', workspaceId: 'workspace_1', sessionId: 'session_1', turn: 3, callId: 'call_1',
      title: '立绘', instanceId: '2', instanceTitle: 'ComfyUI', templateId: '34', templateTitle: 'Anima',
      status: 'failed' as const, revision: 4, promptId: 'secret-prompt-id',
      errorCode: 'SOURCE_PROTOCOL_ERROR', errorMessage: 'Template Workflow node 6 is invalid.',
      createdAt: 1, updatedAt: 2,
    }])
    const queryMedia = vi.fn(() => [{
      mediaId: 'media_1', runId: 'run_1', workspaceId: 'workspace_1', sessionId: 'session_1', turn: 3,
      nodeId: '9', outputIndex: 0, mediaKind: 'image' as const, filename: 'result.webp', relativePath: 'aa/bb/result.webp',
      mediaType: 'image/webp', byteSize: 12, createdAt: 3,
    }])
    const service = new GenerationRemoteService(context, {
      queryRuns,
      queryMedia,
    }, 1000, {
      list: () => [{ id: 'workspace_1', sessionIds: ['session_1'] }],
    })

    const projection = await service.list(
      { sessionId: 'session_1', turn: null },
      new AbortController().signal,
    )

    expect(projection).toMatchObject({ sessionId: 'session_1', hasActiveRuns: false, refreshAfterMs: 1000 })
    expect(projection.runs[0]).not.toHaveProperty('promptId')
    expect(projection.media[0]).not.toHaveProperty('relativePath')
    expect(JSON.stringify(projection)).not.toContain('secret-prompt-id')
    expect(JSON.stringify(projection)).not.toContain('aa/bb')
    expect(projection.runs[0]).toMatchObject({
      errorCode: 'SOURCE_PROTOCOL_ERROR',
      errorMessage: 'Template Workflow node 6 is invalid.',
    })
    expect(queryRuns).toHaveBeenCalledWith({ workspaceId: 'workspace_1', sessionId: 'session_1', turn: undefined })
    expect(queryMedia).toHaveBeenCalledWith({ workspaceId: 'workspace_1', sessionId: 'session_1', turn: undefined })
    await context.fiber.dispose()
  })
})

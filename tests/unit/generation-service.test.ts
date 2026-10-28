import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'

import { GenerationRemoteService } from '../../src/host/generation/generation-service.ts'

function nativeContext() {
  const context = new Context()
  Object.assign(context, {
    sessionPersistence: { stat: async (id: string) => ({ header: { id, cwd: '/workspace' }, revision: id }) },
    subagents: { listDescendants: async () => [] },
  })
  return context
}

describe('GenerationRemoteService', () => {
  it('returns the specific Run error without artifact paths or ComfyUI credentials', async () => {
    const context = nativeContext()
    const queryRuns = vi.fn(() => [{
      runId: 'run_1', requestId: 'request_1', workspaceId: 'workspace_1', sessionId: 'session_1', turn: 3, callId: 'call_1',
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
      resolveByPath: async () => ({ id: 'workspace_1' }),
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

  it('lists Runs and media from a Session and its same-Workspace descendants only', async () => {
    const context = nativeContext()
    const sessionHeaders = new Map([
      ['session_root', { header: { id: 'session_root', cwd: '/workspace' }, revision: 'rev_root' }],
      ['session_child', { header: { id: 'session_child', cwd: '/workspace' }, revision: 'rev_child' }],
      ['session_grandchild', { header: { id: 'session_grandchild', cwd: '/workspace' }, revision: 'rev_grandchild' }],
      ['session_unrelated', { header: { id: 'session_unrelated', cwd: '/workspace' }, revision: 'rev_unrelated' }],
      ['session_other_workspace', { header: { id: 'session_other_workspace', cwd: '/other' }, revision: 'rev_other' }],
    ])
    const liveSessionGet = vi.fn(() => undefined)
    const stat = vi.fn(async (sessionId: string) => sessionHeaders.get(sessionId))
    Object.assign(context, { sessions: { get: liveSessionGet }, sessionPersistence: { stat }, subagents: {
      listDescendants: async () => ['session_child', 'session_grandchild', 'session_other_workspace'].map(id => ({
        kind: 'child', id, mode: 'continuable', parentId: 'session_root', depth: 1,
      })),
    } })
    const runs = new Map([
      ['session_root', [{ runId: 'run_root', sessionId: 'session_root', createdAt: 1 }]],
      ['session_child', [{ runId: 'run_child', sessionId: 'session_child', createdAt: 2 }]],
      ['session_grandchild', [{ runId: 'run_grandchild', sessionId: 'session_grandchild', createdAt: 3 }]],
      ['session_unrelated', [{ runId: 'run_unrelated', sessionId: 'session_unrelated', createdAt: 4 }]],
      ['session_other_workspace', [{ runId: 'run_other_workspace', sessionId: 'session_other_workspace', createdAt: 5 }]],
    ])
    const media = new Map([
      ['session_root', [{ mediaId: 'media_root', runId: 'run_root', sessionId: 'session_root', createdAt: 1 }]],
      ['session_child', [{ mediaId: 'media_child', runId: 'run_child', sessionId: 'session_child', createdAt: 2 }]],
      ['session_grandchild', [{ mediaId: 'media_grandchild', runId: 'run_grandchild', sessionId: 'session_grandchild', createdAt: 3 }]],
      ['session_unrelated', [{ mediaId: 'media_unrelated', runId: 'run_unrelated', sessionId: 'session_unrelated', createdAt: 4 }]],
      ['session_other_workspace', [{ mediaId: 'media_other_workspace', runId: 'run_other_workspace', sessionId: 'session_other_workspace', createdAt: 5 }]],
    ])
    const queryRuns = vi.fn(({ sessionId }: { readonly sessionId: string }) => runs.get(sessionId) ?? [])
    const queryMedia = vi.fn(({ sessionId }: { readonly sessionId: string }) => media.get(sessionId) ?? [])
    const service = new GenerationRemoteService(context, { queryRuns, queryMedia } as never, 1000, {
      resolveByPath: async path => ({ id: path === '/other' ? 'workspace_2' : 'workspace_1' }),
    })

    const projection = await service.list(
      { sessionId: 'session_root', turn: null },
      new AbortController().signal,
    )

    expect(projection.runs.map(run => run.runId)).toEqual(['run_grandchild', 'run_child', 'run_root'])
    expect(projection.media.map(item => item.mediaId)).toEqual(['media_grandchild', 'media_child', 'media_root'])
    expect(queryRuns.mock.calls.map(([query]) => query.sessionId)).toEqual([
      'session_root', 'session_child', 'session_grandchild',
    ])
    expect(queryMedia.mock.calls.map(([query]) => query.sessionId)).toEqual([
      'session_root', 'session_child', 'session_grandchild',
    ])
    expect(stat).toHaveBeenCalled()
    expect(liveSessionGet).not.toHaveBeenCalled()
    await context.fiber.dispose()
  })

  it('denies descendants with missing durable metadata before querying Run data', async () => {
    const context = nativeContext()
    const stat = vi.fn(async (id: string) => id === 'session_root' ? { header: { id, cwd: '/workspace' }, revision: id } : undefined)
    Object.assign(context, { sessionPersistence: { stat }, subagents: {
      listDescendants: async () => [{ kind: 'child', id: 'session_child', mode: 'continuable', parentId: 'session_root', depth: 1 }],
    } })
    const queryRuns = vi.fn(() => [])
    const queryMedia = vi.fn(() => [])
    const service = new GenerationRemoteService(context, { queryRuns, queryMedia } as never, 1000, {
      resolveByPath: async () => ({ id: 'workspace_1' }),
    })

    await expect(service.list(
      { sessionId: 'session_root', turn: null },
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'GENERATION_SESSION_UNAVAILABLE' })
    expect(stat).toHaveBeenCalledWith('session_child', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(queryRuns).not.toHaveBeenCalled()
    expect(queryMedia).not.toHaveBeenCalled()
    await context.fiber.dispose()
  })

  it('propagates durable metadata failures before querying Run data', async () => {
    const context = nativeContext()
    Object.assign(context, {
      sessionPersistence: {
        stat: async () => { throw new Error('Durable Session metadata unavailable') },
      },
    })
    const queryRuns = vi.fn(() => [])
    const queryMedia = vi.fn(() => [])
    const service = new GenerationRemoteService(context, { queryRuns, queryMedia } as never, 1000, {
      resolveByPath: async () => ({ id: 'workspace_1' }),
    })

    await expect(service.list(
      { sessionId: 'session_root', turn: null },
      new AbortController().signal,
    )).rejects.toThrow('Durable Session metadata unavailable')
    expect(queryRuns).not.toHaveBeenCalled()
    expect(queryMedia).not.toHaveBeenCalled()
    await context.fiber.dispose()
  })

  it('passes cancellation to durable metadata reads and stops before querying Run data', async () => {
    const context = nativeContext()
    let startStat!: () => void
    let finishStat!: (snapshot: { header: { id: string; cwd: string }; revision: string }) => void
    const statStarted = new Promise<void>(resolve => { startStat = resolve })
    const pendingStat = new Promise<{ header: { id: string; cwd: string }; revision: string }>(resolve => {
      finishStat = resolve
    })
    const stat = vi.fn((_sessionId: string, options?: { signal?: AbortSignal }) => {
      expect(options?.signal).toBe(controller.signal)
      startStat()
      return pendingStat
    })
    Object.assign(context, { sessionPersistence: { stat } })
    const queryRuns = vi.fn(() => [])
    const queryMedia = vi.fn(() => [])
    const service = new GenerationRemoteService(context, { queryRuns, queryMedia } as never, 1000, {
      resolveByPath: async () => ({ id: 'workspace_1' }),
    })
    const controller = new AbortController()

    const listing = service.list({ sessionId: 'session_root', turn: null }, controller.signal)
    await statStarted
    controller.abort()
    finishStat({ header: { id: 'session_child', cwd: '/workspace' }, revision: 'rev_child' })

    await expect(listing).rejects.toMatchObject({ name: 'AbortError' })
    expect(queryRuns).not.toHaveBeenCalled()
    expect(queryMedia).not.toHaveBeenCalled()
    await context.fiber.dispose()
  })
})

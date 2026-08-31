import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'

import { afterEach, describe, expect, it } from 'vitest'

import { GenerationRuntimeError } from '../../src/host/generation/generation-runtime.ts'
import { registerGenerationMediaRoutes } from '../../src/host/generation/media-routes.ts'

const temporaryDirectories: string[] = []

function viewerData(html: string): unknown {
  const match = html.match(/<script id="media-viewer-data" type="application\/json">(?<data>[^<]*)<\/script>/u)
  if (match?.groups?.data === undefined) throw new Error('media viewer startup data is missing')
  return JSON.parse(match.groups.data) as unknown
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('Generation media HTTP routes', () => {
  it('serves a same-Session media viewer with ordered minimal data and locked response headers', async () => {
    const media = [
      {
        mediaId: 'media_new', runId: 'run_new', workspaceId: 'workspace_1', sessionId: 'session_1', turn: 4,
        nodeId: '10', outputIndex: 1, mediaKind: 'image' as const, filename: 'new.webp', relativePath: 'private/new.webp',
        mediaType: 'image/webp', byteSize: 100, createdAt: 1_725_000_000_000,
      },
      {
        mediaId: 'media_new_second', runId: 'run_new', workspaceId: 'workspace_1', sessionId: 'session_1', turn: 4,
        nodeId: '10', outputIndex: 0, mediaKind: 'image' as const, filename: 'new-second.webp', relativePath: 'private/new-second.webp',
        mediaType: 'image/webp', byteSize: 90, createdAt: 1_725_000_000_000,
      },
      {
        mediaId: 'media_old', runId: 'run_old', workspaceId: 'workspace_1', sessionId: 'session_1', turn: 3,
        nodeId: '11', outputIndex: 0, mediaKind: 'video' as const, filename: 'old.mp4', relativePath: 'private/old.mp4',
        mediaType: 'video/mp4', byteSize: 200, createdAt: 1_724_999_000_000,
      },
    ]
    let handler: ((request: IncomingMessage, response: ServerResponse) => void | Promise<void>) | undefined
    const promptLookups: string[] = []
    registerGenerationMediaRoutes({
      webServer: {
        register(route) {
          handler = route.handler
          return () => undefined
        },
      },
      runtime: {
        getMedia: mediaId => media.find(item => item.mediaId === mediaId)!,
        queryMedia: () => media,
        positivePromptForRun: runId => {
          promptLookups.push(runId)
          return runId === 'run_new' ? 'new prompt' : null
        },
        mediaContentPath: () => { throw new Error('content path is not used by the viewer') },
        mediaRunId: () => { throw new Error('Run lookup is not used by the viewer') },
        actualWorkflowPath: () => { throw new Error('Workflow path is not used by the viewer') },
      },
      workspaceRegistry: { list: () => [{ id: 'workspace_1', sessionIds: ['session_1'] }] },
    })
    const server = createServer((request, response) => void handler!(request, response))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('test server address is unavailable')

    const response = await fetch(`http://127.0.0.1:${address.port}/api/harness-comfyui/media/media_old/view?session_id=session_1`)
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('content-security-policy')).toBe(
      "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'; form-action 'none'",
    )
    expect(viewerData(html)).toEqual({
      currentMediaId: 'media_old',
      items: [
        {
          mediaId: 'media_new', runId: 'run_new', mediaKind: 'image', filename: 'new.webp', createdAt: 1_725_000_000_000,
          contentUrl: '/api/harness-comfyui/media/media_new/content?session_id=session_1',
          viewerUrl: '/api/harness-comfyui/media/media_new/view?session_id=session_1', positivePrompt: 'new prompt',
        },
        {
          mediaId: 'media_new_second', runId: 'run_new', mediaKind: 'image', filename: 'new-second.webp', createdAt: 1_725_000_000_000,
          contentUrl: '/api/harness-comfyui/media/media_new_second/content?session_id=session_1',
          viewerUrl: '/api/harness-comfyui/media/media_new_second/view?session_id=session_1', positivePrompt: 'new prompt',
        },
        {
          mediaId: 'media_old', runId: 'run_old', mediaKind: 'video', filename: 'old.mp4', createdAt: 1_724_999_000_000,
          contentUrl: '/api/harness-comfyui/media/media_old/content?session_id=session_1',
          viewerUrl: '/api/harness-comfyui/media/media_old/view?session_id=session_1', positivePrompt: null,
        },
      ],
    })
    expect(promptLookups).toEqual(['run_new', 'run_old'])
    expect(html).not.toContain('private/old.mp4')
    expect(html).not.toContain('workspace_1')
    expect(html).not.toContain('request_json')
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })

  it('downloads the original media bytes with a safe UTF-8 attachment filename', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-download-route-'))
    temporaryDirectories.push(root)
    const mediaPath = join(root, 'saved-media.bin')
    const mediaBytes = Buffer.from([0, 1, 2, 127, 128, 255])
    const filename = `原 文件\"双引号'单引号!'()*\r\n.webp`
    writeFileSync(mediaPath, mediaBytes)
    let handler: ((request: IncomingMessage, response: ServerResponse) => void | Promise<void>) | undefined
    registerGenerationMediaRoutes({
      webServer: {
        register(route) {
          handler = route.handler
          return () => undefined
        },
      },
      runtime: {
        getMedia: () => ({
          mediaId: 'media_download', runId: 'run_1', workspaceId: 'workspace_1', sessionId: 'session_1',
          filename, mediaType: 'image/webp',
        }),
        mediaContentPath: () => mediaPath,
      } as never,
      workspaceRegistry: { list: () => [{ id: 'workspace_1', sessionIds: ['session_1'] }] },
    })
    const server = createServer((request, response) => void handler!(request, response))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('test server address is unavailable')

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/harness-comfyui/media/media_download/download?session_id=session_1`,
    )

    expect(response.status).toBe(200)
    expect(Buffer.from(await response.arrayBuffer())).toEqual(mediaBytes)
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect(response.headers.get('content-length')).toBe(String(mediaBytes.length))
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename*=UTF-8''%E5%8E%9F%20%E6%96%87%E4%BB%B6%22%E5%8F%8C%E5%BC%95%E5%8F%B7%27%E5%8D%95%E5%BC%95%E5%8F%B7%21%27%28%29%2A%0D%0A.webp`,
    )
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })

  it('rejects invalid download access and reports download file failures', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-download-errors-'))
    temporaryDirectories.push(root)
    const missingMediaPath = join(root, 'missing.webp')
    const media = {
      mediaId: 'media_download', runId: 'run_1', workspaceId: 'workspace_1', sessionId: 'session_1',
      filename: 'result.webp', mediaType: 'image/webp',
    }
    let handler: ((request: IncomingMessage, response: ServerResponse) => void | Promise<void>) | undefined
    registerGenerationMediaRoutes({
      webServer: {
        register(route) {
          handler = route.handler
          return () => undefined
        },
      },
      runtime: {
        getMedia: (mediaId: string) => {
          if (mediaId === 'boom') throw new Error('broken storage')
          return media
        },
        mediaContentPath: () => missingMediaPath,
      } as never,
      workspaceRegistry: {
        list: () => [
          { id: 'workspace_1', sessionIds: ['session_1', 'session_wrong_same_workspace'] },
          { id: 'workspace_2', sessionIds: ['session_other_workspace'] },
        ],
      },
    })
    const server = createServer((request, response) => void handler!(request, response))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('test server address is unavailable')
    const route = `http://127.0.0.1:${address.port}/api/harness-comfyui/media/media_download/download`

    const [
      wrongSession,
      wrongWorkspace,
      missingSession,
      emptySession,
      oversizedSession,
      unregisteredSession,
      missingMediaFile,
      methodRejected,
      internalFailure,
    ] = await Promise.all([
      fetch(`${route}?session_id=session_wrong_same_workspace`),
      fetch(`${route}?session_id=session_other_workspace`),
      fetch(route),
      fetch(`${route}?session_id=`),
      fetch(`${route}?session_id=${'s'.repeat(10_001)}`),
      fetch(`${route}?session_id=session_unregistered`),
      fetch(`${route}?session_id=session_1`),
      fetch(`${route}?session_id=session_1`, { method: 'POST' }),
      fetch(`http://127.0.0.1:${address.port}/api/harness-comfyui/media/boom/download?session_id=session_1`),
    ])

    expect(wrongSession.status).toBe(404)
    expect(wrongWorkspace.status).toBe(404)
    expect(missingSession.status).toBe(404)
    expect(emptySession.status).toBe(404)
    expect(oversizedSession.status).toBe(404)
    expect(unregisteredSession.status).toBe(404)
    expect(missingMediaFile.status).toBe(404)
    expect(await missingMediaFile.json()).toEqual({ code: 'GENERATION_MEDIA_NOT_FOUND' })
    expect(methodRejected.status).toBe(405)
    expect(methodRejected.headers.get('allow')).toBe('GET')
    expect(internalFailure.status).toBe(500)
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })

  it('destroys a download response when the media stream fails after headers are sent', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-download-stream-'))
    temporaryDirectories.push(root)
    const mediaPath = join(root, 'saved-media.webp')
    writeFileSync(mediaPath, Buffer.alloc(1024, 1))
    const streamError = new Error('download stream interrupted')

    class FailingResponse extends Writable {
      statusCode = 0
      readonly destroyErrors: Array<Error | undefined> = []
      readonly headers = new Map<string, number | string | readonly string[]>()
      private sent = false

      get headersSent(): boolean {
        return this.sent
      }

      setHeader(name: string, value: number | string | readonly string[]): this {
        this.headers.set(name.toLowerCase(), value)
        return this
      }

      override _write(_chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        this.sent = true
        callback(streamError)
      }

      override destroy(error?: Error): this {
        this.destroyErrors.push(error)
        return super.destroy(error)
      }
    }

    let handler: ((request: IncomingMessage, response: ServerResponse) => void | Promise<void>) | undefined
    registerGenerationMediaRoutes({
      webServer: {
        register(route) {
          handler = route.handler
          return () => undefined
        },
      },
      runtime: {
        getMedia: () => ({
          mediaId: 'media_download', runId: 'run_1', workspaceId: 'workspace_1', sessionId: 'session_1',
          filename: 'result.webp', mediaType: 'image/webp',
        }),
        mediaContentPath: () => mediaPath,
      } as never,
      workspaceRegistry: { list: () => [{ id: 'workspace_1', sessionIds: ['session_1'] }] },
    })
    const response = new FailingResponse()

    await handler!(
      { method: 'GET', url: '/api/harness-comfyui/media/media_download/download?session_id=session_1' } as IncomingMessage,
      response as unknown as ServerResponse,
    )

    expect(response.headersSent).toBe(true)
    expect(response.statusCode).toBe(200)
    expect(response.destroyErrors.filter(error => error === streamError).length).toBeGreaterThanOrEqual(2)
  })

  it('serves each media file and the Actual Workflow of that media own Run', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-routes-'))
    temporaryDirectories.push(root)
    const paths = {
      media_a: join(root, 'media-a.webp'),
      media_b: join(root, 'media-b.webp'),
      run_a: join(root, 'run-a.json'),
      run_b: join(root, 'run-b.json'),
      missing_media: join(root, 'missing-media.webp'),
      missing_workflow: join(root, 'missing-workflow.json'),
    }
    writeFileSync(paths.media_a, 'media-a')
    writeFileSync(paths.media_b, 'media-b')
    writeFileSync(paths.run_a, '{"run":"a"}\n')
    writeFileSync(paths.run_b, '{"run":"b"}\n')
    const media = {
      media_a: { mediaId: 'media_a', runId: 'run_a', workspaceId: 'workspace_1', sessionId: 'session_1', filename: 'media-a.webp', mediaType: 'image/webp' },
      media_b: { mediaId: 'media_b', runId: 'run_b', workspaceId: 'workspace_1', sessionId: 'session_1', filename: 'media-b.webp', mediaType: 'image/webp' },
      missing_media: { mediaId: 'missing_media', runId: 'run_a', workspaceId: 'workspace_1', sessionId: 'session_1', filename: 'missing-media.webp', mediaType: 'image/webp' },
      missing_workflow: { mediaId: 'missing_workflow', runId: 'missing_workflow', workspaceId: 'workspace_1', sessionId: 'session_1', filename: 'media-b.webp', mediaType: 'image/webp' },
      workflow_not_ready: { mediaId: 'workflow_not_ready', runId: 'workflow_not_ready', workspaceId: 'workspace_1', sessionId: 'session_1', filename: 'media-b.webp', mediaType: 'image/webp' },
    }
    let handler: ((request: IncomingMessage, response: ServerResponse) => void | Promise<void>) | undefined
    registerGenerationMediaRoutes({
      webServer: {
        register(route) {
          handler = route.handler
          return () => undefined
        },
      },
      runtime: {
        getMedia: (mediaId: string) => {
          if (mediaId === 'missing') throw new GenerationRuntimeError('GENERATION_MEDIA_NOT_FOUND', 'missing')
          if (mediaId === 'boom') throw new Error('broken storage')
          return media[mediaId as keyof typeof media] as never
        },
        mediaContentPath: (mediaId: string) => paths[mediaId as 'media_a' | 'media_b' | 'missing_media'],
        mediaRunId: (mediaId: string) => media[mediaId as keyof typeof media].runId,
        actualWorkflowPath: (runId: string) => {
          if (runId === 'workflow_not_ready') {
            throw new GenerationRuntimeError('GENERATION_ARTIFACT_NOT_READY', 'not ready')
          }
          return paths[runId as 'run_a' | 'run_b' | 'missing_workflow']
        },
      } as never,
      workspaceRegistry: {
        list: () => [
          { id: 'workspace_1', sessionIds: ['session_1'] },
          { id: 'workspace_2', sessionIds: ['session_2'] },
        ],
      },
    })
    const server = createServer((request, response) => void handler!(request, response))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('test server address is unavailable')
    const origin = `http://127.0.0.1:${address.port}`

    const [content, workflowA, workflowB] = await Promise.all([
      fetch(`${origin}/api/harness-comfyui/media/media_a/content?session_id=session_1`),
      fetch(`${origin}/api/harness-comfyui/media/media_a/workflow?session_id=session_1`),
      fetch(`${origin}/api/harness-comfyui/media/media_b/workflow?session_id=session_1`),
    ])

    expect(await content.text()).toBe('media-a')
    expect(content.headers.get('content-type')).toBe('image/webp')
    expect(await workflowA.json()).toEqual({ run: 'a' })
    expect(workflowA.headers.get('content-disposition')).toContain('comfyui-run-run_a-workflow.json')
    expect(await workflowB.json()).toEqual({ run: 'b' })
    const [methodRejected, routeMissing, mediaMissing, missingMediaFile, missingWorkflowFile, workflowNotReady, internalFailure] = await Promise.all([
      fetch(`${origin}/api/harness-comfyui/media/media_a/content?session_id=session_1`, { method: 'POST' }),
      fetch(`${origin}/api/harness-comfyui/media/not-a-media-route`),
      fetch(`${origin}/api/harness-comfyui/media/missing/content?session_id=session_1`),
      fetch(`${origin}/api/harness-comfyui/media/missing_media/content?session_id=session_1`),
      fetch(`${origin}/api/harness-comfyui/media/missing_workflow/workflow?session_id=session_1`),
      fetch(`${origin}/api/harness-comfyui/media/workflow_not_ready/workflow?session_id=session_1`),
      fetch(`${origin}/api/harness-comfyui/media/boom/content?session_id=session_1`),
    ])
    expect(methodRejected.status).toBe(405)
    expect(methodRejected.headers.get('allow')).toBe('GET')
    expect(routeMissing.status).toBe(404)
    expect(mediaMissing.status).toBe(404)
    expect(await mediaMissing.json()).toEqual({ code: 'GENERATION_MEDIA_NOT_FOUND' })
    expect(missingMediaFile.status).toBe(404)
    expect(await missingMediaFile.json()).toEqual({ code: 'GENERATION_MEDIA_NOT_FOUND' })
    expect(missingWorkflowFile.status).toBe(404)
    expect(await missingWorkflowFile.json()).toEqual({ code: 'GENERATION_ARTIFACT_NOT_FOUND' })
    expect(workflowNotReady.status).toBe(409)
    expect(await workflowNotReady.json()).toEqual({ code: 'GENERATION_ARTIFACT_NOT_READY' })
    expect(internalFailure.status).toBe(500)
    const [missingSession, wrongWorkspace, missingViewer, wrongWorkspaceViewer] = await Promise.all([
      fetch(`${origin}/api/harness-comfyui/media/media_a/content`),
      fetch(`${origin}/api/harness-comfyui/media/media_a/content?session_id=session_2`),
      fetch(`${origin}/api/harness-comfyui/media/missing/view?session_id=session_1`),
      fetch(`${origin}/api/harness-comfyui/media/media_a/view?session_id=session_2`),
    ])
    expect(missingSession.status).toBe(404)
    expect(wrongWorkspace.status).toBe(404)
    expect(missingViewer.status).toBe(404)
    expect(wrongWorkspaceViewer.status).toBe(404)
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })
})

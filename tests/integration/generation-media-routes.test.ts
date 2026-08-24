import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { GenerationRuntimeError } from '../../src/host/generation/generation-runtime.ts'
import { registerGenerationMediaRoutes } from '../../src/host/generation/media-routes.ts'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('Generation media HTTP routes', () => {
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
    const [missingSession, wrongWorkspace] = await Promise.all([
      fetch(`${origin}/api/harness-comfyui/media/media_a/content`),
      fetch(`${origin}/api/harness-comfyui/media/media_a/content?session_id=session_2`),
    ])
    expect(missingSession.status).toBe(404)
    expect(wrongWorkspace.status).toBe(404)
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })
})

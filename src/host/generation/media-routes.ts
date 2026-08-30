import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { pipeline } from 'node:stream/promises'

import {
  GENERATION_MEDIA_URL_PREFIX,
  generationMediaContentUrl,
  generationMediaViewerUrl,
} from '../../generation/contract.ts'
import { GenerationRuntimeError, type GenerationRuntime } from './generation-runtime.ts'
import {
  renderGenerationMediaViewerPage,
  type GenerationMediaViewerItem,
} from './media-viewer-page.ts'
import { workspaceIdForSession, type WorkspaceRegistryProjection } from './workspace-access.ts'

export const GENERATION_MEDIA_ROUTE_PREFIX = GENERATION_MEDIA_URL_PREFIX

const MEDIA_VIEWER_CONTENT_SECURITY_POLICY = "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'; form-action 'none'"

export interface GenerationWebServer {
  register(route: {
    readonly kind: 'prefix'
    readonly path: string
    readonly handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
  }): () => void
}

export interface RegisterGenerationMediaRoutesOptions {
  readonly webServer: GenerationWebServer
  readonly runtime: Pick<GenerationRuntime,
    'getMedia' | 'queryMedia' | 'positivePromptForRun' | 'mediaContentPath' | 'mediaRunId' | 'actualWorkflowPath'>
  readonly workspaceRegistry: WorkspaceRegistryProjection
}

function send(response: ServerResponse, status: number, message: string): void {
  response.statusCode = status
  response.setHeader('content-type', 'text/plain; charset=utf-8')
  response.end(message)
}

function sendError(response: ServerResponse, status: number, code: string): void {
  const body = JSON.stringify({ code })
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('content-length', String(Buffer.byteLength(body)))
  response.setHeader('x-content-type-options', 'nosniff')
  response.end(body)
}

function sendViewerPage(response: ServerResponse, body: string): void {
  response.statusCode = 200
  response.setHeader('content-type', 'text/html; charset=utf-8')
  response.setHeader('content-length', String(Buffer.byteLength(body)))
  response.setHeader('cache-control', 'no-store')
  response.setHeader('x-content-type-options', 'nosniff')
  response.setHeader('referrer-policy', 'no-referrer')
  response.setHeader('content-security-policy', MEDIA_VIEWER_CONTENT_SECURITY_POLICY)
  response.end(body)
}

function attachment(filename: string): string {
  return `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

async function streamFile(
  response: ServerResponse,
  path: string,
  contentType: string,
  disposition: string,
  missingCode: 'GENERATION_MEDIA_NOT_FOUND' | 'GENERATION_ARTIFACT_NOT_FOUND',
): Promise<void> {
  let facts
  try {
    facts = await stat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new GenerationRuntimeError(missingCode, 'Generation file was not found.')
    }
    throw error
  }
  if (!facts.isFile()) throw new GenerationRuntimeError(missingCode, 'Generation path is not a file.')
  response.statusCode = 200
  response.setHeader('content-type', contentType)
  response.setHeader('content-length', String(facts.size))
  response.setHeader('content-disposition', disposition)
  response.setHeader('x-content-type-options', 'nosniff')
  await pipeline(createReadStream(path), response)
}

export function registerGenerationMediaRoutes(options: RegisterGenerationMediaRoutesOptions): () => void {
  return options.webServer.register({
    kind: 'prefix',
    path: GENERATION_MEDIA_ROUTE_PREFIX,
    async handler(request, response) {
      if (request.method !== 'GET') {
        response.setHeader('allow', 'GET')
        send(response, 405, 'Method Not Allowed')
        return
      }
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      const pathname = url.pathname
      const match = pathname.match(new RegExp(`^${GENERATION_MEDIA_ROUTE_PREFIX}/([A-Za-z0-9_-]{1,128})/(content|workflow|view)$`, 'u'))
      if (match === null) {
        send(response, 404, 'Not Found')
        return
      }
      const mediaId = match[1]!
      try {
        const sessionId = url.searchParams.get('session_id')
        if (sessionId === null || sessionId.length === 0 || sessionId.length > 10_000) {
          send(response, 404, 'Not Found')
          return
        }
        const workspaceId = workspaceIdForSession(options.workspaceRegistry, sessionId)
        const media = options.runtime.getMedia(mediaId)
        if (media.workspaceId !== workspaceId || media.sessionId !== sessionId) {
          send(response, 404, 'Not Found')
          return
        }
        if (match[2] === 'view') {
          const sessionMedia = options.runtime.queryMedia({ workspaceId, sessionId })
          const positivePrompts = new Map(
            [...new Set(sessionMedia.map(item => item.runId))]
              .map(runId => [runId, options.runtime.positivePromptForRun(runId)] as const),
          )
          const items: readonly GenerationMediaViewerItem[] = sessionMedia.map(item => Object.freeze({
              mediaId: item.mediaId,
              runId: item.runId,
              mediaKind: item.mediaKind,
              filename: item.filename,
              createdAt: item.createdAt,
              contentUrl: generationMediaContentUrl(item.mediaId, sessionId),
              viewerUrl: generationMediaViewerUrl(item.mediaId, sessionId),
              positivePrompt: positivePrompts.get(item.runId)!,
            }))
          sendViewerPage(response, renderGenerationMediaViewerPage({ items, currentMediaId: mediaId }))
          return
        }
        if (match[2] === 'content') {
          await streamFile(
            response,
            options.runtime.mediaContentPath(mediaId),
            media.mediaType,
            `inline; filename*=UTF-8''${encodeURIComponent(media.filename)}`,
            'GENERATION_MEDIA_NOT_FOUND',
          )
          return
        }
        const runId = options.runtime.mediaRunId(mediaId)
        await streamFile(
          response,
          options.runtime.actualWorkflowPath(runId),
          'application/json; charset=utf-8',
          attachment(`comfyui-run-${runId}-workflow.json`),
          'GENERATION_ARTIFACT_NOT_FOUND',
        )
      } catch (error) {
        if (response.headersSent) {
          response.destroy(error instanceof Error ? error : undefined)
          return
        }
        if (error instanceof GenerationRuntimeError) {
          const status = {
            GENERATION_ARTIFACT_NOT_FOUND: 404,
            GENERATION_ARTIFACT_NOT_READY: 409,
            GENERATION_MEDIA_NOT_FOUND: 404,
            GENERATION_RUN_NOT_FOUND: 404,
            GENERATION_SESSION_NOT_FOUND: 404,
          }[error.code]
          if (status !== undefined) {
            sendError(response, status, error.code)
            return
          }
        }
        send(response, 500, 'Internal Server Error')
      }
    },
  })
}

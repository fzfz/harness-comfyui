import type { IncomingMessage, ServerResponse } from 'node:http'
import { dispatch } from './dispatch.ts'

import {
  CLI_MAX_BODY_BYTES,
  CLI_ROUTE_PATH,
  parseCliRequest
} from '../../cli/contract.ts'
import { CatalogCliError } from '../catalog/catalog-cli.ts'
import {
  GenerationRuntimeError
} from '../generation/generation-runtime.ts'
import { ImageReaderError } from '../image-reader/errors.ts'

import type { CliHandlerOptions } from './schema.ts'

interface CliErrorBody {
  readonly code: string
  readonly message: string
}

class CliHttpError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'CliHttpError'
    this.status = status
    this.code = code
  }
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('content-length', String(Buffer.byteLength(body)))
  response.setHeader('x-content-type-options', 'nosniff')
  response.end(body)
}

function sendSuccess(response: ServerResponse, data: unknown): void {
  sendJson(response, 200, { ok: true, data })
}

function sendFailure(response: ServerResponse, status: number, error: CliErrorBody): void {
  sendJson(response, status, { ok: false, error })
}

function bearerCapability(request: IncomingMessage): string {
  const authorization = request.headers.authorization
  const match = typeof authorization === 'string' ? authorization.match(/^Bearer ([A-Za-z0-9_-]{1,512})$/u) : null
  if (match === null) {
    throw new CliHttpError(
      401,
      'CLI_CAPABILITY_INVALID',
      'The shell-call capability is missing, expired, or invalid.',
    )
  }
  return match[1]!
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') {
    throw new CliHttpError(415, 'CLI_CONTENT_TYPE_INVALID', 'The CLI request content type must be application/json.')
  }
  const declaredLength = Number(request.headers['content-length'])
  if (Number.isFinite(declaredLength) && declaredLength > CLI_MAX_BODY_BYTES) {
    throw new CliHttpError(413, 'CLI_REQUEST_TOO_LARGE', 'The CLI request body exceeds the maximum size.')
  }
  const chunks: Buffer[] = []
  let byteLength = 0
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk)
    byteLength += bytes.length
    if (byteLength > CLI_MAX_BODY_BYTES) {
      throw new CliHttpError(413, 'CLI_REQUEST_TOO_LARGE', 'The CLI request body exceeds the maximum size.')
    }
    chunks.push(bytes)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new CliHttpError(400, 'CLI_REQUEST_INVALID', 'The CLI request body must contain one JSON object.')
  }
}

function reportedError(error: unknown): { readonly status: number; readonly error: CliErrorBody } {
  if (error instanceof CliHttpError) {
    return { status: error.status, error: { code: error.code, message: error.message } }
  }
  if (error instanceof TypeError) {
    return { status: 400, error: { code: 'CLI_REQUEST_INVALID', message: error.message } }
  }
  if (error instanceof CatalogCliError) {
    return { status: 502, error: { code: error.code, message: error.message } }
  }
  if (error instanceof GenerationRuntimeError) {
    return { status: 409, error: { code: error.code, message: error.message } }
  }
  if (error instanceof ImageReaderError) {
    return { status: 409, error: { code: error.code, message: error.message } }
  }
  return {
    status: 500,
    error: { code: 'CLI_INTERNAL_ERROR', message: 'The Harness ComfyUI CLI request failed inside the Host.' },
  }
}

export function createCliHandler(options: CliHandlerOptions) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== 'POST') {
      response.setHeader('allow', 'POST')
      sendFailure(response, 405, { code: 'CLI_METHOD_INVALID', message: 'The managed CLI endpoint accepts POST requests.' })
      return
    }
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (url.pathname !== CLI_ROUTE_PATH || url.search.length > 0) {
      sendFailure(response, 404, { code: 'CLI_ROUTE_NOT_FOUND', message: 'The managed CLI route was not found.' })
      return
    }
    const abortController = new AbortController()
    const abortRequest = abortController.abort.bind(abortController)
    const abortClosedResponse = abortIncompleteCliResponse.bind(undefined, response, abortController)
    request.once('aborted', abortRequest)
    response.once('close', abortClosedResponse)
    try {
      const capability = bearerCapability(request)
      const identity = options.capabilities.authorize(capability)
      if (identity === undefined) {
        throw new CliHttpError(
          401,
          'CLI_CAPABILITY_INVALID',
          'The shell-call capability is missing, expired, or invalid.',
        )
      }
      const cliRequest = parseCliRequest(await readJsonBody(request))
      const data = await dispatch(options, identity, cliRequest, abortController.signal)
      sendSuccess(response, data)
    } catch (error) {
      if (response.destroyed || response.writableEnded) return
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined)
        return
      }
      const report = reportedError(error)
      sendFailure(response, report.status, report.error)
    } finally {
      request.removeListener('aborted', abortRequest)
      response.removeListener('close', abortClosedResponse)
    }
  }
}

export function abortIncompleteCliResponse(
  response: Pick<ServerResponse, 'writableEnded'>,
  abortController: AbortController,
): void {
  if (!response.writableEnded) abortController.abort()
}

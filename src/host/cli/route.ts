import type { IncomingMessage, ServerResponse } from 'node:http'

import {
  CLI_MAX_BODY_BYTES,
  CLI_ROUTE_PATH,
  parseCliRequest,
  toGenerationRequest,
  type CliRequest,
} from '../../cli/contract.ts'
import {
  CATALOG_COMFYUI_INSTANCE_QUERY,
  type CatalogComfyuiInstancePage,
  type CatalogPage,
  type CatalogQueryRequest,
  type CatalogResolvedGenerationModel,
  type CatalogResolvedLora,
  type CatalogResolvedTemplate,
} from '../../catalog/contract.ts'
import { CatalogCliError } from '../catalog/catalog-cli.ts'
import {
  GenerationRuntimeError,
  type GenerationRuntime,
} from '../generation/generation-runtime.ts'
import type { GenerationWebServer } from '../generation/media-routes.ts'
import type {
  CliExecutionIdentity,
  CliShellCapabilityStore,
} from './shell-capability.ts'

interface CliCatalog {
  resolveTemplate(id: string, signal: AbortSignal): Promise<CatalogResolvedTemplate>
  resolveGenerationModel(id: string, signal: AbortSignal): Promise<CatalogResolvedGenerationModel>
  resolveLora(id: string, signal: AbortSignal): Promise<CatalogResolvedLora>
  queryComfyuiInstances(
    input: typeof CATALOG_COMFYUI_INSTANCE_QUERY,
    signal: AbortSignal,
  ): Promise<CatalogComfyuiInstancePage>
  search(input: CatalogQueryRequest, signal: AbortSignal): Promise<CatalogPage>
}

export interface RegisterHarnessComfyuiCliRouteOptions {
  readonly webServer: GenerationWebServer
  readonly capabilities: Pick<CliShellCapabilityStore, 'authorize'>
  readonly catalog: CliCatalog
  readonly runtime: Pick<GenerationRuntime, 'acceptGeneration'>
  readonly workspaceRegistry: {
    resolveByPath(path: string): Promise<{
      readonly id: string | number
      readonly sessionIds: readonly (string | number)[]
    } | undefined>
  }
}

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

async function generationIdentity(
  options: RegisterHarnessComfyuiCliRouteOptions,
  identity: CliExecutionIdentity,
) {
  const workspace = await options.workspaceRegistry.resolveByPath(identity.cwd)
  if (
    workspace === undefined
    || !workspace.sessionIds.some(sessionId => String(sessionId) === identity.sessionId)
  ) {
    throw new GenerationRuntimeError(
      'GENERATION_WORKSPACE_REQUIRED',
      'The current Session is not attached to a Harness Workspace.',
    )
  }
  return Object.freeze({
    workspaceId: String(workspace.id),
    sessionId: identity.sessionId,
    turn: identity.turn,
    callId: identity.callId,
  })
}

async function dispatch(
  options: RegisterHarnessComfyuiCliRouteOptions,
  identity: CliExecutionIdentity,
  request: CliRequest,
  signal: AbortSignal,
): Promise<unknown> {
  switch (request.command) {
    case 'catalog.template.resolve':
      return options.catalog.resolveTemplate(request.id, signal)
    case 'catalog.generation-model.resolve':
      return options.catalog.resolveGenerationModel(request.id, signal)
    case 'catalog.lora.resolve':
      return options.catalog.resolveLora(request.id, signal)
    case 'catalog.instance.list':
      return options.catalog.queryComfyuiInstances(CATALOG_COMFYUI_INSTANCE_QUERY, signal)
    case 'catalog.search':
      return options.catalog.search({
        kind: request.kind,
        query: request.query,
        page: request.page,
        baseModelId: request.base_model_id,
      }, signal)
    case 'generation.submit': {
      const owner = await generationIdentity(options, identity)
      const accepted = await options.runtime.acceptGeneration(owner, toGenerationRequest(request.request), signal)
      return Object.freeze({ run_id: accepted.runId })
    }
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
  return {
    status: 500,
    error: { code: 'CLI_INTERNAL_ERROR', message: 'The Harness ComfyUI CLI request failed inside the Host.' },
  }
}

export function registerHarnessComfyuiCliRoute(options: RegisterHarnessComfyuiCliRouteOptions): () => void {
  return options.webServer.register({
    kind: 'prefix',
    path: CLI_ROUTE_PATH,
    async handler(request, response) {
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
      request.once('aborted', abortController.abort.bind(abortController))
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
        if (response.headersSent) {
          response.destroy(error instanceof Error ? error : undefined)
          return
        }
        const report = reportedError(error)
        sendFailure(response, report.status, report.error)
      }
    },
  })
}

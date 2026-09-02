import { createServer, request as createHttpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { CLI_ROUTE_PATH } from '../../src/cli/contract.ts'
import { CatalogCliError } from '../../src/host/catalog/catalog-cli.ts'
import {
  abortIncompleteCliResponse,
  registerHarnessComfyuiCliRoute,
} from '../../src/host/cli/route.ts'
import {
  GenerationRuntime,
  GenerationRuntimeError,
  type GenerationPreparationAdapter,
} from '../../src/host/generation/generation-runtime.ts'
import { ImageReaderError } from '../../src/host/image-reader/errors.ts'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function createRuntime(preparer: GenerationPreparationAdapter): GenerationRuntime {
  const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-cli-route-'))
  temporaryDirectories.push(root)
  return new GenerationRuntime({
    runRepositoryFile: join(root, 'data', 'runs.sqlite'),
    runDirectory: join(root, 'runs'),
    savedMediaDirectory: join(root, 'media'),
    preparer,
  })
}

async function serve(
  register: (webServer: {
    register(route: {
      readonly kind: 'prefix'
      readonly path: string
      readonly handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
    }): () => void
  }) => void,
): Promise<{ readonly origin: string; readonly close: () => Promise<void> }> {
  let handler: ((request: IncomingMessage, response: ServerResponse) => void | Promise<void>) | undefined
  register({
    register(route) {
      handler = route.handler
      return () => undefined
    },
  })
  const server = createServer((request, response) => void handler!(request, response))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Test server address is unavailable.')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  }
}

function post(origin: string, capability: string, body: unknown): Promise<Response> {
  return fetch(`${origin}${CLI_ROUTE_PATH}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${capability}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

async function postThenDisconnect(origin: string, capability: string, body: unknown): Promise<void> {
  const payload = JSON.stringify(body)
  const url = new URL(CLI_ROUTE_PATH, origin)
  await new Promise<void>((resolve, reject) => {
    const request = createHttpRequest({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        authorization: `Bearer ${capability}`,
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(payload)),
      },
    })
    request.once('error', error => {
      if ((error as NodeJS.ErrnoException).code === 'ECONNRESET') resolve()
      else reject(error)
    })
    request.once('finish', () => {
      request.destroy()
      resolve()
    })
    request.end(payload)
  })
}

function unusedImageReader() {
  return { inspect: vi.fn() }
}

describe('Harness ComfyUI managed CLI route', () => {
  it('aborts only a CLI response that closes before it is fully written', () => {
    const incomplete = new AbortController()
    abortIncompleteCliResponse({ writableEnded: false }, incomplete)
    expect(incomplete.signal.aborted).toBe(true)

    const complete = new AbortController()
    abortIncompleteCliResponse({ writableEnded: true }, complete)
    expect(complete.signal.aborted).toBe(false)
  })

  it('aborts generation preparation when the CLI client disconnects after sending the complete body', async () => {
    let resolveAbort!: () => void
    const aborted = new Promise<void>(resolve => { resolveAbort = resolve })
    const acceptGeneration = vi.fn(async (_owner, _request, signal: AbortSignal) => {
      await new Promise<never>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          resolveAbort()
          reject(new GenerationRuntimeError('COMFYUI_REQUEST_CANCELED', 'Generation preparation was canceled.'))
        }, { once: true })
      })
    })
    const server = await serve(webServer => registerHarnessComfyuiCliRoute({
      webServer,
      capabilities: {
        authorize: () => ({ sessionId: 'session_1', turn: 1, callId: 'call_1', cwd: '/workspace' }),
      },
      catalog: {
        resolveTemplate: vi.fn(), resolveGenerationModel: vi.fn(), resolveLora: vi.fn(),
        queryComfyuiInstances: vi.fn(), search: vi.fn(),
      },
      runtime: { acceptGeneration, readGenerationRunInputs: vi.fn(), readGenerationRunMedia: vi.fn() } as never,
      imageReader: unusedImageReader(),
      workspaceRegistry: {
        resolveByPath: vi.fn(async () => ({ id: 'workspace_1', sessionIds: ['session_1'] })),
      },
    }))

    await postThenDisconnect(server.origin, 'trusted', {
      command: 'generation.submit',
      request: {
        title: 'Disconnected generation', instance_id: '2', template_id: '39', model: null, parameters: {}, loras: [],
      },
    })
    await expect(aborted).resolves.toBeUndefined()
    expect(acceptGeneration).toHaveBeenCalledOnce()
    await server.close()
  })

  it('does not abort the route signal after a normal generation response completes', async () => {
    let routeSignal: AbortSignal | undefined
    const server = await serve(webServer => registerHarnessComfyuiCliRoute({
      webServer,
      capabilities: {
        authorize: () => ({ sessionId: 'session_1', turn: 1, callId: 'call_1', cwd: '/workspace' }),
      },
      catalog: {
        resolveTemplate: vi.fn(), resolveGenerationModel: vi.fn(), resolveLora: vi.fn(),
        queryComfyuiInstances: vi.fn(), search: vi.fn(),
      },
      runtime: {
        acceptGeneration: vi.fn(async (_owner, _request, signal: AbortSignal) => {
          routeSignal = signal
          return { runId: 'run_normal' }
        }),
        readGenerationRunInputs: vi.fn(),
        readGenerationRunMedia: vi.fn(),
      } as never,
      imageReader: unusedImageReader(),
      workspaceRegistry: {
        resolveByPath: vi.fn(async () => ({ id: 'workspace_1', sessionIds: ['session_1'] })),
      },
    }))

    const response = await post(server.origin, 'trusted', {
      command: 'generation.submit',
      request: {
        title: 'Normal generation', instance_id: '2', template_id: '39', model: null, parameters: {}, loras: [],
      },
    })
    expect(await response.json()).toEqual({ ok: true, data: { run_id: 'run_normal' } })
    await new Promise(resolve => setImmediate(resolve))
    expect(routeSignal?.aborted).toBe(false)
    await server.close()
  })

  it('derives all durable Run ownership columns from the shell capability', async () => {
    const runtime = createRuntime({
      async prepare(request) {
        return {
          instanceId: request.instanceId ?? '2',
          instanceTitle: 'ComfyUI',
          templateTitle: 'Test template',
          sourceSnapshot: { template_id: request.templateId },
          actualWorkflow: { version: 0.4 },
          apiWorkflow: {},
          expectedOutputNodeIds: ['10'],
          connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
        }
      },
    })
    const catalog = {
      resolveTemplate: vi.fn(),
      resolveGenerationModel: vi.fn(),
      resolveLora: vi.fn(),
      queryComfyuiInstances: vi.fn(),
      search: vi.fn(),
    }
    const capability = 'capability_cli_1'
    const server = await serve(webServer => registerHarnessComfyuiCliRoute({
      webServer,
      capabilities: {
        authorize: value => value === capability
          ? { sessionId: 'session_7', turn: 4, callId: 'call_cli_9', cwd: '/workspace/current' }
          : undefined,
      },
      catalog,
      runtime,
      imageReader: unusedImageReader(),
      workspaceRegistry: {
        resolveByPath: vi.fn(async path => path === '/workspace/current'
          ? { id: 'workspace_1', sessionIds: ['session_7'] }
          : undefined),
      },
    }))

    const response = await post(server.origin, capability, {
      command: 'generation.submit',
      request: {
        title: 'CLI generation',
        instance_id: '2',
        template_id: '39',
        model: null,
        parameters: { positive_prompt: '1girl' },
        loras: [],
      },
    })

    expect(response.status).toBe(200)
    const submitEnvelope = await response.json() as { readonly data: { readonly run_id: string } }
    expect(submitEnvelope).toEqual({ ok: true, data: { run_id: expect.any(String) } })
    const queryResponse = await post(server.origin, capability, {
      command: 'generation.run-inputs',
      run_ids: [submitEnvelope.data.run_id, 'not a valid run id', submitEnvelope.data.run_id],
    })
    expect(queryResponse.status).toBe(200)
    expect(await queryResponse.json()).toEqual({
      ok: true,
      data: {
        runs: [
          {
            run_id: submitEnvelope.data.run_id,
            lookup_status: 'available',
            arguments: {
              title: 'CLI generation',
              instance_id: '2',
              template_id: '39',
              parameters: { positive_prompt: '1girl' },
              loras: [],
            },
            workflow_status: 'available',
            workflow: { version: 0.4 },
          },
          {
            run_id: 'not a valid run id',
            lookup_status: 'error',
            error: {
              code: 'GENERATION_RUN_ID_INVALID',
              message: 'Generation Run ID is invalid. Use a safe complete Run ID or a canonical prefix containing at least 8 UUID characters.',
            },
          },
          {
            run_id: submitEnvelope.data.run_id,
            lookup_status: 'available',
            arguments: {
              title: 'CLI generation',
              instance_id: '2',
              template_id: '39',
              parameters: { positive_prompt: '1girl' },
              loras: [],
            },
            workflow_status: 'available',
            workflow: { version: 0.4 },
          },
        ],
      },
    })
    const runs = runtime.queryRuns({ workspaceId: 'workspace_1', sessionId: 'session_7', turn: 4 })
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      workspaceId: 'workspace_1',
      sessionId: 'session_7',
      turn: 4,
      callId: 'call_cli_9',
      title: 'CLI generation',
      templateId: '39',
    })
    runtime.close()
    await server.close()
  })

  it('accepts the identical Generation Request from two independent shell calls', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-cli-route-repeat-'))
    temporaryDirectories.push(root)
    const runRepositoryFile = join(root, 'data', 'runs.sqlite')
    const runtime = new GenerationRuntime({
      runRepositoryFile,
      runDirectory: join(root, 'runs'),
      savedMediaDirectory: join(root, 'media'),
      preparer: {
        async prepare(request) {
          return {
            instanceId: request.instanceId ?? '2',
            instanceTitle: 'ComfyUI',
            templateTitle: 'Test template',
            sourceSnapshot: { template_id: request.templateId },
            actualWorkflow: { version: 0.4 },
            apiWorkflow: {},
            expectedOutputNodeIds: ['10'],
            connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
          }
        },
      },
    })
    const identities = {
      capability_cli_1: { sessionId: 'session_7', turn: 4, callId: 'call_cli_1', cwd: '/workspace/current' },
      capability_cli_2: { sessionId: 'session_7', turn: 4, callId: 'call_cli_2', cwd: '/workspace/current' },
    } as const
    const server = await serve(webServer => registerHarnessComfyuiCliRoute({
      webServer,
      capabilities: { authorize: value => identities[value as keyof typeof identities] },
      catalog: {
        resolveTemplate: vi.fn(),
        resolveGenerationModel: vi.fn(),
        resolveLora: vi.fn(),
        queryComfyuiInstances: vi.fn(),
        search: vi.fn(),
      },
      runtime,
      imageReader: unusedImageReader(),
      workspaceRegistry: {
        resolveByPath: vi.fn(async () => ({ id: 'workspace_1', sessionIds: ['session_7'] })),
      },
    }))
    const body = {
      command: 'generation.submit',
      request: {
        title: 'Repeated CLI generation',
        instance_id: '2',
        template_id: '39',
        model: null,
        parameters: { positive_prompt: '1girl', seed: 123456 },
        loras: [],
      },
    }

    const first = await post(server.origin, 'capability_cli_1', body)
    const replay = await post(server.origin, 'capability_cli_1', body)
    const conflict = await post(server.origin, 'capability_cli_1', {
      ...body,
      request: { ...body.request, title: 'Conflicting CLI generation' },
    })
    const second = await post(server.origin, 'capability_cli_2', body)
    const firstResult = await first.json() as { readonly data: { readonly run_id: string } }
    const replayResult = await replay.json() as { readonly data: { readonly run_id: string } }
    const secondResult = await second.json() as { readonly data: { readonly run_id: string } }

    expect(first.status).toBe(200)
    expect(replay.status).toBe(200)
    expect(replayResult.data.run_id).toBe(firstResult.data.run_id)
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toEqual({
      ok: false,
      error: {
        code: 'RUN_REQUEST_CONFLICT',
        message: 'The Tool call was already accepted with a different Generation request.',
      },
    })
    expect(second.status).toBe(200)
    expect(firstResult.data.run_id).not.toBe(secondResult.data.run_id)
    const database = new DatabaseSync(runRepositoryFile, { readOnly: true })
    const rows = database.prepare(`
      SELECT run_id, call_id, request_json FROM generation_runs
      WHERE session_id = ? ORDER BY created_at
    `).all('session_7') as unknown as readonly {
      readonly run_id: string
      readonly call_id: string
      readonly request_json: string
    }[]
    database.close()
    expect(rows).toHaveLength(2)
    expect(rows.map(row => row.run_id)).toEqual([firstResult.data.run_id, secondResult.data.run_id])
    expect(rows.map(row => row.call_id)).toEqual(['call_cli_1', 'call_cli_2'])
    expect(new Set(rows.map(row => row.request_json))).toEqual(new Set([rows[0]!.request_json]))
    runtime.close()
    await server.close()
  })

  it('dispatches catalog commands and rejects untrusted or malformed requests', async () => {
    const catalog = {
      resolveTemplate: vi.fn(async id => ({ id, title: 'Template', base_model_id: '1', model_id: null })),
      resolveGenerationModel: vi.fn(),
      resolveLora: vi.fn(),
      queryComfyuiInstances: vi.fn(),
      search: vi.fn(),
    }
    const server = await serve(webServer => registerHarnessComfyuiCliRoute({
      webServer,
      capabilities: {
        authorize: value => value === 'trusted'
          ? { sessionId: 'session_1', turn: 0, callId: 'call_1', cwd: '/workspace' }
          : undefined,
      },
      catalog,
      runtime: { acceptGeneration: vi.fn(), readGenerationRunInputs: vi.fn(), readGenerationRunMedia: vi.fn() },
      imageReader: unusedImageReader(),
      workspaceRegistry: { resolveByPath: vi.fn() },
    }))

    const [resolved, unauthorized, malformed, wrongMethod] = await Promise.all([
      post(server.origin, 'trusted', { command: 'catalog.template.resolve', id: '39' }),
      post(server.origin, 'wrong', { command: 'catalog.template.resolve', id: '39' }),
      post(server.origin, 'trusted', { command: 'catalog.template.resolve', id: 'not-an-id' }),
      fetch(`${server.origin}${CLI_ROUTE_PATH}`, { method: 'GET' }),
    ])

    expect(resolved.status).toBe(200)
    expect(await resolved.json()).toEqual({
      ok: true,
      data: { id: '39', title: 'Template', base_model_id: '1', model_id: null },
    })
    expect(catalog.resolveTemplate).toHaveBeenCalledWith('39', expect.any(AbortSignal))
    expect(unauthorized.status).toBe(401)
    expect(await unauthorized.json()).toEqual({
      ok: false,
      error: { code: 'CLI_CAPABILITY_INVALID', message: 'The shell-call capability is missing, expired, or invalid.' },
    })
    expect(malformed.status).toBe(400)
    expect(await malformed.json()).toEqual({
      ok: false,
      error: { code: 'CLI_REQUEST_INVALID', message: 'catalog item id is invalid' },
    })
    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.headers.get('allow')).toBe('POST')
    await server.close()
  })

  it('dispatches every remaining Catalog command without exposing execution identity', async () => {
    const catalog = {
      resolveTemplate: vi.fn(),
      resolveGenerationModel: vi.fn(async id => ({ id, kind: 'model' })),
      resolveLora: vi.fn(async id => ({ id, kind: 'lora' })),
      queryComfyuiInstances: vi.fn(async input => ({ input, kind: 'instances' })),
      search: vi.fn(async input => ({ input, kind: 'search' })),
    }
    const identity = { sessionId: 'session_1', turn: 2, callId: 'call_3', cwd: '/workspace' }
    const server = await serve(webServer => registerHarnessComfyuiCliRoute({
      webServer,
      capabilities: { authorize: () => identity },
      catalog: catalog as never,
      runtime: { acceptGeneration: vi.fn(), readGenerationRunInputs: vi.fn(), readGenerationRunMedia: vi.fn() },
      imageReader: unusedImageReader(),
      workspaceRegistry: { resolveByPath: vi.fn() },
    }))

    const responses = await Promise.all([
      post(server.origin, 'trusted', { command: 'catalog.generation-model.resolve', id: '3' }),
      post(server.origin, 'trusted', { command: 'catalog.lora.resolve', id: '91' }),
      post(server.origin, 'trusted', { command: 'catalog.instance.list' }),
      post(server.origin, 'trusted', {
        command: 'catalog.search',
        kind: 'model',
        query: 'portrait',
        page: 2,
        base_model_id: '1',
      }),
    ])

    expect(await Promise.all(responses.map(response => response.json()))).toEqual([
      { ok: true, data: { id: '3', kind: 'model' } },
      { ok: true, data: { id: '91', kind: 'lora' } },
      { ok: true, data: { input: { mode: 'search', query: '', page: 1, page_size: 100 }, kind: 'instances' } },
      {
        ok: true,
        data: {
          input: { kind: 'model', query: 'portrait', page: 2, baseModelId: '1' },
          kind: 'search',
        },
      },
    ])
    expect(catalog.resolveGenerationModel).toHaveBeenCalledWith('3', expect.any(AbortSignal))
    expect(catalog.resolveLora).toHaveBeenCalledWith('91', expect.any(AbortSignal))
    expect(catalog.queryComfyuiInstances).toHaveBeenCalledWith(
      { mode: 'search', query: '', page: 1, page_size: 100 },
      expect.any(AbortSignal),
    )
    expect(catalog.search).toHaveBeenCalledWith(
      { kind: 'model', query: 'portrait', page: 2, baseModelId: '1' },
      expect.any(AbortSignal),
    )
    await server.close()
  })

  it('dispatches Run media under the current Workspace and inspects exactly one image', async () => {
    const readGenerationRunMedia = vi.fn(async () => ({
      runs: [{ run_id: 'run_1', lookup_status: 'available', title: 'portrait', parameters: {}, images: [] }],
    }))
    const inspect = vi.fn(async () => ({
      provider: 'provider-a', model: 'vision-a', filePath: '/media/result.png', observation: '可见一名人物。',
    }))
    const server = await serve(webServer => registerHarnessComfyuiCliRoute({
      webServer,
      capabilities: {
        authorize: () => ({ sessionId: 'session_1', turn: 2, callId: 'call_3', cwd: '/workspace/current' }),
      },
      catalog: {
        resolveTemplate: vi.fn(), resolveGenerationModel: vi.fn(), resolveLora: vi.fn(),
        queryComfyuiInstances: vi.fn(), search: vi.fn(),
      },
      runtime: { acceptGeneration: vi.fn(), readGenerationRunInputs: vi.fn(), readGenerationRunMedia } as never,
      imageReader: { inspect } as never,
      workspaceRegistry: {
        resolveByPath: vi.fn(async () => ({ id: 'workspace_1', sessionIds: ['session_1'] })),
      },
    }))

    const mediaResponse = await post(server.origin, 'trusted', {
      command: 'generation.resolve-media', run_ids: ['run_1'],
    })
    const inspectionResponse = await post(server.origin, 'trusted', {
      command: 'image.inspect', file_path: '/media/result.png',
    })
    const promptedInspectionResponse = await post(server.origin, 'trusted', {
      command: 'image.inspect', file_path: '/media/result.png', prompt: '只识别图片中的文字。',
    })

    expect(mediaResponse.status).toBe(200)
    expect(await mediaResponse.json()).toEqual({
      ok: true,
      data: { runs: [{ run_id: 'run_1', lookup_status: 'available', title: 'portrait', parameters: {}, images: [] }] },
    })
    expect(readGenerationRunMedia).toHaveBeenCalledWith(
      { workspaceId: 'workspace_1', runIds: ['run_1'] },
      expect.any(AbortSignal),
    )
    expect(inspectionResponse.status).toBe(200)
    expect(await inspectionResponse.json()).toEqual({
      ok: true,
      data: {
        provider: 'provider-a', model: 'vision-a', file_path: '/media/result.png', observation: '可见一名人物。',
      },
    })
    expect(promptedInspectionResponse.status).toBe(200)
    expect(await promptedInspectionResponse.json()).toEqual({
      ok: true,
      data: {
        provider: 'provider-a', model: 'vision-a', file_path: '/media/result.png', observation: '可见一名人物。',
      },
    })
    expect(inspect).toHaveBeenNthCalledWith(1, '/media/result.png', {
      prompt: undefined,
      signal: expect.any(AbortSignal),
    })
    expect(inspect).toHaveBeenNthCalledWith(2, '/media/result.png', {
      prompt: '只识别图片中的文字。',
      signal: expect.any(AbortSignal),
    })
    await server.close()
  })

  it('rejects the old internal Run media command without calling a runtime', async () => {
    const acceptGeneration = vi.fn()
    const readGenerationRunInputs = vi.fn()
    const readGenerationRunMedia = vi.fn()
    const inspect = vi.fn()
    const resolveByPath = vi.fn()
    const server = await serve(webServer => registerHarnessComfyuiCliRoute({
      webServer,
      capabilities: {
        authorize: () => ({ sessionId: 'session_1', turn: 2, callId: 'call_3', cwd: '/workspace/current' }),
      },
      catalog: {
        resolveTemplate: vi.fn(), resolveGenerationModel: vi.fn(), resolveLora: vi.fn(),
        queryComfyuiInstances: vi.fn(), search: vi.fn(),
      },
      runtime: { acceptGeneration, readGenerationRunInputs, readGenerationRunMedia },
      imageReader: { inspect } as never,
      workspaceRegistry: { resolveByPath },
    }))

    const response = await post(server.origin, 'trusted', {
      command: 'image.run-media', run_ids: ['run_1'],
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: 'CLI_REQUEST_INVALID', message: 'CLI request command is invalid' },
    })
    expect(acceptGeneration).not.toHaveBeenCalled()
    expect(readGenerationRunInputs).not.toHaveBeenCalled()
    expect(readGenerationRunMedia).not.toHaveBeenCalled()
    expect(inspect).not.toHaveBeenCalled()
    expect(resolveByPath).not.toHaveBeenCalled()
    await server.close()
  })

  it('reports image reader failures with their stable code and message', async () => {
    const inspect = vi.fn(async () => {
      throw new ImageReaderError('IMAGE_READER_MODEL_NOT_CONFIGURED', 'Image reading requires a configured provider and visual model.')
    })
    const server = await serve(webServer => registerHarnessComfyuiCliRoute({
      webServer,
      capabilities: {
        authorize: () => ({ sessionId: 'session_1', turn: 2, callId: 'call_3', cwd: '/workspace/current' }),
      },
      catalog: {
        resolveTemplate: vi.fn(), resolveGenerationModel: vi.fn(), resolveLora: vi.fn(),
        queryComfyuiInstances: vi.fn(), search: vi.fn(),
      },
      runtime: { acceptGeneration: vi.fn(), readGenerationRunInputs: vi.fn(), readGenerationRunMedia: vi.fn() },
      imageReader: { inspect } as never,
      workspaceRegistry: { resolveByPath: vi.fn() },
    }))

    const response = await post(server.origin, 'trusted', {
      command: 'image.inspect', file_path: '/media/result.png',
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: 'IMAGE_READER_MODEL_NOT_CONFIGURED',
        message: 'Image reading requires a configured provider and visual model.',
      },
    })
    await server.close()
  })

  it('reports route, media type, Catalog, Generation, workspace, and internal failures', async () => {
    const catalog = {
      resolveTemplate: vi.fn(async id => {
        if (id === '1') throw new CatalogCliError('CATALOG_QUERY_FAILED', 'Catalog is unavailable.')
        if (id === '2') throw new Error('internal details')
        return { id, title: 'Template', base_model_id: '1', model_id: null }
      }),
      resolveGenerationModel: vi.fn(),
      resolveLora: vi.fn(),
      queryComfyuiInstances: vi.fn(),
      search: vi.fn(),
    }
    const runtime = {
      acceptGeneration: vi.fn(async () => {
        throw new GenerationRuntimeError('RUN_REQUEST_CONFLICT', 'The call already accepted another request.')
      }),
      readGenerationRunInputs: vi.fn(),
    }
    const server = await serve(webServer => registerHarnessComfyuiCliRoute({
      webServer,
      capabilities: {
        authorize: () => ({ sessionId: 'session_1', turn: 1, callId: 'call_1', cwd: '/missing' }),
      },
      catalog: catalog as never,
      runtime: { ...runtime, readGenerationRunMedia: vi.fn() },
      imageReader: unusedImageReader(),
      workspaceRegistry: { resolveByPath: vi.fn(async () => undefined) },
    }))
    const generationBody = {
      command: 'generation.submit',
      request: {
        title: 'generation', instance_id: '2', template_id: '39', model: null, parameters: {}, loras: [],
      },
    }

    const [routeMissing, mediaType, invalidJson, catalogFailure, internalFailure, workspaceFailure] = await Promise.all([
      fetch(`${server.origin}${CLI_ROUTE_PATH}/extra`, {
        method: 'POST', headers: { authorization: 'Bearer trusted', 'content-type': 'application/json' }, body: '{}',
      }),
      fetch(`${server.origin}${CLI_ROUTE_PATH}`, {
        method: 'POST', headers: { authorization: 'Bearer trusted', 'content-type': 'text/plain' }, body: '{}',
      }),
      fetch(`${server.origin}${CLI_ROUTE_PATH}`, {
        method: 'POST', headers: { authorization: 'Bearer trusted', 'content-type': 'application/json' }, body: '{',
      }),
      post(server.origin, 'trusted', { command: 'catalog.template.resolve', id: '1' }),
      post(server.origin, 'trusted', { command: 'catalog.template.resolve', id: '2' }),
      post(server.origin, 'trusted', generationBody),
    ])

    expect(routeMissing.status).toBe(404)
    expect(mediaType.status).toBe(415)
    expect(invalidJson.status).toBe(400)
    expect(catalogFailure.status).toBe(502)
    expect(await catalogFailure.json()).toEqual({
      ok: false, error: { code: 'CATALOG_QUERY_FAILED', message: 'Catalog is unavailable.' },
    })
    expect(internalFailure.status).toBe(500)
    expect(await internalFailure.json()).toEqual({
      ok: false,
      error: { code: 'CLI_INTERNAL_ERROR', message: 'The Harness ComfyUI CLI request failed inside the Host.' },
    })
    expect(workspaceFailure.status).toBe(409)
    expect(await workspaceFailure.json()).toEqual({
      ok: false,
      error: {
        code: 'GENERATION_WORKSPACE_REQUIRED',
        message: 'The current Session is not attached to a Harness Workspace.',
      },
    })
    expect(runtime.acceptGeneration).not.toHaveBeenCalled()
    await server.close()

    const generationServer = await serve(webServer => registerHarnessComfyuiCliRoute({
      webServer,
      capabilities: {
        authorize: () => ({ sessionId: 'session_1', turn: 1, callId: 'call_1', cwd: '/workspace' }),
      },
      catalog: catalog as never,
      runtime: { ...runtime, readGenerationRunMedia: vi.fn() },
      imageReader: unusedImageReader(),
      workspaceRegistry: {
        resolveByPath: vi.fn(async () => ({ id: 'workspace_1', sessionIds: ['session_1'] })),
      },
    }))
    const generationFailure = await post(generationServer.origin, 'trusted', generationBody)
    expect(generationFailure.status).toBe(409)
    expect(await generationFailure.json()).toEqual({
      ok: false,
      error: { code: 'RUN_REQUEST_CONFLICT', message: 'The call already accepted another request.' },
    })
    expect(runtime.acceptGeneration).toHaveBeenCalledOnce()
    await generationServer.close()
  })
})

import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { describe, expect, it, vi } from 'vitest'

import { GenerationRuntimeError } from '../../src/host/generation/generation-error.ts'
import {
  runFrontendCompilerWorker,
  runFrontendCompilerWorkerProcess,
} from '../../src/host/generation/comfy-frontend-worker.ts'

function request(): Record<string, unknown> {
  return {
    version: 1,
    browser: {
      browserExecutablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      timeoutMs: 120_000,
      preReadiness: {
        devToolsPortMs: 10_000,
        targetCreateMs: 10_000,
        webSocketConnectMs: 10_000,
        domainEnableMs: 10_000,
        navigationMs: 10_000,
        infrastructureAttempts: 2,
      },
    },
    input: {
      workflow: { version: 0.4, nodes: [], links: [] },
      connection: {
        url: 'http://192.168.110.122:8188/',
        origin: 'http://192.168.110.122:8188',
        authorization: null,
      },
    },
  }
}

async function execute(
  source: string,
  createFrontend: Parameters<typeof runFrontendCompilerWorker>[0]['createFrontend'],
): Promise<readonly Record<string, any>[]> {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  let output = ''
  stdout.on('data', chunk => { output += String(chunk) })
  stdin.end(source)
  await runFrontendCompilerWorker({ stdin, stdout, createFrontend })
  return output.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, any>)
}

describe('runFrontendCompilerWorker', () => {
  it('parses one request, emits diagnostics, and returns the exported workflow', async () => {
    const exportWorkflow = vi.fn(async () => ({ '1': { class_type: 'PromptNode', inputs: {} } }))
    const createFrontend = vi.fn(options => {
      options.reportDiagnostic?.({ attempt: 1, status: 'succeeded' })
      return { exportWorkflow }
    })

    const messages = await execute(`${JSON.stringify(request())}\n`, createFrontend)

    expect(createFrontend).toHaveBeenCalledWith(expect.objectContaining({
      browserExecutablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      timeoutMs: 120_000,
      preReadiness: expect.objectContaining({ infrastructureAttempts: 2 }),
      reportDiagnostic: expect.any(Function),
    }))
    expect(exportWorkflow).toHaveBeenCalledWith(expect.objectContaining({
      workflow: { version: 0.4, nodes: [], links: [] },
      connection: {
        url: 'http://192.168.110.122:8188/',
        origin: 'http://192.168.110.122:8188',
        authorization: null,
      },
    }))
    expect(messages).toEqual([
      { type: 'diagnostic', diagnostic: { attempt: 1, status: 'succeeded' } },
      { type: 'result', ok: true, workflow: { '1': { class_type: 'PromptNode', inputs: {} } } },
    ])
  })

  it('returns structured runtime and request failures without throwing across the process boundary', async () => {
    const runtimeMessages = await execute(`${JSON.stringify(request())}\n`, () => ({
      exportWorkflow: vi.fn(async () => {
        throw new GenerationRuntimeError('COMFYUI_FRONTEND_NAVIGATION_FAILED', 'Page.navigate exceeded 10000ms.')
      }),
    }))
    expect(runtimeMessages).toEqual([{
      type: 'result',
      ok: false,
      error: { code: 'COMFYUI_FRONTEND_NAVIGATION_FAILED', message: 'Page.navigate exceeded 10000ms.' },
    }])

    const invalidMessages = await execute('{"version":2}\n', () => {
      throw new Error('must not construct frontend')
    })
    expect(invalidMessages).toEqual([{
      type: 'result',
      ok: false,
      error: {
        code: 'COMFYUI_FRONTEND_WORKER_FAILED',
        message: 'Official frontend compiler worker request is invalid.',
      },
    }])
  })

  it('turns a process termination signal into cooperative frontend cancellation', async () => {
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const processSignals = new EventEmitter()
    let output = ''
    stdout.on('data', chunk => { output += String(chunk) })
    stdin.end(`${JSON.stringify(request())}\n`)
    const exportWorkflow = vi.fn(async (input: { readonly signal?: AbortSignal }) => {
      await new Promise<void>(resolve => input.signal?.addEventListener('abort', () => resolve(), { once: true }))
      throw new GenerationRuntimeError('COMFYUI_REQUEST_CANCELED', 'Official ComfyUI frontend compilation was canceled by the caller.')
    })
    const promise = runFrontendCompilerWorkerProcess(
      { stdin, stdout, createFrontend: () => ({ exportWorkflow } as never) },
      processSignals,
    )
    await vi.waitFor(() => expect(exportWorkflow).toHaveBeenCalledOnce())

    processSignals.emit('SIGTERM')
    await promise

    expect(exportWorkflow.mock.calls[0]?.[0]?.signal?.aborted).toBe(true)
    expect(processSignals.listenerCount('SIGTERM')).toBe(0)
    expect(processSignals.listenerCount('SIGINT')).toBe(0)
    expect(output.trim().split('\n').map(line => JSON.parse(line))).toContainEqual({
      type: 'result',
      ok: false,
      error: {
        code: 'COMFYUI_REQUEST_CANCELED',
        message: 'Official ComfyUI frontend compilation was canceled by the caller.',
      },
    })
  })

  it('destroys pending worker input when the caller cancels before stdin completes', async () => {
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const controller = new AbortController()
    let output = ''
    stdout.on('data', chunk => { output += String(chunk) })
    const promise = runFrontendCompilerWorker({
      stdin,
      stdout,
      signal: controller.signal,
      createFrontend: () => {
        throw new Error('must not construct frontend')
      },
    })

    controller.abort()
    await promise

    expect(stdin.destroyed).toBe(true)
    expect(output.trim().split('\n').map(line => JSON.parse(line))).toEqual([{
      type: 'result',
      ok: false,
      error: {
        code: 'COMFYUI_REQUEST_CANCELED',
        message: 'Official ComfyUI frontend compilation was canceled by the caller.',
      },
    }])
  })
})

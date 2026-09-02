import { EventEmitter } from 'node:events'

import { afterEach, describe, expect, it, vi } from 'vitest'

import errorCatalog from '../../config/error-catalog.json' with { type: 'json' }
import {
  ChromeComfyFrontend,
  WebSocketCdpSession,
  type BrowserChildProcess,
  type CdpSession,
  type WebSocketLike,
} from '../../src/host/generation/comfy-frontend-browser.ts'
import type { JsonValue } from '../../src/host/generation/generation-runtime.ts'
import type { UiWorkflow } from '../../src/host/generation/source-preparer.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

class FakeBrowserProcess extends EventEmitter implements BrowserChildProcess {
  exitCode: number | null = null
  readonly stderr = new EventEmitter()
  readonly kill = vi.fn((signal?: NodeJS.Signals | number) => {
    if (signal === 'SIGKILL' || this.exitOnTerminate) {
      this.exitCode = 0
      queueMicrotask(() => this.emit('exit', 0, signal))
    }
    return true
  })

  constructor(private readonly exitOnTerminate = true) {
    super()
  }
}

function workflow(): UiWorkflow {
  return {
    version: 0.4,
    nodes: [{ id: 1, type: 'PromptNode', widgets_values: ['a prompt'] }],
    links: [],
  }
}

interface TestCdpSession extends CdpSession {
  readonly connect: ReturnType<typeof vi.fn<CdpSession['connect']>>
  readonly send: ReturnType<typeof vi.fn<CdpSession['send']>>
  readonly onEvent: ReturnType<typeof vi.fn<CdpSession['onEvent']>>
  readonly evaluate: ReturnType<typeof vi.fn<CdpSession['evaluate']>>
  readonly close: ReturnType<typeof vi.fn<CdpSession['close']>>
  emitEvent(method: string, params: Readonly<Record<string, unknown>>): void
}

function session(output: Readonly<Record<string, JsonValue>> = {
  '1': { class_type: 'PromptNode', inputs: { text: 'a prompt' } },
}): TestCdpSession {
  const listeners = new Map<string, (params: Readonly<Record<string, unknown>>) => void>()
  return {
    connect: vi.fn<CdpSession['connect']>(async () => undefined),
    send: vi.fn<CdpSession['send']>(async () => ({})),
    onEvent: vi.fn<CdpSession['onEvent']>((method, listener) => { listeners.set(method, listener) }),
    evaluate: vi.fn<CdpSession['evaluate']>()
      .mockResolvedValueOnce({ documentReady: true, hasApp: true, splashVisible: false })
      .mockResolvedValueOnce({ output }),
    close: vi.fn<CdpSession['close']>(),
    emitEvent: (method, params) => { listeners.get(method)?.(params) },
  }
}

function frontendOptions(overrides: Record<string, unknown> = {}) {
  const child = new FakeBrowserProcess()
  const cdp = session()
  return {
    child,
    cdp,
    options: {
      browserExecutablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      timeoutMs: 120_000,
      preReadiness: {
        devToolsPortMs: 10_000,
        targetCreateMs: 10_000,
        webSocketConnectMs: 10_000,
        domainEnableMs: 10_000,
        navigationMs: 10_000,
        infrastructureAttempts: 1 as 1 | 2,
      },
      spawnImplementation: vi.fn(() => child),
      makeTemporaryDirectory: vi.fn(async () => '/tmp/harness-comfyui-browser-test'),
      readTextFile: vi.fn(async () => '9222\n/devtools/browser/id\n'),
      removeDirectory: vi.fn(async () => undefined),
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/1',
      }), { status: 200 })),
      createCdpSession: vi.fn(() => cdp),
      delay: vi.fn(async () => undefined),
      now: vi.fn(() => 0),
      ...overrides,
    },
  }
}

describe('ChromeComfyFrontend', () => {
  it('publishes distinct error catalog entries for every official frontend stage', () => {
    const codes = [
      'COMFYUI_FRONTEND_TARGET_CREATE_FAILED',
      'COMFYUI_FRONTEND_CDP_CONNECT_FAILED',
      'COMFYUI_FRONTEND_TARGET_CRASHED',
      'COMFYUI_FRONTEND_NAVIGATION_FAILED',
      'COMFYUI_FRONTEND_NOT_READY',
      'COMFYUI_FRONTEND_EXPORT_FAILED',
    ] as const
    const entries = codes.map(code => errorCatalog[code])

    expect(entries.map(entry => entry.code)).toEqual(codes)
    expect(new Set(entries.map(entry => `${entry.title}\n${entry.reason}\n${entry.next_step}`)).size).toBe(codes.length)
  })

  it('uses the production filesystem, clock, delay, and child-process implementations', async () => {
    const frontend = new ChromeComfyFrontend({
      browserExecutablePath: '/usr/bin/true',
      timeoutMs: 2_000,
      preReadiness: {
        devToolsPortMs: 10_000,
        targetCreateMs: 10_000,
        webSocketConnectMs: 10_000,
        domainEnableMs: 10_000,
        navigationMs: 10_000,
        infrastructureAttempts: 1,
      },
    })

    await expect(frontend.exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })).rejects.toMatchObject({ code: 'COMFYUI_FRONTEND_BROWSER_FAILED' })
  })

  it('uses the production CDP session factory when no factory is injected', async () => {
    const socket = new FakeWebSocket()
    let evaluation = 0
    socket.send.mockImplementation((contents: string) => {
      const request = JSON.parse(contents) as { id: number; method: string }
      let result: unknown = {}
      if (request.method === 'Runtime.evaluate') {
        evaluation += 1
        result = {
          result: {
            value: evaluation === 1
              ? { documentReady: true, hasApp: true, splashVisible: false }
              : { output: { '1': { class_type: 'PromptNode', inputs: { text: 'a prompt' } } } },
          },
        }
      }
      queueMicrotask(() => socket.emit('message', { data: JSON.stringify({ id: request.id, result }) }))
    })
    const OriginalLikeWebSocket = class {
      constructor() {
        return socket
      }
    }
    vi.stubGlobal('WebSocket', OriginalLikeWebSocket)
    const fixture = frontendOptions({ createCdpSession: undefined })
    const originalAddEventListener = socket.addEventListener.bind(socket)
    socket.addEventListener = (type, listener, options) => {
      originalAddEventListener(type, listener, options)
      if (type === 'open') queueMicrotask(() => socket.emit('open'))
    }

    await expect(new ChromeComfyFrontend(fixture.options).exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })).resolves.toEqual({ '1': { class_type: 'PromptNode', inputs: { text: 'a prompt' } } })
    expect(socket.close).toHaveBeenCalledOnce()
  })

  it('opens a blank DevTools target, scopes authorization to the instance origin, exports, and cleans its own browser', async () => {
    const fixture = frontendOptions()
    fixture.cdp.send.mockImplementation(async method => {
      if (method === 'Page.navigate') {
        fixture.cdp.emitEvent('Fetch.requestPaused', {
          requestId: 'same-origin',
          request: { url: 'http://192.168.110.122:8188/api/object_info', headers: { Accept: 'application/json' } },
        })
        fixture.cdp.emitEvent('Fetch.requestPaused', {
          requestId: 'cross-origin',
          request: { url: 'https://untrusted.example/extension.js', headers: { Authorization: 'must-remove', Accept: '*/*' } },
        })
      }
      return {}
    })
    const frontend = new ChromeComfyFrontend(fixture.options)

    const result = await frontend.exportWorkflow({
      workflow: workflow(),
      connection: {
        url: 'http://192.168.110.122:8188/',
        origin: 'http://192.168.110.122:8188',
        authorization: 'Bearer secret',
      },
    })

    expect(result).toEqual({ '1': { class_type: 'PromptNode', inputs: { text: 'a prompt' } } })
    expect(fixture.options.spawnImplementation).toHaveBeenCalledWith(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      expect.arrayContaining([
        '--headless=new',
        '--use-mock-keychain',
        '--disable-features=DialMediaRouteProvider',
        '--remote-debugging-port=0',
        '--user-data-dir=/tmp/harness-comfyui-browser-test',
        'about:blank',
      ]),
      { stdio: ['ignore', 'ignore', 'pipe'] },
    )
    expect(fixture.options.fetchImplementation).toHaveBeenCalledWith(
      'http://127.0.0.1:9222/json/new?about%3Ablank',
      expect.objectContaining({ method: 'PUT' }),
    )
    expect(fixture.cdp.send.mock.calls.map(call => call[0])).toEqual([
      'Page.enable',
      'Runtime.enable',
      'Network.enable',
      'Inspector.enable',
      'Fetch.enable',
      'Page.navigate',
      'Fetch.continueRequest',
      'Fetch.continueRequest',
    ])
    expect(fixture.cdp.send.mock.calls[4]?.[1]).toEqual({ patterns: [
      { urlPattern: '*', requestStage: 'Request' },
    ] })
    expect(fixture.cdp.send.mock.calls[5]?.[1]).toEqual({ url: 'http://192.168.110.122:8188/' })
    expect(fixture.cdp.send.mock.calls[6]?.[1]).toEqual({
      requestId: 'same-origin',
      headers: [
        { name: 'Accept', value: 'application/json' },
        { name: 'Authorization', value: 'Bearer secret' },
      ],
    })
    expect(fixture.cdp.send.mock.calls[7]?.[1]).toEqual({
      requestId: 'cross-origin',
      headers: [{ name: 'Accept', value: '*/*' }],
    })
    expect(fixture.cdp.evaluate).toHaveBeenCalledTimes(2)
    expect(fixture.cdp.close).toHaveBeenCalledOnce()
    expect(fixture.child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(fixture.options.removeDirectory).toHaveBeenCalledWith('/tmp/harness-comfyui-browser-test')
  })

  it('does not set an authorization header for an unauthenticated instance', async () => {
    const fixture = frontendOptions()
    const frontend = new ChromeComfyFrontend(fixture.options)

    await frontend.exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })

    expect(fixture.cdp.send.mock.calls.map(call => call[0])).not.toContain('Fetch.enable')
    expect(fixture.cdp.onEvent).not.toHaveBeenCalledWith('Fetch.requestPaused', expect.any(Function))
  })

  it('reports an authorization interception failure and cleans the browser', async () => {
    const fixture = frontendOptions()
    fixture.cdp.send.mockImplementation(async method => {
      if (method === 'Fetch.continueRequest') throw new Error('continue failed')
      if (method === 'Page.navigate') {
        fixture.cdp.emitEvent('Fetch.requestPaused', {
          requestId: 'same-origin',
          request: { url: 'http://127.0.0.1:8188/object_info', headers: {} },
        })
        await new Promise<void>(resolve => queueMicrotask(resolve))
      }
      return {}
    })

    await expect(new ChromeComfyFrontend(fixture.options).exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: 'Bearer secret' },
    })).rejects.toMatchObject({
      code: 'COMFYUI_FRONTEND_NAVIGATION_FAILED',
      stage: 'request-interception',
      operation: 'Fetch.continueRequest',
      message: expect.stringContaining('stage "request-interception" operation "Fetch.continueRequest"'),
    })
    expect(fixture.cdp.close).toHaveBeenCalledOnce()
    expect(fixture.child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('returns the browser error code when Chrome cannot start', async () => {
    const fixture = frontendOptions({ spawnImplementation: vi.fn(() => { throw new Error('spawn failed') }) })
    const frontend = new ChromeComfyFrontend(fixture.options)

    await expect(frontend.exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })).rejects.toMatchObject({ code: 'COMFYUI_FRONTEND_BROWSER_FAILED' })
    expect(fixture.options.removeDirectory).toHaveBeenCalledOnce()
  })

  it('converts an asynchronous child-process startup error and removes its temporary directory', async () => {
    const fixture = frontendOptions()
    fixture.options.spawnImplementation = vi.fn(() => {
      queueMicrotask(() => fixture.child.emit('error', new Error('spawn ENOENT')))
      return fixture.child
    })
    fixture.options.readTextFile = vi.fn(async () => {
      const error = new Error('missing') as NodeJS.ErrnoException
      error.code = 'ENOENT'
      throw error
    })

    await expect(new ChromeComfyFrontend(fixture.options).exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })).rejects.toMatchObject({
      code: 'COMFYUI_FRONTEND_BROWSER_FAILED',
      stage: 'devtools-port',
      operation: 'read DevToolsActivePort',
    })
    expect(fixture.options.removeDirectory).toHaveBeenCalledWith('/tmp/harness-comfyui-browser-test')
  })

  it('keeps the Host process alive when the configured browser executable does not exist', async () => {
    const frontend = new ChromeComfyFrontend({
      browserExecutablePath: '/definitely-missing-harness-comfyui-browser',
      timeoutMs: 2_000,
      preReadiness: {
        devToolsPortMs: 10_000,
        targetCreateMs: 10_000,
        webSocketConnectMs: 10_000,
        domainEnableMs: 10_000,
        navigationMs: 10_000,
        infrastructureAttempts: 1,
      },
    })

    await expect(frontend.exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })).rejects.toMatchObject({ code: 'COMFYUI_FRONTEND_BROWSER_FAILED' })
  })

  it('returns the browser error code when Chrome exits before exposing its DevTools port', async () => {
    const fixture = frontendOptions()
    fixture.child.exitCode = 9
    const frontend = new ChromeComfyFrontend(fixture.options)

    await expect(frontend.exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })).rejects.toMatchObject({ code: 'COMFYUI_FRONTEND_BROWSER_FAILED' })
  })

  it('limits DevToolsActivePort waiting to the configured browser startup stage', async () => {
    let currentTime = 0
    const missingPort = new Error('missing') as NodeJS.ErrnoException
    missingPort.code = 'ENOENT'
    const fixture = frontendOptions({
      readTextFile: vi.fn(async () => { throw missingPort }),
      now: vi.fn(() => { currentTime += 6; return currentTime }),
    })
    fixture.options.timeoutMs = 100
    fixture.options.preReadiness.devToolsPortMs = 10

    await expect(new ChromeComfyFrontend(fixture.options).exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })).rejects.toMatchObject({
      code: 'COMFYUI_FRONTEND_BROWSER_FAILED',
      message: expect.stringContaining('devtools-port'),
    })
  })

  it('returns the not-ready error code when ComfyUI extensions do not initialize by the deadline', async () => {
    let currentTime = 0
    const cdp = session()
    cdp.evaluate.mockReset().mockResolvedValue({ documentReady: true, hasApp: false, splashVisible: true })
    const fixture = frontendOptions({
      createCdpSession: vi.fn(() => cdp),
      now: vi.fn(() => { currentTime += 60; return currentTime }),
    })
    fixture.options.timeoutMs = 100
    fixture.options.preReadiness.infrastructureAttempts = 2
    const frontend = new ChromeComfyFrontend(fixture.options)

    await expect(frontend.exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })).rejects.toMatchObject({
      code: 'COMFYUI_FRONTEND_NOT_READY',
      stage: 'readiness',
      operation: 'Runtime.evaluate',
    })
    expect(cdp.close).toHaveBeenCalledOnce()
    expect(fixture.options.spawnImplementation).toHaveBeenCalledOnce()
  })

  it('reports a pending Page.navigate with the navigation stage error code and method', async () => {
    const cdp = session()
    cdp.send.mockImplementation(async method => method === 'Page.navigate'
      ? new Promise(() => undefined)
      : {})
    const fixture = frontendOptions({ createCdpSession: vi.fn(() => cdp) })
    fixture.options.timeoutMs = 100
    fixture.options.preReadiness.navigationMs = 10

    await expect(new ChromeComfyFrontend(fixture.options).exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })).rejects.toMatchObject({
      code: 'COMFYUI_FRONTEND_NAVIGATION_FAILED',
      stage: 'navigation',
      operation: 'Page.navigate',
      message: expect.stringContaining('Page.navigate" exceeded 10ms'),
    })
  })

  it('reports a failed DevTools target HTTP request as target creation failure', async () => {
    const fixture = frontendOptions({
      fetchImplementation: vi.fn(async () => new Response('target unavailable', { status: 503 })),
    })

    await expect(new ChromeComfyFrontend(fixture.options).exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })).rejects.toMatchObject({
      code: 'COMFYUI_FRONTEND_TARGET_CREATE_FAILED',
      message: expect.stringContaining('target-create'),
    })
  })

  it('reports a pending DevTools WebSocket handshake as CDP connection failure', async () => {
    const cdp = session()
    cdp.connect.mockImplementation(async () => new Promise(() => undefined))
    const fixture = frontendOptions({ createCdpSession: vi.fn(() => cdp) })
    fixture.options.timeoutMs = 100
    fixture.options.preReadiness.webSocketConnectMs = 10

    await expect(new ChromeComfyFrontend(fixture.options).exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })).rejects.toMatchObject({
      code: 'COMFYUI_FRONTEND_CDP_CONNECT_FAILED',
      message: expect.stringContaining('WebSocket.connect'),
    })
  })

  it('reports a pending CDP domain command with the connection error code and method', async () => {
    const cdp = session()
    cdp.send.mockImplementation(async method => method === 'Runtime.enable'
      ? new Promise(() => undefined)
      : {})
    const fixture = frontendOptions({ createCdpSession: vi.fn(() => cdp) })
    fixture.options.timeoutMs = 100
    fixture.options.preReadiness.domainEnableMs = 10

    await expect(new ChromeComfyFrontend(fixture.options).exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })).rejects.toMatchObject({
      code: 'COMFYUI_FRONTEND_CDP_CONNECT_FAILED',
      message: expect.stringContaining('Runtime.enable'),
    })
  })

  it('reports Inspector.targetCrashed immediately with its dedicated error code', async () => {
    const cdp = session()
    cdp.send.mockImplementation(async method => {
      if (method !== 'Page.navigate') return {}
      cdp.emitEvent('Inspector.targetCrashed', { status: 'crashed', errorCode: 139 })
      return new Promise(() => undefined)
    })
    const fixture = frontendOptions({ createCdpSession: vi.fn(() => cdp) })
    fixture.options.preReadiness.navigationMs = 100

    await expect(new ChromeComfyFrontend(fixture.options).exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })).rejects.toMatchObject({ code: 'COMFYUI_FRONTEND_TARGET_CRASHED' })
  })

  it('retries one pre-readiness infrastructure failure with a fresh browser profile', async () => {
    const firstCdp = session()
    firstCdp.send.mockImplementation(async method => {
      if (method === 'Page.navigate') throw new Error('transient navigation failure')
      return {}
    })
    const secondCdp = session()
    const children = [new FakeBrowserProcess(), new FakeBrowserProcess()]
    const fixture = frontendOptions({
      spawnImplementation: vi.fn(() => children.shift()!),
      makeTemporaryDirectory: vi.fn()
        .mockResolvedValueOnce('/tmp/harness-comfyui-browser-attempt-1')
        .mockResolvedValueOnce('/tmp/harness-comfyui-browser-attempt-2'),
      createCdpSession: vi.fn()
        .mockReturnValueOnce(firstCdp)
        .mockReturnValueOnce(secondCdp),
    })
    fixture.options.preReadiness.infrastructureAttempts = 2

    await expect(new ChromeComfyFrontend(fixture.options).exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })).resolves.toEqual({ '1': { class_type: 'PromptNode', inputs: { text: 'a prompt' } } })
    expect(fixture.options.spawnImplementation).toHaveBeenCalledTimes(2)
    expect(fixture.options.removeDirectory).toHaveBeenNthCalledWith(1, '/tmp/harness-comfyui-browser-attempt-1')
    expect(fixture.options.removeDirectory).toHaveBeenNthCalledWith(2, '/tmp/harness-comfyui-browser-attempt-2')
  })

  it('retries when the first browser exits before publishing its DevTools port', async () => {
    const firstChild = new FakeBrowserProcess()
    firstChild.exitCode = 9
    const secondChild = new FakeBrowserProcess()
    const children = [firstChild, secondChild]
    const fixture = frontendOptions({
      spawnImplementation: vi.fn(() => children.shift()!),
      makeTemporaryDirectory: vi.fn()
        .mockResolvedValueOnce('/tmp/harness-comfyui-browser-port-attempt-1')
        .mockResolvedValueOnce('/tmp/harness-comfyui-browser-port-attempt-2'),
    })
    fixture.options.preReadiness.infrastructureAttempts = 2

    await expect(new ChromeComfyFrontend(fixture.options).exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })).resolves.toEqual({ '1': { class_type: 'PromptNode', inputs: { text: 'a prompt' } } })
    expect(fixture.options.spawnImplementation).toHaveBeenCalledTimes(2)
  })

  it('stops after two pre-readiness failures and preserves the first failed stage', async () => {
    const firstCdp = session()
    firstCdp.send.mockImplementation(async method => {
      if (method === 'Page.navigate') throw new Error('first navigation failure')
      return {}
    })
    const secondCdp = session()
    secondCdp.connect.mockRejectedValue(new Error('second WebSocket failure'))
    const fixture = frontendOptions({
      spawnImplementation: vi.fn()
        .mockReturnValueOnce(new FakeBrowserProcess())
        .mockReturnValueOnce(new FakeBrowserProcess()),
      createCdpSession: vi.fn()
        .mockReturnValueOnce(firstCdp)
        .mockReturnValueOnce(secondCdp),
    })
    fixture.options.preReadiness.infrastructureAttempts = 2

    await expect(new ChromeComfyFrontend(fixture.options).exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })).rejects.toMatchObject({
      code: 'COMFYUI_FRONTEND_CDP_CONNECT_FAILED',
      message: expect.stringContaining('first browser attempt failed during stage "navigation"'),
      cause: expect.any(AggregateError),
    })
    expect(fixture.options.spawnImplementation).toHaveBeenCalledTimes(2)
  })

  it('reports each attempt outcome with bounded browser stderr and no temporary profile path', async () => {
    const firstCdp = session()
    firstCdp.send.mockImplementation(async method => {
      if (method === 'Page.navigate') throw new Error('navigation failed')
      return {}
    })
    const secondCdp = session()
    const firstChild = new FakeBrowserProcess()
    const secondChild = new FakeBrowserProcess()
    const reportDiagnostic = vi.fn()
    const fixture = frontendOptions({
      spawnImplementation: vi.fn()
        .mockImplementationOnce(() => {
          queueMicrotask(() => firstChild.stderr.emit(
            'data',
            `/tmp/harness-comfyui-browser-diagnostic-1\u0000 ${'x'.repeat(70_000)}`,
          ))
          return firstChild
        })
        .mockReturnValueOnce(secondChild),
      makeTemporaryDirectory: vi.fn()
        .mockResolvedValueOnce('/tmp/harness-comfyui-browser-diagnostic-1')
        .mockResolvedValueOnce('/tmp/harness-comfyui-browser-diagnostic-2'),
      createCdpSession: vi.fn()
        .mockReturnValueOnce(firstCdp)
        .mockReturnValueOnce(secondCdp),
      reportDiagnostic,
    })
    fixture.options.preReadiness.infrastructureAttempts = 2

    await new ChromeComfyFrontend(fixture.options).exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })

    expect(reportDiagnostic).toHaveBeenCalledTimes(2)
    expect(reportDiagnostic.mock.calls[0]?.[0]).toMatchObject({
      attempt: 1,
      status: 'failed',
      stage: 'navigation',
      code: 'COMFYUI_FRONTEND_NAVIGATION_FAILED',
    })
    const stderr = reportDiagnostic.mock.calls[0]?.[0].browserStderr as string
    expect(Buffer.byteLength(stderr, 'utf8')).toBeLessThanOrEqual(65_536)
    expect(stderr).not.toContain('/tmp/harness-comfyui-browser-diagnostic-1')
    expect(stderr).not.toContain('\u0000')
    expect(reportDiagnostic.mock.calls[1]?.[0]).toEqual({ attempt: 2, status: 'succeeded' })
  })

  it('reports a browser process error during frontend readiness as a browser failure', async () => {
    const fixture = frontendOptions()
    fixture.cdp.evaluate.mockReset().mockImplementation(() => {
      fixture.child.emit('error', new Error('browser crashed during readiness'))
      return new Promise(() => undefined)
    })

    await expect(new ChromeComfyFrontend(fixture.options).exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })).rejects.toMatchObject({
      code: 'COMFYUI_FRONTEND_BROWSER_FAILED',
      stage: 'readiness',
      operation: 'Runtime.evaluate',
      message: expect.stringContaining('stage "readiness" operation "Runtime.evaluate"'),
    })
    expect(fixture.cdp.close).toHaveBeenCalledOnce()
  })

  it('times out a pending frontend readiness evaluation and cleans the browser', async () => {
    const cdp = session()
    cdp.evaluate.mockReset().mockImplementation(async () => new Promise(() => undefined))
    const fixture = frontendOptions({ createCdpSession: vi.fn(() => cdp) })
    fixture.options.timeoutMs = 10
    const frontend = new ChromeComfyFrontend(fixture.options)

    await expect(frontend.exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })).rejects.toMatchObject({
      code: 'COMFYUI_FRONTEND_NOT_READY',
      stage: 'readiness',
      operation: 'Runtime.evaluate',
    })
    expect(cdp.close).toHaveBeenCalledOnce()
    expect(fixture.child.kill).toHaveBeenCalledWith('SIGTERM')
  }, 500)

  it('returns the export error code when graphToPrompt throws or returns an invalid output', async () => {
    const throwingSession = session()
    throwingSession.evaluate.mockReset()
      .mockResolvedValueOnce({ documentReady: true, hasApp: true, splashVisible: false })
      .mockRejectedValueOnce(new Error('graphToPrompt failed'))
    const first = frontendOptions({ createCdpSession: vi.fn(() => throwingSession) })
    first.options.preReadiness.infrastructureAttempts = 2

    await expect(new ChromeComfyFrontend(first.options).exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })).rejects.toMatchObject({
      code: 'COMFYUI_FRONTEND_EXPORT_FAILED',
      stage: 'export',
      operation: 'Runtime.evaluate',
    })

    const invalidSession = session()
    invalidSession.evaluate.mockReset()
      .mockResolvedValueOnce({ documentReady: true, hasApp: true, splashVisible: false })
      .mockResolvedValueOnce({ output: null })
    const second = frontendOptions({ createCdpSession: vi.fn(() => invalidSession) })
    second.options.preReadiness.infrastructureAttempts = 2
    await expect(new ChromeComfyFrontend(second.options).exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })).rejects.toMatchObject({
      code: 'COMFYUI_FRONTEND_EXPORT_FAILED',
      stage: 'export',
      operation: 'Runtime.evaluate',
    })
    expect(first.options.spawnImplementation).toHaveBeenCalledOnce()
    expect(second.options.spawnImplementation).toHaveBeenCalledOnce()
  })

  it('reports a browser close during graphToPrompt as a browser failure', async () => {
    const fixture = frontendOptions()
    fixture.cdp.evaluate.mockReset()
      .mockResolvedValueOnce({ documentReady: true, hasApp: true, splashVisible: false })
      .mockImplementationOnce(() => {
        fixture.child.exitCode = 9
        fixture.child.emit('close', 9, null)
        return new Promise(() => undefined)
      })

    await expect(new ChromeComfyFrontend(fixture.options).exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })).rejects.toMatchObject({
      code: 'COMFYUI_FRONTEND_BROWSER_FAILED',
      stage: 'export',
      operation: 'Runtime.evaluate',
      message: expect.stringContaining('stage "export" operation "Runtime.evaluate"'),
    })
    expect(fixture.cdp.close).toHaveBeenCalledOnce()
  })

  it('times out a pending graphToPrompt evaluation and cleans the browser', async () => {
    const cdp = session()
    cdp.evaluate.mockReset()
      .mockResolvedValueOnce({ documentReady: true, hasApp: true, splashVisible: false })
      .mockImplementationOnce(async () => new Promise(() => undefined))
    const fixture = frontendOptions({ createCdpSession: vi.fn(() => cdp) })
    fixture.options.timeoutMs = 10
    fixture.options.preReadiness.infrastructureAttempts = 2
    const frontend = new ChromeComfyFrontend(fixture.options)

    await expect(frontend.exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })).rejects.toMatchObject({
      code: 'COMFYUI_FRONTEND_EXPORT_FAILED',
      stage: 'export',
      operation: 'Runtime.evaluate',
    })
    expect(cdp.close).toHaveBeenCalledOnce()
    expect(fixture.child.kill).toHaveBeenCalledWith('SIGTERM')
  }, 500)

  it('preserves caller cancellation and still cleans the browser process', async () => {
    const controller = new AbortController()
    const fixture = frontendOptions({
      readTextFile: vi.fn(async () => {
        controller.abort()
        const error = new Error('missing') as NodeJS.ErrnoException
        error.code = 'ENOENT'
        throw error
      }),
    })
    fixture.options.preReadiness.infrastructureAttempts = 2
    const frontend = new ChromeComfyFrontend(fixture.options)

    await expect(frontend.exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      signal: controller.signal,
    })).rejects.toMatchObject({ code: 'COMFYUI_REQUEST_CANCELED' })
    expect(fixture.child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(fixture.options.spawnImplementation).toHaveBeenCalledOnce()
  })

  it('forces only its own Chrome child to exit when SIGTERM does not stop it', async () => {
    const child = new FakeBrowserProcess(false)
    const fixture = frontendOptions({
      spawnImplementation: vi.fn(() => child),
      delay: vi.fn(async () => undefined),
    })

    await new ChromeComfyFrontend(fixture.options).exportWorkflow({
      workflow: workflow(),
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    })

    expect(child.kill.mock.calls.map(call => call[0])).toEqual(['SIGTERM', 'SIGKILL'])
  })
})

class FakeWebSocket implements WebSocketLike {
  readonly listeners = new Map<string, Set<(event: { data?: unknown }) => void>>()
  readonly send = vi.fn((contents: string) => {
    const request = JSON.parse(contents) as { id: number; method: string }
    const result = request.method === 'Runtime.evaluate'
      ? { result: { value: 'evaluated' } }
      : { acknowledged: true }
    queueMicrotask(() => this.emit('message', { data: JSON.stringify({ id: request.id, result }) }))
  })
  readonly close = vi.fn()

  addEventListener(type: string, listener: (event: { data?: unknown }) => void, options?: { once?: boolean }): void {
    const listeners = this.listeners.get(type) ?? new Set()
    const registered = options?.once === true
      ? (event: { data?: unknown }) => {
          listeners.delete(registered)
          listener(event)
        }
      : listener
    listeners.add(registered)
    this.listeners.set(type, listeners)
  }

  emit(type: string, event: { data?: unknown } = {}): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event)
  }
}

describe('WebSocketCdpSession', () => {
  it('connects, sends CDP commands, evaluates values, and closes the socket', async () => {
    const socket = new FakeWebSocket()
    const cdp = new WebSocketCdpSession('ws://127.0.0.1/devtools/page/1', () => socket)
    const receivedEvent = vi.fn()
    cdp.onEvent('Fetch.requestPaused', receivedEvent)
    const connecting = cdp.connect()
    socket.emit('open')
    await connecting

    await expect(cdp.send('Page.enable')).resolves.toEqual({ acknowledged: true })
    await expect(cdp.evaluate('1 + 1')).resolves.toBe('evaluated')
    socket.emit('message', { data: JSON.stringify({ method: 'Fetch.requestPaused', params: { requestId: 'request-1' } }) })
    expect(receivedEvent).toHaveBeenCalledWith({ requestId: 'request-1' })
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('Runtime.evaluate'))
    cdp.close()
    expect(socket.close).toHaveBeenCalledOnce()
  })

  it('reports socket connection and CDP evaluation errors', async () => {
    const connectingSocket = new FakeWebSocket()
    const connecting = new WebSocketCdpSession('ws://127.0.0.1/devtools/page/1', () => connectingSocket)
    const connection = connecting.connect()
    connectingSocket.emit('error')
    await expect(connection).rejects.toThrow('WebSocket')

    const commandSocket = new FakeWebSocket()
    commandSocket.send.mockImplementationOnce((contents: string) => {
      const request = JSON.parse(contents) as { id: number }
      queueMicrotask(() => commandSocket.emit('message', { data: JSON.stringify({ id: request.id, error: { message: 'CDP failed' } }) }))
    }).mockImplementationOnce((contents: string) => {
      const request = JSON.parse(contents) as { id: number }
      queueMicrotask(() => commandSocket.emit('message', { data: JSON.stringify({
        id: request.id,
        result: { exceptionDetails: { text: 'evaluation failed' } },
      }) }))
    })
    const command = new WebSocketCdpSession('ws://127.0.0.1/devtools/page/1', () => commandSocket)
    const opened = command.connect()
    commandSocket.emit('open')
    await opened
    await expect(command.send('Page.enable')).rejects.toThrow('CDP failed')
    await expect(command.evaluate('throw new Error()')).rejects.toThrow('evaluation failed')
  })

  it('closes a pending DevTools WebSocket connection when its signal is canceled', async () => {
    const socket = new FakeWebSocket()
    const controller = new AbortController()
    const cdp = new WebSocketCdpSession('ws://127.0.0.1/devtools/page/1', () => socket)
    const connecting = cdp.connect(controller.signal)

    controller.abort()

    await expect(connecting).rejects.toThrow('canceled')
    expect(socket.close).toHaveBeenCalledOnce()
  })

  it('rejects pending and future commands with their CDP method when the connected socket closes', async () => {
    const socket = new FakeWebSocket()
    socket.send.mockImplementation(() => undefined)
    const cdp = new WebSocketCdpSession('ws://127.0.0.1/devtools/page/1', () => socket)
    const connecting = cdp.connect()
    socket.emit('open')
    await connecting

    const navigation = cdp.send('Page.navigate')
    const evaluation = cdp.send('Runtime.evaluate')
    socket.emit('close')

    await expect(navigation).rejects.toThrow('Page.navigate')
    await expect(evaluation).rejects.toThrow('Runtime.evaluate')
    await expect(cdp.send('Page.enable')).rejects.toThrow('Page.enable')
  })

  it('rejects every pending command with its CDP method when the connected socket errors', async () => {
    const socket = new FakeWebSocket()
    socket.send.mockImplementation(() => undefined)
    const cdp = new WebSocketCdpSession('ws://127.0.0.1/devtools/page/1', () => socket)
    const connecting = cdp.connect()
    socket.emit('open')
    await connecting

    const results = Promise.allSettled([
      cdp.send('Page.navigate'),
      cdp.send('Runtime.evaluate'),
      cdp.send('Network.enable'),
    ])
    socket.emit('error')

    await expect(results).resolves.toEqual([
      expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ message: expect.stringContaining('Page.navigate') }) }),
      expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ message: expect.stringContaining('Runtime.evaluate') }) }),
      expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ message: expect.stringContaining('Network.enable') }) }),
    ])
  })

  it('rejects a synchronous socket send failure with the command method and remains closeable', async () => {
    const socket = new FakeWebSocket()
    const cdp = new WebSocketCdpSession('ws://127.0.0.1/devtools/page/1', () => socket)
    const connecting = cdp.connect()
    socket.emit('open')
    await connecting
    socket.send.mockImplementationOnce(() => { throw new Error('socket send failed') })

    await expect(cdp.send('Page.navigate')).rejects.toThrow('Page.navigate')
    cdp.close()
    cdp.close()

    expect(socket.close).toHaveBeenCalledOnce()
  })
})

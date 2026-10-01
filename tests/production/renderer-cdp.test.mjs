import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseDesktopE2EConfig } from '../../config/desktop-e2e-schema.mjs'
import {
  connectDesktopBrowserWithTransportForTest as connectDesktopBrowser,
  connectDesktopPageWithTransportForTest as connectDesktopPage,
  connectDesktopPage as connectVerifiedDesktopPage,
  expectCompletedDownload,
  getDesktopPageConnectionIdentity,
  loadRendererCDPConfig,
  assertRendererRunOwnershipForTest,
} from '../desktop/fixtures/renderer-cdp.mjs'

const PORT = 43_123
const temporaryRoots = new Set()

afterEach(async () => {
  vi.doUnmock('../desktop/fixtures/official-desktop-probe.mjs')
  vi.doUnmock('undici')
  vi.unstubAllGlobals()
  vi.resetModules()
  await Promise.all([...temporaryRoots].map(root => rm(root, { recursive: true, force: true })))
  temporaryRoots.clear()
})

async function rendererOwnershipFixture(config) {
  const runId = '00000000-0000-4000-8000-000000000123'
  const repositoryRoot = await realpath(await mkdtemp(join(tmpdir(), 'renderer-cdp-test-')))
  temporaryRoots.add(repositoryRoot)
  const runDirectory = join(repositoryRoot, config.paths.runRootRelativePath, runId)
  const directories = {
    run: runDirectory,
    dshHome: join(runDirectory, config.paths.directoryNames.dshHome),
    electronUserData: join(runDirectory, config.paths.directoryNames.electronUserData),
    workspace: join(runDirectory, config.paths.directoryNames.workspace),
    logs: join(runDirectory, config.paths.directoryNames.logs),
    evidence: join(runDirectory, config.paths.directoryNames.evidence),
    profile: join(runDirectory, config.paths.directoryNames.dshHome, config.paths.profileRelativePath),
    diagnosticFile: join(runDirectory, config.paths.directoryNames.logs, config.paths.diagnosticFilename),
  }
  const executablePath = `${config.application.bundlePath}/${config.application.executableRelativePath}`
  const pid = 20_000
  const ports = Object.fromEntries(config.ports.roles.map((role, index) => [role, 43_121 + index]))
  const rendererPort = ports.rendererCdp
  const now = new Date().toISOString()
  const record = {
    schemaVersion: 1,
    runId,
    mode: 'fresh',
    state: 'running',
    createdAt: now,
    updatedAt: now,
    application: {
      bundlePath: config.application.bundlePath,
      executablePath,
      version: config.application.version,
      bundleId: config.application.bundleId,
    },
    directories,
    environment: { root: null, leasePath: null },
    ports,
    launch: { arguments: [], environment: {}, unsetEnvironmentNames: [] },
    process: {
      pid,
      processGroupId: pid,
      command: executablePath,
      workingDirectory: directories.workspace,
      listeningPorts: config.ports.requiredForReady.map(role => ports[role]),
      observedAt: now,
    },
    result: null,
  }
  const processGroup = {
    processGroupId: pid,
    members: [{
      pid,
      parentPid: 1,
      processGroupId: pid,
      command: executablePath,
      workingDirectory: directories.workspace,
      listeningPorts: record.process.listeningPorts,
    }],
  }
  return {
    repositoryRoot,
    runId,
    rendererPort,
    optionalPort: ports.hostInspector,
    status: {
      record,
      recordPath: join(runDirectory, config.paths.runRecordFilename),
      processGroupMatchesRun: true,
      processGroup,
      ports: config.ports.roles.map(role => ({
        port: ports[role],
        pids: config.ports.requiredForReady.includes(role) ? [pid] : [],
      })),
    },
  }
}

function controlledTransport({
  targets,
  respondToCommand,
  autoClose = true,
  openFailure = false,
  closeFailure,
  webSocketConstructionFailure,
  agentCloseFailure,
  agentDestroyFailure,
} = {}) {
  const requests = []
  const requestOptions = []
  const sockets = []
  const agents = []
  const cleanupEvents = []
  const targetList = targets ?? [{
    id: 'renderer-page',
    type: 'page',
    title: 'DeepSeek Harness',
    url: 'dsh-app://app/index.html',
    webSocketDebuggerUrl: `ws://127.0.0.1:${PORT}/devtools/page/renderer-page`,
  }]

  class ControlledWebSocket extends EventTarget {
    constructor(url, options) {
      super()
      if (webSocketConstructionFailure !== undefined) throw webSocketConstructionFailure
      this.url = url
      this.options = options
      this.readyState = 0
      this.closeCount = 0
      this.listeners = new Map()
      sockets.push(this)
      queueMicrotask(() => {
        this.readyState = openFailure ? 0 : 1
        this.dispatchEvent(new Event(openFailure ? 'error' : 'open'))
      })
    }

    addEventListener(type, listener, options) {
      super.addEventListener(type, listener, options)
      const listeners = this.listeners.get(type) ?? new Set()
      listeners.add(listener)
      this.listeners.set(type, listeners)
    }

    removeEventListener(type, listener, options) {
      super.removeEventListener(type, listener, options)
      this.listeners.get(type)?.delete(listener)
    }

    listenerCount(type) {
      return this.listeners.get(type)?.size ?? 0
    }

    send(payload) {
      const request = JSON.parse(payload)
      const response = respondToCommand === undefined ? {
        id: request.id,
        result: request.method === 'Runtime.evaluate'
          ? { result: { type: 'string', value: 'renderer-ready' } }
          : {},
      } : respondToCommand(request)
      if (response !== null) queueMicrotask(() => this.receive(response))
    }

    receive(message) {
      this.receiveRaw(JSON.stringify(message))
    }

    receiveRaw(payload) {
      const event = new Event('message')
      Object.defineProperty(event, 'data', { value: payload })
      this.dispatchEvent(event)
    }

    fail(error) {
      const event = new Event('error')
      Object.defineProperty(event, 'error', { value: error })
      this.dispatchEvent(event)
    }

    close() {
      this.closeCount += 1
      cleanupEvents.push('socket.close')
      if (closeFailure !== undefined) throw closeFailure
      this.readyState = 3
      if (autoClose) this.dispatchEvent(new Event('close'))
    }
  }

  class ControlledAgent {
    constructor(options) {
      this.options = options
      this.closeCount = 0
      this.destroyCount = 0
      agents.push(this)
    }

    async close() {
      this.closeCount += 1
      cleanupEvents.push('agent.close')
      if (agentCloseFailure !== undefined) throw agentCloseFailure
    }

    async destroy() {
      this.destroyCount += 1
      cleanupEvents.push('agent.destroy')
      if (agentDestroyFailure !== undefined) throw agentDestroyFailure
    }
  }

  return {
    requests,
    requestOptions,
    sockets,
    agents,
    cleanupEvents,
    transport: {
      fetch: async (url, options) => {
        requests.push(String(url))
        requestOptions.push(options)
        const pathname = new URL(String(url)).pathname
        const body = pathname === '/json/list'
          ? targetList
          : pathname === '/json/version'
            ? { webSocketDebuggerUrl: `ws://127.0.0.1:${PORT}/devtools/browser/browser` }
            : null
        return {
          ok: body !== null,
          status: body === null ? 404 : 200,
          redirected: false,
          url: String(url),
          json: async () => body,
        }
      },
      WebSocket: ControlledWebSocket,
      Agent: ControlledAgent,
    },
  }
}

function mockUndiciForPublicConnector({ events = [], sockets = [] } = {}) {
  const agents = []
  class PublicAgent {
    constructor(options) {
      this.options = options
      agents.push(this)
    }

    async close() {}
    async destroy() {}
  }
  class PublicWebSocket extends EventTarget {
    constructor(url, options) {
      super()
      events.push('websocket')
      this.url = url
      this.options = options
      this.readyState = 0
      sockets.push(this)
      queueMicrotask(() => {
        this.readyState = 1
        this.dispatchEvent(new Event('open'))
      })
    }

    send() {}
    close() {
      this.readyState = 3
      this.dispatchEvent(new Event('close'))
    }
  }
  vi.doMock('undici', () => ({ Agent: PublicAgent, WebSocket: PublicWebSocket }))
  return { agents, sockets }
}

describe('official Desktop Renderer CDP connection', () => {
  it('validates the finite WebSocket payload budget from shared Desktop E2E config', async () => {
    const config = await loadRendererCDPConfig()

    expect(parseDesktopE2EConfig({ ...config, rendererCdp: { maxPayloadSize: 1 } }).rendererCdp.maxPayloadSize).toBe(1)
    expect(() => parseDesktopE2EConfig({ ...config, rendererCdp: { maxPayloadSize: 0 } }))
      .toThrow(/rendererCdp\.maxPayloadSize must be an integer/u)
    expect(() => parseDesktopE2EConfig({ ...config, rendererCdp: { maxPayloadSize: 67_108_865 } }))
      .toThrow(/rendererCdp\.maxPayloadSize must be an integer/u)
    expect(() => parseDesktopE2EConfig({ ...config, rendererCdp: { maxPayloadSize: 67_108_864, extra: true } }))
      .toThrow(/rendererCdp must contain exactly maxPayloadSize/u)
  })

  it('requires current-run identity before any public CDP transport can be used', async () => {
    const fake = controlledTransport()

    await expect(connectDesktopPage(PORT)).rejects.toThrow(/test transport is required/u)
    await expect(connectVerifiedDesktopPage(PORT, { transport: fake.transport }))
      .rejects.toThrow(/unexpected keys.*transport/u)
    await expect(connectVerifiedDesktopPage(PORT))
      .rejects.toThrow(/requires the current Desktop runId/u)
    await expect(connectVerifiedDesktopPage(PORT, {
      runId: '00000000-0000-4000-8000-000000000123',
      repositoryRoot: process.cwd(),
    })).rejects.toThrow(/requires the configured desktop E2E config/u)
    expect(fake.requests).toHaveLength(0)
    expect(fake.sockets).toHaveLength(0)
  })

  it.each(['page', 'browser'])('uses the verified public %s connection in probe-fetch-probe-WebSocket order', async kind => {
    const config = await loadRendererCDPConfig()
    const fixture = await rendererOwnershipFixture(config)
    const events = []
    const statusCalls = []
    vi.resetModules()
    vi.doMock('../desktop/fixtures/official-desktop-probe.mjs', async () => {
      const actual = await vi.importActual('../desktop/fixtures/official-desktop-probe.mjs')
      return {
        ...actual,
        getProbeStatus: vi.fn(async options => {
          events.push('probe')
          statusCalls.push(options)
          return fixture.status
        }),
      }
    })
    const requests = []
    vi.stubGlobal('fetch', async (url, options) => {
      events.push('fetch')
      requests.push({ url: String(url), options })
      const endpoint = new URL(String(url))
      const body = endpoint.pathname === '/json/version'
        ? { webSocketDebuggerUrl: `ws://${config.ports.host}:${fixture.rendererPort}/devtools/browser/verified-browser` }
        : [{
          id: 'verified-renderer-page',
          type: 'page',
          title: config.readiness.rendererTargetTitle,
          url: `${config.readiness.applicationUrlPrefix}app/`,
          webSocketDebuggerUrl: `ws://${config.ports.host}:${fixture.rendererPort}/devtools/page/verified-renderer-page`,
        }]
      return { ok: true, status: 200, redirected: false, url: String(url), json: async () => body }
    })
    const { sockets } = mockUndiciForPublicConnector({ events })

    const { connectDesktopBrowser, connectDesktopPage } = await import('../desktop/fixtures/renderer-cdp.mjs')
    const options = {
      runId: fixture.status.record.runId,
      repositoryRoot: fixture.repositoryRoot,
      config,
      timeoutMs: 1_000,
    }
    const connection = kind === 'browser'
      ? await connectDesktopBrowser(fixture.rendererPort, options)
      : await connectDesktopPage(fixture.rendererPort, options)

    expect(events).toEqual(['probe', 'fetch', 'probe', 'websocket'])
    expect(statusCalls).toHaveLength(2)
    expect(statusCalls).toEqual([
      expect.objectContaining({ runId: options.runId, repositoryRoot: fixture.repositoryRoot, config }),
      expect.objectContaining({ runId: options.runId, repositoryRoot: fixture.repositoryRoot, config }),
    ])
    expect(requests).toHaveLength(1)
    expect(requests[0].options.redirect).toBe('error')
    expect(sockets).toHaveLength(1)
    await connection.close()
  })

  it.each([
    ['page', 'missing'],
    ['page', 'foreign'],
    ['browser', 'missing'],
    ['browser', 'foreign'],
  ])('rejects the public %s connector before fetch when required-port ownership is %s', async (kind, ownerState) => {
    const config = await loadRendererCDPConfig()
    const fixture = await rendererOwnershipFixture(config)
    const foreignStatus = structuredClone(fixture.status)
    foreignStatus.ports.find(owner => owner.port === fixture.rendererPort).pids = ownerState === 'missing'
      ? []
      : [fixture.status.record.process.pid, 99_991]
    const events = []
    vi.resetModules()
    vi.doMock('../desktop/fixtures/official-desktop-probe.mjs', async () => {
      const actual = await vi.importActual('../desktop/fixtures/official-desktop-probe.mjs')
      return {
        ...actual,
        getProbeStatus: async () => {
          events.push('probe')
          return foreignStatus
        },
      }
    })
    vi.stubGlobal('fetch', async () => {
      events.push('fetch')
      return { ok: true, status: 200, redirected: false, url: `http://127.0.0.1:${fixture.rendererPort}/json/list`, json: async () => [] }
    })
    mockUndiciForPublicConnector({ events })
    const { connectDesktopBrowser, connectDesktopPage } = await import('../desktop/fixtures/renderer-cdp.mjs')
    const connect = kind === 'browser' ? connectDesktopBrowser : connectDesktopPage

    await expect(connect(fixture.rendererPort, {
      runId: fixture.status.record.runId,
      repositoryRoot: fixture.repositoryRoot,
      config,
      timeoutMs: 1_000,
    })).rejects.toThrow(/required port role rendererCdp/u)
    expect(events).toEqual(['probe'])
  })

  it.each(['config', 'repositoryRoot', 'runId'])('rejects the public page connector before transport for a mismatched %s', async mismatch => {
    const config = await loadRendererCDPConfig()
    const fixture = await rendererOwnershipFixture(config)
    const events = []
    vi.resetModules()
    vi.doMock('../desktop/fixtures/official-desktop-probe.mjs', async () => {
      const actual = await vi.importActual('../desktop/fixtures/official-desktop-probe.mjs')
      return {
        ...actual,
        getProbeStatus: async () => {
          events.push('probe')
          return fixture.status
        },
      }
    })
    vi.stubGlobal('fetch', async () => {
      events.push('fetch')
      return { ok: true, status: 200, redirected: false, url: `http://${config.ports.host}:${fixture.rendererPort}/json/list`, json: async () => [] }
    })
    mockUndiciForPublicConnector({ events })
    const { connectDesktopPage } = await import('../desktop/fixtures/renderer-cdp.mjs')
    const options = {
      runId: fixture.status.record.runId,
      repositoryRoot: fixture.repositoryRoot,
      config,
      timeoutMs: 1_000,
    }
    if (mismatch === 'config') {
      options.config = structuredClone(config)
      options.config.application.version = '9.9.9'
    } else if (mismatch === 'repositoryRoot') {
      options.repositoryRoot = await realpath(await mkdtemp(join(tmpdir(), 'renderer-cdp-other-root-')))
      temporaryRoots.add(options.repositoryRoot)
    } else {
      options.runId = '00000000-0000-4000-8000-000000000124'
    }

    await expect(connectDesktopPage(fixture.rendererPort, options)).rejects.toThrow(/identity|runId|recordPath/u)
    expect(events).toEqual(['probe'])
  })

  it('rechecks process and port ownership after the HTTP target read and immediately before creating the WebSocket', async () => {
    const config = await loadRendererCDPConfig()
    const fixture = await rendererOwnershipFixture(config)
    const stoppedStatus = structuredClone(fixture.status)
    stoppedStatus.ports.find(owner => owner.port === fixture.rendererPort).pids = []
    const events = []
    let probeCount = 0
    vi.resetModules()
    vi.doMock('../desktop/fixtures/official-desktop-probe.mjs', async () => {
      const actual = await vi.importActual('../desktop/fixtures/official-desktop-probe.mjs')
      return {
        ...actual,
        getProbeStatus: async () => {
          events.push('probe')
          probeCount += 1
          return probeCount === 1 ? fixture.status : stoppedStatus
        },
      }
    })
    vi.stubGlobal('fetch', async (url) => {
      events.push('fetch')
      const endpoint = new URL(String(url))
      const body = endpoint.pathname === '/json/list'
        ? [{
          id: 'verified-renderer-page',
          type: 'page',
          title: config.readiness.rendererTargetTitle,
          url: `${config.readiness.applicationUrlPrefix}app/`,
          webSocketDebuggerUrl: `ws://${config.ports.host}:${fixture.rendererPort}/devtools/page/verified-renderer-page`,
        }]
        : { webSocketDebuggerUrl: `ws://${config.ports.host}:${fixture.rendererPort}/devtools/browser/verified-browser` }
      return { ok: true, status: 200, redirected: false, url: String(url), json: async () => body }
    })
    const { sockets } = mockUndiciForPublicConnector()
    const { connectDesktopPage } = await import('../desktop/fixtures/renderer-cdp.mjs')

    await expect(connectDesktopPage(fixture.rendererPort, {
      runId: fixture.status.record.runId,
      repositoryRoot: fixture.repositoryRoot,
      config,
      timeoutMs: 1_000,
    })).rejects.toThrow(/required port role rendererCdp/u)
    expect(events).toEqual(['probe', 'fetch', 'probe'])
    expect(sockets).toHaveLength(0)
  })

  it('connects to the configured loopback page and exposes its target and commands', async () => {
    const config = await loadRendererCDPConfig()
    const fake = controlledTransport()

    const page = await connectDesktopPage(PORT, { transport: fake.transport, timeoutMs: 100 })

    expect(Object.isFrozen(page)).toBe(true)
    expect(() => { page.command = () => Promise.resolve({}) }).toThrow()
    expect(fake.requests).toEqual([`http://${config.ports.host}:${PORT}/json/list`])
    expect(page.target).toMatchObject({
      id: 'renderer-page',
      title: config.readiness.rendererTargetTitle,
      url: `${config.readiness.applicationUrlPrefix}app/index.html`,
    })
    expect(await page.command('Page.enable')).toEqual({})
    expect(await page.evaluate('document.readyState')).toBe('renderer-ready')
    expect(fake.sockets[0].url).toBe(`ws://${config.ports.host}:${PORT}/devtools/page/renderer-page`)

    await page.close()
    expect(fake.sockets[0].closeCount).toBe(1)
  })

  it('uses the configured Undici payload limit and closes the owned Agent once after the socket', async () => {
    const config = await loadRendererCDPConfig()
    const fake = controlledTransport()
    const page = await connectDesktopPage(PORT, { transport: fake.transport, timeoutMs: 100 })
    const socket = fake.sockets[0]
    const agent = fake.agents[0]

    expect(config.rendererCdp.maxPayloadSize).toBe(67_108_864)
    expect(fake.agents).toHaveLength(1)
    expect(agent.options).toEqual({ webSocket: { maxPayloadSize: config.rendererCdp.maxPayloadSize } })
    expect(socket.options).toEqual({ dispatcher: agent })

    const firstClose = page.close()
    const secondClose = page.close()
    await Promise.all([firstClose, secondClose])

    expect(fake.cleanupEvents).toEqual(['socket.close', 'agent.close'])
    expect(agent.closeCount).toBe(1)
    expect(agent.destroyCount).toBe(0)
  })

  it('destroys the owned Agent when WebSocket construction fails', async () => {
    const failure = new Error('WebSocket constructor failed')
    const fake = controlledTransport({ webSocketConstructionFailure: failure })

    await expect(connectDesktopPage(PORT, { transport: fake.transport, timeoutMs: 100 })).rejects.toBe(failure)

    expect(fake.agents).toHaveLength(1)
    expect(fake.agents[0].destroyCount).toBe(1)
    expect(fake.agents[0].closeCount).toBe(0)
    expect(fake.sockets).toHaveLength(0)
  })

  it('destroys the owned Agent after a WebSocket open failure', async () => {
    const fake = controlledTransport({ openFailure: true })

    await expect(connectDesktopPage(PORT, { transport: fake.transport, timeoutMs: 100 }))
      .rejects.toThrow(/WebSocket failed before opening/u)

    expect(fake.sockets[0].closeCount).toBe(1)
    expect(fake.agents[0].destroyCount).toBe(1)
    expect(fake.agents[0].closeCount).toBe(0)
    expect(fake.cleanupEvents).toEqual(['socket.close', 'agent.destroy'])
  })

  it('destroys the Agent when the socket close handshake fails and preserves cleanup errors', async () => {
    const socketFailure = new Error('socket close failed')
    const agentFailure = new Error('Agent destroy failed')
    const fake = controlledTransport({ closeFailure: socketFailure, agentDestroyFailure: agentFailure })
    const page = await connectDesktopPage(PORT, { transport: fake.transport, timeoutMs: 100 })

    const error = await page.close(100).catch(value => value)

    expect(error).toBeInstanceOf(AggregateError)
    expect(error.errors.some(item => item.cause === socketFailure)).toBe(true)
    expect(error.errors.some(item => item.cause === agentFailure)).toBe(true)
    expect(fake.agents[0].destroyCount).toBe(1)
    expect(fake.agents[0].closeCount).toBe(0)
  })

  it('reports an Agent close failure and never repeats cleanup', async () => {
    const failure = new Error('Agent close failed')
    const fake = controlledTransport({ agentCloseFailure: failure })
    const page = await connectDesktopPage(PORT, { transport: fake.transport, timeoutMs: 100 })

    await expect(page.close()).rejects.toThrow(/Agent close failed/u)
    await expect(page.close()).rejects.toThrow(/Agent close failed/u)
    expect(fake.agents[0].closeCount).toBe(1)
    expect(fake.agents[0].destroyCount).toBe(1)
  })

  it('waits only for a matching Debugger.scriptParsed event on a verified page', async () => {
    const fake = controlledTransport()
    const page = await connectDesktopPage(PORT, { transport: fake.transport, timeoutMs: 100 })
    expect(page.waitForEvent).toBeUndefined()
    const parsed = page.waitForDebuggerScript(params => params.url === 'file:///candidate/client.js', 100)
    fake.sockets[0].receive({ method: 'Runtime.consoleAPICalled', params: { type: 'log' } })
    fake.sockets[0].receive({ method: 'Debugger.scriptParsed', params: {
      scriptId: 'candidate-client-script',
      url: 'file:///candidate/client.js',
      executionContextId: 1,
      hash: 'transport-value-is-ignored',
    } })

    await expect(parsed).resolves.toMatchObject({ scriptId: 'candidate-client-script', url: 'file:///candidate/client.js' })
    await expect(page.waitForDebuggerScript(undefined, 20)).rejects.toThrow(/predicate must be a function/u)
    await page.close()
  })

  it('waits for a new candidate scriptParsed event instead of reusing the prior document script id', async () => {
    const fake = controlledTransport()
    const page = await connectDesktopPage(PORT, { transport: fake.transport, timeoutMs: 100 })
    const url = 'dsh-app://app/plugins/??harness-comfyui/client.js&rev=66fdfd55bb7d'
    fake.sockets[0].receive({ method: 'Debugger.scriptParsed', params: { scriptId: 'old-document-script', url } })

    const parsed = page.waitForDebuggerScript(params => params.url === url, 100)
    fake.sockets[0].receive({ method: 'Debugger.scriptParsed', params: { scriptId: 'new-document-script', url } })

    await expect(parsed).resolves.toMatchObject({ scriptId: 'new-document-script', url })
    await page.close()
  })

  it('times out when no Debugger.scriptParsed event arrives and rejects a waiter when the page closes', async () => {
    const noEvent = controlledTransport()
    const timeoutPage = await connectDesktopPage(PORT, { transport: noEvent.transport, timeoutMs: 100 })
    const timeout = timeoutPage.waitForDebuggerScript(() => true, 5)
    noEvent.sockets[0].receive({ method: 'Runtime.consoleAPICalled', params: { type: 'log' } })
    await expect(timeout).rejects.toThrow(/timed out waiting for Debugger\.scriptParsed/u)
    await timeoutPage.close()

    const closes = controlledTransport()
    const closedPage = await connectDesktopPage(PORT, { transport: closes.transport, timeoutMs: 100 })
    const closed = closedPage.waitForDebuggerScript(() => true, 10_000)
    closes.sockets[0].close()
    await expect(closed).rejects.toThrow(/WebSocket closed/u)
    await closedPage.close()
  })

  it('validates run ownership for required ports and allows an unowned optional inspector reservation', async () => {
    const config = await loadRendererCDPConfig()
    const { status, rendererPort, optionalPort, runId, repositoryRoot } = await rendererOwnershipFixture(config)

    expect((await assertRendererRunOwnershipForTest(status, rendererPort, config, runId, repositoryRoot)).ports.rendererCdp).toBe(rendererPort)
    await expect(assertRendererRunOwnershipForTest(status, rendererPort + 20, config, runId, repositoryRoot))
      .rejects.toThrow(/does not match the verified run rendererCdp port/u)
    await expect(assertRendererRunOwnershipForTest(status, rendererPort, config, '00000000-0000-4000-8000-000000000124', repositoryRoot))
      .rejects.toThrow(/does not match the requested runId/u)

    const missingRequiredOwner = structuredClone(status)
    missingRequiredOwner.ports.find(owner => owner.port === rendererPort).pids = []
    await expect(assertRendererRunOwnershipForTest(missingRequiredOwner, rendererPort, config, runId, repositoryRoot))
      .rejects.toThrow(/required port role rendererCdp/u)

    const mismatchedGroup = structuredClone(status)
    mismatchedGroup.processGroup.members[0].workingDirectory = '/tmp/another-run'
    await expect(assertRendererRunOwnershipForTest(mismatchedGroup, rendererPort, config, runId, repositoryRoot))
      .rejects.toThrow(/process group does not match/u)

    const foreignOptionalOwner = structuredClone(status)
    foreignOptionalOwner.ports.find(owner => owner.port === optionalPort).pids = [20_001]
    await expect(assertRendererRunOwnershipForTest(foreignOptionalOwner, rendererPort, config, runId, repositoryRoot))
      .rejects.toThrow(/optional port role hostInspector has a foreign owner/u)

    const wrongRecordPath = structuredClone(status)
    wrongRecordPath.recordPath = join(repositoryRoot, 'another-repository', 'run.json')
    await expect(assertRendererRunOwnershipForTest(wrongRecordPath, rendererPort, config, runId, repositoryRoot))
      .rejects.toThrow(/recordPath.*does not belong to the requested run/u)

    const wrongRunDirectory = structuredClone(status)
    const alternateRun = join(status.record.directories.run, 'unexpected-run')
    wrongRunDirectory.record.directories = {
      run: alternateRun,
      dshHome: join(alternateRun, config.paths.directoryNames.dshHome),
      electronUserData: join(alternateRun, config.paths.directoryNames.electronUserData),
      workspace: join(alternateRun, config.paths.directoryNames.workspace),
      logs: join(alternateRun, config.paths.directoryNames.logs),
      evidence: join(alternateRun, config.paths.directoryNames.evidence),
      profile: join(alternateRun, config.paths.directoryNames.dshHome, config.paths.profileRelativePath),
      diagnosticFile: join(alternateRun, config.paths.directoryNames.logs, config.paths.diagnosticFilename),
    }
    await expect(assertRendererRunOwnershipForTest(wrongRunDirectory, rendererPort, config, runId, repositoryRoot))
      .rejects.toThrow(/directories.run.*does not belong to the requested run/u)

    const wrongWorkspace = structuredClone(status)
    wrongWorkspace.record.directories.workspace = join(status.record.directories.run, 'alternate-workspace')
    await expect(assertRendererRunOwnershipForTest(wrongWorkspace, rendererPort, config, runId, repositoryRoot))
      .rejects.toThrow(/directory workspace.*does not match the configured run layout/u)

    for (const field of ['bundlePath', 'executableRelativePath', 'bundleId', 'version']) {
      const wrongConfig = structuredClone(config)
      wrongConfig.application[field] = {
        bundlePath: '/Applications/Other Desktop.app',
        executableRelativePath: 'Contents/MacOS/Other Desktop',
        bundleId: 'com.example.other',
        version: '9.9.9',
      }[field]
      await expect(assertRendererRunOwnershipForTest(status, rendererPort, wrongConfig, runId, repositoryRoot))
        .rejects.toThrow(/application identity.*does not match/u)
    }
  })

  it('keeps the actual socket identity immutable when callers mutate the exposed target', async () => {
    const fake = controlledTransport()
    const page = await connectDesktopPage(PORT, { transport: fake.transport, timeoutMs: 100 })
    const identity = getDesktopPageConnectionIdentity(page)

    expect(identity).toMatchObject({
      targetId: 'renderer-page',
      type: 'page',
      socketUrl: `ws://127.0.0.1:${PORT}/devtools/page/renderer-page`,
      socketHost: '127.0.0.1',
      socketPort: PORT,
    })
    expect(Object.isFrozen(identity)).toBe(true)
    expect(getDesktopPageConnectionIdentity({ ...page })).toBeNull()
    page.target.webSocketDebuggerUrl = `ws://127.0.0.1:43124/devtools/page/renderer-page`
    expect(getDesktopPageConnectionIdentity(page).socketPort).toBe(PORT)
    expect(() => { identity.socketPort = 43124 }).toThrow()

    await page.close()
  })

  it('connects after the official application prefixes its title with a session title', async () => {
    const fake = controlledTransport({ targets: [{
      id: 'active-session', type: 'page',
      title: '实际生成验收 — DeepSeek Harness', url: 'dsh-app://app/',
      webSocketDebuggerUrl: `ws://127.0.0.1:${PORT}/devtools/page/active-session`,
    }] })
    const page = await connectDesktopPage(PORT, { transport: fake.transport, timeoutMs: 15 })
    expect(page.target.id).toBe('active-session')
    await page.close()
  })

  it.each(['DeepSeek Harness wrong', ' — DeepSeek Harness', 'wrong—DeepSeek Harness', null])('rejects an unrelated or empty session title %s', async title => {
    const fake = controlledTransport({ targets: [{
      type: 'page', title, url: 'dsh-app://app/',
      webSocketDebuggerUrl: `ws://127.0.0.1:${PORT}/devtools/page/unrelated`,
    }] })
    await expect(connectDesktopPage(PORT, { transport: fake.transport, timeoutMs: 15 })).rejects.toThrow(/no page matched/u)
    expect(fake.sockets).toHaveLength(0)
  })

  it('requires both the configured page title and dsh-app URL prefix before connecting', async () => {
    const fake = controlledTransport({ targets: [
      {
        type: 'page',
        title: 'A different app',
        url: 'dsh-app://app/index.html',
        webSocketDebuggerUrl: `ws://127.0.0.1:${PORT}/devtools/page/wrong-title`,
      },
      {
        type: 'page',
        title: 'DeepSeek Harness',
        url: 'https://example.test/',
        webSocketDebuggerUrl: `ws://127.0.0.1:${PORT}/devtools/page/wrong-url`,
      },
    ] })

    await expect(connectDesktopPage(PORT, { transport: fake.transport, timeoutMs: 15 }))
      .rejects.toThrow(/timed out waiting for the DSH Desktop page target.*title=.*DeepSeek Harness.*URL prefix=.*dsh-app/u)
    expect(fake.sockets).toHaveLength(0)
  })

  it('rejects invalid ports and timeout bounds before contacting the debugger', async () => {
    const fake = controlledTransport()

    await expect(connectDesktopPage(0, { transport: fake.transport })).rejects.toThrow(/port must be an integer/u)
    await expect(connectDesktopPage(PORT, { transport: fake.transport, timeoutMs: 0 })).rejects.toThrow(/timeout.*1 through 300000/u)
    expect(fake.requests).toHaveLength(0)
  })

  it('bounds an HTTP debugger request that does not settle', async () => {
    const fake = controlledTransport()
    const transport = {
      ...fake.transport,
      fetch: () => new Promise(() => {}),
    }

    await expect(connectDesktopPage(PORT, { transport, timeoutMs: 15 })).rejects.toThrow(/timed out requesting http:\/\/127\.0\.0\.1:43123\/json\/list/u)
    expect(fake.sockets).toHaveLength(0)
  })

  it.each([
    ['redirected response', response => ({ ...response, redirected: true, url: `http://127.0.0.1:${PORT}/redirected` })],
    ['changed final URL', response => ({ ...response, url: `http://127.0.0.1:${PORT}/other-endpoint` })],
  ])('rejects a %s before creating a CDP socket', async (_label, modifyResponse) => {
    const fake = controlledTransport()
    const transport = {
      ...fake.transport,
      fetch: async (url, options) => {
        fake.requests.push(String(url))
        fake.requestOptions.push(options)
        const response = {
          ok: true,
          status: 200,
          redirected: false,
          url: String(url),
          json: async () => [{
            id: 'renderer-page',
            type: 'page',
            title: 'DeepSeek Harness',
            url: 'dsh-app://app/index.html',
            webSocketDebuggerUrl: `ws://127.0.0.1:${PORT}/devtools/page/renderer-page`,
          }],
        }
        return modifyResponse(response)
      },
    }

    await expect(connectDesktopPage(PORT, { transport, timeoutMs: 100 }))
      .rejects.toThrow(/redirect|endpoint URL/u)
    expect(fake.requestOptions[0].redirect).toBe('error')
    expect(fake.sockets).toHaveLength(0)
  })

  it('retries a loopback debug endpoint until it exposes the matching page', async () => {
    const fake = controlledTransport()
    let attempts = 0
    const transport = {
      ...fake.transport,
      fetch: async (url, options) => {
        attempts += 1
        if (attempts === 1) return { ok: false, status: 404, redirected: false, url: String(url), json: async () => null }
        return fake.transport.fetch(url, options)
      },
      delay: async () => {},
    }

    const page = await connectDesktopPage(PORT, { transport, timeoutMs: 100 })

    expect(attempts).toBe(2)
    expect(page.target.id).toBe('renderer-page')
    await page.close()
  })

  it('rejects a debugger WebSocket address outside the configured loopback port', async () => {
    const fake = controlledTransport({ targets: [{
      id: 'renderer-page',
      type: 'page',
      title: 'DeepSeek Harness',
      url: 'dsh-app://app/index.html',
      webSocketDebuggerUrl: `ws://example.test:${PORT}/devtools/page/renderer-page`,
    }] })

    await expect(connectDesktopPage(PORT, { transport: fake.transport })).rejects.toThrow(/WebSocket URL must use 127\.0\.0\.1:43123/u)
    expect(fake.sockets).toHaveLength(0)
  })

  it('rejects a page WebSocket that uses another loopback port', async () => {
    const fake = controlledTransport({ targets: [{
      id: 'renderer-page',
      type: 'page',
      title: 'DeepSeek Harness',
      url: 'dsh-app://app/index.html',
      webSocketDebuggerUrl: 'ws://127.0.0.1:43124/devtools/page/renderer-page',
    }] })

    await expect(connectDesktopPage(PORT, { transport: fake.transport }))
      .rejects.toThrow(/WebSocket URL must use 127\.0\.0\.1:43123/u)
    expect(fake.sockets).toHaveLength(0)
  })

  it('rejects a malformed page WebSocket target before opening a socket', async () => {
    const fake = controlledTransport({ targets: [{
      id: 'renderer-page',
      type: 'page',
      title: 'DeepSeek Harness',
      url: 'dsh-app://app/index.html',
      webSocketDebuggerUrl: 'not-a-websocket-url',
    }] })

    await expect(connectDesktopPage(PORT, { transport: fake.transport }))
      .rejects.toThrow(/WebSocket URL is invalid/u)
    expect(fake.sockets).toHaveLength(0)
  })

  it('rejects a page WebSocket path that names a different discovered target', async () => {
    const fake = controlledTransport({ targets: [{
      id: 'renderer-page',
      type: 'page',
      title: 'DeepSeek Harness',
      url: 'dsh-app://app/index.html',
      webSocketDebuggerUrl: `ws://127.0.0.1:${PORT}/devtools/page/other-page`,
    }] })

    await expect(connectDesktopPage(PORT, { transport: fake.transport }))
      .rejects.toThrow(/WebSocket path must identify its exposed target/u)
    expect(fake.sockets).toHaveLength(0)
  })

  it('closes a WebSocket that errors before the CDP connection opens', async () => {
    const fake = controlledTransport({ openFailure: true })

    await expect(connectDesktopPage(PORT, { transport: fake.transport })).rejects.toThrow(/WebSocket failed before opening/u)
    expect(fake.sockets[0].closeCount).toBe(1)
  })

  it('reports a WebSocket close timeout and releases its CDP listeners', async () => {
    const fake = controlledTransport({ autoClose: false })
    const page = await connectDesktopPage(PORT, { transport: fake.transport })

    await expect(page.close(5)).rejects.toThrow('timed out closing the Renderer CDP WebSocket')
    await expect(page.command('Page.enable')).rejects.toThrow(/WebSocket is closed/u)
    expect(fake.sockets[0].closeCount).toBe(1)
  })

  it('reports CDP command errors and Renderer evaluation exceptions', async () => {
    const protocolFailure = controlledTransport({
      respondToCommand: request => ({
        id: request.id,
        error: { code: -32601, message: 'Method not found' },
      }),
    })
    const failedPage = await connectDesktopPage(PORT, { transport: protocolFailure.transport })
    await expect(failedPage.command('Page.missingMethod'))
      .rejects.toThrow(/Page\.missingMethod failed \(-32601\): Method not found/u)
    await failedPage.close()

    const evaluationFailure = controlledTransport({
      respondToCommand: request => ({
        id: request.id,
        result: {
          exceptionDetails: { exception: { description: 'renderer evaluation failed' }, text: 'Uncaught' },
          result: { type: 'object' },
        },
      }),
    })
    const page = await connectDesktopPage(PORT, { transport: evaluationFailure.transport })
    await expect(page.evaluate('throw new Error("renderer evaluation failed")')).rejects.toThrow('renderer evaluation failed')
    await page.close()
  })

  it('applies an explicit deadline to a CDP command with no response', async () => {
    const fake = controlledTransport({ respondToCommand: () => null })
    const page = await connectDesktopPage(PORT, { transport: fake.transport })

    await expect(page.command('Page.getFrameTree', {}, 5)).rejects.toThrow('timed out waiting for CDP Page.getFrameTree response')
    await page.close()
  })

  it('rejects pending commands when the WebSocket closes and clears its event waiters', async () => {
    const fake = controlledTransport({ respondToCommand: () => null })
    const browser = await connectDesktopBrowser(PORT, { transport: fake.transport })
    expect(Object.isFrozen(browser)).toBe(true)
    const socket = fake.sockets[0]
    const commandFailure = expect(browser.command('Browser.getVersion')).rejects.toThrow(/WebSocket closed/u)
    const eventFailure = expect(browser.waitForEvent('Browser.downloadWillBegin', () => true, 10_000))
      .rejects.toThrow(/WebSocket closed/u)

    socket.close()

    await Promise.all([commandFailure, eventFailure])
    await expect(browser.command('Browser.getVersion')).rejects.toThrow(/WebSocket is closed/u)
    await browser.close()
  })

  it('records pending CDP methods and the original WebSocket error cause without command params', async () => {
    const fake = controlledTransport({ respondToCommand: () => null })
    const page = await connectDesktopPage(PORT, { transport: fake.transport, timeoutMs: 100 })
    const cause = new Error('connection reset by peer')
    const command = page.command('Runtime.evaluate', { expression: 'secret-input-value' })
    fake.sockets[0].fail(cause)

    const failure = await command.catch(error => error)

    expect(failure).toBeInstanceOf(Error)
    expect(failure.message).toContain('pendingMethods=Runtime.evaluate')
    expect(failure.message).toContain('socketReadyState=1')
    expect(failure.message).toContain('socketCloseEvent=not-reported')
    expect(failure.message).toContain('cause=connection reset by peer')
    expect(failure.cause).toBe(cause)
    expect(failure.message).not.toContain('secret-input-value')
    await page.close()
    expect(fake.agents[0].destroyCount).toBe(1)
  })

  it('records a WebSocket error with no pending CDP command', async () => {
    const fake = controlledTransport()
    const page = await connectDesktopPage(PORT, { transport: fake.transport, timeoutMs: 100 })
    const cause = new Error('socket lost')
    fake.sockets[0].fail(cause)

    await expect(page.command('Runtime.evaluate')).rejects.toMatchObject({
      message: expect.stringContaining('pendingMethods=none'),
      cause,
    })
    await page.close()
    expect(fake.agents[0].destroyCount).toBe(1)
  })

  it('preserves the original WebSocket failure when Agent cleanup also fails', async () => {
    const cleanupFailure = new Error('Agent transport shutdown failed')
    const fake = controlledTransport({ respondToCommand: () => null, agentDestroyFailure: cleanupFailure })
    const page = await connectDesktopPage(PORT, { transport: fake.transport, timeoutMs: 100 })
    const cause = new Error('renderer socket terminated')
    const command = page.command('Debugger.getScriptSource', { scriptId: 'script-id' })
    fake.sockets[0].fail(cause)
    const originalFailure = await command.catch(error => error)

    const closeFailure = await page.close().catch(error => error)

    expect(closeFailure).toBeInstanceOf(AggregateError)
    expect(closeFailure.errors[0]).toBe(originalFailure)
    expect(closeFailure.errors[0].cause).toBe(cause)
    expect(closeFailure.errors[1].cause).toBe(cleanupFailure)
    expect(fake.agents[0].destroyCount).toBe(1)
  })

  it('preserves the protocol failure and reports a failed socket cleanup from close()', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const closeFailure = new Error('transport refused close')
      const fake = controlledTransport({ respondToCommand: () => null, closeFailure })
      const browser = await connectDesktopBrowser(PORT, { transport: fake.transport })
      const socket = fake.sockets[0]
      const commandFailure = expect(browser.command('Browser.getVersion', {}, 10_000))
        .rejects.toThrow('Renderer CDP response has an invalid command id')
      const eventFailure = expect(browser.waitForEvent('Browser.downloadWillBegin', () => true, 10_000))
        .rejects.toThrow('Renderer CDP response has an invalid command id')

      socket.receiveRaw('{"id":"invalid","result":{}}')

      await Promise.all([commandFailure, eventFailure])
      expect(socket.closeCount).toBe(1)
      expect(socket.listenerCount('message')).toBe(0)
      expect(socket.listenerCount('error')).toBe(0)
      expect(socket.listenerCount('close')).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
      await expect(browser.close()).rejects.toThrow(/WebSocket cleanup failed: transport refused close/u)
    } finally {
      vi.useRealTimers()
    }
  })

  it('waits for an errored WebSocket close handshake and reports its timeout', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const fake = controlledTransport({ respondToCommand: () => null, autoClose: false })
      const page = await connectDesktopPage(PORT, { transport: fake.transport })
      const socket = fake.sockets[0]
      const commandFailure = expect(page.command('Page.enable', {}, 10_000))
        .rejects.toThrow('Renderer CDP response has an invalid command id')

      socket.receiveRaw('{"id":"invalid","result":{}}')
      await commandFailure
      expect(socket.closeCount).toBe(1)

      const config = await loadRendererCDPConfig()
      const closeResult = page.close()
      const closeFailure = expect(closeResult).rejects.toThrow(/WebSocket cleanup failed: timed out closing/u)
      expect(vi.getTimerCount()).toBe(1)
      await vi.advanceTimersByTimeAsync(config.startup.stopTimeoutMs)
      await closeFailure
      expect(socket.listenerCount('message')).toBe(0)
      expect(socket.listenerCount('error')).toBe(0)
      expect(socket.listenerCount('close')).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('waits for a completed download and verifies its saved bytes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'renderer-cdp-download-'))
    temporaryRoots.add(root)
    const bytes = Buffer.from('downloaded renderer media')
    const filename = 'media.bin'
    await writeFile(join(root, filename), bytes)
    const fake = controlledTransport()
    const browser = await connectDesktopBrowser(PORT, { transport: fake.transport })
    const socket = fake.sockets[0]
    socket.receive({
      method: 'Browser.downloadWillBegin',
      params: { guid: 'download-1', url: 'https://example.test/media.bin', suggestedFilename: filename },
    })
    socket.receive({
      method: 'Browser.downloadProgress',
      params: { guid: 'download-1', state: 'completed', receivedBytes: bytes.byteLength },
    })

    const result = await expectCompletedDownload(browser, {
      url: 'https://example.test/media.bin',
      filename,
      byteLength: bytes.byteLength,
      bytes,
      downloadPath: root,
      eventTimeoutMs: 50,
    })

    expect(result.willBegin.suggestedFilename).toBe(filename)
    expect(result.progress.state).toBe('completed')
    const mismatchedBytes = Buffer.from(bytes)
    mismatchedBytes[0] ^= 1
    socket.receive({
      method: 'Browser.downloadWillBegin',
      params: { guid: 'download-content-mismatch', url: 'https://example.test/media.bin', suggestedFilename: filename },
    })
    socket.receive({
      method: 'Browser.downloadProgress',
      params: { guid: 'download-content-mismatch', state: 'completed', receivedBytes: bytes.byteLength },
    })
    await expect(expectCompletedDownload(browser, {
      url: 'https://example.test/media.bin',
      filename,
      byteLength: bytes.byteLength,
      bytes: mismatchedBytes,
      downloadPath: root,
      eventTimeoutMs: 50,
    })).rejects.toThrow(`Desktop download content mismatch: ${filename}`)
    await browser.close()
  })

  it('reports canceled and timed-out download event sequences', async () => {
    const canceled = controlledTransport()
    const browser = await connectDesktopBrowser(PORT, { transport: canceled.transport })
    const socket = canceled.sockets[0]
    const expectedBytes = Buffer.from('expected data')
    socket.receive({
      method: 'Browser.downloadWillBegin',
      params: { guid: 'download-canceled', url: 'https://example.test/media.bin', suggestedFilename: 'media.bin' },
    })
    socket.receive({
      method: 'Browser.downloadProgress',
      params: { guid: 'download-canceled', state: 'canceled', receivedBytes: 4 },
    })
    await expect(expectCompletedDownload(browser, {
      url: 'https://example.test/media.bin',
      filename: 'media.bin',
      byteLength: expectedBytes.byteLength,
      bytes: expectedBytes,
      downloadPath: tmpdir(),
      eventTimeoutMs: 50,
    })).rejects.toThrow(/Desktop download canceled.*receivedBytes=4/u)
    await browser.close()

    const missing = controlledTransport()
    const missingBrowser = await connectDesktopBrowser(PORT, { transport: missing.transport })
    await expect(missingBrowser.waitForEvent('Browser.downloadWillBegin', () => true, 5))
      .rejects.toThrow(/timed out waiting for Browser\.downloadWillBegin; observed=\[\]/u)
    await missingBrowser.close()
  })

  it('rejects completed downloads with a mismatched filename or byte count', async () => {
    const nameMismatch = controlledTransport()
    const nameBrowser = await connectDesktopBrowser(PORT, { transport: nameMismatch.transport })
    nameMismatch.sockets[0].receive({
      method: 'Browser.downloadWillBegin',
      params: { guid: 'download-name', url: 'https://example.test/media.bin', suggestedFilename: 'actual.bin' },
    })
    await expect(expectCompletedDownload(nameBrowser, {
      url: 'https://example.test/media.bin',
      filename: 'expected.bin',
      byteLength: 3,
      bytes: Buffer.from('abc'),
      downloadPath: tmpdir(),
      eventTimeoutMs: 20,
    })).rejects.toThrow(/filename mismatch: expected=expected\.bin actual=actual\.bin/u)
    await nameBrowser.close()

    const sizeMismatch = controlledTransport()
    const sizeBrowser = await connectDesktopBrowser(PORT, { transport: sizeMismatch.transport })
    const sizeSocket = sizeMismatch.sockets[0]
    sizeSocket.receive({
      method: 'Browser.downloadWillBegin',
      params: { guid: 'download-size', url: 'https://example.test/media.bin', suggestedFilename: 'media.bin' },
    })
    sizeSocket.receive({
      method: 'Browser.downloadProgress',
      params: { guid: 'download-size', state: 'completed', receivedBytes: 2 },
    })
    await expect(expectCompletedDownload(sizeBrowser, {
      url: 'https://example.test/media.bin',
      filename: 'media.bin',
      byteLength: 3,
      bytes: Buffer.from('abc'),
      downloadPath: tmpdir(),
      eventTimeoutMs: 20,
    })).rejects.toThrow('Desktop download byte length mismatch: expected=3 actual=2')
    await sizeBrowser.close()
  })

  it('times out when a download begins but never reaches a terminal state', async () => {
    const fake = controlledTransport()
    const browser = await connectDesktopBrowser(PORT, { transport: fake.transport })
    fake.sockets[0].receive({
      method: 'Browser.downloadWillBegin',
      params: { guid: 'download-pending', url: 'https://example.test/media.bin', suggestedFilename: 'media.bin' },
    })

    await expect(expectCompletedDownload(browser, {
      url: 'https://example.test/media.bin',
      filename: 'media.bin',
      byteLength: 3,
      bytes: Buffer.from('abc'),
      downloadPath: tmpdir(),
      eventTimeoutMs: 20,
      progressTimeoutMs: 5,
    })).rejects.toThrow(/timed out waiting for Browser\.downloadProgress/u)
    await browser.close()
  })

  it('associates repeated downloads of the same URL with fresh begin and progress events', async () => {
    const root = await mkdtemp(join(tmpdir(), 'renderer-cdp-repeated-download-'))
    temporaryRoots.add(root)
    const bytes = Buffer.from('same payload')
    const filename = 'media.bin'
    await writeFile(join(root, filename), bytes)
    const fake = controlledTransport()
    const browser = await connectDesktopBrowser(PORT, { transport: fake.transport })
    const socket = fake.sockets[0]
    const expected = {
      url: 'https://example.test/media.bin',
      filename,
      byteLength: bytes.byteLength,
      bytes,
      downloadPath: root,
      eventTimeoutMs: 100,
      progressTimeoutMs: 100,
    }
    socket.receive({
      method: 'Browser.downloadWillBegin',
      params: { guid: 'download-first', url: expected.url, suggestedFilename: filename },
    })
    socket.receive({
      method: 'Browser.downloadProgress',
      params: { guid: 'download-first', state: 'completed', receivedBytes: bytes.byteLength },
    })
    const first = await expectCompletedDownload(browser, expected)
    expect(first.willBegin.guid).toBe('download-first')

    const secondResult = expectCompletedDownload(browser, expected)
    await new Promise(resolveDelay => setTimeout(resolveDelay, 0))
    socket.receive({
      method: 'Browser.downloadWillBegin',
      params: { guid: 'download-second', url: expected.url, suggestedFilename: filename },
    })
    socket.receive({
      method: 'Browser.downloadProgress',
      params: { guid: 'download-second', state: 'completed', receivedBytes: bytes.byteLength },
    })
    const second = await secondResult

    expect(second.willBegin.guid).toBe('download-second')
    expect(second.progress.guid).toBe('download-second')
    await browser.close()
  })

  it('retains event history by default and removes a record only when consume is requested', async () => {
    const fake = controlledTransport()
    const browser = await connectDesktopBrowser(PORT, { transport: fake.transport })
    const event = {
      method: 'Browser.downloadWillBegin',
      params: { guid: 'download-history', url: 'https://example.test/media.bin', suggestedFilename: 'media.bin' },
    }
    fake.sockets[0].receive(event)
    const accept = value => value.guid === 'download-history'

    const first = await browser.waitForEvent('Browser.downloadWillBegin', accept, 50)
    const second = await browser.waitForEvent('Browser.downloadWillBegin', accept, 50)
    const consumed = await browser.waitForEvent('Browser.downloadWillBegin', accept, 50, { consume: true })

    expect(first).toEqual(event.params)
    expect(second).toEqual(event.params)
    expect(consumed).toEqual(event.params)
    await expect(browser.waitForEvent('Browser.downloadWillBegin', accept, 5, { consume: true }))
      .rejects.toThrow(/timed out waiting for Browser\.downloadWillBegin/u)
    await browser.close()
  })

  it('does not reuse an earlier completion when the second same-URL download is canceled or absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'renderer-cdp-download-sequence-'))
    temporaryRoots.add(root)
    const bytes = Buffer.from('same payload')
    const filename = 'media.bin'
    await writeFile(join(root, filename), bytes)
    const fake = controlledTransport()
    const browser = await connectDesktopBrowser(PORT, { transport: fake.transport })
    const socket = fake.sockets[0]
    const expected = {
      url: 'https://example.test/media.bin',
      filename,
      byteLength: bytes.byteLength,
      bytes,
      downloadPath: root,
      eventTimeoutMs: 30,
      progressTimeoutMs: 30,
    }
    socket.receive({
      method: 'Browser.downloadWillBegin',
      params: { guid: 'download-first', url: expected.url, suggestedFilename: filename },
    })
    socket.receive({
      method: 'Browser.downloadProgress',
      params: { guid: 'download-first', state: 'completed', receivedBytes: bytes.byteLength },
    })
    await expectCompletedDownload(browser, expected)

    const canceledResult = expectCompletedDownload(browser, expected)
    await new Promise(resolveDelay => setTimeout(resolveDelay, 0))
    socket.receive({
      method: 'Browser.downloadWillBegin',
      params: { guid: 'download-second', url: expected.url, suggestedFilename: filename },
    })
    socket.receive({
      method: 'Browser.downloadProgress',
      params: { guid: 'download-second', state: 'canceled', receivedBytes: 2 },
    })
    await expect(canceledResult).rejects.toThrow(/Desktop download canceled:.*receivedBytes=2/u)

    await expect(expectCompletedDownload(browser, expected))
      .rejects.toThrow(/timed out waiting for Browser\.downloadWillBegin/u)
    await browser.close()
  })
})

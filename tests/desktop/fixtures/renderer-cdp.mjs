import { readFile } from 'node:fs/promises'
import { basename, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Agent as UndiciAgent, WebSocket as UndiciWebSocket } from 'undici'

import { matchesDesktopRendererTitle, parseDesktopE2EConfig } from '../../../config/desktop-e2e-schema.mjs'
import { assertProbeRunIdentity, getProbeStatus, processGroupMatchesRun } from './official-desktop-probe.mjs'
import {
  assertRendererCdpResponse,
  validateRendererCdpWebSocketUrl,
  validateRendererPageWebSocketTarget,
} from './renderer-target-validation.mjs'

const CONFIG_PATH = fileURLToPath(new URL('../../../config/desktop-e2e.json', import.meta.url))
const BROWSER_EVENTS = new Set(['Browser.downloadWillBegin', 'Browser.downloadProgress'])
const PAGE_EVENTS = new Set(['Debugger.scriptParsed'])
const DESKTOP_PAGE_IDENTITIES = new WeakMap()
const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

export async function loadRendererCDPConfig() {
  return parseDesktopE2EConfig(JSON.parse(await readFile(CONFIG_PATH, 'utf8')))
}

export async function connectDesktopPage(port, options = {}) {
  const normalized = normalizeConnectionOptions(options)
  validatePort(port)
  const config = normalized.config
  validateTimeout(normalized.timeoutMs ?? config.startup.startupTimeoutMs, 'Renderer CDP connection timeout')
  const verifyCurrentOwnership = async () => {
    const status = await getProbeStatus({
      runId: normalized.runId,
      repositoryRoot: normalized.repositoryRoot,
      config,
    })
    await assertRendererRunOwnership(status, port, config, normalized.runId, normalized.repositoryRoot)
  }
  await verifyCurrentOwnership()
  return connectDesktopPageInternal(port, normalized, config, normalized.runId, verifyCurrentOwnership)
}

export async function connectDesktopPageWithTransportForTest(port, options = {}) {
  const normalized = normalizeConnectionOptions(options, { allowTransport: true })
  validatePort(port)
  const config = normalized.config ?? await loadRendererCDPConfig()
  validateTimeout(normalized.timeoutMs ?? config.startup.startupTimeoutMs, 'Renderer CDP connection timeout')
  return connectDesktopPageInternal(port, normalized, config, normalized.runId ?? null)
}

async function connectDesktopPageInternal(port, options, config, runId, beforeWebSocketConnect) {
  const connection = await prepareConnection(port, options, { config, beforeWebSocketConnect })
  const { target, socket, socketUrl, agent } = connection
  const client = createCDPClient(socket, agent, {
    commandTimeoutMs: config.startup.startupTimeoutMs,
    closeTimeoutMs: config.startup.stopTimeoutMs,
    allowedEvents: PAGE_EVENTS,
    onCommand: options.transport.onCommand,
  })

  const page = Object.freeze({
    target,
    command: client.command,
    async evaluate(expression) {
      if (typeof expression !== 'string' || expression.trim() === '') {
        throw new TypeError('Renderer evaluate expression must be a non-empty string')
      }
      const result = await client.command('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })
      if (result.exceptionDetails !== undefined) {
        const details = result.exceptionDetails
        throw new Error(details.exception?.description ?? details.text ?? 'Renderer expression threw an exception')
      }
      return result.result?.value
    },
    waitForDebuggerScript(accept, timeoutMs = config.startup.startupTimeoutMs) {
      return client.waitForEvent('Debugger.scriptParsed', accept, timeoutMs, {
        consume: true,
        includeBuffered: false,
      })
    },
    close: client.close,
  })
  DESKTOP_PAGE_IDENTITIES.set(page, createDesktopPageIdentity(target, socketUrl, runId))
  return page
}

export function getDesktopPageConnectionIdentity(page) {
  if (page === null || typeof page !== 'object' || Array.isArray(page)) return null
  return DESKTOP_PAGE_IDENTITIES.get(page) ?? null
}

async function assertRendererRunOwnership(probeStatus, port, configValue, expectedRunId, repositoryRoot) {
  const config = parseDesktopE2EConfig(structuredClone(configValue))
  const status = probeStatus
  if (status === null || typeof status !== 'object' || Array.isArray(status)) {
    throw new TypeError('Renderer CDP requires a verified Desktop run status')
  }
  const record = await assertProbeRunIdentity({
    repositoryRoot,
    runId: expectedRunId,
    config,
    record: status.record,
    recordPath: status.recordPath,
  })
  if (record.state !== 'running' || record.process === null) {
    throw new TypeError('Renderer CDP requires a running Desktop run record')
  }
  if (record.ports.rendererCdp !== port) {
    throw new TypeError('Renderer CDP port does not match the verified run rendererCdp port')
  }
  if (status.processGroupMatchesRun !== true
    || !processGroupMatchesRun(status.processGroup, record)) {
    throw new TypeError('Renderer CDP process group does not match the verified run')
  }

  const members = status.processGroup?.members
  if (!Array.isArray(members) || members.length === 0
    || members.some(member => !Number.isSafeInteger(member?.pid) || member.pid < 1
      || member.processGroupId !== record.process.processGroupId)) {
    throw new TypeError('Renderer CDP process group must contain verified process members')
  }
  const memberPids = new Set(members.map(member => member.pid))
  if (!memberPids.has(record.process.pid)) {
    throw new TypeError('Renderer CDP process group does not contain the run process')
  }
  if (!Array.isArray(status.ports) || status.ports.length !== config.ports.roles.length) {
    throw new TypeError('Renderer CDP status must contain ownership observations for every configured port')
  }

  const requiredRoles = new Set(config.ports.requiredForReady)
  const observedPorts = new Set()
  for (const role of config.ports.roles) {
    const rolePort = record.ports[role]
    const matches = status.ports.filter(owner => owner?.port === rolePort)
    if (matches.length !== 1 || !Array.isArray(matches[0].pids)
      || matches[0].pids.some(pid => !Number.isSafeInteger(pid) || pid < 1)
      || new Set(matches[0].pids).size !== matches[0].pids.length) {
      throw new TypeError('Renderer CDP status has no unique valid owner observation for port role ' + role)
    }
    observedPorts.add(rolePort)
    const runOwners = matches[0].pids.filter(pid => memberPids.has(pid))
    const foreignOwners = matches[0].pids.filter(pid => !memberPids.has(pid))
    if (requiredRoles.has(role) && (runOwners.length === 0 || foreignOwners.length > 0)) {
      throw new TypeError('Renderer CDP required port role ' + role + ' is not owned only by this run process group')
    }
    if (!requiredRoles.has(role) && foreignOwners.length > 0) {
      throw new TypeError('Renderer CDP optional port role ' + role + ' has a foreign owner')
    }
  }
  if (observedPorts.size !== status.ports.length) {
    throw new TypeError('Renderer CDP status contains an unknown or duplicate configured port observation')
  }
  return record
}

export function assertRendererRunOwnershipForTest(probeStatus, port, configValue, expectedRunId, repositoryRoot) {
  return assertRendererRunOwnership(probeStatus, port, configValue, expectedRunId, repositoryRoot)
}

export async function connectDesktopBrowser(port, options = {}) {
  const normalized = normalizeConnectionOptions(options)
  validatePort(port)
  const config = normalized.config
  validateTimeout(normalized.timeoutMs ?? config.startup.startupTimeoutMs, 'Renderer CDP connection timeout')
  const verifyCurrentOwnership = async () => {
    const status = await getProbeStatus({
      runId: normalized.runId,
      repositoryRoot: normalized.repositoryRoot,
      config,
    })
    await assertRendererRunOwnership(status, port, config, normalized.runId, normalized.repositoryRoot)
  }
  await verifyCurrentOwnership()
  return connectDesktopBrowserInternal(port, normalized, config, verifyCurrentOwnership)
}

export async function connectDesktopBrowserWithTransportForTest(port, options = {}) {
  const normalized = normalizeConnectionOptions(options, { allowTransport: true })
  validatePort(port)
  const config = normalized.config ?? await loadRendererCDPConfig()
  validateTimeout(normalized.timeoutMs ?? config.startup.startupTimeoutMs, 'Renderer CDP connection timeout')
  return connectDesktopBrowserInternal(port, normalized, config)
}

async function connectDesktopBrowserInternal(port, options, config, beforeWebSocketConnect) {
  const connection = await prepareConnection(port, options, { browser: true, config, beforeWebSocketConnect })
  const { socket, agent } = connection
  const client = createCDPClient(socket, agent, {
    commandTimeoutMs: config.startup.startupTimeoutMs,
    closeTimeoutMs: config.startup.stopTimeoutMs,
    allowedEvents: BROWSER_EVENTS,
    onCommand: options.transport.onCommand,
  })
  return Object.freeze({
    command: client.command,
    waitForEvent: client.waitForEvent,
    close: client.close,
  })
}

export async function expectCompletedDownload(browser, expected) {
  if (browser === null || typeof browser?.waitForEvent !== 'function') {
    throw new TypeError('browser must expose waitForEvent for download events')
  }
  if (expected === null || typeof expected !== 'object' || Array.isArray(expected)) {
    throw new TypeError('expected download must be an object')
  }
  for (const key of ['url', 'filename', 'downloadPath']) {
    if (typeof expected[key] !== 'string' || expected[key].trim() === '') {
      throw new TypeError(`expected download.${key} must be a non-empty string`)
    }
  }
  if (expected.filename === '.' || expected.filename === '..' || basename(expected.filename) !== expected.filename) {
    throw new TypeError('expected download.filename must be a filename')
  }
  if (!Number.isSafeInteger(expected.byteLength) || expected.byteLength < 0) {
    throw new TypeError('expected download.byteLength must be a non-negative integer')
  }
  if (!(expected.bytes instanceof Uint8Array)
    && (!Array.isArray(expected.bytes) || expected.bytes.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255))) {
    throw new TypeError('expected download.bytes must be a byte array')
  }
  const expectedBytes = Buffer.from(expected.bytes)
  if (expectedBytes.byteLength !== expected.byteLength) {
    throw new TypeError('expected download.byteLength must match expected download.bytes')
  }

  const config = await loadRendererCDPConfig()
  const eventTimeoutMs = expected.eventTimeoutMs ?? config.startup.startupTimeoutMs
  validateTimeout(eventTimeoutMs, 'download event timeout')
  const willBegin = await browser.waitForEvent(
    'Browser.downloadWillBegin',
    event => event.url === expected.url,
    eventTimeoutMs,
    { consume: true },
  )
  if (willBegin.suggestedFilename !== expected.filename) {
    throw new Error(`Desktop download filename mismatch: expected=${expected.filename} actual=${willBegin.suggestedFilename}`)
  }
  const progress = await browser.waitForEvent(
    'Browser.downloadProgress',
    event => event.guid === willBegin.guid && (event.state === 'completed' || event.state === 'canceled'),
    expected.progressTimeoutMs ?? config.startup.startupTimeoutMs,
    { consume: true },
  )
  if (progress.state === 'canceled') {
    throw new Error(
      `Desktop download canceled: url=${willBegin.url} suggestedFilename=${willBegin.suggestedFilename} receivedBytes=${progress.receivedBytes}`,
    )
  }
  if (progress.receivedBytes !== expected.byteLength) {
    throw new Error(`Desktop download byte length mismatch: expected=${expected.byteLength} actual=${progress.receivedBytes}`)
  }
  const downloaded = await readFile(resolve(expected.downloadPath, expected.filename))
  if (!downloaded.equals(expectedBytes)) {
    throw new Error(`Desktop download content mismatch: ${expected.filename}`)
  }
  return { willBegin, progress }
}

async function prepareConnection(port, options, { browser = false, config, beforeWebSocketConnect } = {}) {
  validatePort(port)
  const normalized = options
  const timeoutMs = normalized.timeoutMs ?? config.startup.startupTimeoutMs
  validateTimeout(timeoutMs, 'Renderer CDP connection timeout')
  const fetchImpl = normalized.transport.fetch ?? globalThis.fetch
  const AgentImpl = normalized.transport.Agent ?? UndiciAgent
  const WebSocketImpl = normalized.transport.WebSocket ?? UndiciWebSocket
  const now = normalized.transport.now ?? Date.now
  const delay = normalized.transport.delay ?? (milliseconds => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds)))
  if (typeof fetchImpl !== 'function') throw new TypeError('Renderer CDP requires fetch support')
  if (typeof AgentImpl !== 'function') throw new TypeError('Renderer CDP requires Undici Agent support')
  if (typeof WebSocketImpl !== 'function') throw new TypeError('Renderer CDP requires Undici WebSocket support')
  if (typeof now !== 'function' || typeof delay !== 'function') throw new TypeError('Renderer CDP transport clock is invalid')

  const endpoint = `http://${config.ports.host}:${port}${browser ? '/json/version' : '/json/list'}`
  const deadline = now() + timeoutMs
  let lastObservation = 'debug endpoint has not responded'
  let webSocketDebuggerUrl
  let target
  while (now() < deadline) {
    const remainingMs = deadline - now()
    try {
      const { response, body } = await fetchJson(fetchImpl, endpoint, remainingMs)
      if (!response.ok) {
        lastObservation = `HTTP ${response.status}`
      } else {
        if (browser) {
          if (body === null || typeof body !== 'object' || Array.isArray(body)) {
            throw new Error('Renderer browser debug endpoint returned an invalid JSON object')
          }
          if (typeof body.webSocketDebuggerUrl === 'string') webSocketDebuggerUrl = body.webSocketDebuggerUrl
          else lastObservation = 'browser debug endpoint has no webSocketDebuggerUrl'
        } else {
          if (!Array.isArray(body)) throw new Error('Renderer target endpoint returned an invalid JSON array')
          target = body.find(candidate => candidate?.type === 'page'
            && matchesDesktopRendererTitle(candidate.title, config.readiness)
            && typeof candidate.url === 'string'
            && candidate.url.startsWith(config.readiness.applicationUrlPrefix)
            && typeof candidate.webSocketDebuggerUrl === 'string')
          if (target !== undefined) webSocketDebuggerUrl = target.webSocketDebuggerUrl
          else lastObservation = `no page matched title=${JSON.stringify(config.readiness.rendererTargetTitle)} and URL prefix=${JSON.stringify(config.readiness.applicationUrlPrefix)}`
        }
        if (webSocketDebuggerUrl !== undefined) break
      }
    } catch (error) {
      if (error?.code === 'RENDERER_CDP_TIMEOUT' || error?.code === 'RENDERER_CDP_SOURCE_MISMATCH') throw error
      lastObservation = error instanceof Error ? error.message : String(error)
      if (/invalid JSON (?:object|array)/u.test(lastObservation)) throw error
    }
    const pauseMs = Math.min(config.startup.pollIntervalMs, Math.max(0, deadline - now()))
    if (pauseMs === 0) break
    await delay(pauseMs)
  }

  if (webSocketDebuggerUrl === undefined) {
    const label = browser ? 'DSH Desktop browser target' : 'DSH Desktop page target'
    throw new Error(`timed out waiting for the ${label} at ${config.ports.host}:${port}; ${lastObservation}`)
  }
  const socketUrl = browser
    ? validateRendererCdpWebSocketUrl(webSocketDebuggerUrl, config.ports.host, port)
    : validateRendererPageWebSocketTarget(webSocketDebuggerUrl, target, config.ports.host, port)
  const remainingMs = deadline - now()
  if (remainingMs <= 0) throw new Error(`timed out opening the Renderer CDP WebSocket at ${config.ports.host}:${port}`)
  await beforeWebSocketConnect?.()
  const remainingAfterOwnershipCheckMs = deadline - now()
  if (remainingAfterOwnershipCheckMs <= 0) {
    throw new Error(`timed out verifying Renderer CDP ownership before WebSocket connection at ${config.ports.host}:${port}`)
  }
  const agent = new AgentImpl({ webSocket: { maxPayloadSize: config.rendererCdp.maxPayloadSize } })
  let socket
  try {
    socket = new WebSocketImpl(socketUrl, { dispatcher: agent })
  } catch (error) {
    try {
      await agent.destroy()
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Renderer CDP WebSocket construction failed and Undici Agent cleanup did not finish')
    }
    throw error
  }
  try {
    await waitForWebSocketOpen(socket, remainingAfterOwnershipCheckMs)
  } catch (error) {
    const cleanupErrors = []
    try {
      await closeUnopenedWebSocket(socket, config.startup.stopTimeoutMs)
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError)
    }
    try {
      await agent.destroy()
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError)
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError([error, ...cleanupErrors], 'Renderer CDP connection failed and transport cleanup did not finish')
    }
    throw error
  }
  return { config, target, socket, socketUrl, agent }
}

function createDesktopPageIdentity(target, socketUrl, runId) {
  const parsedSocketUrl = new URL(socketUrl)
  return Object.freeze({
    targetId: target.id,
    type: target.type,
    title: target.title,
    url: target.url,
    runId,
    socketUrl,
    socketHost: parsedSocketUrl.hostname,
    socketPort: Number(parsedSocketUrl.port),
  })
}

function normalizeConnectionOptions(options, { allowTransport = false } = {}) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Renderer CDP options must be an object')
  }
  const allowed = new Set(['runId', 'repositoryRoot', 'config', 'timeoutMs'])
  if (allowTransport) allowed.add('transport')
  const unexpected = Object.keys(options).filter(key => !allowed.has(key))
  if (unexpected.length > 0) throw new TypeError('Renderer CDP options contain unexpected keys: ' + unexpected.join(', '))
  if (options.runId !== undefined && (typeof options.runId !== 'string' || !RUN_ID_PATTERN.test(options.runId))) {
    throw new TypeError('Renderer CDP runId must be a UUID')
  }
  if (!allowTransport) {
    if (typeof options.runId !== 'string' || !RUN_ID_PATTERN.test(options.runId)) {
      throw new TypeError('Renderer CDP requires the current Desktop runId')
    }
    if (typeof options.repositoryRoot !== 'string' || !isAbsolute(options.repositoryRoot)) {
      throw new TypeError('Renderer CDP requires an absolute repositoryRoot for the current run')
    }
    if (options.config === undefined) {
      throw new TypeError('Renderer CDP requires the configured desktop E2E config for the current run')
    }
  } else if (options.transport === undefined) {
    throw new TypeError('test transport is required for the Renderer CDP test seam')
  }
  if (options.repositoryRoot !== undefined && (typeof options.repositoryRoot !== 'string' || !isAbsolute(options.repositoryRoot))) {
    throw new TypeError('Renderer CDP repositoryRoot must be an absolute path')
  }
  const config = options.config === undefined
    ? undefined
    : deepFreeze(parseDesktopE2EConfig(structuredClone(options.config)))
  if (options.timeoutMs !== undefined) validateTimeout(options.timeoutMs, 'Renderer CDP connection timeout')
  const transport = options.transport === undefined ? {} : options.transport
  if (transport === null || typeof transport !== 'object' || Array.isArray(transport)) {
    throw new TypeError('Renderer CDP transport must be an object')
  }
  const unknownTransportKeys = Object.keys(transport).filter(key => !['fetch', 'Agent', 'WebSocket', 'now', 'delay', 'onCommand'].includes(key))
  if (unknownTransportKeys.length > 0) {
    throw new TypeError('Renderer CDP transport contains unexpected keys: ' + unknownTransportKeys.join(', '))
  }
  if (transport.onCommand !== undefined && typeof transport.onCommand !== 'function') {
    throw new TypeError('Renderer CDP transport.onCommand must be a function')
  }
  return Object.freeze({
    runId: options.runId,
    repositoryRoot: options.repositoryRoot,
    config,
    timeoutMs: options.timeoutMs,
    transport: Object.freeze({ ...transport }),
  })
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

function validatePort(port) {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError('Renderer CDP port must be an integer from 1 through 65535')
  }
}

function validateTimeout(timeoutMs, label) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
    throw new TypeError(`${label} must be an integer from 1 through 300000 milliseconds`)
  }
}

async function fetchJson(fetchImpl, url, timeoutMs) {
  const controller = new AbortController()
  let timer
  const timeout = new Promise((resolveTimeout, rejectTimeout) => {
    timer = setTimeout(() => {
      controller.abort()
      const error = new Error(`timed out requesting ${url}`)
      error.code = 'RENDERER_CDP_TIMEOUT'
      rejectTimeout(error)
    }, Math.max(1, timeoutMs))
  })
  try {
    const responseAndBody = Promise.resolve()
      .then(() => fetchImpl(url, { signal: controller.signal, redirect: 'error' }))
      .then(async response => {
        assertRendererCdpResponse(response, url)
        return {
          response,
          body: response.ok ? await response.json() : undefined,
        }
      })
    return await Promise.race([responseAndBody, timeout])
  } finally {
    clearTimeout(timer)
  }
}

function waitForWebSocketOpen(socket, timeoutMs) {
  return new Promise((resolveOpen, rejectOpen) => {
    let settled = false
    const removeListeners = () => {
      clearTimeout(timer)
      socket.removeEventListener('open', onOpen)
      socket.removeEventListener('error', onError)
      socket.removeEventListener('close', onClose)
    }
    const settle = (error) => {
      if (settled) return
      settled = true
      removeListeners()
      if (error === undefined) resolveOpen()
      else rejectOpen(error)
    }
    const onOpen = () => settle()
    const onError = () => settle(new Error('Renderer CDP WebSocket failed before opening'))
    const onClose = () => settle(new Error('Renderer CDP WebSocket closed before opening'))
    const timer = setTimeout(() => settle(new Error('timed out opening the Renderer CDP WebSocket')), timeoutMs)
    socket.addEventListener('open', onOpen, { once: true })
    socket.addEventListener('error', onError, { once: true })
    socket.addEventListener('close', onClose, { once: true })
  })
}

function closeUnopenedWebSocket(socket, timeoutMs) {
  if (socket.readyState === 3) return Promise.resolve()
  return new Promise((resolveClose, rejectClose) => {
    let settled = false
    const finish = error => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.removeEventListener('close', onClose)
      if (error === undefined) resolveClose()
      else rejectClose(error)
    }
    const onClose = () => finish()
    const timer = setTimeout(() => finish(new Error('timed out closing the failed Renderer CDP WebSocket')), timeoutMs)
    socket.addEventListener('close', onClose, { once: true })
    try {
      socket.close()
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)))
    }
    if (socket.readyState === 3) finish()
  })
}

function createCDPClient(socket, agent, { commandTimeoutMs, closeTimeoutMs, allowedEvents = new Set(), onCommand }) {
  let nextId = 0
  let closed = false
  let closing = false
  let socketFailure = null
  let cleanupOriginFailure = null
  let socketCleanupPromise
  let agentCleanupPromise
  let connectionCleanupPromise
  let closePromise
  let intentionalClose = false
  const pending = new Map()
  const events = []
  const waiters = new Set()

  const removeListeners = () => {
    socket.removeEventListener('message', onMessage)
    socket.removeEventListener('error', onError)
    socket.removeEventListener('close', onClose)
  }
  const failPending = error => {
    for (const [id, request] of pending) {
      clearTimeout(request.timer)
      pending.delete(id)
      request.reject(error)
    }
    for (const waiter of [...waiters]) waiter.reject(error)
  }
  const finishClosed = error => {
    if (closed) return
    closed = true
    closing = true
    failPending(error)
    events.splice(0)
    removeListeners()
  }
  const onError = event => {
    const pendingMethods = [...new Set([...pending.values()].map(request => request.method))]
    const cause = event?.error
    const causeMessage = cause instanceof Error
      ? cause.message
      : typeof cause === 'string' && cause !== '' ? cause : 'unavailable'
    const error = new Error(
      `Renderer CDP WebSocket reported an error; pendingMethods=${pendingMethods.join(',') || 'none'}; socketReadyState=${String(socket.readyState ?? 'unknown')}; socketCloseEvent=not-reported-at-error-event; cause=${causeMessage}`,
      { cause },
    )
    error.pendingMethods = pendingMethods
    error.socketReadyState = socket.readyState ?? null
    socketFailure = error
    terminate(error)
  }
  const onClose = event => {
    const detail = event?.reason ? `: ${event.reason}` : ''
    const error = new Error(`Renderer CDP WebSocket closed${detail}`)
    if (intentionalClose) {
      finishClosed(error)
    } else {
      cleanupOriginFailure = error
      finishClosed(error)
      void startConnectionCleanup('destroy').catch(() => {})
    }
  }
  const onMessage = event => {
    if (closed || closing) return
    let message
    try {
      if (typeof event.data !== 'string') throw new TypeError('CDP WebSocket message must be text')
      message = JSON.parse(event.data)
    } catch {
      terminate(new Error('Renderer CDP received an invalid protocol message'))
      return
    }
    if (message === null || typeof message !== 'object' || Array.isArray(message)) {
      terminate(new Error('Renderer CDP received an invalid protocol message'))
      return
    }
    if (Object.hasOwn(message, 'id')) {
      if (!Number.isSafeInteger(message.id)) {
        terminate(new Error('Renderer CDP response has an invalid command id'))
        return
      }
      const request = pending.get(message.id)
      if (request === undefined) return
      pending.delete(message.id)
      clearTimeout(request.timer)
      if (Object.hasOwn(message, 'error')) {
        request.reject(formatProtocolError(request.method, message.error))
      } else if (message.result === null || typeof message.result !== 'object' || Array.isArray(message.result)) {
        request.reject(new Error(`Renderer CDP ${request.method} returned a malformed response`))
      } else {
        request.resolve(message.result)
      }
      return
    }
    if (typeof message.method !== 'string') {
      terminate(new Error('Renderer CDP event has no method'))
      return
    }
    if (!allowedEvents.has(message.method)) return
    events.push(message)
    let consumed = false
    for (const waiter of [...waiters]) {
      if (waiter.method !== message.method || waiter.consume && consumed) continue
      try {
        if (waiter.accept(message.params ?? {})) {
          if (waiter.consume) {
            const eventIndex = events.indexOf(message)
            if (eventIndex !== -1) events.splice(eventIndex, 1)
            consumed = true
          }
          waiter.resolve(message.params ?? {})
        }
      } catch (error) {
        waiter.reject(error instanceof Error ? error : new Error(String(error)))
      }
    }
  }
  const terminate = error => {
    if (closed) return
    socketFailure ??= error
    finishClosed(error)
    void startConnectionCleanup('destroy').catch(() => {})
  }

  socket.addEventListener('message', onMessage)
  socket.addEventListener('error', onError)
  socket.addEventListener('close', onClose)

  const command = (method, params = {}, timeoutMs = commandTimeoutMs) => {
    if (typeof method !== 'string' || method.trim() === '') {
      return Promise.reject(new TypeError('CDP command method must be a non-empty string'))
    }
    if (params === null || typeof params !== 'object' || Array.isArray(params)) {
      return Promise.reject(new TypeError(`CDP ${method} params must be an object`))
    }
    try {
      validateTimeout(timeoutMs, `${method} timeout`)
    } catch (error) {
      return Promise.reject(error)
    }
    if (closed || closing) return Promise.reject(socketFailure ?? new Error('Renderer CDP WebSocket is closed'))
    const id = ++nextId
    return new Promise((resolveCommand, rejectCommand) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        rejectCommand(new Error(`timed out waiting for CDP ${method} response`))
      }, timeoutMs)
      pending.set(id, { method, resolve: resolveCommand, reject: rejectCommand, timer })
      try {
        onCommand?.({ method, params, timeoutMs })
        socket.send(JSON.stringify({ id, method, params }))
      } catch (error) {
        clearTimeout(timer)
        pending.delete(id)
        rejectCommand(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  const waitForEvent = (method, accept, timeoutMs = commandTimeoutMs, options = {}) => {
    if (!allowedEvents.has(method)) return Promise.reject(new TypeError(`unsupported Renderer CDP event: ${method}`))
    if (typeof accept !== 'function') return Promise.reject(new TypeError('CDP event predicate must be a function'))
    if (options === null || typeof options !== 'object' || Array.isArray(options)
      || options.consume !== undefined && typeof options.consume !== 'boolean'
      || options.includeBuffered !== undefined && typeof options.includeBuffered !== 'boolean') {
      return Promise.reject(new TypeError('CDP event options.consume and includeBuffered must be booleans'))
    }
    const consume = options.consume ?? false
    const includeBuffered = options.includeBuffered ?? true
    try {
      validateTimeout(timeoutMs, `${method} timeout`)
    } catch (error) {
      return Promise.reject(error)
    }
    if (closed || closing) return Promise.reject(new Error('Renderer CDP WebSocket is closed'))
    if (includeBuffered) {
      for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
        const message = events[eventIndex]
        if (message.method !== method) continue
        try {
          if (accept(message.params ?? {})) {
            if (consume) events.splice(eventIndex, 1)
            return Promise.resolve(message.params ?? {})
          }
        } catch (error) {
          return Promise.reject(error instanceof Error ? error : new Error(String(error)))
        }
      }
    }
    return new Promise((resolveEvent, rejectEvent) => {
      const waiter = {
        method,
        accept,
        consume,
        resolve(params) {
          clearTimeout(waiter.timer)
          waiters.delete(waiter)
          resolveEvent(params)
        },
        reject(error) {
          clearTimeout(waiter.timer)
          waiters.delete(waiter)
          rejectEvent(error)
        },
      }
      waiter.timer = setTimeout(() => {
        const observed = events.filter(message => message.method === method).map(message => message.params)
        waiter.reject(new Error(`timed out waiting for ${method}; observed=${JSON.stringify(observed)}`))
      }, timeoutMs)
      waiters.add(waiter)
    })
  }

  const requestSocketCleanup = (timeoutMs = closeTimeoutMs) => {
    if (socketCleanupPromise !== undefined) return socketCleanupPromise
    socketCleanupPromise = new Promise(resolveCleanup => {
      let settled = false
      const finish = error => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        socket.removeEventListener('close', onSocketClosed)
        resolveCleanup({ error: error === undefined ? undefined : makeCleanupError(error) })
      }
      const onSocketClosed = () => finish()
      const timer = setTimeout(() => finish(new Error('timed out closing the Renderer CDP WebSocket')), timeoutMs)
      if (socket.readyState === 3) {
        finish()
        return
      }
      try {
        socket.addEventListener('close', onSocketClosed, { once: true })
        socket.close()
      } catch (error) {
        finish(error)
      }
    })
    return socketCleanupPromise
  }

  const requestAgentCleanup = method => {
    if (agentCleanupPromise !== undefined) return agentCleanupPromise
    agentCleanupPromise = Promise.resolve().then(async () => {
      const errors = []
      if (typeof agent?.[method] !== 'function') {
        errors.push(new TypeError(`Renderer CDP Undici Agent must expose ${method}()`))
      } else {
        try {
          await agent[method]()
        } catch (error) {
          errors.push(makeAgentCleanupError(error))
          if (method === 'close') {
            try {
              if (typeof agent.destroy !== 'function') throw new TypeError('Renderer CDP Undici Agent must expose destroy()')
              await agent.destroy()
            } catch (destroyError) {
              errors.push(makeAgentCleanupError(destroyError))
            }
          }
        }
      }
      return { errors }
    })
    return agentCleanupPromise
  }

  const startConnectionCleanup = (mode, timeoutMs = closeTimeoutMs) => {
    if (connectionCleanupPromise !== undefined) return connectionCleanupPromise
    connectionCleanupPromise = (async () => {
      const socketResult = await requestSocketCleanup(timeoutMs)
      const agentResult = await requestAgentCleanup(socketResult.error === undefined && mode === 'close' ? 'close' : 'destroy')
      return {
        errors: [socketResult.error, ...agentResult.errors].filter(error => error !== undefined),
      }
    })()
    return connectionCleanupPromise
  }

  const finishCleanup = (mode = 'close', timeoutMs = closeTimeoutMs) => {
    closePromise = startConnectionCleanup(mode, timeoutMs).then(result => {
      if (result.errors.length > 0) {
        const originalFailure = socketFailure ?? cleanupOriginFailure
        if (originalFailure !== null || result.errors.length > 1) {
          const errors = originalFailure === null ? result.errors : [originalFailure, ...result.errors]
          const details = result.errors.map(error => error.message).join('; ')
          throw new AggregateError(errors, `Renderer CDP connection failed and transport cleanup did not finish: ${details}`)
        }
        throw result.errors[0]
      }
    })
    return closePromise
  }

  const close = (timeoutMs = closeTimeoutMs) => {
    if (closePromise !== undefined) return closePromise
    try {
      validateTimeout(timeoutMs, 'Renderer CDP close timeout')
    } catch (error) {
      return Promise.reject(error)
    }
    intentionalClose = true
    if (!closed) {
      closing = true
      finishClosed(new Error('Renderer CDP WebSocket closed by caller'))
    }
    return finishCleanup(connectionCleanupPromise === undefined ? 'close' : 'destroy', timeoutMs)
  }

  return { command, waitForEvent, close }
}

function makeCleanupError(error) {
  const detail = error instanceof Error ? error.message : String(error)
  return new Error(`Renderer CDP WebSocket cleanup failed: ${detail}`, { cause: error })
}

function makeAgentCleanupError(error) {
  const detail = error instanceof Error ? error.message : String(error)
  return new Error(`Renderer CDP Undici Agent cleanup failed: ${detail}`, { cause: error })
}

function formatProtocolError(method, value) {
  const detail = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const code = Number.isSafeInteger(detail.code) ? ` (${detail.code})` : ''
  const message = typeof detail.message === 'string' ? detail.message : JSON.stringify(value)
  return new Error(`Renderer CDP ${method} failed${code}: ${message}`)
}

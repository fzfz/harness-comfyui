import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { performance } from 'node:perf_hooks'

import type { JsonValue } from '../../generation/run-input-contract.ts'
import { GenerationRuntimeError } from './generation-error.ts'
import type { ComfyFrontendExporter, ComfyFrontendExporterInput } from './official-api-workflow.ts'
import type { UiWorkflow } from './source-preparer.ts'

type JsonObject = Readonly<Record<string, JsonValue>>
type UnknownRecord = Record<string, unknown>

export interface BrowserChildProcess {
  readonly exitCode: number | null
  readonly stderr?: {
    on(event: 'data', listener: (chunk: string | Uint8Array) => void): unknown
  } | null
  once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this
  once(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this
  once(event: 'error', listener: (error: Error) => void): this
  kill(signal?: NodeJS.Signals | number): boolean
}

export interface WebSocketLike {
  addEventListener(
    type: string,
    listener: (event: { readonly data?: unknown }) => void,
    options?: { readonly once?: boolean },
  ): void
  send(contents: string): void
  close(): void
}

export interface CdpSession {
  connect(signal?: AbortSignal): Promise<void>
  send(method: string, params?: Readonly<Record<string, unknown>>): Promise<unknown>
  onEvent(method: string, listener: (params: Readonly<Record<string, unknown>>) => void): void
  evaluate(expression: string): Promise<unknown>
  close(): void
}

interface PendingCdpCommand {
  readonly method: string
  readonly resolve: (value: unknown) => void
  readonly reject: (error: Error) => void
}

export class WebSocketCdpSession implements CdpSession {
  private readonly socket: WebSocketLike
  private readonly pending = new Map<number, PendingCdpCommand>()
  private readonly eventListeners = new Map<string, Set<(params: Readonly<Record<string, unknown>>) => void>>()
  private state: 'connecting' | 'open' | 'closed' = 'connecting'
  private rejectConnection: ((error: Error) => void) | undefined
  private socketClosed = false
  private nextId = 1

  constructor(webSocketUrl: string, socketFactory: (url: string) => WebSocketLike = defaultSocketFactory) {
    this.socket = socketFactory(webSocketUrl)
  }

  async connect(signal?: AbortSignal): Promise<void> {
    if (this.state === 'open') return
    if (this.state === 'closed') throw new Error('Chrome DevTools WebSocket connection is closed.')
    const handleAbort = () => {
      this.terminate(new Error('Chrome DevTools WebSocket connection was canceled.'))
      this.closeSocket()
    }
    try {
      await new Promise<void>((resolve, reject) => {
        this.rejectConnection = reject
        this.socket.addEventListener('open', () => {
          if (this.state === 'closed') return
          this.state = 'open'
          this.rejectConnection = undefined
          resolve()
        }, { once: true })
        this.socket.addEventListener('message', event => this.receive(event.data))
        this.socket.addEventListener('error', () => {
          this.terminate(new Error('Chrome DevTools WebSocket connection failed.'))
        })
        this.socket.addEventListener('close', () => {
          this.terminate(new Error('Chrome DevTools WebSocket connection closed.'))
        })
        signal?.addEventListener('abort', handleAbort, { once: true })
        if (signal?.aborted === true) handleAbort()
      })
    } finally {
      signal?.removeEventListener('abort', handleAbort)
    }
  }

  send(method: string, params: Readonly<Record<string, unknown>> = {}): Promise<unknown> {
    if (this.state !== 'open') {
      return Promise.reject(new Error(`Chrome DevTools command "${method}" cannot be sent because the WebSocket is ${this.state}.`))
    }
    const id = this.nextId
    this.nextId += 1
    return new Promise((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject })
      try {
        this.socket.send(JSON.stringify({ id, method, params }))
      } catch (error) {
        this.pending.delete(id)
        reject(this.commandError(method, 'could not be sent', error))
      }
    })
  }

  onEvent(method: string, listener: (params: Readonly<Record<string, unknown>>) => void): void {
    const listeners = this.eventListeners.get(method) ?? new Set()
    listeners.add(listener)
    this.eventListeners.set(method, listeners)
  }

  async evaluate(expression: string): Promise<unknown> {
    const rawResponse = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    })
    const response = record(rawResponse, 'Chrome DevTools Runtime.evaluate response')
    if (response.exceptionDetails !== undefined) {
      const details = record(response.exceptionDetails, 'Chrome DevTools Runtime.evaluate exception')
      const exception = details.exception === undefined ? undefined : record(details.exception, 'Chrome DevTools exception value')
      const description = typeof exception?.description === 'string'
        ? exception.description
        : typeof details.text === 'string' ? details.text : 'Chrome DevTools evaluation failed.'
      throw new Error(description)
    }
    const result = record(response.result, 'Chrome DevTools Runtime.evaluate result')
    return result.value
  }

  close(): void {
    this.terminate(new Error('Chrome DevTools WebSocket connection was closed by the Harness Host.'))
    this.closeSocket()
  }

  private closeSocket(): void {
    if (this.socketClosed) return
    this.socketClosed = true
    this.socket.close()
  }

  private terminate(error: Error): void {
    if (this.state === 'closed') return
    this.state = 'closed'
    this.rejectConnection?.(error)
    this.rejectConnection = undefined
    for (const pending of this.pending.values()) {
      pending.reject(this.commandError(pending.method, 'was interrupted', error))
    }
    this.pending.clear()
  }

  private commandError(method: string, action: string, cause: unknown): Error {
    const details = cause instanceof Error ? cause.message : String(cause)
    return new Error(`Chrome DevTools command "${method}" ${action}: ${details}`)
  }

  private receive(rawMessage: unknown): void {
    let message: UnknownRecord
    try {
      message = record(JSON.parse(String(rawMessage)), 'Chrome DevTools message')
    } catch {
      return
    }
    if (typeof message.method === 'string') {
      const params = isUnknownRecord(message.params) ? message.params : {}
      for (const listener of this.eventListeners.get(message.method) ?? []) listener(params)
    }
    if (typeof message.id !== 'number') return
    const pending = this.pending.get(message.id)
    if (pending === undefined) return
    this.pending.delete(message.id)
    if (message.error !== undefined) {
      const error = record(message.error, 'Chrome DevTools command error')
      pending.reject(this.commandError(
        pending.method,
        'failed',
        typeof error.message === 'string' ? error.message : 'Chrome DevTools command failed.',
      ))
      return
    }
    pending.resolve(message.result)
  }
}

interface BrowserLifecycle {
  closed: boolean
  failure: Error | undefined
  readonly closedPromise: Promise<void>
  readonly signal: AbortSignal
}

export interface ChromeComfyFrontendOptions {
  readonly browserExecutablePath: string
  readonly timeoutMs: number
  readonly preReadiness: {
    readonly devToolsPortMs: number
    readonly targetCreateMs: number
    readonly webSocketConnectMs: number
    readonly domainEnableMs: number
    readonly navigationMs: number
    readonly infrastructureAttempts: 1 | 2
  }
  readonly spawnImplementation?: (
    executable: string,
    arguments_: readonly string[],
    options: { readonly stdio: ['ignore', 'ignore', 'pipe'] },
  ) => BrowserChildProcess
  readonly makeTemporaryDirectory?: () => Promise<string>
  readonly readTextFile?: (path: string) => Promise<string>
  readonly removeDirectory?: (path: string) => Promise<void>
  readonly fetchImplementation?: typeof fetch
  readonly createCdpSession?: (webSocketUrl: string) => CdpSession
  readonly delay?: (milliseconds: number, signal?: AbortSignal) => Promise<void>
  readonly now?: () => number
  readonly reportDiagnostic?: (diagnostic: FrontendAttemptDiagnostic) => void
}

export interface FrontendAttemptDiagnostic {
  readonly attempt: number
  readonly status: 'failed' | 'succeeded'
  readonly stage?: string
  readonly operation?: string
  readonly code?: string
  readonly message?: string
  readonly browserStderr?: string
}

function record(value: unknown, label: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is invalid.`)
  return value as UnknownRecord
}

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function defaultSocketFactory(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike
}

function defaultSpawn(
  executable: string,
  arguments_: readonly string[],
  options: { readonly stdio: ['ignore', 'ignore', 'pipe'] },
): BrowserChildProcess {
  return spawn(executable, arguments_, options) as BrowserChildProcess
}

async function defaultTemporaryDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'harness-comfyui-frontend-'))
}

async function defaultReadTextFile(path: string): Promise<string> {
  return readFile(path, 'utf8')
}

async function defaultRemoveDirectory(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

function defaultDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const finish = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, milliseconds)
    signal?.addEventListener('abort', finish, { once: true })
    if (signal?.aborted === true) finish()
  })
}

async function resolveBeforeAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  let rejectAbort!: (error: Error) => void
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject
  })
  const handleAbort = () => rejectAbort(signal.reason instanceof Error
    ? signal.reason
    : new Error('Chrome DevTools operation timed out or was canceled.'))
  signal.addEventListener('abort', handleAbort, { once: true })
  if (signal.aborted) handleAbort()
  try {
    return await Promise.race([operation, aborted])
  } finally {
    signal.removeEventListener('abort', handleAbort)
  }
}

function errorCode(error: unknown): string | undefined {
  return error !== null && typeof error === 'object' && typeof (error as UnknownRecord).code === 'string'
    ? (error as UnknownRecord).code as string
    : undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function runtimeError(
  code: string,
  message: string,
  cause?: unknown,
  details?: { readonly stage?: string; readonly operation?: string },
): GenerationRuntimeError {
  const error = new GenerationRuntimeError(code, message, details)
  if (cause !== undefined) error.cause = cause
  return error
}

class FrontendStageError extends GenerationRuntimeError {
  readonly stage: string
  readonly operation: string | undefined
  readonly retryableInfrastructure: boolean
  browserStderr: string | undefined

  constructor(
    code: string,
    stage: string,
    message: string,
    retryableInfrastructure: boolean,
    cause?: unknown,
    operation?: string,
  ) {
    super(code, message, { stage, ...(operation === undefined ? {} : { operation }) })
    this.stage = stage
    this.operation = operation
    this.retryableInfrastructure = retryableInfrastructure
    if (cause !== undefined) this.cause = cause
  }
}

const BROWSER_STDERR_LIMIT_BYTES = 65_536

class BoundedBrowserStderr {
  private buffer = Buffer.alloc(0)

  append(chunk: string | Uint8Array): void {
    if (this.buffer.length >= BROWSER_STDERR_LIMIT_BYTES) return
    const incoming = Buffer.from(chunk)
    const combined = Buffer.concat([this.buffer, incoming])
    this.buffer = combined.length <= BROWSER_STDERR_LIMIT_BYTES
      ? combined
      : combined.subarray(0, BROWSER_STDERR_LIMIT_BYTES)
  }

  text(userDataDirectory: string): string | undefined {
    if (this.buffer.length === 0) return undefined
    const sanitized = this.buffer.toString('utf8')
      .replaceAll(userDataDirectory, '<browser-profile>')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '')
    const bounded = Buffer.from(sanitized, 'utf8')
    return (bounded.length <= BROWSER_STDERR_LIMIT_BYTES
      ? bounded
      : bounded.subarray(0, BROWSER_STDERR_LIMIT_BYTES)).toString('utf8')
  }
}

function stageError(
  code: string,
  stage: string,
  message: string,
  retryableInfrastructure: boolean,
  cause?: unknown,
  operation?: string,
): FrontendStageError {
  return new FrontendStageError(code, stage, message, retryableInfrastructure, cause, operation)
}

function callerCanceled(signal: AbortSignal | undefined): GenerationRuntimeError {
  return runtimeError('COMFYUI_REQUEST_CANCELED', 'Official ComfyUI frontend compilation was canceled by the caller.')
}

function observeBrowser(browser: BrowserChildProcess): BrowserLifecycle {
  let resolveClosed!: () => void
  const controller = new AbortController()
  const lifecycle: BrowserLifecycle = {
    closed: browser.exitCode !== null,
    failure: undefined,
    closedPromise: new Promise<void>(resolve => { resolveClosed = resolve }),
    signal: controller.signal,
  }
  const close = () => {
    if (lifecycle.closed) return
    lifecycle.closed = true
    controller.abort()
    resolveClosed()
  }
  browser.once('error', error => {
    lifecycle.failure = error
    controller.abort()
  })
  browser.once('exit', close)
  browser.once('close', close)
  if (lifecycle.closed) {
    controller.abort()
    resolveClosed()
  }
  return lifecycle
}

function throwIfBrowserStopped(
  browser: BrowserChildProcess,
  lifecycle: BrowserLifecycle,
  origin: string,
  stage: 'readiness' | 'export',
  operation: 'Runtime.evaluate',
): void {
  if (lifecycle.failure !== undefined) {
    throw stageError(
      'COMFYUI_FRONTEND_BROWSER_FAILED',
      stage,
      `Browser process for "${origin}" failed during Chrome DevTools stage "${stage}" operation "${operation}".`,
      false,
      lifecycle.failure,
      operation,
    )
  }
  if (lifecycle.closed || browser.exitCode !== null) {
    throw stageError(
      'COMFYUI_FRONTEND_BROWSER_FAILED',
      stage,
      `Browser process for "${origin}" exited during Chrome DevTools stage "${stage}" operation "${operation}".`,
      false,
      undefined,
      operation,
    )
  }
}

function requestHeaders(
  params: Readonly<Record<string, unknown>>,
  instanceOrigin: string,
  authorization: string,
): { readonly requestId: string; readonly headers: readonly { readonly name: string; readonly value: string }[] } {
  const requestId = params.requestId
  if (typeof requestId !== 'string' || requestId.length === 0) {
    throw new Error('Chrome DevTools Fetch.requestPaused requestId is invalid.')
  }
  const request = record(params.request, 'Chrome DevTools Fetch.requestPaused request')
  if (typeof request.url !== 'string') throw new Error('Chrome DevTools paused request URL is invalid.')
  const rawHeaders = record(request.headers, 'Chrome DevTools paused request headers')
  const headers = Object.entries(rawHeaders)
    .filter(([name]) => name.toLowerCase() !== 'authorization')
    .map(([name, value]) => ({ name, value: String(value) }))
  if (new URL(request.url).origin === instanceOrigin) headers.push({ name: 'Authorization', value: authorization })
  return { requestId, headers }
}

async function continuePausedRequest(
  cdp: CdpSession,
  params: Readonly<Record<string, unknown>>,
  instanceOrigin: string,
  authorization: string,
): Promise<void> {
  await cdp.send('Fetch.continueRequest', requestHeaders(params, instanceOrigin, authorization))
}

function throwIfCallerCanceled(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw callerCanceled(signal)
}

function isReady(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const readiness = value as UnknownRecord
  return readiness.documentReady === true && readiness.hasApp === true && readiness.splashVisible === false
}

function exportedApiWorkflow(value: unknown, origin: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw runtimeError(
      'COMFYUI_FRONTEND_EXPORT_FAILED',
      `ComfyUI frontend "${origin}" returned an invalid graphToPrompt result.`,
      undefined,
      { stage: 'export', operation: 'Runtime.evaluate' },
    )
  }
  const output = (value as UnknownRecord).output
  if (output === null || typeof output !== 'object' || Array.isArray(output) || Object.keys(output).length === 0) {
    throw runtimeError(
      'COMFYUI_FRONTEND_EXPORT_FAILED',
      `ComfyUI frontend "${origin}" did not return a valid graphToPrompt output.`,
      undefined,
      { stage: 'export', operation: 'Runtime.evaluate' },
    )
  }
  return output as JsonObject
}

const READINESS_EXPRESSION = `(async () => {
  const app = globalThis.comfyAPI?.app?.app ?? globalThis.app
  const splash = document.querySelector('#splash-loader')
  return {
    documentReady: document.readyState === 'complete',
    hasApp: Boolean(app?.graph && app?.loadGraphData && app?.graphToPrompt),
    splashVisible: Boolean(splash && getComputedStyle(splash).display !== 'none'),
  }
})()`

function exportExpression(workflow: UiWorkflow): string {
  return `(async () => {
    const app = globalThis.comfyAPI?.app?.app ?? globalThis.app
    if (!app?.loadGraphData) throw new Error('ComfyUI app.loadGraphData is unavailable.')
    if (!app?.graphToPrompt) throw new Error('ComfyUI app.graphToPrompt is unavailable.')
    await app.loadGraphData(${JSON.stringify(workflow)})
    const prompt = await app.graphToPrompt()
    return { output: prompt?.output }
  })()`
}

export class ChromeComfyFrontend implements ComfyFrontendExporter {
  private readonly browserExecutablePath: string
  private readonly timeoutMs: number
  private readonly preReadiness: ChromeComfyFrontendOptions['preReadiness']
  private readonly spawnImplementation: NonNullable<ChromeComfyFrontendOptions['spawnImplementation']>
  private readonly makeTemporaryDirectory: NonNullable<ChromeComfyFrontendOptions['makeTemporaryDirectory']>
  private readonly readTextFile: NonNullable<ChromeComfyFrontendOptions['readTextFile']>
  private readonly removeDirectory: NonNullable<ChromeComfyFrontendOptions['removeDirectory']>
  private readonly fetchImplementation: typeof fetch
  private readonly createCdpSession: NonNullable<ChromeComfyFrontendOptions['createCdpSession']>
  private readonly delay: NonNullable<ChromeComfyFrontendOptions['delay']>
  private readonly now: NonNullable<ChromeComfyFrontendOptions['now']>
  private readonly reportDiagnostic: ChromeComfyFrontendOptions['reportDiagnostic']

  constructor(options: ChromeComfyFrontendOptions) {
    if (!isAbsolute(options.browserExecutablePath)) throw new TypeError('ComfyUI frontend browser executable path must be absolute.')
    if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1) throw new TypeError('ComfyUI frontend compiler timeout is invalid.')
    for (const [name, value] of Object.entries(options.preReadiness)) {
      if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`ComfyUI frontend pre-readiness ${name} is invalid.`)
    }
    if (options.preReadiness.infrastructureAttempts !== 1 && options.preReadiness.infrastructureAttempts !== 2) {
      throw new TypeError('ComfyUI frontend infrastructure attempt count is invalid.')
    }
    this.browserExecutablePath = options.browserExecutablePath
    this.timeoutMs = options.timeoutMs
    this.preReadiness = Object.freeze({ ...options.preReadiness })
    this.spawnImplementation = options.spawnImplementation ?? defaultSpawn
    this.makeTemporaryDirectory = options.makeTemporaryDirectory ?? defaultTemporaryDirectory
    this.readTextFile = options.readTextFile ?? defaultReadTextFile
    this.removeDirectory = options.removeDirectory ?? defaultRemoveDirectory
    this.fetchImplementation = options.fetchImplementation ?? fetch
    this.createCdpSession = options.createCdpSession ?? (url => new WebSocketCdpSession(url))
    this.delay = options.delay ?? defaultDelay
    this.now = options.now ?? (() => performance.now())
    this.reportDiagnostic = options.reportDiagnostic
  }

  async exportWorkflow(input: ComfyFrontendExporterInput): Promise<JsonObject> {
    let firstFailure: FrontendStageError | undefined
    for (let attempt = 1; attempt <= this.preReadiness.infrastructureAttempts; attempt += 1) {
      try {
        const result = await this.exportAttempt(input)
        this.reportDiagnostic?.({ attempt, status: 'succeeded' })
        return result
      } catch (error) {
        throwIfCallerCanceled(input.signal)
        this.reportDiagnostic?.({
          attempt,
          status: 'failed',
          ...(error instanceof FrontendStageError ? { stage: error.stage } : {}),
          ...(error instanceof FrontendStageError && error.operation !== undefined
            ? { operation: error.operation }
            : {}),
          ...(errorCode(error) === undefined ? {} : { code: errorCode(error) }),
          ...(error instanceof Error ? { message: error.message } : {}),
          ...(error instanceof FrontendStageError && error.browserStderr !== undefined
            ? { browserStderr: error.browserStderr }
            : {}),
        })
        if (!(error instanceof FrontendStageError)
          || !error.retryableInfrastructure
          || attempt === this.preReadiness.infrastructureAttempts) {
          if (firstFailure !== undefined && error instanceof GenerationRuntimeError) {
            throw runtimeError(
              error.code,
              `${error.message} The first browser attempt failed during stage "${firstFailure.stage}" with code "${firstFailure.code}".`,
              new AggregateError([firstFailure, error], 'Official frontend browser attempts failed.'),
              { stage: error.stage, ...(error.operation === undefined ? {} : { operation: error.operation }) },
            )
          }
          throw error
        }
        firstFailure = error
      }
    }
    throw new Error('Official frontend browser attempt loop ended without a result.')
  }

  private async exportAttempt(input: ComfyFrontendExporterInput): Promise<JsonObject> {
    throwIfCallerCanceled(input.signal)
    let userDataDirectory: string | undefined
    let browser: BrowserChildProcess | undefined
    let browserLifecycle: BrowserLifecycle | undefined
    let cdp: CdpSession | undefined
    const browserStderr = new BoundedBrowserStderr()
    try {
      try {
        userDataDirectory = await this.makeTemporaryDirectory()
        browser = this.spawnImplementation(this.browserExecutablePath, [
          '--headless=new',
          '--no-first-run',
          '--no-default-browser-check',
          '--use-mock-keychain',
          '--disable-features=DialMediaRouteProvider',
          '--remote-debugging-port=0',
          `--user-data-dir=${userDataDirectory}`,
          'about:blank',
        ], { stdio: ['ignore', 'ignore', 'pipe'] })
        browser.stderr?.on('data', chunk => browserStderr.append(chunk))
        browserLifecycle = observeBrowser(browser)
      } catch (error) {
        throw stageError(
          'COMFYUI_FRONTEND_BROWSER_FAILED',
          'browser-start',
          `Harness Host could not start browser "${this.browserExecutablePath}".`,
          true,
          error,
          'process.spawn',
        )
      }

      const attemptStartedAt = this.now()
      const deadline = attemptStartedAt + this.timeoutMs
      const timeoutSignal = AbortSignal.timeout(this.timeoutMs)
      const requestInterceptionFailure = new AbortController()
      const targetFailure = new AbortController()
      let requestInterceptionError: unknown
      let preReadinessComplete = false
      const operationSignal = AbortSignal.any([
        timeoutSignal,
        requestInterceptionFailure.signal,
        targetFailure.signal,
        browserLifecycle.signal,
        ...(input.signal === undefined ? [] : [input.signal]),
      ])
      try {
        const port = await this.waitForDevToolsPort(
          userDataDirectory,
          browser,
          browserLifecycle,
          Math.min(deadline, attemptStartedAt + this.preReadiness.devToolsPortMs),
          input.signal,
        )
        let webSocketDebuggerUrl: string
        const targetTimeout = AbortSignal.timeout(this.preReadiness.targetCreateMs)
        try {
          const targetSignal = AbortSignal.any([
            operationSignal,
            targetTimeout,
          ])
          const response = await this.fetchImplementation(
            `http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`,
            { method: 'PUT', signal: targetSignal },
          )
          if (!response.ok) throw new Error(`Chrome target creation returned HTTP ${response.status}.`)
          const target = record(await resolveBeforeAbort(response.json(), targetSignal), 'Chrome DevTools target')
          if (typeof target.webSocketDebuggerUrl !== 'string' || target.webSocketDebuggerUrl.length === 0) {
            throw new Error('Chrome DevTools target WebSocket URL is invalid.')
          }
          webSocketDebuggerUrl = target.webSocketDebuggerUrl
        } catch (error) {
          throwIfCallerCanceled(input.signal)
          if (errorCode(error) === 'COMFYUI_FRONTEND_TARGET_CRASHED') throw error
          throw stageError(
            'COMFYUI_FRONTEND_TARGET_CREATE_FAILED',
            'target-create',
            targetTimeout.aborted
              ? `Chrome DevTools stage "target-create" exceeded ${this.preReadiness.targetCreateMs}ms for "${input.connection.origin}".`
              : `Chrome DevTools stage "target-create" failed for "${input.connection.origin}": ${errorMessage(error)}`,
            true,
            error,
            'HTTP PUT /json/new',
          )
        }
        cdp = this.createCdpSession(webSocketDebuggerUrl)
        const connectionTimeout = AbortSignal.timeout(this.preReadiness.webSocketConnectMs)
        try {
          const connectionSignal = AbortSignal.any([
            operationSignal,
            connectionTimeout,
          ])
          await resolveBeforeAbort(cdp.connect(connectionSignal), connectionSignal)
        } catch (error) {
          throwIfCallerCanceled(input.signal)
          throw stageError(
            'COMFYUI_FRONTEND_CDP_CONNECT_FAILED',
            'cdp-connect',
            connectionTimeout.aborted
              ? `Chrome DevTools stage "cdp-connect" operation "WebSocket.connect" exceeded ${this.preReadiness.webSocketConnectMs}ms for "${input.connection.origin}".`
              : `Chrome DevTools stage "cdp-connect" operation "WebSocket.connect" failed for "${input.connection.origin}": ${errorMessage(error)}`,
            true,
            error,
            'WebSocket.connect',
          )
        }
        cdp.onEvent('Inspector.targetCrashed', params => {
          if (targetFailure.signal.aborted) return
          const status = typeof params.status === 'string' ? params.status : 'unknown'
          const targetErrorCode = typeof params.errorCode === 'number' ? params.errorCode : 'unknown'
          targetFailure.abort(stageError(
            'COMFYUI_FRONTEND_TARGET_CRASHED',
            'target-crash',
            `Chrome DevTools target for "${input.connection.origin}" crashed with status "${status}" and error code "${targetErrorCode}".`,
            !preReadinessComplete,
            undefined,
            'Inspector.targetCrashed',
          ))
        })
        if (input.connection.authorization !== null) {
          cdp.onEvent('Fetch.requestPaused', params => {
            void continuePausedRequest(
              cdp!,
              params,
              input.connection.origin,
              input.connection.authorization!,
            ).catch(error => {
              requestInterceptionError = error
              requestInterceptionFailure.abort(error)
            })
          })
        }
        const domainTimeout = AbortSignal.timeout(this.preReadiness.domainEnableMs)
        const domainSignal = AbortSignal.any([
          operationSignal,
          domainTimeout,
        ])
        const domainCommands: readonly (readonly [string, Readonly<Record<string, unknown>>?])[] = [
          ['Page.enable'],
          ['Runtime.enable'],
          ['Network.enable'],
          ['Inspector.enable'],
          ...(input.connection.authorization === null
            ? [] as const
            : [['Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }]] as const),
        ]
        for (const [method, params] of domainCommands) {
          try {
            await resolveBeforeAbort(cdp.send(method, params), domainSignal)
          } catch (error) {
            throwIfCallerCanceled(input.signal)
            if (errorCode(error) === 'COMFYUI_FRONTEND_TARGET_CRASHED') throw error
            throw stageError(
              'COMFYUI_FRONTEND_CDP_CONNECT_FAILED',
              'domain-enable',
              domainTimeout.aborted
                ? `Chrome DevTools stage "domain-enable" command "${method}" exceeded ${this.preReadiness.domainEnableMs}ms for "${input.connection.origin}".`
                : `Chrome DevTools stage "domain-enable" command "${method}" failed for "${input.connection.origin}": ${errorMessage(error)}`,
              true,
              error,
              method,
            )
          }
        }
        const navigationTimeout = AbortSignal.timeout(this.preReadiness.navigationMs)
        try {
          const navigationSignal = AbortSignal.any([
            operationSignal,
            navigationTimeout,
          ])
          await resolveBeforeAbort(
            cdp.send('Page.navigate', { url: `${input.connection.origin}/` }),
            navigationSignal,
          )
        } catch (error) {
          throwIfCallerCanceled(input.signal)
          if (errorCode(error) === 'COMFYUI_FRONTEND_TARGET_CRASHED') throw error
          if (requestInterceptionError !== undefined) {
            throw stageError(
              'COMFYUI_FRONTEND_NAVIGATION_FAILED',
              'request-interception',
              `Chrome DevTools stage "request-interception" operation "Fetch.continueRequest" failed for "${input.connection.origin}".`,
              false,
              requestInterceptionError,
              'Fetch.continueRequest',
            )
          }
          throw stageError(
            'COMFYUI_FRONTEND_NAVIGATION_FAILED',
            'navigation',
            navigationTimeout.aborted
              ? `Chrome DevTools stage "navigation" command "Page.navigate" exceeded ${this.preReadiness.navigationMs}ms for "${input.connection.origin}".`
              : `Chrome DevTools stage "navigation" command "Page.navigate" failed for "${input.connection.origin}": ${errorMessage(error)}`,
            true,
            error,
            'Page.navigate',
          )
        }
        preReadinessComplete = true
      } catch (error) {
        throwIfCallerCanceled(input.signal)
        if (error instanceof GenerationRuntimeError) throw error
        throw stageError(
          'COMFYUI_FRONTEND_BROWSER_FAILED',
          'pre-readiness',
          `Official frontend pre-readiness operation failed for "${input.connection.origin}".`,
          true,
          error,
          'pre-readiness',
        )
      }

      try {
        await this.waitForFrontend(cdp, browser, browserLifecycle, deadline, input.connection.origin, input.signal, operationSignal)
      } catch (error) {
        throwIfBrowserStopped(browser, browserLifecycle, input.connection.origin, 'readiness', 'Runtime.evaluate')
        if (requestInterceptionError !== undefined) {
          throw stageError(
            'COMFYUI_FRONTEND_NAVIGATION_FAILED',
            'request-interception',
            `Chrome DevTools stage "request-interception" operation "Fetch.continueRequest" failed for "${input.connection.origin}".`,
            false,
            requestInterceptionError,
            'Fetch.continueRequest',
          )
        }
        throw error
      }
      try {
        throwIfCallerCanceled(input.signal)
        const exported = exportedApiWorkflow(
          await resolveBeforeAbort(cdp.evaluate(exportExpression(input.workflow)), operationSignal),
          input.connection.origin,
        )
        throwIfBrowserStopped(browser, browserLifecycle, input.connection.origin, 'export', 'Runtime.evaluate')
        return exported
      } catch (error) {
        throwIfCallerCanceled(input.signal)
        throwIfBrowserStopped(browser, browserLifecycle, input.connection.origin, 'export', 'Runtime.evaluate')
        if (errorCode(error) === 'COMFYUI_FRONTEND_TARGET_CRASHED') throw error
        if (errorCode(error) === 'COMFYUI_FRONTEND_EXPORT_FAILED') throw error
        throw stageError(
          'COMFYUI_FRONTEND_EXPORT_FAILED',
          'export',
          `ComfyUI frontend "${input.connection.origin}" could not export the Actual Workflow.`,
          false,
          error,
          'Runtime.evaluate',
        )
      }
    } catch (error) {
      if (error instanceof FrontendStageError && userDataDirectory !== undefined) {
        error.browserStderr = browserStderr.text(userDataDirectory)
      }
      throw error
    } finally {
      try {
        cdp?.close()
      } finally {
        if (browser !== undefined && browserLifecycle !== undefined) await this.stopBrowser(browser, browserLifecycle)
        if (userDataDirectory !== undefined) await this.removeDirectory(userDataDirectory)
      }
    }
  }

  private async waitForDevToolsPort(
    userDataDirectory: string,
    browser: BrowserChildProcess,
    lifecycle: BrowserLifecycle,
    deadline: number,
    callerSignal: AbortSignal | undefined,
  ): Promise<number> {
    const portFile = join(userDataDirectory, 'DevToolsActivePort')
    while (this.now() <= deadline) {
      throwIfCallerCanceled(callerSignal)
      if (lifecycle.failure !== undefined) {
        throw stageError(
          'COMFYUI_FRONTEND_BROWSER_FAILED',
          'devtools-port',
          'Browser process failed before Chrome DevTools became ready.',
          true,
          lifecycle.failure,
          'read DevToolsActivePort',
        )
      }
      if (lifecycle.closed) {
        throw stageError(
          'COMFYUI_FRONTEND_BROWSER_FAILED',
          'devtools-port',
          'Browser closed before Chrome DevTools became ready.',
          true,
          undefined,
          'read DevToolsActivePort',
        )
      }
      if (browser.exitCode !== null) {
        throw stageError(
          'COMFYUI_FRONTEND_BROWSER_FAILED',
          'devtools-port',
          `Browser exited with code ${browser.exitCode} before Chrome DevTools became ready.`,
          true,
          undefined,
          'read DevToolsActivePort',
        )
      }
      try {
        const [portText] = (await this.readTextFile(portFile)).trim().split(/\r?\n/u)
        const port = Number(portText)
        if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
          throw stageError(
            'COMFYUI_FRONTEND_BROWSER_FAILED',
            'devtools-port',
            `Chrome DevTools port file "${portFile}" is invalid.`,
            true,
            undefined,
            'read DevToolsActivePort',
          )
        }
        if (lifecycle.failure !== undefined) {
          throw stageError(
            'COMFYUI_FRONTEND_BROWSER_FAILED',
            'devtools-port',
            'Browser process failed before Chrome DevTools became ready.',
            true,
            lifecycle.failure,
            'read DevToolsActivePort',
          )
        }
        return port
      } catch (error) {
        if (errorCode(error) !== 'ENOENT') throw error
      }
      await this.delay(100)
    }
    throw stageError(
      'COMFYUI_FRONTEND_BROWSER_FAILED',
      'devtools-port',
      `Chrome DevTools stage "devtools-port" did not become ready within ${this.preReadiness.devToolsPortMs}ms.`,
      true,
      undefined,
      'read DevToolsActivePort',
    )
  }

  private async waitForFrontend(
    cdp: CdpSession,
    browser: BrowserChildProcess,
    lifecycle: BrowserLifecycle,
    deadline: number,
    origin: string,
    callerSignal: AbortSignal | undefined,
    operationSignal: AbortSignal,
  ): Promise<void> {
    try {
      while (this.now() <= deadline) {
        throwIfCallerCanceled(callerSignal)
        throwIfBrowserStopped(browser, lifecycle, origin, 'readiness', 'Runtime.evaluate')
        if (isReady(await resolveBeforeAbort(cdp.evaluate(READINESS_EXPRESSION), operationSignal))) return
        await this.delay(100)
      }
    } catch (error) {
      throwIfCallerCanceled(callerSignal)
      throwIfBrowserStopped(browser, lifecycle, origin, 'readiness', 'Runtime.evaluate')
      if (errorCode(error) === 'COMFYUI_FRONTEND_NOT_READY'
        || errorCode(error) === 'COMFYUI_FRONTEND_TARGET_CRASHED') throw error
      throw stageError(
        'COMFYUI_FRONTEND_NOT_READY',
        'readiness',
        `ComfyUI frontend "${origin}" did not finish initializing.`,
        false,
        error,
        'Runtime.evaluate',
      )
    }
    throw stageError(
      'COMFYUI_FRONTEND_NOT_READY',
      'readiness',
      `ComfyUI frontend "${origin}" did not become ready within ${this.timeoutMs}ms.`,
      false,
      undefined,
      'Runtime.evaluate',
    )
  }

  private async stopBrowser(browser: BrowserChildProcess, lifecycle: BrowserLifecycle): Promise<void> {
    if (browser.exitCode !== null || lifecycle.closed) return
    browser.kill('SIGTERM')
    const terminationWait = new AbortController()
    try {
      await Promise.race([lifecycle.closedPromise, this.delay(5_000, terminationWait.signal)])
    } finally {
      terminationWait.abort()
    }
    if (browser.exitCode === null && !lifecycle.closed) {
      browser.kill('SIGKILL')
      const forcedTerminationWait = new AbortController()
      try {
        await Promise.race([lifecycle.closedPromise, this.delay(5_000, forcedTerminationWait.signal)])
      } finally {
        forcedTerminationWait.abort()
      }
    }
  }
}

import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { performance } from 'node:perf_hooks'

import { GenerationRuntimeError, type JsonValue } from './generation-runtime.ts'
import type { ComfyFrontendExporter, ComfyFrontendExporterInput } from './official-api-workflow.ts'
import type { UiWorkflow } from './source-preparer.ts'

type JsonObject = Readonly<Record<string, JsonValue>>
type UnknownRecord = Record<string, unknown>

export interface BrowserChildProcess {
  readonly exitCode: number | null
  once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this
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
  evaluate(expression: string): Promise<unknown>
  close(): void
}

interface PendingCdpCommand {
  readonly resolve: (value: unknown) => void
  readonly reject: (error: Error) => void
}

export class WebSocketCdpSession implements CdpSession {
  private readonly socket: WebSocketLike
  private readonly pending = new Map<number, PendingCdpCommand>()
  private nextId = 1

  constructor(webSocketUrl: string, socketFactory: (url: string) => WebSocketLike = defaultSocketFactory) {
    this.socket = socketFactory(webSocketUrl)
  }

  async connect(signal?: AbortSignal): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.socket.addEventListener('open', () => resolve(), { once: true })
      this.socket.addEventListener('error', () => reject(new Error('Chrome DevTools WebSocket connection failed.')), { once: true })
      signal?.addEventListener('abort', () => {
        this.socket.close()
        reject(new Error('Chrome DevTools WebSocket connection was canceled.'))
      }, { once: true })
    })
    this.socket.addEventListener('message', event => this.receive(event.data))
  }

  send(method: string, params: Readonly<Record<string, unknown>> = {}): Promise<unknown> {
    const id = this.nextId
    this.nextId += 1
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
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
    this.socket.close()
  }

  private receive(rawMessage: unknown): void {
    let message: UnknownRecord
    try {
      message = record(JSON.parse(String(rawMessage)), 'Chrome DevTools message')
    } catch {
      return
    }
    if (typeof message.id !== 'number') return
    const pending = this.pending.get(message.id)
    if (pending === undefined) return
    this.pending.delete(message.id)
    if (message.error !== undefined) {
      const error = record(message.error, 'Chrome DevTools command error')
      pending.reject(new Error(typeof error.message === 'string' ? error.message : 'Chrome DevTools command failed.'))
      return
    }
    pending.resolve(message.result)
  }
}

export interface ChromeComfyFrontendOptions {
  readonly browserExecutablePath: string
  readonly timeoutMs: number
  readonly spawnImplementation?: (
    executable: string,
    arguments_: readonly string[],
    options: { readonly stdio: 'ignore' },
  ) => BrowserChildProcess
  readonly makeTemporaryDirectory?: () => Promise<string>
  readonly readTextFile?: (path: string) => Promise<string>
  readonly removeDirectory?: (path: string) => Promise<void>
  readonly fetchImplementation?: typeof fetch
  readonly createCdpSession?: (webSocketUrl: string) => CdpSession
  readonly delay?: (milliseconds: number) => Promise<void>
  readonly now?: () => number
}

function record(value: unknown, label: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is invalid.`)
  return value as UnknownRecord
}

function defaultSocketFactory(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike
}

function defaultSpawn(
  executable: string,
  arguments_: readonly string[],
  options: { readonly stdio: 'ignore' },
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

function defaultDelay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function resolveBeforeAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  let rejectAbort!: (error: Error) => void
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject
  })
  const handleAbort = () => rejectAbort(new Error('Chrome DevTools operation timed out or was canceled.'))
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

function runtimeError(code: string, message: string, cause?: unknown): GenerationRuntimeError {
  const error = new GenerationRuntimeError(code, message)
  if (cause !== undefined) error.cause = cause
  return error
}

function callerCanceled(signal: AbortSignal | undefined): GenerationRuntimeError {
  return runtimeError('COMFYUI_REQUEST_CANCELED', 'Official ComfyUI frontend compilation was canceled by the caller.')
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
    throw runtimeError('COMFYUI_FRONTEND_EXPORT_FAILED', `ComfyUI frontend "${origin}" returned an invalid graphToPrompt result.`)
  }
  const output = (value as UnknownRecord).output
  if (output === null || typeof output !== 'object' || Array.isArray(output) || Object.keys(output).length === 0) {
    throw runtimeError('COMFYUI_FRONTEND_EXPORT_FAILED', `ComfyUI frontend "${origin}" did not return a valid graphToPrompt output.`)
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
  private readonly spawnImplementation: NonNullable<ChromeComfyFrontendOptions['spawnImplementation']>
  private readonly makeTemporaryDirectory: NonNullable<ChromeComfyFrontendOptions['makeTemporaryDirectory']>
  private readonly readTextFile: NonNullable<ChromeComfyFrontendOptions['readTextFile']>
  private readonly removeDirectory: NonNullable<ChromeComfyFrontendOptions['removeDirectory']>
  private readonly fetchImplementation: typeof fetch
  private readonly createCdpSession: NonNullable<ChromeComfyFrontendOptions['createCdpSession']>
  private readonly delay: NonNullable<ChromeComfyFrontendOptions['delay']>
  private readonly now: NonNullable<ChromeComfyFrontendOptions['now']>

  constructor(options: ChromeComfyFrontendOptions) {
    if (!isAbsolute(options.browserExecutablePath)) throw new TypeError('ComfyUI frontend browser executable path must be absolute.')
    if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1) throw new TypeError('ComfyUI frontend compiler timeout is invalid.')
    this.browserExecutablePath = options.browserExecutablePath
    this.timeoutMs = options.timeoutMs
    this.spawnImplementation = options.spawnImplementation ?? defaultSpawn
    this.makeTemporaryDirectory = options.makeTemporaryDirectory ?? defaultTemporaryDirectory
    this.readTextFile = options.readTextFile ?? defaultReadTextFile
    this.removeDirectory = options.removeDirectory ?? defaultRemoveDirectory
    this.fetchImplementation = options.fetchImplementation ?? fetch
    this.createCdpSession = options.createCdpSession ?? (url => new WebSocketCdpSession(url))
    this.delay = options.delay ?? defaultDelay
    this.now = options.now ?? (() => performance.now())
  }

  async exportWorkflow(input: ComfyFrontendExporterInput): Promise<JsonObject> {
    throwIfCallerCanceled(input.signal)
    let userDataDirectory: string | undefined
    let browser: BrowserChildProcess | undefined
    let cdp: CdpSession | undefined
    try {
      try {
        userDataDirectory = await this.makeTemporaryDirectory()
        browser = this.spawnImplementation(this.browserExecutablePath, [
          '--headless=new',
          '--no-first-run',
          '--no-default-browser-check',
          '--remote-debugging-port=0',
          `--user-data-dir=${userDataDirectory}`,
          'about:blank',
        ], { stdio: 'ignore' })
      } catch (error) {
        throw runtimeError('COMFYUI_FRONTEND_BROWSER_FAILED', `Harness Host could not start browser "${this.browserExecutablePath}".`, error)
      }

      const deadline = this.now() + this.timeoutMs
      const timeoutSignal = AbortSignal.timeout(this.timeoutMs)
      const operationSignal = input.signal === undefined
        ? timeoutSignal
        : AbortSignal.any([input.signal, timeoutSignal])
      try {
        const port = await this.waitForDevToolsPort(userDataDirectory, browser, deadline, input.signal)
        const response = await this.fetchImplementation(
          `http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`,
          { method: 'PUT', signal: operationSignal },
        )
        if (!response.ok) throw new Error(`Chrome target creation returned HTTP ${response.status}.`)
        const target = record(await resolveBeforeAbort(response.json(), operationSignal), 'Chrome DevTools target')
        if (typeof target.webSocketDebuggerUrl !== 'string' || target.webSocketDebuggerUrl.length === 0) {
          throw new Error('Chrome DevTools target WebSocket URL is invalid.')
        }
        cdp = this.createCdpSession(target.webSocketDebuggerUrl)
        await resolveBeforeAbort(cdp.connect(operationSignal), operationSignal)
        await resolveBeforeAbort(cdp.send('Page.enable'), operationSignal)
        await resolveBeforeAbort(cdp.send('Runtime.enable'), operationSignal)
        await resolveBeforeAbort(cdp.send('Network.enable'), operationSignal)
        if (input.connection.authorization !== null) {
          await resolveBeforeAbort(cdp.send('Network.setExtraHTTPHeaders', {
            headers: { Authorization: input.connection.authorization },
          }), operationSignal)
        }
        await resolveBeforeAbort(cdp.send('Page.navigate', { url: `${input.connection.origin}/` }), operationSignal)
      } catch (error) {
        throwIfCallerCanceled(input.signal)
        if (error instanceof GenerationRuntimeError) throw error
        throw runtimeError('COMFYUI_FRONTEND_BROWSER_FAILED', `Harness Host could not connect to the Chrome DevTools target for "${input.connection.origin}".`, error)
      }

      await this.waitForFrontend(cdp, deadline, input.connection.origin, input.signal, operationSignal)
      try {
        throwIfCallerCanceled(input.signal)
        return exportedApiWorkflow(
          await resolveBeforeAbort(cdp.evaluate(exportExpression(input.workflow)), operationSignal),
          input.connection.origin,
        )
      } catch (error) {
        throwIfCallerCanceled(input.signal)
        if (errorCode(error) === 'COMFYUI_FRONTEND_EXPORT_FAILED') throw error
        throw runtimeError('COMFYUI_FRONTEND_EXPORT_FAILED', `ComfyUI frontend "${input.connection.origin}" could not export the Actual Workflow.`, error)
      }
    } finally {
      try {
        cdp?.close()
      } finally {
        if (browser !== undefined) await this.stopBrowser(browser)
        if (userDataDirectory !== undefined) await this.removeDirectory(userDataDirectory)
      }
    }
  }

  private async waitForDevToolsPort(
    userDataDirectory: string,
    browser: BrowserChildProcess,
    deadline: number,
    callerSignal: AbortSignal | undefined,
  ): Promise<number> {
    const portFile = join(userDataDirectory, 'DevToolsActivePort')
    while (this.now() <= deadline) {
      throwIfCallerCanceled(callerSignal)
      if (browser.exitCode !== null) {
        throw runtimeError('COMFYUI_FRONTEND_BROWSER_FAILED', `Browser exited with code ${browser.exitCode} before Chrome DevTools became ready.`)
      }
      try {
        const [portText] = (await this.readTextFile(portFile)).trim().split(/\r?\n/u)
        const port = Number(portText)
        if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
          throw runtimeError('COMFYUI_FRONTEND_BROWSER_FAILED', `Chrome DevTools port file "${portFile}" is invalid.`)
        }
        return port
      } catch (error) {
        if (errorCode(error) !== 'ENOENT') throw error
      }
      await this.delay(100)
    }
    throw runtimeError('COMFYUI_FRONTEND_BROWSER_FAILED', `Chrome DevTools port did not become ready within ${this.timeoutMs}ms.`)
  }

  private async waitForFrontend(
    cdp: CdpSession,
    deadline: number,
    origin: string,
    callerSignal: AbortSignal | undefined,
    operationSignal: AbortSignal,
  ): Promise<void> {
    try {
      while (this.now() <= deadline) {
        throwIfCallerCanceled(callerSignal)
        if (isReady(await resolveBeforeAbort(cdp.evaluate(READINESS_EXPRESSION), operationSignal))) return
        await this.delay(100)
      }
    } catch (error) {
      throwIfCallerCanceled(callerSignal)
      if (errorCode(error) === 'COMFYUI_FRONTEND_NOT_READY') throw error
      throw runtimeError('COMFYUI_FRONTEND_NOT_READY', `ComfyUI frontend "${origin}" did not finish initializing.`, error)
    }
    throw runtimeError('COMFYUI_FRONTEND_NOT_READY', `ComfyUI frontend "${origin}" did not become ready within ${this.timeoutMs}ms.`)
  }

  private async stopBrowser(browser: BrowserChildProcess): Promise<void> {
    if (browser.exitCode !== null) return
    const exited = new Promise<void>(resolve => {
      browser.once('exit', () => resolve())
    })
    browser.kill('SIGTERM')
    await Promise.race([exited, this.delay(5_000)])
    if (browser.exitCode === null) {
      browser.kill('SIGKILL')
      await exited
    }
  }
}

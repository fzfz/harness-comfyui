import type { Readable, Writable } from 'node:stream'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { JsonValue } from '../../generation/run-input-contract.ts'
import {
  ChromeComfyFrontend,
  type ChromeComfyFrontendOptions,
  type FrontendAttemptDiagnostic,
} from './comfy-frontend-browser.ts'
import { GenerationRuntimeError } from './generation-error.ts'
import type { ComfyFrontendExporter, ComfyFrontendExporterInput } from './official-api-workflow.ts'

interface FrontendCompilerWorkerRequest {
  readonly version: 1
  readonly browser: {
    readonly browserExecutablePath: string
    readonly timeoutMs: number
    readonly preReadiness: ChromeComfyFrontendOptions['preReadiness']
  }
  readonly input: Omit<ComfyFrontendExporterInput, 'signal'>
}

export interface FrontendCompilerWorkerOptions {
  readonly stdin: Readable
  readonly stdout: Writable
  readonly signal?: AbortSignal
  readonly createFrontend?: (options: ChromeComfyFrontendOptions) => ComfyFrontendExporter
}

interface WorkerProcessSignals {
  once(event: 'SIGTERM' | 'SIGINT', listener: () => void): unknown
  removeListener(event: 'SIGTERM' | 'SIGINT', listener: () => void): unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0
}

function parsePreReadiness(value: unknown): ChromeComfyFrontendOptions['preReadiness'] {
  if (!isRecord(value) || !exactKeys(value, [
    'devToolsPortMs',
    'targetCreateMs',
    'webSocketConnectMs',
    'domainEnableMs',
    'navigationMs',
    'infrastructureAttempts',
  ])) throw new TypeError('preReadiness')
  for (const name of [
    'devToolsPortMs',
    'targetCreateMs',
    'webSocketConnectMs',
    'domainEnableMs',
    'navigationMs',
  ] as const) {
    if (!positiveInteger(value[name])) throw new TypeError(name)
  }
  if (value.infrastructureAttempts !== 1 && value.infrastructureAttempts !== 2) {
    throw new TypeError('infrastructureAttempts')
  }
  return Object.freeze({
    devToolsPortMs: Number(value.devToolsPortMs),
    targetCreateMs: Number(value.targetCreateMs),
    webSocketConnectMs: Number(value.webSocketConnectMs),
    domainEnableMs: Number(value.domainEnableMs),
    navigationMs: Number(value.navigationMs),
    infrastructureAttempts: value.infrastructureAttempts,
  })
}

function parseRequest(value: unknown): FrontendCompilerWorkerRequest {
  if (!isRecord(value) || !exactKeys(value, ['version', 'browser', 'input']) || value.version !== 1) {
    throw new TypeError('request')
  }
  if (!isRecord(value.browser)
    || !exactKeys(value.browser, ['browserExecutablePath', 'timeoutMs', 'preReadiness'])
    || typeof value.browser.browserExecutablePath !== 'string'
    || value.browser.browserExecutablePath.length === 0
    || !positiveInteger(value.browser.timeoutMs)) {
    throw new TypeError('browser')
  }
  if (!isRecord(value.input)
    || !exactKeys(value.input, ['workflow', 'connection'])
    || !isRecord(value.input.workflow)
    || !isRecord(value.input.connection)
    || !exactKeys(value.input.connection, ['url', 'origin', 'authorization'])
    || typeof value.input.connection.url !== 'string'
    || typeof value.input.connection.origin !== 'string'
    || (value.input.connection.authorization !== null && typeof value.input.connection.authorization !== 'string')) {
    throw new TypeError('input')
  }
  return Object.freeze({
    version: 1,
    browser: Object.freeze({
      browserExecutablePath: value.browser.browserExecutablePath,
      timeoutMs: Number(value.browser.timeoutMs),
      preReadiness: parsePreReadiness(value.browser.preReadiness),
    }),
    input: Object.freeze({
      workflow: value.input.workflow as ComfyFrontendExporterInput['workflow'],
      connection: Object.freeze({
        url: value.input.connection.url,
        origin: value.input.connection.origin,
        authorization: value.input.connection.authorization,
      }),
    }),
  })
}

function writeMessage(stdout: Writable, message: Readonly<Record<string, JsonValue>>): void {
  stdout.write(`${JSON.stringify(message)}\n`)
}

function resultError(error: unknown): {
  readonly code: string
  readonly message: string
  readonly stage?: string
  readonly operation?: string
} {
  if (error instanceof GenerationRuntimeError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.stage === undefined ? {} : { stage: error.stage }),
      ...(error.operation === undefined ? {} : { operation: error.operation }),
    }
  }
  return {
    code: 'COMFYUI_FRONTEND_WORKER_FAILED',
    message: 'Official frontend compiler worker failed.',
  }
}

export async function runFrontendCompilerWorker(options: FrontendCompilerWorkerOptions): Promise<void> {
  let source = ''
  let inputError: unknown
  const abortInput = () => options.stdin.destroy()
  options.signal?.addEventListener('abort', abortInput, { once: true })
  try {
    for await (const chunk of options.stdin) source += Buffer.from(chunk).toString('utf8')
  } catch (error) {
    inputError = error
  } finally {
    options.signal?.removeEventListener('abort', abortInput)
  }
  if (options.signal?.aborted === true) {
    writeMessage(options.stdout, { type: 'result', ok: false, error: resultError(new GenerationRuntimeError(
      'COMFYUI_REQUEST_CANCELED',
      'Official ComfyUI frontend compilation was canceled by the caller.',
    )) })
    return
  }
  if (inputError !== undefined) throw inputError
  let request: FrontendCompilerWorkerRequest
  try {
    request = parseRequest(JSON.parse(source.trim()))
  } catch {
    writeMessage(options.stdout, {
      type: 'result',
      ok: false,
      error: {
        code: 'COMFYUI_FRONTEND_WORKER_FAILED',
        message: 'Official frontend compiler worker request is invalid.',
      },
    })
    return
  }

  const reportDiagnostic = (diagnostic: FrontendAttemptDiagnostic) => {
    writeMessage(options.stdout, { type: 'diagnostic', diagnostic: diagnostic as unknown as JsonValue })
  }
  try {
    const frontendOptions = { ...request.browser, reportDiagnostic }
    const frontend = options.createFrontend === undefined
      ? new ChromeComfyFrontend(frontendOptions)
      : options.createFrontend(frontendOptions)
    const workflow = await frontend.exportWorkflow({ ...request.input, signal: options.signal })
    writeMessage(options.stdout, { type: 'result', ok: true, workflow })
  } catch (error) {
    writeMessage(options.stdout, { type: 'result', ok: false, error: resultError(error) })
  }
}

export async function runFrontendCompilerWorkerProcess(
  options: Omit<FrontendCompilerWorkerOptions, 'signal'>,
  processSignals: WorkerProcessSignals,
): Promise<void> {
  const controller = new AbortController()
  const terminate = () => controller.abort()
  processSignals.once('SIGTERM', terminate)
  processSignals.once('SIGINT', terminate)
  try {
    await runFrontendCompilerWorker({ ...options, signal: controller.signal })
  } finally {
    processSignals.removeListener('SIGTERM', terminate)
    processSignals.removeListener('SIGINT', terminate)
  }
}

const entryPath = process.argv[1]
if (entryPath !== undefined && pathToFileURL(resolve(entryPath)).href === import.meta.url) {
  await runFrontendCompilerWorkerProcess({ stdin: process.stdin, stdout: process.stdout }, process)
}

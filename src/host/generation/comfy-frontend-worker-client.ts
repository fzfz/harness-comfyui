import { spawn } from 'node:child_process'
import { isAbsolute } from 'node:path'

import type { JsonValue } from '../../generation/run-input-contract.ts'
import type { ChromeComfyFrontendOptions, FrontendAttemptDiagnostic } from './comfy-frontend-browser.ts'
import { nodeScriptEnvironment } from '../node-script-environment.ts'
import { GenerationRuntimeError } from './generation-error.ts'
import type { ComfyFrontendExporter, ComfyFrontendExporterInput } from './official-api-workflow.ts'

type JsonObject = Readonly<Record<string, JsonValue>>

const WORKER_STDERR_LIMIT_BYTES = 65_536
const DEFAULT_WORKER_CANCELLATION_GRACE_MS = 10_000

export interface FrontendCompilerWorkerProcess {
  readonly pid?: number
  readonly stdin: {
    end(contents: string): void
    once(event: 'error', listener: (error: Error) => void): unknown
    removeListener(event: 'error', listener: (error: Error) => void): unknown
  }
  readonly stdout: { on(event: 'data', listener: (chunk: string | Uint8Array) => void): unknown }
  readonly stderr: { on(event: 'data', listener: (chunk: string | Uint8Array) => void): unknown }
  once(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this
  once(event: 'error', listener: (error: Error) => void): this
  kill(signal?: NodeJS.Signals | number): boolean
}

export interface NodeWorkerComfyFrontendOptions {
  readonly nodeExecutable: string
  readonly workerModulePath: string
  readonly browserExecutablePath: string
  readonly timeoutMs: number
  readonly preReadiness: ChromeComfyFrontendOptions['preReadiness']
  readonly cancellationGraceMs?: number
  readonly spawnImplementation?: (
    executable: string,
    arguments_: readonly string[],
    options: {
      readonly stdio: ['pipe', 'pipe', 'pipe']
      readonly detached: true
      readonly env: NodeJS.ProcessEnv
    },
  ) => FrontendCompilerWorkerProcess
  readonly reportDiagnostic?: (diagnostic: FrontendAttemptDiagnostic) => void
}

type WorkerResult =
  | { readonly ok: true; readonly workflow: JsonObject }
  | {
      readonly ok: false
      readonly error: {
        readonly code: string
        readonly message: string
        readonly stage?: string
        readonly operation?: string
      }
    }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function runtimeError(message: string, cause?: unknown): GenerationRuntimeError {
  const error = new GenerationRuntimeError('COMFYUI_FRONTEND_WORKER_FAILED', message)
  if (cause !== undefined) error.cause = cause
  return error
}

function canceled(): GenerationRuntimeError {
  return new GenerationRuntimeError(
    'COMFYUI_REQUEST_CANCELED',
    'Official ComfyUI frontend compilation was canceled by the caller.',
  )
}

function signalWorkerTree(child: FrontendCompilerWorkerProcess, signal: NodeJS.Signals): void {
  if (process.platform !== 'win32' && Number.isSafeInteger(child.pid) && Number(child.pid) > 0) {
    try {
      process.kill(-Number(child.pid), signal)
      return
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') throw error
    }
  }
  child.kill(signal)
}

function parseDiagnostic(value: unknown): FrontendAttemptDiagnostic {
  if (!isRecord(value)
    || !Number.isSafeInteger(value.attempt)
    || Number(value.attempt) < 1
    || (value.status !== 'failed' && value.status !== 'succeeded')) {
    throw new TypeError('Official frontend worker diagnostic is invalid.')
  }
  for (const name of ['stage', 'operation', 'code', 'message', 'browserStderr'] as const) {
    if (value[name] !== undefined && typeof value[name] !== 'string') {
      throw new TypeError(`Official frontend worker diagnostic ${name} is invalid.`)
    }
  }
  return Object.freeze({
    attempt: Number(value.attempt),
    status: value.status,
    ...(typeof value.stage === 'string' ? { stage: value.stage } : {}),
    ...(typeof value.operation === 'string' ? { operation: value.operation } : {}),
    ...(typeof value.code === 'string' ? { code: value.code } : {}),
    ...(typeof value.message === 'string' ? { message: value.message } : {}),
    ...(typeof value.browserStderr === 'string' ? { browserStderr: value.browserStderr } : {}),
  })
}

function parseResult(value: unknown): WorkerResult {
  if (!isRecord(value) || value.type !== 'result' || typeof value.ok !== 'boolean') {
    throw new TypeError('Official frontend worker result is invalid.')
  }
  if (value.ok) {
    if (!isRecord(value.workflow) || Object.keys(value.workflow).length === 0) {
      throw new TypeError('Official frontend worker workflow is invalid.')
    }
    return { ok: true, workflow: value.workflow as JsonObject }
  }
  if (!isRecord(value.error)
    || typeof value.error.code !== 'string'
    || value.error.code.length === 0
    || typeof value.error.message !== 'string'
    || value.error.message.length === 0) {
    throw new TypeError('Official frontend worker error is invalid.')
  }
  for (const name of ['stage', 'operation'] as const) {
    if (value.error[name] !== undefined && typeof value.error[name] !== 'string') {
      throw new TypeError(`Official frontend worker error ${name} is invalid.`)
    }
  }
  return {
    ok: false,
    error: {
      code: value.error.code,
      message: value.error.message,
      ...(typeof value.error.stage === 'string' ? { stage: value.error.stage } : {}),
      ...(typeof value.error.operation === 'string' ? { operation: value.error.operation } : {}),
    },
  }
}

class BoundedText {
  private buffer = Buffer.alloc(0)

  append(chunk: string | Uint8Array): void {
    if (this.buffer.length >= WORKER_STDERR_LIMIT_BYTES) return
    const remaining = WORKER_STDERR_LIMIT_BYTES - this.buffer.length
    const next = Buffer.from(chunk)
    this.buffer = Buffer.concat([this.buffer, next.subarray(0, remaining)])
  }

  text(): string {
    return this.buffer.toString('utf8')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '')
      .trim()
  }
}

export class NodeWorkerComfyFrontend implements ComfyFrontendExporter {
  private readonly options: NodeWorkerComfyFrontendOptions
  private readonly spawnImplementation: NonNullable<NodeWorkerComfyFrontendOptions['spawnImplementation']>

  constructor(options: NodeWorkerComfyFrontendOptions) {
    if (options.nodeExecutable.trim().length === 0) throw new TypeError('Official frontend worker Node executable is invalid.')
    if (!isAbsolute(options.workerModulePath)) throw new TypeError('Official frontend worker module path must be absolute.')
    if (options.cancellationGraceMs !== undefined
      && (!Number.isSafeInteger(options.cancellationGraceMs) || options.cancellationGraceMs < 1)) {
      throw new TypeError('Official frontend worker cancellation grace period is invalid.')
    }
    this.options = options
    this.spawnImplementation = options.spawnImplementation
      ?? spawn as unknown as NonNullable<NodeWorkerComfyFrontendOptions['spawnImplementation']>
  }

  async exportWorkflow(input: ComfyFrontendExporterInput): Promise<JsonObject> {
    if (input.signal?.aborted === true) throw canceled()
    let child: FrontendCompilerWorkerProcess
    try {
      child = this.spawnImplementation(this.options.nodeExecutable, [this.options.workerModulePath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true,
        env: nodeScriptEnvironment(this.options.nodeExecutable),
      })
    } catch (error) {
      throw runtimeError('Harness Host could not start the official frontend compiler worker.', error)
    }

    const stderr = new BoundedText()
    let stdout = ''
    let result: WorkerResult | undefined
    let protocolError: unknown
    let settled = false
    let terminationRequested = false
    let terminationError: unknown
    let forceTerminationTimer: ReturnType<typeof setTimeout> | undefined

    return new Promise<JsonObject>((resolve, reject) => {
      const finish = (error?: unknown, workflow?: JsonObject) => {
        if (settled) return
        settled = true
        input.signal?.removeEventListener('abort', handleAbort)
        child.stdin.removeListener('error', handleStdinError)
        if (forceTerminationTimer !== undefined) clearTimeout(forceTerminationTimer)
        if (error !== undefined) reject(error)
        else resolve(workflow!)
      }
      const handleLine = (line: string) => {
        if (line.trim().length === 0 || protocolError !== undefined) return
        try {
          const message: unknown = JSON.parse(line)
          if (isRecord(message) && message.type === 'diagnostic') {
            this.options.reportDiagnostic?.(parseDiagnostic(message.diagnostic))
            return
          }
          if (result !== undefined) throw new TypeError('Official frontend worker returned multiple results.')
          result = parseResult(message)
        } catch (error) {
          protocolError = error
        }
      }
      const handleAbort = () => {
        if (terminationRequested) return
        terminationRequested = true
        terminationError = canceled()
        signalWorkerTree(child, 'SIGTERM')
        forceTerminationTimer = setTimeout(() => {
          if (!settled) signalWorkerTree(child, 'SIGKILL')
        }, this.options.cancellationGraceMs ?? DEFAULT_WORKER_CANCELLATION_GRACE_MS)
      }
      const handleStdinError = (error: Error) => {
        if (terminationRequested || settled) return
        terminationRequested = true
        terminationError = runtimeError('Harness Host could not send the official frontend compiler request.', error)
        signalWorkerTree(child, 'SIGTERM')
        forceTerminationTimer = setTimeout(() => {
          if (!settled) signalWorkerTree(child, 'SIGKILL')
        }, this.options.cancellationGraceMs ?? DEFAULT_WORKER_CANCELLATION_GRACE_MS)
      }

      child.stdin.once('error', handleStdinError)
      child.stdout.on('data', chunk => {
        stdout += Buffer.from(chunk).toString('utf8')
        let newline = stdout.indexOf('\n')
        while (newline >= 0) {
          handleLine(stdout.slice(0, newline))
          stdout = stdout.slice(newline + 1)
          newline = stdout.indexOf('\n')
        }
      })
      child.stderr.on('data', chunk => stderr.append(chunk))
      child.once('error', error => {
        finish(terminationRequested
          ? terminationError
          : runtimeError('Harness Host could not start the official frontend compiler worker.', error))
      })
      child.once('close', (code, signal) => {
        if (terminationRequested) {
          finish(terminationError)
          return
        }
        if (stdout.trim().length > 0) handleLine(stdout)
        if (protocolError !== undefined) {
          finish(runtimeError('Official frontend compiler worker returned an invalid protocol response.', protocolError))
          return
        }
        if (code !== 0 || signal !== null || result === undefined) {
          const diagnostic = stderr.text()
          finish(runtimeError(
            `Official frontend compiler worker exited before returning a result${diagnostic.length === 0 ? '.' : `: ${diagnostic}`}`,
          ))
          return
        }
        if (result.ok) finish(undefined, result.workflow)
        else finish(new GenerationRuntimeError(result.error.code, result.error.message, {
          ...(result.error.stage === undefined ? {} : { stage: result.error.stage }),
          ...(result.error.operation === undefined ? {} : { operation: result.error.operation }),
        }))
      })
      input.signal?.addEventListener('abort', handleAbort, { once: true })
      if (input.signal?.aborted === true) {
        handleAbort()
        return
      }
      try {
        child.stdin.end(`${JSON.stringify({
          version: 1,
          browser: {
            browserExecutablePath: this.options.browserExecutablePath,
            timeoutMs: this.options.timeoutMs,
            preReadiness: this.options.preReadiness,
          },
          input: {
            workflow: input.workflow,
            connection: input.connection,
          },
        })}\n`)
      } catch (error) {
        handleStdinError(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }
}

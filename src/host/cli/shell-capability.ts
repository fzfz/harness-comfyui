import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { randomBytes } from 'node:crypto'
import { CLI_ENVIRONMENT_NAMES } from '../../cli/contract.ts'
import type { SourceAddress } from '../../source-settings.ts'

export const CLI_ENVIRONMENT_VARIABLES = Object.freeze({
  [CLI_ENVIRONMENT_NAMES.executable]: { description: 'Managed Harness ComfyUI CLI executable.' },
  [CLI_ENVIRONMENT_NAMES.nodeExecutable]: { description: 'This variable contains the path to the Host Electron executable. Set ELECTRON_RUN_AS_NODE=1 when invoking the managed Harness ComfyUI CLI with this executable.' },
  [CLI_ENVIRONMENT_NAMES.api]: { description: 'Current loopback Harness ComfyUI CLI endpoint.' },
  [CLI_ENVIRONMENT_NAMES.capability]: { description: 'Current foreground shell-call capability.' },
  [CLI_ENVIRONMENT_NAMES.semanticQueryCli]: { description: 'Built-in Harness-ComfyUI semantic query client.' },
  [CLI_ENVIRONMENT_NAMES.sourceUrl]: { description: 'Configured Harness-ComfyUI data source service URL.' },
  [CLI_ENVIRONMENT_NAMES.sourcePort]: { description: 'Configured Harness-ComfyUI data source service port.' },
})

export interface CliExecutionIdentity {
  readonly sessionId: string
  readonly turn: number
  readonly callId: string
  readonly cwd: string
}

export interface CliShellCapabilityStoreOptions {
  readonly cliPath: string
  readonly nodeExecutable: string
  readonly apiUrl: string
  readonly semanticQueryCliPath: string
  readonly sourceAddress: () => SourceAddress
  readonly createCapability?: () => string
}

interface IssuedCapability {
  readonly value: string
  readonly identity: CliExecutionIdentity
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function identityFor(execution: ToolExecution): CliExecutionIdentity | undefined {
  if (execution.name !== 'bash' && execution.name !== 'pwsh') return undefined
  if (isRecord(execution.arguments) && execution.arguments.run_in_background === true) return undefined
  const session = execution.agent?.session
  if (session === undefined || !nonEmpty(session.id) || !nonEmpty(session.header.cwd)) return undefined
  const calls = session.snapshotEvents().flatMap(event => {
    if (event.type !== 'tool/call') return []
    if (String(event.data.callId) !== String(execution.callId) || event.data.name !== execution.name) return []
    return [event]
  })
  if (calls.length !== 1) return undefined
  const turn = calls[0]!.data.turn
  if (!Number.isSafeInteger(turn) || turn < 0) return undefined
  return Object.freeze({
    sessionId: String(session.id),
    turn,
    callId: String(execution.callId),
    cwd: session.header.cwd,
  })
}

export class CliShellCapabilityStore {
  private readonly options: CliShellCapabilityStoreOptions
  private readonly createCapability: () => string
  private readonly byExecution = new Map<ToolExecution['token'], IssuedCapability>()
  private readonly byValue = new Map<string, IssuedCapability>()

  constructor(options: CliShellCapabilityStoreOptions) {
    if (!nonEmpty(options.cliPath)) throw new TypeError('CLI path is required')
    if (!nonEmpty(options.nodeExecutable)) throw new TypeError('Host Node executable path is required')
    if (!nonEmpty(options.apiUrl)) throw new TypeError('CLI API URL is required')
    if (!nonEmpty(options.semanticQueryCliPath)) throw new TypeError('Semantic query CLI path is required')
    if (typeof options.sourceAddress !== 'function') throw new TypeError('Source address reader is required')
    this.options = options
    this.createCapability = options.createCapability ?? (() => randomBytes(32).toString('base64url'))
  }

  environment(execution: ToolExecution): Readonly<Record<string, string>> {
    const existing = this.byExecution.get(execution.token)
    if (existing !== undefined) return this.environmentFor(existing.value)
    const identity = identityFor(execution)
    if (identity === undefined) return Object.freeze({})
    const value = this.createCapability()
    if (!nonEmpty(value) || this.byValue.has(value)) throw new Error('CLI capability generator returned an invalid value')
    const issued = Object.freeze({ value, identity })
    this.byExecution.set(execution.token, issued)
    this.byValue.set(value, issued)
    return this.environmentFor(value)
  }

  clear(): void {
    this.byExecution.clear()
    this.byValue.clear()
  }

  authorize(value: string): CliExecutionIdentity | undefined {
    return this.byValue.get(value)?.identity
  }

  revoke(execution: Pick<ToolExecution, 'token'>): void {
    const issued = this.byExecution.get(execution.token)
    if (issued === undefined) return
    this.byExecution.delete(execution.token)
    this.byValue.delete(issued.value)
  }

  private environmentFor(capability: string): Readonly<Record<string, string>> {
    const source = this.options.sourceAddress()
    return Object.freeze({
      [CLI_ENVIRONMENT_NAMES.executable]: this.options.cliPath,
      [CLI_ENVIRONMENT_NAMES.nodeExecutable]: this.options.nodeExecutable,
      [CLI_ENVIRONMENT_NAMES.api]: this.options.apiUrl,
      [CLI_ENVIRONMENT_NAMES.capability]: capability,
      [CLI_ENVIRONMENT_NAMES.semanticQueryCli]: this.options.semanticQueryCliPath,
      [CLI_ENVIRONMENT_NAMES.sourceUrl]: source.url,
      [CLI_ENVIRONMENT_NAMES.sourcePort]: String(source.port),
    })
  }
}

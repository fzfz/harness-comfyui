import { spawn } from 'node:child_process'

import { GenerationRuntimeError, type JsonValue } from './generation-runtime.ts'
import type {
  ComfyInstanceSource,
  ComfyTemplateBundle,
  GenerationSource,
  RuntimeBinding,
  RuntimeParameterDefinition,
  RuntimeParameterValueType,
  UiWorkflow,
  WorkflowNode,
} from './source-preparer.ts'

const SOURCE_QUERY_TIMEOUT_MS = 120_000
const MAX_SOURCE_OUTPUT_BYTES = 32 * 1024 * 1024
const SOURCE_ID = /^[1-9][0-9]{0,19}$/u

export interface SourceCliProcessResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export type SourceCliProcess = (
  executable: string,
  args: readonly string[],
  signal: AbortSignal,
) => Promise<SourceCliProcessResult>

export interface GenerationSourceCliOptions {
  readonly executable: string
  readonly port: number
  readonly process?: SourceCliProcess
}

function sourceError(code: string, message: string): GenerationRuntimeError {
  return new GenerationRuntimeError(code, message)
}

function abortError(): DOMException {
  return new DOMException('ComfyUI source query was cancelled.', 'AbortError')
}

export const runSourceCliProcess: SourceCliProcess = (executable, args, signal) => new Promise((resolve, reject) => {
  if (signal.aborted) {
    reject(abortError())
    return
  }
  const command = executable.endsWith('.mjs') ? process.execPath : executable
  const commandArguments = executable.endsWith('.mjs') ? [executable, ...args] : args
  const child = spawn(command, commandArguments, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  let outputBytes = 0
  let settled = false

  const finish = (error: unknown, result?: SourceCliProcessResult) => {
    if (settled) return
    settled = true
    signal.removeEventListener('abort', onAbort)
    if (error !== undefined) reject(error)
    else resolve(result!)
  }
  const onAbort = () => {
    child.kill('SIGTERM')
    finish(abortError())
  }
  const collect = (target: Buffer[], chunk: Buffer) => {
    outputBytes += chunk.length
    if (outputBytes > MAX_SOURCE_OUTPUT_BYTES) {
      child.kill('SIGTERM')
      finish(sourceError('SOURCE_RESPONSE_TOO_LARGE', 'ComfyUI source CLI output exceeded the limit.'))
      return
    }
    target.push(chunk)
  }

  signal.addEventListener('abort', onAbort, { once: true })
  child.stdout.on('data', chunk => collect(stdout, Buffer.from(chunk)))
  child.stderr.on('data', chunk => collect(stderr, Buffer.from(chunk)))
  child.once('error', error => finish(sourceError('SOURCE_QUERY_FAILED', error.message)))
  child.once('close', code => finish(undefined, {
    exitCode: code ?? 1,
    stdout: Buffer.concat(stdout).toString('utf8'),
    stderr: Buffer.concat(stderr).toString('utf8'),
  }))
})

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw sourceError('SOURCE_PROTOCOL_ERROR', `${label} must be an object.`)
  }
  return value as Record<string, unknown>
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw sourceError('SOURCE_PROTOCOL_ERROR', `${label} is invalid.`)
  }
  return value
}

function sourceId(value: unknown, label: string): string {
  const normalized = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value
  if (typeof normalized !== 'string' || !SOURCE_ID.test(normalized)) {
    throw sourceError('SOURCE_PROTOCOL_ERROR', `${label} is invalid.`)
  }
  return normalized
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw sourceError('SOURCE_PROTOCOL_ERROR', `${label} is invalid.`)
  }
  return value as number
}

function jsonValue(value: unknown, label: string): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.map((item, index) => jsonValue(item, `${label}[${index}]`))
  const source = record(value, label)
  return Object.fromEntries(Object.entries(source).map(([key, item]) => [key, jsonValue(item, `${label}.${key}`)]))
}

function envelopeResult(output: SourceCliProcessResult): unknown {
  if (output.exitCode !== 0 || output.stderr.length > 0 || output.stdout.length === 0) {
    throw sourceError('SOURCE_QUERY_FAILED', 'ComfyUI source CLI query failed.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(output.stdout) as unknown
  } catch {
    throw sourceError('SOURCE_PROTOCOL_ERROR', 'ComfyUI source CLI returned invalid JSON.')
  }
  const envelope = record(parsed, 'ComfyUI source response')
  if (
    envelope.status !== 'ok'
    || envelope.message !== null
    || !Array.isArray(envelope.results)
    || envelope.results.length !== 1
    || envelope.page !== 1
    || envelope.page_size !== 1
    || envelope.total_count !== 1
  ) {
    throw sourceError('SOURCE_PROTOCOL_ERROR', 'ComfyUI source response envelope is invalid.')
  }
  return envelope.results[0]
}

function parseInstance(value: unknown): ComfyInstanceSource {
  const source = record(value, 'ComfyUI instance source')
  const credentialType = source.credential_type
  if (credentialType !== 'none' && credentialType !== 'basic' && credentialType !== 'bearer') {
    throw sourceError('SOURCE_PROTOCOL_ERROR', 'ComfyUI instance credential type is invalid.')
  }
  const url = text(source.url, 'ComfyUI instance URL')
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    throw sourceError('SOURCE_PROTOCOL_ERROR', 'ComfyUI instance URL is invalid.')
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw sourceError('SOURCE_PROTOCOL_ERROR', 'ComfyUI instance URL protocol is invalid.')
  }
  const authorization = source.authorization
  if (credentialType === 'none' && authorization !== undefined && authorization !== null) {
    throw sourceError('SOURCE_PROTOCOL_ERROR', 'ComfyUI instance without credentials must not include authorization.')
  }
  if (credentialType !== 'none' && (typeof authorization !== 'string' || authorization.length === 0)) {
    throw sourceError('SOURCE_PROTOCOL_ERROR', 'ComfyUI instance authorization is unavailable.')
  }
  return Object.freeze({
    id: sourceId(source.id, 'ComfyUI instance id'),
    title: text(source.title, 'ComfyUI instance title'),
    url,
    credentialType,
    authorization: credentialType === 'none' ? null : authorization as string,
  })
}

function parseWorkflow(value: unknown): UiWorkflow {
  const source = record(jsonValue(value, 'Template Workflow'), 'Template Workflow') as Record<string, JsonValue>
  if (!Array.isArray(source.nodes)) throw sourceError('SOURCE_PROTOCOL_ERROR', 'Template Workflow nodes are invalid.')
  const nodes: WorkflowNode[] = source.nodes.map((value, index) => {
    const node = record(value, `Template Workflow node ${index}`) as Record<string, JsonValue>
    if ((typeof node.id !== 'string' && typeof node.id !== 'number') || typeof node.type !== 'string' || !Array.isArray(node.widgets_values)) {
      throw sourceError('SOURCE_PROTOCOL_ERROR', `Template Workflow node ${index} is invalid.`)
    }
    return node as WorkflowNode
  })
  return { ...source, nodes }
}

function parseParameter(value: unknown): RuntimeParameterDefinition {
  const source = record(value, 'Template parameter')
  const valueType = source.value_type
  const accepted: readonly RuntimeParameterValueType[] = ['string', 'integer', 'number', 'boolean', 'asset_reference']
  if (!accepted.includes(valueType as RuntimeParameterValueType) || typeof source.required !== 'boolean') {
    throw sourceError('SOURCE_PROTOCOL_ERROR', 'Template parameter contract is invalid.')
  }
  const parameter: RuntimeParameterDefinition = {
    parameterId: text(source.parameter_id, 'Template parameter id'),
    kind: text(source.kind, 'Template parameter kind'),
    valueType: valueType as RuntimeParameterValueType,
    required: source.required,
    ...(source.default_value === undefined ? {} : { defaultValue: jsonValue(source.default_value, 'Template parameter default value') }),
    ...(source.minimum === undefined ? {} : { minimum: Number(source.minimum) }),
    ...(source.maximum === undefined ? {} : { maximum: Number(source.maximum) }),
  }
  return Object.freeze(parameter)
}

function parseBinding(value: unknown): RuntimeBinding {
  const source = record(value, 'Template binding')
  const operation = source.operation
  if (operation === 'replace_input') {
    return Object.freeze({
      parameterId: text(source.parameter_id, 'Template binding parameter id'),
      operation,
      nodeId: sourceId(source.node_id, 'Template binding node id'),
      inputName: text(source.input_name, 'Template binding input name'),
      widgetIndex: integer(source.widget_index, 'Template binding widget index'),
    })
  }
  if (operation === 'compose_text') {
    return Object.freeze({
      parameterId: text(source.parameter_id, 'Template binding parameter id'),
      operation,
      targetParameterId: text(source.target_parameter_id, 'Template binding target parameter id'),
    })
  }
  throw sourceError('SOURCE_PROTOCOL_ERROR', 'Template binding operation is invalid.')
}

function parseTemplate(value: unknown): ComfyTemplateBundle {
  const source = record(value, 'ComfyUI template bundle')
  if (!Array.isArray(source.parameters_json) || !Array.isArray(source.bindings_json)) {
    throw sourceError('SOURCE_PROTOCOL_ERROR', 'ComfyUI template runtime configuration is invalid.')
  }
  const outputIds = source.expected_output_node_ids_json
  if (outputIds !== null && (!Array.isArray(outputIds) || outputIds.length === 0)) {
    throw sourceError('SOURCE_PROTOCOL_ERROR', 'ComfyUI template output node identities are invalid.')
  }
  return Object.freeze({
    id: sourceId(source.id, 'ComfyUI template id'),
    title: text(source.title, 'ComfyUI template title'),
    revisionNumber: integer(source.revision_number, 'ComfyUI template revision', 1),
    workflowSha256: text(source.workflow_sha256, 'ComfyUI template Workflow SHA-256'),
    workflow: parseWorkflow(source.workflow_json),
    configRevision: integer(source.config_revision, 'ComfyUI template config revision', 1),
    dimensionStrategy: text(source.dimension_strategy, 'ComfyUI template dimension strategy'),
    parameters: Object.freeze(source.parameters_json.map(parseParameter)),
    bindings: Object.freeze(source.bindings_json.map(parseBinding)),
    expectedOutputNodeIds: outputIds === null
      ? null
      : Object.freeze(outputIds.map((id, index) => sourceId(id, `ComfyUI template output node id ${index}`))),
  })
}

export class GenerationSourceCli implements GenerationSource {
  private readonly options: GenerationSourceCliOptions
  private readonly execute: SourceCliProcess

  constructor(options: GenerationSourceCliOptions) {
    this.options = options
    if (options.executable.trim().length === 0) throw new TypeError('ComfyUI source CLI executable is required.')
    if (!Number.isSafeInteger(options.port) || options.port < 1 || options.port > 65535) {
      throw new TypeError('ComfyUI source CLI port is invalid.')
    }
    this.execute = options.process ?? runSourceCliProcess
  }

  async readInstance(instanceId: string, signal?: AbortSignal): Promise<ComfyInstanceSource> {
    return parseInstance(await this.run('instance', instanceId, signal))
  }

  async readTemplate(templateId: string, signal?: AbortSignal): Promise<ComfyTemplateBundle> {
    return parseTemplate(await this.run('template-bundle', templateId, signal))
  }

  private async run(operation: 'instance' | 'template-bundle', id: string, signal?: AbortSignal): Promise<unknown> {
    if (!SOURCE_ID.test(id)) throw new TypeError('ComfyUI source id is invalid.')
    const effectiveSignal = signal ?? new AbortController().signal
    const output = await this.execute(this.options.executable, [
      '--port', String(this.options.port),
      '--timeout-ms', String(SOURCE_QUERY_TIMEOUT_MS),
      operation,
      '--id', id,
    ], effectiveSignal)
    return envelopeResult(output)
  }
}

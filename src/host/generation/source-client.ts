import { ERROR_CATALOG } from '../../../config/error-catalog-schema.ts'

import { readSourceRecord, type SourceRead } from '../source-client/source-client.ts'
import { SourceClientError } from '../source-client/http-client.ts'

import { readSourceAddress, type SourceAddress } from '../../source-settings.ts'
import { GenerationRuntimeError, type JsonValue } from './generation-runtime.ts'
import type {
  ComfyInstanceSource,
  ComfyTemplateBundle,
  GenerationSource,
  UiWorkflow,
  WorkflowNode,
} from './source-preparer.ts'

const SOURCE_ID = /^[1-9][0-9]{0,19}$/u

export interface GenerationSourceClientOptions {
  readonly settings: { get(): SourceAddress }
  readonly read?: SourceRead
}

function sourceError(code: string, message: string): GenerationRuntimeError {
  return new GenerationRuntimeError(code, message)
}

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

function jsonValue(value: unknown, label: string): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.map((item, index) => jsonValue(item, `${label}[${index}]`))
  const source = record(value, label)
  return Object.fromEntries(Object.entries(source).map(([key, item]) => [key, jsonValue(item, `${label}.${key}`)]))
}

function envelopeResult(value: unknown): unknown {
  const envelope = record(value, 'ComfyUI source response')
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
    return node as WorkflowNode
  })
  return { ...source, nodes }
}

function parseTemplate(value: unknown): ComfyTemplateBundle {
  const source = record(value, 'ComfyUI template bundle')
  return Object.freeze({
    id: sourceId(source.id, 'ComfyUI template id'),
    title: text(source.title, 'ComfyUI template title'),
    workflow: parseWorkflow(source.workflow_json),
  })
}

export class GenerationSourceClient implements GenerationSource {
  private readonly options: GenerationSourceClientOptions
  private readonly read: SourceRead

  constructor(options: GenerationSourceClientOptions) {
    this.options = options
    this.read = options.read ?? readSourceRecord
  }

  async readInstance(instanceId: string, signal?: AbortSignal): Promise<ComfyInstanceSource> {
    return parseInstance(await this.run('instance', instanceId, signal))
  }

  async readTemplate(templateId: string, signal?: AbortSignal): Promise<ComfyTemplateBundle> {
    return parseTemplate(await this.run('template-bundle', templateId, signal))
  }

  private async run(operation: 'instance' | 'template-bundle', id: string, signal?: AbortSignal): Promise<unknown> {
    if (!SOURCE_ID.test(id)) throw new TypeError('ComfyUI source id is invalid.')
    try {
      return envelopeResult(await this.read({ address: readSourceAddress(this.options.settings), operation, id, signal }))
    } catch (error) {
      if (signal?.aborted || error instanceof Error && error.name === 'AbortError' || error instanceof GenerationRuntimeError) throw error
      if (error instanceof SourceClientError && error.code === 'SOURCE_CONNECTION_FAILED') throw sourceError(ERROR_CATALOG.SOURCE_CONNECTION_FAILED.code, error.message)
      if (error instanceof SourceClientError && error.code === 'TOTAL_TIMEOUT') throw sourceError(ERROR_CATALOG.SOURCE_REQUEST_TIMEOUT.code, error.message)
      if (error instanceof SourceClientError && error.code === 'RESPONSE_TOO_LARGE') throw sourceError('SOURCE_RESPONSE_TOO_LARGE', error.message)
      if (error instanceof SourceClientError && ['CONTRACT_PROTOCOL_ERROR', 'DISCOVERY_PROTOCOL_ERROR', 'INVALID_ARGUMENT'].includes(error.code)) throw sourceError('SOURCE_PROTOCOL_ERROR', error.message)
      if (error instanceof SourceClientError && error.code === 'SOURCE_HTTP_ERROR' && error.status !== undefined) {
        throw sourceError('SOURCE_QUERY_FAILED', ERROR_CATALOG.SOURCE_QUERY_FAILED.diagnostic_template
          .replaceAll('{operation}', operation).replaceAll('{id}', id).replaceAll('{status}', String(error.status)))
      }
      throw sourceError('SOURCE_QUERY_FAILED', error instanceof Error ? error.message : String(error))
    }
  }
}

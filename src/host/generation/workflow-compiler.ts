import { GenerationRuntimeError, type JsonValue } from './generation-runtime.ts'
import type {
  UiWorkflow,
  WorkflowCompiler,
  WorkflowCompilerInput,
  WorkflowCompilerResult,
} from './source-preparer.ts'

const EDITOR_ONLY_NODE_TYPES = new Set(['Fast Groups Bypasser (rgthree)', 'Label (rgthree)', 'MarkdownNote', 'Note', '孤海注释'])
const WIDGET_TYPES = new Set(['INT', 'FLOAT', 'STRING', 'BOOLEAN', 'COMBO', 'COMFY_DYNAMICCOMBO_V3'])
const CONTROL_AFTER_GENERATE = new Set(['fixed', 'increment', 'decrement', 'randomize'])

export interface ComfyWorkflowCompilerOptions {
  readonly fetchImplementation?: typeof fetch
  readonly timeoutMs?: number
}

type UnknownRecord = Record<string, unknown>

function fail(message: string): never {
  throw new GenerationRuntimeError('WORKFLOW_COMPILE_FAILED', message)
}

function record(value: unknown, label: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${label} is invalid.`)
  return value as UnknownRecord
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}

function inputDefinitions(definition: UnknownRecord): { required: UnknownRecord; optional: UnknownRecord } {
  const input = record(definition.input ?? {}, 'ComfyUI node input definition')
  return {
    required: record(input.required ?? {}, 'ComfyUI required input definition'),
    optional: record(input.optional ?? {}, 'ComfyUI optional input definition'),
  }
}

function inputOrder(definition: UnknownRecord): readonly string[] {
  const definitions = inputDefinitions(definition)
  const order = record(definition.input_order ?? {}, 'ComfyUI node input order')
  const required = Array.isArray(order.required) ? order.required : Object.keys(definitions.required)
  const optional = Array.isArray(order.optional) ? order.optional : Object.keys(definitions.optional)
  const names = [...required, ...optional]
  if (names.some(name => typeof name !== 'string' || name.length === 0)) fail('ComfyUI node input order is invalid.')
  return names as string[]
}

function descriptor(definition: UnknownRecord, name: string): readonly unknown[] | undefined {
  const definitions = inputDefinitions(definition)
  const value = definitions.required[name] ?? definitions.optional[name]
  return Array.isArray(value) ? value : undefined
}

function widgetDescriptor(value: readonly unknown[] | undefined): boolean {
  if (value === undefined || value.length === 0) return false
  return Array.isArray(value[0]) || WIDGET_TYPES.has(String(value[0]))
}

function instanceComboValue(value: JsonValue, definition: readonly unknown[] | undefined): JsonValue {
  const choices = definition?.[0]
  if (typeof value !== 'string' || !Array.isArray(choices) || choices.includes(value)) return value
  if (!value.includes('/') && !value.includes('\\')) return value
  const normalized = value.replaceAll('\\', '/')
  const matches = choices.filter(choice => typeof choice === 'string' && choice.replaceAll('\\', '/') === normalized)
  return matches.length === 1 ? matches[0] as string : value
}

function namedWidgetInputs(node: UnknownRecord): readonly string[] {
  const names: string[] = []
  for (const value of array(node.inputs)) {
    const input = record(value, 'Workflow node input')
    if (input.type === 'IMAGEUPLOAD') continue
    if (input.widget === undefined) continue
    const widget = record(input.widget, 'Workflow input widget')
    if (typeof widget.name !== 'string' || widget.name.length === 0) fail('Workflow widget name is invalid.')
    names.push(widget.name)
  }
  return names
}

function mapWidgets(node: UnknownRecord, definition: UnknownRecord): Readonly<Record<string, JsonValue>> {
  const values = array(node.widgets_values) as readonly JsonValue[]
  const named = namedWidgetInputs(node)
  const connected = new Set(array(node.inputs).flatMap(value => {
    const input = record(value, 'Workflow node input')
    return input.link === null || input.link === undefined || typeof input.name !== 'string' ? [] : [input.name]
  }))
  const names = named.length > 0
    ? named
    : inputOrder(definition).filter(name => !connected.has(name) && widgetDescriptor(descriptor(definition, name)))
  const mapped: Record<string, JsonValue> = {}
  let cursor = 0
  for (const name of names) {
    if (cursor >= values.length) break
    mapped[name] = structuredClone(instanceComboValue(values[cursor]!, descriptor(definition, name)))
    cursor += 1
    const config = descriptor(definition, name)?.[1]
    const options = config === null || typeof config !== 'object' || Array.isArray(config) ? {} : config as UnknownRecord
    if ((options.control_after_generate === true || name === 'seed' || name === 'noise_seed') && CONTROL_AFTER_GENERATE.has(String(values[cursor]))) {
      cursor += 1
    }
  }
  return mapped
}

function workflowLinks(workflow: UiWorkflow): Map<string, readonly unknown[]> {
  const links = new Map<string, readonly unknown[]>()
  for (const value of array(workflow.links)) {
    if (!Array.isArray(value) || value.length < 6) fail('Workflow link is invalid.')
    links.set(String(value[0]), value)
  }
  return links
}

function compile(
  workflow: UiWorkflow,
  nodeDefinitions: UnknownRecord,
  expectedOutputNodeIds: readonly string[] | null,
): WorkflowCompilerResult {
  if (workflow.version !== 0.4) fail('Workflow version is not supported.')
  const links = workflowLinks(workflow)
  const apiWorkflow: Record<string, JsonValue> = {}

  for (const rawNode of workflow.nodes) {
    const node = rawNode as UnknownRecord
    const nodeId = String(node.id)
    const nodeType = node.type
    if (typeof nodeType !== 'string' || nodeType.length === 0) fail(`Workflow node "${nodeId}" type is invalid.`)
    if (node.mode === 2 || node.mode === 4 || EDITOR_ONLY_NODE_TYPES.has(nodeType)) continue
    const definition = record(nodeDefinitions[nodeType], `ComfyUI node definition "${nodeType}"`)
    const inputs: Record<string, JsonValue> = { ...mapWidgets(node, definition) }
    for (const rawInput of array(node.inputs)) {
      const input = record(rawInput, `Workflow node "${nodeId}" input`)
      if (input.link === null || input.link === undefined) continue
      if (typeof input.name !== 'string' || input.name.length === 0) fail(`Workflow node "${nodeId}" input name is invalid.`)
      const link = links.get(String(input.link))
      if (link === undefined) fail(`Workflow node "${nodeId}" references a missing link.`)
      inputs[input.name] = [String(link[1]), Number(link[2])]
    }
    apiWorkflow[nodeId] = {
      class_type: nodeType,
      inputs,
      ...(typeof node.title === 'string' && node.title.length > 0 ? { _meta: { title: node.title } } : {}),
    }
  }

  const discoveredOutputIds = Object.entries(apiWorkflow).flatMap(([nodeId, value]) => {
    const node = value as Readonly<Record<string, JsonValue>>
    const definition = record(nodeDefinitions[String(node.class_type)], 'ComfyUI output node definition')
    return definition.output_node === true ? [nodeId] : []
  })
  if (discoveredOutputIds.length === 0) fail('Workflow does not contain an active output node.')
  const activeOutputNodeIds = expectedOutputNodeIds === null ? discoveredOutputIds : [...expectedOutputNodeIds]
  for (const nodeId of activeOutputNodeIds) {
    if (!discoveredOutputIds.includes(nodeId)) fail(`Declared output node "${nodeId}" is not an active ComfyUI output node.`)
  }
  return Object.freeze({
    apiWorkflow: Object.freeze(apiWorkflow),
    activeOutputNodeIds: Object.freeze(activeOutputNodeIds),
  })
}

export class ComfyWorkflowCompiler implements WorkflowCompiler {
  private readonly fetchImplementation: typeof fetch
  private readonly timeoutMs: number

  constructor(options: ComfyWorkflowCompilerOptions = {}) {
    this.fetchImplementation = options.fetchImplementation ?? fetch
    this.timeoutMs = options.timeoutMs ?? 120_000
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1) throw new TypeError('ComfyUI compiler timeout is invalid.')
  }

  async compile(input: WorkflowCompilerInput): Promise<WorkflowCompilerResult> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    const signal = input.signal === undefined ? controller.signal : AbortSignal.any([controller.signal, input.signal])
    const baseUrl = input.connection.url.replace(/\/$/u, '')
    try {
      let response: Response
      try {
        response = await this.fetchImplementation(`${baseUrl}/object_info`, {
          signal,
          headers: {
            accept: 'application/json',
            ...(input.connection.authorization === null ? {} : { authorization: input.connection.authorization }),
          },
        })
      } catch {
        throw new GenerationRuntimeError('COMFYUI_CONNECTION_FAILED', 'ComfyUI node definitions request failed.')
      }
      if (!response.ok) throw new GenerationRuntimeError('COMFYUI_HTTP_ERROR', `ComfyUI returned HTTP ${response.status} for /object_info.`)
      let nodeDefinitions: unknown
      try {
        nodeDefinitions = await response.json()
      } catch {
        throw new GenerationRuntimeError('COMFYUI_PROTOCOL_ERROR', 'ComfyUI returned invalid node definitions JSON.')
      }
      return compile(input.workflow, record(nodeDefinitions, 'ComfyUI node definitions'), input.expectedOutputNodeIds)
    } finally {
      clearTimeout(timeout)
    }
  }
}

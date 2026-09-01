import { GenerationRuntimeError, type JsonValue } from './generation-runtime.ts'
import type {
  OfficialApiWorkflowCompileInput,
  OfficialApiWorkflowCompileResult,
} from './official-api-workflow.ts'
import type {
  UiWorkflow,
  WorkflowCompiler,
  WorkflowCompilerInput,
  WorkflowCompilerResult,
} from './source-preparer.ts'
import {
  RUNTIME_PARAMETER_INPUT_ALIASES,
  STANDARD_RUNTIME_PARAMETER_KINDS,
} from './runtime-parameters.ts'

const EDITOR_ONLY_NODE_TYPES = new Set(['Fast Groups Bypasser (rgthree)', 'Label (rgthree)', 'MarkdownNote', 'Note', '孤海注释'])
const WIDGET_TYPES = new Set([
  'INT', 'FLOAT', 'STRING', 'BOOLEAN', 'COMBO', 'COMFY_DYNAMICCOMBO_V3', 'AUTOCOMPLETE_TEXT_LORAS',
])
const CONTROL_AFTER_GENERATE = new Set(['fixed', 'increment', 'decrement', 'randomize'])
const POWER_LORA_LOADER_TYPE = 'Power Lora Loader (rgthree)'
const LORA_MANAGER_LOADER_TYPE = 'Lora Loader (LoraManager)'
const MODEL_INPUT_NAMES = new Set(['ckpt_name', 'unet_name'])
const RGTHREE_SEED_TYPE = 'Seed (rgthree)'
const RGTHREE_RANDOM_SEED_SENTINEL = -1
const RGTHREE_RANDOM_SEED_MAX_EXCLUSIVE = 1125899906842624
const SERIALIZED_VALUE_SOURCE_TYPES = Object.freeze({
  TextInput_: Object.freeze({ inputName: 'text', portType: 'STRING', valueType: 'string' }),
  Float: Object.freeze({ inputName: 'value', portType: 'FLOAT', valueType: 'number' }),
} as const)
const OBJECT_INFO_CACHE_TTL_MS = 10 * 60 * 1_000

export interface ComfyWorkflowCompilerOptions {
  readonly officialApiWorkflowCompiler: {
    compile(input: OfficialApiWorkflowCompileInput): Promise<OfficialApiWorkflowCompileResult>
  }
  readonly fetchImplementation?: typeof fetch
  readonly timeoutMs?: number
  readonly createRandomSeed?: () => number
  readonly now?: () => number
}

type UnknownRecord = Record<string, unknown>

type NumericSourceIndex = WeakMap<object, Map<string, string>>

interface NodeDefinitionsSnapshot {
  readonly definitions: UnknownRecord
  readonly numericSources: NumericSourceIndex
}

interface ExactDecimal {
  readonly sign: -1 | 0 | 1
  readonly coefficient: string
  readonly exponent: bigint
  readonly source: string
}

interface ExactNumberBound {
  readonly value: ExactDecimal
  readonly source: string
}

interface JsonParseContext {
  readonly source?: string
}

type JsonParseWithSource = (
  text: string,
  reviver: (this: unknown, key: string, value: unknown, context: JsonParseContext) => unknown,
) => unknown

function fail(message: string): never {
  throw new GenerationRuntimeError('WORKFLOW_COMPILE_FAILED', message)
}

function record(value: unknown, label: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${label} is invalid.`)
  return value as UnknownRecord
}

function parseExactDecimal(source: string): ExactDecimal | undefined {
  const match = /^(-?)([0-9]+)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/u.exec(source)
  if (match === null) return undefined
  const fraction = match[3] ?? ''
  let coefficient = `${match[2]}${fraction}`.replace(/^0+/u, '')
  if (coefficient.length === 0) {
    return { sign: 0, coefficient: '0', exponent: 0n, source }
  }
  let exponent: bigint
  try {
    exponent = BigInt(match[4] ?? '0') - BigInt(fraction.length)
  } catch {
    return undefined
  }
  const trailingZeroCount = coefficient.length - coefficient.replace(/0+$/u, '').length
  if (trailingZeroCount > 0) {
    coefficient = coefficient.slice(0, -trailingZeroCount)
    exponent += BigInt(trailingZeroCount)
  }
  return {
    sign: match[1] === '-' ? -1 : 1,
    coefficient,
    exponent,
    source,
  }
}

function compareExactDecimal(left: ExactDecimal, right: ExactDecimal): number {
  if (left.sign !== right.sign) return left.sign < right.sign ? -1 : 1
  if (left.sign === 0) return 0
  const leftMagnitude = BigInt(left.coefficient.length) + left.exponent
  const rightMagnitude = BigInt(right.coefficient.length) + right.exponent
  let comparison = leftMagnitude === rightMagnitude ? 0 : leftMagnitude < rightMagnitude ? -1 : 1
  if (comparison === 0) {
    const width = Math.max(left.coefficient.length, right.coefficient.length)
    for (let index = 0; index < width; index += 1) {
      const leftDigit = left.coefficient[index] ?? '0'
      const rightDigit = right.coefficient[index] ?? '0'
      if (leftDigit === rightDigit) continue
      comparison = leftDigit < rightDigit ? -1 : 1
      break
    }
  }
  return left.sign === -1 ? -comparison : comparison
}

function parseNodeDefinitions(text: string): NodeDefinitionsSnapshot {
  const numericSources: NumericSourceIndex = new WeakMap()
  const parsed = (JSON.parse as JsonParseWithSource)(text, function (key, value, context) {
    if (typeof value !== 'number') return value
    if (typeof context?.source !== 'string') {
      throw new TypeError('JSON.parse numeric source metadata is unavailable.')
    }
    const parent = this as object
    const sources = numericSources.get(parent) ?? new Map<string, string>()
    sources.set(key, context.source)
    numericSources.set(parent, sources)
    return value
  })
  return {
    definitions: record(parsed, 'ComfyUI node definitions'),
    numericSources,
  }
}

function exactNumberBound(
  options: UnknownRecord,
  key: 'min' | 'max',
  numericSources: NumericSourceIndex,
): ExactNumberBound | undefined {
  const value = options[key]
  if (typeof value !== 'number') return undefined
  const source = numericSources.get(options)?.get(key) ?? JSON.stringify(value)
  const exact = parseExactDecimal(source)
  if (exact === undefined) fail(`ComfyUI numeric input ${key} is invalid.`)
  return { value: exact, source }
}

type SerializedValueSourceType = keyof typeof SERIALIZED_VALUE_SOURCE_TYPES

function serializedValueSourceType(
  nodeDefinitions: UnknownRecord,
  nodeType: string,
): SerializedValueSourceType | undefined {
  if (Object.hasOwn(nodeDefinitions, nodeType) || !Object.hasOwn(SERIALIZED_VALUE_SOURCE_TYPES, nodeType)) return undefined
  return nodeType as SerializedValueSourceType
}

function serializedValueSourceDefinition(nodeType: SerializedValueSourceType): UnknownRecord {
  const source = SERIALIZED_VALUE_SOURCE_TYPES[nodeType]
  return {
    input: { required: { [source.inputName]: [source.portType, {}] } },
    input_order: { required: [source.inputName], optional: [] },
    output_node: false,
  }
}

function nodeDefinition(nodeDefinitions: UnknownRecord, nodeType: string): UnknownRecord {
  const serializedType = serializedValueSourceType(nodeDefinitions, nodeType)
  return serializedType === undefined
    ? record(nodeDefinitions[nodeType], `ComfyUI node definition "${nodeType}"`)
    : serializedValueSourceDefinition(serializedType)
}

function serializedValueSourceValue(
  node: UnknownRecord,
  nodeType: SerializedValueSourceType,
  outputIndex: number,
): JsonValue {
  const source = SERIALIZED_VALUE_SOURCE_TYPES[nodeType]
  const inputs = array(node.inputs).map(value => record(value, `Workflow node "${String(node.id)}" input`))
  const outputs = array(node.outputs).map(value => record(value, `Workflow node "${String(node.id)}" output`))
  const values = array(node.widgets_values) as readonly JsonValue[]
  const input = inputs[0]
  const widget = input === undefined || input.widget === undefined
    ? undefined
    : record(input.widget, `Workflow node "${String(node.id)}" input widget`)
  const output = outputs[0]
  const valid = inputs.length === 1
    && outputs.length === 1
    && values.length === 1
    && outputIndex === 0
    && input?.name === source.inputName
    && (input.link === null || input.link === undefined)
    && widget?.name === source.inputName
    && output?.type === source.portType
    && typeof values[0] === source.valueType
    && (source.valueType !== 'number' || Number.isFinite(values[0]))
  if (!valid) {
    fail(`Workflow serialized value source "${String(node.id)}:${nodeType}" is invalid.`)
  }
  return structuredClone(values[0]!)
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}

function waitForPromise<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException('The request was canceled.', 'AbortError'))
  return new Promise<T>((resolve, reject) => {
    const finish = (complete: () => void): void => {
      signal.removeEventListener('abort', abort)
      complete()
    }
    const abort = (): void => finish(() => reject(new DOMException('The request was canceled.', 'AbortError')))
    signal.addEventListener('abort', abort, { once: true })
    promise.then(
      value => finish(() => resolve(value)),
      error => finish(() => reject(error)),
    )
  })
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

function publishedWidgetName(definition: UnknownRecord, name: string): boolean {
  const definitions = inputDefinitions(definition)
  if (Object.hasOwn(definitions.required, name) || Object.hasOwn(definitions.optional, name)) return true
  const parentName = name.split('.')[0]
  return parentName !== undefined && descriptor(definition, parentName)?.[0] === 'COMFY_DYNAMICCOMBO_V3'
}

function instanceComboValue(value: JsonValue, definition: readonly unknown[] | undefined): JsonValue {
  const choices = definition?.[0]
  if (typeof value !== 'string' || !Array.isArray(choices) || choices.includes(value)) return value
  if (choices.length === 1 && typeof choices[0] === 'string') return choices[0]
  const normalized = value.replaceAll('\\', '/')
  const hasDirectory = normalized.includes('/')
  const matches = choices.filter(choice => {
    if (typeof choice !== 'string') return false
    const normalizedChoice = choice.replaceAll('\\', '/')
    return hasDirectory
      ? normalizedChoice === normalized
      : normalizedChoice.split('/').at(-1) === normalized
  })
  return matches.length === 1 ? matches[0] as string : value
}

function instanceWidgetValue(
  name: string,
  value: JsonValue,
  definition: readonly unknown[] | undefined,
): JsonValue {
  if (definition?.[0] !== 'BOOLEAN' || typeof value === 'boolean') {
    return instanceComboValue(value, definition)
  }
  const config = definition[1]
  if (config !== null && typeof config === 'object' && !Array.isArray(config)) {
    const defaultValue = (config as UnknownRecord).default
    if (typeof defaultValue === 'boolean') return defaultValue
  }
  fail(`Workflow BOOLEAN widget "${name}" has an invalid serialized value and no live BOOLEAN default.`)
}

function namedWidgetInputs(node: UnknownRecord, definition: UnknownRecord): readonly string[] {
  const names: string[] = []
  for (const value of array(node.inputs)) {
    const input = record(value, 'Workflow node input')
    if (input.type === 'IMAGEUPLOAD') continue
    if (input.widget === undefined) continue
    const widget = record(input.widget, 'Workflow input widget')
    if (typeof widget.name !== 'string' || widget.name.length === 0) fail('Workflow widget name is invalid.')
    names.push(widget.name)
  }
  const ordered: string[] = []
  for (const name of names) {
    if (ordered.includes(name)) continue
    ordered.push(name)
    if (descriptor(definition, name)?.[0] !== 'COMFY_DYNAMICCOMBO_V3') continue
    ordered.push(...names.filter(candidate => candidate.startsWith(`${name}.`) && !ordered.includes(candidate)))
  }
  return ordered
}

interface WidgetMapping {
  readonly name: string
  readonly index: number
}

function explicitWidgetMappings(node: UnknownRecord, definition: UnknownRecord): readonly WidgetMapping[] {
  const properties = node.properties
  if (properties === null || typeof properties !== 'object' || Array.isArray(properties)) return []
  const ids = (properties as UnknownRecord).__lm_widget_ids
  if (ids === undefined) return []
  if (!Array.isArray(ids)) fail('Workflow serialized widget identities are invalid.')
  return ids.flatMap((name, index) => typeof name === 'string' && publishedWidgetName(definition, name)
    ? [{ name, index }]
    : [])
}

function serializedNamedWidgetMappings(node: UnknownRecord, definition: UnknownRecord): readonly WidgetMapping[] {
  const named = node.widgets_values_named
  if (named === null || typeof named !== 'object' || Array.isArray(named)) return []
  const valueCount = array(node.widgets_values).length
  return Object.keys(named as UnknownRecord).flatMap((name, index) => publishedWidgetName(definition, name) && index < valueCount
    ? [{ name, index }]
    : [])
}

function widgetMappings(node: UnknownRecord, definition: UnknownRecord): readonly WidgetMapping[] {
  const values = array(node.widgets_values) as readonly JsonValue[]
  const explicit = explicitWidgetMappings(node, definition)
  if (explicit.length > 0) return explicit.filter(mapping => mapping.index < values.length)
  const serializedNamed = serializedNamedWidgetMappings(node, definition)
  if (serializedNamed.length > 0) return serializedNamed
  const named = namedWidgetInputs(node, definition)
  const connected = new Set(array(node.inputs).flatMap(value => {
    const input = record(value, 'Workflow node input')
    return input.link === null || input.link === undefined || typeof input.name !== 'string' ? [] : [input.name]
  }))
  const names = named.length > 0
    ? named
    : inputOrder(definition).filter(name => !connected.has(name) && widgetDescriptor(descriptor(definition, name)))
  const mappings: WidgetMapping[] = []
  let cursor = 0
  for (const name of names) {
    if (cursor >= values.length) break
    mappings.push({ name, index: cursor })
    cursor += 1
    const config = descriptor(definition, name)?.[1]
    const options = config === null || typeof config !== 'object' || Array.isArray(config) ? {} : config as UnknownRecord
    if ((options.control_after_generate === true || name === 'seed' || name === 'noise_seed') && CONTROL_AFTER_GENERATE.has(String(values[cursor]))) {
      cursor += 1
    }
  }
  return mappings
}

function mapWidgets(node: UnknownRecord, definition: UnknownRecord): Readonly<Record<string, JsonValue>> {
  const values = array(node.widgets_values) as readonly JsonValue[]
  const mapped: Record<string, JsonValue> = {}
  for (const mapping of widgetMappings(node, definition)) {
    mapped[mapping.name] = structuredClone(instanceWidgetValue(
      mapping.name,
      values[mapping.index]!,
      descriptor(definition, mapping.name),
    ))
  }
  return mapped
}

function defaultCreateRandomSeed(): number {
  return Math.floor(Math.random() * RGTHREE_RANDOM_SEED_MAX_EXCLUSIVE)
}

function materializeRgthreeRandomSeeds(
  workflow: UiWorkflow,
  nodeDefinitions: UnknownRecord,
  createRandomSeed: () => number,
): void {
  for (const rawNode of workflow.nodes) {
    const node = rawNode as UnknownRecord
    if (node.type !== RGTHREE_SEED_TYPE || node.mode === 2 || node.mode === 4) continue
    const definition = record(nodeDefinitions[RGTHREE_SEED_TYPE], `ComfyUI node definition "${RGTHREE_SEED_TYPE}"`)
    const mapping = widgetMappings(node, definition).find(candidate => candidate.name === 'seed')
    if (mapping === undefined || !Array.isArray(node.widgets_values)) continue
    if (node.widgets_values[mapping.index] !== RGTHREE_RANDOM_SEED_SENTINEL) continue
    const seed = createRandomSeed()
    if (!Number.isSafeInteger(seed) || seed < 0 || seed >= RGTHREE_RANDOM_SEED_MAX_EXCLUSIVE) {
      fail('Seed (rgthree) random seed generator returned an invalid seed.')
    }
    ;(node.widgets_values as JsonValue[])[mapping.index] = seed
    const named = node.widgets_values_named
    if (named !== null && typeof named === 'object' && !Array.isArray(named)) {
      ;(named as UnknownRecord)[mapping.name] = seed
    }
  }
}

function loraError(code: string, message: string): never {
  throw new GenerationRuntimeError(code, message)
}

function comboChoices(definition: UnknownRecord, inputName: string): readonly string[] {
  const choices = descriptor(definition, inputName)?.[0]
  return Array.isArray(choices) ? choices.filter(choice => typeof choice === 'string') as string[] : []
}

function instanceLoraChoices(nodeDefinitions: UnknownRecord): readonly string[] {
  const choices = new Set<string>()
  for (const value of Object.values(nodeDefinitions)) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue
    for (const choice of comboChoices(value as UnknownRecord, 'lora_name')) choices.add(choice)
  }
  return [...choices]
}

function resolveInstanceLoraPath(fileName: string, choices: readonly string[]): string {
  const normalizedFileName = fileName.replaceAll('\\', '/').split('/').at(-1)
  const matches = choices.filter(choice => choice.replaceAll('\\', '/').split('/').at(-1) === normalizedFileName)
  if (matches.length === 1) return matches[0]!
  if (matches.length === 0) {
    loraError('COMFYUI_LORA_ASSET_NOT_FOUND', `LoRA file "${fileName}" is not available on the target ComfyUI instance.`)
  }
  loraError(
    'COMFYUI_LORA_ASSET_AMBIGUOUS',
    `LoRA file "${fileName}" matches multiple target instance paths: ${matches.join(', ')}.`,
  )
}

function managerLoraInput(definition: UnknownRecord, mappings: readonly WidgetMapping[]): WidgetMapping | undefined {
  return mappings.find(mapping => {
    if (mapping.name !== 'text' && mapping.name !== 'lora_syntax') return false
    const inputDescriptor = descriptor(definition, mapping.name)
    const type = inputDescriptor?.[0]
    const options = inputDescriptor?.[1]
    const tooltip = options !== null && typeof options === 'object' && !Array.isArray(options)
      ? String((options as UnknownRecord).tooltip ?? '')
      : ''
    return type === 'AUTOCOMPLETE_TEXT_LORAS' || tooltip.includes('<lora:')
  })
}

interface StandardLoraSlot {
  readonly node: UnknownRecord
  readonly activate: boolean
  readonly file: WidgetMapping
  readonly modelWeight: WidgetMapping
  readonly clipWeight?: WidgetMapping
}

interface ManagerLoraSlot {
  readonly node: UnknownRecord
  readonly activate: boolean
  readonly text: WidgetMapping
  readonly structured?: WidgetMapping
}

interface PowerLoraSlot {
  readonly node: UnknownRecord
  readonly activate: boolean
}

function isPowerLoraWidget(value: unknown): value is UnknownRecord {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof (value as UnknownRecord).lora === 'string'
}

function powerLoraWidgetValues(node: UnknownRecord): readonly UnknownRecord[] {
  return array(node.widgets_values).filter(isPowerLoraWidget)
}

function loraManagerStructuredMapping(node: UnknownRecord): WidgetMapping {
  const nodeId = String(node.id)
  const properties = node.properties
  if (properties === null || typeof properties !== 'object' || Array.isArray(properties)) {
    loraError('COMFYUI_LORA_INPUT_INVALID', `Workflow LoraManager node "${nodeId}" properties are invalid.`)
  }
  const ids = (properties as UnknownRecord).__lm_widget_ids
  if (!Array.isArray(ids)) {
    loraError('COMFYUI_LORA_INPUT_INVALID', `Workflow LoraManager node "${nodeId}" serialized widget identities are invalid.`)
  }
  const indexes = ids.flatMap((name, index) => name === 'loras' ? [index] : [])
  if (indexes.length !== 1) {
    loraError('COMFYUI_LORA_INPUT_INVALID', `Workflow LoraManager node "${nodeId}" must contain one serialized "loras" widget identity.`)
  }
  const values = node.widgets_values
  const index = indexes[0]!
  if (!Array.isArray(values) || index >= values.length || !Array.isArray(values[index])) {
    loraError('COMFYUI_LORA_INPUT_INVALID', `Workflow LoraManager node "${nodeId}" serialized "loras" widget value is invalid.`)
  }
  return { name: 'loras', index }
}

function powerLoraValue(value: UnknownRecord): JsonValue {
  if (typeof value.on !== 'boolean' || typeof value.lora !== 'string' || typeof value.strength !== 'number') {
    return structuredClone(value) as JsonValue
  }
  return {
    on: value.on,
    lora: value.lora,
    strength: value.strength,
    ...(typeof value.strengthTwo === 'number' ? { strengthTwo: value.strengthTwo } : {}),
  }
}

function powerLoraInputs(node: UnknownRecord): Readonly<Record<string, JsonValue>> {
  return Object.fromEntries(powerLoraWidgetValues(node).map((value, index) => [
    `lora_${index + 1}`,
    powerLoraValue(value),
  ]))
}

function replacePowerLoraWidgets(node: UnknownRecord, values: readonly JsonValue[]): void {
  const current = array(node.widgets_values)
  const firstLoraIndex = current.findIndex(isPowerLoraWidget)
  let lastLoraIndex = -1
  current.forEach((value, index) => {
    if (isPowerLoraWidget(value)) lastLoraIndex = index
  })
  if (firstLoraIndex === -1) {
    const headerIndex = current.findIndex(value => value !== null
      && typeof value === 'object'
      && !Array.isArray(value)
      && (value as UnknownRecord).type === 'PowerLoraLoaderHeaderWidget')
    const insertionIndex = headerIndex === -1 ? 0 : headerIndex + 1
    node.widgets_values = [
      ...current.slice(0, insertionIndex),
      ...values,
      ...current.slice(insertionIndex),
    ] as JsonValue[]
  } else {
    node.widgets_values = [
      ...current.slice(0, firstLoraIndex),
      ...values,
      ...current.slice(lastLoraIndex + 1),
    ] as JsonValue[]
  }

  const named = node.widgets_values_named
  if (named === null || typeof named !== 'object' || Array.isArray(named)) return
  const currentNamed = named as UnknownRecord
  const hasSerializedLora = Object.entries(currentNamed).some(([name, value]) => /^lora_[0-9]+$/u.test(name) || isPowerLoraWidget(value))
  const nextNamed: Record<string, JsonValue> = {}
  let inserted = false
  const insert = () => {
    values.forEach((value, index) => {
      nextNamed[`lora_${index + 1}`] = structuredClone(value)
    })
    inserted = true
  }
  for (const [name, value] of Object.entries(currentNamed)) {
    if (/^lora_[0-9]+$/u.test(name) || isPowerLoraWidget(value)) {
      if (!inserted) insert()
      continue
    }
    nextNamed[name] = structuredClone(value) as JsonValue
    if (!hasSerializedLora && !inserted && name === 'PowerLoraLoaderHeaderWidget') insert()
  }
  if (!inserted) insert()
  node.widgets_values_named = nextNamed
}

function setWidget(node: UnknownRecord, mapping: WidgetMapping, value: JsonValue): void {
  if (!Array.isArray(node.widgets_values) || mapping.index >= node.widgets_values.length) {
    loraError('COMFYUI_LORA_INPUT_INVALID', `Workflow LoRA input "${mapping.name}" does not resolve to a widget value.`)
  }
  ;(node.widgets_values as JsonValue[])[mapping.index] = value
  const named = node.widgets_values_named
  if (named !== null && typeof named === 'object' && !Array.isArray(named)) {
    ;(named as UnknownRecord)[mapping.name] = structuredClone(value)
  }
}

interface ModelSlot {
  readonly nodeId: string
  readonly nodeType: string
  readonly node: UnknownRecord
  readonly mapping: WidgetMapping
  readonly choices: readonly string[]
}

function modelError(code: string, message: string): never {
  throw new GenerationRuntimeError(code, message)
}

function resolveInstanceModelPath(fileName: string, choices: readonly string[]): string {
  const basename = fileName.replaceAll('\\', '/').split('/').at(-1)
  const matches = choices.filter(choice => choice.replaceAll('\\', '/').split('/').at(-1) === basename)
  if (matches.length === 1) return matches[0]!
  if (matches.length === 0) {
    modelError('COMFYUI_MODEL_ASSET_NOT_FOUND', `Generation model file "${fileName}" is not available on the target ComfyUI instance.`)
  }
  modelError(
    'COMFYUI_MODEL_ASSET_AMBIGUOUS',
    `Generation model file "${fileName}" matches multiple target instance paths: ${matches.join(', ')}.`,
  )
}

function applyModel(
  workflow: UiWorkflow,
  nodeDefinitions: UnknownRecord,
  selection: NonNullable<WorkflowCompilerInput['model']>,
): void {
  const slots: ModelSlot[] = []
  for (const rawNode of workflow.nodes) {
    const node = rawNode as UnknownRecord
    const nodeId = String(node.id)
    const nodeType = String(node.type)
    if (node.mode === 2 || node.mode === 4 || EDITOR_ONLY_NODE_TYPES.has(nodeType)) continue
    const definition = nodeDefinition(nodeDefinitions, nodeType)
    for (const mapping of widgetMappings(node, definition)) {
      if (!MODEL_INPUT_NAMES.has(mapping.name)) continue
      const choices = comboChoices(definition, mapping.name)
      if (choices.length > 0) slots.push({ nodeId, nodeType, node, mapping, choices })
    }
  }
  if (slots.length === 0) {
    modelError('COMFYUI_MODEL_INPUT_UNAVAILABLE', 'The Workflow does not contain an executable generation-model input.')
  }
  if (slots.length > 1) {
    modelError(
      'COMFYUI_MODEL_INPUT_AMBIGUOUS',
      `The Workflow contains multiple executable generation-model inputs: ${slots.map(slot => `${slot.nodeId}:${slot.nodeType}.${slot.mapping.name}`).join(', ')}.`,
    )
  }
  const slot = slots[0]!
  const path = resolveInstanceModelPath(selection.fileName, slot.choices)
  setWidget(slot.node, slot.mapping, path)
}

type RuntimeParameterContract =
  | {
    readonly kind: 'number'
    readonly integer: boolean
    readonly minimum?: ExactNumberBound
    readonly maximum?: ExactNumberBound
  }
  | { readonly kind: 'string' }
  | { readonly kind: 'boolean' }
  | {
    readonly kind: 'choices'
    readonly values: readonly JsonValue[]
    readonly stringCaseFold: boolean
    readonly multiselect: boolean
    readonly numericSources: NumericSourceIndex
  }
  | { readonly kind: 'unsupported'; readonly reason: string }
  | { readonly kind: 'unknown'; readonly typeLabel: string }

interface ParameterTarget {
  readonly key: string
  readonly nodeId: string
  readonly nodeType: string
  readonly node: UnknownRecord
  readonly mapping: WidgetMapping
  readonly marker: string
  readonly loraSyntax: boolean
  readonly multilineString: boolean
  readonly contract: RuntimeParameterContract
}

interface RuntimeParameterAssignment {
  readonly parameterId: string
  readonly kind: string
  readonly value: JsonValue
}

function parameterError(code: string, parameterId: string, message: string): never {
  throw new GenerationRuntimeError(code, `Generation parameter "${parameterId}" ${message}`)
}

function parameterMarker(node: UnknownRecord): string {
  const properties = node.properties
  const searchName = properties !== null && typeof properties === 'object' && !Array.isArray(properties)
    ? String((properties as UnknownRecord)['Node name for S&R'] ?? '')
    : ''
  return `${String(node.title ?? '')} ${searchName}`.toLowerCase()
}

function isMultilineStringWidget(definition: UnknownRecord, name: string): boolean {
  const inputDescriptor = descriptor(definition, name)
  if (inputDescriptor?.[0] !== 'STRING') return false
  const options = inputDescriptor[1]
  return options !== null
    && typeof options === 'object'
    && !Array.isArray(options)
    && (options as UnknownRecord).multiline === true
}

function runtimeParameterContractFromDescriptor(
  inputDescriptor: readonly unknown[] | undefined,
  numericSources: NumericSourceIndex,
): RuntimeParameterContract {
  const malformed = (reason: string): RuntimeParameterContract => ({
    kind: 'unsupported',
    reason: `publishes a malformed /object_info input contract: ${reason}`,
  })
  if (inputDescriptor === undefined || inputDescriptor.length === 0) {
    return malformed('the input descriptor must be a non-empty array.')
  }
  const type = inputDescriptor?.[0]
  if (typeof type !== 'string' && !Array.isArray(type)) {
    return malformed('the input type must be a string or a legacy candidate array.')
  }
  if (type === 'INT' || type === 'FLOAT') {
    const rawOptions = inputDescriptor?.[1]
    if (rawOptions !== undefined && optionalRecord(rawOptions) === undefined) {
      return malformed(`${type} options must be an object when present.`)
    }
    const options = optionalRecord(rawOptions) ?? {}
    for (const key of ['min', 'max'] as const) {
      if (Object.hasOwn(options, key) && typeof options[key] !== 'number') {
        return malformed(`${type}.${key} must be a JSON number.`)
      }
    }
    const minimum = exactNumberBound(options, 'min', numericSources)
    const maximum = exactNumberBound(options, 'max', numericSources)
    if (minimum !== undefined && maximum !== undefined && compareExactDecimal(minimum.value, maximum.value) > 0) {
      return malformed(`${type}.min must not be greater than ${type}.max.`)
    }
    return {
      kind: 'number',
      integer: type === 'INT',
      ...(minimum === undefined ? {} : { minimum }),
      ...(maximum === undefined ? {} : { maximum }),
    }
  }
  if (type === 'STRING' || type === 'AUTOCOMPLETE_TEXT_LORAS' || type === 'BOOLEAN') {
    const rawOptions = inputDescriptor?.[1]
    if (rawOptions !== undefined && optionalRecord(rawOptions) === undefined) {
      return malformed(`${type} options must be an object when present.`)
    }
    return type === 'BOOLEAN' ? { kind: 'boolean' } : { kind: 'string' }
  }
  if (Array.isArray(type)) {
    return {
      kind: 'choices',
      values: type as readonly JsonValue[],
      stringCaseFold: type.every(value => typeof value === 'string'),
      multiselect: false,
      numericSources,
    }
  }
  if (type === 'COMBO') {
    const rawOptions = inputDescriptor?.[1]
    if (rawOptions !== undefined && optionalRecord(rawOptions) === undefined) {
      return malformed('COMBO options configuration must be an object when present.')
    }
    const options = optionalRecord(rawOptions) ?? {}
    if (Object.hasOwn(options, 'options') && !Array.isArray(options.options)) {
      return malformed('COMBO.options must be an array.')
    }
    if (Array.isArray(options.options)) {
      const legacyMultiSelect = options.multi_select
      if (Object.hasOwn(options, 'multiselect') && typeof options.multiselect !== 'boolean') {
        return malformed('COMBO.multiselect must be a boolean when present.')
      }
      if (legacyMultiSelect !== undefined
        && typeof legacyMultiSelect !== 'boolean'
        && optionalRecord(legacyMultiSelect) === undefined) {
        return malformed('COMBO.multi_select must be a boolean or object when present.')
      }
      return {
        kind: 'choices',
        values: options.options as readonly JsonValue[],
        stringCaseFold: options.options.every(value => typeof value === 'string'),
        multiselect: options.multiselect === true
          || legacyMultiSelect === true
          || (legacyMultiSelect !== null && typeof legacyMultiSelect === 'object' && !Array.isArray(legacyMultiSelect)),
        numericSources,
      }
    }
  }
  if (type === 'COMFY_DYNAMICCOMBO_V3') {
    const rawOptions = inputDescriptor?.[1]
    if (rawOptions !== undefined && optionalRecord(rawOptions) === undefined) {
      return malformed('COMFY_DYNAMICCOMBO_V3 options configuration must be an object when present.')
    }
    const options = rawOptions !== null && typeof rawOptions === 'object' && !Array.isArray(rawOptions)
      ? (rawOptions as UnknownRecord).options
      : undefined
    if (Array.isArray(options) && options.every(value => (
      value !== null
      && typeof value === 'object'
      && !Array.isArray(value)
      && typeof (value as UnknownRecord).key === 'string'
    ))) {
      return {
        kind: 'choices',
        values: options.map(value => (value as UnknownRecord).key as string),
        stringCaseFold: false,
        multiselect: false,
        numericSources,
      }
    }
  }
  return { kind: 'unknown', typeLabel: typeof type === 'string' ? type : JSON.stringify(type) }
}

function runtimeParameterContract(
  definition: UnknownRecord,
  name: string,
  numericSources: NumericSourceIndex,
): RuntimeParameterContract {
  return runtimeParameterContractFromDescriptor(descriptor(definition, name), numericSources)
}

function parameterTargets(
  workflow: UiWorkflow,
  nodeDefinitions: UnknownRecord,
  numericSources: NumericSourceIndex,
): readonly ParameterTarget[] {
  const targets: ParameterTarget[] = []
  for (const rawNode of workflow.nodes) {
    const node = rawNode as UnknownRecord
    const nodeId = String(node.id)
    const nodeType = String(node.type)
    if (node.mode === 2 || node.mode === 4 || EDITOR_ONLY_NODE_TYPES.has(nodeType)) continue
    const definition = nodeDefinition(nodeDefinitions, nodeType)
    const values = array(node.widgets_values) as readonly JsonValue[]
    const connected = new Set(array(node.inputs).flatMap(value => {
      const input = record(value, 'Workflow node input')
      return input.link === null || input.link === undefined || typeof input.name !== 'string' ? [] : [input.name]
    }))
    const mappings = widgetMappings(node, definition)
    const loraSyntax = managerLoraInput(definition, mappings)
    for (const mapping of mappings) {
      if (mapping.index >= values.length || connected.has(mapping.name)) continue
      targets.push({
        key: `${nodeId}:${mapping.name}:${mapping.index}`,
        nodeId,
        nodeType,
        node,
        mapping,
        marker: parameterMarker(node),
        loraSyntax: loraSyntax?.name === mapping.name,
        multilineString: isMultilineStringWidget(definition, mapping.name),
        contract: runtimeParameterContract(definition, mapping.name, numericSources),
      })
    }
  }
  return targets
}

function uniqueNames(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter(value => value.length > 0))]
}

function runtimeParameterKind(parameterId: string): string {
  return STANDARD_RUNTIME_PARAMETER_KINDS.find(kind => parameterId === kind || parameterId.startsWith(`${kind}_`)) ?? parameterId
}

function inputNames(assignment: RuntimeParameterAssignment): readonly string[] {
  return uniqueNames([
    assignment.parameterId,
    assignment.kind,
    ...(RUNTIME_PARAMETER_INPUT_ALIASES[assignment.kind] ?? []),
  ])
}

function normalizedParameterMarker(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, '_').replace(/^_+|_+$/gu, '')
}

function markerMatchesParameter(marker: string, kind: string): boolean {
  const normalizedMarker = normalizedParameterMarker(marker)
  const normalizedKind = normalizedParameterMarker(kind)
  return normalizedKind.length > 0 && `_${normalizedMarker}_`.includes(`_${normalizedKind}_`)
}

function targetFeedsParameter(workflow: UiWorkflow, target: ParameterTarget, kind: string): boolean {
  const downstreamNames = downstreamInputNames(workflow, target.nodeId)
  return uniqueNames([kind, ...(RUNTIME_PARAMETER_INPUT_ALIASES[kind] ?? [])])
    .some(name => downstreamNames.has(name.toLowerCase()))
}

const UPSTREAM_VALUE_PARAMETER_KINDS = new Set([
  'width', 'height', 'seed', 'cfg', 'steps', 'denoise', 'batch_size',
])

function jsonEquals(left: JsonValue, right: JsonValue): boolean {
  return jsonContractEquals(left, right)
}

function jsonContractEquals(
  supplied: unknown,
  candidate: unknown,
  numericSources?: NumericSourceIndex,
  candidateParent?: object,
  candidateKey?: string,
): boolean {
  if (typeof supplied !== typeof candidate) return false
  if (supplied === null || candidate === null) return supplied === candidate
  if (typeof supplied === 'number' && typeof candidate === 'number') {
    if (!Number.isFinite(supplied) || !Number.isFinite(candidate)) return false
    const suppliedExact = parseExactDecimal(JSON.stringify(supplied))
    const candidateSource = candidateParent === undefined || candidateKey === undefined
      ? JSON.stringify(candidate)
      : numericSources?.get(candidateParent)?.get(candidateKey) ?? JSON.stringify(candidate)
    const candidateExact = parseExactDecimal(candidateSource)
    return suppliedExact !== undefined
      && candidateExact !== undefined
      && compareExactDecimal(suppliedExact, candidateExact) === 0
  }
  if (Array.isArray(supplied) || Array.isArray(candidate)) {
    if (!Array.isArray(supplied) || !Array.isArray(candidate) || supplied.length !== candidate.length) return false
    return supplied.every((value, index) => jsonContractEquals(
      value,
      candidate[index],
      numericSources,
      candidate,
      String(index),
    ))
  }
  if (typeof supplied === 'object' && typeof candidate === 'object') {
    const suppliedRecord = supplied as UnknownRecord
    const candidateRecord = candidate as UnknownRecord
    const suppliedKeys = Object.keys(suppliedRecord).sort()
    const candidateKeys = Object.keys(candidateRecord).sort()
    if (suppliedKeys.length !== candidateKeys.length
      || suppliedKeys.some((key, index) => key !== candidateKeys[index])) return false
    return suppliedKeys.every(key => jsonContractEquals(
      suppliedRecord[key],
      candidateRecord[key],
      numericSources,
      candidateRecord,
      key,
    ))
  }
  return supplied === candidate
}

function nodeIdSuffix(parameterId: string): string | null {
  const match = /_([0-9]+)$/u.exec(parameterId)
  return match?.[1] ?? null
}

function downstreamNodeIds(workflow: UiWorkflow, sourceNodeId: string): ReadonlySet<string> {
  const adjacency = new Map<string, Set<string>>()
  for (const rawLink of array(workflow.links)) {
    if (!Array.isArray(rawLink) || rawLink.length < 6) continue
    const source = String(rawLink[1])
    const target = String(rawLink[3])
    const targets = adjacency.get(source) ?? new Set<string>()
    targets.add(target)
    adjacency.set(source, targets)
  }
  const discovered = new Set<string>()
  const pending = [...(adjacency.get(sourceNodeId) ?? [])]
  while (pending.length > 0) {
    const nodeId = pending.shift()!
    if (discovered.has(nodeId)) continue
    discovered.add(nodeId)
    pending.push(...(adjacency.get(nodeId) ?? []))
  }
  return discovered
}

function downstreamInputNames(workflow: UiWorkflow, sourceNodeId: string): ReadonlySet<string> {
  const links = array(workflow.links).filter((value): value is readonly unknown[] => Array.isArray(value) && value.length >= 6)
  const nodes = workflowNodes(workflow)
  const discoveredNodes = new Set<string>()
  const names = new Set<string>()
  const pending = [sourceNodeId]
  while (pending.length > 0) {
    const currentNodeId = pending.shift()!
    if (discoveredNodes.has(currentNodeId)) continue
    discoveredNodes.add(currentNodeId)
    for (const link of links.filter(candidate => String(candidate[1]) === currentNodeId)) {
      const targetNodeId = String(link[3])
      const targetNode = nodes.get(targetNodeId)
      const targetInput = targetNode === undefined ? undefined : array(targetNode.inputs)[Number(link[4])]
      if (targetInput !== null && typeof targetInput === 'object' && !Array.isArray(targetInput)) {
        const inputName = (targetInput as UnknownRecord).name
        if (typeof inputName === 'string') names.add(inputName.toLowerCase())
      }
      pending.push(targetNodeId)
    }
  }
  return names
}

function promptTargetMatchesPolarity(
  workflow: UiWorkflow,
  target: ParameterTarget,
  polarity: 'positive' | 'negative',
): boolean {
  const opposite = polarity === 'positive' ? 'negative' : 'positive'
  if (markerMatchesParameter(target.marker, polarity)) return true
  if (markerMatchesParameter(target.marker, opposite)) return false
  const downstreamNames = downstreamInputNames(workflow, target.nodeId)
  return downstreamNames.has(polarity) && !downstreamNames.has(opposite)
}

function properSubset(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size >= right.size) return false
  for (const value of left) if (!right.has(value)) return false
  return true
}

const PRIMARY_PIPELINE_PARAMETER_KINDS = new Set([
  'seed', 'cfg', 'sampler_name', 'scheduler', 'steps', 'denoise', 'batch_size',
])

function preferPrimaryPipelineTarget(
  workflow: UiWorkflow,
  kind: string,
  candidates: readonly ParameterTarget[],
): readonly ParameterTarget[] {
  if (!PRIMARY_PIPELINE_PARAMETER_KINDS.has(kind) || candidates.length < 2) return candidates
  let preferred = prefer(candidates, target => /^KSampler(?:Advanced)?$/u.test(target.nodeType))
  if (kind === 'batch_size') {
    preferred = prefer(preferred, target => /empty.*latent|latent.*empty/iu.test(`${target.nodeType} ${target.marker}`))
  }
  const downstream = new Map(preferred.map(target => [target.key, downstreamNodeIds(workflow, target.nodeId)]))
  preferred = prefer(preferred, target => !preferred.some(other => (
    other.key !== target.key && downstream.get(other.key)!.has(target.nodeId)
  )))
  preferred = prefer(preferred, target => !preferred.some(other => (
    other.key !== target.key && properSubset(downstream.get(target.key)!, downstream.get(other.key)!)
  )))
  return preferred
}

function feedsOnlyIneffectiveBypassInputs(workflow: UiWorkflow, sourceNodeId: string): boolean {
  const nodes = workflowNodes(workflow)
  const links = workflowLinks(workflow)
  const sourceNode = nodes.get(sourceNodeId)
  if (sourceNode === undefined) return false
  const outgoingLinkIds = array(sourceNode.outputs).flatMap(rawOutput => {
    const output = record(rawOutput, `Workflow node "${sourceNodeId}" output`)
    return array(output.links).map(String)
  })
  if (outgoingLinkIds.length === 0) return false
  return outgoingLinkIds.every(linkId => {
    const link = links.get(linkId)
    if (link === undefined) return false
    const target = nodes.get(String(link[3]))
    if (target === undefined || target.mode !== 4) return false
    return array(target.outputs).every((_output, outputIndex) => {
      const selectedInput = compatibleBypassInput(target, outputIndex)
      return selectedInput === undefined || String(selectedInput.link) !== linkId
    })
  })
}

function prefer(
  candidates: readonly ParameterTarget[],
  predicate: (candidate: ParameterTarget) => boolean,
): readonly ParameterTarget[] {
  const matches = candidates.filter(predicate)
  return matches.length > 0 ? matches : candidates
}

function targetLabel(target: ParameterTarget): string {
  return `${target.nodeId}:${target.nodeType}.${target.mapping.name}`
}

function resolveParameterTarget(
  assignment: RuntimeParameterAssignment,
  workflow: UiWorkflow,
  allTargets: readonly ParameterTarget[],
  reserved: ReadonlySet<string>,
): ParameterTarget {
  const names = inputNames(assignment)
  let candidates: readonly ParameterTarget[] = allTargets.filter(target => names.includes(target.mapping.name))
  if (candidates.length === 0 && (assignment.kind === 'positive_prompt' || assignment.kind === 'negative_prompt')) {
    candidates = allTargets.filter(target => (
      target.multilineString && targetFeedsParameter(workflow, target, assignment.kind)
    ))
  }
  if (candidates.length === 0 && UPSTREAM_VALUE_PARAMETER_KINDS.has(assignment.kind)) {
    candidates = allTargets.filter(target => (
      target.mapping.name === 'value'
      && (
        markerMatchesParameter(target.marker, assignment.kind)
        || targetFeedsParameter(workflow, target, assignment.kind)
      )
    ))
  }
  if (assignment.kind === 'positive_prompt' || assignment.kind === 'negative_prompt') {
    candidates = candidates.filter(target => !target.loraSyntax)
  }
  if (candidates.length === 0) {
    parameterError('GENERATION_PARAMETER_TARGET_NOT_FOUND', assignment.parameterId, 'does not match a Workflow widget on the target ComfyUI instance.')
  }

  const exactParameterName = candidates.filter(target => target.mapping.name === assignment.parameterId)
  if (exactParameterName.length > 0) candidates = exactParameterName
  else {
    const exactKindName = candidates.filter(target => target.mapping.name === assignment.kind)
    if (exactKindName.length > 0) candidates = exactKindName
    else {
      const aliases = RUNTIME_PARAMETER_INPUT_ALIASES[assignment.kind] ?? []
      const firstAlias = aliases.find(alias => candidates.some(target => target.mapping.name === alias))
      if (firstAlias !== undefined) candidates = candidates.filter(target => target.mapping.name === firstAlias)
    }
  }

  candidates = candidates.filter(target => !feedsOnlyIneffectiveBypassInputs(workflow, target.nodeId))
  if (candidates.length === 0) {
    parameterError('GENERATION_PARAMETER_TARGET_NOT_FOUND', assignment.parameterId, 'does not match an executable Workflow widget on the target ComfyUI instance.')
  }
  candidates = prefer(candidates, target => downstreamNodeIds(workflow, target.nodeId).size > 0)

  const suffix = nodeIdSuffix(assignment.parameterId)
  if (suffix !== null) {
    candidates = candidates.filter(target => (
      target.nodeId === suffix || downstreamNodeIds(workflow, target.nodeId).has(suffix)
    ))
    if (candidates.length === 0) {
      parameterError(
        'GENERATION_PARAMETER_TARGET_NOT_FOUND',
        assignment.parameterId,
        `does not resolve to Workflow node "${suffix}" or an explicit upstream value connected to that node.`,
      )
    }
  }
  if (assignment.kind === 'seed' && suffix === null) {
    candidates = prefer(candidates, target => target.nodeType === 'SeedNode')
  }
  if (assignment.kind === 'positive_prompt' || assignment.kind === 'negative_prompt') {
    const polarity = assignment.kind === 'positive_prompt' ? 'positive' : 'negative'
    const semanticCandidates = candidates.filter(target => promptTargetMatchesPolarity(workflow, target, polarity))
    if (semanticCandidates.length > 0) {
      candidates = semanticCandidates
    } else if (polarity === 'negative') {
      candidates = []
    } else {
      candidates = candidates.filter(target => !promptTargetMatchesPolarity(workflow, target, 'negative'))
    }
    if (candidates.length === 0) {
      parameterError(
        'GENERATION_PARAMETER_TARGET_NOT_FOUND',
        assignment.parameterId,
        `does not match a ${polarity} Prompt widget in the executable Workflow.`,
      )
    }
  }
  if (assignment.kind === 'width' || assignment.kind === 'height') {
    candidates = prefer(candidates, target => /empty.*latent|latent.*empty/iu.test(`${target.nodeType} ${target.marker}`))
  }
  if (assignment.kind === 'reference_image') candidates = prefer(candidates, target => target.nodeType === 'LoadImage')
  candidates = preferPrimaryPipelineTarget(workflow, assignment.kind, candidates)
  candidates = prefer(candidates, target => !reserved.has(target.key))

  if (candidates.length !== 1) {
    parameterError(
      'GENERATION_PARAMETER_TARGET_AMBIGUOUS',
      assignment.parameterId,
      `matches multiple Workflow widgets: ${candidates.map(targetLabel).join(', ')}.`,
    )
  }
  return candidates[0]!
}

function setParameterWidget(target: ParameterTarget, value: JsonValue, parameterId: string): void {
  if (!Array.isArray(target.node.widgets_values) || target.mapping.index >= target.node.widgets_values.length) {
    parameterError('GENERATION_PARAMETER_TARGET_NOT_FOUND', parameterId, `does not resolve to ${targetLabel(target)}.`)
  }
  ;(target.node.widgets_values as JsonValue[])[target.mapping.index] = value
  const named = target.node.widgets_values_named
  if (named !== null && typeof named === 'object' && !Array.isArray(named)) {
    ;(named as UnknownRecord)[target.mapping.name] = structuredClone(value)
  }
}

function canonicalChoice(
  contract: Extract<RuntimeParameterContract, { readonly kind: 'choices' }>,
  suppliedValue: JsonValue,
): { readonly matched: boolean; readonly value?: JsonValue } {
  const exactIndex = contract.values.findIndex((candidate, index) => jsonContractEquals(
    suppliedValue,
    candidate,
    contract.numericSources,
    contract.values as object,
    String(index),
  ))
  if (exactIndex >= 0) return { matched: true, value: structuredClone(contract.values[exactIndex]!) }
  if (!contract.stringCaseFold || typeof suppliedValue !== 'string') return { matched: false }
  const matches = contract.values.flatMap((candidate, index) => (
    typeof candidate === 'string' && candidate.toLowerCase() === suppliedValue.toLowerCase() ? [index] : []
  ))
  return matches.length === 1
    ? { matched: true, value: structuredClone(contract.values[matches[0]!]!) }
    : { matched: false }
}

function liveRuntimeParameterValue(
  target: ParameterTarget,
  assignment: RuntimeParameterAssignment,
): JsonValue {
  const suppliedValue = assignment.value
  if (target.contract.kind === 'unsupported') {
    parameterError(
      'GENERATION_PARAMETER_CONTRACT_UNSUPPORTED',
      assignment.parameterId,
      `for ${targetLabel(target)} ${target.contract.reason}`,
    )
  }
  if (target.contract.kind === 'unknown') {
    const currentValue = array(target.node.widgets_values)[target.mapping.index] as JsonValue
    if (jsonEquals(suppliedValue, currentValue)) return structuredClone(currentValue)
    parameterError(
      'GENERATION_PARAMETER_CONTRACT_UNSUPPORTED',
      assignment.parameterId,
      `for ${targetLabel(target)} cannot change ${target.contract.typeLabel} because the target ComfyUI instance does not publish a supported value contract. Keep the existing value or add an explicit contract adapter.`,
    )
  }
  if (target.contract.kind === 'string') {
    if (typeof suppliedValue === 'string') return suppliedValue
    parameterError(
      'GENERATION_PARAMETER_INVALID',
      assignment.parameterId,
      `for ${targetLabel(target)} received ${JSON.stringify(suppliedValue)}; expected a string. Correct the value and call generate_with_comfyui again.`,
    )
  }
  if (target.contract.kind === 'boolean') {
    if (typeof suppliedValue === 'boolean') return suppliedValue
    parameterError(
      'GENERATION_PARAMETER_INVALID',
      assignment.parameterId,
      `for ${targetLabel(target)} received ${JSON.stringify(suppliedValue)}; expected a boolean. Correct the value and call generate_with_comfyui again.`,
    )
  }
  if (target.contract.kind === 'number') {
    if (typeof suppliedValue !== 'number' || !Number.isFinite(suppliedValue) || (target.contract.integer && !Number.isInteger(suppliedValue))) {
      const expected = target.contract.integer ? 'a finite integer' : 'a finite number'
      parameterError(
        'GENERATION_PARAMETER_INVALID',
        assignment.parameterId,
        `for ${targetLabel(target)} received ${JSON.stringify(suppliedValue)}; expected ${expected}. Correct the value and call generate_with_comfyui again.`,
      )
    }
    const source = JSON.stringify(suppliedValue)
    const exact = parseExactDecimal(source)
    if (exact === undefined) {
      parameterError('GENERATION_PARAMETER_INVALID', assignment.parameterId, `for ${targetLabel(target)} received an invalid number.`)
    }
    if (target.contract.minimum !== undefined && compareExactDecimal(exact, target.contract.minimum.value) < 0) {
      parameterError(
        'GENERATION_PARAMETER_INVALID',
        assignment.parameterId,
        `for ${targetLabel(target)} received ${source}; minimum ${target.contract.minimum.source}. Correct the value and call generate_with_comfyui again.`,
      )
    }
    if (target.contract.maximum !== undefined && compareExactDecimal(exact, target.contract.maximum.value) > 0) {
      parameterError(
        'GENERATION_PARAMETER_INVALID',
        assignment.parameterId,
        `for ${targetLabel(target)} received ${source}; maximum ${target.contract.maximum.source}. Correct the value and call generate_with_comfyui again.`,
      )
    }
    return suppliedValue
  }
  const contract = target.contract
  const allowedValues = contract.values
  if (contract.multiselect) {
    if (Array.isArray(suppliedValue)) {
      const matched = suppliedValue.map(value => canonicalChoice(contract, value))
      if (matched.every(result => result.matched)) {
        return matched.map(result => result.value!)
      }
    }
  } else {
    const matched = canonicalChoice(contract, suppliedValue)
    if (matched.matched) return matched.value!
  }
  parameterError(
    'GENERATION_PARAMETER_INVALID',
    assignment.parameterId,
    `for ${targetLabel(target)} received ${JSON.stringify(suppliedValue)}; allowed values ${JSON.stringify(allowedValues)}. Correct the value and call generate_with_comfyui again.`,
  )
}

interface PlannedRuntimeParameter {
  readonly target: ParameterTarget
  readonly assignment: RuntimeParameterAssignment
}

interface DynamicValidationResult {
  readonly contracts: ReadonlyMap<string, RuntimeParameterContract>
  readonly canonicalValues: ReadonlyMap<string, JsonValue>
}

function optionalRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined
}

function validateDynamicRuntimeContracts(
  workflow: UiWorkflow,
  nodeDefinitions: UnknownRecord,
  numericSources: NumericSourceIndex,
  targets: readonly ParameterTarget[],
  planned: readonly PlannedRuntimeParameter[],
): DynamicValidationResult {
  const contracts = new Map<string, RuntimeParameterContract>()
  const canonicalValues = new Map<string, JsonValue>()
  const proposed = new Map(planned.map(value => [value.target.key, value.assignment.value]))
  const parameterIds = new Map(planned.map(value => [value.target.key, value.assignment.parameterId]))

  for (const rawNode of workflow.nodes) {
    const node = rawNode as UnknownRecord
    const nodeId = String(node.id)
    const nodeType = String(node.type)
    if (node.mode === 2 || node.mode === 4 || EDITOR_ONLY_NODE_TYPES.has(nodeType)) continue
    const nodePlans = planned.filter(value => value.target.nodeId === nodeId)
    if (nodePlans.length === 0) continue
    const definition = nodeDefinition(nodeDefinitions, nodeType)
    const nodeTargets = targets.filter(target => target.nodeId === nodeId)
    const targetByName = new Map(nodeTargets.map(target => [target.mapping.name, target]))
    const inputByName = new Map(array(node.inputs).flatMap(value => {
      const input = optionalRecord(value)
      return typeof input?.name === 'string' ? [[input.name, input] as const] : []
    }))
    const serializedNames = new Set([
      ...nodeTargets.map(target => target.mapping.name),
      ...inputByName.keys(),
    ])
    const connectedNames = new Set([...inputByName].flatMap(([name, input]) => (
      input.link === null || input.link === undefined ? [] : [name]
    )))
    const rootDefinitions = inputDefinitions(definition)
    const rootDynamicEntries = [...Object.entries(rootDefinitions.required), ...Object.entries(rootDefinitions.optional)]
      .filter((entry): entry is [string, readonly unknown[]] => Array.isArray(entry[1]) && entry[1][0] === 'COMFY_DYNAMICCOMBO_V3')

    for (const [rootName, rootDescriptor] of rootDynamicEntries) {
      const groupPlans = nodePlans.filter(value => (
        value.target.mapping.name === rootName || value.target.mapping.name.startsWith(`${rootName}.`)
      ))
      if (groupPlans.length === 0) continue
      const triggerParameterId = groupPlans[0]!.assignment.parameterId
      const allowedNames = new Set<string>()

      const unsupported = (path: string, message: string): never => parameterError(
        'GENERATION_PARAMETER_CONTRACT_UNSUPPORTED',
        triggerParameterId,
        `for ${nodeId}:${nodeType}.${path} ${message}`,
      )
      const invalid = (path: string, message: string): never => parameterError(
        'GENERATION_PARAMETER_INVALID',
        triggerParameterId,
        `for ${nodeId}:${nodeType}.${path} ${message}`,
      )

      const visit = (path: string, inputDescriptor: readonly unknown[]): void => {
        allowedNames.add(path)
        const config = optionalRecord(inputDescriptor[1])
        const rawOptions = config?.options
        if (!Array.isArray(rawOptions) || rawOptions.length === 0) {
          unsupported(path, 'does not publish a non-empty dynamic option list.')
        }
        const optionValues = rawOptions as readonly unknown[]
        const options: Array<{ readonly key: string; readonly inputs: UnknownRecord }> = optionValues.map((value, index) => {
          const option = optionalRecord(value)
          const key = option?.key
          const inputs = optionalRecord(option?.inputs)
          if (typeof key !== 'string' || key.length === 0 || inputs === undefined) {
            unsupported(path, `publishes an invalid dynamic option at index ${index}.`)
          }
          return { key: key as string, inputs: inputs as UnknownRecord }
        })
        if (new Set(options.map(option => option.key)).size !== options.length) {
          unsupported(path, 'publishes duplicate dynamic option keys.')
        }
        const parentTarget = targetByName.get(path)
        if (parentTarget === undefined) {
          invalid(path, 'is not serialized as an unconnected widget.')
        }
        const resolvedParentTarget = parentTarget as ParameterTarget
        const parentContract: RuntimeParameterContract = {
          kind: 'choices',
          values: options.map(option => option.key),
          stringCaseFold: false,
          multiselect: false,
          numericSources,
        }
        contracts.set(resolvedParentTarget.key, parentContract)
        const parentValue = proposed.get(resolvedParentTarget.key)
          ?? array(resolvedParentTarget.node.widgets_values)[resolvedParentTarget.mapping.index] as JsonValue
        const parentAssignment: RuntimeParameterAssignment = {
          parameterId: parameterIds.get(resolvedParentTarget.key) ?? path,
          kind: path,
          value: parentValue,
        }
        const selectedValue = liveRuntimeParameterValue({ ...resolvedParentTarget, contract: parentContract }, parentAssignment)
        if (proposed.has(resolvedParentTarget.key)) canonicalValues.set(resolvedParentTarget.key, selectedValue)
        const selected = options.find(option => option.key === selectedValue)
        if (selected === undefined) {
          invalid(path, `received ${JSON.stringify(selectedValue)} without a matching dynamic option.`)
        }
        const selectedOption = selected as { readonly key: string; readonly inputs: UnknownRecord }
        const required = optionalRecord(selectedOption.inputs.required)
        const optional = optionalRecord(selectedOption.inputs.optional)
        if (required === undefined || optional === undefined) {
          unsupported(path, `dynamic option ${JSON.stringify(selectedOption.key)} must publish object-valued inputs.required and inputs.optional maps.`)
        }
        const entries: Array<{ readonly name: string; readonly descriptor: unknown; readonly required: boolean }> = [
          ...Object.entries(required as UnknownRecord).map(([name, childDescriptor]) => ({ name, descriptor: childDescriptor, required: true })),
          ...Object.entries(optional as UnknownRecord).map(([name, childDescriptor]) => ({ name, descriptor: childDescriptor, required: false })),
        ]
        if (entries.some(entry => entry.name.length === 0 || entry.name.includes('.'))) {
          unsupported(path, 'publishes an invalid dynamic child name.')
        }
        if (new Set(entries.map(entry => entry.name)).size !== entries.length) {
          unsupported(path, 'publishes the same dynamic child as both required and optional.')
        }
        for (const entry of entries) {
          const childPath = `${path}.${entry.name}`
          allowedNames.add(childPath)
          if (!Array.isArray(entry.descriptor) || entry.descriptor.length === 0) {
            unsupported(childPath, 'publishes an invalid child input descriptor.')
          }
          const childDescriptor = entry.descriptor as readonly unknown[]
          const childTarget = targetByName.get(childPath)
          const connected = connectedNames.has(childPath)
          if (entry.required && childTarget === undefined && !connected) {
            invalid(childPath, 'is required by the selected dynamic option but is not serialized or connected.')
          }
          if (childDescriptor[0] === 'COMFY_DYNAMICCOMBO_V3') {
            if (connected) unsupported(childPath, 'is connected and its nested dynamic option cannot be resolved locally.')
            if (childTarget !== undefined) visit(childPath, childDescriptor)
            continue
          }
          if (childTarget === undefined || connected) continue
          const childContract = runtimeParameterContractFromDescriptor(childDescriptor, numericSources)
          contracts.set(childTarget.key, childContract)
          const childValue = proposed.get(childTarget.key)
            ?? array(childTarget.node.widgets_values)[childTarget.mapping.index] as JsonValue
          const childAssignment: RuntimeParameterAssignment = {
            parameterId: parameterIds.get(childTarget.key) ?? childPath,
            kind: childPath,
            value: childValue,
          }
          const canonical = liveRuntimeParameterValue({ ...childTarget, contract: childContract }, childAssignment)
          if (proposed.has(childTarget.key)) canonicalValues.set(childTarget.key, canonical)
        }
      }

      visit(rootName, rootDescriptor)
      const staleName = [...serializedNames].find(name => name.startsWith(`${rootName}.`) && !allowedNames.has(name))
      if (staleName !== undefined) invalid(staleName, 'is serialized but does not belong to the selected dynamic option.')
    }
  }

  return { contracts, canonicalValues }
}

function applyRuntimeParameters(
  workflow: UiWorkflow,
  nodeDefinitions: UnknownRecord,
  numericSources: NumericSourceIndex,
  supplied: Readonly<Record<string, JsonValue>>,
): void {
  const assignments: readonly RuntimeParameterAssignment[] = Object.entries(supplied).map(([parameterId, value]) => ({
    parameterId,
    kind: runtimeParameterKind(parameterId),
    value,
  }))
  const targets = parameterTargets(workflow, nodeDefinitions, numericSources)
  const reserved = new Set<string>()
  const plannedByTarget = new Map<string, PlannedRuntimeParameter[]>()

  const ordered = [...assignments].sort((left, right) => {
    const leftHasSuffix = nodeIdSuffix(left.parameterId) === null ? 1 : 0
    const rightHasSuffix = nodeIdSuffix(right.parameterId) === null ? 1 : 0
    return leftHasSuffix - rightHasSuffix
  })
  for (const assignment of ordered) {
    const target = resolveParameterTarget(assignment, workflow, targets, reserved)
    const claimed = plannedByTarget.get(target.key)
    if (claimed === undefined) plannedByTarget.set(target.key, [{ target, assignment }])
    else claimed.push({ target, assignment })
    reserved.add(target.key)
  }
  const planned = [...plannedByTarget.values()].map(group => group[0]!)
  const dynamicValidation = validateDynamicRuntimeContracts(
    workflow,
    nodeDefinitions,
    numericSources,
    targets,
    planned,
  )
  const validated = [...plannedByTarget.values()].map(group => {
    const first = group[0]!
    const contract = dynamicValidation.contracts.get(first.target.key) ?? first.target.contract
    const values = group.map(({ target, assignment }, index) => (
      index === 0 && dynamicValidation.canonicalValues.has(target.key)
        ? dynamicValidation.canonicalValues.get(target.key)!
        : liveRuntimeParameterValue({ ...target, contract }, assignment)
    ))
    const conflictIndex = values.findIndex((value, index) => index > 0 && !jsonEquals(values[0]!, value))
    if (conflictIndex >= 0) {
      const conflicting = group[conflictIndex]!
      parameterError(
        'GENERATION_PARAMETER_TARGET_AMBIGUOUS',
        conflicting.assignment.parameterId,
        `resolves to ${targetLabel(conflicting.target)}, which is already assigned by generation parameter "${first.assignment.parameterId}" with a different normalized value.`,
      )
    }
    return { target: first.target, assignment: first.assignment, value: values[0]! }
  })
  for (const value of validated) setParameterWidget(value.target, value.value, value.assignment.parameterId)
}

function applyLoras(
  workflow: UiWorkflow,
  nodeDefinitions: UnknownRecord,
  selections: WorkflowCompilerInput['loras'],
): void {
  if (selections.length === 0) return
  const standard: StandardLoraSlot[] = []
  const manager: ManagerLoraSlot[] = []
  const power: PowerLoraSlot[] = []
  for (const rawNode of workflow.nodes) {
    const node = rawNode as UnknownRecord
    const activate = false
    if (node.mode === 2 || node.mode === 4 || EDITOR_ONLY_NODE_TYPES.has(String(node.type))) continue
    const definition = nodeDefinition(nodeDefinitions, String(node.type))
    if (node.type === POWER_LORA_LOADER_TYPE) {
      power.push({ node, activate })
      continue
    }
    const mappings = widgetMappings(node, definition)
    if (node.type === LORA_MANAGER_LOADER_TYPE) {
      const text = managerLoraInput(definition, mappings)
      if (text === undefined) {
        loraError('COMFYUI_LORA_INPUT_INVALID', `Workflow LoraManager node "${String(node.id)}" does not contain a serialized LoRA text widget.`)
      }
      manager.push({ node, activate, text, structured: loraManagerStructuredMapping(node) })
      continue
    }
    const byName = new Map(mappings.map(mapping => [mapping.name, mapping]))
    const file = byName.get('lora_name')
    const modelWeight = byName.get('strength_model')
    if (file !== undefined && modelWeight !== undefined && comboChoices(definition, 'lora_name').length > 0) {
      standard.push({ node, activate, file, modelWeight, ...(byName.get('strength_clip') === undefined ? {} : { clipWeight: byName.get('strength_clip')! }) })
      continue
    }
    const text = managerLoraInput(definition, mappings)
    if (text !== undefined) manager.push({ node, activate, text })
  }

  const inputKinds = [standard.length > 0, manager.length > 0, power.length > 0].filter(Boolean).length
  if (inputKinds > 1) {
    loraError('COMFYUI_LORA_INPUT_AMBIGUOUS', 'The Workflow contains multiple executable LoRA input types.')
  }
  if (manager.length > 1) {
    loraError('COMFYUI_LORA_INPUT_AMBIGUOUS', 'The Workflow contains multiple LoraManager LoRA text inputs.')
  }
  if (power.length > 1) {
    loraError('COMFYUI_LORA_INPUT_AMBIGUOUS', 'The Workflow contains multiple Power Lora Loader inputs.')
  }
  if (standard.length === 0 && manager.length === 0 && power.length === 0) {
    loraError('COMFYUI_LORA_INPUT_UNAVAILABLE', 'The Workflow does not contain an executable LoRA input.')
  }
  const choices = instanceLoraChoices(nodeDefinitions)
  const resolved = selections.map(selection => ({
    ...selection,
    instancePath: resolveInstanceLoraPath(selection.fileName, choices),
  }))
  if (manager.length === 1) {
    const syntax = resolved.map(selection => `<lora:${selection.instancePath}:${selection.weight}>`).join(' ')
    if (manager[0]!.activate) manager[0]!.node.mode = 0
    setWidget(manager[0]!.node, manager[0]!.text, syntax)
    if (manager[0]!.structured !== undefined) {
      setWidget(manager[0]!.node, manager[0]!.structured, resolved.map(selection => ({
        name: selection.instancePath,
        strength: selection.weight,
        clipStrength: selection.weight,
        active: true,
      })))
    }
    return
  }
  if (power.length === 1) {
    if (power[0]!.activate) power[0]!.node.mode = 0
    replacePowerLoraWidgets(power[0]!.node, resolved.map(selection => ({
      on: true,
      lora: selection.instancePath,
      strength: selection.weight,
    })))
    return
  }
  const prioritizedStandard = [
    ...standard.filter(slot => slot.activate),
    ...standard.filter(slot => !slot.activate),
  ]
  if (resolved.length > prioritizedStandard.length) {
    loraError(
      'COMFYUI_LORA_CAPACITY_EXCEEDED',
      `The Workflow contains ${prioritizedStandard.length} standard LoRA input${prioritizedStandard.length === 1 ? '' : 's'} but received ${resolved.length} LoRA selections.`,
    )
  }
  resolved.forEach((selection, index) => {
    const slot = prioritizedStandard[index]!
    if (slot.activate) slot.node.mode = 0
    setWidget(slot.node, slot.file, selection.instancePath)
    setWidget(slot.node, slot.modelWeight, selection.weight)
    if (slot.clipWeight !== undefined) setWidget(slot.node, slot.clipWeight, selection.weight)
  })
}

function workflowLinks(workflow: UiWorkflow): Map<string, readonly unknown[]> {
  const links = new Map<string, readonly unknown[]>()
  for (const value of array(workflow.links)) {
    if (!Array.isArray(value) || value.length < 6) fail('Workflow link is invalid.')
    links.set(String(value[0]), value)
  }
  return links
}

function workflowNodes(workflow: UiWorkflow): Map<string, UnknownRecord> {
  return new Map(workflow.nodes.map(node => [String(node.id), node as UnknownRecord]))
}

function compatibleBypassInput(node: UnknownRecord, outputIndex: number): UnknownRecord | undefined {
  const inputs = array(node.inputs).map(value => record(value, 'Workflow bypass input'))
  const output = record(array(node.outputs)[outputIndex], 'Workflow bypass output')
  const compatible = (input: UnknownRecord) => input.type === output.type || input.type === '*' || output.type === '*'
  const indexed = inputs[outputIndex]
  if (indexed !== undefined && compatible(indexed)) return indexed
  const sameName = inputs.filter(input => input.name === output.name && compatible(input))
  if (sameName.length === 1) return sameName[0]
  const sameType = inputs.filter(compatible)
  return sameType.length === 1 ? sameType[0] : undefined
}

function resolveWorkflowLink(
  linkId: string,
  links: ReadonlyMap<string, readonly unknown[]>,
  nodes: ReadonlyMap<string, UnknownRecord>,
  nodeDefinitions: UnknownRecord,
  visiting: ReadonlySet<string> = new Set(),
): JsonValue | undefined {
  if (visiting.has(linkId)) fail(`Workflow bypass link "${linkId}" contains a cycle.`)
  const link = links.get(linkId)
  if (link === undefined) fail(`Workflow references missing link "${linkId}".`)
  const sourceNodeId = String(link[1])
  const outputIndex = Number(link[2])
  const sourceNode = nodes.get(sourceNodeId)
  if (sourceNode === undefined) fail(`Workflow link "${linkId}" references missing source node "${sourceNodeId}".`)
  const sourceType = String(sourceNode.type)
  if (sourceNode.mode !== 4) {
    if (sourceNode.mode === 2 || EDITOR_ONLY_NODE_TYPES.has(sourceType)) {
      fail(`Workflow link "${linkId}" references inactive source node "${sourceNodeId}".`)
    }
    const serializedType = serializedValueSourceType(nodeDefinitions, sourceType)
    if (serializedType !== undefined) return serializedValueSourceValue(sourceNode, serializedType, outputIndex)
    return [sourceNodeId, outputIndex]
  }

  const nextVisiting = new Set(visiting)
  nextVisiting.add(linkId)
  const input = compatibleBypassInput(sourceNode, outputIndex)
  if (input !== undefined) {
    if (input.link !== null && input.link !== undefined) {
      return resolveWorkflowLink(String(input.link), links, nodes, nodeDefinitions, nextVisiting)
    }
    if (typeof input.name === 'string') {
      const value = mapWidgets(
        sourceNode,
        nodeDefinition(nodeDefinitions, sourceType),
      )[input.name]
      if (value !== undefined) return value
    }
  }
  return undefined
}

function isRequiredInput(definition: UnknownRecord, nodeType: string, inputName: string): boolean {
  const inputDefinition = record(definition.input, `ComfyUI node definition "${nodeType}" inputs`)
  if (inputDefinition.required === undefined) return false
  return Object.hasOwn(record(inputDefinition.required, `ComfyUI node definition "${nodeType}" required inputs`), inputName)
}

function hasRequiredConnectionInputs(definition: UnknownRecord, inputs: Readonly<Record<string, JsonValue>>): boolean {
  const definitions = inputDefinitions(definition).required
  return Object.entries(definitions).every(([name, value]) => (
    widgetDescriptor(Array.isArray(value) ? value : undefined) || Object.hasOwn(inputs, name)
  ))
}

function compile(
  workflow: UiWorkflow,
  nodeDefinitions: UnknownRecord,
): Omit<WorkflowCompilerResult, 'actualWorkflow'> {
  if (workflow.version !== 0.4) fail('Workflow version is not supported.')
  const links = workflowLinks(workflow)
  const nodes = workflowNodes(workflow)
  const apiWorkflow: Record<string, JsonValue> = {}

  for (const rawNode of workflow.nodes) {
    const node = rawNode as UnknownRecord
    const nodeId = String(node.id)
    const nodeType = node.type
    if (typeof nodeType !== 'string' || nodeType.length === 0) fail(`Workflow node "${nodeId}" type is invalid.`)
    if (node.mode === 2 || node.mode === 4 || EDITOR_ONLY_NODE_TYPES.has(nodeType)) continue
    const serializedType = serializedValueSourceType(nodeDefinitions, nodeType)
    if (serializedType !== undefined) {
      serializedValueSourceValue(node, serializedType, 0)
      continue
    }
    const definition = nodeDefinition(nodeDefinitions, nodeType)
    const inputs: Record<string, JsonValue> = {
      ...mapWidgets(node, definition),
      ...(nodeType === POWER_LORA_LOADER_TYPE ? powerLoraInputs(node) : {}),
    }
    if (nodeType === LORA_MANAGER_LOADER_TYPE) {
      const mapping = loraManagerStructuredMapping(node)
      inputs.loras = structuredClone((node.widgets_values as readonly JsonValue[])[mapping.index]!)
    }
    for (const rawInput of array(node.inputs)) {
      const input = record(rawInput, `Workflow node "${nodeId}" input`)
      if (input.link === null || input.link === undefined) continue
      if (typeof input.name !== 'string' || input.name.length === 0) fail(`Workflow node "${nodeId}" input name is invalid.`)
      const resolved = resolveWorkflowLink(String(input.link), links, nodes, nodeDefinitions)
      if (resolved === undefined) {
        if (inputs[input.name] !== undefined) continue
        if (isRequiredInput(definition, nodeType, input.name)) {
          fail(`Workflow node "${nodeId}" required input "${input.name}" references a bypass branch that cannot be resolved.`)
        }
        continue
      }
      inputs[input.name] = resolved
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
  const activeOutputNodeIds = discoveredOutputIds.filter(nodeId => {
    const node = apiWorkflow[nodeId] as Readonly<Record<string, JsonValue>>
    const definition = record(nodeDefinitions[String(node.class_type)], 'ComfyUI output node definition')
    return hasRequiredConnectionInputs(definition, node.inputs as Readonly<Record<string, JsonValue>>)
  })
  if (activeOutputNodeIds.length === 0) fail('Workflow does not contain an active output node.')
  for (const nodeId of discoveredOutputIds) {
    if (!activeOutputNodeIds.includes(nodeId)) delete apiWorkflow[nodeId]
  }
  return Object.freeze({
    apiWorkflow: Object.freeze(apiWorkflow),
    activeOutputNodeIds: Object.freeze(activeOutputNodeIds),
  })
}

export class ComfyWorkflowCompiler implements WorkflowCompiler {
  private readonly officialApiWorkflowCompiler: ComfyWorkflowCompilerOptions['officialApiWorkflowCompiler']
  private readonly fetchImplementation: typeof fetch
  private readonly timeoutMs: number
  private readonly createRandomSeed: () => number
  private readonly now: () => number
  private readonly objectInfoCache = new Map<string, {
    readonly snapshot: NodeDefinitionsSnapshot
    readonly expiresAt: number
  }>()
  private readonly objectInfoRequests = new Map<string, Promise<NodeDefinitionsSnapshot>>()

  constructor(options: ComfyWorkflowCompilerOptions) {
    this.officialApiWorkflowCompiler = options.officialApiWorkflowCompiler
    this.fetchImplementation = options.fetchImplementation ?? fetch
    this.timeoutMs = options.timeoutMs ?? 120_000
    this.createRandomSeed = options.createRandomSeed ?? defaultCreateRandomSeed
    this.now = options.now ?? Date.now
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1) throw new TypeError('ComfyUI compiler timeout is invalid.')
  }

  private objectInfoCacheKey(instanceId: string, baseUrl: string): string {
    return JSON.stringify([instanceId, baseUrl])
  }

  private async fetchNodeDefinitions(baseUrl: string, authorization: string | null): Promise<NodeDefinitionsSnapshot> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      let response: Response
      try {
        response = await this.fetchImplementation(`${baseUrl}/object_info`, {
          signal: controller.signal,
          headers: {
            accept: 'application/json',
            ...(authorization === null ? {} : { authorization }),
          },
        })
      } catch {
        throw new GenerationRuntimeError('COMFYUI_CONNECTION_FAILED', 'ComfyUI node definitions request failed.')
      }
      if (!response.ok) throw new GenerationRuntimeError('COMFYUI_HTTP_ERROR', `ComfyUI returned HTTP ${response.status} for /object_info.`)
      let nodeDefinitionsText: string
      try {
        nodeDefinitionsText = await response.text()
      } catch {
        throw new GenerationRuntimeError('COMFYUI_PROTOCOL_ERROR', 'ComfyUI returned invalid node definitions JSON.')
      }
      try {
        return parseNodeDefinitions(nodeDefinitionsText)
      } catch {
        throw new GenerationRuntimeError('COMFYUI_PROTOCOL_ERROR', 'ComfyUI returned invalid node definitions JSON.')
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  private async nodeDefinitions(
    instanceId: string,
    baseUrl: string,
    authorization: string | null,
    signal: AbortSignal,
  ): Promise<NodeDefinitionsSnapshot> {
    const key = this.objectInfoCacheKey(instanceId, baseUrl)
    const cached = this.objectInfoCache.get(key)
    if (cached !== undefined && this.now() < cached.expiresAt) return cached.snapshot
    if (cached !== undefined) this.objectInfoCache.delete(key)
    let request = this.objectInfoRequests.get(key)
    if (request === undefined) {
      request = this.fetchNodeDefinitions(baseUrl, authorization).then(snapshot => {
        this.objectInfoCache.set(key, {
          snapshot,
          expiresAt: this.now() + OBJECT_INFO_CACHE_TTL_MS,
        })
        return snapshot
      }).finally(() => {
        this.objectInfoRequests.delete(key)
      })
      this.objectInfoRequests.set(key, request)
    }
    return waitForPromise(request, signal)
  }

  async compile(input: WorkflowCompilerInput): Promise<WorkflowCompilerResult> {
    if (input.instanceId.trim().length === 0) throw new TypeError('ComfyUI instance id is required for Workflow compilation.')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    const signal = input.signal === undefined ? controller.signal : AbortSignal.any([controller.signal, input.signal])
    const baseUrl = input.connection.url.replace(/\/$/u, '')
    try {
      let snapshot: NodeDefinitionsSnapshot
      try {
        snapshot = await this.nodeDefinitions(
          input.instanceId,
          baseUrl,
          input.connection.authorization,
          signal,
        )
      } catch (error) {
        if (error instanceof GenerationRuntimeError) throw error
        if (input.signal?.aborted === true) {
          throw new GenerationRuntimeError('COMFYUI_REQUEST_CANCELED', 'ComfyUI node definitions request was canceled by the caller.')
        }
        throw new GenerationRuntimeError('COMFYUI_CONNECTION_FAILED', 'ComfyUI node definitions request failed.')
      }
      const { definitions, numericSources } = snapshot
      const actualWorkflow = structuredClone(input.workflow) as UiWorkflow
      const runtimeParameters = input.runtimeParameters ?? {}
      applyRuntimeParameters(actualWorkflow, definitions, numericSources, runtimeParameters)
      materializeRgthreeRandomSeeds(actualWorkflow, definitions, this.createRandomSeed)
      if (input.model !== undefined && input.model !== null) applyModel(actualWorkflow, definitions, input.model)
      applyLoras(actualWorkflow, definitions, input.loras)
      const compiled = compile(actualWorkflow, definitions)
      const finalized = await this.officialApiWorkflowCompiler.compile({
        instanceId: input.instanceId,
        connection: input.connection,
        templateWorkflow: input.workflow,
        actualWorkflow,
        runtimeProjection: compiled.apiWorkflow,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      })
      return Object.freeze({
        apiWorkflow: finalized.apiWorkflow,
        activeOutputNodeIds: compiled.activeOutputNodeIds,
        actualWorkflow,
      })
    } finally {
      clearTimeout(timeout)
    }
  }
}

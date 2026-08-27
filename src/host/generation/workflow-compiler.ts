import { GenerationRuntimeError, type JsonValue } from './generation-runtime.ts'
import type {
  OfficialApiWorkflowCompileInput,
  OfficialApiWorkflowCompileResult,
} from './official-api-workflow.ts'
import type {
  ResolvedRuntimeParameter,
  RuntimeBinding,
  RuntimeParameterDefinition,
  UiWorkflow,
  WorkflowCompiler,
  WorkflowCompilerInput,
  WorkflowCompilerResult,
} from './source-preparer.ts'

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

export interface ComfyWorkflowCompilerOptions {
  readonly officialApiWorkflowCompiler: {
    compile(input: OfficialApiWorkflowCompileInput): Promise<OfficialApiWorkflowCompileResult>
  }
  readonly fetchImplementation?: typeof fetch
  readonly timeoutMs?: number
  readonly createRandomSeed?: () => number
}

type UnknownRecord = Record<string, unknown>

function fail(message: string): never {
  throw new GenerationRuntimeError('WORKFLOW_COMPILE_FAILED', message)
}

function record(value: unknown, label: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${label} is invalid.`)
  return value as UnknownRecord
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
  return ids.flatMap((name, index) => typeof name === 'string' && descriptor(definition, name) !== undefined
    ? [{ name, index }]
    : [])
}

function serializedNamedWidgetMappings(node: UnknownRecord, definition: UnknownRecord): readonly WidgetMapping[] {
  const named = node.widgets_values_named
  if (named === null || typeof named !== 'object' || Array.isArray(named)) return []
  const valueCount = array(node.widgets_values).length
  return Object.keys(named as UnknownRecord).flatMap((name, index) => descriptor(definition, name) !== undefined && index < valueCount
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

interface ParameterTarget {
  readonly key: string
  readonly nodeId: string
  readonly nodeType: string
  readonly node: UnknownRecord
  readonly mapping: WidgetMapping
  readonly currentValue: JsonValue
  readonly marker: string
  readonly loraSyntax: boolean
  readonly disconnectInputName?: string
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

function parameterTargets(workflow: UiWorkflow, nodeDefinitions: UnknownRecord): readonly ParameterTarget[] {
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
        currentValue: values[mapping.index]!,
        marker: parameterMarker(node),
        loraSyntax: loraSyntax?.name === mapping.name,
      })
    }
  }
  return targets
}

const PARAMETER_INPUT_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  positive_prompt: Object.freeze(['text', 'wildcard_text', 'prompt', 'positive']),
  negative_prompt: Object.freeze(['text', 'wildcard_text', 'prompt', 'negative']),
  width: Object.freeze(['width', 'width_override']),
  height: Object.freeze(['height', 'height_override']),
  seed: Object.freeze(['seed', 'noise_seed']),
  resolution_preset: Object.freeze(['resolution', 'resolution_preset']),
  reference_image: Object.freeze(['image', 'reference_image']),
})

function uniqueNames(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter(value => value.length > 0))]
}

function inputNames(definition: RuntimeParameterDefinition): readonly string[] {
  return uniqueNames([
    definition.parameterId,
    definition.kind,
    ...(PARAMETER_INPUT_ALIASES[definition.kind] ?? []),
  ])
}

function jsonEquals(left: JsonValue, right: JsonValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function nodeIdSuffix(parameterId: string): string | null {
  const match = /_([0-9]+)$/u.exec(parameterId)
  return match?.[1] ?? null
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
  assignment: ResolvedRuntimeParameter,
  allTargets: readonly ParameterTarget[],
  reserved: ReadonlySet<string>,
): ParameterTarget {
  const { definition } = assignment
  const names = inputNames(definition)
  let candidates: readonly ParameterTarget[] = allTargets.filter(target => names.includes(target.mapping.name))
  if (candidates.length === 0 && (definition.kind === 'width' || definition.kind === 'height' || definition.kind === 'seed')) {
    candidates = allTargets.filter(target => target.mapping.name === 'value')
    candidates = prefer(candidates, target => target.marker.includes(definition.kind))
  }
  if (candidates.length === 0 && definition.defaultValue !== undefined) {
    candidates = allTargets.filter(target => jsonEquals(target.currentValue, definition.defaultValue!))
  }
  if (definition.kind === 'positive_prompt' || definition.kind === 'negative_prompt') {
    candidates = candidates.filter(target => !target.loraSyntax)
  }
  if (candidates.length === 0) {
    parameterError('GENERATION_PARAMETER_TARGET_NOT_FOUND', definition.parameterId, 'does not match a Workflow widget on the target ComfyUI instance.')
  }

  const exactParameterName = candidates.filter(target => target.mapping.name === definition.parameterId)
  if (exactParameterName.length > 0) candidates = exactParameterName
  else {
    const exactKindName = candidates.filter(target => target.mapping.name === definition.kind)
    if (exactKindName.length > 0) candidates = exactKindName
    else {
      const aliases = PARAMETER_INPUT_ALIASES[definition.kind] ?? []
      const firstAlias = aliases.find(alias => candidates.some(target => target.mapping.name === alias))
      if (firstAlias !== undefined) candidates = candidates.filter(target => target.mapping.name === firstAlias)
    }
  }

  const suffix = nodeIdSuffix(definition.parameterId)
  if (suffix !== null) candidates = prefer(candidates, target => target.nodeId === suffix)
  if (definition.kind === 'seed' && suffix === null) {
    candidates = prefer(candidates, target => target.nodeType === 'SeedNode')
  }
  if (definition.kind === 'positive_prompt') candidates = prefer(candidates, target => target.marker.includes('positive'))
  if (definition.kind === 'negative_prompt') candidates = prefer(candidates, target => target.marker.includes('negative'))
  if (definition.kind === 'width' || definition.kind === 'height') {
    candidates = prefer(candidates, target => /empty.*latent|latent.*empty/iu.test(`${target.nodeType} ${target.marker}`))
  }
  if (definition.kind === 'reference_image') candidates = prefer(candidates, target => target.nodeType === 'LoadImage')
  if (definition.defaultValue !== undefined) {
    candidates = prefer(candidates, target => jsonEquals(target.currentValue, definition.defaultValue!))
  }
  candidates = prefer(candidates, target => !reserved.has(target.key))

  if (candidates.length !== 1) {
    parameterError(
      'GENERATION_PARAMETER_TARGET_AMBIGUOUS',
      definition.parameterId,
      `matches multiple Workflow widgets: ${candidates.map(targetLabel).join(', ')}.`,
    )
  }
  return candidates[0]!
}

function validBindingTargets(
  assignment: ResolvedRuntimeParameter,
  bindingHints: readonly RuntimeBinding[],
  targets: readonly ParameterTarget[],
  workflow: UiWorkflow,
  nodeDefinitions: UnknownRecord,
): readonly ParameterTarget[] {
  const matches: ParameterTarget[] = []
  for (const binding of bindingHints) {
    if (binding.parameterId !== assignment.definition.parameterId || binding.operation !== 'replace_input') continue
    const target = targets.find(candidate => candidate.nodeId === binding.nodeId && candidate.mapping.name === binding.inputName)
    const resolved = target === undefined
      ? connectedBindingTargets(assignment, binding, targets, workflow, nodeDefinitions)
      : [target]
    for (const candidate of resolved ?? []) {
      if (!matches.some(existing => existing.key === candidate.key)) matches.push(candidate)
    }
  }
  return matches
}

function normalizedPortType(value: unknown): string {
  return String(value ?? '').trim().toUpperCase()
}

function compatiblePortType(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizedPortType(left)
  const normalizedRight = normalizedPortType(right)
  return normalizedLeft.length > 0
    && normalizedRight.length > 0
    && (normalizedLeft === normalizedRight || normalizedLeft === '*' || normalizedRight === '*')
}

function connectedUpstreamNodeIds(
  workflow: UiWorkflow,
  initialLinkId: string,
  portType: string,
): ReadonlySet<string> {
  const links = workflowLinks(workflow)
  const nodes = workflowNodes(workflow)
  const reachable = new Set<string>()
  const visited = new Set<string>()
  const visiting = new Set<string>()

  const visit = (linkId: string): void => {
    if (visiting.has(linkId)) fail(`Workflow connected binding link "${linkId}" contains a cycle.`)
    if (visited.has(linkId)) return
    const link = links.get(linkId)
    if (link === undefined) fail(`Workflow references missing link "${linkId}".`)
    if (!compatiblePortType(link[5], portType)) return
    const sourceNodeId = String(link[1])
    const sourceOutputIndex = Number(link[2])
    const sourceNode = nodes.get(sourceNodeId)
    if (sourceNode === undefined) fail(`Workflow link "${linkId}" references missing source node "${sourceNodeId}".`)
    const sourceOutput = record(array(sourceNode.outputs)[sourceOutputIndex], `Workflow node "${sourceNodeId}" output`)
    if (!compatiblePortType(sourceOutput.type, portType)) return

    visiting.add(linkId)
    if (sourceNode.mode === 4) {
      const input = compatibleBypassInput(sourceNode, sourceOutputIndex)
      if (input?.link !== null && input?.link !== undefined && compatiblePortType(input.type, portType)) {
        visit(String(input.link))
      }
      visiting.delete(linkId)
      visited.add(linkId)
      return
    }
    if (sourceNode.mode !== 2 && sourceNode.mode !== 4 && !EDITOR_ONLY_NODE_TYPES.has(String(sourceNode.type))) {
      reachable.add(sourceNodeId)
    }
    for (const rawInput of array(sourceNode.inputs)) {
      const input = record(rawInput, `Workflow node "${sourceNodeId}" input`)
      if (input.link === null || input.link === undefined || !compatiblePortType(input.type, portType)) continue
      visit(String(input.link))
    }
    visiting.delete(linkId)
    visited.add(linkId)
  }

  visit(initialLinkId)
  return reachable
}

function connectedBindingTargets(
  assignment: ResolvedRuntimeParameter,
  binding: Extract<RuntimeBinding, { operation: 'replace_input' }>,
  targets: readonly ParameterTarget[],
  workflow: UiWorkflow,
  nodeDefinitions: UnknownRecord,
): readonly ParameterTarget[] | null {
  const kind = assignment.definition.kind
  const bindingNode = workflowNodes(workflow).get(binding.nodeId)
  if (bindingNode === undefined || bindingNode.mode === 2 || bindingNode.mode === 4) return null
  const bindingInput = array(bindingNode.inputs)
    .map(value => record(value, `Workflow node "${binding.nodeId}" input`))
    .find(input => input.name === binding.inputName)
  if (bindingInput === undefined || bindingInput.link === null || bindingInput.link === undefined) return null
  const portType = normalizedPortType(bindingInput.type)
  if (portType.length === 0) return null

  const reachableNodeIds = connectedUpstreamNodeIds(workflow, String(bindingInput.link), portType)
  const reachableTargets = targets.filter(target => reachableNodeIds.has(target.nodeId))
  if (kind !== 'positive_prompt' && kind !== 'negative_prompt') {
    try {
      return [resolveParameterTarget(assignment, reachableTargets, new Set())]
    } catch (error) {
      if (
        (kind !== 'width' && kind !== 'height')
        || !(error instanceof GenerationRuntimeError)
        || (error.code !== 'GENERATION_PARAMETER_TARGET_NOT_FOUND' && error.code !== 'GENERATION_PARAMETER_TARGET_AMBIGUOUS')
      ) throw error
      const definition = nodeDefinition(nodeDefinitions, String(bindingNode.type))
      const values = array(bindingNode.widgets_values) as readonly JsonValue[]
      const mapping = widgetMappings(bindingNode, definition).find(candidate => (
        candidate.name === binding.inputName && candidate.index === binding.widgetIndex
      ))
      if (mapping === undefined || mapping.index >= values.length) throw error
      return [{
        key: `${binding.nodeId}:${mapping.name}:${mapping.index}`,
        nodeId: binding.nodeId,
        nodeType: String(bindingNode.type),
        node: bindingNode,
        mapping,
        currentValue: values[mapping.index]!,
        marker: parameterMarker(bindingNode),
        loraSyntax: false,
        disconnectInputName: binding.inputName,
      }]
    }
  }
  const names = inputNames(assignment.definition)
  let candidates = reachableTargets.filter(target => (
    names.includes(target.mapping.name)
    && !target.loraSyntax
  ))
  const marker = kind === 'positive_prompt' ? 'positive' : 'negative'
  const semantic = candidates.filter(target => target.marker.includes(marker))
  if (semantic.length > 0) candidates = semantic
  if (candidates.length === 0) {
    parameterError(
      'GENERATION_PARAMETER_TARGET_NOT_FOUND',
      assignment.definition.parameterId,
      `connected binding "${binding.nodeId}:${binding.inputName}" does not resolve to an upstream Prompt widget.`,
    )
  }
  if (candidates.length > 1) {
    parameterError(
      'GENERATION_PARAMETER_TARGET_AMBIGUOUS',
      assignment.definition.parameterId,
      `connected binding "${binding.nodeId}:${binding.inputName}" resolves to multiple upstream Prompt widgets: ${candidates.map(targetLabel).join(', ')}.`,
    )
  }
  return candidates
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

function disconnectParameterTarget(workflow: UiWorkflow, target: ParameterTarget): void {
  if (target.disconnectInputName === undefined) return
  const input = array(target.node.inputs)
    .map(value => record(value, `Workflow node "${target.nodeId}" input`))
    .find(candidate => candidate.name === target.disconnectInputName)
  if (input === undefined || input.link === null || input.link === undefined) return
  const linkId = String(input.link)
  const links = array(workflow.links)
  const link = links.find(candidate => Array.isArray(candidate) && String(candidate[0]) === linkId)
  if (Array.isArray(link)) {
    const sourceNode = workflowNodes(workflow).get(String(link[1]))
    const sourceOutput = sourceNode === undefined ? undefined : array(sourceNode.outputs)[Number(link[2])]
    if (sourceOutput !== null && typeof sourceOutput === 'object' && !Array.isArray(sourceOutput)) {
      const outputLinks = array((sourceOutput as UnknownRecord).links)
      ;(sourceOutput as UnknownRecord).links = outputLinks.filter(candidate => String(candidate) !== linkId) as JsonValue
    }
  }
  input.link = null
  ;(workflow as UnknownRecord).links = links.filter(candidate => !Array.isArray(candidate) || String(candidate[0]) !== linkId) as JsonValue
}

function downstreamNodeIds(workflow: UiWorkflow, sourceNodeId: string): ReadonlySet<string> {
  const downstream = new Map<string, Set<string>>()
  for (const link of workflowLinks(workflow).values()) {
    const source = String(link[1])
    const target = String(link[3])
    const targets = downstream.get(source) ?? new Set<string>()
    targets.add(target)
    downstream.set(source, targets)
  }
  const reachable = new Set<string>()
  const pending = [...(downstream.get(sourceNodeId) ?? [])]
  while (pending.length > 0) {
    const nodeId = pending.shift()!
    if (reachable.has(nodeId)) continue
    reachable.add(nodeId)
    pending.push(...(downstream.get(nodeId) ?? []))
  }
  return reachable
}

function currentTargetValue(target: ParameterTarget): JsonValue | undefined {
  return array(target.node.widgets_values)[target.mapping.index] as JsonValue | undefined
}

function scaledDimensionValue(
  sourceValue: number,
  scale: number,
  target: ParameterTarget,
  nodeDefinitions: UnknownRecord,
): number {
  const input = descriptor(nodeDefinition(nodeDefinitions, target.nodeType), target.mapping.name)
  const rawConfig = input?.[1]
  const config = rawConfig !== null && typeof rawConfig === 'object' && !Array.isArray(rawConfig)
    ? rawConfig as UnknownRecord
    : {}
  const step = typeof config.step === 'number' && Number.isSafeInteger(config.step) && config.step > 0
    ? config.step
    : 1
  const value = Math.round(sourceValue * scale / step) * step
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(`Workflow derived dimension for "${targetLabel(target)}" is invalid.`)
  }
  return value
}

function preserveLatentUpscaleMultipliers(
  workflow: UiWorkflow,
  nodeDefinitions: UnknownRecord,
  targets: readonly ParameterTarget[],
  changedDimensionNodeIds: ReadonlySet<string>,
  claims: ReadonlyMap<string, unknown>,
): void {
  const dimensionsByNode = new Map<string, { width?: ParameterTarget; height?: ParameterTarget }>()
  for (const target of targets) {
    if (target.mapping.name !== 'width' && target.mapping.name !== 'height') continue
    const dimensions = dimensionsByNode.get(target.nodeId) ?? {}
    dimensions[target.mapping.name] = target
    dimensionsByNode.set(target.nodeId, dimensions)
  }

  for (const sourceNodeId of changedDimensionNodeIds) {
    const source = dimensionsByNode.get(sourceNodeId)
    if (source?.width === undefined || source.height === undefined) continue
    if (
      typeof source.width.currentValue !== 'number'
      || typeof source.height.currentValue !== 'number'
      || source.width.currentValue <= 0
      || source.height.currentValue <= 0
    ) continue
    const currentWidth = currentTargetValue(source.width)
    const currentHeight = currentTargetValue(source.height)
    if (typeof currentWidth !== 'number' || typeof currentHeight !== 'number') continue
    const reachable = downstreamNodeIds(workflow, sourceNodeId)

    for (const [nodeId, destination] of dimensionsByNode) {
      if (
        !reachable.has(nodeId)
        || destination.width?.nodeType !== 'LatentUpscale'
        || destination.height?.nodeType !== 'LatentUpscale'
        || claims.has(destination.width.key)
        || claims.has(destination.height.key)
        || typeof destination.width.currentValue !== 'number'
        || typeof destination.height.currentValue !== 'number'
      ) continue
      const widthScale = destination.width.currentValue / source.width.currentValue
      const heightScale = destination.height.currentValue / source.height.currentValue
      if (!Number.isFinite(widthScale) || widthScale <= 0 || Math.abs(widthScale - heightScale) > 1e-9) continue
      setParameterWidget(
        destination.width,
        scaledDimensionValue(currentWidth, widthScale, destination.width, nodeDefinitions),
        'width',
      )
      setParameterWidget(
        destination.height,
        scaledDimensionValue(currentHeight, heightScale, destination.height, nodeDefinitions),
        'height',
      )
    }
  }
}

function applyRuntimeParameters(
  workflow: UiWorkflow,
  nodeDefinitions: UnknownRecord,
  assignments: readonly ResolvedRuntimeParameter[],
  bindingHints: readonly RuntimeBinding[],
): void {
  const targets = parameterTargets(workflow, nodeDefinitions)
  const reserved = new Set<string>()
  const claims = new Map<string, { readonly parameterId: string; readonly value: JsonValue }>()
  const changedDimensionNodeIds = new Set<string>()
  const unresolved: ResolvedRuntimeParameter[] = []
  const assign = (target: ParameterTarget, assignment: ResolvedRuntimeParameter): void => {
    const claimed = claims.get(target.key)
    if (claimed !== undefined) {
      if (!jsonEquals(claimed.value, assignment.value)) {
        parameterError(
          'GENERATION_PARAMETER_TARGET_AMBIGUOUS',
          assignment.definition.parameterId,
          `resolves to ${targetLabel(target)}, which is already assigned by generation parameter "${claimed.parameterId}" with a different value.`,
        )
      }
      return
    }
    disconnectParameterTarget(workflow, target)
    setParameterWidget(target, assignment.value, assignment.definition.parameterId)
    claims.set(target.key, { parameterId: assignment.definition.parameterId, value: assignment.value })
    reserved.add(target.key)
    if (assignment.definition.kind === 'width' || assignment.definition.kind === 'height') {
      changedDimensionNodeIds.add(target.nodeId)
    }
  }

  for (const assignment of assignments) {
    if (assignment.definition.kind.startsWith('lora_')) continue
    const hinted = validBindingTargets(assignment, bindingHints, targets, workflow, nodeDefinitions)
    if (hinted.length === 0) {
      unresolved.push(assignment)
      continue
    }
    for (const target of hinted) {
      assign(target, assignment)
    }
  }

  const ordered = [...unresolved].sort((left, right) => {
    const leftHasSuffix = nodeIdSuffix(left.definition.parameterId) === null ? 1 : 0
    const rightHasSuffix = nodeIdSuffix(right.definition.parameterId) === null ? 1 : 0
    return leftHasSuffix - rightHasSuffix
  })
  for (const assignment of ordered) {
    const target = resolveParameterTarget(assignment, targets, reserved)
    assign(target, assignment)
  }
  preserveLatentUpscaleMultipliers(workflow, nodeDefinitions, targets, changedDimensionNodeIds, claims)
}

function legacyLoraSelections(
  assignments: readonly ResolvedRuntimeParameter[],
): WorkflowCompilerInput['loras'] {
  const models = assignments.filter(assignment => assignment.definition.kind === 'lora_model')
  const weights = assignments.filter(assignment => assignment.definition.kind === 'lora_model_weight')
  const triggers = assignments.filter(assignment => assignment.definition.kind === 'lora_trigger_word')
  return models.flatMap((model, index) => {
    if (typeof model.value !== 'string') return []
    const weight = weights[index]?.value
    const trigger = triggers[index]?.value
    return [{
      id: model.definition.parameterId,
      fileName: model.value,
      weight: typeof weight === 'number' ? weight : 1,
      triggerWords: typeof trigger === 'string' && trigger.trim().length > 0 ? [trigger] : [],
    }]
  })
}

function applyLoras(
  workflow: UiWorkflow,
  nodeDefinitions: UnknownRecord,
  selections: WorkflowCompilerInput['loras'],
  bindingHints: readonly RuntimeBinding[],
): void {
  const boundLoraNodeIds = new Set(bindingHints.flatMap(binding => (
    binding.operation === 'replace_input' && binding.parameterId.startsWith('lora_model')
      ? [binding.nodeId]
      : []
  )))
  const standard: StandardLoraSlot[] = []
  const manager: ManagerLoraSlot[] = []
  const power: PowerLoraSlot[] = []
  for (const rawNode of workflow.nodes) {
    const node = rawNode as UnknownRecord
    const activate = node.mode === 4 && boundLoraNodeIds.has(String(node.id))
    if (node.mode === 2 || (node.mode === 4 && !activate) || EDITOR_ONLY_NODE_TYPES.has(String(node.type))) continue
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

  if (selections.length === 0) {
    for (const exactManager of manager.filter(slot => slot.structured !== undefined)) {
      if (exactManager.activate) exactManager.node.mode = 0
      setWidget(exactManager.node, exactManager.text, '')
      setWidget(exactManager.node, exactManager.structured!, [])
    }
    return
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
  expectedOutputNodeIds: readonly string[] | null,
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
  const activeOutputNodeIds = expectedOutputNodeIds === null
    ? discoveredOutputIds.filter(nodeId => {
        const node = apiWorkflow[nodeId] as Readonly<Record<string, JsonValue>>
        const definition = record(nodeDefinitions[String(node.class_type)], 'ComfyUI output node definition')
        return hasRequiredConnectionInputs(definition, node.inputs as Readonly<Record<string, JsonValue>>)
      })
    : [...expectedOutputNodeIds]
  if (activeOutputNodeIds.length === 0) fail('Workflow does not contain an active output node.')
  for (const nodeId of activeOutputNodeIds) {
    if (!discoveredOutputIds.includes(nodeId)) fail(`Declared output node "${nodeId}" is not an active ComfyUI output node.`)
  }
  if (expectedOutputNodeIds === null) {
    for (const nodeId of discoveredOutputIds) {
      if (!activeOutputNodeIds.includes(nodeId)) delete apiWorkflow[nodeId]
    }
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

  constructor(options: ComfyWorkflowCompilerOptions) {
    this.officialApiWorkflowCompiler = options.officialApiWorkflowCompiler
    this.fetchImplementation = options.fetchImplementation ?? fetch
    this.timeoutMs = options.timeoutMs ?? 120_000
    this.createRandomSeed = options.createRandomSeed ?? defaultCreateRandomSeed
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1) throw new TypeError('ComfyUI compiler timeout is invalid.')
  }

  async compile(input: WorkflowCompilerInput): Promise<WorkflowCompilerResult> {
    if (input.instanceId.trim().length === 0) throw new TypeError('ComfyUI instance id is required for Workflow compilation.')
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
        if (input.signal?.aborted === true) {
          throw new GenerationRuntimeError('COMFYUI_REQUEST_CANCELED', 'ComfyUI node definitions request was canceled by the caller.')
        }
        throw new GenerationRuntimeError('COMFYUI_CONNECTION_FAILED', 'ComfyUI node definitions request failed.')
      }
      if (!response.ok) throw new GenerationRuntimeError('COMFYUI_HTTP_ERROR', `ComfyUI returned HTTP ${response.status} for /object_info.`)
      let nodeDefinitions: unknown
      try {
        nodeDefinitions = await response.json()
      } catch {
        throw new GenerationRuntimeError('COMFYUI_PROTOCOL_ERROR', 'ComfyUI returned invalid node definitions JSON.')
      }
      const definitions = record(nodeDefinitions, 'ComfyUI node definitions')
      const actualWorkflow = structuredClone(input.workflow) as UiWorkflow
      const runtimeParameters = input.runtimeParameters ?? []
      applyRuntimeParameters(actualWorkflow, definitions, runtimeParameters, input.bindingHints ?? [])
      materializeRgthreeRandomSeeds(actualWorkflow, definitions, this.createRandomSeed)
      if (input.model !== undefined && input.model !== null) applyModel(actualWorkflow, definitions, input.model)
      const loras = input.loras.length > 0 ? input.loras : legacyLoraSelections(runtimeParameters)
      applyLoras(actualWorkflow, definitions, loras, input.bindingHints ?? [])
      const compiled = compile(actualWorkflow, definitions, input.expectedOutputNodeIds)
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

import { GenerationRuntimeError, type JsonValue } from './generation-runtime.ts'
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

function widgetMappings(node: UnknownRecord, definition: UnknownRecord): readonly WidgetMapping[] {
  const values = array(node.widgets_values) as readonly JsonValue[]
  const explicit = explicitWidgetMappings(node, definition)
  if (explicit.length > 0) return explicit.filter(mapping => mapping.index < values.length)
  const named = namedWidgetInputs(node)
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
    mapped[mapping.name] = structuredClone(instanceComboValue(
      values[mapping.index]!,
      descriptor(definition, mapping.name),
    ))
  }
  return mapped
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
  readonly file: WidgetMapping
  readonly modelWeight: WidgetMapping
  readonly clipWeight?: WidgetMapping
}

interface ManagerLoraSlot {
  readonly node: UnknownRecord
  readonly text: WidgetMapping
}

function setWidget(node: UnknownRecord, mapping: WidgetMapping, value: JsonValue): void {
  if (!Array.isArray(node.widgets_values) || mapping.index >= node.widgets_values.length) {
    loraError('COMFYUI_LORA_INPUT_INVALID', `Workflow LoRA input "${mapping.name}" does not resolve to a widget value.`)
  }
  ;(node.widgets_values as JsonValue[])[mapping.index] = value
}

interface ParameterTarget {
  readonly key: string
  readonly nodeId: string
  readonly nodeType: string
  readonly node: UnknownRecord
  readonly mapping: WidgetMapping
  readonly currentValue: JsonValue
  readonly marker: string
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
    const definition = record(nodeDefinitions[nodeType], `ComfyUI node definition "${nodeType}"`)
    const values = array(node.widgets_values) as readonly JsonValue[]
    for (const mapping of widgetMappings(node, definition)) {
      if (mapping.index >= values.length) continue
      targets.push({
        key: `${nodeId}:${mapping.name}:${mapping.index}`,
        nodeId,
        nodeType,
        node,
        mapping,
        currentValue: values[mapping.index]!,
        marker: parameterMarker(node),
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
  if (candidates.length === 0 && definition.defaultValue !== undefined) {
    candidates = allTargets.filter(target => jsonEquals(target.currentValue, definition.defaultValue!))
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
): readonly ParameterTarget[] {
  const matches: ParameterTarget[] = []
  for (const binding of bindingHints) {
    if (binding.parameterId !== assignment.definition.parameterId || binding.operation !== 'replace_input') continue
    const target = targets.find(candidate => candidate.nodeId === binding.nodeId && candidate.mapping.name === binding.inputName)
    if (target !== undefined && !matches.some(candidate => candidate.key === target.key)) matches.push(target)
  }
  return matches
}

function setParameterWidget(target: ParameterTarget, value: JsonValue, parameterId: string): void {
  if (!Array.isArray(target.node.widgets_values) || target.mapping.index >= target.node.widgets_values.length) {
    parameterError('GENERATION_PARAMETER_TARGET_NOT_FOUND', parameterId, `does not resolve to ${targetLabel(target)}.`)
  }
  ;(target.node.widgets_values as JsonValue[])[target.mapping.index] = value
}

function applyRuntimeParameters(
  workflow: UiWorkflow,
  nodeDefinitions: UnknownRecord,
  assignments: readonly ResolvedRuntimeParameter[],
  bindingHints: readonly RuntimeBinding[],
): void {
  const targets = parameterTargets(workflow, nodeDefinitions)
  const reserved = new Set<string>()
  const unresolved: ResolvedRuntimeParameter[] = []

  for (const assignment of assignments) {
    if (assignment.definition.kind.startsWith('lora_')) continue
    const hinted = validBindingTargets(assignment, bindingHints, targets)
    if (hinted.length === 0) {
      unresolved.push(assignment)
      continue
    }
    for (const target of hinted) {
      setParameterWidget(target, assignment.value, assignment.definition.parameterId)
      reserved.add(target.key)
    }
  }

  const ordered = [...unresolved].sort((left, right) => {
    const leftHasSuffix = nodeIdSuffix(left.definition.parameterId) === null ? 1 : 0
    const rightHasSuffix = nodeIdSuffix(right.definition.parameterId) === null ? 1 : 0
    return leftHasSuffix - rightHasSuffix
  })
  for (const assignment of ordered) {
    const target = resolveParameterTarget(assignment, targets, reserved)
    setParameterWidget(target, assignment.value, assignment.definition.parameterId)
    reserved.add(target.key)
  }
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
): void {
  if (selections.length === 0) return
  const standard: StandardLoraSlot[] = []
  const manager: ManagerLoraSlot[] = []
  for (const rawNode of workflow.nodes) {
    const node = rawNode as UnknownRecord
    if (node.mode === 2 || node.mode === 4 || EDITOR_ONLY_NODE_TYPES.has(String(node.type))) continue
    const definition = record(nodeDefinitions[String(node.type)], `ComfyUI node definition "${String(node.type)}"`)
    const mappings = widgetMappings(node, definition)
    const byName = new Map(mappings.map(mapping => [mapping.name, mapping]))
    const file = byName.get('lora_name')
    const modelWeight = byName.get('strength_model')
    if (file !== undefined && modelWeight !== undefined && comboChoices(definition, 'lora_name').length > 0) {
      standard.push({ node, file, modelWeight, ...(byName.get('strength_clip') === undefined ? {} : { clipWeight: byName.get('strength_clip')! }) })
      continue
    }
    const text = managerLoraInput(definition, mappings)
    if (text !== undefined) manager.push({ node, text })
  }

  if (standard.length > 0 && manager.length > 0) {
    loraError('COMFYUI_LORA_INPUT_AMBIGUOUS', 'The Workflow contains both standard and LoraManager LoRA inputs.')
  }
  if (manager.length > 1) {
    loraError('COMFYUI_LORA_INPUT_AMBIGUOUS', 'The Workflow contains multiple LoraManager LoRA text inputs.')
  }
  if (standard.length === 0 && manager.length === 0) {
    loraError('COMFYUI_LORA_INPUT_UNAVAILABLE', 'The Workflow does not contain an executable LoRA input.')
  }
  const choices = instanceLoraChoices(nodeDefinitions)
  const resolved = selections.map(selection => ({
    ...selection,
    instancePath: resolveInstanceLoraPath(selection.fileName, choices),
  }))
  if (manager.length === 1) {
    const syntax = resolved.map(selection => `<lora:${selection.instancePath}:${selection.weight}>`).join(' ')
    setWidget(manager[0]!.node, manager[0]!.text, syntax)
    return
  }
  if (resolved.length > standard.length) {
    loraError(
      'COMFYUI_LORA_CAPACITY_EXCEEDED',
      `The Workflow contains ${standard.length} standard LoRA input${standard.length === 1 ? '' : 's'} but received ${resolved.length} LoRA selections.`,
    )
  }
  resolved.forEach((selection, index) => {
    const slot = standard[index]!
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

function compile(
  workflow: UiWorkflow,
  nodeDefinitions: UnknownRecord,
  expectedOutputNodeIds: readonly string[] | null,
): Omit<WorkflowCompilerResult, 'actualWorkflow'> {
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
      const definitions = record(nodeDefinitions, 'ComfyUI node definitions')
      const actualWorkflow = structuredClone(input.workflow) as UiWorkflow
      const runtimeParameters = input.runtimeParameters ?? []
      applyRuntimeParameters(actualWorkflow, definitions, runtimeParameters, input.bindingHints ?? [])
      const loras = input.loras.length > 0 ? input.loras : legacyLoraSelections(runtimeParameters)
      applyLoras(actualWorkflow, definitions, loras)
      const compiled = compile(actualWorkflow, definitions, input.expectedOutputNodeIds)
      return Object.freeze({ ...compiled, actualWorkflow })
    } finally {
      clearTimeout(timeout)
    }
  }
}

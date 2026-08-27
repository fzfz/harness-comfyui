import {
  GenerationRuntimeError,
  type ComfyConnection,
  type GenerationPreparationAdapter,
  type GenerationRequest,
  type JsonValue,
  type PreparedGeneration,
} from './generation-runtime.ts'

export type RuntimeParameterValueType =
  | 'string'
  | 'integer'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'image_reference'
  | 'asset_reference'

export interface RuntimeParameterDefinition {
  readonly parameterId: string
  readonly kind: string
  readonly valueType: RuntimeParameterValueType
  readonly defaultValue?: JsonValue
  readonly required: boolean
  readonly minimum?: number
  readonly maximum?: number
}

export interface ReplaceInputBinding {
  readonly parameterId: string
  readonly operation: 'replace_input'
  readonly nodeId: string
  readonly inputName: string
  readonly widgetIndex: number
}

export interface ComposeTextBinding {
  readonly parameterId: string
  readonly operation: 'compose_text'
  readonly targetParameterId: string
}

export type RuntimeBinding = ReplaceInputBinding | ComposeTextBinding

export type WorkflowNode = Readonly<Record<string, JsonValue>>

export type UiWorkflow = Readonly<Record<string, JsonValue>> & {
  readonly nodes: readonly WorkflowNode[]
}

export interface ComfyInstanceSource {
  readonly id: string
  readonly title: string
  readonly url: string
  readonly credentialType: 'none' | 'basic' | 'bearer'
  readonly authorization: string | null
}

export interface ComfyTemplateBundle {
  readonly id: string
  readonly title: string
  readonly revisionNumber: number
  readonly workflowSha256: string
  readonly configRevision: number
  readonly dimensionStrategy: string
  readonly workflow: UiWorkflow
  readonly parameters: readonly RuntimeParameterDefinition[]
  readonly bindings: readonly RuntimeBinding[]
  readonly expectedOutputNodeIds: readonly string[] | null
}

export interface GenerationSource {
  readInstance(instanceId: string, signal?: AbortSignal): Promise<ComfyInstanceSource>
  readTemplate(templateId: string, signal?: AbortSignal): Promise<ComfyTemplateBundle>
}

export interface WorkflowCompilerInput {
  readonly instanceId: string
  readonly workflow: UiWorkflow
  readonly connection: ComfyConnection
  readonly expectedOutputNodeIds: readonly string[] | null
  readonly runtimeParameters?: readonly ResolvedRuntimeParameter[]
  readonly bindingHints?: readonly RuntimeBinding[]
  readonly model?: GenerationRequest['model']
  readonly loras: GenerationRequest['loras']
  readonly signal?: AbortSignal
}

export interface ResolvedRuntimeParameter {
  readonly definition: RuntimeParameterDefinition
  readonly value: JsonValue
}

export interface WorkflowCompilerResult {
  readonly actualWorkflow: UiWorkflow
  readonly apiWorkflow: Readonly<Record<string, JsonValue>>
  readonly activeOutputNodeIds: readonly string[]
}

export interface WorkflowCompiler {
  compile(input: WorkflowCompilerInput): Promise<WorkflowCompilerResult>
}

export interface SourceGenerationPreparerOptions {
  readonly defaultInstanceId: string
  readonly source: GenerationSource
  readonly compiler: WorkflowCompiler
}

export function comfyInstanceOrigin(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new GenerationRuntimeError('SOURCE_PROTOCOL_ERROR', 'ComfyUI instance URL is invalid.')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new GenerationRuntimeError('SOURCE_PROTOCOL_ERROR', 'ComfyUI instance URL protocol is invalid.')
  }
  return parsed.origin
}

function fail(message: string): never {
  throw new GenerationRuntimeError('GENERATION_PARAMETER_INVALID', message)
}

function valueMatches(definition: RuntimeParameterDefinition, value: JsonValue): boolean {
  switch (definition.valueType) {
    case 'string':
    case 'enum':
    case 'image_reference':
    case 'asset_reference':
      return typeof value === 'string'
    case 'integer':
      return typeof value === 'number' && Number.isSafeInteger(value)
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'boolean':
      return typeof value === 'boolean'
  }
}

function resolveParameterValues(
  definitions: readonly RuntimeParameterDefinition[],
  supplied: Readonly<Record<string, JsonValue>>,
): Readonly<Record<string, JsonValue>> {
  const definitionsById = new Map(definitions.map(definition => [definition.parameterId, definition]))
  for (const parameterId of Object.keys(supplied)) {
    if (!definitionsById.has(parameterId)) fail(`Generation parameter "${parameterId}" is not declared by the template.`)
  }
  const values: Record<string, JsonValue> = {}
  for (const definition of definitions) {
    if (!Object.hasOwn(supplied, definition.parameterId)) {
      if (definition.required) fail(`Generation parameter "${definition.parameterId}" is required.`)
      continue
    }
    const value = supplied[definition.parameterId]!
    if (!valueMatches(definition, value)) fail(`Generation parameter "${definition.parameterId}" has an invalid value type.`)
    if (typeof value === 'number') {
      if (definition.minimum !== undefined && value < definition.minimum) fail(`Generation parameter "${definition.parameterId}" is below its minimum.`)
      if (definition.maximum !== undefined && value > definition.maximum) fail(`Generation parameter "${definition.parameterId}" is above its maximum.`)
    }
    values[definition.parameterId] = value
  }
  return Object.freeze(values)
}

function safeSourceSnapshot(
  bundle: ComfyTemplateBundle,
  instance: ComfyInstanceSource,
  origin: string,
): Readonly<Record<string, JsonValue>> {
  return Object.freeze({
    instance: Object.freeze({ id: instance.id, title: instance.title, origin }),
    template: Object.freeze({
      id: bundle.id,
      title: bundle.title,
      revision_number: bundle.revisionNumber,
      workflow_sha256: bundle.workflowSha256,
      config_revision: bundle.configRevision,
      dimension_strategy: bundle.dimensionStrategy,
      expected_output_node_ids: bundle.expectedOutputNodeIds,
    }),
  })
}

export class SourceGenerationPreparer implements GenerationPreparationAdapter {
  private readonly options: SourceGenerationPreparerOptions

  constructor(options: SourceGenerationPreparerOptions) {
    this.options = options
    if (options.defaultInstanceId.trim().length === 0) throw new TypeError('Default ComfyUI instance id is required.')
  }

  async prepare(request: GenerationRequest, signal?: AbortSignal): Promise<PreparedGeneration> {
    const bundle = await this.options.source.readTemplate(request.templateId, signal)
    const instanceId = request.instanceId ?? this.options.defaultInstanceId
    const values = resolveParameterValues(bundle.parameters, request.parameters)
    const runtimeParameters = Object.freeze(bundle.parameters.flatMap(definition => {
      const value = values[definition.parameterId]
      return value === undefined ? [] : [Object.freeze({ definition, value })]
    }))
    const instance = await this.options.source.readInstance(instanceId, signal)
    const connection = Object.freeze({
      url: instance.url,
      origin: comfyInstanceOrigin(instance.url),
      authorization: instance.authorization,
    })
    const compiled = await this.options.compiler.compile({
      instanceId: instance.id,
      workflow: bundle.workflow,
      connection,
      expectedOutputNodeIds: bundle.expectedOutputNodeIds,
      runtimeParameters,
      bindingHints: bundle.bindings,
      model: request.model,
      loras: request.loras,
      signal,
    })
    return Object.freeze({
      instanceId: instance.id,
      instanceTitle: instance.title,
      templateTitle: bundle.title,
      sourceSnapshot: safeSourceSnapshot(bundle, instance, connection.origin),
      actualWorkflow: compiled.actualWorkflow,
      apiWorkflow: compiled.apiWorkflow,
      expectedOutputNodeIds: compiled.activeOutputNodeIds,
      connection,
    })
  }
}

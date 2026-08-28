import {
  GenerationRuntimeError,
  type ComfyConnection,
  type GenerationPreparationAdapter,
  type GenerationRequest,
  type JsonValue,
  type PreparedGeneration,
} from './generation-runtime.ts'

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
  readonly runtimeParameters?: Readonly<Record<string, JsonValue>>
  readonly model?: GenerationRequest['model']
  readonly loras: GenerationRequest['loras']
  readonly signal?: AbortSignal
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
      runtimeParameters: request.parameters,
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

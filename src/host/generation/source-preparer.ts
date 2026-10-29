import {
  GenerationRuntimeError,
  type ComfyConnection,
  type GenerationPreparationAdapter,
  type GenerationRequest,
  type JsonValue,
  type PreparedGeneration,
} from './generation-runtime.ts'
import type { WorkflowRuntimeParameterInspection } from '../../generation/inspection-contract.ts'
export type {
  WorkflowRuntimeParameterInspectionParameter, WorkflowWidthHeightSizeCandidate,
  WorkflowAspectRatioMegapixelsSizeCandidate, WorkflowResolutionPresetMapping,
  WorkflowResolutionPresetSizeCandidate, WorkflowRuntimeSizeCandidate, WorkflowRuntimeParameterInspection,
} from '../../generation/inspection-contract.ts'

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
  readonly workflow: UiWorkflow
}

export interface GenerationSource {
  readInstance(instanceId: string, signal?: AbortSignal): Promise<ComfyInstanceSource>
  readTemplate(templateId: string, signal?: AbortSignal): Promise<ComfyTemplateBundle>
}

export interface WorkflowCompilerInput {
  readonly instanceId: string
  readonly workflow: UiWorkflow
  readonly connection: ComfyConnection
  readonly runtimeParameters?: Readonly<Record<string, JsonValue>>
  readonly model?: GenerationRequest['model']
  readonly loras: GenerationRequest['loras']
  readonly signal?: AbortSignal
}

export interface WorkflowRuntimeParameterInspectionInput {
  readonly instanceId: string
  readonly workflow: UiWorkflow
  readonly connection: ComfyConnection
  readonly signal?: AbortSignal
}

export interface GenerationTemplateRuntimeParameterInspectionInput {
  readonly templateId: string
  readonly instanceId: string
}

export interface WorkflowCompilerResult {
  readonly actualWorkflow: UiWorkflow
  readonly apiWorkflow: Readonly<Record<string, JsonValue>>
  readonly activeOutputNodeIds: readonly string[]
}

export interface WorkflowCompiler {
  inspectRuntimeParameters(input: WorkflowRuntimeParameterInspectionInput): Promise<WorkflowRuntimeParameterInspection>
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
    template: Object.freeze({ id: bundle.id, title: bundle.title }),
  })
}

export class SourceGenerationPreparer implements GenerationPreparationAdapter {
  private readonly options: SourceGenerationPreparerOptions

  constructor(options: SourceGenerationPreparerOptions) {
    this.options = options
    if (options.defaultInstanceId.trim().length === 0) throw new TypeError('Default ComfyUI instance id is required.')
  }

  async inspectRuntimeParameters(
    input: GenerationTemplateRuntimeParameterInspectionInput,
    signal?: AbortSignal,
  ): Promise<WorkflowRuntimeParameterInspection> {
    if (input.templateId.trim().length === 0) throw new TypeError('ComfyUI template id is required for parameter inspection.')
    if (input.instanceId.trim().length === 0) throw new TypeError('ComfyUI instance id is required for parameter inspection.')
    const bundle = await this.options.source.readTemplate(input.templateId, signal)
    const instance = await this.options.source.readInstance(input.instanceId, signal)
    return this.options.compiler.inspectRuntimeParameters({
      instanceId: instance.id,
      workflow: bundle.workflow,
      connection: {
        url: instance.url,
        origin: comfyInstanceOrigin(instance.url),
        authorization: instance.authorization,
      },
      signal,
    })
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

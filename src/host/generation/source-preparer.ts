import type { JsonValue } from '#contracts'
import {
  GenerationRuntimeError,
  type ComfyConnection,
  type GenerationPreparationAdapter,
  type GenerationRequest,
  type PreparedGeneration,
} from './generation-runtime.ts'
import type { GenerationImageUpload, GenerationPreparationContext } from './generation-runtime.ts'
import type { ImageRef } from '../../workbench/contract.ts'
import { GenerationInputValidationError } from './workflow-compiler.ts'
import { workflowImageInputProblem, type StandardRuntimeParameterKind, type WorkflowRuntimeParameterInspection } from '../../generation/inspection-contract.ts'
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
  readonly refreshNodeDefinitions?: boolean
  readonly instanceId: string
  readonly workflow: UiWorkflow
  readonly connection: ComfyConnection
  readonly runtimeParameters?: Readonly<Record<string, JsonValue>>
  readonly boundImageParameterIds?: readonly string[]
  readonly model?: GenerationRequest['model']
  readonly loras: GenerationRequest['loras']
  readonly signal?: AbortSignal
}

export interface WorkflowRuntimeParameterInspectionInput {
  readonly refreshNodeDefinitions?: boolean
  readonly instanceId: string
  readonly workflow: UiWorkflow
  readonly connection: ComfyConnection
  readonly runtimeParameters?: Readonly<Record<string, JsonValue>>
  readonly parameterKinds?: readonly StandardRuntimeParameterKind[]
  readonly signal?: AbortSignal
}

export interface GenerationTemplateRuntimeParameterInspectionInput {
  readonly templateId: string
  readonly instanceId: string
}

export interface WorkflowCompilerResult {
  readonly inputDescription: WorkflowRuntimeParameterInspection | null
  readonly actualWorkflow: UiWorkflow
  readonly apiWorkflow: Readonly<Record<string, JsonValue>>
  readonly activeOutputNodeIds: readonly string[]
}

export interface WorkflowCompiler {
  validateInput?(input: WorkflowCompilerInput): Promise<void>
  inspectRuntimeParameters(input: WorkflowRuntimeParameterInspectionInput): Promise<WorkflowRuntimeParameterInspection>
  compile(input: WorkflowCompilerInput): Promise<WorkflowCompilerResult>
}

export interface GenerationImagePreparationPort {
  resolve(ref: ImageRef, signal?: AbortSignal): Promise<{ readonly filePath: string; readonly filename: string; readonly mediaType: string }>
  upload(input: { readonly connection: ComfyConnection; readonly instanceId: string; readonly imageRefId: string; readonly filePath: string; readonly filename: string; readonly mediaType: string; readonly signal?: AbortSignal }): Promise<{ readonly name: string; readonly subfolder: string; readonly type: 'input' }>
}

export interface SourceGenerationPreparerOptions {
  readonly images?: GenerationImagePreparationPort
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

  private async readInstance(instanceId: string, signal?: AbortSignal): Promise<ComfyInstanceSource> {
    try { return await this.options.source.readInstance(instanceId, signal) }
    catch (error) {
      if (signal?.aborted || !(error instanceof GenerationRuntimeError) || error.name === 'AbortError') throw error
      throw new GenerationInputValidationError(error.code, error.message, 'instance_id')
    }
  }

  async inspectRuntimeParameters(
    input: GenerationTemplateRuntimeParameterInspectionInput,
    signal?: AbortSignal,
  ): Promise<WorkflowRuntimeParameterInspection> {
    if (input.templateId.trim().length === 0) throw new TypeError('ComfyUI template id is required for parameter inspection.')
    if (input.instanceId.trim().length === 0) throw new TypeError('ComfyUI instance id is required for parameter inspection.')
    const bundle = await this.options.source.readTemplate(input.templateId, signal)
    const instance = await this.readInstance(input.instanceId, signal)
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

  private async compilerInput(request: GenerationRequest, signal?: AbortSignal) {
    const bundle = await this.options.source.readTemplate(request.templateId, signal)
    const instance = await this.readInstance(request.instanceId ?? this.options.defaultInstanceId, signal)
    const connection = Object.freeze({ url: instance.url, origin: comfyInstanceOrigin(instance.url), authorization: instance.authorization })
    const input: WorkflowCompilerInput = { instanceId: instance.id, workflow: bundle.workflow, connection, runtimeParameters: request.parameters, boundImageParameterIds: (request.workflowImageBindings ?? []).map(binding => binding.parameter_id), model: request.model, loras: request.loras, signal }
    return { bundle, instance, connection, input }
  }

  async validateInput(request: GenerationRequest, signal?: AbortSignal): Promise<void> {
    if (!this.options.compiler.validateInput) throw new GenerationRuntimeError('GENERATION_VALIDATION_UNAVAILABLE', 'Workflow compiler does not provide generation input validation.')
    const { input } = await this.compilerInput(request, signal)
    const description = await this.options.compiler.inspectRuntimeParameters({ ...input, parameterKinds: ['reference_image'] })
    const problem = workflowImageInputProblem(description, request.workflowImageBindings ?? [], request.parameters, request.imageRefs ?? [])
    if (problem) throw new GenerationInputValidationError(problem.code, problem.message, problem.inputPath)
    await this.options.compiler.validateInput(input)
  }

  async prepare(request: GenerationRequest, signal?: AbortSignal, context?: GenerationPreparationContext): Promise<PreparedGeneration> {
    const { bundle, instance, connection, input } = await this.compilerInput(request, signal)
    const preparedImages = await this.prepareImages(request, input, signal, context)
    const effectiveInput = { ...preparedImages.effectiveInput, instanceId: instance.id }
    const { imageUploads } = preparedImages
    const compiled = await this.options.compiler.compile({ ...input, runtimeParameters: effectiveInput.parameters, refreshNodeDefinitions: imageUploads.length > 0 })
    return Object.freeze({
      instanceId: instance.id, instanceTitle: instance.title, templateTitle: bundle.title,
      sourceSnapshot: safeSourceSnapshot(bundle, instance, connection.origin),
      inputDescription: compiled.inputDescription,
      actualWorkflow: compiled.actualWorkflow, apiWorkflow: compiled.apiWorkflow,
      expectedOutputNodeIds: compiled.activeOutputNodeIds, connection, effectiveInput, imageUploads,
    })
  }

  private async prepareImages(request: GenerationRequest, input: WorkflowCompilerInput, signal?: AbortSignal, context?: GenerationPreparationContext) {
    const refs = request.imageRefs ?? []
    const bindings = request.workflowImageBindings ?? []
    const workflowRefs = refs.filter(ref => ref.purpose === 'workflow' || ref.purpose === 'both')
    const description = await this.options.compiler.inspectRuntimeParameters({ ...input, parameterKinds: ['reference_image'] })
    const problem = workflowImageInputProblem(description, bindings, request.parameters, refs)
    if (problem) throw new GenerationInputValidationError(problem.code, problem.message, problem.inputPath)
    if (workflowRefs.length === 0 && bindings.length === 0) return { effectiveInput: request, imageUploads: [] }
    if (!this.options.images) throw new GenerationRuntimeError('GENERATION_IMAGE_PREPARATION_UNAVAILABLE', 'Workflow image preparation is unavailable. Reopen the workbench and retry.')
    const parameters = { ...request.parameters }
    const cardinalities = new Map(description.parameters.filter(parameter => parameter.kind === 'reference_image')
      .map(parameter => [parameter.parameter_id, parameter.image_cardinality!]))
    const uploaded = new Map<string, { name: string; subfolder: string; type: 'input' }>()
    const imageUploads: GenerationImageUpload[] = []
    for (const ref of workflowRefs) {
      const targets = bindings.filter(binding => binding.image_ref_ids.includes(ref.image_ref_id))
      signal?.throwIfAborted()
      try {
        const file = await this.options.images.resolve(ref, signal)
        const result = await this.options.images.upload({ ...file, imageRefId: ref.image_ref_id, instanceId: input.instanceId, connection: input.connection, signal })
        uploaded.set(ref.image_ref_id, result)
        for (const binding of targets) {
          const record: GenerationImageUpload = { image_ref_id: ref.image_ref_id, parameter_id: binding.parameter_id, instance_id: input.instanceId, ...result }
          imageUploads.push(record)
          context?.onImageUploaded(record)
        }
      } catch (error) {
        if (signal?.aborted) throw error
        throw new GenerationRuntimeError(error instanceof GenerationRuntimeError ? error.code : 'GENERATION_IMAGE_PREPARATION_FAILED', `Image ${ref.image_ref_id}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    for (const binding of bindings) {
      const values = binding.image_ref_ids.map(id => {
        const result = uploaded.get(id)!
        return result.subfolder ? `${result.subfolder}/${result.name}` : result.name
      })
      parameters[binding.parameter_id] = cardinalities.get(binding.parameter_id) === 'many' ? values : values[0]!
    }
    return { effectiveInput: Object.freeze({ ...request, parameters }), imageUploads }
  }
}

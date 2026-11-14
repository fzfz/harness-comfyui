import type { JsonValue } from '#contracts'
import { contracts } from '#contracts'
import { promptResourceRefs } from './resources.ts'
import type { GenerationInput, GenerationInputBase, TaskDraft, Task, WorkbenchRun, WorkbenchRunInput } from './contract.ts'

export interface FieldIssue { path: string; message: string }

export class WorkbenchError extends Error {
  readonly issues: FieldIssue[]
  readonly code: string
  constructor(code: string, issues: FieldIssue[] | string, path = '') {
    const values = typeof issues === 'string' ? [{ path, message: issues }] : issues
    super(values.map(issue => `${issue.path}: ${issue.message}`).join('\n'))
    this.name = 'WorkbenchError'
    this.code = code
    this.issues = values
  }
}

export function generationInputWithImages(input: GenerationInputBase, images: { image_refs?: import('./contract.ts').ImageRef[]; workflow_image_bindings?: import('./contract.ts').WorkflowImageBinding[] }): GenerationInput {
  return { ...input, image_refs: images.image_refs ?? [], workflow_image_bindings: images.workflow_image_bindings ?? [] }
}

export function generationInputForDraft(input: GenerationInput, imageParameterIds: Iterable<string>): GenerationInputBase {
  const { image_refs: _images, workflow_image_bindings: _bindings, ...generation } = input
  const images = new Set(imageParameterIds)
  return { ...generation, parameters: Object.fromEntries(Object.entries(generation.parameters).filter(([id]) => !images.has(id))) }
}

export function taskDraftFromRunInput(input: WorkbenchRunInput, current?: TaskDraft): TaskDraft {
  const imageParameterIds = new Set(input.image_uploads.map(upload => upload.parameter_id))
  for (const [id, kind] of Object.entries(input.parameter_mapping ?? {})) if (kind === 'reference_image') imageParameterIds.add(id)
  for (const binding of input.workflow_image_bindings) imageParameterIds.add(binding.parameter_id)
  return contracts.parse('taskDraft', 'input', { ...current, generation_input: generationInputForDraft(input.generation_input, imageParameterIds), prompt_input: input.prompt_input,
    parameter_mapping: input.parameter_mapping, base_model_id: input.base_model_id,
    image_refs: input.image_refs, workflow_image_bindings: input.workflow_image_bindings,
    prompt_resource_refs: promptResourceRefs(input.selected_resources ?? []),
    reference_run_ids: [...new Set([...(current?.reference_run_ids ?? []), input.run_id])],
  })
}

export function runBaseModelId(run: Pick<WorkbenchRun, 'generation_input'>, task: Pick<Task, 'input'>): string | null {
  return run.generation_input.model?.id === task.input.generation_input.model?.id ? task.input.base_model_id : null
}

export function jsonValue<T>(value: T): JsonValue { return structuredClone(value) as JsonValue }

import { contractFields } from '../shared/field-contract.ts'
import Schema from '@deepseek-ai/schemastery'
import { STANDARD_RUNTIME_PARAMETER_KINDS } from '../generation/inspection-contract.ts'
import { artifactSchemas, functionBindingEditableSchema, favoriteUpdateSchema, experienceReuseInputSchema, reviewDraftSchema, reviewDraftUpdateSchema, taskRequestDraftSchema, taskDraftSchema, inputReferencesSchema, generationInputBaseSchema, generationInputSchema, resourceSnapshotSchema } from './schema.ts'
import { PROMPT_RESOURCE_KINDS, promptResourceRefs } from './resources.ts'
import { TASK_KINDS } from './functions.ts'
import libraryConfig from './library-config.json' with { type: 'json' }
import { WORKBENCH_BRANCH_NAME_MAX_LENGTH, WORKBENCH_RESOURCE_KINDS, isRunReviewFunctionKind } from './contract.ts'
import { requestTemplateProblem } from './request-template.ts'
import type { ArtifactPayload, FavoriteUpdate, ExperienceReuseInput, FunctionBinding, FunctionBindingEditable, GenerationInput, GenerationInputBase, JsonValue, ReviewDraft, ReviewDraftUpdate, TaskDraft, TaskRequestDraft, TaskInput, TaskKind, Task, WorkbenchRun, WorkbenchRunInput } from './contract.ts'

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

class Validator {
  issues: FieldIssue[] = []
  issue(path: string, message: string): void { this.issues.push({ path, message }) }
  object(value: unknown, path: string, keys?: string[]): value is Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) { this.issue(path, '请提供对象。'); return false }
    if (keys) for (const key of Object.keys(value)) if (!keys.includes(key)) this.issue(`${path}.${key}`, '请移除此字段。')
    return true
  }
  text(value: unknown, path: string, nonempty = false): value is string {
    if (typeof value !== 'string' || (nonempty && value.trim() === '')) { this.issue(path, nonempty ? '请填写非空文本。' : '请填写文本。'); return false }
    return true
  }
  id(value: unknown, path: string, nullable = false): void {
    if (nullable && value === null) return
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) this.issue(path, '请填写正整数十进制字符串。')
  }
  array(value: unknown, path: string, each: (item: unknown, path: string) => void): value is unknown[] {
    if (!Array.isArray(value)) { this.issue(path, '请提供数组。'); return false }
    value.forEach((item, index) => each(item, `${path}.${index}`)); return true
  }
  strings(value: unknown, path: string): void { this.array(value, path, (item, p) => { this.text(item, p) }) }
  json(value: unknown, path: string): void {
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return
    if (Array.isArray(value)) { value.forEach((v, i) => this.json(v, `${path}.${i}`)); return }
    if (this.object(value, path)) for (const [key, item] of Object.entries(value)) this.json(item, `${path}.${key}`)
  }
  refs(value: unknown, path: string, kinds: readonly string[] = WORKBENCH_RESOURCE_KINDS): void {
    const found = new Set<string>()
    this.array(value, path, (item, p) => {
      if (!this.object(item, p, ['kind', 'id'])) return
      if (!kinds.includes(String(item.kind))) this.issue(`${p}.kind`, '请选择当前目录中的资源类别。')
      this.id(item.id, `${p}.id`)
      const key = `${item.kind}:${item.id}`
      if (found.has(key)) this.issue(p, '请移除重复引用。')
      found.add(key)
    })
  }
  generation(value: unknown, path: string, ready = false, images = false): void {
    if (!this.object(value, path, Object.keys(contractFields(images ? generationInputSchema : generationInputBaseSchema) ?? {}))) return
    this.text(value.title, `${path}.title`)
    for (const key of ['instance_id', 'template_id']) if (value[key] !== null || ready) this.id(value[key], `${path}.${key}`)
    if (value.model !== null && this.object(value.model, `${path}.model`, ['id', 'file_name'])) { this.id(value.model.id, `${path}.model.id`); this.text(value.model.file_name, `${path}.model.file_name`, true) }
    if (this.object(value.parameters, `${path}.parameters`)) for (const [key, item] of Object.entries(value.parameters)) { if (!key) this.issue(`${path}.parameters`, '请填写参数 ID。'); this.json(item, `${path}.parameters.${key}`) }
    const ids = new Set<unknown>()
    this.array(value.loras, `${path}.loras`, (item, p) => {
      if (!this.object(item, p, ['id', 'file_name', 'weight', 'trigger_words'])) return
      this.id(item.id, `${p}.id`); this.text(item.file_name, `${p}.file_name`, true); this.strings(item.trigger_words, `${p}.trigger_words`)
      if (typeof item.weight !== 'number' || !Number.isFinite(item.weight)) this.issue(`${p}.weight`, '请填写有限数值。')
      if (ids.has(item.id)) this.issue(`${p}.id`, '请移除重复 LoRA。')
      ids.add(item.id)
    })
  }
  draft(value: unknown, path: string, ready = false): void {
    if (!this.object(value, path)) return
    if (this.object(value.prompt_input, `${path}.prompt_input`, ['positive_prompt', 'negative_prompt'])) {
      if (value.prompt_input.positive_prompt !== null) this.text(value.prompt_input.positive_prompt, `${path}.prompt_input.positive_prompt`)
      if (value.prompt_input.negative_prompt !== null) this.text(value.prompt_input.negative_prompt, `${path}.prompt_input.negative_prompt`)
    }
    if (value.parameter_mapping !== null && this.object(value.parameter_mapping, `${path}.parameter_mapping`)) {
      for (const [id, kind] of Object.entries(value.parameter_mapping)) {
        if (!(STANDARD_RUNTIME_PARAMETER_KINDS as readonly unknown[]).includes(kind)) this.issue(`${path}.parameter_mapping.${id}`, '请使用模板参数描述中的参数类型。')
      }
    }
    this.generation(value.generation_input, `${path}.generation_input`, ready)
    this.id(value.base_model_id, `${path}.base_model_id`, true)
    this.refs(value.prompt_resource_refs ?? [], `${path}.prompt_resource_refs`, PROMPT_RESOURCE_KINDS)
  }
  finish<T>(value: unknown): T { if (this.issues.length) throw new WorkbenchError('WORKBENCH_INVALID_INPUT', this.issues); return structuredClone(value) as T }
}

export function validateGenerationInput(value: unknown, path = 'generation_input', ready = false): GenerationInput {
  const v = new Validator(); v.generation(value, path, ready, true); const input = v.finish<GenerationInput>(value); validateInputReferences(input, path); return input
}

export function generationInputWithImages(input: GenerationInputBase, images: { image_refs?: import('./contract.ts').ImageRef[]; workflow_image_bindings?: import('./contract.ts').WorkflowImageBinding[] }): GenerationInput {
  return { ...input, image_refs: images.image_refs ?? [], workflow_image_bindings: images.workflow_image_bindings ?? [] }
}
export function validateTaskRequestDraft(value: unknown): TaskRequestDraft {
  try { return Schema.resolve(value, taskRequestDraftSchema, {})[0] as TaskRequestDraft }
  catch (error) { throw new WorkbenchError('WORKBENCH_INVALID_INPUT', error instanceof Error ? error.message : String(error), 'draft') }
}

export function validateTaskDraft(value: unknown, path = 'draft'): TaskDraft {
  try {
    const draft = structuredClone(Schema.resolve(value, taskDraftSchema, {})[0]) as TaskDraft
    validateInputReferences(draft, path)
    const validator = new Validator()
    validator.refs(draft.prompt_resource_refs, `${path}.prompt_resource_refs`, PROMPT_RESOURCE_KINDS)
    return validator.finish(draft)
  } catch (error) { if (error instanceof WorkbenchError) throw error; throw new WorkbenchError('WORKBENCH_INVALID_INPUT', error instanceof Error ? error.message : String(error), path) }
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
  return validateTaskDraft({ ...current, generation_input: generationInputForDraft(input.generation_input, imageParameterIds), prompt_input: input.prompt_input,
    parameter_mapping: input.parameter_mapping, base_model_id: input.base_model_id,
    image_refs: input.image_refs, workflow_image_bindings: input.workflow_image_bindings,
    prompt_resource_refs: promptResourceRefs(input.selected_resources ?? []),
    reference_run_ids: [...new Set([...(current?.reference_run_ids ?? []), input.run_id])],
  })
}

export function runBaseModelId(run: Pick<WorkbenchRun, 'generation_input'>, task: Pick<Task, 'input'>): string | null {
  return run.generation_input.model?.id === task.input.generation_input.model?.id ? task.input.base_model_id : null
}

export function validateInputReferences(value: unknown, path = 'input'): import('./contract.ts').InputReferences {
  const keys = ['reference_task_ids', 'reference_run_ids', 'reference_experiences', 'image_refs', 'workflow_image_bindings']
  let refs: import('./contract.ts').InputReferences
  try { refs = structuredClone(Schema.resolve(Object.fromEntries(Object.entries(value as object).filter(([key]) => keys.includes(key))), inputReferencesSchema, {})[0]) as import('./contract.ts').InputReferences }
  catch (error) { throw new WorkbenchError('WORKBENCH_INVALID_INPUT', error instanceof Error ? error.message : String(error), path) }
  const images = new Map<string, import('./contract.ts').ImageRef>()
  for (const image of refs.image_refs) {
    if (images.has(image.image_ref_id)) throw new WorkbenchError('WORKBENCH_INVALID_INPUT', '请为每张图片填写不同的 image_ref_id。', `${path}.image_refs`)
    images.set(image.image_ref_id, image)
  }
  const parameters = new Set<string>()
  for (const binding of refs.workflow_image_bindings) {
    if (parameters.has(binding.parameter_id)) throw new WorkbenchError('WORKBENCH_INVALID_INPUT', '请将同一参数的图片按顺序填入一个绑定。', `${path}.workflow_image_bindings`)
    parameters.add(binding.parameter_id)
    for (const id of binding.image_ref_ids) {
      const image = images.get(id)
      if (!image || image.purpose === 'agent') throw new WorkbenchError('WORKBENCH_INVALID_INPUT', '请绑定用途为 Workflow 输入的图片。', `${path}.workflow_image_bindings`)
    }
  }
  return refs
}
export function validateTaskInput(kind: TaskKind, value: unknown): TaskInput {
  const v = new Validator()
  if (!v.object(value, 'input', [...Object.keys(contractFields(taskDraftSchema) ?? {}).filter(key => key !== 'instructions'), 'requirements', 'reference_task_artifacts', 'evaluation_input', 'requested_skill', 'max_runs', 'delegation_source', 'selected_resources'])) return v.finish(value)
  const draftFields = Object.keys(contractFields(taskDraftSchema) ?? {})
  const draft = validateTaskDraft(Object.fromEntries(Object.entries(value).filter(([key]) => draftFields.includes(key))), 'input')
  const { instructions: _draftInstructions, ...fixedDraft } = draft
  value = { ...value, ...fixedDraft, reference_task_artifacts: value.reference_task_artifacts ?? [] }
  if (!v.object(value, 'input')) return v.finish(value)
  v.draft(value, 'input', kind === 'run' || kind === 'experiment')
  if (value.selected_resources !== undefined) v.array(value.selected_resources, 'input.selected_resources', (item, path) => {
    try { Schema.resolve(item, resourceSnapshotSchema, {}) } catch (error) { v.issue(path, error instanceof Error ? error.message : String(error)) }
  })
  if (v.object(value.requirements, 'input.requirements', ['original_request', 'instructions'])) { v.text(value.requirements.original_request, 'input.requirements.original_request', true); v.text(value.requirements.instructions, 'input.requirements.instructions') }
  if (value.delegation_source !== undefined && v.object(value.delegation_source, 'input.delegation_source')) {
    const source = value.delegation_source
    if (source.type === 'initial') v.object(source, 'input.delegation_source', ['type'])
    else if (source.type === 'candidate') { v.object(source, 'input.delegation_source', ['type', 'artifact_id']); v.text(source.artifact_id, 'input.delegation_source.artifact_id', true) }
    else if (source.type === 'run') { v.object(source, 'input.delegation_source', ['type', 'run_id']); v.text(source.run_id, 'input.delegation_source.run_id', true) }
    else v.issue('input.delegation_source.type', '请选择 initial、candidate 或 run。')
  }
  v.strings(value.reference_run_ids, 'input.reference_run_ids')
  if (value.requested_skill !== null) v.text(value.requested_skill, 'input.requested_skill', true)
  if (!Number.isSafeInteger(value.max_runs) || (kind === 'run' ? value.max_runs !== 1 : kind === 'experiment' ? Number(value.max_runs) < 1 : value.max_runs !== 0)) v.issue('input.max_runs', '运行任务填写 1，持续实验填写正整数，其他任务填写 0。')
  if (isRunReviewFunctionKind(kind)) {
    if (!Array.isArray(value.reference_run_ids) || value.reference_run_ids.length < (kind === 'compare' ? 2 : 1)) v.issue('input.reference_run_ids', kind === 'compare' ? '请选择至少 2 个参考运行。' : '请选择参考运行。')
    if (kind === 'compare' && Array.isArray(value.reference_run_ids) && new Set(value.reference_run_ids).size !== value.reference_run_ids.length) v.issue('input.reference_run_ids', '请选择不同的运行作为比较对象。')
    const evaluation = value.evaluation_input
    if (v.object(evaluation, 'input.evaluation_input', ['run_id', 'verdict', 'observation', 'conclusion', 'experience'])) {
      v.text(evaluation.run_id, 'input.evaluation_input.run_id', true)
      if (!['unrated', 'met', 'needs-work'].includes(String(evaluation.verdict))) v.issue('input.evaluation_input.verdict', '请选择 unrated、met 或 needs-work。')
      v.text(evaluation.observation, 'input.evaluation_input.observation'); v.text(evaluation.conclusion, 'input.evaluation_input.conclusion')
      if (v.object(evaluation.experience, 'input.evaluation_input.experience', ['title', 'conditions', 'note'])) for (const key of ['title', 'conditions', 'note']) v.text(evaluation.experience[key], `input.evaluation_input.experience.${key}`)
      if (Array.isArray(value.reference_run_ids) && !value.reference_run_ids.includes(evaluation.run_id)) v.issue('input.evaluation_input.run_id', '请选择本次参考运行。')
    }
  } else if (value.evaluation_input !== undefined) v.issue('input.evaluation_input', '请移除 evaluation_input 字段后重新提交。')
  return v.finish(value)
}

export function validateArtifact(value: unknown): ArtifactPayload {
  const v = new Validator()
  if (!v.object(value, 'artifact')) return v.finish(value)
  const schema = artifactSchemas[value.type as keyof typeof artifactSchemas]
  const keys = schema ? Object.keys(contractFields(schema) ?? {}) : undefined
  if (!keys) { v.issue('artifact.type', '请选择 prompt、parameters、generation_input、iteration_plan、resources、review、experience 或 question。'); return v.finish(value) }
  v.object(value, 'artifact', ['type', 'source_files', ...keys])
  if (value.source_files !== undefined) v.strings(value.source_files, 'artifact.source_files')
  switch (value.type) {
    case 'prompt':
      if (value.positive_prompt !== null) v.text(value.positive_prompt, 'artifact.positive_prompt')
      if (value.negative_prompt !== null) v.text(value.negative_prompt, 'artifact.negative_prompt')
      break
    case 'parameters': if (v.object(value.parameters, 'artifact.parameters')) for (const [key, item] of Object.entries(value.parameters)) v.json(item, `artifact.parameters.${key}`); break
    case 'generation_input':
      v.generation(value.generation_input, 'artifact.generation_input', true); validateInputReferences(value, 'artifact')
      v.refs(value.prompt_resource_refs ?? [], 'artifact.prompt_resource_refs', PROMPT_RESOURCE_KINDS)
      if (value.selected_resources !== undefined) v.array(value.selected_resources, 'artifact.selected_resources', (item, path) => {
        try { Schema.resolve(item, resourceSnapshotSchema, {}) } catch (error) { v.issue(path, error instanceof Error ? error.message : String(error)) }
      })
      if (value.plan_artifact_id !== undefined && value.plan_artifact_id !== null) v.text(value.plan_artifact_id, 'artifact.plan_artifact_id', true)
      break
    case 'iteration_plan':
      v.text(value.source_run_id, 'artifact.source_run_id', true); v.strings(value.changes, 'artifact.changes')
      if (!Array.isArray(value.changes) || value.changes.length === 0) v.issue('artifact.changes', '请填写至少 1 项拟修改内容。')
      else for (const [index, change] of value.changes.entries()) v.text(change, `artifact.changes.${index}`, true)
      v.text(value.reason, 'artifact.reason', true); v.text(value.expected_result, 'artifact.expected_result', true)
      break
    case 'resources': v.refs(value.refs, 'artifact.refs'); if (value.reason !== undefined) v.text(value.reason, 'artifact.reason'); break
    case 'review':
      v.text(value.observation, 'artifact.observation'); v.text(value.conclusion, 'artifact.conclusion'); v.strings(value.run_ids, 'artifact.run_ids')
      if (!Array.isArray(value.run_ids) || value.run_ids.length === 0) v.issue('artifact.run_ids', '请填写评价引用的运行 ID。')
      if (value.candidate !== undefined && v.object(value.candidate, 'artifact.candidate', ['generation_input', 'prompt_resource_refs', 'selected_resources', 'image_refs', 'workflow_image_bindings'])) {
        v.generation(value.candidate.generation_input, 'artifact.candidate.generation_input', true)
        validateInputReferences(value.candidate, 'artifact.candidate')
        v.refs(value.candidate.prompt_resource_refs ?? [], 'artifact.candidate.prompt_resource_refs', PROMPT_RESOURCE_KINDS)
        if (value.candidate.selected_resources !== undefined) v.array(value.candidate.selected_resources, 'artifact.candidate.selected_resources', (item, path) => {
          try { Schema.resolve(item, resourceSnapshotSchema, {}) } catch (error) { v.issue(path, error instanceof Error ? error.message : String(error)) }
        })
      }
      break
    case 'experience':
      for (const key of ['title', 'conditions', 'note']) v.text(value[key], `artifact.${key}`, true)
      v.id(value.base_model_id, 'artifact.base_model_id', true); v.id(value.model_id, 'artifact.model_id', true); v.strings(value.run_ids, 'artifact.run_ids')
      if (!Array.isArray(value.run_ids) || value.run_ids.length === 0) v.issue('artifact.run_ids', '请填写经验引用的运行 ID。')
      break
    case 'question': v.text(value.question, 'artifact.question', true); if (value.options === undefined) value.options = []; v.strings(value.options, 'artifact.options'); break
  }
  return v.finish(value)
}

export function validateReviewDraft(value: unknown): ReviewDraft {
  try { return structuredClone(Schema.resolve(value, reviewDraftSchema, {})[0]) as ReviewDraft }
  catch (error) { throw new WorkbenchError('WORKBENCH_INVALID_INPUT', error instanceof Error ? error.message : String(error), 'draft') }
}

export function validateReviewDraftUpdate(value: unknown): ReviewDraftUpdate {
  try { return structuredClone(Schema.resolve(value, reviewDraftUpdateSchema, {})[0]) as ReviewDraftUpdate }
  catch (error) { throw new WorkbenchError('WORKBENCH_INVALID_INPUT', error instanceof Error ? error.message : String(error), 'evaluationDraft') }
}

export function validateFavoriteUpdate(value: unknown): FavoriteUpdate {
  try { return Schema.resolve(value, favoriteUpdateSchema, {})[0] as FavoriteUpdate }
  catch {
    const error = libraryConfig.errors.favoriteInvalid
    throw new WorkbenchError(error.code, error.message, error.path)
  }
}

export function validateExperienceReuseInput(value: unknown): ExperienceReuseInput {
  try { return Schema.resolve(value, experienceReuseInputSchema, {})[0] as ExperienceReuseInput }
  catch {
    const error = libraryConfig.errors.reuseInvalid
    throw new WorkbenchError(error.code, error.message.replaceAll('{maxLength}', String(WORKBENCH_BRANCH_NAME_MAX_LENGTH)), error.path)
  }
}

export function validateFunctionBindingEditable(value: unknown): FunctionBindingEditable {
  try { return structuredClone(Schema.resolve(value, functionBindingEditableSchema, {})[0]) as FunctionBindingEditable }
  catch (error) { throw new WorkbenchError('WORKBENCH_INVALID_INPUT', error instanceof Error ? error.message : String(error), 'binding') }
}

export function validateFunctionBinding(value: FunctionBinding): FunctionBinding {
  const v = new Validator()
  for (const key of ['workspace_id', 'function_id', 'name', 'preset_id'] as const) v.text(value[key], `binding.${key}`, true)
  if (value.name.length > 30) v.issue('binding.name', '功能名称最多 30 字。')
  if (typeof value.builtin !== 'boolean') v.issue('binding.builtin', '请填写布尔值。')
  if (value.kind !== 'translate' && !TASK_KINDS.includes(value.kind)) v.issue('binding.kind', '请选择功能类型。')
  v.text(value.agent_model?.provider, 'binding.agent_model.provider', true); v.text(value.agent_model?.model, 'binding.agent_model.model', true)
  if (value.agent_model?.reasoningEffort !== undefined) v.text(value.agent_model.reasoningEffort, 'binding.agent_model.reasoningEffort', true)
  if (value.requested_skill !== null) v.text(value.requested_skill, 'binding.requested_skill', true)
  if (v.text(value.request_template, 'binding.request_template')) {
    const problem = requestTemplateProblem(value.request_template, value.kind)
    if (problem) v.issue('binding.request_template', problem)
  }
  if (value.kind === 'prompt' && value.request_parts) {
    for (const [name, template] of Object.entries(value.request_parts.block_templates)) {
      const problem = requestTemplateProblem(template, 'prompt', name as import('./request-template.ts').PromptBlockName)
      if (problem) v.issue(`binding.request_parts.block_templates.${name}`, problem)
    }
  }
  return v.finish(value)
}

export function jsonValue<T>(value: T): JsonValue { return structuredClone(value) as JsonValue }

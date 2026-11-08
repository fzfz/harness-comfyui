import { contractFields } from '../shared/field-contract.ts'
import Schema from '@deepseek-ai/schemastery'
import { artifactSchemas, functionBindingEditableSchema, favoriteUpdateSchema, experienceReuseInputSchema, reviewDraftSchema, reviewDraftUpdateSchema, taskRequestDraftSchema } from './schema.ts'
import { CATALOG_KIND_DEFINITIONS } from '../catalog/contract.ts'
import { TASK_KINDS } from './functions.ts'
import libraryConfig from './library-config.json' with { type: 'json' }
import { WORKBENCH_BRANCH_NAME_MAX_LENGTH, isRunReviewFunctionKind } from './contract.ts'
import { requestTemplateProblem } from './request-template.ts'
import type { ArtifactPayload, ContextRef, FavoriteUpdate, ExperienceReuseInput, FunctionBinding, FunctionBindingEditable, GenerationInput, JsonValue, ReviewDraft, ReviewDraftUpdate, TaskDraft, TaskRequestDraft, TaskInput, TaskKind } from './contract.ts'

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
  refs(value: unknown, path: string, resources = false): void {
    const found = new Set<string>()
    this.array(value, path, (item, p) => {
      if (!this.object(item, p, ['kind', 'id'])) return
      if (!(resources ? CATALOG_KIND_DEFINITIONS.map(item => item.kind) : ['work', 'character', 'style', 'prompt-term', 'artist-string']).includes(String(item.kind))) this.issue(`${p}.kind`, '请选择作品、角色、画风、提示词条目或画师串。')
      this.id(item.id, `${p}.id`)
      const key = `${item.kind}:${item.id}`
      if (found.has(key)) this.issue(p, '请移除重复引用。')
      found.add(key)
    })
  }
  generation(value: unknown, path: string, ready = false): void {
    if (!this.object(value, path, ['title', 'instance_id', 'template_id', 'model', 'parameters', 'loras'])) return
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
    this.generation(value.generation_input, `${path}.generation_input`, ready)
    this.refs(value.context_refs, `${path}.context_refs`); this.id(value.base_model_id, `${path}.base_model_id`, true)
  }
  finish<T>(value: unknown): T { if (this.issues.length) throw new WorkbenchError('WORKBENCH_INVALID_INPUT', this.issues); return structuredClone(value) as T }
}

export function validateGenerationInput(value: unknown, path = 'generation_input', ready = false): GenerationInput {
  const v = new Validator(); v.generation(value, path, ready); return v.finish(value)
}
export function validateContextRefs(value: unknown, path = 'context_refs'): ContextRef[] {
  const v = new Validator(); v.refs(value, path); return v.finish(value)
}
export function validateTaskRequestDraft(value: unknown): TaskRequestDraft {
  try { return Schema.resolve(value, taskRequestDraftSchema, {})[0] as TaskRequestDraft }
  catch (error) { throw new WorkbenchError('WORKBENCH_INVALID_INPUT', error instanceof Error ? error.message : String(error), 'draft') }
}

export function validateTaskDraft(value: unknown, path = 'draft'): TaskDraft {
  const v = new Validator()
  if (v.object(value, path, ['prompt_input', 'generation_input', 'context_refs', 'base_model_id'])) v.draft(value, path)
  return v.finish(value)
}
export function validateTaskInput(kind: TaskKind, value: unknown): TaskInput {
  const v = new Validator()
  if (!v.object(value, 'input', ['prompt_input', 'generation_input', 'context_refs', 'base_model_id', 'requirements', 'reference_run_ids', 'evaluation_input', 'requested_skill', 'max_runs'])) return v.finish(value)
  v.draft(value, 'input', kind === 'run' || kind === 'experiment')
  if (v.object(value.requirements, 'input.requirements', ['original_request', 'instructions'])) { v.text(value.requirements.original_request, 'input.requirements.original_request', true); v.text(value.requirements.instructions, 'input.requirements.instructions') }
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
  if (!keys) { v.issue('artifact.type', '请选择 prompt、parameters、generation_input、resources、review、experience 或 question。'); return v.finish(value) }
  v.object(value, 'artifact', ['type', 'source_files', ...keys])
  if (value.source_files !== undefined) v.strings(value.source_files, 'artifact.source_files')
  switch (value.type) {
    case 'prompt':
      if (value.positive_prompt !== null) v.text(value.positive_prompt, 'artifact.positive_prompt')
      if (value.negative_prompt !== null) v.text(value.negative_prompt, 'artifact.negative_prompt')
      break
    case 'parameters': if (v.object(value.parameters, 'artifact.parameters')) for (const [key, item] of Object.entries(value.parameters)) v.json(item, `artifact.parameters.${key}`); break
    case 'generation_input': v.generation(value.generation_input, 'artifact.generation_input', true); v.refs(value.context_refs, 'artifact.context_refs'); break
    case 'resources': v.refs(value.refs, 'artifact.refs', true); if (value.reason !== undefined) v.text(value.reason, 'artifact.reason'); break
    case 'review':
      v.text(value.observation, 'artifact.observation'); v.text(value.conclusion, 'artifact.conclusion'); v.strings(value.run_ids, 'artifact.run_ids')
      if (!Array.isArray(value.run_ids) || value.run_ids.length === 0) v.issue('artifact.run_ids', '请填写评价引用的运行 ID。')
      if (value.candidate !== undefined && v.object(value.candidate, 'artifact.candidate', ['generation_input', 'context_refs'])) { v.generation(value.candidate.generation_input, 'artifact.candidate.generation_input', true); v.refs(value.candidate.context_refs, 'artifact.candidate.context_refs') }
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
  if (!TASK_KINDS.includes(value.kind)) v.issue('binding.kind', '请选择功能类型。')
  v.text(value.agent_model?.provider, 'binding.agent_model.provider', true); v.text(value.agent_model?.model, 'binding.agent_model.model', true)
  if (value.agent_model?.reasoningEffort !== undefined) v.text(value.agent_model.reasoningEffort, 'binding.agent_model.reasoningEffort', true)
  if (value.requested_skill !== null) v.text(value.requested_skill, 'binding.requested_skill', true)
  if (v.text(value.request_template, 'binding.request_template')) {
    const problem = requestTemplateProblem(value.request_template)
    if (problem) v.issue('binding.request_template', problem)
  }
  return v.finish(value)
}

export function equalValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((v, i) => equalValue(v, right[i]))
  const a = left as Record<string, unknown>; const b = right as Record<string, unknown>
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => Object.hasOwn(b, key) && equalValue(a[key], b[key]))
}
export function jsonValue<T>(value: T): JsonValue { return structuredClone(value) as JsonValue }

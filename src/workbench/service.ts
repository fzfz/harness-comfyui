import type { AgentModel, ArtifactPayload, ContextRef, EvaluationInput, ExecutionState, FunctionDescriptor, GenerationInput, JsonValue, SkillReadRef, Task, TaskDraft, TaskRequestDraft, TaskGetResult, WorkbenchIdentity, WorkbenchRun, WorkbenchRunInput } from './contract.ts'
import type { WorkbenchStore } from '../host/storage/workbench-store.ts'
import { shouldTrackExecution } from './state.ts'
import { equalValue, jsonValue, validateArtifact, validateTaskRequestDraft, WorkbenchError } from './validation.ts'

import { readSavedPromptInput } from './prompt-input.ts'
import type { WorkflowRuntimeParameterInspection } from '../generation/inspection-contract.ts'

export interface WorkbenchSessionBoundary {
  authorize(input: { task: Task; identity: WorkbenchIdentity }): Promise<boolean>
  create(input: { task: Task; presetId: string; agentModel: AgentModel; requestedSkill: string | null }): Promise<{ sessionId: string; selectedModel: Record<string, JsonValue> }>
  dispatch(input: { sessionId: string; text: string; taskId: string }): Promise<void>
  status?(input: { sessionId: string }): Promise<ExecutionState>
  control?(input: { sessionId: string; action: 'interrupt' | 'pause' | 'continue' }): Promise<void>
  skillReadRefs?(input: { sessionId: string }): Promise<SkillReadRef[]>
}
export interface WorkbenchServiceOptions {
  store: WorkbenchStore
  descriptors: readonly FunctionDescriptor[]
  sessions: WorkbenchSessionBoundary
  validateGenerationInput?: (input: GenerationInput, contextRefs: ContextRef[], path: string) => Promise<void>
  validateParameters?: (input: GenerationInput, parameters: Record<string, JsonValue>, path: string) => Promise<void>
  validateContextRefs?: (refs: ContextRef[], path: string) => Promise<void>
  validateResourceRefs?: (refs: import('./contract.ts').ResourceRef[], path: string) => Promise<void>
  parameterIds?: (input: GenerationInput) => Promise<string[]>
  prepareGenerationInput?: (draft: TaskDraft) => Promise<GenerationInput>
  resolveGenerationDraft?: (input: GenerationInput, contextRefs: ContextRef[]) => Promise<TaskDraft>
  resolveResourceRefs?: (refs: import('./contract.ts').ResourceRef[], draft: TaskDraft) => Promise<TaskDraft>
  resolveResourceSelection?: (ref: import('./contract.ts').ResourceRef, draft: TaskDraft) => Promise<TaskDraft>
  resolveRunModelBaseId?: (modelId: string) => Promise<string | null>
  readRunInputDescription?: (workspaceId: string, runId: string) => Promise<WorkflowRuntimeParameterInspection | null>
  refreshAfterMs?: number
}
export interface CreateTaskRequest {
  workspaceId: string; workId: string; branchId: string; functionId: string; taskDraft?: TaskRequestDraft; instructions?: string; referenceRunIds?: string[]
  evaluationInput?: EvaluationInput; presetOverride?: string; maxRuns?: number; title?: string; initiator?: 'human' | 'agent'; retryOfRunId?: string
}

export class WorkbenchService {
  readonly store: WorkbenchStore
  private readonly options: WorkbenchServiceOptions
  constructor(options: WorkbenchServiceOptions) { this.options = options; this.store = options.store }

  private async authorize(taskId: string, identity: WorkbenchIdentity): Promise<Task> {
    const task = this.store.getTask(taskId)
    if (this.store.taskWorkspace(taskId) !== identity.workspaceId || !task.session_id || !await this.options.sessions.authorize({ task, identity })) throw new WorkbenchError('WORKBENCH_ACCESS_DENIED', '当前执行会话无权访问此任务。请核对 task_id，并在该任务的执行会话中调用。', 'task_id')
    return task
  }
  async authorizeGeneration(taskId: string | null, identity: WorkbenchIdentity): Promise<void> { if (taskId) await this.authorize(taskId, identity) }
  getTaskDraft(request: { workspaceId: string; workId: string; branchId: string; functionId: string }): TaskRequestDraft | null {
    this.store.assertScope(request.workspaceId, request.workId, request.branchId)
    this.store.getFunctionBinding(request.workspaceId, request.functionId)
    return this.store.getTaskDraft(request.branchId, request.functionId)
  }
  saveTaskDraft(request: { workspaceId: string; workId: string; branchId: string; functionId: string; draft: TaskRequestDraft }): TaskRequestDraft {
    this.store.assertScope(request.workspaceId, request.workId, request.branchId)
    return this.store.saveTaskDraft(request.branchId, request.functionId, request.draft)
  }

  async createTask(request: CreateTaskRequest): Promise<Task> {
    this.store.assertScope(request.workspaceId, request.workId, request.branchId)
    const branch = this.store.getBranch(request.branchId)
    const binding = this.store.getFunctionBinding(request.workspaceId, request.functionId)
    const submittedDraft = request.taskDraft === undefined ? undefined : validateTaskRequestDraft(request.taskDraft)
    const taskDraft = submittedDraft ?? this.store.getTaskDraft(branch.branch_id, binding.function_id)
    const descriptor = this.options.descriptors.find(item => item.kind === binding.kind)
    if (!descriptor) throw new WorkbenchError('WORKBENCH_FUNCTION_NOT_FOUND', '功能类型不可用，请在配置中心重新选择。', 'function_id')
    let draft = branch.draft
    if (binding.kind === 'parameters' && taskDraft) {
      draft = structuredClone(branch.draft)
      Object.assign(draft.generation_input, taskDraft.resources)
      if (!draft.generation_input.instance_id || !draft.generation_input.template_id) throw new WorkbenchError('WORKBENCH_TEMPLATE_REQUIRED', '请先选择实例和 Workflow 模板。', 'input.generation_input')
      if (draft.generation_input.instance_id !== branch.draft.generation_input.instance_id || draft.generation_input.template_id !== branch.draft.generation_input.template_id) {
        if (!this.options.resolveResourceSelection) throw new WorkbenchError('WORKBENCH_RESOURCE_UNAVAILABLE', 'Workflow 模板当前无法读取，请重新打开工作台后提交。', 'input.generation_input.template_id')
        draft = await this.options.resolveResourceSelection({ kind: 'comfyui-template', id: draft.generation_input.template_id }, draft)
      }
    }
    if (request.retryOfRunId) {
      if (binding.kind !== 'run') throw new WorkbenchError('WORKBENCH_INVALID_INPUT', '重试请选择运行任务。', 'function_id')
      const source = this.store.assertRunInWork(request.retryOfRunId, request.workId)
      const input = await this.getRunInput({ workspaceId: request.workspaceId, workId: request.workId, runId: source.run_id })
      draft = await this.mappedRunDraft(input)
    }
    if (binding.kind === 'diagnose' && request.evaluationInput) {
      const target = this.store.assertRunInWork(request.evaluationInput.run_id, request.workId)
      if (target.status !== 'failed' && target.status !== 'cancelled') throw new WorkbenchError('WORKBENCH_FAILED_RUN_REQUIRED', '请选择失败或已取消的运行后诊断。', 'input.evaluation_input.run_id')
    }
    const input = { ...draft, requirements: { original_request: branch.original_request, instructions: submittedDraft ? submittedDraft.instructions.trim() : request.instructions ?? taskDraft?.instructions ?? '' }, reference_run_ids: request.referenceRunIds ?? [], requested_skill: binding.requested_skill, max_runs: binding.kind === 'run' ? 1 : binding.kind === 'experiment' ? request.maxRuns ?? branch.execution.max_runs : 0, ...(request.evaluationInput ? { evaluation_input: request.evaluationInput } : {}) }
    if (binding.kind === 'run' || binding.kind === 'experiment') {
      if (this.options.prepareGenerationInput && !request.retryOfRunId) input.generation_input = await this.options.prepareGenerationInput(draft)
      await this.options.validateGenerationInput?.(input.generation_input, input.context_refs, 'input.generation_input')
    }
    await this.options.validateContextRefs?.(input.context_refs, 'input.context_refs')
    const output = structuredClone(descriptor.output_contract)
    if (binding.kind === 'parameters') {
      if (!input.generation_input.instance_id || !input.generation_input.template_id) throw new WorkbenchError('WORKBENCH_TEMPLATE_REQUIRED', '请先选择实例和 Workflow 模板。', 'input.generation_input')
      output.parameter_ids = await this.options.parameterIds?.(input.generation_input) ?? []
    }
    const reviewTarget = ['review', 'compare', 'diagnose', 'experience'].includes(binding.kind)
    const target = reviewTarget ? { kind: 'run_review' as const, id: request.evaluationInput?.run_id ?? '', expected: {} as Record<string, JsonValue> } : { kind: 'branch' as const, id: branch.branch_id, expected: {} as Record<string, JsonValue> }
    if (reviewTarget) {
      const draft = this.store.getRunReviewDraft(target.id)
      const fields = binding.kind === 'experience' ? ['title', 'conditions', 'note', 'evidence_run_ids', 'experience_artifact_id'] : ['observation', 'conclusion', 'evidence_run_ids', 'review_artifact_id']
      for (const field of fields) target.expected[field] = jsonValue(draft[field as keyof typeof draft])
    } else if (binding.kind === 'prompt' || binding.kind === 'rewrite') {
      target.expected = { 'prompt_input.positive_prompt': branch.draft.prompt_input.positive_prompt, 'prompt_input.negative_prompt': branch.draft.prompt_input.negative_prompt }
    } else if (binding.kind === 'parameters') {
      target.expected['generation_input.parameters'] = jsonValue(draft.generation_input.parameters)
    }
    const task = this.store.createTask({ branchId: branch.branch_id, functionId: binding.function_id, title: request.title ?? `${binding.name} · ${branch.name}`, kind: binding.kind, input, outputContract: output, applyTarget: target, bindingSnapshot: { function_id: binding.function_id, name: binding.name, kind: binding.kind, preset_id: request.presetOverride ?? binding.preset_id, agentModel: binding.agent_model, requested_skill: binding.requested_skill, request_template: binding.request_template }, initiator: request.initiator, retryOfRunId: request.retryOfRunId })
    try {
      const session = await this.options.sessions.create({ task, presetId: task.binding_snapshot.preset_id, agentModel: task.binding_snapshot.agentModel, requestedSkill: task.binding_snapshot.requested_skill })
      this.store.bindSession(task.task_id, session.sessionId, session.selectedModel)
      await this.options.sessions.dispatch({ sessionId: session.sessionId, text: task.request_text, taskId: task.task_id })
      this.store.completeTaskSubmission(task.task_id, taskDraft, binding.kind === 'parameters' ? { expected: branch.draft, draft } : undefined)
      return this.store.markExecution(task.task_id, 'running')
    } catch (error) {
      this.store.markExecution(task.task_id, 'failed', { code: error instanceof WorkbenchError ? error.code : 'WORKBENCH_DISPATCH_FAILED', message: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }
  private runContextRefs(run: WorkbenchRun): ContextRef[] {
    const candidate = run.candidate_artifact_id ? this.store.getArtifact(run.candidate_artifact_id).artifact : null
    return candidate?.type === 'generation_input' ? candidate.context_refs : this.store.getTask(run.workbench_task_id).input.context_refs
  }
  private async mappedRunDraft(input: WorkbenchRunInput): Promise<TaskDraft> {
    return { generation_input: input.generation_input, context_refs: input.context_refs, prompt_input: input.prompt_input, base_model_id: input.generation_input.model ? await this.options.resolveRunModelBaseId?.(input.generation_input.model.id) ?? null : null }
  }

  async getRunInput(request: { workspaceId: string; workId: string; runId: string }): Promise<WorkbenchRunInput> {
    this.store.assertScope(request.workspaceId, request.workId)
    const run = this.store.assertRunInWork(request.runId, request.workId)
    const task = this.store.getTask(run.workbench_task_id)
    const description = await this.options.readRunInputDescription?.(request.workspaceId, run.run_id) ?? null
    return { run_id: run.run_id, branch_id: task.branch_id, generation_input: run.generation_input, context_refs: this.runContextRefs(run), input_description: description, prompt_input: readSavedPromptInput(run.generation_input, description?.parameters ?? []) }
  }

  async getTask(request: { taskId: string }, identity: WorkbenchIdentity): Promise<TaskGetResult> {
    await this.authorize(request.taskId, identity)
    const task = this.store.refreshTask(request.taskId)
    const artifacts = this.store.listArtifacts(task.task_id)
    return { task_id: task.task_id, kind: task.kind, status: task.status, ...task.input, output_contract: task.output_contract, artifacts: artifacts.map(a => ({ artifact_id: a.artifact_id, artifact: a.artifact, disposition: a.disposition })), iterations: this.store.listRuns(task.task_id).map(run => {
      return { index: run.iteration_index ?? 1, run_id: run.run_id, generation_input: run.generation_input, context_refs: this.runContextRefs(run), review_artifact_id: run.review_artifact_id }
    }), answers: task.answers }
  }
  async publish(request: { taskId: string; artifact: unknown }, identity: WorkbenchIdentity) {
    const task = await this.authorize(request.taskId, identity)
    const artifact = validateArtifact(request.artifact)
    this.store.validateArtifactForTask(task, artifact)
    if (artifact.type === 'generation_input') await this.options.validateGenerationInput?.(artifact.generation_input, artifact.context_refs, 'artifact.generation_input')
    if (artifact.type === 'review' && artifact.candidate) await this.options.validateGenerationInput?.(artifact.candidate.generation_input, artifact.candidate.context_refs, 'artifact.candidate.generation_input')
    if (artifact.type === 'parameters') await this.options.validateParameters?.(task.input.generation_input, artifact.parameters, 'artifact.parameters')
    if (artifact.type === 'resources') await this.options.validateResourceRefs?.(artifact.refs, 'artifact.refs')
    const refs = await this.options.sessions.skillReadRefs?.({ sessionId: identity.sessionId }) ?? []
    return this.store.publish(task.task_id, artifact, identity, refs)
  }
  async adoptArtifact(request: { artifactId: string; expected: Record<string, JsonValue>; candidate?: boolean }) {
    const stored = this.store.getArtifact(request.artifactId)
    const task = this.store.getTask(stored.task_id)
    const artifact = stored.artifact
    let resolvedDraft: TaskDraft | undefined
    if (artifact.type === 'resources' && this.options.resolveResourceRefs) resolvedDraft = await this.options.resolveResourceRefs(artifact.refs, this.store.getBranch(task.branch_id).draft)
    const generation = artifact.type === 'generation_input' ? artifact : artifact.type === 'review' && request.candidate ? artifact.candidate : undefined
    if (generation && this.options.resolveGenerationDraft) resolvedDraft = await this.options.resolveGenerationDraft(generation.generation_input, generation.context_refs)
    if (artifact.type === 'parameters') await this.options.validateParameters?.(task.input.generation_input, artifact.parameters, 'artifact.parameters')
    return this.store.adoptArtifact({ ...request, resolvedDraft })
  }

  async createBranchFromRun(request: { workspaceId: string; workId: string; runId: string; name: string; originalRequest: string; sourceExperienceId?: string }) {
    const input = await this.getRunInput(request)
    if (request.sourceExperienceId) {
      const experience = this.store.getExperience(request.sourceExperienceId)
      if (experience.work_id !== request.workId || experience.source_run_id !== input.run_id) throw new WorkbenchError('WORKBENCH_SCOPE_MISMATCH', '请选择当前工作中来自此运行的经验。', 'experience_id')
    }
    const draft = await this.mappedRunDraft(input)
    return this.store.createBranch({ workId: request.workId, parentBranchId: input.branch_id, sourceRunId: input.run_id, sourceExperienceId: request.sourceExperienceId, name: request.name, originalRequest: request.originalRequest, draft })
  }

  async createBranchFromArtifact(request: { workspaceId: string; workId: string; artifactId: string; name: string }) {
    const stored = this.store.getArtifact(request.artifactId)
    const task = this.store.getTask(stored.task_id)
    this.store.assertScope(request.workspaceId, request.workId, task.branch_id)
    const { prompt_input, generation_input, context_refs, base_model_id } = task.input
    let draft = structuredClone({ prompt_input, generation_input, context_refs, base_model_id })
    if (stored.artifact.type === 'prompt') {
      draft.prompt_input = { positive_prompt: stored.artifact.positive_prompt, negative_prompt: stored.artifact.negative_prompt }
    } else if (stored.artifact.type === 'parameters') {
      Object.assign(draft.generation_input.parameters, stored.artifact.parameters)
    } else if (stored.artifact.type === 'generation_input' || stored.artifact.type === 'review' && stored.artifact.candidate) {
      const generation = stored.artifact.type === 'generation_input' ? stored.artifact : stored.artifact.candidate!
      if (!this.options.resolveGenerationDraft) throw new WorkbenchError('WORKBENCH_INPUT_RESOLUTION_REQUIRED', '当前无法解析生成输入。请重新打开工作台后，再点击“从产物创建分支”。', 'artifact_id')
      draft = await this.options.resolveGenerationDraft(generation.generation_input, generation.context_refs)
    } else throw new WorkbenchError('WORKBENCH_INVALID_INPUT', '请选择提示词、参数、生成输入或包含建议输入的评价产物创建分支。', 'artifact_id')
    return this.store.createBranch({ workId: request.workId, parentBranchId: task.branch_id, name: request.name, originalRequest: task.input.requirements.original_request, draft, sourceArtifactId: stored.artifact_id })
  }
  async getProjection(request: { workspaceId: string; workId?: string; branchId?: string }) {
    const tasks = this.store.listTasks(request.workspaceId, request.workId, request.branchId).map(task => this.store.refreshTask(task.task_id))
    if (this.options.sessions.status) await Promise.all(tasks.filter(task => shouldTrackExecution(task, this.store.getExperiment(task.task_id))).map(async task => {
      const status = await this.options.sessions.status!({ sessionId: task.session_id! })
      const current = this.store.refreshTask(task.task_id)
      if (shouldTrackExecution(current, this.store.getExperiment(task.task_id)) && status !== current.execution_state) this.store.markExecution(task.task_id, status)
    }))
    const projection = this.store.getProjection({ ...request, refreshAfterMs: this.options.refreshAfterMs })
    const order = new Map(this.options.descriptors.map((descriptor, index) => [descriptor.kind, index]))
    const position = (binding: typeof projection.functions[number]) => binding.builtin ? order.get(binding.kind) ?? order.size : order.size
    projection.functions.sort((a, b) => position(a) - position(b))
    return projection
  }
  async replyTask(request: { taskId: string; questionArtifactId: string; answer: string }): Promise<Task> {
    const task = this.store.replyTask(request.taskId, request.questionArtifactId, request.answer)
    if (!task.session_id) throw new WorkbenchError('WORKBENCH_SESSION_REQUIRED', '任务尚未创建执行会话，请查看任务状态与错误。', 'task_id')
    await this.options.sessions.dispatch({ sessionId: task.session_id, text: task.request_text, taskId: task.task_id })
    return this.store.markExecution(task.task_id, 'running')
  }
  async controlTask(request: { taskId: string; action: 'interrupt' | 'pause' | 'continue' }): Promise<Task> {
    const task = this.store.getTask(request.taskId)
    if (request.action === 'pause' && task.kind !== 'experiment') throw new WorkbenchError('WORKBENCH_INVALID_INPUT', '请选择持续实验任务后暂停。', 'action')
    if (!task.session_id) throw new WorkbenchError('WORKBENCH_SESSION_REQUIRED', '任务尚未创建执行会话，请查看任务状态与错误。', 'task_id')
    await this.options.sessions.control?.({ sessionId: task.session_id, action: request.action })
    const saved = this.store.controlTask(task.task_id, request.action)
    if (request.action === 'continue') {
      await this.options.sessions.dispatch({ sessionId: task.session_id, text: task.request_text, taskId: task.task_id })
      return this.store.markExecution(task.task_id, 'running')
    }
    return saved
  }
  async endExperiment(request: { taskId: string; reason: 'goal_met' | 'user_ended' }, identity: WorkbenchIdentity) {
    await this.authorize(request.taskId, identity)
    return this.store.endExperiment(request.taskId, request.reason)
  }
}

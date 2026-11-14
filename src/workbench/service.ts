import type { JsonValue } from '#contracts'
import { contracts, ContractError } from '#contracts'
import { randomUUID } from 'node:crypto'
import { isDelegatable, type DelegateFunctionRequest, type DelegatedSessionRequest } from './delegation.ts'
import type { AgentModel, ArtifactPayload, EvaluationInput, ExperienceReuseInput, ExecutionState, FunctionDescriptor, GenerationInput, GenerationInputBase, ReviewDraft, ReviewDraftUpdate, SkillReadRef, ResourceSnapshot, Task, TaskDraft, TaskRequestDraft, TaskGetResult, WorkbenchIdentity, WorkbenchRunInput } from './contract.ts'
import experimentControlErrors from './experiment-control-errors.json' with { type: 'json' }
import libraryConfig from './library-config.json' with { type: 'json' }
import { isBranchNonGenerationTaskKind, isRunReviewFunctionKind } from './contract.ts'
import type { WorkbenchStore } from '../host/storage/workbench-store.ts'
import { equalValue } from '../shared/json-contract.ts'
import { jsonValue, generationInputWithImages, taskDraftFromRunInput, runBaseModelId, WorkbenchError } from './validation.ts'

import { parameterMapping, readSavedPromptInput } from './prompt-input.ts'
import { promptResourceRefs } from './resources.ts'
import { flattenWorkflowRuntimeParameters, type WorkflowRuntimeParameterInspection } from '../generation/inspection-contract.ts'

export interface WorkbenchSessionBoundary {
  delegate?(input: DelegatedSessionRequest): Promise<void>
  authorize(input: { task: Task; identity: WorkbenchIdentity }): Promise<boolean>
  create(input: { task: Task; presetId: string; agentModel: AgentModel; requestedSkill: string | null; onCreated?: (sessionId: string) => void }): Promise<{ sessionId: string; selectedModel: Record<string, JsonValue> }>
  dispatch(input: { sessionId: string; text: string; taskId: string; requestId?: string; signal: AbortSignal }): Promise<void>
  status?(input: { sessionId: string }): Promise<ExecutionState | null>
  control?(input: { sessionId: string; action: 'interrupt' | 'pause' | 'continue'; signal: AbortSignal }): Promise<void>
  skillReadRefs?(input: { sessionId: string }): Promise<SkillReadRef[]>
}
export interface WorkbenchServiceOptions {
  store: WorkbenchStore
  descriptors: readonly FunctionDescriptor[]
  sessions: WorkbenchSessionBoundary
  validateGenerationInput?: (input: GenerationInput, path: string) => Promise<void>
  validateParameters?: (input: GenerationInputBase, parameters: Record<string, JsonValue>, path: string) => Promise<void>
  validateResourceRefs?: (refs: import('./contract.ts').ResourceRef[], path: string) => Promise<void>
  parameterIds?: (input: GenerationInput) => Promise<string[]>
  resolveParameterMapping?: (input: GenerationInput) => Promise<TaskDraft['parameter_mapping']>
  prepareGenerationInput?: (draft: TaskDraft) => Promise<GenerationInputBase>
  resolveGenerationDraft?: (input: GenerationInput) => Promise<TaskDraft>
  resolveSelectedResources?: (draft: Pick<TaskDraft, 'generation_input' | 'prompt_resource_refs'>) => Promise<ResourceSnapshot[]>
  resolveResourceRefs?: (refs: import('./contract.ts').ResourceRef[], draft: TaskDraft) => Promise<TaskDraft>
  resolveResourceSelection?: (ref: import('./contract.ts').ResourceRef, draft: TaskDraft) => Promise<TaskDraft>
  resolveBaseModelDraft?: (baseModelId: string, draft: TaskDraft) => Promise<TaskDraft>
  resolveRunModelBaseId?: (model: NonNullable<GenerationInput['model']>) => Promise<string | null>
  readRunInputDescription?: (workspaceId: string, runId: string) => Promise<WorkflowRuntimeParameterInspection | null>
  resolveImageSources?: (refs: import('./contract.ts').ImageRef[]) => Promise<import('./contract.ts').ImageSource[]>
  associatePromptPublication?: (task: Task, identity: WorkbenchIdentity) => Promise<void>
  preparePromptRequest?: (binding: import('./contract.ts').FunctionBinding, input: import('./contract.ts').TaskInput) => Promise<{ input: import('./request-template.ts').PromptRequestInput; requestText: string }>
  attachPromptTask?: (task: Task, sessionId: string, prepared: { input: import('./request-template.ts').PromptRequestInput; requestText: string }, requestId: string, delegated: boolean) => void
}
export interface CreateTaskRequest {
  requestId?: string; workspaceId: string; workId: string; branchId: string; functionId: string; taskDraft?: TaskRequestDraft; instructions?: string; referenceRunIds?: string[]
  runId?: string; evaluationDraft?: ReviewDraftUpdate; maxRuns?: number; title?: string; initiator?: 'human' | 'agent'; retryOfRunId?: string
}

export class WorkbenchService {
  readonly store: WorkbenchStore
  private readonly options: WorkbenchServiceOptions
  private readonly taskOperations = new Map<string, AbortController>()
  constructor(options: WorkbenchServiceOptions) { this.options = options; this.store = options.store }

  private async authorize(taskId: string, identity: WorkbenchIdentity): Promise<Task> {
    const task = this.store.getTask(taskId)
    if (!task.session_id || !await this.options.sessions.authorize({ task, identity })) throw new WorkbenchError('WORKBENCH_ACCESS_DENIED', '当前执行会话无权访问此任务。请核对 task_id，并在该任务的执行会话中调用。', 'task_id')
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

  private existingRequest(request: CreateTaskRequest, requestId: string): Task | null {
    const previous = this.store.findTask(requestId)
    if (!previous) return null
    const submitted = JSON.parse(JSON.stringify(request)) as JsonValue
    if (!equalValue(this.store.getTaskSubmission(requestId), submitted)) throw new WorkbenchError('WORKBENCH_REQUEST_CONFLICT', '请求 ID 已用于其他输入，请为本次调用生成新的请求 ID。', 'requestId')
    return previous
  }

  async createTask(request: CreateTaskRequest): Promise<Task> {
    this.store.assertScope(request.workspaceId, request.workId, request.branchId)
    const requestId = request.requestId ?? randomUUID()
    const previous = this.existingRequest(request, requestId)
    if (previous) return previous
    const branch = this.store.getBranch(request.branchId)
    const { instructions: _branchInstructions, ...branchDraft } = branch.draft
    const binding = this.store.getFunctionBinding(request.workspaceId, request.functionId)
    if (binding.kind === 'translate') throw new WorkbenchError('WORKBENCH_FUNCTION_NOT_TASK', '请通过提示词翻译入口使用此功能。', 'function_id')
    const submittedDraft = request.taskDraft === undefined ? undefined : contracts.parse('taskRequestDraft', 'input', request.taskDraft)
    const taskDraft = submittedDraft ?? this.store.getTaskDraft(branch.branch_id, binding.function_id)
    const descriptor = this.options.descriptors.find(item => item.kind === binding.kind)
    if (!descriptor) throw new WorkbenchError('WORKBENCH_FUNCTION_NOT_FOUND', '功能类型不可用，请在配置中心重新选择。', 'function_id')
    const reviewTarget = isRunReviewFunctionKind(binding.kind)
    const referenceRunIds = [...new Set([...(branch.draft.reference_run_ids ?? []), ...request.referenceRunIds ?? []])]
    let acceptedReview: ReviewDraft | undefined
    let evaluationInput: EvaluationInput | undefined
    if (reviewTarget) {
      const update = contracts.parse('reviewDraftUpdate', 'input', request.evaluationDraft)
      const runId = request.runId ?? ''
      const run = this.store.assertReviewRun(request.workspaceId, request.workId, runId)
      if (binding.kind === 'diagnose' && run.status !== 'failed' && run.status !== 'cancelled') throw new WorkbenchError('WORKBENCH_FAILED_RUN_REQUIRED', '请选择失败或已取消的运行后诊断。', 'input.evaluation_input.run_id')
      evaluationInput = { run_id: runId, verdict: update.draft.verdict, observation: update.draft.observation, conclusion: update.draft.conclusion, experience: { title: update.draft.title, conditions: update.draft.conditions, note: update.draft.note } }
      contracts.parse('taskInputForKind', 'input', { kind: binding.kind, value: { ...branchDraft, requirements: { original_request: branch.original_request, instructions: '' }, reference_run_ids: referenceRunIds, reference_task_artifacts: [], requested_skill: binding.requested_skill, max_runs: 0, evaluation_input: evaluationInput } })
      for (const id of referenceRunIds) { const run = this.store.getRun(id); if (!['succeeded', 'failed', 'cancelled'].includes(run.status)) throw new WorkbenchError('WORKBENCH_RUN_NOT_FINISHED', '请等待参考运行结束。', 'reference_run_ids') }
      acceptedReview = this.store.saveRunReviewDraft({ workspaceId: request.workspaceId, workId: request.workId, runId, ...update })
    }
    let draft = branch.draft
    let selectedResources: ResourceSnapshot[] | undefined
    if (evaluationInput) {
      const historical = await this.getRunInput({ workspaceId: request.workspaceId, workId: request.workId, runId: evaluationInput.run_id })
      draft = { ...taskDraftFromRunInput(historical, branch.draft), base_model_id: null }
      selectedResources = historical.selected_resources ?? []
    }
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
      if (!referenceRunIds.includes(source.run_id)) referenceRunIds.push(source.run_id)
      const input = await this.getRunInput({ workspaceId: request.workspaceId, workId: request.workId, runId: source.run_id })
      draft = await this.mappedRunDraft(input)
      selectedResources = input.selected_resources ?? []
    }
    if (isBranchNonGenerationTaskKind(binding.kind) && draft.parameter_mapping === null && this.options.resolveParameterMapping) {
      draft = { ...draft, parameter_mapping: await this.options.resolveParameterMapping(draft.generation_input) }
    }
    const { instructions: _draftInstructions, ...fixedDraft } = draft
    const input = { ...fixedDraft, selected_resources: selectedResources ?? await this.options.resolveSelectedResources?.(draft) ?? [], requirements: { original_request: branch.original_request, instructions: submittedDraft ? submittedDraft.instructions.trim() : request.instructions ?? taskDraft?.instructions ?? draft.instructions }, reference_run_ids: referenceRunIds, reference_task_artifacts: [], requested_skill: binding.requested_skill, max_runs: binding.kind === 'run' ? 1 : binding.kind === 'experiment' ? request.maxRuns ?? branch.execution.max_runs : 0, ...(evaluationInput ? { evaluation_input: evaluationInput } : {}) }
    if (binding.kind === 'run' || binding.kind === 'experiment') {
      if (this.options.prepareGenerationInput && !request.retryOfRunId) input.generation_input = await this.options.prepareGenerationInput(draft)
      await this.options.validateGenerationInput?.(generationInputWithImages(input.generation_input, input), 'input.generation_input')
    }
    const output = structuredClone(descriptor.output_contract)
    if (binding.kind === 'parameters') {
      if (!input.generation_input.instance_id || !input.generation_input.template_id) throw new WorkbenchError('WORKBENCH_TEMPLATE_REQUIRED', '请先选择实例和 Workflow 模板。', 'input.generation_input')
      output.parameter_ids = await this.options.parameterIds?.(input.generation_input) ?? []
    }
    const target = reviewTarget ? { kind: 'run_review' as const, id: evaluationInput!.run_id, expected: {} as Record<string, JsonValue> } : { kind: 'branch' as const, id: branch.branch_id, expected: {} as Record<string, JsonValue> }
    if (reviewTarget) {
      const draft = acceptedReview!
      const fields = binding.kind === 'experience' ? ['title', 'conditions', 'note', 'evidence_run_ids', 'experience_artifact_id'] : ['observation', 'conclusion', 'evidence_run_ids', 'review_artifact_id']
      for (const field of fields) target.expected[field] = jsonValue(draft[field as keyof typeof draft])
    } else if (binding.kind === 'prompt') {
      target.expected = { 'prompt_input.positive_prompt': branch.draft.prompt_input.positive_prompt, 'prompt_input.negative_prompt': branch.draft.prompt_input.negative_prompt }
    } else if (binding.kind === 'parameters') {
      target.expected['generation_input.parameters'] = jsonValue(draft.generation_input.parameters)
    }
    const prompt = binding.kind === 'prompt' ? await this.options.preparePromptRequest?.(binding, input) : undefined
    const accepted = this.existingRequest(request, requestId)
    if (accepted) return accepted
    const task = this.store.createTask({ taskId: requestId, submissionInput: JSON.parse(JSON.stringify(request)) as JsonValue, ...(prompt ? { requestText: prompt.requestText } : {}), branchId: branch.branch_id, functionId: binding.function_id, title: request.title ?? `${binding.name} · ${branch.name}`, kind: binding.kind, input, outputContract: output, applyTarget: target, bindingSnapshot: { function_id: binding.function_id, name: binding.name, kind: binding.kind, preset_id: binding.preset_id, agentModel: binding.agent_model, requested_skill: binding.requested_skill, request_template: binding.request_template, ...(binding.request_parts ? { request_parts: binding.request_parts } : {}) }, initiator: request.initiator, retryOfRunId: request.retryOfRunId })
    return this.withTaskOperation(task.task_id, async signal => {
      try {
        const session = await this.options.sessions.create({ task, presetId: task.binding_snapshot.preset_id, agentModel: task.binding_snapshot.agentModel, requestedSkill: task.binding_snapshot.requested_skill, onCreated: sessionId => { this.store.bindSession(task.task_id, sessionId, jsonValue(task.binding_snapshot.agentModel) as Record<string, JsonValue>) } })
        this.store.bindSession(task.task_id, session.sessionId, session.selectedModel)
        if (prompt) this.options.attachPromptTask?.(this.store.getTask(task.task_id), session.sessionId, prompt, requestId, false)
        if (signal.aborted) return
        if (!this.dispatchIsOpen(task.task_id)) return this.stopClosedDispatch(task.task_id, session.sessionId, signal)
        await this.options.sessions.dispatch({ sessionId: session.sessionId, text: task.request_text, taskId: task.task_id, requestId, signal })
        if (signal.aborted) return
        if (!this.dispatchIsOpen(task.task_id)) return this.stopClosedDispatch(task.task_id, session.sessionId, signal)
        this.store.completeTaskSubmission(task.task_id, taskDraft, binding.kind === 'parameters' ? { expected: branch.draft, draft } : undefined)
        this.store.settleTaskDispatch(task.task_id)
      } catch (error) {
        if (!signal.aborted) this.store.settleTaskDispatch(task.task_id, this.dispatchError(error))
        throw error
      }
    })
  }

  async listFunctions(request: { taskId: string }, identity: WorkbenchIdentity) {
    const parent = await this.authorize(request.taskId, identity)
    if (parent.kind !== 'experiment') throw new WorkbenchError('WORKBENCH_EXPERIMENT_REQUIRED', '请提供持续实验任务 ID。', 'task_id')
    return {
      task_id: parent.task_id,
      functions: this.store.listFunctionBindings(this.store.taskWorkspace(parent.task_id)).filter(isDelegatable).map(binding => {
        const descriptor = this.options.descriptors.find(item => item.kind === binding.kind)!
        return { function_id: binding.function_id, name: binding.name, kind: binding.kind, purpose: descriptor.ui_result, artifact_types: descriptor.output_contract.artifact_types, preset_id: binding.preset_id, agent_model: binding.agent_model }
      }),
    }
  }

  async delegateFunction(request: DelegateFunctionRequest, identity: WorkbenchIdentity, callerSignal?: AbortSignal) {
    const parent = await this.authorize(request.task_id, identity)
    if (parent.kind !== 'experiment' || parent.parent_experiment_task_id) throw new WorkbenchError('WORKBENCH_EXPERIMENT_REQUIRED', '请提供持续实验任务 ID。', 'task_id')
    if (!this.options.sessions.delegate) throw new WorkbenchError('WORKBENCH_DELEGATION_UNAVAILABLE', '当前宿主无法委派功能，请重新载入插件。', 'function_id')
    const workspaceId = this.store.taskWorkspace(parent.task_id)
    const binding = this.store.getFunctionBinding(workspaceId, request.function_id)
    if (!isDelegatable(binding)) throw new WorkbenchError('WORKBENCH_FUNCTION_NOT_DELEGATABLE', '请选择功能清单中的业务功能。', 'function_id')
    if (!this.dispatchIsOpen(parent.task_id, binding.kind)) throw new WorkbenchError('WORKBENCH_EXPERIMENT_CLOSED', '持续实验已暂停或结束，请在工作台查看实验状态。', 'task_id')
    const input = structuredClone(parent.input)
    input.delegation_source = request.source
    input.requirements.instructions = request.instructions
    input.requested_skill = binding.requested_skill
    input.max_runs = binding.kind === 'run' ? 1 : 0
    delete input.evaluation_input
    if (request.source.type === 'candidate') {
      const source = request.source
      const candidate = this.store.listExperimentArtifacts(parent.task_id).find(item => item.artifact_id === source.artifact_id)
      if (!candidate || candidate.artifact.type !== 'generation_input') throw new WorkbenchError('WORKBENCH_CANDIDATE_REQUIRED', '请选择此实验的候选输入产物。', 'source.artifact_id')
      input.generation_input = structuredClone(candidate.artifact.generation_input)
      input.image_refs = structuredClone(candidate.artifact.image_refs ?? [])
      input.workflow_image_bindings = structuredClone(candidate.artifact.workflow_image_bindings ?? [])
      input.prompt_resource_refs = structuredClone(candidate.artifact.prompt_resource_refs ?? [])
      input.selected_resources = structuredClone(candidate.artifact.selected_resources ?? [])
      const resolved = await this.options.resolveGenerationDraft?.(generationInputWithImages(input.generation_input, input))
      input.parameter_mapping = resolved?.parameter_mapping ?? null
      input.prompt_input = resolved?.prompt_input ?? { positive_prompt: null, negative_prompt: null }
      input.base_model_id = resolved?.base_model_id ?? null
    } else if (request.source.type === 'run') {
      const run = this.store.getRun(request.source.run_id)
      if (run.workbench_task_id !== parent.task_id) throw new WorkbenchError('WORKBENCH_RUN_SCOPE_MISMATCH', '请选择此实验中的运行。', 'source.run_id')
      const historical = await this.getRunInput({ workspaceId, workId: this.store.getBranch(parent.branch_id).work_id, runId: run.run_id })
      const { instructions: _instructions, ...fixed } = await this.mappedRunDraft(historical)
      Object.assign(input, fixed, { selected_resources: historical.selected_resources, reference_task_ids: parent.input.reference_task_ids, reference_experiences: parent.input.reference_experiences })
      input.reference_run_ids = [...new Set([...parent.input.reference_run_ids, run.run_id])]
      if (isRunReviewFunctionKind(binding.kind)) {
        input.evaluation_input = { run_id: run.run_id, verdict: 'unrated', observation: '', conclusion: '', experience: { title: '', conditions: '', note: '' } }
      }
    }
    if (isRunReviewFunctionKind(binding.kind) && !input.evaluation_input) throw new WorkbenchError('WORKBENCH_RUN_REQUIRED', '评价、诊断或整理经验时，请指定运行来源。', 'source')
    input.reference_task_artifacts = [...parent.input.reference_task_artifacts, ...request.reference_artifact_ids.map(id => {
      const stored = this.store.getArtifact(id)
      return { task_id: stored.task_id, artifact_id: stored.artifact_id, artifact: stored.artifact }
    })]
    const descriptor = this.options.descriptors.find(item => item.kind === binding.kind)!
    const output = { ...structuredClone(descriptor.output_contract), apply_mode: 'record' as const }
    if (binding.kind === 'parameters') output.parameter_ids = await this.options.parameterIds?.(input.generation_input) ?? []
    if (binding.kind === 'run') await this.options.validateGenerationInput?.(generationInputWithImages(input.generation_input, input), 'input.generation_input')
    const prompt = binding.kind === 'prompt' ? await this.options.preparePromptRequest?.(binding, input) : undefined
    const child = this.store.createTask({
      ...(prompt ? { requestText: prompt.requestText } : {}),
      branchId: parent.branch_id, parentExperimentTaskId: parent.task_id, functionId: binding.function_id,
      kind: binding.kind, title: binding.name, input, outputContract: output,
      applyTarget: { kind: 'branch', id: parent.branch_id, expected: {} },
      bindingSnapshot: { function_id: binding.function_id, name: binding.name, kind: binding.kind, preset_id: binding.preset_id, agentModel: binding.agent_model, requested_skill: binding.requested_skill, request_template: binding.request_template, ...(binding.request_parts ? { request_parts: binding.request_parts } : {}) },
      initiator: 'agent',
    })
    const sessionId = randomUUID()
    this.store.bindSession(child.task_id, sessionId, jsonValue(binding.agent_model) as Record<string, JsonValue>)
    if (prompt) this.options.attachPromptTask?.(child, sessionId, prompt, randomUUID(), true)
    const settled = await this.withTaskOperation(child.task_id, async operationSignal => {
      const signal = callerSignal ? AbortSignal.any([operationSignal, callerSignal]) : operationSignal
      try {
        signal.throwIfAborted()
        if (!this.dispatchIsOpen(child.task_id)) throw new WorkbenchError('WORKBENCH_EXPERIMENT_CLOSED', '持续实验已暂停或结束，请在工作台查看实验状态。', 'task_id')
        await this.options.sessions.delegate!({ parentSessionId: identity.sessionId, sessionId, taskId: child.task_id, label: binding.name, text: child.request_text, presetId: binding.preset_id, agentModel: binding.agent_model, requestedSkill: binding.requested_skill, signal })
        if (!this.dispatchIsOpen(child.task_id)) await this.options.sessions.control?.({ sessionId, action: 'interrupt', signal })
        this.store.settleTaskDispatch(child.task_id)
      } catch (error) {
        this.store.settleTaskDispatch(child.task_id, this.dispatchError(error))
        throw error
      }
    })
    return { task_id: child.task_id, parent_experiment_task_id: parent.task_id, session_id: sessionId, function_id: binding.function_id, status: settled.status }
  }
  taskWorkspace(taskId: string): string { return this.store.taskWorkspace(taskId) }
  queryRecords(query: import('./contract.ts').WorkbenchRecordQuery): import('./contract.ts').WorkbenchRecord[] { return this.store.queryRecords(query) }
  async saveRunReview(request: ReviewDraftUpdate & { workspaceId: string; workId: string; runId: string; saveExperience?: boolean }) {
    this.store.assertScope(request.workspaceId, request.workId)
    const run = this.store.getRun(request.runId)
    const model = run.generation_input.model
    const modelScope = { model, base_model_id: request.saveExperience && model ? await this.options.resolveRunModelBaseId?.(model) ?? null : null }
    return this.store.saveRunReview({ ...request, modelScope })
  }

  private async mappedRunDraft(input: WorkbenchRunInput): Promise<TaskDraft> {
    const draft = taskDraftFromRunInput(input)
    draft.base_model_id ??= input.generation_input.model ? await this.options.resolveRunModelBaseId?.(input.generation_input.model) ?? null : null
    return draft
  }

  async getRunInput(request: { workspaceId: string; workId: string; runId: string }): Promise<WorkbenchRunInput> {
    this.store.assertScope(request.workspaceId, request.workId)
    const run = this.store.getRun(request.runId)
    const task = this.store.getTask(run.workbench_task_id)
    const description = await this.options.readRunInputDescription?.(this.store.taskWorkspace(task.task_id), run.run_id) ?? null
    return contracts.parse('workbenchRunInput', 'output', { ...this.store.getRunInputs(run.run_id), selected_resources: run.selected_resources ?? [], prompt_resource_refs: promptResourceRefs(run.selected_resources ?? []), parameter_mapping: description ? parameterMapping(flattenWorkflowRuntimeParameters(description)) : null, base_model_id: runBaseModelId(run, task), run_id: run.run_id, branch_id: task.branch_id, generation_input: run.generation_input, image_refs: run.generation_input.image_refs ?? [], workflow_image_bindings: run.generation_input.workflow_image_bindings ?? [], input_description: description, prompt_input: readSavedPromptInput(run.generation_input, description?.parameters ?? []) })
  }

  async getTask(request: { taskId: string }, identity: WorkbenchIdentity): Promise<TaskGetResult> {
    void identity
    const task = this.store.getTask(request.taskId)
    const artifacts = task.kind === 'experiment' ? this.store.listExperimentArtifacts(task.task_id) : this.store.listArtifacts(task.task_id)
    const { parameter_mapping, ...input } = task.input
    const children = this.store.listChildTasks(task.task_id)
    const result = { task_id: task.task_id, parent_experiment_task_id: task.parent_experiment_task_id, children: children.map(child => ({ task_id: child.task_id, function_id: child.function_id, kind: child.kind, title: child.title, status: child.status, session_id: child.session_id, execution_state: child.execution_state, preset_id: child.binding_snapshot.preset_id, agent_model: child.binding_snapshot.agentModel, error: child.error })), status: task.status, ...input, image_sources: await this.options.resolveImageSources?.(input.image_refs) ?? [], output_contract: task.output_contract, artifacts: artifacts.map(a => ({ artifact_id: a.artifact_id, task_id: a.task_id, artifact: a.artifact, disposition: a.disposition })), iterations: this.store.listRuns(task.task_id).map(run => {
      return { index: run.iteration_index ?? 1, run_id: run.run_id, execution_task_id: run.execution_task_id, generation_input: run.generation_input, image_refs: run.generation_input.image_refs ?? [], workflow_image_bindings: run.generation_input.workflow_image_bindings ?? [], selected_resources: run.selected_resources ?? [], prompt_resource_refs: promptResourceRefs(run.selected_resources ?? []), review_artifact_id: run.review_artifact_id }
    }), answers: [...task.answers, ...children.flatMap(child => child.answers)] }
    if (!isBranchNonGenerationTaskKind(task.kind)) return { ...result, kind: task.kind }
    const parameters: [string, JsonValue][] = [], unresolved: [string, JsonValue][] = []
    for (const [id, value] of Object.entries(input.generation_input.parameters)) {
      const kind = parameter_mapping && Object.hasOwn(parameter_mapping, id) ? parameter_mapping[id] : undefined
      if (kind === 'positive_prompt' || kind === 'negative_prompt') {
        if (input.prompt_input[kind] === null) unresolved.push([id, value])
      } else if (kind) parameters.push([id, value])
      else unresolved.push([id, value])
    }
    return { ...result, kind: task.kind, generation_input: { ...input.generation_input, parameters: Object.fromEntries(parameters) }, unresolved_parameters: Object.fromEntries(unresolved) }
  }
  async publish(request: { taskId: string; artifact: unknown }, identity: WorkbenchIdentity) {
    const task = await this.authorize(request.taskId, identity)
    const artifact = contracts.parse('taskArtifact', 'input', request.artifact)
    this.store.validateArtifactForTask(task, artifact)
    const candidate = artifact.type === 'generation_input' ? artifact : artifact.type === 'review' ? artifact.candidate : undefined
    if (candidate) {
      await this.options.validateGenerationInput?.(generationInputWithImages(candidate.generation_input, candidate), artifact.type === 'generation_input' ? 'artifact.generation_input' : 'artifact.candidate.generation_input')
      candidate.selected_resources = await this.options.resolveSelectedResources?.({ generation_input: candidate.generation_input, prompt_resource_refs: candidate.prompt_resource_refs ?? [] }) ?? []
    }
    if (artifact.type === 'parameters') await this.options.validateParameters?.(task.input.generation_input, artifact.parameters, 'artifact.parameters')
    if (artifact.type === 'resources') await this.options.validateResourceRefs?.(artifact.refs, 'artifact.refs')
    const refs = await this.options.sessions.skillReadRefs?.({ sessionId: identity.sessionId }) ?? []
    if (artifact.type === 'prompt') await this.options.associatePromptPublication?.(task, identity)
    return this.store.publish(task.task_id, artifact, identity, refs)
  }
  async adoptArtifact(request: { artifactId: string; expected: Record<string, JsonValue>; candidate?: boolean }) {
    const stored = this.store.getArtifact(request.artifactId)
    const task = this.store.getTask(stored.task_id)
    const artifact = stored.artifact
    let resolvedDraft: TaskDraft | undefined
    if (artifact.type === 'resources' && this.options.resolveResourceRefs) {
      const branch = this.store.getBranch(task.branch_id)
      resolvedDraft = await this.options.resolveResourceRefs(artifact.refs, branch.editing_draft ?? branch.draft)
    }
    const generation = artifact.type === 'generation_input' ? artifact : artifact.type === 'review' && request.candidate ? artifact.candidate : undefined
    if (generation && this.options.resolveGenerationDraft) resolvedDraft = { ...await this.options.resolveGenerationDraft(generationInputWithImages(generation.generation_input, generation)), prompt_resource_refs: structuredClone(generation.prompt_resource_refs ?? []) }
    if (artifact.type === 'parameters') await this.options.validateParameters?.(task.input.generation_input, artifact.parameters, 'artifact.parameters')
    return this.store.adoptArtifact({ ...request, resolvedDraft })
  }

  async createBranchFromRun(request: { workspaceId: string; workId: string; runId: string; name: string; originalRequest: string }) {
    const input = await this.getRunInput(request)
    const draft = await this.mappedRunDraft(input)
    const source = this.store.getBranch(input.branch_id)
    const parent = source.work_id === request.workId ? source : this.store.listBranches(request.workId).find(branch => branch.parent_branch_id === null)!
    return this.store.createBranch({ workId: request.workId, parentBranchId: parent.branch_id, sourceRunId: input.run_id, name: request.name, originalRequest: request.originalRequest, draft })
  }

  async createBranchFromExperience(request: ExperienceReuseInput & { workspaceId: string; workId: string; experienceId: string }) {
    this.store.assertScope(request.workspaceId, request.workId)
    const experience = this.store.getExperience(request.experienceId)
    const destination = this.store.listBranches(request.workId).find(branch => branch.parent_branch_id === null)!
    const input = experience.source_run_id ? await this.getRunInput({ ...request, runId: experience.source_run_id }) : null
    let draft: TaskDraft = input ? { ...await this.mappedRunDraft(input), base_model_id: experience.base_model_id } : structuredClone(destination.draft)
    draft.reference_task_ids = []
    draft.reference_run_ids = []
    draft.reference_experiences = [{ experience_id: experience.experience_id, title: experience.title, conditions: experience.conditions, note: experience.note, provenance: experience.provenance }]
    if (request.baseModelId !== null && request.baseModelId !== draft.base_model_id) {
      if (!this.options.resolveBaseModelDraft) {
        const error = libraryConfig.errors.baseModelAdapterUnavailable
        throw new WorkbenchError(error.code, error.message, error.path)
      }
      draft = await this.options.resolveBaseModelDraft(request.baseModelId, draft)
    }
    const source = input ? this.store.getBranch(input.branch_id) : destination
    return this.store.createBranch({ workId: request.workId, parentBranchId: source.work_id === request.workId ? source.branch_id : destination.branch_id, ...(input ? { sourceRunId: input.run_id } : {}), sourceExperienceId: experience.experience_id, name: request.name, originalRequest: source.original_request, draft })
  }

  async createBranchFromArtifact(request: { workspaceId: string; workId: string; artifactId: string; name: string }) {
    const stored = this.store.getArtifact(request.artifactId)
    const task = this.store.getTask(stored.task_id)
    this.store.assertScope(request.workspaceId, request.workId)
    const { requirements: _requirements, reference_task_artifacts: _artifacts, requested_skill: _skill, max_runs: _maxRuns, evaluation_input: _evaluation, selected_resources: _selectedResources, ...savedDraft } = task.input
    let draft: TaskDraft = { ...structuredClone(savedDraft), instructions: task.input.requirements.instructions }
    if (stored.artifact.type === 'prompt') {
      draft.prompt_input = { positive_prompt: stored.artifact.positive_prompt, negative_prompt: stored.artifact.negative_prompt }
    } else if (stored.artifact.type === 'parameters') {
      Object.assign(draft.generation_input.parameters, stored.artifact.parameters)
    } else if (stored.artifact.type === 'generation_input' || stored.artifact.type === 'review' && stored.artifact.candidate) {
      const generation = stored.artifact.type === 'generation_input' ? stored.artifact : stored.artifact.candidate!
      if (!this.options.resolveGenerationDraft) throw new WorkbenchError('WORKBENCH_INPUT_RESOLUTION_REQUIRED', '当前无法解析生成输入。请重新打开工作台后，再点击“从产物创建分支”。', 'artifact_id')
      draft = { ...await this.options.resolveGenerationDraft(generationInputWithImages(generation.generation_input, generation)), prompt_resource_refs: structuredClone(generation.prompt_resource_refs ?? []) }
    } else throw new WorkbenchError('WORKBENCH_INVALID_INPUT', '请选择提示词、参数、生成输入或包含建议输入的评价产物创建分支。', 'artifact_id')
    const source = this.store.getBranch(task.branch_id)
    const parent = source.work_id === request.workId ? source : this.store.listBranches(request.workId).find(branch => branch.parent_branch_id === null)!
    return this.store.createBranch({ workId: request.workId, parentBranchId: parent.branch_id, name: request.name, originalRequest: task.input.requirements.original_request, draft, sourceArtifactId: stored.artifact_id })
  }
  getProjection(request: { workspaceId: string; workId?: string; branchId?: string }) {
    const projection = this.store.getProjection(request)
    const order = new Map(this.options.descriptors.map((descriptor, index) => [descriptor.kind, index]))
    const position = (binding: typeof projection.functions[number]) => binding.builtin ? order.get(binding.kind) ?? order.size : order.size
    projection.functions.sort((a, b) => position(a) - position(b))
    return projection
  }
  private async withTaskOperation(taskId: string, run: (signal: AbortSignal) => Promise<void>): Promise<Task> {
    const operation = new AbortController()
    this.taskOperations.get(taskId)?.abort()
    this.taskOperations.set(taskId, operation)
    try { await run(operation.signal) }
    catch (error) { if (!operation.signal.aborted) throw error }
    finally { if (this.taskOperations.get(taskId) === operation) this.taskOperations.delete(taskId) }
    return this.store.refreshTask(taskId)
  }

  async replyTask(request: { taskId: string; questionArtifactId: string; answer: string }): Promise<Task> {
    const task = this.store.replyTask(request.taskId, request.questionArtifactId, request.answer)
    if (!task.session_id) throw new WorkbenchError('WORKBENCH_SESSION_REQUIRED', '任务尚未创建执行会话，请查看任务状态与错误。', 'task_id')
    if (!this.dispatchIsOpen(task.task_id)) return this.store.refreshTask(task.task_id)
    return this.withTaskOperation(task.task_id, async signal => {
      await this.options.sessions.dispatch({ sessionId: task.session_id!, text: task.request_text, taskId: task.task_id, signal })
      if (signal.aborted) return
      if (!this.dispatchIsOpen(task.task_id)) return this.stopClosedDispatch(task.task_id, task.session_id!, signal)
      this.store.settleTaskDispatch(task.task_id)
    })
  }
  private dispatchIsOpen(taskId: string, functionKind?: Task['kind']): boolean {
    const task = this.store.refreshTask(taskId)
    const experiment = this.store.getExperiment(task.parent_experiment_task_id ?? taskId)
    const maySummarize = (functionKind ?? task.kind) === 'experience' && (experiment?.control_state === 'completed' || experiment?.end_reason === 'goal_met')
    return task.execution_state !== 'interrupted' && (!experiment || experiment.control_state === 'running' || maySummarize)
  }

  private async stopClosedDispatch(taskId: string, sessionId: string, signal: AbortSignal): Promise<void> {
    const experiment = this.store.getExperiment(taskId)
    await this.options.sessions.control?.({ sessionId, action: experiment?.control_state === 'paused' ? 'pause' : 'interrupt', signal })
  }

  private dispatchError(error: unknown): NonNullable<Task['error']> {
    return { code: (error instanceof WorkbenchError || error instanceof ContractError) ? error.code : experimentControlErrors.dispatchFailureCode, message: error instanceof Error ? error.message : String(error) }
  }

  async controlTask(request: { taskId: string; action: 'interrupt' | 'pause' | 'continue' }): Promise<Task> {
    const task = this.store.getTask(request.taskId)
    if (request.action === 'pause' && task.kind !== 'experiment') throw new WorkbenchError('WORKBENCH_INVALID_INPUT', '请选择持续实验任务后暂停。', 'action')
    if (!task.session_id && (task.kind !== 'experiment' || request.action === 'continue')) throw new WorkbenchError('WORKBENCH_SESSION_REQUIRED', '任务尚未创建执行会话，请查看任务状态与错误。', 'task_id')
    this.store.controlTask(task.task_id, request.action)
    return this.withTaskOperation(task.task_id, async signal => {
      try {
        if (task.session_id) await this.options.sessions.control?.({ sessionId: task.session_id, action: request.action, signal })
        if (signal.aborted || request.action !== 'continue') return
        if (!this.dispatchIsOpen(task.task_id)) return this.stopClosedDispatch(task.task_id, task.session_id!, signal)
        await this.options.sessions.dispatch({ sessionId: task.session_id!, text: task.request_text, taskId: task.task_id, signal })
        if (signal.aborted) return
        if (!this.dispatchIsOpen(task.task_id)) return this.stopClosedDispatch(task.task_id, task.session_id!, signal)
        this.store.settleTaskDispatch(task.task_id)
      } catch (error) {
        if (!signal.aborted && request.action === 'continue') this.store.settleTaskDispatch(task.task_id, this.dispatchError(error), true)
        throw error
      }
    })
  }
  async endExperiment(request: { taskId: string; reason: 'goal_met' | 'user_ended' }, caller: WorkbenchIdentity | { workspaceId: string; workId: string }) {
    const task = this.store.getTask(request.taskId)
    if ('sessionId' in caller) await this.authorize(request.taskId, caller)
    else this.store.assertScope(caller.workspaceId, caller.workId, task.branch_id)
    this.store.endExperiment(request.taskId, request.reason)
    await this.withTaskOperation(task.task_id, async signal => {
      if (!('sessionId' in caller) && task.session_id) await this.options.sessions.control?.({ sessionId: task.session_id, action: 'interrupt', signal })
    })
    return this.store.getExperiment(request.taskId)!
  }
}

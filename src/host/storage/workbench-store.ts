import { randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import type { GenerationRequest } from '../../generation/submission-contract.ts'
import type { AgentModel, ApplyTarget, ArtifactPayload, BindingSnapshot, Branch, ExecutionDraft, ExecutionState, Experience, Experiment, Favorite, FunctionBinding, FunctionDescriptor, GenerationInput, JsonValue, OutputContract, PublishReceipt, ReviewDraft, SavedReview, SkillReadRef, StoredArtifact, Task, TaskDraft, TaskInput, Work, WorkbenchIdentity, WorkbenchProjection, WorkbenchRun } from '../../workbench/contract.ts'
import { equalValue, jsonValue, validateArtifact, validateFunctionBinding, validateTaskDraft, validateTaskInput, validateReviewDraft, WorkbenchError } from '../../workbench/validation.ts'
import { deriveTaskStatus, isFinishedRun } from '../../workbench/state.ts'
import { transaction } from './transaction.ts'

type Row = Record<string, unknown>
const parse = <T>(value: unknown): T => JSON.parse(String(value)) as T
const fail = (code: string, message: string, path = ''): never => { throw new WorkbenchError(code, message, path) }
export interface GenerationAcceptance {
  taskId: string | null; workspaceId: string; input: Omit<GenerationInput, 'loras'> & { readonly loras: readonly { readonly id: string; readonly file_name: string; readonly weight: number; readonly trigger_words: readonly string[] }[] }; runId?: string; reused: boolean
}
export interface GenerationAssociation { iterationIndex: number | null; candidateArtifactId: string | null; initiator: 'human' | 'agent' | null; retryOfRunId: string | null }
export interface NewTask {
  branchId: string; functionId: string; title: string; kind: Task['kind']; input: TaskInput; outputContract: OutputContract
  applyTarget: ApplyTarget; bindingSnapshot: BindingSnapshot; initiator?: 'human' | 'agent'; retryOfRunId?: string | null
}
export interface WorkbenchStoreOptions { database: DatabaseSync; artifactDirectory: string }

export class WorkbenchStore {
  readonly database: DatabaseSync
  readonly artifactDirectory: string

  constructor(options: WorkbenchStoreOptions) {
    this.database = options.database
    this.artifactDirectory = options.artifactDirectory
    this.database.exec('PRAGMA foreign_keys = ON')
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS workbench_works (work_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, goal TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS workbench_works_workspace ON workbench_works(workspace_id);
      CREATE TABLE IF NOT EXISTS workbench_branches (
        branch_id TEXT PRIMARY KEY, work_id TEXT NOT NULL REFERENCES workbench_works(work_id), parent_branch_id TEXT,
        name TEXT NOT NULL, original_request TEXT NOT NULL, source_run_id TEXT REFERENCES generation_runs(run_id),
        source_artifact_id TEXT REFERENCES workbench_task_artifacts(artifact_id), source_experience_id TEXT REFERENCES workbench_experiences(experience_id),
        draft_json TEXT NOT NULL, execution_json TEXT NOT NULL, UNIQUE(work_id,branch_id),
        FOREIGN KEY(work_id,parent_branch_id) REFERENCES workbench_branches(work_id,branch_id));
      CREATE UNIQUE INDEX IF NOT EXISTS workbench_main_branch ON workbench_branches(work_id) WHERE parent_branch_id IS NULL;
      CREATE TABLE IF NOT EXISTS workbench_function_bindings (
        workspace_id TEXT NOT NULL, function_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, builtin INTEGER NOT NULL,
        preset_id TEXT NOT NULL, agent_model_json TEXT NOT NULL, requested_skill TEXT, request_template TEXT NOT NULL, PRIMARY KEY(workspace_id,function_id));
      CREATE TABLE IF NOT EXISTS workbench_task_drafts (branch_id TEXT NOT NULL REFERENCES workbench_branches(branch_id), function_id TEXT NOT NULL, instructions TEXT NOT NULL, PRIMARY KEY(branch_id,function_id));
      CREATE TABLE IF NOT EXISTS workbench_tasks (
        task_id TEXT PRIMARY KEY, branch_id TEXT NOT NULL REFERENCES workbench_branches(branch_id), function_id TEXT NOT NULL, title TEXT NOT NULL,
        kind TEXT NOT NULL, status TEXT NOT NULL, input_json TEXT NOT NULL, output_contract_json TEXT NOT NULL, apply_target_json TEXT NOT NULL,
        binding_snapshot_json TEXT NOT NULL, session_id TEXT UNIQUE, request_text TEXT NOT NULL, selected_model_json TEXT, answers_json TEXT NOT NULL,
        error_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, execution_state TEXT NOT NULL, initiator TEXT NOT NULL, retry_of_run_id TEXT REFERENCES generation_runs(run_id));
      CREATE INDEX IF NOT EXISTS workbench_tasks_branch ON workbench_tasks(branch_id);
      CREATE TABLE IF NOT EXISTS workbench_task_artifacts (
        artifact_id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES workbench_tasks(task_id), type TEXT NOT NULL, payload_json TEXT NOT NULL,
        source_files_json TEXT NOT NULL, session_id TEXT NOT NULL, turn INTEGER NOT NULL, call_id TEXT NOT NULL, skill_refs_json TEXT NOT NULL,
        disposition TEXT NOT NULL, applied_target_json TEXT, created_at INTEGER NOT NULL, publish_receipt_json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS workbench_artifacts_task ON workbench_task_artifacts(task_id);
      CREATE TABLE IF NOT EXISTS workbench_experiments (task_id TEXT PRIMARY KEY REFERENCES workbench_tasks(task_id), control_state TEXT NOT NULL, end_reason TEXT);
      CREATE TABLE IF NOT EXISTS workbench_experiences (
        experience_id TEXT PRIMARY KEY, work_id TEXT NOT NULL, branch_id TEXT NOT NULL, task_id TEXT REFERENCES workbench_tasks(task_id), title TEXT NOT NULL,
        conditions TEXT NOT NULL, note TEXT NOT NULL, base_model_id TEXT, model_id TEXT, evidence_run_ids_json TEXT NOT NULL,
        source_run_id TEXT NOT NULL REFERENCES generation_runs(run_id), source_experience_id TEXT REFERENCES workbench_experiences(experience_id),
        source_artifact_id TEXT REFERENCES workbench_task_artifacts(artifact_id), FOREIGN KEY(work_id,branch_id) REFERENCES workbench_branches(work_id,branch_id));
      CREATE INDEX IF NOT EXISTS workbench_experiences_work ON workbench_experiences(work_id);
      CREATE TABLE IF NOT EXISTS workbench_favorites (target_type TEXT NOT NULL, target_id TEXT NOT NULL, PRIMARY KEY(target_type,target_id));
    `)
  }

  private rows(sql: string, ...args: (string | number | null)[]): Row[] { return this.database.prepare(sql).all(...args) as Row[] }
  private row(sql: string, ...args: (string | number | null)[]): Row | undefined { return this.database.prepare(sql).get(...args) as Row | undefined }
  private run(sql: string, ...args: (string | number | null)[]): void { this.database.prepare(sql).run(...args) }
  getWork(workId: string): Work { const row = this.row('SELECT * FROM workbench_works WHERE work_id=?', workId); return row ? row as unknown as Work : fail('WORKBENCH_NOT_FOUND', '工作不存在，请重新选择工作。', 'work_id') }
  listWorks(workspaceId: string): Work[] { return this.rows('SELECT * FROM workbench_works WHERE workspace_id=? ORDER BY rowid', workspaceId) as unknown as Work[] }
  assertScope(workspaceId: string, workId: string, branchId?: string): Work {
    const work = this.getWork(workId)
    if (work.workspace_id !== workspaceId) fail('WORKBENCH_SCOPE_MISMATCH', '请选择当前工作区的工作。', 'work_id')
    if (branchId && this.getBranch(branchId).work_id !== workId) fail('WORKBENCH_SCOPE_MISMATCH', '请选择当前工作的分支。', 'branch_id')
    return work
  }
  createWork(input: { workspaceId: string; name: string; goal: string; draft?: TaskDraft }): { work: Work; branch: Branch } {
    if (!input.workspaceId || !input.name.trim() || input.name.length > 40 || !input.goal.trim()) fail('WORKBENCH_INVALID_INPUT', '请填写工作区、工作名称和总目标；名称最多 40 字。')
    return transaction(this.database, () => {
      const work: Work = { work_id: randomUUID(), workspace_id: input.workspaceId, name: input.name, goal: input.goal }
      this.run('INSERT INTO workbench_works VALUES(?,?,?,?)', work.work_id, work.workspace_id, work.name, work.goal)
      const draft = input.draft ?? { prompt_input: { positive_prompt: '', negative_prompt: '' }, generation_input: { title: input.name, instance_id: null, template_id: null, model: null, parameters: {}, loras: [] }, context_refs: [], base_model_id: null }
      const branch = this.insertBranch({ workId: work.work_id, name: '主分支', originalRequest: input.goal, draft })
      return { work, branch }
    })
  }
  private insertBranch(input: { workId: string; name: string; originalRequest: string; draft: TaskDraft; parentBranchId?: string; sourceRunId?: string; sourceArtifactId?: string; sourceExperienceId?: string; execution?: ExecutionDraft }): Branch {
    this.getWork(input.workId)
    if (!input.name.trim() || input.name.length > 40 || !input.originalRequest.trim()) fail('WORKBENCH_INVALID_INPUT', '请填写分支名称和原始需求；名称最多 40 字。')
    if (input.parentBranchId && this.getBranch(input.parentBranchId).work_id !== input.workId) fail('WORKBENCH_SCOPE_MISMATCH', '父分支必须属于当前工作。')
    if (input.sourceRunId && input.sourceArtifactId) fail('WORKBENCH_INVALID_INPUT', '请选择一种分支输入来源。')
    if (input.sourceRunId) this.assertRunInWork(input.sourceRunId, input.workId)
    if (input.sourceArtifactId && this.getBranch(this.getTask(this.getArtifact(input.sourceArtifactId).task_id).branch_id).work_id !== input.workId) fail('WORKBENCH_SCOPE_MISMATCH', '产物必须属于当前工作。')
    if (input.sourceExperienceId && this.getExperience(input.sourceExperienceId).work_id !== input.workId) fail('WORKBENCH_SCOPE_MISMATCH', '经验必须属于当前工作。')
    const branch: Branch = { branch_id: randomUUID(), work_id: input.workId, parent_branch_id: input.parentBranchId ?? null, name: input.name, original_request: input.originalRequest, source_run_id: input.sourceRunId ?? null, source_artifact_id: input.sourceArtifactId ?? null, source_experience_id: input.sourceExperienceId ?? null, draft: validateTaskDraft(input.draft), execution: input.execution ?? { mode: 'once', max_runs: 3 } }
    this.run('INSERT INTO workbench_branches VALUES(?,?,?,?,?,?,?,?,?,?)', branch.branch_id, branch.work_id, branch.parent_branch_id, branch.name, branch.original_request, branch.source_run_id, branch.source_artifact_id, branch.source_experience_id, JSON.stringify(branch.draft), JSON.stringify(branch.execution))
    return branch
  }
  createBranch(input: Parameters<WorkbenchStore['insertBranch']>[0] & { parentBranchId: string }): Branch { return transaction(this.database, () => this.insertBranch(input)) }
  private branch(row: Row): Branch { const { draft_json, execution_json, ...rest } = row; return { ...rest, draft: parse(draft_json), execution: parse(execution_json) } as Branch }
  getBranch(branchId: string): Branch { const row = this.row('SELECT * FROM workbench_branches WHERE branch_id=?', branchId); return row ? this.branch(row) : fail('WORKBENCH_NOT_FOUND', '分支不存在，请重新选择分支。', 'branch_id') }
  listBranches(workId: string): Branch[] { return this.rows('SELECT * FROM workbench_branches WHERE work_id=? ORDER BY rowid', workId).map(row => this.branch(row)) }
  saveBranchDraft(input: { workspaceId: string; workId: string; branchId: string; expected: TaskDraft; draft: TaskDraft; originalRequest?: string; expectedOriginalRequest?: string; execution?: ExecutionDraft; name?: string; expectedName?: string }): Branch {
    return transaction(this.database, () => {
      this.assertScope(input.workspaceId, input.workId, input.branchId)
      const branch = this.getBranch(input.branchId)
      if (!equalValue(branch.draft, input.expected) || (input.originalRequest !== undefined && branch.original_request !== input.expectedOriginalRequest)) fail('WORKBENCH_EDIT_CONFLICT', '分支内容已改变，请刷新后重新保存。', 'expected')
      if (input.name !== undefined && (!input.name.trim() || input.name.length > 40)) fail('WORKBENCH_INVALID_INPUT', '请填写分支名称；名称最多 40 字。', 'name')
      if (input.name !== undefined && input.expectedName !== undefined && branch.name !== input.expectedName) fail('WORKBENCH_EDIT_CONFLICT', '分支名称已改变，请刷新后重新保存。', 'expectedName')
      if (input.originalRequest !== undefined && !input.originalRequest.trim()) fail('WORKBENCH_INVALID_INPUT', '请填写原始需求。', 'originalRequest')
      const draft = validateTaskDraft(input.draft)
      const execution = input.execution ?? branch.execution
      if (!['once', 'continuous'].includes(execution.mode) || !Number.isSafeInteger(execution.max_runs) || execution.max_runs < 1) fail('WORKBENCH_INVALID_INPUT', '请选择执行方式并填写正整数运行次数。', 'execution')
      this.run('UPDATE workbench_branches SET draft_json=?,original_request=?,execution_json=?,name=? WHERE branch_id=?', JSON.stringify(draft), input.originalRequest ?? branch.original_request, JSON.stringify(execution), input.name ?? branch.name, branch.branch_id)
      return this.getBranch(branch.branch_id)
    })
  }
  private binding(row: Row): FunctionBinding { const { agent_model_json, ...rest } = row; return { ...rest, builtin: Boolean(row.builtin), agent_model: parse(agent_model_json) } as FunctionBinding }
  listFunctionBindings(workspaceId: string): FunctionBinding[] { return this.rows('SELECT * FROM workbench_function_bindings WHERE workspace_id=? ORDER BY rowid', workspaceId).map(row => this.binding(row)) }
  getFunctionBinding(workspaceId: string, functionId: string): FunctionBinding { const row = this.row('SELECT * FROM workbench_function_bindings WHERE workspace_id=? AND function_id=?', workspaceId, functionId); return row ? this.binding(row) : fail('WORKBENCH_FUNCTION_NOT_FOUND', '功能已移除，请在配置中心选择功能。', 'function_id') }
  saveFunctionBinding(input: FunctionBinding): FunctionBinding {
    const value = validateFunctionBinding(input)
    this.run('INSERT INTO workbench_function_bindings VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id,function_id) DO UPDATE SET name=excluded.name,kind=excluded.kind,builtin=excluded.builtin,preset_id=excluded.preset_id,agent_model_json=excluded.agent_model_json,requested_skill=excluded.requested_skill,request_template=excluded.request_template', value.workspace_id, value.function_id, value.name, value.kind, Number(value.builtin), value.preset_id, JSON.stringify(value.agent_model), value.requested_skill, value.request_template)
    return value
  }
  ensureFunctionBindings(workspaceId: string, descriptors: readonly FunctionDescriptor[], defaults: { presetId: string; agentModel: AgentModel }): FunctionBinding[] {
    return transaction(this.database, () => {
      const existing = new Set(this.listFunctionBindings(workspaceId).map(binding => binding.function_id))
      for (const descriptor of descriptors) if (!existing.has(descriptor.kind)) this.saveFunctionBinding({ workspace_id: workspaceId, function_id: descriptor.kind, name: descriptor.name, kind: descriptor.kind, builtin: true, preset_id: defaults.presetId, agent_model: defaults.agentModel, requested_skill: null, request_template: descriptor.default_request_template })
      return this.listFunctionBindings(workspaceId)
    })
  }
  removeFunctionBinding(workspaceId: string, functionId: string): void {
    if (this.getFunctionBinding(workspaceId, functionId).builtin) fail('WORKBENCH_INVALID_INPUT', '内置功能请在配置中心编辑。')
    this.run('DELETE FROM workbench_function_bindings WHERE workspace_id=? AND function_id=?', workspaceId, functionId)
  }
  saveTaskInstructions(branchId: string, functionId: string, instructions: string): void {
    const branch = this.getBranch(branchId); this.getFunctionBinding(this.getWork(branch.work_id).workspace_id, functionId)
    this.run('INSERT INTO workbench_task_drafts VALUES(?,?,?) ON CONFLICT(branch_id,function_id) DO UPDATE SET instructions=excluded.instructions', branchId, functionId, instructions)
  }
  getTaskInstructions(branchId: string, functionId: string): string { return String(this.row('SELECT instructions FROM workbench_task_drafts WHERE branch_id=? AND function_id=?', branchId, functionId)?.instructions ?? '') }
  createTask(input: NewTask): Task {
    return transaction(this.database, () => {
      const branch = this.getBranch(input.branchId)
      const fixed = validateTaskInput(input.kind, input.input)
      for (const runId of fixed.reference_run_ids) this.assertRunInWork(runId, branch.work_id)
      if (input.applyTarget.kind === 'branch' ? input.applyTarget.id !== branch.branch_id : input.applyTarget.id !== fixed.evaluation_input?.run_id) fail('WORKBENCH_SCOPE_MISMATCH', '任务写入目标与固定输入不一致，请核对 apply_target 和任务固定输入后重试。', 'apply_target')
      if (input.retryOfRunId) { const source = this.assertRunInWork(input.retryOfRunId, branch.work_id); if (source.status !== 'failed' && source.status !== 'cancelled') fail('WORKBENCH_INVALID_INPUT', '请选择失败或已取消的运行重试。', 'retry_of_run_id') }
      const id = randomUUID(); const now = Date.now()
      const requestText = input.bindingSnapshot.request_template.replaceAll('{{task_id}}', id)
      this.run('INSERT INTO workbench_tasks VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, input.branchId, input.functionId, input.title, input.kind, 'pending', JSON.stringify(fixed), JSON.stringify(input.outputContract), JSON.stringify(input.applyTarget), JSON.stringify(input.bindingSnapshot), null, requestText, null, '[]', null, now, now, 'pending', input.initiator ?? 'human', input.retryOfRunId ?? null)
      if (input.kind === 'experiment') this.run('INSERT INTO workbench_experiments VALUES(?,?,?)', id, 'running', null)
      this.run('DELETE FROM workbench_task_drafts WHERE branch_id=? AND function_id=?', branch.branch_id, input.functionId)
      return this.getTask(id)
    })
  }
  private task(row: Row): Task {
    const { input_json, output_contract_json, apply_target_json, binding_snapshot_json, selected_model_json, answers_json, error_json, ...rest } = row
    return { ...rest, input: parse(input_json), output_contract: parse(output_contract_json), apply_target: parse(apply_target_json), binding_snapshot: parse(binding_snapshot_json), selected_model: selected_model_json ? parse(selected_model_json) : null, answers: parse(answers_json), error: error_json ? parse(error_json) : null } as Task
  }
  findTask(taskId: string): Task | null { const row = this.row('SELECT * FROM workbench_tasks WHERE task_id=?', taskId); return row ? this.task(row) : null }
  getTask(taskId: string): Task { return this.findTask(taskId) ?? fail('WORKBENCH_TASK_NOT_FOUND', '任务不存在，请核对 task_id。', 'task_id') }
  taskWorkspace(taskId: string): string { return this.getWork(this.getBranch(this.getTask(taskId).branch_id).work_id).workspace_id }
  listTasks(workspaceId: string, workId?: string, branchId?: string): Task[] {
    if (workId) this.assertScope(workspaceId, workId, branchId)
    return this.rows('SELECT t.* FROM workbench_tasks t JOIN workbench_branches b ON b.branch_id=t.branch_id JOIN workbench_works w ON w.work_id=b.work_id WHERE w.workspace_id=? AND (? IS NULL OR w.work_id=?) AND (? IS NULL OR b.branch_id=?) ORDER BY t.created_at,t.rowid', workspaceId, workId ?? null, workId ?? null, branchId ?? null, branchId ?? null).map(row => this.task(row))
  }
  bindSession(taskId: string, sessionId: string, selectedModel: Record<string, JsonValue>): Task {
    const task = this.getTask(taskId)
    if (task.session_id && task.session_id !== sessionId) fail('WORKBENCH_SESSION_CONFLICT', '任务已绑定执行会话，请在该任务的执行会话中继续。', 'session_id')
    this.run('UPDATE workbench_tasks SET session_id=?,selected_model_json=?,updated_at=? WHERE task_id=?', sessionId, JSON.stringify(selectedModel), Date.now(), taskId)
    return this.getTask(taskId)
  }
  markExecution(taskId: string, state: ExecutionState, error: Task['error'] = null): Task {
    this.getTask(taskId); this.run('UPDATE workbench_tasks SET execution_state=?,error_json=?,updated_at=? WHERE task_id=?', state, error ? JSON.stringify(error) : null, Date.now(), taskId); return this.refreshTask(taskId)
  }
  private artifact(row: Row): StoredArtifact {
    const { payload_json, source_files_json, skill_refs_json, applied_target_json, publish_receipt_json: _receipt, ...rest } = row
    return { ...rest, artifact: parse(payload_json), source_files: parse(source_files_json), skill_refs: parse(skill_refs_json), applied_target: applied_target_json ? parse(applied_target_json) : null } as StoredArtifact
  }
  getArtifact(artifactId: string): StoredArtifact { const row = this.row('SELECT * FROM workbench_task_artifacts WHERE artifact_id=?', artifactId); return row ? this.artifact(row) : fail('WORKBENCH_ARTIFACT_NOT_FOUND', '产物不存在，请刷新任务。', 'artifact_id') }
  listArtifacts(taskId: string): StoredArtifact[] { return this.rows('SELECT * FROM workbench_task_artifacts WHERE task_id=? ORDER BY created_at,rowid', taskId).map(row => this.artifact(row)) }
  private artifactPatch(task: Task, artifact: ArtifactPayload, candidate = false): Record<string, JsonValue> {
    if (artifact.type === 'prompt') return { 'prompt_input.positive_prompt': artifact.positive_prompt, 'prompt_input.negative_prompt': artifact.negative_prompt }
    if (artifact.type === 'parameters') return Object.fromEntries(Object.entries(artifact.parameters).map(([key, value]) => [`generation_input.parameters.${key}`, value]))
    if (artifact.type === 'generation_input') return { generation_input: jsonValue(artifact.generation_input), context_refs: jsonValue(artifact.context_refs) }
    if (artifact.type === 'review') return candidate && artifact.candidate ? { generation_input: jsonValue(artifact.candidate.generation_input), context_refs: jsonValue(artifact.candidate.context_refs) } : { observation: artifact.observation, conclusion: artifact.conclusion, evidence_run_ids: artifact.run_ids, review_artifact_id: null }
    if (artifact.type === 'experience') return { title: artifact.title, conditions: artifact.conditions, note: artifact.note, evidence_run_ids: artifact.run_ids, experience_artifact_id: null }
    if (artifact.type === 'resources') return { context_refs: jsonValue(artifact.refs) }
    return {}
  }
  targetValues(target: ApplyTarget): Record<string, JsonValue> {
    return target.kind === 'branch' ? jsonValue(this.getBranch(target.id).draft) as Record<string, JsonValue> : jsonValue(this.getRunReviewDraft(target.id)) as Record<string, JsonValue>
  }
  private field(value: Record<string, JsonValue>, path: string): JsonValue | undefined {
    if (path.startsWith('generation_input.parameters.')) {
      const generation = value.generation_input as Record<string, JsonValue> | undefined
      const parameters = generation?.parameters as Record<string, JsonValue> | undefined
      return parameters?.[path.slice('generation_input.parameters.'.length)]
    }
    let current: unknown = value
    for (const segment of path.split('.')) current = current && typeof current === 'object' ? (current as Record<string, unknown>)[segment] : undefined
    return current as JsonValue | undefined
  }
  private put(value: Record<string, JsonValue>, path: string, content: JsonValue): void {
    if (path.startsWith('generation_input.parameters.')) {
      const parameters = (value.generation_input as Record<string, JsonValue>).parameters as Record<string, JsonValue>
      Object.defineProperty(parameters, path.slice('generation_input.parameters.'.length), { value: content, enumerable: true, writable: true, configurable: true })
      return
    }
    const segments = path.split('.'); let current = value
    for (const key of segments.slice(0, -1)) { const next = current[key]; if (next === null || typeof next !== 'object' || Array.isArray(next)) current[key] = {}; current = current[key] as Record<string, JsonValue> }
    current[segments.at(-1)!] = content
  }
  private applyPatch(task: Task, patch: Record<string, JsonValue>, expected: Record<string, JsonValue>, target = task.apply_target): boolean {
    const current = this.targetValues(target)
    for (const key of Object.keys(patch)) {
      let expectedKey: string | undefined
      for (const field of Object.keys(expected)) if ((key === field || key.startsWith(`${field}.`)) && (!expectedKey || field.length > expectedKey.length)) expectedKey = field
      if (!expectedKey) return false
      const suffix = key.slice(expectedKey.length + 1)
      const baseline = key === expectedKey ? expected[expectedKey] : expectedKey === 'generation_input.parameters' ? (expected[expectedKey] as Record<string, JsonValue>)[suffix] : this.field({ value: expected[expectedKey]! }, `value.${suffix}`)
      if (!equalValue(this.field(current, key), baseline)) return false
    }
    for (const [key, value] of Object.entries(patch)) this.put(current, key, value)
    if (target.kind === 'branch') this.run('UPDATE workbench_branches SET draft_json=? WHERE branch_id=?', JSON.stringify(current), target.id)
    else this.run('UPDATE generation_runs SET review_draft_json=? WHERE run_id=?', JSON.stringify(current), target.id)
    return true
  }
  publish(taskId: string, raw: unknown, identity: WorkbenchIdentity, skillRefs: SkillReadRef[] = []): PublishReceipt {
    const artifact = validateArtifact(raw); const task = this.getTask(taskId)
    this.validateArtifactForTask(task, artifact)
    const duplicate = this.listArtifacts(taskId).find(a => a.session_id === identity.sessionId && a.turn === identity.turn && a.call_id === identity.callId && equalValue(a.artifact, artifact))
    if (duplicate) return parse<PublishReceipt>(this.row('SELECT publish_receipt_json FROM workbench_task_artifacts WHERE artifact_id=?', duplicate.artifact_id)!.publish_receipt_json)
    const artifactId = randomUUID(); const directory = join(this.artifactDirectory, taskId, artifactId)
    try {
      mkdirSync(directory, { recursive: true })
      const sourceFiles = (artifact.source_files ?? []).map((source, index) => { const target = join(directory, `${index}-${basename(source)}`); copyFileSync(source, target); return target })
      writeFileSync(join(directory, 'artifact.json'), JSON.stringify(artifact, null, 2), { flag: 'wx' })
      return transaction(this.database, () => {
        let disposition: PublishReceipt['disposition'] = artifact.type === 'question' ? 'waiting_input' : task.output_contract.apply_mode === 'candidate' ? 'candidate' : 'recorded'
        const patch = this.artifactPatch(task, artifact)
        if (artifact.type === 'review') patch.review_artifact_id = artifactId
        if (artifact.type === 'experience') patch.experience_artifact_id = artifactId
        if (task.output_contract.apply_mode === 'automatic' && artifact.type !== 'question') disposition = this.applyPatch(task, patch, task.apply_target.expected) ? 'applied' : 'candidate'
        const applied = disposition === 'applied' ? { kind: task.apply_target.kind, id: task.apply_target.id, fields: Object.keys(patch) } : null
        this.run('INSERT INTO workbench_task_artifacts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', artifactId, taskId, artifact.type, JSON.stringify(artifact), JSON.stringify(sourceFiles), identity.sessionId, identity.turn, identity.callId, JSON.stringify(skillRefs), disposition, applied ? JSON.stringify(applied) : null, Date.now(), JSON.stringify({ task_id: taskId, artifact_id: artifactId, disposition }))
        if (artifact.type === 'review') for (const runId of artifact.run_ids) this.run('UPDATE generation_runs SET review_artifact_id=? WHERE run_id=? AND workbench_task_id=?', artifactId, runId, taskId)
        this.refreshTask(taskId)
        return { task_id: taskId, artifact_id: artifactId, disposition }
      })
    } catch (error) { rmSync(directory, { recursive: true, force: true }); throw error }
  }
  validateArtifactForTask(task: Task, artifact: ArtifactPayload): void {
    if (artifact.type !== 'question' && !task.output_contract.artifact_types.includes(artifact.type)) fail('WORKBENCH_ARTIFACT_NOT_ALLOWED', '请按 output_contract 发布产物。', 'artifact.type')
    if (artifact.type === 'parameters') for (const id of Object.keys(artifact.parameters)) if (!task.output_contract.parameter_ids.includes(id)) fail('WORKBENCH_PARAMETER_NOT_ALLOWED', '请使用 output_contract.parameter_ids 中的参数。', `artifact.parameters.${id}`)
    if (artifact.type === 'review' || artifact.type === 'experience') {
      if (task.apply_target.kind === 'run_review' && !artifact.run_ids.includes(task.apply_target.id)) fail('WORKBENCH_EVIDENCE_REQUIRED', '请在运行依据中包含任务绑定的运行 ID。', 'artifact.run_ids')
      const allowed = new Set([...task.input.reference_run_ids, ...this.listRuns(task.task_id).map(run => run.run_id)])
      for (const [index, id] of artifact.run_ids.entries()) if (!allowed.has(id)) fail('WORKBENCH_RUN_NOT_ALLOWED', '请引用本任务的参考运行或已接纳运行。', `artifact.run_ids.${index}`)
    }
  }
  adoptArtifact(input: { artifactId: string; expected: Record<string, JsonValue>; candidate?: boolean; resolvedDraft?: TaskDraft }): PublishReceipt {
    return transaction(this.database, () => {
      const stored = this.getArtifact(input.artifactId); const task = this.getTask(stored.task_id)
      if (stored.artifact.type === 'question') fail('WORKBENCH_INVALID_INPUT', '请通过回答入口回答此问题。')
      let patch = this.artifactPatch(task, stored.artifact, input.candidate)
      if (stored.artifact.type === 'resources') {
        if (input.resolvedDraft) {
          const draft = validateTaskDraft(input.resolvedDraft)
          patch = { generation_input: jsonValue(draft.generation_input), context_refs: jsonValue(draft.context_refs), base_model_id: draft.base_model_id }
        } else if (stored.artifact.refs.some(ref => ['model', 'lora', 'comfyui-template'].includes(ref.kind))) fail('WORKBENCH_RESOURCE_DETAILS_REQUIRED', '请先读取候选资源详情，再采用模型、LoRA 或模板。', 'artifact.refs')
      }
      if (input.candidate && (stored.artifact.type !== 'review' || !stored.artifact.candidate)) fail('WORKBENCH_INVALID_INPUT', '此产物没有建议输入，请选择包含建议输入的评价产物。', 'candidate')
      const generation = stored.artifact.type === 'generation_input' || input.candidate
      if (generation) {
        if (!input.resolvedDraft) fail('WORKBENCH_INPUT_RESOLUTION_REQUIRED', '请先读取模板参数并恢复提示词，再采用生成输入。', 'artifact_id')
        const draft = validateTaskDraft(input.resolvedDraft)
        patch = { prompt_input: jsonValue(draft.prompt_input), generation_input: jsonValue(draft.generation_input), context_refs: jsonValue(draft.context_refs), base_model_id: draft.base_model_id }
      }
      const target = generation ? { kind: 'branch' as const, id: task.branch_id, expected: input.expected } : task.apply_target
      if (stored.artifact.type === 'review' && !input.candidate) patch.review_artifact_id = stored.artifact_id
      if (stored.artifact.type === 'experience') patch.experience_artifact_id = stored.artifact_id
      if (!this.applyPatch(task, patch, input.expected, target)) fail('WORKBENCH_EDIT_CONFLICT', '目标内容已改变，请刷新差异后重新采用。', 'expected')
      this.run('UPDATE workbench_task_artifacts SET disposition=?,applied_target_json=? WHERE artifact_id=?', 'applied', JSON.stringify({ kind: target.kind, id: target.id, fields: Object.keys(patch) }), stored.artifact_id)
      return { task_id: task.task_id, artifact_id: stored.artifact_id, disposition: 'applied' }
    })
  }
  replyTask(taskId: string, questionArtifactId: string, answer: string): Task {
    return transaction(this.database, () => {
      const task = this.getTask(taskId); const question = this.getArtifact(questionArtifactId)
      if (question.task_id !== taskId || question.type !== 'question') fail('WORKBENCH_INVALID_INPUT', '请选择当前任务的问题。', 'question_artifact_id')
      if (!answer.trim()) fail('WORKBENCH_INVALID_INPUT', '请填写回答。', 'answer')
      const previous = task.answers.find(item => item.question_artifact_id === questionArtifactId)
      if (previous) { if (previous.answer !== answer) fail('WORKBENCH_ANSWER_CONFLICT', '此问题已有回答，请刷新任务后查看回答。', 'answer'); return task }
      this.run('UPDATE workbench_tasks SET answers_json=?,execution_state=?,error_json=NULL,updated_at=? WHERE task_id=?', JSON.stringify([...task.answers, { question_artifact_id: questionArtifactId, answer }]), 'pending', Date.now(), taskId)
      return this.refreshTask(taskId)
    })
  }
  getExperiment(taskId: string): Experiment | null {
    const row = this.row('SELECT * FROM workbench_experiments WHERE task_id=?', taskId)
    return row ? { ...row, submitted_count: this.listRuns(taskId).length, max_runs: this.getTask(taskId).input.max_runs } as Experiment : null
  }
  controlTask(taskId: string, action: 'interrupt' | 'pause' | 'continue'): Task {
    return transaction(this.database, () => {
      const task = this.getTask(taskId)
      if (action === 'pause' && task.kind !== 'experiment') fail('WORKBENCH_INVALID_INPUT', '请选择持续实验任务后暂停。')
      if (task.kind === 'experiment') this.run('UPDATE workbench_experiments SET control_state=? WHERE task_id=?', action === 'pause' ? 'paused' : action === 'interrupt' ? 'ended' : 'running', taskId)
      this.run('UPDATE workbench_tasks SET execution_state=?,status=?,error_json=NULL,updated_at=? WHERE task_id=?', action === 'interrupt' ? 'interrupted' : 'pending', action === 'pause' ? 'paused' : 'pending', Date.now(), taskId)
      return this.refreshTask(taskId)
    })
  }
  endExperiment(taskId: string, reason: 'goal_met' | 'user_ended'): Experiment {
    if (!this.getExperiment(taskId)) fail('WORKBENCH_INVALID_INPUT', '请选择持续实验任务。', 'task_id')
    this.run('UPDATE workbench_experiments SET control_state=?,end_reason=? WHERE task_id=?', 'ended', reason, taskId)
    this.refreshTask(taskId); return this.getExperiment(taskId)!
  }
  private generationInput(row: Row): GenerationInput {
    const input = parse<GenerationRequest>(row.request_json)
    return {
      title: input.title,
      instance_id: input.instanceId,
      template_id: input.templateId,
      model: input.model ? { id: input.model.id, file_name: input.model.fileName } : null,
      parameters: { ...input.parameters },
      loras: input.loras.map(lora => ({ id: lora.id, file_name: lora.fileName, weight: lora.weight, trigger_words: [...lora.triggerWords] })),
    }
  }
  private runSnapshot(row: Row): WorkbenchRun {
    return { session_id: String(row.session_id), created_at: Number(row.created_at), updated_at: Number(row.updated_at), media: this.runMedia(String(row.run_id)), run_id: String(row.run_id), workbench_task_id: String(row.workbench_task_id ?? ''), iteration_index: row.iteration_index as number | null, status: String(row.status), title: String(row.title), generation_input: this.generationInput(row), candidate_artifact_id: row.candidate_artifact_id as string | null, review_artifact_id: row.review_artifact_id as string | null, retry_of_run_id: row.retry_of_run_id as string | null, initiator: row.initiator as 'human' | 'agent', review: row.review_json ? parse(row.review_json) : null, review_draft: row.review_draft_json ? parse(row.review_draft_json) : null, error: row.error_code ? { code: String(row.error_code), message: String(row.error_message) } : null }
  }
  private runMedia(runId: string): WorkbenchRun['media'] {
    return this.rows('SELECT media_id,run_id,filename,media_type,media_kind,byte_size FROM generation_media WHERE run_id=? ORDER BY rowid', runId) as unknown as WorkbenchRun['media']
  }
  listRuns(taskId: string): WorkbenchRun[] { return this.rows('SELECT * FROM generation_runs WHERE workbench_task_id=? ORDER BY iteration_index,created_at,rowid', taskId).map(row => this.runSnapshot(row)) }
  getRun(runId: string): WorkbenchRun { const row = this.row('SELECT * FROM generation_runs WHERE run_id=?', runId); return row ? this.runSnapshot(row) : fail('WORKBENCH_RUN_NOT_FOUND', '运行不存在，请重新选择运行。', 'run_id') }
  assertRunInWork(runId: string, workId: string): WorkbenchRun {
    const run = this.getRun(runId)
    if (!run.workbench_task_id || this.getBranch(this.getTask(run.workbench_task_id).branch_id).work_id !== workId) fail('WORKBENCH_SCOPE_MISMATCH', '请选择当前工作的运行。', 'run_id')
    return run
  }
  assertGenerationAcceptance(input: GenerationAcceptance): GenerationAssociation {
    const existing = input.runId ? this.row('SELECT workbench_task_id FROM generation_runs WHERE run_id=?', input.runId) : undefined
    if (input.reused && (!existing || (existing.workbench_task_id ?? null) !== input.taskId)) fail('WORKBENCH_GENERATION_CONFLICT', 'request_id 已归属另一任务，请使用原任务或新的 request_id。', 'workbench_task_id')
    if (!input.taskId) return { iterationIndex: null, candidateArtifactId: null, initiator: null, retryOfRunId: null }
    const task = this.getTask(input.taskId)
    if (this.taskWorkspace(task.task_id) !== input.workspaceId) fail('WORKBENCH_SCOPE_MISMATCH', '任务与生成请求属于不同工作区，请选择当前工作区的任务。', 'workbench_task_id')
    if (!['run', 'experiment'].includes(task.kind)) fail('WORKBENCH_GENERATION_NOT_ALLOWED', '请选择运行任务或持续实验任务后提交生成。', 'workbench_task_id')
    if (input.reused) { const run = this.getRun(input.runId!); return { iterationIndex: run.iteration_index, candidateArtifactId: run.candidate_artifact_id, initiator: run.initiator, retryOfRunId: run.retry_of_run_id } }
    const runs = this.listRuns(task.task_id); const experiment = this.getExperiment(task.task_id)
    if (task.execution_state === 'interrupted' || (experiment && experiment.control_state !== 'running')) fail('WORKBENCH_TASK_STOPPED', '任务已暂停或结束，请继续任务后提交。', 'workbench_task_id')
    if (runs.length >= task.input.max_runs) fail('WORKBENCH_BUDGET_EXHAUSTED', '任务运行次数已用尽，请查看已接纳运行的结果。', 'workbench_task_id')
    let candidateArtifactId: string | null = null
    if (runs.length === 0) {
      if (!equalValue(input.input, task.input.generation_input)) fail('WORKBENCH_INPUT_MISMATCH', '首轮必须使用 task get 返回的固定 generation_input。', 'request')
    } else {
      if (runs.some(run => !isFinishedRun(run.status) || !run.review_artifact_id)) fail('WORKBENCH_ITERATION_INCOMPLETE', '请等待上一轮结束并发布评价后再提交。', 'workbench_task_id')
      const previous = runs.at(-1)!
      const artifacts = this.listArtifacts(task.task_id)
      const reviewIndex = artifacts.findIndex(artifact => artifact.artifact_id === previous.review_artifact_id)
      const candidate = artifacts.slice(reviewIndex + 1).filter(artifact => artifact.artifact.type === 'generation_input' && equalValue(artifact.artifact.generation_input, input.input)).at(-1)
      if (!candidate) fail('WORKBENCH_CANDIDATE_REQUIRED', '请先发布本轮 generation_input 产物，再提交相同输入。', 'request')
      candidateArtifactId = candidate!.artifact_id
    }
    return { iterationIndex: task.kind === 'experiment' ? runs.length + 1 : null, candidateArtifactId, initiator: task.initiator, retryOfRunId: task.retry_of_run_id }
  }
  registerGenerationRun(input: GenerationAcceptance & { runId: string }): void {
    const association = this.assertGenerationAcceptance(input)
    if (input.reused || !input.taskId) return
    this.run('UPDATE generation_runs SET workbench_task_id=?,iteration_index=?,initiator=?,candidate_artifact_id=?,retry_of_run_id=? WHERE run_id=?', input.taskId, association.iterationIndex, association.initiator, association.candidateArtifactId, association.retryOfRunId, input.runId)
    this.refreshTask(input.taskId)
  }
  refreshTask(taskId: string): Task {
    const task = this.getTask(taskId); const artifacts = this.listArtifacts(taskId); const runs = this.listRuns(taskId); const experiment = this.getExperiment(taskId)
    const status = deriveTaskStatus(task, artifacts, runs, experiment)
    if (status !== task.status) this.run('UPDATE workbench_tasks SET status=?,updated_at=? WHERE task_id=?', status, Date.now(), taskId)
    if (experiment && experiment.control_state === 'running' && runs.length >= task.input.max_runs && runs.every(run => isFinishedRun(run.status) && run.review_artifact_id)) this.run('UPDATE workbench_experiments SET control_state=?,end_reason=? WHERE task_id=?', 'completed', 'budget_used', taskId)
    return this.getTask(taskId)
  }
  getRunReviewDraft(runId: string): ReviewDraft {
    const run = this.getRun(runId)
    return run.review_draft ?? { verdict: 'unrated', observation: '', conclusion: '', title: '', conditions: '', note: '', evidence_run_ids: [runId], review_artifact_id: null, experience_artifact_id: null, experience_id: null }
  }
  saveRunReviewDraft(input: { workspaceId: string; workId: string; runId: string; expected: ReviewDraft; draft: ReviewDraft }): ReviewDraft {
    return transaction(this.database, () => {
      this.assertScope(input.workspaceId, input.workId); this.assertRunInWork(input.runId, input.workId)
      if (!equalValue(this.getRunReviewDraft(input.runId), input.expected)) fail('WORKBENCH_EDIT_CONFLICT', '评价草稿已改变，请刷新后重新保存。', 'expected')
      const draft = validateReviewDraft(input.draft)
      for (const id of draft.evidence_run_ids) this.assertRunInWork(id, input.workId)
      for (const [field, type] of [['review_artifact_id', 'review'], ['experience_artifact_id', 'experience']] as const) {
        const id = draft[field]
        if (!id) continue
        const artifact = this.getArtifact(id).artifact
        if (artifact.type !== type || !('run_ids' in artifact) || !artifact.run_ids.includes(input.runId)) fail('WORKBENCH_ARTIFACT_NOT_ALLOWED', '请选择引用当前运行的对应产物。', `draft.${field}`)
      }
      if (draft.experience_id && this.getExperience(draft.experience_id).source_run_id !== input.runId) fail('WORKBENCH_SCOPE_MISMATCH', '请选择当前运行对应的经验。', 'draft.experience_id')
      this.run('UPDATE generation_runs SET review_draft_json=? WHERE run_id=?', JSON.stringify(draft), input.runId)
      return draft
    })
  }
  saveRunReview(input: { workspaceId: string; workId: string; runId: string; expected: ReviewDraft; draft: ReviewDraft; saveExperience?: boolean }): { review: SavedReview; experience_id: string | null } {
    return transaction(this.database, () => {
      this.saveRunReviewDraft(input)
      const run = this.getRun(input.runId); const task = this.getTask(run.workbench_task_id); const branch = this.getBranch(task.branch_id)
      const review: SavedReview = { verdict: input.draft.verdict, observation: input.draft.observation, conclusion: input.draft.conclusion, source_artifact_id: input.draft.review_artifact_id }
      let experienceId = input.draft.experience_id
      if (input.saveExperience) {
        for (const key of ['title', 'conditions', 'note'] as const) if (!input.draft[key].trim()) fail('WORKBENCH_INVALID_INPUT', '请填写经验标题、适用条件和经验结论。', `draft.${key}`)
        if (!input.draft.evidence_run_ids.includes(input.runId)) fail('WORKBENCH_INVALID_INPUT', '经验证据必须包含当前运行。', 'draft.evidence_run_ids')
        for (const id of input.draft.evidence_run_ids) this.assertRunInWork(id, input.workId)
        if (experienceId && this.getExperience(experienceId).source_run_id !== input.runId) fail('WORKBENCH_SCOPE_MISMATCH', '请更新当前运行对应的经验。', 'draft.experience_id')
        experienceId ??= randomUUID()
        this.run('INSERT INTO workbench_experiences VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(experience_id) DO UPDATE SET title=excluded.title,conditions=excluded.conditions,note=excluded.note,evidence_run_ids_json=excluded.evidence_run_ids_json,source_artifact_id=excluded.source_artifact_id', experienceId, branch.work_id, branch.branch_id, input.draft.experience_artifact_id ? this.getArtifact(input.draft.experience_artifact_id).task_id : null, input.draft.title, input.draft.conditions, input.draft.note, task.input.base_model_id, run.generation_input.model?.id ?? null, JSON.stringify(input.draft.evidence_run_ids), input.runId, branch.source_experience_id, input.draft.experience_artifact_id)
      }
      this.run('UPDATE generation_runs SET review_json=?,review_draft_json=? WHERE run_id=?', JSON.stringify(review), JSON.stringify({ ...input.draft, experience_id: experienceId }), input.runId)
      return { review, experience_id: experienceId }
    })
  }
  private experience(row: Row): Experience { const { evidence_run_ids_json, ...rest } = row; return { ...rest, evidence_run_ids: parse(evidence_run_ids_json) } as Experience }
  getExperience(experienceId: string): Experience { const row = this.row('SELECT * FROM workbench_experiences WHERE experience_id=?', experienceId); return row ? this.experience(row) : fail('WORKBENCH_NOT_FOUND', '经验不存在，请刷新列表。', 'experience_id') }
  listExperiences(workId: string): Experience[] { return this.rows('SELECT * FROM workbench_experiences WHERE work_id=? ORDER BY rowid', workId).map(row => this.experience(row)) }
  setFavorite(input: { workspaceId: string; workId: string; targetType: 'run' | 'experience'; targetId: string; favorite: boolean }): void {
    this.assertScope(input.workspaceId, input.workId)
    if (input.targetType === 'run') this.assertRunInWork(input.targetId, input.workId)
    else if (input.targetType === 'experience') { if (this.getExperience(input.targetId).work_id !== input.workId) fail('WORKBENCH_SCOPE_MISMATCH', '请选择当前工作的经验。') }
    else fail('WORKBENCH_INVALID_INPUT', '请选择运行或经验。', 'target_type')
    if (input.favorite) this.run('INSERT OR IGNORE INTO workbench_favorites VALUES(?,?)', input.targetType, input.targetId)
    else this.run('DELETE FROM workbench_favorites WHERE target_type=? AND target_id=?', input.targetType, input.targetId)
  }
  getProjection(input: { workspaceId: string; workId?: string; branchId?: string; refreshAfterMs?: number }): WorkbenchProjection {
    if (input.workId) this.assertScope(input.workspaceId, input.workId, input.branchId)
    const tasks = this.listTasks(input.workspaceId, input.workId, input.branchId).map(task => this.refreshTask(task.task_id))
    const workIds = input.workId ? [input.workId] : this.listWorks(input.workspaceId).map(work => work.work_id)
    const branches = workIds.flatMap(id => this.listBranches(id)); const runs = tasks.flatMap(task => this.listRuns(task.task_id)); const experiences = workIds.flatMap(id => this.listExperiences(id))
    const favorites = this.rows('SELECT * FROM workbench_favorites').filter(row => row.target_type === 'run' ? runs.some(run => run.run_id === row.target_id) : experiences.some(experience => experience.experience_id === row.target_id)) as unknown as Favorite[]
    return { workspace_id: input.workspaceId, work_id: input.workId ?? null, works: this.listWorks(input.workspaceId), branches, tasks, artifacts: tasks.flatMap(task => this.listArtifacts(task.task_id)), runs, experiments: tasks.flatMap(task => { const experiment = this.getExperiment(task.task_id); return experiment ? [experiment] : [] }), experiences, favorites, functions: this.listFunctionBindings(input.workspaceId), refreshAfterMs: input.refreshAfterMs ?? 1000 }
  }
}

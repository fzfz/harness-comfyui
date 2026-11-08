import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkbenchStore } from '../../src/host/storage/workbench-store.js'
import type { WorkbenchServiceOptions } from '../../src/workbench/service.js'
import { createWorkbenchInputAdapter } from '../../src/host/workbench/input-adapter.ts'
import { jsonValue } from '../../src/workbench/validation.ts'
import { WorkbenchService } from '../../src/workbench/service.js'
import { WORKBENCH_FUNCTIONS } from '../../src/workbench/functions.js'
import { transaction } from '../../src/host/storage/transaction.js'
import type { GenerationInput } from '../../src/workbench/contract.js'

const disposals: (() => void)[] = []
afterEach(() => { for (const dispose of disposals.splice(0).reverse()) dispose() })
function fixture(options: Partial<WorkbenchServiceOptions> = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-store-'))
  const database = new DatabaseSync(':memory:')
  database.exec(`CREATE TABLE generation_runs (run_id TEXT PRIMARY KEY, workspace_id TEXT, session_id TEXT, turn INTEGER, call_id TEXT, title TEXT, status TEXT, request_json TEXT, workbench_task_id TEXT, iteration_index INTEGER, initiator TEXT, candidate_artifact_id TEXT, review_artifact_id TEXT, retry_of_run_id TEXT, review_json TEXT, review_draft_json TEXT, error_code TEXT, error_message TEXT, created_at INTEGER, updated_at INTEGER);`)
  database.exec('CREATE TABLE generation_media (media_id TEXT, run_id TEXT, filename TEXT, media_type TEXT, media_kind TEXT, byte_size INTEGER)')
  const store = new WorkbenchStore({ database, artifactDirectory: directory })
  const created = store.createWork({ workspaceId: 'workspace', name: 'test', goal: 'paint rain' })
  store.ensureFunctionBindings('workspace', WORKBENCH_FUNCTIONS, { presetId: 'preset', agentModel: { provider: 'provider', model: 'model' } })
  let session = 0
  const service = new WorkbenchService({ store, descriptors: WORKBENCH_FUNCTIONS, sessions: { authorize: async ({ task, identity }) => task.session_id === identity.sessionId || identity.sessionId === `${task.session_id}-child`, create: async () => ({ sessionId: `session-${++session}`, selectedModel: { model: 'model' } }), dispatch: async () => {} }, ...options })
  disposals.push(() => { database.close(); rmSync(directory, { recursive: true, force: true }) })
  return { ...created, directory, database, store, service }
}

function acceptRun(f: ReturnType<typeof fixture>, taskId: string, runId: string, input: GenerationInput): void {
  transaction(f.database, () => {
    f.store.assertGenerationAcceptance({ taskId, workspaceId: 'workspace', input, reused: false })
    f.database.prepare('INSERT INTO generation_runs(run_id,workspace_id,session_id,title,status,request_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(runId, 'workspace', f.store.getTask(taskId).session_id, input.title, 'created', JSON.stringify({ title: input.title, instanceId: input.instance_id, templateId: input.template_id, model: input.model ? { id: input.model.id, fileName: input.model.file_name } : null, parameters: input.parameters, loras: input.loras.map(lora => ({ id: lora.id, fileName: lora.file_name, weight: lora.weight, triggerWords: lora.trigger_words })) }), Date.now(), Date.now())
    f.store.registerGenerationRun({ taskId, workspaceId: 'workspace', input, runId, reused: false })
  })
}

describe('workbench storage public boundary', () => {
  it.each(['name', 'original_request'] as const)('preserves the saved %s when another caller submits its original value', field => {
    const f = fixture()
    const scope = { workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id }
    const windowA = f.store.getBranch(f.branch.branch_id)
    const windowB = f.store.getBranch(f.branch.branch_id)
    const save = (value: string, expectedValue: string) => f.store.saveBranchDraft({
      ...scope, expected: f.branch.draft, draft: f.branch.draft,
      ...(field === 'name' ? { name: value, expectedName: expectedValue } : { originalRequest: value, expectedOriginalRequest: expectedValue }),
    })
    save('Window B saved text', windowB[field])
    expect(() => save('Window A stale text', windowA[field])).toThrowError(expect.objectContaining({
      code: 'WORKBENCH_EDIT_CONFLICT', issues: [{ path: field, message: expect.any(String) }],
    }))
    const reopened = new WorkbenchStore({ database: f.database, artifactDirectory: f.directory })
    expect(reopened.getBranch(scope.branchId)[field]).toBe('Window B saved text')
    expect(reopened.getProjection(scope).branches[0]![field]).toBe('Window B saved text')
  })

  it.each([
    { change: { name: 'Changed name' }, path: 'expectedName' },
    { change: { originalRequest: 'Changed request' }, path: 'expectedOriginalRequest' },
    { change: { name: '', expectedName: '主分支' }, path: 'name' },
    { change: { name: '名'.repeat(41), expectedName: '主分支' }, path: 'name' },
    { change: { originalRequest: '  ', expectedOriginalRequest: 'paint rain' }, path: 'original_request' },
  ])('rejects invalid branch metadata at $path without persisting it', ({ change, path }) => {
    const f = fixture()
    expect(() => f.store.saveBranchDraft({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, expected: f.branch.draft, draft: f.branch.draft, ...change })).toThrowError(expect.objectContaining({
      code: 'WORKBENCH_INVALID_INPUT', issues: [{ path, message: expect.any(String) }],
    }))
    expect(f.store.getBranch(f.branch.branch_id)).toEqual(f.branch)
  })

  it('creates a work and its single main branch atomically, including a failed branch write', () => {
    const f = fixture()
    const originalWorks = f.store.listWorks('workspace')
    const input = { workspaceId: 'workspace', name: 'Glasshouse study', goal: 'Keep the glass structure.\nCompare daylight and warm light.' }
    f.database.exec("CREATE TRIGGER reject_main_branch BEFORE INSERT ON workbench_branches BEGIN SELECT RAISE(ABORT,'branch write failed'); END")
    expect(() => f.store.createWork(input)).toThrow('branch write failed')
    expect(f.store.listWorks('workspace')).toEqual(originalWorks)
    f.database.exec('DROP TRIGGER reject_main_branch')
    const created = f.store.createWork(input)
    expect(f.store.getWork(created.work.work_id)).toEqual({ work_id: created.work.work_id, workspace_id: 'workspace', name: input.name, goal: input.goal })
    expect(f.store.listBranches(created.work.work_id)).toEqual([created.branch])
    expect(created.branch).toMatchObject({
      work_id: created.work.work_id, name: '主分支', original_request: input.goal,
      parent_branch_id: null, source_run_id: null, source_artifact_id: null, source_experience_id: null,
      draft: { generation_input: { title: input.name }, prompt_input: { positive_prompt: '', negative_prompt: '' } },
      execution: { mode: 'once', max_runs: 3 },
    })
    expect(f.store.listWorks('workspace')).toHaveLength(originalWorks.length + 1)
  })
  it('adopts actual candidate prompts and model metadata before the next run without replacing manual edits', async () => {
    const adapter = createWorkbenchInputAdapter({ runtime: { inspectTemplateRuntimeParameters: async () => ({ parameters: [{ parameter_id: 'positive_prompt_9', kind: 'positive_prompt', value_type: 'string', current_value: 'template positive' }, { parameter_id: 'negative_prompt_10', kind: 'negative_prompt', value_type: 'string', current_value: '' }], size_candidates: [] }), validateGenerationRequest: async () => {} }, catalog: { details: async () => ({} as never), resolveTemplate: async () => ({ id: '2', title: 'template', base_model_id: '5', model_id: '3' }), resolveGenerationModel: async id => ({ id, file_name: 'model.safetensors', base_model_id: '5', description: '', usage: '', skill_name: null }), resolveLora: async () => ({} as never) } })
    const f = fixture({ prepareGenerationInput: adapter.prepareGenerationInput, resolveGenerationDraft: adapter.resolveGenerationDraft })
    const draft = structuredClone(f.branch.draft); draft.generation_input.instance_id = '1'; draft.generation_input.template_id = '2'; draft.prompt_input.positive_prompt = 'old branch prompt'
    f.store.saveBranchDraft({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, expected: f.branch.draft, draft })
    const experiment = await f.service.createTask({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'experiment' })
    const candidate = { ...draft.generation_input, model: { id: '3', file_name: 'model.safetensors' }, parameters: { positive_prompt_9: 'candidate warm glass', negative_prompt_10: 'candidate clear' } }
    const receipt = await f.service.publish({ taskId: experiment.task_id, artifact: { type: 'generation_input', generation_input: candidate, context_refs: [{ kind: 'character', id: '7' }] } }, { workspaceId: 'workspace', sessionId: experiment.session_id!, turn: 1, callId: 'candidate' })
    const baseline = f.store.getBranch(f.branch.branch_id).draft
    const manual = structuredClone(baseline); manual.prompt_input.positive_prompt = 'manual during task'
    f.store.saveBranchDraft({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, expected: baseline, draft: manual })
    await expect(f.service.adoptArtifact({ artifactId: receipt.artifact_id, expected: jsonValue(baseline) as Record<string, import('../../src/workbench/contract.ts').JsonValue> })).rejects.toMatchObject({ code: 'WORKBENCH_EDIT_CONFLICT' })
    const manualBase = structuredClone(manual); manualBase.base_model_id = '8'
    f.store.saveBranchDraft({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, expected: manual, draft: manualBase })
    await expect(f.service.adoptArtifact({ artifactId: receipt.artifact_id, expected: jsonValue(manual) as Record<string, import('../../src/workbench/contract.ts').JsonValue> })).rejects.toMatchObject({ code: 'WORKBENCH_EDIT_CONFLICT' })
    expect(f.store.getBranch(f.branch.branch_id).draft).toEqual(manualBase)
    await f.service.adoptArtifact({ artifactId: receipt.artifact_id, expected: jsonValue(manualBase) as Record<string, import('../../src/workbench/contract.ts').JsonValue> })
    expect(f.store.getBranch(f.branch.branch_id).draft).toEqual({ generation_input: candidate, prompt_input: { positive_prompt: 'candidate warm glass', negative_prompt: 'candidate clear' }, context_refs: [{ kind: 'character', id: '7' }], base_model_id: '5' })
    const next = await f.service.createTask({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'run' })
    expect(next.input.generation_input.parameters).toEqual(candidate.parameters)
    acceptRun(f, next.task_id, 'candidate-source', next.input.generation_input)
    f.database.prepare("UPDATE generation_runs SET status='succeeded' WHERE run_id=?").run('candidate-source')
    const review = await f.service.createTask({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'review', referenceRunIds: ['candidate-source'], evaluationInput: { run_id: 'candidate-source', verdict: 'unrated', observation: '', conclusion: '', experience: { title: '', conditions: '', note: '' } } })
    const improved = { ...candidate, parameters: { positive_prompt_9: 'review cool glass', negative_prompt_10: 'review contrast' } }
    const improvedReceipt = await f.service.publish({ taskId: review.task_id, artifact: { type: 'review', observation: 'warm', conclusion: 'cooler', run_ids: ['candidate-source'], candidate: { generation_input: improved, context_refs: [] } } }, { workspaceId: 'workspace', sessionId: review.session_id!, turn: 1, callId: 'review-candidate' })
    const reviewBaseline = f.store.getBranch(f.branch.branch_id).draft
    await f.service.adoptArtifact({ artifactId: improvedReceipt.artifact_id, candidate: true, expected: jsonValue(reviewBaseline) as Record<string, import('../../src/workbench/contract.ts').JsonValue> })
    const final = await f.service.createTask({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'run' })
    expect(final.input.prompt_input).toEqual({ positive_prompt: 'review cool glass', negative_prompt: 'review contrast' })
    expect(final.input.generation_input.parameters).toEqual(improved.parameters)
  })

  it('ends a paused experiment from its control state and keeps unfinished evaluation visible', async () => {
    let session = 0
    const f = fixture({ sessions: { authorize: async () => true, create: async () => ({ sessionId: `ended-session-${++session}`, selectedModel: {} }), dispatch: async () => {}, status: async () => 'interrupted' } })
    const draft = structuredClone(f.branch.draft); draft.generation_input.instance_id = '1'; draft.generation_input.template_id = '2'
    f.store.saveBranchDraft({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, expected: f.branch.draft, draft })
    const empty = await f.service.createTask({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'experiment' })
    await f.service.controlTask({ taskId: empty.task_id, action: 'pause' })
    await f.service.endExperiment({ taskId: empty.task_id, reason: 'user_ended' }, { workspaceId: 'workspace', sessionId: empty.session_id!, turn: 1, callId: 'end-empty' })
    expect((await f.service.getProjection({ workspaceId: 'workspace' })).tasks.find(task => task.task_id === empty.task_id)?.status).toBe('succeeded')
    const experiment = await f.service.createTask({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'experiment' })
    acceptRun(f, experiment.task_id, 'ended-run', draft.generation_input)
    await f.service.controlTask({ taskId: experiment.task_id, action: 'pause' })
    await f.service.endExperiment({ taskId: experiment.task_id, reason: 'user_ended' }, { workspaceId: 'workspace', sessionId: experiment.session_id!, turn: 1, callId: 'end-run' })
    expect(f.store.getTask(experiment.task_id).status).toBe('waiting_generation')
    f.database.prepare("UPDATE generation_runs SET status='succeeded' WHERE run_id=?").run('ended-run')
    expect((await f.service.getProjection({ workspaceId: 'workspace' })).tasks.find(task => task.task_id === experiment.task_id)?.status).toBe('needs_attention')
    await f.service.publish({ taskId: experiment.task_id, artifact: { type: 'review', observation: 'rain visible', conclusion: 'goal met', run_ids: ['ended-run'] } }, { workspaceId: 'workspace', sessionId: experiment.session_id!, turn: 2, callId: 'review-ended' })
    expect(f.store.getTask(experiment.task_id).status).toBe('succeeded')
  })

  it('keeps branch lineage, configuration snapshots and per-function instructions within their workspace', async () => {
    const f = fixture()
    const custom = f.store.saveFunctionBinding({ ...f.store.getFunctionBinding('workspace', 'prompt'), function_id: 'glass', builtin: false, name: 'Glass', kind: 'rewrite' })
    f.store.ensureFunctionBindings('workspace', WORKBENCH_FUNCTIONS, { presetId: 'other', agentModel: { provider: 'provider', model: 'other' } })
    expect(f.store.getFunctionBinding('workspace', 'prompt').preset_id).toBe('preset')
    const branch = f.store.createBranch({ workId: f.work.work_id, parentBranchId: f.branch.branch_id, name: 'reflection', originalRequest: 'blue glass', draft: f.branch.draft })
    f.store.saveTaskInstructions(branch.branch_id, custom.function_id, 'strong reflection')
    const task = await f.service.createTask({ workspaceId: 'workspace', workId: f.work.work_id, branchId: branch.branch_id, functionId: custom.function_id })
    expect(task.kind).toBe('rewrite')
    expect(task.input.requirements.instructions).toBe('strong reflection')
    expect(f.store.getTaskInstructions(branch.branch_id, custom.function_id)).toBe('')
    f.store.removeFunctionBinding('workspace', custom.function_id)
    expect(f.store.getTask(task.task_id).binding_snapshot.name).toBe('Glass')
    const identity = { workspaceId: 'workspace', sessionId: task.session_id!, turn: 1, callId: 'lineage' }
    const result = await f.service.publish({ taskId: task.task_id, artifact: { type: 'prompt', positive_prompt: 'blue glass', negative_prompt: '' } }, identity)
    const child = f.store.createBranch({ workId: f.work.work_id, parentBranchId: branch.branch_id, name: 'detail', originalRequest: 'detail', sourceArtifactId: result.artifact_id, draft: f.store.getBranch(branch.branch_id).draft })
    expect(child.source_artifact_id).toBe(result.artifact_id)
    expect(() => f.store.removeFunctionBinding('workspace', 'prompt')).toThrow()
    expect(() => f.store.createBranch({ workId: f.work.work_id, parentBranchId: 'missing', name: 'bad', originalRequest: 'bad', draft: branch.draft })).toThrow()
    expect(f.store.getProjection({ workspaceId: 'other' })).toMatchObject({ works: [], branches: [], tasks: [], artifacts: [], runs: [] })
  })

  it('applies only authorized template parameters and keeps unrelated manual changes', async () => {
    const f = fixture({ parameterIds: async () => ['width_6', 'new.parameter'], validateParameters: async (_input, parameters, path) => { if (parameters.width_6 === 0) throw new Error(`${path}.width_6: positive size required`) } })
    await expect(f.service.createTask({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'parameters' })).rejects.toMatchObject({ code: 'WORKBENCH_TEMPLATE_REQUIRED' })
    const draft = structuredClone(f.branch.draft)
    draft.generation_input.instance_id = '1'; draft.generation_input.template_id = '2'; draft.generation_input.parameters = { width_6: 512, seed: 1 }
    draft.generation_input.loras = [{ id: '4', file_name: 'glass.safetensors', weight: 0.8, trigger_words: ['glass'] }]
    f.store.saveBranchDraft({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, expected: f.branch.draft, draft })
    const task = await f.service.createTask({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'parameters' })
    const identity = { workspaceId: 'workspace', sessionId: task.session_id!, turn: 1, callId: 'parameters' }
    await expect(f.service.publish({ taskId: task.task_id, artifact: { type: 'parameters', parameters: { seed: 2 } } }, identity)).rejects.toMatchObject({ issues: [{ path: 'artifact.parameters.seed' }] })
    await expect(f.service.publish({ taskId: task.task_id, artifact: { type: 'parameters', parameters: { width_6: 0 } } }, identity)).rejects.toThrow('artifact.parameters.width_6')
    const manual = structuredClone(draft); manual.generation_input.parameters.seed = 9
    f.store.saveBranchDraft({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, expected: draft, draft: manual })
    const receipt = await f.service.publish({ taskId: task.task_id, artifact: { type: 'parameters', parameters: { width_6: 768, 'new.parameter': 3 } } }, identity)
    expect(receipt.disposition).toBe('applied')
    expect(f.store.getBranch(f.branch.branch_id).draft.generation_input).toEqual({ ...draft.generation_input, parameters: { width_6: 768, seed: 9, 'new.parameter': 3 } })
  })

  it('adopts resolved resource candidates after verifying the displayed generation input', async () => {
    const f = fixture({ validateResourceRefs: async refs => { if (refs.some(ref => ref.id === '9')) throw new Error('resource missing') }, resolveResourceRefs: async (refs, draft) => ({ ...draft, base_model_id: '5', generation_input: { ...draft.generation_input, model: { id: refs[0]!.id, file_name: 'selected.safetensors' } }, context_refs: [{ kind: 'character', id: '2' }] }) })
    const task = await f.service.createTask({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'resources' })
    const identity = { workspaceId: 'workspace', sessionId: task.session_id!, turn: 1, callId: 'resources' }
    await expect(f.service.publish({ taskId: task.task_id, artifact: { type: 'resources', refs: [{ kind: 'model', id: '9' }] } }, identity)).rejects.toThrow('resource missing')
    const receipt = await f.service.publish({ taskId: task.task_id, artifact: { type: 'resources', refs: [{ kind: 'model', id: '3' }] } }, identity)
    expect(receipt.disposition).toBe('candidate')
    await f.service.adoptArtifact({ artifactId: receipt.artifact_id, expected: { generation_input: f.branch.draft.generation_input as never, context_refs: [], base_model_id: null } })
    expect(f.store.getBranch(f.branch.branch_id).draft.generation_input.model).toEqual({ id: '3', file_name: 'selected.safetensors' })
    expect(f.store.getBranch(f.branch.branch_id).draft.base_model_id).toBe('5')
  })

  it('adopts context references and retains unresolved generation resources as candidates', async () => {
    const f = fixture()
    const task = await f.service.createTask({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'resources' })
    const identity = { workspaceId: 'workspace', sessionId: task.session_id!, turn: 1, callId: 'resources' }
    const context = await f.service.publish({ taskId: task.task_id, artifact: { type: 'resources', refs: [{ kind: 'character', id: '2' }] } }, identity)
    await f.service.adoptArtifact({ artifactId: context.artifact_id, expected: { context_refs: [] } })
    expect(f.store.getBranch(f.branch.branch_id).draft.context_refs).toEqual([{ kind: 'character', id: '2' }])
    const model = await f.service.publish({ taskId: task.task_id, artifact: { type: 'resources', refs: [{ kind: 'model', id: '3' }] } }, identity)
    await expect(f.service.adoptArtifact({ artifactId: model.artifact_id, expected: { context_refs: [] } })).rejects.toMatchObject({ code: 'WORKBENCH_RESOURCE_DETAILS_REQUIRED' })
    expect(f.store.getArtifact(model.artifact_id).disposition).toBe('candidate')
  })

  it('preserves completed and idle task snapshots when official sessions unload or reload', async () => {
    const sessions = new Map<string, import('../../src/workbench/contract.ts').ExecutionState>()
    const statusCalls: string[] = []
    let sequence = 0
    const f = fixture({ sessions: { authorize: async () => true, create: async () => { const sessionId = `official-${++sequence}`; sessions.set(sessionId, 'running'); return { sessionId, selectedModel: {} } }, dispatch: async () => {}, status: async ({ sessionId }) => { statusCalls.push(sessionId); return sessions.get(sessionId) ?? 'interrupted' } } })
    const complete = await f.service.createTask({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'prompt' })
    await f.service.publish({ taskId: complete.task_id, artifact: { type: 'prompt', positive_prompt: 'rain', negative_prompt: '' } }, { workspaceId: 'workspace', sessionId: complete.session_id!, turn: 1, callId: 'publish' })
    const completedSnapshot = f.store.getTask(complete.task_id)
    sessions.delete(complete.session_id!)
    expect((await f.service.getProjection({ workspaceId: 'workspace', workId: f.work.work_id })).tasks[0]).toEqual(completedSnapshot)
    sessions.set(complete.session_id!, 'running')
    expect((await f.service.getProjection({ workspaceId: 'workspace', workId: f.work.work_id })).tasks[0]).toEqual(completedSnapshot)
    expect(statusCalls).toEqual([])
    const unfinished = await f.service.createTask({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'prompt' })
    sessions.set(unfinished.session_id!, 'idle')
    const idle = (await f.service.getProjection({ workspaceId: 'workspace', workId: f.work.work_id })).tasks.find(task => task.task_id === unfinished.task_id)!
    expect(idle).toMatchObject({ status: 'needs_attention', execution_state: 'idle' })
    sessions.delete(unfinished.session_id!)
    expect((await f.service.getProjection({ workspaceId: 'workspace', workId: f.work.work_id })).tasks.find(task => task.task_id === unfinished.task_id)).toEqual(idle)
    sessions.set(unfinished.session_id!, 'running')
    expect((await f.service.getProjection({ workspaceId: 'workspace', workId: f.work.work_id })).tasks.find(task => task.task_id === unfinished.task_id)).toEqual(idle)
    expect(statusCalls).toEqual([unfinished.session_id])
  })

  it('tracks active official execution and finishes background Runs after their session unloads', async () => {
    let official: import('../../src/workbench/contract.ts').ExecutionState = 'pending'
    let statusCalls = 0
    const f = fixture({ sessions: { authorize: async () => true, create: async () => ({ sessionId: 'active-official', selectedModel: {} }), dispatch: async () => {}, status: async () => { statusCalls++; return official } } })
    const draft = structuredClone(f.branch.draft); draft.generation_input.instance_id = '1'; draft.generation_input.template_id = '2'
    f.store.saveBranchDraft({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, expected: f.branch.draft, draft })
    const task = await f.service.createTask({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'run' })
    expect((await f.service.getProjection({ workspaceId: 'workspace' })).tasks[0]).toMatchObject({ status: 'pending', execution_state: 'pending' })
    official = 'running'
    expect((await f.service.getProjection({ workspaceId: 'workspace' })).tasks[0]).toMatchObject({ status: 'running', execution_state: 'running' })
    acceptRun(f, task.task_id, 'background-run', task.input.generation_input)
    official = 'idle'
    expect((await f.service.getProjection({ workspaceId: 'workspace' })).tasks[0]).toMatchObject({ status: 'waiting_generation', execution_state: 'idle' })
    official = 'interrupted'
    expect((await f.service.getProjection({ workspaceId: 'workspace' })).tasks[0]).toMatchObject({ status: 'waiting_generation', execution_state: 'idle' })
    f.database.prepare("UPDATE generation_runs SET status='succeeded' WHERE run_id=?").run('background-run')
    expect((await f.service.getProjection({ workspaceId: 'workspace' })).tasks[0]).toMatchObject({ status: 'succeeded', execution_state: 'idle' })
    expect(statusCalls).toBe(3)
  })

  it('retains Run completion when it arrives during an official status query', async () => {
    let f: ReturnType<typeof fixture>
    let statusCalls = 0
    f = fixture({ sessions: { authorize: async () => true, create: async () => ({ sessionId: 'unloading-official', selectedModel: {} }), dispatch: async () => {}, status: async () => { statusCalls++; f.database.prepare("UPDATE generation_runs SET status='succeeded' WHERE run_id=?").run('completing-run'); return 'interrupted' } } })
    const draft = structuredClone(f.branch.draft); draft.generation_input.instance_id = '1'; draft.generation_input.template_id = '2'
    f.store.saveBranchDraft({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, expected: f.branch.draft, draft })
    const task = await f.service.createTask({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'run' })
    acceptRun(f, task.task_id, 'completing-run', task.input.generation_input)
    expect((await f.service.getProjection({ workspaceId: 'workspace' })).tasks[0]).toMatchObject({ status: 'succeeded', execution_state: 'running' })
    expect((await f.service.getProjection({ workspaceId: 'workspace' })).tasks[0].status).toBe('succeeded')
    expect(statusCalls).toBe(1)
  })

  it('queries official execution status and continues the same execution session after pause and end', async () => {
    let status: import('../../src/workbench/contract.js').ExecutionState = 'idle'
    const controls: string[] = []
    const f = fixture({ sessions: { authorize: async () => true, create: async () => ({ sessionId: 'official-session', selectedModel: {} }), dispatch: async () => {}, status: async () => status, control: async input => { controls.push(`${input.sessionId}:${input.action}`) }, skillReadRefs: async () => [{ name: 'builder', session_id: 'official-session', turn: 1, call_id: 'read', source_file: null }] } })
    const draft = structuredClone(f.branch.draft); draft.generation_input.instance_id = '1'; draft.generation_input.template_id = '2'
    f.store.saveBranchDraft({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, expected: f.branch.draft, draft })
    const task = await f.service.createTask({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'experiment', maxRuns: 3 })
    expect((await f.service.getProjection({ workspaceId: 'workspace', workId: f.work.work_id })).tasks[0]!.status).toBe('needs_attention')
    status = 'running'
    await f.service.controlTask({ taskId: task.task_id, action: 'continue' })
    expect((await f.service.getProjection({ workspaceId: 'workspace', workId: f.work.work_id })).tasks[0]!.execution_state).toBe('running')
    expect((await f.service.controlTask({ taskId: task.task_id, action: 'pause' })).status).toBe('paused')
    expect(() => acceptRun(f, task.task_id, 'paused', draft.generation_input)).toThrow()
    await f.service.controlTask({ taskId: task.task_id, action: 'continue' })
    await f.service.authorizeGeneration(task.task_id, { workspaceId: 'workspace', sessionId: task.session_id!, turn: 1, callId: 'generation' })
    await f.service.authorizeGeneration(null, { workspaceId: 'workspace', sessionId: task.session_id!, turn: 1, callId: 'chat' })
    expect((await f.service.endExperiment({ taskId: task.task_id, reason: 'user_ended' }, { workspaceId: 'workspace', sessionId: task.session_id!, turn: 1, callId: 'end' })).end_reason).toBe('user_ended')
    expect((await f.service.controlTask({ taskId: task.task_id, action: 'interrupt' })).status).toBe('interrupted')
    expect(controls).toEqual(['official-session:continue', 'official-session:pause', 'official-session:continue', 'official-session:interrupt'])
  })

  it('retains accepted task input and execution errors when official dispatch fails', async () => {
    const f = fixture({ sessions: { authorize: async () => true, create: async () => ({ sessionId: 'dispatch-failure', selectedModel: {} }), dispatch: async () => { throw new Error('host unavailable') } } })
    await expect(f.service.createTask({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'prompt' })).rejects.toThrow('host unavailable')
    expect(f.store.getProjection({ workspaceId: 'workspace' }).tasks[0]).toMatchObject({ status: 'failed', session_id: 'dispatch-failure', error: { code: 'WORKBENCH_DISPATCH_FAILED', message: 'host unavailable' }, input: { requirements: { original_request: 'paint rain' } } })
  })

  it('applies authorized prompt fields and isolates interleaved tasks and question answers', async () => {
    const f = fixture()
    const create = () => f.service.createTask({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'prompt' })
    const first = await create(); const second = await create()
    const identity = (sessionId: string, callId: string) => ({ workspaceId: 'workspace', sessionId, turn: 1, callId })
    const question = await f.service.publish({ taskId: first.task_id, artifact: { type: 'question', question: 'Which light?', options: ['warm', 'cold'] } }, identity(first.session_id!, 'q'))
    expect(f.store.getTask(first.task_id).status).toBe('waiting_input')
    await f.service.replyTask({ taskId: first.task_id, questionArtifactId: question.artifact_id, answer: 'warm' })
    await f.service.replyTask({ taskId: first.task_id, questionArtifactId: question.artifact_id, answer: 'warm' })
    await expect(f.service.replyTask({ taskId: first.task_id, questionArtifactId: question.artifact_id, answer: 'cold' })).rejects.toMatchObject({ code: 'WORKBENCH_ANSWER_CONFLICT' })
    expect((await f.service.getTask({ taskId: first.task_id }, identity(`${first.session_id}-child`, 'get'))).answers).toEqual([{ question_artifact_id: question.artifact_id, answer: 'warm' }])
    await expect(f.service.publish({ taskId: second.task_id, artifact: { type: 'prompt', positive_prompt: 'wrong', negative_prompt: '' } }, identity(first.session_id!, 'wrong'))).rejects.toMatchObject({ code: 'WORKBENCH_ACCESS_DENIED' })
    const applied = await f.service.publish({ taskId: second.task_id, artifact: { type: 'prompt', positive_prompt: 'second', negative_prompt: '' } }, identity(second.session_id!, 'p'))
    expect(applied.disposition).toBe('applied')
    expect(f.store.getTask(second.task_id).status).toBe('succeeded')
    const candidate = await f.service.publish({ taskId: first.task_id, artifact: { type: 'prompt', positive_prompt: 'first', negative_prompt: '' } }, identity(first.session_id!, 'p'))
    expect(candidate.disposition).toBe('candidate')
    expect(f.store.listArtifacts(first.task_id).map(a => a.type)).toEqual(['question', 'prompt'])
    expect(f.store.listArtifacts(second.task_id).map(a => a.type)).toEqual(['prompt'])
    expect(() => f.store.adoptArtifact({ artifactId: candidate.artifact_id, expected: { 'prompt_input.positive_prompt': 'stale', 'prompt_input.negative_prompt': '' } })).toThrow()
    expect(f.store.adoptArtifact({ artifactId: candidate.artifact_id, expected: { 'prompt_input.positive_prompt': 'second', 'prompt_input.negative_prompt': '' } }).disposition).toBe('applied')
    expect(f.store.getBranch(f.branch.branch_id).draft.prompt_input.positive_prompt).toBe('first')
    expect(await f.service.publish({ taskId: first.task_id, artifact: { type: 'prompt', positive_prompt: 'first', negative_prompt: '' } }, identity(first.session_id!, 'p'))).toEqual(candidate)
  })

  it('rolls back a failed artifact insert and removes copied files', async () => {
    const f = fixture()
    const task = await f.service.createTask({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'prompt' })
    const source = join(f.directory, 'source.txt'); writeFileSync(source, 'native skill output')
    f.database.exec("CREATE TRIGGER reject_artifact BEFORE INSERT ON workbench_task_artifacts BEGIN SELECT RAISE(ABORT,'write failed'); END")
    await expect(f.service.publish({ taskId: task.task_id, artifact: { type: 'prompt', positive_prompt: 'agent', negative_prompt: '', source_files: [source] } }, { workspaceId: 'workspace', sessionId: task.session_id!, turn: 1, callId: 'call' })).rejects.toThrow('write failed')
    expect(f.store.getBranch(f.branch.branch_id).draft).toEqual(f.branch.draft)
    expect(f.store.listArtifacts(task.task_id)).toEqual([])
    expect(readdirSync(join(f.directory, task.task_id))).toEqual([])
  })

  it('enforces fixed first input, a single-run limit, iteration reviews, candidates, and atomic budgets', async () => {
    const f = fixture()
    const draft = structuredClone(f.branch.draft)
    draft.generation_input.instance_id = '1'; draft.generation_input.template_id = '2'
    draft.generation_input.parameters = { seed: 7 }
    f.store.saveBranchDraft({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, expected: f.branch.draft, draft })
    const once = await f.service.createTask({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'run' })
    expect(() => acceptRun(f, once.task_id, 'wrong', { ...draft.generation_input, parameters: { seed: 8 } })).toThrow()
    acceptRun(f, once.task_id, 'run-once', draft.generation_input)
    expect(f.store.getTask(once.task_id).status).toBe('waiting_generation')
    expect(() => acceptRun(f, once.task_id, 'over-budget', draft.generation_input)).toThrow()
    expect(() => f.store.assertGenerationAcceptance({ taskId: null, workspaceId: 'workspace', input: draft.generation_input, runId: 'run-once', reused: true })).toThrow()
    f.database.prepare("UPDATE generation_runs SET status='succeeded' WHERE run_id=?").run('run-once')
    expect(f.store.refreshTask(once.task_id).status).toBe('succeeded')
    const experiment = await f.service.createTask({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'experiment', maxRuns: 2 })
    acceptRun(f, experiment.task_id, 'round-1', draft.generation_input)
    const next = { ...draft.generation_input, parameters: { seed: 9 } }
    expect(() => acceptRun(f, experiment.task_id, 'round-2', next)).toThrow()
    const identity = { workspaceId: 'workspace', sessionId: experiment.session_id!, turn: 2, callId: 'review' }
    f.database.prepare("UPDATE generation_runs SET status='succeeded' WHERE run_id=?").run('round-1')
    await f.service.publish({ taskId: experiment.task_id, artifact: { type: 'review', observation: 'clear', conclusion: 'change seed', run_ids: ['round-1'] } }, identity)
    await f.service.publish({ taskId: experiment.task_id, artifact: { type: 'generation_input', generation_input: next, context_refs: [] } }, { ...identity, callId: 'candidate' })
    acceptRun(f, experiment.task_id, 'round-2', next)
    expect(f.store.listRuns(experiment.task_id).map(run => run.iteration_index)).toEqual([1, 2])
    expect(f.store.listRuns(experiment.task_id)[1]!.candidate_artifact_id).toBeTruthy()
    f.database.prepare("UPDATE generation_runs SET status='succeeded' WHERE run_id=?").run('round-2')
    await f.service.publish({ taskId: experiment.task_id, artifact: { type: 'review', observation: 'clear', conclusion: 'done', run_ids: ['round-2'] } }, { ...identity, callId: 'review-2' })
    expect(f.store.refreshTask(experiment.task_id).status).toBe('succeeded')
    expect(f.store.getExperiment(experiment.task_id)).toMatchObject({ control_state: 'completed', end_reason: 'budget_used', submitted_count: 2 })
    const progress = await f.service.getTask({ taskId: experiment.task_id }, identity)
    expect(progress.iterations.map(iteration => iteration.generation_input.parameters.seed)).toEqual([7, 9])
    expect(() => transaction(f.database, () => {
      const extra = f.store.createTask({ branchId: f.branch.branch_id, functionId: once.function_id, title: 'atomic', kind: 'run', input: once.input, outputContract: once.output_contract, bindingSnapshot: once.binding_snapshot, applyTarget: once.apply_target })
      acceptRun(f, extra.task_id, 'rollback-first', draft.generation_input)
      acceptRun(f, extra.task_id, 'rollback-second', draft.generation_input)
    })).toThrow()
    expect(f.store.getProjection({ workspaceId: 'workspace' }).runs.map(run => run.run_id)).not.toContain('rollback-first')
  })

  it('applies review and experience drafts, saves one experience per run, and scopes favorites', async () => {
    const f = fixture()
    const draft = structuredClone(f.branch.draft)
    draft.base_model_id = '5'; draft.generation_input.instance_id = '1'; draft.generation_input.template_id = '2'; draft.generation_input.model = { id: '3', file_name: 'model.safetensors' }
    f.store.saveBranchDraft({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, expected: f.branch.draft, draft })
    const source = await f.service.createTask({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'run' })
    acceptRun(f, source.task_id, 'source-run', draft.generation_input)
    f.database.exec("UPDATE generation_runs SET status='succeeded'")
    const evaluationInput = { run_id: 'source-run', verdict: 'unrated' as const, observation: '', conclusion: '', experience: { title: '', conditions: '', note: '' } }
    const review = await f.service.createTask({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'review', referenceRunIds: ['source-run'], evaluationInput })
    await f.service.publish({ taskId: review.task_id, artifact: { type: 'review', observation: 'rain visible', conclusion: 'goal met', run_ids: ['source-run'] } }, { workspaceId: 'workspace', sessionId: review.session_id!, turn: 1, callId: 'review' })
    expect(f.store.getRunReviewDraft('source-run')).toMatchObject({ observation: 'rain visible', conclusion: 'goal met' })
    expect(f.store.getRun('source-run').review).toBeNull()
    expect(f.store.getRun('source-run').generation_input.model).toEqual({ id: '3', file_name: 'model.safetensors' })
    const experience = await f.service.createTask({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'experience', referenceRunIds: ['source-run'], evaluationInput })
    const receipt = await f.service.publish({ taskId: experience.task_id, artifact: { type: 'experience', title: 'rain', conditions: 'glass', note: 'backlight', base_model_id: '5', model_id: '3', run_ids: ['source-run'] } }, { workspaceId: 'workspace', sessionId: experience.session_id!, turn: 1, callId: 'experience' })
    expect(receipt.disposition).toBe('applied')
    const before = f.store.getRunReviewDraft('source-run')
    const saved = f.store.saveRunReview({ workspaceId: 'workspace', workId: f.work.work_id, runId: 'source-run', expected: before, draft: { ...before, verdict: 'met' }, saveExperience: true })
    expect(f.store.getRun('source-run').review?.verdict).toBe('met')
    const current = f.store.getRunReviewDraft('source-run')
    const repeated = f.store.saveRunReview({ workspaceId: 'workspace', workId: f.work.work_id, runId: 'source-run', expected: current, draft: { ...current, note: 'soft backlight' }, saveExperience: true })
    expect(repeated.experience_id).toBe(saved.experience_id)
    expect(f.store.listExperiences(f.work.work_id)).toMatchObject([{ note: 'soft backlight', source_artifact_id: receipt.artifact_id, task_id: experience.task_id }])
    f.store.setFavorite({ workspaceId: 'workspace', workId: f.work.work_id, targetType: 'experience', targetId: saved.experience_id!, favorite: true })
    expect(f.store.getProjection({ workspaceId: 'workspace', workId: f.work.work_id }).favorites).toEqual([{ target_type: 'experience', target_id: saved.experience_id }])
    f.store.setFavorite({ workspaceId: 'workspace', workId: f.work.work_id, targetType: 'run', targetId: 'source-run', favorite: true })
    expect(f.store.getProjection({ workspaceId: 'workspace' }).favorites).toHaveLength(2)
    f.store.setFavorite({ workspaceId: 'workspace', workId: f.work.work_id, targetType: 'run', targetId: 'source-run', favorite: false })
    expect(() => f.store.getProjection({ workspaceId: 'other', workId: f.work.work_id })).toThrow()
  })

  it('checks compare and diagnosis evidence against the fixed target run', async () => {
    const f = fixture()
    const draft = structuredClone(f.branch.draft); draft.generation_input.instance_id = '1'; draft.generation_input.template_id = '2'
    f.store.saveBranchDraft({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, expected: f.branch.draft, draft })
    for (const id of ['run-a', 'run-b']) {
      const source = await f.service.createTask({ workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'run' })
      acceptRun(f, source.task_id, id, draft.generation_input)
    }
    f.database.exec("UPDATE generation_runs SET status='succeeded'")
    const evaluationInput = { run_id: 'run-a', verdict: 'unrated' as const, observation: '', conclusion: '', experience: { title: '', conditions: '', note: '' } }
    const request = { workspaceId: 'workspace', workId: f.work.work_id, branchId: f.branch.branch_id, referenceRunIds: ['run-a', 'run-b'], evaluationInput }
    const comparison = await f.service.createTask({ ...request, functionId: 'compare' })
    const identity = { workspaceId: 'workspace', sessionId: comparison.session_id!, turn: 1, callId: 'compare' }
    await expect(f.service.publish({ taskId: comparison.task_id, artifact: { type: 'review', observation: 'b', conclusion: 'only b', run_ids: ['run-b'] } }, identity)).rejects.toMatchObject({ issues: [{ path: 'artifact.run_ids' }] })
    expect((await f.service.publish({ taskId: comparison.task_id, artifact: { type: 'review', observation: 'a and b', conclusion: 'a clearer', run_ids: ['run-a', 'run-b'] } }, identity)).disposition).toBe('applied')
    await expect(f.service.createTask({ ...request, functionId: 'diagnose' })).rejects.toMatchObject({ code: 'WORKBENCH_FAILED_RUN_REQUIRED' })
    f.database.prepare("UPDATE generation_runs SET status='failed' WHERE run_id=?").run('run-a')
    const diagnosis = await f.service.createTask({ ...request, functionId: 'diagnose' })
    expect((await f.service.publish({ taskId: diagnosis.task_id, artifact: { type: 'review', observation: 'node error', conclusion: 'fix input', run_ids: ['run-a'] } }, { ...identity, sessionId: diagnosis.session_id!, callId: 'diagnose' })).disposition).toBe('applied')
  })

  it('keeps task input fixed and preserves a concurrent manual edit as a candidate', async () => {
    const { store, service, work, branch, directory } = fixture()
    const task = await service.createTask({ workspaceId: 'workspace', workId: work.work_id, branchId: branch.branch_id, functionId: 'prompt' })
    const draft = structuredClone(branch.draft); draft.prompt_input.positive_prompt = 'manual'
    store.saveBranchDraft({ workspaceId: 'workspace', workId: work.work_id, branchId: branch.branch_id, expected: branch.draft, draft })
    const identity = { workspaceId: 'workspace', sessionId: task.session_id!, turn: 1, callId: 'call' }
    const receipt = await service.publish({ taskId: task.task_id, artifact: { type: 'prompt', positive_prompt: 'agent', negative_prompt: 'bad' } }, identity)
    expect(receipt.disposition).toBe('candidate')
    expect(store.getBranch(branch.branch_id).draft.prompt_input.positive_prompt).toBe('manual')
    expect((await service.getTask({ taskId: task.task_id }, identity)).prompt_input.positive_prompt).toBe('')
    expect(readdirSync(join(directory, task.task_id, receipt.artifact_id))).toEqual(['artifact.json'])
    expect(await service.publish({ taskId: task.task_id, artifact: { type: 'prompt', positive_prompt: 'agent', negative_prompt: 'bad' } }, identity)).toEqual(receipt)
    await expect(service.getTask({ taskId: task.task_id }, { ...identity, sessionId: 'other' })).rejects.toMatchObject({ code: 'WORKBENCH_ACCESS_DENIED' })
  })
})

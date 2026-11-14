import { contracts } from '#contracts'

import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { WorkbenchStore } from '../../src/host/storage/workbench-store.ts'
import { WorkbenchService } from '../../src/workbench/service.ts'
import { WORKBENCH_FUNCTIONS } from '../../src/workbench/functions.ts'

const cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup() })
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-references-'))
  const database = new DatabaseSync(':memory:')
  database.exec('CREATE TABLE generation_runs (run_id TEXT PRIMARY KEY, workspace_id TEXT, session_id TEXT, title TEXT, status TEXT, request_json TEXT, workbench_task_id TEXT, execution_task_id TEXT, iteration_index INTEGER, initiator TEXT, candidate_artifact_id TEXT, review_artifact_id TEXT, retry_of_run_id TEXT, review_json TEXT, review_draft_json TEXT, error_code TEXT, error_message TEXT, created_at INTEGER, updated_at INTEGER)')
  database.exec('CREATE TABLE generation_media (media_id TEXT, run_id TEXT, filename TEXT, media_type TEXT, media_kind TEXT, byte_size INTEGER)')
  const store = new WorkbenchStore({ database, artifactDirectory: directory })
  let count = 0
  const service = new WorkbenchService({ store, descriptors: WORKBENCH_FUNCTIONS, sessions: {
    authorize: async ({ task, identity }) => task.session_id === identity.sessionId,
    create: async () => ({ sessionId: `session-${++count}`, selectedModel: { model: 'model' } }), dispatch: async () => {},
  } })
  const create = (workspaceId: string) => {
    store.ensureFunctionBindings(workspaceId, WORKBENCH_FUNCTIONS, { presetId: 'preset', agentModel: { provider: 'provider', model: 'model' } })
    const { work, branch } = store.createWork({ workspaceId, name: workspaceId, goal: 'Paint a glasshouse' })
    return { workspaceId, workId: work.work_id, branchId: branch.branch_id }
  }
  cleanups.push(() => { database.close(); rmSync(directory, { recursive: true, force: true }) })
  return { database, store, service, create }
}

it('fills an editing draft from a published prompt and uses only saved input for the next task', async () => {
  const f = fixture(), scope = f.create('workspace-a')
  const before = f.store.getBranch(scope.branchId).draft
  const task = await f.service.createTask({ ...scope, functionId: 'prompt' })
  const receipt = await f.service.publish({ taskId: task.task_id, artifact: { type: 'prompt', positive_prompt: 'Warm glasshouse', negative_prompt: 'blur' } }, { workspaceId: 'workspace-b', sessionId: task.session_id!, turn: 1, callId: 'publish' })
  expect(receipt.disposition).toBe('applied')
  expect(f.store.getBranch(scope.branchId).draft).toEqual(before)
  expect(f.store.getBranch(scope.branchId).editing_draft?.prompt_input.positive_prompt).toBe('Warm glasshouse')
  const next = await f.service.createTask({ ...scope, functionId: 'prompt' })
  expect(next.input.prompt_input).toEqual(before.prompt_input)
})

it('fixes cross-workspace task artifacts and independent experience contents when a task is created', async () => {
  const f = fixture(), source = f.create('workspace-a'), destination = f.create('workspace-b')
  const sourceTask = await f.service.createTask({ ...source, functionId: 'prompt' })
  const artifact = { type: 'prompt' as const, positive_prompt: 'Rain on glass', negative_prompt: '' }
  const receipt = await f.service.publish({ taskId: sourceTask.task_id, artifact }, { workspaceId: source.workspaceId, sessionId: sourceTask.session_id!, turn: 1, callId: 'source' })
  const experience = f.store.saveExperience({ title: 'Glass details', conditions: 'Glasshouse scenes', note: 'Use rain on glass at 24 steps.' })
  const branch = f.store.getBranch(destination.branchId)
  const draft = { ...branch.draft, reference_task_ids: [sourceTask.task_id], reference_experiences: [{ experience_id: experience.experience_id, title: experience.title, conditions: experience.conditions, note: experience.note, provenance: experience.provenance }] }
  f.store.saveBranchDraft({ ...destination, expected: branch.draft, draft })
  const task = await f.service.createTask({ ...destination, functionId: 'prompt' })
  f.store.saveExperience({ experienceId: experience.experience_id, title: 'Changed', conditions: 'Changed', note: 'Changed' })
  const read = await f.service.getTask({ taskId: task.task_id }, { workspaceId: source.workspaceId, sessionId: 'other-reader', turn: 1, callId: 'read' })
  expect(read.reference_task_artifacts).toEqual([{ task_id: sourceTask.task_id, artifact_id: receipt.artifact_id, artifact }])
  expect(read.reference_experiences[0]).toMatchObject({ title: 'Glass details', note: 'Use rain on glass at 24 steps.', provenance: { created_by_task_id: null, evidence: [] } })
  expect(read.reference_task_ids).toEqual([sourceTask.task_id])
  expect(read.reference_run_ids).toEqual([])
  const records = f.store.queryRecords({ type: 'task', workspaceId: source.workspaceId })
  expect(records.map(item => item.id)).toEqual([sourceTask.task_id])
  expect(contracts.parse('workbenchRecord', 'output', records[0])).toMatchObject({ type: 'task', task: { task_id: sourceTask.task_id }, artifacts: [{ artifact_id: receipt.artifact_id }] })
  expect(() => contracts.parse('workbenchRecord', 'output', { ...records[0], task: { ...sourceTask, input: { invalid: true } } })).toThrow()
  f.store.setFavorite({ workspaceId: source.workspaceId, workId: source.workId, targetType: 'experience', targetId: experience.experience_id, favorite: true })
  expect(f.store.getProjection({ workspaceId: 'empty' }).experiences[0]?.title).toBe('Changed')
  expect(f.store.getProjection({ workspaceId: 'empty' }).favorites).toEqual([{ target_type: 'experience', target_id: experience.experience_id }])
})

it('keeps image uses and ordered workflow bindings when saving and reading a task', async () => {
  const f = fixture(), scope = f.create('workspace-a'), branch = f.store.getBranch(scope.branchId)
  const image = { image_ref_id: 'image-a', source: { kind: 'uploaded_file' as const, file_id: 'file-a' }, purpose: 'both' as const, reference_requirement: 'Keep the window frame' }
  const draft = { ...branch.draft, instructions: 'Use a wider window', image_refs: [image], workflow_image_bindings: [{ parameter_id: 'source', image_ref_ids: ['image-a'] }] }
  f.store.saveBranchDraft({ ...scope, expected: branch.draft, draft })
  const task = await f.service.createTask({ ...scope, functionId: 'prompt' })
  const read = await f.service.getTask({ taskId: task.task_id }, { workspaceId: 'other', sessionId: 'reader', turn: 1, callId: 'read-images' })
  expect(read.image_refs).toEqual([image])
  expect(read.workflow_image_bindings).toEqual([{ parameter_id: 'source', image_ref_ids: ['image-a'] }])
  expect(read.requirements.instructions).toBe('Use a wider window')
  expect(() => f.store.saveBranchDraft({ ...scope, expected: draft, draft: { ...draft, image_refs: [{ ...image, purpose: 'agent' }] } })).toThrow('Workflow')
  expect(() => f.store.saveBranchDraft({ ...scope, expected: draft, draft: { ...draft, workflow_image_bindings: [{ parameter_id: 'source', image_ref_ids: ['missing'] }] } })).toThrow('Workflow')
})

it('adds reference defaults to historical records while keeping their identifiers and source payloads', async () => {
  const f = fixture(), scope = f.create('workspace-a'), task = await f.service.createTask({ ...scope, functionId: 'prompt' })
  const oldInput = { prompt_input: task.input.prompt_input, generation_input: task.input.generation_input, base_model_id: null, context_refs: [{ kind: 'character', id: '2' }], requirements: task.input.requirements, reference_run_ids: [], requested_skill: null, max_runs: 0 }
  f.database.prepare('UPDATE workbench_tasks SET input_json=? WHERE task_id=?').run(JSON.stringify(oldInput), task.task_id)
  const reopened = new WorkbenchStore({ database: f.database, artifactDirectory: f.store.artifactDirectory })
  expect(reopened.getTask(task.task_id).input).toMatchObject({ reference_task_ids: [], reference_task_artifacts: [], reference_experiences: [], image_refs: [], workflow_image_bindings: [] })
  expect(reopened.getTask(task.task_id).input).not.toHaveProperty('context_refs')
  expect(reopened.getTask(task.task_id).branch_id).toBe(scope.branchId)
  expect(JSON.parse(String(f.database.prepare('SELECT input_json FROM workbench_tasks WHERE task_id=?').get(task.task_id)!.input_json)).context_refs).toEqual([{ kind: 'character', id: '2' }])
})

it('migrates required experience sources and keeps existing task and experience links', async () => {
  const f = fixture(), scope = f.create('workspace-a'), task = await f.service.createTask({ ...scope, functionId: 'prompt' })
  f.database.exec('PRAGMA foreign_keys = OFF; DROP TABLE workbench_experiences; CREATE TABLE workbench_experiences (experience_id TEXT PRIMARY KEY, work_id TEXT NOT NULL, branch_id TEXT NOT NULL, task_id TEXT REFERENCES workbench_tasks(task_id), title TEXT NOT NULL, conditions TEXT NOT NULL, note TEXT NOT NULL, base_model_id TEXT, model_id TEXT, evidence_run_ids_json TEXT NOT NULL, source_run_id TEXT NOT NULL REFERENCES generation_runs(run_id), source_experience_id TEXT REFERENCES workbench_experiences(experience_id), source_artifact_id TEXT REFERENCES workbench_task_artifacts(artifact_id), FOREIGN KEY(work_id,branch_id) REFERENCES workbench_branches(work_id,branch_id)); PRAGMA foreign_keys = ON')
  const reopened = new WorkbenchStore({ database: f.database, artifactDirectory: f.store.artifactDirectory })
  const manual = reopened.saveExperience({ title: 'Prompt advice', conditions: 'Glasshouse', note: 'Describe the droplets.' })
  expect(manual).toMatchObject({ work_id: null, branch_id: null, source_run_id: null, provenance: { created_by_task_id: null, evidence: [] } })
  expect(reopened.getTask(task.task_id).branch_id).toBe(scope.branchId)
  expect(f.database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})

it('preserves unsaved input when only the execution mode or run limit changes', () => {
  const f = fixture(), scope = f.create('workspace-a'), branch = f.store.getBranch(scope.branchId)
  const editing = { ...branch.draft, prompt_input: { positive_prompt: 'Unsaved droplets', negative_prompt: '' } }
  f.store.saveEditingDraft({ ...scope, draft: editing })
  f.store.saveBranchExecution({ ...scope, execution: { mode: 'continuous', max_runs: 5 } })
  expect(f.store.getBranch(scope.branchId)).toMatchObject({ draft: branch.draft, editing_draft: editing, execution: { mode: 'continuous', max_runs: 5 } })
})

it('merges separate editing fields and keeps a conflicting Agent result until the caller resolves it', () => {
  const f = fixture(), scope = f.create('workspace-a'), branch = f.store.getBranch(scope.branchId)
  const agent = { ...branch.draft, prompt_input: { positive_prompt: 'Agent droplets', negative_prompt: '' } }
  f.store.saveEditingDraft({ ...scope, expected: branch.draft, draft: agent })
  const user = { ...branch.draft, prompt_input: { ...branch.draft.prompt_input, negative_prompt: 'Exclude glare' } }
  const merged = f.store.saveEditingDraft({ ...scope, expected: branch.draft, draft: user })
  expect(merged.editing_draft?.prompt_input).toEqual({ positive_prompt: 'Agent droplets', negative_prompt: 'Exclude glare' })
  expect(() => f.store.saveEditingDraft({ ...scope, expected: branch.draft, draft: { ...user, prompt_input: { positive_prompt: 'Stale replacement', negative_prompt: 'Exclude glare' } } })).toThrow('编辑内容已改变')
  expect(f.store.getBranch(scope.branchId).editing_draft?.prompt_input.positive_prompt).toBe('Agent droplets')
  expect(() => f.store.saveEditingDraft({ ...scope, expected: branch.draft, draft: null })).toThrow('编辑内容已改变')
  f.store.saveEditingDraft({ ...scope, expected: merged.editing_draft!, draft: null })
  expect(f.store.getBranch(scope.branchId)).toMatchObject({ editing_draft: null, draft: branch.draft })
})

it('preserves an Agent update that arrives after the editor prepared a save', () => {
  const f = fixture(), scope = f.create('workspace-a'), branch = f.store.getBranch(scope.branchId)
  const user = { ...branch.draft, prompt_input: { positive_prompt: 'User droplets', negative_prompt: '' } }
  f.store.saveEditingDraft({ ...scope, expected: branch.draft, draft: user })
  const agent = { ...user, prompt_input: { ...user.prompt_input, negative_prompt: 'Agent exclusion' } }
  f.store.saveEditingDraft({ ...scope, expected: user, draft: agent })
  expect(() => f.store.saveBranchDraft({ ...scope, expected: branch.draft, expectedEditingDraft: user, draft: user })).toThrow('编辑内容已改变')
  expect(f.store.getBranch(scope.branchId)).toMatchObject({ draft: branch.draft, editing_draft: agent })
  f.store.saveBranchDraft({ ...scope, expected: branch.draft, expectedEditingDraft: agent, draft: agent })
  expect(f.store.getBranch(scope.branchId)).toMatchObject({ draft: agent, editing_draft: null })
})

it('opens newly created work and branches in edit mode and keeps an explicitly saved empty prompt in read mode', () => {
  const f = fixture(), scope = f.create('workspace-a'), branch = f.store.getBranch(scope.branchId)
  expect(branch.editing_draft).toEqual(branch.draft)
  f.store.saveBranchDraft({ ...scope, expected: branch.draft, expectedEditingDraft: branch.editing_draft, draft: branch.draft })
  expect(f.store.getBranch(scope.branchId).editing_draft).toBeNull()
  const child = f.store.createBranch({ workId: scope.workId, parentBranchId: scope.branchId, name: 'Copied input', originalRequest: 'Keep the frame', draft: branch.draft })
  expect(child.editing_draft).toEqual(branch.draft)
  expect(f.store.getBranch(scope.branchId).editing_draft).toBeNull()
})

it('keeps the global experience collection unchanged when a supplied evidence Run cannot be resolved', () => {
  const f = fixture()
  expect(() => f.store.saveExperience({ title: 'Evidence', conditions: 'Glass', note: 'Keep the frame', provenance: { created_by_task_id: null, evidence: [{ run_id: 'missing', generation_task_id: null, role: 'counterexample' }] } })).toThrow('运行不存在')
  expect(f.store.listExperiences()).toEqual([])
})

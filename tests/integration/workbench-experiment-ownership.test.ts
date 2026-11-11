import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import { toGenerationRequest } from '../../src/cli/contract.ts'
import { GenerationRuntime } from '../../src/host/generation/generation-runtime.ts'
import { WorkbenchStore } from '../../src/host/storage/workbench-store.ts'
import type { ArtifactPayload, GenerationInput, Task, TaskInput } from '../../src/workbench/contract.ts'
import { WORKBENCH_FUNCTIONS } from '../../src/workbench/functions.ts'

const cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup() })

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'experiment-ownership-'))
  const database = new DatabaseSync(join(directory, 'runs.sqlite'))
  let store!: WorkbenchStore
  const runtime = new GenerationRuntime({
    database, runRepositoryFile: join(directory, 'runs.sqlite'), runDirectory: join(directory, 'runs'), savedMediaDirectory: join(directory, 'media'),
    preparer: { inspectRuntimeParameters: async () => ({ parameters: [], size_candidates: [] }), validateInput: async () => {}, prepare: async () => { throw new Error('Explicit advancement required') } },
    workbench: { taskWorkspace: id => store.taskWorkspace(id), assertGenerationAcceptance: input => store.assertGenerationAcceptance(input), registerGenerationRun: input => store.registerGenerationRun(input), generationRunChanged: id => store.generationRunChanged(id), reportError: error => store.reportError(error) },
  })
  store = new WorkbenchStore({ database, artifactDirectory: join(directory, 'artifacts') })
  const { branch } = store.createWork({ workspaceId: 'workspace', name: 'Glass', goal: 'Light through glass' })
  store.ensureFunctionBindings('workspace', WORKBENCH_FUNCTIONS, { presetId: 'preset', agentModel: { provider: 'provider', model: 'model' } })
  const create = (kind: Task['kind'], parent?: Task, inputOverride: Partial<TaskInput> = {}) => {
    const binding = store.listFunctionBindings('workspace').find(item => item.kind === kind)!
    const descriptor = WORKBENCH_FUNCTIONS.find(item => item.kind === kind)!
    const { instructions: _instructions, ...draft } = branch.draft
    const input: TaskInput = { ...draft, generation_input: { ...draft.generation_input, title: 'Glass', instance_id: '8', template_id: '5' }, requirements: { original_request: branch.original_request, instructions: 'Keep the glass' }, reference_task_artifacts: [], requested_skill: null, max_runs: kind === 'experiment' ? 2 : kind === 'run' ? 1 : 0, ...inputOverride }
    return store.createTask({ branchId: branch.branch_id, functionId: binding.function_id, title: binding.name, kind, input, bindingSnapshot: { function_id: binding.function_id, name: binding.name, kind: binding.kind, preset_id: binding.preset_id, agentModel: binding.agent_model, requested_skill: binding.requested_skill, request_template: binding.request_template }, outputContract: descriptor.output_contract, applyTarget: { kind: 'branch', id: branch.branch_id, expected: {} }, parentExperimentTaskId: parent?.task_id, initiator: parent ? 'agent' : 'human' })
  }
  const publish = (task: Task, artifact: ArtifactPayload) => store.publish(task.task_id, artifact, { workspaceId: 'workspace', sessionId: task.session_id ?? task.task_id, turn: 1, callId: randomUUID() })
  const submit = (task: Task, input: GenerationInput = task.input.generation_input, requestId = randomUUID(), sessionId = task.task_id) => runtime.acceptGenerations({ workspaceId: 'workspace', sessionId, turn: 1, callId: randomUUID() }, [{ requestId, request: toGenerationRequest({ ...input, instance_id: input.instance_id!, template_id: input.template_id! }) }], undefined, task.task_id)
  cleanups.push(() => { runtime.close(); database.close(); rmSync(directory, { recursive: true, force: true }) })
  return { database, store, runtime, branch, create, publish, submit }
}

it.each(['review', 'experience'] as const)('requires the evaluation target in child %s evidence even when another experiment Run is referenced', async kind => {
  const f = fixture(), parent = f.create('experiment')
  const first = f.create('run', parent, { delegation_source: { type: 'initial' } })
  const targetRunId = (await f.submit(first)).items[0]!.runId
  await f.runtime.advance()
  f.publish(parent, { type: 'review', run_ids: [targetRunId], observation: 'Template preparation failed', conclusion: 'Inspect the next attempt' })
  const candidate = f.publish(parent, { type: 'generation_input', generation_input: parent.input.generation_input })
  const second = f.create('run', parent, { delegation_source: { type: 'candidate', artifact_id: candidate.artifact_id } })
  const otherRunId = (await f.submit(second)).items[0]!.runId
  await f.runtime.advance()
  const child = f.create(kind, parent, {
    generation_input: f.store.getRun(targetRunId).generation_input,
    delegation_source: { type: 'run', run_id: targetRunId }, reference_run_ids: [targetRunId, otherRunId],
    evaluation_input: { run_id: targetRunId, verdict: 'needs-work', observation: '', conclusion: '', experience: { title: '', conditions: '', note: '' } },
  })
  const artifact: ArtifactPayload = kind === 'review'
    ? { type: 'review', observation: 'Template preparation failed', conclusion: 'Inspect the saved failure', run_ids: [otherRunId] }
    : { type: 'experience', title: 'Template failure', conditions: 'Template 5', note: 'Inspect the preparation error', base_model_id: null, model_id: null, run_ids: [otherRunId] }
  expect(() => f.publish(child, artifact)).toThrowError(expect.objectContaining({ code: 'WORKBENCH_EVIDENCE_REQUIRED', issues: [expect.objectContaining({ path: 'artifact.run_ids' })] }))
  expect(f.store.listArtifacts(child.task_id)).toEqual([])
  expect(f.store.getRun(otherRunId).review_artifact_id).toBeNull()
  const accepted = f.publish(child, { ...artifact, run_ids: [targetRunId] })
  expect(f.store.getArtifact(accepted.artifact_id).artifact).toMatchObject({ run_ids: [targetRunId] })
})

it('links child reviews and adopted iteration plans to parent rounds while keeping two experiments isolated', async () => {
  const f = fixture(), experiment = f.create('experiment'), parallel = f.create('experiment')
  const firstExecutor = f.create('run', experiment, { delegation_source: { type: 'initial' } })
  const firstRunId = (await f.submit(firstExecutor)).items[0]!.runId
  await f.runtime.advance()
  expect(f.store.getRun(firstRunId).status).toBe('failed')
  const reviewTask = (runId: string, parent = experiment) => f.create('review', parent, {
    generation_input: f.store.getRun(runId).generation_input, delegation_source: { type: 'run', run_id: runId }, reference_run_ids: [runId],
    evaluation_input: { run_id: runId, verdict: 'needs-work', observation: '', conclusion: '', experience: { title: '', conditions: '', note: '' } },
  })
  const reviewer = reviewTask(firstRunId)
  const review = f.publish(reviewer, { type: 'review', run_ids: [firstRunId], observation: 'Workflow preparation failed', conclusion: 'Select another template' })
  expect(f.store.getRun(firstRunId).review_artifact_id).toBe(review.artifact_id)
  const plan = f.publish(experiment, { type: 'iteration_plan', source_run_id: firstRunId, changes: ['Use template 6'], reason: 'Template 5 failed to prepare', expected_result: 'Generation starts' })
  const nextInput = { ...experiment.input.generation_input, template_id: '6' }
  const candidate = f.publish(experiment, { type: 'generation_input', generation_input: nextInput, plan_artifact_id: plan.artifact_id })
  const unselected = f.publish(experiment, { type: 'generation_input', generation_input: nextInput, plan_artifact_id: plan.artifact_id })
  const executor = f.create('run', experiment, { generation_input: nextInput, delegation_source: { type: 'candidate', artifact_id: candidate.artifact_id } })
  const secondRunId = (await f.submit(executor)).items[0]!.runId
  expect(f.store.getRun(secondRunId)).toMatchObject({ iteration_index: 2, workbench_task_id: experiment.task_id, execution_task_id: executor.task_id, candidate_artifact_id: candidate.artifact_id })
  await f.runtime.advance()
  const secondReview = f.publish(reviewTask(secondRunId), { type: 'review', run_ids: [secondRunId], observation: 'Template still failed', conclusion: 'Inspect the saved failure' })
  expect(f.store.getExperiment(experiment.task_id)).toMatchObject({ control_state: 'completed', end_reason: 'budget_used' })
  expect(f.store.getRun(secondRunId).review_artifact_id).toBe(secondReview.artifact_id)
  expect(f.store.listExperimentArtifacts(experiment.task_id).map(item => item.artifact_id)).toEqual([review.artifact_id, plan.artifact_id, candidate.artifact_id, unselected.artifact_id, secondReview.artifact_id])
  expect(f.store.listExperimentArtifacts(parallel.task_id)).toEqual([])
  expect(() => f.create('run', parallel, { generation_input: nextInput, delegation_source: { type: 'candidate', artifact_id: candidate.artifact_id } })).toThrow()
  expect(() => f.create('run', experiment, { generation_input: { ...nextInput, template_id: '7' }, delegation_source: { type: 'candidate', artifact_id: candidate.artifact_id } })).toThrow()
  expect(f.store.getBranch(f.branch.branch_id).draft.generation_input.template_id).toBeNull()
})

it('saves child experience only after user confirmation and retains the child artifact provenance', async () => {
  const f = fixture(), parent = f.create('experiment')
  const executor = f.create('run', parent, { delegation_source: { type: 'initial' } })
  const runId = (await f.submit(executor)).items[0]!.runId
  await f.runtime.advance()
  const child = f.create('experience', parent, {
    generation_input: f.store.getRun(runId).generation_input, delegation_source: { type: 'run', run_id: runId }, reference_run_ids: [runId],
    evaluation_input: { run_id: runId, verdict: 'needs-work', observation: '', conclusion: '', experience: { title: '', conditions: '', note: '' } },
  })
  const artifact = f.publish(child, { type: 'experience', title: 'Template failure', conditions: 'Template 5', note: 'Inspect the saved preparation error', base_model_id: null, model_id: null, run_ids: [runId] })
  expect(artifact.disposition).toBe('recorded')
  expect(f.store.listExperiences()).toEqual([])
  const expected = f.store.getRunReviewDraft(runId)
  const draft = { ...expected, title: 'Template failure', conditions: 'Template 5', note: 'Inspect the saved preparation error', evidence_run_ids: [runId], experience_artifact_id: artifact.artifact_id }
  const saved = f.store.saveRunReview({ workspaceId: 'workspace', workId: f.branch.work_id, runId, expected, draft, saveExperience: true })
  expect(f.store.getExperience(saved.experience_id!)).toMatchObject({ task_id: child.task_id, source_artifact_id: artifact.artifact_id, source_run_id: runId, provenance: { created_by_task_id: child.task_id, evidence: [{ run_id: runId, generation_task_id: parent.task_id, role: 'supporting_evidence' }] } })
})

it('keeps fixed child inputs and snapshots, aggregates only direct experiment artifacts and preserves the editing draft', () => {
  const f = fixture()
  const first = f.create('experiment'), second = f.create('experiment')
  const originalDraft = f.store.getBranch(f.branch.branch_id).draft
  const child = f.create('prompt', first, { delegation_source: { type: 'initial' } })
  const other = f.create('prompt', second, { delegation_source: { type: 'initial' } })
  const question = f.publish(child, { type: 'question', question: 'Which light?', options: ['Dawn', 'Noon'] })
  const prompt = f.publish(child, { type: 'prompt', positive_prompt: 'dawn light through glass', negative_prompt: null })
  f.publish(other, { type: 'prompt', positive_prompt: 'another experiment', negative_prompt: null })
  expect(f.store.getTask(child.task_id)).toMatchObject({ parent_experiment_task_id: first.task_id, input: { delegation_source: { type: 'initial' } }, binding_snapshot: child.binding_snapshot })
  expect(f.store.listChildTasks(first.task_id).map(item => item.task_id)).toEqual([child.task_id])
  expect(f.store.listExperimentArtifacts(first.task_id).map(item => [item.task_id, item.artifact_id])).toEqual([[child.task_id, question.artifact_id], [child.task_id, prompt.artifact_id]])
  expect(f.store.refreshTask(first.task_id).status).toBe('waiting_input')
  f.store.replyTask(child.task_id, question.artifact_id, 'Dawn')
  expect(f.store.refreshTask(first.task_id).status).not.toBe('waiting_input')
  expect(f.store.getBranch(f.branch.branch_id).draft).toEqual(originalDraft)
  expect(f.store.listExperimentArtifacts(second.task_id)).toHaveLength(1)
})

it('attributes child runs to the experiment, enforces fixed input and one run per executor, and replays only for that executor', async () => {
  const f = fixture(), experiment = f.create('experiment'), parallel = f.create('experiment')
  const child = f.create('run', experiment, { delegation_source: { type: 'initial' } })
  const other = f.create('run', parallel, { delegation_source: { type: 'initial' } })
  await expect(f.submit(child, { ...child.input.generation_input, parameters: { seed: 999 } })).rejects.toMatchObject({ code: 'WORKBENCH_INPUT_MISMATCH' })
  const requestId = randomUUID(), sessionId = 'run-child'
  const accepted = await f.submit(child, child.input.generation_input, requestId, sessionId)
  const runId = accepted.items[0]!.runId
  expect(f.store.getRun(runId)).toMatchObject({ workbench_task_id: experiment.task_id, execution_task_id: child.task_id, iteration_index: 1 })
  expect((await f.submit(child, child.input.generation_input, requestId, sessionId)).items[0]).toMatchObject({ runId, acceptance: 'reused' })
  await expect(f.submit(experiment, child.input.generation_input, requestId, sessionId)).rejects.toMatchObject({ code: 'RUN_REQUEST_CONFLICT' })
  await expect(f.submit(other, other.input.generation_input, requestId, sessionId)).rejects.toMatchObject({ code: 'RUN_REQUEST_CONFLICT' })
  await expect(f.submit(child)).rejects.toMatchObject({ code: 'WORKBENCH_BUDGET_EXHAUSTED' })
  const otherRunId = (await f.submit(other)).items[0]!.runId
  expect(f.store.listRuns(experiment.task_id).map(run => run.run_id)).toEqual([runId])
  expect(f.store.listRuns(child.task_id).map(run => run.run_id)).toEqual([runId])
  expect(f.store.listRuns(parallel.task_id).map(run => run.run_id)).toEqual([otherRunId])
  expect(f.store.getProjection({ workspaceId: 'workspace' }).runs.map(run => run.run_id)).toEqual([runId, otherRunId])
})

import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { GenerationRuntime, type GenerationRunStatus } from '../../src/host/generation/generation-runtime.js'
import { WorkbenchStore } from '../../src/host/storage/workbench-store.js'
import { WorkbenchService } from '../../src/workbench/service.js'
import { WORKBENCH_FUNCTIONS } from '../../src/workbench/functions.js'
import type { GenerationInput } from '../../src/workbench/contract.js'

const dispose: (() => void)[] = []
afterEach(() => { for (const callback of dispose.splice(0).reverse()) callback() })

function request(input: GenerationInput) {
  return { title: input.title, instanceId: input.instance_id, templateId: input.template_id!, model: input.model ? { id: input.model.id, fileName: input.model.file_name } : null, parameters: input.parameters, loras: input.loras.map(lora => ({ id: lora.id, fileName: lora.file_name, weight: lora.weight, triggerWords: lora.trigger_words })) }
}

async function generatingTask() {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-generation-events-'))
  dispose.push(() => rmSync(directory, { force: true, recursive: true }))
  const database = new DatabaseSync(':memory:')
  dispose.push(() => database.close())
  let store: WorkbenchStore
  const calls = { submitted: 0, downloaded: 0 }
  const fault: { status?: GenerationRunStatus; media?: boolean; submissionError?: Error } = {}
  const runtime = new GenerationRuntime({
    database, runRepositoryFile: join(directory, 'runs.sqlite'), runDirectory: join(directory, 'runs'), savedMediaDirectory: join(directory, 'media'),
    preparer: {
      inspectRuntimeParameters: async () => ({ parameters: [], size_candidates: [] }),
      prepare: async () => ({
        instanceId: '1', instanceTitle: 'ComfyUI', templateTitle: 'Rain',
        inputDescription: { parameters: [], size_candidates: [] }, sourceSnapshot: {},
        actualWorkflow: { version: 0.4 }, apiWorkflow: { '3': { class_type: 'SaveImage', inputs: {} } },
        expectedOutputNodeIds: ['3'], connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      }),
    },
    transport: {
      submit: async input => {
        if (!input.onRequestStart()) throw new Error('Submission did not reach the request boundary')
        calls.submitted++
        if (fault.submissionError) throw fault.submissionError
        return { promptId: input.promptId }
      },
      observe: async () => ({ status: 'success', outputs: [{ nodeId: '3', outputIndex: 0, mediaKind: 'image', filename: 'rain.png', subfolder: '', type: 'output' }] }),
      download: async () => { calls.downloaded++; return { bytes: new Uint8Array([1, 2, 3]), mediaType: 'image/png' } },
    },
    workbench: {
      taskWorkspace: id => store.taskWorkspace(id),
      assertGenerationAcceptance: input => store.assertGenerationAcceptance(input),
      registerGenerationRun: input => store.registerGenerationRun(input),
      generationRunChanged: id => {
        store.generationRunChanged(id)
        const run = store.getRun(id)
        if (fault.status === run.status || (fault.media && run.media.length > 0)) throw new Error('Workbench storage temporarily unavailable')
      },
      reportError: error => store.reportError(error),
    },
  })
  dispose.push(() => runtime.close())
  store = new WorkbenchStore({ database, artifactDirectory: join(directory, 'artifacts') })
  const { work, branch } = store.createWork({ workspaceId: 'workspace', name: 'Rain', goal: 'Rain' })
  store.ensureFunctionBindings('workspace', WORKBENCH_FUNCTIONS, { presetId: 'preset', agentModel: { provider: 'p', model: 'm' } })
  const draft = structuredClone(branch.draft)
  draft.generation_input.instance_id = '1'
  draft.generation_input.template_id = '2'
  store.saveBranchDraft({ workspaceId: 'workspace', workId: work.work_id, branchId: branch.branch_id, expected: branch.draft, draft })
  const service = new WorkbenchService({ store, descriptors: WORKBENCH_FUNCTIONS, sessions: { authorize: async () => true, create: async () => ({ sessionId: randomUUID(), selectedModel: {} }), dispatch: async () => {} } })
  const task = await service.createTask({ workspaceId: 'workspace', workId: work.work_id, branchId: branch.branch_id, functionId: 'run' })
  await runtime.acceptGenerations({ workspaceId: 'workspace', sessionId: task.session_id!, turn: 1, callId: 'call' }, [{ requestId: randomUUID(), request: request(task.input.generation_input) }], undefined, task.task_id)
  const runId = store.listRuns(task.task_id)[0]!.run_id
  const states: { status: GenerationRunStatus; media: number; task: string }[] = []
  const errors: unknown[] = []
  store.subscribe(() => {
    const run = store.getRun(runId)
    states.push({ status: run.status, media: run.media.length, task: store.getTask(task.task_id).status })
  }, error => errors.push(error))
  return { runtime, store, database, task, runId, calls, fault, states, errors }
}

it('recovers a rolled-back media commit through the generation worker without downloading it again', async () => {
  const fixture = await generatingTask()
  await fixture.runtime.advance()
  await fixture.runtime.advance()
  await fixture.runtime.advance()
  fixture.states.length = 0
  fixture.fault.media = true
  await fixture.runtime.advance()
  expect(fixture.errors).toHaveLength(1)
  expect(fixture.store.getRun(fixture.runId)).toMatchObject({ status: 'downloading', media: [] })
  expect(fixture.store.getTask(fixture.task.task_id).status).toBe('waiting_generation')
  expect(fixture.states).toEqual([])
  delete fixture.fault.media
  await fixture.runtime.advance()
  expect(fixture.store.getRun(fixture.runId)).toMatchObject({ status: 'succeeded', media: [{ filename: 'rain.png' }] })
  expect(fixture.store.getTask(fixture.task.task_id).status).toBe('succeeded')
  expect(fixture.calls).toEqual({ submitted: 1, downloaded: 1 })
  expect(fixture.states).toEqual([
    { status: 'downloading', media: 1, task: 'waiting_generation' },
    { status: 'succeeded', media: 1, task: 'succeeded' },
  ])
})

it('retains a downloading Run when media staging storage fails and retries through the worker', async () => {
  const fixture = await generatingTask()
  await fixture.runtime.advance()
  await fixture.runtime.advance()
  await fixture.runtime.advance()
  fixture.states.length = 0
  fixture.database.exec(`CREATE TEMP TRIGGER reject_media_staging BEFORE INSERT ON generation_media_staging
    BEGIN SELECT RAISE(ABORT, 'Media storage temporarily unavailable'); END;`)
  await fixture.runtime.advance()
  expect(fixture.errors).toHaveLength(1)
  expect(fixture.store.getRun(fixture.runId)).toMatchObject({ status: 'downloading', media: [] })
  expect(fixture.store.getTask(fixture.task.task_id).status).toBe('waiting_generation')
  expect(fixture.states).toEqual([])
  fixture.database.exec('DROP TRIGGER reject_media_staging')
  await fixture.runtime.advance()
  expect(fixture.store.getRun(fixture.runId)).toMatchObject({ status: 'succeeded', media: [{ filename: 'rain.png' }] })
  expect(fixture.store.getTask(fixture.task.task_id).status).toBe('succeeded')
})

it('keeps committed media while rolling back task completion until the next worker advance', async () => {
  const fixture = await generatingTask()
  await fixture.runtime.advance()
  await fixture.runtime.advance()
  await fixture.runtime.advance()
  fixture.states.length = 0
  fixture.fault.status = 'succeeded'
  await fixture.runtime.advance()
  expect(fixture.errors).toHaveLength(1)
  expect(fixture.store.getRun(fixture.runId)).toMatchObject({ status: 'downloading', media: [{ filename: 'rain.png' }] })
  expect(fixture.store.getTask(fixture.task.task_id).status).toBe('waiting_generation')
  expect(fixture.states).toEqual([{ status: 'downloading', media: 1, task: 'waiting_generation' }])
  delete fixture.fault.status
  await fixture.runtime.advance()
  expect(fixture.store.getRun(fixture.runId).status).toBe('succeeded')
  expect(fixture.store.getTask(fixture.task.task_id).status).toBe('succeeded')
  expect(fixture.calls).toEqual({ submitted: 1, downloaded: 1 })
  expect(fixture.states).toEqual([
    { status: 'downloading', media: 1, task: 'waiting_generation' },
    { status: 'succeeded', media: 1, task: 'succeeded' },
  ])
})

it('retries a rolled-back submission boundary before sending a ComfyUI request', async () => {
  const fixture = await generatingTask()
  await fixture.runtime.advance()
  fixture.states.length = 0
  fixture.fault.status = 'submitting'
  await fixture.runtime.advance()
  expect(fixture.errors).toHaveLength(1)
  expect(fixture.store.getRun(fixture.runId).status).toBe('prepared')
  expect(fixture.calls.submitted).toBe(0)
  expect(fixture.states).toEqual([])
  delete fixture.fault.status
  await fixture.runtime.advance()
  expect(fixture.store.getRun(fixture.runId).status).toBe('remote_pending')
  expect(fixture.calls.submitted).toBe(1)
  await fixture.runtime.advance()
  await fixture.runtime.advance()
  expect(fixture.store.getTask(fixture.task.task_id).status).toBe('succeeded')
  expect(fixture.calls).toEqual({ submitted: 1, downloaded: 1 })
})

it.each(['remote_pending', 'submission_unknown'] as const)('preserves a sent request after %s storage fails and recovers as unknown without resubmission', async status => {
  const fixture = await generatingTask()
  await fixture.runtime.advance()
  fixture.states.length = 0
  fixture.fault.status = status
  if (status === 'submission_unknown') fixture.fault.submissionError = new Error('Connection dropped after submission')
  await fixture.runtime.advance()
  expect(fixture.errors).toHaveLength(1)
  expect(fixture.store.getRun(fixture.runId).status).toBe('submitting')
  expect(fixture.store.getTask(fixture.task.task_id).status).toBe('waiting_generation')
  expect(fixture.states).toEqual([{ status: 'submitting', media: 0, task: 'waiting_generation' }])
  delete fixture.fault.status
  await fixture.runtime.advance()
  expect(fixture.store.getRun(fixture.runId)).toMatchObject({ status: 'submission_unknown', error: { code: 'COMFYUI_SUBMISSION_RESULT_UNKNOWN' } })
  expect(fixture.store.getTask(fixture.task.task_id).status).toBe('needs_attention')
  await fixture.runtime.advance()
  expect(fixture.calls).toEqual({ submitted: 1, downloaded: 0 })
  expect(fixture.states).toEqual([
    { status: 'submitting', media: 0, task: 'waiting_generation' },
    { status: 'submission_unknown', media: 0, task: 'needs_attention' },
  ])
})

it('rolls back a failed Run, advances the next Run, and retries after task storage recovers', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-events-'))
  const database = new DatabaseSync(':memory:')
  let store: WorkbenchStore
  const runtime = new GenerationRuntime({
    database, runRepositoryFile: join(directory, 'runs.sqlite'), runDirectory: join(directory, 'runs'), savedMediaDirectory: join(directory, 'media'),
    preparer: { inspectRuntimeParameters: async () => ({ parameters: [], size_candidates: [] }), prepare: async () => { throw new Error('Preparation failed') } },
    workbench: { taskWorkspace: id => store.taskWorkspace(id), assertGenerationAcceptance: input => store.assertGenerationAcceptance(input), registerGenerationRun: input => store.registerGenerationRun(input), generationRunChanged: id => store.generationRunChanged(id), reportError: error => store.reportError(error) },
  })
  try {
    store = new WorkbenchStore({ database, artifactDirectory: join(directory, 'artifacts') })
    const { work, branch } = store.createWork({ workspaceId: 'workspace', name: 'Rain', goal: 'Rain' })
    store.ensureFunctionBindings('workspace', WORKBENCH_FUNCTIONS, { presetId: 'preset', agentModel: { provider: 'p', model: 'm' } })
    const draft = structuredClone(branch.draft)
    draft.generation_input.instance_id = '1'
    draft.generation_input.template_id = '2'
    store.saveBranchDraft({ workspaceId: 'workspace', workId: work.work_id, branchId: branch.branch_id, expected: branch.draft, draft })
    const service = new WorkbenchService({ store, descriptors: WORKBENCH_FUNCTIONS, sessions: { authorize: async () => true, create: async () => ({ sessionId: randomUUID(), selectedModel: {} }), dispatch: async () => {} } })
    const task = await service.createTask({ workspaceId: 'workspace', workId: work.work_id, branchId: branch.branch_id, functionId: 'run' })
    await runtime.acceptGenerations({ workspaceId: 'workspace', sessionId: task.session_id!, turn: 1, callId: 'call' }, [{ requestId: randomUUID(), request: request(task.input.generation_input) }], undefined, task.task_id)
    const nextTask = await service.createTask({ workspaceId: 'workspace', workId: work.work_id, branchId: branch.branch_id, functionId: 'run' })
    await runtime.acceptGenerations({ workspaceId: 'workspace', sessionId: nextTask.session_id!, turn: 1, callId: 'next-call' }, [{ requestId: randomUUID(), request: request(nextTask.input.generation_input) }], undefined, nextTask.task_id)
    const states: string[] = []
    const deliveryErrors: unknown[] = []
    store.subscribe(() => states.push(store.getTask(task.task_id).status), error => deliveryErrors.push(error))
    database.exec(`CREATE TEMP TRIGGER reject_failed_task BEFORE UPDATE ON workbench_tasks
      WHEN NEW.status='failed' AND NEW.task_id='${task.task_id}' BEGIN SELECT RAISE(ABORT, 'Task storage temporarily unavailable'); END;`)
    await runtime.advance()
    expect(deliveryErrors).toHaveLength(1)
    expect(store.getTask(task.task_id).status).toBe('waiting_generation')
    expect(store.listRuns(task.task_id)[0]!.status).toBe('created')
    expect(store.getTask(nextTask.task_id).status).toBe('failed')
    expect(states).toEqual(['waiting_generation'])
    database.exec('DROP TRIGGER reject_failed_task')
    await runtime.advance()
    expect(store.getTask(task.task_id).status).toBe('failed')
    expect(store.listRuns(task.task_id)[0]!.status).toBe('failed')
    expect(states).toEqual(['waiting_generation', 'failed'])
  } finally { runtime.close(); database.close(); rmSync(directory, { force: true, recursive: true }) }
})

it('uses the real shared acceptance transaction and retries the saved actual input after branch edits', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-shared-runtime-'))
  dispose.push(() => rmSync(directory, { force: true, recursive: true }))
  const database = new DatabaseSync(':memory:')
  dispose.push(() => database.close())
  let store: WorkbenchStore
  const runtime = new GenerationRuntime({ database, runRepositoryFile: join(directory, 'runs.sqlite'), runDirectory: join(directory, 'runs'), savedMediaDirectory: join(directory, 'media'), preparer: { inspectRuntimeParameters: async () => ({ parameters: [], size_candidates: [] }), prepare: async () => { throw new Error('Acceptance must not start generation') } }, workbench: { taskWorkspace: taskId => store.taskWorkspace(taskId), assertGenerationAcceptance: input => store.assertGenerationAcceptance(input), registerGenerationRun: input => store.registerGenerationRun(input), generationRunChanged: id => store.generationRunChanged(id), reportError: error => store.reportError(error) } })
  dispose.push(() => runtime.close())
  store = new WorkbenchStore({ database, artifactDirectory: join(directory, 'artifacts') })
  const { work, branch } = store.createWork({ workspaceId: 'workspace', name: 'Rain', goal: 'rain on glass' })
  store.ensureFunctionBindings('workspace', WORKBENCH_FUNCTIONS, { presetId: 'preset', agentModel: { provider: 'provider', model: 'model' } })
  let preparations = 0
  const service = new WorkbenchService({ store, descriptors: WORKBENCH_FUNCTIONS, prepareGenerationInput: async draft => { preparations++; return { ...draft.generation_input, parameters: { ...draft.generation_input.parameters, seed: 42 } } }, sessions: { authorize: async ({ task, identity }) => task.session_id === identity.sessionId, create: async () => ({ sessionId: randomUUID(), selectedModel: {} }), dispatch: async () => {} } })
  const draft = structuredClone(branch.draft)
  draft.generation_input = { title: 'rain', instance_id: '1', template_id: '2', model: { id: '3', file_name: 'model.safetensors' }, parameters: { seed: 7, custom: ['a', { value: 1 }] }, loras: [{ id: '4', file_name: 'glass.safetensors', weight: 0.7, trigger_words: ['glass'] }] }
  store.saveBranchDraft({ workspaceId: 'workspace', workId: work.work_id, branchId: branch.branch_id, expected: branch.draft, draft })
  const task = await service.createTask({ workspaceId: 'workspace', workId: work.work_id, branchId: branch.branch_id, functionId: 'run' })
  const identity = { workspaceId: 'workspace', sessionId: task.session_id!, turn: 1, callId: 'submit' }
  await service.authorizeGeneration(task.task_id, identity)
  await expect(runtime.acceptGenerations(identity, [{ requestId: randomUUID(), request: request(task.input.generation_input) }, { requestId: randomUUID(), request: request(task.input.generation_input) }], undefined, task.task_id)).rejects.toMatchObject({ code: 'WORKBENCH_BUDGET_EXHAUSTED' })
  expect(store.listRuns(task.task_id)).toEqual([])
  expect(store.getTask(task.task_id).status).toBe('running')
  const requestId = randomUUID()
  const accepted = await runtime.acceptGenerations(identity, [{ requestId, request: request(task.input.generation_input) }], undefined, task.task_id)
  const replay = await runtime.acceptGenerations(identity, [{ requestId, request: request(task.input.generation_input) }], undefined, task.task_id)
  expect(replay.items).toEqual([{ ...accepted.items[0], acceptance: 'reused' }])
  const saved = store.listRuns(task.task_id)[0]!
  expect(saved.generation_input).toEqual(task.input.generation_input)
  expect(saved.workbench_task_id).toBe(task.task_id)
  database.prepare("UPDATE generation_runs SET status='failed',error_code='COMFYUI_PROMPT_REJECTED',error_message='node rejected' WHERE run_id=?").run(saved.run_id)
  expect(store.refreshTask(task.task_id).status).toBe('failed')
  const changed = structuredClone(draft); changed.prompt_input.positive_prompt = 'manual new prompt'; changed.generation_input.parameters.seed = 99
  store.saveBranchDraft({ workspaceId: 'workspace', workId: work.work_id, branchId: branch.branch_id, expected: draft, draft: changed })
  const retry = await service.createTask({ workspaceId: 'workspace', workId: work.work_id, branchId: branch.branch_id, functionId: 'run', retryOfRunId: saved.run_id })
  expect(preparations).toBe(1)
  expect(retry.input.generation_input).toEqual(saved.generation_input)
  expect(retry.input.reference_run_ids).toContain(saved.run_id)
  expect(retry.retry_of_run_id).toBe(saved.run_id)
  expect(store.getBranch(branch.branch_id).draft).toEqual(changed)
  runtime.close()
  expect(store.getWork(work.work_id).name).toBe('Rain')
})

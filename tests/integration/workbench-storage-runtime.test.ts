import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { GenerationRuntime } from '../../src/host/generation/generation-runtime.js'
import { WorkbenchStore } from '../../src/host/storage/workbench-store.js'
import { WorkbenchService } from '../../src/workbench/service.js'
import { WORKBENCH_FUNCTIONS } from '../../src/workbench/functions.js'
import type { GenerationInput } from '../../src/workbench/contract.js'

const dispose: (() => void)[] = []
afterEach(() => { for (const callback of dispose.splice(0).reverse()) callback() })

function request(input: GenerationInput) {
  return { title: input.title, instanceId: input.instance_id, templateId: input.template_id!, model: input.model ? { id: input.model.id, fileName: input.model.file_name } : null, parameters: input.parameters, loras: input.loras.map(lora => ({ id: lora.id, fileName: lora.file_name, weight: lora.weight, triggerWords: lora.trigger_words })) }
}

it('uses the real shared acceptance transaction and retries the saved actual input after branch edits', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-shared-runtime-'))
  dispose.push(() => rmSync(directory, { force: true, recursive: true }))
  const database = new DatabaseSync(':memory:')
  dispose.push(() => database.close())
  let store: WorkbenchStore
  const runtime = new GenerationRuntime({ database, runRepositoryFile: join(directory, 'runs.sqlite'), runDirectory: join(directory, 'runs'), savedMediaDirectory: join(directory, 'media'), preparer: { inspectRuntimeParameters: async () => ({ parameters: [], size_candidates: [] }), prepare: async () => { throw new Error('Acceptance must not start generation') } }, workbench: { taskWorkspace: taskId => store.taskWorkspace(taskId), assertGenerationAcceptance: input => store.assertGenerationAcceptance(input), registerGenerationRun: input => store.registerGenerationRun(input) } })
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

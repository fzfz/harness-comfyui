import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import { GenerationRuntime, type GenerationRequest } from '../../src/host/generation/generation-runtime.ts'

const dispose: (() => void)[] = []
afterEach(() => { for (const close of dispose.splice(0).reverse()) close() })
const identity = { workspaceId: 'workspace-a', sessionId: 'session-a', turn: 1, callId: 'call-a' }
const request: GenerationRequest = { title: '暖光', instanceId: '1', templateId: '2', model: null, parameters: {}, loras: [] }

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-generation-'))
  dispose.push(() => rmSync(directory, { recursive: true, force: true }))
  const database = new DatabaseSync(join(directory, 'runs.sqlite'))
  dispose.push(() => database.close())
  const calls: string[] = []
  let reject = false
  const runtime = new GenerationRuntime({
    database,
    runRepositoryFile: join(directory, 'runs.sqlite'),
    runDirectory: join(directory, 'runs'), savedMediaDirectory: join(directory, 'media'),
    preparer: { prepare: async () => { throw new Error('Acceptance must not prepare a workflow') }, inspectRuntimeParameters: async () => ({ parameters: [], size_candidates: [] }) },
    workbench: {
      assertGenerationAcceptance: input => {
        calls.push(`check:${input.taskId}:${input.reused}`)
        if (reject) throw new Error('Task Run budget exhausted')
        return { iterationIndex: 1, candidateArtifactId: null, initiator: 'human', retryOfRunId: null }
      },
      registerGenerationRun: input => {
        calls.push(`record:${input.taskId}`)
        database.prepare("UPDATE generation_runs SET workbench_task_id=?, iteration_index=1, initiator='human' WHERE run_id=?").run(input.taskId, input.runId)
      },
    },
  })
  dispose.push(() => runtime.close())
  return { database, runtime, calls, reject: () => { reject = true } }
}

it('shares the plugin connection and keeps its ownership outside GenerationRuntime', () => {
  const { runtime, database } = fixture()
  runtime.close()
  expect(database.prepare('SELECT COUNT(*) AS count FROM generation_runs').get()).toMatchObject({ count: 0 })
})

it('accepts task ownership inside the existing transaction and rejects ownership changes on replay', async () => {
  const { runtime, database, calls } = fixture()
  const items = [{ requestId: randomUUID(), request }]
  const accepted = await runtime.acceptGenerations(identity, items, undefined, 'task-a')
  expect(database.prepare('SELECT workbench_task_id, iteration_index, initiator FROM generation_runs WHERE run_id=?').get(accepted.items[0]!.runId))
    .toMatchObject({ workbench_task_id: 'task-a', iteration_index: 1, initiator: 'human' })
  expect(calls).toEqual(['check:task-a:false', 'record:task-a'])
  expect((await runtime.acceptGenerations(identity, items, undefined, 'task-a')).items[0]!.acceptance).toBe('reused')
  await expect(runtime.acceptGenerations(identity, items)).rejects.toMatchObject({ code: 'RUN_REQUEST_CONFLICT' })
  await expect(runtime.acceptGenerations(identity, items, undefined, 'task-b')).rejects.toMatchObject({ code: 'RUN_REQUEST_CONFLICT' })
})

it('rolls back new Runs when task acceptance rejects the request', async () => {
  const { runtime, database, reject } = fixture()
  reject()
  await expect(runtime.acceptGenerations(identity, [{ requestId: randomUUID(), request }], undefined, 'task-a')).rejects.toThrow('budget exhausted')
  expect(database.prepare('SELECT COUNT(*) AS count FROM generation_runs').get()).toMatchObject({ count: 0 })
})

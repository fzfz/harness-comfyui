import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { createWorkbenchHostFixture } from '../support/workbench-host.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const signal = () => new AbortController().signal

it('provides the effective Run review draft for a displayed adoption snapshot', async () => {
  const { remote, runtime, dispose } = await createWorkbenchHostFixture()
  cleanups.push(dispose)
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint a glasshouse' } }, signal())
  await remote.mutate({ ...selected, type: 'update-draft', field: 'instance_id', value: '8' }, signal())
  for (const value of [{ kind: 'model', id: '2' }, { kind: 'comfyui-template', id: '5' }]) await remote.mutate({ ...selected, type: 'resource-select', value }, signal())
  const submission = await remote.mutate({ ...selected, type: 'run' }, signal())
  const task = (await remote.getProjection(selected, signal())).tasks.find(item => item.task_id === submission.taskId)!
  const accepted = await runtime.acceptGenerations({ workspaceId: selected.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'generation' }, [{
    requestId: randomUUID(), request: { title: 'Rain', instanceId: '8', templateId: '5', model: task.input.generation_input.model ? { id: '2', fileName: task.input.generation_input.model.file_name } : null, parameters: task.input.generation_input.parameters, loras: [] },
  }], undefined, task.task_id)
  const runId = accepted.items[0]!.runId
  const first = await remote.getProjection(selected, signal())
  expect(first.runs[0]!.review_draft).toEqual({
    verdict: 'unrated', observation: '', conclusion: '', title: '', conditions: '', note: '',
    evidence_run_ids: [runId], review_artifact_id: null, experience_artifact_id: null, experience_id: null,
  })
  const refreshed = await remote.getProjection(selected, signal())
  expect(refreshed.runs).toEqual(first.runs)
  expect(refreshed.runs[0]!.review).toBeNull()
  expect(refreshed.experiences).toEqual([])
  expect(refreshed.tasks).toHaveLength(1)
})

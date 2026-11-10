import { saveFixtureDraft } from '../support/workbench-draft.ts'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { createWorkbenchHostFixture } from '../support/workbench-host.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const signal = () => new AbortController().signal

it('keeps questions and answers in their original task while continuing the same Session', async () => {
  const host = await createWorkbenchHostFixture()
  cleanups.push(host.dispose)
  const { remote, ctx, official } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Light', goal: 'Paint the glasshouse' } }, signal())
  const first = await remote.mutate({ ...selected, type: 'agent-action', id: 'resources' }, signal())
  const second = await remote.mutate({ ...selected, type: 'agent-action', id: 'resources' }, signal())
  const initial = await remote.getProjection(selected, signal())
  const task = initial.tasks.find(item => item.task_id === first.taskId)!
  const other = initial.tasks.find(item => item.task_id === second.taskId)!
  const service = ctx.harnessComfyuiWorkbench.service
  const identity = { workspaceId: selected.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'light-question' }
  const firstQuestion = await service.publish({ taskId: task.task_id, artifact: { type: 'question', question: 'Which light?', options: ['Sun', 'Moon'] } }, identity)
  const otherQuestion = await service.publish({ taskId: other.task_id, artifact: { type: 'question', question: 'Which colour?', options: [] } }, { ...identity, sessionId: other.session_id!, callId: 'colour-question' })
  await expect(remote.mutate({ ...selected, type: 'task-answer', taskId: other.task_id, id: firstQuestion.artifact_id, value: 'Moon' }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_INVALID_INPUT' } })
  await remote.mutate({ ...selected, type: 'task-answer', taskId: task.task_id, id: firstQuestion.artifact_id, value: 'Moon' }, signal())
  const secondQuestion = await service.publish({ taskId: task.task_id, artifact: { type: 'question', question: 'What should stay visible?', options: [] } }, { ...identity, turn: 2, callId: 'detail-question' })
  const answer = 'Keep the window frames.\nShow the reflections.'
  await remote.mutate({ ...selected, type: 'task-answer', taskId: task.task_id, id: secondQuestion.artifact_id, value: answer }, signal())
  const taskInput = await service.getTask({ taskId: task.task_id }, identity)
  expect(taskInput.answers).toEqual([
    { question_artifact_id: firstQuestion.artifact_id, answer: 'Moon' },
    { question_artifact_id: secondQuestion.artifact_id, answer },
  ])
  expect(taskInput.requirements).toEqual(task.input.requirements)
  expect(official.controller.prompt).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: task.session_id, content: [{ type: 'text', text: task.request_text }] }), expect.any(AbortSignal))
  await service.publish({ taskId: task.task_id, artifact: { type: 'resources', refs: [{ kind: 'model', id: '2' }], reason: 'Preserve window frames and reflections in moonlight' } }, { ...identity, turn: 3, callId: 'prompt' })
  const completed = await remote.getProjection(selected, signal())
  expect(completed.tasks).toHaveLength(2)
  expect(completed.tasks.find(item => item.task_id === task.task_id)).toMatchObject({ session_id: task.session_id, status: 'succeeded', binding_snapshot: task.binding_snapshot, input: task.input })
  expect(completed.tasks.find(item => item.task_id === other.task_id)).toMatchObject({ status: 'waiting_input', answers: [] })
  expect(completed.artifacts.find(item => item.artifact_id === otherQuestion.artifact_id)?.artifact).toEqual({ type: 'question', question: 'Which colour?', options: [] })
  expect(completed.artifacts.find(item => item.task_id === task.task_id && item.artifact.type === 'resources')?.artifact).toEqual({ type: 'resources', refs: [{ kind: 'model', id: '2' }], reason: 'Preserve window frames and reflections in moonlight' })
})

it('interrupts and continues an Agent without cancelling or duplicating its accepted Run', async () => {
  const host = await createWorkbenchHostFixture()
  cleanups.push(host.dispose)
  const { remote, ctx, official, runtime } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Run control', goal: 'Paint rain' } }, signal())
  await saveFixtureDraft(remote, { ...selected }, draft => { draft.generation_input.instance_id = '8' }, signal())
  for (const value of [{ kind: 'model', id: '2' }, { kind: 'comfyui-template', id: '5' }]) { await remote.mutate({ ...selected, type: 'resource-select', value }, signal())
  await saveFixtureDraft(remote, { ...selected }, () => {}, signal()) }
  const acceptedTask = await remote.mutate({ ...selected, type: 'run' }, signal())
  const task = (await remote.getProjection(selected, signal())).tasks.find(item => item.task_id === acceptedTask.taskId)!
  const input = task.input.generation_input
  const identity = { workspaceId: selected.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'generation' }
  const request = { requestId: randomUUID(), request: { title: input.title, instanceId: input.instance_id, templateId: input.template_id!, model: input.model ? { id: input.model.id, fileName: input.model.file_name } : null, parameters: input.parameters, loras: input.loras.map(lora => ({ id: lora.id, fileName: lora.file_name, weight: lora.weight, triggerWords: lora.trigger_words })) } }
  const accepted = await runtime.acceptGenerations(identity, [request], undefined, task.task_id)
  const runId = accepted.items[0]!.runId
  expect((await remote.getProjection(selected, signal())).tasks[0]).toMatchObject({ status: 'waiting_generation', execution_state: 'running' })
  await remote.mutate({ ...selected, type: 'task-interrupt', taskId: task.task_id }, signal())
  const interrupted = await remote.getProjection(selected, signal())
  expect(official.controller.cancel).toHaveBeenCalledWith({ sessionId: task.session_id })
  expect(interrupted.tasks[0]).toMatchObject({ task_id: task.task_id, status: 'interrupted', execution_state: 'interrupted' })
  expect(interrupted.runs).toEqual([expect.objectContaining({ run_id: runId, status: 'created' })])
  await remote.mutate({ ...selected, type: 'task-resume', taskId: task.task_id }, signal())
  const resumed = await ctx.harnessComfyuiWorkbench.service.getTask({ taskId: task.task_id }, identity)
  expect(resumed.iterations.map(item => item.run_id)).toEqual([runId])
  expect(official.controller.create).toHaveBeenCalledOnce()
  expect(official.controller.prompt).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: task.session_id, content: [{ type: 'text', text: task.request_text }] }), expect.any(AbortSignal))
  expect((await runtime.acceptGenerations(identity, [request], undefined, task.task_id)).items[0]).toMatchObject({ runId, acceptance: 'reused' })
  await remote.mutate({ ...selected, type: 'task-interrupt', taskId: task.task_id }, signal())
  await runtime.advance()
  const finished = await remote.getProjection(selected, signal())
  expect(finished.tasks).toHaveLength(1)
  expect(finished.tasks[0]).toMatchObject({ task_id: task.task_id, session_id: task.session_id, status: 'interrupted' })
  expect(finished.runs).toEqual([expect.objectContaining({ run_id: runId, status: 'failed', error: expect.objectContaining({ message: 'Generation must be advanced explicitly' }) })])
})

import { saveFixtureDraft } from '../support/workbench-draft.ts'
import { afterEach, expect, it } from 'vitest'
import { createWorkbenchHostFixture } from '../support/workbench-host.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const signal = () => new AbortController().signal

it.each([
  { functionId: 'prompt', field: 'model', replacement: '4', artifact: { type: 'prompt', positive_prompt: 'Warm glasshouse', negative_prompt: 'blur' } },
  { functionId: 'parameters', field: 'comfyui-template', replacement: '6', artifact: { type: 'parameters', parameters: { steps: 28 } } },
  { functionId: 'parameters', field: 'instance_id', replacement: '9', artifact: { type: 'parameters', parameters: { steps: 28 } } },
])('keeps automatic $functionId output as a candidate when its $field changes', async ({ functionId, field, replacement, artifact }) => {
  const { remote, ctx, dispose, official } = await createWorkbenchHostFixture()
  official.controller.prompt.mockImplementation(official.acceptPrompt)
  cleanups.push(dispose)
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint a glasshouse' } }, signal())
  await saveFixtureDraft(remote, { ...selected }, draft => { draft.generation_input.instance_id = '8' }, signal())
  for (const value of [{ kind: 'model', id: '2' }, { kind: 'comfyui-template', id: '5' }]) { await remote.mutate({ ...selected, type: 'resource-select', value }, signal())
  await saveFixtureDraft(remote, { ...selected }, () => {}, signal()) }
  const submission = await remote.mutate({ ...selected, type: 'agent-action', id: functionId }, signal())
  const task = (await remote.getProjection(selected, signal())).tasks.find(item => item.task_id === submission.taskId)!
  if (field === 'instance_id') await saveFixtureDraft(remote, { ...selected }, draft => { draft.generation_input.instance_id = replacement }, signal())
  else { await remote.mutate({ ...selected, type: 'resource-select', value: { kind: field, id: replacement } }, signal())
  await saveFixtureDraft(remote, { ...selected }, () => {}, signal()) }
  const before = (await remote.getProjection(selected, signal())).branches[0]!
  const identity = { workspaceId: selected.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'publish' }
  const published = await ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id, artifact }, identity)
  expect(published.disposition).toBe('candidate')
  expect((await remote.getProjection(selected, signal())).branches[0]).toEqual(before)
  expect((await ctx.harnessComfyuiWorkbench.service.getTask({ taskId: task.task_id }, identity)).artifacts).toEqual([
    { task_id: task.task_id, artifact_id: published.artifact_id, artifact, disposition: 'candidate' },
  ])
})

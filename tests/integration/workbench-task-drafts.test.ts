import { afterEach, expect, it } from 'vitest'
import { WorkbenchStore } from '../../src/host/storage/workbench-store.ts'
import { createWorkbenchHostFixture } from '../support/workbench-host.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const signal = () => new AbortController().signal

async function fixture() {
  const host = await createWorkbenchHostFixture()
  cleanups.push(host.dispose)
  const selected = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Drafts', goal: 'Paint the rain' } }, signal())
  const scope = { workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId! }
  return { ...host, scope }
}

it('persists task requirements and resource overrides independently for each branch and function, including a cleared requirement', async () => {
  const { remote, scope, database, directory } = await fixture()
  const request = { ...scope, functionId: 'parameters' }
  expect(await remote.getTaskDraft(request, signal())).toBeNull()
  const draft = { instructions: 'Keep the rain\nUse a wide frame', resources: { instance_id: '8', template_id: null } }
  expect(await remote.saveTaskDraft({ ...request, draft }, signal())).toEqual(draft)
  await remote.saveTaskDraft({ ...scope, functionId: 'prompt', draft: { instructions: '', resources: {} } }, signal())
  const child = await remote.mutate({ ...scope, type: 'create-branch', value: { name: 'Second', original_request: 'Paint another scene' } }, signal())
  expect(await remote.getTaskDraft({ ...request, branchId: child.branchId! }, signal())).toBeNull()
  expect(await remote.getTaskDraft({ ...scope, functionId: 'rewrite' }, signal())).toBeNull()
  expect(await remote.getTaskDraft(request, signal())).toEqual(draft)
  expect(await remote.getTaskDraft({ ...scope, functionId: 'prompt' }, signal())).toEqual({ instructions: '', resources: {} })
  const reopened = new WorkbenchStore({ database, artifactDirectory: directory })
  expect(reopened.getTaskDraft(scope.branchId, 'parameters')).toEqual(draft)
  expect(reopened.getTaskDraft(scope.branchId, 'prompt')).toEqual({ instructions: '', resources: {} })
  await expect(remote.getTaskDraft({ ...request, workspaceId: 'workspace_2' }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_SCOPE_MISMATCH' } })
  await expect(remote.saveTaskDraft({ ...request, functionId: 'missing', draft }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_FUNCTION_NOT_FOUND' } })
})

it.each(['prompt', 'rewrite', 'resources'])('returns the accepted %s task ID, freezes its requirement and clears only its submitted branch-function draft', async functionId => {
  const { remote, scope, official } = await fixture()
  await remote.saveTaskDraft({ ...scope, functionId, draft: { instructions: 'Rain on glass', resources: {} } }, signal())
  const siblingId = functionId === 'prompt' ? 'rewrite' : 'prompt'
  const sibling = { instructions: 'Retain the reflection', resources: {} }
  await remote.saveTaskDraft({ ...scope, functionId: siblingId, draft: sibling }, signal())
  const accepted = await remote.mutate({ ...scope, type: 'agent-action', id: functionId }, signal())
  const projection = await remote.getProjection(scope, signal())
  expect(accepted).toEqual({ ...scope, taskId: projection.tasks[0]!.task_id })
  expect(projection.tasks[0]!.input.requirements).toEqual({ original_request: 'Paint the rain', instructions: 'Rain on glass' })
  expect(official.controller.prompt).toHaveBeenCalledTimes(1)
  expect(await remote.getTaskDraft({ ...scope, functionId }, signal())).toBeNull()
  expect(await remote.getTaskDraft({ ...scope, functionId: siblingId }, signal())).toEqual(sibling)
  await remote.saveTaskDraft({ ...scope, functionId, draft: { instructions: 'The next request', resources: {} } }, signal())
  expect((await remote.getProjection(scope, signal())).tasks[0]!.input.requirements.instructions).toBe('Rain on glass')
})

it.each(['create', 'dispatch'])('retains the saved request after official %s fails and clears it only when a retry is accepted', async failure => {
  const { remote, scope, official } = await fixture()
  const draft = { instructions: 'Keep this failed request', resources: {} }
  await remote.saveTaskDraft({ ...scope, functionId: 'prompt', draft }, signal())
  if (failure === 'create') official.controller.create.mockRejectedValueOnce(new Error('Host dispatch unavailable'))
  else official.controller.prompt.mockRejectedValueOnce(new Error('Host dispatch unavailable'))
  await expect(remote.mutate({ ...scope, type: 'agent-action', id: 'prompt' }, signal())).rejects.toThrow('Host dispatch unavailable')
  expect(await remote.getTaskDraft({ ...scope, functionId: 'prompt' }, signal())).toEqual(draft)
  const failed = (await remote.getProjection(scope, signal())).tasks[0]!
  expect(failed.execution_state).toBe('failed')
  expect(failed.input.requirements.instructions).toBe(draft.instructions)
  const accepted = await remote.mutate({ ...scope, type: 'agent-action', id: 'prompt' }, signal())
  expect(accepted.taskId).toEqual(expect.any(String))
  expect(await remote.getTaskDraft({ ...scope, functionId: 'prompt' }, signal())).toBeNull()
})

it('keeps a later request draft and prompt edit while the earlier task waits for official dispatch', async () => {
  const { remote, scope, official } = await fixture()
  const first = { instructions: 'Submitted request', resources: {} }
  const next = { instructions: 'Request for the next task', resources: {} }
  await remote.saveTaskDraft({ ...scope, functionId: 'prompt', draft: first }, signal())
  let enter!: () => void, release!: () => void
  const entered = new Promise<void>(resolve => { enter = resolve })
  const waiting = new Promise<void>(resolve => { release = resolve })
  official.controller.prompt.mockImplementationOnce(async () => { enter(); await waiting; return { accepted: true } })
  const submitting = remote.mutate({ ...scope, type: 'agent-action', id: 'prompt' }, signal())
  try {
    await entered
    await remote.saveTaskDraft({ ...scope, functionId: 'prompt', draft: next }, signal())
    await remote.mutate({ ...scope, type: 'update-draft', field: 'positive_prompt', value: 'A later manual prompt' }, signal())
  } finally { release() }
  const accepted = await submitting
  expect(accepted.taskId).toEqual(expect.any(String))
  expect(await remote.getTaskDraft({ ...scope, functionId: 'prompt' }, signal())).toEqual(next)
  const projection = await remote.getProjection(scope, signal())
  expect(projection.branches[0]!.draft.prompt_input.positive_prompt).toBe('A later manual prompt')
  expect(projection.tasks[0]!.input.requirements.instructions).toBe('Submitted request')
  expect(projection.tasks[0]!.input.prompt_input.positive_prompt).toBe('')
})

it('retains empty and nonempty instruction rows when adding resource storage to the existing task-draft table', async () => {
  const { scope, database, directory } = await fixture()
  database.exec('DROP TABLE workbench_task_drafts')
  database.exec('CREATE TABLE workbench_task_drafts(branch_id TEXT NOT NULL REFERENCES workbench_branches(branch_id),function_id TEXT NOT NULL,instructions TEXT NOT NULL,PRIMARY KEY(branch_id,function_id))')
  const insert = database.prepare('INSERT INTO workbench_task_drafts VALUES(?,?,?)')
  insert.run(scope.branchId, 'prompt', 'Existing request')
  insert.run(scope.branchId, 'rewrite', '')
  const reopened = new WorkbenchStore({ database, artifactDirectory: directory })
  expect(reopened.getTaskDraft(scope.branchId, 'prompt')).toEqual({ instructions: 'Existing request', resources: {} })
  expect(reopened.getTaskDraft(scope.branchId, 'rewrite')).toEqual({ instructions: '', resources: {} })
  reopened.saveTaskDraft(scope.branchId, 'parameters', { instructions: 'Use selected resources', resources: { instance_id: '9', template_id: '7' } })
  const again = new WorkbenchStore({ database, artifactDirectory: directory })
  expect(again.getTaskDraft(scope.branchId, 'parameters')).toEqual({ instructions: 'Use selected resources', resources: { instance_id: '9', template_id: '7' } })
})

it.each([
  ['remote', 'before-dispatch'], ['remote', 'during-dispatch'], ['service', 'before-dispatch'], ['service', 'during-dispatch'],
] as const)('fixes the complete %s submission snapshot and retains a later draft saved %s', async (boundary, edited) => {
  const { remote, scope, official, ctx } = await fixture()
  await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal())
  const first = { instructions: '  Submitted requirement\n', resources: { instance_id: '8', template_id: '5' } }
  const beforeDispatch = { instructions: 'A later requirement before dispatch', resources: { instance_id: '9', template_id: '6' } }
  const duringDispatch = { instructions: 'A later requirement during dispatch', resources: { instance_id: '10', template_id: '7' } }
  await remote.saveTaskDraft({ ...scope, functionId: 'parameters', draft: first }, signal())
  const submitted = structuredClone(first)
  await remote.saveTaskDraft({ ...scope, functionId: 'parameters', draft: beforeDispatch }, signal())
  let enter!: () => void, release!: () => void
  const entered = new Promise<void>(resolve => { enter = resolve })
  const waiting = new Promise<void>(resolve => { release = resolve })
  official.controller.prompt.mockImplementationOnce(async () => { enter(); await waiting; return { accepted: true } })
  const submitting = boundary === 'remote'
    ? remote.mutate({ ...scope, type: 'agent-action', id: 'parameters', value: { draft: submitted } }, signal())
    : ctx.harnessComfyuiWorkbench.service.createTask({ ...scope, functionId: 'parameters', taskDraft: submitted })
  try {
    await Promise.race([entered, submitting.then(() => { throw new Error('Submission completed before the official dispatch gate') })])
    if (edited === 'during-dispatch') await remote.saveTaskDraft({ ...scope, functionId: 'parameters', draft: duringDispatch }, signal())
  } finally { release() }
  await submitting
  const task = (await remote.getProjection(scope, signal())).tasks[0]!
  expect(task.input.requirements.instructions).toBe('Submitted requirement')
  expect(task.input.generation_input).toMatchObject({ instance_id: '8', template_id: '5' })
  expect(await remote.getTaskDraft({ ...scope, functionId: 'parameters' }, signal())).toEqual(edited === 'during-dispatch' ? duringDispatch : beforeDispatch)
})

it.each(['prompt', 'parameters'])('clears an unchanged raw %s draft after accepting its trimmed submission snapshot', async functionId => {
  const { remote, scope } = await fixture()
  await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal())
  const draft = { instructions: '  Keep the submitted requirement\n', resources: functionId === 'parameters' ? { instance_id: '8', template_id: '5' } : {} }
  await remote.saveTaskDraft({ ...scope, functionId, draft }, signal())
  const accepted = await remote.mutate({ ...scope, type: 'agent-action', id: functionId, value: { draft } }, signal())
  const task = (await remote.getProjection(scope, signal())).tasks.find(task => task.task_id === accepted.taskId)!
  expect(task.input.requirements.instructions).toBe('Keep the submitted requirement')
  expect(await remote.getTaskDraft({ ...scope, functionId }, signal())).toBeNull()
})

it('keeps explicit legacy instructions unchanged for service consumers that omit a submitted draft snapshot', async () => {
  const { remote, scope, ctx } = await fixture()
  await remote.saveTaskDraft({ ...scope, functionId: 'prompt', draft: { instructions: 'Saved requirement', resources: {} } }, signal())
  const task = await ctx.harnessComfyuiWorkbench.service.createTask({ ...scope, functionId: 'prompt', instructions: '  Preserve these spaces\n' })
  expect(task.input.requirements.instructions).toBe('  Preserve these spaces\n')
  expect(await remote.getTaskDraft({ ...scope, functionId: 'prompt' }, signal())).toBeNull()
})

it.each([null, {}, { instructions: 5, resources: {} }, { instructions: 'Invalid selection', resources: { template_id: '0' } }])('rejects an invalid submitted draft snapshot before accepting a task: %j', async draft => {
  const { remote, scope, official } = await fixture()
  const saved = { instructions: 'Keep the saved request', resources: {} }
  await remote.saveTaskDraft({ ...scope, functionId: 'prompt', draft: saved }, signal())
  await expect(remote.mutate({ ...scope, type: 'agent-action', id: 'prompt', value: { draft } }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_INVALID_INPUT' } })
  expect(await remote.getTaskDraft({ ...scope, functionId: 'prompt' }, signal())).toEqual(saved)
  expect((await remote.getProjection(scope, signal())).tasks).toEqual([])
  expect(official.controller.create).not.toHaveBeenCalled()
})

it('retains a newer draft saved while an explicit Remote submission waits for Workspace initialization', async () => {
  const { remote, store, official, ctx } = await fixture()
  const created = store.createWork({ workspaceId: 'workspace_2', name: 'Delayed scope', goal: 'Keep the selected task input' })
  const scope = { workspaceId: 'workspace_2', workId: created.work.work_id, branchId: created.branch.branch_id }
  store.saveFunctionBinding({ ...store.getFunctionBinding('workspace_1', 'parameters'), workspace_id: scope.workspaceId })
  store.saveBranchDraft({ ...scope, expected: created.branch.draft, draft: { ...created.branch.draft, base_model_id: '1', generation_input: { ...created.branch.draft.generation_input, model: { id: '2', file_name: 'paint.safetensors' } } } })
  const first = { instructions: '  Clicked requirement\n', resources: { instance_id: '8', template_id: '5' } }
  const later = { instructions: 'Saved while the request waits', resources: { instance_id: '9', template_id: '6' } }
  ctx.harnessComfyuiWorkbench.service.saveTaskDraft({ ...scope, functionId: 'parameters', draft: first })
  const models = await official.controller.modelCatalog()
  let enter!: () => void, release!: () => void
  const entered = new Promise<void>(resolve => { enter = resolve })
  const waiting = new Promise<void>(resolve => { release = resolve })
  official.controller.modelCatalog.mockImplementationOnce(async () => { enter(); await waiting; return models })
  const submitting = remote.mutate({ ...scope, type: 'agent-action', id: 'parameters', value: { draft: structuredClone(first) } }, signal())
  try {
    await Promise.race([entered, submitting.then(() => { throw new Error('Submission completed before the official model catalog gate') })])
    ctx.harnessComfyuiWorkbench.service.saveTaskDraft({ ...scope, functionId: 'parameters', draft: later })
  } finally { release() }
  const accepted = await submitting
  const task = (await remote.getProjection(scope, signal())).tasks.find(task => task.task_id === accepted.taskId)!
  expect(task.input.requirements.instructions).toBe('Clicked requirement')
  expect(task.input.generation_input).toMatchObject({ instance_id: '8', template_id: '5' })
  expect(await remote.getTaskDraft({ ...scope, functionId: 'parameters' }, signal())).toEqual(later)
})

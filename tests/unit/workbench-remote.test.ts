import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { WorkbenchRemoteService } from '../../src/host/workbench/remote-service.ts'
import { WORKBENCH_REMOTE } from '../../src/workbench-remote.ts'
import { WorkbenchError } from '../../src/workbench/validation.ts'
import type { WorkbenchProjection } from '../../src/workbench/contract.ts'
import { createWorkbenchHostFixture } from '../support/workbench-host.ts'

function projection(): WorkbenchProjection {
  return {
    workspace_id: 'workspace_1', total_branch_count: 0, work_id: 'work_1', works: [], branches: [], tasks: [], artifacts: [], experiments: [], experiences: [], favorites: [], functions: [], refreshAfterMs: 777,
    runs: [{
      run_id: 'run_1', session_id: 'session_1', workbench_task_id: 'task_1', iteration_index: 1, status: 'succeeded', title: 'Rain', created_at: 1, updated_at: 2,
      generation_input: { title: 'Rain', instance_id: '8', template_id: '5', model: null, parameters: {}, loras: [] },
      candidate_artifact_id: null, review_artifact_id: null, retry_of_run_id: null, initiator: 'human', review: null, review_draft: null, error: null,
      media: [{ media_id: 'media_1', run_id: 'run_1', filename: 'rain.png', media_type: 'image/png', media_kind: 'image', byte_size: 123 }],
    }],
  }
}
function fixture() {
  const context = new Context()
  const initializeWorkspace = vi.fn(async () => {})
  const getProjection = vi.fn(async () => projection())
  const environment = vi.fn(async () => ({ workspaces: [], presets: [], models: { default: { provider: 'p', model: 'm' }, groups: [], failures: [], routableProviders: [] }, skills: [], instances: [] }))
  context.provide('harnessComfyuiWorkbench' as never, { initializeWorkspace, service: { getProjection }, environment } as never)
  return { remote: new WorkbenchRemoteService(context), initializeWorkspace, getProjection, environment }
}

it('describes the current branch or a fixed Run input and rejects another Workspace or Work', async () => {
  const host = await createWorkbenchHostFixture()
  try {
    const { remote, inspect, description, runtime } = host
    const signal = new AbortController().signal
    const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal)
    const scope = { workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId! }
    expect(await remote.getInputDescription(scope, signal)).toBeNull()
    expect(inspect).not.toHaveBeenCalled()
    await remote.mutate({ ...scope, type: 'update-draft', field: 'instance_id', value: '8' }, signal)
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'comfyui-template', id: '5' } }, signal)
    expect(await remote.getInputDescription(scope, signal)).toEqual(description)
    expect(inspect).toHaveBeenLastCalledWith({ templateId: '5', instanceId: '8' }, signal)
    await remote.mutate({ ...scope, type: 'run' }, signal)
    const task = (await remote.getProjection(scope, signal)).tasks[0]!
    const accepted = await runtime.acceptGenerations({ workspaceId: scope.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'accepted' }, [{ requestId: crypto.randomUUID(), request: { title: task.input.generation_input.title, instanceId: '8', templateId: '5', model: null, parameters: task.input.generation_input.parameters, loras: [] } }], signal, task.task_id)
    const runId = accepted.items[0]!.runId
    await remote.mutate({ ...scope, type: 'update-draft', field: 'instance_id', value: '9' }, signal)
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'comfyui-template', id: '6' } }, signal)
    inspect.mockClear()
    expect(await remote.getInputDescription({ ...scope, runId }, signal)).toEqual(description)
    expect(inspect).toHaveBeenLastCalledWith({ templateId: '5', instanceId: '8' }, signal)
    expect(await remote.getInputDescription(scope, signal)).toEqual(description)
    expect(inspect).toHaveBeenLastCalledWith({ templateId: '6', instanceId: '9' }, signal)
    inspect.mockClear()
    await expect(remote.getInputDescription({ ...scope, workspaceId: 'workspace_2', runId }, signal)).rejects.toMatchObject({ code: 'workbench/operation-failed', details: { code: 'WORKBENCH_SCOPE_MISMATCH' } })
    const other = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Other', goal: 'Paint clouds' } }, signal)
    await expect(remote.getInputDescription({ workspaceId: other.workspaceId, workId: other.workId!, branchId: other.branchId!, runId }, signal)).rejects.toMatchObject({ code: 'workbench/operation-failed', details: { code: 'WORKBENCH_SCOPE_MISMATCH' } })
    await expect(remote.getInputDescription(scope, AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' })
    expect(inspect).not.toHaveBeenCalled()
  } finally { await host.dispose() }
})

it('projects media through the shared content and download routes without changing the service snapshot', async () => {
  const { remote, initializeWorkspace, getProjection } = fixture()
  const snapshot = projection()
  getProjection.mockResolvedValue(snapshot)
  const request = { workspaceId: 'workspace_1', workId: 'work_1', branchId: 'branch_1' }
  const result = await remote.getProjection(request, new AbortController().signal)
  expect(initializeWorkspace).toHaveBeenCalledWith('workspace_1')
  expect(getProjection).toHaveBeenCalledWith(request)
  expect(result.runs[0]!.media[0]).toEqual({
    media_id: 'media_1', run_id: 'run_1', filename: 'rain.png', media_type: 'image/png', media_kind: 'image', byte_size: 123,
    url: '/api/harness-comfyui/media/media_1/content?session_id=session_1',
    download_url: '/api/harness-comfyui/media/media_1/download?session_id=session_1',
  })
  expect(snapshot.runs[0]!.media[0]).not.toHaveProperty('url')
  expect(result.refreshAfterMs).toBe(777)
})

it('reports Workbench error identities and field paths while preserving unexpected failures', async () => {
  const { remote, initializeWorkspace, environment } = fixture()
  initializeWorkspace.mockRejectedValueOnce(new WorkbenchError('WORKBENCH_NOT_FOUND', 'Choose an existing Workspace', 'workspace_id'))
  await expect(remote.getProjection({ workspaceId: 'missing' }, new AbortController().signal)).rejects.toMatchObject({
    name: 'RemoteError', code: 'workbench/operation-failed', details: { code: 'WORKBENCH_NOT_FOUND', issues: [{ path: 'workspace_id', message: 'Choose an existing Workspace' }] },
  })
  environment.mockRejectedValueOnce(new WorkbenchError('WORKBENCH_PRESET_UNAVAILABLE', 'Choose an available preset', 'preset_id'))
  await expect(remote.getEnvironment({ presetId: 'missing' }, new AbortController().signal)).rejects.toMatchObject({ details: { code: 'WORKBENCH_PRESET_UNAVAILABLE' } })
  const failure = new Error('Official model catalog unavailable')
  environment.mockRejectedValueOnce(failure)
  await expect(remote.getEnvironment({}, new AbortController().signal)).rejects.toBe(failure)
})

it('stops already cancelled calls and cancels a projection completed after the caller aborts', async () => {
  const { remote, initializeWorkspace, environment, getProjection } = fixture()
  const request = { workspaceId: 'workspace_1' }
  await expect(remote.getProjection(request, AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' })
  await expect(remote.getEnvironment({}, AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' })
  await expect(remote.mutate({ ...request, type: 'new-work', value: {} }, AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' })
  expect(initializeWorkspace).not.toHaveBeenCalled()
  expect(environment).not.toHaveBeenCalled()
  const controller = new AbortController()
  getProjection.mockImplementationOnce(async () => { controller.abort(); return projection() })
  await expect(remote.getProjection(request, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
})

it('requires the edited branch field and its original string in update requests', () => {
  const codec = WORKBENCH_REMOTE.descriptors.find(descriptor => descriptor.method === 'mutate')!.parameters[0]!.codec.create()
  const scope = { workspaceId: 'workspace_1', workId: 'work_1', branchId: 'branch_1' }
  for (const field of ['name', 'original_request']) {
    const request = { ...scope, type: 'update-branch', field, value: 'Edited text', expectedValue: '  Original text\nSecond line  ' }
    expect(codec.parse(request)).toMatchObject(request)
    expect(() => codec.parse({ ...scope, type: 'update-branch', field, value: 'Edited text' })).toThrow()
    for (const expectedValue of [undefined, null, 7]) expect(() => codec.parse({ ...request, expectedValue })).toThrow()
  }
  for (const field of [undefined, 'goal']) expect(() => codec.parse({ ...scope, type: 'update-branch', field, value: 'Edited text', expectedValue: 'Original text' })).toThrow()
  expect(codec.parse({ ...scope, type: 'update-draft', field: 'positive_prompt', value: 'Rain' })).toMatchObject({ type: 'update-draft' })
})

it('validates each RPC request from JSON with exact field names and identifier constraints', () => {
  const codecs = Object.fromEntries(WORKBENCH_REMOTE.descriptors.map(descriptor => [descriptor.method, descriptor.parameters[0]!.codec.create()]))
  expect(codecs.getProjection!.parse({ workspaceId: 'workspace_1', workId: 'work_1', branchId: 'branch_1' })).toEqual({ workspaceId: 'workspace_1', workId: 'work_1', branchId: 'branch_1' })
  const inputScope = { workspaceId: 'workspace_1', workId: 'work_1', branchId: 'branch_1' }
  expect(codecs.getInputDescription!.parse({ ...inputScope, runId: 'run_1' })).toEqual({ ...inputScope, runId: 'run_1' })
  for (const value of [{ workspaceId: 'workspace_1' }, { ...inputScope, runId: '' }, { ...inputScope, workspaceId: '' }, { ...inputScope, extra: true }]) expect(() => codecs.getInputDescription!.parse(value)).toThrow()
  expect(codecs.getEnvironment!.parse({})).toEqual({})
  expect(codecs.getEnvironment!.parse({ workspaceId: 'workspace_1', presetId: 'preset-a' })).toEqual({ workspaceId: 'workspace_1', presetId: 'preset-a' })
  expect(codecs.mutate!.parse({ workspaceId: '', type: 'new-workspace', value: { name: 'New project', path: '/project' } })).toMatchObject({ type: 'new-workspace' })
  for (const value of [null, [], {}, { workspaceId: '' }, { workspaceId: ' ' }, { workspaceId: 'workspace_1', workId: '' }, { workspaceId: 'workspace_1', branchId: 3 }, { workspaceId: 'workspace_1', unknown: true }]) expect(() => codecs.getProjection!.parse(value)).toThrow()
  for (const value of [null, [], { workspaceId: 3 }, { presetId: '' }, { presetId: 'preset-a', unknown: true }]) expect(() => codecs.getEnvironment!.parse(value)).toThrow()
  for (const value of [null, [], {}, { workspaceId: '', type: 'new-work' }, { workspaceId: 'workspace_1', type: 'unknown' }, { workspaceId: 'workspace_1', type: 'new-work', unknown: true }, { workspaceId: 'workspace_1', type: 'new-work', value: { bad: Number.NaN } }]) expect(() => codecs.mutate!.parse(value)).toThrow()
})

it('round trips a complete projection through the declared result codec and rejects non-object results', () => {
  for (const descriptor of WORKBENCH_REMOTE.descriptors) {
    const codec = descriptor.result.create()
    if (descriptor.method === 'getInputDescription') {
      expect(codec.parse(null)).toBeNull()
      const description = { parameters: [], size_candidates: [] }
      expect(codec.parse(description)).toEqual(description)
      for (const invalid of [undefined, [], 'result', { parameters: [] }, { parameters: [], size_candidates: [{ candidate_id: 'missing-representation' }] }]) expect(() => codec.parse(invalid), JSON.stringify(invalid) ?? 'undefined').toThrow()
      continue
    }
    const value = descriptor.method === 'getProjection' ? projection() : { workspaceId: 'workspace_1' }
    expect(codec.parse(JSON.parse(JSON.stringify(value)))).toEqual(value)
    for (const invalid of [null, [], 'result', 1, { value: Number.NaN }, { '': 'empty key' }]) expect(() => codec.parse(invalid)).toThrow()
  }
})

import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { parseCatalogDetails } from '../../src/catalog/details-schema.ts'
import { WorkbenchRemoteService } from '../../src/host/workbench/remote-service.ts'
import { WORKBENCH_REMOTE } from '../../src/workbench-remote.ts'
import { WorkbenchError } from '../../src/workbench/validation.ts'
import { parseCliGenerationRequest, toGenerationRequest } from '../../src/cli/contract.ts'
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
function restrictSelectedResources(catalog: Awaited<ReturnType<typeof createWorkbenchHostFixture>>['catalog'], retainedLoraId?: string) {
  const read = catalog.details.getMockImplementation()!
  catalog.details.mockImplementation(async (request, signal) => {
    const details = await read(request, signal)
    let item = details.item
    if (request.kind === 'lora' || request.kind === 'comfyui-template') {
      item = { ...item, modelId: request.kind === 'lora' && request.id === retainedLoraId ? null : '2' }
    }
    if (request.kind === 'style' || request.kind === 'artist-string') item = { ...item, baseModelId: '2' }
    return parseCatalogDetails({ ...details, item, fields: details.fields.map(field => ({
      ...field, value: field.key === 'model_id' ? item.modelId : field.key === 'base_model_id' ? item.baseModelId : field.value,
    })) })
  })
}

it('requires explicit favorite states and complete experience reuse choices through the Remote codec', () => {
  const codec = WORKBENCH_REMOTE.descriptors.find(descriptor => descriptor.method === 'mutate')!.parameters[0]!.codec.create()
  const scope = { workspaceId: 'workspace_1', workId: 'work_1', branchId: 'branch_1' }
  for (const targetType of ['run', 'experience']) for (const favorite of [true, false]) {
    const value = { targetType, favorite }
    expect(codec.parse({ ...scope, type: 'favorite', id: 'target_1', value })).toMatchObject({ value })
  }
  for (const value of [undefined, 'experience', { targetType: 'run' }, { targetType: 'task', favorite: true }, { targetType: 'run', favorite: 'true' }, { targetType: 'run', favorite: true, extra: 1 }]) {
    expect(() => codec.parse({ ...scope, type: 'favorite', id: 'target_1', value })).toThrow()
  }
  expect(() => codec.parse({ ...scope, type: 'favorite', runId: 'run_1', value: { targetType: 'run', favorite: true } })).toThrow()
  for (const baseModelId of ['9', null]) {
    const value = { name: 'Snow test', baseModelId }
    expect(codec.parse({ ...scope, type: 'reuse', id: 'experience_1', value })).toMatchObject({ value })
  }
  for (const value of [undefined, { name: 'Snow test' }, { name: '', baseModelId: null }, { name: 'Snow test', baseModelId: '0' }, { name: 'Snow test', baseModelId: 'abc' }, { name: 'Snow test', baseModelId: null, goal: 'Other goal' }]) {
    expect(() => codec.parse({ ...scope, type: 'reuse', id: 'experience_1', value })).toThrow()
  }
  expect(() => codec.parse({ ...scope, type: 'reuse', value: { name: 'Snow test', baseModelId: null } })).toThrow()
})

it('validates editable function inputs and explicit editing identities through the Remote codec', () => {
  const codec = WORKBENCH_REMOTE.descriptors.find(descriptor => descriptor.method === 'mutate')!.parameters[0]!.codec.create()
  const value = { name: 'Glass rewrite', kind: 'rewrite', preset_id: 'preset-a', agent_model: { provider: 'provider-a', model: 'model-a' }, requested_skill: null, request_template: 'Read {{task_id}}.' }
  expect(codec.parse({ workspaceId: 'workspace_1', type: 'function-add', value })).toMatchObject({ value })
  expect(codec.parse({ workspaceId: 'workspace_1', type: 'function-edit', id: 'custom-a', value })).toMatchObject({ id: 'custom-a', value })
  for (const extra of [{ function_id: 'custom-a' }, { workspace_id: 'other' }, { builtin: true }]) {
    for (const type of ['function-add', 'function-edit']) expect(() => codec.parse({ workspaceId: 'workspace_1', type, id: 'custom-a', value: { ...value, ...extra } })).toThrow()
  }
  expect(() => codec.parse({ workspaceId: 'workspace_1', type: 'function-edit', value })).toThrow()
  for (const field of Object.keys(value)) {
    const missing = { ...value } as Record<string, unknown>
    delete missing[field]
    expect(() => codec.parse({ workspaceId: 'workspace_1', type: 'function-add', value: missing })).toThrow()
  }
  expect(() => codec.parse({ workspaceId: 'workspace_1', type: 'function-add', value: { ...value, kind: 'other' } })).toThrow()
})

function fixture() {
  const context = new Context()
  const initializeWorkspace = vi.fn(async () => {})
  const getProjection = vi.fn(async () => projection())
  const environment = vi.fn(async () => ({ workspaces: [], presets: [], defaultPresetId: 'preset-default', models: { default: { provider: 'p', model: 'm' }, groups: [], failures: [], routableProviders: [] }, skills: [], instances: [] }))
  context.provide('harnessComfyuiWorkbench' as never, { initializeWorkspace, service: { getProjection }, environment } as never)
  return { remote: new WorkbenchRemoteService(context), initializeWorkspace, getProjection, environment }
}

it('describes the current Branch and reads historical Run input through its scoped saved-input method', async () => {
  const host = await createWorkbenchHostFixture()
  try {
    const { remote, inspect, description, runtime } = host
    const signal = new AbortController().signal
    const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal)
    const scope = { workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId! }
    expect(await remote.getInputDescription(scope, signal)).toBeNull()
    expect(inspect).not.toHaveBeenCalled()
    await remote.mutate({ ...scope, type: 'update-draft', field: 'instance_id', value: '8' }, signal)
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'comfyui-template', id: '5' } }, signal)
    expect(await remote.getInputDescription(scope, signal)).toEqual(description)
    expect(inspect).toHaveBeenLastCalledWith({ templateId: '5', instanceId: '8' }, signal)
    await remote.mutate({ ...scope, type: 'run' }, signal)
    const task = (await remote.getProjection(scope, signal)).tasks[0]!
    const accepted = await runtime.acceptGenerations({ workspaceId: scope.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'accepted' }, [{ requestId: crypto.randomUUID(), request: toGenerationRequest(parseCliGenerationRequest(task.input.generation_input)) }], signal, task.task_id)
    const runId = accepted.items[0]!.runId
    await remote.mutate({ ...scope, type: 'update-draft', field: 'instance_id', value: '9' }, signal)
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'comfyui-template', id: '6' } }, signal)
    inspect.mockClear()
    const runScope = { workspaceId: scope.workspaceId, workId: scope.workId, runId }
    expect(await remote.getRunInput(runScope, signal)).toMatchObject({ run_id: runId, generation_input: task.input.generation_input, input_description: null, prompt_input: { positive_prompt: null, negative_prompt: null } })
    expect(inspect).not.toHaveBeenCalled()
    expect(await remote.getInputDescription(scope, signal)).toEqual(description)
    expect(inspect).toHaveBeenLastCalledWith({ templateId: '6', instanceId: '9' }, signal)
    inspect.mockClear()
    await expect(remote.getRunInput({ ...runScope, workspaceId: 'workspace_2' }, signal)).rejects.toMatchObject({ code: 'workbench/operation-failed', details: { code: 'WORKBENCH_SCOPE_MISMATCH' } })
    const other = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Other', goal: 'Paint clouds' } }, signal)
    await expect(remote.getRunInput({ workspaceId: other.workspaceId, workId: other.workId!, runId }, signal)).rejects.toMatchObject({ code: 'workbench/operation-failed', details: { code: 'WORKBENCH_SCOPE_MISMATCH' } })
    await expect(remote.getInputDescription(scope, AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' })
    expect(inspect).not.toHaveBeenCalled()
  } finally { await host.dispose() }
})


it('changes the model without removing selected resources or changing other input', async () => {
  const host = await createWorkbenchHostFixture()
  try {
    const { remote, catalog } = host
    const signal = new AbortController().signal
    const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal)
    const scope = { workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId! }
    await remote.mutate({ ...scope, type: 'update-draft', field: 'instance_id', value: '8' }, signal)
    for (const ref of [{ kind: 'model', id: '2' }, { kind: 'comfyui-template', id: '5' }, { kind: 'lora', id: '3' }, { kind: 'lora', id: '4' }, { kind: 'style', id: '7' }, { kind: 'character', id: '8' }]) {
      await remote.mutate({ ...scope, type: 'resource-select', value: ref }, signal)
    }
    await remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'reference', value: '/reference.png' }, signal)
    await remote.mutate({ ...scope, type: 'update-draft', field: 'positive_prompt', value: 'Latest prompt' }, signal)
    await remote.mutate({ ...scope, type: 'update-draft', field: 'lora-weight', id: '4', value: 1.2 }, signal)
    restrictSelectedResources(catalog, '4')
    catalog.resolveGenerationModel.mockImplementation(async id => ({ id, file_name: id === '9' ? 'other.safetensors' : 'paint.safetensors', base_model_id: id === '9' ? '9' : '1' }))
    const before = (await remote.getProjection(scope, signal)).branches[0]!.draft
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '9' } }, signal)
    const after = (await remote.getProjection(scope, signal)).branches[0]!.draft
    expect(after).toEqual({
      ...before, base_model_id: '9',
      generation_input: { ...before.generation_input, model: { id: '9', file_name: 'other.safetensors' } },
    })
    expect(await remote.getInputDescription(scope, signal)).toEqual(host.description)
    const started = await remote.mutate({ ...scope, type: 'run' }, signal)
    const task = (await remote.getProjection(scope, signal)).tasks.find(item => item.task_id === started.taskId)!
    const expectedInput = { ...after.generation_input, parameters: { ...after.generation_input.parameters, positive: 'Latest prompt', negative: '' } }
    expect(task.input).toMatchObject({ generation_input: expectedInput, context_refs: after.context_refs, base_model_id: '9' })
    const accepted = await host.runtime.acceptGenerations({ workspaceId: scope.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'mixed-model-run' }, [{ requestId: crypto.randomUUID(), request: toGenerationRequest(parseCliGenerationRequest(task.input.generation_input)) }], signal, task.task_id)
    const projection = await remote.getProjection(scope, signal)
    expect(projection.runs.find(run => run.run_id === accepted.items[0]!.runId)?.generation_input).toEqual(expectedInput)
  } finally { await host.dispose() }
})


it('retains template parameters and LoRAs without scanning Catalog pages', async () => {
  const host = await createWorkbenchHostFixture()
  try {
    const { remote, catalog } = host
    const signal = new AbortController().signal
    const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal)
    const scope = { workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId! }
    await remote.mutate({ ...scope, type: 'update-draft', field: 'instance_id', value: '8' }, signal)
    for (const ref of [{ kind: 'model', id: '2' }, { kind: 'comfyui-template', id: '5' }, { kind: 'lora', id: '3' }, { kind: 'lora', id: '4' }]) await remote.mutate({ ...scope, type: 'resource-select', value: ref }, signal)
    await remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'seed', value: 77 }, signal)
    await remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'reference', value: '/reference.png' }, signal)
    const before = (await remote.getProjection(scope, signal)).branches[0]!.draft

    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '9' } }, signal)
    const after = (await remote.getProjection(scope, signal)).branches[0]!.draft
    expect(after).toEqual({ ...before, generation_input: { ...before.generation_input, model: { id: '9', file_name: 'paint.safetensors' } } })
    expect((await remote.getInputDescription(scope, signal))?.parameters.some(parameter => parameter.kind === 'seed')).toBe(true)
    expect(catalog.search).not.toHaveBeenCalled()
  } finally { await host.dispose() }
})


it('keeps a concurrent draft edit while the replacement model is being resolved', async () => {
  const host = await createWorkbenchHostFixture()
  try {
    const { remote, catalog } = host
    const signal = new AbortController().signal
    const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal)
    const scope = { workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId! }
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'comfyui-template', id: '5' } }, signal)
    let started!: () => void, release!: () => void
    const reading = new Promise<void>(resolve => { started = resolve })
    const resume = new Promise<void>(resolve => { release = resolve })
    const read = catalog.resolveGenerationModel.getMockImplementation()!
    catalog.resolveGenerationModel.mockImplementationOnce(async id => { started(); await resume; return read(id) })
    const pending = remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '9' } }, signal)
    await reading
    await remote.mutate({ ...scope, type: 'update-draft', field: 'positive_prompt', value: 'Concurrent prompt' }, signal)
    const before = (await remote.getProjection(scope, signal)).branches[0]!.draft
    release()

    await expect(pending).rejects.toMatchObject({ details: { code: 'WORKBENCH_EDIT_CONFLICT' } })
    expect((await remote.getProjection(scope, signal)).branches[0]!.draft).toEqual(before)
  } finally { await host.dispose() }
})


it('rejects an unavailable replacement model before saving any draft change', async () => {
  const host = await createWorkbenchHostFixture()
  try {
    const { remote, catalog } = host
    const signal = new AbortController().signal
    const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal)
    const scope = { workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId! }
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'lora', id: '3' } }, signal)
    const before = (await remote.getProjection(scope, signal)).branches[0]!.draft
    catalog.resolveGenerationModel.mockRejectedValueOnce(new Error('Source unavailable'))
    await expect(remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '9' } }, signal)).rejects.toMatchObject({ details: { code: 'WORKBENCH_RESOURCE_UNAVAILABLE' } })
    expect((await remote.getProjection(scope, signal)).branches[0]!.draft).toEqual(before)
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

it('requires complete review updates and generation adoption snapshots through the Remote codec', () => {
  const codec = WORKBENCH_REMOTE.descriptors.find(descriptor => descriptor.method === 'mutate')!.parameters[0]!.codec.create()
  const scope = { workspaceId: 'workspace_1', workId: 'work_1', branchId: 'branch_1' }
  const draft = { verdict: 'unrated', observation: '', conclusion: '', title: '', conditions: '', note: '', evidence_run_ids: ['run_1'], review_artifact_id: null, experience_artifact_id: null, experience_id: null }
  const update = { expected: draft, draft }
  expect(codec.parse({ ...scope, type: 'update-review-draft', runId: 'run_1', value: update })).toMatchObject({ value: update })
  expect(() => codec.parse({ ...scope, type: 'update-review-draft', value: update })).toThrow()
  for (const value of [{ draft }, { expected: draft }, { ...update, patch: {} }, { ...update, draft: { ...draft, observation: undefined } }]) {
    expect(() => codec.parse({ ...scope, type: 'update-review-draft', runId: 'run_1', value })).toThrow()
    expect(() => codec.parse({ ...scope, type: 'agent-action', id: 'review', runId: 'run_1', value: { evaluationDraft: value } })).toThrow()
  }
  const expected = { parameter_mapping: null, generation_input: { title: 'Rain', instance_id: '8', template_id: '5', model: null, parameters: {}, loras: [] }, prompt_input: { positive_prompt: null, negative_prompt: null }, context_refs: [], base_model_id: null }
  expect(codec.parse({ ...scope, type: 'task-generation-apply', id: 'artifact_1', value: expected })).toMatchObject({ value: expected })
  expect(() => codec.parse({ ...scope, type: 'task-generation-apply', value: expected })).toThrow()
  expect(() => codec.parse({ ...scope, type: 'task-generation-apply', id: 'artifact_1', value: { generation_input: expected.generation_input } })).toThrow()
})

it('validates each RPC request from JSON with exact field names and identifier constraints', () => {
  const codecs = Object.fromEntries(WORKBENCH_REMOTE.descriptors.map(descriptor => [descriptor.method, descriptor.parameters[0]!.codec.create()]))
  expect(codecs.getProjection!.parse({ workspaceId: 'workspace_1', workId: 'work_1', branchId: 'branch_1' })).toEqual({ workspaceId: 'workspace_1', workId: 'work_1', branchId: 'branch_1' })
  const inputScope = { workspaceId: 'workspace_1', workId: 'work_1', branchId: 'branch_1' }
  expect(codecs.getInputDescription!.parse(inputScope)).toEqual(inputScope)
  for (const value of [{ workspaceId: 'workspace_1' }, { ...inputScope, runId: 'run_1' }, { ...inputScope, runId: '' }, { ...inputScope, runId: null }, { ...inputScope, workspaceId: '' }, { ...inputScope, extra: true }]) expect(() => codecs.getInputDescription!.parse(value)).toThrow()
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
    if (descriptor.method === 'getTaskDraft' || descriptor.method === 'saveTaskDraft') {
      const draft = { instructions: '', resources: { instance_id: '8', template_id: null } }
      expect(codec.parse(draft)).toEqual(draft)
      if (descriptor.method === 'getTaskDraft') expect(codec.parse(null)).toBeNull()
      else expect(() => codec.parse(null)).toThrow()
      for (const invalid of [undefined, [], {}, { instructions: 'Request' }, { instructions: '', resources: { template_id: 7 } }, { instructions: '', resources: { unknown: true } }]) expect(() => codec.parse(invalid)).toThrow()
      continue
    }
    if (descriptor.method === 'getRunInput') {
      const input = { run_id: 'run_1', branch_id: 'branch_1', generation_input: projection().runs[0]!.generation_input, context_refs: [], input_description: null, prompt_input: { positive_prompt: null, negative_prompt: null } }
      expect(codec.parse(input)).toEqual(input)
      continue
    }
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

it('validates task-draft scope and resource overrides through the public request codecs', () => {
  const codecs = Object.fromEntries(WORKBENCH_REMOTE.descriptors.map(descriptor => [descriptor.method, descriptor.parameters[0].codec.create()]))
  const scope = { workspaceId: 'workspace_1', workId: 'work_1', branchId: 'branch_1', functionId: 'parameters' }
  const draft = { instructions: '', resources: { instance_id: '8', template_id: null } }
  expect(codecs.getTaskDraft!.parse(scope)).toEqual(scope)
  expect(codecs.saveTaskDraft!.parse({ ...scope, draft })).toEqual({ ...scope, draft })
  for (const invalid of [{ ...scope, functionId: '' }, { ...scope, branchId: undefined }, { ...scope, workId: undefined }, { ...scope, extra: true }]) expect(() => codecs.getTaskDraft!.parse(invalid)).toThrow()
  for (const invalid of [null, {}, { instructions: '', resources: [] }, { instructions: '', resources: { template_id: '0' } }, { instructions: '', resources: { template_id: 7 } }, { instructions: '', resources: { instance_id: false } }, { instructions: '', resources: { parameters: {} } }]) expect(() => codecs.saveTaskDraft!.parse({ ...scope, draft: invalid })).toThrow()
})

it('validates the historical Run request and nullable saved-input result through its Remote codecs', () => {
  const descriptor = WORKBENCH_REMOTE.descriptors.find(item => item.method === 'getRunInput')!
  const request = descriptor.parameters[0].codec.create(), result = descriptor.result.create()
  const scope = { workspaceId: 'workspace_1', workId: 'work_1', runId: 'run_1' }
  expect(request.parse(scope)).toEqual(scope)
  for (const value of [{ ...scope, runId: '' }, { ...scope, workId: undefined }, { ...scope, branchId: 'current_branch' }]) expect(() => request.parse(value)).toThrow()
  const input = { run_id: 'run_1', branch_id: 'branch_1', generation_input: projection().runs[0]!.generation_input, context_refs: [], input_description: null, prompt_input: { positive_prompt: null, negative_prompt: null } }
  expect(result.parse(input)).toEqual(input)
  for (const value of [{}, { ...input, generation_input: null }, { ...input, input_description: [] }, { ...input, prompt_input: { positive_prompt: 1 } }, { ...input, extra: true }]) expect(() => result.parse(value)).toThrow()
})

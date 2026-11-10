import { saveFixtureDraft } from '../support/workbench-draft.ts'
import { afterEach, expect, it, vi } from 'vitest'
import { toGenerationRequest } from '../../src/cli/contract.ts'
import { CatalogClient } from '../../src/host/catalog/catalog-client.ts'
import { CATALOG_COMFYUI_INSTANCE_QUERY } from '../../src/catalog/contract.ts'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { createWorkbenchHostFixture } from '../support/workbench-host.ts'
import type { ExperimentWorkbenchAction, WorkbenchScope } from '../../src/workbench-remote.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
it('creates a custom function from editable fields with a stable Host identity', async () => {
  const { remote } = await fixture()
  const value = { name: 'Glass rewrite', kind: 'prompt', preset_id: 'preset-a', agent_model: { provider: 'provider-a', model: 'model-a' }, requested_skill: null, request_template: 'Read {{requirements_block}} and rewrite the prompt.' }
  await remote.mutate({ workspaceId: 'workspace_1', type: 'function-add', value }, signal())
  const created = (await remote.getProjection({ workspaceId: 'workspace_1' }, signal())).functions.find(item => item.name === value.name)!
  expect(created).toMatchObject({ ...value, workspace_id: 'workspace_1', builtin: false })
  expect(created.function_id).toEqual(expect.any(String))
  expect(created.function_id.length).toBeGreaterThan(0)
  await remote.mutate({ workspaceId: 'workspace_1', type: 'function-edit', id: created.function_id, value: { ...value, name: 'Glass recheck' } }, signal())
  const after = (await remote.getProjection({ workspaceId: 'workspace_1' }, signal())).functions.filter(item => !item.builtin)
  expect(after).toEqual([{ ...created, name: 'Glass recheck' }])
  for (const extra of [{ function_id: 'replacement' }, { workspace_id: 'workspace_2' }, { builtin: true }]) {
    await expect(remote.mutate({ workspaceId: 'workspace_1', type: 'function-add', value: { ...value, ...extra } }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_INVALID_INPUT' } })
  }
  await expect(remote.mutate({ workspaceId: 'workspace_2', type: 'function-edit', id: created.function_id, value }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_FUNCTION_NOT_FOUND' } })
  expect((await remote.getProjection({ workspaceId: 'workspace_1' }, signal())).functions.filter(item => !item.builtin)).toEqual(after)
})

it('returns the configured default preset independently of official roster order', async () => {
  const { remote, official } = await fixture()
  const configured = 'harness-comfyui-cli-candidate'
  const projection = await remote.getProjection({ workspaceId: 'workspace_1' }, signal())
  expect(projection.functions.find(item => item.function_id === 'run')!.preset_id).toBe('harness-comfyui-run')
  official.listPresets.mockResolvedValue([{ id: 'other-preset', name: 'First roster item' }, { id: configured, name: 'Configured default' }])
  const environment = await remote.getEnvironment({}, signal())
  expect(environment).toMatchObject({ defaultPresetId: configured, models: { default: { provider: 'provider-a', model: 'model-a' } } })
  expect(environment.presets[0]!.id).toBe('other-preset')
})

function editableBinding(binding: import('../../src/workbench/contract.ts').FunctionBinding): import('../../src/workbench/contract.ts').FunctionBindingEditable {
  const { name, kind, preset_id, agent_model, requested_skill, request_template, request_parts } = binding
  return { name, kind, preset_id, agent_model, requested_skill, request_template, ...(request_parts ? { request_parts } : {}) }
}

it('runs a custom function with its saved configuration binding', async () => {
  const { remote } = await fixture()
  const selected = await remote.mutate({ workspaceId: 'workspace_1', type: 'new-work', value: { name: 'Custom prompt', goal: 'Paint glass' } }, signal())
  const value = { name: 'Glass rewrite', kind: 'prompt', preset_id: 'preset-a', agent_model: { provider: 'provider-a', model: 'model-a' }, requested_skill: null, request_template: 'Read {{requirements_block}}.' }
  await remote.mutate({ ...selected, type: 'function-add', value }, signal())
  const binding = (await remote.getProjection(selected, signal())).functions.find(item => item.name === value.name)!
  const receipt = await startConfiguredTask(remote, selected, binding.function_id)
  expect((await remote.getProjection(selected, signal())).tasks.find(task => task.task_id === receipt.taskId)).toMatchObject({ binding_snapshot: { function_id: binding.function_id, preset_id: 'preset-a' } })
})


it('starts one experiment with fixed Task, Session, budget and first Run input', async () => {
  const { remote, runtime, official } = await fixture()
  const selected = await remote.mutate({ workspaceId: 'workspace_1', type: 'new-work', value: { name: 'Fixed experiment', goal: 'Compare glass light' } }, signal())
  await saveFixtureDraft(remote, { ...selected }, draft => { draft.generation_input.instance_id = '8' }, signal())
  for (const request of [{ type: 'resource-select', value: { kind: 'model', id: '2' } }, { type: 'resource-select', value: { kind: 'comfyui-template', id: '5' } }, { type: 'update-execution', field: 'mode', value: 'continuous' }, { type: 'update-execution', field: 'max_runs', value: 3 }] as const) await remote.mutate({ ...selected, ...request }, signal())
  await saveFixtureDraft(remote, { ...selected }, () => {}, signal())
  await saveFixtureDraft(remote, selected, draft => { draft.prompt_input.positive_prompt = 'Initial glass' }, signal())
  await remote.mutate({ ...selected, type: 'function-preset', id: 'experiment', value: 'preset-a' }, signal())
  const receipt = await remote.mutate({ ...selected, type: 'experiment' }, signal())
  const initial = await remote.getProjection(selected, signal()), task = initial.tasks[0]!
  expect(initial.tasks).toHaveLength(1)
  expect(initial.experiments).toEqual([{ task_id: task.task_id, control_state: 'running', end_reason: null, submitted_count: 0, max_runs: 3 }])
  expect(receipt.taskId).toBe(task.task_id)
  expect(official.controller.create).toHaveBeenCalledExactlyOnceWith({ workspaceId: selected.workspaceId, agentPreset: 'preset-a' })
  await saveFixtureDraft(remote, { ...selected }, draft => { draft.prompt_input.positive_prompt = 'Later glass' }, signal())
  await remote.mutate({ ...selected, type: 'update-execution', field: 'max_runs', value: 5 }, signal())
  const identity = { workspaceId: selected.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'experiment-first' }
  const fixed = { ...task.input.generation_input, instance_id: '8', template_id: '5' }
  await expect(runtime.acceptGenerations(identity, [{ requestId: crypto.randomUUID(), request: toGenerationRequest({ ...fixed, parameters: { ...fixed.parameters, positive: 'Later glass' } }) }], undefined, task.task_id)).rejects.toMatchObject({ code: 'WORKBENCH_INPUT_MISMATCH' })
  const accepted = await runtime.acceptGenerations(identity, [{ requestId: crypto.randomUUID(), request: toGenerationRequest(fixed) }], undefined, task.task_id)
  const after = await remote.getProjection(selected, signal()), run = after.runs[0]!
  expect(after.tasks[0]!.input).toEqual(task.input)
  expect(after.tasks[0]!.binding_snapshot).toEqual(task.binding_snapshot)
  expect(after.experiments).toEqual([{ task_id: task.task_id, control_state: 'running', end_reason: null, submitted_count: 1, max_runs: 3 }])
  expect(run).toMatchObject({ run_id: accepted.items[0]!.runId, workbench_task_id: task.task_id, iteration_index: 1, generation_input: task.input.generation_input })
  expect((await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId: run.run_id }, signal())).generation_input).toEqual(task.input.generation_input)
  expect(official.controller.create).toHaveBeenCalledOnce()
})

it('changes a custom kind and removes its bindings while retaining Task, Run and artifact history', async () => {
  const { remote, runtime, ctx } = await fixture()
  const selected = await remote.mutate({ workspaceId: 'workspace_1', type: 'new-work', value: { name: 'Function history', goal: 'Paint glass' } }, signal())
  await saveFixtureDraft(remote, { ...selected }, draft => { draft.generation_input.instance_id = '8' }, signal())
  for (const request of [{ type: 'resource-select', value: { kind: 'model', id: '2' } }, { type: 'resource-select', value: { kind: 'comfyui-template', id: '5' } }] as const) await remote.mutate({ ...selected, ...request }, signal())
  await saveFixtureDraft(remote, { ...selected }, () => {}, signal())
  const base = { preset_id: 'preset-a', agent_model: { provider: 'provider-a', model: 'model-a' }, requested_skill: null, request_template: 'Read {{requirements_block}}.' }
  await remote.mutate({ ...selected, type: 'function-add', value: { ...base, name: 'Custom run', kind: 'run', request_template: 'Read {{task_id}}.' } }, signal())
  await remote.mutate({ ...selected, type: 'function-add', value: { ...base, name: 'Custom rewrite', kind: 'prompt' } }, signal())
  const configured = await remote.getProjection(selected, signal()), runBinding = configured.functions.find(item => item.name === 'Custom run')!, binding = configured.functions.find(item => item.name === 'Custom rewrite')!
  const runReceipt = await remote.mutate({ ...selected, type: 'agent-action', id: runBinding.function_id }, signal())
  const rewriteReceipt = await startConfiguredTask(remote, selected, binding.function_id)
  const before = await remote.getProjection(selected, signal()), runTask = before.tasks.find(task => task.task_id === runReceipt.taskId)!, rewrite = before.tasks.find(task => task.task_id === rewriteReceipt.taskId)!
  const runIdentity = { workspaceId: selected.workspaceId, sessionId: runTask.session_id!, turn: 1, callId: 'custom-run' }
  const accepted = await runtime.acceptGenerations(runIdentity, [{ requestId: crypto.randomUUID(), request: toGenerationRequest({ ...runTask.input.generation_input, instance_id: '8', template_id: '5' }) }], undefined, runTask.task_id)
  await runtime.advance()
  const runId = accepted.items[0]!.runId
  await remote.mutate({ ...selected, type: 'function-edit', id: binding.function_id, value: { ...base, name: 'Custom review', kind: 'review', request_template: 'Review {{task_id}}.' } }, signal())
  const reviewDraft = (await remote.getProjection(selected, signal())).runs.find(run => run.run_id === runId)!.review_draft!
  const reviewed = await remote.mutate({ ...selected, type: 'agent-action', id: binding.function_id, runId, referenceRunIds: [runId], value: { evaluationDraft: { expected: reviewDraft, draft: reviewDraft } } }, signal())
  const current = await remote.getProjection(selected, signal()), review = current.tasks.find(task => task.task_id === reviewed.taskId)!
  expect(current.tasks.find(task => task.task_id === rewrite.task_id)).toMatchObject({ kind: 'prompt', binding_snapshot: rewrite.binding_snapshot, output_contract: { artifact_types: ['prompt'] }, request_text: rewrite.request_text })
  expect(review).toMatchObject({ kind: 'review', binding_snapshot: { function_id: binding.function_id, name: 'Custom review' }, output_contract: { artifact_types: ['review'] } })
  const rewriteIdentity = { workspaceId: selected.workspaceId, sessionId: rewrite.session_id!, turn: 1, callId: 'old-prompt' }
  const artifact = await ctx.harnessComfyuiWorkbench.service.publish({ taskId: rewrite.task_id, artifact: { type: 'prompt', positive_prompt: 'Historical glass', negative_prompt: null } }, rewriteIdentity)
  const reviewIdentity = { workspaceId: selected.workspaceId, sessionId: review.session_id!, turn: 1, callId: 'wrong-kind' }
  await expect(ctx.harnessComfyuiWorkbench.service.publish({ taskId: review.task_id, artifact: { type: 'prompt', positive_prompt: 'Wrong contract', negative_prompt: null } }, reviewIdentity)).rejects.toMatchObject({ code: 'WORKBENCH_ARTIFACT_NOT_ALLOWED' })
  for (const id of [binding.function_id, runBinding.function_id]) await remote.mutate({ ...selected, type: 'function-remove', id }, signal())
  const after = await remote.getProjection(selected, signal())
  expect(after.functions.every(item => item.builtin)).toBe(true)
  expect(after.tasks.find(task => task.task_id === rewrite.task_id)!.binding_snapshot).toEqual(rewrite.binding_snapshot)
  expect(after.artifacts.find(item => item.artifact_id === artifact.artifact_id)).toMatchObject({ task_id: rewrite.task_id, artifact: { type: 'prompt', positive_prompt: 'Historical glass' } })
  expect(after.runs.find(run => run.run_id === runId)).toMatchObject({ workbench_task_id: runTask.task_id, status: 'failed' })
  expect((await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())).generation_input).toEqual(runTask.input.generation_input)
  expect(await ctx.harnessComfyuiWorkbench.service.getTask({ taskId: rewrite.task_id }, rewriteIdentity)).toMatchObject({ task_id: rewrite.task_id, kind: 'prompt', output_contract: { artifact_types: ['prompt'] } })
  expect(await ctx.harnessComfyuiWorkbench.service.getTask({ taskId: review.task_id }, reviewIdentity)).toMatchObject({ task_id: review.task_id, kind: 'review', output_contract: { artifact_types: ['review'] } })
})

it.each([
  { model: { provider: 'missing', model: 'model-a' }, message: '请选择可用的 Agent 提供商。' },
  { model: { provider: 'offline', model: 'model-a' }, message: '该 Agent 提供商当前无法执行任务，请选择可用的提供商。' },
  { model: { provider: 'provider-a', model: 'missing' }, message: '请选择该提供商下的 Agent 模型。' },
  { model: { provider: 'provider-a', model: 'reasoning', reasoningEffort: 'invalid' }, message: '请选择该模型支持的推理等级。' },
  { model: { provider: 'provider-a', model: 'reasoning' }, message: '请选择该模型支持的推理等级。' },
  { model: { provider: 'provider-a', model: 'model-a', reasoningEffort: 'high' }, message: '该模型未提供推理等级，请重新选择模型。' },
])('rejects invalid official Agent model selection on custom function add and edit: $model', async ({ model, message }) => {
  const { remote, official } = await fixture()
  official.controller.modelCatalog.mockResolvedValue({
    default: { provider: 'provider-a', model: 'model-a' },
    groups: [
      { id: 'provider-a', name: 'Provider A', models: [{ id: 'model-a', name: 'Model A' }, { id: 'reasoning', name: 'Reasoning model', reasoning: { efforts: [{ id: 'high', name: 'High' }] } }] },
      { id: 'offline', name: 'Offline', models: [{ id: 'model-a', name: 'Model A' }] },
    ],
    routableProviders: ['provider-a'], failures: [],
  })
  const scope = { workspaceId: 'workspace_1' }
  const value = { name: 'Valid custom function', kind: 'prompt', preset_id: 'preset-a', agent_model: { provider: 'provider-a', model: 'model-a' }, requested_skill: null, request_template: 'Read {{requirements_block}}.' }
  await remote.mutate({ ...scope, type: 'function-add', value }, signal())
  const before = await remote.getProjection(scope, signal()), binding = before.functions.find(item => item.name === value.name)!
  for (const type of ['function-add', 'function-edit'] as const) {
    await expect(remote.mutate({ ...scope, type, ...(type === 'function-edit' ? { id: binding.function_id } : {}), value: { ...value, name: 'Rejected function', agent_model: model } }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_INVALID_INPUT', issues: [{ path: 'binding.agent_model', message }] } })
    expect((await remote.getProjection(scope, signal())).functions).toEqual(before.functions)
  }
  expect(official.controller.selectModel).not.toHaveBeenCalled()
})

it('retains saved functions when the official Agent model catalog cannot be read', async () => {
  const { remote, official } = await fixture(), scope = { workspaceId: 'workspace_1' }
  const value = { name: 'Valid custom function', kind: 'prompt', preset_id: 'preset-a', agent_model: { provider: 'provider-a', model: 'model-a' }, requested_skill: null, request_template: 'Read {{requirements_block}}.' }
  await remote.mutate({ ...scope, type: 'function-add', value }, signal())
  const before = await remote.getProjection(scope, signal()), binding = before.functions.find(item => item.name === value.name)!
  official.controller.modelCatalog.mockRejectedValue(new Error('Official model catalog unavailable'))
  for (const type of ['function-add', 'function-edit'] as const) {
    await expect(remote.mutate({ ...scope, type, ...(type === 'function-edit' ? { id: binding.function_id } : {}), value: { ...value, name: 'Unaccepted function' } }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_MODEL_CATALOG_UNAVAILABLE' } })
    expect((await remote.getProjection(scope, signal())).functions).toEqual(before.functions)
  }
  expect(official.controller.selectModel).not.toHaveBeenCalled()
})

it('accepts supported official Agent models and rechecks the current catalog before later saves', async () => {
  const { remote, official } = await fixture(), scope = { workspaceId: 'workspace_1' }
  const catalog = {
    default: { provider: 'provider-a', model: 'shared', reasoningEffort: 'high' },
    groups: [
      { id: 'provider-a', name: 'Provider A', models: [{ id: 'shared', name: 'Reasoning model', reasoning: { efforts: [{ id: 'high', name: 'High' }, { id: 'medium', name: 'Medium' }] } }] },
      { id: 'provider-b', name: 'Provider B', models: [{ id: 'shared', name: 'Plain model' }] },
    ],
    routableProviders: ['provider-a', 'provider-b'], failures: [],
  }
  official.controller.modelCatalog.mockResolvedValue(catalog)
  const value = { name: 'Current model choice', kind: 'prompt', preset_id: 'preset-a', agent_model: catalog.default, requested_skill: null, request_template: 'Read {{requirements_block}}.' }
  await remote.mutate({ ...scope, type: 'function-add', value }, signal())
  const id = (await remote.getProjection(scope, signal())).functions.find(item => item.name === value.name)!.function_id
  for (const agent_model of [{ provider: 'provider-b', model: 'shared' }, { provider: 'provider-a', model: 'shared', reasoningEffort: 'medium' }]) {
    await remote.mutate({ ...scope, type: 'function-edit', id, value: { ...value, agent_model } }, signal())
    expect((await remote.getProjection(scope, signal())).functions.find(item => item.function_id === id)!.agent_model).toEqual(agent_model)
  }
  const before = await remote.getProjection(scope, signal())
  official.controller.modelCatalog.mockResolvedValue({ ...catalog, routableProviders: ['provider-b'] })
  await expect(remote.mutate({ ...scope, type: 'function-edit', id, value }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_INVALID_INPUT' } })
  expect((await remote.getProjection(scope, signal())).functions).toEqual(before.functions)
  expect(official.controller.selectModel).not.toHaveBeenCalled()
})

async function startConfiguredTask(remote: import('../../src/host/workbench/remote-service.ts').WorkbenchRemoteService, scope: WorkbenchScope, functionId: string) {
  const projection = await remote.getProjection(scope, signal())
  const binding = projection.functions.find(item => item.function_id === functionId)
  const branch = projection.branches.find(item => item.branch_id === scope.branchId)
  if (binding?.kind === 'prompt' && branch && !branch.draft.base_model_id && !branch.draft.generation_input.model) await saveFixtureDraft(remote, scope, draft => { draft.base_model_id = '1' }, signal())
  return remote.mutate({ ...scope, type: 'agent-action', id: functionId }, signal())
}

async function fixture() {
  const result = await createWorkbenchHostFixture()
  cleanups.push(result.dispose)
  return result
}

it('keeps both prompt slots and rejects unsupported prompt fields', async () => {
  const { remote } = await fixture()
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Parameters', goal: 'Edit parameters' } }, signal())
  await saveFixtureDraft(remote, { ...selected }, draft => { draft.generation_input.instance_id = '8' }, signal())
  for (const value of [{ kind: 'model', id: '2' }, { kind: 'comfyui-template', id: '5' }]) { await remote.mutate({ ...selected, type: 'resource-select', value }, signal())
  await saveFixtureDraft(remote, { ...selected }, () => {}, signal()) }
  const before = (await remote.getProjection(selected, signal())).branches[0]!.draft
  for (const field of ['steps', 'cfg', 'seed', 'references']) {
    await expect(saveFixtureDraft(remote, { ...selected }, draft => { draft.prompt_input[field as 'positive_prompt' | 'negative_prompt'] = 2 as never }, signal())).rejects.toMatchObject({
      code: 'workbench/operation-failed', details: { code: 'WORKBENCH_INVALID_INPUT', issues: [{ path: 'draft' }] },
    })
  }
  expect((await remote.getProjection(selected, signal())).branches[0]!.draft).toEqual(before)
})

it('reads registered instance titles through the public Catalog and exposes only their IDs and names', async () => {
  const { remote, catalog } = await fixture()
  const query = vi.fn(async () => ({
    status: 'ok', message: null, page: 1, page_size: 100, total_count: 2,
    results: [
      { id: 8, title: 'win3080', url: 'http://private-a', authorization: 'private-a-token' },
      { id: 9, title: 'render-node', url: 'http://private-b', authorization: 'private-b-token' },
    ],
  }))
  const source = new CatalogClient({ settings: { get: () => ({ url: 'https://catalog.example.com', port: 18093 }) }, query })
  catalog.queryComfyuiInstances.mockImplementation((request, signal) => source.queryComfyuiInstances(request, signal))
  const environment = await remote.getEnvironment({}, signal())
  expect(catalog.queryComfyuiInstances).toHaveBeenCalledWith(CATALOG_COMFYUI_INSTANCE_QUERY, expect.any(AbortSignal))
  expect(environment.instances).toEqual([{ id: '8', name: 'win3080' }, { id: '9', name: 'render-node' }])
  expect(JSON.stringify(environment.instances)).not.toContain('private-')
  expect(query).toHaveBeenCalledOnce()
})

it.each(['', '   ', ' 生成提示词 '])('rejects a blank or duplicate function name through Remote and preserves saved input: %j', async name => {
  const { remote, store } = await fixture()
  const scope = { workspaceId: 'workspace_1' }
  await remote.getProjection(scope, signal())
  const value = editableBinding({ ...store.getFunctionBinding(scope.workspaceId, 'prompt'), name: '自定义功能', preset_id: 'preset-a' })
  await remote.mutate({ ...scope, type: 'function-add', value }, signal())
  const binding = (await remote.getProjection(scope, signal())).functions.find(item => item.name === value.name)!
  await expect(remote.mutate({ ...scope, type: 'function-edit', id: binding.function_id, value: editableBinding({ ...binding, name, request_template: 'Rejected edit {{requirements_block}}' }) }, signal())).rejects.toMatchObject({
    details: { code: 'WORKBENCH_INVALID_INPUT', issues: [{ path: 'binding.name', message: '请填写与已有功能不同的名称。' }] },
  })
  expect(store.getFunctionBinding(scope.workspaceId, binding.function_id)).toEqual(binding)
})

it('trims saved function names, permits the original name and permits matching names in another Workspace', async () => {
  const { remote, store } = await fixture()
  for (const workspaceId of ['workspace_1', 'workspace_2']) {
    await remote.getProjection({ workspaceId }, signal())
    const value = editableBinding({ ...store.getFunctionBinding(workspaceId, 'prompt'), name: '  共享名称  ', preset_id: 'preset-a' })
    await remote.mutate({ workspaceId, type: 'function-add', value }, signal())
    const binding = (await remote.getProjection({ workspaceId }, signal())).functions.find(item => item.name === '共享名称')!
    const saved = store.getFunctionBinding(workspaceId, binding.function_id)
    expect(saved.name).toBe('共享名称')
    await remote.mutate({ workspaceId, type: 'function-edit', id: saved.function_id, value: editableBinding({ ...saved, name: ' 共享名称 ', request_template: 'Edited task {{requirements_block}}' }) }, signal())
    expect(store.getFunctionBinding(workspaceId, binding.function_id)).toEqual({ ...saved, request_template: 'Edited task {{requirements_block}}' })
  }
  expect(store.listFunctionBindings('workspace_1').find(item => !item.builtin)!.name).toBe(store.listFunctionBindings('workspace_2').find(item => !item.builtin)!.name)
})

it('uses the registered directory before checking workspace names and reports creation failures', async () => {
  const { remote, createWorkspace } = await fixture()
  await expect(remote.mutate({ type: 'new-workspace', workspaceId: '', value: { name: 'First project', path: '/workspace/third' } }, signal()))
    .rejects.toMatchObject({ message: '已有同名工作区，请使用其他名称。', details: { code: 'WORKBENCH_WORKSPACE_NAME_CONFLICT', issues: [{ path: 'name', message: '已有同名工作区，请使用其他名称。' }] } })
  expect(createWorkspace).not.toHaveBeenCalled()
  expect(await remote.mutate({ type: 'new-workspace', workspaceId: '', value: { name: 'Second project', path: '/workspace/project' } }, signal()))
    .toEqual({ workspaceId: 'workspace_1' })
  const original = await remote.getEnvironment({}, signal())
  expect(original.workspaces.map(workspace => workspace.name)).toEqual(['First project', 'Second project'])
  await remote.mutate({ type: 'new-workspace', workspaceId: '', value: { name: '  Third project  ', path: '  /workspace/third  ' } }, signal())
  expect(createWorkspace).toHaveBeenLastCalledWith('/workspace/third', 'Third project')
  createWorkspace.mockRejectedValueOnce(Object.assign(new Error('ENOENT: directory not found'), { code: 'ENOENT' }))
  await expect(remote.mutate({ type: 'new-workspace', workspaceId: '', value: { name: 'Missing', path: '/workspace/missing' } }, signal()))
    .rejects.toMatchObject({ details: { code: 'WORKBENCH_WORKSPACE_CREATE_FAILED', issues: [{ path: 'path', message: '无法添加工作区，请填写已存在且可访问的项目目录。' }] } })
})

it('saves native aspect-ratio and preset size values and rejects invalid parameters', async () => {
  const { remote, inspect, store } = await fixture()
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal())
  await saveFixtureDraft(remote, { ...selected }, draft => { draft.generation_input.instance_id = '8' }, signal())
  inspect.mockResolvedValue({ parameters: [], size_candidates: [{
    candidate_id: 'ratio-size', representation: 'aspect_ratio_megapixels',
    aspect_ratio: { parameter_id: 'ratio', kind: 'aspect_ratio', value_type: 'choice', current_value: '1:1', allowed_values: ['1:1', '3:4'] },
    megapixels: { parameter_id: 'pixels', kind: 'megapixels', value_type: 'number', current_value: 1, minimum: 0.5, maximum: 2 },
  }] })
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal())
  await saveFixtureDraft(remote, { ...selected }, () => {}, signal())
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'comfyui-template', id: '6' } }, signal())
  await saveFixtureDraft(remote, { ...selected }, () => {}, signal())
  await saveFixtureDraft(remote, { ...selected }, draft => { Object.assign(draft.generation_input.parameters, ({ candidate_id: 'ratio-size', parameters: { ratio: '3:4', pixels: 1.2 } }).parameters) }, signal())
  expect(store.getBranch(selected.branchId!).draft.generation_input.parameters).toEqual({ ratio: '3:4', pixels: 1.2 })
  inspect.mockResolvedValue({ parameters: [], size_candidates: [{
    candidate_id: 'preset-size', representation: 'resolution_preset',
    parameter: { parameter_id: 'resolution', kind: 'resolution_preset', value_type: 'choice', current_value: 'square', allowed_values: ['square', 'portrait'] },
    mapped_options: [{ value: 'portrait', width: 768, height: 1024 }], unmapped_values: ['square'],
  }] })
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'comfyui-template', id: '7' } }, signal())
  await saveFixtureDraft(remote, { ...selected }, () => {}, signal())
  await saveFixtureDraft(remote, { ...selected }, draft => { Object.assign(draft.generation_input.parameters, ({ candidate_id: 'preset-size', parameters: { resolution: 'portrait' } }).parameters) }, signal())
  expect(store.getBranch(selected.branchId!).draft.generation_input.parameters).toEqual({ resolution: 'portrait' })
  await expect(saveFixtureDraft(remote, selected, draft => { draft.generation_input.parameters.resolution = 'outside' }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_INVALID_INPUT' } })
  await expect(saveFixtureDraft(remote, selected, draft => { draft.generation_input.parameters.width = 512 }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_PARAMETER_NOT_ALLOWED' } })
  expect(store.getBranch(selected.branchId!).draft.generation_input.parameters).toEqual({ resolution: 'portrait' })
})

it.each([
  { type: 'function-preset', broken: false },
  { type: 'function-preset', broken: true },
  { type: 'function-edit', broken: false },
  { type: 'function-edit', broken: true },
] as const)('rejects $type when its selected preset becomes unavailable (broken=$broken)', async ({ type, broken }) => {
  const { remote, official } = await fixture()
  const scope = { workspaceId: 'workspace_1' }
  await remote.mutate({ ...scope, type: 'function-preset', id: 'prompt', value: 'preset-a' }, signal())
  const before = await remote.getProjection(scope, signal())
  const binding = before.functions.find(item => item.function_id === 'prompt')!
  official.listPresets.mockResolvedValue(broken ? [{ id: 'preset-a', broken: 'Missing component' }] : [])
  await expect(remote.mutate({
    ...scope, type, id: 'prompt',
    value: type === 'function-preset' ? 'preset-a' : editableBinding({ ...binding, request_template: 'Read task {{requirements_block}} and paint stars.' }),
  }, signal())).rejects.toMatchObject({
    details: { code: 'WORKBENCH_PRESET_UNAVAILABLE', issues: [{ path: 'preset_id', message: '所选 Agent 预设当前不可用，请重新选择预设。' }] },
  })
  expect((await remote.getProjection(scope, signal())).functions).toEqual(before.functions)
})

it.each([
  { name: 'prompt-builder', modelInvocable: true, expected: 'prompt-builder' },
  { name: 'prompt-builder', modelInvocable: false, expected: null },
  { name: 'other-skill', modelInvocable: true, expected: null },
])('keeps the requested Skill only when the replacement preset can invoke it ($name, $modelInvocable)', async ({ name, modelInvocable, expected }) => {
  const { remote, official } = await fixture()
  const scope = { workspaceId: 'workspace_1' }
  official.listPresets.mockResolvedValue([{ id: 'preset-a' }, { id: 'preset-b' }])
  const original = (await remote.getProjection(scope, signal())).functions.find(binding => binding.function_id === 'prompt')!
  const binding = {
    ...original, preset_id: 'preset-a', requested_skill: 'prompt-builder',
    request_template: 'Read task {{requirements_block}} and compose rain.',
    agent_model: { provider: 'saved-provider', model: 'saved-model', reasoningEffort: 'high' },
  }
  const catalog = await official.controller.modelCatalog()
  official.controller.modelCatalog.mockResolvedValue({ ...catalog, groups: [...catalog.groups, { id: 'saved-provider', name: 'Saved provider', models: [{ id: 'saved-model', name: 'Saved model', reasoning: { efforts: [{ id: 'high', name: 'High' }] } }] }], routableProviders: [...catalog.routableProviders, 'saved-provider'] })
  await remote.mutate({ ...scope, type: 'function-edit', id: binding.function_id, value: editableBinding(binding) }, signal())
  official.listSkills.mockResolvedValue([{ name, description: 'Preset skill', invocation: { modelInvocable } }])
  await remote.mutate({ ...scope, type: 'function-preset', id: 'prompt', value: 'preset-b' }, signal())
  expect((await remote.getProjection(scope, signal())).functions.find(item => item.function_id === 'prompt')).toEqual({
    ...binding, preset_id: 'preset-b', requested_skill: expected,
  })
  expect(official.listSkills).toHaveBeenCalledWith({ cwd: '/workspace/project', scope: 'preset-scope' })
  expect(official.disposeScope).toHaveBeenCalledOnce()
})

it('preserves each saved function model in Task snapshots, sends its exact selection and stores the official receipt across later binding edits', async () => {
  const { remote, official } = await fixture()
  const modelCatalog = {
    default: { provider: 'provider-a', model: 'model-a' },
    groups: [
      { id: 'provider-a', name: 'Provider A', models: [
        { id: 'model-a', name: 'Default model' },
        { id: 'shared', name: 'Reasoning model', reasoning: { efforts: [{ id: 'medium', name: 'Medium' }, { id: 'high', name: 'High' }], defaultEffort: 'medium' } },
      ] },
      { id: 'provider-b', name: 'Provider B', models: [{ id: 'shared', name: 'Fast model' }] },
    ],
    routableProviders: ['provider-a', 'provider-b'], failures: [],
  }
  official.controller.modelCatalog.mockResolvedValue(modelCatalog)
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Model choices', goal: 'Paint rain' } }, signal())
  expect((await remote.getEnvironment({ workspaceId: 'workspace_1' }, signal())).models).toEqual(modelCatalog)
  const initial = await remote.getProjection(selected, signal())
  const promptBinding = {
    ...initial.functions.find(item => item.function_id === 'prompt')!, preset_id: 'preset-a',
    agent_model: { provider: 'provider-a', model: 'shared', reasoningEffort: 'high' },
  }
  const rewriteBinding = {
    ...initial.functions.find(item => item.function_id === 'resources')!, preset_id: 'preset-a',
    agent_model: { provider: 'provider-b', model: 'shared' },
  }
  await remote.mutate({ ...selected, type: 'function-edit', id: promptBinding.function_id, value: editableBinding(promptBinding) }, signal())
  await remote.mutate({ ...selected, type: 'function-edit', id: rewriteBinding.function_id, value: editableBinding(rewriteBinding) }, signal())
  const saved = await remote.getProjection(selected, signal())
  expect(saved.functions.find(item => item.function_id === 'prompt')).toEqual(promptBinding)
  expect(saved.functions.find(item => item.function_id === 'resources')).toEqual(rewriteBinding)

  official.controller.selectModel.mockResolvedValueOnce({ selected: { provider: 'provider-a', model: 'shared', reasoningEffort: 'medium' } })
  await startConfiguredTask(remote, selected, 'prompt')
  const promptTask = (await remote.getProjection(selected, signal())).tasks.find(item => item.binding_snapshot.function_id === 'prompt')!
  expect(promptTask).toMatchObject({
    execution_state: 'running',
    binding_snapshot: { agentModel: { provider: 'provider-a', model: 'shared', reasoningEffort: 'high' } },
    selected_model: { provider: 'provider-a', model: 'shared', reasoningEffort: 'medium' },
  })
  expect(official.controller.selectModel.mock.calls[0]).toStrictEqual([{ sessionId: promptTask.session_id, provider: 'provider-a', model: 'shared', reasoningEffort: 'high' }])

  await remote.mutate({ ...selected, type: 'agent-action', id: 'resources' }, signal())
  const rewriteTask = (await remote.getProjection(selected, signal())).tasks.find(item => item.binding_snapshot.function_id === 'resources')!
  expect(rewriteTask.binding_snapshot.agentModel).toStrictEqual({ provider: 'provider-b', model: 'shared' })
  expect(rewriteTask.selected_model).toStrictEqual({ provider: 'provider-b', model: 'shared' })
  expect(official.controller.selectModel.mock.calls[1]).toStrictEqual([{ sessionId: rewriteTask.session_id, provider: 'provider-b', model: 'shared' }])

  await remote.mutate({ ...selected, type: 'function-edit', id: promptBinding.function_id, value: editableBinding({ ...promptBinding, agent_model: { provider: 'provider-b', model: 'shared' } }) }, signal())
  await remote.mutate({ ...selected, type: 'function-edit', id: rewriteBinding.function_id, value: editableBinding({ ...rewriteBinding, agent_model: { provider: 'provider-a', model: 'shared', reasoningEffort: 'medium' } }) }, signal())
  await startConfiguredTask(remote, selected, 'prompt')
  const updated = await remote.getProjection(selected, signal())
  expect(updated.tasks.find(item => item.task_id === promptTask.task_id)).toMatchObject({
    binding_snapshot: { agentModel: { provider: 'provider-a', model: 'shared', reasoningEffort: 'high' } },
    selected_model: { provider: 'provider-a', model: 'shared', reasoningEffort: 'medium' },
  })
  const storedRewrite = updated.tasks.find(item => item.task_id === rewriteTask.task_id)!
  expect(storedRewrite.binding_snapshot.agentModel).toStrictEqual({ provider: 'provider-b', model: 'shared' })
  expect(storedRewrite.selected_model).toStrictEqual({ provider: 'provider-b', model: 'shared' })
  const nextPromptTask = updated.tasks.find(item => item.task_id !== promptTask.task_id && item.binding_snapshot.function_id === 'prompt')!
  expect(nextPromptTask.binding_snapshot.agentModel).toStrictEqual({ provider: 'provider-b', model: 'shared' })
  expect(nextPromptTask.selected_model).toStrictEqual({ provider: 'provider-b', model: 'shared' })
  expect(official.controller.selectModel.mock.calls[2]).toStrictEqual([{ sessionId: nextPromptTask.session_id, provider: 'provider-b', model: 'shared' }])
  expect(updated.functions.find(item => item.function_id === 'prompt')!.agent_model).toStrictEqual({ provider: 'provider-b', model: 'shared' })
  expect(updated.functions.find(item => item.function_id === 'resources')!.agent_model).toStrictEqual({ provider: 'provider-a', model: 'shared', reasoningEffort: 'medium' })
})

it('stores prompt and run presets independently for each Workspace', async () => {
  const { remote, official } = await fixture()
  official.listPresets.mockResolvedValue([{ id: 'preset-a' }, { id: 'preset-b' }])
  await remote.mutate({ workspaceId: 'workspace_1', type: 'function-preset', id: 'prompt', value: 'preset-a' }, signal())
  await remote.mutate({ workspaceId: 'workspace_1', type: 'function-preset', id: 'run', value: 'preset-b' }, signal())
  await remote.mutate({ workspaceId: 'workspace_2', type: 'function-preset', id: 'prompt', value: 'preset-b' }, signal())
  await remote.mutate({ workspaceId: 'workspace_2', type: 'function-preset', id: 'run', value: 'preset-a' }, signal())
  const first = await remote.getProjection({ workspaceId: 'workspace_1' }, signal())
  const second = await remote.getProjection({ workspaceId: 'workspace_2' }, signal())
  expect(first.functions.find(binding => binding.function_id === 'prompt')?.preset_id).toBe('preset-a')
  expect(first.functions.find(binding => binding.function_id === 'run')?.preset_id).toBe('preset-b')
  expect(second.functions.find(binding => binding.function_id === 'prompt')?.preset_id).toBe('preset-b')
  expect(second.functions.find(binding => binding.function_id === 'run')?.preset_id).toBe('preset-a')
  expect((await remote.getProjection({ workspaceId: 'workspace_1' }, signal())).functions).toEqual(first.functions)
  expect((await remote.getProjection({ workspaceId: 'workspace_2' }, signal())).functions).toEqual(second.functions)
})

it.each([
  { waitFor: 'presets', initialSkill: null, supported: true },
  { waitFor: 'presets', initialSkill: null, supported: false },
  { waitFor: 'presets', initialSkill: 'prompt-builder', supported: true },
  { waitFor: 'presets', initialSkill: 'prompt-builder', supported: false },
  { waitFor: 'skills', initialSkill: null, supported: true },
  { waitFor: 'skills', initialSkill: null, supported: false },
  { waitFor: 'skills', initialSkill: 'prompt-builder', supported: true },
  { waitFor: 'skills', initialSkill: 'prompt-builder', supported: false },
] as const)('preserves edits saved while inline preset selection awaits $waitFor (initialSkill=$initialSkill, supported=$supported)', async ({ waitFor, initialSkill, supported }) => {
  const { remote, official } = await fixture()
  const scope = { workspaceId: 'workspace_1' }
  const presets = [{ id: 'preset-a' }, { id: 'preset-b' }]
  const skills = [{ name: 'changed-skill', description: 'Replacement preset skill', invocation: { modelInvocable: supported } }]
  const catalog = await official.controller.modelCatalog()
  official.controller.modelCatalog.mockResolvedValue({ ...catalog, groups: [...catalog.groups, { id: 'changed-provider', name: 'Changed provider', models: [{ id: 'changed-model', name: 'Changed model', reasoning: { efforts: [{ id: 'high', name: 'High' }] } }] }], routableProviders: [...catalog.routableProviders, 'changed-provider'] })
  official.listPresets.mockResolvedValue(presets)
  official.listSkills.mockResolvedValue(skills)
  const original = (await remote.getProjection(scope, signal())).functions.find(binding => binding.function_id === 'prompt')!
  const binding = { ...original, preset_id: 'preset-a', requested_skill: initialSkill }
  await remote.mutate({ ...scope, type: 'function-edit', id: binding.function_id, value: editableBinding(binding) }, signal())
  let entered!: () => void, release!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  const blocked = new Promise<void>(resolve => { release = resolve })
  if (waitFor === 'presets') official.listPresets.mockImplementationOnce(async () => { entered(); await blocked; return presets })
  else official.listSkills.mockImplementationOnce(async () => { entered(); await blocked; return skills })
  const pending = remote.mutate({ ...scope, type: 'function-preset', id: 'prompt', value: 'preset-b' }, signal())
  const edited = {
    ...binding, request_template: 'Read task {{requirements_block}} and compose stars.',
    agent_model: { provider: 'changed-provider', model: 'changed-model', reasoningEffort: 'high' },
    requested_skill: 'changed-skill',
  }
  try {
    expect(await Promise.race([started.then(() => 'waiting'), pending.then(() => 'completed')])).toBe('waiting')
    await remote.mutate({ ...scope, type: 'function-edit', id: edited.function_id, value: editableBinding(edited) }, signal())
    expect((await remote.getProjection(scope, signal())).functions.find(item => item.function_id === 'prompt')).toEqual(edited)
    official.controller.modelCatalog.mockClear()
  } finally { release(); await pending }
  expect(official.controller.modelCatalog).not.toHaveBeenCalled()
  expect((await remote.getProjection(scope, signal())).functions.find(item => item.function_id === 'prompt')).toEqual({
    ...edited, preset_id: 'preset-b', requested_skill: supported ? 'changed-skill' : null,
  })
})

it('keeps the saved binding when replacement preset Skills cannot be read', async () => {
  const { remote, official } = await fixture()
  const scope = { workspaceId: 'workspace_1' }
  const before = await remote.getProjection(scope, signal())
  const binding = { ...before.functions.find(item => item.function_id === 'prompt')!, preset_id: 'preset-a', requested_skill: 'prompt-builder' }
  await remote.mutate({ ...scope, type: 'function-edit', id: binding.function_id, value: editableBinding(binding) }, signal())
  official.listSkills.mockRejectedValueOnce(new Error('Skill provider unavailable'))
  await expect(remote.mutate({ ...scope, type: 'function-preset', id: 'prompt', value: 'preset-a' }, signal())).rejects.toThrow('Skill provider unavailable')
  expect((await remote.getProjection(scope, signal())).functions.find(item => item.function_id === 'prompt')).toEqual(binding)
  expect(official.disposeScope).toHaveBeenCalledOnce()
})

it('renders every whitespace and repeated task token in the actual dispatched request', async () => {
  const { remote, official } = await fixture()
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal())
  const original = (await remote.getProjection(selected, signal())).functions.find(binding => binding.function_id === 'resources')!
  const template = 'Read {{ task_id }}, compare {{task_id}}, publish {{\ttask_id\n}}.'
  await remote.mutate({ ...selected, type: 'function-edit', id: original.function_id, value: editableBinding({ ...original, preset_id: 'preset-a', request_template: template }) }, signal())
  expect((await remote.getProjection(selected, signal())).functions.find(binding => binding.function_id === 'resources')?.request_template).toBe(template)
  await remote.mutate({ ...selected, type: 'agent-action', id: 'resources' }, signal())
  const task = (await remote.getProjection(selected, signal())).tasks[0]!
  const expected = `Read ${task.task_id}, compare ${task.task_id}, publish ${task.task_id}.`
  expect(task.request_text).toBe(expected)
  expect(task.binding_snapshot.request_template).toBe(template)
  expect(official.controller.prompt).toHaveBeenCalledWith(
    expect.objectContaining({ sessionId: task.session_id, content: [{ type: 'text', text: expected }] }), expect.any(AbortSignal),
  )
})

it('keeps each dispatched template snapshot when requirements are edited for the next Task', async () => {
  const { remote, official } = await fixture()
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Requirements', goal: 'Paint rain' } }, signal())
  const original = (await remote.getProjection(selected, signal())).functions.find(binding => binding.function_id === 'resources')!
  const firstTemplate = '  Read {{task_id}}.\nKeep {branch_id}, ${session_id}, $& and "quoted".  \n'
  const firstBinding = { ...original, preset_id: 'preset-a', request_template: firstTemplate }
  await remote.mutate({ ...selected, type: 'function-edit', id: firstBinding.function_id, value: editableBinding(firstBinding) }, signal())
  await remote.mutate({ ...selected, type: 'agent-action', id: 'resources' }, signal())
  const firstTask = (await remote.getProjection(selected, signal())).tasks[0]!
  const firstRequest = '  Read ' + firstTask.task_id + '.\nKeep {branch_id}, ${session_id}, $& and "quoted".  \n'
  expect(firstTask.request_text).toBe(firstRequest)
  expect(firstTask.binding_snapshot.request_template).toBe(firstTemplate)

  const nextTemplate = 'Next {{task_id}}:\n\tretain {branch_id} and ${session_id}.\n'
  await remote.mutate({ ...selected, type: 'function-edit', id: firstBinding.function_id, value: editableBinding({ ...firstBinding, request_template: nextTemplate }) }, signal())
  await remote.mutate({ ...selected, type: 'agent-action', id: 'resources' }, signal())
  const updated = await remote.getProjection(selected, signal())
  expect(updated.functions.find(binding => binding.function_id === 'resources')!.request_template).toBe(nextTemplate)
  expect(updated.tasks.find(task => task.task_id === firstTask.task_id)).toMatchObject({
    request_text: firstRequest, binding_snapshot: firstTask.binding_snapshot,
  })
  const nextTask = updated.tasks.find(task => task.task_id !== firstTask.task_id)!
  const nextRequest = 'Next ' + nextTask.task_id + ':\n\tretain {branch_id} and ${session_id}.\n'
  expect(nextTask.request_text).toBe(nextRequest)
  expect(nextTask.binding_snapshot.request_template).toBe(nextTemplate)
  expect(official.controller.prompt).toHaveBeenNthCalledWith(1,
    expect.objectContaining({ sessionId: firstTask.session_id, content: [{ type: 'text', text: firstRequest }] }), expect.any(AbortSignal),
  )
  expect(official.controller.prompt).toHaveBeenNthCalledWith(2,
    expect.objectContaining({ sessionId: nextTask.session_id, content: [{ type: 'text', text: nextRequest }] }), expect.any(AbortSignal),
  )
})

it.each([
  { template: '', message: '请填写本功能的执行要求。' },
  { template: 'Read task.', message: '请在执行要求中保留 {{requirements_block}}、{{prompt_edit_block}}、{{references_block}}。' },
  { template: 'Read {{requirements_block}} and {{branch_id}}.', message: '本功能支持的变量为 {{requirements_block}}、{{prompt_edit_block}}、{{references_block}}。请将其他变量改为具体文字。' },
  { template: 'Read {{requirements_block}} {{', message: '变量格式不完整，请使用 {{requirements_block}}、{{prompt_edit_block}}、{{references_block}}。' },
  { template: 'Read {{requirements_block}} }}', message: '变量格式不完整，请使用 {{requirements_block}}、{{prompt_edit_block}}、{{references_block}}。' },
  { template: 'Read {{requirements_block}} {{ task_id }', message: '变量格式不完整，请使用 {{requirements_block}}、{{prompt_edit_block}}、{{references_block}}。' },
])('rejects invalid request template "$template" while retaining the saved binding', async ({ template, message }) => {
  const { remote } = await fixture()
  const scope = { workspaceId: 'workspace_1' }
  const original = (await remote.getProjection(scope, signal())).functions.find(binding => binding.function_id === 'prompt')!
  await remote.mutate({ ...scope, type: 'function-edit', id: original.function_id, value: editableBinding({ ...original, preset_id: 'preset-a', request_template: 'Read {{requirements_block}}.' }) }, signal())
  const before = await remote.getProjection(scope, signal())
  const binding = before.functions.find(item => item.function_id === 'prompt')!
  await expect(remote.mutate({ ...scope, type: 'function-edit', id: binding.function_id, value: editableBinding({ ...binding, request_template: template }) }, signal()))
    .rejects.toMatchObject({ details: { code: 'WORKBENCH_INVALID_INPUT', issues: [{ path: 'binding.request_template', message }] } })
  expect((await remote.getProjection(scope, signal())).functions).toEqual(before.functions)
})

it('saves edited and inline function presets with sibling official service providers', async () => {
  const { remote } = await fixture()
  const scope = { workspaceId: 'workspace_1' }
  const original = (await remote.getProjection(scope, signal())).functions.find(binding => binding.function_id === 'prompt')!
  const edited = { ...original, preset_id: 'preset-a', requested_skill: 'prompt-builder', request_template: 'Read task {{requirements_block}} and compose stars.' }
  await remote.mutate({ ...scope, type: 'function-edit', id: edited.function_id, value: editableBinding(edited) }, signal())
  expect((await remote.getProjection(scope, signal())).functions.find(binding => binding.function_id === 'prompt')).toEqual(edited)
  await remote.mutate({ ...scope, type: 'function-preset', id: 'prompt', value: 'preset-a' }, signal())
  expect((await remote.getProjection(scope, signal())).functions.find(binding => binding.function_id === 'prompt')).toEqual(edited)
})

it.each(['missing', 'not-model-invocable'] as const)('rejects a specified Skill that is %s in the actual Session and dispatches after saving Agent choice', async availability => {
  const { ctx, remote, official } = await fixture()
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Skill choices', goal: 'Paint rain' } }, signal())
  const environment = await remote.getEnvironment({ workspaceId: 'workspace_1', presetId: 'preset-a' }, signal())
  expect(environment.skills).toEqual([{ name: 'prompt-builder', description: 'Compose prompts' }])
  const original = (await remote.getProjection(selected, signal())).functions.find(item => item.function_id === 'prompt')!
  const binding = { ...original, preset_id: 'preset-a', requested_skill: 'prompt-builder' }
  await remote.mutate({ ...selected, type: 'function-edit', id: binding.function_id, value: editableBinding(binding) }, signal())
  const createSession = official.controller.create.getMockImplementation()!
  official.controller.create.mockImplementation(async input => {
    const session = await createSession(input)
    official.agents.get(session.sessionId)!.ctx.skills.list.mockResolvedValue(availability === 'missing'
      ? [] : [{ name: 'prompt-builder', description: 'Unavailable to model', invocation: { modelInvocable: false } }])
    return session
  })
  await expect(startConfiguredTask(remote, selected, 'prompt'))
    .rejects.toThrow('当前预设无法调用 Skill prompt-builder。请在功能配置中选择可用 Skill。')
  const rejected = await remote.getProjection(selected, signal())
  expect(rejected.tasks).toHaveLength(1)
  expect(rejected.tasks[0]).toMatchObject({
    status: 'failed', execution_state: 'failed',
    input: { requested_skill: 'prompt-builder' },
    binding_snapshot: { preset_id: 'preset-a', requested_skill: 'prompt-builder' },
    error: { code: 'WORKBENCH_DISPATCH_FAILED', message: '当前预设无法调用 Skill prompt-builder。请在功能配置中选择可用 Skill。' },
  })
  expect(official.controller.create).toHaveBeenCalledWith({ workspaceId: 'workspace_1', agentPreset: 'preset-a' })
  expect(official.controller.prompt).not.toHaveBeenCalled()

  await remote.mutate({ ...selected, type: 'function-edit', id: binding.function_id, value: editableBinding({ ...binding, requested_skill: null }) }, signal())
  await startConfiguredTask(remote, selected, 'prompt')
  const repaired = await remote.getProjection(selected, signal())
  expect(repaired.functions.find(item => item.function_id === 'prompt')!.requested_skill).toBeNull()
  const task = repaired.tasks.find(item => item.task_id !== rejected.tasks[0]!.task_id)!
  expect(task).toMatchObject({
    status: 'running', execution_state: 'running',
    input: { requested_skill: null },
    binding_snapshot: { preset_id: 'preset-a', requested_skill: null },
  })
  expect(official.controller.prompt).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ sessionId: task.session_id, content: [{ type: 'text', text: task.request_text }] }), expect.any(AbortSignal))
  expect(await ctx.harnessComfyuiWorkbench.service.getTask({ taskId: task.task_id }, {
    workspaceId: selected.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'read-task',
  })).toMatchObject({ task_id: task.task_id, requested_skill: null })
  expect(repaired.tasks.find(item => item.task_id === rejected.tasks[0]!.task_id)).toMatchObject({
    status: 'failed', input: { requested_skill: 'prompt-builder' }, binding_snapshot: { requested_skill: 'prompt-builder' },
  })
})

it('saves Workspace function bindings and verifies the requested Skill in the actual execution Session', async () => {
  const { ctx, remote, official, store } = await fixture()
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Portrait', goal: 'Paint a portrait' } }, signal())
  const value = editableBinding({ ...store.getFunctionBinding('workspace_1', 'prompt'), name: 'Portrait prompt', preset_id: 'preset-a', requested_skill: 'prompt-builder' })
  await remote.mutate({ ...selected, type: 'function-add', value }, signal())
  const binding = (await remote.getProjection(selected, signal())).functions.find(item => item.name === value.name)!
  await remote.mutate({ ...selected, type: 'function-preset', id: binding.function_id, value: 'preset-a' }, signal())
  await remote.mutate({ ...selected, type: 'function-edit', id: binding.function_id, value: editableBinding({ ...store.getFunctionBinding('workspace_1', binding.function_id), request_template: 'Read task {{requirements_block}} and draw rain.' }) }, signal())
  await startConfiguredTask(remote, selected, binding.function_id)
  const task = (await remote.getProjection(selected, signal())).tasks[0]!
  expect(task).toMatchObject({
    execution_state: 'running',
    input: { requested_skill: 'prompt-builder' },
    binding_snapshot: { function_id: binding.function_id, preset_id: 'preset-a', requested_skill: 'prompt-builder' },
  })
  expect(official.agents.get(task.session_id!)!.ctx.skills.list).toHaveBeenCalledWith({ cwd: '/workspace/project' })
  expect(official.controller.prompt).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ sessionId: task.session_id, content: [{ type: 'text', text: task.request_text }] }), expect.any(AbortSignal))
  expect(await ctx.harnessComfyuiWorkbench.service.getTask({ taskId: task.task_id }, {
    workspaceId: selected.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'read-task',
  })).toMatchObject({ task_id: task.task_id, requested_skill: 'prompt-builder' })
  await remote.mutate({ ...selected, type: 'function-remove', id: binding.function_id }, signal())
  expect((await remote.getProjection(selected, signal())).functions.some(item => item.function_id === binding.function_id)).toBe(false)
  expect(store.getTask(task.task_id).binding_snapshot.requested_skill).toBe('prompt-builder')
  const otherWorkspace = await remote.getProjection({ workspaceId: 'workspace_2' }, signal())
  expect(otherWorkspace.functions.some(item => item.function_id === binding.function_id)).toBe(false)
  const beforeUnload = (await remote.getProjection(selected, signal())).tasks[0]
  official.agents.delete(task.session_id!)
  expect((await remote.getProjection(selected, signal())).tasks[0]).toEqual(beforeUnload)
})

it('asks and answers a task question and pauses, continues and ends the same experiment Session', async () => {
  const { ctx, remote, official } = await fixture()
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal())
  await remote.mutate({ ...selected, type: 'agent-action', id: 'resources' }, signal())
  const prompt = (await remote.getProjection(selected, signal())).tasks[0]!
  const question = await ctx.harnessComfyuiWorkbench.service.publish({ taskId: prompt.task_id, artifact: { type: 'question', question: 'Which light?', options: ['Sun', 'Moon'] } }, { workspaceId: 'workspace_1', sessionId: prompt.session_id!, turn: 1, callId: 'question' })
  expect((await remote.getProjection(selected, signal())).tasks[0]!.status).toBe('waiting_input')
  await remote.mutate({ ...selected, type: 'task-answer', taskId: prompt.task_id, id: question.artifact_id, value: 'Moon' }, signal())
  expect((await remote.getProjection(selected, signal())).tasks[0]!.answers).toEqual([expect.objectContaining({ question_artifact_id: question.artifact_id, answer: 'Moon' })])
  await saveFixtureDraft(remote, { ...selected }, draft => { draft.generation_input.instance_id = '8' }, signal())
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal())
  await saveFixtureDraft(remote, { ...selected }, () => {}, signal())
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'comfyui-template', id: '5' } }, signal())
  await saveFixtureDraft(remote, { ...selected }, () => {}, signal())
  await remote.mutate({ ...selected, type: 'update-execution', field: 'mode', value: 'continuous' }, signal())
  await remote.mutate({ ...selected, type: 'update-execution', field: 'max_runs', value: 3 }, signal())
  await remote.mutate({ ...selected, type: 'experiment' }, signal())
  const experiment = (await remote.getProjection(selected, signal())).tasks.find(item => item.kind === 'experiment')!
  await remote.mutate({ ...selected, type: 'pause-experiment', taskId: experiment.task_id }, signal())
  expect(official.controller.cancel).toHaveBeenCalledWith({ sessionId: experiment.session_id })
  expect((await remote.getProjection(selected, signal())).experiments[0]).toMatchObject({ task_id: experiment.task_id, control_state: 'paused', max_runs: 3 })
  await remote.mutate({ ...selected, type: 'resume-experiment', taskId: experiment.task_id }, signal())
  await remote.mutate({ ...selected, type: 'stop-experiment', taskId: experiment.task_id }, signal())
  const ended = await remote.getProjection(selected, signal())
  expect(ended.experiments[0]).toMatchObject({ control_state: 'ended', end_reason: 'user_ended' })
  expect(ended.tasks.find(task => task.task_id === experiment.task_id)).toMatchObject({ status: 'succeeded' })
  expect(official.controller.create).toHaveBeenCalledTimes(2)
})
const signal = () => new AbortController().signal

it('lists default function bindings in prototype order across repeated workspace reads', async () => {
  const { remote, official } = await fixture()
  const expectedOrder = ['run', 'prompt', 'parameters', 'resources', 'review', 'compare', 'diagnose', 'experience', 'experiment', 'translate']
  const first = await remote.getProjection({ workspaceId: 'workspace_1' }, signal())
  expect(first.functions.map(binding => binding.function_id)).toEqual(expectedOrder)
  expect(first.functions).toHaveLength(10)
  const expectedPresets: Record<string, string> = {
    run: 'harness-comfyui-run', prompt: 'harness-comfyui-prompt',
    parameters: 'harness-comfyui-parameters', resources: 'harness-comfyui-resources',
    review: 'harness-comfyui-review', compare: 'harness-comfyui-review', diagnose: 'harness-comfyui-review',
    experience: 'harness-comfyui-experience', experiment: 'harness-comfyui-experiment',
  }
  for (const binding of first.functions.filter(binding => binding.kind !== 'translate')) expect(binding).toMatchObject({
    workspace_id: 'workspace_1', builtin: true, preset_id: expectedPresets[binding.function_id],
    agent_model: { provider: 'provider-a', model: 'model-a' }, requested_skill: null,
  })
  const second = await remote.getProjection({ workspaceId: 'workspace_2' }, signal())
  expect(second.functions.map(binding => binding.function_id)).toEqual(expectedOrder)
  expect(second.functions.every(binding => binding.workspace_id === 'workspace_2')).toBe(true)
  expect((await remote.getProjection({ workspaceId: 'workspace_1' }, signal())).functions).toEqual(first.functions)
  expect((await remote.getProjection({ workspaceId: 'workspace_1' }, signal())).functions).toEqual(first.functions)
  expect(official.controller.modelCatalog).toHaveBeenCalledTimes(2)
  expect(official.controller.create).not.toHaveBeenCalled()
})

it('fills missing builtin bindings without replacing saved workspace configuration', async () => {
  const { remote, store, official } = await fixture()
  const { functions } = await remote.getProjection({ workspaceId: 'workspace_1' }, signal())
  const template = functions.find(binding => binding.function_id === 'prompt')!
  const saved = store.saveFunctionBinding({ ...template, workspace_id: 'workspace_2', preset_id: 'preset-a',
    agent_model: { provider: 'saved-provider', model: 'saved-model', reasoningEffort: 'high' },
    requested_skill: 'prompt-builder', request_template: 'Read task {{requirements_block}} and rewrite its prompts.',
  })
  const custom = store.saveFunctionBinding({ ...saved, function_id: 'custom-rewrite', builtin: false, name: 'Rewrite glass' })
  const initialized = await remote.getProjection({ workspaceId: 'workspace_2' }, signal())
  expect(initialized.functions.map(binding => binding.function_id)).toEqual([
    'run', 'prompt', 'parameters', 'resources', 'review', 'compare', 'diagnose', 'experience', 'experiment', 'translate', 'custom-rewrite',
  ])
  expect(initialized.functions.find(binding => binding.function_id === 'prompt')).toEqual(saved)
  expect(initialized.functions.find(binding => binding.function_id === 'custom-rewrite')).toEqual(custom)
  expect(initialized.functions.find(binding => binding.function_id === 'run')).toMatchObject({
    preset_id: 'harness-comfyui-run', agent_model: { provider: 'provider-a', model: 'model-a' }, requested_skill: null,
  })
  expect((await remote.getProjection({ workspaceId: 'workspace_2' }, signal())).functions).toEqual(initialized.functions)
  expect((await remote.getProjection({ workspaceId: 'workspace_1' }, signal())).functions).toEqual(functions)
  expect(official.controller.modelCatalog).toHaveBeenCalledTimes(2)
})

it('mounts Workbench Remotes, creates one main branch and isolates Workspace projections', async () => {
  const { ctx, remote, official, fiber, remoteFiber } = await fixture()
  expect(remoteMethods(remote)).toEqual([
    ...['queryRecords', 'importImages', 'resolveImages', 'promptPreview', 'promptStart', 'promptGet', 'promptList', 'promptCancel', 'promptAdopt', 'translateStart', 'translateGet', 'translateCancel'].map(method => ({ method, invocation: { kind: 'direct' } })),
    { method: 'getRunInput', invocation: { kind: 'direct' } },
    { method: 'getEnvironment', invocation: { kind: 'direct' } },
    { method: 'getProjection', invocation: { kind: 'direct' } },
    { method: 'getInputDescription', invocation: { kind: 'direct' } },
    { method: 'getTaskDraft', invocation: { kind: 'direct' } },
    { method: 'saveTaskDraft', invocation: { kind: 'direct' } },
    { method: 'mutate', invocation: { kind: 'direct' } },
  ])
  const empty = await remote.getProjection({ workspaceId: 'workspace_1' }, signal())
  expect(empty).toMatchObject({ works: [], branches: [], tasks: [], refreshAfterMs: 777 })
  expect(empty.functions).toHaveLength(10)
  const created = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain study', goal: 'Rain on glass' } }, signal())
  const first = await remote.getProjection(created, signal())
  expect(first.works).toEqual([{ work_id: created.workId, workspace_id: 'workspace_1', name: 'Rain study', goal: 'Rain on glass' }])
  expect(first.branches).toHaveLength(1)
  expect(first.tasks).toEqual([])
  expect(first.runs).toEqual([])
  expect(first.experiments).toEqual([])
  expect(first.branches[0]).toMatchObject({ branch_id: created.branchId, parent_branch_id: null, name: '主分支', original_request: 'Rain on glass', draft: { prompt_input: { positive_prompt: '', negative_prompt: '' } } })
  expect((await remote.getProjection({ workspaceId: 'workspace_2' }, signal())).works).toEqual([])
  await expect(remote.getProjection({ ...created, workspaceId: 'workspace_2' }, signal())).rejects.toMatchObject({ code: 'workbench/operation-failed', details: { code: 'WORKBENCH_SCOPE_MISMATCH' } })
  await expect(remote.getProjection({ workspaceId: 'missing' }, signal())).rejects.toMatchObject({ code: 'workbench/operation-failed', details: { code: 'WORKBENCH_NOT_FOUND', issues: [{ path: 'workspace_id', message: expect.any(String) }] } })
  expect(official.controller.modelCatalog).toHaveBeenCalledTimes(2)
  await remoteFiber.dispose()
  expect(ctx.reflect.get('harnessComfyuiWorkbenchRemote')).toBeUndefined()
  await fiber.dispose()
  expect(ctx.reflect.get('harnessComfyuiWorkbench')).toBeUndefined()
})

it.each(['preset-missing', 'preset-broken'])('keeps the environment available for reselecting %s', async presetId => {
  const { remote, official } = await fixture()
  official.acquireScope.mockRejectedValueOnce(new Error('Preset cannot be loaded'))
  const environment = await remote.getEnvironment({ workspaceId: 'workspace_1', presetId }, signal())
  expect(environment).toMatchObject({
    workspaces: [{ id: 'workspace_1' }, { id: 'workspace_2' }],
    presets: [{ id: 'preset-a', name: 'Preset A' }, { id: 'preset-broken', broken: 'Missing component' }],
    models: { default: { provider: 'provider-a', model: 'model-a' } },
    instances: [{ id: '8' }], skills: [],
  })
  expect(official.acquireScope).not.toHaveBeenCalled()
  expect(official.listSkills).not.toHaveBeenCalled()
})

it('reads official presets, models and invocable Skills and always releases the acquired preset scope', async () => {
  const { remote, official, catalog, workspaces } = await fixture()
  const environment = await remote.getEnvironment({ workspaceId: 'workspace_1', presetId: 'preset-a' }, signal())
  expect(environment).toMatchObject({
    workspaces: [{ id: 'workspace_1', name: 'First project', path: '/workspace/project' }, { id: 'workspace_2', name: 'Second project', path: '/workspace/other' }],
    models: { default: { provider: 'provider-a', model: 'model-a' } },
    presets: [{ id: 'preset-a', name: 'Preset A' }, { id: 'preset-broken', name: 'preset-broken', broken: 'Missing component' }],
    skills: [{ name: 'prompt-builder', description: 'Compose prompts' }], instances: [{ id: '8', name: 'win3080' }],
  })
  expect(official.listSkills).toHaveBeenCalledWith({ cwd: workspaces[0]!.path, scope: 'preset-scope' })
  expect(official.disposeScope).toHaveBeenCalledOnce()
  official.listPresets.mockResolvedValue([{ id: 'preset-a', name: 'Preset A' }, { id: 'preset-b', name: 'Preset B' }])
  official.acquireScope.mockResolvedValueOnce({ key: 'preset-b-scope', [Symbol.asyncDispose]: official.disposeScope })
  official.listSkills.mockResolvedValueOnce([
    { name: 'alternate-skill', description: 'Alternate preset skill', invocation: { modelInvocable: true } },
    { name: 'prompt-builder', description: 'Unavailable to model', invocation: { modelInvocable: false } },
    { name: 'internal-only', description: 'Internal skill', invocation: { modelInvocable: false } },
  ])
  expect((await remote.getEnvironment({ workspaceId: 'workspace_1', presetId: 'preset-b' }, signal())).skills)
    .toEqual([{ name: 'alternate-skill', description: 'Alternate preset skill' }])
  expect(official.acquireScope).toHaveBeenLastCalledWith('preset-b')
  expect(official.listSkills).toHaveBeenLastCalledWith({ cwd: workspaces[0]!.path, scope: 'preset-b-scope' })
  official.listSkills.mockRejectedValueOnce(new Error('Skill provider unavailable'))
  await expect(remote.getEnvironment({ workspaceId: 'workspace_1', presetId: 'preset-a' }, signal())).rejects.toThrow('Skill provider unavailable')
  expect(official.disposeScope).toHaveBeenCalledTimes(3)
  catalog.queryComfyuiInstances.mockRejectedValueOnce(new Error('Catalog offline'))
  expect((await remote.getEnvironment({}, signal())).instances).toEqual([])
  expect((await remote.getEnvironment({ workspaceId: 'missing', presetId: 'preset-a' }, signal())).skills).toEqual([])
})

it('saves multiline prompt slots together while keeping branches independent without a template', async () => {
  const { remote } = await fixture()
  const parent = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: '温室', goal: '雨后的玻璃温室' } }, signal())
  const prompts = { positive_prompt: '雨后温室\n玻璃反光\r\n  暖色灯光  ', negative_prompt: '模糊\n过曝，结构扭曲\n' }
  await saveFixtureDraft(remote, parent, draft => { draft.prompt_input = prompts }, signal())
  expect((await remote.getProjection(parent, signal())).branches[0]?.draft.prompt_input).toEqual(prompts)
  const child = await remote.mutate({ ...parent, type: 'create-branch', value: { name: '夜间温室', original_request: '比较夜间灯光' } }, signal())
  const childPrompts = { positive_prompt: '夜间温室\n窗内暖光', negative_prompt: '强烈眩光\n玻璃变形' }
  await Promise.all([
    saveFixtureDraft(remote, parent, draft => { draft.prompt_input = { positive_prompt: '', negative_prompt: '' } }, signal()),
    saveFixtureDraft(remote, child, draft => { draft.prompt_input = childPrompts }, signal()),
  ])
  const result = await remote.getProjection(parent, signal())
  expect(result.branches.find(branch => branch.branch_id === parent.branchId)?.draft.prompt_input).toEqual({ positive_prompt: '', negative_prompt: '' })
  expect(result.branches.find(branch => branch.branch_id === child.branchId)?.draft.prompt_input).toEqual(childPrompts)
})

it('edits branch input through real actions, resolves catalog resources and dispatches the selected official Session', async () => {
  const { remote, official, catalog, store, createWorkspace } = await fixture()
  const createdWorkspace = await remote.mutate({ type: 'new-workspace', workspaceId: '', value: { name: 'Third project', path: '/workspace/third' } }, signal())
  expect(createWorkspace).toHaveBeenCalledWith('/workspace/third', 'Third project')
  expect(createdWorkspace).toEqual({ workspaceId: 'workspace_3' })
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal())
  const action = (type: ExperimentWorkbenchAction['type'], value?: unknown, field?: string, id?: string) => remote.mutate({ ...selected, type, value, field, id }, signal())
  await saveFixtureDraft(remote, { ...selected }, () => {}, signal(), { name: 'Wet glass', expectedName: '主分支' })
  await saveFixtureDraft(remote, { ...selected }, () => {}, signal(), { originalRequest: 'Paint rain at night', expectedOriginalRequest: 'Paint rain' })
  await saveFixtureDraft(remote, selected, draft => { draft.prompt_input = { positive_prompt: 'rain at night', negative_prompt: 'blur' }; draft.generation_input.instance_id = '8' }, signal())
  await action('resource-select', { kind: 'model', id: '2' })
  await action('resource-select', { kind: 'lora', id: '3' })
  await action('resource-select', { kind: 'lora', id: '3' })
  await action('resource-select', { kind: 'comfyui-template', id: '5' })
  await saveFixtureDraft(remote, selected, draft => {
    Object.assign(draft.generation_input.parameters, { width: 768, height: 1024, seed: 42 })
    draft.image_refs = [{ image_ref_id: 'image-reference', source: { kind: 'uploaded_file', file_id: 'file-reference' }, purpose: 'both', reference_requirement: 'Retain the reflections' }]
    draft.workflow_image_bindings = [{ parameter_id: 'reference', image_ref_ids: ['image-reference'] }]
    draft.generation_input.loras.find(lora => lora.id === '3')!.weight = 0.8
  }, signal())
  const edited = await remote.getProjection(selected, signal())
  expect(edited.branches[0]).toMatchObject({ name: 'Wet glass', original_request: 'Paint rain at night', draft: {
    base_model_id: '1', image_refs: [{ image_ref_id: 'image-reference', source: { kind: 'uploaded_file', file_id: 'file-reference' }, purpose: 'both', reference_requirement: 'Retain the reflections' }], workflow_image_bindings: [{ parameter_id: 'reference', image_ref_ids: ['image-reference'] }],
    generation_input: { model: { id: '2', file_name: 'paint.safetensors' }, template_id: '5', parameters: { width: 768, height: 1024, seed: 42 }, loras: [{ id: '3', weight: 0.8, trigger_words: ['rain'] }] },
  } })
  await remote.mutate({ ...selected, type: 'function-preset', id: 'run', value: 'preset-a' }, signal())
  const accepted = await action('run', { instructions: 'Keep the reflections' })
  const running = await remote.getProjection(selected, signal())
  const task = running.tasks[0]!
  expect(accepted).toEqual({ ...selected, taskId: task.task_id })
  expect(task).toMatchObject({ kind: 'run', execution_state: 'running', input: { requirements: { original_request: 'Paint rain at night', instructions: 'Keep the reflections' }, generation_input: { parameters: { positive: 'rain at night', negative: 'blur', seed: 42 } }, max_runs: 1 } })
  expect(official.controller.create).toHaveBeenCalledWith({ workspaceId: 'workspace_1', agentPreset: 'preset-a' })
  expect(official.controller.selectModel).toHaveBeenCalledWith({ sessionId: task.session_id, provider: 'provider-a', model: 'model-a' })
  expect(official.controller.prompt).toHaveBeenCalledWith(expect.objectContaining({ sessionId: task.session_id, mode: 'queue', content: [{ type: 'text', text: task.request_text }] }), expect.any(AbortSignal))
  const branch = await action('create-branch', { name: 'Variation', original_request: 'Less rain' })
  expect((await remote.getProjection(branch, signal())).branches).toEqual(expect.arrayContaining([expect.objectContaining({ branch_id: branch.branchId, parent_branch_id: selected.branchId, original_request: 'Less rain' })]))
  await action('resource-remove', 'model')
  await action('resource-remove', 'lora', undefined, '3')
  await action('resource-remove', 'comfyui-template')
  expect(store.getBranch(selected.branchId!).editing_draft).toMatchObject({ generation_input: { model: null, template_id: null, loras: [] }, image_refs: [{ image_ref_id: 'image-reference', purpose: 'both', reference_requirement: 'Retain the reflections' }], workflow_image_bindings: [] })
})

it('includes the total branch count across workspaces in each work projection', async () => {
  const { remote } = await fixture()
  const first = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'First', goal: 'Rain' } }, signal())
  const second = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Second', goal: 'Light' } }, signal())
  await remote.mutate({ type: 'new-work', workspaceId: 'workspace_2', value: { name: 'Other workspace', goal: 'Portrait' } }, signal())
  expect(await remote.getProjection(second, signal())).toMatchObject({ total_branch_count: 3, branches: [expect.objectContaining({ branch_id: second.branchId })] })
  await remote.mutate({ ...first, type: 'create-branch', value: { name: 'Warm', original_request: 'Warm rain' } }, signal())
  expect(await remote.getProjection(second, signal())).toMatchObject({ total_branch_count: 4, branches: [expect.objectContaining({ branch_id: second.branchId })] })
  expect(await remote.getProjection({ workspaceId: 'workspace_1' }, signal())).toMatchObject({ total_branch_count: 4 })
  expect(await remote.getProjection({ workspaceId: 'workspace_2' }, signal())).toMatchObject({ total_branch_count: 4 })
})

it('copies a Run-free branch input through child and grandchild branches with independent saved drafts', async () => {
  const { remote, official } = await fixture()
  const parent = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Glasshouse', goal: 'Keep the glass structure' } }, signal())
  for (const [field, value] of [['positive_prompt', 'glasshouse'], ['negative_prompt', 'blur'], ['instance_id', '8']] as const)
    await saveFixtureDraft(remote, { ...parent }, draft => { if (field === 'instance_id') draft.generation_input.instance_id = value; else draft.prompt_input[field as 'positive_prompt' | 'negative_prompt'] = value as never }, signal())
  for (const [kind, id] of [['model', '2'], ['lora', '3'], ['comfyui-template', '5']] as const)
    { await remote.mutate({ ...parent, type: 'resource-select', value: { kind, id } }, signal())
  await saveFixtureDraft(remote, { ...parent }, () => {}, signal()) }
  await saveFixtureDraft(remote, { ...parent }, draft => { draft.generation_input.parameters['seed'] = 42 }, signal())
  const before = (await remote.getProjection(parent, signal())).branches[0]!
  const child = await remote.mutate({ ...parent, type: 'create-branch', value: { name: 'Warm light', original_request: before.original_request } }, signal())
  expect((await remote.getProjection(child, signal())).branches.find(item => item.branch_id === child.branchId)!.draft).toEqual(before.draft)
  await saveFixtureDraft(remote, { ...child }, draft => { draft.prompt_input.positive_prompt = 'warm glasshouse' }, signal())
  const childDraft = (await remote.getProjection(child, signal())).branches.find(item => item.branch_id === child.branchId)!.draft
  const grandchild = await remote.mutate({ ...child, type: 'create-branch', value: { name: 'Warm details', original_request: before.original_request } }, signal())
  const inherited = (await remote.getProjection(grandchild, signal())).branches.find(item => item.branch_id === grandchild.branchId)!
  expect(inherited.draft).toEqual(childDraft)
  await saveFixtureDraft(remote, { ...grandchild }, () => {}, signal(), { originalRequest: 'Keep the warm reflections', expectedOriginalRequest: before.original_request })
  await saveFixtureDraft(remote, { ...grandchild }, draft => { draft.generation_input.parameters['seed'] = 99 }, signal())
  await remote.mutate({ ...grandchild, type: 'resource-remove', value: 'lora', id: '3' }, signal())
  await saveFixtureDraft(remote, { ...grandchild }, () => {}, signal())
  const result = await remote.getProjection(grandchild, signal())
  expect(result.branches).toHaveLength(3)
  expect(result.branches.find(item => item.branch_id === parent.branchId)).toEqual(before)
  expect(result.branches.find(item => item.branch_id === child.branchId)).toMatchObject({ parent_branch_id: parent.branchId, original_request: before.original_request, draft: childDraft })
  expect(result.branches.find(item => item.branch_id === grandchild.branchId)).toMatchObject({ parent_branch_id: child.branchId, original_request: 'Keep the warm reflections', draft: { prompt_input: childDraft.prompt_input, generation_input: { parameters: { seed: 99 }, loras: [] } } })
  for (const branch of result.branches) expect(branch).toMatchObject({ work_id: parent.workId, source_run_id: null, source_artifact_id: null, source_experience_id: null })
  expect(result.tasks).toEqual([])
  expect(result.runs).toEqual([])
  expect(official.controller.create).not.toHaveBeenCalled()
})

it('preserves user edits as candidates and applies an explicitly selected prompt artifact', async () => {
  const { ctx, remote, store, official } = await fixture()
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Portrait', goal: 'Paint a portrait' } }, signal())
  await startConfiguredTask(remote, selected, 'prompt')
  const task = (await remote.getProjection(selected, signal())).tasks[0]!
  const identity = { workspaceId: selected.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'publish' }
  await saveFixtureDraft(remote, { ...selected }, draft => { draft.prompt_input.positive_prompt = 'Manual portrait' }, signal())
  const receipt = await ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id, artifact: { type: 'prompt', positive_prompt: 'Agent portrait', negative_prompt: 'blur' } }, identity)
  expect(receipt.disposition).toBe('candidate')
  await remote.mutate({ ...selected, type: 'task-apply', id: receipt.artifact_id, value: { 'prompt_input.positive_prompt': 'Manual portrait', 'prompt_input.negative_prompt': '' } }, signal())
  expect(store.getBranch(selected.branchId!).editing_draft?.prompt_input).toEqual({ positive_prompt: 'Agent portrait', negative_prompt: 'blur' })
  const fork = await remote.mutate({ ...selected, type: 'task-branch', id: receipt.artifact_id, value: { name: 'Agent version' } }, signal())
  expect(store.getBranch(fork.branchId!)).toMatchObject({ source_artifact_id: receipt.artifact_id, draft: { prompt_input: { positive_prompt: 'Agent portrait' } } })
  await remote.mutate({ ...selected, type: 'task-interrupt', taskId: task.task_id }, signal())
  expect(official.controller.cancel).toHaveBeenCalledWith({ sessionId: task.session_id })
  expect((await remote.getProjection(selected, signal())).tasks[0]).toMatchObject({ execution_state: 'interrupted' })
  await remote.mutate({ ...selected, type: 'task-resume', taskId: task.task_id }, signal())
  expect(official.controller.create).toHaveBeenCalledOnce()
  expect(official.controller.prompt).toHaveBeenCalledTimes(2)
  await startConfiguredTask(remote, selected, 'prompt')
  const unfinished = (await remote.getProjection(selected, signal())).tasks.find(item => item.task_id !== task.task_id)!
  ctx.emit('agent/error', { agent: { id: unfinished.session_id } } as never)
  expect((await remote.getProjection(selected, signal())).tasks.find(item => item.task_id === unfinished.task_id)).toMatchObject({ execution_state: 'failed', status: 'failed' })
})

it.each([
  { field: 'name', saved: 'Window B name', stale: 'Window A name' },
  { field: 'original_request', saved: 'Window B requirements', stale: 'Window A requirements' },
] as const)('rejects a stale $field edit from another window and preserves the saved value', async ({ field, saved, stale }) => {
  const { remote } = await fixture()
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal())
  const windowA = (await remote.getProjection(selected, signal())).branches[0]!
  const windowB = (await remote.getProjection(selected, signal())).branches[0]!
  await saveFixtureDraft(remote, { ...selected }, () => {}, signal(), { [field === 'name' ? 'name' : 'originalRequest']: saved, [field === 'name' ? 'expectedName' : 'expectedOriginalRequest']: windowB[field] })
  await expect(saveFixtureDraft(remote, { ...selected }, () => {}, signal(), { [field === 'name' ? 'name' : 'originalRequest']: stale, [field === 'name' ? 'expectedName' : 'expectedOriginalRequest']: windowA[field] })).rejects.toMatchObject({
    code: 'workbench/operation-failed',
    details: { code: 'WORKBENCH_EDIT_CONFLICT', issues: [{ path: field, message: expect.any(String) }] },
  })
  expect((await remote.getProjection(selected, signal())).branches[0]![field]).toBe(saved)
})

it.each([
  { field: 'name', expectedValue: undefined, path: 'expectedName' },
  { field: 'original_request', expectedValue: undefined, path: 'expectedOriginalRequest' },
])('rejects branch edits with invalid request metadata: $field / $path', async ({ field, expectedValue, path }) => {
  const { remote } = await fixture()
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal())
  const original = (await remote.getProjection(selected, signal())).branches[0]!
  await expect(saveFixtureDraft(remote, { ...selected }, () => {}, signal(), { [field === 'name' ? 'name' : 'originalRequest']: 'Changed text', [field === 'name' ? 'expectedName' : 'expectedOriginalRequest']: expectedValue })).rejects.toMatchObject({
    code: 'workbench/operation-failed', details: { code: 'WORKBENCH_INVALID_INPUT', issues: [{ path, message: expect.any(String) }] },
  })
  expect((await remote.getProjection(selected, signal())).branches[0]).toEqual(original)
})

it.each([
  { first: 'name', second: 'original_request' },
  { first: 'original_request', second: 'name' },
] as const)('saves $first and $second independently and refreshes the exact saved text', async ({ first, second }) => {
  const { remote } = await fixture()
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal())
  const windowA = (await remote.getProjection(selected, signal())).branches[0]!
  const windowB = (await remote.getProjection(selected, signal())).branches[0]!
  const values = { name: '名'.repeat(40), original_request: '  Paint rain at night.\nKeep the reflections.  ' }
  await saveFixtureDraft(remote, { ...selected }, () => {}, signal(), { [first === 'name' ? 'name' : 'originalRequest']: values[first], [first === 'name' ? 'expectedName' : 'expectedOriginalRequest']: windowA[first] })
  await saveFixtureDraft(remote, { ...selected }, () => {}, signal(), { [second === 'name' ? 'name' : 'originalRequest']: values[second], [second === 'name' ? 'expectedName' : 'expectedOriginalRequest']: windowB[second] })
  const refreshed = await remote.getProjection(selected, signal())
  expect(refreshed.branches[0]).toMatchObject(values)
  expect(refreshed.works[0]).toMatchObject({ name: 'Rain', goal: 'Paint rain' })
})

it.each([
  { field: 'name', value: '' },
  { field: 'name', value: '  ' },
  { field: 'name', value: '名'.repeat(41) },
  { field: 'original_request', value: '' },
  { field: 'original_request', value: '  ' },
] as const)('rejects invalid $field text without changing the branch: $value', async ({ field, value }) => {
  const { remote } = await fixture()
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal())
  const original = (await remote.getProjection(selected, signal())).branches[0]!
  await expect(saveFixtureDraft(remote, { ...selected }, () => {}, signal(), { [field === 'name' ? 'name' : 'originalRequest']: value, [field === 'name' ? 'expectedName' : 'expectedOriginalRequest']: original[field] })).rejects.toMatchObject({
    code: 'workbench/operation-failed', details: { code: 'WORKBENCH_INVALID_INPUT', issues: [{ path: field === 'original_request' ? 'originalRequest' : field, message: expect.any(String) }] },
  })
  expect((await remote.getProjection(selected, signal())).branches[0]).toEqual(original)
})

it('rejects invalid action input and cross-workspace targets before changing a branch', async () => {
  const { remote, store } = await fixture()
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal())
  const original = store.getBranch(selected.branchId!)
  const invalid: ExperimentWorkbenchAction[] = [
    { ...selected, type: 'new-work', value: [] },
    { ...selected, type: 'save-draft', value: { expected: original.draft, expectedEditingDraft: original.editing_draft, draft: original.draft, name: '', expectedName: original.name } },
    { ...selected, type: 'save-draft', value: { expected: original.draft, expectedEditingDraft: original.editing_draft, draft: { ...original.draft, generation_input: { ...original.draft.generation_input, parameters: { seed: Number.NaN } } } } },
    { ...selected, type: 'save-draft', value: { expected: original.draft, expectedEditingDraft: original.editing_draft, draft: { ...original.draft, generation_input: { ...original.draft.generation_input, loras: [{ id: '1', file_name: 'invalid', weight: 'heavy', trigger_words: [] }] } } } },
    { ...selected, workspaceId: 'workspace_2', type: 'save-draft', value: { expected: original.draft, expectedEditingDraft: original.editing_draft, draft: original.draft } },
  ]
  for (const request of invalid) await expect(remote.mutate(request, signal())).rejects.toMatchObject({ code: 'workbench/operation-failed' })
  expect(store.getBranch(selected.branchId!)).toEqual(original)
  const other = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Other work', goal: 'Other goal' } }, signal())
  await startConfiguredTask(remote, other, 'prompt')
  const foreignTask = (await remote.getProjection(other, signal())).tasks[0]!
  await expect(remote.mutate({ ...selected, type: 'task-interrupt', taskId: foreignTask.task_id }, signal())).rejects.toMatchObject({ code: 'workbench/operation-failed', details: { code: 'WORKBENCH_SCOPE_MISMATCH', issues: [{ path: 'task_id', message: expect.any(String) }] } })
  expect(store.getTask(foreignTask.task_id).execution_state).toBe('running')
})



it.each([
  { baseModelId: '9', modelId: null },
  { baseModelId: '1', modelId: '3' },
])('selects a LoRA with Catalog classification %j while preserving the complete input', async constraints => {
  const { remote, store, catalog } = await fixture()
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Constraints', goal: 'Keep input' } }, signal())
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal())
  await saveFixtureDraft(remote, { ...selected }, () => {}, signal())
  await saveFixtureDraft(remote, { ...selected }, draft => { draft.prompt_input.positive_prompt = 'Keep this prompt' }, signal())
  const before = store.getBranch(selected.branchId!).draft
  const read = catalog.details.getMockImplementation()!
  catalog.details.mockImplementation(async (request, requestSignal) => {
    const details = await read(request, requestSignal)
    return { ...details, item: { ...details.item, ...constraints } }
  })
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'lora', id: '7' } }, signal())
  await saveFixtureDraft(remote, { ...selected }, () => {}, signal())
  expect(store.getBranch(selected.branchId!).draft).toEqual({
    ...before, generation_input: { ...before.generation_input, loras: [{ id: '7', file_name: 'rain.safetensors', weight: 0.65, trigger_words: ['rain'] }] },
  })
})

import { afterEach, expect, it, vi } from 'vitest'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { createWorkbenchHostFixture } from '../support/workbench-host.ts'
import type { ExperimentWorkbenchAction, WorkbenchScope } from '../../src/workbench-remote.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
async function fixture() {
  const result = await createWorkbenchHostFixture()
  cleanups.push(result.dispose)
  return result
}

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

it('applies native aspect-ratio and preset size values and rejects an unrelated size candidate', async () => {
  const { remote, inspect, store } = await fixture()
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal())
  await remote.mutate({ ...selected, type: 'update-draft', field: 'instance_id', value: '8' }, signal())
  inspect.mockResolvedValue({ parameters: [], size_candidates: [{
    candidate_id: 'ratio-size', representation: 'aspect_ratio_megapixels',
    aspect_ratio: { parameter_id: 'ratio', kind: 'aspect_ratio', value_type: 'choice', current_value: '1:1', allowed_values: ['1:1', '3:4'] },
    megapixels: { parameter_id: 'pixels', kind: 'megapixels', value_type: 'number', current_value: 1, minimum: 0.5, maximum: 2 },
  }] })
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'comfyui-template', id: '6' } }, signal())
  await remote.mutate({ ...selected, type: 'update-draft', field: 'size', value: { candidate_id: 'ratio-size', parameters: { ratio: '3:4', pixels: 1.2 } } }, signal())
  expect(store.getBranch(selected.branchId!).draft.generation_input.parameters).toEqual({ ratio: '3:4', pixels: 1.2 })
  inspect.mockResolvedValue({ parameters: [], size_candidates: [{
    candidate_id: 'preset-size', representation: 'resolution_preset',
    parameter: { parameter_id: 'resolution', kind: 'resolution_preset', value_type: 'choice', current_value: 'square', allowed_values: ['square', 'portrait'] },
    mapped_options: [{ value: 'portrait', width: 768, height: 1024 }], unmapped_values: ['square'],
  }] })
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'comfyui-template', id: '7' } }, signal())
  await remote.mutate({ ...selected, type: 'update-draft', field: 'size', value: { candidate_id: 'preset-size', parameters: { resolution: 'portrait' } } }, signal())
  expect(store.getBranch(selected.branchId!).draft.generation_input.parameters).toEqual({ resolution: 'portrait' })
  for (const value of [
    { candidate_id: 'other-template', parameters: { resolution: 'square' } },
    { candidate_id: 'preset-size', parameters: { width: 512 } },
  ]) await expect(remote.mutate({ ...selected, type: 'update-draft', field: 'size', value }, signal())).rejects.toMatchObject({ code: 'workbench/operation-failed', details: { code: 'WORKBENCH_INVALID_INPUT' } })
  expect(store.getBranch(selected.branchId!).draft.generation_input.parameters).toEqual({ resolution: 'portrait' })
})

it('saves Workspace function bindings and verifies the requested Skill in the actual execution Session', async () => {
  const { remote, official, store } = await fixture()
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Portrait', goal: 'Paint a portrait' } }, signal())
  const binding = { ...store.getFunctionBinding('workspace_1', 'prompt'), function_id: 'custom-prompt', builtin: false, name: 'Portrait prompt', requested_skill: 'prompt-builder' }
  await remote.mutate({ ...selected, type: 'function-add', value: binding }, signal())
  await remote.mutate({ ...selected, type: 'function-preset', id: binding.function_id, value: 'preset-a' }, signal())
  await remote.mutate({ ...selected, type: 'function-edit', value: { ...store.getFunctionBinding('workspace_1', binding.function_id), request_template: 'Read task {{task_id}} and draw rain.' } }, signal())
  await remote.mutate({ ...selected, type: 'agent-action', id: binding.function_id }, signal())
  const task = (await remote.getProjection(selected, signal())).tasks[0]!
  expect(task).toMatchObject({ binding_snapshot: { function_id: 'custom-prompt', preset_id: 'preset-a', requested_skill: 'prompt-builder' } })
  expect(official.agents.get(task.session_id!)!.ctx.skills.list).toHaveBeenCalledWith({ cwd: '/workspace/project' })
  await remote.mutate({ ...selected, type: 'function-remove', id: binding.function_id }, signal())
  expect((await remote.getProjection(selected, signal())).functions.some(item => item.function_id === binding.function_id)).toBe(false)
  expect(store.getTask(task.task_id).binding_snapshot.requested_skill).toBe('prompt-builder')
  const otherWorkspace = await remote.getProjection({ workspaceId: 'workspace_2' }, signal())
  expect(otherWorkspace.functions.some(item => item.function_id === binding.function_id)).toBe(false)
  official.agents.delete(task.session_id!)
  expect((await remote.getProjection(selected, signal())).tasks[0]).toMatchObject({ execution_state: 'interrupted', status: 'interrupted' })
})

it('asks and answers a task question and pauses, continues and ends the same experiment Session', async () => {
  const { ctx, remote, official } = await fixture()
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal())
  await remote.mutate({ ...selected, type: 'agent-action', id: 'prompt' }, signal())
  const prompt = (await remote.getProjection(selected, signal())).tasks[0]!
  const question = await ctx.harnessComfyuiWorkbench.service.publish({ taskId: prompt.task_id, artifact: { type: 'question', question: 'Which light?', options: ['Sun', 'Moon'] } }, { workspaceId: 'workspace_1', sessionId: prompt.session_id!, turn: 1, callId: 'question' })
  expect((await remote.getProjection(selected, signal())).tasks[0]!.status).toBe('waiting_input')
  await remote.mutate({ ...selected, type: 'task-answer', taskId: prompt.task_id, id: question.artifact_id, value: 'Moon' }, signal())
  expect((await remote.getProjection(selected, signal())).tasks[0]!.answers).toEqual([expect.objectContaining({ question_artifact_id: question.artifact_id, answer: 'Moon' })])
  await remote.mutate({ ...selected, type: 'update-draft', field: 'instance_id', value: '8' }, signal())
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'comfyui-template', id: '5' } }, signal())
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

it('mounts Workbench Remotes, creates one main branch and isolates Workspace projections', async () => {
  const { ctx, remote, official, fiber, remoteFiber } = await fixture()
  expect(remoteMethods(remote)).toEqual([
    { method: 'getEnvironment', invocation: { kind: 'direct' } },
    { method: 'getProjection', invocation: { kind: 'direct' } },
    { method: 'getInputDescription', invocation: { kind: 'direct' } },
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

it('reads official presets, models and invocable Skills and always releases the acquired preset scope', async () => {
  const { remote, official, catalog, workspaces } = await fixture()
  const environment = await remote.getEnvironment({ workspaceId: 'workspace_1', presetId: 'preset-a' }, signal())
  expect(environment).toMatchObject({
    workspaces: [{ id: 'workspace_1', name: 'First project', path: '/workspace/project' }, { id: 'workspace_2', name: 'Second project', path: '/workspace/other' }],
    models: { default: { provider: 'provider-a', model: 'model-a' } },
    presets: [{ id: 'preset-a', name: 'Preset A' }, { id: 'preset-broken', name: 'preset-broken', broken: 'Missing component' }],
    skills: [{ name: 'prompt-builder', description: 'Compose prompts' }], instances: [{ id: '8', name: '8' }],
  })
  expect(official.listSkills).toHaveBeenCalledWith({ cwd: workspaces[0]!.path, scope: 'preset-scope' })
  expect(official.disposeScope).toHaveBeenCalledOnce()
  official.listSkills.mockRejectedValueOnce(new Error('Skill provider unavailable'))
  await expect(remote.getEnvironment({ workspaceId: 'workspace_1', presetId: 'preset-a' }, signal())).rejects.toThrow('Skill provider unavailable')
  expect(official.disposeScope).toHaveBeenCalledTimes(2)
  catalog.queryComfyuiInstances.mockRejectedValueOnce(new Error('Catalog offline'))
  expect((await remote.getEnvironment({}, signal())).instances).toEqual([])
  expect((await remote.getEnvironment({ workspaceId: 'missing', presetId: 'preset-a' }, signal())).skills).toEqual([])
})

it('edits branch input through real actions, resolves catalog resources and dispatches the selected official Session', async () => {
  const { remote, official, catalog, store, createWorkspace } = await fixture()
  const createdWorkspace = await remote.mutate({ type: 'new-workspace', workspaceId: '', value: { name: 'Third project', path: '/workspace/third' } }, signal())
  expect(createWorkspace).toHaveBeenCalledWith('/workspace/third', 'Third project')
  expect(createdWorkspace).toEqual({ workspaceId: 'workspace_3' })
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal())
  const action = (type: ExperimentWorkbenchAction['type'], value?: unknown, field?: string, id?: string) => remote.mutate({ ...selected, type, value, field, id }, signal())
  await remote.mutate({ ...selected, type: 'update-branch', field: 'name', value: 'Wet glass', expectedValue: '主分支' }, signal())
  await remote.mutate({ ...selected, type: 'update-branch', field: 'original_request', value: 'Paint rain at night', expectedValue: 'Paint rain' }, signal())
  await action('update-draft', 'rain at night', 'positive_prompt')
  await action('update-draft', 'blur', 'negative_prompt')
  await action('update-draft', '8', 'instance_id')
  await action('resource-select', { kind: 'model', id: '2' })
  await action('resource-select', { kind: 'lora', id: '3' })
  await action('resource-select', { kind: 'lora', id: '3' })
  await action('resource-select', { kind: 'character', id: '4' })
  await action('resource-select', { kind: 'comfyui-template', id: '5' })
  await action('update-draft', { candidate_id: 'width_height:width:height', parameters: { width: 768, height: 1024 } }, 'size')
  await action('update-draft', 42, 'seed')
  await action('update-draft', '/reference.png', 'references')
  await action('update-draft', 0.8, 'lora-weight', '3')
  const edited = await remote.getProjection(selected, signal())
  expect(edited.branches[0]).toMatchObject({ name: 'Wet glass', original_request: 'Paint rain at night', draft: {
    base_model_id: '1', context_refs: [{ kind: 'character', id: '4' }],
    generation_input: { model: { id: '2', file_name: 'paint.safetensors' }, template_id: '5', parameters: { width: 768, height: 1024, seed: 42, reference: '/reference.png' }, loras: [{ id: '3', weight: 0.8, trigger_words: ['rain'] }] },
  } })
  expect(catalog.details).toHaveBeenCalledWith({ kind: 'character', id: '4' }, expect.any(AbortSignal))
  await action('run', { instructions: 'Keep the reflections', preset_override: 'preset-a' })
  const running = await remote.getProjection(selected, signal())
  const task = running.tasks[0]!
  expect(task).toMatchObject({ kind: 'run', execution_state: 'running', input: { requirements: { original_request: 'Paint rain at night', instructions: 'Keep the reflections' }, generation_input: { parameters: { positive: 'rain at night', negative: 'blur', seed: 42 } }, max_runs: 1 } })
  expect(official.controller.create).toHaveBeenCalledWith({ workspaceId: 'workspace_1', agentPreset: 'preset-a' })
  expect(official.controller.selectModel).toHaveBeenCalledWith({ sessionId: task.session_id, provider: 'provider-a', model: 'model-a' })
  expect(official.controller.prompt).toHaveBeenCalledWith(expect.objectContaining({ sessionId: task.session_id, mode: 'queue', content: [{ type: 'text', text: task.request_text }] }), expect.any(AbortSignal))
  const branch = await action('create-branch', { name: 'Variation', original_request: 'Less rain' })
  expect((await remote.getProjection(branch, signal())).branches).toEqual(expect.arrayContaining([expect.objectContaining({ branch_id: branch.branchId, parent_branch_id: selected.branchId, original_request: 'Less rain' })]))
  await action('resource-remove', 'model')
  await action('resource-remove', 'lora', undefined, '3')
  await action('resource-remove', 'character', undefined, '4')
  await action('resource-remove', 'comfyui-template')
  expect(store.getBranch(selected.branchId!).draft).toMatchObject({ generation_input: { model: null, template_id: null, loras: [] }, context_refs: [] })
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
    await remote.mutate({ ...parent, type: 'update-draft', field, value }, signal())
  for (const [kind, id] of [['model', '2'], ['lora', '3'], ['character', '4'], ['comfyui-template', '5']] as const)
    await remote.mutate({ ...parent, type: 'resource-select', value: { kind, id } }, signal())
  await remote.mutate({ ...parent, type: 'update-draft', field: 'seed', value: 42 }, signal())
  const before = (await remote.getProjection(parent, signal())).branches[0]!
  const child = await remote.mutate({ ...parent, type: 'create-branch', value: { name: 'Warm light', original_request: before.original_request } }, signal())
  expect((await remote.getProjection(child, signal())).branches.find(item => item.branch_id === child.branchId)!.draft).toEqual(before.draft)
  await remote.mutate({ ...child, type: 'update-draft', field: 'positive_prompt', value: 'warm glasshouse' }, signal())
  const childDraft = (await remote.getProjection(child, signal())).branches.find(item => item.branch_id === child.branchId)!.draft
  const grandchild = await remote.mutate({ ...child, type: 'create-branch', value: { name: 'Warm details', original_request: before.original_request } }, signal())
  const inherited = (await remote.getProjection(grandchild, signal())).branches.find(item => item.branch_id === grandchild.branchId)!
  expect(inherited.draft).toEqual(childDraft)
  await remote.mutate({ ...grandchild, type: 'update-branch', field: 'original_request', value: 'Keep the warm reflections', expectedValue: before.original_request }, signal())
  await remote.mutate({ ...grandchild, type: 'update-draft', field: 'seed', value: 99 }, signal())
  await remote.mutate({ ...grandchild, type: 'resource-remove', value: 'lora', id: '3' }, signal())
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
  await remote.mutate({ ...selected, type: 'agent-action', id: 'prompt' }, signal())
  const task = (await remote.getProjection(selected, signal())).tasks[0]!
  const identity = { workspaceId: selected.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'publish' }
  await remote.mutate({ ...selected, type: 'update-draft', field: 'positive_prompt', value: 'Manual portrait' }, signal())
  const receipt = await ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id, artifact: { type: 'prompt', positive_prompt: 'Agent portrait', negative_prompt: 'blur' } }, identity)
  expect(receipt.disposition).toBe('candidate')
  await remote.mutate({ ...selected, type: 'task-apply', id: receipt.artifact_id, value: { 'prompt_input.positive_prompt': 'Manual portrait', 'prompt_input.negative_prompt': '' } }, signal())
  expect(store.getBranch(selected.branchId!).draft.prompt_input).toEqual({ positive_prompt: 'Agent portrait', negative_prompt: 'blur' })
  const fork = await remote.mutate({ ...selected, type: 'task-branch', id: receipt.artifact_id, value: { name: 'Agent version' } }, signal())
  expect(store.getBranch(fork.branchId!)).toMatchObject({ source_artifact_id: receipt.artifact_id, draft: { prompt_input: { positive_prompt: 'Agent portrait' } } })
  await remote.mutate({ ...selected, type: 'task-interrupt', taskId: task.task_id }, signal())
  expect(official.controller.cancel).toHaveBeenCalledWith({ sessionId: task.session_id })
  expect((await remote.getProjection(selected, signal())).tasks[0]).toMatchObject({ execution_state: 'interrupted' })
  await remote.mutate({ ...selected, type: 'task-resume', taskId: task.task_id }, signal())
  expect(official.controller.create).toHaveBeenCalledOnce()
  expect(official.controller.prompt).toHaveBeenCalledTimes(2)
  await remote.mutate({ ...selected, type: 'agent-action', id: 'prompt' }, signal())
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
  await remote.mutate({ ...selected, type: 'update-branch', field, value: saved, expectedValue: windowB[field] }, signal())
  await expect(remote.mutate({ ...selected, type: 'update-branch', field, value: stale, expectedValue: windowA[field] }, signal())).rejects.toMatchObject({
    code: 'workbench/operation-failed',
    details: { code: 'WORKBENCH_EDIT_CONFLICT', issues: [{ path: field, message: expect.any(String) }] },
  })
  expect((await remote.getProjection(selected, signal())).branches[0]![field]).toBe(saved)
})

it.each([
  { field: 'name', expectedValue: undefined, path: 'expectedValue' },
  { field: 'original_request', expectedValue: undefined, path: 'expectedValue' },
  { field: undefined, expectedValue: 'Paint rain', path: 'field' },
  { field: 'goal', expectedValue: 'Paint rain', path: 'field' },
])('rejects branch edits with invalid request metadata: $field / $path', async ({ field, expectedValue, path }) => {
  const { remote } = await fixture()
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal())
  const original = (await remote.getProjection(selected, signal())).branches[0]!
  await expect(remote.mutate({ ...selected, type: 'update-branch', field, value: 'Changed text', expectedValue }, signal())).rejects.toMatchObject({
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
  await remote.mutate({ ...selected, type: 'update-branch', field: first, value: values[first], expectedValue: windowA[first] }, signal())
  await remote.mutate({ ...selected, type: 'update-branch', field: second, value: values[second], expectedValue: windowB[second] }, signal())
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
  await expect(remote.mutate({ ...selected, type: 'update-branch', field, value, expectedValue: original[field] }, signal())).rejects.toMatchObject({
    code: 'workbench/operation-failed', details: { code: 'WORKBENCH_INVALID_INPUT', issues: [{ path: field, message: expect.any(String) }] },
  })
  expect((await remote.getProjection(selected, signal())).branches[0]).toEqual(original)
})

it('rejects invalid action input and cross-workspace targets before changing a branch', async () => {
  const { remote, store } = await fixture()
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal())
  const original = store.getBranch(selected.branchId!)
  const invalid: ExperimentWorkbenchAction[] = [
    { ...selected, type: 'new-work', value: [] },
    { ...selected, type: 'update-branch', field: 'name', value: '', expectedValue: original.name },
    { ...selected, type: 'update-draft', field: 'seed', value: 10 },
    { ...selected, type: 'update-draft', field: 'lora-weight', id: 'missing', value: 1 },
    { ...selected, workspaceId: 'workspace_2', type: 'update-draft', field: 'positive_prompt', value: 'Wrong project' },
  ]
  for (const request of invalid) await expect(remote.mutate(request, signal())).rejects.toMatchObject({ code: 'workbench/operation-failed' })
  expect(store.getBranch(selected.branchId!)).toEqual(original)
  const other = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Other work', goal: 'Other goal' } }, signal())
  await remote.mutate({ ...other, type: 'agent-action', id: 'prompt' }, signal())
  const foreignTask = (await remote.getProjection(other, signal())).tasks[0]!
  await expect(remote.mutate({ ...selected, type: 'task-interrupt', taskId: foreignTask.task_id }, signal())).rejects.toMatchObject({ code: 'workbench/operation-failed', details: { code: 'WORKBENCH_SCOPE_MISMATCH', issues: [{ path: 'task_id', message: expect.any(String) }] } })
  expect(store.getTask(foreignTask.task_id).execution_state).toBe('running')
})

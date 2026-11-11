import { saveFixtureDraft } from '../support/workbench-draft.ts'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { createWorkbenchHostFixture } from '../support/workbench-host.ts'
import type { ArtifactPayload } from '../../src/workbench/contract.ts'
import type { WorkbenchScope } from '../../src/workbench-remote.ts'

const cleanups: (() => Promise<void>)[] = []
const signal = () => new AbortController().signal
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function fixture() {
  const result = await createWorkbenchHostFixture()
  result.official.controller.prompt.mockImplementation(result.official.acceptPrompt)
  cleanups.push(result.dispose)
  return { ...result, service: result.ctx.harnessComfyuiWorkbench.service }
}

type Fixture = Awaited<ReturnType<typeof fixture>>
async function branchAt(remote: Fixture['remote'], scope: WorkbenchScope) {
  return (await remote.getProjection(scope, signal())).branches.find(branch => branch.branch_id === scope.branchId)!
}
async function startTask(host: Fixture, scope: WorkbenchScope, functionId: string, runId?: string) {
  await host.remote.mutate({ ...scope, type: 'function-preset', id: functionId, value: 'preset-a' }, signal())
  const draft = runId ? (await host.remote.getProjection(scope, signal())).runs.find(run => run.run_id === runId)!.review_draft! : undefined
  const receipt = await host.remote.mutate({ ...scope, type: 'agent-action', id: functionId, ...(runId ? { runId, value: { evaluationDraft: { expected: draft, draft } } } : {}) }, signal())
  const task = (await host.remote.getProjection(scope, signal())).tasks.find(task => task.task_id === receipt.taskId)!
  const identity = { workspaceId: scope.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'publish' }
  return { task, identity }
}

async function selectGeneration(host: Fixture, scope: WorkbenchScope) {
  await saveFixtureDraft(host.remote, { ...scope }, draft => { draft.generation_input.instance_id = '8' }, signal())
  for (const value of [{ kind: 'model', id: '2' }, { kind: 'comfyui-template', id: '5' }]) {
    await host.remote.mutate({ ...scope, type: 'resource-select', value }, signal())
  await saveFixtureDraft(host.remote, { ...scope }, () => {}, signal())
  }
}

async function acceptRun(host: Fixture, scope: WorkbenchScope) {
  const { task, identity } = await startTask(host, scope, 'run')
  const input = task.input.generation_input
  const accepted = await host.runtime.acceptGenerations(identity, [{ requestId: randomUUID(), request: {
    title: input.title, instanceId: input.instance_id, templateId: input.template_id!, model: input.model ? { id: input.model.id, fileName: input.model.file_name } : null,
    parameters: input.parameters, loras: input.loras.map(lora => ({ id: lora.id, fileName: lora.file_name, weight: lora.weight, triggerWords: lora.trigger_words })),
  } }], undefined, task.task_id)
  await host.runtime.advance()
  return accepted.items[0]!.runId
}

it('forks a prompt artifact from its Task branch and fixed input while preserving later manual edits', async () => {
  const host = await fixture(), { remote, service } = host
  const source = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint the original garden' } }, signal())
  await saveFixtureDraft(remote, { ...source }, draft => { draft.prompt_input.positive_prompt = 'Original garden' }, signal())
  await remote.mutate({ ...source, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal())
  await saveFixtureDraft(remote, { ...source }, () => {}, signal())
  const baseline = (await branchAt(remote, source)).draft
  const { task, identity } = await startTask(host, source, 'prompt')
  await saveFixtureDraft(remote, { ...source }, draft => { draft.prompt_input.positive_prompt = 'Manual parent prompt' }, signal())
  await saveFixtureDraft(remote, { ...source }, draft => { draft.generation_input.instance_id = '9' }, signal())
  await saveFixtureDraft(remote, { ...source }, () => {}, signal(), { originalRequest: 'Later parent requirements', expectedOriginalRequest: 'Paint the original garden' })
  const parent = await branchAt(remote, source)
  const selected = await remote.mutate({ ...source, type: 'create-branch', value: { name: 'Other branch', original_request: 'Other requirements' } }, signal())
  await saveFixtureDraft(remote, { ...selected }, draft => { draft.generation_input.instance_id = '10' }, signal())
  const selectedBefore = await branchAt(remote, selected)
  const artifact = { type: 'prompt' as const, positive_prompt: 'Candidate garden', negative_prompt: 'blur' }
  const published = await service.publish({ taskId: task.task_id, artifact }, identity)
  expect(published.disposition).toBe('candidate')
  const fork = await remote.mutate({ ...selected, type: 'task-branch', id: published.artifact_id, value: { name: 'Candidate branch' } }, signal())
  expect(await branchAt(remote, fork)).toMatchObject({
    parent_branch_id: source.branchId, source_artifact_id: published.artifact_id,
    source_run_id: null, original_request: 'Paint the original garden', name: 'Candidate branch',
    draft: { ...baseline, prompt_input: { positive_prompt: 'Candidate garden', negative_prompt: 'blur' } },
  })
  expect(await branchAt(remote, source)).toEqual(parent)
  expect(await branchAt(remote, selected)).toEqual(selectedBefore)
  expect(await service.getTask({ taskId: task.task_id }, identity)).toMatchObject({
    generation_input: baseline.generation_input,
    artifacts: [{ task_id: task.task_id, artifact_id: published.artifact_id, artifact, disposition: 'candidate' }],
  })
})

it('forks allowed parameter values into the fixed Task generation input and leaves parent changes intact', async () => {
  const host = await fixture(), { remote, service } = host
  const source = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Parameters', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, source)
  await saveFixtureDraft(remote, { ...source }, draft => { draft.prompt_input.positive_prompt = 'Fixed prompt' }, signal())
  const baseline = (await branchAt(remote, source)).draft
  const { task, identity } = await startTask(host, source, 'parameters')
  await saveFixtureDraft(remote, { ...source }, draft => { draft.generation_input.parameters['steps'] = 35 }, signal())
  await saveFixtureDraft(remote, { ...source }, draft => { draft.generation_input.parameters['seed'] = 99 }, signal())
  const parent = await branchAt(remote, source)
  const artifact = { type: 'parameters' as const, parameters: { steps: 28 } }
  const published = await service.publish({ taskId: task.task_id, artifact }, identity)
  expect(published.disposition).toBe('candidate')
  const fork = await remote.mutate({ ...source, type: 'task-branch', id: published.artifact_id, value: { name: 'Suggested parameters' } }, signal())
  expect((await branchAt(remote, fork)).draft).toEqual({ ...baseline, generation_input: { ...baseline.generation_input, parameters: { positive: '', negative: '', seed: 17, steps: 28, width: 512, height: 512 } } })
  expect(await branchAt(remote, source)).toEqual(parent)
  expect((await service.getTask({ taskId: task.task_id }, identity)).artifacts).toEqual([{ task_id: task.task_id, artifact_id: published.artifact_id, artifact, disposition: 'candidate' }])
})

it('forks a review candidate with mixed catalog model scopes and preserves its full generation input', async () => {
  const host = await fixture(), { remote, service, catalog } = host
  const source = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Review', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, source)
  const runId = await acceptRun(host, source)
  const { task, identity } = await startTask(host, source, 'review', runId)
  const readDetails = catalog.details.getMockImplementation()!
  catalog.details.mockImplementation(async (ref, requestSignal) => {
    const details = await readDetails(ref, requestSignal)
    return { ...details, item: { ...details.item, baseModelId: '99', modelId: '98' } }
  })
  catalog.resolveGenerationModel.mockImplementation(async id => ({ id, file_name: 'paint.safetensors', base_model_id: id === '4' ? '9' : '1' }))
  const candidate = {
    generation_input: { ...task.input.generation_input, model: { id: '4', file_name: 'paint.safetensors' }, loras: [{ id: '3', file_name: 'rain.safetensors', weight: 0.8, trigger_words: ['rain'] }], parameters: { positive: 'Review candidate', negative: 'haze', seed: 31, steps: 29 } },
    image_refs: [], workflow_image_bindings: [],
  }
  const artifact = { type: 'review' as const, observation: 'Visible rain', conclusion: 'Try closer framing', run_ids: [runId], candidate }
  const published = await service.publish({ taskId: task.task_id, artifact }, identity)
  await saveFixtureDraft(remote, { ...source }, draft => { draft.prompt_input.positive_prompt = 'Later parent prompt' }, signal())
  const parent = await branchAt(remote, source)
  const selected = await remote.mutate({ ...source, type: 'create-branch', value: { name: 'Other review', original_request: 'Other view' } }, signal())
  const fork = await remote.mutate({ ...selected, type: 'task-branch', id: published.artifact_id, value: { name: 'Review candidate' } }, signal())
  expect(await branchAt(remote, fork)).toMatchObject({ parent_branch_id: source.branchId, source_artifact_id: published.artifact_id, draft: {
    prompt_input: { positive_prompt: 'Review candidate', negative_prompt: 'haze' }, base_model_id: '9', ...candidate,
  } })
  expect(await branchAt(remote, source)).toEqual(parent)
  expect((await service.getTask({ taskId: task.task_id }, identity)).artifacts).toEqual([{ task_id: task.task_id, artifact_id: published.artifact_id, artifact, disposition: published.disposition }])
  expect((await remote.getProjection(source, signal())).runs.map(run => run.run_id)).toEqual([runId])
  const acceptedId = await acceptRun(host, fork)
  expect((await remote.getProjection(fork, signal())).runs.find(run => run.run_id === acceptedId)!.generation_input).toEqual(candidate.generation_input)
})


it.each([
  { functionId: 'prompt', artifact: { type: 'prompt', positive_prompt: 'Candidate prompt', negative_prompt: 'blur' }, field: 'model', replacement: '4' },
  { functionId: 'parameters', artifact: { type: 'parameters', parameters: { steps: 28 } }, field: 'comfyui-template', replacement: '6' },
  { functionId: 'parameters', artifact: { type: 'parameters', parameters: { steps: 28 } }, field: 'instance_id', replacement: '9' },
])('rejects explicit $functionId adoption after its Task $field changes', async ({ functionId, artifact, field, replacement }) => {
  const host = await fixture(), { remote, service } = host
  const source = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Resource boundary', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, source)
  const { task, identity } = await startTask(host, source, functionId)
  if (functionId === 'prompt') await saveFixtureDraft(remote, { ...source }, draft => { draft.prompt_input.positive_prompt = 'Manual prompt' }, signal())
  else await saveFixtureDraft(remote, { ...source }, draft => { draft.generation_input.parameters['steps'] = 35 }, signal())
  const published = await service.publish({ taskId: task.task_id, artifact }, identity)
  if (field === 'instance_id') await saveFixtureDraft(remote, { ...source }, draft => { draft.generation_input.instance_id = replacement }, signal())
  else { await remote.mutate({ ...source, type: 'resource-select', value: { kind: field, id: replacement } }, signal())
  await saveFixtureDraft(remote, { ...source }, () => {}, signal()) }
  const target = await branchAt(remote, source)
  await expect(remote.mutate({ ...source, type: 'task-apply', id: published.artifact_id, value: target.draft }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_RESOURCE_MISMATCH' } })
  expect(await branchAt(remote, source)).toEqual(target)
  expect((await service.getTask({ taskId: task.task_id }, identity)).artifacts).toEqual([{ task_id: task.task_id, artifact_id: published.artifact_id, artifact, disposition: 'candidate' }])
})

it('applies recommended resources from another base model to the Task branch', async () => {
  const host = await fixture(), { remote, service, catalog } = host
  const source = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Resources', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, source)
  const { task, identity } = await startTask(host, source, 'resources')
  const readDetails = catalog.details.getMockImplementation()!
  catalog.details.mockImplementation(async (ref, signal) => {
    const details = await readDetails(ref, signal)
    return ref.kind === 'lora' ? { ...details, item: { ...details.item, label: 'Other model LoRA', baseModelId: '9' } } : details
  })
  const artifact = { type: 'resources' as const, refs: [{ kind: 'lora' as const, id: '3' }], reason: 'Use fine raindrops' }
  const published = await service.publish({ taskId: task.task_id, artifact }, identity)
  const target = await branchAt(remote, source)
  const selected = await remote.mutate({ ...source, type: 'create-branch', value: { name: 'Selected resources', original_request: 'Other requirements' } }, signal())
  const selectedBefore = await branchAt(remote, selected)
  await remote.mutate({ ...selected, type: 'task-apply', id: published.artifact_id, value: target.draft }, signal())
  expect((await branchAt(remote, source)).editing_draft).toEqual({
    ...target.draft, generation_input: { ...target.draft.generation_input, loras: [{ id: '3', file_name: 'rain.safetensors', weight: 0.65, trigger_words: ['rain'] }] },
  })
  expect(await branchAt(remote, selected)).toEqual(selectedBefore)
  expect((await service.getTask({ taskId: task.task_id }, identity)).artifacts).toEqual([{ task_id: task.task_id, artifact_id: published.artifact_id, artifact, disposition: 'applied' }])
})

it.each([false, true])('applies a model and LoRA recommendation in either order while retaining current resources: reversed=%s', async reversed => {
  const host = await fixture(), { remote, service, catalog } = host
  const source = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Model bundle', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, source)
  await remote.mutate({ ...source, type: 'resource-select', value: { kind: 'lora', id: '3' } }, signal())
  await saveFixtureDraft(remote, { ...source }, () => {}, signal())
  const { task, identity } = await startTask(host, source, 'resources')
  const readDetails = catalog.details.getMockImplementation()!
  catalog.details.mockImplementation(async (ref, signal) => {
    const details = await readDetails(ref, signal)
    return ref.id === '4' ? { ...details, item: { ...details.item, baseModelId: '9' } } : details
  })
  catalog.resolveGenerationModel.mockImplementation(async id => ({ id, file_name: 'paint.safetensors', base_model_id: id === '4' ? '9' : '1' }))
  const refs = [{ kind: 'model' as const, id: '4' }, { kind: 'lora' as const, id: '4' }]
  if (reversed) refs.reverse()
  const artifact = { type: 'resources' as const, refs, reason: 'Use the selected model with its LoRA' }
  const published = await service.publish({ taskId: task.task_id, artifact }, identity)
  const before = (await branchAt(remote, source)).draft
  expect(before.generation_input.model?.id).toBe('2')
  await remote.mutate({ ...source, type: 'task-apply', id: published.artifact_id, value: before }, signal())
  expect((await branchAt(remote, source)).editing_draft).toEqual({
    ...before, base_model_id: '9', generation_input: {
      ...before.generation_input, model: { id: '4', file_name: 'paint.safetensors' },
      loras: [...before.generation_input.loras, { id: '4', file_name: 'rain.safetensors', weight: 0.65, trigger_words: ['rain'] }],
    },
  })
})


it.each([
  { functionId: 'prompt', artifact: { type: 'question', question: 'Which light?', options: [] } },
  { functionId: 'resources', artifact: { type: 'resources', refs: [{ kind: 'lora', id: '3' }] } },
  { functionId: 'review', artifact: { type: 'review', observation: 'Visible rain', conclusion: 'Keep framing', run_ids: [] } },
  { functionId: 'experience', artifact: { type: 'experience', title: 'Rain', conditions: 'Garden', note: 'Keep framing', base_model_id: '1', model_id: '2', run_ids: [] } },
] satisfies { functionId: string; artifact: ArtifactPayload }[])('rejects a nonconstructible $artifact.type artifact without creating a branch', async ({ functionId, artifact: payload }) => {
  const host = await fixture(), { remote, service } = host
  const source = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Unsupported fork', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, source)
  const runId = functionId === 'review' || functionId === 'experience' ? await acceptRun(host, source) : undefined
  const { task, identity } = await startTask(host, source, functionId, runId)
  const artifact = 'run_ids' in payload ? { ...payload, run_ids: [runId!] } : payload
  const published = await service.publish({ taskId: task.task_id, artifact }, identity)
  const before = (await remote.getProjection(source, signal())).branches
  await expect(remote.mutate({ ...source, type: 'task-branch', id: published.artifact_id, value: { name: 'Unsupported fork' } }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_INVALID_INPUT' } })
  expect((await remote.getProjection(source, signal())).branches).toEqual(before)
  expect((await service.getTask({ taskId: task.task_id }, identity)).artifacts).toEqual([{ task_id: task.task_id, artifact_id: published.artifact_id, artifact, disposition: published.disposition }])
})

it.each(['workspace_1', 'workspace_2'])('creates a branch from a cross-work artifact in %s', async workspaceId => {
  const host = await fixture(), { remote, service } = host
  const source = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Source', goal: 'Paint rain' } }, signal())
  await saveFixtureDraft(remote, source, draft => { draft.base_model_id = '1' }, signal())
  const { task, identity } = await startTask(host, source, 'prompt')
  const published = await service.publish({ taskId: task.task_id, artifact: { type: 'prompt', positive_prompt: 'Rain', negative_prompt: '' } }, identity)
  const other = await remote.mutate({ type: 'new-work', workspaceId, value: { name: 'Other Work', goal: 'Paint sunshine' } }, signal())
  const created = await remote.mutate({ ...other, type: 'task-branch', id: published.artifact_id, value: { name: 'Referenced artifact' } }, signal())
  const branch = await branchAt(remote, created)
  expect(branch).toMatchObject({ work_id: other.workId, parent_branch_id: other.branchId, source_artifact_id: published.artifact_id, draft: { prompt_input: { positive_prompt: 'Rain', negative_prompt: '' } } })
  expect((await branchAt(remote, source)).draft.prompt_input.positive_prompt).toBe('Rain')
})

it.each(['prompt', 'parameters', 'resources'])('uses the displayed Task target for $0 adoption and rejects a second-window edit', async functionId => {
  const host = await fixture(), { remote, service } = host
  const source = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Task target', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, source)
  const { task, identity } = await startTask(host, source, functionId)
  if (functionId === 'prompt') await saveFixtureDraft(remote, { ...source }, draft => { draft.prompt_input.positive_prompt = 'Manual prompt' }, signal())
  else if (functionId === 'parameters') await saveFixtureDraft(remote, { ...source }, draft => { draft.generation_input.parameters['steps'] = 35 }, signal())
  const artifact: ArtifactPayload = functionId === 'prompt'
    ? { type: 'prompt', positive_prompt: 'Candidate prompt', negative_prompt: 'blur' }
    : functionId === 'parameters' ? { type: 'parameters', parameters: { steps: 28 } }
      : { type: 'resources', refs: [{ kind: 'lora', id: '7' }], reason: 'Use a rain style' }
  const published = await service.publish({ taskId: task.task_id, artifact }, identity)
  const displayed = await branchAt(remote, source)
  const selected = await remote.mutate({ ...source, type: 'create-branch', value: { name: 'Other selected branch', original_request: 'Other requirements' } }, signal())
  await saveFixtureDraft(remote, { ...selected }, draft => { draft.prompt_input.positive_prompt = 'Selected prompt' }, signal())
  const selectedBefore = await branchAt(remote, selected)
  if (functionId === 'prompt') await saveFixtureDraft(remote, { ...source }, draft => { draft.prompt_input.positive_prompt = 'Second-window prompt' }, signal())
  else if (functionId === 'parameters') await saveFixtureDraft(remote, { ...source }, draft => { draft.generation_input.parameters['steps'] = 45 }, signal())
  else { await remote.mutate({ ...source, type: 'resource-select', value: { kind: 'lora', id: '8' } }, signal())
  await saveFixtureDraft(remote, { ...source }, () => {}, signal()) }
  const latest = await branchAt(remote, source)
  await expect(remote.mutate({ ...selected, type: 'task-apply', id: published.artifact_id, value: displayed.draft }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_EDIT_CONFLICT' } })
  expect(await branchAt(remote, source)).toEqual(latest)
  expect(await branchAt(remote, selected)).toEqual(selectedBefore)
  await remote.mutate({ ...selected, type: 'task-apply', id: published.artifact_id, value: latest.draft }, signal())
  const expected = structuredClone(latest)
  expected.editing_draft = structuredClone(latest.draft)
  if (functionId === 'prompt') expected.editing_draft.prompt_input = { positive_prompt: 'Candidate prompt', negative_prompt: 'blur' }
  else if (functionId === 'parameters') expected.editing_draft.generation_input.parameters.steps = 28
  else expected.editing_draft.generation_input.loras.push({ id: '7', file_name: 'rain.safetensors', weight: 0.65, trigger_words: ['rain'] })
  expect(await branchAt(remote, source)).toEqual(expected)
  expect(await branchAt(remote, selected)).toEqual(selectedBefore)
  expect((await service.getTask({ taskId: task.task_id }, identity)).artifacts).toEqual([{ task_id: task.task_id, artifact_id: published.artifact_id, artifact, disposition: 'applied' }])
})

it('preserves an already selected LoRA weight when adopting the same recommended resource', async () => {
  const host = await fixture(), { remote, service } = host
  const source = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'LoRA weight', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, source)
  await remote.mutate({ ...source, type: 'resource-select', value: { kind: 'lora', id: '3' } }, signal())
  await saveFixtureDraft(remote, { ...source }, () => {}, signal())
  await saveFixtureDraft(remote, { ...source }, draft => { draft.generation_input.loras.find(lora => lora.id === '3')!.weight = 0.9 }, signal())
  const { task, identity } = await startTask(host, source, 'resources')
  const published = await service.publish({ taskId: task.task_id, artifact: { type: 'resources', refs: [{ kind: 'lora', id: '3' }] } }, identity)
  const before = await branchAt(remote, source)
  await remote.mutate({ ...source, type: 'task-apply', id: published.artifact_id, value: before.draft }, signal())
  expect(await branchAt(remote, source)).toEqual({ ...before, editing_draft: before.draft })
})

it('preserves edited parameters when adopting an already selected template recommendation', async () => {
  const host = await fixture(), { remote, service } = host
  const source = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Template selection', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, source)
  await saveFixtureDraft(remote, { ...source }, draft => { draft.generation_input.parameters['steps'] = 35 }, signal())
  const { task, identity } = await startTask(host, source, 'resources')
  const published = await service.publish({ taskId: task.task_id, artifact: { type: 'resources', refs: [{ kind: 'comfyui-template', id: '5' }] } }, identity)
  const before = await branchAt(remote, source)
  await remote.mutate({ ...source, type: 'task-apply', id: published.artifact_id, value: before.draft }, signal())
  expect(await branchAt(remote, source)).toEqual({ ...before, editing_draft: before.draft })
})

it('changes the model without reading the selected LoRAs again', async () => {
  const host = await fixture(), { remote, catalog } = host
  const source = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Selected resources', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, source)
  await remote.mutate({ ...source, type: 'resource-select', value: { kind: 'lora', id: '3' } }, signal())
  await saveFixtureDraft(remote, { ...source }, () => {}, signal())
  const before = await branchAt(remote, source)
  catalog.details.mockClear().mockRejectedValue(new Error('Selected resource catalog is unavailable'))
  await remote.mutate({ ...source, type: 'resource-select', value: { kind: 'model', id: '4' } }, signal())
  await saveFixtureDraft(remote, { ...source }, () => {}, signal())
  expect((await branchAt(remote, source)).draft).toEqual({
    ...before.draft, generation_input: { ...before.draft.generation_input, model: { id: '4', file_name: 'paint.safetensors' } },
  })
  expect(catalog.details).not.toHaveBeenCalled()
})

it.each([
  { baseModelId: '9', modelId: null, removeModel: false },
  { baseModelId: '1', modelId: '4', removeModel: false },
  { baseModelId: '9', modelId: '4', removeModel: false },
  { baseModelId: '1', modelId: '4', removeModel: true },
])('applies resource recommendations with catalog classification %j', async ({ baseModelId, modelId, removeModel }) => {
  const host = await fixture(), { remote, service, catalog } = host
  const source = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Resource conflict', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, source)
  if (removeModel) { await remote.mutate({ ...source, type: 'resource-remove', value: 'model' }, signal())
  await saveFixtureDraft(remote, { ...source }, () => {}, signal()) }
  const { task, identity } = await startTask(host, source, 'resources')
  const readDetails = catalog.details.getMockImplementation()!
  catalog.details.mockImplementation(async (ref, signal) => {
    const details = await readDetails(ref, signal)
    return ref.kind === 'lora' ? { ...details, item: { ...details.item, label: 'Fine rain LoRA', baseModelId, modelId } } : details
  })
  const artifact = { type: 'resources' as const, refs: [{ kind: 'lora' as const, id: '3' }] }
  const published = await service.publish({ taskId: task.task_id, artifact }, identity)
  const before = await branchAt(remote, source)
  await remote.mutate({ ...source, type: 'task-apply', id: published.artifact_id, value: before.draft }, signal())
  expect((await branchAt(remote, source)).editing_draft).toEqual({
    ...before.draft,
    image_refs: [], workflow_image_bindings: [],
    generation_input: { ...before.draft.generation_input, loras: [{ id: '3', file_name: 'rain.safetensors', weight: 0.65, trigger_words: ['rain'] }] },
  })
  expect((await service.getTask({ taskId: task.task_id }, identity)).artifacts).toEqual([{ task_id: task.task_id, artifact_id: published.artifact_id, artifact, disposition: 'applied' }])
})

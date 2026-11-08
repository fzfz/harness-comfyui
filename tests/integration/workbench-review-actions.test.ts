import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import type { GenerationTransport } from '../../src/host/generation/generation-runtime.ts'
import type { ReviewDraft } from '../../src/workbench/contract.ts'
import type { WorkbenchScope } from '../../src/workbench-remote.ts'
import { CatalogError } from '../../src/host/catalog/catalog-client.ts'
import { toGenerationRequest } from '../../src/cli/contract.ts'
import { createWorkbenchHostFixture } from '../support/workbench-host.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const signal = () => new AbortController().signal
type Host = Awaited<ReturnType<typeof createWorkbenchHostFixture>>

it('saves an experience in the actual later experiment Run model scope without changing the original Task', async () => {
  const host = await fixture(), selected = await selectWork(host)
  const firstRunId = await acceptRun(host, selected, true, 'experiment')
  const task = (await host.remote.getProjection(selected, signal())).tasks.find(item => item.kind === 'experiment')!
  const originalInput = structuredClone(task.input)
  const identity = { workspaceId: selected.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'later-model' }
  host.catalog.resolveGenerationModel.mockImplementation(async id => ({ id, file_name: id === '4' ? 'snow.safetensors' : 'paint.safetensors', base_model_id: id === '4' ? '9' : '1' }))
  await host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id, artifact: { type: 'review', observation: 'Rain is complete', conclusion: 'Try the snow model', run_ids: [firstRunId] } }, identity)
  const candidate = { ...task.input.generation_input, model: { id: '4', file_name: 'snow.safetensors' } }
  await host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id, artifact: { type: 'generation_input', generation_input: candidate, context_refs: [] } }, identity)
  const accepted = await host.runtime.acceptGenerations(identity, [{ requestId: randomUUID(), request: toGenerationRequest({ ...candidate, instance_id: '8', template_id: '5' }) }], undefined, task.task_id)
  const runId = accepted.items[0]!.runId
  for (let phase = 0; phase < 4; phase += 1) await host.runtime.advance()
  const expected = await reviewDraft(host, selected, runId)
  await host.remote.mutate({ ...selected, type: 'evaluate', runId, value: { expected, draft: { ...expected, title: 'Snow edges', conditions: 'Snow model', note: 'Keep the hard light' }, saveExperience: true } }, signal())
  const projection = await host.remote.getProjection(selected, signal())
  expect(projection.experiences).toMatchObject([{ model_id: '4', base_model_id: '9', source_run_id: runId }])
  expect(projection.tasks.find(item => item.task_id === task.task_id)!.input).toEqual(originalInput)
})

it('updates one saved experience with the latest contributing Task and artifact', async () => {
  const host = await fixture(), selected = await selectWork(host), runId = await acceptRun(host, selected)
  let latestTaskId = '', latestArtifactId = '', experienceId: string | null = null
  for (const note of ['Keep the rain', 'Keep the snow']) {
    const { task, identity } = await startEvaluation(host, selected, runId, 'experience')
    const published = await host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id, artifact: { type: 'experience', title: 'Weather edges', conditions: 'Backlight', note, base_model_id: '1', model_id: '2', run_ids: [runId] } }, identity)
    const expected = await reviewDraft(host, selected, runId)
    await host.remote.mutate({ ...selected, type: 'evaluate', runId, value: { expected, draft: expected, saveExperience: true } }, signal())
    const projection = await host.remote.getProjection(selected, signal())
    expect(projection.experiences).toHaveLength(1)
    experienceId ??= projection.experiences[0]!.experience_id
    expect(projection.experiences[0]!.experience_id).toBe(experienceId)
    latestTaskId = task.task_id
    latestArtifactId = published.artifact_id
  }
  expect((await host.remote.getProjection(selected, signal())).experiences[0]).toMatchObject({ task_id: latestTaskId, source_artifact_id: latestArtifactId, note: 'Keep the snow' })
})

it('sets and removes Run and experience favorites explicitly while browsing another branch', async () => {
  const host = await fixture(), selected = await selectWork(host), runId = await acceptRun(host, selected)
  const expected = await reviewDraft(host, selected, runId)
  await host.remote.mutate({ ...selected, type: 'evaluate', runId, value: { expected, draft: { ...expected, title: 'Rain edges', conditions: 'Glass', note: 'Keep the light' }, saveExperience: true } }, signal())
  const experienceId = (await host.remote.getProjection(selected, signal())).experiences[0]!.experience_id
  const sibling = await host.remote.mutate({ ...selected, type: 'create-branch', value: { name: 'Other branch', original_request: 'Paint snow' } }, signal())
  for (const [targetType, id] of [['run', runId], ['experience', experienceId]] as const) {
    for (let repeat = 0; repeat < 2; repeat += 1) await host.remote.mutate({ ...sibling, type: 'favorite', id, value: { targetType, favorite: true } }, signal())
  }
  const all = { workspaceId: selected.workspaceId, workId: selected.workId }
  expect((await host.remote.getProjection(all, signal())).favorites).toEqual(expect.arrayContaining([{ target_type: 'run', target_id: runId }, { target_type: 'experience', target_id: experienceId }]))
  for (const [targetType, id] of [['run', runId], ['experience', experienceId]] as const) {
    for (let repeat = 0; repeat < 2; repeat += 1) await host.remote.mutate({ ...sibling, type: 'favorite', id, value: { targetType, favorite: false } }, signal())
  }
  const after = await host.remote.getProjection(all, signal())
  expect(after.favorites).toEqual([])
  expect(after.experiences).toHaveLength(1)
  expect(after.runs.find(run => run.run_id === runId)!.media).toHaveLength(1)
  const other = await selectWork(host)
  await expect(host.remote.mutate({ ...other, type: 'favorite', id: runId, value: { targetType: 'run', favorite: true } }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_SCOPE_MISMATCH' } })
  await expect(host.remote.mutate({ ...sibling, workspaceId: 'workspace_2', type: 'favorite', id: experienceId, value: { targetType: 'experience', favorite: true } }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_SCOPE_MISMATCH' } })
})

it('reuses an experience across base models with compatible resources and saved prompts before creating its branch', async () => {
  const host = await fixture(), selected = await selectWork(host)
  const readDetails = host.catalog.details.getMockImplementation()!
  host.catalog.details.mockImplementation(async (request, requestSignal) => {
    const details = await readDetails(request, requestSignal)
    return { ...details, item: { ...details.item, baseModelId: request.id === '6' ? null : details.item.baseModelId } }
  })
  for (const value of [{ kind: 'lora', id: '3' }, { kind: 'lora', id: '6' }, { kind: 'style', id: '4' }, { kind: 'artist-string', id: '6' }, { kind: 'character', id: '7' }]) await host.remote.mutate({ ...selected, type: 'resource-select', value }, signal())
  await host.remote.mutate({ ...selected, type: 'update-draft', field: 'positive_prompt', value: 'Source rain prompt' }, signal())
  const runId = await acceptRun(host, selected), expected = await reviewDraft(host, selected, runId)
  const sourceInput = await host.remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())
  await host.remote.mutate({ ...selected, type: 'evaluate', runId, value: { expected, draft: { ...expected, title: 'Rain edges', conditions: 'Glass', note: 'Keep the light' }, saveExperience: true } }, signal())
  const experience = (await host.remote.getProjection(selected, signal())).experiences[0]!
  const created = await host.remote.mutate({ ...selected, type: 'reuse', id: experience.experience_id, value: { name: 'Target base recheck', baseModelId: '9' } }, signal())
  const projection = await host.remote.getProjection(created, signal())
  const draft = projection.branches.find(branch => branch.branch_id === created.branchId)!.draft
  expect(projection.branches.find(branch => branch.branch_id === created.branchId)).toMatchObject({ name: 'Target base recheck', original_request: 'Paint a glasshouse', parent_branch_id: selected.branchId, source_run_id: runId, source_experience_id: experience.experience_id })
  expect(draft).toEqual({
    base_model_id: '9', prompt_input: sourceInput.prompt_input,
    generation_input: { ...sourceInput.generation_input, model: null, template_id: null, parameters: {}, loras: sourceInput.generation_input.loras.filter(lora => lora.id === '6') },
    context_refs: [{ kind: 'artist-string', id: '6' }, { kind: 'character', id: '7' }],
  })
  expect((await host.remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())).generation_input).toEqual(sourceInput.generation_input)
  const sourceDetails = host.catalog.details.getMockImplementation()!
  host.catalog.details.mockImplementation(async (request, requestSignal) => {
    const details = await sourceDetails(request, requestSignal)
    return { ...details, item: { ...details.item, baseModelId: request.kind === 'model' && request.id === '4' || request.kind === 'comfyui-template' && request.id === '10' ? '9' : details.item.baseModelId } }
  })
  host.catalog.resolveGenerationModel.mockImplementation(async id => ({ id, file_name: id === '4' ? 'snow.safetensors' : 'paint.safetensors', base_model_id: id === '4' ? '9' : '1' }))
  host.catalog.resolveTemplate.mockImplementation(async id => ({ id, title: 'Selected template', base_model_id: id === '10' ? '9' : '1', model_id: null }))
  for (const value of [{ kind: 'model', id: '4' }, { kind: 'comfyui-template', id: '10' }]) await host.remote.mutate({ ...created, type: 'resource-select', value }, signal())
  const recheckRunId = await acceptRun(host, created), recheckReview = await reviewDraft(host, created, recheckRunId)
  await host.remote.mutate({ ...created, type: 'evaluate', runId: recheckRunId, value: { expected: recheckReview, draft: { ...recheckReview, title: 'Rechecked edges', conditions: 'Target model', note: 'The new setup works' }, saveExperience: true } }, signal())
  const all = await host.remote.getProjection({ workspaceId: selected.workspaceId, workId: selected.workId }, signal())
  const recheckTask = all.tasks.find(task => task.task_id === all.runs.find(run => run.run_id === recheckRunId)!.workbench_task_id)!
  expect(recheckTask).toMatchObject({ branch_id: created.branchId, input: { base_model_id: '9', requirements: { original_request: 'Paint a glasshouse' }, prompt_input: sourceInput.prompt_input } })
  expect(all.experiences.find(item => item.source_run_id === recheckRunId)).toMatchObject({ branch_id: created.branchId, source_experience_id: experience.experience_id, model_id: '4', base_model_id: '9' })
  expect(all.experiences.find(item => item.experience_id === experience.experience_id)).toEqual(experience)
})

it.each(['missing', 'different-id', 'different-file', 'template-model'] as const)('keeps unknown experience model metadata nullable for %s', async mode => {
  const host = await fixture(), selected = await selectWork(host)
  if (mode === 'template-model') await host.remote.mutate({ ...selected, type: 'resource-remove', value: 'model' }, signal())
  const runId = await acceptRun(host, selected), expected = await reviewDraft(host, selected, runId)
  if (mode === 'missing') host.catalog.resolveGenerationModel.mockRejectedValue(new CatalogError('CATALOG_QUERY_FAILED', 'The model catalog is unavailable'))
  else if (mode !== 'template-model') host.catalog.resolveGenerationModel.mockResolvedValue({ id: mode === 'different-id' ? '7' : '2', file_name: mode === 'different-file' ? 'changed.safetensors' : 'paint.safetensors', base_model_id: '9' })
  await host.remote.mutate({ ...selected, type: 'evaluate', runId, value: { expected, draft: { ...expected, title: 'Rain edges', conditions: 'Glass', note: 'Keep the light' }, saveExperience: true } }, signal())
  expect((await host.remote.getProjection(selected, signal())).experiences[0]).toMatchObject({ model_id: mode === 'template-model' ? null : '2', base_model_id: null })
})

it('rolls back a saved experience when its review draft changes during model resolution', async () => {
  const host = await fixture(), selected = await selectWork(host), runId = await acceptRun(host, selected), expected = await reviewDraft(host, selected, runId)
  let finish!: (value: { id: string; file_name: string; base_model_id: string }) => void
  let started!: () => void
  const reading = new Promise<void>(resolve => { started = resolve })
  host.catalog.resolveGenerationModel.mockImplementation(() => { started(); return new Promise(resolve => { finish = resolve }) })
  const pending = host.remote.mutate({ ...selected, type: 'evaluate', runId, value: { expected, draft: { ...expected, title: 'Rain edges', conditions: 'Glass', note: 'Keep the light' }, saveExperience: true } }, signal())
  await reading
  const draft = { ...expected, observation: 'Changed while saving' }
  await host.remote.mutate({ ...selected, type: 'update-review-draft', runId, value: { expected, draft } }, signal())
  finish({ id: '2', file_name: 'paint.safetensors', base_model_id: '1' })
  await expect(pending).rejects.toMatchObject({ details: { code: 'WORKBENCH_EDIT_CONFLICT' } })
  const result = await host.remote.getProjection(selected, signal())
  expect(result.experiences).toEqual([])
  expect(result.runs.find(run => run.run_id === runId)).toMatchObject({ review: null, review_draft: draft })
})

it('leaves no branch when a reused experience target or resource catalog is unavailable', async () => {
  const host = await fixture(), selected = await selectWork(host), runId = await acceptRun(host, selected), expected = await reviewDraft(host, selected, runId)
  await host.remote.mutate({ ...selected, type: 'evaluate', runId, value: { expected, draft: { ...expected, title: 'Rain edges', conditions: 'Glass', note: 'Keep the light' }, saveExperience: true } }, signal())
  const before = await host.remote.getProjection(selected, signal()), experience = before.experiences[0]!
  const readBaseModels = host.catalog.baseModels.getMockImplementation()!
  host.catalog.baseModels.mockRejectedValue(new CatalogError('CATALOG_QUERY_FAILED', 'The base model catalog is unavailable'))
  await expect(host.remote.mutate({ ...selected, type: 'reuse', id: experience.experience_id, value: { name: 'Offline base catalog', baseModelId: '9' } }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_RESOURCE_UNAVAILABLE' } })
  host.catalog.baseModels.mockImplementation(readBaseModels)
  await expect(host.remote.mutate({ ...selected, type: 'reuse', id: experience.experience_id, value: { name: 'Missing base', baseModelId: '10' } }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_RESOURCE_UNAVAILABLE' } })
  host.catalog.details.mockRejectedValue(new CatalogError('CATALOG_QUERY_FAILED', 'The resource catalog is unavailable'))
  await expect(host.remote.mutate({ ...selected, type: 'reuse', id: experience.experience_id, value: { name: 'Missing resource', baseModelId: '9' } }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_RESOURCE_UNAVAILABLE' } })
  const other = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_2', value: { name: 'Other work', goal: 'Paint snow' } }, signal())
  await expect(host.remote.mutate({ ...other, type: 'reuse', id: experience.experience_id, value: { name: 'Other work', baseModelId: null } }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_SCOPE_MISMATCH' } })
  expect((await host.remote.getProjection(selected, signal())).branches).toEqual(before.branches)
})

it('saves failed cross-branch evidence in the same Work and rejects evidence from another Work', async () => {
  let fail = false
  const host = await fixture(() => fail), selected = await selectWork(host), runId = await acceptRun(host, selected)
  const sibling = await host.remote.mutate({ ...selected, type: 'create-branch', value: { name: 'Failure evidence', original_request: 'Compare the failure' } }, signal())
  fail = true
  const failedRunId = await acceptRun(host, sibling), expected = await reviewDraft(host, selected, runId)
  await host.remote.mutate({ ...selected, type: 'evaluate', runId, value: { expected, draft: { ...expected, title: 'Rain boundary', conditions: 'Glass', note: 'Compare both runs', evidence_run_ids: [runId, failedRunId] }, saveExperience: true } }, signal())
  const all = { workspaceId: selected.workspaceId, workId: selected.workId }
  const before = await host.remote.getProjection(all, signal()), experience = before.experiences[0]!
  expect(experience.evidence_run_ids).toEqual([runId, failedRunId])
  const failure = before.runs.find(run => run.run_id === failedRunId)!
  expect(failure).toMatchObject({ status: 'failed', error: { code: 'COMFYUI_REMOTE_ERROR', message: 'Controlled node failure' } })
  expect(before.tasks.find(task => task.task_id === failure.workbench_task_id)).toMatchObject({ branch_id: sibling.branchId })
  expect(await host.remote.getRunInput({ ...all, workId: selected.workId!, runId: failedRunId }, signal())).toMatchObject({ branch_id: sibling.branchId, generation_input: failure.generation_input })
  const other = await selectWork(host, 'workspace_2'), foreignRunId = await acceptRun(host, other)
  const current = await reviewDraft(host, selected, runId)
  await expect(host.remote.mutate({ ...selected, type: 'evaluate', runId, value: { expected: current, draft: { ...current, note: 'Rejected evidence', evidence_run_ids: [runId, foreignRunId] }, saveExperience: true } }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_SCOPE_MISMATCH' } })
  await expect(host.remote.getRunInput({ ...all, workId: selected.workId!, runId: foreignRunId }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_SCOPE_MISMATCH' } })
  const after = await host.remote.getProjection(all, signal())
  expect(after.experiences).toEqual(before.experiences)
  expect(after.runs.find(run => run.run_id === runId)!.review_draft).toEqual(current)
})

it.each(['title', 'conditions', 'note'] as const)('rejects an experience with missing %s without saving its review or draft', async field => {
  const host = await fixture(), selected = await selectWork(host), runId = await acceptRun(host, selected), expected = await reviewDraft(host, selected, runId)
  const draft = { ...expected, title: 'Rain edges', conditions: 'Glass', note: 'Keep the light', [field]: ' ' }
  await expect(host.remote.mutate({ ...selected, type: 'evaluate', runId, value: { expected, draft, saveExperience: true } }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_INVALID_INPUT', issues: [{ path: `draft.${field}`, message: expect.any(String) }] } })
  const result = await host.remote.getProjection(selected, signal())
  expect(result.experiences).toEqual([])
  expect(result.runs.find(run => run.run_id === runId)).toMatchObject({ review: null, review_draft: expected })
})

async function fixture(fail: boolean | (() => boolean) = false) {
  const transport: GenerationTransport = {
    submit: async input => { input.onRequestStart(); return { promptId: input.promptId } },
    observe: async () => (typeof fail === 'function' ? fail() : fail) ? { status: 'error', outputs: [], error: { code: 'COMFYUI_REMOTE_ERROR', message: 'Controlled node failure' } } : { status: 'success', outputs: [{ nodeId: '3', outputIndex: 0, mediaKind: 'image', filename: 'rain.png', subfolder: '', type: 'output' }] },
    download: async () => ({ bytes: Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]), mediaType: 'image/png' }),
  }
  const description = { parameters: [
    { parameter_id: 'positive', kind: 'positive_prompt' as const, value_type: 'string' as const, current_value: '' },
    { parameter_id: 'negative', kind: 'negative_prompt' as const, value_type: 'string' as const, current_value: '' },
    { parameter_id: 'seed', kind: 'seed' as const, value_type: 'integer' as const, current_value: 17 },
  ], size_candidates: [] }
  const inspectRuntimeParameters = vi.fn(async () => structuredClone(description))
  const host = await createWorkbenchHostFixture({
    inspectRuntimeParameters,
    validateInput: async () => {},
    prepare: async request => ({ instanceId: '8', instanceTitle: 'Node', templateTitle: 'Template', sourceSnapshot: {},
      inputDescription: { ...description, parameters: description.parameters.map(parameter => ({ ...parameter, current_value: request.parameters[parameter.parameter_id] ?? parameter.current_value })) },
      actualWorkflow: {}, apiWorkflow: { '3': { class_type: 'SaveImage', inputs: {} } }, expectedOutputNodeIds: ['3'],
      connection: { origin: 'http://comfy.test', url: 'http://comfy.test', authorization: null } }),
  }, transport)
  cleanups.push(host.dispose)
  return { ...host, inspectRuntimeParameters }
}

async function selectWork(host: Host, workspaceId = 'workspace_1') {
  const selected = await host.remote.mutate({ type: 'new-work', workspaceId, value: { name: 'Rain', goal: 'Paint a glasshouse' } }, signal())
  await host.remote.mutate({ ...selected, type: 'update-draft', field: 'instance_id', value: '8' }, signal())
  for (const value of [{ kind: 'model', id: '2' }, { kind: 'comfyui-template', id: '5' }]) await host.remote.mutate({ ...selected, type: 'resource-select', value }, signal())
  return selected
}

async function acceptRun(host: Host, selected: WorkbenchScope, finish = true, type: 'run' | 'experiment' = 'run') {
  const receipt = await host.remote.mutate({ ...selected, type }, signal())
  const task = (await host.remote.getProjection(selected, signal())).tasks.find(item => item.task_id === receipt.taskId)!
  const identity = { workspaceId: selected.workspaceId, sessionId: task.session_id!, turn: 1, callId: randomUUID() }
  const accepted = await host.runtime.acceptGenerations(identity, [{ requestId: randomUUID(), request: toGenerationRequest({ ...task.input.generation_input, instance_id: task.input.generation_input.instance_id!, template_id: task.input.generation_input.template_id! }) }], undefined, task.task_id)
  const runId = accepted.items[0]!.runId
  if (finish) for (let phase = 0; phase < 4; phase += 1) await host.runtime.advance()
  return runId
}

async function reviewDraft(host: Host, selected: WorkbenchScope, runId: string): Promise<ReviewDraft> {
  return (await host.remote.getProjection(selected, signal())).runs.find(run => run.run_id === runId)!.review_draft!
}

it.each(['generation-first', 'review-first'] as const)('keeps review and generation candidate adoption independent in %s order', async order => {
  const host = await fixture(), selected = await selectWork(host), runId = await acceptRun(host, selected)
  const { task, identity } = await startEvaluation(host, selected, runId)
  const initialReview = await reviewDraft(host, selected, runId), manualReview = { ...initialReview, observation: 'Manual observation during analysis' }
  await host.remote.mutate({ ...selected, type: 'update-review-draft', runId, value: { expected: initialReview, draft: manualReview } }, signal())
  const artifact = { type: 'review' as const, observation: 'Agent observation', conclusion: 'Agent conclusion', run_ids: [runId], candidate: { generation_input: { ...task.input.generation_input, parameters: { ...task.input.generation_input.parameters, positive: 'Candidate rain' } }, context_refs: task.input.context_refs } }
  const published = await host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id, artifact }, identity)
  expect(published.disposition).toBe('candidate')
  const original = await host.remote.getProjection(selected, signal())
  const originalBranch = original.branches.find(branch => branch.branch_id === selected.branchId)!.draft
  const adoptGeneration = async () => {
    const before = await host.remote.getProjection(selected, signal())
    host.inspectRuntimeParameters.mockRejectedValueOnce(new Error('Template inspection unavailable'))
    await expect(host.remote.mutate({ ...selected, type: 'task-generation-apply', id: published.artifact_id, value: originalBranch }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_GENERATION_INVALID' } })
    expect(await host.remote.getProjection(selected, signal())).toEqual(before)
    await host.remote.mutate({ ...selected, type: 'task-generation-apply', id: published.artifact_id, value: originalBranch }, signal())
    const after = await host.remote.getProjection(selected, signal())
    expect(after.artifacts).toEqual(before.artifacts)
    expect(after.runs).toEqual(before.runs)
    expect(after.branches.find(branch => branch.branch_id === selected.branchId)!.draft).toMatchObject({ generation_input: artifact.candidate.generation_input, prompt_input: { positive_prompt: 'Candidate rain' } })
    await expect(host.remote.mutate({ ...selected, type: 'task-generation-apply', id: published.artifact_id, value: originalBranch }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_EDIT_CONFLICT' } })
    expect(await host.remote.getProjection(selected, signal())).toEqual(after)
  }
  const adoptReview = async () => {
    const before = await host.remote.getProjection(selected, signal())
    await expect(host.remote.mutate({ ...selected, type: 'task-apply', id: published.artifact_id, value: initialReview }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_EDIT_CONFLICT' } })
    expect(await host.remote.getProjection(selected, signal())).toEqual(before)
    await host.remote.mutate({ ...selected, type: 'task-apply', id: published.artifact_id, value: manualReview }, signal())
    const after = await host.remote.getProjection(selected, signal())
    expect(after.branches).toEqual(before.branches)
    expect(after.runs.find(run => run.run_id === runId)).toMatchObject({ review: null, review_draft: { observation: 'Agent observation', conclusion: 'Agent conclusion', review_artifact_id: published.artifact_id, evidence_run_ids: [runId] } })
    expect(after.artifacts.find(item => item.artifact_id === published.artifact_id)).toMatchObject({ artifact, session_id: identity.sessionId, task_id: task.task_id, disposition: 'applied', applied_target: { kind: 'run_review', id: runId } })
  }
  if (order === 'generation-first') { await adoptGeneration(); await adoptReview() }
  else { await adoptReview(); await adoptGeneration() }
  const result = await host.remote.getProjection(selected, signal())
  expect(result.artifacts.find(item => item.artifact_id === published.artifact_id)).toMatchObject({ artifact, disposition: 'applied', applied_target: { kind: 'run_review', id: runId } })
  expect(result.experiences).toEqual([])
})

it('retains primary and reference Run scope checks when current resources are unavailable', async () => {
  const host = await fixture(), selected = await selectWork(host), runId = await acceptRun(host, selected)
  const other = await selectWork(host), foreign = await acceptRun(host, other)
  const draft = await reviewDraft(host, selected, runId)
  host.catalog.resolveGenerationModel.mockRejectedValue(new Error('Current model removed'))
  host.catalog.resolveTemplate.mockRejectedValue(new Error('Current template removed'))
  host.catalog.details.mockRejectedValue(new Error('Current context removed'))
  const before = await host.remote.getProjection(selected, signal())
  for (const id of ['review', 'diagnose', 'compare', 'experience']) await expect(host.remote.mutate({ ...other, type: 'agent-action', id, runId, referenceRunIds: [runId, foreign], value: { evaluationDraft: { expected: draft, draft } } }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_SCOPE_MISMATCH' } })
  await expect(host.remote.mutate({ ...selected, type: 'agent-action', id: 'compare', runId, referenceRunIds: [runId, foreign], value: { evaluationDraft: { expected: draft, draft } } }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_SCOPE_MISMATCH' } })
  await expect(host.remote.mutate({ ...selected, workspaceId: 'workspace_2', type: 'agent-action', id: 'review', runId, value: { evaluationDraft: { expected: draft, draft } } }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_SCOPE_MISMATCH' } })
  expect(await host.remote.getProjection(selected, signal())).toEqual(before)
})

it.each(['model', 'template', 'context'] as const)('retains current %s availability validation when starting another generation', async unavailable => {
  const host = await fixture(), selected = await selectWork(host)
  await host.remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'style', id: '7' } }, signal())
  await acceptRun(host, selected)
  const before = await host.remote.getProjection(selected, signal())
  if (unavailable === 'model') host.catalog.resolveGenerationModel.mockRejectedValue(new Error('Current model unavailable'))
  if (unavailable === 'template') host.catalog.resolveTemplate.mockRejectedValue(new Error('Current template unavailable'))
  if (unavailable === 'context') host.catalog.details.mockRejectedValue(new Error('Current context unavailable'))
  await expect(host.remote.mutate({ ...selected, type: 'run' }, signal())).rejects.toMatchObject({ code: 'workbench/operation-failed', details: { code: 'WORKBENCH_RESOURCE_UNAVAILABLE' } })
  expect(await host.remote.getProjection(selected, signal())).toEqual(before)
})

it.each(['review', 'diagnose', 'compare', 'experience'])('creates a historical %s Task after its current model, template and context become unavailable', async kind => {
  const host = await fixture(true), selected = await selectWork(host)
  await host.remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'style', id: '7' } }, signal())
  const runId = await acceptRun(host, selected), second = await acceptRun(host, selected)
  const historical = await host.remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())
  host.catalog.resolveGenerationModel.mockClear().mockRejectedValue(new Error('Current model removed'))
  host.catalog.resolveTemplate.mockClear().mockRejectedValue(new Error('Current template removed'))
  host.catalog.details.mockClear().mockRejectedValue(new Error('Current context removed'))
  host.inspectRuntimeParameters.mockClear().mockRejectedValue(new Error('Current template inspection unavailable'))
  const { task, identity } = await startEvaluation(host, selected, runId, kind, kind === 'compare' ? [runId, second] : [runId])
  const fixed = await host.ctx.harnessComfyuiWorkbench.service.getTask({ taskId: task.task_id }, identity)
  expect(fixed).toMatchObject({ generation_input: historical.generation_input, prompt_input: historical.prompt_input, context_refs: [{ kind: 'style', id: '7' }], base_model_id: null })
  expect(host.catalog.resolveGenerationModel).not.toHaveBeenCalled()
  expect(host.catalog.resolveTemplate).not.toHaveBeenCalled()
  expect(host.catalog.details).not.toHaveBeenCalled()
  expect(host.inspectRuntimeParameters).not.toHaveBeenCalled()
})

it('retains separate user drafts for a successful Run and a failed Run after refreshing', async () => {
  let failed = false
  const host = await fixture(() => failed), selected = await selectWork(host)
  const success = await acceptRun(host, selected)
  failed = true
  const failure = await acceptRun(host, selected)
  for (const [runId, observation] of [[success, 'Successful rain'], [failure, 'Node failure']]) {
    const expected = await reviewDraft(host, selected, runId!)
    await host.remote.mutate({ ...selected, type: 'update-review-draft', runId, value: { expected, draft: { ...expected, observation } } }, signal())
  }
  const projection = await host.remote.getProjection(selected, signal())
  expect(projection.runs.find(run => run.run_id === success)).toMatchObject({ status: 'succeeded', review: null, review_draft: { observation: 'Successful rain' } })
  expect(projection.runs.find(run => run.run_id === failure)).toMatchObject({ status: 'failed', review: null, review_draft: { observation: 'Node failure' } })
  expect(projection.experiences).toEqual([])
})

it.each(['observation', 'conclusion'] as const)('saves a manual review containing only %s and retains its Agent source', async field => {
  const host = await fixture(), selected = await selectWork(host), runId = await acceptRun(host, selected)
  const { task, identity } = await startEvaluation(host, selected, runId)
  const published = await host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id, artifact: { type: 'review', observation: 'Agent observation', conclusion: 'Agent conclusion', run_ids: [runId] } }, identity)
  const expected = await reviewDraft(host, selected, runId)
  const draft = { ...expected, verdict: 'met', observation: '', conclusion: '', title: 'Incomplete optional experience', [field]: 'Manual review text' }
  await host.remote.mutate({ ...selected, type: 'evaluate', runId, value: { expected, draft, saveExperience: false } }, signal())
  const result = await host.remote.getProjection(selected, signal())
  expect(result.runs.find(run => run.run_id === runId)).toMatchObject({ review: { verdict: 'met', observation: field === 'observation' ? 'Manual review text' : '', conclusion: field === 'conclusion' ? 'Manual review text' : '', source_artifact_id: published.artifact_id }, review_draft: draft })
  expect(result.experiences).toEqual([])
})

it.each(['update-review-draft', 'evaluate'] as const)('rejects stale and foreign %s requests without changing saved fields', async type => {
  const host = await fixture(), selected = await selectWork(host), runId = await acceptRun(host, selected)
  const expected = await reviewDraft(host, selected, runId), draft = { ...expected, observation: 'Manual observation' }
  await host.remote.mutate({ ...selected, type: 'update-review-draft', runId, value: { expected, draft } }, signal())
  const other = await selectWork(host, 'workspace_2')
  const before = await host.remote.getProjection(selected, signal())
  await expect(host.remote.mutate({ ...selected, type, runId, value: { expected, draft: { ...draft, conclusion: 'Stale save' } } }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_EDIT_CONFLICT' } })
  for (const scope of [{ ...selected, workspaceId: 'workspace_2' }, other]) await expect(host.remote.mutate({ ...scope, type, runId, value: { expected: draft, draft } }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_SCOPE_MISMATCH' } })
  expect(await host.remote.getProjection(selected, signal())).toEqual(before)
})

it('diagnoses the fixed failure without generating another Run', async () => {
  const host = await fixture(true), selected = await selectWork(host), runId = await acceptRun(host, selected)
  const before = await host.remote.getProjection(selected, signal()), failed = before.runs.find(run => run.run_id === runId)!
  expect(failed.status).toBe('failed')
  const { task, identity } = await startEvaluation(host, selected, runId, 'diagnose')
  const published = await host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id, artifact: { type: 'review', observation: 'Node rejected input', conclusion: 'Correct the node input', run_ids: [runId] } }, identity)
  expect(published.disposition).toBe('applied')
  const result = await host.remote.getProjection(selected, signal()), diagnosed = result.runs.find(run => run.run_id === runId)!
  expect(result.runs).toHaveLength(before.runs.length)
  expect(diagnosed).toMatchObject({ status: 'failed', error: failed.error, generation_input: failed.generation_input, review: null, review_draft: { observation: 'Node rejected input', conclusion: 'Correct the node input' } })
})

it.each(['review', 'compare', 'diagnose', 'experience'])('rejects %s on an unfinished primary Run before creating a Task', async kind => {
  const host = await fixture(), selected = await selectWork(host), runId = await acceptRun(host, selected, false)
  const before = await host.remote.getProjection(selected, signal())
  await expect(startEvaluation(host, selected, runId, kind, [runId, runId])).rejects.toMatchObject({ details: { code: 'WORKBENCH_RUN_NOT_FINISHED' } })
  expect(await host.remote.getProjection(selected, signal())).toEqual(before)
})

it('rejects diagnosis of a successful Run before creating a Task', async () => {
  const host = await fixture(), selected = await selectWork(host), runId = await acceptRun(host, selected)
  const before = await host.remote.getProjection(selected, signal())
  await expect(startEvaluation(host, selected, runId, 'diagnose')).rejects.toMatchObject({ details: { code: 'WORKBENCH_FAILED_RUN_REQUIRED' } })
  expect(await host.remote.getProjection(selected, signal())).toEqual(before)
})

it('rejects stale candidate adoption, another Work and a review without a generation candidate', async () => {
  const host = await fixture(), selected = await selectWork(host), runId = await acceptRun(host, selected)
  const { task, identity } = await startEvaluation(host, selected, runId)
  const original = (await host.remote.getProjection(selected, signal())).branches.find(branch => branch.branch_id === selected.branchId)!.draft
  const artifact = { type: 'review' as const, observation: 'Rain', conclusion: 'Use a clearer window', run_ids: [runId] }
  const published = await host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id, artifact: { ...artifact, candidate: { generation_input: { ...task.input.generation_input, parameters: { ...task.input.generation_input.parameters, positive: 'Candidate rain' } }, context_refs: task.input.context_refs } } }, identity)
  await host.remote.mutate({ ...selected, type: 'update-draft', field: 'positive_prompt', value: 'Manual branch edit' }, signal())
  const other = await selectWork(host)
  const before = await host.remote.getProjection(selected, signal())
  await expect(host.remote.mutate({ ...selected, type: 'task-generation-apply', id: published.artifact_id, value: original }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_EDIT_CONFLICT' } })
  await expect(host.remote.mutate({ ...other, type: 'task-generation-apply', id: published.artifact_id, value: original }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_SCOPE_MISMATCH' } })
  expect(await host.remote.getProjection(selected, signal())).toEqual(before)
  const plain = await host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id, artifact }, { ...identity, callId: 'plain-review' })
  const current = (await host.remote.getProjection(selected, signal())).branches.find(branch => branch.branch_id === selected.branchId)!.draft
  await expect(host.remote.mutate({ ...selected, type: 'task-generation-apply', id: plain.artifact_id, value: current }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_INVALID_INPUT' } })
  expect((await host.remote.getProjection(selected, signal())).branches.find(branch => branch.branch_id === selected.branchId)!.draft).toEqual(current)
})

it.each(['review', 'experience'] as const)('keeps a manual %s edit made while historical input is being read as a candidate conflict', async kind => {
  const host = await fixture(), selected = await selectWork(host), runId = await acceptRun(host, selected)
  const expected = await reviewDraft(host, selected, runId)
  const clicked = { ...expected, observation: 'Clicked observation', conclusion: 'Clicked conclusion', title: 'Clicked title', conditions: 'Glass', note: 'Backlight' }
  const pending = host.remote.mutate({ ...selected, type: 'agent-action', id: kind, runId, value: { evaluationDraft: { expected, draft: clicked } } }, signal())
  const manual = { ...clicked, [kind === 'review' ? 'observation' : 'title']: 'Manual while reading' }
  await host.remote.mutate({ ...selected, type: 'update-review-draft', runId, value: { expected: clicked, draft: manual } }, signal())
  const receipt = await pending
  const task = (await host.remote.getProjection(selected, signal())).tasks.find(item => item.task_id === receipt.taskId)!
  const identity = { workspaceId: selected.workspaceId, sessionId: task.session_id!, turn: 1, callId: kind }
  const fixed = await host.ctx.harnessComfyuiWorkbench.service.getTask({ taskId: task.task_id }, identity)
  expect(fixed.evaluation_input).toMatchObject({ observation: 'Clicked observation', conclusion: 'Clicked conclusion', experience: { title: 'Clicked title' } })
  const artifact = kind === 'review'
    ? { type: 'review' as const, observation: 'Agent observation', conclusion: 'Agent conclusion', run_ids: [runId] }
    : { type: 'experience' as const, title: 'Agent title', conditions: 'Glass', note: 'Agent note', base_model_id: '1', model_id: '2', run_ids: [runId] }
  const published = await host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id, artifact }, identity)
  expect(published.disposition).toBe('candidate')
  expect(await reviewDraft(host, selected, runId)).toEqual(manual)
  await expect(host.remote.mutate({ ...selected, type: 'task-apply', id: published.artifact_id, value: clicked }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_EDIT_CONFLICT' } })
  await host.remote.mutate({ ...selected, type: 'task-apply', id: published.artifact_id, value: manual }, signal())
  const result = await host.remote.getProjection(selected, signal())
  expect(result.runs.find(run => run.run_id === runId)!.review).toBeNull()
  expect(result.experiences).toEqual([])
  expect(await reviewDraft(host, selected, runId)).toMatchObject(kind === 'review' ? { observation: 'Agent observation', title: 'Clicked title' } : { title: 'Agent title', observation: 'Clicked observation' })
})

it('fills experience fields from the latest clicked review while retaining a later observation edit', async () => {
  const host = await fixture(), selected = await selectWork(host), runId = await acceptRun(host, selected)
  const expected = await reviewDraft(host, selected, runId), draft = { ...expected, observation: 'Latest observation', conclusion: 'Latest conclusion' }
  await host.remote.mutate({ ...selected, type: 'update-review-draft', runId, value: { expected, draft } }, signal())
  const { task, identity } = await startEvaluation(host, selected, runId, 'experience')
  expect((await host.ctx.harnessComfyuiWorkbench.service.getTask({ taskId: task.task_id }, identity)).evaluation_input).toMatchObject({ observation: 'Latest observation', conclusion: 'Latest conclusion' })
  await host.remote.mutate({ ...selected, type: 'update-review-draft', runId, value: { expected: draft, draft: { ...draft, observation: 'Later manual observation' } } }, signal())
  const published = await host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id, artifact: { type: 'experience', title: 'Rain', conditions: 'Glass', note: 'Backlight', base_model_id: '1', model_id: '2', run_ids: [runId] } }, identity)
  expect(published.disposition).toBe('applied')
  const result = await host.remote.getProjection(selected, signal())
  expect(result.runs.find(run => run.run_id === runId)).toMatchObject({ review: null, review_draft: { observation: 'Later manual observation', conclusion: 'Latest conclusion', title: 'Rain', conditions: 'Glass', note: 'Backlight', experience_artifact_id: published.artifact_id } })
  expect(result.experiences).toEqual([])
})

it('rejects an empty manual review without changing its draft or saved review', async () => {
  const host = await fixture(), selected = await selectWork(host), runId = await acceptRun(host, selected)
  const expected = await reviewDraft(host, selected, runId), before = await host.remote.getProjection(selected, signal())
  await expect(host.remote.mutate({ ...selected, type: 'evaluate', runId, value: { expected, draft: { ...expected, verdict: 'met' }, saveExperience: false } }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_INVALID_INPUT' } })
  expect(await host.remote.getProjection(selected, signal())).toEqual(before)
})

it('requires every fixed comparison Run exactly once in the published review', async () => {
  const host = await fixture(), selected = await selectWork(host)
  const first = await acceptRun(host, selected), second = await acceptRun(host, selected)
  const { task, identity } = await startEvaluation(host, selected, first, 'compare', [first, second])
  const before = await host.remote.getProjection(selected, signal())
  for (const [run_ids, code] of [[[first], 'WORKBENCH_EVIDENCE_REQUIRED'], [[second], 'WORKBENCH_EVIDENCE_REQUIRED'], [[first, second, first], 'WORKBENCH_EVIDENCE_REQUIRED'], [[first, second, 'unrelated-run'], 'WORKBENCH_RUN_NOT_ALLOWED']] as const) {
    await expect(host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id, artifact: { type: 'review', observation: 'Compare', conclusion: 'First is clearer', run_ids: [...run_ids] } }, identity)).rejects.toMatchObject({ code })
    expect(await host.remote.getProjection(selected, signal())).toEqual(before)
  }
  const published = await host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id, artifact: { type: 'review', observation: 'Both windows', conclusion: 'First is clearer', run_ids: [first, second] } }, identity)
  expect(published.disposition).toBe('applied')
  expect(await reviewDraft(host, selected, first)).toMatchObject({ evidence_run_ids: [first, second], review_artifact_id: published.artifact_id })
  expect(await reviewDraft(host, selected, second)).toEqual(before.runs.find(run => run.run_id === second)!.review_draft)
})

it('rejects two identical comparison references before creating a Task', async () => {
  const host = await fixture(), selected = await selectWork(host), runId = await acceptRun(host, selected)
  const before = await host.remote.getProjection(selected, signal())
  await expect(startEvaluation(host, selected, runId, 'compare', [runId, runId])).rejects.toMatchObject({ details: { code: 'WORKBENCH_INVALID_INPUT' } })
  expect(await host.remote.getProjection(selected, signal())).toEqual(before)
})

async function startEvaluation(host: Host, selected: WorkbenchScope, runId: string, kind = 'review', referenceRunIds = [runId]) {
  const expected = await reviewDraft(host, selected, runId)
  const receipt = await host.remote.mutate({ ...selected, type: 'agent-action', id: kind, runId, referenceRunIds, value: { evaluationDraft: { expected, draft: expected } } }, signal())
  const task = (await host.remote.getProjection(selected, signal())).tasks.find(item => item.task_id === receipt.taskId)!
  return { task, identity: { workspaceId: selected.workspaceId, sessionId: task.session_id!, turn: 1, callId: randomUUID() } }
}

it('adopts a review generation candidate into the original Task branch while browsing another branch', async () => {
  const host = await fixture(), selected = await selectWork(host), runId = await acceptRun(host, selected)
  const { task, identity } = await startEvaluation(host, selected, runId)
  const original = (await host.remote.getProjection(selected, signal())).branches.find(branch => branch.branch_id === selected.branchId)!.draft
  const candidate = { generation_input: { ...task.input.generation_input, parameters: { ...task.input.generation_input.parameters, positive: 'Candidate rain' } }, context_refs: task.input.context_refs }
  const published = await host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id, artifact: { type: 'review', observation: 'Rain', conclusion: 'Try a clearer window', run_ids: [runId], candidate } }, identity)
  expect((await host.remote.getProjection(selected, signal())).branches.find(branch => branch.branch_id === selected.branchId)!.draft).toEqual(original)
  const sibling = await host.remote.mutate({ ...selected, type: 'create-branch', value: { name: 'Sibling', original_request: 'Paint clouds' } }, signal())
  const before = await host.remote.getProjection(sibling, signal()), siblingDraft = before.branches.find(branch => branch.branch_id === sibling.branchId)!.draft
  await host.remote.mutate({ ...sibling, type: 'task-generation-apply', id: published.artifact_id, value: original }, signal())
  const after = await host.remote.getProjection(sibling, signal())
  expect(after.branches.find(branch => branch.branch_id === selected.branchId)!.draft).toMatchObject({ generation_input: candidate.generation_input, prompt_input: { positive_prompt: 'Candidate rain', negative_prompt: '' } })
  expect(after.branches.find(branch => branch.branch_id === sibling.branchId)!.draft).toEqual(siblingDraft)
  expect(after.runs).toEqual(before.runs)
})

it('rejects an Agent review of an unfinished Run before recording an artifact', async () => {
  const host = await fixture(), selected = await selectWork(host)
  const runId = await acceptRun(host, selected, false, 'experiment')
  const before = await host.remote.getProjection(selected, signal()), task = before.tasks[0]!
  await expect(host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id, artifact: { type: 'review', observation: 'Early', conclusion: 'Early', run_ids: [runId] } }, { workspaceId: selected.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'early-review' })).rejects.toMatchObject({ code: 'WORKBENCH_RUN_NOT_FINISHED' })
  expect(await host.remote.getProjection(selected, signal())).toEqual(before)
})

it('fixes the clicked review fields and historical Run input before analysis', async () => {
  const host = await fixture(), selected = await selectWork(host)
  await host.remote.mutate({ ...selected, type: 'update-draft', field: 'positive_prompt', value: 'Saved rain prompt' }, signal())
  const runId = await acceptRun(host, selected)
  const historical = await host.remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())
  const expected = await reviewDraft(host, selected, runId)
  const draft = { ...expected, verdict: 'needs-work' as const, observation: 'Clicked observation', conclusion: 'Clicked conclusion', title: 'Clicked experience' }
  await host.remote.mutate({ ...selected, type: 'update-draft', field: 'positive_prompt', value: 'Current branch prompt' }, signal())
  const receipt = await host.remote.mutate({ ...selected, type: 'agent-action', id: 'review', runId, value: { evaluationDraft: { expected, draft } } }, signal())
  const projection = await host.remote.getProjection(selected, signal())
  const task = projection.tasks.find(item => item.task_id === receipt.taskId)!
  const identity = { workspaceId: selected.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'review' }
  const fixed = await host.ctx.harnessComfyuiWorkbench.service.getTask({ taskId: task.task_id }, identity)
  expect(fixed).toMatchObject({
    generation_input: historical.generation_input, prompt_input: historical.prompt_input, context_refs: historical.context_refs,
    reference_run_ids: [runId], evaluation_input: { run_id: runId, verdict: 'needs-work', observation: 'Clicked observation', conclusion: 'Clicked conclusion', experience: { title: 'Clicked experience', conditions: '', note: '' } },
  })
  expect(await reviewDraft(host, selected, runId)).toEqual(draft)
  const published = await host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id, artifact: { type: 'review', observation: 'Agent observation', conclusion: 'Agent conclusion', run_ids: [runId] } }, identity)
  expect(published.disposition).toBe('applied')
  const result = await host.remote.getProjection(selected, signal())
  expect(result.runs.find(run => run.run_id === runId)).toMatchObject({ review: null, review_draft: { observation: 'Agent observation', conclusion: 'Agent conclusion', title: 'Clicked experience', review_artifact_id: published.artifact_id } })
  expect(result.experiences).toEqual([])
})

it.each(['update-review-draft', 'evaluate'] as const)('rejects %s for a Run that has not finished', async type => {
  const host = await fixture(), selected = await selectWork(host)
  const runId = await acceptRun(host, selected, false)
  const expected = await reviewDraft(host, selected, runId)
  const before = await host.remote.getProjection(selected, signal())
  await expect(host.remote.mutate({ ...selected, type, runId, value: { expected, draft: { ...expected, observation: 'Too early' } } }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_RUN_NOT_FINISHED' } })
  expect(await host.remote.getProjection(selected, signal())).toEqual(before)
})

it('keeps a terminal Run review draft through the public Remote without saving a review or experience', async () => {
  const host = await fixture(), selected = await selectWork(host)
  const runId = await acceptRun(host, selected)
  const expected = await reviewDraft(host, selected, runId)
  const draft = { ...expected, verdict: 'met' as const, observation: 'Rain is visible', title: 'Rain evidence' }
  const receipt = await host.remote.mutate({ ...selected, type: 'update-review-draft', runId, value: { expected, draft } }, signal())
  expect(receipt).toEqual(selected)
  const projection = await host.remote.getProjection(selected, signal())
  expect(projection.runs.find(run => run.run_id === runId)).toMatchObject({ status: 'succeeded', review_draft: draft, review: null })
  expect(projection.experiences).toEqual([])
})

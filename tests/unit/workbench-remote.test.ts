import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { CatalogClient } from '../../src/host/catalog/catalog-client.ts'
import { parseCatalogDetails, type CatalogDetailsRequest } from '../../src/catalog/details-schema.ts'
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


it('previews incompatible model resources without changing the saved draft', async () => {
  const host = await createWorkbenchHostFixture()
  try {
    const { remote, catalog } = host
    const signal = new AbortController().signal
    const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal)
    const scope = { workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId! }
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
    await remote.mutate({ ...scope, type: 'update-draft', field: 'instance_id', value: '8' }, signal)
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'comfyui-template', id: '5' } }, signal)
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'lora', id: '3' } }, signal)
    const before = (await remote.getProjection(scope, signal)).branches[0]!.draft
    restrictSelectedResources(catalog)

    await expect(remote.previewModelChange({ ...scope, modelId: '9' }, signal)).resolves.toEqual({
      model: { id: '9', label: 'paint.safetensors' },
      removed: [
        { kind: 'comfyui-template', id: '5', label: 'Rain template' },
        { kind: 'lora', id: '3', label: 'rain.safetensors' },
      ],
    })
    expect((await remote.getProjection(scope, signal)).branches[0]!.draft).toEqual(before)
    await expect(remote.previewModelChange({ ...scope, workspaceId: 'workspace_2', modelId: '9' }, signal)).rejects.toMatchObject({
      details: { code: 'WORKBENCH_SCOPE_MISMATCH' },
    })
    await expect(remote.previewModelChange({ ...scope, modelId: '9' }, AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' })
  } finally { await host.dispose() }
})


it('uses the current public Catalog labels instead of saved model and LoRA filenames', async () => {
  const host = await createWorkbenchHostFixture()
  try {
    const { remote, catalog } = host
    const signal = new AbortController().signal
    const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal)
    const scope = { workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId! }
    for (const ref of [{ kind: 'model', id: '2' }, { kind: 'comfyui-template', id: '5' }, { kind: 'lora', id: '3' }]) await remote.mutate({ ...scope, type: 'resource-select', value: ref }, signal)
    const before = (await remote.getProjection(scope, signal)).branches[0]!.draft
    expect(before.generation_input.loras[0]!.file_name).toBe('rain.safetensors')
    const sourceRecords: Record<string, object> = {
      '/internal/semantic/generation-models': { id: 9, base_model_id: 2, file_name: 'current-model.safetensors', file_format: 'safetensors', precision_or_quantization: 'fp16', author: null, version: null, description: '', usage: '', skill_name: null },
      '/internal/semantic/loras': { id: 3, base_model_id: 1, model_id: 2, file_name: 'current-rain.safetensors', file_format: 'safetensors', precision_or_quantization: 'fp16', author: null, version: null, description: '', usage: '', trigger_words_json: ['rain'], weight: 0.7 },
      '/internal/semantic/comfyui-templates': { id: 5, base_model_id: 1, model_id: 2, lora_id: null, title: 'Current source template', template_type: 'text_to_image' },
    }
    const source = new CatalogClient({
      settings: { get: () => ({ url: 'http://127.0.0.1', port: 18093 }) },
      query: async ({ path }) => ({ status: 'ok', message: null, page: 1, page_size: 1, total_count: 1, results: [{ cover_url: null, sample_image_urls: [], ...sourceRecords[path] }] }),
    })
    const currentLora = await source.details({ kind: 'lora', id: '3' }, signal)
    expect(currentLora.item.label).toBe('current-rain.safetensors')
    catalog.details.mockImplementation(async raw => {
      const ref = raw as CatalogDetailsRequest
      const details = await source.details(ref, signal)
      const label = ref.kind === 'model' ? 'ANIMA display name' : ref.kind === 'lora' ? 'Rain LoRA name' : 'Template display name'
      return parseCatalogDetails({ ...details, item: { ...details.item, label } })
    })
    restrictSelectedResources(catalog)

    await expect(remote.previewModelChange({ ...scope, modelId: '9' }, signal)).resolves.toEqual({
      model: { id: '9', label: 'ANIMA display name' },
      removed: [
        { kind: 'comfyui-template', id: '5', label: 'Template display name' },
        { kind: 'lora', id: '3', label: 'Rain LoRA name' },
      ],
    })
    expect((await remote.getProjection(scope, signal)).branches[0]!.draft).toEqual(before)
  } finally { await host.dispose() }
})


it('previews interleaved incompatible contexts in selection order while retaining global contexts', async () => {
  const host = await createWorkbenchHostFixture()
  try {
    const { remote, catalog } = host
    const signal = new AbortController().signal
    const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal)
    const scope = { workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId! }
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
    for (const ref of [{ kind: 'style', id: '7' }, { kind: 'artist-string', id: '8' }, { kind: 'style', id: '11' }, { kind: 'character', id: '9' }, { kind: 'prompt-term', id: '10' }]) {
      await remote.mutate({ ...scope, type: 'resource-select', value: ref }, signal)
    }
    restrictSelectedResources(catalog)
    const read = catalog.details.getMockImplementation()!
    catalog.details.mockImplementation(async (request, requestSignal) => {
      const details = await read(request, requestSignal)
      return { ...details, item: { ...details.item, label: request.kind === 'model' ? 'paint.safetensors' : request.id === '7' ? 'Watercolor' : request.id === '11' ? 'Oil painting' : 'Garden artists' } }
    })
    const before = (await remote.getProjection(scope, signal)).branches[0]!.draft

    await expect(remote.previewModelChange({ ...scope, modelId: '9' }, signal)).resolves.toEqual({
      model: { id: '9', label: 'paint.safetensors' },
      removed: [
        { kind: 'style', id: '7', label: 'Watercolor' },
        { kind: 'artist-string', id: '8', label: 'Garden artists' },
        { kind: 'style', id: '11', label: 'Oil painting' },
      ],
    })
    expect((await remote.getProjection(scope, signal)).branches[0]!.draft).toEqual(before)
  } finally { await host.dispose() }
})


it('confirms exactly the model removals and preserves the latest unrelated draft edits', async () => {
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
    await remote.mutate({ ...scope, type: 'update-draft', field: 'positive_prompt', value: 'Before preview' }, signal)
    restrictSelectedResources(catalog, '4')
    const before = (await remote.getProjection(scope, signal)).branches[0]!.draft
    const preview = await remote.previewModelChange({ ...scope, modelId: '9' }, signal)
    expect(preview.removed).toEqual([
      { kind: 'comfyui-template', id: '5', label: 'Rain template' },
      { kind: 'lora', id: '3', label: 'rain.safetensors' },
      { kind: 'style', id: '7', label: 'Watercolor' },
    ])
    await expect(remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '9' } }, signal)).rejects.toMatchObject({
      details: { code: 'WORKBENCH_EDIT_CONFLICT' },
    })
    expect((await remote.getProjection(scope, signal)).branches[0]!.draft).toEqual(before)
    await remote.mutate({ ...scope, type: 'update-draft', field: 'positive_prompt', value: 'Latest prompt' }, signal)
    await remote.mutate({ ...scope, type: 'update-draft', field: 'lora-weight', id: '4', value: 1.2 }, signal)
    await remote.mutate({ ...scope, type: 'resource-select', value: {
      kind: 'model', id: '9', confirmedRemovals: [{ kind: 'style', id: '7' }, { kind: 'lora', id: '3' }, { kind: 'comfyui-template', id: '5' }],
    } }, signal)
    const after = (await remote.getProjection(scope, signal)).branches[0]!.draft
    expect(after).toEqual({
      ...before,
      prompt_input: { positive_prompt: 'Latest prompt', negative_prompt: '' },
      generation_input: { ...before.generation_input, model: { id: '9', file_name: 'paint.safetensors' }, template_id: null, parameters: {}, loras: [{ id: '4', file_name: 'rain.safetensors', weight: 1.2, trigger_words: ['rain'] }] },
      context_refs: [{ kind: 'character', id: '8' }],
    })
    expect(await remote.getInputDescription(scope, signal)).toBeNull()
  } finally { await host.dispose() }
})


it('retains compatible template parameters and LoRAs without scanning Catalog pages', async () => {
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

    expect(await remote.previewModelChange({ ...scope, modelId: '9' }, signal)).toEqual({ model: { id: '9', label: 'paint.safetensors' }, removed: [] })
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '9' } }, signal)
    const after = (await remote.getProjection(scope, signal)).branches[0]!.draft
    expect(after).toEqual({ ...before, generation_input: { ...before.generation_input, model: { id: '9', file_name: 'paint.safetensors' } } })
    expect((await remote.getInputDescription(scope, signal))?.parameters.some(parameter => parameter.kind === 'seed')).toBe(true)
    expect(catalog.search).not.toHaveBeenCalled()
    expect(catalog.details).toHaveBeenCalledWith({ kind: 'lora', id: '4' }, expect.any(AbortSignal))
  } finally { await host.dispose() }
})

it('rejects a stale model removal acknowledgement after another resource is selected', async () => {
  const host = await createWorkbenchHostFixture()
  try {
    const { remote, catalog } = host
    const signal = new AbortController().signal
    const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal)
    const scope = { workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId! }
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'lora', id: '3' } }, signal)
    restrictSelectedResources(catalog)
    const preview = await remote.previewModelChange({ ...scope, modelId: '9' }, signal)
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'lora', id: '4' } }, signal)
    const before = (await remote.getProjection(scope, signal)).branches[0]!.draft

    await expect(remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '9', confirmedRemovals: preview.removed.map(({ kind, id }) => ({ kind, id })) } }, signal)).rejects.toMatchObject({ details: { code: 'WORKBENCH_EDIT_CONFLICT', issues: [{ path: 'value.confirmedRemovals' }] } })
    expect((await remote.getProjection(scope, signal)).branches[0]!.draft).toEqual(before)
  } finally { await host.dispose() }
})

it('keeps a draft edit made while confirmed model compatibility is being read', async () => {
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
    restrictSelectedResources(catalog)
    const read = catalog.details.getMockImplementation()!
    catalog.details.mockImplementationOnce(async (request, requestSignal) => { started(); await resume; return read(request, requestSignal) })
    const pending = remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '9', confirmedRemovals: [{ kind: 'comfyui-template', id: '5' }] } }, signal)
    await reading
    await remote.mutate({ ...scope, type: 'update-draft', field: 'positive_prompt', value: 'Concurrent prompt' }, signal)
    const before = (await remote.getProjection(scope, signal)).branches[0]!.draft
    release()

    await expect(pending).rejects.toMatchObject({ details: { code: 'WORKBENCH_EDIT_CONFLICT' } })
    expect((await remote.getProjection(scope, signal)).branches[0]!.draft).toEqual(before)
  } finally { await host.dispose() }
})


it('returns a selected resource failure without partially previewing or saving a model change', async () => {
  const host = await createWorkbenchHostFixture()
  try {
    const { remote, catalog } = host
    const signal = new AbortController().signal
    const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal)
    const scope = { workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId! }
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'lora', id: '3' } }, signal)
    const before = (await remote.getProjection(scope, signal)).branches[0]!.draft
    restrictSelectedResources(catalog)
    const read = catalog.details.getMockImplementation()!
    catalog.details.mockImplementation(async (request, requestSignal) => {
      if (request.kind === 'lora') throw new Error('Source unavailable')
      return read(request, requestSignal)
    })

    await expect(remote.previewModelChange({ ...scope, modelId: '9' }, signal)).rejects.toMatchObject({ details: { code: 'WORKBENCH_RESOURCE_UNAVAILABLE' } })
    await expect(remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '9', confirmedRemovals: [{ kind: 'lora', id: '3' }] } }, signal)).rejects.toMatchObject({ details: { code: 'WORKBENCH_RESOURCE_UNAVAILABLE' } })
    expect((await remote.getProjection(scope, signal)).branches[0]!.draft).toEqual(before)
  } finally { await host.dispose() }
})

it('cancels an in-flight model preview without changing its branch', async () => {
  const host = await createWorkbenchHostFixture()
  try {
    const { remote, catalog } = host
    const signal = new AbortController().signal
    const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal)
    const scope = { workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId! }
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'lora', id: '3' } }, signal)
    const before = (await remote.getProjection(scope, signal)).branches[0]!.draft
    let started!: () => void
    const reading = new Promise<void>(resolve => { started = resolve })
    catalog.details.mockImplementationOnce(async (_input, requestSignal) => new Promise((_resolve, reject) => {
      requestSignal.addEventListener('abort', () => reject(requestSignal.reason), { once: true })
      started()
    }))
    const abort = new AbortController()
    const pending = remote.previewModelChange({ ...scope, modelId: '9' }, abort.signal)
    await reading
    abort.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect((await remote.getProjection(scope, signal)).branches[0]!.draft).toEqual(before)
  } finally { await host.dispose() }
})

it.each([null, {}, [null], [{ kind: 'lora', id: '3', label: 'Rain' }]])('rejects malformed model removal acknowledgements %j before saving', async confirmedRemovals => {
  const host = await createWorkbenchHostFixture()
  try {
    const { remote, catalog } = host
    const signal = new AbortController().signal
    const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal)
    const scope = { workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId! }
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'lora', id: '3' } }, signal)
    const before = (await remote.getProjection(scope, signal)).branches[0]!.draft
    restrictSelectedResources(catalog)

    await expect(remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '9', confirmedRemovals } }, signal)).rejects.toMatchObject({ details: { code: 'WORKBENCH_INVALID_INPUT', issues: [{ path: 'value.confirmedRemovals' }] } })
    expect((await remote.getProjection(scope, signal)).branches[0]!.draft).toEqual(before)
  } finally { await host.dispose() }
})

it('validates exact model preview requests and labelled removal results through the Remote codecs', () => {
  const descriptor = WORKBENCH_REMOTE.descriptors.find(item => item.method === 'previewModelChange')!
  const request = descriptor.parameters[0].codec.create()
  const result = descriptor.result.create()
  const scope = { workspaceId: 'workspace_1', workId: 'work_1', branchId: 'branch_1', modelId: '9' }
  expect(request.parse(scope)).toEqual(scope)
  for (const invalid of [{ ...scope, workId: undefined }, { ...scope, branchId: undefined }, { ...scope, modelId: undefined }, { ...scope, modelId: ' ' }, { ...scope, runId: 'run_1' }]) expect(() => request.parse(invalid)).toThrow()
  const preview = { model: { id: '9', label: 'paint.safetensors' }, removed: [{ kind: 'artist-string', id: '8', label: 'Garden artists' }] }
  expect(result.parse(preview)).toEqual(preview)
  for (const invalid of [{ ...preview, removed: [{ kind: 'model', id: '8', label: 'Wrong kind' }] }, { ...preview, removed: [{ kind: 'lora', id: '8' }] }, { ...preview, token: 'unused' }]) expect(() => result.parse(invalid)).toThrow()
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
    const value = descriptor.method === 'getProjection' ? projection() : descriptor.method === 'previewModelChange' ? { model: { id: '9', label: 'paint.safetensors' }, removed: [{ kind: 'style', id: '7', label: 'Watercolor' }] } : { workspaceId: 'workspace_1' }
    expect(codec.parse(JSON.parse(JSON.stringify(value)))).toEqual(value)
    for (const invalid of [null, [], 'result', 1, { value: Number.NaN }, { '': 'empty key' }]) expect(() => codec.parse(invalid)).toThrow()
  }
})

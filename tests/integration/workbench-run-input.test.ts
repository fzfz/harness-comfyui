import { saveFixtureDraft } from '../support/workbench-draft.ts'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { toGenerationRequest } from '../../src/cli/contract.ts'
import { createWorkbenchHostFixture } from '../support/workbench-host.ts'
import type { WorkbenchScope } from '../../src/workbench-remote.ts'
import { generationInputWithImages, taskDraftFromRunInput } from '../../src/workbench/validation.ts'
import { flattenWorkflowRuntimeParameters } from '../../src/generation/inspection-contract.ts'

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { registerGenerationMediaRoutes } from '../../src/host/generation/media-routes.ts'
import { GenerationRuntimeError, type GenerationTransport } from '../../src/host/generation/generation-runtime.ts'
import { SourceGenerationPreparer, type UiWorkflow } from '../../src/host/generation/source-preparer.ts'
import { ComfyWorkflowCompiler } from '../../src/host/generation/workflow-compiler.ts'
import { CatalogError } from '../../src/host/catalog/catalog-client.ts'
const signal = () => new AbortController().signal
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  try { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() }
  finally { vi.restoreAllMocks() }
})

async function fixture(...args: Parameters<typeof createWorkbenchHostFixture>) {
  const host = await createWorkbenchHostFixture(...args)
  cleanups.push(host.dispose)
  return { ...host, service: host.ctx.harnessComfyuiWorkbench.service }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

async function selectGeneration(host: Fixture, scope: WorkbenchScope) {
  await saveFixtureDraft(host.remote, { ...scope }, draft => { draft.generation_input.instance_id = '8' }, signal())
  for (const value of [{ kind: 'model', id: '2' }, { kind: 'comfyui-template', id: '5' }]) { await host.remote.mutate({ ...scope, type: 'resource-select', value }, signal())
  await saveFixtureDraft(host.remote, { ...scope }, () => {}, signal()) }
}

it('removes uploaded image parameters before inheriting a Run and rejects submission after its Workflow use is removed', async () => {
  const workflow: UiWorkflow = { version: 0.4, nodes: [
    { id: 1, type: 'LoadImage', mode: 0, inputs: [], outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [1] }], widgets_values: ['template-default.png'] },
    { id: 3, type: 'ImageScale', mode: 0, inputs: [{ name: 'image', type: 'IMAGE', link: 1 }], outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [2] }], widgets_values: ['nearest-exact', 768, 512, 'disabled'] },
    { id: 2, type: 'SaveImage', mode: 0, inputs: [{ name: 'images', type: 'IMAGE', link: 2 }], outputs: [], widgets_values: ['result'] },
  ], links: [[1, 1, 0, 3, 0, 'IMAGE'], [2, 3, 0, 2, 0, 'IMAGE']] }
  const compiler = new ComfyWorkflowCompiler({ fetchImplementation: async () => new Response(JSON.stringify({
    LoadImage: { input: { required: { image: [['template-default.png', 'previous-upload.png'], { image_upload: true }] } }, input_order: { required: ['image'], optional: [] }, output_node: false },
    ImageScale: { input: { required: { image: ['IMAGE'], upscale_method: [['nearest-exact'], {}], width: ['INT', { min: 1, max: 4096 }], height: ['INT', { min: 1, max: 4096 }], crop: [['disabled'], {}] } }, input_order: { required: ['image', 'upscale_method', 'width', 'height', 'crop'], optional: [] }, output_node: false },
    SaveImage: { input: { required: { images: ['IMAGE'], filename_prefix: ['STRING', {}] } }, input_order: { required: ['images', 'filename_prefix'], optional: [] }, output_node: true },
  })), officialApiWorkflowCompiler: { compile: async input => ({ apiWorkflow: input.runtimeProjection, cacheKey: 'image-reuse', cacheStatus: 'miss' }) } })
  const preparer = new SourceGenerationPreparer({ defaultInstanceId: '8', compiler, source: {
    readInstance: async id => ({ id, title: 'Target', url: 'http://comfy.test', credentialType: 'none', authorization: null }),
    readTemplate: async id => ({ id, title: 'Image template', workflow }),
  }, images: {
    resolve: async () => ({ filePath: '/controlled/image.png', filename: 'image.png', mediaType: 'image/png' }),
    upload: async () => ({ name: 'previous-upload.png', subfolder: '', type: 'input' }),
  } })
  const host = await fixture(preparer, {
    submit: async input => { input.onRequestStart(); return { promptId: input.promptId } },
    observe: async () => ({ status: 'error', outputs: [], error: { code: 'COMFYUI_REMOTE_ERROR', message: 'Controlled image run failure' } }), download: vi.fn(),
  })
  const selected = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Inherited Workflow image', goal: 'Keep image inputs explicit' } }, signal())
  await saveFixtureDraft(host.remote, selected, draft => { draft.generation_input.instance_id = '8'; draft.prompt_input = { positive_prompt: null, negative_prompt: null } }, signal())
  await host.remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'comfyui-template', id: '5' } }, signal())
  await saveFixtureDraft(host.remote, selected, () => {}, signal())
  const withoutImageReceipt = await host.remote.mutate({ ...selected, type: 'agent-action', id: 'parameters' }, signal())
  const withoutImageTask = host.store.getTask(withoutImageReceipt.taskId!)
  await expect(host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: withoutImageTask.task_id, artifact: { type: 'parameters', parameters: { width: 1024 } } }, { workspaceId: selected.workspaceId, sessionId: withoutImageTask.session_id!, turn: 1, callId: 'parameters-before-images' })).resolves.toMatchObject({ disposition: 'applied' })
  expect(host.store.getBranch(selected.branchId!).editing_draft?.generation_input.parameters.width).toBe(1024)
  await saveFixtureDraft(host.remote, selected, draft => {
    draft.generation_input.parameters.width = 768
    expect(draft.generation_input.parameters).not.toHaveProperty('reference_image')
    draft.image_refs = [{ image_ref_id: 'image-a', source: { kind: 'uploaded_file', file_id: 'file-a' }, purpose: 'both', reference_requirement: 'Keep the composition' }]
    draft.workflow_image_bindings = [{ parameter_id: 'reference_image', image_ref_ids: ['image-a'] }]
  }, signal())
  const taskReceipt = await host.remote.mutate({ ...selected, type: 'run' }, signal())
  const task = host.store.getTask(taskReceipt.taskId!)
  const submission = generationInputWithImages(task.input.generation_input, task.input)
  const accepted = await host.runtime.acceptGenerations({ workspaceId: selected.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'image-source' }, [{ requestId: randomUUID(), request: toGenerationRequest({ ...submission, instance_id: '8', template_id: '5' }) }], undefined, task.task_id)
  for (let phase = 0; phase < 3; phase += 1) await host.runtime.advance()
  const historical = await host.remote.getRunInput({ ...selected, workId: selected.workId!, runId: accepted.items[0]!.runId }, signal())
  expect(historical.effective_input?.parameters).toMatchObject({ reference_image: 'previous-upload.png', width: 768, height: 512 })
  expect(historical.image_uploads).toMatchObject([{ parameter_id: 'reference_image', name: 'previous-upload.png' }])
  expect(taskDraftFromRunInput(historical).generation_input.parameters).toEqual({ width: 768, height: 512 })
  const parameterReceipt = await host.remote.mutate({ ...selected, type: 'agent-action', id: 'parameters' }, signal())
  const parameterTask = host.store.getTask(parameterReceipt.taskId!)
  expect(parameterTask.output_contract.parameter_ids).not.toContain('reference_image')
  await expect(host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: parameterTask.task_id, artifact: { type: 'parameters', parameters: { width: 1024 } } }, { workspaceId: selected.workspaceId, sessionId: parameterTask.session_id!, turn: 1, callId: 'publish-width' })).resolves.toMatchObject({ disposition: 'applied' })
  const retried = await host.remote.mutate({ ...selected, type: 'retry', runId: historical.run_id }, signal())
  const retry = host.store.getTask(retried.taskId!)
  expect(retry.input.generation_input.parameters).toEqual({ width: 768, height: 512 })
  expect(retry.input.image_refs).toEqual(historical.image_refs)
  expect(retry.input.workflow_image_bindings).toEqual(historical.workflow_image_bindings)
  const child = await host.remote.mutate({ ...selected, type: 'create-branch', runId: historical.run_id, value: { name: 'Remove Workflow image', original_request: 'Use no Workflow image' } }, signal())
  await saveFixtureDraft(host.remote, child, draft => { draft.image_refs = draft.image_refs.map(image => ({ ...image, purpose: 'agent' })); draft.workflow_image_bindings = [] }, signal())
  const saved = host.store.getBranch(child.branchId!).draft
  expect(saved.generation_input.parameters).toEqual({ width: 768, height: 512 })
  const validate = vi.spyOn(host.runtime, 'validateGenerationRequest')
  await expect(host.remote.mutate({ ...child, type: 'run' }, signal())).rejects.toMatchObject({ details: { code: 'GENERATION_IMAGE_BINDING_REQUIRED', issues: [{ path: 'input.workflow_image_bindings.reference_image', message: expect.stringContaining('image_refs') }] } })
  expect(validate.mock.calls.at(-1)?.[0].parameters).toEqual({ width: 768, height: 512 })
  expect((await host.remote.getProjection(child, signal())).tasks.filter(value => value.branch_id === child.branchId)).toEqual([])
})

it('keeps fixed task images at the root and assembles them only for generation submission', async () => {
  const host = await fixture()
  const selected = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Image input', goal: 'Use an analysis image' } }, signal())
  await selectGeneration(host, selected)
  const images = [{ image_ref_id: 'image-a', source: { kind: 'uploaded_file' as const, file_id: 'file-a' }, purpose: 'agent' as const, reference_requirement: 'Retain the atmosphere' }]
  await saveFixtureDraft(host.remote, selected, draft => { draft.image_refs = images }, signal())
  const receipt = await host.remote.mutate({ ...selected, type: 'run' }, signal())
  const task = host.store.getTask(receipt.taskId!)
  expect(task.input.image_refs).toEqual(images)
  expect(task.input.generation_input).not.toHaveProperty('image_refs')
  expect(task.input.generation_input).not.toHaveProperty('workflow_image_bindings')
  const accepted = await host.runtime.acceptGenerations({ workspaceId: selected.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'submit-images' }, [{ requestId: randomUUID(), request: toGenerationRequest({ ...generationInputWithImages(task.input.generation_input, task.input), instance_id: task.input.generation_input.instance_id!, template_id: task.input.generation_input.template_id! }) }], undefined, task.task_id)
  const historical = await host.remote.getRunInput({ ...selected, workId: selected.workId!, runId: accepted.items[0]!.runId }, signal())
  expect(historical.submitted_input.image_refs).toEqual(images)
  expect(historical.image_refs).toEqual(images)
  const records = await host.remote.queryRecords({ type: 'run' }, signal())
  expect(records.find(record => record.id === historical.run_id)).toHaveProperty('base_model_id', '1')
  const child = await host.remote.mutate({ ...selected, type: 'create-branch', runId: historical.run_id, value: { name: 'Clear inherited images', original_request: 'Generate without images' } }, signal())
  const inherited = host.store.getBranch(child.branchId!).draft
  expect(inherited.image_refs).toEqual(images)
  expect(inherited.generation_input).not.toHaveProperty('image_refs')
  await saveFixtureDraft(host.remote, child, draft => { draft.image_refs = []; draft.workflow_image_bindings = [] }, signal())
  const clearedReceipt = await host.remote.mutate({ ...child, type: 'run' }, signal())
  const cleared = host.store.getTask(clearedReceipt.taskId!)
  expect(cleared.input.image_refs).toEqual([])
  expect(cleared.input.workflow_image_bindings).toEqual([])
  expect(cleared.input.generation_input).not.toHaveProperty('image_refs')
  const cleanSubmission = generationInputWithImages(cleared.input.generation_input, cleared.input)
  expect(cleanSubmission.image_refs).toEqual([])
  const cleanRun = await host.runtime.acceptGenerations({ workspaceId: child.workspaceId, sessionId: cleared.session_id!, turn: 1, callId: 'submit-cleared' }, [{ requestId: randomUUID(), request: toGenerationRequest({ ...cleanSubmission, instance_id: cleanSubmission.instance_id!, template_id: cleanSubmission.template_id! }) }], undefined, cleared.task_id)
  expect((await host.remote.getRunInput({ ...child, workId: child.workId!, runId: cleanRun.items[0]!.runId }, signal())).image_refs).toEqual([])
})

it('decodes absent stored mapping as null and leaves historical Branch and Task JSON unchanged', async () => {
  const host = await fixture()
  const selected = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Legacy JSON', goal: 'Retain saved bytes' } }, signal())
  await saveFixtureDraft(host.remote, selected, draft => { draft.base_model_id = '1' }, signal())
  const receipt = await host.remote.mutate({ ...selected, type: 'agent-action', id: 'prompt' }, signal())
  const saved = host.store.getTask(receipt.taskId!)
  const { parameter_mapping: taskMapping, ...oldInput } = saved.input
  oldInput.generation_input.parameters = { positive: 'Saved raw text', seed: 42, opaque: { values: [true, null, 'text'] } }
  const { parameter_mapping: branchMapping, ...oldDraft } = host.store.getBranch(selected.branchId!).draft
  oldDraft.generation_input = oldInput.generation_input
  const branchJson = JSON.stringify(oldDraft), taskJson = JSON.stringify(oldInput)
  host.database.prepare('UPDATE workbench_branches SET draft_json=? WHERE branch_id=?').run(branchJson, selected.branchId!)
  host.database.prepare('UPDATE workbench_tasks SET input_json=? WHERE task_id=?').run(taskJson, saved.task_id)
  expect(host.store.getBranch(selected.branchId!).draft.parameter_mapping).toBeNull()
  expect(host.store.getTask(saved.task_id).input.parameter_mapping).toBeNull()
  const result = await host.service.getTask({ taskId: saved.task_id }, { workspaceId: selected.workspaceId, sessionId: saved.session_id!, turn: 1, callId: 'read' })
  expect(result).toHaveProperty('unresolved_parameters', oldInput.generation_input.parameters)
  expect(result.generation_input.parameters).toEqual({})
  expect(host.database.prepare('SELECT draft_json FROM workbench_branches WHERE branch_id=?').get(selected.branchId!)).toEqual({ draft_json: branchJson })
  expect(host.database.prepare('SELECT input_json FROM workbench_tasks WHERE task_id=?').get(saved.task_id)).toEqual({ input_json: taskJson })
})

it.each([null, { positive_prompt: null, negative_prompt: null }, { positive_prompt: '', negative_prompt: '' }])('retains saved classification after clearing template and instance: %j', async promptInput => {
  const host = await fixture()
  const selected = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Clear resources', goal: 'Preserve snapshot source' } }, signal())
  await selectGeneration(host, selected)
  const branch = host.store.getBranch(selected.branchId!), draft = structuredClone(branch.draft)
  if (promptInput) draft.prompt_input = promptInput
  else draft.parameter_mapping = null
  draft.generation_input.parameters = { positive: 'Cached positive', negative: 'Cached negative', seed: 42, opaque: null }
  host.store.saveBranchDraft({ workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId!, expected: branch.draft, draft })
  await host.remote.mutate({ ...selected, type: 'resource-remove', value: 'comfyui-template' }, signal())
  await saveFixtureDraft(host.remote, { ...selected }, () => {}, signal())
  await saveFixtureDraft(host.remote, { ...selected }, draft => { draft.generation_input.instance_id = null }, signal())
  host.inspect.mockClear().mockRejectedValue(new Error('Cleared resources must not inspect'))
  const receipt = await host.remote.mutate({ ...selected, type: 'agent-action', id: 'prompt' }, signal())
  const task = host.store.getTask(receipt.taskId!)
  const result = await host.service.getTask({ taskId: task.task_id }, { workspaceId: selected.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'read' })
  expect(task.input.parameter_mapping).toEqual(draft.parameter_mapping)
  expect(task.input.generation_input.parameters).toEqual(draft.generation_input.parameters)
  expect(result.generation_input).toMatchObject({ instance_id: null, template_id: null, parameters: promptInput ? { seed: 42 } : {} })
  expect(result).toHaveProperty('unresolved_parameters', promptInput && promptInput.positive_prompt !== null ? { opaque: null } : promptInput ? { positive: 'Cached positive', negative: 'Cached negative', opaque: null } : draft.generation_input.parameters)
  expect(host.inspect).not.toHaveBeenCalled()
})

it.each([new Error('Unexpected inspection failure'), new DOMException('Cancelled inspection', 'AbortError'), new GenerationRuntimeError('COMFYUI_PROTOCOL_ERROR', 'Invalid definitions'), new GenerationRuntimeError('SOURCE_PROTOCOL_ERROR', 'Invalid source'), new GenerationRuntimeError('COMFYUI_REQUEST_CANCELED', 'Caller cancelled'), new GenerationRuntimeError('WORKFLOW_COMPILE_FAILED', 'Malformed workflow')])('propagates descriptor failures outside the unavailable metadata boundary: %s', async failure => {
  const host = await fixture()
  const selected = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Descriptor failure', goal: 'Expose original failure' } }, signal())
  await selectGeneration(host, selected)
  const branch = host.store.getBranch(selected.branchId!), draft = { ...branch.draft, parameter_mapping: null }
  host.store.saveBranchDraft({ workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId!, expected: branch.draft, draft })
  host.inspect.mockRejectedValue(failure)
  await expect(host.remote.mutate({ ...selected, type: 'agent-action', id: 'prompt' }, signal())).rejects.toBe(failure)
  expect(host.store.listTasks(selected.branchId!)).toEqual([])
  expect(host.store.getBranch(selected.branchId!).draft).toEqual(draft)
})

it('replaces every descriptor classification together with the template parameter bag', async () => {
  const host = await fixture()
  const selected = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Replace template', goal: 'Keep a single parameter source' } }, signal())
  await selectGeneration(host, selected)
  const original = host.store.getBranch(selected.branchId!).draft
  await saveFixtureDraft(host.remote, { ...selected }, draft => { draft.generation_input.parameters['steps'] = 28 }, signal())
  expect(host.store.getBranch(selected.branchId!).draft.parameter_mapping).toEqual(original.parameter_mapping)
  host.inspect.mockResolvedValue({ parameters: [{ parameter_id: 'opaque-slot', kind: 'positive_prompt', value_type: 'string', current_value: 'Replacement baseline' }, { parameter_id: 'opaque-control', kind: 'cfg', value_type: 'number', current_value: 6 }], size_candidates: [] })
  await host.remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'comfyui-template', id: '6' } }, signal())
  await saveFixtureDraft(host.remote, { ...selected }, () => {}, signal())
  const replaced = host.store.getBranch(selected.branchId!).draft
  expect(replaced.generation_input.parameters).toEqual({ 'opaque-slot': 'Replacement baseline', 'opaque-control': 6 })
  expect(replaced.parameter_mapping).toEqual({ 'opaque-slot': 'positive_prompt', 'opaque-control': 'cfg' })
  expect(replaced.prompt_input).toEqual(original.prompt_input)
})

it('preserves every raw JSON key for detached prompt work, including prototype-named parameter IDs', async () => {
  const host = await fixture()
  const selected = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Detached', goal: 'Keep all original JSON' } }, signal())
  const branch = host.store.getBranch(selected.branchId!), draft = structuredClone(branch.draft)
  draft.base_model_id = '1'
  draft.prompt_input = { positive_prompt: 'Human text', negative_prompt: '' }
  draft.generation_input.parameters = Object.fromEntries([['__proto__', { nested: [false, null, 'text', 0] }], ['constructor', 'opaque'], ['cfg', 7], ['positive_prompt', 'Cached']])
  host.store.saveBranchDraft({ workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId!, expected: branch.draft, draft })
  host.inspect.mockRejectedValue(new Error('Detached prompt work must not inspect'))
  const receipt = await host.remote.mutate({ ...selected, type: 'agent-action', id: 'prompt' }, signal())
  const task = host.store.getTask(receipt.taskId!)
  const result = await host.service.getTask({ taskId: task.task_id }, { workspaceId: selected.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'read' })
  expect(result.generation_input.parameters).toEqual({})
  expect(result).toHaveProperty('unresolved_parameters', draft.generation_input.parameters)
  expect(task.input.generation_input.parameters).toEqual(draft.generation_input.parameters)
  expect(host.inspect).not.toHaveBeenCalled()
})

it.each(['SOURCE_QUERY_FAILED', 'SOURCE_CONNECTION_FAILED', 'SOURCE_REQUEST_TIMEOUT', 'COMFYUI_CONNECTION_FAILED', 'COMFYUI_HTTP_ERROR'])('keeps an older draft complete when descriptor metadata is unavailable: %s', async code => {
  const host = await fixture()
  const selected = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Unavailable metadata', goal: 'Keep raw context' } }, signal())
  await selectGeneration(host, selected)
  const branch = host.store.getBranch(selected.branchId!), draft = structuredClone(branch.draft)
  draft.parameter_mapping = null
  draft.generation_input.parameters = { seed: 42, opaque: [null, false, { width: 1024 }], positive: 'Cached prompt' }
  host.store.saveBranchDraft({ workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId!, expected: branch.draft, draft })
  host.inspect.mockRejectedValue(new GenerationRuntimeError(code, 'Metadata unavailable'))
  const receipt = await host.remote.mutate({ ...selected, type: 'agent-action', id: 'prompt' }, signal())
  const task = host.store.getTask(receipt.taskId!)
  const result = await host.service.getTask({ taskId: task.task_id }, { workspaceId: selected.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'read' })
  expect(result.generation_input.parameters).toEqual({})
  expect(result).toHaveProperty('unresolved_parameters', draft.generation_input.parameters)
  expect(task.input.parameter_mapping).toBeNull()
})

it('carries saved Run descriptor kinds into branches and leaves undescribed Run sources unresolved', async () => {
  const host = await fixture()
  const selected = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Run source', goal: 'Preserve accepted inputs' } }, signal())
  await selectGeneration(host, selected)
  const { runId, task } = await acceptRun(host, selected)
  const branch = await host.remote.mutate({ ...selected, type: 'create-branch', runId, value: { name: 'Run child', original_request: 'Keep original input' } }, signal())
  const copied = host.store.getBranch(branch.branchId!)
  expect(copied.draft.parameter_mapping).toBeNull()
  const receipt = await host.remote.mutate({ ...branch, type: 'agent-action', id: 'prompt' }, signal())
  const rewrite = host.store.getTask(receipt.taskId!)
  expect(rewrite.input.generation_input).toEqual(task.input.generation_input)
  const input = await host.remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())
  expect(input.generation_input).toEqual(task.input.generation_input)
  expect(input.prompt_input).toEqual({ positive_prompt: null, negative_prompt: null })
})

it('freezes newly acquired descriptor kinds for an older draft and preserves opaque unresolved values', async () => {
  const host = await fixture()
  const selected = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Older draft', goal: 'Keep every source value' } }, signal())
  await selectGeneration(host, selected)
  const before = host.store.getBranch(selected.branchId!)
  const draft = structuredClone(before.draft)
  draft.parameter_mapping = null
  draft.prompt_input = { positive_prompt: '', negative_prompt: null }
  draft.generation_input.parameters = { positive: 'Baseline positive', negative: 'Baseline negative', seed: 0, steps: 20, unknown: { nested: [null, false, 7, 'text'] }, positive_prompt: 'An opaque name' }
  host.store.saveBranchDraft({ workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId!, expected: before.draft, draft })
  const receipt = await host.remote.mutate({ ...selected, type: 'agent-action', id: 'prompt' }, signal())
  const task = host.store.getTask(receipt.taskId!)
  const identity = { workspaceId: selected.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'snapshot' }
  const result = await host.service.getTask({ taskId: task.task_id }, identity)
  expect(result.generation_input.parameters).toEqual({ seed: 0, steps: 20 })
  expect(result).toHaveProperty('unresolved_parameters', { negative: 'Baseline negative', unknown: { nested: [null, false, 7, 'text'] }, positive_prompt: 'An opaque name' })
  expect(task.input.parameter_mapping).toMatchObject({ positive: 'positive_prompt', negative: 'negative_prompt', seed: 'seed', width: 'width', height: 'height' })
  host.inspect.mockResolvedValue({ parameters: [], size_candidates: [] })
  await saveFixtureDraft(host.remote, { ...selected }, draft => { draft.prompt_input.positive_prompt = 'Later edit' }, signal())
  expect(await host.service.getTask({ taskId: task.task_id }, identity)).toEqual(result)
  expect(host.store.getTask(task.task_id).input.generation_input.parameters).toEqual(draft.generation_input.parameters)
})

it('projects the captured Task 40 prompt snapshot without losing its stored template parameters', async () => {
  const host = await fixture()
  host.inspect.mockResolvedValue({ ...host.description, parameters: host.description.parameters.map((parameter, index) => index < 2 ? { ...parameter, current_value: index === 0 ? 'Batch02 positive baseline' : 'Batch02 negative baseline' } : parameter) })
  const selected = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Task 40', goal: 'Paint a greenhouse' } }, signal())
  await selectGeneration(host, selected)
  await saveFixtureDraft(host.remote, { ...selected }, draft => { draft.prompt_input.positive_prompt = 'Current greenhouse text' }, signal())
  await saveFixtureDraft(host.remote, { ...selected }, draft => { draft.prompt_input.negative_prompt = 'Current exclusion text' }, signal())
  const receipt = await host.remote.mutate({ ...selected, type: 'agent-action', id: 'prompt' }, signal())
  const task = host.store.getTask(receipt.taskId!)
  const raw = structuredClone(task.input.generation_input.parameters)
  const result = await host.service.getTask({ taskId: task.task_id }, { workspaceId: selected.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'snapshot' })
  expect(result.prompt_input).toEqual({ positive_prompt: 'Current greenhouse text', negative_prompt: 'Current exclusion text' })
  expect(result.generation_input.parameters).toEqual({ seed: 17, steps: 20, width: 512, height: 512 })
  expect(result).toHaveProperty('unresolved_parameters', {})
  expect(result).not.toHaveProperty('parameter_mapping')
  expect(host.store.getTask(task.task_id).input.generation_input.parameters).toEqual(raw)
  expect(raw).toMatchObject({ positive: 'Batch02 positive baseline', negative: 'Batch02 negative baseline' })
})

async function preparedFixture(transport?: GenerationTransport) {
  const description = { parameters: [
    { parameter_id: 'positive', kind: 'positive_prompt' as const, value_type: 'string' as const, current_value: '' },
    { parameter_id: 'negative', kind: 'negative_prompt' as const, value_type: 'string' as const, current_value: '' },
    { parameter_id: 'seed', kind: 'seed' as const, value_type: 'integer' as const, current_value: 17 },
  ], size_candidates: [] }
  return fixture({ inspectRuntimeParameters: async () => structuredClone(description), validateInput: async () => {},
    prepare: async request => ({ instanceId: '8', instanceTitle: 'Node', templateTitle: 'Template', sourceSnapshot: {},
      inputDescription: { ...description, parameters: description.parameters.map(parameter => ({ ...parameter, current_value: request.parameters[parameter.parameter_id] ?? parameter.current_value })) },
      actualWorkflow: { parameters: request.parameters }, apiWorkflow: { '3': { class_type: 'SaveImage', inputs: {} } }, expectedOutputNodeIds: ['3'], connection: { origin: 'http://comfy.test', url: 'http://comfy.test', authorization: null } }),
  }, transport)
}
async function acceptRun(host: Fixture, scope: WorkbenchScope, type: 'run' | 'experiment' | 'retry' = 'run', runId?: string) {
  const receipt = await host.remote.mutate({ ...scope, type, ...(runId ? { runId } : {}) }, signal())
  const task = (await host.remote.getProjection(scope, signal())).tasks.find(task => task.task_id === receipt.taskId)!
  const identity = { workspaceId: scope.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'submit' }
  const accepted = await host.runtime.acceptGenerations(identity, [{ requestId: randomUUID(), request: toGenerationRequest({ ...task.input.generation_input, instance_id: task.input.generation_input.instance_id!, template_id: task.input.generation_input.template_id! }) }], undefined, task.task_id)
  return { task, identity, runId: accepted.items[0]!.runId }
}

async function mediaServer(host: Fixture) {
  let handler!: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
  registerGenerationMediaRoutes({ runtime: host.runtime, webServer: { register(route) { handler = route.handler; return () => {} } },
    workspaceRegistry: host.ctx.workspaceRegistry, sessionPersistence: host.ctx.sessionPersistence, subagents: host.ctx.subagents,
  })
  const server = createServer((request, response) => { void handler(request, response) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  cleanups.push(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Media fixture address is missing')
  return `http://127.0.0.1:${address.port}`
}

it.each(['created', 'failed'])('reads a %s Run fixed input and Task context without a saved description or current Branch values', async stage => {
  const host = await fixture(), { remote } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Historical input', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, selected)
  await saveFixtureDraft(remote, { ...selected }, draft => { draft.prompt_input.positive_prompt = 'Historical rain' }, signal())
  const { task, runId } = await acceptRun(host, selected)
  if (stage === 'failed') await host.runtime.advance()
  await saveFixtureDraft(remote, { ...selected }, draft => { draft.prompt_input.positive_prompt = 'Current sunshine' }, signal())
  const before = (await remote.getProjection(selected, signal())).branches
  host.inspect.mockRejectedValue(new Error('Current template is unavailable'))
  const result = await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())
  expect(result).toMatchObject({ run_id: runId, branch_id: selected.branchId, generation_input: task.input.generation_input, image_refs: [], workflow_image_bindings: [], input_description: null, prompt_input: { positive_prompt: null, negative_prompt: null } })
  expect((await remote.getProjection(selected, signal())).branches).toEqual(before)
})

it('reads saved parameter kinds and prompts after the current template and model become unavailable', async () => {
  const description = { parameters: [
    { parameter_id: 'positive_prompt_9', kind: 'positive_prompt' as const, value_type: 'string' as const, current_value: 'Prepared rain' },
    { parameter_id: 'negative_prompt_10', kind: 'negative_prompt' as const, value_type: 'string' as const, current_value: 'blur' },
    { parameter_id: 'steps_4', kind: 'steps' as const, value_type: 'integer' as const, current_value: 24 },
  ], size_candidates: [] }
  const inspect = vi.fn(async () => structuredClone(description))
  const host = await fixture({
    inspectRuntimeParameters: inspect, validateInput: async () => {},
    prepare: async () => ({ instanceId: '8', instanceTitle: 'Node', templateTitle: 'Saved template', sourceSnapshot: { template: { id: '5' } }, inputDescription: description,
      actualWorkflow: { nodes: [], links: [] }, apiWorkflow: {}, expectedOutputNodeIds: [], connection: { origin: 'http://comfy.test', url: 'http://comfy.test', authorization: null } }),
  })
  const { remote } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Saved input', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, selected)
  await saveFixtureDraft(remote, { ...selected }, draft => { draft.prompt_input.positive_prompt = 'Prepared rain' }, signal())
  await saveFixtureDraft(remote, { ...selected }, draft => { draft.prompt_input.negative_prompt = 'blur' }, signal())
  const { task, runId } = await acceptRun(host, selected)
  await host.runtime.advance()
  inspect.mockRejectedValue(new Error('The current template has changed'))
  const deletedModel = new CatalogError('CATALOG_QUERY_FAILED', 'The model was deleted')
  host.catalog.resolveGenerationModel.mockRejectedValue(deletedModel)
  const result = await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())
  expect(result).toMatchObject({ run_id: runId, branch_id: selected.branchId, generation_input: task.input.generation_input, image_refs: [], workflow_image_bindings: [], input_description: description, prompt_input: { positive_prompt: 'Prepared rain', negative_prompt: 'blur' } })
  const imported = await remote.mutate({ ...selected, type: 'create-branch', runId, value: { name: 'Saved description child', original_request: 'Reuse saved input' } }, signal())
  const mapping = { positive_prompt_9: 'positive_prompt', negative_prompt_10: 'negative_prompt', steps_4: 'steps' }
  expect(host.store.getBranch(imported.branchId!).draft.parameter_mapping).toEqual(mapping)
  await expect(remote.mutate({ ...imported, type: 'agent-action', id: 'prompt' }, signal())).rejects.toBe(deletedModel)
  const rewriteReceipt = await remote.mutate({ ...imported, type: 'agent-action', id: 'resources' }, signal())
  const rewrite = host.store.getTask(rewriteReceipt.taskId!)
  const rewriteInput = await host.service.getTask({ taskId: rewrite.task_id }, { workspaceId: selected.workspaceId, sessionId: rewrite.session_id!, turn: 1, callId: 'read' })
  expect(rewriteInput.generation_input.parameters).toEqual({ steps_4: 24 })
  expect(rewriteInput).toHaveProperty('unresolved_parameters', {})
  await host.runtime.advance()
  const review = host.store.getRunReviewDraft(runId)
  await remote.mutate({ ...selected, type: 'evaluate', runId, value: { expected: review, draft: { ...review, title: 'Saved setup', conditions: 'Use saved descriptors', note: 'Reuse exact input' }, saveExperience: true } }, signal())
  const experience = host.store.listExperiences(selected.workId!)[0]!
  const reused = await remote.mutate({ ...selected, type: 'reuse', id: experience.experience_id, value: { name: 'Saved experience child', baseModelId: null } }, signal())
  expect(host.store.getBranch(reused.branchId!).draft).toMatchObject({ parameter_mapping: mapping, generation_input: task.input.generation_input, prompt_input: result.prompt_input })
  expect((await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())).generation_input).toEqual(task.input.generation_input)
})

it.each([{ kind: 'run', maxRuns: 1 }, { kind: 'experiment', maxRuns: 1 }, { kind: 'experiment', maxRuns: 3 }] as const)('keeps an unknown $kind submission as attention without submitting it again: budget=$maxRuns', async ({ kind, maxRuns }) => {
  const description = { parameters: [{ parameter_id: 'positive', kind: 'positive_prompt' as const, value_type: 'string' as const, current_value: '' }], size_candidates: [] }
  const submit = vi.fn(async (input: { onRequestStart(): boolean }) => {
    input.onRequestStart()
    throw new Error('Connection dropped after submission')
  })
  const host = await fixture({ inspectRuntimeParameters: async () => description, validateInput: async () => {},
    prepare: async () => ({ instanceId: '8', instanceTitle: 'Node', templateTitle: 'Template', inputDescription: description, sourceSnapshot: {}, actualWorkflow: {}, apiWorkflow: {}, expectedOutputNodeIds: [], connection: { origin: 'http://comfy.test', url: 'http://comfy.test', authorization: null } }),
  }, { submit, observe: vi.fn(), download: vi.fn() })
  const { remote, runtime } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Unknown submission', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, selected)
  await remote.mutate({ ...selected, type: 'update-execution', field: 'max_runs', value: maxRuns }, signal())
  const { task, runId, identity } = await acceptRun(host, selected, kind)
  await runtime.advance()
  await runtime.advance()
  const projection = await remote.getProjection(selected, signal())
  expect(projection.runs).toEqual([expect.objectContaining({ run_id: runId, status: 'submission_unknown', error: { code: 'COMFYUI_SUBMISSION_RESULT_UNKNOWN', message: expect.any(String) } })])
  expect(projection.tasks.find(item => item.task_id === task.task_id)?.status).toBe('needs_attention')
  await runtime.advance()
  expect(submit).toHaveBeenCalledOnce()
  if (kind === 'experiment') {
    await host.service.publish({ taskId: task.task_id, artifact: { type: 'review', observation: 'Submission unconfirmed', conclusion: 'Wait for confirmation', run_ids: [runId] } }, { ...identity, callId: 'unknown-review' })
    await host.service.publish({ taskId: task.task_id, artifact: { type: 'generation_input', generation_input: task.input.generation_input, image_refs: [], workflow_image_bindings: [] } }, { ...identity, callId: 'unknown-candidate' })
    const reviewed = await remote.getProjection(selected, signal())
    expect(reviewed.tasks.find(item => item.task_id === task.task_id)?.status).toBe('needs_attention')
    expect(reviewed.experiments.find(item => item.task_id === task.task_id)?.control_state).toBe('running')
  }
  await expect(runtime.acceptGenerations(identity, [{ requestId: randomUUID(), request: toGenerationRequest({ ...task.input.generation_input, instance_id: '8', template_id: '5' }) }], undefined, task.task_id)).rejects.toMatchObject({ code: kind === 'run' || maxRuns === 1 ? 'WORKBENCH_BUDGET_EXHAUSTED' : 'WORKBENCH_ITERATION_INCOMPLETE' })
  expect((await remote.getProjection(selected, signal())).runs).toHaveLength(1)
})

it('creates a Run child under the Run owning branch while browsing a sibling branch', async () => {
  const host = await preparedFixture(), { remote } = host
  const root = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Root', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, root)
  const source = await remote.mutate({ ...root, type: 'create-branch', value: { name: 'Source branch', original_request: 'Source requirements' } }, signal())
  await saveFixtureDraft(remote, { ...source }, draft => { draft.prompt_input.positive_prompt = 'Source run rain' }, signal())
  const { task, runId } = await acceptRun(host, source)
  await host.runtime.advance()
  await saveFixtureDraft(remote, { ...source }, draft => { draft.prompt_input.positive_prompt = 'Later parent edit' }, signal())
  const sibling = await remote.mutate({ ...root, type: 'create-branch', value: { name: 'Sibling', original_request: 'Sibling requirements' } }, signal())
  const before = (await remote.getProjection(root, signal())).branches
  const fork = await remote.mutate({ ...sibling, type: 'create-branch', runId, value: { name: 'Run fork', original_request: 'New exploration' } }, signal())
  const after = await remote.getProjection({ workspaceId: root.workspaceId, workId: root.workId }, signal())
  expect(after.branches.find(branch => branch.branch_id === fork.branchId)).toMatchObject({ parent_branch_id: source.branchId, source_run_id: runId, original_request: 'New exploration', draft: { generation_input: task.input.generation_input, prompt_input: { positive_prompt: 'Source run rain', negative_prompt: '' } } })
  expect(after.branches.filter(branch => branch.branch_id !== fork.branchId)).toEqual(before)
  expect((await remote.getProjection(fork, signal())).runs).toEqual([])
  expect(after.runs.map(run => run.run_id)).toEqual([runId])
})

it('returns Work Runs in global creation order when experiment iterations interleave with another Task', async () => {
  const time = vi.spyOn(Date, 'now').mockReturnValue(1000)
  const host = await fixture(), { remote, runtime, service } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Run timeline', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, selected)
  const experiment = await acceptRun(host, selected, 'experiment')
  await runtime.advance()
  time.mockReturnValue(2000)
  const single = await acceptRun(host, selected)
  time.mockReturnValue(3000)
  await service.publish({ taskId: experiment.task.task_id, artifact: { type: 'review', observation: 'Instance unavailable', conclusion: 'Try again', run_ids: [experiment.runId] } }, { ...experiment.identity, callId: 'review' })
  await service.publish({ taskId: experiment.task.task_id, artifact: { type: 'generation_input', generation_input: experiment.task.input.generation_input, image_refs: [], workflow_image_bindings: [] } }, { ...experiment.identity, callId: 'candidate' })
  const second = await runtime.acceptGenerations(experiment.identity, [{ requestId: randomUUID(), request: toGenerationRequest({ ...experiment.task.input.generation_input, instance_id: '8', template_id: '5' }) }], undefined, experiment.task.task_id)
  const projection = await remote.getProjection({ workspaceId: selected.workspaceId, workId: selected.workId }, signal())
  expect(projection.runs.map(run => run.run_id)).toEqual([experiment.runId, single.runId, second.items[0]!.runId])
})

it('projects every real worker stage and routes each Run media while retaining a download failure', async () => {
  const description = { parameters: [{ parameter_id: 'positive', kind: 'positive_prompt' as const, value_type: 'string' as const, current_value: '' }], size_candidates: [] }
  const started = deferred(), release = deferred()
  const promptIndexes = new Map<string, number>(), observations = new Map<string, number>()
  const bytes = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]), Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 2])]
  const transport: GenerationTransport = {
    submit: async input => {
      input.onRequestStart()
      const index = promptIndexes.size
      promptIndexes.set(input.promptId, index)
      if (index === 0) { started.resolve(); await release.promise }
      return { promptId: input.promptId }
    },
    observe: async input => {
      const count = observations.get(input.promptId) ?? 0
      observations.set(input.promptId, count + 1)
      return count === 0 ? { status: 'running', outputs: [] } : { status: 'success', outputs: [{ nodeId: '3', outputIndex: 0, mediaKind: 'image', filename: `output-${promptIndexes.get(input.promptId)}.png`, subfolder: '', type: 'output' }] }
    },
    download: async input => {
      if (input.output.filename === 'output-2.png') throw new GenerationRuntimeError('COMFYUI_HTTP_ERROR', 'Media download failed with HTTP 503')
      return { bytes: bytes[input.output.filename === 'output-0.png' ? 0 : 1]!, mediaType: 'image/png' }
    },
  }
  const host = await fixture({ inspectRuntimeParameters: async () => description, validateInput: async () => {},
    prepare: async () => ({ instanceId: '8', instanceTitle: 'Node', templateTitle: 'Template', inputDescription: description, sourceSnapshot: {}, actualWorkflow: {}, apiWorkflow: { '3': { class_type: 'SaveImage', inputs: {} } }, expectedOutputNodeIds: ['3'], connection: { origin: 'http://comfy.test', url: 'http://comfy.test', authorization: null } }),
  }, transport)
  const { remote, runtime } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Lifecycle', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, selected)
  const first = await acceptRun(host, selected)
  const status = async (runId: string) => (await remote.getProjection(selected, signal())).runs.find(run => run.run_id === runId)!.status
  expect(await status(first.runId)).toBe('created')
  await runtime.advance()
  expect(await status(first.runId)).toBe('prepared')
  const submitting = runtime.advance()
  await started.promise
  expect(await status(first.runId)).toBe('submitting')
  release.resolve()
  await submitting
  expect(await status(first.runId)).toBe('remote_pending')
  for (const expected of ['remote_running', 'downloading', 'succeeded']) { await runtime.advance(); expect(await status(first.runId)).toBe(expected) }
  const second = await acceptRun(host, selected)
  for (let phase = 0; phase < 5; phase += 1) await runtime.advance()
  const third = await acceptRun(host, selected)
  for (let phase = 0; phase < 5; phase += 1) await runtime.advance()
  const projection = await remote.getProjection(selected, signal())
  expect(new Set(projection.runs.map(run => run.run_id)).size).toBe(3)
  expect(projection.runs.find(run => run.run_id === third.runId)).toMatchObject({ status: 'failed', media: [], error: { code: 'COMFYUI_HTTP_ERROR', message: 'Media download failed with HTTP 503' } })
  const origin = await mediaServer(host)
  for (const [index, item] of [first, second].entries()) {
    const media = projection.runs.find(run => run.run_id === item.runId)!.media[0]!
    expect(media.run_id).toBe(item.runId)
    const response = await fetch(origin + media.url)
    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes[index])
    const invalid = new URL(origin + media.url)
    invalid.searchParams.set('session_id', third.task.session_id!)
    expect((await fetch(invalid)).status).toBe(200)
  }
  expect((await remote.getProjection(selected, signal())).runs).toHaveLength(3)
  const media = projection.runs.find(run => run.run_id === first.runId)!.media[0]!
  host.store.setFavorite({ workspaceId: selected.workspaceId, targetType: 'run', targetId: first.runId, favorite: true })
  const favorites = await remote.queryRecords({ type: 'favorite' }, signal())
  expect(favorites).toMatchObject([{ type: 'run', id: first.runId, run: { media: [{ media_id: media.media_id, url: expect.any(String), download_url: expect.any(String) }] } }])
  const favoriteImage = await fetch(origin + favorites[0]!.run!.media[0]!.url)
  expect(new Uint8Array(await favoriteImage.arrayBuffer())).toEqual(bytes[0])
  await saveFixtureDraft(remote, selected, draft => {
    draft.image_refs = [{ image_ref_id: 'result-reference', source: { kind: 'run_media', run_id: first.runId, media_id: media.media_id }, purpose: 'agent', reference_requirement: 'Compare the generated image' }]
  }, signal())
  const referenced = await remote.mutate({ ...selected, type: 'agent-action', id: 'prompt' }, signal())
  expect(host.store.getTask(referenced.taskId!).input.image_refs).toMatchObject([{ source: { run_id: first.runId, media_id: media.media_id } }])
  const experience = host.store.saveExperience({ title: 'Image evidence', conditions: 'Use completed output', note: 'Retain Run ownership', provenance: { created_by_task_id: referenced.taskId!, evidence: [{ run_id: first.runId, generation_task_id: null, role: 'supporting_evidence' }] } })
  expect(experience.evidence_run_ids).toEqual([first.runId])
  expect(experience.provenance).toEqual({ created_by_task_id: referenced.taskId!, evidence: [{ run_id: first.runId, generation_task_id: first.task.task_id, role: 'supporting_evidence' }] })
  const destination = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_2', value: { name: 'Cross-work input', goal: 'Reuse the completed Run' } }, signal())
  const inherited = await remote.mutate({ ...destination, type: 'create-branch', runId: first.runId, value: { name: 'Imported Run', original_request: 'Keep source settings' } }, signal())
  expect(host.store.getBranch(inherited.branchId!)).toMatchObject({ work_id: destination.workId, parent_branch_id: destination.branchId, source_run_id: first.runId })
})

it('shares the original candidate context between task iterations and Run input reads', async () => {
  const host = await fixture(), { remote, runtime, service } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Candidate context', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, selected)
  const source = await acceptRun(host, selected, 'experiment')
  await runtime.advance()
  await service.publish({ taskId: source.task.task_id, artifact: { type: 'review', observation: 'Failed preparation', conclusion: 'Try a candidate', run_ids: [source.runId] } }, { ...source.identity, callId: 'review' })
  const input = { ...source.task.input.generation_input, parameters: { ...source.task.input.generation_input.parameters, positive: 'Candidate prompt' } }
  await service.publish({ taskId: source.task.task_id, artifact: { type: 'generation_input', generation_input: input, image_refs: [], workflow_image_bindings: [] } }, { ...source.identity, callId: 'candidate' })
  const accepted = await runtime.acceptGenerations(source.identity, [{ requestId: randomUUID(), request: toGenerationRequest({ ...input, instance_id: '8', template_id: '5' }) }], undefined, source.task.task_id)
  const runId = accepted.items[0]!.runId
  const result = await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())
  const task = await service.getTask({ taskId: source.task.task_id }, source.identity)
  expect(result).toMatchObject({ generation_input: input, image_refs: [], workflow_image_bindings: [], input_description: null, prompt_input: { positive_prompt: null, negative_prompt: null } })
  expect(task.iterations.find(item => item.run_id === runId)?.image_refs).toEqual(result.image_refs)
})

it.each(['workspace_1', 'workspace_2'])('reads historical input from another Work in %s', async workspaceId => {
  const host = await fixture(), { remote } = host
  const source = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Source', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, source)
  const { runId } = await acceptRun(host, source)
  const other = await remote.mutate({ type: 'new-work', workspaceId, value: { name: 'Other', goal: 'Paint snow' } }, signal())
  expect(await remote.getRunInput({ workspaceId, workId: other.workId!, runId }, signal())).toMatchObject({ run_id: runId, branch_id: source.branchId })
  expect((await remote.getProjection(other, signal())).runs).toEqual([])
})

it('rejects incomplete generation input before creating a Task or Run and retains the draft', async () => {
  const host = await fixture(), { remote } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Incomplete input', goal: 'Paint rain' } }, signal())
  await saveFixtureDraft(remote, { ...selected }, draft => { draft.prompt_input.positive_prompt = 'Retained prompt' }, signal())
  const before = await remote.getProjection(selected, signal())
  await expect(remote.mutate({ ...selected, type: 'run' }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_TEMPLATE_REQUIRED' } })
  const after = await remote.getProjection(selected, signal())
  expect(after.branches).toEqual(before.branches)
  expect(after.tasks).toEqual([])
  expect(after.runs).toEqual([])
})

it('keeps each experimental Run complete when its candidate changes template, resources and all generation parameters', async () => {
  const baseControls = {
    positive_prompt: ['STRING', 'Initial rain'],
    negative_prompt: ['STRING', 'Initial blur'],
    width: ['INT', 768], height: ['INT', 1024], seed: ['INT', 17], steps: ['INT', 20],
    cfg: ['FLOAT', 5], sampler_name: ['STRING', 'euler'], scheduler: ['STRING', 'normal'],
    batch_size: ['INT', 1], reference_image: ['STRING', 'first.png'],
  } as const
  const workflow = (second: boolean): UiWorkflow => {
    const controls = second ? { ...baseControls, denoise: ['FLOAT', 1] as const } : baseControls
    const names = ['source', 'ckpt_name', 'lora_name', 'strength_model', 'width', 'height']
    return { version: 0.4, nodes: [
      { id: 1, type: 'ImageProducer', mode: 0, inputs: names.map(name => ({ name, type: 'COMBO', link: null, widget: { name } })), outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [11] }], widgets_values: ['source.png', 'old.safetensors', 'old-lora.safetensors', 0.3, 768, 1024] },
      ...Object.entries(controls).filter(([name]) => name !== 'width' && name !== 'height').map(([name, [type, value]], index) => ({ id: 10 + index, type: 'Control_' + name, title: name, mode: 0, inputs: [{ name, type, link: null, widget: { name } }], outputs: [], widgets_values: [value] })),
      { id: 3, type: 'SaveImage', mode: 0, inputs: [{ name: 'images', type: 'IMAGE', link: 11 }, { name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } }], outputs: [], widgets_values: ['output'] },
    ], links: [[11, 1, 0, 3, 0, 'IMAGE']] }
  }
  const definitions = Object.fromEntries(Object.entries({ ...baseControls, denoise: ['FLOAT', 1] as const }).map(([name, [type]]) => [
    'Control_' + name, { input: { required: { [name]: [type, {}] } }, input_order: { required: [name], optional: [] }, output_node: false },
  ]))
  const source = {
    readTemplate: vi.fn(async (id: string) => ({ id, title: 'Template ' + id, workflow: workflow(id === '6') })),
    readInstance: vi.fn(async (id: string) => ({ id, title: 'Node ' + id, url: 'http://comfy.test', credentialType: 'none' as const, authorization: null })),
  }
  const compiled: Record<string, unknown>[] = []
  const compiler = new ComfyWorkflowCompiler({ fetchImplementation: async () => new Response(JSON.stringify({
    ...definitions,
    ImageProducer: { input: { required: { source: ['STRING', {}], ckpt_name: [['models/paint.safetensors', 'models/second.safetensors'], {}], lora_name: [['loras/rain.safetensors', 'loras/snow.safetensors'], {}], strength_model: ['FLOAT', {}], width: ['INT', {}], height: ['INT', {}] } }, input_order: { required: ['source', 'ckpt_name', 'lora_name', 'strength_model', 'width', 'height'], optional: [] }, output_node: false },
    SaveImage: { input: { required: { images: ['IMAGE'], filename_prefix: ['STRING', {}] } }, input_order: { required: ['images', 'filename_prefix'], optional: [] }, output_node: true },
  })), officialApiWorkflowCompiler: { compile: async input => {
    compiled.push(structuredClone(input.runtimeProjection))
    return { apiWorkflow: input.runtimeProjection, cacheKey: 'experimental-input-fixture', cacheStatus: 'miss' }
  } } })
  const host = await fixture(new SourceGenerationPreparer({ defaultInstanceId: '8', source, compiler, images: {
    resolve: async () => ({ filePath: '/controlled/candidate.png', filename: 'candidate.png', mediaType: 'image/png' }),
    upload: async () => ({ name: 'second.png', subfolder: '', type: 'input' }),
  } }), {
    submit: async input => { input.onRequestStart(); return { promptId: input.promptId } },
    observe: async () => ({ status: 'error', outputs: [], error: { code: 'COMFYUI_REMOTE_ERROR', message: 'Controlled generation failure' } }), download: vi.fn(),
  })
  const { remote, runtime, service } = host
  host.catalog.resolveGenerationModel.mockImplementation(async id => ({ id, file_name: id === '4' ? 'second.safetensors' : 'paint.safetensors', base_model_id: '1' }))
  host.catalog.resolveLora.mockImplementation(async id => ({ id, file_name: id === '6' ? 'snow.safetensors' : 'rain.safetensors', weight: 0.65, trigger_words: ['rain'] }))
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Complete rounds', goal: 'Compare generation conditions' } }, signal())
  await selectGeneration(host, selected)
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'lora', id: '3' } }, signal())
  await saveFixtureDraft(remote, { ...selected }, () => {}, signal())
  const initial = await acceptRun(host, selected, 'experiment')
  for (let phase = 0; phase < 3; phase += 1) await runtime.advance()
  const first = await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId: initial.runId }, signal())
  expect(first.input_description?.parameters.map(parameter => parameter.parameter_id)).not.toContain('denoise')
  await service.publish({ taskId: initial.task.task_id, artifact: { type: 'review', observation: 'First conditions failed', conclusion: 'Change all conditions', run_ids: [initial.runId] } }, { ...initial.identity, callId: 'review-all' })
  const candidate = { ...initial.task.input.generation_input, title: 'Second conditions', instance_id: '9', template_id: '6',
    model: { id: '4', file_name: 'second.safetensors' }, loras: [{ id: '6', file_name: 'snow.safetensors', weight: 0.9, trigger_words: ['snow'] }],
    parameters: { positive_prompt: 'Second snow', negative_prompt: 'Second blur', width: 1024, height: 768, seed: 42, steps: 31, cfg: 7, sampler_name: 'lcm', scheduler: 'simple', denoise: 0.7, batch_size: 2 },
  }
  const candidateImages = { image_refs: [{ image_ref_id: 'candidate-image', source: { kind: 'uploaded_file' as const, file_id: 'file-candidate' }, purpose: 'workflow' as const, reference_requirement: '' }], workflow_image_bindings: [{ parameter_id: 'reference_image', image_ref_ids: ['candidate-image'] }] }
  const published = await service.publish({ taskId: initial.task.task_id, artifact: { type: 'generation_input', generation_input: candidate, ...candidateImages } }, { ...initial.identity, callId: 'candidate-all' })
  const accepted = await runtime.acceptGenerations(initial.identity, [{ requestId: randomUUID(), request: toGenerationRequest({ ...generationInputWithImages(candidate, candidateImages), instance_id: '9', template_id: '6' }) }], undefined, initial.task.task_id)
  const runId = accepted.items[0]!.runId
  await runtime.advance()
  const second = await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())
  expect(second).toMatchObject({ generation_input: { ...candidate, parameters: { ...candidate.parameters, reference_image: 'second.png' } }, ...candidateImages, prompt_input: { positive_prompt: 'Second snow', negative_prompt: 'Second blur' } })
  expect(flattenWorkflowRuntimeParameters(second.input_description!)).toEqual(expect.arrayContaining(Object.entries(candidate.parameters).map(([parameter_id, current_value]) => expect.objectContaining({ parameter_id, current_value }))))
  expect(compiled.at(-1)?.['1']).toMatchObject({ inputs: { ckpt_name: 'models/second.safetensors', lora_name: 'loras/snow.safetensors', strength_model: 0.9 } })
  expect(source.readTemplate).toHaveBeenCalledWith('6', expect.any(AbortSignal))
  expect(source.readInstance).toHaveBeenCalledWith('9', expect.any(AbortSignal))
  const projection = await remote.getProjection(selected, signal())
  expect(projection.runs.find(run => run.run_id === runId)).toMatchObject({ generation_input: candidate, candidate_artifact_id: published.artifact_id })
  expect(projection.tasks.find(task => task.task_id === initial.task.task_id)?.input).toEqual(initial.task.input)
  source.readTemplate.mockRejectedValue(new Error('The templates are unavailable'))
  expect(await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId: initial.runId }, signal())).toEqual(first)
  expect(await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())).toEqual(second)
})

it('persists the real compiler description through Source preparation and Runtime for historical Remote reads', async () => {
  const workflow: UiWorkflow = { version: 0.4, nodes: [
    { id: 1, type: 'ImageProducer', mode: 0, inputs: [], outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [11] }], widgets_values: ['source.png'] },
    { id: 40, type: 'Seed (rgthree)', mode: 0, inputs: [], outputs: [{ name: 'SEED', type: 'INT', links: [] }], widgets_values: [-1], widgets_values_named: { seed: -1 } },
    { id: 2, type: 'CLIPTextEncode', mode: 0, inputs: [{ name: 'clip', type: 'CLIP', link: 10 }, { name: 'text', type: 'STRING', link: null, widget: { name: 'text' } }], outputs: [], widgets_values: ['Template positive'] },
    { id: 3, type: 'SaveImage', mode: 0, inputs: [{ name: 'images', type: 'IMAGE', link: 11 }, { name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } }], outputs: [], widgets_values: ['output'] },
  ], links: [[10, 1, 0, 2, 0, 'CLIP'], [11, 1, 0, 3, 0, 'IMAGE']] }
  const source = { readTemplate: vi.fn(async () => ({ id: '5', title: 'Archived template', workflow })), readInstance: vi.fn(async (id: string) => ({ id, title: 'Node', url: 'http://comfy.test', credentialType: 'none' as const, authorization: null })) }
  const fetchDefinitions = vi.fn(async () => new Response(JSON.stringify({
    ImageProducer: { input: { required: { source: ['STRING', {}] } }, input_order: { required: ['source'], optional: [] }, output_node: false },
    'Seed (rgthree)': { input: { required: { seed: ['INT', { default: 0, min: -1125899906842624, max: 1125899906842624 }] } }, input_order: { required: ['seed'], optional: [] }, output_node: false },
    CLIPTextEncode: { input: { required: { clip: ['CLIP'], text: ['STRING', {}] } }, input_order: { required: ['clip', 'text'], optional: [] }, output_node: false },
    SaveImage: { input: { required: { images: ['IMAGE'], filename_prefix: ['STRING', {}] } }, input_order: { required: ['images', 'filename_prefix'], optional: [] }, output_node: true },
  })))
  const compiler = new ComfyWorkflowCompiler({ createRandomSeed: () => 38_521_047, fetchImplementation: fetchDefinitions, officialApiWorkflowCompiler: { compile: async input => ({ apiWorkflow: input.runtimeProjection, cacheKey: 'historical-input-fixture', cacheStatus: 'miss' }) } })
  const host = await fixture(new SourceGenerationPreparer({ defaultInstanceId: '8', source, compiler })), { remote } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Compiled history', goal: 'Paint rain' } }, signal())
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal())
  await saveFixtureDraft(remote, { ...selected }, () => {}, signal())
  await remote.mutate({ ...selected, type: 'resource-remove', value: 'model' }, signal())
  await saveFixtureDraft(remote, { ...selected }, () => {}, signal())
  await saveFixtureDraft(remote, { ...selected }, draft => { draft.generation_input.instance_id = '8' }, signal())
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'comfyui-template', id: '5' } }, signal())
  await saveFixtureDraft(remote, { ...selected }, () => {}, signal())
  await saveFixtureDraft(remote, { ...selected }, draft => { draft.prompt_input.positive_prompt = 'Historical effective prompt' }, signal())
  await saveFixtureDraft(remote, { ...selected }, draft => { draft.generation_input.parameters['seed'] = -1 }, signal())
  const { runId } = await acceptRun(host, selected)
  await host.runtime.advance()
  source.readTemplate.mockRejectedValue(new Error('The template is deleted'))
  fetchDefinitions.mockRejectedValue(new Error('The instance is offline'))
  const result = await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())
  expect(result.prompt_input).toEqual({ positive_prompt: 'Historical effective prompt', negative_prompt: null })
  expect(result.input_description?.parameters).toEqual(expect.arrayContaining([
    expect.objectContaining({ parameter_id: 'positive_prompt', kind: 'positive_prompt', current_value: 'Historical effective prompt' }),
    expect.objectContaining({ parameter_id: 'seed', kind: 'seed', current_value: 38_521_047 }),
  ]))
  expect(result.generation_input.parameters.seed).toBe(-1)
  expect(result.generation_input.parameters.positive_prompt).toBe('Historical effective prompt')
})

it('retries a failed later candidate with its saved prompts, model, context and exact generation input', async () => {
  const host = await preparedFixture({ submit: async input => { input.onRequestStart(); return { promptId: input.promptId } }, observe: async () => ({ status: 'error', outputs: [], error: { code: 'COMFYUI_REMOTE_ERROR', message: 'Controlled generation failure' } }), download: vi.fn() })
  const { remote, runtime, service } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Candidate retry', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, selected)
  await saveFixtureDraft(remote, { ...selected }, draft => { draft.prompt_input.positive_prompt = 'Initial rain' }, signal())
  const source = await acceptRun(host, selected, 'experiment')
  for (let phase = 0; phase < 3; phase += 1) await runtime.advance()
  await service.publish({ taskId: source.task.task_id, artifact: { type: 'review', observation: 'First failure', conclusion: 'Try snow', run_ids: [source.runId] } }, { ...source.identity, callId: 'review' })
  host.catalog.resolveGenerationModel.mockImplementation(async id => ({ id, file_name: 'paint.safetensors', base_model_id: id === '4' ? '9' : '1' }))
  const candidate = { ...source.task.input.generation_input, model: { id: '4', file_name: 'paint.safetensors' }, parameters: { positive: 'Candidate snow', negative: 'mist', seed: 31 } }
  await service.publish({ taskId: source.task.task_id, artifact: { type: 'generation_input', generation_input: candidate, image_refs: [], workflow_image_bindings: [] } }, { ...source.identity, callId: 'candidate' })
  const accepted = await runtime.acceptGenerations(source.identity, [{ requestId: randomUUID(), request: toGenerationRequest({ ...candidate, instance_id: '8', template_id: '5' }) }], undefined, source.task.task_id)
  const runId = accepted.items[0]!.runId
  for (let phase = 0; phase < 3; phase += 1) await runtime.advance()
  const failed = (await remote.getProjection(selected, signal())).runs.find(run => run.run_id === runId)!
  const retried = await acceptRun(host, selected, 'retry', runId)
  expect(retried.task.input).toMatchObject({ generation_input: candidate, prompt_input: { positive_prompt: 'Candidate snow', negative_prompt: 'mist' }, base_model_id: '9', image_refs: [], workflow_image_bindings: [] })
  const after = await remote.getProjection(selected, signal())
  expect(after.runs.find(run => run.run_id === retried.runId)).toMatchObject({ workbench_task_id: retried.task.task_id, retry_of_run_id: runId, generation_input: candidate })
  expect(after.runs.find(run => run.run_id === runId)).toEqual(failed)
})

it.each([true, false])('copies a described Run input when Catalog metadata is unavailable: explicit model=%s', async explicitModel => {
  const host = await preparedFixture(), { remote } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Archived resources', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, selected)
  if (!explicitModel) await remote.mutate({ ...selected, type: 'resource-remove', value: 'model' }, signal())
  await saveFixtureDraft(remote, { ...selected }, () => {}, signal())
  await saveFixtureDraft(remote, { ...selected }, draft => { draft.prompt_input.positive_prompt = 'Archived rain' }, signal())
  const { task, runId } = await acceptRun(host, selected)
  await host.runtime.advance()
  host.catalog.resolveGenerationModel.mockRejectedValue(new CatalogError('CATALOG_PROTOCOL_ERROR', 'Model record no longer exists'))
  host.catalog.resolveTemplate.mockRejectedValue(new Error('Current template is unavailable'))
  const created = await remote.mutate({ ...selected, type: 'create-branch', runId, value: { name: 'Copied source', original_request: 'Keep the archived input' } }, signal())
  const branch = (await remote.getProjection(created, signal())).branches.find(branch => branch.branch_id === created.branchId)!
  expect(branch.draft).toMatchObject({ generation_input: task.input.generation_input, prompt_input: { positive_prompt: 'Archived rain', negative_prompt: '' }, base_model_id: '1' })
})

it('copies fixed model classification without querying a current Catalog record', async () => {
  const host = await preparedFixture(), { remote } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Fixed classification', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, selected)
  const { runId } = await acceptRun(host, selected)
  await host.runtime.advance()
  host.catalog.resolveGenerationModel.mockReset().mockRejectedValue(new Error('Current Catalog is unavailable'))
  const created = await remote.mutate({ ...selected, type: 'create-branch', runId, value: { name: 'Copied branch', original_request: 'Copy the source' } }, signal())
  const branch = (await remote.getProjection(created, signal())).branches.find(branch => branch.branch_id === created.branchId)!
  expect(branch.draft.base_model_id).toBe('1')
  expect(host.catalog.resolveGenerationModel).not.toHaveBeenCalled()
  expect((await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())).run_id).toBe(runId)
})

it('keeps eight independent Run identities and their own Task provenance for identical fixed input', async () => {
  const host = await fixture(), { remote, runtime } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Run cards', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, selected)
  const accepted = []
  for (let index = 0; index < 8; index += 1) accepted.push(await acceptRun(host, selected))
  const projection = await remote.getProjection(selected, signal())
  expect(new Set(projection.runs.map(run => run.run_id)).size).toBe(8)
  for (const item of accepted) {
    expect(projection.runs.find(run => run.run_id === item.runId)).toMatchObject({ workbench_task_id: item.task.task_id, initiator: 'human', retry_of_run_id: null, generation_input: item.task.input.generation_input })
    expect(projection.tasks.find(task => task.task_id === item.task.task_id)?.binding_snapshot).toEqual(item.task.binding_snapshot)
  }
  const source = accepted[0]!
  await expect(runtime.acceptGenerations(source.identity, [{ requestId: randomUUID(), request: toGenerationRequest({ ...source.task.input.generation_input, instance_id: '8', template_id: '5' }) }], undefined, source.task.task_id)).rejects.toMatchObject({ code: 'WORKBENCH_BUDGET_EXHAUSTED' })
  expect((await remote.getProjection(selected, signal())).runs).toHaveLength(8)
})
async function undescribedCandidateFixture() {
  const host = await fixture(), { remote, runtime, service } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Unmapped candidate', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, selected)
  await saveFixtureDraft(remote, { ...selected }, draft => { draft.prompt_input.positive_prompt = 'Initial rain' }, signal())
  const source = await acceptRun(host, selected, 'experiment')
  await runtime.advance()
  await service.publish({ taskId: source.task.task_id, artifact: { type: 'review', observation: 'Prepare failed', conclusion: 'Use candidate', run_ids: [source.runId] } }, { ...source.identity, callId: 'review' })
  const candidate = { ...source.task.input.generation_input, parameters: { positive: 'Candidate snow', negative: 'Candidate mist', seed: 31, opaque: { keep: true } } }
  await service.publish({ taskId: source.task.task_id, artifact: { type: 'generation_input', generation_input: candidate, image_refs: [], workflow_image_bindings: [] } }, { ...source.identity, callId: 'candidate' })
  const accepted = await runtime.acceptGenerations(source.identity, [{ requestId: randomUUID(), request: toGenerationRequest({ ...candidate, instance_id: '8', template_id: '5' }) }], undefined, source.task.task_id)
  const runId = accepted.items[0]!.runId
  await runtime.advance()
  return { host, selected, source, candidate, runId }
}

it('retries and branches an undescribed later candidate without borrowing Task prompts or current template defaults', async () => {
  const { host, selected, candidate, runId } = await undescribedCandidateFixture()
  const { remote } = host
  const before = await remote.getProjection(selected, signal())
  const sourceRun = before.runs.find(run => run.run_id === runId)!
  host.inspect.mockClear().mockRejectedValue(new Error('Current template description is unavailable'))
  const historical = await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())
  expect(historical.prompt_input).toEqual({ positive_prompt: null, negative_prompt: null })
  const retried = await acceptRun(host, selected, 'retry', runId)
  expect(retried.task.input).toMatchObject({ generation_input: candidate, prompt_input: { positive_prompt: null, negative_prompt: null }, image_refs: [], workflow_image_bindings: [] })
  const created = await remote.mutate({ ...selected, type: 'create-branch', runId, value: { name: 'Raw candidate branch', original_request: 'Keep all candidate inputs' } }, signal())
  const branch = (await remote.getProjection(created, signal())).branches.find(branch => branch.branch_id === created.branchId)!
  expect(branch).toMatchObject({ parent_branch_id: selected.branchId, source_run_id: runId, draft: { generation_input: candidate, prompt_input: { positive_prompt: null, negative_prompt: null }, image_refs: [], workflow_image_bindings: [] } })
  const copiedRun = await acceptRun(host, created)
  expect(copiedRun.task.input.generation_input).toEqual(candidate)
  expect(host.inspect).not.toHaveBeenCalled()
  const after = await remote.getProjection(selected, signal())
  expect(after.runs.find(run => run.run_id === runId)).toEqual(sourceRun)
  expect(after.branches.find(item => item.branch_id === selected.branchId)).toEqual(before.branches.find(item => item.branch_id === selected.branchId))
})

it.each(['positive_prompt', 'negative_prompt'] as const)('projects only an explicitly edited %s slot, including an explicit empty string', async kind => {
  const { host, selected, candidate, runId } = await undescribedCandidateFixture()
  const { remote, service } = host
  const created = await remote.mutate({ ...selected, type: 'create-branch', runId, value: { name: 'Edit one slot', original_request: 'Keep untouched raw values' } }, signal())
  for (const value of ['Edited candidate prompt', '']) {
    await saveFixtureDraft(remote, { ...created }, draft => { draft.prompt_input[kind as 'positive_prompt' | 'negative_prompt'] = value as never }, signal())
    const branch = (await remote.getProjection(created, signal())).branches.find(item => item.branch_id === created.branchId)!
    expect(branch.draft.prompt_input).toEqual({ positive_prompt: null, negative_prompt: null, [kind]: value })
    expect(branch.draft.generation_input).toEqual(candidate)
    const submitted = await acceptRun(host, created)
    expect(submitted.task.input.generation_input).toEqual({ ...candidate, parameters: { ...candidate.parameters, [kind === 'positive_prompt' ? 'positive' : 'negative']: value } })
    expect((await service.getTask({ taskId: submitted.task.task_id }, submitted.identity)).prompt_input).toEqual(branch.draft.prompt_input)
  }
  expect((await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())).generation_input).toEqual(candidate)
})
it.each(['positive_prompt', 'negative_prompt'] as const)('applies an Agent Prompt artifact with only %s resolved and preserves the other raw slot', async kind => {
  const { host, selected, candidate, runId } = await undescribedCandidateFixture()
  const { remote, service } = host
  const created = await remote.mutate({ ...selected, type: 'create-branch', runId, value: { name: 'Agent edits one slot', original_request: 'Keep unresolved input' } }, signal())
  const receipt = await remote.mutate({ ...created, type: 'agent-action', id: 'prompt' }, signal())
  const task = (await remote.getProjection(created, signal())).tasks.find(item => item.task_id === receipt.taskId)!
  const identity = { workspaceId: created.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'prompt' }
  const fixed = await service.getTask({ taskId: task.task_id }, identity)
  expect(fixed.prompt_input).toEqual({ positive_prompt: null, negative_prompt: null })
  const artifact = { type: 'prompt', ...fixed.prompt_input, [kind]: '' }
  const published = await service.publish({ taskId: task.task_id, artifact }, identity)
  expect(published.disposition).toBe('applied')
  const result = await service.getTask({ taskId: task.task_id }, identity)
  expect(result.artifacts).toEqual([{ task_id: task.task_id, artifact_id: published.artifact_id, artifact, disposition: 'applied' }])
  const branch = (await remote.getProjection(created, signal())).branches.find(item => item.branch_id === created.branchId)!
  expect(branch.editing_draft?.prompt_input).toEqual({ positive_prompt: null, negative_prompt: null, [kind]: '' })
  await saveFixtureDraft(remote, created, () => {}, signal())
  const submitted = await acceptRun(host, created)
  expect(submitted.task.input.generation_input).toEqual({ ...candidate, parameters: { ...candidate.parameters, [kind === 'positive_prompt' ? 'positive' : 'negative']: '' } })
})

it('preserves edited unknown input when its canonical Prompt slot has no available parameter mapping', async () => {
  const { host, selected, runId } = await undescribedCandidateFixture()
  const { remote } = host
  const created = await remote.mutate({ ...selected, type: 'create-branch', runId, value: { name: 'Missing mapping', original_request: 'Keep my edit' } }, signal())
  await saveFixtureDraft(remote, { ...created }, draft => { draft.prompt_input.positive_prompt = 'Edited positive' }, signal())
  const before = await remote.getProjection(created, signal())
  host.inspect.mockResolvedValue({ parameters: [], size_candidates: [] })
  await expect(remote.mutate({ ...created, type: 'run' }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_PROMPT_PARAMETER_REQUIRED' } })
  const after = await remote.getProjection(created, signal())
  expect(after.branches).toEqual(before.branches)
  expect(after.tasks).toEqual(before.tasks)
  expect(after.runs).toEqual([])
})
it('preserves null Prompt edits and rejects nontext values before changing the draft', async () => {
  const { host, selected, runId } = await undescribedCandidateFixture()
  const { remote } = host
  const created = await remote.mutate({ ...selected, type: 'create-branch', runId, value: { name: 'Nullable edit', original_request: 'Keep unknown distinct from empty' } }, signal())
  await saveFixtureDraft(remote, { ...created }, draft => { draft.prompt_input.positive_prompt = null }, signal())
  const before = await remote.getProjection(created, signal())
  expect(before.branches.find(item => item.branch_id === created.branchId)!.draft.prompt_input).toEqual({ positive_prompt: null, negative_prompt: null })
  await expect(saveFixtureDraft(remote, { ...created }, draft => { draft.prompt_input.negative_prompt = 123 as never }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_INVALID_INPUT' } })
  expect((await remote.getProjection(created, signal())).branches).toEqual(before.branches)
})
it('compiles an unmapped opaque candidate again through Run branch and raw retry without requiring an inspection', async () => {
  const workflow: UiWorkflow = { version: 0.4, nodes: [
    { id: 1, type: 'ImageProducer', mode: 0, inputs: [], outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [11] }], widgets_values: ['source.png'] },
    { id: 2, type: 'CLIPTextEncode', mode: 0, inputs: [{ name: 'clip', type: 'CLIP', link: 10 }, { name: 'text', type: 'STRING', link: null, widget: { name: 'text' } }], outputs: [], widgets_values: ['Template positive'] },
    { id: 3, type: 'SaveImage', mode: 0, inputs: [{ name: 'images', type: 'IMAGE', link: 11 }, { name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } }], outputs: [], widgets_values: ['output'] },
  ], links: [[10, 1, 0, 2, 0, 'CLIP'], [11, 1, 0, 3, 0, 'IMAGE']] }
  const opaqueWorkflow: UiWorkflow = { ...workflow, nodes: [...workflow.nodes, {
    id: 45, type: 'UnpublishedContractNode', mode: 0, inputs: [{ name: 'sampler_name', type: 'UNPUBLISHED_VALUE', link: null, widget: { name: 'sampler_name' } }], outputs: [], widgets_values: [{ a: 1, b: [2] }],
  }] }
  const source = {
    readTemplate: async (id: string) => ({ id, title: id === '6' ? 'Opaque template' : 'Plain template', workflow: id === '6' ? opaqueWorkflow : workflow }),
    readInstance: async (id: string) => ({ id, title: 'Node', url: 'http://comfy.test', credentialType: 'none' as const, authorization: null }),
  }
  const compiler = new ComfyWorkflowCompiler({ fetchImplementation: async () => new Response(JSON.stringify({
    ImageProducer: { input: { required: { source: ['STRING', {}] } }, input_order: { required: ['source'], optional: [] }, output_node: false },
    CLIPTextEncode: { input: { required: { clip: ['CLIP'], text: ['STRING', {}] } }, input_order: { required: ['clip', 'text'], optional: [] }, output_node: false },
    SaveImage: { input: { required: { images: ['IMAGE'], filename_prefix: ['STRING', {}] } }, input_order: { required: ['images', 'filename_prefix'], optional: [] }, output_node: true },
    UnpublishedContractNode: { input: { required: { sampler_name: ['UNPUBLISHED_VALUE', {}] } }, input_order: { required: ['sampler_name'], optional: [] }, output_node: false },
  })), officialApiWorkflowCompiler: { compile: async input => ({ apiWorkflow: input.runtimeProjection, cacheKey: 'opaque-candidate-fixture', cacheStatus: 'miss' }) } })
  const host = await fixture(new SourceGenerationPreparer({ defaultInstanceId: '8', source, compiler }), {
    submit: async input => { input.onRequestStart(); return { promptId: input.promptId } },
    observe: async () => ({ status: 'error', outputs: [], error: { code: 'COMFYUI_REMOTE_ERROR', message: 'Controlled generation failure' } }), download: vi.fn(),
  })
  const { remote, runtime, service } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Opaque candidate history', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, selected)
  await remote.mutate({ ...selected, type: 'resource-remove', value: 'model' }, signal())
  await saveFixtureDraft(remote, { ...selected }, () => {}, signal())
  const initial = await acceptRun(host, selected, 'experiment')
  for (let phase = 0; phase < 3; phase += 1) await runtime.advance()
  await service.publish({ taskId: initial.task.task_id, artifact: { type: 'review', observation: 'First run failed', conclusion: 'Try opaque template', run_ids: [initial.runId] } }, { ...initial.identity, callId: 'review' })
  const candidate = { ...initial.task.input.generation_input, template_id: '6', parameters: { positive_prompt: 'Opaque candidate snow', sampler_name: { b: [2], a: 1 } } }
  await service.publish({ taskId: initial.task.task_id, artifact: { type: 'generation_input', generation_input: candidate, image_refs: [], workflow_image_bindings: [] } }, { ...initial.identity, callId: 'candidate' })
  const accepted = await runtime.acceptGenerations(initial.identity, [{ requestId: randomUUID(), request: toGenerationRequest({ ...candidate, instance_id: '8' }) }], undefined, initial.task.task_id)
  const runId = accepted.items[0]!.runId
  for (let phase = 0; phase < 3; phase += 1) await runtime.advance()
  const fixed = await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())
  expect(fixed).toMatchObject({ generation_input: candidate, input_description: null, prompt_input: { positive_prompt: null, negative_prompt: null } })
  const before = (await remote.getProjection(selected, signal())).runs.find(run => run.run_id === runId)!
  const created = await remote.mutate({ ...selected, type: 'create-branch', runId, value: { name: 'Opaque branch', original_request: 'Keep opaque parameters' } }, signal())
  const fromBranch = await acceptRun(host, created)
  await runtime.advance()
  const retry = await acceptRun(host, selected, 'retry', runId)
  await runtime.advance()
  const after = await remote.getProjection({ workspaceId: selected.workspaceId, workId: selected.workId }, signal())
  for (const copied of [fromBranch, retry]) {
    expect(copied.task.input).toMatchObject({ generation_input: candidate, prompt_input: { positive_prompt: null, negative_prompt: null }, image_refs: fixed.image_refs })
    expect(after.runs.find(run => run.run_id === copied.runId)).toMatchObject({ status: copied === fromBranch ? 'remote_pending' : 'prepared', generation_input: candidate })
    expect((await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId: copied.runId }, signal())).input_description).toBeNull()
  }
  expect(after.runs.find(run => run.run_id === runId)).toEqual(before)
})
it('reuses an undescribed experience through the source Run branch with fixed raw input', async () => {
  const { host, selected, candidate, runId } = await undescribedCandidateFixture()
  const { remote } = host
  const before = await remote.getProjection(selected, signal())
  const review = before.runs.find(run => run.run_id === runId)!.review_draft!
  await remote.mutate({ ...selected, type: 'evaluate', runId, value: { expected: review, draft: { ...review, title: 'Opaque source setup', conditions: 'Keep raw input', note: 'Repeat source setup' }, saveExperience: true } }, signal())
  const experience = (await remote.getProjection(selected, signal())).experiences[0]!
  const sibling = await remote.mutate({ ...selected, type: 'create-branch', value: { name: 'Browsing sibling', original_request: 'Other input' } }, signal())
  host.inspect.mockClear().mockRejectedValue(new Error('The current template is unavailable'))
  host.catalog.resolveGenerationModel.mockRejectedValue(new CatalogError('CATALOG_QUERY_FAILED', 'The current model catalog is unavailable'))
  host.catalog.details.mockRejectedValue(new CatalogError('CATALOG_QUERY_FAILED', 'The current resource catalog is unavailable'))
  const reused = await remote.mutate({ ...sibling, type: 'reuse', id: experience.experience_id, value: { name: 'Opaque recheck', baseModelId: '1' } }, signal())
  const after = await remote.getProjection(reused, signal())
  expect(after.branches.find(branch => branch.branch_id === reused.branchId)).toMatchObject({
    name: 'Opaque recheck', original_request: 'Paint rain', parent_branch_id: selected.branchId, source_run_id: runId, source_experience_id: experience.experience_id,
    draft: { parameter_mapping: null, base_model_id: '1', generation_input: candidate, image_refs: [], workflow_image_bindings: [], prompt_input: { positive_prompt: null, negative_prompt: null } },
  })
  expect(host.inspect).not.toHaveBeenCalled()
  expect((await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())).generation_input).toEqual(candidate)
})

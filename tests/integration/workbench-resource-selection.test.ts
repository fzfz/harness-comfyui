import { randomUUID } from 'node:crypto'
import Schema from '@deepseek-ai/schemastery'
import { WORKBENCH_REMOTE } from '../../src/workbench-remote.ts'
import { taskGetResultSchema } from '../../src/workbench/schema.ts'
import { afterEach, expect, it } from 'vitest'
import { createWorkbenchHostFixture } from '../support/workbench-host.ts'
import { saveFixtureDraft } from '../support/workbench-draft.ts'
import { toGenerationRequest } from '../../src/cli/contract.ts'
import { generationInputWithImages } from '../../src/workbench/validation.ts'

const cleanups: (() => Promise<void>)[] = []
const signal = () => new AbortController().signal
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function fixture() {
  const host = await createWorkbenchHostFixture()
  cleanups.push(host.dispose)
  host.official.controller.prompt.mockImplementation(host.official.acceptPrompt)
  const scope = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Resource snapshots', goal: 'Use selected artists' } }, signal())
  await saveFixtureDraft(host.remote, scope, draft => { draft.generation_input.instance_id = '8' }, signal())
  for (const value of [{ kind: 'model', id: '2' }, { kind: 'comfyui-template', id: '5' }]) await host.remote.mutate({ ...scope, type: 'resource-select', value }, signal())
  await saveFixtureDraft(host.remote, scope, () => {}, signal())
  return { ...host, scope, service: host.ctx.harnessComfyuiWorkbench.service }
}

it('round trips actual Run and task resource results through their public result schemas', async () => {
  const host = await fixture(), { scope } = host
  await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'style', id: '7' } }, signal())
  await saveFixtureDraft(host.remote, scope, () => {}, signal())
  const receipt = await host.remote.mutate({ ...scope, type: 'run' }, signal())
  const task = host.store.getTask(receipt.taskId!)
  const identity = { workspaceId: scope.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'schema-run' }
  const accepted = await host.runtime.acceptGenerations(identity, [{ requestId: randomUUID(), request: toGenerationRequest({ ...generationInputWithImages(task.input.generation_input, task.input), instance_id: '8', template_id: '5' }) }], undefined, task.task_id)
  const input = await host.remote.getRunInput({ ...scope, workId: scope.workId!, runId: accepted.items[0]!.runId }, signal())
  const codec = WORKBENCH_REMOTE.descriptors.find(descriptor => descriptor.method === 'getRunInput')!.result.create()
  expect(codec.parse(input)).toEqual(input)
  expect(input.prompt_resource_refs).toEqual([{ kind: 'style', id: '7' }])
  const result = await host.service.getTask({ taskId: task.task_id }, identity)
  expect(Schema.resolve(result, taskGetResultSchema, {})[0]).toEqual(result)
  expect(result.iterations[0]!.prompt_resource_refs).toEqual([{ kind: 'style', id: '7' }])
})

it.each(['changed', 'deleted'])('retries the fixed Run resource snapshots after Catalog records are %s', async state => {
  const host = await fixture(), { scope } = host
  await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'style', id: '7' } }, signal())
  await saveFixtureDraft(host.remote, scope, () => {}, signal())
  const receipt = await host.remote.mutate({ ...scope, type: 'run' }, signal())
  const task = host.store.getTask(receipt.taskId!)
  const identity = { workspaceId: scope.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'retry-source' }
  const accepted = await host.runtime.acceptGenerations(identity, [{ requestId: randomUUID(), request: toGenerationRequest({ ...generationInputWithImages(task.input.generation_input, task.input), instance_id: '8', template_id: '5' }) }], undefined, task.task_id)
  await host.runtime.advance()
  const details = host.catalog.details.getMockImplementation()!
  host.catalog.details.mockImplementation(async (ref, requestSignal) => {
    if (state === 'deleted') throw new Error('Catalog record was deleted')
    const record = await details(ref, requestSignal)
    return { ...record, item: { ...record.item, label: 'Changed resource' } }
  })
  const retried = await host.remote.mutate({ ...scope, type: 'retry', runId: accepted.items[0]!.runId }, signal())
  const retry = host.store.getTask(retried.taskId!)
  expect(retry.input.prompt_resource_refs).toEqual(task.input.prompt_resource_refs)
  expect(retry.input.selected_resources).toEqual(task.input.selected_resources)
})

it('keeps an associated candidate without snapshots empty instead of borrowing the parent resources', async () => {
  const host = await fixture(), { scope } = host
  await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'style', id: '7' } }, signal())
  await saveFixtureDraft(host.remote, scope, () => {}, signal())
  const receipt = await host.remote.mutate({ ...scope, type: 'experiment' }, signal())
  const parent = host.store.getTask(receipt.taskId!)
  const identity = { workspaceId: scope.workspaceId, sessionId: parent.session_id!, turn: 1, callId: 'historical-experiment' }
  const input = { ...generationInputWithImages(parent.input.generation_input, parent.input), instance_id: '8', template_id: '5' }
  const first = await host.runtime.acceptGenerations(identity, [{ requestId: randomUUID(), request: toGenerationRequest(input) }], undefined, parent.task_id)
  await host.runtime.advance()
  host.store.publish(parent.task_id, { type: 'review', run_ids: [first.items[0]!.runId], observation: 'Recorded failure', conclusion: 'Try the saved candidate' }, { ...identity, callId: 'historical-review' })
  host.store.publish(parent.task_id, { type: 'generation_input', generation_input: { ...parent.input.generation_input, title: 'Historical candidate' } }, { ...identity, callId: 'historical-candidate' })
  const second = await host.runtime.acceptGenerations(identity, [{ requestId: randomUUID(), request: toGenerationRequest({ ...input, title: 'Historical candidate' }) }], undefined, parent.task_id)
  expect(parent.input.selected_resources).not.toEqual([])
  const historical = await host.remote.getRunInput({ ...scope, workId: scope.workId!, runId: second.items[0]!.runId }, signal())
  expect(historical.selected_resources).toEqual([])
  const fork = await host.remote.mutate({ ...scope, type: 'create-branch', runId: historical.run_id, value: { name: 'Historical empty resources', original_request: 'Reuse the historical input' } }, signal())
  expect(host.store.getBranch(fork.branchId!).draft.prompt_resource_refs).toEqual([])
})

it('adopts prompt resource recommendations into the editing draft and preserves LoRA weights', async () => {
  const host = await fixture(), { scope } = host
  await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'lora', id: '3' } }, signal())
  await saveFixtureDraft(host.remote, scope, draft => { draft.generation_input.loras[0]!.weight = 0.37 }, signal())
  const receipt = await host.remote.mutate({ ...scope, type: 'agent-action', id: 'resources' }, signal())
  const task = host.store.getTask(receipt.taskId!)
  const refs = [{ kind: 'lora', id: '3' }, { kind: 'style', id: '7' }, { kind: 'artist-string', id: '7' }, { kind: 'character', id: '7' }, { kind: 'work', id: '7' }, { kind: 'prompt-term', id: '7' }]
  const publication = await host.service.publish({ taskId: task.task_id, artifact: { type: 'resources', refs } }, { workspaceId: scope.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'recommend-resources' })
  const branch = host.store.getBranch(scope.branchId!)
  await host.remote.mutate({ ...scope, type: 'task-apply', id: publication.artifact_id, value: branch.editing_draft ?? branch.draft }, signal())
  const editing = host.store.getBranch(scope.branchId!).editing_draft!
  expect(editing.prompt_resource_refs).toEqual(refs.slice(1))
  expect(editing.generation_input.loras[0]!.weight).toBe(0.37)
  expect(host.store.getBranch(scope.branchId!).draft.prompt_resource_refs).toEqual([])
  await host.remote.mutate({ ...scope, type: 'resource-remove', value: 'style', id: '7' }, signal())
  expect(host.store.getBranch(scope.branchId!).editing_draft!.prompt_resource_refs).toEqual(refs.slice(2))
})

it('keeps delegated prompt input fixed when the selected Catalog record changes', async () => {
  const host = await fixture(), { scope } = host
  await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'style', id: '7' } }, signal())
  await saveFixtureDraft(host.remote, scope, () => {}, signal())
  const receipt = await host.remote.mutate({ ...scope, type: 'experiment' }, signal())
  const parent = host.store.getTask(receipt.taskId!)
  const details = host.catalog.details.getMockImplementation()!
  host.catalog.details.mockImplementation(async (ref, requestSignal) => {
    const result = await details(ref, requestSignal)
    return { ...result, item: { ...result.item, label: 'Changed artist' } }
  })
  Object.assign(host.ctx.subagents, { startActivation: async () => ({ result: Promise.resolve({ stopReason: 'completed' }), dispose: async () => {} }), resolveMaxDepth: () => 1 })
  const child = await host.service.delegateFunction({ task_id: parent.task_id, function_id: 'prompt', instructions: 'Use the selected style', source: { type: 'initial' }, reference_artifact_ids: [] }, { workspaceId: scope.workspaceId, sessionId: parent.session_id!, turn: 1, callId: 'delegate-prompt' })
  expect(host.store.getTask(child.task_id).input.selected_resources).toEqual(parent.input.selected_resources)
  const promptTurn = host.store.listPromptTurns(child.task_id)[0]!
  expect(promptTurn.input.reference_context.selected_resources).toEqual(parent.input.selected_resources)
  expect(promptTurn.request_text).toContain('Watercolor')
  expect(promptTurn.request_text).not.toContain('Changed artist')
})

it('records candidate prompt resources and reuses the candidate snapshot for its Run', async () => {
  const host = await fixture(), { scope } = host
  await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'style', id: '7' } }, signal())
  await saveFixtureDraft(host.remote, scope, () => {}, signal())
  const receipt = await host.remote.mutate({ ...scope, type: 'experiment' }, signal())
  const parent = host.store.getTask(receipt.taskId!)
  const identity = { workspaceId: scope.workspaceId, sessionId: parent.session_id!, turn: 1, callId: 'experiment' }
  const input = { ...generationInputWithImages(parent.input.generation_input, parent.input), instance_id: '8', template_id: '5' }
  const first = await host.runtime.acceptGenerations(identity, [{ requestId: randomUUID(), request: toGenerationRequest(input) }], undefined, parent.task_id)
  await host.runtime.advance()
  await host.service.publish({ taskId: parent.task_id, artifact: { type: 'review', run_ids: [first.items[0]!.runId], observation: 'Controlled failure', conclusion: 'Change the artist resources' } }, { ...identity, callId: 'review-first' })
  const candidate = await host.service.publish({ taskId: parent.task_id, artifact: { type: 'generation_input', generation_input: { ...parent.input.generation_input, title: 'Second artist selection' }, prompt_resource_refs: [{ kind: 'artist-string', id: '9' }], selected_resources: [] } }, { ...identity, callId: 'candidate-second' })
  const stored = host.store.getArtifact(candidate.artifact_id).artifact
  if (stored.type !== 'generation_input') throw new Error('Expected generation candidate')
  expect(stored.selected_resources).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'artist-string', id: '9', fields: expect.objectContaining({ artist_string: '@artist' }) })]))
  expect(stored.selected_resources).not.toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'style', id: '7' })]))
  const second = await host.runtime.acceptGenerations(identity, [{ requestId: randomUUID(), request: toGenerationRequest({ ...input, title: 'Second artist selection' }) }], undefined, parent.task_id)
  const historical = await host.remote.getRunInput({ ...scope, workId: scope.workId!, runId: second.items[0]!.runId }, signal())
  expect(historical.selected_resources).toEqual(stored.selected_resources)
  const original = await host.remote.getRunInput({ ...scope, workId: scope.workId!, runId: first.items[0]!.runId }, signal())
  expect(original.selected_resources).toEqual(parent.input.selected_resources)
  const fork = await host.remote.mutate({ ...scope, type: 'create-branch', runId: historical.run_id, value: { name: 'Candidate resources', original_request: 'Use this Run artist selection' } }, signal())
  expect(host.store.getBranch(fork.branchId!).draft.prompt_resource_refs).toEqual([{ kind: 'artist-string', id: '9' }])
})

it('freezes saved prompt resources in tasks and reuses each Run snapshot after the branch changes', async () => {
  const host = await fixture(), { scope } = host
  await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'style', id: '7' } }, signal())
  await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'artist-string', id: '7' } }, signal())
  await saveFixtureDraft(host.remote, scope, () => {}, signal())
  const receipt = await host.remote.mutate({ ...scope, type: 'run' }, signal())
  const task = host.store.getTask(receipt.taskId!)
  expect(task.input.prompt_resource_refs).toEqual([{ kind: 'style', id: '7' }, { kind: 'artist-string', id: '7' }])
  expect(task.input.selected_resources).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'style', id: '7', name: 'Watercolor', fields: expect.objectContaining({ prompt_text: 'prompt' }) }),
    expect.objectContaining({ kind: 'artist-string', id: '7', name: 'Garden artists', fields: expect.objectContaining({ artist_string: '@artist' }) }),
  ]))
  const accepted = await host.runtime.acceptGenerations({ workspaceId: scope.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'accept-run' }, [{ requestId: randomUUID(), request: toGenerationRequest({ ...generationInputWithImages(task.input.generation_input, task.input), instance_id: '8', template_id: '5' }) }], undefined, task.task_id)
  const runId = accepted.items[0]!.runId
  await host.remote.mutate({ ...scope, type: 'resource-remove', value: 'style', id: '7' }, signal())
  await saveFixtureDraft(host.remote, scope, () => {}, signal())
  const historical = await host.remote.getRunInput({ ...scope, workId: scope.workId!, runId }, signal())
  expect(historical.selected_resources).toEqual(task.input.selected_resources)
  const fork = await host.remote.mutate({ ...scope, type: 'create-branch', runId, value: { name: 'Run selection', original_request: 'Use the same artist resources' } }, signal())
  expect(host.store.getBranch(fork.branchId!).draft.prompt_resource_refs).toEqual(task.input.prompt_resource_refs)
  expect(host.store.getBranch(scope.branchId!).draft.prompt_resource_refs).toEqual([{ kind: 'artist-string', id: '7' }])
})

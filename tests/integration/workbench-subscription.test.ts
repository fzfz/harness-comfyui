import { expect, it, vi } from 'vitest'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { WorkbenchUpdate } from '../../src/workbench-remote.ts'
import type { WorkflowRuntimeParameterInspection } from '../../src/generation/inspection-contract.ts'
import { toGenerationRequest } from '../../src/cli/contract.ts'
import { createWorkbenchHostFixture } from '../support/workbench-host.ts'



it('limits snapshots and completed media to the requested work while retaining complete related records', async () => {
  const description: WorkflowRuntimeParameterInspection = { parameters: [
    { parameter_id: 'positive', kind: 'positive_prompt', value_type: 'string', current_value: '' },
    { parameter_id: 'negative', kind: 'negative_prompt', value_type: 'string', current_value: '' },
  ], size_candidates: [] }
  const host = await createWorkbenchHostFixture({
    inspectRuntimeParameters: async () => description, validateInput: async () => {},
    prepare: async request => ({ instanceId: request.instanceId!, instanceTitle: 'Node', templateTitle: 'Rain', sourceSnapshot: {}, inputDescription: description, actualWorkflow: {}, apiWorkflow: { '3': { class_type: 'SaveImage', inputs: {} } }, expectedOutputNodeIds: ['3'], connection: { origin: 'http://comfy.test', url: 'http://comfy.test', authorization: null } }),
  }, {
    submit: async request => { request.onRequestStart(); return { promptId: request.promptId } },
    observe: async () => ({ status: 'success', outputs: [{ nodeId: '3', outputIndex: 0, mediaKind: 'image', filename: 'rain.png', subfolder: '', type: 'output' }] }),
    download: async () => ({ bytes: new Uint8Array([1, 2, 3]), mediaType: 'image/png' }),
  })
  const cancellation = new AbortController()
  try {
    const owned: { workId: string; branchId: string; taskId: string; runId: string; translationId: string }[] = []
    for (const name of ['Selected', 'Other']) {
      const { work, branch } = host.store.createWork({ workspaceId: 'workspace_1', name, goal: 'Rain' })
      host.store.saveBranchDraft({ workspaceId: 'workspace_1', workId: work.work_id, branchId: branch.branch_id, expected: branch.draft, draft: { ...branch.draft, generation_input: { ...branch.draft.generation_input, instance_id: '8', template_id: '5' } } })
      const task = await host.ctx.harnessComfyuiWorkbench.service.createTask({ workspaceId: 'workspace_1', workId: work.work_id, branchId: branch.branch_id, functionId: 'experiment', maxRuns: 1 })
      const identity = { workspaceId: 'workspace_1', sessionId: task.session_id!, turn: 1, callId: name }
      const accepted = await host.runtime.acceptGenerations(identity, [{ requestId: crypto.randomUUID(), request: toGenerationRequest({ ...task.input.generation_input, instance_id: '8', template_id: '5' }) }], undefined, task.task_id)
      const runId = accepted.items[0]!.runId
      for (let step = 0; step < 5; step++) await host.runtime.advance()
      await host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id, artifact: { type: 'review', observation: 'Rain is visible', conclusion: 'Keep the input', run_ids: [runId] } }, identity)
      const translationId = `translation-${name}`
      await host.remote.translateStart({ workspace_id: 'workspace_1', work_id: work.work_id, branch_id: branch.branch_id, request_id: translationId, field: 'positive_prompt', source_text: 'rain' }, cancellation.signal)
      owned.push({ workId: work.work_id, branchId: branch.branch_id, taskId: task.task_id, runId, translationId })
    }
    const selected = owned[0]!
    const iterator = host.remote.subscribe({ workspaceId: 'workspace_1', workIds: [selected.workId] }, cancellation.signal)[Symbol.asyncIterator]()
    const snapshot = (await iterator.next()).value as WorkbenchUpdate
    expect(snapshot.projection.works.map(work => work.work_id)).toEqual([selected.workId])
    expect(snapshot.projection.branches.map(branch => branch.branch_id)).toEqual([selected.branchId])
    expect(snapshot.projection.tasks.map(task => task.task_id)).toEqual([selected.taskId])
    expect(snapshot.projection.artifacts.map(artifact => artifact.task_id)).toEqual([selected.taskId])
    expect(snapshot.projection.experiments.map(experiment => experiment.task_id)).toEqual([selected.taskId])
    expect(snapshot.projection.runs.map(run => run.run_id)).toEqual([selected.runId])
    expect(snapshot.projection.runs[0]!.media).toEqual([expect.objectContaining({ url: expect.stringContaining('/content?session_id='), download_url: expect.stringContaining('/download?session_id=') })])
    expect(snapshot.translations.map(record => record.request_id)).toEqual([selected.translationId])
    cancellation.abort()
    expect(await iterator.next()).toMatchObject({ done: true })
  } finally { cancellation.abort(); await host.dispose() }
})

it('ends a subscription with a projection read failure and allows a new snapshot after recovery', async () => {
  const host = await createWorkbenchHostFixture()
  const cancellation = new AbortController()
  try {
    const iterator = host.remote.subscribe({ workspaceId: 'workspace_1' }, cancellation.signal)[Symbol.asyncIterator]()
    await iterator.next()
    const fault = new Error('Projection storage temporarily unavailable')
    const read = vi.spyOn(host.ctx.harnessComfyuiWorkbench.service, 'getProjection').mockImplementationOnce(() => { throw fault })
    const pending = iterator.next()
    host.store.createWork({ workspaceId: 'workspace_1', name: 'Committed while disconnected', goal: 'Rain' })
    await expect(pending).rejects.toBe(fault)
    read.mockRestore()
    const restored = host.remote.subscribe({ workspaceId: 'workspace_1' }, cancellation.signal)[Symbol.asyncIterator]()
    expect((await restored.next()).value!.projection.works).toEqual([expect.objectContaining({ name: 'Committed while disconnected' })])
    cancellation.abort()
    await restored.next()
  } finally { cancellation.abort(); await host.dispose() }
})

it('delivers committed snapshots in order and releases a cancelled subscription', async () => {
  const host = await createWorkbenchHostFixture()
  const cancellation = new AbortController()
  try {
    const stream = host.remote.subscribe({ workspaceId: 'workspace_1' }, cancellation.signal)[Symbol.asyncIterator]()
    const first = await stream.next()
    expect(first.value).toMatchObject({ kind: 'snapshot', projection: { tasks: [] }, promptTurns: [], translations: [] })
    const created = host.store.createWork({ workspaceId: 'workspace_1', name: 'Rain', goal: 'Rain' })
    const second = await stream.next()
    expect(second.value.kind).toBe('change')
    expect(second.value.sequence).toBeGreaterThan(first.value.sequence)
    expect(second.value.projection.works).toEqual([created.work])
    const pending = stream.next()
    cancellation.abort()
    expect(await pending).toMatchObject({ done: true })
  } finally { cancellation.abort(); await host.dispose() }
})

it('rejects subscriptions to a work outside the selected workspace', async () => {
  const host = await createWorkbenchHostFixture()
  try {
    const other = host.store.createWork({ workspaceId: 'other', name: 'Private', goal: 'Private' })
    const stream = host.remote.subscribe({ workspaceId: 'workspace_1', workIds: [other.work.work_id] }, new AbortController().signal)[Symbol.asyncIterator]()
    await expect(stream.next()).rejects.toBeDefined()
  } finally { await host.dispose() }
})

it('stores a matching prompt through the mounted session event listener while no page is reading', async () => {
  const host = await createWorkbenchHostFixture()
  try {
    const { work, branch } = host.store.createWork({ workspaceId: 'workspace_1', name: 'Rain', goal: 'Rain' })
    const prompt = await host.remote.promptStart({ workspace_id: 'workspace_1', work_id: work.work_id, branch_id: branch.branch_id, function_id: 'prompt', request_id: 'request-event', intent: 'generate', input: { original_request: 'Rain', base_model_id: '1', positive_prompt: '', negative_prompt: '', change_request: '' } }, new AbortController().signal)
    const positive = 'p'.repeat(4496), negative = 'n'.repeat(731)
    const events = [
      { type: 'turn/start', seq: 1, data: { turn: 1 } },
      { type: 'user/message', seq: 2, data: { source: { kind: 'user', rpcId: prompt.request_id } } },
      { type: 'assistant/message', seq: 3, data: { turn: 1, message: { content: [{ type: 'text', text: JSON.stringify({ type: 'prompt', positive_prompt: positive, negative_prompt: negative }) }] } } },
      { type: 'turn/end', seq: 4, data: { turn: 1, reason: { kind: 'completed' } } },
    ] as unknown as SessionEvent[]
    host.official.events.set(prompt.session_id, events)
    host.ctx.emit('session/event', { id: prompt.session_id } as Session, events[3]!)
    await vi.waitFor(() => expect(host.store.getPromptTurn(prompt.request_id)?.status).toBe('succeeded'))
    expect(host.store.getBranch(branch.branch_id).draft.prompt_input).toMatchObject({ positive_prompt: positive, negative_prompt: negative })
    const calls = host.official.controller.prompt.mock.calls.length
    host.ctx.emit('session/event', { id: prompt.session_id } as Session, events[3]!)
    await host.ctx.harnessComfyuiWorkbench.prompts.recover()
    expect(host.store.listArtifacts(prompt.task_id)).toHaveLength(1)
    expect(host.official.controller.prompt).toHaveBeenCalledTimes(calls)
  } finally { await host.dispose() }
})

it('keeps a completed translation available after the display is closed and ignores another turn', async () => {
  const host = await createWorkbenchHostFixture()
  try {
    const { work, branch } = host.store.createWork({ workspaceId: 'workspace_1', name: 'Rain', goal: 'Rain' })
    const request = { workspace_id: 'workspace_1', work_id: work.work_id, branch_id: branch.branch_id, field: 'positive_prompt' as const, request_id: 'translation-event', source_text: 'rain' }
    await host.remote.translateStart(request, new AbortController().signal)
    const record = host.store.getTranslation(request.request_id)!
    const events = [
      { type: 'turn/start', seq: 1, data: { turn: 1 } },
      { type: 'user/message', seq: 2, data: { source: { kind: 'user', rpcId: request.request_id } } },
      { type: 'assistant/message', seq: 3, data: { turn: 1, message: { content: [{ type: 'text', text: '雨' }] } } },
      { type: 'turn/end', seq: 4, data: { turn: 1, reason: { kind: 'completed' } } },
      { type: 'turn/start', seq: 5, data: { turn: 2 } },
      { type: 'assistant/message', seq: 6, data: { turn: 2, message: { content: [{ type: 'text', text: 'wrong' }] } } },
    ] as unknown as SessionEvent[]
    host.official.events.set(record.session_id, events)
    host.ctx.emit('session/event', { id: record.session_id } as Session, events[3]!)
    await vi.waitFor(() => expect(host.store.getTranslation(request.request_id)).toMatchObject({ status: 'succeeded', text: '雨', source_text: 'rain' }))
    expect(host.official.controller.cancel).not.toHaveBeenCalled()
  } finally { await host.dispose() }
})

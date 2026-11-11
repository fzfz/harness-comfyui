import { expect, it, vi } from 'vitest'
import { createWorkbenchHostFixture } from '../support/workbench-host.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

function reply(requestId: string, text: string): SessionEvent[] {
  return [
    { type: 'turn/start', seq: 0, data: { turn: 1 } },
    { type: 'user/message', seq: 1, data: { source: { kind: 'user', rpcId: requestId } } },
    { type: 'assistant/message', seq: 2, data: { turn: 1, message: { content: [{ type: 'text', text }] } } },
    { type: 'turn/end', seq: 3, data: { turn: 1, reason: { kind: 'completed' } } },
  ] as SessionEvent[]
}

it.each(['prompt', 'translation'] as const)('reports a failed background %s read and processes the next event for the same request', async kind => {
  const host = await createWorkbenchHostFixture()
  const cancellation = new AbortController()
  try {
    const { work, branch } = host.store.createWork({ workspaceId: 'workspace_1', name: 'Rain', goal: 'Rain' })
    const stream = host.remote.subscribe({ workspaceId: 'workspace_1', workIds: [work.work_id] }, cancellation.signal)[Symbol.asyncIterator]()
    await stream.next()
    const fault = new Error('Session history temporarily unavailable')
    let entered!: () => void, rejectRead!: (error: Error) => void
    const reading = new Promise<void>(resolve => { entered = resolve })
    const pendingRead = new Promise<never>((_, reject) => { rejectRead = reject })
    const open = host.ctx.sessionPersistence.open.bind(host.ctx.sessionPersistence)
    host.official.controller.prompt.mockImplementationOnce(async request => {
      host.official.agents.delete(request.sessionId)
      vi.spyOn(host.ctx.sessionPersistence, 'open').mockImplementationOnce(async (...args) => {
        const handle = await open(...args)
        handle.read = async () => { entered(); return pendingRead }
        return handle
      })
      return { accepted: true }
    })
    const requestId = `background-${kind}`
    const scope = { workspace_id: 'workspace_1', work_id: work.work_id, branch_id: branch.branch_id, request_id: requestId }
    if (kind === 'prompt') await host.remote.promptStart({ ...scope, function_id: 'prompt', intent: 'generate', input: { original_request: 'Rain', base_model_id: '1', positive_prompt: '', negative_prompt: '', change_request: '' } }, cancellation.signal)
    else await host.remote.translateStart({ ...scope, field: 'positive_prompt', source_text: 'rain' }, cancellation.signal)
    await reading
    const sessionId = kind === 'prompt' ? host.store.getPromptTurn(requestId)!.session_id : host.store.getTranslation(requestId)!.session_id
    const service = kind === 'prompt' ? host.ctx.harnessComfyuiWorkbench.prompts : host.ctx.harnessComfyuiWorkbench.translations
    const nextRead = service.handleSessionEvents(sessionId)
    const failure = (async () => {
      try { while (!(await stream.next()).done) {} }
      catch (error) { return error }
      throw new Error('Expected a delivery failure')
    })()
    rejectRead(fault)
    await expect(failure).resolves.toBe(fault)
    await nextRead
    const text = kind === 'prompt' ? JSON.stringify({ type: 'prompt', positive_prompt: 'rain at night', negative_prompt: '' }) : '雨'
    host.official.events.set(sessionId, reply(requestId, text))
    await service.handleSessionEvents(sessionId)
    expect(kind === 'prompt' ? host.store.getPromptTurn(requestId)?.status : host.store.getTranslation(requestId)?.status).toBe('succeeded')
    expect(host.official.controller.prompt).toHaveBeenCalledOnce()
  } finally { cancellation.abort(); await host.dispose() }
})

it('reports an initial prompt-task history failure without losing the request or preventing later completion', async () => {
  const host = await createWorkbenchHostFixture()
  const failures: unknown[] = []
  const release = host.store.subscribe(() => {}, error => failures.push(error))
  try {
    const { work, branch } = host.store.createWork({ workspaceId: 'workspace_1', name: 'Rain', goal: 'Rain' })
    host.store.saveBranchDraft({ workspaceId: 'workspace_1', workId: work.work_id, branchId: branch.branch_id, expected: branch.draft, draft: { ...branch.draft, base_model_id: '1' } })
    const create = host.official.controller.create.getMockImplementation()!
    const fault = new Error('Initial task history temporarily unavailable')
    host.official.controller.create.mockImplementationOnce(async request => {
      const created = await create(request)
      vi.spyOn(host.official.agents.get(created.sessionId)!.session, 'snapshotEvents').mockImplementationOnce(() => { throw fault })
      return created
    })
    const task = await host.ctx.harnessComfyuiWorkbench.service.createTask({ workspaceId: 'workspace_1', workId: work.work_id, branchId: branch.branch_id, functionId: 'prompt' })
    await vi.waitFor(() => expect(failures).toContain(fault))
    const turn = host.store.listPromptTurns(task.task_id)[0]!
    host.official.events.set(turn.session_id, reply(turn.request_id, JSON.stringify({ type: 'prompt', positive_prompt: 'saved after recovery', negative_prompt: '' })))
    await host.ctx.harnessComfyuiWorkbench.prompts.handleSessionEvents(turn.session_id)
    expect(host.store.getBranch(branch.branch_id).draft.prompt_input.positive_prompt).toBe('saved after recovery')
    expect(host.official.controller.create).toHaveBeenCalledOnce()
  } finally { release(); await host.dispose() }
})

it('marks a translation failed when the Agent fails without a terminal session event', async () => {
  const host = await createWorkbenchHostFixture()
  try {
    const { work, branch } = host.store.createWork({ workspaceId: 'workspace_1', name: 'Rain', goal: 'Rain' })
    await host.remote.translateStart({ workspace_id: 'workspace_1', work_id: work.work_id, branch_id: branch.branch_id, request_id: 'agent-failure', field: 'positive_prompt', source_text: 'rain' }, new AbortController().signal)
    const record = host.store.getTranslation('agent-failure')!
    host.ctx.emit('agent/error', { agent: { id: record.session_id } } as never)
    expect(host.store.getTranslation(record.request_id)).toMatchObject({ status: 'failed', error: expect.any(String) })
    expect(host.store.getTranslation(record.request_id)!.finished_at).toEqual(expect.any(Number))
  } finally { await host.dispose() }
})

it('persists edited prompt candidates through the Remote while preserving the original Agent result', async () => {
  const host = await createWorkbenchHostFixture()
  try {
    const { work, branch } = host.store.createWork({ workspaceId: 'workspace_1', name: 'Rain', goal: 'Rain' })
    const signal = new AbortController().signal
    const turn = await host.remote.promptStart({ workspace_id: 'workspace_1', work_id: work.work_id, branch_id: branch.branch_id, request_id: 'candidate-edit', function_id: 'prompt', intent: 'rewrite', input: { original_request: 'Rain', base_model_id: '1', positive_prompt: '', negative_prompt: '', change_request: 'Add reflections' } }, signal)
    host.official.events.set(turn.session_id, reply(turn.request_id, JSON.stringify({ type: 'prompt', positive_prompt: 'Agent reflections', negative_prompt: 'blur' })))
    await host.ctx.harnessComfyuiWorkbench.prompts.handleSessionEvents(turn.session_id)
    await host.remote.promptSaveCandidate({ workspace_id: 'workspace_1', request_id: turn.request_id, positive_prompt: 'User reflections', negative_prompt: '' }, signal)
    expect(await host.remote.promptGet({ workspace_id: 'workspace_1', request_id: turn.request_id }, signal)).toMatchObject({ result: { positive_prompt: 'Agent reflections', negative_prompt: 'blur' }, candidate: { positive_prompt: 'User reflections', negative_prompt: '' }, adopted: null })
    expect(host.store.getBranch(branch.branch_id).draft.prompt_input.positive_prompt).toBe('')
  } finally { await host.dispose() }
})

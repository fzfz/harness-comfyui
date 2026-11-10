import sharp from 'sharp'
import { WorkbenchStore } from '../../src/host/storage/workbench-store.ts'
import { buildPromptRequest } from '../../src/workbench/request-template.ts'
import { WORKBENCH_REMOTE } from '../../src/workbench-remote.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWorkbenchHostFixture } from '../support/workbench-host.ts'

const fixtures: Awaited<ReturnType<typeof createWorkbenchHostFixture>>[] = []
afterEach(async () => { for (const fixture of fixtures.splice(0)) await fixture.dispose() })
async function setup() {
  const fixture = await createWorkbenchHostFixture(); fixtures.push(fixture)
  const created = fixture.store.createWork({ workspaceId: 'workspace_1', name: 'Prompt study', goal: 'A rainy street' })
  await fixture.ctx.harnessComfyuiWorkbench.initializeWorkspace('workspace_1')
  const binding = fixture.store.getFunctionBinding('workspace_1', 'prompt')
  fixture.store.saveFunctionBinding({ ...binding, preset_id: 'preset-a' })
  return { ...fixture, ...created, request: { workspace_id: 'workspace_1', work_id: created.work.work_id, branch_id: created.branch.branch_id, function_id: 'prompt', request_id: 'request-1', input: { original_request: 'Unsaved rain at night', base_model_id: '1', positive_prompt: '', negative_prompt: '', change_request: '' } } }
}

function complete(f: Awaited<ReturnType<typeof setup>>, sessionId: string, requestId: string, turn: number, reply: unknown) {
  const events = f.official.events.get(sessionId) ?? []
  const seq = events.length
  events.push(...[
    { type: 'turn/start', seq, data: { turn } },
    { type: 'user/message', seq: seq + 1, data: { id: requestId, role: 'user', source: { kind: 'user', rpcId: requestId }, content: [{ type: 'text', text: 'input' }] } },
    { type: 'assistant/message', seq: seq + 2, data: { turn, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: JSON.stringify(reply) }] } } },
    { type: 'turn/end', seq: seq + 3, data: { turn, reason: { kind: 'completed' } } },
  ] as unknown as SessionEvent[])
  f.official.events.set(sessionId, events)
  f.official.agents.get(sessionId)!.status = 'idle'
}

describe('prompt editing through the workbench remote', () => {
  it('reuses the editing task and session across requests while preserving each input and adopted result', async () => {
    const f = await setup(), signal = new AbortController().signal
    const first = await f.remote.promptStart(f.request, signal)
    expect(first.input).toMatchObject({ original_request: 'Unsaved rain at night', base_model_id: '1', base_model_name: 'Source base' })
    expect(first.request_text).toContain('Unsaved rain at night')
    expect(f.store.getBranch(f.branch.branch_id).original_request).toBe('A rainy street')
    complete(f, first.session_id, first.request_id, 1, { type: 'prompt', positive_prompt: 'rain, night', negative_prompt: '' })
    const finished = await f.remote.promptGet({ workspace_id: 'workspace_1', request_id: first.request_id }, signal)
    expect(finished).toMatchObject({ status: 'succeeded', harness_turn: 1, result: { type: 'prompt', positive_prompt: 'rain, night', negative_prompt: '' } })
    const second = await f.remote.promptStart({ ...f.request, task_id: first.task_id, request_id: 'request-2', input: { ...f.request.input, positive_prompt: 'rain, night, manual', change_request: 'Add reflections' } }, signal)
    expect(second).toMatchObject({ task_id: first.task_id, session_id: first.session_id, turn_index: 2, status: 'running', harness_turn: null })
    expect(second.input).toMatchObject({ positive_prompt: 'rain, night, manual', change_request: 'Add reflections' })
    complete(f, second.session_id, second.request_id, 2, { type: 'prompt', positive_prompt: 'reflections in rain', negative_prompt: 'fog' })
    const result = await f.remote.promptGet({ workspace_id: 'workspace_1', request_id: second.request_id }, signal)
    const adopted = await f.remote.promptAdopt({ workspace_id: 'workspace_1', request_id: second.request_id, positive_prompt: 'reflections, user edit', negative_prompt: '' }, signal)
    expect(result.status).toBe('succeeded')
    expect(adopted).toMatchObject({ adopted: { positive_prompt: 'reflections, user edit', negative_prompt: '' }, result: { positive_prompt: 'reflections in rain', negative_prompt: 'fog' } })
    expect(await f.remote.promptList({ workspace_id: 'workspace_1', task_id: first.task_id }, signal)).toHaveLength(2)
    expect(f.official.controller.create).toHaveBeenCalledTimes(1)
    expect(f.store.getBranch(f.branch.branch_id).draft.prompt_input.positive_prompt).toBe('')
  })
  it('rejects concurrent turns, ignores unrelated replies and keeps cancellation after late completion', async () => {
    const f = await setup(), signal = new AbortController().signal
    const first = await f.remote.promptStart(f.request, signal)
    await expect(f.remote.promptStart({ ...f.request, task_id: first.task_id, request_id: 'request-busy' }, signal)).rejects.toMatchObject({ details: { code: 'WORKBENCH_PROMPT_BUSY' } })
    expect(await f.remote.promptStart(f.request, signal)).toEqual(first)
    complete(f, first.session_id, 'another-request', 1, { type: 'prompt', positive_prompt: 'unrelated', negative_prompt: '' })
    expect(await f.remote.promptGet({ workspace_id: 'workspace_1', request_id: first.request_id }, signal)).toMatchObject({ status: 'running', harness_turn: null })
    const stopped = await f.remote.promptCancel({ workspace_id: 'workspace_1', request_id: first.request_id }, signal)
    expect(stopped.status).toBe('interrupted')
    complete(f, first.session_id, first.request_id, 2, { type: 'prompt', positive_prompt: 'late reply', negative_prompt: '' })
    expect(await f.remote.promptGet({ workspace_id: 'workspace_1', request_id: first.request_id }, signal)).toMatchObject({ status: 'interrupted', result: null })
    expect(f.store.listArtifacts(first.task_id)).toHaveLength(0)
    const next = await f.remote.promptStart({ ...f.request, task_id: first.task_id, request_id: 'request-resume' }, signal)
    complete(f, next.session_id, next.request_id, 3, { type: 'prompt', positive_prompt: 'resumed', negative_prompt: '' })
    expect(await f.remote.promptGet({ workspace_id: 'workspace_1', request_id: next.request_id }, signal)).toMatchObject({ status: 'succeeded', harness_turn: 3, result: { positive_prompt: 'resumed' } })
    await expect(f.remote.promptGet({ workspace_id: 'workspace_2', request_id: next.request_id }, signal)).rejects.toMatchObject({ details: { code: 'WORKBENCH_SCOPE_MISMATCH' } })
    await expect(f.remote.promptList({ workspace_id: 'workspace_2', task_id: first.task_id }, signal)).rejects.toMatchObject({ details: { code: 'WORKBENCH_SCOPE_MISMATCH' } })
    await expect(f.remote.promptStart({ ...f.request, input: { ...f.request.input, original_request: 'Different input' } }, signal)).rejects.toMatchObject({ details: { code: 'WORKBENCH_PROMPT_REQUEST_CONFLICT' } })
  })
  it('creates the selected preset session and preserves earlier templates and model receipts', async () => {
    const f = await setup(), signal = new AbortController().signal
    const first = await f.remote.promptStart(f.request, signal)
    complete(f, first.session_id, first.request_id, 1, { type: 'prompt', positive_prompt: 'first', negative_prompt: '' })
    await f.remote.promptGet({ workspace_id: 'workspace_1', request_id: first.request_id }, signal)
    f.official.listPresets.mockResolvedValue([{ id: 'preset-a' }, { id: 'preset-b' }])
    const binding = f.store.getFunctionBinding('workspace_1', 'prompt')
    const parts = structuredClone(binding.request_parts!)
    parts.block_templates.requirements_block = 'Updated requirements: {{original_request}}'
    f.store.saveFunctionBinding({ ...binding, preset_id: 'preset-b', request_template: '{{requirements_block}}', request_parts: parts, agent_model: { ...binding.agent_model, reasoningEffort: 'low' } })
    const second = await f.remote.promptStart({ ...f.request, task_id: first.task_id, request_id: 'request-new-preset' }, signal)
    expect(second.session_id).not.toBe(first.session_id)
    expect(second).toMatchObject({ task_id: first.task_id, turn_index: 2, preset_id: 'preset-b', agent_model: { reasoningEffort: 'low' }, request_text: 'Updated requirements: Unsaved rain at night' })
    expect(f.store.getPromptTurn(first.request_id)).toMatchObject({ request_template: first.request_template, request_parts: first.request_parts, preset_id: 'preset-a', status: 'succeeded' })
    f.official.agents.delete(first.session_id)
    expect(await f.remote.promptList({ workspace_id: 'workspace_1', task_id: first.task_id }, signal)).toHaveLength(2)
    const projection = await f.remote.getProjection({ workspaceId: 'workspace_1', workId: f.work.work_id }, signal)
    expect(projection.tasks.find(task => task.task_id === first.task_id)?.status).toBe('running')
  })
  it('rejects malformed replies and preserves failed dispatch records for another turn', async () => {
    const f = await setup(), signal = new AbortController().signal
    f.official.controller.prompt.mockRejectedValueOnce(new Error('Provider unavailable'))
    const rejected = await f.remote.promptStart(f.request, signal)
    expect(rejected).toMatchObject({ status: 'failed', error: { message: 'Provider unavailable' }, result: null })
    const second = await f.remote.promptStart({ ...f.request, task_id: rejected.task_id, request_id: 'request-retry' }, signal)
    complete(f, second.session_id, second.request_id, 1, { type: 'prompt', positive_prompt: null, negative_prompt: '' })
    expect(await f.remote.promptGet({ workspace_id: 'workspace_1', request_id: second.request_id }, signal)).toMatchObject({ status: 'failed', error: { code: 'WORKBENCH_PROMPT_REPLY_INVALID' } })
    await expect(f.remote.promptAdopt({ workspace_id: 'workspace_1', request_id: second.request_id, positive_prompt: 'manual', negative_prompt: '' }, signal)).rejects.toMatchObject({ details: { code: 'WORKBENCH_PROMPT_NOT_READY' } })
    await expect(f.remote.promptGet({ workspace_id: 'workspace_1', request_id: 'missing' }, signal)).rejects.toMatchObject({ details: { code: 'WORKBENCH_PROMPT_NOT_FOUND' } })
  })
  it('migrates builtin and custom rewrite bindings while preserving historical requests and execution snapshots', async () => {
    const f = await setup()
    const binding = f.store.getFunctionBinding('workspace_1', 'prompt')
    const legacyTemplate = 'Keep raw {{original_request}}; {{positive_prompt}} and {{negative_prompt}}; {{reference_context}}.'
    f.database.prepare("UPDATE workbench_function_bindings SET request_parts_json=NULL,request_template='Read {{task_id}}.' WHERE workspace_id='workspace_1' AND function_id='prompt'").run()
    f.database.prepare("INSERT INTO workbench_function_bindings SELECT workspace_id,'rewrite','改写提示词','rewrite',1,preset_id,agent_model_json,requested_skill,request_template,NULL FROM workbench_function_bindings WHERE workspace_id='workspace_1' AND function_id='prompt'").run()
    f.database.prepare("INSERT INTO workbench_function_bindings SELECT workspace_id,'custom-rewrite','Glass edit','rewrite',0,preset_id,agent_model_json,requested_skill,?,NULL FROM workbench_function_bindings WHERE workspace_id='workspace_1' AND function_id='prompt'").run(legacyTemplate)
    const migrated = new WorkbenchStore({ database: f.database, artifactDirectory: f.directory })
    expect(migrated.listFunctionBindings('workspace_1').some(item => item.function_id === 'rewrite')).toBe(false)
    expect(migrated.getFunctionBinding('workspace_1', 'prompt')).toMatchObject({ preset_id: binding.preset_id, agent_model: binding.agent_model, request_parts: binding.request_parts })
    expect(migrated.getFunctionBinding('workspace_1', 'prompt').request_template).toContain('{{requirements_block}}')
    expect(migrated.getFunctionBinding('workspace_1', 'custom-rewrite')).toMatchObject({ kind: 'prompt', name: 'Glass edit', preset_id: binding.preset_id, request_template: 'Keep raw {{requirements_block}}; {{prompt_edit_block}} and {{prompt_edit_block}}; {{references_block}}.' })
    const custom = migrated.getFunctionBinding('workspace_1', 'custom-rewrite')
    const rendered = buildPromptRequest(custom.request_template, { base_model_id: '1', base_model_name: 'SDXL', original_request: 'Keep rain', positive_prompt: 'warm glass', negative_prompt: 'blur', change_request: 'Add reflections', reference_context: { requested_skill: 'prompt-builder' } }, custom.request_parts)
    expect(rendered).toContain('Keep raw ')
    expect(rendered).toContain(' and ')
    for (const value of ['SDXL', 'Keep rain', 'warm glass', 'blur', 'Add reflections', 'prompt-builder']) expect(rendered).toContain(value)
    expect(rendered).not.toMatch(/\{\{(?:original_request|positive_prompt|negative_prompt|reference_context)\}\}/u)
    expect(new WorkbenchStore({ database: f.database, artifactDirectory: f.directory }).listFunctionBindings('workspace_1')).toEqual(migrated.listFunctionBindings('workspace_1'))
  })
  it('validates every prompt request and result through the declared Remote codecs', async () => {
    const f = await setup(), signal = new AbortController().signal
    const turn = await f.remote.promptStart(f.request, signal)
    const lookup = { workspace_id: 'workspace_1', request_id: turn.request_id }
    const payloads = { promptStart: f.request, promptGet: lookup, promptCancel: lookup, promptList: { workspace_id: 'workspace_1', task_id: turn.task_id }, promptAdopt: { ...lookup, positive_prompt: 'adopted', negative_prompt: '' } }
    for (const method of ['promptStart', 'promptGet', 'promptCancel', 'promptList', 'promptAdopt'] as const) {
      const descriptor = WORKBENCH_REMOTE.descriptors.find(item => item.method === method)!
      const requestCodec = descriptor.parameters[0]!.codec.create()
      expect(requestCodec.parse(payloads[method])).toEqual(payloads[method])
      expect(() => requestCodec.parse({ ...payloads[method], extra: true })).toThrow()
      const resultCodec = descriptor.result.create()
      expect(resultCodec.parse(method === 'promptList' ? [turn] : turn)).toEqual(method === 'promptList' ? [turn] : turn)
      expect(() => resultCodec.parse({})).toThrow()
    }
  })
  it('accepts a direct task reply from its exact official request and persists it through task queries', async () => {
    const f = await setup(), signal = new AbortController().signal
    f.store.saveBranchDraft({ workspaceId: 'workspace_1', workId: f.work.work_id, branchId: f.branch.branch_id, expected: f.branch.draft, draft: { ...f.branch.draft, base_model_id: '1' } })
    const task = await f.ctx.harnessComfyuiWorkbench.service.createTask({ workspaceId: 'workspace_1', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'prompt' })
    const request = (f.official.controller.prompt.mock.calls[0] as unknown as [{ requestId: string }])[0]
    complete(f, task.session_id!, request.requestId, 1, { type: 'prompt', positive_prompt: 'A rainy street in watercolor', negative_prompt: '' })
    const result = await f.ctx.harnessComfyuiWorkbench.service.getTask({ taskId: task.task_id }, { workspaceId: 'workspace_1', sessionId: task.session_id!, turn: 1, callId: 'read' })
    expect(result.artifacts).toContainEqual(expect.objectContaining({ task_id: task.task_id, artifact: { type: 'prompt', positive_prompt: 'A rainy street in watercolor', negative_prompt: '' } }))
    expect(result.status).toBe('succeeded')
    expect((await f.remote.promptList({ workspace_id: 'workspace_1', task_id: task.task_id }, signal))[0]).toMatchObject({ harness_turn: 1, status: 'succeeded' })
  })
  it('supports different branches concurrently and derives the base model from the chosen generation model', async () => {
    const f = await setup(), signal = new AbortController().signal
    const child = f.store.createBranch({ workId: f.work.work_id, parentBranchId: f.branch.branch_id, name: 'Second scene', originalRequest: 'A sunny harbor', draft: f.branch.draft })
    const first = f.remote.promptStart(f.request, signal)
    const draft = { ...child.draft, generation_input: { ...child.draft.generation_input, model: { id: '2', file_name: 'paint.safetensors' } } }
    const second = f.remote.promptStart({ ...f.request, branch_id: child.branch_id, request_id: 'child-request', draft, input: { ...f.request.input, base_model_id: '9', original_request: 'A sunny harbor' } }, signal)
    const [left, right] = await Promise.all([first, second])
    expect(left.session_id).not.toBe(right.session_id)
    expect(left.task_id).not.toBe(right.task_id)
    expect(right.input).toMatchObject({ base_model_id: '1', base_model_name: 'Source base', original_request: 'A sunny harbor' })
    await expect(f.remote.promptStart({ ...f.request, task_id: right.task_id, request_id: 'foreign-task-request' }, signal)).rejects.toMatchObject({ details: { code: 'WORKBENCH_SCOPE_MISMATCH' } })
    expect(f.store.listTasks('workspace_1')).toHaveLength(2)
  })
  it('previews resolved references without creating a prompt request and sends the same resolved input', async () => {
    const f = await setup(), signal = new AbortController().signal
    const source = await f.ctx.harnessComfyuiWorkbench.service.createTask({ workspaceId: 'workspace_1', workId: f.work.work_id, branchId: f.branch.branch_id, functionId: 'resources' })
    const artifact = f.store.publish(source.task_id, { type: 'resources', refs: [{ kind: 'model', id: '2' }], reason: 'Use watercolor' }, { workspaceId: 'workspace_1', sessionId: source.session_id!, turn: 1, callId: 'source' })
    const experience = f.store.saveExperience({ title: 'Rain lighting', conditions: 'Night street', note: 'Place a warm light near the pavement.' })
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#abc' } }).png().toBuffer()
    const imported = await f.remote.importImages({ files: [{ name: 'reference.png', media_type: 'image/png', bytes: Array.from(bytes) }] }, signal)
    const draft = { ...f.branch.draft, reference_task_ids: [source.task_id], reference_experiences: [{ experience_id: experience.experience_id, title: experience.title, conditions: experience.conditions, note: experience.note, provenance: experience.provenance }], image_refs: imported.images.map(image => ({ ...image, purpose: 'agent' as const, reference_requirement: 'Keep the layout' })) }
    const binding = f.store.getFunctionBinding('workspace_1', 'prompt')
    f.store.saveFunctionBinding({ ...binding, requested_skill: 'prompt-builder' })
    const request = { ...f.request, draft }
    f.store.saveExperience({ experienceId: experience.experience_id, title: 'Changed title', conditions: 'Changed conditions', note: 'Changed note' })
    const count = f.official.controller.create.mock.calls.length
    const preview = await f.remote.promptPreview(request, signal)
    expect(preview.reference_context).toMatchObject({ requested_skill: 'prompt-builder', experiences: [expect.objectContaining({ conditions: 'Night street' })], task_artifacts: [expect.objectContaining({ task_id: source.task_id, artifact_id: artifact.artifact_id })], images: [expect.objectContaining({ file_path: expect.any(String), purpose: 'agent', reference_requirement: 'Keep the layout' })] })
    expect(f.official.controller.create).toHaveBeenCalledTimes(count)
    expect(f.store.listTasks('workspace_1')).toHaveLength(1)
    const started = await f.remote.promptStart(request, signal)
    expect(started.input).toEqual(preview)
    expect(f.store.getTask(started.task_id).input.reference_experiences).toEqual(draft.reference_experiences)
    const descriptor = WORKBENCH_REMOTE.descriptors.find(item => item.method === 'promptPreview')!
    expect(descriptor.parameters[0]!.codec.create().parse(request)).toMatchObject(request)
    expect(descriptor.result.create().parse(preview)).toEqual(preview)
  })
  it.each([
    { reason: { kind: 'error', error: { message: 'Model failed', code: 'MODEL_FAILED' } }, status: 'failed', code: 'WORKBENCH_PROMPT_AGENT_FAILED' },
    { reason: { kind: 'aborted', reason: { kind: 'user' } }, status: 'interrupted', code: 'WORKBENCH_PROMPT_INTERRUPTED' },
    { reason: { kind: 'blocked' }, status: 'failed', code: 'WORKBENCH_PROMPT_INCOMPLETE' },
  ])('records the matching official terminal reason $reason.kind', async ({ reason, status, code }) => {
    const f = await setup(), signal = new AbortController().signal
    const first = await f.remote.promptStart(f.request, signal)
    f.official.events.set(first.session_id, [
      { seq: 0, type: 'turn/start', data: { turn: 1 } },
      { seq: 1, type: 'user/message', data: { source: { kind: 'user', rpcId: first.request_id } } },
    ] as unknown as SessionEvent[])
    expect(await f.remote.promptGet({ workspace_id: 'workspace_1', request_id: first.request_id }, signal)).toMatchObject({ harness_turn: 1, status: 'running' })
    f.official.events.get(first.session_id)!.push({ seq: 2, type: 'turn/end', data: { turn: 1, reason } } as unknown as SessionEvent)
    expect(await f.remote.promptGet({ workspace_id: 'workspace_1', request_id: first.request_id }, signal)).toMatchObject({ status, error: { code }, artifact_id: null })
  })
  it.each([false, true])('keeps cancellation when a suspended event read returns completion (next turn: %s)', async nextTurn => {
    const f = await setup(), signal = new AbortController().signal
    const first = await f.remote.promptStart(f.request, signal)
    complete(f, first.session_id, first.request_id, 1, { type: 'prompt', positive_prompt: 'late completion', negative_prompt: '' })
    f.official.agents.delete(first.session_id)
    let entered!: () => void, release!: () => void
    const reading = new Promise<void>(resolve => { entered = resolve })
    const suspended = new Promise<void>(resolve => { release = resolve })
    const open = f.ctx.sessionPersistence.open.bind(f.ctx.sessionPersistence)
    vi.spyOn(f.ctx.sessionPersistence, 'open').mockImplementationOnce(async (...arguments_) => {
      const handle = await open(...arguments_)
      const read = handle.read.bind(handle)
      handle.read = async (...readArguments) => {
        const snapshot = await read(...readArguments)
        entered(); await suspended
        return snapshot
      }
      return handle
    })
    const pending = f.remote.promptGet({ workspace_id: 'workspace_1', request_id: first.request_id }, signal)
    await reading
    const stopped = await f.remote.promptCancel({ workspace_id: 'workspace_1', request_id: first.request_id }, signal)
    expect(stopped.status).toBe('interrupted')
    const next = nextTurn ? await f.remote.promptStart({ ...f.request, task_id: first.task_id, request_id: 'request-after-cancel' }, signal) : null
    release()
    const late = await pending
    expect(late).toMatchObject({ status: 'interrupted', artifact_id: null, result: null })
    expect(f.store.getPromptTurn(first.request_id)).toMatchObject({ status: 'interrupted', artifact_id: null })
    expect(f.store.updatePromptTurn(first.request_id, { harness_turn: 1, status: 'succeeded', result: { type: 'prompt', positive_prompt: 'stale transaction', negative_prompt: '' } })).toEqual(stopped)
    expect(f.store.listArtifacts(first.task_id)).toHaveLength(0)
    expect(f.store.getTask(first.task_id)).toMatchObject({ status: next ? 'running' : 'interrupted', execution_state: next ? 'running' : 'interrupted' })
    if (next) expect(f.store.getPromptTurn(next.request_id)).toMatchObject({ status: 'running', artifact_id: null, harness_turn: null })
  })
  it('cancels a session created after its request was stopped without rebinding the next turn', async () => {
    const f = await setup(), signal = new AbortController().signal
    let entered!: () => void, release!: () => void, obsoleteSessionId = ''
    const creating = new Promise<void>(resolve => { entered = resolve })
    const suspended = new Promise<void>(resolve => { release = resolve })
    const create = f.official.controller.create.getMockImplementation()!
    f.official.controller.create.mockImplementationOnce(async input => {
      entered(); await suspended
      const created = await create(input)
      obsoleteSessionId = created.sessionId
      return created
    })
    const pending = f.remote.promptStart(f.request, signal)
    await creating
    const stopped = await f.remote.promptCancel({ workspace_id: 'workspace_1', request_id: f.request.request_id }, signal)
    const next = await f.remote.promptStart({ ...f.request, task_id: stopped.task_id, request_id: 'request-while-old-session-creates' }, signal)
    release()
    expect(await pending).toEqual(stopped)
    expect(f.official.controller.cancel).toHaveBeenCalledWith({ sessionId: obsoleteSessionId })
    expect(f.store.getTask(stopped.task_id)).toMatchObject({ session_id: next.session_id, status: 'running', execution_state: 'running' })
    expect(f.store.getPromptTurn(next.request_id)).toMatchObject({ session_id: next.session_id, status: 'running' })
    expect(f.store.listArtifacts(stopped.task_id)).toHaveLength(0)
  })
  it('does not cancel a reused session again when stopped model selection returns after the next request starts', async () => {
    const f = await setup(), signal = new AbortController().signal
    const first = await f.remote.promptStart(f.request, signal)
    complete(f, first.session_id, first.request_id, 1, { type: 'prompt', positive_prompt: 'first reply', negative_prompt: '' })
    await f.remote.promptGet({ workspace_id: 'workspace_1', request_id: first.request_id }, signal)
    let entered!: () => void, release!: () => void
    const selecting = new Promise<void>(resolve => { entered = resolve })
    const suspended = new Promise<void>(resolve => { release = resolve })
    const select = f.official.controller.selectModel.getMockImplementation()!
    f.official.controller.selectModel.mockImplementationOnce(async input => {
      entered(); await suspended
      return select(input)
    })
    const request = { ...f.request, task_id: first.task_id, request_id: 'stopped-selection' }
    const pending = f.remote.promptStart(request, signal)
    await selecting
    const stopped = await f.remote.promptCancel({ workspace_id: 'workspace_1', request_id: request.request_id }, signal)
    const next = await f.remote.promptStart({ ...request, request_id: 'request-after-selection-cancel' }, signal)
    const cancellations = f.official.controller.cancel.mock.calls.length
    release()
    expect(await pending).toEqual(stopped)
    expect(f.official.controller.cancel).toHaveBeenCalledTimes(cancellations)
    expect((f.official.controller.prompt.mock.calls as unknown as [{ requestId: string }][]).map(call => call[0].requestId)).toEqual([first.request_id, next.request_id])
    expect(f.store.getTask(first.task_id)).toMatchObject({ session_id: next.session_id, status: 'running' })
  })
  it.each(['promptCancel', 'taskInterrupt'])('does not dispatch a stopped request after its pre-dispatch event read resumes (%s)', async stopping => {
    const f = await setup(), signal = new AbortController().signal
    let entered!: () => void, release!: () => void
    const reading = new Promise<void>(resolve => { entered = resolve })
    const suspended = new Promise<void>(resolve => { release = resolve })
    const select = f.official.controller.selectModel.getMockImplementation()!
    f.official.controller.selectModel.mockImplementationOnce(async input => {
      const selected = await select(input)
      f.official.agents.delete((input as typeof input & { sessionId: string }).sessionId)
      return selected
    })
    const open = f.ctx.sessionPersistence.open.bind(f.ctx.sessionPersistence)
    vi.spyOn(f.ctx.sessionPersistence, 'open').mockImplementationOnce(async (...arguments_) => {
      const handle = await open(...arguments_)
      const read = handle.read.bind(handle)
      handle.read = async (...readArguments) => {
        const snapshot = await read(...readArguments)
        entered(); await suspended
        return snapshot
      }
      return handle
    })
    const pending = f.remote.promptStart(f.request, signal)
    await reading
    const queued = f.store.getPromptTurn(f.request.request_id)!
    if (stopping === 'promptCancel') await f.remote.promptCancel({ workspace_id: 'workspace_1', request_id: f.request.request_id }, signal)
    else await f.remote.mutate({ workspaceId: 'workspace_1', workId: f.work.work_id, branchId: f.branch.branch_id, taskId: queued.task_id, type: 'task-interrupt' }, signal)
    const stopped = f.store.getPromptTurn(f.request.request_id)!
    const next = await f.remote.promptStart({ ...f.request, task_id: stopped.task_id, request_id: 'request-after-read-cancel' }, signal)
    release()
    expect(await pending).toEqual(stopped)
    expect((f.official.controller.prompt.mock.calls as unknown as [{ requestId: string }][]).map(call => call[0].requestId)).toEqual([next.request_id])
    expect(f.store.getTask(stopped.task_id)).toMatchObject({ session_id: next.session_id, status: 'running' })
  })
  it('rejects an absent base model before creating an editing task or session', async () => {
    const f = await setup()
    await expect(f.remote.promptStart({ ...f.request, input: { ...f.request.input, base_model_id: '' } }, new AbortController().signal)).rejects.toMatchObject({ message: '请先选择底模。' })
    expect(f.store.listTasks('workspace_1')).toHaveLength(0)
    expect(f.official.controller.create).not.toHaveBeenCalled()
  })
})

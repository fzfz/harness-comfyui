import { describe, expect, it, vi } from 'vitest'
import { PromptEditingController } from '../../src/client/workbench/experiment-prompt-editor.ts'
import { PreparationEditor } from '../../src/client/workbench/experiment-preparation.ts'
import { makeBranch, makeBinding } from './experiment-workbench-fixtures.ts'
import type { PromptTurn } from '../../src/workbench/prompt-edit.ts'
import type { PromptEditingRemote } from '../../src/client/workbench/experiment-prompt-editor.ts'
import { DEFAULT_PROMPT_REQUEST_PARTS } from '../../src/workbench/request-template.ts'

function fixture() {
  const branch = makeBranch('source', null)
  branch.draft.prompt_input = { positive_prompt: '', negative_prompt: '' }
  const editor = new PreparationEditor(branch, { edit: async (_before, draft) => draft, save: async () => {}, onError: () => {} })
  const turn: PromptTurn = { request_id: 'request-1', task_id: 'task-1', turn_index: 1, function_id: 'prompt', kind: 'prompt', intent: 'rewrite', candidate: null, session_id: 'session-1', harness_turn: 1, preset_id: 'preset',
    agent_model: { provider: 'lan-gpt', model: 'gpt-6.1-terra', reasoningEffort: 'low' }, input: { base_model_id: '1', base_model_name: 'SDXL', original_request: '肖像', change_request: '', positive_prompt: '', negative_prompt: '', reference_context: {} },
    request_template: '{{requirements_block}}', request_parts: DEFAULT_PROMPT_REQUEST_PARTS, request_text: '肖像', status: 'succeeded', error: null, result: { type: 'prompt', positive_prompt: 'portrait', negative_prompt: '' }, artifact_id: 'artifact', adopted: null, applied_at: null, created_at: 1, finished_at: 2, start_seq: 0 }
  const remote: PromptEditingRemote = { promptStart: vi.fn(async () => turn), promptGet: vi.fn(async () => turn), promptList: vi.fn(async () => [turn]), promptCancel: vi.fn(async () => ({ ...turn, status: 'interrupted' as const, result: null })), promptSaveCandidate: vi.fn(async request => { const saved = { ...(controller.getSnapshot().turn ?? turn), candidate: { positive_prompt: request.positive_prompt, negative_prompt: request.negative_prompt } }; controller.receiveRecords([saved], new Set([saved.task_id])); return saved }), promptAdopt: vi.fn(async request => ({ ...turn, adopted: { positive_prompt: request.positive_prompt, negative_prompt: request.negative_prompt } })) }
  const controller = new PromptEditingController({ workspace_id: 'workspace-a', work_id: 'work-a', branch_id: 'source' }, remote, editor)
  return { branch, editor, turn, remote, controller }
}

describe('prompt editing at the source branch', () => {
  it('retries saving failed local result edits without closing the comparison', async () => {
    const { controller, remote, editor, turn } = fixture()
    editor.change({ prompt_edit_task_id: turn.task_id })
    await controller.restore()
    controller.open(makeBinding('prompt'))
    vi.mocked(remote.promptSaveCandidate).mockRejectedValueOnce(new Error('保存失败，请重试。'))
    controller.editResult({ positive_prompt: 'edited while comparing', negative_prompt: 'blur' })
    await vi.waitFor(() => expect(controller.getSnapshot().error).toBe('保存失败，请重试。'))
    await controller.saveResult()
    expect(remote.promptSaveCandidate).toHaveBeenCalledTimes(2)
    expect(controller.getSnapshot()).toMatchObject({ open: true, resultDirty: false, resultSaving: false, result: { positive_prompt: 'edited while comparing', negative_prompt: 'blur' }, error: '' })
    expect(remote.promptAdopt).not.toHaveBeenCalled()
    controller.dispose()
  })
  it.each([
    { name: 'saved generation', intent: 'generate' as const, candidate: null, adopted: null, allowed: false },
    { name: 'generation conflict', intent: 'generate' as const, candidate: { positive_prompt: 'portrait', negative_prompt: '' }, adopted: null, allowed: true },
    { name: 'adopted candidate', intent: 'rewrite' as const, candidate: { positive_prompt: 'portrait', negative_prompt: '' }, adopted: { positive_prompt: 'portrait', negative_prompt: '' }, allowed: false },
    { name: 'edited after adoption', intent: 'rewrite' as const, candidate: { positive_prompt: 'changed portrait', negative_prompt: '' }, adopted: { positive_prompt: 'portrait', negative_prompt: '' }, allowed: true },
  ])('adopts only an explicit pending candidate: $name', async value => {
    const { controller, remote, editor, turn } = fixture()
    const saved = { ...turn, intent: value.intent, candidate: value.candidate, adopted: value.adopted, applied_at: value.adopted ? 3 : null }
    vi.mocked(remote.promptList).mockResolvedValue([saved])
    editor.change({ prompt_edit_task_id: turn.task_id })
    await controller.restore()
    await controller.adopt()
    expect(remote.promptAdopt).toHaveBeenCalledTimes(value.allowed ? 1 : 0)
    expect(controller.getSnapshot().result).toEqual(value.candidate ?? { positive_prompt: 'portrait', negative_prompt: '' })
    controller.dispose()
  })
  it('keeps Host-saved inputs saved when acceptance arrives after the saved branch notification', async () => {
    const { controller, remote, editor, branch, turn } = fixture()
    let accept!: (turn: PromptTurn) => void, requestId = ''
    vi.mocked(remote.promptStart).mockImplementation(request => { requestId = request.request_id; return new Promise(resolve => { accept = resolve }) })
    const starting = controller.start(makeBinding('prompt'))
    const saved = { ...branch, draft: { ...branch.draft, prompt_edit_task_id: turn.task_id, prompt_input: { positive_prompt: 'portrait', negative_prompt: '' } }, editing_draft: null }
    editor.sync(saved)
    expect(editor.getSnapshot().editing).toBe(false)
    accept({ ...turn, request_id: requestId, status: 'running', result: null })
    await starting
    controller.receiveRecords([{ ...turn, request_id: requestId, intent: 'generate', candidate: null }], new Set([turn.task_id]))
    expect(editor.getSnapshot()).toMatchObject({ editing: false, draft: saved.draft })
    expect(editor.hasUnpersistedChanges()).toBe(false)
    controller.dispose()
  })
  it('opens historical prompt records without editing branch inputs', async () => {
    const { controller, remote, editor, turn } = fixture()
    const before = structuredClone(editor.getSnapshot().draft)
    vi.mocked(remote.promptList).mockResolvedValue([{ ...turn, task_id: 'historical-task' }])
    controller.open(makeBinding('prompt'), 'historical-task')
    await vi.waitFor(() => expect(controller.getSnapshot().turn?.task_id).toBe('historical-task'))
    expect(editor.getSnapshot()).toMatchObject({ editing: false, draft: before })
    expect(editor.hasUnpersistedChanges()).toBe(false)
    controller.dispose()
  })
  it.each(['historical', 'new-request'] as const)('keeps a requested stop bound to A after selecting B: %s', async mode => {
    const { controller, remote, editor, turn } = fixture()
    let acceptA!: (turn: PromptTurn) => void, requestA = ''
    const other = { ...turn, task_id: 'task-b', request_id: 'request-b', candidate: { positive_prompt: 'B candidate', negative_prompt: '' } }
    vi.mocked(remote.promptStart).mockImplementationOnce(request => { requestA = request.request_id; return new Promise(resolve => { acceptA = resolve }) })
      .mockImplementation(async request => ({ ...other, request_id: request.request_id, status: 'running', result: null, candidate: null }))
    vi.mocked(remote.promptList).mockResolvedValue([other])
    const startingA = controller.start(makeBinding('prompt'))
    await controller.cancel()
    controller.open(makeBinding('prompt'), other.task_id)
    await vi.waitFor(() => expect(controller.getSnapshot().turn?.request_id).toBe(other.request_id))
    if (mode === 'new-request') { controller.setChangeRequest('rewrite B'); await controller.start() }
    const selectedB = controller.getSnapshot()
    acceptA({ ...turn, request_id: requestA, status: 'running', result: null })
    await startingA
    expect(remote.promptCancel).toHaveBeenCalledExactlyOnceWith({ workspace_id: 'workspace-a', request_id: requestA })
    expect(controller.getSnapshot()).toEqual(selectedB)
    expect(editor.getSnapshot().draft.prompt_edit_task_id).toBeUndefined()
    controller.dispose()
  })
  it.each([
    ['old', 'accept', 'complete'], ['old', 'complete', 'accept'],
    ['accept', 'old', 'complete'], ['complete', 'old', 'accept'],
  ] as const)('anchors a locally registered request through %s, %s, %s', async (...order) => {
    const { controller, remote, editor, turn } = fixture()
    editor.change({ prompt_edit_task_id: turn.task_id })
    await controller.restore()
    let accept!: (turn: PromptTurn) => void, requestId = ''
    vi.mocked(remote.promptStart).mockImplementation(request => { requestId = request.request_id; return new Promise(resolve => { accept = resolve }) })
    const starting = controller.start(makeBinding('prompt'))
    const running = { ...turn, request_id: requestId, turn_index: 2, status: 'running' as const, result: null }
    const completed = { ...running, status: 'succeeded' as const, result: { type: 'prompt' as const, positive_prompt: 'current result', negative_prompt: '' } }
    let finished = false
    for (const event of order) {
      if (event === 'old') controller.receiveRecords(structuredClone([turn]), new Set([turn.task_id]))
      if (event === 'accept') { accept(running); await starting }
      if (event === 'complete') { controller.receiveRecords([turn, completed], new Set([turn.task_id])); finished = true }
      if (finished) expect(controller.getSnapshot()).toMatchObject({ busy: false, turn: { request_id: requestId }, result: { positive_prompt: 'current result' } })
      else {
        expect(controller.getSnapshot().busy).toBe(true)
        expect(controller.getSnapshot().turn?.request_id).not.toBe(turn.request_id)
      }
    }
    controller.dispose()
  })
  it('keeps the local request selected while an older history read completes', async () => {
    const { controller, remote, editor, turn } = fixture()
    editor.change({ prompt_edit_task_id: turn.task_id })
    await controller.restore()
    let accept!: (turn: PromptTurn) => void, requestId = ''
    vi.mocked(remote.promptStart).mockImplementation(request => { requestId = request.request_id; return new Promise(resolve => { accept = resolve }) })
    const starting = controller.start(makeBinding('prompt'))
    await controller.restore()
    expect(controller.getSnapshot()).toMatchObject({ busy: true, turn: null, result: null })
    accept({ ...turn, request_id: requestId, turn_index: 2, status: 'running', result: null })
    await starting
    expect(controller.getSnapshot()).toMatchObject({ busy: true, turn: { request_id: requestId } })
    controller.dispose()
  })
  it('keeps the current running round when identical history is deserialized again', async () => {
    const { controller, editor, turn } = fixture()
    editor.change({ prompt_edit_task_id: turn.task_id })
    await controller.restore()
    const completed = { ...turn, candidate: { positive_prompt: 'previous completed round', negative_prompt: '' } }
    const running = { ...turn, request_id: 'current-request', turn_index: 2, status: 'running' as const, result: null, candidate: null, artifact_id: null, finished_at: null }
    controller.receiveRecords([completed, running], new Set([turn.task_id]))
    expect(controller.getSnapshot()).toMatchObject({ busy: true, turn: { request_id: 'current-request' } })
    controller.receiveRecords(structuredClone([completed, running]), new Set([turn.task_id]))
    expect(controller.getSnapshot()).toMatchObject({ busy: true, turn: { request_id: 'current-request' }, result: null })
    expect(controller.getSnapshot().turn?.status).toBe('running')
    controller.dispose()
  })
  it('keeps an interrupted notification when a delayed start cancellation returns afterward', async () => {
    const { controller, remote, turn } = fixture()
    let acceptStart!: (turn: PromptTurn) => void, finishCancel!: (turn: PromptTurn) => void
    let requestId = ''
    vi.mocked(remote.promptStart).mockImplementation(request => { requestId = request.request_id; return new Promise(resolve => { acceptStart = resolve }) })
    vi.mocked(remote.promptCancel).mockImplementation(() => new Promise(resolve => { finishCancel = resolve }))
    const starting = controller.start(makeBinding('prompt'))
    await controller.cancel()
    const running = { ...turn, request_id: requestId, status: 'running' as const, result: null }
    acceptStart(running)
    await vi.waitFor(() => expect(remote.promptCancel).toHaveBeenCalledOnce())
    const interrupted = { ...running, status: 'interrupted' as const }
    controller.receiveRecords([interrupted], new Set(['task-1']))
    expect(controller.getSnapshot().busy).toBe(false)
    finishCancel(interrupted)
    await starting
    expect(controller.getSnapshot()).toMatchObject({ busy: false, turn: { status: 'interrupted' } })
    controller.dispose()
  })
  it.each(['queued', 'submitted'] as const)('discards candidate edits in storage after a %s save', async state => {
    const { controller, remote, editor, turn } = fixture()
    const original = { positive_prompt: 'original candidate', negative_prompt: 'original negative' }
    let stored = { ...original }
    vi.mocked(remote.promptList).mockResolvedValue([{ ...turn, candidate: original }])
    editor.change({ prompt_edit_task_id: turn.task_id })
    await controller.restore()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    vi.mocked(remote.promptSaveCandidate).mockImplementation(async request => {
      if (request.positive_prompt === 'discarded candidate') await gate
      stored = { positive_prompt: request.positive_prompt, negative_prompt: request.negative_prompt }
      return { ...turn, candidate: stored }
    })
    controller.editResult({ positive_prompt: 'discarded candidate', negative_prompt: 'discarded negative' })
    if (state === 'submitted') await vi.waitFor(() => expect(remote.promptSaveCandidate).toHaveBeenCalledOnce())
    const discarding = controller.discardResult()
    release()
    await discarding
    await vi.waitFor(() => expect(controller.getSnapshot().resultSaving).toBe(false))
    expect(stored).toEqual(original)
    expect(controller.getSnapshot()).toMatchObject({ open: false, resultDirty: false, result: original })
    controller.dispose()
  })
  it('keeps discard failures visible and retries saving the original candidate', async () => {
    const { controller, remote, editor, turn } = fixture()
    const original = { positive_prompt: 'original candidate', negative_prompt: '' }
    let stored = { ...original }, release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    vi.mocked(remote.promptList).mockResolvedValue([{ ...turn, candidate: original }])
    editor.change({ prompt_edit_task_id: turn.task_id })
    await controller.restore()
    controller.open(makeBinding('prompt'))
    vi.mocked(remote.promptSaveCandidate).mockImplementationOnce(async request => { await gate; stored = { positive_prompt: request.positive_prompt, negative_prompt: request.negative_prompt }; return { ...turn, candidate: stored } })
      .mockRejectedValueOnce(new Error('恢复生成结果失败，请重试。'))
      .mockImplementation(async request => { stored = { positive_prompt: request.positive_prompt, negative_prompt: request.negative_prompt }; return { ...turn, candidate: stored } })
    controller.editResult({ positive_prompt: 'discarded candidate', negative_prompt: '' })
    await vi.waitFor(() => expect(remote.promptSaveCandidate).toHaveBeenCalledOnce())
    controller.close()
    const discarding = controller.discardResult()
    release()
    await discarding
    expect(controller.getSnapshot()).toMatchObject({ open: true, result: original, resultDirty: true, resultSaving: false, error: '恢复生成结果失败，请重试。' })
    await controller.saveAndClose()
    expect(stored).toEqual(original)
    expect(controller.getSnapshot()).toMatchObject({ open: false, resultDirty: false })
    controller.dispose()
  })
  it('isolates failed or delayed candidate writes from another historical request', async () => {
    const { controller, remote, editor, turn } = fixture()
    editor.change({ prompt_edit_task_id: turn.task_id })
    await controller.restore()
    let failSave!: (reason: Error) => void
    vi.mocked(remote.promptSaveCandidate).mockImplementationOnce(() => new Promise((_resolve, reject) => { failSave = reject }))
    controller.editResult({ positive_prompt: 'A local edit', negative_prompt: '' })
    await vi.waitFor(() => expect(remote.promptSaveCandidate).toHaveBeenCalledOnce())
    const other = { ...turn, task_id: 'task-b', request_id: 'request-b', candidate: { positive_prompt: 'B candidate', negative_prompt: '' } }
    vi.mocked(remote.promptList).mockResolvedValue([other])
    controller.open(makeBinding('prompt'), 'task-b')
    await vi.waitFor(() => expect(controller.getSnapshot().turn?.request_id).toBe('request-b'))
    failSave(new Error('A candidate write failed'))
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(controller.getSnapshot()).toMatchObject({ resultDirty: false, resultSaving: false, result: other.candidate, error: '' })
    expect(controller.hasUnpersistedCandidateChanges()).toBe(true)
    vi.mocked(remote.promptList).mockResolvedValue([turn])
    controller.open(makeBinding('prompt'), turn.task_id)
    await vi.waitFor(() => expect(controller.getSnapshot().turn?.request_id).toBe(turn.request_id))
    expect(controller.getSnapshot()).toMatchObject({ resultDirty: true, result: { positive_prompt: 'A local edit' }, error: 'A candidate write failed' })
    controller.dispose()
  })
  it.each(['acceptance-first', 'completion-first'] as const)('delivers the matching completion after closing: %s', async order => {
    const { controller, remote, turn } = fixture()
    let accept!: (turn: PromptTurn) => void
    let requestId = ''
    vi.mocked(remote.promptStart).mockImplementation(request => { requestId = request.request_id; return new Promise(resolve => { accept = resolve }) })
    const starting = controller.start(makeBinding('prompt'))
    controller.close()
    const completed = { ...turn, request_id: requestId, candidate: { positive_prompt: 'pending portrait', negative_prompt: '' } }
    if (order === 'acceptance-first') { accept({ ...completed, status: 'running', result: null }); await starting }
    controller.receiveRecords([completed], new Set(['task-1']))
    if (order === 'completion-first') { accept({ ...completed, status: 'running', result: null }); await starting }
    expect(controller.getSnapshot()).toMatchObject({ open: false, busy: false, result: { positive_prompt: 'pending portrait' } })
    controller.receiveRecords([{ ...completed, task_id: 'foreign', request_id: 'foreign-request', result: { type: 'prompt', positive_prompt: 'foreign', negative_prompt: '' } }], new Set(['task-1']))
    expect(controller.getSnapshot().result?.positive_prompt).toBe('pending portrait')
    controller.dispose()
  })
  it('persists edited candidates and serializes adoption with later input edits', async () => {
    const { controller, remote, editor, turn } = fixture()
    editor.change({ prompt_edit_task_id: turn.task_id })
    await controller.restore()
    let release!: (turn: PromptTurn) => void
    vi.mocked(remote.promptSaveCandidate).mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    controller.editResult({ positive_prompt: 'manual candidate', negative_prompt: 'blur' })
    controller.close()
    expect(controller.getSnapshot()).toMatchObject({ confirmClose: true, resultDirty: true })
    await Promise.resolve()
    const savedCandidate = { ...turn, candidate: { positive_prompt: 'manual candidate', negative_prompt: 'blur' } }
    release(savedCandidate)
    controller.receiveRecords([savedCandidate], new Set([turn.task_id]))
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    controller.continueEditing()
    let adopted!: (turn: PromptTurn) => void
    vi.mocked(remote.promptAdopt).mockImplementationOnce(() => new Promise(resolve => { adopted = resolve }))
    const adopting = controller.adopt()
    await vi.waitFor(() => expect(remote.promptAdopt).toHaveBeenCalledOnce())
    editor.change({ instructions: 'later instruction' })
    adopted(turn)
    await adopting; await editor.flush()
    expect(editor.getSnapshot()).toMatchObject({ editing: true, draft: { instructions: 'later instruction', prompt_input: { positive_prompt: 'manual candidate', negative_prompt: 'blur' } } })
    controller.dispose()
  })
  it('keeps the selected historical task when the previous restoration returns first', async () => {
    const { remote, controller, editor, turn } = fixture()
    const resolvers = new Map<string, (turns: PromptTurn[]) => void>()
    vi.mocked(remote.promptList).mockImplementation(request => new Promise(resolve => { resolvers.set(request.task_id, resolve) }))
    editor.change({ prompt_edit_task_id: 'task-a' })
    const restoringA = controller.restore()
    controller.open(makeBinding('prompt'), 'task-b')
    resolvers.get('task-a')!([{ ...turn, task_id: 'task-a', result: { type: 'prompt', positive_prompt: 'A result', negative_prompt: '' } }])
    await restoringA
    expect(controller.getSnapshot().turn?.task_id).not.toBe('task-a')
    resolvers.get('task-b')!([{ ...turn, task_id: 'task-b', result: { type: 'prompt', positive_prompt: 'B result', negative_prompt: '' } }])
    await Promise.resolve()
    expect(controller.getSnapshot()).toMatchObject({ turn: { task_id: 'task-b' }, result: { positive_prompt: 'B result' } })
    controller.setChangeRequest('继续编辑 B')
    await controller.start()
    expect(remote.promptStart).toHaveBeenLastCalledWith(expect.objectContaining({ task_id: 'task-b', input: expect.objectContaining({ positive_prompt: 'B result' }) }))
    controller.dispose()
  })
  it('invalidates earlier restoration operations when returning to the same historical task', async () => {
    const { remote, controller, editor, turn } = fixture()
    const requests: { resolve: (turns: PromptTurn[]) => void; reject: (error: Error) => void }[] = []
    vi.mocked(remote.promptList).mockImplementation(() => new Promise((resolve, reject) => { requests.push({ resolve, reject }) }))
    editor.change({ prompt_edit_task_id: 'task-a' })
    const first = controller.restore()
    controller.open(makeBinding('prompt'), 'task-b')
    controller.open(makeBinding('prompt'), 'task-a')
    requests[0].resolve([{ ...turn, task_id: 'task-a', result: { type: 'prompt', positive_prompt: 'old A result', negative_prompt: '' } }])
    requests[1].reject(new Error('B 的过期恢复错误'))
    await first; await Promise.resolve()
    expect(controller.getSnapshot()).toMatchObject({ turn: null, error: '' })
    requests[2].resolve([{ ...turn, task_id: 'task-a', result: { type: 'prompt', positive_prompt: 'selected A result', negative_prompt: '' } }])
    await Promise.resolve()
    expect(controller.getSnapshot()).toMatchObject({ turn: { task_id: 'task-a' }, result: { positive_prompt: 'selected A result' }, error: '' })
    controller.dispose()
  })
  it('keeps the selected task when another task dispatch is accepted later', async () => {
    const { remote, controller, editor, turn } = fixture()
    let finishStart!: (turn: PromptTurn) => void
    vi.mocked(remote.promptStart).mockImplementationOnce(() => new Promise(resolve => { finishStart = resolve }))
    vi.mocked(remote.promptList).mockResolvedValue([{ ...turn, task_id: 'task-b', request_id: 'request-b', result: { type: 'prompt', positive_prompt: 'B result', negative_prompt: '' } }])
    const startingA = controller.start(makeBinding('prompt'))
    controller.open(makeBinding('prompt'), 'task-b')
    await Promise.resolve()
    finishStart(turn)
    await startingA
    expect(controller.getSnapshot()).toMatchObject({ turn: { task_id: 'task-b' }, result: { positive_prompt: 'B result' } })
    expect(editor.getSnapshot().draft.prompt_edit_task_id).toBeUndefined()
    controller.dispose()
  })
  it('ignores a restoration failure after the branch draft points to another task', async () => {
    const { remote, controller, editor } = fixture()
    let rejectOld!: (error: Error) => void
    vi.mocked(remote.promptList).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject }))
    editor.change({ prompt_edit_task_id: 'task-a' })
    const restoring = controller.restore()
    editor.change({ prompt_edit_task_id: 'task-b' })
    rejectOld(new Error('A 的过期恢复错误'))
    await restoring
    expect(controller.getSnapshot()).toMatchObject({ error: '', turn: null })
    controller.dispose()
  })
  it('restores the last persisted adopted result and keeps the opinion after closing and reopening', async () => {
    const { editor, controller, remote, turn } = fixture()
    editor.change({ prompt_edit_task_id: 'task-1', prompt_change_request: '本轮意见' })
    vi.mocked(remote.promptList).mockResolvedValue([{ ...turn, adopted: { positive_prompt: 'adopted manual', negative_prompt: '' } }])
    await controller.restore()
    controller.open(makeBinding('prompt')); controller.setChangeRequest('继续保留')
    controller.close(); controller.open(makeBinding('prompt'))
    expect(controller.getSnapshot()).toMatchObject({ open: true, changeRequest: '继续保留', result: { positive_prompt: 'adopted manual' } })
    controller.editResult({ positive_prompt: 'latest manual', negative_prompt: '' })
    await vi.waitFor(() => expect(controller.getSnapshot().resultSaving).toBe(false))
    await controller.adopt()
    expect(editor.getSnapshot().draft.prompt_input.positive_prompt).toBe('latest manual')
    controller.dispose()
  })
  it('rejects missing requirements, a missing base model and an empty revision opinion before dispatch', async () => {
    const { editor, remote, controller } = fixture()
    editor.change({ base_model_id: null })
    await controller.start(makeBinding('prompt'))
    expect(controller.getSnapshot().error).toBe('请先选择底模。')
    editor.change({ base_model_id: '1' }, { originalRequest: ' ' })
    await controller.start(makeBinding('prompt'))
    expect(controller.getSnapshot().error).toBe('请填写原始需求。')
    editor.change({ prompt_input: { positive_prompt: 'portrait', negative_prompt: '' } }, { originalRequest: '肖像' })
    controller.open(makeBinding('prompt')); await controller.start()
    expect(controller.getSnapshot()).toMatchObject({ open: true, error: '请填写改动意见。' })
    expect(remote.promptStart).not.toHaveBeenCalled()
    controller.dispose()
  })
  it('reports restore failures and ignores results delivered after disposal', async () => {
    const { remote, controller, editor } = fixture()
    editor.change({ prompt_edit_task_id: 'task-1' })
    vi.mocked(remote.promptList).mockRejectedValueOnce('offline')
    await controller.restore()
    expect(controller.getSnapshot().error).toBe('提示词请求失败，请重试。')
    let release!: (value: PromptTurn[]) => void
    vi.mocked(remote.promptList).mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const restoring = controller.restore()
    controller.dispose(); release([fixture().turn])
    await restoring
    expect(controller.getSnapshot().turn).toBe(null)
  })
})

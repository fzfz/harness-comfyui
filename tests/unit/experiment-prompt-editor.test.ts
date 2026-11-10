import { describe, expect, it, vi } from 'vitest'
import { PromptEditingController } from '../../src/client/workbench/experiment-prompt-editor.ts'
import { PreparationEditor } from '../../src/client/workbench/experiment-preparation.ts'
import { makeBranch, makeBinding } from './experiment-workbench-fixtures.ts'
import type { PromptTurn } from '../../src/workbench/prompt-edit.ts'
import type { PromptEditingRemote } from '../../src/client/workbench/experiment-prompt-editor.ts'
import { DEFAULT_PROMPT_REQUEST_PARTS } from '../../src/workbench/request-template.ts'

function fixture(pollIntervalMs = 500) {
  const branch = makeBranch('source', null)
  branch.draft.prompt_input = { positive_prompt: '', negative_prompt: '' }
  const editor = new PreparationEditor(branch, { edit: async (_before, draft) => draft, save: async () => {}, onError: () => {} })
  const turn: PromptTurn = { request_id: 'request-1', task_id: 'task-1', turn_index: 1, function_id: 'prompt', kind: 'prompt', session_id: 'session-1', harness_turn: 1, preset_id: 'preset',
    agent_model: { provider: 'lan-gpt', model: 'gpt-6.1-terra', reasoningEffort: 'low' }, input: { base_model_id: '1', base_model_name: 'SDXL', original_request: '肖像', change_request: '', positive_prompt: '', negative_prompt: '', reference_context: {} },
    request_template: '{{requirements_block}}', request_parts: DEFAULT_PROMPT_REQUEST_PARTS, request_text: '肖像', status: 'succeeded', error: null, result: { type: 'prompt', positive_prompt: 'portrait', negative_prompt: '' }, artifact_id: 'artifact', adopted: null, applied_at: null, created_at: 1, finished_at: 2, start_seq: 0 }
  const remote: PromptEditingRemote = { promptStart: vi.fn(async () => turn), promptGet: vi.fn(async () => turn), promptList: vi.fn(async () => [turn]), promptCancel: vi.fn(async () => ({ ...turn, status: 'interrupted' as const, result: null })), promptAdopt: vi.fn(async request => ({ ...turn, adopted: { positive_prompt: request.positive_prompt, negative_prompt: request.negative_prompt } })) }
  const controller = new PromptEditingController({ workspace_id: 'workspace-a', work_id: 'work-a', branch_id: 'source' }, remote, editor, pollIntervalMs)
  return { branch, editor, turn, remote, controller }
}

describe('prompt editing at the source branch', () => {
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
  it('ignores a previous task lookup failure after another task is selected', async () => {
    vi.useFakeTimers()
    const { remote, controller, turn } = fixture()
    let rejectLookup!: (error: Error) => void
    vi.mocked(remote.promptStart).mockResolvedValue({ ...turn, status: 'running', result: null })
    vi.mocked(remote.promptGet).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectLookup = reject }))
    vi.mocked(remote.promptList).mockResolvedValue([{ ...turn, task_id: 'task-b', request_id: 'request-b', result: { type: 'prompt', positive_prompt: 'B result', negative_prompt: '' } }])
    await controller.start(makeBinding('prompt'))
    await vi.advanceTimersByTimeAsync(500)
    controller.open(makeBinding('prompt'), 'task-b')
    await Promise.resolve()
    rejectLookup(new Error('A 的过期查询错误'))
    await Promise.resolve()
    await Promise.resolve()
    expect(controller.getSnapshot()).toMatchObject({ error: '', turn: { task_id: 'task-b' }, result: { positive_prompt: 'B result' } })
    controller.dispose(); vi.useRealTimers()
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
    expect(editor.getSnapshot().draft.prompt_edit_task_id).toBe('task-b')
    controller.dispose()
  })
  it.each(['cancel', 'adopt'] as const)('keeps the selected task when a previous %s operation completes', async operation => {
    const { remote, controller, editor, turn } = fixture()
    if (operation === 'cancel') vi.mocked(remote.promptStart).mockResolvedValue({ ...turn, status: 'running', result: null })
    await controller.start(makeBinding('prompt'))
    const before = structuredClone(editor.getSnapshot().draft.prompt_input)
    let finish!: (turn: PromptTurn) => void
    vi.mocked(operation === 'cancel' ? remote.promptCancel : remote.promptAdopt).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = operation === 'cancel' ? controller.cancel() : controller.adopt()
    vi.mocked(remote.promptList).mockResolvedValue([{ ...turn, task_id: 'task-b', request_id: 'request-b', result: { type: 'prompt', positive_prompt: 'B result', negative_prompt: '' } }])
    controller.open(makeBinding('prompt'), 'task-b')
    await Promise.resolve()
    finish({ ...turn, status: operation === 'cancel' ? 'interrupted' : 'succeeded' })
    await pending
    expect(controller.getSnapshot()).toMatchObject({ turn: { task_id: 'task-b' }, result: { positive_prompt: 'B result' } })
    expect(editor.getSnapshot().draft.prompt_edit_task_id).toBe('task-b')
    expect(editor.getSnapshot().draft.prompt_input).toEqual(before)
    controller.dispose()
  })
  it.each(['start', 'cancel', 'adopt', 'automatic-adopt'] as const)('ignores a previous task %s failure after another task is selected', async operation => {
    const { remote, controller, turn } = fixture()
    let rejectOld!: (error: Error) => void
    if (operation === 'cancel') vi.mocked(remote.promptStart).mockResolvedValue({ ...turn, status: 'running', result: null })
    if (operation === 'start' || operation === 'automatic-adopt') {
      vi.mocked(operation === 'start' ? remote.promptStart : remote.promptAdopt).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject }))
    }
    const start = controller.start(makeBinding('prompt'))
    if (operation !== 'start') await start
    let pending = start
    if (operation === 'cancel' || operation === 'adopt') {
      vi.mocked(operation === 'cancel' ? remote.promptCancel : remote.promptAdopt).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject }))
      pending = operation === 'cancel' ? controller.cancel() : controller.adopt()
    }
    vi.mocked(remote.promptList).mockResolvedValue([{ ...turn, task_id: 'task-b', request_id: 'request-b', result: { type: 'prompt', positive_prompt: 'B result', negative_prompt: '' } }])
    controller.open(makeBinding('prompt'), 'task-b')
    await Promise.resolve()
    rejectOld(new Error('A 的过期操作错误'))
    await pending; await Promise.resolve()
    expect(controller.getSnapshot()).toMatchObject({ error: '', turn: { task_id: 'task-b' }, result: { positive_prompt: 'B result' } })
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
  it('uses the injected refresh interval for prompt status requests', async () => {
    vi.useFakeTimers()
    const { remote, controller, turn } = fixture(750)
    vi.mocked(remote.promptStart).mockResolvedValue({ ...turn, status: 'running', result: null })
    await controller.start(makeBinding('prompt'))
    await vi.advanceTimersByTimeAsync(749)
    expect(remote.promptGet).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(remote.promptGet).toHaveBeenCalledOnce()
    controller.dispose(); vi.useRealTimers()
  })

  it('uses unsaved requirements and preserves text edited while a request is running', async () => {
    const branch = makeBranch('source', null)
    branch.draft.prompt_input = { positive_prompt: '', negative_prompt: '' }
    const editor = new PreparationEditor(branch, { edit: async (_before, draft) => draft, save: async () => {}, onError: () => {} })
    editor.change({}, { originalRequest: '未保存的侧光肖像' })
    let finish!: (value: any) => void
    const remote = { promptStart: vi.fn((_request: unknown) => new Promise<any>(resolve => { finish = resolve })), promptGet: vi.fn(), promptList: vi.fn(), promptCancel: vi.fn(), promptAdopt: vi.fn() }
    const controller = new PromptEditingController({ workspace_id: 'workspace-a', work_id: 'work-a', branch_id: 'source' }, remote, editor, 500)
    const pending = controller.start(makeBinding('prompt'))
    expect(remote.promptStart.mock.calls[0][0]).toMatchObject({ input: { original_request: '未保存的侧光肖像', positive_prompt: '' } })
    editor.change({ prompt_input: { positive_prompt: '我的手改', negative_prompt: 'blur' } })
    finish({ request_id: 'request-1', task_id: 'task-1', status: 'succeeded', input: { positive_prompt: '', negative_prompt: '' }, result: { type: 'prompt', positive_prompt: 'side lighting portrait', negative_prompt: '' } })
    await pending
    expect(editor.getSnapshot().draft.prompt_input.positive_prompt).toBe('我的手改')
    expect(controller.getSnapshot()).toMatchObject({ open: true, result: { positive_prompt: 'side lighting portrait' } })
    controller.dispose()
  })
  it('fills unchanged empty text and records automatic adoption without saving generation inputs', async () => {
    const { controller, editor, remote } = fixture()
    const before = structuredClone(editor.getSnapshot().draft.generation_input)
    const notify = vi.fn(), unsubscribe = controller.subscribe(notify)
    await controller.start(makeBinding('prompt'))
    expect(editor.getSnapshot().draft.prompt_input).toEqual({ positive_prompt: 'portrait', negative_prompt: '' })
    expect(editor.getSnapshot().draft.generation_input).toEqual(before)
    expect(remote.promptAdopt).toHaveBeenCalledWith(expect.objectContaining({ positive_prompt: 'portrait' }))
    expect(notify).toHaveBeenCalled()
    unsubscribe(); controller.dispose()
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
  it('preserves failed dispatch and adoption errors for retry', async () => {
    const { remote, controller } = fixture()
    vi.mocked(remote.promptStart).mockRejectedValueOnce(new Error('请求中断，请重试。'))
    await controller.start(makeBinding('prompt'))
    expect(controller.getSnapshot()).toMatchObject({ busy: false, error: '请求中断，请重试。' })
    await controller.start(makeBinding('prompt'))
    vi.mocked(remote.promptAdopt).mockRejectedValueOnce(new Error('采用失败，请重试。'))
    await controller.adopt()
    expect(controller.getSnapshot().error).toBe('采用失败，请重试。')
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
  it('keeps a running request retryable after lookup and stop failures and reports a failed automatic adoption', async () => {
    vi.useFakeTimers()
    const { remote, controller, turn } = fixture()
    vi.mocked(remote.promptStart).mockResolvedValue({ ...turn, status: 'running', result: null })
    vi.mocked(remote.promptGet).mockRejectedValueOnce(new Error('查询暂时断开，请重试。')).mockResolvedValue(turn)
    vi.mocked(remote.promptCancel).mockRejectedValueOnce(new Error('停止暂时失败，请重试。'))
    vi.mocked(remote.promptAdopt).mockRejectedValueOnce(new Error('采用记录保存失败，请重试。'))
    await controller.start(makeBinding('prompt'))
    await controller.cancel()
    expect(controller.getSnapshot()).toMatchObject({ busy: true, error: '停止暂时失败，请重试。' })
    await vi.advanceTimersByTimeAsync(500)
    expect(controller.getSnapshot()).toMatchObject({ busy: true, error: '查询暂时断开，请重试。' })
    await vi.advanceTimersByTimeAsync(500)
    expect(controller.getSnapshot()).toMatchObject({ busy: false, error: '采用记录保存失败，请重试。' })
    controller.dispose(); vi.useRealTimers()
  })
  it('accepts stopping before dispatch returns and preserves the interrupted request identity', async () => {
    const { remote, controller, turn } = fixture()
    let release!: (value: PromptTurn) => void
    vi.mocked(remote.promptStart).mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const pending = controller.start(makeBinding('prompt'))
    await controller.cancel()
    release({ ...turn, status: 'running', result: null })
    await pending
    expect(remote.promptCancel).toHaveBeenCalledWith({ workspace_id: 'workspace-a', request_id: turn.request_id })
    expect(controller.getSnapshot()).toMatchObject({ busy: false, turn: { status: 'interrupted' } })
    controller.dispose()
  })
})

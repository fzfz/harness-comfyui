import React, { useSyncExternalStore } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { ExperimentPromptDialog, PromptTaskTurns } from '../../src/client/workbench/experiment-prompt-dialog.tsx'
import { PromptEditingController, type PromptEditingRemote } from '../../src/client/workbench/experiment-prompt-editor.ts'
import { PreparationEditor } from '../../src/client/workbench/experiment-preparation.ts'
import { makeBranch, makeBinding } from './experiment-workbench-fixtures.ts'
import { DEFAULT_PROMPT_REQUEST_PARTS } from '../../src/workbench/request-template.ts'
import { WorkbenchDeliveryContext } from '../../src/client/workbench/experiment-delivery.tsx'
import type { PromptTurn } from '../../src/workbench/prompt-edit.ts'

const { act, create } = await vi.importActual<any>('react-test-renderer')
const mounts: any[] = []
afterEach(async () => { await act(() => { for (const renderer of mounts.splice(0)) renderer.unmount() }); vi.useRealTimers(); vi.unstubAllGlobals() })
const nodeText = (node: any): string => node.children.map((child: any) => typeof child === 'string' ? child : nodeText(child)).join('')
const click = async (renderer: any, label: string) => act(() => { renderer.root.findAllByType('button').find((button: any) => nodeText(button) === label).props.onClick() })
const turn: PromptTurn = {
  request_id: 'request-1', task_id: 'task-1', turn_index: 1, function_id: 'prompt', kind: 'prompt', intent: 'rewrite', candidate: null, session_id: 'session-1', harness_turn: 1,
  preset_id: 'preset', agent_model: { provider: 'lan-gpt', model: 'gpt-6.1-terra', reasoningEffort: 'low' },
  input: { original_request: '侧光肖像', base_model_id: '1', base_model_name: 'SDXL', positive_prompt: 'old positive', negative_prompt: 'old negative', change_request: '增加侧光', reference_context: {} },
  request_template: '{{requirements_block}}', request_parts: DEFAULT_PROMPT_REQUEST_PARTS, request_text: '侧光肖像', status: 'succeeded', error: null,
  result: { type: 'prompt', positive_prompt: 'new positive', negative_prompt: 'new negative' }, artifact_id: 'artifact-1', adopted: null, applied_at: null,
  created_at: 1000, finished_at: 2000, start_seq: 0,
}

async function comparisonFixture(status: 'running' | 'succeeded') {
  vi.stubGlobal('document', new EventTarget())
  const current: PromptTurn = { ...turn, status, result: status === 'succeeded' ? turn.result : null,
    candidate: status === 'succeeded' ? { positive_prompt: 'new positive', negative_prompt: 'new negative' } : null }
  const editor = new PreparationEditor(makeBranch('source', null), { edit: async (_expected, draft) => draft, save: async () => {}, onError: vi.fn() })
  const api: PromptEditingRemote = { promptStart: vi.fn(), promptGet: vi.fn(), promptList: vi.fn(async () => [current]),
    promptCancel: vi.fn(async () => ({ ...current, status: 'interrupted' as const, result: null })),
    promptSaveCandidate: vi.fn(async request => ({ ...current, candidate: { positive_prompt: request.positive_prompt, negative_prompt: request.negative_prompt } })), promptAdopt: vi.fn() }
  const controller = new PromptEditingController({ workspace_id: 'workspace', work_id: 'work', branch_id: 'source' }, api, editor)
  editor.change({ prompt_edit_task_id: current.task_id })
  await controller.restore()
  controller.open(makeBinding('prompt'))
  const translations = { translateStart: vi.fn(async (request: { request_id: string }) => ({ request_id: request.request_id, status: 'running' as const })), translateGet: vi.fn(), translateCancel: vi.fn() }
  function Dialog() {
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
    return state.open ? <ExperimentPromptDialog controller={controller} state={state} workspaceId="workspace" workId="work" branchId="source" originalRequest="肖像" baseModelName="SDXL" remote={translations} /> : null
  }
  let renderer: any
  await act(() => { renderer = create(<Dialog />) }); mounts.push(renderer)
  return { controller, renderer, api, current }
}

it('saves failed local result edits from the close confirmation before closing', async () => {
  const { controller, renderer, api } = await comparisonFixture('succeeded')
  vi.mocked(api.promptSaveCandidate).mockRejectedValueOnce(new Error('生成结果保存失败'))
  await act(() => renderer.root.findByProps({ 'aria-label': '生成的正向提示词' }).props.onChange({ target: { value: 'manual result to save' } }))
  await vi.waitFor(() => expect(controller.getSnapshot().error).toBe('生成结果保存失败'))
  await click(renderer, '关闭')
  expect(renderer.root.findByProps({ role: 'alertdialog' })).toBeDefined()
  await click(renderer, '保存生成结果')
  await vi.waitFor(() => expect(controller.getSnapshot().open).toBe(false))
  expect(api.promptSaveCandidate).toHaveBeenCalledTimes(2)
  expect(api.promptSaveCandidate).toHaveBeenLastCalledWith({ workspace_id: 'workspace', request_id: turn.request_id, positive_prompt: 'manual result to save', negative_prompt: 'new negative' })
  expect(api.promptAdopt).not.toHaveBeenCalled()
  controller.dispose()
})

it('stops the displayed running request and renders its persisted interruption notification', async () => {
  const { controller, renderer, api, current } = await comparisonFixture('running')
  await click(renderer, '停止')
  expect(api.promptCancel).toHaveBeenCalledExactlyOnceWith({ workspace_id: 'workspace', request_id: current.request_id })
  expect(controller.getSnapshot().busy).toBe(true)
  await act(() => controller.receiveRecords([{ ...current, status: 'interrupted' }], new Set([current.task_id])))
  expect(nodeText(renderer.root)).toContain('提示词请求已停止。')
  expect(controller.getSnapshot().busy).toBe(false)
  controller.dispose()
})

it('keeps a previous translation visible after the comparison result changes', async () => {
  vi.stubGlobal('document', new EventTarget())
  const branch = makeBranch('source', null)
  const editor = new PreparationEditor(branch, { edit: async (_expected, draft) => draft, save: async () => {}, onError: vi.fn() })
  const completed = { ...turn, input: { ...turn.input, negative_prompt: '' }, result: { ...turn.result!, negative_prompt: '' } }
  const api: PromptEditingRemote = { promptStart: vi.fn(), promptGet: vi.fn(), promptList: vi.fn(async () => [completed]), promptCancel: vi.fn(), promptSaveCandidate: vi.fn(), promptAdopt: vi.fn() }
  const controller = new PromptEditingController({ workspace_id: 'workspace', work_id: 'work', branch_id: 'source' }, api, editor)
  editor.change({ prompt_edit_task_id: completed.task_id })
  await controller.restore()
  controller.open(makeBinding('prompt'))
  const record = { request_id: 'translation-a', workspace_id: 'workspace', work_id: 'work', branch_id: 'source', field: 'positive_prompt' as const, source_text: 'old positive', text: '原提示词译文', status: 'succeeded' as const, session_id: 'translation-session', harness_turn: 1, start_seq: 0, created_at: 1, finished_at: 2 }
  const failed = { ...record, request_id: 'failed-translation', status: 'failed' as const, text: undefined, error: '翻译连接失败', created_at: 0 }
  const remote = { translateStart: vi.fn(async (request: import('../../src/workbench/translation.ts').TranslationRequest) => ({ request_id: request.request_id, status: 'running' as const })), translateGet: vi.fn(), translateCancel: vi.fn() }
  let renderer: any
  await act(() => { renderer = create(<WorkbenchDeliveryContext.Provider value={{ promptTurns: [], translations: [failed, record] }}>
    <ExperimentPromptDialog controller={controller} state={controller.getSnapshot()} workspaceId="workspace" workId="work" branchId="source" originalRequest="肖像" baseModelName="SDXL" remote={remote} />
  </WorkbenchDeliveryContext.Provider>) }); mounts.push(renderer)
  expect(remote.translateStart).not.toHaveBeenCalled()
  const after = renderer.root.findAllByProps({ className: 'prompt-translation' })[1]
  expect(nodeText(after)).toContain('old positive')
  expect(nodeText(after)).toContain('原提示词译文')
  await act(() => after.findByProps({ 'aria-label': '翻译记录' }).props.onChange({ target: { value: failed.request_id } }))
  expect(nodeText(after)).toContain('翻译连接失败')
  await act(() => after.findAllByType('button').find((button: any) => nodeText(button) === '重试翻译').props.onClick())
  expect(remote.translateStart).toHaveBeenCalledWith(expect.objectContaining({ source_text: 'old positive' }))
  await act(() => after.findAllByType('button').find((button: any) => nodeText(button) === '翻译当前提示词').props.onClick())
  expect(remote.translateStart).toHaveBeenCalledWith(expect.objectContaining({ source_text: 'new positive' }))
  controller.dispose()
})

it('shows persisted request input, reply and adopted text across task refreshes', async () => {
  vi.useFakeTimers(); vi.stubGlobal('document', new EventTarget())
  const remote = { promptCancel: vi.fn(async () => ({ ...turn, status: 'interrupted' as const })), promptList: vi.fn().mockResolvedValue([{ ...turn, adopted: { positive_prompt: 'manual', negative_prompt: '' } }]) }
  let renderer: any
  await act(() => { renderer = create(<PromptTaskTurns workspaceId="workspace" taskId="task-1" remote={remote} />) }); mounts.push(renderer)
  expect(nodeText(renderer.root)).toContain('已完成')
  await act(() => vi.advanceTimersByTimeAsync(749))
  expect(remote.promptList).toHaveBeenCalledTimes(1)
  await act(() => vi.advanceTimersByTimeAsync(1))
  expect(nodeText(renderer.root)).toContain('原始需求侧光肖像')
  expect(nodeText(renderer.root)).toContain('输入提示词正向提示词old positive负向提示词old negative')
  expect(nodeText(renderer.root)).toContain('Agent 回复正向提示词new positive负向提示词new negative')
  expect(nodeText(renderer.root)).toContain('实际采用内容正向提示词manual负向提示词未填写')
  remote.promptList.mockRejectedValueOnce(new Error('读取记录失败，请刷新。'))
  await act(() => renderer.update(<PromptTaskTurns workspaceId="workspace" taskId="task-2" remote={remote} />))
  expect(nodeText(renderer.root)).toContain('读取记录失败，请刷新。')
})

it('stops the active prompt request from its task card and preserves earlier turns after a failed stop retry', async () => {
  vi.stubGlobal('document', new EventTarget())
  const active = { ...turn, request_id: 'request-2', turn_index: 2, status: 'running' as const, result: null }
  const remote = {
    promptList: vi.fn(async () => [turn, active]),
    promptCancel: vi.fn().mockRejectedValueOnce(new Error('停止请求失败，请重试。')).mockResolvedValue({ ...active, status: 'interrupted' }),
  }, edit = vi.fn()
  let renderer: any
  await act(() => { renderer = create(<PromptTaskTurns workspaceId="workspace" taskId="task-1" remote={remote} onEdit={edit} />) }); mounts.push(renderer)
  await click(renderer, '编辑提示词'); expect(edit).toHaveBeenCalledOnce()
  await click(renderer, '停止')
  expect(nodeText(renderer.root)).toContain('停止请求失败，请重试。')
  await click(renderer, '停止')
  expect(remote.promptCancel).toHaveBeenLastCalledWith({ workspace_id: 'workspace', request_id: 'request-2' })
  expect(nodeText(renderer.root)).toContain('第 1 轮 · 已完成')
  expect(nodeText(renderer.root)).toContain('第 2 轮 · 已停止')
})

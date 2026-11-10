import React, { useSyncExternalStore } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { ExperimentPromptDialog, PromptTaskTurns } from '../../src/client/workbench/experiment-prompt-dialog.tsx'
import { PromptEditingController, type PromptEditingRemote } from '../../src/client/workbench/experiment-prompt-editor.ts'
import { PreparationEditor } from '../../src/client/workbench/experiment-preparation.ts'
import { makeBranch, makeBinding } from './experiment-workbench-fixtures.ts'
import { DEFAULT_PROMPT_REQUEST_PARTS } from '../../src/workbench/request-template.ts'
import type { PromptTurn } from '../../src/workbench/prompt-edit.ts'

const { act, create } = await vi.importActual<any>('react-test-renderer')
const mounts: any[] = []
afterEach(async () => { await act(() => { for (const renderer of mounts.splice(0)) renderer.unmount() }); vi.useRealTimers(); vi.unstubAllGlobals() })
const nodeText = (node: any): string => node.children.map((child: any) => typeof child === 'string' ? child : nodeText(child)).join('')
const click = async (renderer: any, label: string) => act(() => { renderer.root.findAllByType('button').find((button: any) => nodeText(button) === label).props.onClick() })
const turn: PromptTurn = {
  request_id: 'request-1', task_id: 'task-1', turn_index: 1, function_id: 'prompt', kind: 'prompt', session_id: 'session-1', harness_turn: 1,
  preset_id: 'preset', agent_model: { provider: 'lan-gpt', model: 'gpt-6.1-terra', reasoningEffort: 'low' },
  input: { original_request: '侧光肖像', base_model_id: '1', base_model_name: 'SDXL', positive_prompt: 'old positive', negative_prompt: 'old negative', change_request: '增加侧光', reference_context: {} },
  request_template: '{{requirements_block}}', request_parts: DEFAULT_PROMPT_REQUEST_PARTS, request_text: '侧光肖像', status: 'succeeded', error: null,
  result: { type: 'prompt', positive_prompt: 'new positive', negative_prompt: 'new negative' }, artifact_id: 'artifact-1', adopted: null, applied_at: null,
  created_at: 1000, finished_at: 2000, start_seq: 0,
}

it('translates all four regions, retries one failure and rejects a late translation after manual source edits', async () => {
  vi.stubGlobal('document', new EventTarget())
  const branch = makeBranch('source', null)
  branch.draft.prompt_input = { positive_prompt: 'old positive', negative_prompt: 'old negative' }
  const editor = new PreparationEditor(branch, { edit: async (_before, draft) => draft, save: async () => {}, onError: () => {} })
  const api: PromptEditingRemote = { promptStart: vi.fn(async () => turn), promptGet: vi.fn(async () => turn), promptList: vi.fn(async () => [turn]), promptCancel: vi.fn(async () => ({ ...turn, status: 'interrupted' as const })), promptAdopt: vi.fn(async request => ({ ...turn, adopted: { positive_prompt: request.positive_prompt, negative_prompt: request.negative_prompt } })) }
  const controller = new PromptEditingController({ workspace_id: 'workspace', work_id: 'work', branch_id: 'source' }, api, editor, 500)
  controller.open(makeBinding('prompt')); controller.setChangeRequest('增加侧光'); await controller.start()
  let release!: (value: any) => void
  const remote = {
    translateStart: vi.fn(async (request: { request_id: string; source_text: string }) => {
      if (request.source_text === 'new positive') return new Promise<any>(resolve => { release = resolve })
      if (request.source_text === 'old negative') throw new Error('负向翻译连接失败，请重试。')
      return { request_id: request.request_id, status: 'succeeded' as const, text: '译文：' + request.source_text }
    }),
    translateGet: vi.fn(), translateCancel: vi.fn(async () => { throw new Error('已结束的翻译无法取消。') }),
  }
  function Dialog() {
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
    return state.open ? <ExperimentPromptDialog pollIntervalMs={750} controller={controller} state={state} workspaceId="workspace" originalRequest="侧光肖像" baseModelName="SDXL" remote={remote} /> : null
  }
  let renderer: any
  await act(() => { renderer = create(<Dialog />) }); mounts.push(renderer)
  expect(remote.translateStart.mock.calls.map(([request]) => request.source_text)).toEqual(['old positive', 'new positive', 'old negative', 'new negative'])
  expect(nodeText(renderer.root)).toContain('负向翻译连接失败，请重试。')
  await click(renderer, '重试翻译')
  expect(remote.translateStart.mock.calls.filter(([request]) => request.source_text === 'old negative')).toHaveLength(2)
  await act(() => renderer.root.findByProps({ 'aria-label': '生成的正向提示词' }).props.onChange({ target: { value: 'manual positive' } }))
  const late = remote.translateStart.mock.calls.find(([request]) => request.source_text === 'new positive')![0]
  await act(() => release({ request_id: late.request_id, status: 'succeeded', text: '迟到的旧译文' }))
  expect(nodeText(renderer.root)).not.toContain('迟到的旧译文')
  const positiveRegion = renderer.root.findAllByProps({ className: 'prompt-comparison-field' })[0]
  await act(() => positiveRegion.findAllByType('button').find((button: any) => nodeText(button) === '翻译').props.onClick())
  expect(remote.translateStart).toHaveBeenLastCalledWith(expect.objectContaining({ source_text: 'manual positive' }))
  expect(nodeText(renderer.root)).toContain('译文：manual positive')
  await act(() => renderer.root.findByProps({ 'aria-label': '改动意见' }).props.onChange({ target: { value: '保留手改' } }))
  await click(renderer, '采用生成结果')
  expect(api.promptAdopt).toHaveBeenCalledWith({ workspace_id: 'workspace', request_id: 'request-1', positive_prompt: 'manual positive', negative_prompt: 'new negative' })
  expect(editor.getSnapshot().draft.prompt_input).toEqual({ positive_prompt: 'manual positive', negative_prompt: 'new negative' })
  controller.dispose()
})

it('polls all four translation sources at the supplied interval', async () => {
  vi.useFakeTimers(); vi.stubGlobal('document', new EventTarget())
  const branch = makeBranch('source', null), editor = new PreparationEditor(branch, { edit: async (_before, draft) => draft, save: async () => {}, onError: () => {} })
  const api: PromptEditingRemote = { promptStart: vi.fn(async () => turn), promptGet: vi.fn(async () => turn), promptList: vi.fn(async () => [turn]), promptCancel: vi.fn(async () => turn), promptAdopt: vi.fn(async () => turn) }
  const controller = new PromptEditingController({ workspace_id: 'workspace', work_id: 'work', branch_id: 'source' }, api, editor, 750)
  controller.open(makeBinding('prompt')); controller.setChangeRequest('增加侧光'); await controller.start()
  const sources = new Map<string, string>()
  const remote = {
    translateStart: vi.fn(async request => { sources.set(request.request_id, request.source_text); return { request_id: request.request_id, status: 'running' as const } }),
    translateGet: vi.fn(async request => ({ request_id: request.request_id, status: 'succeeded' as const, text: '译文：' + sources.get(request.request_id) })),
    translateCancel: vi.fn(async () => undefined),
  }
  let renderer: any
  await act(() => { renderer = create(<ExperimentPromptDialog pollIntervalMs={750} controller={controller} state={controller.getSnapshot()} workspaceId="workspace" originalRequest="侧光肖像" baseModelName="SDXL" remote={remote} />) }); mounts.push(renderer)
  expect(remote.translateStart.mock.calls.map(([request]) => request.source_text)).toEqual(['old positive', 'new positive', 'old negative', 'new negative'])
  await act(() => vi.advanceTimersByTimeAsync(749))
  expect(remote.translateGet).not.toHaveBeenCalled()
  await act(() => vi.advanceTimersByTimeAsync(1))
  expect(remote.translateGet).toHaveBeenCalledTimes(4)
  for (const source of ['old positive', 'new positive', 'old negative', 'new negative']) expect(nodeText(renderer.root)).toContain('译文：' + source)
  controller.dispose()
})

it('keeps translation polling and failures local to each prompt region and cancels requests when closed', async () => {
  vi.useFakeTimers(); vi.stubGlobal('document', new EventTarget())
  const branch = makeBranch('source', null), editor = new PreparationEditor(branch, { edit: async (_before, draft) => draft, save: async () => {}, onError: () => {} })
  const api = { promptStart: vi.fn(async () => ({ ...turn, status: 'running' as const, result: null })), promptGet: vi.fn(async () => turn), promptList: vi.fn(async () => []), promptCancel: vi.fn(async () => ({ ...turn, status: 'interrupted' as const, result: null })), promptAdopt: vi.fn(async () => turn) }
  const controller = new PromptEditingController({ workspace_id: 'workspace', work_id: 'work', branch_id: 'source' }, api, editor, 500)
  controller.open(makeBinding('prompt')); controller.setChangeRequest('修改构图'); await controller.start()
  const remote = { translateStart: vi.fn(async request => ({ request_id: request.request_id, status: 'running' as const })), translateGet: vi.fn(async request => ({ request_id: request.request_id, status: 'succeeded' as const, text: '中文译文' })), translateCancel: vi.fn(async () => undefined) }
  function Dialog() { const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot); return state.open ? <ExperimentPromptDialog pollIntervalMs={750} controller={controller} state={state} workspaceId="workspace" originalRequest="肖像" baseModelName="SDXL" remote={remote} /> : null }
  let renderer: any
  await act(() => { renderer = create(<Dialog />) }); mounts.push(renderer)
  expect(nodeText(renderer.root)).toContain('正在改写提示词…')
  await click(renderer, '停止')
  expect(nodeText(renderer.root)).toContain('提示词请求已停止。')
  await act(() => vi.advanceTimersByTimeAsync(749))
  expect(remote.translateGet).not.toHaveBeenCalled()
  await act(() => vi.advanceTimersByTimeAsync(1))
  expect(remote.translateGet).toHaveBeenCalledTimes(2)
  expect(nodeText(renderer.root)).toContain('中文译文')
  await click(renderer, '关闭')
  expect(remote.translateCancel).toHaveBeenCalledTimes(2)
  controller.dispose()
})

it('shows persisted request input, reply and adopted text across task refreshes', async () => {
  vi.useFakeTimers(); vi.stubGlobal('document', new EventTarget())
  const remote = { promptCancel: vi.fn(async () => ({ ...turn, status: 'interrupted' as const })), promptList: vi.fn().mockResolvedValueOnce([{ ...turn, status: 'running', result: null }]).mockResolvedValue([{ ...turn, adopted: { positive_prompt: 'manual', negative_prompt: '' } }]) }
  let renderer: any
  await act(() => { renderer = create(<PromptTaskTurns pollIntervalMs={750} workspaceId="workspace" taskId="task-1" remote={remote} />) }); mounts.push(renderer)
  expect(nodeText(renderer.root)).toContain('正在执行')
  await act(() => vi.advanceTimersByTimeAsync(749))
  expect(remote.promptList).toHaveBeenCalledTimes(1)
  await act(() => vi.advanceTimersByTimeAsync(1))
  expect(nodeText(renderer.root)).toContain('原始需求侧光肖像')
  expect(nodeText(renderer.root)).toContain('输入提示词正向提示词old positive负向提示词old negative')
  expect(nodeText(renderer.root)).toContain('Agent 回复正向提示词new positive负向提示词new negative')
  expect(nodeText(renderer.root)).toContain('实际采用内容正向提示词manual负向提示词未填写')
  remote.promptList.mockRejectedValueOnce(new Error('读取记录失败，请刷新。'))
  await act(() => renderer.update(<PromptTaskTurns pollIntervalMs={750} workspaceId="workspace" taskId="task-2" remote={remote} />))
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
  await act(() => { renderer = create(<PromptTaskTurns pollIntervalMs={750} workspaceId="workspace" taskId="task-1" remote={remote} onEdit={edit} />) }); mounts.push(renderer)
  await click(renderer, '编辑提示词'); expect(edit).toHaveBeenCalledOnce()
  await click(renderer, '停止')
  expect(nodeText(renderer.root)).toContain('停止请求失败，请重试。')
  await click(renderer, '停止')
  expect(remote.promptCancel).toHaveBeenLastCalledWith({ workspace_id: 'workspace', request_id: 'request-2' })
  expect(nodeText(renderer.root)).toContain('第 1 轮 · 已完成')
  expect(nodeText(renderer.root)).toContain('第 2 轮 · 已停止')
})

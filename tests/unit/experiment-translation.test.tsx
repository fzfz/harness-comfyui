import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { act, create } from './experiment-renderer.ts'
import { ExperimentTranslationDialog } from '../../src/client/workbench/experiment-translation-dialog.tsx'
import { WorkbenchDeliveryContext } from '../../src/client/workbench/experiment-delivery.tsx'
import type { TranslationRecord } from '../../src/workbench/translation.ts'

const mounted: ReturnType<typeof create>[] = []
afterEach(async () => {
  await act(() => mounted.splice(0).forEach(item => item.unmount()))
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('receives persisted translations by request and field and leaves requests active when closed', async () => {
  vi.stubGlobal('document', new EventTarget())
  vi.useFakeTimers()
  const start = vi.fn(async (request: import('../../src/workbench/translation.ts').TranslationRequest) => ({ request_id: request.request_id, status: 'running' as const }))
  const remote = { translateStart: start, translateGet: vi.fn(), translateCancel: vi.fn() }
  const view = (translations: TranslationRecord[]) => <WorkbenchDeliveryContext.Provider value={{ promptTurns: [], translations }}>
    <ExperimentTranslationDialog workspaceId="ws-a" workId="work" branchId="source" initialField="positive_prompt" prompts={{ positive_prompt: 'glass', negative_prompt: 'blur' }} remote={remote} modelLabel="翻译模型" onClose={vi.fn()} />
  </WorkbenchDeliveryContext.Provider>
  let renderer!: ReturnType<typeof create>
  await act(() => { renderer = create(view([])) }); mounted.push(renderer)
  const result: TranslationRecord = { ...start.mock.calls[0]![0], session_id: 'session', harness_turn: 1, start_seq: 0, created_at: 1, finished_at: 2, status: 'succeeded', text: '玻璃' }
  await act(() => (renderer as unknown as { update(node: React.ReactNode): void }).update(view([result])))
  expect(JSON.stringify(renderer.toJSON())).toContain('玻璃')
  await act(() => renderer.root.findByProps({ id: 'translation-tab-negative_prompt' }).props.onClick())
  expect(start).toHaveBeenCalledTimes(2)
  await act(() => renderer.root.findByProps({ id: 'translation-tab-positive_prompt' }).props.onClick())
  expect(JSON.stringify(renderer.toJSON())).toContain('玻璃')
  await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
  expect(remote.translateGet).not.toHaveBeenCalled()
  await act(() => renderer.unmount()); mounted.pop()
  expect(remote.translateCancel).not.toHaveBeenCalled()
  await act(() => { renderer = create(view([result])) }); mounted.push(renderer)
  expect(start).toHaveBeenCalledTimes(2)
  expect(JSON.stringify(renderer.toJSON())).toContain('玻璃')
})

it('opens the latest matching translation after an earlier request failed', async () => {
  vi.stubGlobal('document', new EventTarget())
  const writeText = vi.fn(async () => undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  const request = { workspace_id: 'ws-a', work_id: 'work', branch_id: 'source', field: 'positive_prompt' as const, source_text: 'glass', session_id: 'session', harness_turn: 1, start_seq: 0 }
  const failed: TranslationRecord = { ...request, request_id: 'failed', status: 'failed', error: '首次翻译失败', created_at: 1, finished_at: 2 }
  const succeeded: TranslationRecord = { ...request, request_id: 'retried', status: 'succeeded', text: '重试译文', created_at: 3, finished_at: 4 }
  const foreign: TranslationRecord = { ...succeeded, request_id: 'foreign', branch_id: 'other', text: '其他分支译文', created_at: 5 }
  const remote = { translateStart: vi.fn(), translateGet: vi.fn(), translateCancel: vi.fn() }
  let renderer!: ReturnType<typeof create>
  await act(() => { renderer = create(<WorkbenchDeliveryContext.Provider value={{ promptTurns: [], translations: [failed, succeeded, foreign] }}>
    <ExperimentTranslationDialog workspaceId="ws-a" workId="work" branchId="source" initialField="positive_prompt" prompts={{ positive_prompt: 'glass', negative_prompt: '' }} remote={remote} modelLabel="翻译模型" onClose={vi.fn()} />
  </WorkbenchDeliveryContext.Provider>) }); mounted.push(renderer)
  expect(JSON.stringify(renderer.toJSON())).toContain('重试译文')
  expect(JSON.stringify(renderer.toJSON())).not.toContain('首次翻译失败')
  expect(JSON.stringify(renderer.toJSON())).not.toContain('其他分支译文')
  expect(remote.translateStart).not.toHaveBeenCalled()
  await act(() => renderer.root.findAllByType('button').find(button => button.children.join('') === '复制译文')!.props.onClick())
  expect(writeText).toHaveBeenCalledExactlyOnceWith('重试译文')
  expect(JSON.stringify(renderer.toJSON())).toContain('已复制')
})

it('keeps field history with its original source and translates current text only on request', async () => {
  vi.stubGlobal('document', new EventTarget())
  const request = { workspace_id: 'ws-a', work_id: 'work', branch_id: 'source', field: 'positive_prompt' as const, session_id: 'session', harness_turn: 1, start_seq: 0, status: 'succeeded' as const, finished_at: 5 }
  const first: TranslationRecord = { ...request, request_id: 'a', source_text: 'source A', text: '译文 A', created_at: 1 }
  const latest: TranslationRecord = { ...request, request_id: 'c', source_text: 'source C', text: '译文 C', created_at: 3 }
  const remote = { translateStart: vi.fn(async (request: import('../../src/workbench/translation.ts').TranslationRequest) => ({ request_id: request.request_id, status: 'running' as const })), translateGet: vi.fn(), translateCancel: vi.fn() }
  let renderer!: ReturnType<typeof create>
  await act(() => { renderer = create(<WorkbenchDeliveryContext.Provider value={{ promptTurns: [], translations: [first, latest] }}>
    <ExperimentTranslationDialog workspaceId="ws-a" workId="work" branchId="source" initialField="positive_prompt" prompts={{ positive_prompt: 'source B', negative_prompt: '' }} remote={remote} modelLabel="翻译模型" onClose={vi.fn()} />
  </WorkbenchDeliveryContext.Provider>) }); mounted.push(renderer)
  expect(remote.translateStart).not.toHaveBeenCalled()
  expect(JSON.stringify(renderer.toJSON())).toContain('source C')
  expect(JSON.stringify(renderer.toJSON())).toContain('译文 C')
  await act(() => renderer.root.findByProps({ 'aria-label': '翻译记录' }).props.onChange({ target: { value: 'a' } }))
  expect(JSON.stringify(renderer.toJSON())).toContain('source A')
  expect(JSON.stringify(renderer.toJSON())).toContain('译文 A')
  await act(() => renderer.root.findAllByType('button').find(button => button.children.join('') === '翻译当前提示词')!.props.onClick())
  expect(remote.translateStart).toHaveBeenCalledWith(expect.objectContaining({ source_text: 'source B' }))
  expect(remote.translateGet).not.toHaveBeenCalled()
})

it('shows stored field history after the current input was cleared', async () => {
  vi.stubGlobal('document', new EventTarget())
  const record: TranslationRecord = { request_id: 'negative-a', workspace_id: 'ws-a', work_id: 'work', branch_id: 'source', field: 'negative_prompt', source_text: 'old negative source', text: '负向历史译文', status: 'succeeded', session_id: 'session', harness_turn: 1, start_seq: 0, created_at: 1, finished_at: 2 }
  const remote = { translateStart: vi.fn(), translateGet: vi.fn(), translateCancel: vi.fn() }
  let renderer!: ReturnType<typeof create>
  await act(() => { renderer = create(<WorkbenchDeliveryContext.Provider value={{ promptTurns: [], translations: [record] }}>
    <ExperimentTranslationDialog workspaceId="ws-a" workId="work" branchId="source" initialField="negative_prompt" prompts={{ positive_prompt: '', negative_prompt: '' }} remote={remote} modelLabel="翻译模型" onClose={vi.fn()} />
  </WorkbenchDeliveryContext.Provider>) }); mounted.push(renderer)
  expect(renderer.root.findByProps({ id: 'translation-tab-negative_prompt' }).props.disabled).toBe(false)
  expect(JSON.stringify(renderer.toJSON())).toContain('old negative source')
  expect(JSON.stringify(renderer.toJSON())).toContain('负向历史译文')
  expect(remote.translateStart).not.toHaveBeenCalled()
})

it('closes with Escape and retries the unchanged source after a dispatch error', async () => {
  const document = new EventTarget()
  vi.stubGlobal('document', document)
  const onClose = vi.fn(), start = vi.fn().mockRejectedValueOnce(new Error('连接失败，请重试。')).mockResolvedValue({ request_id: 'accepted', status: 'running' })
  const remote = { translateStart: start, translateGet: vi.fn(), translateCancel: vi.fn() }
  let renderer!: ReturnType<typeof create>
  await act(() => { renderer = create(<ExperimentTranslationDialog workspaceId="ws-a" workId="work" branchId="source" initialField="positive_prompt" prompts={{ positive_prompt: 'morning light', negative_prompt: '' }} remote={remote} modelLabel="翻译模型" onClose={onClose} />) }); mounted.push(renderer)
  expect(JSON.stringify(renderer.toJSON())).toContain('连接失败，请重试。')
  await act(() => renderer.root.findAllByType('button').find(item => item.children.join('') === '重试')!.props.onClick())
  expect(start.mock.calls.map(([request]) => request.source_text)).toEqual(['morning light', 'morning light'])
  await act(() => { document.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' })) })
  expect(onClose).toHaveBeenCalledOnce()
})

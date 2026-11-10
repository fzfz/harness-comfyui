import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { act, create } from './experiment-renderer.ts'
import { ExperimentTranslationDialog } from '../../src/client/workbench/experiment-translation-dialog.tsx'

const mounted: ReturnType<typeof create>[] = []
afterEach(async () => {
  await act(() => mounted.splice(0).forEach(item => item.unmount()))
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('keeps translations with their prompt tabs and cancels pending requests on close', async () => {
  vi.stubGlobal('document', new EventTarget())
  vi.useFakeTimers()
  const start = vi.fn(async (request: { request_id: string }) => ({ request_id: request.request_id, status: 'running' as const }))
  const get = vi.fn(async (request: { request_id: string }) => ({ request_id: request.request_id, status: 'succeeded' as const, text: request.request_id === start.mock.calls[0]?.[0].request_id ? '正向译文' : '负向译文' }))
  const cancel = vi.fn(async () => undefined)
  let renderer!: ReturnType<typeof create>
  await act(async () => {
    renderer = create(<ExperimentTranslationDialog workspaceId="ws-a" initialField="positive_prompt"
      prompts={{ positive_prompt: '(glass:1.2)\n<lora:light:0.7>', negative_prompt: 'blur' }}
      remote={{ translateStart: start, translateGet: get, translateCancel: cancel }}
      modelLabel="翻译预设 · LAN GPT / gpt-6-luna / off" onClose={vi.fn()} />)
  })
  mounted.push(renderer)
  expect(start.mock.calls[0]?.[0]).toMatchObject({ workspace_id: 'ws-a', source_text: '(glass:1.2)\n<lora:light:0.7>' })
  await act(async () => { await vi.advanceTimersByTimeAsync(500) })
  expect(JSON.stringify(renderer.toJSON())).toContain('正向译文')
  await act(async () => renderer.root.findByProps({ id: 'translation-tab-negative_prompt' }).props.onClick())
  expect(start).toHaveBeenCalledTimes(2)
  await act(async () => renderer.root.findByProps({ id: 'translation-tab-positive_prompt' }).props.onClick())
  expect(JSON.stringify(renderer.toJSON())).toContain('正向译文')
  await act(async () => renderer.unmount())
  expect(cancel).toHaveBeenCalledWith({ request_id: start.mock.calls[1]?.[0].request_id })
  expect(cancel).toHaveBeenCalledWith({ request_id: start.mock.calls[0]?.[0].request_id })
})

it('shows a failed request, retries the same exact source and copies only the completed translation', async () => {
  vi.stubGlobal('document', new EventTarget())
  const writeText = vi.fn(async () => undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  const start = vi.fn().mockRejectedValueOnce(new Error('连接失败，请重试。')).mockImplementation(async request => ({ request_id: request.request_id, status: 'succeeded', text: '玻璃花房' }))
  let renderer!: ReturnType<typeof create>
  await act(async () => { renderer = create(<ExperimentTranslationDialog workspaceId="ws" initialField="positive_prompt" prompts={{ positive_prompt: '(glass:1.2)\n<lora:light:0.7>', negative_prompt: '' }} remote={{ translateStart: start, translateGet: vi.fn(), translateCancel: vi.fn(async () => undefined) }} modelLabel="翻译预设" onClose={vi.fn()} />) })
  mounted.push(renderer)
  expect(JSON.stringify(renderer.toJSON())).toContain('连接失败，请重试。')
  expect(renderer.root.findByProps({ id: 'translation-tab-negative_prompt' }).props.disabled).toBe(true)
  await act(async () => renderer.root.findAllByType('button').find(item => item.children.join('') === '重试')!.props.onClick())
  expect(start.mock.calls.map(([request]) => request.source_text)).toEqual(['(glass:1.2)\n<lora:light:0.7>', '(glass:1.2)\n<lora:light:0.7>'])
  await act(async () => renderer.root.findAllByType('button').find(item => item.children.join('') === '复制译文')!.props.onClick())
  expect(writeText).toHaveBeenCalledWith('玻璃花房')
  expect(JSON.stringify(renderer.toJSON())).toContain('已复制')
})

it('closes with Escape and contains cancellation failures while a translation is pending', async () => {
  const document = new EventTarget()
  vi.stubGlobal('document', document)
  const onClose = vi.fn(), cancel = vi.fn(async () => { throw new Error('服务已断开') })
  const start = vi.fn(async (request: { request_id: string }) => ({ request_id: request.request_id, status: 'running' as const }))
  let renderer!: ReturnType<typeof create>
  await act(async () => { renderer = create(<ExperimentTranslationDialog workspaceId="workspace" initialField="positive_prompt" prompts={{ positive_prompt: 'morning light', negative_prompt: '' }} remote={{ translateStart: start, translateGet: vi.fn(), translateCancel: cancel }} modelLabel="翻译模型" onClose={onClose} />) })
  mounted.push(renderer)
  await act(() => { document.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Enter' })) })
  expect(onClose).not.toHaveBeenCalled()
  await act(() => { document.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' })) })
  expect(onClose).toHaveBeenCalledOnce()
  await act(async () => renderer.unmount())
  expect(cancel).toHaveBeenCalledWith({ request_id: start.mock.calls[0]![0].request_id })
  document.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }))
  expect(onClose).toHaveBeenCalledOnce()
})

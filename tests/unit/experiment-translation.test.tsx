import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { act, create } from './experiment-renderer.ts'
import { ExperimentTranslationDialog } from '../../src/client/workbench/experiment-translation-dialog.tsx'

const mounted: ReturnType<typeof create>[] = []
afterEach(async () => { await act(() => mounted.splice(0).forEach(item => item.unmount())); vi.unstubAllGlobals() })
import { PromptTranslationController } from '../../src/client/workbench/experiment-translation-state.ts'
import type { TranslationRequest, TranslationResult } from '../../src/workbench/translation.ts'

it('invalidates edited source until an explicit update and discards canceled replies', async () => {
  let resolve!: (value: TranslationResult) => void
  const translate = vi.fn(async function* (_request: TranslationRequest, _signal?: AbortSignal) {
    yield await new Promise<TranslationResult>(done => { resolve = done })
  })
  const controller = new PromptTranslationController({ translate })
  const scope = { workspace_id: 'ws', work_id: 'work', branch_id: 'branch', target: 'result' as const, field: 'positive_prompt' as const, source_text: 'glass' }
  controller.sync(scope, 'round-1', true)
  const first = translate.mock.calls[0]![0]
  controller.sync({ ...scope, source_text: 'clear glass' }, 'round-1', true)
  expect(controller.getSnapshot()).toMatchObject({ stale: true, current: null })
  expect(translate).toHaveBeenCalledTimes(1)
  expect(translate.mock.calls[0]![1]!.aborted).toBe(true)
  controller.sync({ ...scope, source_text: 'clear glass' }, 'round-1', false)
  controller.sync({ ...scope, source_text: 'clear glass' }, 'round-1', true)
  expect(translate).toHaveBeenCalledTimes(1)
  resolve({ request_id: first.request_id, status: 'succeeded', text: '旧译文' })
  await Promise.resolve()
  expect(controller.getSnapshot().current).toBeNull()
  controller.request()
  expect(translate.mock.calls[1]![0]).toMatchObject({ source_text: 'clear glass', target: 'result' })
  controller.dispose()
})

it('loads a new round automatically and preserves failure until an explicit retry', async () => {
  const translate = vi.fn(async function* (request: TranslationRequest): AsyncGenerator<TranslationResult> {
    if (request.source_text === 'glass') throw new Error('连接失败，请重试。')
    yield { request_id: 'foreign-request', status: 'succeeded', text: '其他请求译文' }
    yield { request_id: request.request_id, status: 'succeeded', text: '清晰玻璃' }
  })
  const controller = new PromptTranslationController({ translate })
  const scope = { workspace_id: 'ws', work_id: 'work', branch_id: 'branch', target: 'before' as const, field: 'positive_prompt' as const, source_text: 'glass' }
  controller.sync(scope, 'round-1', true)
  await vi.waitFor(() => expect(controller.getSnapshot().current).toMatchObject({ status: 'failed', error: '连接失败，请重试。' }))
  controller.sync(scope, 'round-1', false)
  controller.sync(scope, 'round-1', true)
  expect(translate).toHaveBeenCalledOnce()
  controller.request()
  await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(2))
  controller.sync({ ...scope, source_text: 'clear glass' }, 'round-2', true)
  await vi.waitFor(() => expect(controller.getSnapshot().current).toMatchObject({ status: 'succeeded', text: '清晰玻璃' }))
  expect(translate).toHaveBeenCalledTimes(3)
  controller.dispose()
})

it('shares current-source behavior in the independent dialog, preserves tabs and copies only current text', async () => {
  vi.stubGlobal('document', new EventTarget())
  const writeText = vi.fn(async () => {})
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  const remote = { translate: vi.fn(async function* (request: TranslationRequest): AsyncGenerator<TranslationResult> {
    yield { request_id: request.request_id, status: 'succeeded', text: request.field === 'positive_prompt' ? '玻璃' : '模糊' }
  }) }
  const props = { workspaceId: 'ws', workId: 'work', branchId: 'branch', initialField: 'positive_prompt' as const, remote, modelLabel: '翻译模型', onClose: vi.fn() }
  const prompts = { positive_prompt: 'glass', negative_prompt: 'blur' }
  let renderer!: ReturnType<typeof create>
  await act(() => { renderer = create(<ExperimentTranslationDialog {...props} prompts={prompts} />) })
  mounted.push(renderer)
  await act(() => renderer.root.findAllByType('button').find(button => button.children.join('') === '复制译文')!.props.onClick())
  expect(writeText).toHaveBeenCalledExactlyOnceWith('玻璃')
  await act(() => renderer.root.findByProps({ id: 'translation-tab-negative_prompt' }).props.onClick())
  await act(() => renderer.root.findByProps({ id: 'translation-tab-positive_prompt' }).props.onClick())
  expect(remote.translate).toHaveBeenCalledTimes(2)
  await act(() => (renderer as unknown as { update(node: React.ReactNode): void }).update(<ExperimentTranslationDialog {...props} prompts={{ ...prompts, positive_prompt: 'clear glass' }} />))
  expect(JSON.stringify(renderer.toJSON())).toContain('原文已修改，请重新翻译。')
  expect(JSON.stringify(renderer.toJSON())).not.toContain('玻璃')
  await act(() => renderer.root.findByProps({ id: 'translation-tab-negative_prompt' }).props.onClick())
  await act(() => renderer.root.findByProps({ id: 'translation-tab-positive_prompt' }).props.onClick())
  expect(remote.translate).toHaveBeenCalledTimes(2)
  expect(renderer.root.findAllByType('select')).toHaveLength(0)
  await act(() => renderer.root.findAllByType('button').find(button => button.children.join('') === '翻译当前原文')!.props.onClick())
  expect(remote.translate.mock.calls.at(-1)![0]).toMatchObject({ target: 'draft', field: 'positive_prompt', source_text: 'clear glass' })
  expect(remote.translate).toHaveBeenCalledTimes(3)
  await act(() => { document.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' })) })
  expect(props.onClose).toHaveBeenCalledOnce()
})

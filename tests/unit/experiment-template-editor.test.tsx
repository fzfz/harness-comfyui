import React, { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { ExperimentTemplateEditor } from '../../src/client/workbench/experiment-template-editor.tsx'

const { act, create } = await vi.importActual<any>('react-test-renderer')
const mounts: any[] = []
afterEach(async () => { await act(() => { for (const renderer of mounts.splice(0)) renderer.unmount() }); vi.unstubAllGlobals() })

it('inserts at the cursor, replaces selections and continues inserting after the last variable', async () => {
  vi.stubGlobal('document', new EventTarget())
  const textarea = { focus: vi.fn(), setSelectionRange: vi.fn() }, container = {}
  function Editor() {
    const [value, setValue] = useState('开头中间结尾')
    return <ExperimentTemplateEditor label="执行要求" kind="prompt" value={value} onChange={setValue} />
  }
  let renderer!: any
  await act(() => { renderer = create(<Editor />, { createNodeMock: (element: any) => element.type === 'textarea' ? textarea : container }) }); mounts.push(renderer)
  const field = () => renderer.root.findByType('textarea')
  const picker = () => renderer.root.findByProps({ 'aria-label': '在执行要求中插入变量' })
  await act(() => field().props.onSelect({ currentTarget: { selectionStart: 2, selectionEnd: 4 } }))
  await act(() => picker().props.onClick())
  const options = renderer.root.findAllByProps({ role: 'option' })
  expect(options.map((option: any) => option.findByType('code').props.children)).toEqual(['{{requirements_block}}', '{{prompt_edit_block}}', '{{references_block}}'])
  await act(() => options[0].props.onMouseDown({ preventDefault: vi.fn() }))
  await act(() => options[0].props.onClick())
  expect(field().props.value).toBe('开头{{requirements_block}}结尾')
  expect(textarea.setSelectionRange).toHaveBeenLastCalledWith(24, 24)
  await act(() => picker().props.onClick())
  await act(() => renderer.root.findAllByProps({ role: 'option' })[2].props.onClick())
  expect(field().props.value).toBe('开头{{requirements_block}}{{references_block}}结尾')
  expect(renderer.root.findAllByProps({ role: 'listbox' })).toHaveLength(0)
  await act(() => field().props.onChange({ target: { value: '手动输入' } }))
  expect(field().props.value).toBe('手动输入')
})

it('supports keyboard selection, Escape, outside clicks and updates variables when the function type changes', async () => {
  vi.stubGlobal('document', new EventTarget())
  const textarea = { focus: vi.fn(), setSelectionRange: vi.fn() }, container = {}
  let value = '原文'
  const change = vi.fn((next: string) => { value = next })
  let renderer!: any
  await act(() => { renderer = create(<ExperimentTemplateEditor label="执行要求" kind="prompt" value={value} onChange={change} />, { createNodeMock: (element: any) => element.type === 'textarea' ? textarea : container }) }); mounts.push(renderer)
  const picker = () => renderer.root.findByProps({ 'aria-label': '在执行要求中插入变量' })
  const key = async (key: string) => act(() => picker().props.onKeyDown({ key, preventDefault: vi.fn(), stopPropagation: vi.fn() }))
  await key('ArrowUp')
  expect(renderer.root.findAllByProps({ role: 'option' }).map((option: any) => option.props['aria-selected'])).toEqual([false, false, true])
  await key('ArrowDown')
  await key('Enter')
  expect(value).toBe('原文{{requirements_block}}')
  await act(() => picker().props.onClick())
  await key('Escape')
  expect(renderer.root.findAllByProps({ role: 'listbox' })).toHaveLength(0)
  await act(() => picker().props.onClick())
  await act(() => renderer.root.findByProps({ role: 'listbox' }).props.onKeyDown({ key: 'Escape', stopPropagation: vi.fn() }))
  expect(textarea.focus).toHaveBeenCalled()
  await act(() => picker().props.onClick())
  await act(() => document.dispatchEvent(new Event('pointerdown')))
  expect(renderer.root.findAllByProps({ role: 'listbox' })).toHaveLength(0)
  await act(() => renderer.update(<ExperimentTemplateEditor label="执行要求" kind="translate" value="" onChange={change} />))
  await act(() => picker().props.onClick())
  expect(renderer.root.findAllByProps({ role: 'option' }).map((option: any) => option.findByType('code').props.children)).toEqual(['{{source_text}}'])
})

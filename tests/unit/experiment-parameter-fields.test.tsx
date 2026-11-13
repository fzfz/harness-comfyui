import type { JsonValue } from '#contracts'
import React, { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { act, create } from './experiment-renderer.ts'
import { RuntimeParameterField, RuntimeSizeField } from '../../src/client/workbench/experiment-parameter-fields.tsx'
import { useBranchFieldEdits } from '../../src/client/workbench/experiment-fields.tsx'

import type { WorkflowRuntimeParameterInspectionParameter } from '../../src/generation/inspection-contract.ts'
import type { ExperimentSizeOption } from '../../src/client/workbench/experiment-input.ts'

const renderers: ReturnType<typeof create>[] = []
afterEach(async () => { await act(() => { for (const renderer of renderers.splice(0)) renderer.unmount() }) })
function ParameterForm({ parameter, initial, save }: { parameter: WorkflowRuntimeParameterInspectionParameter; initial: JsonValue; save: (value: JsonValue) => Promise<void> }) {
  const [value, setValue] = useState(initial), fields = useBranchFieldEdits('ws', 'work', 'branch')
  return <RuntimeParameterField label="采样参数" id={parameter.parameter_id} parameter={parameter} value={value} editor={fields(parameter.parameter_id)} locked={false} save={async next => { await save(next); setValue(next) }} />
}
const mount = async (node: React.ReactElement) => { let renderer!: ReturnType<typeof create>; await act(() => { renderer = create(node) }); renderers.push(renderer); return renderer }
const numeric = { parameter_id: 'steps', kind: 'steps' as const, value_type: 'integer' as const, current_value: 20 }

it('shows the matching parameter issue, retains rejected input and clears the issue after a successful correction', async () => {
  const save = vi.fn().mockRejectedValueOnce(new RemoteError('workbench/operation-failed', '参数保存失败', { code: 'WORKBENCH_INVALID_INPUT', issues: [{ path: 'generation_input.parameters.other', message: '其他字段错误' }, { path: 'generation_input.parameters.steps', message: '采样步数需小于 40。' }] })).mockResolvedValue(undefined)
  const renderer = await mount(<ParameterForm parameter={numeric} initial={20} save={save} />)
  await act(() => renderer.root.findByProps({ 'aria-label': '采样参数' }).props.onChange({ target: { value: '50' } }))
  expect(renderer.root.findByProps({ role: 'alert' }).children).toEqual(['采样步数需小于 40。'])
  expect(renderer.root.findByProps({ 'aria-label': '采样参数' }).props.value).toBe('50')
  await act(() => renderer.root.findByProps({ 'aria-label': '采样参数' }).props.onChange({ target: { value: '30' } }))
  expect(save.mock.calls.map(([value]) => value)).toEqual([50, 30])
  expect(renderer.root.findAllByProps({ role: 'alert' })).toHaveLength(0)
})

it('continues with the newest queued value when the earlier parameter write fails', async () => {
  let reject!: (error: Error) => void
  const save = vi.fn().mockImplementationOnce(() => new Promise<void>((_resolve, fail) => { reject = fail })).mockResolvedValue(undefined)
  const renderer = await mount(<ParameterForm parameter={numeric} initial={20} save={save} />)
  await act(() => renderer.root.findByProps({ 'aria-label': '采样参数' }).props.onChange({ target: { value: '25' } }))
  await act(() => renderer.root.findByProps({ 'aria-label': '采样参数' }).props.onChange({ target: { value: '35' } }))
  await act(() => { reject(new Error('连接暂时中断')) })
  expect(save.mock.calls.map(([value]) => value)).toEqual([25, 35])
  expect(renderer.root.findByProps({ 'aria-label': '采样参数' }).props.value).toBe('35')
  expect(renderer.root.findAllByProps({ role: 'alert' })).toHaveLength(0)
})

it('saves typed choices rather than their serialized select values', async () => {
  const save = vi.fn(async (_value: JsonValue) => undefined)
  const renderer = await mount(<ParameterForm parameter={{ ...numeric, allowed_values: [20, 30] }} initial={20} save={save} />)
  await act(() => renderer.root.findByProps({ 'aria-label': '采样参数' }).props.onChange({ target: { value: '30' } }))
  expect(save).toHaveBeenCalledExactlyOnceWith(30)
  expect(renderer.root.findByProps({ 'aria-label': '采样参数' }).props.value).toBe('30')
})

it('maps a size failure to the selected dimension and retries both dimensions together', async () => {
  const size: ExperimentSizeOption = { value: 'portrait', label: '768 × 1024', candidate_id: 'portrait-size', current: false, parameters: { width: 768, height: 1024 } }
  const save = vi.fn().mockRejectedValueOnce(new RemoteError('workbench/operation-failed', '尺寸保存失败', { code: 'WORKBENCH_INVALID_INPUT', issues: [{ path: 'generation_input.parameters.width', message: '宽度需为 64 的倍数。' }] })).mockResolvedValue(undefined)
  function Form() {
    const fields = useBranchFieldEdits('ws', 'work', 'branch'), [value, setValue] = useState('')
    return <RuntimeSizeField sizes={[size]} value={value} editor={fields('size')} locked={false} save={async next => { await save(next); setValue(next.value) }} />
  }
  const renderer = await mount(<Form />)
  await act(() => renderer.root.findByProps({ 'aria-label': '画面尺寸' }).props.onChange({ target: { value: size.value } }))
  expect(renderer.root.findByProps({ role: 'alert' }).children).toEqual(['宽度需为 64 的倍数。'])
  await act(() => renderer.root.findByProps({ 'aria-label': '画面尺寸' }).props.onChange({ target: { value: size.value } }))
  expect(save).toHaveBeenCalledTimes(2)
  expect(save).toHaveBeenLastCalledWith(size)
  expect(renderer.root.findAllByProps({ role: 'alert' })).toHaveLength(0)
})

it('renders an unavailable runtime parameter without a write callback', async () => {
  function Form() { const fields = useBranchFieldEdits('ws', 'work', 'branch'); return <RuntimeParameterField label="未声明的参数" id="missing" value={undefined} editor={fields('missing')} locked={false} /> }
  const renderer = await mount(<Form />)
  const field = renderer.root.findByProps({ 'aria-label': '未声明的参数' })
  expect(field.props.disabled).toBe(true)
  expect(field.props.onChange).toBeUndefined()
})

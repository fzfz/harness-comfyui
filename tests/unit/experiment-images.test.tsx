import React from 'react'
import { expect, it, vi } from 'vitest'
import { act, create } from './experiment-renderer.ts'
import { ExperimentImages, mergeImagePurpose } from '../../src/client/workbench/experiment-images.tsx'
import { draft } from './experiment-workbench-fixtures.ts'

it('keeps both empty image areas visible and imports the selected local files into their entry purpose', async () => {
  const onImport = vi.fn(async () => undefined)
  let renderer!: ReturnType<typeof create>
  await act(() => { renderer = create(<ExperimentImages input={{ image_refs: [], workflow_image_bindings: [] }} editable parameters={[]} onChange={vi.fn()} onPick={vi.fn()} onImport={onImport} onError={vi.fn()} />) })
  expect(renderer.root.findAllByProps({ className: 'image-inputs' })).toHaveLength(2)
  const fileInputs = renderer.root.findAllByType('input')
  expect(fileInputs.every(item => item.props.multiple && item.props.accept === 'image/*')).toBe(true)
  const files = [{ name: 'first.png' }, { name: 'second.png' }]
  await act(() => fileInputs[1]!.props.onChange({ target: { files, value: 'selected' } }))
  expect(onImport).toHaveBeenCalledWith(files, 'agent')
  await act(() => fileInputs[0]!.props.onChange({ target: { files: [], value: '' } }))
  expect(onImport).toHaveBeenCalledTimes(1)
  await act(() => renderer.unmount())
})

it('shares an image across both areas and removes only its Workflow purpose and binding', async () => {
  const input = { ...structuredClone(draft), image_refs: [{ image_ref_id: 'image-1', source: { kind: 'uploaded_file' as const, file_id: 'file-1' }, purpose: 'both' as const, reference_requirement: '保留窗框' }], workflow_image_bindings: [{ parameter_id: 'image-input', image_ref_ids: ['image-1'] }] }
  const onChange = vi.fn()
  let renderer!: ReturnType<typeof create>
  await act(() => { renderer = create(<ExperimentImages input={input} editable parameters={[]} onChange={onChange} onPick={vi.fn()} onImport={vi.fn()} onError={vi.fn()} />) })
  expect(renderer.root.findAllByProps({ className: 'image-input-card' })).toHaveLength(2)
  await act(() => renderer.root.findByProps({ 'aria-label': '移除 Workflow 输入图片 file-1' }).props.onClick())
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ image_refs: [expect.objectContaining({ purpose: 'agent', reference_requirement: '保留窗框' })], workflow_image_bindings: [] }))
  await act(() => renderer.unmount())
})

it('appends ordered multi-image bindings and rejects assigning a second image to a single-image parameter', async () => {
  const refs = ['first', 'second'].map(id => ({ image_ref_id: id, source: { kind: 'uploaded_file' as const, file_id: id }, purpose: 'workflow' as const, reference_requirement: '' }))
  const onChange = vi.fn(), onError = vi.fn()
  const parameters = [{ parameter_id: 'single', kind: 'reference_image' as const, value_type: 'string' as const, current_value: '', image_cardinality: 'one' as const },
    { parameter_id: 'ordered', kind: 'reference_image' as const, value_type: 'string' as const, current_value: [], image_cardinality: 'many' as const }]
  let renderer!: ReturnType<typeof create>
  await act(() => { renderer = create(<ExperimentImages input={{ image_refs: refs, workflow_image_bindings: [{ parameter_id: 'single', image_ref_ids: ['first'] }, { parameter_id: 'ordered', image_ref_ids: ['first'] }] }} editable parameters={parameters} onChange={onChange} onPick={vi.fn()} onImport={vi.fn()} onError={onError} />) })
  const select = renderer.root.findByProps({ 'aria-label': 'second 模板图片参数' })
  await act(() => select.props.onChange({ target: { value: 'single' } }))
  expect(onChange).not.toHaveBeenCalled()
  expect(onError).toHaveBeenCalledWith('该单图参数已指定图片。请选择其他图片参数。')
  await act(() => select.props.onChange({ target: { value: 'ordered' } }))
  expect(onChange).toHaveBeenCalledWith({ image_refs: refs, workflow_image_bindings: [{ parameter_id: 'single', image_ref_ids: ['first'] }, { parameter_id: 'ordered', image_ref_ids: ['first', 'second'] }] })
  await act(() => renderer.unmount())
})

it('preserves the Workflow binding when removing the Agent purpose and saves an exact reference requirement', async () => {
  const input = { image_refs: [{ image_ref_id: 'shared', source: { kind: 'uploaded_file' as const, file_id: 'shared.png' }, purpose: 'both' as const, reference_requirement: '' }], workflow_image_bindings: [{ parameter_id: 'image', image_ref_ids: ['shared'] }] }
  const onChange = vi.fn()
  let renderer!: ReturnType<typeof create>
  await act(() => { renderer = create(<ExperimentImages input={input} editable parameters={[]} onChange={onChange} onPick={vi.fn()} onImport={vi.fn()} onError={vi.fn()} />) })
  await act(() => renderer.root.findByProps({ 'aria-label': 'shared.png Agent 参考要求' }).props.onChange({ target: { value: '  参考窗框\n保留光线  ' } }))
  expect(onChange.mock.calls[0]?.[0].image_refs[0].reference_requirement).toBe('  参考窗框\n保留光线  ')
  await act(() => renderer.root.findByProps({ 'aria-label': '移除 Agent 参考图片 shared.png' }).props.onClick())
  expect(onChange.mock.calls[1]?.[0]).toEqual({ image_refs: [{ ...input.image_refs[0], purpose: 'workflow' }], workflow_image_bindings: input.workflow_image_bindings })
  await act(() => renderer.unmount())
})

it('keeps a selected image and removes a binding whose actual parameter disappeared after a template switch', async () => {
  const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
  const host = await createWorkbenchHostFixture({ prepare: async () => { throw new Error('Unexpected generation preparation') }, validateInput: async () => undefined, inspectRuntimeParameters: async request => ({ parameters: [
    { parameter_id: request.templateId === '5' ? 'image_old' : 'image_new', kind: 'reference_image', value_type: 'string', current_value: '', image_cardinality: 'one' },
  ], size_candidates: [] }) })
  const signal = new AbortController().signal
  try {
    const root = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: '模板图片绑定', goal: '保留图片' } }, signal)
    let branch = (await host.remote.getProjection(root, signal)).branches[0]!
    const input = { ...branch.draft, generation_input: { ...branch.draft.generation_input, instance_id: '8' } }
    await host.remote.mutate({ ...root, type: 'save-draft', value: { expected: branch.draft, expectedEditingDraft: branch.editing_draft, draft: input } }, signal)
    await host.remote.mutate({ ...root, type: 'resource-select', value: { kind: 'comfyui-template', id: '5' } }, signal)
    branch = (await host.remote.getProjection(root, signal)).branches[0]!
    const image = { image_ref_id: 'selected-image', source: { kind: 'uploaded_file' as const, file_id: 'selected-file' }, purpose: 'workflow' as const, reference_requirement: '' }
    const selected = { ...branch.editing_draft!, image_refs: [image], workflow_image_bindings: [{ parameter_id: 'image_old', image_ref_ids: [image.image_ref_id] }] }
    await host.remote.mutate({ ...root, type: 'edit-draft', value: { expected: branch.editing_draft, draft: selected } }, signal)
    await host.remote.mutate({ ...root, type: 'resource-select', value: { kind: 'comfyui-template', id: '41' } }, signal)
    const switched = (await host.remote.getProjection(root, signal)).branches[0]!
    expect(switched.editing_draft!.image_refs).toEqual([image])
    expect(switched.editing_draft!.workflow_image_bindings).toEqual([])
    await expect(host.remote.mutate({ ...root, type: 'save-draft', value: { expected: switched.draft, expectedEditingDraft: switched.editing_draft, draft: switched.editing_draft! } }, signal)).resolves.toMatchObject(root)
  } finally { await host.dispose() }
})

it('previews a read-only image and its reference requirement without edit callbacks', async () => {
  vi.stubGlobal('document', new EventTarget())
  const input = { image_refs: [{ image_ref_id: 'read-only', source: { kind: 'run_media' as const, run_id: 'run-source', media_id: 'media-source' }, purpose: 'both' as const, reference_requirement: '保留清晨暖光' }], workflow_image_bindings: [{ parameter_id: 'reference_image', image_ref_ids: ['read-only'] }] }
  const parameters = [{ parameter_id: 'reference_image', kind: 'reference_image' as const, value_type: 'string' as const, current_value: '', image_cardinality: 'one' as const }]
  let renderer!: ReturnType<typeof create>
  await act(() => { renderer = create(<ExperimentImages input={input} editable={false} parameters={parameters} display={() => ({ name: 'source.png', url: '/source.png', source: '来源运行' })} />) })
  try {
    expect(renderer.root.findAllByType('input')).toHaveLength(0)
    expect(renderer.root.findAllByType('select')).toHaveLength(0)
    expect(renderer.root.findAllByType('textarea')).toHaveLength(0)
    expect(JSON.stringify(renderer.toJSON())).toContain('保留清晨暖光')
    expect(JSON.stringify(renderer.toJSON())).toContain('模板图片参数：')
    await act(() => renderer.root.findAllByProps({ 'aria-label': '预览 source.png' })[0]!.props.onClick())
    expect(renderer.root.findByProps({ className: 'original-image' }).findByType('img').props.src).toBe('/source.png')
    await act(() => renderer.root.findAllByType('button').find(button => button.children.join('') === '×')!.props.onClick())
    expect(renderer.root.findAllByProps({ className: 'original-image' })).toHaveLength(0)
  } finally {
    await act(() => renderer.unmount())
    vi.unstubAllGlobals()
  }
})

it('opens both local file selectors and reports rejected imports without retaining their selected values', async () => {
  const clicks = { workflow: vi.fn(), agent: vi.fn() }, onPick = vi.fn(), onError = vi.fn()
  const onImport = vi.fn().mockRejectedValueOnce(new Error('文件无法读取')).mockRejectedValueOnce('connection closed')
  const withRefs = create as (node: React.ReactElement, options: { createNodeMock: (element: { props: Record<string, unknown> }) => unknown }) => ReturnType<typeof create>
  let renderer!: ReturnType<typeof create>
  await act(() => { renderer = withRefs(<ExperimentImages input={{ image_refs: [], workflow_image_bindings: [] }} editable parameters={[]} onChange={vi.fn()} onPick={onPick} onImport={onImport} onError={onError} />, { createNodeMock: element => element.props.id === 'local-image-files-workflow' ? { click: clicks.workflow } : element.props.id === 'local-image-files-agent' ? { click: clicks.agent } : null }) })
  try {
    for (const purpose of ['workflow', 'agent'] as const) {
      const section = renderer.root.findByProps({ 'data-image-section': purpose })
      await act(() => section.findAllByType('button').find(button => button.children.join('') === '从运行记录选择')!.props.onClick())
      expect(onPick).toHaveBeenLastCalledWith(purpose)
      await act(() => section.findAllByType('button').find(button => button.children.join('') === '选择本机图片')!.props.onClick())
      expect(clicks[purpose]).toHaveBeenCalledOnce()
      const target = { files: [{ name: purpose + '.png' }], value: 'selected' }
      await act(async () => section.findByType('input').props.onChange({ target }))
      expect(target.value).toBe('')
      expect(onImport).toHaveBeenLastCalledWith(target.files, purpose)
    }
    expect(onError.mock.calls).toEqual([['文件无法读取'], ['图片导入失败，请重新选择。']])
  } finally { await act(() => renderer.unmount()) }
})

it('shares a Workflow image, clears its binding and removes only the chosen unshared image', async () => {
  const refs = ['first', 'second'].map(id => ({ image_ref_id: id, source: { kind: 'uploaded_file' as const, file_id: id }, purpose: 'workflow' as const, reference_requirement: '' }))
  const input = { image_refs: refs, workflow_image_bindings: [{ parameter_id: 'ordered', image_ref_ids: ['first', 'second'] }] }
  const onChange = vi.fn()
  let renderer!: ReturnType<typeof create>
  await act(() => { renderer = create(<ExperimentImages input={input} editable parameters={[{ parameter_id: 'ordered', kind: 'reference_image', value_type: 'string', current_value: [], image_cardinality: 'many' }]} onChange={onChange} onPick={vi.fn()} onImport={vi.fn()} onError={vi.fn()} />) })
  try {
    const first = renderer.root.findByProps({ 'data-image-ref': 'first' })
    await act(() => first.findAllByType('button').find(button => button.children.join('') === '也用作 Agent 参考图片')!.props.onClick())
    expect(onChange).toHaveBeenLastCalledWith({ ...input, image_refs: [{ ...refs[0], purpose: 'both' }, refs[1]] })
    await act(() => first.findByType('select').props.onChange({ target: { value: '' } }))
    expect(onChange).toHaveBeenLastCalledWith({ image_refs: refs, workflow_image_bindings: [{ parameter_id: 'ordered', image_ref_ids: ['second'] }] })
    await act(() => first.findByProps({ 'aria-label': '移除 Workflow 输入图片 first' }).props.onClick())
    expect(onChange).toHaveBeenLastCalledWith({ image_refs: [refs[1]], workflow_image_bindings: [{ parameter_id: 'ordered', image_ref_ids: ['second'] }] })
  } finally { await act(() => renderer.unmount()) }
})

it('merges repeated file or Run-media selections without conflating media from different Runs', () => {
  const file = { image_ref_id: 'file-reference', source: { kind: 'uploaded_file' as const, file_id: 'same-file' }, purpose: 'workflow' as const, reference_requirement: '保留光线' }
  expect(mergeImagePurpose([file], { ...file, image_ref_id: 'new-reference' }, 'agent')).toEqual([{ ...file, purpose: 'both' }])
  expect(mergeImagePurpose([file], file, 'workflow')).toEqual([file])
  const run = { image_ref_id: 'run-reference', source: { kind: 'run_media' as const, run_id: 'run-a', media_id: 'media-a' }, purpose: 'agent' as const, reference_requirement: '' }
  expect(mergeImagePurpose([run], { ...run, image_ref_id: 'selected-again' }, 'workflow')).toEqual([{ ...run, purpose: 'both' }])
  const differentRun = { ...run, image_ref_id: 'different-run', source: { ...run.source, run_id: 'run-b' } }
  expect(mergeImagePurpose([file, run], differentRun, 'agent')).toEqual([file, run, differentRun])
})

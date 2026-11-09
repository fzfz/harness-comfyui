import { expect, it, vi } from 'vitest'
import { PreparationEditor } from '../../src/client/workbench/experiment-preparation.ts'
import { makeBranch } from './experiment-workbench-fixtures.ts'

it('serializes editing, preserves a canonical Agent change and saves the latest accepted editing snapshot', async () => {
  const branch = makeBranch('root', null)
  let finish!: () => void
  const gate = new Promise<void>(resolve => { finish = resolve })
  const edit = vi.fn(async (_expected, draft) => {
    if (edit.mock.calls.length === 1) await gate
    return { ...draft, prompt_input: { ...draft.prompt_input, negative_prompt: 'Agent negative' } }
  })
  const save = vi.fn(async (_input: unknown) => undefined)
  const editor = new PreparationEditor(branch, { edit, save, onError: vi.fn() })
  editor.begin()
  editor.change({ prompt_input: { ...branch.draft.prompt_input, positive_prompt: 'first positive' } })
  await Promise.resolve()
  editor.change({ prompt_input: { ...editor.getSnapshot().draft.prompt_input, positive_prompt: 'latest positive' } })
  const saving = editor.save()
  expect(save).not.toHaveBeenCalled()
  finish()
  await saving
  expect(edit).toHaveBeenCalledTimes(2)
  expect(edit.mock.calls[1]?.[0].prompt_input).toMatchObject({ positive_prompt: 'first positive', negative_prompt: 'Agent negative' })
  expect(edit.mock.calls[1]?.[1].prompt_input).toMatchObject({ positive_prompt: 'latest positive', negative_prompt: 'Agent negative' })
  expect(save.mock.calls[0]?.[0]).toMatchObject({ expectedEditingDraft: { prompt_input: { positive_prompt: 'latest positive', negative_prompt: 'Agent negative' } } })
  expect(editor.getSnapshot().editing).toBe(false)
})

it('merges a delayed real Remote edit with an Agent prompt artifact before saving', async () => {
  const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
  const host = await createWorkbenchHostFixture()
  const signal = new AbortController().signal
  try {
    const scope = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: '编辑与回填', goal: '保留窗框' } }, signal)
    await host.remote.mutate({ ...scope, type: 'function-preset', id: 'prompt', value: 'preset-a' }, signal)
    await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
    let branch = (await host.remote.getProjection(scope, signal)).branches[0]!
    await host.remote.mutate({ ...scope, type: 'save-draft', value: { expected: branch.draft, expectedEditingDraft: branch.editing_draft, draft: branch.editing_draft! } }, signal)
    const receipt = await host.remote.mutate({ ...scope, type: 'agent-action', id: 'prompt' }, signal)
    const task = (await host.remote.getProjection(scope, signal)).tasks.find(item => item.task_id === receipt.taskId)!
    branch = (await host.remote.getProjection(scope, signal)).branches[0]!
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const editor = new PreparationEditor(branch, {
      edit: async (expected, draft) => {
        await gate
        return (await host.remote.mutate({ ...scope, type: 'edit-draft', value: { expected, draft } }, signal)).editingDraft ?? null
      },
      save: async value => { await host.remote.mutate({ ...scope, type: 'save-draft', value }, signal) },
      onError: error => { throw new Error(error) },
    })
    editor.begin()
    editor.change({ instructions: '保留本次手工要求' })
    await Promise.resolve()
    const published = await host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id, artifact: { type: 'prompt', positive_prompt: 'Agent glass', negative_prompt: 'Agent blur' } },
      { workspaceId: scope.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'parallel-prompt' })
    expect(published.disposition).toBe('applied')
    release()
    await editor.flush()
    expect(editor.getSnapshot().draft).toMatchObject({ instructions: '保留本次手工要求', prompt_input: { positive_prompt: 'Agent glass', negative_prompt: 'Agent blur' } })
    await editor.save()
    const saved = (await host.remote.getProjection(scope, signal)).branches[0]!
    expect(saved.editing_draft).toBeNull()
    expect(saved.draft).toMatchObject({ instructions: '保留本次手工要求', prompt_input: { positive_prompt: 'Agent glass', negative_prompt: 'Agent blur' } })
    expect(task.input.prompt_input.positive_prompt).toBe('')
  } finally { await host.dispose() }
})

it.each([false, true])('preserves rapid original requirement metadata through a delayed Host input receipt: %s', async delayed => {
  const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
  const host = await createWorkbenchHostFixture(), signal = new AbortController().signal
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  try {
    const scope = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: '快速需求编辑', goal: '保存前需求' } }, signal)
    const initial = (await host.remote.getProjection(scope, signal)).branches[0]!
    await host.remote.mutate({ ...scope, type: 'save-draft', value: { expected: initial.draft, expectedEditingDraft: initial.editing_draft, draft: initial.draft } }, signal)
    const branch = (await host.remote.getProjection(scope, signal)).branches[0]!
    const editor = new PreparationEditor(branch, {
      edit: async (expected, draft) => { const receipt = await host.remote.mutate({ ...scope, type: 'edit-draft', value: { expected, draft } }, signal); if (delayed) await gate; return receipt.editingDraft ?? null },
      save: async value => { await host.remote.mutate({ ...scope, type: 'save-draft', value }, signal) }, onError: vi.fn(),
    })
    editor.begin()
    editor.change({}, { originalRequest: '点击编辑后立即填写的需求' })
    if (delayed) editor.change({ instructions: '并行输入写入' })
    await Promise.resolve()
    editor.change({}, { originalRequest: '保存时的两轮实验需求', name: '快速修改后的名称' })
    editor.sync((await host.remote.getProjection(scope, signal)).branches[0]!)
    const saving = editor.save()
    release()
    await saving
    const saved = (await host.remote.getProjection(scope, signal)).branches[0]!
    expect(saved.original_request).toBe('保存时的两轮实验需求')
    expect(saved.name).toBe('快速修改后的名称')
    expect(saved.editing_draft).toBeNull()
  } finally { release(); await host.dispose() }
})

it('retains an unsent prompt and reports a conflict when the accepted snapshot changed the same slot', async () => {
  const branch = makeBranch('root', null)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const edit = vi.fn(async (_expected, draft) => { await gate; return { ...draft, prompt_input: { ...draft.prompt_input, positive_prompt: 'Agent prompt' } } })
  const save = vi.fn(async (_input: unknown) => undefined), onError = vi.fn()
  const editor = new PreparationEditor(branch, { edit, save, onError })
  editor.begin()
  editor.change({ instructions: 'first editing request' })
  await Promise.resolve()
  editor.change({ prompt_input: { ...editor.getSnapshot().draft.prompt_input, positive_prompt: 'unsent user prompt' } })
  const saving = editor.save()
  release()
  await expect(saving).rejects.toThrow()
  expect(editor.getSnapshot().draft.prompt_input.positive_prompt).toBe('unsent user prompt')
  expect(editor.getSnapshot().error).not.toBe('')
  expect(save).not.toHaveBeenCalled()
  expect(edit).toHaveBeenCalledTimes(1)
})

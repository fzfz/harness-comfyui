import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { act, create } from './experiment-renderer.ts'
import { ExperimentWorkbenchStore } from '../../src/client/workbench/experiment-store.ts'
import { PromptEditingController } from '../../src/client/workbench/experiment-prompt-editor.ts'
import { PreparationEditor } from '../../src/client/workbench/experiment-preparation.ts'
import { ExperimentTranslationDialog } from '../../src/client/workbench/experiment-translation-dialog.tsx'
import { fullProjection, makeBranch, makeBinding } from './experiment-workbench-fixtures.ts'

const mounted: ReturnType<typeof create>[] = []
afterEach(async () => {
  await act(() => mounted.splice(0).forEach(renderer => renderer.unmount()))
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('does not query work projection on an idle timer or after a failed read', async () => {
  vi.useFakeTimers()
  const getProjection = vi.fn().mockResolvedValueOnce(fullProjection()).mockRejectedValueOnce(new Error('连接断开'))
  const store = new ExperimentWorkbenchStore({ getProjection })
  store.setWorkspace('workspace_1')
  await Promise.resolve(); await Promise.resolve()
  expect(getProjection).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(60000)
  expect(getProjection).toHaveBeenCalledOnce()
  await store.refresh()
  await vi.advanceTimersByTimeAsync(60000)
  expect(getProjection).toHaveBeenCalledTimes(2)
  store.dispose()
})

it('treats prompt dispatch as request acceptance without completing or applying its result', async () => {
  vi.useFakeTimers()
  const branch = makeBranch('source', null)
  branch.draft.prompt_input = { positive_prompt: '', negative_prompt: '' }
  const editor = new PreparationEditor(branch, { edit: async (_before, draft) => draft, save: async () => {}, onError: vi.fn() })
  const turn: any = { request_id: 'request', task_id: 'task', status: 'succeeded', input: { positive_prompt: '', negative_prompt: '' }, result: { type: 'prompt', positive_prompt: 'portrait', negative_prompt: '' } }
  const remote = { promptStart: vi.fn(async () => turn), promptGet: vi.fn(async () => turn), promptList: vi.fn(async () => [turn]), promptCancel: vi.fn(async () => turn), promptSaveCandidate: vi.fn(async () => turn), promptAdopt: vi.fn(async () => turn) }
  const controller = new PromptEditingController({ workspace_id: 'workspace', work_id: 'work', branch_id: 'source' }, remote, editor)
  await controller.start(makeBinding('prompt'))
  await vi.advanceTimersByTimeAsync(60000)
  expect(remote.promptGet).not.toHaveBeenCalled()
  expect(remote.promptAdopt).not.toHaveBeenCalled()
  expect(editor.getSnapshot().draft.prompt_input).toEqual({ positive_prompt: '', negative_prompt: '' })
  expect(controller.getSnapshot()).toMatchObject({ busy: true, result: null })
  controller.dispose()
})

it('keeps translation execution active when its display closes and never starts status polling', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('document', new EventTarget())
  const remote = { translateStart: vi.fn(async (request: { request_id: string }) => ({ request_id: request.request_id, status: 'running' as const })), translateGet: vi.fn(), translateCancel: vi.fn() }
  let renderer!: ReturnType<typeof create>
  await act(() => { renderer = create(<ExperimentTranslationDialog workId="work" branchId="source" workspaceId="workspace" initialField="positive_prompt" prompts={{ positive_prompt: 'portrait', negative_prompt: '' }} remote={remote} modelLabel="翻译模型" onClose={vi.fn()} />) })
  mounted.push(renderer)
  await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
  expect(remote.translateGet).not.toHaveBeenCalled()
  await act(() => renderer.unmount())
  mounted.pop()
  expect(remote.translateCancel).not.toHaveBeenCalled()
})

it.each(['query-first', 'snapshot-first'] as const)('keeps the completion snapshot and rejects older or foreign updates: %s', async order => {
  const baseline = fullProjection()
  let resolve!: (projection: typeof baseline) => void
  const store = new ExperimentWorkbenchStore({ getProjection: () => new Promise(result => { resolve = result }) })
  store.setWorkspace(baseline.workspace_id)
  const completed = { ...baseline, favorites: [{ target_type: 'run' as const, target_id: 'completed' }] }
  if (order === 'query-first') { resolve(baseline); await Promise.resolve(); await Promise.resolve() }
  store.receive({ kind: 'snapshot', sequence: 8, projection: completed, promptTurns: [], translations: [] })
  if (order === 'snapshot-first') resolve(baseline)
  await Promise.resolve(); await Promise.resolve()
  store.receive({ kind: 'change', sequence: 7, projection: baseline, promptTurns: [], translations: [] })
  store.receive({ kind: 'change', sequence: 9, projection: { ...baseline, workspace_id: 'foreign' }, promptTurns: [], translations: [] })
  expect(store.getSnapshot().projection?.favorites).toEqual([{ target_type: 'run', target_id: 'completed' }])
  store.dispose()
})

it('keeps local prompt changes while a saved default result updates the branch baseline', async () => {
  const branch = makeBranch('source', null)
  branch.draft.prompt_input = { positive_prompt: '', negative_prompt: '' }
  let finish!: (draft: typeof branch.draft) => void
  const editor = new PreparationEditor(branch, { edit: async () => new Promise(resolve => { finish = resolve }), save: vi.fn(async () => {}), onError: vi.fn() })
  editor.change({ prompt_input: { positive_prompt: 'my later input', negative_prompt: '' } })
  await Promise.resolve()
  const saved = structuredClone(branch)
  saved.draft.prompt_input = { positive_prompt: 'Agent result', negative_prompt: 'blur' }
  editor.sync(saved)
  expect(editor.getSnapshot().draft.prompt_input).toEqual({ positive_prompt: 'my later input', negative_prompt: 'blur' })
  finish({ ...branch.draft, prompt_input: { positive_prompt: 'my later input', negative_prompt: '' } })
  await editor.flush()
  expect(editor.getSnapshot().draft.prompt_input).toEqual({ positive_prompt: 'my later input', negative_prompt: 'blur' })
})

it('uses a committed review notification after its own pending save completes', async () => {
  const { RunReviewEditor } = await import('../../src/client/workbench/experiment-review-editor.ts')
  const baseline = fullProjection().runs[0]!.review_draft!
  let finish!: () => void
  const editor = new RunReviewEditor({ workspaceId: 'workspace', workId: 'work', branchId: 'source', runId: 'run' }, baseline,
    () => new Promise(resolve => { finish = resolve }))
  editor.change('observation', 'saved observation')
  await Promise.resolve()
  editor.sync({ ...baseline, observation: 'saved observation', experience_artifact_id: 'created-experience' })
  finish()
  await vi.waitFor(() => expect(editor.getSnapshot().draft.experience_artifact_id).toBe('created-experience'))
  const submit = vi.fn(async (_value: unknown) => undefined)
  await editor.submit(submit)
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ expected: expect.objectContaining({ experience_artifact_id: 'created-experience' }) }))
})

it('accepts a new connection snapshot and ignores a late update from its released stream', async () => {
  const baseline = fullProjection()
  const store = new ExperimentWorkbenchStore({ getProjection: async () => baseline })
  store.setWorkspace(baseline.workspace_id)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  store.connect(async function* () {
    yield { kind: 'snapshot', sequence: 3, projection: baseline, promptTurns: [], translations: [] }
    await gate
    yield { kind: 'change', sequence: 99, projection: baseline, promptTurns: [], translations: [] }
  })
  await Promise.resolve(); await Promise.resolve()
  const completed = { ...baseline, favorites: [{ target_type: 'run' as const, target_id: 'completed-offline' }] }
  store.connect(async function* () { yield { kind: 'snapshot', sequence: 0, projection: completed, promptTurns: [], translations: [] } })
  await vi.waitFor(() => expect(store.getSnapshot().projection?.favorites).toEqual(completed.favorites))
  release()
  await Promise.resolve(); await Promise.resolve()
  expect(store.getSnapshot().projection?.favorites).toEqual(completed.favorites)
  store.dispose()
})

it('keeps branch input intact and reports a failed adoption write', async () => {
  const branch = makeBranch('source', null), onError = vi.fn()
  const editor = new PreparationEditor(branch, { edit: async (_before, draft) => draft, save: vi.fn(), onError })
  const before = structuredClone(editor.getSnapshot().draft)
  await expect(editor.applyPrompts({ positive_prompt: 'candidate', negative_prompt: 'blur' }, async () => { throw new Error('采用写入失败，请重试。') })).rejects.toThrow('采用写入失败，请重试。')
  expect(editor.getSnapshot()).toMatchObject({ draft: before, error: '采用写入失败，请重试。', pending: false })
  expect(onError).toHaveBeenCalledExactlyOnceWith('采用写入失败，请重试。')
})

it('releases a candidate display subscriber while continuing to accept persisted results', async () => {
  const { PromptCandidateEditor } = await import('../../src/client/workbench/experiment-prompt-candidate.ts')
  const persist = vi.fn(async () => { throw new Error('Unexpected candidate write') })
  const candidate = new PromptCandidateEditor({ positive_prompt: 'initial', negative_prompt: '' }, persist)
  const notify = vi.fn(), unsubscribe = candidate.subscribe(notify)
  candidate.sync({ positive_prompt: 'server candidate', negative_prompt: 'blur' })
  expect(notify).toHaveBeenCalledOnce()
  unsubscribe()
  candidate.sync({ positive_prompt: 'later server candidate', negative_prompt: 'blur' })
  expect(notify).toHaveBeenCalledOnce()
  expect(candidate.getSnapshot().result.positive_prompt).toBe('later server candidate')
  expect(persist).not.toHaveBeenCalled()
})

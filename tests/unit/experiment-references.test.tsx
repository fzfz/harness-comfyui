import { contracts } from '#contracts'
import React from 'react'
import { recordFixture } from '../support/contract-fixtures.ts'
import { afterEach, expect, it, vi } from 'vitest'
import { act, create } from './experiment-renderer.ts'
import { fullProjection } from './experiment-workbench-fixtures.ts'
import { ExperimentReferencePicker } from '../../src/client/workbench/experiment-reference-picker.tsx'
import type { StoredArtifact, WorkbenchRecord } from '../../src/workbench/contract.ts'

it('projects an embedded task Run as a Run record without task or artifact payloads', async () => {
  vi.stubGlobal('document', new EventTarget())
  const data = fullProjection(), task = data.tasks[0]!, run = data.runs[0]!
  const record = recordFixture({ type: 'task' as const, id: task.task_id, workspace_id: 'workspace-a', work_id: 'work-a', branch_id: task.branch_id, task_id: task.task_id, title: task.title, task, runs: [run], artifacts: data.artifacts })
  const onAdd = vi.fn()
  let renderer!: ReturnType<typeof create>
  await act(async () => { renderer = create(<ExperimentReferencePicker kind="task" workspaces={[]} remote={{ queryRecords: async () => [record] }} onAdd={onAdd} onUseRun={vi.fn()} onInspect={vi.fn()} onClose={vi.fn()} />) })
  await act(() => renderer.root.findAllByType('button').find(item => item.children.join('') === '添加引用')!.props.onClick())
  expect(onAdd).toHaveBeenCalledWith([{ type: 'run', id: run.run_id, workspace_id: 'workspace-a', work_id: 'work-a', branch_id: task.branch_id, task_id: run.workbench_task_id, title: run.title, base_model_id: task.input.base_model_id, run }])
  await act(() => renderer.unmount())
  vi.unstubAllGlobals()
})

it('groups runs by their owning task and preserves each disclosure state', async () => {
  vi.stubGlobal('document', new EventTarget())
  const data = fullProjection(), taskId = 'task_12345678901234567890'
  const records = ['run-a', 'run-b', 'run-c'].map((id, index) => (recordFixture({ type: 'run' as const, id, workspace_id: 'workspace-a', work_id: 'work-a', branch_id: 'root', task_id: index < 2 ? taskId : 'other-task', base_model_id: '1', title: id, run: { ...data.runs[0]!, run_id: id, workbench_task_id: index < 2 ? taskId : 'other-task' } })))
  let renderer!: ReturnType<typeof create>
  await act(async () => { renderer = create(<ExperimentReferencePicker kind="run" workspaces={[]} baseModels={[{ id: '1', label: 'SDXL' }]} remote={{ queryRecords: async () => records }} onAdd={vi.fn()} onUseRun={vi.fn()} onInspect={vi.fn()} onClose={vi.fn()} />) })
  const groups = () => renderer.root.findAllByProps({ className: 'reference-task' })
  expect(groups()).toHaveLength(2)
  expect(groups()[0]!.type).toBe('details')
  expect(groups()[0]!.findByType('summary').children.join('')).toBe('任务 task_1234567… · 2 次运行')
  expect(groups()[0]!.findByType('summary').props.title).toBe(taskId)
  expect(groups()[0]!.findAllByProps({ className: 'reference-option' })).toHaveLength(2)
  expect(groups()[0]!.findAllByType('small').map(item => item.children.join(''))).toContain('SDXL · 1 张图片')
  expect(groups()[0]!.props.open).toBe(true)
  await act(() => groups()[0]!.props.onToggle({ currentTarget: { open: false } }))
  expect(groups()[0]!.props.open).toBe(false)
  expect(groups()[1]!.props.open).toBe(true)
  await act(() => groups()[0]!.props.onToggle({ currentTarget: { open: true } }))
  expect(groups()[0]!.props.open).toBe(true)
  await act(() => renderer.unmount())
  vi.unstubAllGlobals()
})

it.each(['experience', 'favorite'] as const)('uses the prototype choice row and folded origin for %s experiences', async kind => {
  vi.stubGlobal('document', new EventTarget())
  const id = 'experience_12345678901234567890'
  const record = recordFixture({ type: 'experience' as const, id, workspace_id: 'workspace-a', work_id: 'work-a', branch_id: 'root', task_id: null, title: '完整经验标题', experience: { ...fullProjection().experiences[0]!, experience_id: id, title: '完整经验标题', conditions: '完整适用条件', note: '完整经验结论', provenance: { created_by_task_id: 'task-source', evidence: [] } } })
  let renderer!: ReturnType<typeof create>
  await act(async () => { renderer = create(<ExperimentReferencePicker kind={kind} workspaces={[{ id: 'workspace-a', name: '来源工作区', path: '/workspace-a' }]} remote={{ queryRecords: async () => [record] }} onAdd={vi.fn()} onUseRun={vi.fn()} onInspect={vi.fn()} onClose={vi.fn()} />) })
  const card = renderer.root.findByProps({ className: 'reference-option' })
  const choice = card.children[0] as import('./experiment-renderer.ts').ExperimentTestNode
  expect(choice.type).toBe('label')
  expect(choice.props.className).toBe('row reference-choice')
  expect(choice.findByType('input').props['aria-label']).toBe(`选择经验 ${id}`)
  expect(choice.findByType('span').props.title).toBe(id)
  expect(card.findByType('b').children).toEqual(['完整经验标题'])
  const origin = card.findByProps({ className: 'reference-origin' })
  expect(origin.parent?.props.className).toBe('experience-provenance')
  expect(card.findAllByType('button').some(button => button.children.join('') === '查看来源')).toBe(false)
  await act(() => renderer.unmount())
  vi.unstubAllGlobals()
})

it('keeps complete provenance IDs available while shortening their display', async () => {
  vi.stubGlobal('document', new EventTarget())
  const taskId = 'task_12345678901234567890', runId = 'run_12345678901234567890'
  const experience = { ...fullProjection().experiences[0]!, provenance: { created_by_task_id: taskId, evidence: [{ run_id: runId, generation_task_id: taskId, role: 'supporting_evidence' as const }] } }
  const record = recordFixture({ type: 'experience' as const, id: experience.experience_id, workspace_id: null, work_id: null, branch_id: null, task_id: taskId, title: experience.title, experience })
  let renderer!: ReturnType<typeof create>
  await act(async () => { renderer = create(<ExperimentReferencePicker kind="experience" workspaces={[]} remote={{ queryRecords: async () => [record] }} onAdd={vi.fn()} onUseRun={vi.fn()} onInspect={vi.fn()} onClose={vi.fn()} />) })
  expect(renderer.root.findByProps({ 'aria-label': taskId }).props.title).toBe(taskId)
  expect(renderer.root.findByProps({ 'aria-label': runId }).findByType('span').props.title).toBe(runId)
  expect(renderer.root.findByProps({ 'aria-label': taskId }).children.join('')).toBe('task_1234567…')
  await act(() => renderer.unmount())
  vi.unstubAllGlobals()
})

it('uses the prototype compact Run card in favorite references', async () => {
  vi.stubGlobal('document', new EventTarget())
  const run = fullProjection().runs[0]!, record = recordFixture({ type: 'run' as const, id: run.run_id, workspace_id: 'workspace-a', work_id: 'work-a', branch_id: 'root', task_id: run.workbench_task_id, title: run.title, run })
  let renderer!: ReturnType<typeof create>
  await act(async () => { renderer = create(<ExperimentReferencePicker kind="favorite" workspaces={[]} remote={{ queryRecords: async () => [record] }} onAdd={vi.fn()} onUseRun={vi.fn()} onInspect={vi.fn()} onClose={vi.fn()} />) })
  const card = renderer.root.findByProps({ className: 'reference-option' })
  expect(card.findAllByProps({ className: 'reference-preview' })).toHaveLength(0)
  expect(card.findAllByType('button').map(button => button.children.join(''))).toEqual(['查看来源'])
  expect(card.findByType('input').props['aria-label']).toBe(`选择运行 ${run.run_id}`)
  await act(() => renderer.unmount())
  vi.unstubAllGlobals()
})

it.each(['image-workflow', 'image-agent'] as const)('uses the prototype image list for %s and omits Runs without image media', async kind => {
  vi.stubGlobal('document', new EventTarget())
  const run = fullProjection().runs[0]!, record = recordFixture({ type: 'run' as const, id: run.run_id, workspace_id: 'workspace-a', work_id: 'work-a', branch_id: 'root', task_id: run.workbench_task_id, title: run.title, run })
  let renderer!: ReturnType<typeof create>
  await act(async () => { renderer = create(<ExperimentReferencePicker kind={kind} workspaces={[]} remote={{ queryRecords: async () => [record, { ...record, id: 'empty-run', run: { ...run, run_id: 'empty-run', media: [] } }] }} onAdd={vi.fn()} onUseRun={vi.fn()} onInspect={vi.fn()} onClose={vi.fn()} />) })
  const cards = renderer.root.findAllByProps({ className: 'reference-option' })
  expect(cards).toHaveLength(1)
  expect(cards[0]!.findAllByProps({ className: 'reference-preview' })).toHaveLength(0)
  expect(cards[0]!.findAllByProps({ className: 'image-choice' })).toHaveLength(1)
  expect(cards[0]!.findAllByType('button')).toHaveLength(0)
  await act(() => renderer.unmount())
  vi.unstubAllGlobals()
})

it('adds multiple selected experiences through the cross-workspace record interface', async () => {
  vi.stubGlobal('document', new EventTarget())
  const records = ['a', 'b'].map(id => (recordFixture({ type: 'experience' as const, id, workspace_id: 'other', work_id: null, branch_id: null, task_id: null, title: `经验 ${id}`, experience: { ...fullProjection().experiences[0]!, work_id: null, branch_id: null, task_id: null, experience_id: id, title: `经验 ${id}`, conditions: '玻璃', note: '保留窗框', evidence_run_ids: [], provenance: { created_by_task_id: null, evidence: [] } } })))
  const queryRecords = vi.fn(async () => [...records]), onAdd = vi.fn()
  let renderer!: ReturnType<typeof create>
  await act(async () => { renderer = create(<ExperimentReferencePicker kind="experience" workspaces={[{ id: 'other', name: '来源工作区', path: '/other' }]} remote={{ queryRecords } as any} onAdd={onAdd} onUseRun={vi.fn()} onInspect={vi.fn()} onClose={vi.fn()} />) })
  expect(queryRecords).toHaveBeenCalledWith({ type: 'experience' })
  for (const id of ['a', 'b']) await act(() => renderer.root.findByProps({ 'aria-label': `选择经验 ${id}` }).props.onChange({ target: { checked: true } }))
  await act(() => renderer.root.findAllByType('button').find(item => item.children.join('') === '添加所选引用（2）')!.props.onClick())
  expect(onAdd).toHaveBeenCalledWith(records)
  await act(() => renderer.unmount())
  vi.unstubAllGlobals()
})

type PickerProps = React.ComponentProps<typeof ExperimentReferencePicker>
const additionalPickers: ReturnType<typeof create>[] = []
afterEach(async () => {
  await act(() => { for (const picker of additionalPickers.splice(0)) picker.unmount() })
  vi.unstubAllGlobals()
})

async function mountPicker(kind: PickerProps['kind'], records: readonly WorkbenchRecord[], overrides: Partial<PickerProps> = {}) {
  vi.stubGlobal('document', new EventTarget())
  const queryRecords = vi.fn(async () => [...records]), onAdd = vi.fn(), onUseRun = vi.fn(), onInspect = vi.fn(), onImages = vi.fn(), onClose = vi.fn()
  const props = { kind, workspaces: [], remote: { queryRecords }, onAdd, onUseRun, onInspect, onImages, onClose, ...overrides }
  let renderer!: ReturnType<typeof create>
  await act(async () => { renderer = create(<ExperimentReferencePicker {...props} />) })
  additionalPickers.push(renderer)
  return { renderer, queryRecords, onAdd, onUseRun, onInspect, onImages, onClose }
}

function pickerRun(id: string, taskId = 'source-task'): WorkbenchRecord {
  const sample = fullProjection().runs[0]!
  const run = { ...sample, run_id: id, title: id, workbench_task_id: taskId, media: sample.media.map(media => ({ ...media, media_id: id + '-media', filename: id + '.png' })) }
  return recordFixture({ type: 'run', id, title: id, workspace_id: 'workspace-a', work_id: 'work-a', branch_id: 'root', task_id: taskId, base_model_id: '1', run })
}

it.each(['image-workflow', 'image-agent'] as const)('adds the checked media in selection order for %s and removes unchecked media', async kind => {
  const records = [pickerRun('first'), pickerRun('second')]
  const { renderer, onImages } = await mountPicker(kind, records)
  const add = () => renderer.root.findAllByType('button').find(button => button.children.join('').startsWith('添加已选图片'))!
  expect(add().props.disabled).toBe(true)
  for (const [name, checked] of [['first', true], ['second', true], ['first', false]] as const) {
    await act(() => renderer.root.findByProps({ 'aria-label': '选择图片 ' + name + '.png' }).props.onChange({ target: { checked } }))
  }
  expect(add().children.join('')).toBe('添加已选图片（1）')
  await act(() => add().props.onClick())
  expect(onImages).toHaveBeenCalledWith([expect.objectContaining({ source: { kind: 'run_media', run_id: 'second', media_id: 'second-media' }, purpose: kind === 'image-workflow' ? 'workflow' : 'agent' })], kind === 'image-workflow' ? 'workflow' : 'agent')
})

it('uses a Run input and exposes task artifacts through their separate actions', async () => {
  const runRecord = pickerRun('selected')
  const runs = await mountPicker('run', [runRecord])
  await act(() => runs.renderer.root.findAllByType('button').find(button => button.children.join('') === '使用此运行输入')!.props.onClick())
  expect(runs.onUseRun).toHaveBeenCalledWith(runRecord)
  const data = fullProjection(), task = data.tasks[0]!
  const taskRecord: WorkbenchRecord = recordFixture({ type: 'task', id: task.task_id, title: task.title, task, runs: [], artifacts: data.artifacts, workspace_id: 'workspace-a', work_id: 'work-a', branch_id: task.branch_id, task_id: task.task_id })
  const tasks = await mountPicker('task', [taskRecord])
  await act(() => tasks.renderer.root.findAllByType('button').find(button => button.children.join('') === '添加任务引用')!.props.onClick())
  expect(tasks.onAdd).toHaveBeenCalledWith([taskRecord])
  await act(() => tasks.renderer.root.findAllByType('button').find(button => button.children.join('') === '查看产物')!.props.onClick())
  expect(tasks.onInspect).toHaveBeenCalledWith(taskRecord)
  await act(() => tasks.renderer.root.findAllByType('button').find(button => button.children.join('') === '取消')!.props.onClick())
  expect(tasks.onClose).toHaveBeenCalledOnce()
})

it('keeps only checked favorite records and opens a selected Run source', async () => {
  const experience = fullProjection().experiences[0]!
  const experienceRecord: WorkbenchRecord = recordFixture({ type: 'experience', id: experience.experience_id, title: experience.title, experience, workspace_id: null, work_id: null, branch_id: null, task_id: null })
  const run = pickerRun('favorite-run')
  const { renderer, onAdd, onInspect } = await mountPicker('favorite', [experienceRecord, run])
  for (const [label, checked] of [['选择经验 ' + experienceRecord.id, true], ['选择运行 ' + run.id, true], ['选择经验 ' + experienceRecord.id, false]] as const) {
    await act(() => renderer.root.findByProps({ 'aria-label': label }).props.onChange({ target: { checked } }))
  }
  await act(() => renderer.root.findAllByType('button').find(button => button.children.join('') === '添加所选引用（1）')!.props.onClick())
  expect(onAdd).toHaveBeenCalledWith([run])
  await act(() => renderer.root.findAllByType('button').find(button => button.children.join('') === '查看来源')!.props.onClick())
  expect(onInspect).toHaveBeenCalledWith(run)
})

it.each([new Error('目录读取失败'), 'closed connection'])('retries a failed record query and restores the empty-state view for %s', async failure => {
  const queryRecords = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue([])
  const { renderer } = await mountPicker('experience', [], { remote: { queryRecords } })
  const alert = renderer.root.findByProps({ role: 'alert' })
  expect(alert.children[0]).toBe(failure instanceof Error ? failure.message : '记录加载失败，请重试。')
  await act(async () => alert.findByType('button').props.onClick())
  expect(queryRecords).toHaveBeenCalledTimes(2)
  expect(renderer.root.findAllByProps({ role: 'alert' })).toHaveLength(0)
  expect(JSON.stringify(renderer.toJSON())).toContain('尚未保存经验。')
})

it('follows complete experience Task and Run IDs through the record interface', async () => {
  const data = fullProjection(), task = data.tasks[0]!, runRecord = pickerRun('evidence-run')
  const taskRecord: WorkbenchRecord = recordFixture({ type: 'task', id: task.task_id, title: task.title, task, workspace_id: 'workspace-a', work_id: 'work-a', branch_id: 'root', task_id: task.task_id , runs: [] , artifacts: [] })
  const experience = { ...data.experiences[0]!, provenance: { created_by_task_id: task.task_id, evidence: [{ run_id: runRecord.id, generation_task_id: task.task_id, role: 'counterexample' as const }] } }
  const record: WorkbenchRecord = recordFixture({ type: 'experience', id: experience.experience_id, title: experience.title, experience, workspace_id: 'workspace-a', work_id: 'work-a', branch_id: 'root', task_id: task.task_id })
  const queryRecords = vi.fn(async (query: { type: string }) => query.type === 'task' ? [taskRecord] : query.type === 'run' ? [runRecord] : [record])
  const { renderer, onInspect } = await mountPicker('experience', [record], { remote: { queryRecords }, workspaces: [{ id: 'workspace-a', name: '来源区', path: '/a' }], destinations: [{ workspace_id: 'workspace-a', work_id: 'work-a', work_name: '来源工作', branch_id: 'root', branch_name: '主分支' }] })
  expect(JSON.stringify(renderer.toJSON())).toContain('来源区 / 来源工作 / 主分支')
  await act(async () => renderer.root.findByProps({ 'aria-label': runRecord.id }).props.onClick())
  expect(onInspect).toHaveBeenLastCalledWith(runRecord)
  await act(async () => renderer.root.findByProps({ 'aria-label': task.task_id }).props.onClick())
  expect(onInspect).toHaveBeenLastCalledWith(taskRecord)
  expect(queryRecords.mock.calls.map(([query]) => query.type)).toEqual(['experience', 'run', 'task'])
})

it('reports a failed source lookup and lets the user reload the reference list', async () => {
  const experience = { ...fullProjection().experiences[0]!, provenance: { created_by_task_id: null, evidence: [{ run_id: 'failed-source', generation_task_id: null, role: 'supporting_evidence' as const }] } }
  const record: WorkbenchRecord = recordFixture({ type: 'experience', id: experience.experience_id, title: experience.title, experience, workspace_id: null, work_id: null, branch_id: null, task_id: null })
  const queryRecords = vi.fn(async (query: { type: string }) => { if (query.type === 'run') throw 'offline'; return [record] })
  const { renderer, onInspect } = await mountPicker('experience', [record], { remote: { queryRecords } })
  await act(async () => renderer.root.findByProps({ 'aria-label': 'failed-source' }).props.onClick())
  expect(renderer.root.findByProps({ role: 'alert' }).children[0]).toBe('来源读取失败，请重试。')
  expect(onInspect).not.toHaveBeenCalled()
  await act(async () => renderer.root.findByProps({ role: 'alert' }).findByType('button').props.onClick())
  expect(renderer.root.findAllByProps({ role: 'alert' })).toHaveLength(0)
  expect(queryRecords.mock.calls.map(([query]) => query.type)).toEqual(['experience', 'run', 'experience'])
})

it('filters work and task options by Workspace and resets dependent selections when their source changes', async () => {
  const task = fullProjection().tasks[0]!
  const records: WorkbenchRecord[] = ['a', 'b'].map(id => (recordFixture({ type: 'task', id: 'task-' + id, title: '任务 ' + id, task: { ...task, task_id: 'task-' + id, title: '任务 ' + id }, workspace_id: 'workspace-' + id, work_id: 'work-' + id, branch_id: 'branch-' + id, task_id: 'task-' + id , runs: [] , artifacts: [] })))
  const queryRecords = vi.fn(async (query: { workspaceId?: string; workId?: string; taskId?: string }) => records.filter(record => (!query.workspaceId || record.workspace_id === query.workspaceId) && (!query.workId || record.work_id === query.workId) && (!query.taskId || record.task_id === query.taskId)))
  const { renderer } = await mountPicker('task', records, { remote: { queryRecords }, workspaces: ['a', 'b'].map(id => ({ id: 'workspace-' + id, name: '工作区 ' + id, path: '/' + id })), destinations: ['a', 'b'].map(id => ({ workspace_id: 'workspace-' + id, work_id: 'work-' + id, work_name: '工作 ' + id, branch_id: 'branch-' + id, branch_name: '主分支' })) })
  const select = (label: string) => renderer.root.findByProps({ 'aria-label': label })
  await act(async () => select('引用来源工作区').props.onChange({ target: { value: 'workspace-a' } }))
  expect(select('引用来源工作').findAllByType('option').map(option => option.children.join(''))).toEqual(['所有工作', '工作 a'])
  await act(async () => select('引用来源工作').props.onChange({ target: { value: 'work-a' } }))
  expect(select('引用来源任务').findAllByType('option').map(option => option.props.value)).toEqual(['', 'task-a'])
  await act(async () => select('引用来源任务').props.onChange({ target: { value: 'task-a' } }))
  expect(queryRecords).toHaveBeenLastCalledWith({ type: 'task', workspaceId: 'workspace-a', workId: 'work-a', taskId: 'task-a' })
  await act(async () => select('引用来源工作区').props.onChange({ target: { value: 'workspace-b' } }))
  expect(queryRecords).toHaveBeenLastCalledWith({ type: 'task', workspaceId: 'workspace-b' })
  expect(select('引用来源工作').props.value).toBe('')
  expect(select('引用来源任务').props.value).toBe('')
  expect(select('引用来源任务').findAllByType('option').map(option => option.props.value)).toEqual(['', 'task-b'])
})

it('lists submitted task artifacts while keeping questions outside the completed-artifact list', async () => {
  const task = fullProjection().tasks[0]!
  const common = { task_id: task.task_id, source_files: [], session_id: 'session-source', turn: 1, call_id: 'publish', skill_refs: [], applied_target: null, created_at: 1 }
  const question: StoredArtifact = { ...common, artifact_id: 'artifact-question-hidden', type: 'question', artifact: { type: 'question', question: '采用哪种光线？', options: ['晨光'] }, disposition: 'waiting_input' }
  const prompt: StoredArtifact = { ...common, artifact_id: 'artifact-visible', type: 'prompt', artifact: { type: 'prompt', positive_prompt: 'morning light', negative_prompt: '' }, disposition: 'applied' }
  const records: WorkbenchRecord[] = [
    recordFixture({ type: 'task', id: task.task_id, title: task.title, task, artifacts: [question, prompt], workspace_id: null, work_id: null, branch_id: null, task_id: task.task_id , runs: [] }),
    recordFixture({ type: 'task', id: 'only-question', title: '等待回答', task: { ...task, task_id: 'only-question' }, artifacts: [question], workspace_id: null, work_id: null, branch_id: null, task_id: 'only-question' , runs: [] }),
  ]
  const { renderer } = await mountPicker('task', records)
  const output = JSON.stringify(renderer.toJSON())
  expect(output).toContain('artifact-visible')
  expect(output).not.toContain('artifact-question-hidden')
  expect(renderer.root.findAllByProps({ className: 'reference-option' })[1]!.findByType('p').children).toEqual(['尚未提交产物。'])
})

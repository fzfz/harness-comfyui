import React, { useEffect, useState } from 'react'
import type { ImageRef, WorkbenchRecord, WorkbenchRecordQuery, WorkbenchRun } from '../../workbench/contract.ts'
import type { ExperimentRemote, ExperimentWorkspace } from './experiment-contract.ts'
import { Button, Modal } from './experiment-controls.tsx'
import { ExperienceKnowledge, ExperienceProvenance } from './experiment-experience.tsx'
import { Identifier, shortId } from './experiment-identifier.tsx'
import { runBaseModelId } from '../../workbench/validation.ts'
import taskPresentation from './experiment-task-presentation.json' with { type: 'json' }

export function ExperimentReferencePicker({ kind, workspaces, destinations = [], baseModels = [], remote, onAdd, onUseRun, onInspect, onClose, onImages }: {
  readonly kind: WorkbenchRecordQuery['type'] | 'image-workflow' | 'image-agent'
  readonly workspaces: readonly ExperimentWorkspace[]
  readonly destinations?: readonly import('../../workbench/contract.ts').ReferenceDestination[]
  readonly baseModels?: readonly import('../../catalog/contract.ts').BaseModelItem[]
  readonly remote: Pick<ExperimentRemote, 'queryRecords'>
  readonly onAdd: (records: readonly WorkbenchRecord[]) => void
  readonly onUseRun: (record: WorkbenchRecord) => void
  readonly onInspect: (record: WorkbenchRecord) => void
  readonly onClose: () => void
  readonly onImages?: (images: readonly ImageRef[], purpose: 'workflow' | 'agent') => void
}) {
  const images = kind === 'image-workflow' || kind === 'image-agent'
  const type = images ? 'run' : kind as WorkbenchRecordQuery['type']
  const [filters, setFilters] = useState({ workspaceId: '', workId: '', taskId: '' })
  const [records, setRecords] = useState<readonly WorkbenchRecord[]>([])
  const [allRecords, setAllRecords] = useState<readonly WorkbenchRecord[]>([])
  const [selected, setSelected] = useState<readonly string[]>([])
  const [closedTasks, setClosedTasks] = useState<ReadonlySet<string>>(() => new Set())
  const [selectedImages, setSelectedImages] = useState<ReadonlyMap<string, ImageRef>>(() => new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const query = { type, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) }
    void remote.queryRecords(query).then(value => {
      if (!active) return
      setRecords(value)
      if (!Object.values(filters).some(Boolean)) setAllRecords(value)
      setLoading(false)
    }).catch(failure => { if (active) { setError(failure instanceof Error ? failure.message : '记录加载失败，请重试。'); setLoading(false) } })
    return () => { active = false }
  }, [type, filters.workspaceId, filters.workId, filters.taskId, remote, retry])
  const title = images ? kind === 'image-workflow' ? '选择 Workflow 输入图片' : '选择 Agent 参考图片' : ({ task: '引用任务', run: '引用运行', experience: '引用经验', favorite: '引用收藏' } as const)[type]
  const key = (record: WorkbenchRecord) => `${record.type}:${record.id}`
  const origin = (record: WorkbenchRecord) => {
    const destination = destinations.find(item => item.branch_id === record.branch_id)
    return [workspaces.find(item => item.id === record.workspace_id)?.name ?? record.workspace_id, destination?.work_name ?? record.work_id, destination?.branch_name].filter(Boolean).join(' / ')
  }
  const inspectSource = (type: 'run' | 'task', id: string) => {
    void remote.queryRecords({ type }).then(records => { const record = records.find(item => item.id === id); if (record) onInspect(record) }).catch(failure => setError(failure instanceof Error ? failure.message : '来源读取失败，请重试。'))
  }
  const choose = (record: WorkbenchRecord) => <label className="row reference-choice"><input type="checkbox" aria-label={`选择${record.type === 'experience' ? '经验' : '运行'} ${record.id}`} checked={selected.includes(key(record))} onChange={event => setSelected(before => event.target.checked ? [...before, key(record)] : before.filter(id => id !== key(record)))} /><span title={record.id}>选择{record.type === 'experience' ? '经验' : '运行'} {shortId(record.id)}</span></label>
  const runCard = (record: WorkbenchRecord, run: WorkbenchRun) => <article className="reference-option" key={run.run_id}>
    <div className="reference-preview"><div className="reference-thumbnail">{run.status === 'failed' ? <span>×</span> : run.media.find(item => item.media_kind === 'image')?.url && <img src={run.media.find(item => item.media_kind === 'image')?.url} alt={run.title} />}</div><div><b><Identifier value={run.run_id} /> · {run.title}</b><small>{origin(record)}</small><small>{baseModels.find(item => item.id === record.base_model_id)?.label ?? record.base_model_id ?? '底模未记录'} · {run.media.filter(item => item.media_kind === 'image').length} 张图片</small></div></div>
    <div className="row reference-actions"><Button kind="small primary" onClick={() => onAdd([record])}>添加引用</Button><Button kind="small" onClick={() => onUseRun(record)}>使用此运行输入</Button></div>
  </article>
  const imageCard = (record: WorkbenchRecord, run: WorkbenchRun) => <article className="reference-option" key={run.run_id}>
    <b><Identifier value={run.run_id} /> · 任务 <Identifier value={run.workbench_task_id} /></b><div className="reference-origin">{origin(record)}</div>
    {run.media.filter(item => item.media_kind === 'image').map(media => <label className="image-choice" key={media.media_id}><input type="checkbox" aria-label={`选择图片 ${media.filename}`} checked={selectedImages.has(media.media_id)} onChange={event => setSelectedImages(before => {
      const next = new Map(before)
      if (event.target.checked) next.set(media.media_id, { image_ref_id: crypto.randomUUID(), source: { kind: 'run_media', run_id: run.run_id, media_id: media.media_id }, purpose: kind === 'image-workflow' ? 'workflow' : 'agent', reference_requirement: '' })
      else next.delete(media.media_id)
      return next
    })} /><span className="reference-thumbnail">{media.url && <img src={media.url} alt={media.filename} />}</span><div><b>{media.filename}</b><small>{run.title}</small></div></label>)}
  </article>
  const runRecords = records.filter(record => record.type === 'run' && record.run)
  const visibleRecords = images ? runRecords.filter(record => record.run!.media.some(item => item.media_kind === 'image')) : type === 'favorite' ? [...records.filter(record => record.type === 'experience'), ...runRecords] : records
  const taskIds = [...new Set(runRecords.map(record => record.run!.workbench_task_id))]
  const emptyLabel = images ? '图片' : ({ task: '任务', run: '运行记录', experience: '经验', favorite: '收藏' } as const)[type]
  return <Modal title={title} kind="reference-modal" onClose={onClose}>
    <div className="reference-filters">
      <label className="field"><span>工作区</span><select aria-label="引用来源工作区" value={filters.workspaceId} onChange={event => setFilters({ workspaceId: event.target.value, workId: '', taskId: '' })}><option value="">所有工作区</option>{workspaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field"><span>工作</span><select aria-label="引用来源工作" value={filters.workId} onChange={event => setFilters(before => ({ ...before, workId: event.target.value, taskId: '' }))}><option value="">所有工作</option>{[...new Set(allRecords.filter(item => !filters.workspaceId || item.workspace_id === filters.workspaceId).map(item => item.work_id).filter(Boolean))].map(id => <option key={id} value={id!}>{destinations.find(item => item.work_id === id)?.work_name ?? id}</option>)}</select></label>
      <label className="field"><span>历史任务</span><select aria-label="引用来源任务" value={filters.taskId} onChange={event => setFilters(before => ({ ...before, taskId: event.target.value }))}><option value="">所有任务</option>{[...new Set(allRecords.filter(item => (!filters.workspaceId || item.workspace_id === filters.workspaceId) && (!filters.workId || item.work_id === filters.workId)).map(item => item.task_id).filter(Boolean))].map(id => <option key={id} value={id!} title={id!}>{shortId(id!)} · {allRecords.find(record => record.type === 'task' && record.id === id)?.task?.title ?? '运行任务'}</option>)}</select></label>
    </div>
    {error && <p role="alert">{error}<Button kind="small" onClick={() => setRetry(value => value + 1)}>重试</Button></p>}
    <div className="reference-options">{loading ? <div className="translation-progress"><span className="loading-ring" /></div> : images ? visibleRecords.map(record => imageCard(record, record.run!)) : type === 'run' ? taskIds.map(id => {
      const taskRuns = runRecords.filter(record => record.run!.workbench_task_id === id)
      return <details className="reference-task" key={id} open={!closedTasks.has(id)} onToggle={event => { const open = event.currentTarget.open; setClosedTasks(before => { if (before.has(id) === !open) return before; const next = new Set(before); if (open) next.delete(id); else next.add(id); return next }) }}><summary title={id}>任务 {shortId(id)} · {taskRuns.length} 次运行</summary>{taskRuns.map(record => runCard(record, record.run!))}</details>
    }) : visibleRecords.map(record => <article className="reference-option" key={key(record)}>
      {record.type === 'experience' && record.experience ? <>{choose(record)}<b>{record.title}</b><ExperienceKnowledge experience={record.experience} /><ExperienceProvenance experience={record.experience} location={origin(record)} onRun={id => inspectSource('run', id)} onTask={id => inspectSource('task', id)} /></>
        : record.type === 'run' && record.run ? <>{choose(record)}<b><Identifier value={record.id} /> · {record.title}</b><div className="reference-origin">{origin(record)}</div><Button kind="small quiet" onClick={() => onInspect(record)}>查看来源</Button></>
        : record.type === 'task' && record.task ? <><b>任务 <Identifier value={record.id} /> · {record.title}</b><div className="reference-origin">{origin(record)}</div>{(record.artifacts ?? []).filter(item => item.artifact.type !== 'question').map(item => <p key={item.artifact_id}><Identifier value={item.artifact_id} /> · {taskPresentation.artifactLabels[item.artifact.type]}</p>)}{!(record.artifacts ?? []).some(item => item.artifact.type !== 'question') && <p>尚未提交产物。</p>}{record.runs?.map(run => runCard({ type: 'run', id: run.run_id, title: run.title, workspace_id: record.workspace_id, work_id: record.work_id, branch_id: record.branch_id, task_id: run.workbench_task_id, base_model_id: runBaseModelId(run, record.task!), run }, run))}<Button kind="small primary" onClick={() => onAdd([record])}>添加任务引用</Button><Button kind="small quiet" onClick={() => onInspect(record)}>查看产物</Button></> : null}
    </article>)}{!loading && !visibleRecords.length && !error && <p>{Object.values(filters).some(Boolean) ? `当前筛选条件下暂无${emptyLabel}，请调整筛选条件。` : images ? '尚无运行图片。' : type === 'task' ? '尚无任务。' : type === 'run' ? '尚无运行记录。' : type === 'experience' ? '尚未保存经验。' : '尚未添加收藏。'}</p>}</div>
    {images ? <div className="image-picker-actions"><Button kind="primary" disabled={!selectedImages.size} onClick={() => onImages?.([...selectedImages.values()], kind === 'image-workflow' ? 'workflow' : 'agent')}>添加已选图片（{selectedImages.size}）</Button></div>
      : (type === 'experience' || type === 'favorite') && <div className="image-picker-actions"><Button kind="primary" disabled={!selected.length} onClick={() => onAdd(allRecords.filter(record => selected.includes(key(record))))}>添加所选引用（{selected.length}）</Button></div>}
    <div className="modal-actions"><Button kind="quiet" onClick={onClose}>取消</Button></div>
  </Modal>
}

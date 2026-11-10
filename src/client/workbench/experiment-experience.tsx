import React from 'react'
import type { ReferenceExperience } from '../../workbench/contract.ts'
import { Button } from './experiment-controls.tsx'
import { Identifier, shortId } from './experiment-identifier.tsx'

export function ExperienceKnowledge({ experience }: { readonly experience: Pick<ReferenceExperience, 'conditions' | 'note'> }) {
  return <div className="experience-knowledge"><div className="input-readout"><span>适用条件</span><div>{experience.conditions}</div></div><div className="input-readout"><span>经验结论</span><div>{experience.note}</div></div></div>
}

export function ExperienceProvenance({ experience, location, onRun, onTask }: {
  readonly experience: Pick<ReferenceExperience, 'provenance'>
  readonly location?: string
  readonly onRun: (id: string) => void
  readonly onTask: (id: string) => void
}) {
  const { provenance } = experience
  if (!provenance.created_by_task_id && !provenance.evidence.length) return null
  return <details className="experience-provenance"><summary>来源与证据</summary>
    {location && <div className="reference-origin">{location}</div>}
    <p>{provenance.created_by_task_id ? <>整理任务：<button type="button" aria-label={provenance.created_by_task_id} title={provenance.created_by_task_id} onClick={() => onTask(provenance.created_by_task_id!)}>{shortId(provenance.created_by_task_id)}</button></> : '人工保存'}</p>
    {provenance.evidence.map(item => <div className="row" key={`${item.role}:${item.run_id}`}><span>{item.role === 'counterexample' ? '反例' : '支持证据'}</span><Button kind="small quiet" label={item.run_id} onClick={() => onRun(item.run_id)}><Identifier value={item.run_id} /></Button><span>图片生成任务 {item.generation_task_id ? <Identifier value={item.generation_task_id} /> : '未记录'}</span></div>)}
  </details>
}

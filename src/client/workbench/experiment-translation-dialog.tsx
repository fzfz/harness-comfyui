import React, { useEffect, useState } from 'react'
import { usePromptTranslation } from './experiment-translation-state.ts'
import type { ExperimentRemote } from './experiment-contract.ts'
import { Button, trapDialogFocus } from './experiment-controls.tsx'

type PromptField = 'positive_prompt' | 'negative_prompt'
const fields: Readonly<Record<PromptField, string>> = { positive_prompt: '正向提示词', negative_prompt: '负向提示词' }

export function ExperimentTranslationDialog({ workspaceId, workId, branchId, initialField, prompts, remote, modelLabel, onClose }: {
  readonly workspaceId: string
  readonly workId: string
  readonly branchId: string
  readonly initialField: PromptField
  readonly prompts: Readonly<Record<PromptField, string>>
  readonly remote: Pick<ExperimentRemote, 'translateStart' | 'translateGet' | 'translateCancel'>
  readonly modelLabel: string
  readonly onClose: () => void
}) {
  const [field, setField] = useState(initialField)
  const translation = usePromptTranslation({ workspace_id: workspaceId, work_id: workId, branch_id: branchId, field, source_text: prompts[field] }, remote)
  useEffect(() => { if (!translation.current && !translation.records.length) translation.request() }, [field])
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [])
  const result = translation.current
  return <div className="modal-backdrop"><section className="modal translation-modal" role="dialog" aria-modal="true" aria-labelledby="translation-title" onKeyDown={trapDialogFocus}>
    <header className="row between"><h2 id="translation-title">提示词翻译</h2><Button kind="small quiet" label="关闭翻译" onClick={onClose}>×</Button></header>
    <p className="translation-model">{modelLabel}</p>
    <div className="translation-tabs" role="tablist" aria-label="提示词类型">{(Object.entries(fields) as [PromptField, string][]).map(([id, label]) =>
      <button key={id} type="button" role="tab" id={`translation-tab-${id}`} aria-controls="translation-panel" aria-selected={field === id} disabled={!prompts[id].trim() && !translation.hasHistory(id)}
        autoFocus={id === initialField} onClick={() => setField(id)}>{label}</button>)}</div>
    {!!translation.records.length && <label>翻译记录<select aria-label="翻译记录" value={result?.request_id ?? ''} onChange={event => translation.select(event.target.value)}>
      {result && !translation.records.some(record => record.request_id === result.request_id) && <option value={result.request_id}>本次翻译</option>}
      {translation.records.map((record, index) => <option key={record.request_id} value={record.request_id}>第 {index + 1} 次翻译</option>)}
    </select></label>}
    <div id="translation-panel" role="tabpanel" aria-labelledby={`translation-tab-${field}`}><div className="translation-columns">
      <section><h3>记录原文</h3><div className="translation-text translation-original">{result?.source_text ?? prompts[field]}</div></section>
      <section><h3>中文译文</h3><div className="translation-text translation-result" aria-live="polite" aria-busy={result?.status === 'running'}>
        {result?.status === 'running' ? <div className="translation-progress"><span className="loading-ring" /><span>正在翻译…</span></div>
          : result?.status === 'failed' ? <><p className="translation-error" role="alert">{result.error}</p><Button kind="small" onClick={() => translation.request(result?.source_text)}>重试</Button></> : result?.text ?? ''}
      </div></section>
    </div></div>
    <footer className="modal-actions"><Button kind="quiet" onClick={onClose}>关闭</Button><Button disabled={!prompts[field].trim() || (result?.status === 'running' && result.source_text === prompts[field])} onClick={() => translation.request()}>翻译当前提示词</Button><Button kind="primary" disabled={result?.status !== 'succeeded'} onClick={() => {
      if (result?.status !== 'succeeded' || !result.text) return
      void navigator.clipboard.writeText(result.text).then(() => translation.markCopied(result.request_id))
    }}>{translation.copied ? '已复制' : '复制译文'}</Button></footer>
  </section></div>
}

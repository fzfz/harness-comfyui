import React, { useEffect, useState } from 'react'
import { usePromptTranslation, promptFields, type PromptField, type TranslationRemote } from './experiment-translation-state.ts'
import { PromptTranslationContent } from './experiment-translation-content.tsx'
import { Button, trapDialogFocus } from './experiment-controls.tsx'

export function ExperimentTranslationDialog({ workspaceId, workId, branchId, initialField, prompts, remote, modelLabel, onClose }: {
  readonly workspaceId: string
  readonly workId: string
  readonly branchId: string
  readonly initialField: PromptField
  readonly prompts: Readonly<Record<PromptField, string>>
  readonly remote: TranslationRemote
  readonly modelLabel: string
  readonly onClose: () => void
}) {
  const [field, setField] = useState(initialField)
  const scope = { workspace_id: workspaceId, work_id: workId, branch_id: branchId, target: 'draft' as const }
  const positive = usePromptTranslation({ ...scope, field: 'positive_prompt', source_text: prompts.positive_prompt }, remote, { enabled: field === 'positive_prompt' })
  const negative = usePromptTranslation({ ...scope, field: 'negative_prompt', source_text: prompts.negative_prompt }, remote, { enabled: field === 'negative_prompt' })
  const translation = field === 'positive_prompt' ? positive : negative
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [onClose])
  const result = translation.current
  return <div className="modal-backdrop"><section className="modal translation-modal" role="dialog" aria-modal="true" aria-labelledby="translation-title" onKeyDown={trapDialogFocus}>
    <header className="row between"><h2 id="translation-title">提示词翻译</h2><Button kind="small quiet" label="关闭翻译" onClick={onClose}>×</Button></header>
    <p className="translation-model">{modelLabel}</p>
    <div className="translation-tabs" role="tablist" aria-label="提示词类型">{(Object.entries(promptFields) as [PromptField, string][]).map(([id, label]) =>
      <button key={id} type="button" role="tab" id={`translation-tab-${id}`} aria-controls="translation-panel" aria-selected={field === id} disabled={!prompts[id].trim()} autoFocus={id === initialField} onClick={() => setField(id)}>{label}</button>)}</div>
    <div id="translation-panel" role="tabpanel" aria-labelledby={`translation-tab-${field}`}><div className="translation-columns">
      <section><h3>原文</h3><div className="translation-text translation-original">{prompts[field] || '未填写提示词'}</div></section>
      <section><h3>中文译文</h3><div className="translation-text translation-result" aria-live="polite" aria-busy={result?.status === 'running'}><PromptTranslationContent source={prompts[field]} translation={translation} request={translation.request} /></div></section>
    </div></div>
    <footer className="modal-actions"><Button kind="quiet" onClick={onClose}>关闭</Button><Button disabled={!prompts[field].trim() || result?.status === 'running'} onClick={translation.request}>翻译当前提示词</Button><Button kind="primary" disabled={result?.status !== 'succeeded'} onClick={() => {
      if (result?.status !== 'succeeded') return
      void navigator.clipboard.writeText(result.text).then(() => translation.markCopied(result.request_id))
    }}>{translation.copied ? '已复制' : '复制译文'}</Button></footer>
  </section></div>
}

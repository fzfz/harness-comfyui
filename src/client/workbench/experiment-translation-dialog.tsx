import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ExperimentRemote } from './experiment-contract.ts'
import { Button, trapDialogFocus } from './experiment-controls.tsx'

type PromptField = 'positive_prompt' | 'negative_prompt'
type Translation = { readonly request_id: string; readonly status: 'running' | 'succeeded' | 'failed'; readonly text?: string; readonly error?: string; readonly copied?: boolean }
const fields: Readonly<Record<PromptField, string>> = { positive_prompt: '正向提示词', negative_prompt: '负向提示词' }

export function ExperimentTranslationDialog({ workspaceId, initialField, prompts, remote, modelLabel, onClose }: {
  readonly workspaceId: string
  readonly initialField: PromptField
  readonly prompts: Readonly<Record<PromptField, string>>
  readonly remote: Pick<ExperimentRemote, 'translateStart' | 'translateGet' | 'translateCancel'>
  readonly modelLabel: string
  readonly onClose: () => void
}) {
  const [field, setField] = useState(initialField)
  const [results, setResults] = useState<Partial<Record<PromptField, Translation>>>({})
  const requests = useRef(new Map<PromptField, Translation>())
  const requestIds = useRef(new Set<string>())
  const active = useRef(true)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const update = useCallback((id: PromptField, result: Translation) => {
    if (!active.current || requests.current.get(id)?.request_id !== result.request_id) return
    requests.current.set(id, result)
    setResults(before => ({ ...before, [id]: result }))
  }, [])
  const request = useCallback((id: PromptField) => {
    if (!prompts[id].trim() || requests.current.get(id)?.status === 'running') return
    const request_id = crypto.randomUUID()
    requestIds.current.add(request_id)
    const pending: Translation = { request_id, status: 'running' }
    requests.current.set(id, pending)
    setResults(before => ({ ...before, [id]: pending }))
    const poll = async (result: Translation): Promise<void> => {
      if (!active.current || requests.current.get(id)?.request_id !== request_id) return
      update(id, result)
      if (result.status !== 'running') return
      const timer = setTimeout(() => {
        timers.current.delete(timer)
        void remote.translateGet({ request_id }).then(poll).catch(fail)
      }, 500)
      timers.current.add(timer)
    }
    const fail = (error: unknown) => update(id, { request_id, status: 'failed', error: error instanceof Error ? error.message : '翻译失败，请重试。' })
    void remote.translateStart({ request_id, workspace_id: workspaceId, source_text: prompts[id] }).then(poll).catch(fail)
  }, [prompts, remote, update, workspaceId])
  useEffect(() => {
    active.current = true
    request(initialField)
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', keydown)
    return () => {
      active.current = false
      document.removeEventListener('keydown', keydown)
      for (const timer of timers.current) clearTimeout(timer)
      for (const request_id of requestIds.current) void remote.translateCancel({ request_id }).catch(() => undefined)
    }
  }, [])
  const result = results[field]
  return <div className="modal-backdrop"><section className="modal translation-modal" role="dialog" aria-modal="true" aria-labelledby="translation-title" onKeyDown={trapDialogFocus}>
    <header className="row between"><h2 id="translation-title">提示词翻译</h2><Button kind="small quiet" label="关闭翻译" onClick={onClose}>×</Button></header>
    <p className="translation-model">{modelLabel}</p>
    <div className="translation-tabs" role="tablist" aria-label="提示词类型">{(Object.entries(fields) as [PromptField, string][]).map(([id, label]) =>
      <button key={id} type="button" role="tab" id={`translation-tab-${id}`} aria-controls="translation-panel" aria-selected={field === id} disabled={!prompts[id].trim()}
        autoFocus={id === initialField} onClick={() => { setField(id); if (!requests.current.has(id)) request(id) }}>{label}</button>)}</div>
    <div id="translation-panel" role="tabpanel" aria-labelledby={`translation-tab-${field}`}><div className="translation-columns">
      <section><h3>原文</h3><div className="translation-text translation-original">{prompts[field]}</div></section>
      <section><h3>中文译文</h3><div className="translation-text translation-result" aria-live="polite" aria-busy={result?.status === 'running'}>
        {result?.status === 'running' ? <div className="translation-progress"><span className="loading-ring" /><span>正在翻译…</span></div>
          : result?.status === 'failed' ? <><p className="translation-error" role="alert">{result.error}</p><Button kind="small" onClick={() => request(field)}>重试</Button></> : result?.text ?? ''}
      </div></section>
    </div></div>
    <footer className="modal-actions"><Button kind="quiet" onClick={onClose}>关闭</Button><Button kind="primary" disabled={result?.status !== 'succeeded'} onClick={() => {
      if (!result?.text) return
      void navigator.clipboard.writeText(result.text).then(() => update(field, { ...result, copied: true }))
    }}>{result?.copied ? '已复制' : '复制译文'}</Button></footer>
  </section></div>
}

import { useContext, useEffect, useRef, useState } from 'react'
import { WorkbenchDeliveryContext } from './experiment-delivery.tsx'
import type { ExperimentRemote } from './experiment-contract.ts'
import type { TranslationRequest, TranslationResult } from '../../workbench/translation.ts'

type Scope = Omit<TranslationRequest, 'request_id'>
type Translation = Scope & TranslationResult
export type TranslationRemote = Pick<ExperimentRemote, 'translateStart' | 'translateGet' | 'translateCancel'>

export function usePromptTranslation(scope: Scope, remote: TranslationRemote) {
  const { translations } = useContext(WorkbenchDeliveryContext)
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [local, setLocal] = useState<Record<string, Translation>>({})
  const [copied, setCopied] = useState<ReadonlySet<string>>(new Set())
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const scopedRecords = translations.filter(record => record.workspace_id === scope.workspace_id && record.work_id === scope.work_id && record.branch_id === scope.branch_id)
  const records = scopedRecords.filter(record => record.field === scope.field)
    .sort((left, right) => left.created_at - right.created_at)
  const key = JSON.stringify([scope.workspace_id, scope.work_id, scope.branch_id, scope.field])
  const selected = selections[key]
  const preferred = records.filter(record => record.source_text === scope.source_text).at(-1) ?? records.at(-1)
  const current = selected ? records.find(record => record.request_id === selected) ?? local[selected] ?? preferred : preferred
  const select = (requestId: string) => setSelections(before => ({ ...before, [key]: requestId }))
  const request = (source = scope.source_text) => {
    if (!active.current || !source.trim() || (current?.status === 'running' && current.source_text === source)) return
    const input = { ...scope, source_text: source, request_id: crypto.randomUUID() }
    select(input.request_id)
    setLocal(before => ({ ...before, [input.request_id]: { ...input, status: 'running' } }))
    void remote.translateStart(input).catch(error => {
      if (active.current) setLocal(before => ({ ...before, [input.request_id]: { ...input, status: 'failed', error: error instanceof Error ? error.message : '翻译失败，请重试。' } }))
    })
  }
  const markCopied = (requestId: string) => { if (active.current) setCopied(before => new Set([...before, requestId])) }
  return { records, hasHistory: (field: TranslationRequest['field']) => scopedRecords.some(record => record.field === field), current, copied: !!current && copied.has(current.request_id), request, select, markCopied }
}

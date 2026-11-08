import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Branch, FunctionBinding, TaskRequestDraft } from '../../workbench/contract.ts'
import { catalogPageCount, catalogResourceCompatible, type CatalogItem } from '../../catalog/contract.ts'
import type { CatalogApi } from './catalog-browser.tsx'
import { Button, trapDialogFocus } from './experiment-controls.tsx'
import type { TaskRequestEditor } from './experiment-task-request.ts'
import options from './experiment-input-options.json' with { type: 'json' }

export function ExperimentTaskRequestDialog({ editor, binding, branch, presetName, modelName, catalog, instances, onClose, onSubmit }: {
  readonly editor: TaskRequestEditor
  readonly binding: FunctionBinding
  readonly branch: Branch
  readonly presetName: string
  readonly modelName: string
  readonly catalog: CatalogApi | undefined
  readonly instances: readonly { readonly id: string; readonly name: string }[]
  readonly onClose: () => void
  readonly onSubmit: (draft: TaskRequestDraft) => Promise<void>
}) {
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot)
  useEffect(() => { editor.load(branch.original_request) }, [editor, branch.original_request])
  const labels = options.taskRequest
  const [templates, setTemplates] = useState<readonly CatalogItem[]>([])
  const [catalogError, setCatalogError] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const pending = useRef(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const parameters = binding.kind === 'parameters'
  useEffect(() => {
    if (!parameters) return
    const abort = new AbortController()
    if (!catalog) { setCatalogError(labels.unavailableCatalog); return }
    const read = async () => {
      const query = { kind: 'comfyui-template' as const, query: '', page: 1, baseModelId: null, modelId: null }
      const first = await catalog.search(query, abort.signal)
      const items = [...first.items]
      for (let page = 2; page <= catalogPageCount(first.totalCount); page++) {
        const next = await catalog.search({ ...query, page }, abort.signal)
        items.push(...next.items)
      }
      if (!abort.signal.aborted) setTemplates(items.filter(item => catalogResourceCompatible(item, {
        baseModelId: branch.draft.base_model_id, modelId: branch.draft.generation_input.model?.id ?? null,
      })))
    }
    void read().catch((failure: Error) => { if (!abort.signal.aborted) setCatalogError(failure.message) })
    return () => abort.abort()
  }, [catalog, parameters, branch.draft.base_model_id, branch.draft.generation_input.model?.id])
  const selectedResource = (draft: TaskRequestDraft, name: 'instance_id' | 'template_id') =>
    (name in draft.resources ? draft.resources[name] : branch.draft.generation_input[name]) ?? ''
  const selectResource = (name: 'instance_id' | 'template_id', value: string) => {
    editor.change({ ...state.draft, resources: { ...state.draft.resources, [name]: value || null } })
  }
  return <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onKeyDown={trapDialogFocus}>
    <div className="modal-head"><h2 id="modal-title">{binding.name}</h2><Button kind="quiet small" label={labels.close} autoFocus onClick={onClose}>×</Button></div>
    <form id="modal-form" onSubmit={async event => {
      event.preventDefault()
      if (pending.current || state.loading) return
      pending.current = true
      setSubmitting(true)
      setError('')
      try {
        const draft = await editor.submittedDraft()
        if (parameters && (!selectedResource(draft, 'instance_id') || !selectedResource(draft, 'template_id'))) {
          setError(labels.missingResources)
          return
        }
        await onSubmit(draft)
      } catch (failure) {
        if (alive.current) setError(failure instanceof Error ? failure.message : String(failure))
      } finally {
        pending.current = false
        if (alive.current) setSubmitting(false)
      }
    }}>
      <p>{labels.preset}{presetName}</p><p>{labels.model}{modelName}</p>
      <label className="field"><span>{labels.instructions}</span><textarea id="task-instruction" aria-label={labels.instructions} required disabled={state.loading} value={state.draft.instructions}
        onChange={event => editor.change({ ...state.draft, instructions: event.target.value })} /></label>
      {parameters && <>
        <label className="field"><span>{labels.instance}</span><select id="task-instance" aria-label={labels.instanceInput} disabled={state.loading} value={selectedResource(state.draft, 'instance_id')} onChange={event => selectResource('instance_id', event.target.value)}>
          <option value="">{labels.select}</option>{instances.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label className="field"><span>{labels.template}</span><select id="task-template" aria-label={labels.templateInput} disabled={state.loading} value={selectedResource(state.draft, 'template_id')} onChange={event => selectResource('template_id', event.target.value)}>
          <option value="">{labels.select}</option>{templates.map(item => <option key={item.context.id} value={item.context.id}>{item.label}</option>)}
        </select></label>
      </>}
      <p id="task-error" role="alert" className="binding-problem">{error || state.error || catalogError}</p>
      <div className="modal-actions"><Button kind="quiet" onClick={onClose}>{labels.cancel}</Button><button className="btn primary" type="submit" disabled={state.loading || submitting}>{labels.submit}</button></div>
    </form>
  </section></div>
}

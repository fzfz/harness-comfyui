import React, { useState, useSyncExternalStore, type ReactNode } from 'react'
import type { ReviewDraft } from '../../workbench/contract.ts'
import { Button, Modal } from './experiment-controls.tsx'
import { RunReviewEditor } from './experiment-review-editor.ts'
import presentation from './experiment-review-presentation.json' with { type: 'json' }

export function ExperimentReviewDialog({ editor, branchName, actions, onClose, onSave }: {
  readonly editor: RunReviewEditor
  readonly branchName: string
  readonly actions: (kind: 'review' | 'experience') => ReactNode
  readonly onClose: () => void
  readonly onSave: (saveExperience: boolean) => Promise<void>
}) {
  const { draft, error } = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const fields = presentation.fields.map(definition => {
    const field = definition.field as 'verdict' | 'observation' | 'conclusion' | 'title' | 'conditions' | 'note'
    const common = { id: definition.id, 'aria-label': definition.label, 'data-evaluation-field': field,
      value: draft[field], onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        editor.change(field, event.target.value as ReviewDraft[typeof field])
        setFormError('')
      } }
    return <label className="field" key={field}>
      <span>{definition.label}</span>
      {definition.control === 'select' ? <select {...common} disabled={saving}>
        {presentation.verdicts.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
      </select> : definition.control === 'textarea' ? <textarea {...common} readOnly={saving} /> : <input {...common} readOnly={saving} />}
    </label>
  })
  return <Modal title={presentation.title} kind="evaluation-modal" onClose={onClose}>
    <form id="modal-form" onSubmit={event => {
      event.preventDefault()
      if (saving) return
      const saveExperience = !!(draft.title.trim() || draft.note.trim())
      const validation = saveExperience && (!draft.title.trim() || !draft.conditions.trim() || !draft.note.trim())
        ? presentation.incompleteExperience : !saveExperience && !draft.observation.trim() && !draft.conclusion.trim()
          ? presentation.emptyReview : ''
      if (validation) { setFormError(validation); return }
      setSaving(true)
      void onSave(saveExperience).catch((error: unknown) => {
        setFormError(error instanceof Error ? error.message : String(error))
      }).finally(() => setSaving(false))
    }}>
      <div className="evaluation-form-body">
        <p>{presentation.run.replace(/\{runId\}|\{branchName\}/g, token => token === '{runId}' ? editor.scope.runId : branchName)}</p>
        <section className="evaluation-section">
          <div className="row between"><h3>{presentation.review}</h3><div className="row">{actions('review')}</div></div>
          {fields.slice(0, 3)}
        </section>
        <section className="evaluation-section">
          <div className="row between"><h3>{presentation.experience}</h3><div className="row">{actions('experience')}</div></div>
          {fields.slice(3)}
        </section>
        <p id="evaluation-error" role="alert" className="binding-problem">{formError || error}</p>
      </div>
      <div className="modal-actions">
        <Button kind="quiet" onClick={onClose}>{presentation.cancel}</Button>
        <button className="btn primary" type="submit" disabled={saving}>{presentation.save}</button>
      </div>
    </form>
  </Modal>
}

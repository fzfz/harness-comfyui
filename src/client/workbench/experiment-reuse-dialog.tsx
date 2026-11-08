import React, { useState } from 'react'
import { WORKBENCH_BRANCH_NAME_MAX_LENGTH, type Experience, type ExperienceReuseInput } from '../../workbench/contract.ts'
import type { ExperimentWorkbenchProps } from './experiment-contract.ts'
import { Button, Modal } from './experiment-controls.tsx'
import presentation from './experiment-library-presentation.json' with { type: 'json' }

export function ExperimentReuseDialog({ experience, baseModels, branchCount, onClose, onSubmit }: {
  readonly experience: Experience
  readonly baseModels: ExperimentWorkbenchProps['baseModels']
  readonly branchCount: number
  readonly onClose: () => void
  readonly onSubmit: (value: ExperienceReuseInput) => Promise<void>
}) {
  const [baseModelId, setBaseModelId] = useState(experience.base_model_id ?? '')
  const [name, setName] = useState(() => presentation.defaultBranchName.replace('{number}', String(branchCount + 1)))
  const [submitting, setSubmitting] = useState(false)
  return <Modal title={presentation.reuse} onClose={onClose}>
    <form id="modal-form" onSubmit={async event => {
      event.preventDefault()
      if (submitting) return
      setSubmitting(true)
      try { await onSubmit({ name, baseModelId: baseModelId || null }) }
      finally { setSubmitting(false) }
    }}>
      <p>{experience.title}</p>
      <p>{presentation.sourceRun.replace('{runId}', experience.source_run_id)}</p>
      <label className="field"><span>{presentation.targetBaseModel}</span>
        <select id="reuse-model" aria-label={presentation.targetBaseModel} value={baseModelId}
          disabled={submitting} onChange={event => setBaseModelId(event.target.value)}>
          {!baseModels?.some(item => item.id === baseModelId) &&
            <option value={baseModelId}>{baseModelId || presentation.sourceBaseModel}</option>}
          {baseModels?.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <label className="field"><span>{presentation.branchName}</span>
        <input id="reuse-name" aria-label={presentation.branchName} value={name} required maxLength={WORKBENCH_BRANCH_NAME_MAX_LENGTH}
          readOnly={submitting} onChange={event => setName(event.target.value)} />
      </label>
      <div className="modal-actions">
        <Button kind="quiet" onClick={onClose}>{presentation.cancel}</Button>
        <button className="btn primary" type="submit" disabled={submitting}>{presentation.createBranch}</button>
      </div>
    </form>
  </Modal>
}

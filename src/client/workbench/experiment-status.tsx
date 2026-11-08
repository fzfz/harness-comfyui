import React from 'react'
import type { Experiment, Task, WorkbenchRun } from '../../workbench/contract.ts'
import { isGenerationRunTerminal } from '../../generation/run-status.ts'
import { Button } from './experiment-controls.tsx'
import presentation from './experiment-status-presentation.json' with { type: 'json' }

function format(template: string, values: Readonly<Record<string, string | number>>) {
  return template.replace(/\{(\w+)\}/g, (_token, name: string) => String(values[name]))
}

export function ExperimentStatus({ experiment, task, runs, presetName, modelName, onRun }: {
  readonly experiment: Experiment
  readonly task: Task
  readonly runs: readonly WorkbenchRun[]
  readonly presetName: string
  readonly modelName: string
  readonly onRun: (runId: string) => void
}) {
  const completed = runs.filter(run => isGenerationRunTerminal(run.status) && run.review_artifact_id !== null).length
  const active = runs.find(run => !isGenerationRunTerminal(run.status))
  return <section className="taskbox">
    <div className="row between">
      <span className={`pill ${experiment.control_state === 'paused' ? 'amber' : ''}`}>{presentation.status[experiment.control_state]}</span>
      <span className="mono">{completed} / {experiment.max_runs}</span>
    </div>
    <h3>{task.title}</h3>
    <p>{task.input.requirements.original_request}</p>
    <p>{format(presentation.preset, { preset: presetName })}</p>
    <p>{format(presentation.model, { model: modelName })}</p>
    <div className="progress"><i style={{ width: `${completed / experiment.max_runs * 100}%` }} /></div>
    <p>{format(presentation.budget, { submitted: experiment.submitted_count, remaining: experiment.max_runs - experiment.submitted_count })}</p>
    {active && <p>{format(presentation.active, { runId: active.run_id })}</p>}
    {runs.map(run => <div className="agent-step" key={run.run_id}><div>
      <strong>{format(presentation.round, { index: run.iteration_index!, runId: run.run_id })}</strong>
      <Button kind="small quiet" onClick={() => onRun(run.run_id)}>{presentation.openRound}</Button>
    </div></div>)}
  </section>
}

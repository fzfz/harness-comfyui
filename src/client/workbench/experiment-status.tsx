import React from 'react'
import type { Experiment, StoredArtifact, Task, WorkbenchRun } from '../../workbench/contract.ts'
import { isGenerationRunTerminal } from '../../generation/run-status.ts'
import { Button } from './experiment-controls.tsx'
import presentation from './experiment-status-presentation.json' with { type: 'json' }
import taskPresentation from './experiment-task-presentation.json' with { type: 'json' }

function format(template: string, values: Readonly<Record<string, string | number>>) {
  return template.replace(/\{(\w+)\}/g, (_token, name: string) => String(values[name]))
}

function completedRounds(runs: readonly WorkbenchRun[]) {
  return runs.filter(run => isGenerationRunTerminal(run.status) && run.review_artifact_id !== null).length
}

function orderedRounds(runs: readonly WorkbenchRun[]) {
  return [...runs].sort((a, b) => a.iteration_index! - b.iteration_index!)
}

export function ExperimentTaskRounds({ experiment, runs, artifacts, onRun }: {
  readonly experiment: Experiment
  readonly runs: readonly WorkbenchRun[]
  readonly artifacts: readonly StoredArtifact[]
  readonly onRun: (runId: string) => void
}) {
  return <>
    <p className="task-progress">{format(presentation.progress, { completed: completedRounds(runs), max: experiment.max_runs })}</p>
    {orderedRounds(runs).map(run => {
      const review = artifacts.find(artifact => artifact.artifact_id === run.review_artifact_id)?.artifact
      return <div className="row task-round" key={run.run_id}>
        <Button kind="small quiet" onClick={() => onRun(run.run_id)}>{run.run_id}</Button>
        <span>{review?.type === 'review' ? review.conclusion : ''}</span>
      </div>
    })}
  </>
}

export function ExperimentRunReview({ run, runs, artifacts, onRun }: {
  readonly run: WorkbenchRun
  readonly runs: readonly WorkbenchRun[]
  readonly artifacts: readonly StoredArtifact[]
  readonly onRun: (runId: string) => void
}) {
  const [expanded, setExpanded] = React.useState<Readonly<Record<string, boolean>>>({})
  const review = artifacts.find(artifact => artifact.artifact_id === run.review_artifact_id)?.artifact
  const candidate = artifacts.find(artifact => artifact.artifact_id === run.candidate_artifact_id)?.artifact
  const adoptedPlan = candidate?.type === 'generation_input'
    ? artifacts.find(artifact => artifact.artifact_id === candidate.plan_artifact_id)?.artifact : undefined
  const plan = artifacts.slice().reverse().find(artifact =>
    artifact.artifact.type === 'iteration_plan' && artifact.artifact.source_run_id === run.run_id)
  const nextRuns = plan ? runs.filter(next => {
    const input = artifacts.find(artifact => artifact.artifact_id === next.candidate_artifact_id)?.artifact
    return input?.type === 'generation_input' && input.plan_artifact_id === plan.artifact_id
  }) : []
  const disclosure = (kind: 'agent-review' | 'iteration-plan', title: string, content: React.ReactNode) => {
    const key = `${run.run_id}:${kind}`
    const open = expanded[key] ?? false
    return <details key={key} className={`${kind} review-fold`} aria-label={title} open={open}
      onToggle={event => {
        const next = event.currentTarget.open
        setExpanded(current => current[key] === next ? current : { ...current, [key]: next })
      }}>
      <summary><strong>{title}</strong><span>{open ? presentation.collapse : presentation.expand}</span></summary>
      <div className="review-content" tabIndex={0} role="region" aria-label={format(presentation.body, { title })}>
        {content}
      </div>
    </details>
  }
  return <>
    {review?.type === 'review' && disclosure('agent-review', presentation.agentReview, <>
      <h4>{presentation.changes}</h4>
      {adoptedPlan?.type === 'iteration_plan' ? <ul>{adoptedPlan.changes.map((change, index) => <li key={index}>{change}</li>)}</ul>
        : <p>{run.iteration_index === 1 ? presentation.initialRun : presentation.unrecorded}</p>}
      <h4>{run.status === 'failed' ? presentation.errorReview : presentation.observation}</h4>
      <p>{review.observation}</p>
      <h4>{presentation.conclusion}</h4>
      <p>{review.conclusion}</p>
    </>)}
    {plan?.artifact.type === 'iteration_plan' && disclosure('iteration-plan', presentation.nextPlan, <>
      <ul>{plan.artifact.changes.map((change, index) => <li key={index}>{change}</li>)}</ul>
      <h4>{presentation.reason}</h4>
      <p>{plan.artifact.reason}</p>
      <h4>{presentation.expectedResult}</h4>
      <p>{plan.artifact.expected_result}</p>
      {nextRuns.map(next => <Button key={next.run_id} kind="small quiet" label={presentation.openNextRound} onClick={() => onRun(next.run_id)}>
        {presentation.openNextRound} · {next.run_id}
      </Button>)}
    </>)}
  </>
}

export function ExperimentStatus({ experiment, task, activeTask, runs, presetName, modelName, onRun }: {
  readonly experiment: Experiment
  readonly task: Task
  readonly activeTask?: Task
  readonly runs: readonly WorkbenchRun[]
  readonly presetName: string
  readonly modelName: string
  readonly onRun: (runId: string) => void
}) {
  const completed = completedRounds(runs)
  const active = runs.find(run => !isGenerationRunTerminal(run.status))
  return <section className="taskbox">
    <div className="row between">
      <span className={`pill ${experiment.control_state === 'paused' ? 'amber' : ''}`}>{presentation.status[experiment.control_state]}</span>
      <span className="mono">{completed} / {experiment.max_runs}</span>
    </div>
    <h3>{task.title}</h3>
    <p>{task.input.requirements.original_request}</p>
    {activeTask && <><p>{format(presentation.currentFunction, { name: activeTask.binding_snapshot.name })}</p><p>{taskPresentation.statusLabels[activeTask.status]}</p></>}
    <p>{format(presentation.preset, { preset: presetName })}</p>
    <p>{format(presentation.model, { model: modelName })}</p>
    <div className="progress"><i style={{ width: `${completed / experiment.max_runs * 100}%` }} /></div>
    <p>{format(presentation.budget, { submitted: experiment.submitted_count, remaining: experiment.max_runs - experiment.submitted_count })}</p>
    {active && <p>{format(presentation.active, { runId: active.run_id })}</p>}
    {orderedRounds(runs).map(run => <div className="agent-step" key={run.run_id}><div>
      <strong>{format(presentation.round, { index: run.iteration_index!, runId: run.run_id })}</strong>
      <Button kind="small quiet" onClick={() => onRun(run.run_id)}>{presentation.openRound}</Button>
    </div></div>)}
  </section>
}

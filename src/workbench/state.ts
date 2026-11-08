import type { Experiment, StoredArtifact, Task, TaskStatus, WorkbenchRun } from './contract.ts'

import { isGenerationRunTerminal } from '../generation/run-status.ts'

export function isFinishedRun(status: WorkbenchRun['status']): boolean { return isGenerationRunTerminal(status) }

export function shouldTrackExecution(task: Task, experiment: Experiment | null = null): boolean {
  return task.session_id !== null
    && (task.execution_state === 'pending' || task.execution_state === 'running')
    && (experiment === null || experiment.control_state === 'running')
    && !['succeeded', 'failed', 'interrupted', 'paused'].includes(task.status)
}

export function deriveTaskStatus(task: Task, artifacts: StoredArtifact[], runs: WorkbenchRun[], experiment: Experiment | null): TaskStatus {
  if (task.execution_state === 'interrupted') return 'interrupted'
  if (experiment?.control_state === 'paused') return 'paused'
  if (task.error || task.execution_state === 'failed') return 'failed'
  if (artifacts.some(a => a.type === 'question' && !task.answers.some(answer => answer.question_artifact_id === a.artifact_id))) return 'waiting_input'
  if (runs.some(run => run.status === 'submission_unknown')) return 'needs_attention'
  if (runs.some(run => !isFinishedRun(run.status))) return 'waiting_generation'
  const required = task.output_contract.required_artifact_types.every(type => artifacts.some(artifact => artifact.type === type))
  if (task.kind === 'experiment') {
    const ended = experiment?.control_state === 'ended' || experiment?.control_state === 'completed' || runs.length >= task.input.max_runs
    if (ended) {
      if (runs.every(run => run.review_artifact_id !== null) && (required || runs.length === 0)) return runs.some(run => run.status === 'failed' || run.status === 'cancelled') ? 'failed' : 'succeeded'
      return 'needs_attention'
    }
  } else if (required && (!task.output_contract.requires_finished_runs || runs.length > 0)) {
    return runs.some(run => run.status === 'failed' || run.status === 'cancelled') ? 'failed' : 'succeeded'
  }
  if (task.execution_state === 'running') return 'running'
  if (task.execution_state === 'idle') return 'needs_attention'
  return 'pending'
}

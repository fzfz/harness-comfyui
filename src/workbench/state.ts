import type { JsonValue } from '#contracts'
import type { Experiment, GenerationInput, PromptInput, StoredArtifact, Task, TaskDraft, TaskStatus, WorkbenchRun } from './contract.ts'

import { equalValue } from '../shared/json-contract.ts'
import { WorkbenchError } from './validation.ts'
import { isGenerationRunTerminal } from '../generation/run-status.ts'

export function isFinishedRun(status: WorkbenchRun['status']): boolean { return isGenerationRunTerminal(status) }

export function mergeTaskDraft(expected: TaskDraft, draft: TaskDraft, current: TaskDraft): TaskDraft {
  const record = (value: object) => value as Record<string, unknown>
  const merge = (before: object, next: object, actual: object, prefix = '', excluded: readonly string[] = []) => {
    const baseline = record(before), desired = record(next), existing = record(actual), result = structuredClone(existing)
    for (const key of new Set([...Object.keys(baseline), ...Object.keys(desired)])) {
      if (excluded.includes(key) || equalValue(baseline[key], desired[key])) continue
      const path = prefix ? `${prefix}.${key}` : key
      if (!equalValue(existing[key], baseline[key]) && !equalValue(existing[key], desired[key])) throw new WorkbenchError('WORKBENCH_EDIT_CONFLICT', '编辑内容已改变，请核对当前内容后重新编辑。', path)
      if (Object.hasOwn(desired, key)) Object.defineProperty(result, key, { value: structuredClone(desired[key]), enumerable: true, configurable: true, writable: true })
      else delete result[key]
    }
    return result
  }
  const merged = merge(expected, draft, current, '', ['prompt_input', 'generation_input']) as unknown as TaskDraft
  merged.prompt_input = merge(expected.prompt_input, draft.prompt_input, current.prompt_input, 'prompt_input') as unknown as PromptInput
  merged.generation_input = merge(expected.generation_input, draft.generation_input, current.generation_input, 'generation_input', ['parameters']) as unknown as GenerationInput
  merged.generation_input.parameters = merge(expected.generation_input.parameters, draft.generation_input.parameters, current.generation_input.parameters, 'generation_input.parameters') as Record<string, JsonValue>
  return merged
}

export function shouldTrackExecution(task: Task, experiment: Experiment | null = null): boolean {
  return task.session_id !== null
    && (task.execution_state === 'pending' || task.execution_state === 'running' || task.execution_state === 'idle')
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

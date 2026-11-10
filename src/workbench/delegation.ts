import Schema from '@deepseek-ai/schemastery'
import type { AgentModel, ExperimentInputSource, FunctionBinding } from './contract.ts'
import { agentModelSchema, experimentInputSourceSchema } from './schema.ts'
import { TASK_KINDS } from './functions.ts'

export interface DelegateFunctionRequest {
  task_id: string
  function_id: string
  instructions: string
  source: ExperimentInputSource
  reference_artifact_ids: string[]
}

export interface DelegatedSessionRequest {
  parentSessionId: string
  sessionId: string
  taskId: string
  label: string
  text: string
  presetId: string
  agentModel: AgentModel
  requestedSkill: string | null
  signal: AbortSignal
}

export const delegatableKinds = TASK_KINDS.filter(kind => kind !== 'experiment')
export function isDelegatable(binding: FunctionBinding): binding is FunctionBinding & { kind: typeof delegatableKinds[number] } { return delegatableKinds.some(kind => kind === binding.kind) }
const id = () => Schema.string().required()
export const functionListRequestSchema = Schema.object({ task_id: id() })
export const functionListResultSchema = Schema.object({
  task_id: id(),
  functions: Schema.array(Schema.object({
    function_id: id(), name: id(), kind: id(), purpose: id(), artifact_types: Schema.array(Schema.string()).required(), preset_id: id(), agent_model: agentModelSchema,
  })).required(),
})
export const delegateFunctionRequestSchema = Schema.object({
  task_id: id(), function_id: id(), instructions: Schema.string().required(),
  source: experimentInputSourceSchema.required(),
  reference_artifact_ids: Schema.array(Schema.string()).default([]),
})
export const delegateFunctionResultSchema = Schema.object({
  task_id: id(), parent_experiment_task_id: id(), session_id: id(), function_id: id(), status: id(),
})

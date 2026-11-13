import type { ContractValue } from '#contracts'
import type { AgentModel, FunctionBinding } from './contract.ts'

import { TASK_KINDS } from './functions.ts'

export type DelegateFunctionRequest = ContractValue<'delegateFunctionRequest'>

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

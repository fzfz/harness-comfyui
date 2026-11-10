import data from './functions.json' with { type: 'json' }
import type { FunctionDescriptor, TaskKind } from './contract.ts'

export const WORKBENCH_FUNCTIONS: readonly FunctionDescriptor[] = data.functions as FunctionDescriptor[]
export const FUNCTION_KINDS = WORKBENCH_FUNCTIONS.map(descriptor => descriptor.kind)
export const TASK_KINDS = WORKBENCH_FUNCTIONS.filter(descriptor => descriptor.execution_mode === 'task').map(descriptor => descriptor.kind as TaskKind)

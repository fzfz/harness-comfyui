import data from './functions.json' with { type: 'json' }
import type { FunctionDescriptor } from './contract.ts'

type FunctionDefinition = Omit<FunctionDescriptor, 'default_request_template'> & { request_steps: readonly string[] }

export const WORKBENCH_FUNCTIONS: readonly FunctionDescriptor[] = (data.functions as FunctionDefinition[]).map(({ request_steps, ...descriptor }) => ({
  ...descriptor,
  default_request_template: [...data.request_prefix, ...request_steps, ...data.request_suffix].join('\n\n'),
}))
export const TASK_KINDS = WORKBENCH_FUNCTIONS.map(descriptor => descriptor.kind)

import data from './functions.json' with { type: 'json' }
import cliHelp from '../../config/managed-cli-help.json' with { type: 'json' }
import type { FunctionDescriptor } from './contract.ts'

export const WORKBENCH_FUNCTIONS: readonly FunctionDescriptor[] = (data as FunctionDescriptor[]).map(descriptor => ({
  ...descriptor,
  default_request_template: `使用受管 CLI：${cliHelp.invocation} --help。\n${descriptor.default_request_template}`,
}))
export const TASK_KINDS = WORKBENCH_FUNCTIONS.map(descriptor => descriptor.kind)

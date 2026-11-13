import Schema from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import { assertSupportedJsonSchema, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import { contracts, type ContractParsed } from '#contracts'
import type { WorkbenchIdentity } from '../../workbench/contract.ts'
import { WorkbenchError } from '../../workbench/validation.ts'
import type {} from './plugin.ts'

export const name = 'harness-comfyui-workbench-tools'
export const inject = ['tools', 'harnessComfyuiWorkbench']

function identity(ctx: Context, execution: ToolRunContext, taskId: string): WorkbenchIdentity {
  const session = execution.agent?.session
  const call = session?.snapshotEvents().find(event => event.type === 'tool/call' && String(event.data.callId) === String(execution.rootCallId))
  if (!session || call?.type !== 'tool/call') throw new WorkbenchError('WORKBENCH_TOOL_IDENTITY_REQUIRED', '请通过当前 Agent 会话调用工作台工具。', 'session_id')
  return { workspaceId: ctx.harnessComfyuiWorkbench.service.taskWorkspace(taskId), sessionId: String(session.id), turn: call.data.turn, callId: String(execution.callId) }
}

export interface Config { tools?: string[] }
export const Config = Schema.object({ tools: Schema.array(Schema.string()).default(undefined as never) })

type CommonTool = 'workbench_task_get' | 'workbench_task_publish' | 'workbench_experiment_end' | 'workbench_function_list' | 'workbench_function_delegate'

export function apply(ctx: Context, config: Config = {}): void {
  const { service } = ctx.harnessComfyuiWorkbench
  function register<K extends CommonTool>(toolName: K, execute: (args: ContractParsed<K, 'input'>, caller: WorkbenchIdentity, signal: AbortSignal) => Promise<unknown>) {
    if (config.tools && !config.tools.includes(toolName)) return
    ctx.tools.register(contracts.bind(toolName, 'native', {
      assertSchema: assertSupportedJsonSchema,
      async execute(args, execution: ToolRunContext) {
        execution.signal.throwIfAborted()
        return execute(args, identity(ctx, execution, args.task_id), execution.signal)
      },
    }))
  }
  if (config.tools?.includes('workbench_function_list')) register('workbench_function_list',
    (args, caller) => service.listFunctions({ taskId: args.task_id }, caller))
  if (config.tools?.includes('workbench_function_delegate')) register('workbench_function_delegate',
    (args, caller, signal) => service.delegateFunction(args, caller, signal))
  register('workbench_task_get', (args, caller) => service.getTask({ taskId: args.task_id }, caller))
  register('workbench_task_publish', (args, caller) => service.publish({ taskId: args.task_id, artifact: args.artifact }, caller))
  register('workbench_experiment_end', (args, caller) => service.endExperiment({ taskId: args.task_id, reason: args.reason }, caller))
}

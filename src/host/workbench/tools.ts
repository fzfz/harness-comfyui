import Schema from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import descriptions from '../../../config/workbench-tool-descriptions.json' with { type: 'json' }
import { taskGetRequestSchema, taskGetResultSchema, taskPublishRequestSchema, taskPublishReceiptSchema, experimentEndRequestSchema, experimentSchema } from '../../workbench/schema.ts'
import type { ArtifactPayload, TaskGetResult, WorkbenchIdentity } from '../../workbench/contract.ts'
import { WorkbenchError, jsonValue } from '../../workbench/validation.ts'
import { nativeToolSchema } from './tool-schema.ts'
import type {} from './plugin.ts'
import { functionListRequestSchema, functionListResultSchema, delegateFunctionRequestSchema, delegateFunctionResultSchema, type DelegateFunctionRequest } from '../../workbench/delegation.ts'
import delegationDescriptions from '../../../config/workbench-delegation-tools.json' with { type: 'json' }

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

export function apply(ctx: Context, config: Config = {}): void {
  const { service } = ctx.harnessComfyuiWorkbench
  function register(toolName: string, description: string, input: Schema, output: Schema, execute: (args: unknown, caller: WorkbenchIdentity, signal: AbortSignal) => Promise<unknown>, render?: ToolDefinition['output']['render']) {
    if (config.tools && !config.tools.includes(toolName)) return
    ctx.tools.register({
      name: toolName, description, parameters: nativeToolSchema(input, toolName.startsWith('workbench_function_') ? delegationDescriptions.fields : descriptions.fields) as ToolDefinition['parameters'],
      output: { schema: nativeToolSchema(output), render: render ?? ((_args, value) => [{ type: 'text', text: JSON.stringify(value) }]) },
      async execute(args, execution) {
        execution.signal.throwIfAborted()
        const request = Schema.resolve(args, input, {})[0]
        const caller = identity(ctx, execution, request.task_id)
        execution.signal.throwIfAborted()
        const result = await execute(request, caller, execution.signal)
        return jsonValue(Schema.resolve(result, output, {})[0])
      },
    })
  }
  if (config.tools?.includes('workbench_function_list')) register('workbench_function_list', delegationDescriptions.list, functionListRequestSchema, functionListResultSchema,
    (args, caller) => service.listFunctions({ taskId: (args as { task_id: string }).task_id }, caller))
  if (config.tools?.includes('workbench_function_delegate')) register('workbench_function_delegate', delegationDescriptions.delegate, delegateFunctionRequestSchema, delegateFunctionResultSchema,
    (args, caller, signal) => service.delegateFunction(args as DelegateFunctionRequest, caller, signal))
  register('workbench_task_get', descriptions.summary, taskGetRequestSchema, taskGetResultSchema,
    (args, caller) => service.getTask({ taskId: (args as { task_id: string }).task_id }, caller),
    (_args, value) => {
      const task = value as unknown as TaskGetResult
      const fields = [...descriptions.common_fields, ...descriptions.fields_by_kind[task.kind]]
      const guidance = { fields: Object.fromEntries(fields.map(field => [field, descriptions.fields[field as keyof typeof descriptions.fields]])), usage: descriptions.usage_by_kind[task.kind] }
      return [{ type: 'text', text: JSON.stringify({ ...task, guidance }) }]
    })
  register('workbench_task_publish', [descriptions.publish.summary, ...descriptions.publish.steps].join('\n'), taskPublishRequestSchema, taskPublishReceiptSchema,
    (args, caller) => { const request = args as { task_id: string; artifact: ArtifactPayload }; return service.publish({ taskId: request.task_id, artifact: request.artifact }, caller) })
  register('workbench_experiment_end', descriptions.end.summary, experimentEndRequestSchema, experimentSchema,
    (args, caller) => { const request = args as { task_id: string; reason: 'goal_met' | 'user_ended' }; return service.endExperiment({ taskId: request.task_id, reason: request.reason }, caller) })
}

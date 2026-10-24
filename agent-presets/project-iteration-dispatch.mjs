import { randomUUID } from 'node:crypto'
import { MessageId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import dispatchContract from './project-dispatch.json' with { type: 'json' }

/**
 * @typedef {import('@deepseek-ai/dsh-tools').ToolRunContext} ToolRunContext
 * @typedef {import('@deepseek-ai/dsh-subagent').SubagentStartRequest} StartRequest
 * @typedef {{ description: string, agent_id?: string } & Record<string, unknown>} DispatchArgs
 * @typedef {{title: string, sections: {heading: string, fields: string[]}[]}} TaskTemplate
 * @typedef {{
 *   toolName: string, description: string,
 *   parameters: import('@deepseek-ai/dsh-tools').ToolDefinition['parameters'],
 *   taskTemplate: TaskTemplate, provider: string, agentPreset: string,
 *   agentOptions?: StartRequest['agentOptions'], maxDepth?: number,
 *   nonEmptyFieldErrors?: Record<string, string>
 * }} DispatchConfig
 */

export const name = 'harness-comfyui-iteration-dispatch'
export const inject = ['tools', 'subagents']

/** @param {TaskTemplate} template @param {Record<string, unknown>} args */
function taskMessage(template, args) {
  const sections = template.sections.flatMap(({ heading, fields }) => {
    const values = Object.fromEntries(fields
      .filter(field => args[field] !== undefined)
      .map(field => [field, args[field]]))
    return Object.keys(values).length === 0
      ? []
      : [`## ${heading}\n${JSON.stringify(values, null, 2)}`]
  })
  return [`# ${template.title}`, ...sections].join('\n\n')
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {DispatchConfig} config
 * @param {(args: DispatchArgs, exec: ToolRunContext) => Promise<DispatchArgs>} [prepareArgs]
 */
export function apply(ctx, config, prepareArgs) {
  ctx.tools.register({
    name: config.toolName,
    description: `${config.description}\n\n${dispatchContract.usage}`,
    parameters: config.parameters,
    output: {
      schema: /** @type {import('@deepseek-ai/dsh-tools').ToolOutputDefinition['schema']} */ (dispatchContract.outputSchema),
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(rawArgs, exec) {
      exec.signal.throwIfAborted()
      if (!exec.agent) throw new Error('Dispatch requires a parent Agent. Run this tool from an Agent session.')
      const args = /** @type {DispatchArgs} */ (rawArgs)
      for (const [field, errorMessage] of Object.entries(config.nonEmptyFieldErrors ?? {})) {
        if (args[field] !== undefined && (typeof args[field] !== 'string' || args[field].trim().length === 0)) {
          throw new Error(errorMessage)
        }
      }
      const preparedArgs = prepareArgs === undefined ? args : await prepareArgs(args, exec)
      exec.signal.throwIfAborted()
      /** @type {import('@deepseek-ai/dsh-llm').ContentBlock[]} */
      const message = [{ type: 'text', text: taskMessage(config.taskTemplate, preparedArgs) }]
      let childId
      let messageId
      if (args.agent_id !== undefined) {
        childId = SessionId(args.agent_id)
        messageId = await ctx.subagents.sendMessage(exec.agent, childId, message, { signal: exec.signal })
      } else {
        const activation = await ctx.subagents.startActivation({
          provider: config.provider,
          label: preparedArgs.description,
          signal: exec.signal,
          delivery: 'parent',
          request: {
            parent: exec.agent,
            prompt: message,
            agentPreset: config.agentPreset,
            agentOptions: config.agentOptions,
            maxDepth: config.maxDepth,
          },
        })
        childId = activation.childId
        messageId = activation.messageId
      }
      const receipt = {
        status: 'accepted', operation: args.agent_id === undefined ? 'create' : 'continue',
        subagentId: childId, messageId,
      }
      exec.deferContext({
        id: MessageId(randomUUID()), role: 'user', source: { kind: 'harness-subagent-accepted' },
        content: [{ type: 'text', text: JSON.stringify({
          toolName: config.toolName, callId: exec.callId, ...receipt,
        }) }],
      })
      return receipt
    },
  })
}

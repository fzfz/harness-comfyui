export const name = 'harness-comfyui-iteration-dispatch'
export const inject = ['tools', 'subagents']

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

export function apply(ctx, config) {
  ctx.tools.register({
    name: config.toolName,
    description: config.description,
    parameters: config.parameters,
    output: {
      schema: config.outputSchema,
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted()
      for (const [field, errorMessage] of Object.entries(config.nonEmptyFieldErrors ?? {})) {
        if (args[field] !== undefined && (typeof args[field] !== 'string' || args[field].trim().length === 0)) {
          throw new Error(errorMessage)
        }
      }
      const message = [{ type: 'text', text: taskMessage(config.taskTemplate, args) }]
      if (args.agent_id !== undefined) {
        const messageId = await ctx.subagents.sendMessage(exec.agent, args.agent_id, message,
          { signal: exec.signal })
        return { messageId }
      }
      const result = await ctx.subagents.startContinuable({
        provider: config.provider,
        label: args.description,
        signal: exec.signal,
        request: {
          parent: exec.agent,
          label: args.description,
          prompt: message,
          persona: config.persona,
          agentOptions: config.agentOptions,
          toolFilter: config.toolFilter,
          maxDepth: config.maxDepth,
        },
      })
      return { kind: 'continuable', subagentId: result.childId }
    },
  })
}

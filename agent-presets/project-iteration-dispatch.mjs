import { randomUUID } from 'node:crypto'

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

function observeCompletion(ctx, exec) {
  const scope = new AbortController()
  const signal = AbortSignal.any([exec.signal, scope.signal])
  const children = new Set()
  const pending = []
  let identity
  let inserted = false
  let runId
  let resolve
  let reject
  const completion = new Promise((done, fail) => { resolve = done; reject = fail })
  void completion.catch(() => {})
  const abort = () => reject(signal.reason)
  const consume = () => {
    if (!identity) return
    for (const event of pending.splice(0)) {
      if (event.childId !== identity.childId) continue
      if (event.started && (!inserted || runId === undefined)) runId = event.runId
      else if (event.messageId === identity.messageId) inserted = true
      else if (event.ended && (runId === undefined || event.runId === runId)) {
        if (inserted) resolve()
        else runId = undefined
      }
    }
  }
  const dispose = ctx.effect(() => {
    const stopSession = ctx.on('session/event', (session, event) => {
      if (session.header.parentSession !== exec.agent.id || event.type !== 'agent/inbox/spliced') return
      if (identity && session.id !== identity.childId) return
      children.add(session.id)
      for (const message of event.data.inserted) {
        pending.push({ childId: session.id, messageId: message.id })
      }
      consume()
    }, { global: true })
    const stopStart = ctx.on('subagent/start', info => {
      if (identity && info.id !== identity.childId) return
      children.add(info.id)
      pending.push({ childId: info.id, started: true, runId: info.runId })
      consume()
    }, { global: true })
    const stopEnd = ctx.on('subagent/end', info => {
      if (!children.has(info.id)) return
      pending.push({ childId: info.id, ended: true, runId: info.runId })
      consume()
    }, { global: true })
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    return () => {
      stopSession()
      stopEnd()
      stopStart()
      scope.abort()
      signal.removeEventListener('abort', abort)
      pending.length = 0
      children.clear()
    }
  })
  return {
    signal, dispose,
    wait(childId, messageId) {
      identity = { childId, messageId }
      consume()
      return completion
    },
  }
}

export function apply(ctx, config, prepareArgs) {
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
      const preparedArgs = prepareArgs === undefined ? args : await prepareArgs(args, exec)
      exec.signal.throwIfAborted()
      const message = [{ type: 'text', text: taskMessage(config.taskTemplate, preparedArgs) }]
      const observer = observeCompletion(ctx, exec)
      try {
        let childId
        let messageId
        let output
        if (args.agent_id !== undefined) {
          childId = args.agent_id
          messageId = await ctx.subagents.sendMessage(exec.agent, childId, message,
            { signal: observer.signal })
          output = { messageId }
        } else {
          const result = await ctx.subagents.startContinuable({
            provider: config.provider,
            label: args.description,
            signal: observer.signal,
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
          childId = result.childId
          messageId = result.messageId
          output = { kind: 'continuable', subagentId: childId }
        }
        exec.deferContext({
          id: randomUUID(), role: 'user', source: { kind: 'harness-subagent-accepted' },
          content: [{ type: 'text', text: JSON.stringify({
            toolName: config.toolName, callId: exec.callId, subagentId: childId, messageId, status: 'accepted',
          }) }],
        })
        await observer.wait(childId, messageId)
        return output
      } finally {
        await observer.dispose()
      }
    },
  })
}

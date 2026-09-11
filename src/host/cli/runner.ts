import type { Context } from '@deepseek-ai/cordis'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { randomUUID } from 'node:crypto'
import type { CliRunnerServices, Config } from './runner-schema.ts'
export { Config } from './runner-schema.ts'

export const name = 'harness-comfyui-cli-runner'
export const inject = ['agents', 'sessions', 'agentDefaultModel', 'agentPresets', 'harnessComfyuiCli'] as const

export async function runCliTask(ctx: Context & CliRunnerServices, config: Config): Promise<number> {
  await ctx.get('loader')?.await()
  const selection = ctx.agentDefaultModel.currentSelection()
  const { agent } = await ctx.agents.create({
    sessionId: SessionId(`session-${randomUUID()}`),
    meta: { cwd: process.cwd() },
    agentOptions: { provider: selection.provider, model: selection.model },
    setup: async agentCtx => {
      await ctx.agentPresets.mount(agentCtx, config.preset)
      installModelSelection(agentCtx, { current: selection, assembled: undefined })
    },
  })
  await agent.whenIdle()
  const firstSeq = agent.session.seq
  agent.followup(createUserMessage({ content: [{ type: 'text', text: config.task }], source: { kind: 'user' } }))
  await agent.whenIdle()
  await ctx.sessions.flush(agent.session)
  let text = ''
  let code = 1
  for (const event of agent.session.snapshotEvents()) {
    if (event.seq < firstSeq) continue
    if (event.type === 'assistant/message') text = event.data.message.content.filter(block => block.type === 'text').map(block => block.text).join('')
    if (event.type === 'turn/end') {
      code = event.data.reason.kind === 'completed' ? 0 : 1
      if (event.data.reason.kind === 'error') process.stderr.write(`${event.data.reason.error.code}: ${event.data.reason.error.message}\n`)
    }
  }
  process.stdout.write(`${text}\n`)
  return code
}

export function apply(ctx: Context, config: Config): void {
  const services = ctx as Context & CliRunnerServices
  void runCliTask(services, config).then(code => services.appExit(code), error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    services.appExit(1)
  })
}

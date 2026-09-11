import type { Context } from '@deepseek-ai/cordis'
import type { } from '@deepseek-ai/dsh-agent'
import { realpath } from 'node:fs/promises'

export const name = 'harness-comfyui-cli-workspace'
export const inject = ['workspaceRegistry', 'agents'] as const
export function apply(ctx: Context): void {
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    if (agent.session.header.origin === 'subagent') return next()
    const cwd = agent.session.header.cwd
    if (cwd === undefined) throw new Error('CLI Session has no working directory. Start the task from an existing directory.')
    const path = await realpath(cwd)
    const workspace = await ctx.workspaceRegistry.create(path)
    if (!workspace.sessionIds.some(id => String(id) === String(agent.session.id))) await workspace.attachSession(agent.session.id)
    return next()
  })
}

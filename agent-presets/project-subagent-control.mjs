import { readFileSync } from 'node:fs'

import { SessionId } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'harness-comfyui-project-subagent-control'
export const inject = ['tools', 'subagents']

const contract = JSON.parse(readFileSync(new URL('./project-subagent-control.json', import.meta.url), 'utf8'))

/** @param {import('@deepseek-ai/cordis').Context} ctx */
export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: contract.tool.name,
    description: contract.tool.description,
    parameters: contract.tool.parameters,
    output: {
      schema: contract.tool.outputSchema,
      render: args => [{ type: 'text', text: contract.renderTemplate.replace('{agent_id}', args.agent_id) }],
    },
    execute(args, exec) {
      if (!exec.agent) throw new Error(contract.missingAgentError)
      ctx.subagents.interrupt(SessionId(/** @type {string} */ (args.agent_id)), { kind: 'ancestor', agent: exec.agent })
      return Promise.resolve({ accepted: true })
    },
  }))
}

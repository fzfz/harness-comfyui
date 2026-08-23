import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

import { registerProjectTools } from '../host/tools/register-project-tools.ts'

const definitions: readonly ToolDefinition[] = []

export const name = 'harness-comfyui/agent'
export const inject = ['tools'] as const

/** Register project Tools in the standing Agent Preset scope. */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const disposeProjectTools = registerProjectTools(ctx, definitions)

    return () => {
      disposeProjectTools()
    }
  }, 'project Agent Tool registry')
}

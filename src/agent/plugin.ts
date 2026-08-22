import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

import { registerProjectTools } from '../host/tools/register-project-tools.ts'

const definitions: readonly ToolDefinition[] = []

export const name = 'harness-comfyui/agent'
export const inject = ['tools'] as const

/** Restrict inherited Tools before registering this Agent Preset's project Tools. */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const disposeRestriction = ctx.tools.restrict({ allow: [] })
    let disposeProjectTools: (() => void) | undefined
    try {
      disposeProjectTools = registerProjectTools(ctx, definitions)
    } catch (error) {
      disposeRestriction()
      throw error
    }

    return () => {
      disposeProjectTools?.()
      disposeRestriction()
    }
  }, 'project Agent Tool registry')
}

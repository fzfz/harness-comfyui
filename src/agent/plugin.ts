import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

import { registerProjectTools } from '../host/tools/register-project-tools.ts'

const definitions: readonly ToolDefinition[] = []

export const name = 'harness-comfyui/agent'
export const inject = ['tools'] as const

type AgentPlugin = {
  readonly inject: typeof inject
  readonly apply: (ctx: Context) => void
}

function applyDefinitions(ctx: Context, projectTools: readonly ToolDefinition[]): void {
  ctx.effect(() => {
    const disposeProjectTools = registerProjectTools(ctx, projectTools)

    return () => {
      disposeProjectTools()
    }
  }, 'project Agent Tool registry')
}

/**
 * Create the project Agent plugin with an explicit Tool set.
 *
 * The shipped plugin uses the empty product Tool set below. Tests that mount a
 * disposable composition may provide a fixture set while still exercising the
 * same registration seam and standing Agent scope.
 */
export function createAgentPlugin(projectTools: readonly ToolDefinition[] = definitions): AgentPlugin {
  return {
    inject,
    apply: ctx => applyDefinitions(ctx, projectTools),
  }
}

/** Register the empty product Tool set in the standing Agent Preset scope. */
export const apply = createAgentPlugin().apply

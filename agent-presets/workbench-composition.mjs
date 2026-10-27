import z from '@deepseek-ai/schemastery'

/** @import {} from '@deepseek-ai/dsh-tools' */

export const name = 'workbench-composition'
export const inject = ['systemPrompt', 'tools']

/** @typedef {{ omittedRuntimeContexts: string[], deniedTools: string[] }} WorkbenchCompositionConfig */

export const Config = z.object({
  omittedRuntimeContexts: z.array(z.string()).required(),
  deniedTools: z.array(z.string()).required(),
})

/** @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {WorkbenchCompositionConfig} config */
export function apply(ctx, config) {
  for (const name of config.omittedRuntimeContexts) {
    ctx.systemPrompt.context({ name, order: 0, interpolate: false, text: '' })
  }
  const pending = new Set(config.deniedTools)
  const restrictRegisteredTools = () => {
    for (const name of pending) {
      if (!ctx.tools.get(name)) continue
      pending.delete(name)
      ctx.tools.restrict({ deny: [name] })
    }
  }
  ctx.on('tools/change', restrictRegisteredTools)
  restrictRegisteredTools()
}

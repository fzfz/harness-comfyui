import { apply as registerDispatch } from './project-iteration-dispatch.mjs'

export const name = 'harness-comfyui-observation-dispatch'
export const inject = ['tools', 'subagents', 'harnessComfyuiCore']

export function apply(ctx, config) {
  registerDispatch(ctx, config, async (args, exec) => ({
    ...args,
    images: await ctx.harnessComfyuiCore.services.resolveObservationMedia(exec, config.toolName, args.images),
  }))
}

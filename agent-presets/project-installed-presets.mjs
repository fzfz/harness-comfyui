import { fileURLToPath } from 'node:url'

export const name = 'harness-comfyui-installed-presets'
export const inject = ['loader', 'agentPresets']

export function createInstalledPresetsComponent({
  moduleUrl = import.meta.url,
  loadIncludePlugin = () => import('@deepseek-ai/cordis-plugin-include'),
} = {}) {
  return {
    name,
    inject,
    async apply(ctx) {
      const { default: Include } = await loadIncludePlugin()
      await ctx.plugin(Include, {
        path: fileURLToPath(new URL('./presets.cordis.yml', moduleUrl)),
      })
    },
  }
}

const component = createInstalledPresetsComponent()
export const apply = component.apply

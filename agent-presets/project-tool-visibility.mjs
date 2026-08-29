export const name = 'harness-comfyui-project-tool-visibility'
export const inject = ['tools']

const MODES = new Set(['inherit-host-global', 'local-only'])

export function apply(ctx, config) {
  if (config === null || typeof config !== 'object' || !MODES.has(config.mode)) {
    throw new TypeError('project Tool visibility mode must be inherit-host-global or local-only')
  }
  if (config.mode === 'inherit-host-global') return
  const deny = ctx.tools.schemas().map(schema => schema.name)
  if (deny.length === 0) throw new Error('local-only project Tool visibility requires Host-global Tool schemas')
  ctx.effect(() => ctx.tools.restrict({ deny }), 'hide Host-global Tools from the candidate Preset')
}

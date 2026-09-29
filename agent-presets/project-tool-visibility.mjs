export const name = 'harness-comfyui-project-tool-visibility'
export const inject = ['tools']

const MODES = new Set(['inherit-host-global', 'local-only'])
const PTC_TRANSPORT_NAME = 'run_code'

export function apply(ctx, config) {
  if (config === null || typeof config !== 'object' || !MODES.has(config.mode)) {
    throw new TypeError('project Tool visibility mode must be inherit-host-global or local-only')
  }
  if (config.mode === 'inherit-host-global') return
  ctx.effect(() => {
    const denied = new Set()
    const restrictions = []
    let syncing = false
    let pending = false
    let closed = false
    const sync = () => {
      if (closed) return
      if (syncing) {
        pending = true
        return
      }
      syncing = true
      try {
        do {
          pending = false
          for (const { name } of ctx.root.tools.schemas()) {
            if (name === PTC_TRANSPORT_NAME || denied.has(name)) continue
            denied.add(name)
            try {
              restrictions.push(ctx.tools.restrict({ deny: [name] }))
            } catch (error) {
              denied.delete(name)
              throw error
            }
          }
        } while (pending)
      } finally {
        syncing = false
      }
    }
    const stopListening = ctx.on('tools/change', sync)
    try {
      sync()
    } catch (error) {
      closed = true
      stopListening()
      for (const dispose of restrictions.reverse()) dispose()
      throw error
    }
    return () => {
      closed = true
      stopListening()
      for (const dispose of restrictions.reverse()) dispose()
    }
  }, 'hide Host-global Tools from the candidate Preset')
}

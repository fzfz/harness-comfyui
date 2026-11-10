import { scopeOf } from '@deepseek-ai/dsh-scope'
/** @import {} from '@deepseek-ai/dsh-tools' */
/** @import {} from '@deepseek-ai/dsh-system-prompt' */

export const name = 'comfyui-specialist-composition'
export const inject = ['tools', 'systemPrompt']

/** @param {import('@deepseek-ai/cordis').Context} ctx */
export function apply(ctx) {
  const key = scopeOf(ctx)
  if (!key) throw new Error('ComfyUI specialist composition requires a scope')
  let updating = false
  /** @type {string[]} */
  let previous = []
  /** @type {(() => void) | undefined} */
  let release
  const update = () => {
    if (updating) return
    const denied = ctx.tools.schemas().map(tool => tool.name)
      .filter(name => { const scoped = ctx.tools.get(name, key); return scoped === undefined || scoped === ctx.tools.get(name) }).sort()
    if (denied.length === previous.length && denied.every((name, index) => name === previous[index])) return
    updating = true
    try {
      previous = denied
      release?.()
      release = denied.length ? ctx.tools.restrict({ deny: denied }) : undefined
    } finally { updating = false }
  }
  ctx.on('tools/change', update)
  update()
  for (const name of ['harness:source', 'app:web-surface']) {
    ctx.systemPrompt.context({ name, order: 0, interpolate: false, text: '' })
  }
}

/** @import {} from '@deepseek-ai/dsh-tools' */

export const name = 'translation-composition'
export const inject = ['tools']

/** @param {import('@deepseek-ai/cordis').Context} ctx */
export function apply(ctx) {
  ctx.tools.restrict({ allow: [] })
}

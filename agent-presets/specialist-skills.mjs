import z from '@deepseek-ai/schemastery'
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem'
import configuration from '../config/workbench-agent-roles.json' with { type: 'json' }

export const name = 'comfyui-specialist-skills'
export const inject = ['skills']
export const Config = z.object({ roleId: z.string().required(), bundledSkillDir: z.string().required() })

/** @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ roleId: string, bundledSkillDir: string }} config */
export function apply(ctx, config) {
  const role = configuration.roles.find(role => role.id === config.roleId)
  if (!role) throw new TypeError(`Unknown ComfyUI role: ${config.roleId}`)
  const allowed = new Set(role.skills.map(skill => skill.name))
  ctx.skills.registerProvider(control => {
    const provider = new FileSystemSkillProvider(ctx, control, {
      providerName: 'comfyui-role-filesystem', includeDefaultRoots: false,
      bundledSkillDir: config.bundledSkillDir, watch: false,
    })
    control.signal.addEventListener('abort', () => { void provider.dispose() }, { once: true })
    return {
      name: provider.name,
      async list(options) {
        const result = await provider.list(options)
        if (Array.isArray(result)) return result.filter(skill => allowed.has(skill.name))
        const observation = /** @type {import('@deepseek-ai/dsh-skill').SkillProviderObservation} */ (result)
        return { ...observation, candidates: observation.candidates.filter(skill => allowed.has(skill.name)) }
      },
      get: (candidate, options) => allowed.has(candidate.name) ? provider.get(candidate, options) : Promise.resolve(undefined),
    }
  })
}

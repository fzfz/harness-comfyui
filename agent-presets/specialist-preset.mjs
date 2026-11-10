import AgentPreset from '@deepseek-ai/dsh-agent-preset'
import { applyEntryPatches } from '@deepseek-ai/cordis-plugin-include'
import z from '@deepseek-ai/schemastery'
import { fileURLToPath } from 'node:url'
import configuration from '../config/workbench-agent-roles.json' with { type: 'json' }

const taskTools = new Set(['workbench_task_get', 'workbench_task_publish', 'workbench_experiment_end', 'workbench_function_list', 'workbench_function_delegate'])
/** @param {string} path */
const resource = path => fileURLToPath(new URL(path, import.meta.url))

/** @param {string} roleId
 * @returns {import('@deepseek-ai/cordis-plugin-loader').EntryOptions[]} */
export function specialistComposition(roleId) {
  const role = configuration.roles.find(role => role.id === roleId)
  if (!role) throw new TypeError(`Unknown ComfyUI role: ${roleId}`)
  const native = role.nativeTools.filter(name => !taskTools.has(name))
  return [
    { id: 'specialist-composition', name: resource('./specialist-composition.mjs') },
    { id: 'agent-instructions', name: '@deepseek-ai/dsh-agent-instructions', config: { maxBytes: 65536 } },
    { id: 'workbench-tools', name: 'harness-comfyui/workbench-tools', config: { tools: role.nativeTools.filter(name => taskTools.has(name)) } },
    ...(native.length ? [{ id: 'specialist-tools', name: 'harness-comfyui/specialist-tools', config: { roleId } }] : []),
    ...role.mcpServices.map(service => {
      const definition = configuration.mcpServices[/** @type {keyof typeof configuration.mcpServices} */ (service)]
      return { id: definition.entryId, name: 'cordis:include', config: { path: resource(`./${definition.composition}`) } }
    }),
    { id: 'specialist-skills', name: 'cordis:group', group: true, isolate: { skills: true }, config: [
      { id: 'skills', name: '@deepseek-ai/dsh-skill' },
      { id: 'skill-provider', name: resource('./specialist-skills.mjs'), config: { roleId, bundledSkillDir: resource('../.agents/skills') } },
      ...(role.skills.length ? [{ id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' }] : []),
    ] },
    ...(role.hostTools.includes('send_message') ? [{ id: 'tool-subagent-control', name: '@deepseek-ai/dsh-tool-subagent-control' }] : []),
    ...(role.hostTools.includes('list_agents') ? [{ id: 'tool-subagent-list', name: '@deepseek-ai/dsh-tool-subagent-control/list-agents' }] : []),
    { id: 'tool-presentation', name: '@deepseek-ai/dsh-agent-tool-presentation', config: { mode: 'native' } },
    { id: 'persona', name: '@deepseek-ai/dsh-persona', config: {
      complete: true, includeRuntimeContext: true, prefix: `${role.persona}\n\n${role.functions.includes('prompt') ? configuration.promptReplyPersona : configuration.taskPersona}`,
    } },
  ]
}

export default class SpecialistPreset extends AgentPreset {
  static Config = z.transform(z.object({ roleId: z.string().required(), patches: z.array(z.any()).default([]) }), config => {
    const role = configuration.roles.find(role => role.id === config.roleId)
    if (!role) throw new TypeError(`Unknown ComfyUI role: ${config.roleId}`)
    return AgentPreset.Config({ id: role.id, name: role.name, order: role.order, plugins: applyEntryPatches(specialistComposition(role.id), config.patches ?? [], console.warn) })
  })
}

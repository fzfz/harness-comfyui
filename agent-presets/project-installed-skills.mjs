import { fileURLToPath } from 'node:url'

const name = 'harness-comfyui-project-installed-skills'
const inject = ['skills']

function filesystemConfig(moduleUrl) {
  return {
    providerName: 'harness-comfyui',
    includeDefaultRoots: false,
    watch: false,
    customSkillDirs: [fileURLToPath(new URL('../.agents/skills', moduleUrl))],
  }
}

export function createProjectInstalledSkillsComponent({
  moduleUrl = import.meta.url,
  loadFilesystemPlugin = () => import('@deepseek-ai/dsh-skill-filesystem'),
} = {}) {
  return {
    name,
    inject,
    async apply(ctx) {
      const filesystemPlugin = await loadFilesystemPlugin()
      await ctx.plugin(filesystemPlugin, filesystemConfig(moduleUrl))
    },
  }
}

export { inject, name }

const component = createProjectInstalledSkillsComponent()

export const apply = component.apply

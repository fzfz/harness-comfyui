import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { readProjectAgentPresetResources } from '../../scripts/build/agent-preset-resources.mjs'

export async function readProjectComposition(repositoryRoot, presetId) {
  const resources = await readProjectAgentPresetResources(repositoryRoot, presetId)
  const common = resources.composition.find(row => row.id === 'project-common')
  const commonPath = resolve(repositoryRoot, 'agent-presets', presetId, common.config.path)
  const shared = yaml.load(await readFile(commonPath, 'utf8'), { schema: entryListSchema })
  return { ...resources, composition: [...shared, ...resources.composition.filter(row => row !== common)] }
}

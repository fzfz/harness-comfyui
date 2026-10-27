import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import yaml from 'js-yaml'

import { createOfficialPresetProfilePatch } from './official-preset-overrides.mjs'

describe('official Desktop approved Skill directories', () => {
  it('adds explicit custom directories while preserving the packaged directory and isolated Skill service', async () => {
    const root = await mkdtemp(join(tmpdir(), 'official-skill-overrides-'))
    const save = async (path, value) => {
      await mkdir(join(root, path, '..'), { recursive: true })
      await writeFile(join(root, path), typeof value === 'string' ? value : yaml.dump(value))
    }
    const shared = [{ id: 'workbench-skills', name: 'cordis:group', group: true, isolate: { skills: true }, config: [
      { id: 'skills', name: '@deepseek-ai/dsh-skill' },
      { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem', config: {
        includeDefaultRoots: false, bundledSkillDir: './packaged-skills', customSkillDirs: [],
      } },
      { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
    ] }]
    try {
      await save('config/product-agent.json', JSON.stringify({ preset: { id: 'workbench', sourceRootRelativePath: 'agent-presets' } }))
      await save('agent-presets/presets.cordis.yml', [{ id: 'preset-workbench', name: 'preset', config: {
        id: 'workbench', plugins: [{ id: 'composition', name: 'cordis:include', config: { path: './workbench/agent.cordis.yml' } }],
      } }])
      await save('agent-presets/workbench/agent.cordis.yml', [{ id: 'project-common', name: 'cordis:include', config: { path: '../shared/agent.cordis.yml' } }])
      await save('agent-presets/shared/agent.cordis.yml', shared)
      const patch = await createOfficialPresetProfilePatch({ installedPackageRoot: root, customSkillDirs: ['/tmp/approved-skills'] })
      const common = patch.config.patches[0].config.plugins[0].config.patches.find(row => row.id === 'project-common')
      const group = common.config.patches.find(row => row.id === 'workbench-skills')
      expect(group.config.find(row => row.id === 'skill-filesystem').config).toEqual({
        includeDefaultRoots: false, bundledSkillDir: './packaged-skills', customSkillDirs: ['/tmp/approved-skills'],
      })
      expect(yaml.load(await readFile(join(root, 'agent-presets/shared/agent.cordis.yml'), 'utf8'))).toEqual(shared)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

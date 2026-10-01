import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const yaml = createRequire(import.meta.url)('js-yaml')

describe('ComfyUI Workbench Skill plugin ownership', () => {
  it('leaves Skill discovery and slash invocation to the selected Agent Preset', () => {
    const bundleSource = readFileSync(resolve(repositoryRoot, 'cordis.patch.yml'), 'utf8')
    const patch = yaml.load(bundleSource)
    const bundleRows: Array<{ id?: string; name: string }> = patch.flatMap(
      (operation: { insert: Array<{ id?: string; name: string }> }) => operation.insert,
    )
    expect(bundleSource).not.toMatch(/skill-filesystem|tool-skill|project-installed-skills|\.agents\/skills/u)
    expect(bundleRows.some(row => ['agent-default-model', 'llm-pi-ai', 'bash-sandbox'].includes(row.id ?? '')))
      .toBe(false)
    expect(bundleRows.filter(row => row.name === './agent-presets/project-installed-presets.mjs'))
      .toHaveLength(1)

    for (const presetId of ['harness-comfyui-cli-candidate', 'harness-comfyui-iteration']) {
      const composition = readFileSync(
        resolve(repositoryRoot, `agent-presets/${presetId}/agent.cordis.yml`), 'utf8',
      )
      expect(composition.match(/^  name: '@deepseek-ai\/dsh-tool-skill'$/gmu)).toHaveLength(1)
      expect(composition.match(/^  name: \.\.\/project-installed-skills\.mjs$/gmu)).toHaveLength(1)
      expect(composition).not.toContain("name: '@deepseek-ai/dsh-skill-filesystem'")
    }
  })
})

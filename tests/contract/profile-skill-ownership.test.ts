import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'
import productAgent from '../../config/product-agent.json' with { type: 'json' }
import { readProjectComposition } from '../fixtures/preset-composition.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const yaml = createRequire(import.meta.url)('js-yaml')

describe('ComfyUI Workbench Skill plugin ownership', () => {
  it('leaves Skill discovery and slash invocation to the selected Agent Preset', async () => {
    const bundleSource = readFileSync(resolve(repositoryRoot, 'cordis.patch.yml'), 'utf8')
    const patch = yaml.load(bundleSource)
    const bundleRows: Array<{ id?: string; name: string }> = patch.flatMap(
      (operation: { insert: Array<{ id?: string; name: string }> }) => operation.insert,
    )
    expect(bundleSource).not.toMatch(/skill-filesystem|tool-skill|project-installed-skills|\.agents\/skills/u)
    expect(bundleRows.some(row => ['agent-default-model', 'llm-pi-ai', 'bash-sandbox'].includes(row.id ?? '')))
      .toBe(false)
    expect(bundleRows.filter(row => row.name === 'harness-comfyui/presets'))
      .toHaveLength(1)

    for (const presetId of [productAgent.preset.id]) {
      const { composition } = await readProjectComposition(repositoryRoot, presetId)
      const skillScope = composition.find(row => row.id === 'workbench-skills')
      expect(skillScope).toMatchObject({ name: 'cordis:group', group: true, isolate: { skills: true } })
      const skillRows = skillScope?.config
      assert.ok(Array.isArray(skillRows))
      for (const name of ['@deepseek-ai/dsh-skill', '@deepseek-ai/dsh-tool-skill', '@deepseek-ai/dsh-skill-filesystem']) {
        expect(skillRows.filter(row => row.name === name)).toHaveLength(1)
        expect(composition.some(row => row.name === name)).toBe(false)
      }
      expect(skillRows.find(row => row.name === '@deepseek-ai/dsh-skill-filesystem')?.config)
        .toMatchObject({ includeDefaultRoots: false, customSkillDirs: [], bundledSkillDir: { __jsExpr: expect.any(String) } })
    }
  })
})

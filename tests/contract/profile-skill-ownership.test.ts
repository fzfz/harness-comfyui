import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '../..')

describe('ComfyUI Workbench Skill plugin ownership', () => {
  it('leaves Skill discovery and slash invocation to the selected Agent Preset', () => {
    const profilePatch = readFileSync(
      resolve(repositoryRoot, 'profiles/comfyui-workbench/cordis.patch.yml'),
      'utf8',
    )

    expect(profilePatch).toBe('[]\n')

    const developmentProfilePatch = readFileSync(
      resolve(repositoryRoot, 'profiles/comfyui-workbench-development/cordis.patch.yml'),
      'utf8',
    )
    const bundlePatch = readFileSync(resolve(repositoryRoot, 'cordis.patch.yml'), 'utf8')
    const productPreset = readFileSync(
      resolve(repositoryRoot, 'agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml'),
      'utf8',
    )
    expect(developmentProfilePatch).not.toMatch(/skill-filesystem|tool-skill/u)
    expect(developmentProfilePatch).toBe('[]\n')
    expect(bundlePatch).not.toMatch(/skill-filesystem|tool-skill|\.agents\/skills/u)
    expect(bundlePatch).toContain('apiKeyEnv: OPENCODE_GO_API_KEY')
    expect(bundlePatch).toContain(`- id: bash-sandbox
  config:
    timeoutMs: 180000`)
    expect(productPreset.match(/name: '@deepseek-ai\/dsh-tool-skill'/gu)).toHaveLength(1)
    expect(productPreset.match(/customSkillDirs:/gu)).toHaveLength(1)
    expect(productPreset).toContain(`providerName: harness-comfyui
    includeDefaultRoots: false
    watch: false
    customSkillDirs: [!!js process.env.HARNESS_COMFYUI_SKILL_DIR]`)
  })
})

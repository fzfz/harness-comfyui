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
  })
})

import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, it } from 'vitest'

import { buildPlugin } from '../../scripts/build/index.mjs'

it('rejects an invalid project Preset before writing plugin build outputs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'plugin-build-preset-'))
  const presetDirectory = join(root, 'agent-presets', 'invalid-preset')
  try {
    await mkdir(join(root, 'config'))
    await mkdir(presetDirectory, { recursive: true })
    await writeFile(join(root, 'config', 'product-agent.json'), JSON.stringify({
      schemaVersion: 3,
      preset: {
        id: 'invalid-preset',
        additionalManagedPresetIds: [],
        sourceRootRelativePath: 'agent-presets',
      },
      skills: { sourceRootRelativePath: '.agents/skills' },
    }))
    await writeFile(join(presetDirectory, 'preset.yml'), 'name: Invalid preset\n')
    await writeFile(join(presetDirectory, 'agent.cordis.yml'), '- id: missing-plugin-name\n')

    await expect(buildPlugin({ repositoryRoot: root, outputRoot: root }))
      .rejects.toThrow('composition is invalid: row 1 names no plugin')
    await expect(access(join(root, '.local'))).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

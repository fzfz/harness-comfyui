import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '../..')

const cases = [
  {
    name: 'ANIMA',
    skillDirectory: 'anima-prompt-builder',
    input: {
      model_route: 'anima-aesthetic-v1.1',
      positive_prompt: 'one adult swordswoman, full body',
      negative_mode: 'native_negative',
      negative_prompt: 'worst quality, malformed hands',
      positive_avoidance: null,
      generation_purpose: 'test',
      aspect_ratio: '1:1',
      width: 512,
      height: 512,
      megapixels: 0.25,
    },
  },
  {
    name: 'WAI',
    skillDirectory: 'wai-sdxl-prompt-builder',
    input: {
      model_route: 'wai-illustrious-sdxl',
      positive_prompt: '1girl, adult, full body',
      negative_mode: 'native_negative',
      negative_prompt: 'bad quality, malformed hands',
      positive_avoidance: null,
      generation_purpose: 'test',
      aspect_ratio: '1:1',
      width: 1024,
      height: 1024,
      megapixels: 1,
    },
  },
  {
    name: 'Krea2',
    skillDirectory: 'krea2-anime-prompt-builder',
    input: {
      model_route: 'krea2-turbo',
      positive_prompt: 'one adult dancer, full body, two complete hands',
      negative_mode: 'positive_rewrite',
      negative_prompt: null,
      positive_avoidance: 'two complete hands with five separated fingers each',
      generation_purpose: 'test',
      aspect_ratio: '1:1',
      width: 1024,
      height: 1024,
      megapixels: 1,
    },
  },
]

describe('Prompt Builder generation-output validator CLI', () => {
  it.each(cases)('runs $name validation through the Desktop Skill-root symlink topology', ({ skillDirectory, input }) => {
    const directory = mkdtempSync(join(tmpdir(), 'prompt-builder-validator-'))
    const runtimeAgentsDirectory = join(directory, '.agents')
    const linkedSkillRoot = join(runtimeAgentsDirectory, 'skills')
    try {
      mkdirSync(runtimeAgentsDirectory)
      symlinkSync(resolve(repositoryRoot, '.agents/skills'), linkedSkillRoot)
      const linkedScript = join(linkedSkillRoot, skillDirectory, 'scripts/validate-output.mjs')
      const result = spawnSync(process.execPath, [linkedScript], {
        input: JSON.stringify(input),
        encoding: 'utf8',
      })

      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
      expect(JSON.parse(result.stdout)).toEqual(input)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

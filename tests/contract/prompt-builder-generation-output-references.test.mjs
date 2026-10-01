import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const builderNames = [
  'anima-prompt-builder',
  'wai-sdxl-prompt-builder',
  'krea2-anime-prompt-builder',
]
const allSkillNames = [...builderNames, 'comfyui-generate']
const readJson = path => JSON.parse(readFileSync(path, 'utf8'))
const skillDirectory = name => resolve(root, '.agents/skills', name)
const builderResult = ({ route, mode, profile, purpose = 'test' }) => ({
  model_route: route,
  positive_prompt: 'one complete positive prompt',
  negative_mode: mode,
  negative_prompt: mode === 'native_negative' ? 'short negative prompt' : null,
  positive_avoidance: mode === 'positive_rewrite' ? 'two clear hands with five separated fingers' : null,
  generation_purpose: purpose,
  aspect_ratio: profile.aspect_ratio,
  width: profile[purpose].width,
  height: profile[purpose].height,
  megapixels: profile[purpose].megapixels,
})

describe('Prompt Builder generation output references', () => {
  it('maps each generation model route to the Prompt Builder used by that route', () => {
    const routes = readJson(resolve(
      root,
      '.agents/skills/comfyui-generate/references/prompt-builder-model-routes.json',
    )).model_routes

    expect(routes).toEqual({
      'anima-aesthetic-v1.1': { skill_name: 'anima-prompt-builder' },
      'wai-illustrious-sdxl': { skill_name: 'wai-sdxl-prompt-builder' },
      'krea2-turbo': { skill_name: 'krea2-anime-prompt-builder' },
    })
    for (const [route, { skill_name: skillName }] of Object.entries(routes)) {
      const profiles = readJson(resolve(skillDirectory(skillName), 'references/generation-profiles.json'))
      expect(profiles.model_routes, `${route} must be defined by ${skillName}`).toHaveProperty(route)
    }
    for (const skillName of builderNames) {
      const profiles = readJson(resolve(skillDirectory(skillName), 'references/generation-profiles.json'))
      const mappedRoutes = Object.entries(routes)
        .filter(([, route]) => route.skill_name === skillName)
        .map(([route]) => route)
        .sort()
      expect(Object.keys(profiles.model_routes).sort()).toEqual(mappedRoutes)
    }
  })

  it('uses the WAI validator CLI directly without removed Skill tools', () => {
    const directory = skillDirectory('wai-sdxl-prompt-builder')
    const skill = readFileSync(resolve(directory, 'SKILL.md'), 'utf8')
    const validatorReference = readFileSync(
      resolve(directory, 'references/prompt-format-validator.md'),
      'utf8',
    )
    const executableDocuments = `${skill}\n${validatorReference}`

    expect(executableDocuments).not.toMatch(/\brun_skill_script\b|\bfinalize_skill_error\b/u)
    expect(validatorReference).toContain('ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals scripts/validate-output.mjs --quiet --prompt-format')
  })

  it('keeps every Skill-owned reference linked from its SKILL.md', () => {
    const references = {
      'anima-prompt-builder': [
        'references/generation-output-contract.md',
        'references/generation-output-schema.json',
        'references/generation-profiles.json',
      ],
      'wai-sdxl-prompt-builder': [
        'references/generation-output-contract.md',
        'references/generation-output-schema.json',
        'references/generation-profiles.json',
      ],
      'krea2-anime-prompt-builder': [
        'references/generation-output-contract.md',
        'references/generation-output-schema.json',
        'references/generation-profiles.json',
      ],
      'comfyui-generate': [
        'references/prompt-result-contract.md',
        'references/prompt-result-schema.json',
        'references/catalog-cli.md',
        'references/template-parameter-inspection-cli.md',
        'references/generation-cli.md',
      ],
    }
    for (const name of allSkillNames) {
      const directory = skillDirectory(name)
      const skill = readFileSync(resolve(directory, 'SKILL.md'), 'utf8')
      for (const relativePath of references[name]) {
        expect(skill).toContain(`\`${relativePath}\``)
        expect(existsSync(resolve(directory, relativePath)), `${name}/${relativePath}`).toBe(true)
      }
    }
  })

  it('keeps four local result schemas deeply equal and strict about the ten result properties', () => {
    const schemaPaths = [
      ...builderNames.map(name => resolve(skillDirectory(name), 'references/generation-output-schema.json')),
      resolve(skillDirectory('comfyui-generate'), 'references/prompt-result-schema.json'),
    ]
    const schemas = schemaPaths.map(readJson)
    schemas.slice(1).forEach(schema => expect(schema).toEqual(schemas[0]))
    expect(schemas[0].required).toEqual([
      'model_route', 'positive_prompt', 'negative_mode', 'negative_prompt', 'positive_avoidance',
      'generation_purpose', 'aspect_ratio', 'width', 'height', 'megapixels',
    ])
    expect(schemas[0].additionalProperties).toBe(false)
  })

  it.each(builderNames)('%s validator reads local profiles, accepts every profile, and rejects Seed properties', (name) => {
    const directory = skillDirectory(name)
    const profiles = readJson(resolve(directory, 'references/generation-profiles.json'))
    const script = resolve(directory, 'scripts/validate-output.mjs')
    for (const [route, routeContract] of Object.entries(profiles.model_routes)) {
      for (const profile of profiles.size_profiles) {
        for (const purpose of ['test', 'final']) {
          const input = builderResult({ route, mode: routeContract.negative_mode, profile, purpose })
          const accepted = spawnSync(process.execPath, [script, '--quiet'], { input: JSON.stringify(input), encoding: 'utf8' })
          expect(accepted.status, accepted.stderr).toBe(0)
          expect(accepted.stderr).toBe('')
          expect(JSON.parse(accepted.stdout)).toEqual(input)
        }
      }
    }
    const [route, routeContract] = Object.entries(profiles.model_routes)[0]
    const profile = profiles.size_profiles[0]
    for (const extraProperty of ['seed', 'seed_mode']) {
      const rejected = spawnSync(process.execPath, [script, '--quiet'], {
        input: JSON.stringify({
          ...builderResult({ route, mode: routeContract.negative_mode, profile }),
          [extraProperty]: extraProperty === 'seed' ? 42 : 'random',
        }),
        encoding: 'utf8',
      })
      expect(rejected.status).toBe(2)
      expect(rejected.stdout).toBe('')
      expect(rejected.stderr).toContain('NEXT:')
      expect(JSON.parse(rejected.stderr.split('\n')[0]).violations).toContainEqual(expect.objectContaining({ path: extraProperty }))
    }
  })

  it('keeps model-specific negative constants in their local structured profiles', () => {
    const anima = readJson(resolve(skillDirectory('anima-prompt-builder'), 'references/generation-profiles.json'))
    expect(anima.model_routes).toEqual({
      'anima-aesthetic-v1.1': {
        negative_mode: 'native_negative',
        base_negative_items: [
          'worst quality', 'low quality', 'artist name', 'blurry', 'jpeg artifacts', 'chromatic aberration',
        ],
      },
    })
    const wai = readJson(resolve(skillDirectory('wai-sdxl-prompt-builder'), 'references/generation-profiles.json'))
    expect(wai.model_routes['wai-illustrious-sdxl']).toEqual({
      negative_mode: 'native_negative',
      base_negative_items: ['bad quality', 'worst quality', 'worst detail', 'sketch', 'censor'],
    })
    const krea = readJson(resolve(skillDirectory('krea2-anime-prompt-builder'), 'references/generation-profiles.json'))
    expect(krea.model_routes['krea2-turbo'].negative_mode).toBe('positive_rewrite')
    expect(krea.model_routes['krea2-turbo'].base_negative_items).toEqual([])
  })
})

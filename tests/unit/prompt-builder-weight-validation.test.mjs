import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

import {
  PromptOutputValidationError,
  SLOT_NAMES,
  validateOutput as validateAnimaOutput,
} from '../../.agents/skills/anima-prompt-builder/scripts/validate-output.mjs'
import {
  POSITION_NAMES,
  validatePromptInput as validateWaiInput,
} from '../../.agents/skills/wai-sdxl-prompt-builder/scripts/validate-output.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const animaScript = resolve(repositoryRoot, '.agents/skills/anima-prompt-builder/scripts/validate-output.mjs')
const waiScript = resolve(repositoryRoot, '.agents/skills/wai-sdxl-prompt-builder/scripts/validate-output.mjs')
const animaPolicy = JSON.parse(readFileSync(
  resolve(repositoryRoot, '.agents/skills/anima-prompt-builder/references/prompt-weight-policy.json'),
  'utf8',
))
const waiPolicy = JSON.parse(readFileSync(
  resolve(repositoryRoot, '.agents/skills/wai-sdxl-prompt-builder/references/prompt-weight-policy.json'),
  'utf8',
))

function animaInput(slotName = 'appearance', value = 'blue hair') {
  const slots = Object.fromEntries(SLOT_NAMES.map(name => [name, []]))
  slots.quality = [...animaPolicy.recommendations.unweighted_quality.content]
  if (slotName === 'quality') slots.quality.push(value)
  else slots[slotName] = [value]
  return { slots, display_text: '已生成 ANIMA 提示词。' }
}

function waiInput(positionName = 'appearance', value = 'blue hair') {
  return {
    positions: { [positionName]: [value] },
    display_text: '已生成 WAI 提示词。',
  }
}

function expectAnimaInvalid(value, slotName = 'appearance') {
  let thrown
  try {
    validateAnimaOutput(animaInput(slotName, value))
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBeInstanceOf(PromptOutputValidationError)
  expect(thrown).toMatchObject({ path: `${slotName}[0]` })
}

function expectWaiInvalid(value, positionName = 'appearance') {
  const result = validateWaiInput(waiInput(positionName, value))
  expect(result.valid).toBe(false)
  expect(result.violations).toContainEqual(expect.objectContaining({
    path: `positions.${positionName}[0]`,
  }))
}

function expectBothInvalid(value) {
  expectAnimaInvalid(value)
  expectWaiInvalid(value)
}

function runCli(script, input) {
  return spawnSync(process.execPath, [script], {
    input: JSON.stringify(input),
    encoding: 'utf8',
  })
}

describe('Prompt Builder weight policy', () => {
  it('is the structured source for positions, syntax, quality content, and model-specific levels', () => {
    expect(SLOT_NAMES).toEqual([...animaPolicy.positions.tag, ...animaPolicy.positions.relation_text])
    expect(POSITION_NAMES).toEqual([...waiPolicy.positions.tag, ...waiPolicy.positions.relation_text])
    expect(animaPolicy.syntax.explicit_weight.ascii_decimal_pattern)
      .toBe('^(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$')
    expect(waiPolicy.syntax).toEqual(animaPolicy.syntax)
    expect(animaPolicy.recommendations.levels).toEqual({ deemphasis: 0.8, medium: 1.5, strong: 2 })
    expect(waiPolicy.recommendations.levels).toEqual({ deemphasis: 0.8, light: 1.1, primary: 1.2, strong: 1.3 })
  })
})

describe('ANIMA tag weight validation', () => {
  it.each(animaPolicy.positions.tag)('accepts all three forms in %s', (slotName) => {
    const payload = slotName === 'artist_style' ? '@fukahire' : 'weighted tag'
    for (const value of [payload, `(${payload})`, `(${payload}:1.20)`]) {
      expect(validateAnimaOutput(animaInput(slotName, value)).prompt_text).toContain(value)
    }
  })

  it('accepts the official ANIMA example and preserves fixed quality content', () => {
    const result = validateAnimaOutput(animaInput('quality', '(chibi:2)'))
    expect(result.prompt_text).toBe([
      ...animaPolicy.recommendations.unweighted_quality.content,
      '(chibi:2)',
    ].join(', '))
  })

  it.each(['@artist', '(@artist)', '(@artist:2)'])('accepts artist form %s', (artist) => {
    expect(validateAnimaOutput(animaInput('artist_style', artist)).prompt_text).toContain(artist)
  })

  it.each(['@@artist', '@(@artist:2)', 'artist', '(artist:2)'])('rejects invalid artist payload %s', (artist) => {
    expectAnimaInvalid(artist, 'artist_style')
  })
})

describe('WAI tag weight validation', () => {
  it.each(waiPolicy.positions.tag)('accepts all three forms in %s', (positionName) => {
    const payload = positionName === 'artist' ? 'fukahire' : 'weighted tag'
    for (const value of [payload, `(${payload})`, `(${payload}:1.20)`]) {
      const result = validateWaiInput(waiInput(positionName, value))
      expect(result).toMatchObject({ valid: true })
      expect(result.output.prompt_text).toContain(value)
    }
  })

  it('keeps existing visible artist characters without adding a comma restriction', () => {
    for (const artist of ['artist,name', '(artist,name:1.1)']) {
      const result = validateWaiInput(waiInput('artist', artist))
      expect(result).toMatchObject({ valid: true })
      expect(result.output.prompt_text).toBe(artist)
    }
  })

  it('keeps the default quality segment unweighted before an additional weighted quality item', () => {
    const positions = {
      quality: [...waiPolicy.recommendations.unweighted_quality.content, '(clean details:1.2)'],
    }
    const result = validateWaiInput({ positions, display_text: '已生成 WAI 提示词。' })
    expect(result).toMatchObject({ valid: true })
    expect(result.output.prompt_text).toBe(positions.quality.join(', '))
  })

  it.each(waiPolicy.recommendations.unweighted_quality.content)(
    'rejects weighted default quality content %s',
    (payload) => {
      expectWaiInvalid(`(${payload}:1.2)`, 'quality')
    },
  )
})

describe('shared weight grammar', () => {
  it.each(['2', '1.2', '0.8', '1.20'])('accepts and preserves decimal lexeme %s', (weight) => {
    const value = `(blue hair:${weight})`
    expect(validateAnimaOutput(animaInput('appearance', value)).prompt_text).toContain(value)
    const waiResult = validateWaiInput(waiInput('appearance', value))
    expect(waiResult).toMatchObject({ valid: true })
    expect(waiResult.output.prompt_text).toBe(value)
  })

  it.each([
    '.5',
    '1.',
    '01.2',
    '00.8',
    'abc',
    'NaN',
    'Infinity',
    '1e2',
    '0',
    '0.0',
    '-0.8',
    '+1.2',
    '9'.repeat(400),
  ])('rejects invalid decimal lexeme %s', (weight) => {
    expectBothInvalid(`(blue hair:${weight})`)
  })

  it.each([
    '()',
    '(:1.2)',
    '(blue hair:)',
    '(blue hair',
    'blue hair)',
    '(blue hair))',
    '((blue hair))',
    '((blue hair:1.2):1.1)',
    '(blue:hair:1.2)',
    '(blue hair :1.2)',
    '(blue hair: 1.2)',
  ])('rejects malformed wrapper %s', (value) => {
    expectBothInvalid(value)
  })

  it.each([
    String.raw`(literal \(detail\):1.2)`,
    String.raw`(literal \[detail\]:1.2)`,
    String.raw`(path \\ detail:1.2)`,
    String.raw`(path \\\(detail\):1.2)`,
  ])('accepts and preserves valid payload escapes %s', (value) => {
    expect(validateAnimaOutput(animaInput('appearance', value)).prompt_text).toContain(value)
    const waiResult = validateWaiInput(waiInput('appearance', value))
    expect(waiResult).toMatchObject({ valid: true })
    expect(waiResult.output.prompt_text).toBe(value)
  })

  it.each([
    String.raw`literal \(detail\)`,
    String.raw`literal \)`,
  ])('accepts and preserves escaped delimiters in an unweighted payload %s', (value) => {
    expect(validateAnimaOutput(animaInput('appearance', value)).prompt_text).toContain(value)
    const waiResult = validateWaiInput(waiInput('appearance', value))
    expect(waiResult).toMatchObject({ valid: true })
    expect(waiResult.output.prompt_text).toBe(value)

    expect(runCli(animaScript, animaInput('appearance', value))).toMatchObject({
      status: 0,
      stderr: '',
    })
    expect(runCli(waiScript, waiInput('appearance', value))).toMatchObject({
      status: 0,
      stderr: '',
    })
  })

  it.each([
    String.raw`(bad \q:1.2)`,
    String.raw`(bad (detail):1.2)`,
    String.raw`(bad [detail]:1.2)`,
    String.raw`(bad \\(:1.2)`,
    `bad ${'\\'}`,
  ])('rejects invalid payload escapes %s', (value) => {
    expectBothInvalid(value)
  })

  it('does not apply tag weight parsing to relation text positions', () => {
    const anima = animaInput('natural_language', 'the subject keeps (this:1.2) relation.')
    expect(validateAnimaOutput(anima).prompt_text).toContain('the subject keeps (this:1.2) relation.')

    const wai = validateWaiInput({
      positions: {
        appearance: ['blue hair'],
        relation_narrative: ['The subject keeps (this:1.2) relation.'],
      },
      display_text: '已生成 WAI 提示词。',
    })
    expect(wai).toMatchObject({ valid: true })
    expect(wai.output.prompt_text).toContain('The subject keeps (this:1.2) relation.')
  })
})

describe('Prompt Builder weight CLI contract', () => {
  it.each([
    ['ANIMA', animaScript, animaInput('appearance', '(blue hair:abc)'), 'appearance[0]'],
    ['WAI', waiScript, waiInput('appearance', '(blue hair:abc)'), 'positions.appearance[0]'],
  ])('%s reports an invalid weight on stderr with exit code 2', (_name, script, input, path) => {
    const result = runCli(script, input)
    expect(result.status).toBe(2)
    expect(result.stdout).toBe('')
    expect(JSON.parse(result.stderr)).toEqual({
      violations: [expect.objectContaining({ path })],
    })
  })
})

import { describe, expect, it } from 'vitest'

import {
  GenerationOutputValidationError,
  validateGenerationOutput,
} from '../../.agents/skills/krea2-anime-prompt-builder/scripts/validate-output.mjs'

const validOutput = Object.freeze({
  model_route: 'krea2-turbo',
  positive_prompt: 'one complete Krea2 prompt',
  negative_mode: 'positive_rewrite',
  negative_prompt: null,
  positive_avoidance: 'two clear hands with five separated fingers each',
  generation_purpose: 'test',
  aspect_ratio: '9:16',
  width: 864,
  height: 1536,
  megapixels: 1.33,
})

function expectInvalid(input, path) {
  expect(() => validateGenerationOutput(input)).toThrowError(expect.objectContaining({
    name: 'GenerationOutputValidationError',
    code: 'GENERATION_OUTPUT_INVALID',
    path,
  }))
}

describe('Krea2 Prompt Builder generation output validation', () => {
  it('accepts the positive-rewrite contract and returns a frozen copy', () => {
    const result = validateGenerationOutput(validOutput)
    expect(result).toEqual(validOutput)
    expect(result).not.toBe(validOutput)
    expect(Object.isFrozen(result)).toBe(true)
  })

  it('rejects a native-negative combination for the Krea2 route', () => {
    expectInvalid({
      ...validOutput,
      negative_mode: 'native_negative',
      negative_prompt: 'bad hands',
      positive_avoidance: null,
    }, 'negative_mode')
  })

  it('requires positive avoidance and a null negative prompt', () => {
    expectInvalid({ ...validOutput, positive_avoidance: null }, 'positive_avoidance')
    expectInvalid({ ...validOutput, negative_prompt: 'bad hands' }, 'negative_prompt')
  })

  it('rejects Seed ownership and unrelated result properties', () => {
    expectInvalid({ ...validOutput, seed: 42 }, 'seed')
  })

  it('rejects dimensions that do not match the reduced aspect ratio', () => {
    expectInvalid({ ...validOutput, width: 1024 }, 'aspect_ratio')
  })

  it('rejects a megapixel value that does not match the dimensions', () => {
    expectInvalid({ ...validOutput, megapixels: 2 }, 'megapixels')
  })
})

it('exposes a dedicated validation error type', () => {
  expect(GenerationOutputValidationError).toBeTypeOf('function')
})

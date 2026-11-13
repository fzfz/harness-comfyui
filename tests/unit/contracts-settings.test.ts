import Schema from '@deepseek-ai/schemastery'
import { describe, expect, it } from 'vitest'

import { contracts } from '#contracts'
import { Config as ImageReaderConfig } from '../../src/image-reader/plugin-schema.ts'
import {
  IMAGE_READER_SETTINGS_DEFAULTS,
  createImageReaderProfile,
  imageReaderConfigurationSchema,
} from '../../src/image-reader/settings.ts'

function roundTrip(schema: Schema): Schema {
  return new Schema(JSON.parse(JSON.stringify(schema)))
}

describe('settings contract serialization', () => {
  it('mounts a required prompt without changing the optional CLI prompt', () => {
    const prompt = roundTrip(contracts.bind('imageReaderDefaultPrompt', 'settings'))
    expect(prompt('Describe the scene.')).toBe('Describe the scene.')
    expect(() => prompt(undefined)).toThrow()
    expect(contracts.parse('image inspect', 'input', { file_path: '/tmp/image.png' })).toEqual({ file_path: '/tmp/image.png' })
    expect(contracts.parse('imageReaderPrompt', 'input', undefined)).toBeUndefined()
  })

  it('isolates mounted declarations from the canonical prompt rules', () => {
    const mounted = contracts.bind('imageReaderDefaultPrompt', 'settings')
    mounted.meta.max = 1
    mounted.meta.pattern!.source = '^x$'
    const value = 'Describe the entire scene.'
    expect(contracts.bind('imageReaderDefaultPrompt', 'settings')(value)).toBe(value)
    expect(contracts.parse('imageReaderPrompt', 'input', value)).toBe(value)
  })

  it('rehydrates empty and persisted plugin configurations, including existing profiles', () => {
    const defaults = IMAGE_READER_SETTINGS_DEFAULTS
    const stored = {
      configuration: {
        activeProfileId: 'saved-profile',
        profiles: [defaults.configuration.profiles[0], { ...createImageReaderProfile('saved-profile'), provider: 'saved-provider', model: 'saved-model', defaultPrompt: '已保存的读图提示词' }],
      },
      credentialRefs: {},
    }
    const rehydrated = roundTrip(ImageReaderConfig)
    expect(() => rehydrated({})).not.toThrow()
    expect(() => rehydrated(defaults)).not.toThrow()
    expect(() => rehydrated(stored)).not.toThrow()
    expect(roundTrip(imageReaderConfigurationSchema)(stored.configuration).profiles[1].defaultPrompt).toBe('已保存的读图提示词')
  })

  it.each([undefined, null, '', ' \n\t ', 'x'.repeat(32769)])('rejects an invalid prompt before and after host serialization: %s', prompt => {
    const configuration = {
      ...IMAGE_READER_SETTINGS_DEFAULTS.configuration,
      profiles: [{ ...IMAGE_READER_SETTINGS_DEFAULTS.configuration.profiles[0], defaultPrompt: prompt }],
    }
    for (const schema of [imageReaderConfigurationSchema, roundTrip(imageReaderConfigurationSchema)]) {
      expect(() => schema(configuration)).toThrow()
    }
    expect(() => roundTrip(ImageReaderConfig)({ configuration, credentialRefs: {} })).toThrow()
  })

  it('preserves declarative array and union contracts across settings JSON', () => {
    const runIds = roundTrip(contracts.bind('cliRunIds', 'settings'))
    expect(runIds(['run-a'])).toEqual(['run-a'])
    expect(() => runIds([])).toThrow()
    const acceptance = roundTrip(contracts.bind('generationAcceptance', 'settings'))
    expect(acceptance('accepted')).toBe('accepted')
    expect(acceptance('reused')).toBe('reused')
    expect(() => acceptance('other')).toThrow()
  })

  it('rejects executable declarations at the root and within arrays and union branches', () => {
    expect(() => contracts.bind('taskDraft', 'settings')).toThrow(/taskDraft settings \$: callback/u)
    expect(() => contracts.bind('imageRefs', 'settings')).toThrow(/imageRefs settings \$\[\]: callback/u)
    expect(() => contracts.bind('resourceSnapshot', 'settings')).toThrow(/resourceSnapshot settings \$\.branches\[0\]: callback/u)
  })
})

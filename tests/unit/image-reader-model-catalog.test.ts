import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, vi } from 'vitest'

import { IMAGE_READER_SETTINGS_DEFAULTS, IMAGE_READER_SETTINGS_NAMESPACE } from '../../src/image-reader/settings.ts'
import {
  ImageReaderRemoteService,
  registerImageReaderSettings,
} from '../../src/host/image-reader/image-reader-host.ts'

describe('image reader Host settings and model catalog', () => {
  it('registers the project namespace with complete defaults and live application', () => {
    const scope = { get: vi.fn() }
    const register = vi.fn(() => scope)
    expect(registerImageReaderSettings({ settings: { register } } as never)).toBe(scope)
    expect(register).toHaveBeenCalledWith(
      IMAGE_READER_SETTINGS_NAMESPACE,
      expect.anything(),
      { base: IMAGE_READER_SETTINGS_DEFAULTS, applies: 'live' },
    )
  })

  it('lists only models that explicitly declare image input without provider hardcoding', async () => {
    const context = new Context()
    const listModels = vi.fn(async (provider: string) => provider === 'provider-b'
      ? [
          { provider, id: 'vision-b', name: 'Vision B', description: '', inputModalities: ['text', 'image'] },
          { provider, id: 'unknown-b', name: 'Unknown B' },
        ]
      : [
          { provider, id: 'text-a', name: 'Text A', inputModalities: ['text'] },
          { provider, id: 'vision-a', name: 'Vision A', description: 'Reads images', inputModalities: ['image'] },
        ])
    const service = new ImageReaderRemoteService(context, {
      listProviders: vi.fn(() => [
        { id: 'provider-a', name: 'Provider A' },
        { id: 'provider-b', name: 'Provider B' },
      ]),
      listModels,
    } as never)

    expect(remoteMethods(service)).toEqual([{ method: 'models', invocation: { kind: 'direct' } }])
    await expect(service.models(new AbortController().signal)).resolves.toEqual({
      groups: [
        { provider: 'provider-a', name: 'Provider A', models: [{ id: 'vision-a', name: 'Vision A', description: 'Reads images' }] },
        { provider: 'provider-b', name: 'Provider B', models: [{ id: 'vision-b', name: 'Vision B', description: null }] },
      ],
      failures: [],
    })
    expect(listModels).toHaveBeenCalledTimes(2)
    await context.fiber.dispose()
  })

  it('keeps successful providers when another provider model catalog fails', async () => {
    const context = new Context()
    const service = new ImageReaderRemoteService(context, {
      listProviders: vi.fn(() => [
        { id: 'provider-a', name: 'Provider A' },
        { id: 'provider-b', name: 'Provider B' },
      ]),
      listModels: vi.fn(async (provider: string) => {
        if (provider === 'provider-b') throw new Error('endpoint unavailable')
        return [{ provider, id: 'vision-a', name: 'Vision A', inputModalities: ['image'] }]
      }),
    } as never)

    await expect(service.models(new AbortController().signal)).resolves.toEqual({
      groups: [{ provider: 'provider-a', name: 'Provider A', models: [{ id: 'vision-a', name: 'Vision A', description: null }] }],
      failures: [{ provider: 'provider-b', message: 'The provider model catalog could not be loaded.' }],
    })
    await context.fiber.dispose()
  })
})

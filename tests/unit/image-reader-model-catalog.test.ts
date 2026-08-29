import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, vi } from 'vitest'

import {
  IMAGE_READER_SETTINGS_DEFAULTS,
  IMAGE_READER_LEGACY_SETTINGS_DEFAULTS,
  IMAGE_READER_LEGACY_SETTINGS_NAMESPACE,
  IMAGE_READER_SETTINGS_NAMESPACE,
  createImageReaderProfile,
} from '../../src/image-reader/settings.ts'
import {
  ImageReaderRemoteService,
  registerImageReaderSettings,
} from '../../src/host/image-reader/image-reader-host.ts'

describe('image reader Host settings and model catalog', () => {
  it('registers legacy and current namespaces without migrating an absent legacy user section', async () => {
    const legacy = { get: vi.fn(() => IMAGE_READER_LEGACY_SETTINGS_DEFAULTS) }
    const current = { get: vi.fn(), replace: vi.fn(async () => undefined) }
    const register = vi.fn((namespace: string) => namespace === IMAGE_READER_LEGACY_SETTINGS_NAMESPACE ? legacy : current)
    const describe = vi.fn(() => [
      { ns: IMAGE_READER_LEGACY_SETTINGS_NAMESPACE },
      { ns: IMAGE_READER_SETTINGS_NAMESPACE },
    ])
    await expect(registerImageReaderSettings({ settings: { register, describe } } as never)).resolves.toBe(current)
    expect(register).toHaveBeenNthCalledWith(
      1,
      IMAGE_READER_LEGACY_SETTINGS_NAMESPACE,
      expect.anything(),
      { base: IMAGE_READER_LEGACY_SETTINGS_DEFAULTS, applies: 'live' },
    )
    expect(register).toHaveBeenNthCalledWith(
      2,
      IMAGE_READER_SETTINGS_NAMESPACE,
      expect.anything(),
      { base: IMAGE_READER_SETTINGS_DEFAULTS, applies: 'live', validate: expect.any(Function) },
    )
    expect(current.replace).not.toHaveBeenCalled()
  })

  it('migrates an existing single image-reader configuration exactly once', async () => {
    const legacyValue = {
      configuration: {
        provider: 'opencode-go',
        model: 'vision-model',
        defaultPrompt: '旧提示词',
        temperature: 0.35,
        maxTokens: 3072,
      },
    }
    const legacy = { get: vi.fn(() => legacyValue) }
    const current = { get: vi.fn(), replace: vi.fn(async () => undefined) }
    const register = vi.fn((namespace: string) => namespace === IMAGE_READER_LEGACY_SETTINGS_NAMESPACE ? legacy : current)
    const describe = vi.fn(() => [
      { ns: IMAGE_READER_LEGACY_SETTINGS_NAMESPACE, user: legacyValue },
      { ns: IMAGE_READER_SETTINGS_NAMESPACE },
    ])
    await expect(registerImageReaderSettings({ settings: { register, describe } } as never)).resolves.toBe(current)
    expect(current.replace).toHaveBeenCalledWith({
      configuration: {
        activeProfileId: 'default',
        profiles: [{
          id: 'default',
          name: '原图片读取配置',
          connectionType: 'runtime',
          provider: 'opencode-go',
          endpoint: '',
          model: 'vision-model',
          hasApiKey: false,
          defaultPrompt: '旧提示词',
          temperature: 0.35,
          maxTokens: 3072,
        }],
      },
      credentials: {},
    })

    describe.mockReturnValueOnce([
      { ns: IMAGE_READER_LEGACY_SETTINGS_NAMESPACE, user: legacyValue },
      { ns: IMAGE_READER_SETTINGS_NAMESPACE, user: { configuration: {} } },
    ] as never)
    current.replace.mockClear()
    await registerImageReaderSettings({ settings: { register, describe } } as never)
    expect(current.replace).not.toHaveBeenCalled()
  })

  function settings() {
    const get = vi.fn(() => ({
      configuration: {
        activeProfileId: 'custom',
        profiles: [{
          ...createImageReaderProfile('custom'),
          connectionType: 'openai-compatible' as const,
          endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
          model: 'vision-model',
          hasApiKey: true,
        }],
      },
      credentials: { custom: 'old-key' },
    }))
    const replace = vi.fn(async () => undefined)
    return { get, replace }
  }

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
    } as never, settings() as never)

    expect(remoteMethods(service)).toEqual([
      { method: 'models', invocation: { kind: 'direct' } },
      { method: 'saveSettings', invocation: { kind: 'direct' } },
    ])
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
    } as never, settings() as never)

    await expect(service.models(new AbortController().signal)).resolves.toEqual({
      groups: [{ provider: 'provider-a', name: 'Provider A', models: [{ id: 'vision-a', name: 'Vision A', description: null }] }],
      failures: [{ provider: 'provider-b', message: 'The provider model catalog could not be loaded.' }],
    })
    await context.fiber.dispose()
  })

  it('atomically saves public profiles and write-only API Key changes', async () => {
    const context = new Context()
    const scope = settings()
    const service = new ImageReaderRemoteService(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)
    const runtime = {
      ...createImageReaderProfile('runtime', '系统视觉'),
      provider: 'provider-a',
      model: 'vision-a',
    }
    const custom = {
      ...createImageReaderProfile('custom', '本地视觉'),
      connectionType: 'openai-compatible' as const,
      endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'qwen-vl',
      hasApiKey: true,
    }

    await expect(service.saveSettings({
      configuration: { activeProfileId: 'runtime', profiles: [runtime, custom] },
      credentialUpdates: [{ profileId: 'custom', apiKey: null }],
    }, new AbortController().signal)).resolves.toEqual({
      configuration: {
        activeProfileId: 'runtime',
        profiles: [{ ...runtime, hasApiKey: false }, { ...custom, hasApiKey: false }],
      },
    })
    expect(scope.replace).toHaveBeenCalledWith({
      configuration: {
        activeProfileId: 'runtime',
        profiles: [{ ...runtime, hasApiKey: false }, { ...custom, hasApiKey: false }],
      },
      credentials: {},
    })
    await context.fiber.dispose()
  })

  it('rejects credential changes for runtime or missing profiles before persistence', async () => {
    const context = new Context()
    const scope = settings()
    const service = new ImageReaderRemoteService(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)
    const runtime = {
      ...createImageReaderProfile('runtime'),
      provider: 'provider-a',
      model: 'vision-a',
    }
    await expect(service.saveSettings({
      configuration: { activeProfileId: 'runtime', profiles: [runtime] },
      credentialUpdates: [{ profileId: 'runtime', apiKey: 'key' }],
    }, new AbortController().signal)).rejects.toMatchObject({ code: 'IMAGE_READER_SETTINGS_INVALID' })
    expect(scope.replace).not.toHaveBeenCalled()
    await context.fiber.dispose()
  })

  it('distinguishes persistence failure from invalid input and returns committed data after cancellation', async () => {
    const context = new Context()
    const scope = settings()
    const service = new ImageReaderRemoteService(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)
    const custom = {
      ...createImageReaderProfile('custom'),
      connectionType: 'openai-compatible' as const,
      endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'qwen-vl',
      hasApiKey: true,
    }
    scope.replace.mockRejectedValueOnce(new Error('disk full'))
    await expect(service.saveSettings({
      configuration: { activeProfileId: 'custom', profiles: [custom] },
      credentialUpdates: [],
    }, new AbortController().signal)).rejects.toMatchObject({ code: 'IMAGE_READER_SETTINGS_SAVE_FAILED' })

    const controller = new AbortController()
    scope.replace.mockImplementationOnce(async () => {
      controller.abort(new DOMException('cancelled after commit', 'AbortError'))
    })
    await expect(service.saveSettings({
      configuration: { activeProfileId: 'custom', profiles: [custom] },
      credentialUpdates: [],
    }, controller.signal)).resolves.toMatchObject({ configuration: { activeProfileId: 'custom' } })
    await context.fiber.dispose()
  })
})

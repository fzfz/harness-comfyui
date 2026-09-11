import { registerImageReaderSettings } from '../../src/host/image-reader/settings-registration.ts'
import { ImageReaderConfigurationService } from '../../src/host/image-reader/configuration-service.ts'
import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, vi } from 'vitest'

import {
  IMAGE_READER_SETTINGS_DEFAULTS,
  IMAGE_READER_LEGACY_SETTINGS_DEFAULTS,
  IMAGE_READER_LEGACY_SETTINGS_NAMESPACE,
  IMAGE_READER_SETTINGS_NAMESPACE,
  createImageReaderSettingsDefaults,
  createImageReaderProfile,
  type ImageReaderSettingsSection,
} from '../../src/image-reader/settings.ts'
import {
  ImageReaderRemoteService,
} from '../../src/host/image-reader/image-reader-host.ts'

function remoteFailure(code: string): object {
  return { name: 'RemoteError', code }
}

describe('image reader Host settings and model catalog', () => {
  it('uses the runtime environment visual model as the base without creating user settings', async () => {
    const defaults = createImageReaderSettingsDefaults({
      provider: 'opencode-go',
      model: 'vision-model',
    })
    const legacy = { get: vi.fn(() => IMAGE_READER_LEGACY_SETTINGS_DEFAULTS) }
    const current = { get: vi.fn(), replace: vi.fn(async () => undefined) }
    const register = vi.fn((namespace: string) => namespace === IMAGE_READER_LEGACY_SETTINGS_NAMESPACE ? legacy : current)
    const describe = vi.fn(() => [
      { ns: IMAGE_READER_LEGACY_SETTINGS_NAMESPACE },
      { ns: IMAGE_READER_SETTINGS_NAMESPACE },
    ])

    await registerImageReaderSettings({ settings: { register, describe } } as never, defaults)

    expect(register).toHaveBeenNthCalledWith(
      2,
      IMAGE_READER_SETTINGS_NAMESPACE,
      expect.anything(),
      { base: defaults, applies: 'live', validate: expect.any(Function) },
    )
    expect(defaults.configuration.profiles[0]).toMatchObject({
      connectionType: 'runtime',
      provider: 'opencode-go',
      endpoint: '',
      model: 'vision-model',
      hasApiKey: false,
    })
    expect(current.replace).not.toHaveBeenCalled()
  })

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
    const replace = vi.fn(async (_section: ImageReaderSettingsSection) => undefined)
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
    const service = createRemote(context, {
      listProviders: vi.fn(() => [
        { id: 'provider-a', name: 'Provider A' },
        { id: 'provider-b', name: 'Provider B' },
      ]),
      listModels,
    } as never, settings() as never)

    expect(remoteMethods(service)).toEqual([
      { method: 'models', invocation: { kind: 'direct' } },
      { method: 'saveProfile', invocation: { kind: 'direct' } },
      { method: 'activateProfile', invocation: { kind: 'direct' } },
      { method: 'deleteProfile', invocation: { kind: 'direct' } },
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
    const service = createRemote(context, {
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

  it('activates an existing profile without rewriting persisted profiles or credentials', async () => {
    const context = new Context()
    const first = { ...createImageReaderProfile('first', '配置 A'), provider: 'provider-a', model: 'vision-a' }
    const second = {
      ...createImageReaderProfile('second', '配置 B'),
      connectionType: 'openai-compatible' as const,
      endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'vision-b',
      hasApiKey: true,
    }
    const current = {
      configuration: { activeProfileId: 'first', profiles: [first, second] },
      credentials: { second: 'saved-key' },
    }
    const scope = {
      get: vi.fn(() => current),
      replace: vi.fn(async (_section: ImageReaderSettingsSection) => undefined),
    }
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)

    await expect(service.activateProfile(
      { profileId: 'second' },
      new AbortController().signal,
    )).resolves.toEqual({
      configuration: { activeProfileId: 'second', profiles: [first, second] },
    })
    expect(scope.replace).toHaveBeenCalledWith({
      configuration: { activeProfileId: 'second', profiles: [first, second] },
      credentials: { second: 'saved-key' },
    })
    await context.fiber.dispose()
  })

  it('keeps profile activation idempotent and reports activation validation or persistence failures', async () => {
    const context = new Context()
    const first = { ...createImageReaderProfile('first', '配置 A'), provider: 'provider-a', model: 'vision-a' }
    const second = { ...createImageReaderProfile('second', '配置 B'), provider: 'provider-a', model: 'vision-b' }
    const current = {
      configuration: { activeProfileId: 'first', profiles: [first, second] },
      credentials: {},
    }
    const scope = {
      get: vi.fn(() => current),
      replace: vi.fn(async (_section: ImageReaderSettingsSection) => undefined),
    }
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)

    await expect(service.activateProfile({ profileId: 'first' }, new AbortController().signal))
      .resolves.toEqual({ configuration: current.configuration })
    expect(scope.replace).not.toHaveBeenCalled()

    await expect(service.activateProfile({ profileId: 'missing' }, new AbortController().signal))
      .rejects.toMatchObject(remoteFailure('IMAGE_READER_PROFILE_ACTIVATION_TARGET_NOT_FOUND'))
    await expect(service.activateProfile({ profileId: 'Bad ID' }, new AbortController().signal))
      .rejects.toMatchObject(remoteFailure('IMAGE_READER_PROFILE_ID_FORMAT_INVALID'))
    expect(scope.replace).not.toHaveBeenCalled()

    scope.replace.mockRejectedValueOnce(new Error('disk full'))
    await expect(service.activateProfile({ profileId: 'second' }, new AbortController().signal))
      .rejects.toMatchObject({
        name: 'RemoteError',
        code: 'IMAGE_READER_SETTINGS_ACTIVATE_FAILED',
        message: 'Harness could not persist the active image reader profile.',
        details: {},
      })
    await context.fiber.dispose()
  })

  it('returns committed activation data when cancellation happens during the Settings write', async () => {
    const context = new Context()
    const first = { ...createImageReaderProfile('first', '配置 A'), provider: 'provider-a', model: 'vision-a' }
    const second = { ...createImageReaderProfile('second', '配置 B'), provider: 'provider-a', model: 'vision-b' }
    const current = {
      configuration: { activeProfileId: 'first', profiles: [first, second] },
      credentials: {},
    }
    const controller = new AbortController()
    const scope = {
      get: vi.fn(() => current),
      replace: vi.fn(async (_section: ImageReaderSettingsSection) => {
        controller.abort(new DOMException('cancelled after commit', 'AbortError'))
      }),
    }
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)

    await expect(service.activateProfile({ profileId: 'second' }, controller.signal)).resolves.toEqual({
      configuration: { activeProfileId: 'second', profiles: [first, second] },
    })
    await context.fiber.dispose()
  })

  it('saves only the requested runtime profile and preserves every other persisted profile', async () => {
    const context = new Context()
    const previousRuntime = {
      ...createImageReaderProfile('runtime', '旧系统视觉'),
      provider: 'provider-old',
      model: 'vision-old',
    }
    const custom = {
      ...createImageReaderProfile('custom', '本地视觉'),
      connectionType: 'openai-compatible' as const,
      endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'qwen-vl',
      hasApiKey: true,
    }
    const scope = {
      get: vi.fn(() => ({
        configuration: { activeProfileId: 'custom', profiles: [previousRuntime, custom] },
        credentials: { custom: 'old-key' },
      })),
      replace: vi.fn(async () => undefined),
    }
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)
    const runtime = {
      id: 'runtime',
      name: '新系统视觉',
      connectionType: 'runtime' as const,
      provider: 'provider-a',
      model: 'vision-a',
      defaultPrompt: '只读取图片',
      temperature: 0.3,
      maxTokens: 4096,
    }

    await expect(service.saveProfile({
      operation: 'update',
      activateProfileId: 'runtime',
      profile: runtime,
    }, new AbortController().signal)).resolves.toEqual({
      configuration: {
        activeProfileId: 'runtime',
        profiles: [{ ...runtime, endpoint: '', hasApiKey: false }, custom],
      },
    })
    expect(scope.replace).toHaveBeenCalledWith({
      configuration: {
        activeProfileId: 'runtime',
        profiles: [{ ...runtime, endpoint: '', hasApiKey: false }, custom],
      },
      credentials: { custom: 'old-key' },
    })
    await context.fiber.dispose()
  })

  it('saves one profile and activates another profile in one Settings replacement', async () => {
    const context = new Context()
    const first = { ...createImageReaderProfile('first', '配置 A'), provider: 'provider-a', model: 'vision-a' }
    const second = { ...createImageReaderProfile('second', '配置 B'), provider: 'provider-b', model: 'vision-b' }
    const scope = {
      get: vi.fn(() => ({
        configuration: { activeProfileId: 'first', profiles: [first, second] },
        credentials: {},
      })),
      replace: vi.fn(async (_section: ImageReaderSettingsSection) => undefined),
    }
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)
    const editedFirst = {
      id: 'first',
      name: '配置 A 已修改',
      connectionType: 'runtime' as const,
      provider: 'provider-a',
      model: 'vision-a-new',
      defaultPrompt: '描述图片',
      temperature: 0.3,
      maxTokens: 4096,
    }

    await expect(service.saveProfile({
      operation: 'update',
      activateProfileId: 'second',
      profile: editedFirst,
    } as never, new AbortController().signal)).resolves.toEqual({
      configuration: {
        activeProfileId: 'second',
        profiles: [{ ...editedFirst, endpoint: '', hasApiKey: false }, second],
      },
    })
    expect(scope.replace).toHaveBeenCalledTimes(1)
    await context.fiber.dispose()
  })

  it('appends a new profile after every persisted profile and makes the new profile active', async () => {
    const context = new Context()
    const first = { ...createImageReaderProfile('first'), provider: 'provider-a', model: 'vision-a' }
    const scope = {
      get: vi.fn(() => ({
        configuration: { activeProfileId: 'first', profiles: [first] },
        credentials: {},
      })),
      replace: vi.fn(async (_section: ImageReaderSettingsSection) => undefined),
    }
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)
    const appended = {
      id: 'appended',
      name: '新增视觉',
      connectionType: 'openai-compatible' as const,
      endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'qwen-vl',
      defaultPrompt: '描述图片',
      temperature: 0.2,
      maxTokens: 2048,
    }

    await expect(service.saveProfile({
      operation: 'create',
      activateProfileId: 'appended',
      profile: appended,
      credential: { action: 'clear' },
    }, new AbortController().signal)).resolves.toEqual({
      configuration: {
        activeProfileId: 'appended',
        profiles: [first, { ...appended, provider: '', hasApiKey: false }],
      },
    })
    expect(scope.replace.mock.calls[0]![0].configuration.profiles.map(profile => profile.id)).toEqual(['first', 'appended'])
    await context.fiber.dispose()
  })

  it('returns the exact current-profile validation error without writing Settings', async () => {
    const context = new Context()
    const scope = settings()
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)

    await expect(service.saveProfile({
      operation: 'create',
      activateProfileId: 'runtime',
      profile: {
        id: 'runtime',
        name: '   ',
        connectionType: 'runtime',
        provider: 'provider-a',
        model: 'vision-a',
        defaultPrompt: '描述图片',
        temperature: 0.2,
        maxTokens: 2048,
      },
    }, new AbortController().signal)).rejects.toMatchObject(remoteFailure('IMAGE_READER_PROFILE_NAME_REQUIRED'))
    expect(scope.replace).not.toHaveBeenCalled()
    await context.fiber.dispose()
  })

  const validRuntimeRequest = {
    operation: 'create' as const,
    activateProfileId: 'runtime',
    profile: {
      id: 'runtime',
      name: '系统视觉',
      connectionType: 'runtime' as const,
      provider: 'provider-a',
      model: 'vision-a',
      defaultPrompt: '描述图片',
      temperature: 0.2,
      maxTokens: 2048,
    },
  }
  const validOpenAiRequest = {
    operation: 'update' as const,
    activateProfileId: 'custom',
    profile: {
      id: 'custom',
      name: '本地视觉',
      connectionType: 'openai-compatible' as const,
      endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'qwen-vl',
      defaultPrompt: '描述图片',
      temperature: 0.2,
      maxTokens: 2048,
    },
    credential: { action: 'keep' as const },
  }

  it('does not recreate deleted updates, overwrite colliding creates, or save with a missing activation target', async () => {
    const context = new Context()
    const scope = settings()
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)

    await expect(service.saveProfile({
      ...validRuntimeRequest,
      operation: 'update',
    }, new AbortController().signal)).rejects.toMatchObject(remoteFailure('IMAGE_READER_PROFILE_UPDATE_TARGET_NOT_FOUND'))
    await expect(service.saveProfile({
      ...validOpenAiRequest,
      operation: 'create',
    }, new AbortController().signal)).rejects.toMatchObject(remoteFailure('IMAGE_READER_PROFILE_ALREADY_EXISTS'))
    await expect(service.saveProfile({
      ...validOpenAiRequest,
      activateProfileId: 'missing',
    }, new AbortController().signal)).rejects.toMatchObject(remoteFailure('IMAGE_READER_PROFILE_ACTIVATION_TARGET_NOT_FOUND'))
    expect(scope.replace).not.toHaveBeenCalled()
    await context.fiber.dispose()
  })

  it.each([
    [{ ...validRuntimeRequest, profile: { ...validRuntimeRequest.profile, id: 'Bad ID' } }, 'IMAGE_READER_PROFILE_ID_FORMAT_INVALID'],
    [{ ...validRuntimeRequest, profile: { ...validRuntimeRequest.profile, name: '  ' } }, 'IMAGE_READER_PROFILE_NAME_REQUIRED'],
    [{ ...validRuntimeRequest, profile: { ...validRuntimeRequest.profile, name: 'n'.repeat(81) } }, 'IMAGE_READER_PROFILE_NAME_TOO_LONG'],
    [{ ...validRuntimeRequest, profile: { ...validRuntimeRequest.profile, provider: '  ' } }, 'IMAGE_READER_RUNTIME_PROVIDER_REQUIRED'],
    [{ ...validRuntimeRequest, profile: { ...validRuntimeRequest.profile, provider: 'p'.repeat(10_001) } }, 'IMAGE_READER_RUNTIME_PROVIDER_TOO_LONG'],
    [{ ...validOpenAiRequest, profile: { ...validOpenAiRequest.profile, endpoint: '  ' } }, 'IMAGE_READER_ENDPOINT_REQUIRED'],
    [{ ...validOpenAiRequest, profile: { ...validOpenAiRequest.profile, endpoint: `http://${'a'.repeat(2042)}` } }, 'IMAGE_READER_ENDPOINT_TOO_LONG'],
    [{ ...validOpenAiRequest, profile: { ...validOpenAiRequest.profile, endpoint: ' http://127.0.0.1/v1/chat/completions' } }, 'IMAGE_READER_ENDPOINT_WHITESPACE_INVALID'],
    [{ ...validOpenAiRequest, profile: { ...validOpenAiRequest.profile, endpoint: 'not a URL' } }, 'IMAGE_READER_ENDPOINT_URL_INVALID'],
    [{ ...validOpenAiRequest, profile: { ...validOpenAiRequest.profile, endpoint: 'ftp://127.0.0.1/model' } }, 'IMAGE_READER_ENDPOINT_PROTOCOL_INVALID'],
    [{ ...validOpenAiRequest, profile: { ...validOpenAiRequest.profile, endpoint: 'http://user:password@127.0.0.1/model' } }, 'IMAGE_READER_ENDPOINT_CREDENTIALS_FORBIDDEN'],
    [{ ...validOpenAiRequest, profile: { ...validOpenAiRequest.profile, endpoint: 'http://127.0.0.1/model#fragment' } }, 'IMAGE_READER_ENDPOINT_FRAGMENT_FORBIDDEN'],
    [{ ...validRuntimeRequest, profile: { ...validRuntimeRequest.profile, model: '  ' } }, 'IMAGE_READER_MODEL_REQUIRED'],
    [{ ...validRuntimeRequest, profile: { ...validRuntimeRequest.profile, model: 'm'.repeat(10_001) } }, 'IMAGE_READER_MODEL_TOO_LONG'],
    [{ ...validRuntimeRequest, profile: { ...validRuntimeRequest.profile, defaultPrompt: '\n\t' } }, 'IMAGE_READER_DEFAULT_PROMPT_REQUIRED'],
    [{ ...validRuntimeRequest, profile: { ...validRuntimeRequest.profile, defaultPrompt: 'x'.repeat(32_769) } }, 'IMAGE_READER_DEFAULT_PROMPT_TOO_LONG'],
    [{ ...validRuntimeRequest, profile: { ...validRuntimeRequest.profile, temperature: Number.NaN } }, 'IMAGE_READER_TEMPERATURE_NUMBER_INVALID'],
    [{ ...validRuntimeRequest, profile: { ...validRuntimeRequest.profile, temperature: 2.1 } }, 'IMAGE_READER_TEMPERATURE_RANGE_INVALID'],
    [{ ...validRuntimeRequest, profile: { ...validRuntimeRequest.profile, maxTokens: 1.5 } }, 'IMAGE_READER_MAX_TOKENS_INTEGER_INVALID'],
    [{ ...validRuntimeRequest, profile: { ...validRuntimeRequest.profile, maxTokens: 32_769 } }, 'IMAGE_READER_MAX_TOKENS_RANGE_INVALID'],
    [{ ...validOpenAiRequest, credential: { action: 'replace' as const, apiKey: '' } }, 'IMAGE_READER_API_KEY_REQUIRED'],
    [{ ...validOpenAiRequest, credential: { action: 'replace' as const, apiKey: 'k'.repeat(8193) } }, 'IMAGE_READER_API_KEY_TOO_LONG'],
  ])('rejects one current-profile rule with its unique code %#', async (request, code) => {
    const context = new Context()
    const scope = settings()
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)

    await expect(service.saveProfile(request, new AbortController().signal)).rejects.toMatchObject(remoteFailure(code))
    expect(scope.replace).not.toHaveBeenCalled()
    await context.fiber.dispose()
  })

  it('allows the keep credential action when no API Key is currently stored', async () => {
    const context = new Context()
    const profile = {
      ...createImageReaderProfile('custom'),
      connectionType: 'openai-compatible' as const,
      endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'qwen-vl',
      hasApiKey: false,
    }
    const scope = {
      get: vi.fn(() => ({
        configuration: { activeProfileId: 'custom', profiles: [profile] },
        credentials: {},
      })),
      replace: vi.fn(async (_section: ImageReaderSettingsSection) => undefined),
    }
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)

    await expect(service.saveProfile(validOpenAiRequest, new AbortController().signal)).resolves.toMatchObject({
      configuration: { profiles: [expect.objectContaining({ id: 'custom', hasApiKey: false })] },
    })
    expect(scope.replace.mock.calls[0]![0].credentials).toEqual({})
    await context.fiber.dispose()
  })

  it.each([
    [{ action: 'keep' as const }, 'old-key', true],
    [{ action: 'replace' as const, apiKey: 'new-key' }, 'new-key', true],
    [{ action: 'clear' as const }, undefined, false],
  ])('applies one OpenAI-compatible credential action %#', async (credential, expectedApiKey, hasApiKey) => {
    const context = new Context()
    const scope = settings()
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)

    await expect(service.saveProfile({ ...validOpenAiRequest, credential }, new AbortController().signal)).resolves.toMatchObject({
      configuration: {
        activeProfileId: 'custom',
        profiles: [expect.objectContaining({ id: 'custom', hasApiKey })],
      },
    })
    const saved = scope.replace.mock.calls[0]![0]
    expect(saved.configuration.profiles[0]).toMatchObject({ id: 'custom', provider: '', hasApiKey })
    expect(saved.credentials.custom).toBe(expectedApiKey)
    await context.fiber.dispose()
  })

  it('clears an existing API Key when its profile is saved as runtime', async () => {
    const context = new Context()
    const scope = settings()
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)

    await service.saveProfile({
      operation: 'update',
      activateProfileId: 'custom',
      profile: { ...validRuntimeRequest.profile, id: 'custom' },
    }, new AbortController().signal)

    expect(scope.replace).toHaveBeenCalledWith({
      configuration: {
        activeProfileId: 'custom',
        profiles: [{ ...validRuntimeRequest.profile, id: 'custom', endpoint: '', hasApiKey: false }],
      },
      credentials: {},
    })
    await context.fiber.dispose()
  })

  it('rejects a new profile when twenty profiles are already persisted', async () => {
    const context = new Context()
    const profiles = Array.from({ length: 20 }, (_, index) => ({
      ...createImageReaderProfile(`profile_${index}`),
      provider: 'provider-a',
      model: 'vision-a',
    }))
    const scope = {
      get: vi.fn(() => ({
        configuration: { activeProfileId: 'profile_0', profiles },
        credentials: {},
      })),
      replace: vi.fn(async () => undefined),
    }
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)

    await expect(service.saveProfile({
      operation: 'create',
      activateProfileId: 'profile_new',
      profile: { ...validRuntimeRequest.profile, id: 'profile_new' },
    }, new AbortController().signal)).rejects.toMatchObject(remoteFailure('IMAGE_READER_PROFILE_LIMIT_REACHED'))
    expect(scope.replace).not.toHaveBeenCalled()
    await context.fiber.dispose()
  })

  it('deletes a persisted profile, its API Key, and selects the next profile', async () => {
    const context = new Context()
    const first = { ...createImageReaderProfile('first'), provider: 'provider-a', model: 'vision-a' }
    const current = {
      ...createImageReaderProfile('current'),
      connectionType: 'openai-compatible' as const,
      endpoint: 'http://127.0.0.1/v1/chat/completions',
      model: 'qwen-vl',
      hasApiKey: true,
    }
    const next = { ...createImageReaderProfile('next'), provider: 'provider-a', model: 'vision-a' }
    const scope = {
      get: vi.fn(() => ({
        configuration: { activeProfileId: 'current', profiles: [first, current, next] },
        credentials: { current: 'secret' },
      })),
      replace: vi.fn(async () => undefined),
    }
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)

    await expect(service.deleteProfile({ profileId: 'current' }, new AbortController().signal)).resolves.toEqual({
      configuration: { activeProfileId: 'next', profiles: [first, next] },
    })
    expect(scope.replace).toHaveBeenCalledWith({
      configuration: { activeProfileId: 'next', profiles: [first, next] },
      credentials: {},
    })
    await context.fiber.dispose()
  })

  it('returns committed deletion data when cancellation happens during the Settings write', async () => {
    const context = new Context()
    const first = { ...createImageReaderProfile('first'), provider: 'provider-a', model: 'vision-a' }
    const second = { ...createImageReaderProfile('second'), provider: 'provider-a', model: 'vision-a' }
    const current = {
      configuration: { activeProfileId: 'first', profiles: [first, second] },
      credentials: {},
    }
    const controller = new AbortController()
    const scope = {
      get: vi.fn(() => current),
      replace: vi.fn(async (_section: ImageReaderSettingsSection) => {
        controller.abort(new DOMException('cancelled after commit', 'AbortError'))
      }),
    }
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)

    await expect(service.deleteProfile({ profileId: 'second' }, controller.signal)).resolves.toEqual({
      configuration: { activeProfileId: 'first', profiles: [first] },
    })
    await context.fiber.dispose()
  })

  it('keeps the active profile when deleting another profile and uses the previous profile after deleting the last active profile', async () => {
    const profiles = [
      { ...createImageReaderProfile('first'), provider: 'provider-a', model: 'vision-a' },
      { ...createImageReaderProfile('middle'), provider: 'provider-a', model: 'vision-a' },
      { ...createImageReaderProfile('last'), provider: 'provider-a', model: 'vision-a' },
    ]
    for (const [activeProfileId, profileId, expectedActiveProfileId] of [
      ['middle', 'first', 'middle'],
      ['last', 'last', 'middle'],
    ] as const) {
      const context = new Context()
      const scope = {
        get: vi.fn(() => ({ configuration: { activeProfileId, profiles }, credentials: {} })),
        replace: vi.fn(async () => undefined),
      }
      const service = createRemote(context, {
        listProviders: vi.fn(() => []),
        listModels: vi.fn(async () => []),
      } as never, scope as never)

      await expect(service.deleteProfile({ profileId }, new AbortController().signal)).resolves.toMatchObject({
        configuration: { activeProfileId: expectedActiveProfileId },
      })
      await context.fiber.dispose()
    }
  })

  it.each([
    ['Bad ID', 'IMAGE_READER_PROFILE_ID_FORMAT_INVALID'],
    ['missing', 'IMAGE_READER_PROFILE_NOT_FOUND'],
  ])('rejects an invalid or missing delete target %#', async (profileId, code) => {
    const context = new Context()
    const scope = settings()
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)

    await expect(service.deleteProfile({ profileId }, new AbortController().signal)).rejects.toMatchObject(remoteFailure(code))
    expect(scope.replace).not.toHaveBeenCalled()
    await context.fiber.dispose()
  })

  it('rejects deletion of the only persisted profile', async () => {
    const context = new Context()
    const scope = settings()
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)

    await expect(service.deleteProfile({ profileId: 'custom' }, new AbortController().signal))
      .rejects.toMatchObject(remoteFailure('IMAGE_READER_LAST_PROFILE_DELETE_FORBIDDEN'))
    expect(scope.replace).not.toHaveBeenCalled()
    await context.fiber.dispose()
  })

  it('serializes overlapping saves so each request merges against the latest committed settings', async () => {
    const context = new Context()
    const first = { ...createImageReaderProfile('first', '第一份'), provider: 'provider-a', model: 'vision-a' }
    const second = { ...createImageReaderProfile('second', '第二份'), provider: 'provider-a', model: 'vision-a' }
    let current: ImageReaderSettingsSection = {
      configuration: { activeProfileId: 'first', profiles: [first, second] },
      credentials: {},
    }
    let releaseFirstWrite!: () => void
    const firstWriteGate = new Promise<void>(resolve => {
      releaseFirstWrite = resolve
    })
    let writeCount = 0
    const scope = {
      get: vi.fn(() => current),
      replace: vi.fn(async (section: ImageReaderSettingsSection) => {
        writeCount += 1
        if (writeCount === 1) await firstWriteGate
        current = section
      }),
    }
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)

    const firstSave = service.saveProfile({
      operation: 'update',
      activateProfileId: 'first',
      profile: { ...validRuntimeRequest.profile, id: 'first', name: '第一份已更新' },
    }, new AbortController().signal)
    await vi.waitFor(() => expect(scope.replace).toHaveBeenCalledTimes(1))
    const secondSave = service.saveProfile({
      operation: 'update',
      activateProfileId: 'second',
      profile: { ...validRuntimeRequest.profile, id: 'second', name: '第二份已更新' },
    }, new AbortController().signal)
    await Promise.resolve()
    expect(scope.get).toHaveBeenCalledTimes(1)

    releaseFirstWrite()
    await expect(firstSave).resolves.toMatchObject({
      configuration: {
        activeProfileId: 'first',
        profiles: [expect.objectContaining({ id: 'first', name: '第一份已更新' }), second],
      },
    })
    await expect(secondSave).resolves.toMatchObject({
      configuration: {
        activeProfileId: 'second',
        profiles: [
          expect.objectContaining({ id: 'first', name: '第一份已更新' }),
          expect.objectContaining({ id: 'second', name: '第二份已更新' }),
        ],
      },
    })
    expect(current.configuration.profiles.map(profile => profile.name)).toEqual(['第一份已更新', '第二份已更新'])
    expect(scope.get).toHaveBeenCalledTimes(2)
    await context.fiber.dispose()
  })

  it('serializes an overlapping delete and save without restoring the deleted profile or credential', async () => {
    const context = new Context()
    const first = { ...createImageReaderProfile('first', '第一份'), provider: 'provider-a', model: 'vision-a' }
    const second = {
      ...createImageReaderProfile('second', '第二份'),
      connectionType: 'openai-compatible' as const,
      endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'qwen-vl',
      hasApiKey: true,
    }
    let current: ImageReaderSettingsSection = {
      configuration: { activeProfileId: 'second', profiles: [first, second] },
      credentials: { second: 'second-key' },
    }
    let releaseDelete!: () => void
    const deleteGate = new Promise<void>(resolve => {
      releaseDelete = resolve
    })
    let writeCount = 0
    const scope = {
      get: vi.fn(() => current),
      replace: vi.fn(async (section: ImageReaderSettingsSection) => {
        writeCount += 1
        if (writeCount === 1) await deleteGate
        current = section
      }),
    }
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)

    const deletion = service.deleteProfile({ profileId: 'second' }, new AbortController().signal)
    await vi.waitFor(() => expect(scope.replace).toHaveBeenCalledTimes(1))
    const save = service.saveProfile({
      operation: 'update',
      activateProfileId: 'first',
      profile: { ...validRuntimeRequest.profile, id: 'first', name: '保留并更新' },
    }, new AbortController().signal)
    releaseDelete()

    await expect(deletion).resolves.toEqual({
      configuration: { activeProfileId: 'first', profiles: [first] },
    })
    await expect(save).resolves.toMatchObject({
      configuration: {
        activeProfileId: 'first',
        profiles: [expect.objectContaining({ id: 'first', name: '保留并更新' })],
      },
    })
    expect(current.configuration.profiles.map(profile => profile.id)).toEqual(['first'])
    expect(current.credentials).toEqual({})
    expect(scope.get).toHaveBeenCalledTimes(2)
    await context.fiber.dispose()
  })

  it('serializes activation, deletion, and saving through one Settings mutation queue', async () => {
    const context = new Context()
    const first = { ...createImageReaderProfile('first', '第一份'), provider: 'provider-a', model: 'vision-a' }
    const second = { ...createImageReaderProfile('second', '第二份'), provider: 'provider-a', model: 'vision-a' }
    let current: ImageReaderSettingsSection = {
      configuration: { activeProfileId: 'first', profiles: [first, second] },
      credentials: {},
    }
    let releaseActivation!: () => void
    const activationGate = new Promise<void>(resolve => {
      releaseActivation = resolve
    })
    let writeCount = 0
    const scope = {
      get: vi.fn(() => current),
      replace: vi.fn(async (section: ImageReaderSettingsSection) => {
        writeCount += 1
        if (writeCount === 1) await activationGate
        current = section
      }),
    }
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)

    const activation = service.activateProfile({ profileId: 'second' }, new AbortController().signal)
    await vi.waitFor(() => expect(scope.replace).toHaveBeenCalledTimes(1))
    const deletion = service.deleteProfile({ profileId: 'second' }, new AbortController().signal)
    const save = service.saveProfile({
      operation: 'update',
      activateProfileId: 'first',
      profile: { ...validRuntimeRequest.profile, id: 'first', name: '第一份已更新' },
    }, new AbortController().signal)
    await Promise.resolve()
    expect(scope.get).toHaveBeenCalledTimes(1)

    releaseActivation()
    await expect(activation).resolves.toMatchObject({ configuration: { activeProfileId: 'second' } })
    await expect(deletion).resolves.toEqual({ configuration: { activeProfileId: 'first', profiles: [first] } })
    await expect(save).resolves.toMatchObject({
      configuration: {
        activeProfileId: 'first',
        profiles: [expect.objectContaining({ id: 'first', name: '第一份已更新' })],
      },
    })
    expect(scope.get).toHaveBeenCalledTimes(3)
    expect(current.configuration.profiles).toEqual([
      expect.objectContaining({ id: 'first', name: '第一份已更新' }),
    ])
    await context.fiber.dispose()
  })

  it('continues the settings mutation queue after an earlier write fails', async () => {
    const context = new Context()
    const first = { ...createImageReaderProfile('first', '第一份'), provider: 'provider-a', model: 'vision-a' }
    const second = { ...createImageReaderProfile('second', '第二份'), provider: 'provider-a', model: 'vision-a' }
    let current: ImageReaderSettingsSection = {
      configuration: { activeProfileId: 'first', profiles: [first, second] },
      credentials: {},
    }
    const scope = {
      get: vi.fn(() => current),
      replace: vi.fn()
        .mockRejectedValueOnce(new Error('disk full'))
        .mockImplementation(async (section: ImageReaderSettingsSection) => {
          current = section
        }),
    }
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)

    const failed = service.saveProfile({
      operation: 'update',
      activateProfileId: 'first',
      profile: { ...validRuntimeRequest.profile, id: 'first', name: '不应提交' },
    }, new AbortController().signal)
    const succeeded = service.saveProfile({
      operation: 'update',
      activateProfileId: 'second',
      profile: { ...validRuntimeRequest.profile, id: 'second', name: '第二份已更新' },
    }, new AbortController().signal)

    await expect(failed).rejects.toMatchObject(remoteFailure('IMAGE_READER_SETTINGS_SAVE_FAILED'))
    await expect(succeeded).resolves.toMatchObject({
      configuration: {
        activeProfileId: 'second',
        profiles: [first, expect.objectContaining({ id: 'second', name: '第二份已更新' })],
      },
    })
    expect(current.configuration.profiles).toEqual([
      first,
      expect.objectContaining({ id: 'second', name: '第二份已更新' }),
    ])
    expect(scope.get).toHaveBeenCalledTimes(2)
    await context.fiber.dispose()
  })

  it('distinguishes persistence failure from invalid input and returns committed data after cancellation', async () => {
    const context = new Context()
    const scope = settings()
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)
    scope.replace.mockRejectedValueOnce(new Error('disk full'))
    await expect(service.saveProfile(validOpenAiRequest, new AbortController().signal))
      .rejects.toMatchObject(remoteFailure('IMAGE_READER_SETTINGS_SAVE_FAILED'))

    const controller = new AbortController()
    scope.replace.mockImplementationOnce(async () => {
      controller.abort(new DOMException('cancelled after commit', 'AbortError'))
    })
    await expect(service.saveProfile(validOpenAiRequest, controller.signal))
      .resolves.toMatchObject({ configuration: { activeProfileId: 'custom' } })
    await context.fiber.dispose()
  })

  it('reports a persisted-profile deletion write failure without returning an uncommitted configuration', async () => {
    const context = new Context()
    const profiles = [
      { ...createImageReaderProfile('first'), provider: 'provider-a', model: 'vision-a' },
      { ...createImageReaderProfile('second'), provider: 'provider-a', model: 'vision-a' },
    ]
    const scope = {
      get: vi.fn(() => ({ configuration: { activeProfileId: 'first', profiles }, credentials: {} })),
      replace: vi.fn(async (_section: ImageReaderSettingsSection) => {
        throw new Error('disk full')
      }),
    }
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)

    await expect(service.deleteProfile({ profileId: 'second' }, new AbortController().signal))
      .rejects.toMatchObject(remoteFailure('IMAGE_READER_SETTINGS_DELETE_FAILED'))
    await context.fiber.dispose()
  })
})

function createRemote(context: Context, llm: ConstructorParameters<typeof ImageReaderConfigurationService>[0], settings: ConstructorParameters<typeof ImageReaderConfigurationService>[1]) {
  return new ImageReaderRemoteService(context, new ImageReaderConfigurationService(llm, settings))
}

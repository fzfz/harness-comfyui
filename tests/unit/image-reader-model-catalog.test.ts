import { imageReaderSettingsStore } from '../../src/host/image-reader/settings-registration.ts'
import { ImageReaderConfigurationService } from '../../src/host/image-reader/configuration-service.ts'
import { imageReaderCredentialStore } from '../../src/host/image-reader/credential-store.ts'
import type { ImageReaderSettingsStore } from '../../src/host/image-reader/settings-registration.ts'
import { ImageReaderError } from '../../src/host/image-reader/errors.ts'
import { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, vi } from 'vitest'
import { createTestCredentialProvider } from '../support/credential-provider.ts'

import {
  IMAGE_READER_SETTINGS_DEFAULTS,
  IMAGE_READER_PROFILE_ENTRY_ID,
  createImageReaderSettingsDefaults,
  createImageReaderProfile,
  type ImageReaderSettingsSection,
} from '../../src/image-reader/settings.ts'
import { IMAGE_READER_CREDENTIAL_REF_PREFIX, type ImageReaderCredentialRef } from '../../src/image-reader/credential-schema.ts'
import {
  ImageReaderRemoteService,
} from '../../src/host/image-reader/image-reader-host.ts'

function remoteFailure(code: string): object {
  return { name: 'RemoteError', code }
}

const credentialRefs = Object.freeze({
  custom: `${IMAGE_READER_CREDENTIAL_REF_PREFIX}${'0'.repeat(32)}` as ImageReaderCredentialRef,
  second: `${IMAGE_READER_CREDENTIAL_REF_PREFIX}${'1'.repeat(32)}` as ImageReaderCredentialRef,
  current: `${IMAGE_READER_CREDENTIAL_REF_PREFIX}${'2'.repeat(32)}` as ImageReaderCredentialRef,
})

function createCredentialStore(section: ImageReaderSettingsSection) {
  const provider = createTestCredentialProvider()
  for (const reference of Object.values(section.credentialRefs)) {
    provider.values.set(credentialRef(String(reference)), 'stored-key')
  }
  return { ...imageReaderCredentialStore(provider as never), values: provider.values, provider }
}

function createObservedSettingsStore(initial: ImageReaderSettingsSection) {
  const descriptor: { ns: string; value: unknown; user: unknown } = {
    ns: IMAGE_READER_PROFILE_ENTRY_ID,
    value: initial,
    user: initial,
  }
  const describe = vi.fn(() => [descriptor])
  const replace = vi.fn(async (_ns: string, _value: ImageReaderSettingsSection) => undefined)
  const store = imageReaderSettingsStore({ settings: { describe, replace } } as never)
  return { store, descriptor, describe, replace }
}

function createDirectConfigurationService(
  settingsSource: Pick<ImageReaderSettingsStore, 'get' | 'replace'>
    & Partial<Pick<ImageReaderSettingsStore, 'readPersistedUserOverride'>>,
) {
  const initialSection = settingsSource.get()
  const credentialStore = createCredentialStore(initialSection)
  const settingsStore: ImageReaderSettingsStore = {
    get: () => settingsSource.get(),
    replace: section => settingsSource.replace(section),
    readPersistedUserOverride: () => settingsSource.readPersistedUserOverride?.()
      ?? Object.freeze({ kind: 'readable', value: initialSection }),
  }
  const service = new ImageReaderConfigurationService({
    listProviders: vi.fn(() => []),
    listModels: vi.fn(async () => []),
  } as never, settingsStore, credentialStore)
  return Object.assign(service, { credentialStore })
}

describe('image reader Host settings and model catalog', () => {
  it('reads the runtime visual model until the Profile entry supplies a value', () => {
    const defaults = createImageReaderSettingsDefaults({ provider: 'opencode-go', model: 'vision-model' })
    const describe = vi.fn(() => [])
    const replace = vi.fn(async () => undefined)
    const store = imageReaderSettingsStore({ settings: { describe, replace } } as never, defaults)
    expect(store.get().configuration.profiles[0]).toMatchObject({ provider: 'opencode-go', model: 'vision-model' })
    expect(replace).not.toHaveBeenCalled()
    describe.mockReturnValueOnce([{ ns: IMAGE_READER_PROFILE_ENTRY_ID, value: {
      configuration: { activeProfileId: 'default', profiles: [{ ...createImageReaderProfile('default'), model: 'saved-model' }] },
      credentialRefs: {},
    } }] as never)
    expect(store.get().configuration.profiles[0]?.model).toBe('saved-model')
  })

  it('writes validated settings to the existing Profile entry', async () => {
    const replace = vi.fn(async () => undefined)
    const store = imageReaderSettingsStore({ settings: { describe: () => [], replace } } as never)
    await store.replace(IMAGE_READER_SETTINGS_DEFAULTS)
    expect(replace).toHaveBeenCalledWith(IMAGE_READER_PROFILE_ENTRY_ID, IMAGE_READER_SETTINGS_DEFAULTS)
  })

  it('marks persisted Settings observation unreadable when user is absent or describe throws', () => {
    const section = IMAGE_READER_SETTINGS_DEFAULTS
    const missingUser = imageReaderSettingsStore({
      settings: {
        describe: () => [{ ns: IMAGE_READER_PROFILE_ENTRY_ID, value: section }],
        replace: vi.fn(async () => undefined),
      },
    } as never)
    const failedDescribe = imageReaderSettingsStore({
      settings: {
        describe: () => { throw new Error('descriptor unavailable') },
        replace: vi.fn(async () => undefined),
      },
    } as never)

    expect(missingUser.readPersistedUserOverride()).toEqual({ kind: 'unreadable' })
    expect(failedDescribe.readPersistedUserOverride()).toEqual({ kind: 'unreadable' })
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
      credentialRefs: { custom: credentialRefs.custom },
    }))
    const replace = vi.fn(async (_section: ImageReaderSettingsSection) => undefined)
    return { get, replace }
  }

  it('reads the Profile image reader configuration through its remote method', async () => {
    const context = new Context()
    const scope = settings()
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)
    const signal = new AbortController().signal

    await expect(service.configuration(signal)).resolves.toEqual(scope.get().configuration)
    const cancelled = new AbortController()
    cancelled.abort()
    await expect(service.configuration(cancelled.signal)).rejects.toMatchObject({ name: 'AbortError' })
    await context.fiber.dispose()
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
    const service = createRemote(context, {
      listProviders: vi.fn(() => [
        { id: 'provider-a', name: 'Provider A' },
        { id: 'provider-b', name: 'Provider B' },
      ]),
      listModels,
    } as never, settings() as never)

    expect(remoteMethods(service)).toEqual([
      { method: 'models', invocation: { kind: 'direct' } },
      { method: 'configuration', invocation: { kind: 'direct' } },
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

  it('activates an existing profile without rewriting persisted profiles or credential references', async () => {
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
      credentialRefs: { second: credentialRefs.second },
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
      credentialRefs: { second: credentialRefs.second },
    })
    await context.fiber.dispose()
  })

  it('keeps profile activation idempotent and reports activation validation or persistence failures', async () => {
    const context = new Context()
    const first = { ...createImageReaderProfile('first', '配置 A'), provider: 'provider-a', model: 'vision-a' }
    const second = { ...createImageReaderProfile('second', '配置 B'), provider: 'provider-a', model: 'vision-b' }
    const current = {
      configuration: { activeProfileId: 'first', profiles: [first, second] },
      credentialRefs: {},
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
      credentialRefs: {},
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
        credentialRefs: { custom: credentialRefs.custom },
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
      credentialRefs: { custom: credentialRefs.custom },
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
        credentialRefs: {},
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
        credentialRefs: {},
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
        credentialRefs: {},
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
    expect(scope.replace.mock.calls[0]![0].credentialRefs).toEqual({})
    await context.fiber.dispose()
  })

  it('keeps a missing provider reference while reporting its configured state as false', async () => {
    const context = new Context()
    const scope = settings()
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)
    service.credentialStore.values.delete(credentialRef(String(credentialRefs.custom)))
    service.credentialStore.provider.describe.mockImplementation(async () => ({ configured: false, writable: false }))

    await expect(service.configuration(new AbortController().signal)).resolves.toMatchObject({
      profiles: [expect.objectContaining({ id: 'custom', hasApiKey: false })],
    })
    await expect(service.saveProfile({ ...validOpenAiRequest, credential: { action: 'keep' } }, new AbortController().signal))
      .resolves.toMatchObject({ configuration: { profiles: [expect.objectContaining({ id: 'custom', hasApiKey: false })] } })
    expect(scope.replace.mock.calls[0]![0].credentialRefs.custom).toBe(credentialRefs.custom)
    expect(service.credentialStore.provider.set).not.toHaveBeenCalled()
    expect(service.credentialStore.provider.unset).not.toHaveBeenCalled()
    await context.fiber.dispose()
  })

  it.each([
    [{ action: 'keep' as const }, true],
    [{ action: 'replace' as const, apiKey: 'new-key' }, true],
    [{ action: 'clear' as const }, false],
  ])('applies one OpenAI-compatible credential action %#', async (credential, hasApiKey) => {
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
    if (credential.action === 'keep') {
      expect(saved.credentialRefs.custom).toBe(credentialRefs.custom)
      expect(service.credentialStore.values.get(credentialRef(String(credentialRefs.custom)))).toBe('stored-key')
    } else if (credential.action === 'replace') {
      expect(saved.credentialRefs.custom).toMatch(new RegExp(`^${IMAGE_READER_CREDENTIAL_REF_PREFIX}[0-9a-f]{32}$`, 'u'))
      expect(service.credentialStore.values.get(credentialRef(String(saved.credentialRefs.custom)))).toBe('new-key')
      expect(service.credentialStore.values.has(credentialRef(String(credentialRefs.custom)))).toBe(false)
      expect(service.credentialStore.provider.set.mock.invocationCallOrder[0]).toBeLessThan(scope.replace.mock.invocationCallOrder[0]!)
      expect(scope.replace.mock.invocationCallOrder[0]).toBeLessThan(service.credentialStore.provider.unset.mock.invocationCallOrder[0]!)
    } else {
      expect(saved.credentialRefs.custom).toBeUndefined()
      expect(service.credentialStore.values.has(credentialRef(String(credentialRefs.custom)))).toBe(false)
    }
    await context.fiber.dispose()
  })

  it('does no credential or Profile writes when cancellation precedes a replacement', async () => {
    const scope = settings()
    const service = createDirectConfigurationService(scope)
    const cancelReason = new DOMException('cancelled before credential write', 'AbortError')
    const controller = new AbortController()
    controller.abort(cancelReason)

    await expect(service.saveProfile({ ...validOpenAiRequest, credential: { action: 'replace', apiKey: 'new-key' } }, controller.signal))
      .rejects.toBe(cancelReason)

    expect(service.credentialStore.provider.describe).not.toHaveBeenCalled()
    expect(service.credentialStore.provider.set).not.toHaveBeenCalled()
    expect(service.credentialStore.provider.unset).not.toHaveBeenCalled()
    expect(scope.replace).not.toHaveBeenCalled()
  })

  it('cleans the fresh reference and preserves the old credential when cancellation follows set', async () => {
    const scope = settings()
    const service = createDirectConfigurationService(scope)
    let releaseSet!: () => void
    let markSetStarted!: () => void
    const setGate = new Promise<void>(resolve => { releaseSet = resolve })
    const setStarted = new Promise<void>(resolve => { markSetStarted = resolve })
    service.credentialStore.provider.set.mockImplementationOnce(async (reference, value) => {
      service.credentialStore.values.set(reference, value)
      markSetStarted()
      await setGate
    })
    const controller = new AbortController()
    const cancelReason = new DOMException('cancelled after credential write', 'AbortError')
    const operation = service.saveProfile({ ...validOpenAiRequest, credential: { action: 'replace', apiKey: 'new-key' } }, controller.signal)
    await setStarted
    controller.abort(cancelReason)
    releaseSet()

    await expect(operation).rejects.toBe(cancelReason)

    const freshReference = service.credentialStore.provider.set.mock.calls[0]![0]
    expect(service.credentialStore.provider.unset).toHaveBeenCalledExactlyOnceWith(freshReference)
    expect(service.credentialStore.values.has(freshReference)).toBe(false)
    expect(service.credentialStore.values.get(credentialRef(String(credentialRefs.custom)))).toBe('stored-key')
    expect(scope.replace).not.toHaveBeenCalled()

    await expect(service.saveProfile({
      ...validOpenAiRequest,
      profile: { ...validOpenAiRequest.profile, name: '取消清理后继续排队' },
      credential: { action: 'keep' },
    }, new AbortController().signal)).resolves.toMatchObject({
      configuration: { profiles: [expect.objectContaining({ name: '取消清理后继续排队' })] },
    })
    expect(scope.replace).toHaveBeenCalledTimes(1)
  })

  it('reports cancellation plus staged-cleanup failure and continues the mutation queue', async () => {
    const scope = settings()
    const service = createDirectConfigurationService(scope)
    let releaseSet!: () => void
    let markSetStarted!: () => void
    const setGate = new Promise<void>(resolve => { releaseSet = resolve })
    const setStarted = new Promise<void>(resolve => { markSetStarted = resolve })
    const cleanupFailure = new Error('fresh reference cleanup failed')
    service.credentialStore.provider.set.mockImplementationOnce(async (reference, value) => {
      service.credentialStore.values.set(reference, value)
      markSetStarted()
      await setGate
    })
    service.credentialStore.provider.unset.mockRejectedValueOnce(cleanupFailure)
    const controller = new AbortController()
    const cancelReason = new DOMException('cancelled before Profile write', 'AbortError')
    const operation = service.saveProfile({ ...validOpenAiRequest, credential: { action: 'replace', apiKey: 'new-key' } }, controller.signal)
    await setStarted
    controller.abort(cancelReason)
    releaseSet()
    const failure = await operation.catch(error => error)

    expect(failure).toBeInstanceOf(ImageReaderError)
    expect(failure).toMatchObject({ code: 'IMAGE_READER_CREDENTIAL_STAGE_CLEANUP_FAILED' })
    expect((failure as ImageReaderError).credentialFailure).toMatchObject({ stage: 'staged-cleanup', profileCommitted: false })
    expect((failure as ImageReaderError).cause).toMatchObject({ primary: cancelReason, cleanup: cleanupFailure })
    expect(((failure as ImageReaderError).cause as { primary: unknown }).primary).toBe(cancelReason)
    expect(((failure as ImageReaderError).cause as { cleanup: unknown }).cleanup).toBe(cleanupFailure)
    const freshReference = service.credentialStore.provider.set.mock.calls[0]![0]
    expect((failure as ImageReaderError).credentialFailure?.reference).toBe(freshReference)
    expect(scope.replace).not.toHaveBeenCalled()
    expect(service.credentialStore.values.get(credentialRef(String(credentialRefs.custom)))).toBe('stored-key')
    expect(service.credentialStore.values.get(freshReference)).toBe('new-key')

    await expect(service.saveProfile({
      ...validOpenAiRequest,
      profile: { ...validOpenAiRequest.profile, name: '继续排队' },
      credential: { action: 'keep' },
    }, new AbortController().signal)).resolves.toMatchObject({ configuration: { profiles: [expect.objectContaining({ name: '继续排队' })] } })
    expect(scope.replace).toHaveBeenCalledOnce()
  })

  it('keeps the old credential when a rejected precommit replacement is confirmed unchanged', async () => {
    const context = new Context()
    const scope = settings()
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)
    scope.replace.mockRejectedValueOnce(new Error('disk full'))

    await expect(service.saveProfile({ ...validOpenAiRequest, credential: { action: 'replace', apiKey: 'new-key' } }, new AbortController().signal))
      .rejects.toMatchObject(remoteFailure('IMAGE_READER_SETTINGS_SAVE_FAILED'))

    expect(scope.replace).toHaveBeenCalledOnce()
    expect(service.credentialStore.provider.set).toHaveBeenCalledOnce()
    expect(service.credentialStore.provider.unset).toHaveBeenCalledOnce()
    expect(service.credentialStore.values.get(credentialRef(String(credentialRefs.custom)))).toBe('stored-key')
    expect([...service.credentialStore.values.keys()]).toEqual([credentialRef(String(credentialRefs.custom))])
    await context.fiber.dispose()
  })

  it('does not unset the old credential when a clear is rejected before the Profile commit', async () => {
    const context = new Context()
    const scope = settings()
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)
    scope.replace.mockRejectedValueOnce(new Error('disk full'))

    await expect(service.saveProfile({ ...validOpenAiRequest, credential: { action: 'clear' } }, new AbortController().signal))
      .rejects.toMatchObject(remoteFailure('IMAGE_READER_SETTINGS_SAVE_FAILED'))

    expect(service.credentialStore.provider.set).not.toHaveBeenCalled()
    expect(service.credentialStore.provider.unset).not.toHaveBeenCalled()
    expect(service.credentialStore.values.get(credentialRef(String(credentialRefs.custom)))).toBe('stored-key')
    await context.fiber.dispose()
  })

  it('preserves a replacement reference when Settings rejects after the candidate was persisted', async () => {
    const context = new Context()
    let persisted: ImageReaderSettingsSection = {
      configuration: {
        activeProfileId: 'custom',
        profiles: [{ ...createImageReaderProfile('custom'), connectionType: 'openai-compatible', endpoint: validOpenAiRequest.profile.endpoint, model: 'vision-model', hasApiKey: true }],
      },
      credentialRefs: { custom: credentialRefs.custom },
    }
    const scope = {
      get: vi.fn(() => persisted),
      replace: vi.fn(async (section: ImageReaderSettingsSection) => {
        persisted = section
        throw new Error('Settings notification failed after write')
      }),
      readPersistedUserOverride: vi.fn(() => ({ kind: 'readable' as const, value: persisted })),
    }
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)

    await expect(service.saveProfile({ ...validOpenAiRequest, credential: { action: 'replace', apiKey: 'new-key' } }, new AbortController().signal))
      .rejects.toMatchObject(remoteFailure('IMAGE_READER_CREDENTIAL_COMMITTED_WRITE_REJECTED'))

    const newReference = persisted.credentialRefs.custom!
    expect(newReference).not.toBe(credentialRefs.custom)
    expect(service.credentialStore.values.get(credentialRef(String(newReference)))).toBe('new-key')
    expect(service.credentialStore.values.has(credentialRef(String(credentialRefs.custom)))).toBe(false)
    await expect(service.configuration(new AbortController().signal)).resolves.toMatchObject({
      profiles: [expect.objectContaining({ id: 'custom', hasApiKey: true })],
    })
    await context.fiber.dispose()
  })

  it('keeps both possible references when Settings commit state is unreadable', async () => {
    const context = new Context()
    const scope = {
      ...settings(),
      replace: vi.fn(async (_section: ImageReaderSettingsSection) => { throw new Error('disk state unavailable') }),
      readPersistedUserOverride: vi.fn(() => ({ kind: 'unreadable' as const })),
    }
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)

    await expect(service.saveProfile({ ...validOpenAiRequest, credential: { action: 'replace', apiKey: 'new-key' } }, new AbortController().signal))
      .rejects.toMatchObject(remoteFailure('IMAGE_READER_CREDENTIAL_COMMIT_STATUS_UNKNOWN'))

    expect(service.credentialStore.values.get(credentialRef(String(credentialRefs.custom)))).toBe('stored-key')
    expect([...service.credentialStore.values.values()]).toContain('new-key')
    expect(service.credentialStore.provider.unset).not.toHaveBeenCalled()
    await context.fiber.dispose()
  })

  it.each([
    ['previous', 'IMAGE_READER_SETTINGS_SAVE_FAILED'],
    ['candidate', 'IMAGE_READER_CREDENTIAL_COMMITTED_WRITE_REJECTED'],
    ['other', 'IMAGE_READER_CREDENTIAL_COMMIT_STATUS_UNKNOWN'],
  ] as const)('uses descriptor.user rather than live value for the actual %s Settings state', async (observedState, expectedCode) => {
    const initial = settings().get()
    const observed = createObservedSettingsStore(initial)
    const service = createDirectConfigurationService(observed.store)
    let candidate: ImageReaderSettingsSection | undefined
    observed.replace.mockImplementationOnce(async (_ns, next) => {
      candidate = next
      if (observedState === 'previous') {
        observed.descriptor.value = next
      } else if (observedState === 'candidate') {
        observed.descriptor.value = initial
        observed.descriptor.user = next
      } else {
        observed.descriptor.value = next
        observed.descriptor.user = {
          configuration: {
            activeProfileId: next.configuration.activeProfileId,
            profiles: next.configuration.profiles.map(profile => ({ ...profile, name: '第三方持久化状态' })),
          },
          credentialRefs: initial.credentialRefs,
        }
      }
      throw new Error('Settings write rejected after observer state changed')
    })

    const failure = await service.saveProfile({
      ...validOpenAiRequest,
      credential: { action: 'replace', apiKey: 'new-key' },
    }, new AbortController().signal).catch(error => error)

    expect(failure).toBeInstanceOf(ImageReaderError)
    expect((failure as ImageReaderError).code).toBe(expectedCode)
    expect(candidate).toBeDefined()
    expect(observed.descriptor.value).not.toEqual(observed.descriptor.user)
    const freshReference = service.credentialStore.provider.set.mock.calls[0]![0]
    if (observedState === 'previous') {
      expect(observed.store.readPersistedUserOverride()).toEqual({ kind: 'readable', value: initial })
      expect(service.credentialStore.provider.unset).toHaveBeenCalledExactlyOnceWith(freshReference)
      expect(service.credentialStore.values.get(credentialRef(String(credentialRefs.custom)))).toBe('stored-key')
      expect(service.credentialStore.values.has(freshReference)).toBe(false)
    } else if (observedState === 'candidate') {
      expect(observed.store.readPersistedUserOverride()).toEqual({ kind: 'readable', value: candidate })
      expect((observed.descriptor.user as ImageReaderSettingsSection).credentialRefs.custom).toBe(freshReference)
      expect(service.credentialStore.provider.unset).toHaveBeenCalledExactlyOnceWith(credentialRef(String(credentialRefs.custom)))
      expect(service.credentialStore.values.has(credentialRef(String(credentialRefs.custom)))).toBe(false)
      expect(service.credentialStore.values.get(freshReference)).toBe('new-key')
    } else {
      expect(observed.store.readPersistedUserOverride()).toMatchObject({ kind: 'readable' })
      expect(observed.store.readPersistedUserOverride()).not.toEqual({ kind: 'readable', value: initial })
      expect(service.credentialStore.provider.unset).not.toHaveBeenCalled()
      expect(service.credentialStore.values.get(credentialRef(String(credentialRefs.custom)))).toBe('stored-key')
      expect(service.credentialStore.values.get(freshReference)).toBe('new-key')
    }
  })

  it('keeps possible references when the actual Settings observer loses user during a rejected write', async () => {
    const initial = settings().get()
    const descriptor: { ns: string; value: unknown } = { ns: IMAGE_READER_PROFILE_ENTRY_ID, value: initial }
    const describe = vi.fn(() => [descriptor])
    const replace = vi.fn(async (_ns: string, candidate: ImageReaderSettingsSection) => {
      descriptor.value = candidate
      throw new Error('Settings disk state could not be read')
    })
    const store = imageReaderSettingsStore({ settings: { describe, replace } } as never)
    const service = createDirectConfigurationService(store)

    const failure = await service.saveProfile({
      ...validOpenAiRequest,
      credential: { action: 'replace', apiKey: 'new-key' },
    }, new AbortController().signal).catch(error => error)

    expect(failure).toBeInstanceOf(ImageReaderError)
    expect((failure as ImageReaderError).code).toBe('IMAGE_READER_CREDENTIAL_COMMIT_STATUS_UNKNOWN')
    expect(store.readPersistedUserOverride()).toEqual({ kind: 'unreadable' })
    expect(service.credentialStore.provider.unset).not.toHaveBeenCalled()
    expect(service.credentialStore.values.get(credentialRef(String(credentialRefs.custom)))).toBe('stored-key')
    expect([...service.credentialStore.values.values()]).toContain('new-key')
  })

  it('rejects writes to read-only existing credential references before mutating either store', async () => {
    const context = new Context()
    const scope = settings()
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)
    service.credentialStore.provider.describe.mockImplementation(async () => ({ configured: true, source: 'env', writable: false }))

    await expect(service.saveProfile({ ...validOpenAiRequest, credential: { action: 'replace', apiKey: 'new-key' } }, new AbortController().signal))
      .rejects.toMatchObject(remoteFailure('IMAGE_READER_CREDENTIAL_REFERENCE_READ_ONLY'))

    expect(service.credentialStore.provider.set).not.toHaveBeenCalled()
    expect(service.credentialStore.provider.unset).not.toHaveBeenCalled()
    expect(scope.replace).not.toHaveBeenCalled()
    await context.fiber.dispose()
  })

  it('rejects an allocated reference that is already configured without overwriting it', async () => {
    const context = new Context()
    const scope = settings()
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)
    const collision = `${IMAGE_READER_CREDENTIAL_REF_PREFIX}${'f'.repeat(32)}` as ImageReaderCredentialRef
    service.credentialStore.createRef = vi.fn(() => collision)
    service.credentialStore.values.set(credentialRef(String(collision)), 'unrelated-provider-value')

    await expect(service.saveProfile({ ...validOpenAiRequest, credential: { action: 'replace', apiKey: 'new-key' } }, new AbortController().signal))
      .rejects.toMatchObject(remoteFailure('IMAGE_READER_CREDENTIAL_REFERENCE_UNAVAILABLE'))

    expect(service.credentialStore.provider.set).not.toHaveBeenCalled()
    expect(service.credentialStore.provider.unset).not.toHaveBeenCalled()
    expect(scope.replace).not.toHaveBeenCalled()
    await context.fiber.dispose()
  })

  it('rejects a newly allocated but read-only reference before setting its value', async () => {
    const context = new Context()
    const scope = settings()
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)
    const fresh = `${IMAGE_READER_CREDENTIAL_REF_PREFIX}${'e'.repeat(32)}` as ImageReaderCredentialRef
    service.credentialStore.createRef = vi.fn(() => fresh)
    service.credentialStore.provider.describe.mockImplementation(async reference => reference === credentialRef(String(fresh))
      ? ({ configured: false, source: 'env', writable: false })
      : ({ configured: true, source: 'file', writable: true }))

    await expect(service.saveProfile({ ...validOpenAiRequest, credential: { action: 'replace', apiKey: 'new-key' } }, new AbortController().signal))
      .rejects.toMatchObject(remoteFailure('IMAGE_READER_CREDENTIAL_REFERENCE_UNAVAILABLE'))

    expect(service.credentialStore.provider.set).not.toHaveBeenCalled()
    expect(scope.replace).not.toHaveBeenCalled()
    await context.fiber.dispose()
  })

  it('reports provider describe failures through the configuration Remote', async () => {
    const context = new Context()
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, settings() as never)
    service.credentialStore.provider.describe.mockRejectedValueOnce(new Error('provider unavailable'))

    await expect(service.configuration(new AbortController().signal))
      .rejects.toMatchObject(remoteFailure('IMAGE_READER_CREDENTIAL_PROVIDER_READ_FAILED'))
    await context.fiber.dispose()
  })

  it('cleans a staged reference when provider set rejects and retains the old credential', async () => {
    const context = new Context()
    const scope = settings()
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)
    service.credentialStore.provider.set.mockImplementationOnce(async (reference, value) => {
      service.credentialStore.values.set(reference, value)
      throw new Error('provider notification failed after write')
    })

    await expect(service.saveProfile({ ...validOpenAiRequest, credential: { action: 'replace', apiKey: 'new-key' } }, new AbortController().signal))
      .rejects.toMatchObject(remoteFailure('IMAGE_READER_CREDENTIAL_PROVIDER_WRITE_FAILED'))

    expect(service.credentialStore.provider.set).toHaveBeenCalledOnce()
    expect(service.credentialStore.provider.unset).toHaveBeenCalledOnce()
    expect(service.credentialStore.values.get(credentialRef(String(credentialRefs.custom)))).toBe('stored-key')
    expect([...service.credentialStore.values.keys()]).toEqual([credentialRef(String(credentialRefs.custom))])
    await context.fiber.dispose()
  })

  it('reports both provider write and staged cleanup failures', async () => {
    const context = new Context()
    const scope = settings()
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)
    service.credentialStore.provider.set.mockRejectedValueOnce(new Error('provider write rejected'))
    service.credentialStore.provider.unset.mockRejectedValueOnce(new Error('staged cleanup rejected'))

    await expect(service.saveProfile({ ...validOpenAiRequest, credential: { action: 'replace', apiKey: 'new-key' } }, new AbortController().signal))
      .rejects.toMatchObject(remoteFailure('IMAGE_READER_CREDENTIAL_STAGE_CLEANUP_FAILED'))

    expect(scope.replace).not.toHaveBeenCalled()
    expect(service.credentialStore.values.get(credentialRef(String(credentialRefs.custom)))).toBe('stored-key')
    const cleanupLog = context.logger.buffer.find(entry => entry.name === 'harness-comfyui-image-reader')
    expect(cleanupLog).toBeDefined()
    const logged = JSON.parse(cleanupLog!.args[1] as string)
    expect(logged).toMatchObject({
      code: 'IMAGE_READER_CREDENTIAL_STAGE_CLEANUP_FAILED',
      credentialFailure: { stage: 'staged-cleanup', profileCommitted: false },
    })
    expect(logged.credentialFailure.reference).toMatch(new RegExp(`^${IMAGE_READER_CREDENTIAL_REF_PREFIX}[0-9a-f]{32}$`, 'u'))
    expect(JSON.stringify(cleanupLog!.args)).not.toContain('new-key')
    await context.fiber.dispose()
  })

  it('preserves the Settings and staged-cleanup cause identities and continues its queue', async () => {
    const initial = settings().get()
    const oldSectionSnapshot = structuredClone(initial)
    const observed = createObservedSettingsStore(initial)
    const service = createDirectConfigurationService(observed.store)
    const settingsFailure = new Error('Profile precommit rejected')
    const cleanupFailure = new Error('fresh credential cleanup rejected')
    observed.replace.mockRejectedValueOnce(settingsFailure)
    service.credentialStore.provider.unset.mockRejectedValueOnce(cleanupFailure)

    const failure = await service.saveProfile({
      ...validOpenAiRequest,
      credential: { action: 'replace', apiKey: 'new-key' },
    }, new AbortController().signal).catch(error => error)

    expect(failure).toBeInstanceOf(ImageReaderError)
    expect((failure as ImageReaderError).code).toBe('IMAGE_READER_CREDENTIAL_STAGE_CLEANUP_FAILED')
    const causes = (failure as ImageReaderError).cause as { primary: unknown; cleanup: unknown }
    expect(causes.primary).toBe(settingsFailure)
    expect(causes.cleanup).toBe(cleanupFailure)
    const freshReference = service.credentialStore.provider.set.mock.calls[0]![0]
    expect((failure as ImageReaderError).credentialFailure).toEqual({
      reference: freshReference,
      stage: 'staged-cleanup',
      profileCommitted: false,
    })
    expect(observed.store.readPersistedUserOverride()).toEqual({ kind: 'readable', value: oldSectionSnapshot })
    expect(service.credentialStore.values.get(credentialRef(String(credentialRefs.custom)))).toBe('stored-key')
    expect(service.credentialStore.values.get(freshReference)).toBe('new-key')

    await expect(service.saveProfile({
      ...validOpenAiRequest,
      profile: { ...validOpenAiRequest.profile, name: '清理失败后继续排队' },
      credential: { action: 'keep' },
    }, new AbortController().signal)).resolves.toMatchObject({ configuration: { profiles: [expect.objectContaining({ name: '清理失败后继续排队' })] } })
    expect(observed.replace).toHaveBeenCalledTimes(2)
  })

  it('preserves provider post-write and staged-cleanup causes when both operations reject', async () => {
    const scope = settings()
    const service = createDirectConfigurationService(scope)
    const providerFailure = new Error('provider write notification failed')
    const cleanupFailure = new Error('fresh credential cleanup rejected')
    service.credentialStore.provider.set.mockImplementationOnce(async (reference, value) => {
      service.credentialStore.values.set(reference, value)
      throw providerFailure
    })
    service.credentialStore.provider.unset.mockRejectedValueOnce(cleanupFailure)

    const failure = await service.saveProfile({
      ...validOpenAiRequest,
      credential: { action: 'replace', apiKey: 'new-key' },
    }, new AbortController().signal).catch(error => error)

    expect(failure).toBeInstanceOf(ImageReaderError)
    expect((failure as ImageReaderError).code).toBe('IMAGE_READER_CREDENTIAL_STAGE_CLEANUP_FAILED')
    const causes = (failure as ImageReaderError).cause as { primary: unknown; cleanup: unknown }
    expect(causes.primary).toBe(providerFailure)
    expect(causes.cleanup).toBe(cleanupFailure)
    expect(scope.replace).not.toHaveBeenCalled()
    expect(scope.get().credentialRefs.custom).toBe(credentialRefs.custom)
    expect(service.credentialStore.values.get(credentialRef(String(credentialRefs.custom)))).toBe('stored-key')
    expect([...service.credentialStore.values.values()]).toContain('new-key')

    await expect(service.saveProfile({
      ...validOpenAiRequest,
      profile: { ...validOpenAiRequest.profile, name: 'provider失败后继续排队' },
      credential: { action: 'keep' },
    }, new AbortController().signal)).resolves.toMatchObject({ configuration: { profiles: [expect.objectContaining({ name: 'provider失败后继续排队' })] } })
    expect(scope.replace).toHaveBeenCalledOnce()
  })

  it('keeps a committed clear when cleanup of its old credential fails', async () => {
    const context = new Context()
    const scope = settings()
    const service = createRemote(context, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
    } as never, scope as never)
    service.credentialStore.provider.unset.mockRejectedValueOnce(new Error('old credential cleanup rejected'))

    await expect(service.saveProfile({ ...validOpenAiRequest, credential: { action: 'clear' } }, new AbortController().signal))
      .rejects.toMatchObject(remoteFailure('IMAGE_READER_CREDENTIAL_COMMITTED_CLEANUP_FAILED'))

    const saved = scope.replace.mock.calls[0]![0]
    expect(saved.credentialRefs.custom).toBeUndefined()
    expect(saved.configuration.profiles[0]?.hasApiKey).toBe(false)
    expect(service.credentialStore.values.get(credentialRef(String(credentialRefs.custom)))).toBe('stored-key')
    const cleanupLog = context.logger.buffer.find(entry => entry.name === 'harness-comfyui-image-reader')
    expect(cleanupLog).toBeDefined()
    const logged = JSON.parse(cleanupLog!.args[1] as string)
    expect(logged).toEqual({
      code: 'IMAGE_READER_CREDENTIAL_COMMITTED_CLEANUP_FAILED',
      credentialFailure: {
        reference: credentialRefs.custom,
        stage: 'committed-cleanup',
        profileCommitted: true,
      },
    })
    expect(JSON.stringify(cleanupLog!.args)).not.toContain('stored-key')
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
      credentialRefs: {},
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
        credentialRefs: {},
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
        credentialRefs: { current: credentialRefs.current },
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
      credentialRefs: {},
    })
    await context.fiber.dispose()
  })

  it('returns committed deletion data when cancellation happens during the Settings write', async () => {
    const context = new Context()
    const first = { ...createImageReaderProfile('first'), provider: 'provider-a', model: 'vision-a' }
    const second = { ...createImageReaderProfile('second'), provider: 'provider-a', model: 'vision-a' }
    const current = {
      configuration: { activeProfileId: 'first', profiles: [first, second] },
      credentialRefs: {},
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
        get: vi.fn(() => ({ configuration: { activeProfileId, profiles }, credentialRefs: {} })),
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
      credentialRefs: {},
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
      credentialRefs: { second: credentialRefs.second },
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
    expect(current.credentialRefs).toEqual({})
    expect(scope.get).toHaveBeenCalledTimes(2)
    await context.fiber.dispose()
  })

  it('serializes activation, deletion, and saving through one Settings mutation queue', async () => {
    const context = new Context()
    const first = { ...createImageReaderProfile('first', '第一份'), provider: 'provider-a', model: 'vision-a' }
    const second = { ...createImageReaderProfile('second', '第二份'), provider: 'provider-a', model: 'vision-a' }
    let current: ImageReaderSettingsSection = {
      configuration: { activeProfileId: 'first', profiles: [first, second] },
      credentialRefs: {},
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
      credentialRefs: {},
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
      get: vi.fn(() => ({ configuration: { activeProfileId: 'first', profiles }, credentialRefs: {} })),
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
  const initialSection = settings.get()
  const credentialStore = createCredentialStore(initialSection)
  vi.mocked(settings.get).mockClear()
  const settingsStore = {
    get: () => settings.get(),
    replace: (section: ImageReaderSettingsSection) => settings.replace(section),
    readPersistedUserOverride: () => settings.readPersistedUserOverride?.() ?? Object.freeze({ kind: 'readable' as const, value: initialSection }),
  }
  return Object.assign(
    new ImageReaderRemoteService(context, new ImageReaderConfigurationService(llm, settingsStore, credentialStore)),
    { credentialStore },
  )
}

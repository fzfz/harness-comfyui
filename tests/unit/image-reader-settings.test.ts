import { createRequire } from 'node:module'
import { createElement, type ReactNode } from 'react'
import { redactSecrets } from '@deepseek-ai/dsh-settings'
import { describe, expect, it, vi } from 'vitest'

import {
  IMAGE_READER_DEFAULT_CONFIGURATION,
  IMAGE_READER_DEFAULT_PROMPT,
  IMAGE_READER_SETTINGS_SCHEMA,
  createImageReaderProfile,
  decodeImageReaderConfiguration,
  decodeImageReaderSettingsView,
  validateImageReaderConfiguration,
  type ImageReaderConfiguration,
} from '../../src/image-reader/settings.ts'
import {
  ImageReaderSettingsError,
  ImageReaderSettingsPage,
  endpointTransportMessage,
  imageReaderSettingsErrorMessage,
  modelsForProvider,
  saveImageReaderProfile,
} from '../../src/client/image-reader/image-reader-settings.tsx'
import { IMAGE_READER_SETTINGS_FIELD_BY_CODE } from '../../src/image-reader/settings-errors.ts'

const { act, create } = createRequire(import.meta.url)('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>
  create: (node: ReactNode) => {
    root: { findAllByType(type: string): Array<{ props: Record<string, any> }> }
    toJSON(): unknown
    unmount(): void
  }
}

const runtimeProfile = Object.freeze({
  ...createImageReaderProfile('runtime'),
  name: '系统视觉',
  provider: 'provider-a',
  model: 'vision-a',
})

const runtimeConfiguration: ImageReaderConfiguration = Object.freeze({
  activeProfileId: runtimeProfile.id,
  profiles: Object.freeze([runtimeProfile]),
})

const modelCatalog = Object.freeze({
  groups: Object.freeze([Object.freeze({
    provider: 'provider-a', name: 'Provider A',
    models: Object.freeze([Object.freeze({ id: 'vision-a', name: 'Vision A', description: null })]),
  })]),
  failures: Object.freeze([]),
})

function settingsScope(
  configuration: ImageReaderConfiguration | undefined = runtimeConfiguration,
  state: { readonly status?: 'loading' | 'ready' | 'unavailable'; readonly writable?: boolean } = {},
) {
  const snapshot = Object.freeze({
    status: state.status ?? 'ready',
    writable: state.writable ?? true,
    value: configuration === undefined ? undefined : Object.freeze({ configuration }),
  })
  return {
    snapshot,
    subscribe() {
      if (this.snapshot !== snapshot) throw new Error('settings scope receiver was lost')
      return () => undefined
    },
    getSnapshot() {
      if (this.snapshot !== snapshot) throw new Error('settings scope receiver was lost')
      return this.snapshot
    },
  }
}

function buttonByText(renderer: ReturnType<typeof create>, value: string) {
  return renderer.root.findAllByType('button').find(button => button.props.children === value)!
}

function inputByType(renderer: ReturnType<typeof create>, type: string, index = 0) {
  return renderer.root.findAllByType('input').filter(input => input.props.type === type)[index]!
}

describe('image reader settings page behavior', () => {
  it('decodes a complete multi-profile configuration and rejects duplicate or missing active ids', () => {
    const custom = Object.freeze({
      ...createImageReaderProfile('custom'),
      name: '本地视觉',
      connectionType: 'openai-compatible' as const,
      endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'qwen-vl',
    })
    const configuration = {
      activeProfileId: custom.id,
      profiles: [runtimeProfile, custom],
    }
    expect(decodeImageReaderConfiguration(configuration)).toEqual(configuration)
    expect(decodeImageReaderSettingsView({ configuration, credentials: {} })).toEqual({ configuration })
    expect(decodeImageReaderConfiguration({ activeProfileId: 'missing', profiles: [runtimeProfile] })).toBeUndefined()
    expect(decodeImageReaderConfiguration({ activeProfileId: 'runtime', profiles: [runtimeProfile, runtimeProfile] })).toBeUndefined()
  })

  it('redacts every stored OpenAI-compatible API Key from the settings value sent to the browser', () => {
    const value = {
      configuration: runtimeConfiguration,
      credentials: { custom: 'must-not-cross-the-wire' },
    }
    expect(redactSecrets(IMAGE_READER_SETTINGS_SCHEMA as never, value)).toEqual({
      value: { configuration: runtimeConfiguration, credentials: {} },
      secrets: [{ path: ['credentials', 'custom'], set: true }],
    })
  })

  it('validates the two connection types without coupling custom endpoints to the runtime catalog', () => {
    expect(() => validateImageReaderConfiguration(runtimeConfiguration)).not.toThrow()
    const custom = {
      ...createImageReaderProfile('custom'),
      connectionType: 'openai-compatible' as const,
      endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'vision-model',
    }
    expect(() => validateImageReaderConfiguration({ activeProfileId: 'custom', profiles: [custom] })).not.toThrow()
    expect(() => validateImageReaderConfiguration({
      activeProfileId: 'custom', profiles: [{ ...custom, endpoint: 'ftp://127.0.0.1/model' }],
    })).toThrow('OpenAI-compatible')
    expect(() => validateImageReaderConfiguration({
      activeProfileId: 'runtime', profiles: [{ ...runtimeProfile, provider: '' }],
    })).toThrow('runtime')
  })

  it('uses the complete shared default prompt when the namespace has no saved configuration', async () => {
    const api = {
      models: vi.fn(async () => modelCatalog),
      saveProfile: vi.fn(),
      deleteProfile: vi.fn(),
    }
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(ImageReaderSettingsPage, { scope: settingsScope(undefined), api } as never))
      await Promise.resolve()
    })
    expect(renderer.root.findAllByType('textarea')[0]!.props.value).toBe(IMAGE_READER_DEFAULT_PROMPT)
    expect(renderer.root.findAllByType('textarea')[0]!.props.value)
      .toBe(IMAGE_READER_DEFAULT_CONFIGURATION.profiles[0]!.defaultPrompt)
    renderer.unmount()
  })

  it('selects models only from the active runtime provider group', () => {
    const catalog = {
      groups: [
        { provider: 'provider-a', name: 'Provider A', models: [{ id: 'vision-a', name: 'Vision A', description: null }] },
        { provider: 'provider-b', name: 'Provider B', models: [{ id: 'vision-b', name: 'Vision B', description: null }] },
      ],
      failures: [],
    }
    expect(modelsForProvider(catalog, 'provider-b')).toEqual(catalog.groups[1]!.models)
    expect(modelsForProvider(catalog, 'missing')).toEqual([])
  })

  it('describes HTTP plaintext and HTTPS TLS transport states', () => {
    expect(endpointTransportMessage('http://127.0.0.1:11434/v1/chat/completions'))
      .toBe('当前 HTTP 地址不会加密 API Key 与图片内容；使用者必须确认目标内网链路符合部署要求。')
    expect(endpointTransportMessage('HTTP://127.0.0.1:11434/v1/chat/completions'))
      .toBe('当前 HTTP 地址不会加密 API Key 与图片内容；使用者必须确认目标内网链路符合部署要求。')
    expect(endpointTransportMessage('https://vision.example/v1/chat/completions'))
      .toBe('当前 HTTPS 地址将通过 TLS 传输 API Key 与图片内容。')
    expect(endpointTransportMessage('HTTPS://vision.example/v1/chat/completions'))
      .toBe('当前 HTTPS 地址将通过 TLS 传输 API Key 与图片内容。')
    expect(endpointTransportMessage('not a URL')).toBeNull()
    expect(endpointTransportMessage('')).toBeNull()
  })

  it('uses the project error catalog instead of exposing Remote error messages', () => {
    expect(imageReaderSettingsErrorMessage(new ImageReaderSettingsError(
      'IMAGE_READER_SETTINGS_SAVE_FAILED',
      'The settings database rejected the write.',
    ))).toContain('IMAGE_READER_SETTINGS_SAVE_FAILED：Harness Settings 服务未能持久化')
    expect(imageReaderSettingsErrorMessage(new Error('The remote transport failed.')))
      .toContain('IMAGE_READER_SETTINGS_REQUEST_FAILED：图片读取设置页无法完成')
    expect(imageReaderSettingsErrorMessage(new Error('The remote transport failed.')))
      .not.toContain('The remote transport failed.')
  })

  it('saves only the current profile through one Host request', async () => {
    const saveProfile = vi.fn(async () => ({ configuration: runtimeConfiguration }))
    const signal = new AbortController().signal
    await expect(saveImageReaderProfile(
      { saveProfile },
      runtimeProfile,
      { action: 'clear' },
      runtimeConfiguration,
      signal,
    )).resolves.toEqual({ configuration: runtimeConfiguration })
    expect(saveProfile).toHaveBeenCalledWith({
      profile: {
        id: 'runtime',
        name: '系统视觉',
        connectionType: 'runtime',
        provider: 'provider-a',
        model: 'vision-a',
        defaultPrompt: IMAGE_READER_DEFAULT_PROMPT,
        temperature: 0.2,
        maxTokens: 2048,
      },
    }, signal)
  })

  it('rejects one invalid current-profile field before sending a save request', async () => {
    const saveProfile = vi.fn()
    await expect(saveImageReaderProfile(
      { saveProfile },
      { ...runtimeProfile, model: '' },
      { action: 'clear' },
      runtimeConfiguration,
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'IMAGE_READER_MODEL_REQUIRED' })
    expect(saveProfile).not.toHaveBeenCalled()
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite temperature %s before Remote serialization',
    async temperature => {
      const saveProfile = vi.fn()
      await expect(saveImageReaderProfile(
        { saveProfile },
        { ...runtimeProfile, temperature },
        { action: 'clear' },
        runtimeConfiguration,
        new AbortController().signal,
      )).rejects.toMatchObject({ code: 'IMAGE_READER_TEMPERATURE_NUMBER_INVALID' })
      expect(saveProfile).not.toHaveBeenCalled()
    },
  )

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite maximum output tokens %s before Remote serialization',
    async maxTokens => {
      const saveProfile = vi.fn()
      await expect(saveImageReaderProfile(
        { saveProfile },
        { ...runtimeProfile, maxTokens },
        { action: 'clear' },
        runtimeConfiguration,
        new AbortController().signal,
      )).rejects.toMatchObject({ code: 'IMAGE_READER_MAX_TOKENS_INTEGER_INVALID' })
      expect(saveProfile).not.toHaveBeenCalled()
    },
  )

  it('keeps the validation-code-to-input mapping complete and deterministic', () => {
    expect(IMAGE_READER_SETTINGS_FIELD_BY_CODE).toEqual({
      IMAGE_READER_PROFILE_ID_FORMAT_INVALID: 'profile',
      IMAGE_READER_PROFILE_NAME_REQUIRED: 'name',
      IMAGE_READER_PROFILE_NAME_TOO_LONG: 'name',
      IMAGE_READER_RUNTIME_PROVIDER_REQUIRED: 'provider',
      IMAGE_READER_RUNTIME_PROVIDER_TOO_LONG: 'provider',
      IMAGE_READER_ENDPOINT_REQUIRED: 'endpoint',
      IMAGE_READER_ENDPOINT_TOO_LONG: 'endpoint',
      IMAGE_READER_ENDPOINT_WHITESPACE_INVALID: 'endpoint',
      IMAGE_READER_ENDPOINT_URL_INVALID: 'endpoint',
      IMAGE_READER_ENDPOINT_PROTOCOL_INVALID: 'endpoint',
      IMAGE_READER_ENDPOINT_CREDENTIALS_FORBIDDEN: 'endpoint',
      IMAGE_READER_ENDPOINT_FRAGMENT_FORBIDDEN: 'endpoint',
      IMAGE_READER_MODEL_REQUIRED: 'model',
      IMAGE_READER_MODEL_TOO_LONG: 'model',
      IMAGE_READER_DEFAULT_PROMPT_REQUIRED: 'defaultPrompt',
      IMAGE_READER_DEFAULT_PROMPT_TOO_LONG: 'defaultPrompt',
      IMAGE_READER_TEMPERATURE_NUMBER_INVALID: 'temperature',
      IMAGE_READER_TEMPERATURE_RANGE_INVALID: 'temperature',
      IMAGE_READER_MAX_TOKENS_INTEGER_INVALID: 'maxTokens',
      IMAGE_READER_MAX_TOKENS_RANGE_INVALID: 'maxTokens',
      IMAGE_READER_API_KEY_REQUIRED: 'credential',
      IMAGE_READER_API_KEY_TOO_LONG: 'credential',
      IMAGE_READER_PROFILE_LIMIT_REACHED: 'profile',
    })
    for (const code of [
      ...Object.keys(IMAGE_READER_SETTINGS_FIELD_BY_CODE),
      'IMAGE_READER_PROFILE_NOT_FOUND',
      'IMAGE_READER_LAST_PROFILE_DELETE_FORBIDDEN',
      'IMAGE_READER_PROMPT_REQUIRED',
      'IMAGE_READER_PROMPT_TOO_LONG',
    ]) {
      expect(imageReaderSettingsErrorMessage({ code })).toContain(`${code}：`)
    }
  })

  it('creates an OpenAI-compatible profile, marks it active, and submits its API Key as write-only data', async () => {
    const saveProfile = vi.fn(async (request: any) => ({
      configuration: {
        activeProfileId: request.profile.id,
        profiles: [runtimeProfile, {
          ...request.profile,
          provider: '',
          hasApiKey: request.credential.action === 'replace',
        }],
      },
    }))
    const api = { models: vi.fn(async () => modelCatalog), saveProfile, deleteProfile: vi.fn() }
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(ImageReaderSettingsPage, { scope: settingsScope(), api } as never))
      await Promise.resolve()
    })

    await act(async () => {
      ;(buttonByText(renderer, '新建配置').props.onClick as () => void)()
    })
    expect(buttonByText(renderer, '删除配置').props.disabled).toBe(false)
    await act(async () => {
      ;(renderer.root.findAllByType('input').filter(input => input.props.type === 'radio')[1]!.props.onChange as () => void)()
    })
    await act(async () => {
      ;(inputByType(renderer, 'text', 0).props.onChange as (event: unknown) => void)({ target: { value: '本地 Qwen' } })
      ;(inputByType(renderer, 'url').props.onChange as (event: unknown) => void)({ target: { value: 'http://127.0.0.1:11434/v1/chat/completions' } })
      ;(inputByType(renderer, 'text', 1).props.onChange as (event: unknown) => void)({ target: { value: 'qwen-vl' } })
      ;(inputByType(renderer, 'password').props.onChange as (event: unknown) => void)({ target: { value: 'write-only-key' } })
    })
    expect(JSON.stringify(renderer.toJSON())).toContain('保存后首次设置这份配置的 API Key')
    await act(async () => {
      ;(buttonByText(renderer, '保存当前配置').props.onClick as () => void)()
      await Promise.resolve()
    })

    expect(saveProfile).toHaveBeenCalledOnce()
    expect(saveProfile.mock.calls[0]![0]).toEqual({
      profile: {
        id: expect.stringMatching(/^profile_/),
        name: '本地 Qwen',
        connectionType: 'openai-compatible',
        endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
        model: 'qwen-vl',
        defaultPrompt: IMAGE_READER_DEFAULT_PROMPT,
        temperature: 0.2,
        maxTokens: 2048,
      },
      credential: { action: 'replace', apiKey: 'write-only-key' },
    })
    expect(JSON.stringify(renderer.toJSON())).toContain('当前图片读取配置已保存并生效。')
    renderer.unmount()
  })

  it('supports profile switching, runtime fields, credentials, prompt, and sampling controls', async () => {
    const custom = Object.freeze({
      ...createImageReaderProfile('custom', '内网视觉'),
      connectionType: 'openai-compatible' as const,
      endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'qwen-vl',
      hasApiKey: true,
    })
    const configuration = Object.freeze({
      activeProfileId: runtimeProfile.id,
      profiles: Object.freeze([runtimeProfile, custom]),
    })
    const catalogWithFailure = Object.freeze({
      ...modelCatalog,
      failures: Object.freeze([Object.freeze({ provider: 'provider-b', message: '目录暂不可用' })]),
    })
    const api = {
      models: vi.fn(async () => catalogWithFailure),
      saveProfile: vi.fn(async (request: any) => ({
        configuration: {
          activeProfileId: request.profile.id,
          profiles: [runtimeProfile, { ...request.profile, endpoint: '', hasApiKey: false }],
        },
      })),
      deleteProfile: vi.fn(),
    }
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(ImageReaderSettingsPage, { scope: settingsScope(configuration), api } as never))
      await Promise.resolve()
    })
    expect(JSON.stringify(renderer.toJSON())).toContain('provider-b')
    expect(JSON.stringify(renderer.toJSON())).toContain('的系统模型目录')

    await act(async () => {
      ;(buttonByText(renderer, '刷新系统模型').props.onClick as () => void)()
      await Promise.resolve()
    })
    expect(api.models).toHaveBeenCalledTimes(2)

    await act(async () => {
      ;(renderer.root.findAllByType('select')[0]!.props.onChange as (event: unknown) => void)({ target: { value: 'custom' } })
    })
    expect(inputByType(renderer, 'password').props.placeholder).toContain('已保存')
    await act(async () => {
      ;(buttonByText(renderer, '清除已保存的 API Key').props.onClick as () => void)()
    })
    expect(JSON.stringify(renderer.toJSON())).toContain('保存后清除已保存的 API Key')
    await act(async () => {
      ;(buttonByText(renderer, '保留已保存的 API Key').props.onClick as () => void)()
    })
    expect(JSON.stringify(renderer.toJSON())).toContain('这份配置已经保存 API Key；留空不会修改')
    await act(async () => {
      ;(inputByType(renderer, 'password').props.onChange as (event: unknown) => void)({ target: { value: 'replacement' } })
    })
    expect(JSON.stringify(renderer.toJSON())).toContain('保存后替换这份配置的 API Key')
    await act(async () => {
      ;(inputByType(renderer, 'password').props.onChange as (event: unknown) => void)({ target: { value: '' } })
      ;(renderer.root.findAllByType('input').filter(input => input.props.type === 'radio')[0]!.props.onChange as () => void)()
    })

    const runtimeSelects = renderer.root.findAllByType('select')
    await act(async () => {
      ;(runtimeSelects[1]!.props.onChange as (event: unknown) => void)({ target: { value: 'provider-a' } })
    })
    await act(async () => {
      ;(renderer.root.findAllByType('select')[2]!.props.onChange as (event: unknown) => void)({ target: { value: 'vision-a' } })
      ;(renderer.root.findAllByType('textarea')[0]!.props.onChange as (event: unknown) => void)({ target: { value: 'updated prompt' } })
      const numbers = renderer.root.findAllByType('input').filter(input => input.props.type === 'number')
      ;(numbers[0]!.props.onChange as (event: unknown) => void)({ target: { value: '0.35' } })
      ;(numbers[1]!.props.onChange as (event: unknown) => void)({ target: { value: '4096' } })
    })

    await act(async () => {
      ;(buttonByText(renderer, '保存当前配置').props.onClick as () => void)()
      await Promise.resolve()
    })
    expect(api.saveProfile.mock.calls[0]![0]).toEqual({
      profile: {
        id: 'custom',
        name: '内网视觉',
        connectionType: 'runtime',
        provider: 'provider-a',
        model: 'vision-a',
        defaultPrompt: 'updated prompt',
        temperature: 0.35,
        maxTokens: 4096,
      },
    })
    renderer.unmount()
  })

  it('duplicates profile parameters without duplicating the saved API Key', async () => {
    const custom = Object.freeze({
      ...createImageReaderProfile('custom', '内网视觉'),
      connectionType: 'openai-compatible' as const,
      endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'qwen-vl',
      hasApiKey: true,
    })
    const api = {
      models: vi.fn(async () => modelCatalog),
      saveProfile: vi.fn(),
      deleteProfile: vi.fn(),
    }
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(ImageReaderSettingsPage, {
        scope: settingsScope(Object.freeze({ activeProfileId: custom.id, profiles: Object.freeze([custom]) })),
        api,
      } as never))
      await Promise.resolve()
    })

    expect(JSON.stringify(renderer.toJSON())).toContain('但不会复制 API Key')
    await act(async () => {
      ;(buttonByText(renderer, '复制配置').props.onClick as () => void)()
    })
    expect(JSON.stringify(renderer.toJSON())).toContain('这份配置没有保存 API Key')
    expect(inputByType(renderer, 'password').props.placeholder).not.toContain('已保存')
    renderer.unmount()
  })

  it('discards an unsaved new profile locally without calling the delete Remote', async () => {
    const api = {
      models: vi.fn(async () => modelCatalog),
      saveProfile: vi.fn(),
      deleteProfile: vi.fn(),
    }
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(ImageReaderSettingsPage, { scope: settingsScope(), api } as never))
      await Promise.resolve()
    })

    await act(async () => {
      ;(buttonByText(renderer, '新建配置').props.onClick as () => void)()
    })
    expect(inputByType(renderer, 'text', 0).props.value).toContain('图片读取配置')
    await act(async () => {
      ;(buttonByText(renderer, '删除配置').props.onClick as () => void)()
    })

    expect(api.deleteProfile).not.toHaveBeenCalled()
    expect(inputByType(renderer, 'text', 0).props.value).toBe('系统视觉')
    renderer.unmount()
  })

  it('deletes a persisted profile through the dedicated Remote and loads the Host-selected active profile', async () => {
    const custom = Object.freeze({
      ...createImageReaderProfile('custom', '待删除配置'),
      connectionType: 'openai-compatible' as const,
      endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'qwen-vl',
      hasApiKey: true,
    })
    const configuration = Object.freeze({
      activeProfileId: custom.id,
      profiles: Object.freeze([runtimeProfile, custom]),
    })
    const deleteProfile = vi.fn(async () => ({ configuration: runtimeConfiguration }))
    const api = { models: vi.fn(async () => modelCatalog), saveProfile: vi.fn(), deleteProfile }
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(ImageReaderSettingsPage, { scope: settingsScope(configuration), api } as never))
      await Promise.resolve()
    })

    await act(async () => {
      ;(buttonByText(renderer, '删除配置').props.onClick as () => void)()
      await Promise.resolve()
    })

    expect(deleteProfile).toHaveBeenCalledWith(
      { profileId: 'custom' },
      expect.any(AbortSignal),
    )
    expect(inputByType(renderer, 'text', 0).props.value).toBe('系统视觉')
    expect(JSON.stringify(renderer.toJSON())).toContain('当前图片读取配置已删除。')
    renderer.unmount()
  })

  it('labels a dedicated Remote deletion failure as a deletion error', async () => {
    const custom = Object.freeze({
      ...createImageReaderProfile('custom', '待删除配置'),
      connectionType: 'openai-compatible' as const,
      endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'qwen-vl',
    })
    const configuration = Object.freeze({
      activeProfileId: custom.id,
      profiles: Object.freeze([runtimeProfile, custom]),
    })
    const api = {
      models: vi.fn(async () => modelCatalog),
      saveProfile: vi.fn(),
      deleteProfile: vi.fn(async () => {
        throw new ImageReaderSettingsError('IMAGE_READER_SETTINGS_DELETE_FAILED', 'settings write failed')
      }),
    }
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(ImageReaderSettingsPage, { scope: settingsScope(configuration), api } as never))
      await Promise.resolve()
    })

    await act(async () => {
      ;(buttonByText(renderer, '删除配置').props.onClick as () => void)()
      await Promise.resolve()
    })

    expect(JSON.stringify(renderer.toJSON())).toContain('删除失败：IMAGE_READER_SETTINGS_DELETE_FAILED')
    expect(JSON.stringify(renderer.toJSON())).toContain('重新删除当前配置')
    expect(JSON.stringify(renderer.toJSON())).not.toContain('保存当前配置失败')
    expect(inputByType(renderer, 'text', 0).props.value).toBe('待删除配置')
    renderer.unmount()
  })

  it.each(Object.entries(IMAGE_READER_SETTINGS_FIELD_BY_CODE))(
    'shows %s only at its mapped current-profile location and repeats it beside the save action',
    async (code, field) => {
      const useOpenAiProfile = field === 'endpoint' || field === 'credential'
      const profile = useOpenAiProfile
        ? Object.freeze({
            ...createImageReaderProfile('custom', '本地视觉'),
            connectionType: 'openai-compatible' as const,
            endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
            model: 'qwen-vl',
            hasApiKey: true,
          })
        : runtimeProfile
      const configuration = Object.freeze({
        activeProfileId: profile.id,
        profiles: Object.freeze([profile]),
      })
      const api = {
        models: vi.fn(async () => modelCatalog),
        saveProfile: vi.fn(async () => {
          throw new ImageReaderSettingsError(code, code)
        }),
        deleteProfile: vi.fn(),
      }
      let renderer!: ReturnType<typeof create>
      await act(async () => {
        renderer = create(createElement(ImageReaderSettingsPage, { scope: settingsScope(configuration), api } as never))
        await Promise.resolve()
      })
      await act(async () => {
        ;(buttonByText(renderer, '保存当前配置').props.onClick as () => void)()
        await Promise.resolve()
      })

      const fieldAlerts = renderer.root.findAllByType('small')
        .filter(node => node.props['data-image-reader-error-field'] !== undefined)
      expect(fieldAlerts).toHaveLength(1)
      expect(fieldAlerts[0]!.props['data-image-reader-error-field']).toBe(field)
      expect(String(fieldAlerts[0]!.props.children)).toContain(code)
      const summaryAlerts = renderer.root.findAllByType('span').filter(node => node.props.role === 'alert')
      expect(summaryAlerts).toHaveLength(1)
      expect(String(summaryAlerts[0]!.props.children)).toContain(code)
      const rendered = JSON.stringify(renderer.toJSON())
      expect(rendered.match(new RegExp(code, 'gu'))).toHaveLength(2)
      expect(rendered).not.toContain('IMAGE_READER_SETTINGS_INVALID')
      expect(api.saveProfile).toHaveBeenCalledOnce()
      renderer.unmount()
    },
  )

  it('reloads a saved OpenAI-compatible profile from the persisted snapshot after discarding empty edits', async () => {
    const custom = Object.freeze({
      ...createImageReaderProfile('custom', '已保存 OpenAI 视觉'),
      connectionType: 'openai-compatible' as const,
      endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'qwen-vl',
      hasApiKey: true,
      defaultPrompt: '已保存的读图提示词',
      temperature: 0.7,
      maxTokens: 8192,
    })
    const configuration = Object.freeze({
      activeProfileId: custom.id,
      profiles: Object.freeze([runtimeProfile, custom]),
    })
    const api = {
      models: vi.fn(async () => modelCatalog),
      saveProfile: vi.fn(),
      deleteProfile: vi.fn(),
    }
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(ImageReaderSettingsPage, { scope: settingsScope(configuration), api } as never))
      await Promise.resolve()
    })

    expect(inputByType(renderer, 'text', 0).props.value).toBe('已保存 OpenAI 视觉')
    expect(inputByType(renderer, 'url').props.value).toBe('http://127.0.0.1:11434/v1/chat/completions')
    expect(inputByType(renderer, 'text', 1).props.value).toBe('qwen-vl')
    expect(renderer.root.findAllByType('textarea')[0]!.props.value).toBe('已保存的读图提示词')
    expect(inputByType(renderer, 'password').props.value).toBe('')
    expect(inputByType(renderer, 'password').props.placeholder).toContain('已保存')

    await act(async () => {
      ;(inputByType(renderer, 'text', 0).props.onChange as (event: unknown) => void)({ target: { value: '' } })
      ;(inputByType(renderer, 'url').props.onChange as (event: unknown) => void)({ target: { value: '' } })
      ;(inputByType(renderer, 'text', 1).props.onChange as (event: unknown) => void)({ target: { value: '' } })
      ;(renderer.root.findAllByType('textarea')[0]!.props.onChange as (event: unknown) => void)({ target: { value: '' } })
      const numbers = renderer.root.findAllByType('input').filter(input => input.props.type === 'number')
      ;(numbers[0]!.props.onChange as (event: unknown) => void)({ target: { value: '0' } })
      ;(numbers[1]!.props.onChange as (event: unknown) => void)({ target: { value: '0' } })
    })
    await act(async () => {
      ;(renderer.root.findAllByType('select')[0]!.props.onChange as (event: unknown) => void)({ target: { value: 'runtime' } })
    })
    expect(JSON.stringify(renderer.toJSON())).toContain('当前配置有未保存修改')

    await act(async () => {
      ;(buttonByText(renderer, '放弃当前修改并切换').props.onClick as () => void)()
    })
    await act(async () => {
      ;(renderer.root.findAllByType('select')[0]!.props.onChange as (event: unknown) => void)({ target: { value: 'custom' } })
    })

    expect(inputByType(renderer, 'text', 0).props.value).toBe('已保存 OpenAI 视觉')
    expect(inputByType(renderer, 'url').props.value).toBe('http://127.0.0.1:11434/v1/chat/completions')
    expect(inputByType(renderer, 'text', 1).props.value).toBe('qwen-vl')
    expect(renderer.root.findAllByType('textarea')[0]!.props.value).toBe('已保存的读图提示词')
    const numbers = renderer.root.findAllByType('input').filter(input => input.props.type === 'number')
    expect(numbers[0]!.props.value).toBe(0.7)
    expect(numbers[1]!.props.value).toBe(8192)
    renderer.unmount()

    await act(async () => {
      renderer = create(createElement(ImageReaderSettingsPage, { scope: settingsScope(configuration), api } as never))
      await Promise.resolve()
    })
    expect(inputByType(renderer, 'text', 0).props.value).toBe('已保存 OpenAI 视觉')
    expect(inputByType(renderer, 'url').props.value).toBe('http://127.0.0.1:11434/v1/chat/completions')
    expect(inputByType(renderer, 'text', 1).props.value).toBe('qwen-vl')
    expect(renderer.root.findAllByType('textarea')[0]!.props.value).toBe('已保存的读图提示词')
    expect(inputByType(renderer, 'password').props.value).toBe('')
    expect(inputByType(renderer, 'password').props.placeholder).toContain('已保存')
    renderer.unmount()
  })

  it('lets the switch gate continue editing or save the current profile without switching to stale values', async () => {
    const custom = Object.freeze({
      ...createImageReaderProfile('custom', '另一份系统视觉'),
      provider: 'provider-a',
      model: 'vision-a',
    })
    const configuration = Object.freeze({
      activeProfileId: runtimeProfile.id,
      profiles: Object.freeze([runtimeProfile, custom]),
    })
    const saveProfile = vi.fn(async (request: any) => ({
      configuration: Object.freeze({
        activeProfileId: request.profile.id,
        profiles: Object.freeze([Object.freeze({
          ...request.profile,
          endpoint: '',
          hasApiKey: false,
        }), custom]),
      }),
    }))
    const api = { models: vi.fn(async () => modelCatalog), saveProfile, deleteProfile: vi.fn() }
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(ImageReaderSettingsPage, { scope: settingsScope(configuration), api } as never))
      await Promise.resolve()
    })

    await act(async () => {
      ;(inputByType(renderer, 'text', 0).props.onChange as (event: unknown) => void)({ target: { value: '已修改系统视觉' } })
    })
    await act(async () => {
      ;(renderer.root.findAllByType('select')[0]!.props.onChange as (event: unknown) => void)({ target: { value: 'custom' } })
    })
    expect(JSON.stringify(renderer.toJSON())).toContain('当前配置有未保存修改')

    await act(async () => {
      ;(buttonByText(renderer, '继续编辑当前配置').props.onClick as () => void)()
    })
    expect(JSON.stringify(renderer.toJSON())).not.toContain('当前配置有未保存修改')
    expect(inputByType(renderer, 'text', 0).props.value).toBe('已修改系统视觉')

    await act(async () => {
      ;(renderer.root.findAllByType('select')[0]!.props.onChange as (event: unknown) => void)({ target: { value: 'custom' } })
    })
    await act(async () => {
      ;(buttonByText(renderer, '保存当前配置').props.onClick as () => void)()
      await Promise.resolve()
    })

    expect(saveProfile).toHaveBeenCalledOnce()
    expect(saveProfile.mock.calls[0]![0].profile.name).toBe('已修改系统视觉')
    expect(JSON.stringify(renderer.toJSON())).not.toContain('当前配置有未保存修改')
    expect(inputByType(renderer, 'text', 0).props.value).toBe('已修改系统视觉')
    renderer.unmount()
  })

  it('renders loading, unavailable, read-only, and writable settings states', async () => {
    const api = { models: vi.fn(async () => modelCatalog), saveProfile: vi.fn(), deleteProfile: vi.fn() }
    const cases = [
      { scope: settingsScope(runtimeConfiguration, { status: 'loading' }), text: '正在读取图片读取设置', disabled: true },
      { scope: settingsScope(runtimeConfiguration, { status: 'unavailable' }), text: '当前 Harness 环境没有提供可写的图片读取设置', disabled: true },
      { scope: settingsScope(runtimeConfiguration, { writable: false }), text: '当前图片读取设置为只读；当前配置的修改不能保存', disabled: true },
      { scope: settingsScope(runtimeConfiguration), text: '保存当前配置', disabled: false },
    ] as const

    for (const state of cases) {
      let renderer!: ReturnType<typeof create>
      await act(async () => {
        renderer = create(createElement(ImageReaderSettingsPage, { scope: state.scope, api } as never))
        await Promise.resolve()
      })
      expect(JSON.stringify(renderer.toJSON())).toContain(state.text)
      expect(buttonByText(renderer, '保存当前配置').props.disabled).toBe(state.disabled)
      renderer.unmount()
    }
  })

  it('renders model catalog and settings write failures as actionable messages', async () => {
    const catalogFailure = new Error('The model directory transport failed.')
    const api = {
      models: vi.fn(async () => { throw catalogFailure }),
      saveProfile: vi.fn(async () => {
        throw new ImageReaderSettingsError('IMAGE_READER_SETTINGS_SAVE_FAILED', 'The settings write was rejected.')
      }),
      deleteProfile: vi.fn(),
    }
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(ImageReaderSettingsPage, { scope: settingsScope(), api } as never))
      await Promise.resolve()
    })
    expect(JSON.stringify(renderer.toJSON())).toContain('系统模型目录读取失败：')
    expect(JSON.stringify(renderer.toJSON())).toContain('IMAGE_READER_SETTINGS_REQUEST_FAILED')
    expect(JSON.stringify(renderer.toJSON())).not.toContain('The model directory transport failed.')
    await act(async () => {
      ;(buttonByText(renderer, '保存当前配置').props.onClick as () => void)()
      await Promise.resolve()
    })
    expect(JSON.stringify(renderer.toJSON())).toContain('保存失败：')
    expect(JSON.stringify(renderer.toJSON())).toContain('IMAGE_READER_SETTINGS_SAVE_FAILED')
    expect(JSON.stringify(renderer.toJSON())).not.toContain('The settings write was rejected.')
    renderer.unmount()
  })
})

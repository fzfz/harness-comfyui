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
  saveImageReaderSettings,
} from '../../src/client/image-reader/image-reader-settings.tsx'

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
      saveSettings: vi.fn(),
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

  it('saves all profiles and credential changes through one Host request', async () => {
    const saveSettings = vi.fn(async (request: any) => ({ configuration: request.configuration }))
    const signal = new AbortController().signal
    await expect(saveImageReaderSettings(
      { saveSettings },
      runtimeConfiguration,
      [{ profileId: 'custom', apiKey: 'secret' }],
      signal,
    )).resolves.toEqual({ configuration: runtimeConfiguration })
    expect(saveSettings).toHaveBeenCalledWith({
      configuration: runtimeConfiguration,
      credentialUpdates: [{ profileId: 'custom', apiKey: 'secret' }],
    }, signal)
  })

  it('rejects an invalid profile before sending a settings request', async () => {
    const saveSettings = vi.fn()
    await expect(saveImageReaderSettings(
      { saveSettings },
      { activeProfileId: 'runtime', profiles: [{ ...runtimeProfile, model: '' }] },
      [],
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'IMAGE_READER_SETTINGS_INVALID' })
    expect(saveSettings).not.toHaveBeenCalled()
  })

  it('creates an OpenAI-compatible profile, marks it active, and submits its API Key as write-only data', async () => {
    const saveSettings = vi.fn(async (request: any) => ({
      configuration: {
        ...request.configuration,
        profiles: request.configuration.profiles.map((profile: any) => ({
          ...profile,
          hasApiKey: profile.id === request.configuration.activeProfileId,
        })),
      },
    }))
    const api = { models: vi.fn(async () => modelCatalog), saveSettings }
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
      ;(buttonByText(renderer, '保存全部配置').props.onClick as () => void)()
      await Promise.resolve()
    })

    expect(saveSettings).toHaveBeenCalledOnce()
    expect(saveSettings.mock.calls[0]![0]).toMatchObject({
      configuration: {
        profiles: [expect.objectContaining({ name: '系统视觉' }), expect.objectContaining({
          name: '本地 Qwen', connectionType: 'openai-compatible', endpoint: 'http://127.0.0.1:11434/v1/chat/completions', model: 'qwen-vl',
        })],
      },
      credentialUpdates: [expect.objectContaining({ apiKey: 'write-only-key' })],
    })
    expect(JSON.stringify(renderer.toJSON())).toContain('图片读取配置已保存，当前配置已经生效。')
    renderer.unmount()
  })

  it('supports profile switching, duplication, deletion, runtime fields, credentials, prompt, and sampling controls', async () => {
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
      saveSettings: vi.fn(async (request: any) => ({ configuration: request.configuration })),
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
      ;(buttonByText(renderer, '复制配置').props.onClick as () => void)()
    })
    expect(renderer.root.findAllByType('option').some(option => String(option.props.children).includes('副本'))).toBe(true)
    await act(async () => {
      ;(buttonByText(renderer, '删除配置').props.onClick as () => void)()
    })
    await act(async () => {
      ;(buttonByText(renderer, '删除配置').props.onClick as () => void)()
    })
    expect(buttonByText(renderer, '删除配置').props.disabled).toBe(true)
    await act(async () => {
      ;(buttonByText(renderer, '删除配置').props.onClick as () => void)()
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
      saveSettings: vi.fn(async (request: any) => ({ configuration: request.configuration })),
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

  it('renders loading, unavailable, read-only, and writable settings states', async () => {
    const api = { models: vi.fn(async () => modelCatalog), saveSettings: vi.fn() }
    const cases = [
      { scope: settingsScope(runtimeConfiguration, { status: 'loading' }), text: '正在读取图片读取设置', disabled: true },
      { scope: settingsScope(runtimeConfiguration, { status: 'unavailable' }), text: '当前 Harness 环境没有提供可写的图片读取设置', disabled: true },
      { scope: settingsScope(runtimeConfiguration, { writable: false }), text: '当前图片读取设置为只读；页面中的草稿不能保存', disabled: true },
      { scope: settingsScope(runtimeConfiguration), text: '保存全部配置', disabled: false },
    ] as const

    for (const state of cases) {
      let renderer!: ReturnType<typeof create>
      await act(async () => {
        renderer = create(createElement(ImageReaderSettingsPage, { scope: state.scope, api } as never))
        await Promise.resolve()
      })
      expect(JSON.stringify(renderer.toJSON())).toContain(state.text)
      expect(buttonByText(renderer, '保存全部配置').props.disabled).toBe(state.disabled)
      renderer.unmount()
    }
  })

  it('renders model catalog and settings write failures as actionable messages', async () => {
    const catalogFailure = new Error('The model directory transport failed.')
    const api = {
      models: vi.fn(async () => { throw catalogFailure }),
      saveSettings: vi.fn(async () => {
        throw new ImageReaderSettingsError('IMAGE_READER_SETTINGS_SAVE_FAILED', 'The settings write was rejected.')
      }),
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
      ;(buttonByText(renderer, '保存全部配置').props.onClick as () => void)()
      await Promise.resolve()
    })
    expect(JSON.stringify(renderer.toJSON())).toContain('保存失败：')
    expect(JSON.stringify(renderer.toJSON())).toContain('IMAGE_READER_SETTINGS_SAVE_FAILED')
    expect(JSON.stringify(renderer.toJSON())).not.toContain('The settings write was rejected.')
    renderer.unmount()
  })
})

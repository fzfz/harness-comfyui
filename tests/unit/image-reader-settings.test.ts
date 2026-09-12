import { createElement, type ReactNode } from 'react'
import { redactSecrets } from '@deepseek-ai/dsh-settings'
import { describe, expect, it, vi } from 'vitest'

import errorCatalog from '../../config/error-catalog.json' with { type: 'json' }
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

const { act, create } = await vi.importActual('react-test-renderer') as {
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

function mutableSettingsScope(configuration: ImageReaderConfiguration) {
  let snapshot = {
    status: 'ready' as const,
    writable: true,
    value: Object.freeze({ configuration }),
  }
  const listeners = new Set<() => void>()
  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot() {
      return snapshot
    },
    replace(nextConfiguration: ImageReaderConfiguration) {
      snapshot = {
        status: 'ready',
        writable: true,
        value: Object.freeze({ configuration: nextConfiguration }),
      }
      for (const listener of listeners) listener()
    },
  }
}

function buttonByText(renderer: ReturnType<typeof create>, value: string) {
  return renderer.root.findAllByType('button').find(button => {
    const text = Array.isArray(button.props.children)
      ? button.props.children.join('')
      : String(button.props.children)
    if (text === value) return true
    if (value === '保存当前配置') return text.startsWith('保存配置“')
    if (value === '放弃当前修改并切换') return text.startsWith('放弃配置“') && text.endsWith('”') && text.includes('并切换到配置')
    if (value === '继续编辑当前配置') return text.startsWith('继续编辑配置“')
    return false
  })!
}

function inputByType(renderer: ReturnType<typeof create>, type: string, index = 0) {
  return renderer.root.findAllByType('input').filter(input => input.props.type === type)[index]!
}

it('creates profiles with the approved factual observation prompt', () => {
  expect(createImageReaderProfile('new-profile').defaultPrompt).toBe('请准确描述图片中的主体、构图、姿态、服装、环境、光线、风格、明显缺陷和可见文字。只报告图片中可以观察到的内容。')
})

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

  it('publishes the exact image-reader profile operation copy from the approved contract', () => {
    expect(errorCatalog.IMAGE_READER_SETTINGS_ACTIVATE_FAILED).toMatchObject({
      title: '图片读取配置切换失败',
      reason: 'Harness Settings 服务未能把激活请求指定的已保存图片读取配置持久化为当前生效配置。',
      next_step: '当前图片读取继续使用切换前的生效配置。请检查 Harness Settings 存储状态、文件权限和可用磁盘空间后重新选择目标配置。',
    })
    expect(errorCatalog.IMAGE_READER_PROFILE_ALREADY_EXISTS).toMatchObject({
      title: '图片读取配置 ID 已存在',
      reason: 'Harness Settings 已经包含新建或复制请求指定的配置 ID，不能把该请求作为新配置保存。',
      next_step: '放弃当前新建或复制草稿，然后重新创建配置。',
    })
    expect(errorCatalog.IMAGE_READER_PROFILE_ACTIVATION_TARGET_NOT_FOUND).toMatchObject({
      title: '待切换的图片读取配置不存在',
      reason: 'Harness Settings 中找不到激活请求指定的已保存图片读取配置 ID。',
      next_step: '当前图片读取继续使用已提交的生效配置。请从当前已保存配置列表重新选择切换目标。',
    })
    expect(errorCatalog.IMAGE_READER_PROFILE_UPDATE_TARGET_NOT_FOUND).toMatchObject({
      title: '待保存的图片读取配置已被删除',
      reason: 'Harness Settings 中找不到更新请求指定的已保存图片读取配置 ID，当前草稿不能作为更新保存。',
      next_step: '放弃当前草稿，然后从当前已保存配置列表重新选择需要编辑的配置。',
    })
    expect(errorCatalog.IMAGE_READER_PROFILE_NOT_FOUND).toMatchObject({
      title: '待删除的图片读取配置不存在',
      reason: 'Harness Settings 中找不到删除请求指定的已保存图片读取配置 ID。',
      next_step: '重新打开图片读取设置，然后从当前已保存配置列表重新选择删除目标。',
    })
    expect(errorCatalog.IMAGE_READER_SETTINGS_REQUEST_FAILED).toMatchObject({
      reason: '图片读取设置页无法完成系统模型目录读取、当前配置保存、已保存配置激活请求或已保存配置删除请求。',
      next_step: '请检查 Harness Host 连接和 Settings 服务状态后重新提交当前请求。',
    })
  })

  it('saves only the current profile through one Host request', async () => {
    const saveProfile = vi.fn(async () => ({ configuration: runtimeConfiguration }))
    const signal = new AbortController().signal
    await expect(saveImageReaderProfile(
      { saveProfile },
      runtimeProfile,
      { action: 'clear' },
      runtimeConfiguration,
      'update',
      'runtime',
      signal,
    )).resolves.toEqual({ configuration: runtimeConfiguration })
    expect(saveProfile).toHaveBeenCalledWith({
      operation: 'update',
      activateProfileId: 'runtime',
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

  it('activates a selected persisted profile immediately without saving that profile again', async () => {
    const profileB = Object.freeze({
      ...createImageReaderProfile('profile-b', '配置 B'),
      provider: 'provider-a',
      model: 'vision-a',
    })
    const initialConfiguration = Object.freeze({
      activeProfileId: runtimeProfile.id,
      profiles: Object.freeze([runtimeProfile, profileB]),
    })
    const activatedConfiguration = Object.freeze({
      ...initialConfiguration,
      activeProfileId: profileB.id,
    })
    const activateProfile = vi.fn(async () => ({ configuration: activatedConfiguration }))
    const api = {
      models: vi.fn(async () => modelCatalog),
      saveProfile: vi.fn(),
      activateProfile,
      deleteProfile: vi.fn(),
    }
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(ImageReaderSettingsPage, {
        scope: settingsScope(initialConfiguration),
        api,
      } as never))
      await Promise.resolve()
    })

    await act(async () => {
      ;(renderer.root.findAllByType('select')[0]!.props.onChange as (event: unknown) => void)({
        target: { value: profileB.id },
      })
      await Promise.resolve()
    })

    expect(activateProfile).toHaveBeenCalledWith(
      { profileId: profileB.id },
      expect.any(AbortSignal),
    )
    expect(api.saveProfile).not.toHaveBeenCalled()
    expect(renderer.root.findAllByType('select')[0]!.props.value).toBe(profileB.id)
    expect(inputByType(renderer, 'text', 0).props.value).toBe('配置 B')
    expect(JSON.stringify(renderer.toJSON())).toContain('配置“配置 B”已生效。下一次图片读取将使用该配置。')
    renderer.unmount()
  })

  it('keeps the actual profile selected and disables mutations until direct activation succeeds', async () => {
    const profileB = Object.freeze({
      ...createImageReaderProfile('profile-b', '配置 B'),
      provider: 'provider-a',
      model: 'vision-a',
    })
    const configuration = Object.freeze({
      activeProfileId: runtimeProfile.id,
      profiles: Object.freeze([runtimeProfile, profileB]),
    })
    let completeActivation!: (value: unknown) => void
    const activateProfile = vi.fn(() => new Promise(resolve => { completeActivation = resolve }))
    const api = { models: vi.fn(async () => modelCatalog), saveProfile: vi.fn(), activateProfile, deleteProfile: vi.fn() }
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(ImageReaderSettingsPage, { scope: settingsScope(configuration), api } as never))
      await Promise.resolve()
    })

    let activation!: Promise<unknown>
    await act(async () => {
      activation = renderer.root.findAllByType('select')[0]!.props.onChange({ target: { value: profileB.id } })
    })
    expect(renderer.root.findAllByType('select')[0]!.props.value).toBe(runtimeProfile.id)
    expect(renderer.root.findAllByType('select')[0]!.props.disabled).toBe(true)
    expect(inputByType(renderer, 'text', 0).props.disabled).toBe(true)
    expect(JSON.stringify(renderer.toJSON())).toContain('正在切换到配置“配置 B”')

    await act(async () => {
      completeActivation({ configuration: { ...configuration, activeProfileId: profileB.id } })
      await activation
    })
    expect(renderer.root.findAllByType('select')[0]!.props.value).toBe(profileB.id)
    expect(inputByType(renderer, 'text', 0).props.disabled).toBe(false)
    renderer.unmount()
  })

  it('does not put an unsaved new profile into the active selector or send a Host write when the page closes', async () => {
    const api = {
      models: vi.fn(async () => modelCatalog),
      saveProfile: vi.fn(),
      activateProfile: vi.fn(),
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

    const selector = renderer.root.findAllByType('select')[0]!
    expect(selector.props.value).toBe(runtimeProfile.id)
    expect(renderer.root.findAllByType('option').filter(option => option.props.value === selector.props.value)).toHaveLength(1)
    expect(JSON.stringify(renderer.toJSON())).toContain('尚未保存。图片读取继续使用配置“系统视觉”')
    renderer.unmount()

    expect(api.saveProfile).not.toHaveBeenCalled()
    expect(api.activateProfile).not.toHaveBeenCalled()
    expect(api.deleteProfile).not.toHaveBeenCalled()
  })

  it('keeps a dirty editor draft while adopting an external active-profile change', async () => {
    const profileB = Object.freeze({
      ...createImageReaderProfile('profile-b', '配置 B'),
      provider: 'provider-a',
      model: 'vision-a',
    })
    const initial = Object.freeze({
      activeProfileId: runtimeProfile.id,
      profiles: Object.freeze([runtimeProfile, profileB]),
    })
    const scope = mutableSettingsScope(initial)
    const api = { models: vi.fn(async () => modelCatalog), saveProfile: vi.fn(), activateProfile: vi.fn(), deleteProfile: vi.fn() }
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(ImageReaderSettingsPage, { scope, api } as never))
      await Promise.resolve()
    })
    await act(async () => {
      ;(inputByType(renderer, 'text', 0).props.onChange as (event: unknown) => void)({ target: { value: '配置 A 草稿' } })
    })
    await act(async () => {
      scope.replace(Object.freeze({ ...initial, activeProfileId: profileB.id }))
    })

    expect(renderer.root.findAllByType('select')[0]!.props.value).toBe(profileB.id)
    expect(inputByType(renderer, 'text', 0).props.value).toBe('配置 A 草稿')
    expect(JSON.stringify(renderer.toJSON())).toContain('配置“配置 A 草稿”有未保存修改。图片读取当前使用配置“配置 B”')
    renderer.unmount()
  })

  it('saves a dirty persisted draft without silently replacing an externally activated profile', async () => {
    const profileB = Object.freeze({
      ...createImageReaderProfile('profile-b', '配置 B'),
      provider: 'provider-a',
      model: 'vision-a',
    })
    const initial = Object.freeze({
      activeProfileId: runtimeProfile.id,
      profiles: Object.freeze([runtimeProfile, profileB]),
    })
    const scope = mutableSettingsScope(initial)
    const saveProfile = vi.fn(async (request: any) => ({
      configuration: Object.freeze({
        activeProfileId: profileB.id,
        profiles: Object.freeze([
          Object.freeze({ ...runtimeProfile, ...request.profile, endpoint: '', hasApiKey: false }),
          profileB,
        ]),
      }),
    }))
    const api = { models: vi.fn(async () => modelCatalog), saveProfile, activateProfile: vi.fn(), deleteProfile: vi.fn() }
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(ImageReaderSettingsPage, { scope, api } as never))
      await Promise.resolve()
    })
    await act(async () => {
      ;(inputByType(renderer, 'text', 0).props.onChange as (event: unknown) => void)({ target: { value: '配置 A 草稿' } })
      scope.replace(Object.freeze({ ...initial, activeProfileId: profileB.id }))
    })

    const saveLabel = '保存配置“配置 A 草稿”并继续使用当前生效配置“配置 B”'
    expect(buttonByText(renderer, saveLabel)).toBeDefined()
    await act(async () => {
      ;(buttonByText(renderer, saveLabel).props.onClick as () => void)()
      await Promise.resolve()
    })

    expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'update',
      activateProfileId: profileB.id,
      profile: expect.objectContaining({ id: runtimeProfile.id, name: '配置 A 草稿' }),
    }), expect.any(AbortSignal))
    expect(renderer.root.findAllByType('select')[0]!.props.value).toBe(profileB.id)
    expect(JSON.stringify(renderer.toJSON())).toContain('配置“配置 A 草稿”已保存。图片读取继续使用当前生效配置“配置 B”。')
    renderer.unmount()
  })

  it('clears a pending switch and keeps the draft when the target profile disappears from Settings', async () => {
    const profileB = Object.freeze({
      ...createImageReaderProfile('profile-b', '配置 B'),
      provider: 'provider-a',
      model: 'vision-a',
    })
    const initial = Object.freeze({
      activeProfileId: runtimeProfile.id,
      profiles: Object.freeze([runtimeProfile, profileB]),
    })
    const scope = mutableSettingsScope(initial)
    const api = { models: vi.fn(async () => modelCatalog), saveProfile: vi.fn(), activateProfile: vi.fn(), deleteProfile: vi.fn() }
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(ImageReaderSettingsPage, { scope, api } as never))
      await Promise.resolve()
    })
    await act(async () => {
      ;(inputByType(renderer, 'text', 0).props.onChange as (event: unknown) => void)({ target: { value: '配置 A 草稿' } })
    })
    await act(async () => {
      ;(renderer.root.findAllByType('select')[0]!.props.onChange as (event: unknown) => void)({ target: { value: profileB.id } })
    })
    expect(JSON.stringify(renderer.toJSON())).toContain('保存配置“配置 A 草稿”并切换到配置“配置 B”')

    await act(async () => {
      scope.replace(Object.freeze({ activeProfileId: runtimeProfile.id, profiles: Object.freeze([runtimeProfile]) }))
    })

    const output = JSON.stringify(renderer.toJSON())
    expect(output).toContain('目标配置“配置 B”已被其他设置操作删除，无法完成切换')
    expect(output).toContain('配置“配置 A 草稿”的未保存修改仍然保留')
    expect(output).not.toContain('保存配置“配置 A 草稿”并切换到配置“配置 B”')
    expect(inputByType(renderer, 'text', 0).props.value).toBe('配置 A 草稿')
    expect(buttonByText(renderer, '保存当前配置').props.disabled).toBe(false)
    renderer.unmount()
  })

  it('locks a persisted draft whose source disappears until the user discards it', async () => {
    const profileB = Object.freeze({
      ...createImageReaderProfile('profile-b', '配置 B'),
      provider: 'provider-a',
      model: 'vision-a',
    })
    const initial = Object.freeze({
      activeProfileId: runtimeProfile.id,
      profiles: Object.freeze([runtimeProfile, profileB]),
    })
    const scope = mutableSettingsScope(initial)
    const api = { models: vi.fn(async () => modelCatalog), saveProfile: vi.fn(), activateProfile: vi.fn(), deleteProfile: vi.fn() }
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(ImageReaderSettingsPage, { scope, api } as never))
      await Promise.resolve()
    })
    await act(async () => {
      ;(inputByType(renderer, 'text', 0).props.onChange as (event: unknown) => void)({ target: { value: '已删除来源的配置 A 草稿' } })
    })
    await act(async () => {
      ;(renderer.root.findAllByType('select')[0]!.props.onChange as (event: unknown) => void)({ target: { value: profileB.id } })
    })

    await act(async () => {
      scope.replace(Object.freeze({ activeProfileId: profileB.id, profiles: Object.freeze([profileB]) }))
    })

    const output = JSON.stringify(renderer.toJSON())
    expect(output).toContain('配置“已删除来源的配置 A 草稿”已被其他设置操作删除')
    expect(output).toContain('请放弃该草稿以加载当前生效配置“配置 B”')
    expect(output).not.toContain('并切换到配置')
    expect(buttonByText(renderer, '保存当前配置').props.disabled).toBe(true)
    expect(buttonByText(renderer, '删除配置').props.disabled).toBe(true)
    expect(inputByType(renderer, 'text', 0).props.disabled).toBe(true)
    const discard = buttonByText(renderer, '放弃配置“已删除来源的配置 A 草稿”的未保存修改')
    expect(discard.props.disabled).toBe(false)

    await act(async () => {
      ;(discard.props.onClick as () => void)()
    })
    expect(inputByType(renderer, 'text', 0).props.value).toBe('配置 B')
    expect(buttonByText(renderer, '保存当前配置').props.disabled).toBe(false)
    expect(api.saveProfile).not.toHaveBeenCalled()
    expect(api.deleteProfile).not.toHaveBeenCalled()
    renderer.unmount()
  })

  it('rejects one invalid current-profile field before sending a save request', async () => {
    const saveProfile = vi.fn()
    await expect(saveImageReaderProfile(
      { saveProfile },
      { ...runtimeProfile, model: '' },
      { action: 'clear' },
      runtimeConfiguration,
      'update',
      'runtime',
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
        'update',
        'runtime',
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
        'update',
        'runtime',
        new AbortController().signal,
      )).rejects.toMatchObject({ code: 'IMAGE_READER_MAX_TOKENS_INTEGER_INVALID' })
      expect(saveProfile).not.toHaveBeenCalled()
    },
  )

  it('keeps the validation-code-to-input mapping complete and deterministic', () => {
    expect(IMAGE_READER_SETTINGS_FIELD_BY_CODE).toEqual({
      IMAGE_READER_PROFILE_ID_FORMAT_INVALID: 'profile',
      IMAGE_READER_PROFILE_ALREADY_EXISTS: 'profile',
      IMAGE_READER_PROFILE_UPDATE_TARGET_NOT_FOUND: 'profile',
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
      'IMAGE_READER_PROFILE_ACTIVATION_TARGET_NOT_FOUND',
      'IMAGE_READER_PROFILE_NOT_FOUND',
      'IMAGE_READER_LAST_PROFILE_DELETE_FORBIDDEN',
      'IMAGE_READER_SETTINGS_ACTIVATE_FAILED',
      'IMAGE_READER_PROMPT_REQUIRED',
      'IMAGE_READER_PROMPT_TOO_LONG',
    ]) {
      expect(imageReaderSettingsErrorMessage({ code })).toContain(`${code}：`)
    }
  })

  it('creates an OpenAI-compatible profile, marks it active, and submits its API Key as write-only data', async () => {
    const saveProfile = vi.fn(async (request: any) => ({
      configuration: {
        activeProfileId: request.activateProfileId,
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
      operation: 'create',
      activateProfileId: expect.stringMatching(/^profile_/),
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
    expect(JSON.stringify(renderer.toJSON())).toContain('配置“本地 Qwen”已保存并生效。')
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
      activateProfile: vi.fn(async (request: any) => ({
        configuration: Object.freeze({ ...configuration, activeProfileId: request.profileId }),
      })),
      saveProfile: vi.fn(async (request: any) => ({
        configuration: {
          activeProfileId: request.activateProfileId,
          profiles: request.profile.id === runtimeProfile.id
            ? [{ ...request.profile, endpoint: '', hasApiKey: false }, custom]
            : [runtimeProfile, { ...request.profile, endpoint: '', hasApiKey: false }],
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
      await Promise.resolve()
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
      operation: 'update',
      activateProfileId: 'custom',
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
    expect(JSON.stringify(renderer.toJSON())).toContain('配置“待删除配置”已删除，配置“系统视觉”现在生效。下一次图片读取将使用配置“系统视觉”。')
    renderer.unmount()
  })

  it('names the deleted draft source while an externally activated profile remains active', async () => {
    const profileB = Object.freeze({
      ...createImageReaderProfile('profile-b', '配置 B'),
      provider: 'provider-a',
      model: 'vision-a',
    })
    const initial = Object.freeze({
      activeProfileId: runtimeProfile.id,
      profiles: Object.freeze([runtimeProfile, profileB]),
    })
    const scope = mutableSettingsScope(initial)
    const deleteProfile = vi.fn(async () => ({
      configuration: Object.freeze({ activeProfileId: profileB.id, profiles: Object.freeze([profileB]) }),
    }))
    const api = { models: vi.fn(async () => modelCatalog), saveProfile: vi.fn(), activateProfile: vi.fn(), deleteProfile }
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(ImageReaderSettingsPage, { scope, api } as never))
      await Promise.resolve()
    })
    await act(async () => {
      ;(inputByType(renderer, 'text', 0).props.onChange as (event: unknown) => void)({ target: { value: '配置 A 草稿' } })
      scope.replace(Object.freeze({ ...initial, activeProfileId: profileB.id }))
    })
    await act(async () => {
      ;(buttonByText(renderer, '删除配置').props.onClick as () => void)()
    })
    await act(async () => {
      ;(buttonByText(renderer, '放弃配置“配置 A 草稿”的未保存修改并删除配置“配置 A 草稿”').props.onClick as () => void)()
      await Promise.resolve()
    })

    expect(deleteProfile).toHaveBeenCalledWith({ profileId: runtimeProfile.id }, expect.any(AbortSignal))
    expect(JSON.stringify(renderer.toJSON())).toContain('配置“系统视觉”已删除。图片读取继续使用当前生效配置“配置 B”。')
    renderer.unmount()
  })

  it('does not resurrect a discarded draft when switching profiles is cancelled', async () => {
    const profileB = Object.freeze({
      ...createImageReaderProfile('profile-b', '配置 B'),
      provider: 'provider-a',
      model: 'vision-a',
    })
    const configuration = Object.freeze({
      activeProfileId: runtimeProfile.id,
      profiles: Object.freeze([runtimeProfile, profileB]),
    })
    const api = {
      models: vi.fn(async () => modelCatalog),
      saveProfile: vi.fn(),
      activateProfile: vi.fn(async () => { throw new DOMException('cancelled', 'AbortError') }),
      deleteProfile: vi.fn(),
    }
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(ImageReaderSettingsPage, { scope: settingsScope(configuration), api } as never))
      await Promise.resolve()
    })
    await act(async () => {
      ;(inputByType(renderer, 'text', 0).props.onChange as (event: unknown) => void)({ target: { value: '不应恢复的配置 A 草稿' } })
    })
    await act(async () => {
      ;(renderer.root.findAllByType('select')[0]!.props.onChange as (event: unknown) => void)({ target: { value: profileB.id } })
    })
    await act(async () => {
      ;(buttonByText(renderer, '放弃当前修改并切换').props.onClick as () => void)()
      await Promise.resolve()
    })

    expect(inputByType(renderer, 'text', 0).props.value).toBe('系统视觉')
    expect(JSON.stringify(renderer.toJSON())).toContain('配置“不应恢复的配置 A 草稿”的未保存修改已按使用者选择放弃')
    expect(JSON.stringify(renderer.toJSON())).toContain('请重新选择配置“配置 B”')
    renderer.unmount()
  })

  it('keeps a saved-profile draft until the user confirms deletion and never resurrects it after cancellation', async () => {
    const profileB = Object.freeze({
      ...createImageReaderProfile('profile-b', '配置 B'),
      provider: 'provider-a',
      model: 'vision-a',
    })
    const configuration = Object.freeze({
      activeProfileId: runtimeProfile.id,
      profiles: Object.freeze([runtimeProfile, profileB]),
    })
    const deleteProfile = vi.fn(async () => { throw new DOMException('cancelled', 'AbortError') })
    const api = { models: vi.fn(async () => modelCatalog), saveProfile: vi.fn(), activateProfile: vi.fn(), deleteProfile }
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(ImageReaderSettingsPage, { scope: settingsScope(configuration), api } as never))
      await Promise.resolve()
    })
    await act(async () => {
      ;(inputByType(renderer, 'text', 0).props.onChange as (event: unknown) => void)({ target: { value: '不应恢复的待删除草稿' } })
    })
    await act(async () => {
      ;(buttonByText(renderer, '删除配置').props.onClick as () => void)()
    })
    expect(deleteProfile).not.toHaveBeenCalled()
    expect(JSON.stringify(renderer.toJSON())).toContain('删除该配置前必须明确放弃修改')

    await act(async () => {
      ;(buttonByText(renderer, '放弃配置“不应恢复的待删除草稿”的未保存修改并删除配置“不应恢复的待删除草稿”').props.onClick as () => void)()
      await Promise.resolve()
    })
    expect(deleteProfile).toHaveBeenCalledWith({ profileId: runtimeProfile.id }, expect.any(AbortSignal))
    expect(inputByType(renderer, 'text', 0).props.value).toBe('系统视觉')
    expect(JSON.stringify(renderer.toJSON())).not.toContain('不应恢复的待删除草稿')
    expect(JSON.stringify(renderer.toJSON())).toContain('未保存修改已按使用者选择放弃，该配置没有被删除')
    renderer.unmount()
  })

  it('retains a dirty profile and its pending switch target when save is cancelled', async () => {
    const profileB = Object.freeze({
      ...createImageReaderProfile('profile-b', '配置 B'),
      provider: 'provider-a',
      model: 'vision-a',
    })
    const configuration = Object.freeze({
      activeProfileId: runtimeProfile.id,
      profiles: Object.freeze([runtimeProfile, profileB]),
    })
    const saveProfile = vi.fn(async () => { throw new DOMException('cancelled', 'AbortError') })
    const api = { models: vi.fn(async () => modelCatalog), saveProfile, activateProfile: vi.fn(), deleteProfile: vi.fn() }
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(ImageReaderSettingsPage, { scope: settingsScope(configuration), api } as never))
      await Promise.resolve()
    })
    await act(async () => {
      ;(inputByType(renderer, 'text', 0).props.onChange as (event: unknown) => void)({ target: { value: '配置 A 草稿' } })
    })
    await act(async () => {
      ;(renderer.root.findAllByType('select')[0]!.props.onChange as (event: unknown) => void)({ target: { value: profileB.id } })
    })
    await act(async () => {
      ;(buttonByText(renderer, '保存配置“配置 A 草稿”并切换到配置“配置 B”').props.onClick as () => void)()
      await Promise.resolve()
    })

    expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'update',
      activateProfileId: profileB.id,
      profile: expect.objectContaining({ name: '配置 A 草稿' }),
    }), expect.any(AbortSignal))
    expect(inputByType(renderer, 'text', 0).props.value).toBe('配置 A 草稿')
    expect(JSON.stringify(renderer.toJSON())).toContain('配置“配置 A 草稿”的保存请求已取消')
    expect(JSON.stringify(renderer.toJSON())).toContain('保存配置“配置 A 草稿”并切换到配置“配置 B”')
    renderer.unmount()
  })

  it('retains the draft and names a switch target that disappeared before save', async () => {
    const profileB = Object.freeze({
      ...createImageReaderProfile('profile-b', '配置 B'),
      provider: 'provider-a',
      model: 'vision-a',
    })
    const configuration = Object.freeze({
      activeProfileId: runtimeProfile.id,
      profiles: Object.freeze([runtimeProfile, profileB]),
    })
    const saveProfile = vi.fn(async () => {
      throw new ImageReaderSettingsError(
        'IMAGE_READER_PROFILE_ACTIVATION_TARGET_NOT_FOUND',
        'activation target missing',
      )
    })
    const api = { models: vi.fn(async () => modelCatalog), saveProfile, activateProfile: vi.fn(), deleteProfile: vi.fn() }
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(ImageReaderSettingsPage, { scope: settingsScope(configuration), api } as never))
      await Promise.resolve()
    })
    await act(async () => {
      ;(inputByType(renderer, 'text', 0).props.onChange as (event: unknown) => void)({ target: { value: '配置 A 草稿' } })
    })
    await act(async () => {
      ;(renderer.root.findAllByType('select')[0]!.props.onChange as (event: unknown) => void)({ target: { value: profileB.id } })
    })
    await act(async () => {
      ;(buttonByText(renderer, '保存配置“配置 A 草稿”并切换到配置“配置 B”').props.onClick as () => void)()
      await Promise.resolve()
    })

    expect(inputByType(renderer, 'text', 0).props.value).toBe('配置 A 草稿')
    expect(JSON.stringify(renderer.toJSON())).toContain('目标配置“配置 B”已被其他设置操作删除，无法完成切换')
    expect(JSON.stringify(renderer.toJSON())).toContain('配置“配置 A 草稿”的未保存修改仍然保留')
    renderer.unmount()
  })

  it('discards ordinary persisted edits locally and lets a deletion gate continue editing', async () => {
    const profileB = Object.freeze({
      ...createImageReaderProfile('profile-b', '配置 B'),
      provider: 'provider-a',
      model: 'vision-a',
    })
    const configuration = Object.freeze({
      activeProfileId: runtimeProfile.id,
      profiles: Object.freeze([runtimeProfile, profileB]),
    })
    const api = { models: vi.fn(async () => modelCatalog), saveProfile: vi.fn(), activateProfile: vi.fn(), deleteProfile: vi.fn() }
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(ImageReaderSettingsPage, { scope: settingsScope(configuration), api } as never))
      await Promise.resolve()
    })
    await act(async () => {
      ;(inputByType(renderer, 'text', 0).props.onChange as (event: unknown) => void)({ target: { value: '普通待放弃草稿' } })
    })
    await act(async () => {
      ;(buttonByText(renderer, '放弃配置“普通待放弃草稿”的未保存修改').props.onClick as () => void)()
    })
    expect(inputByType(renderer, 'text', 0).props.value).toBe('系统视觉')

    await act(async () => {
      ;(inputByType(renderer, 'text', 0).props.onChange as (event: unknown) => void)({ target: { value: '继续编辑的草稿' } })
    })
    await act(async () => {
      ;(buttonByText(renderer, '删除配置').props.onClick as () => void)()
    })
    await act(async () => {
      ;(buttonByText(renderer, '继续编辑配置“继续编辑的草稿”').props.onClick as () => void)()
    })
    expect(inputByType(renderer, 'text', 0).props.value).toBe('继续编辑的草稿')
    expect(JSON.stringify(renderer.toJSON())).not.toContain('删除该配置前必须明确放弃修改')
    expect(api.deleteProfile).not.toHaveBeenCalled()
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
      const expectedMessageToken = code === 'IMAGE_READER_PROFILE_UPDATE_TARGET_NOT_FOUND'
        ? '已被其他设置操作删除'
        : code
      expect(fieldAlerts).toHaveLength(1)
      expect(fieldAlerts[0]!.props['data-image-reader-error-field']).toBe(field)
      expect(String(fieldAlerts[0]!.props.children)).toContain(expectedMessageToken)
      const summaryAlerts = renderer.root.findAllByType('span').filter(node => node.props.role === 'alert')
      expect(summaryAlerts).toHaveLength(1)
      expect(String(summaryAlerts[0]!.props.children)).toContain(expectedMessageToken)
      const rendered = JSON.stringify(renderer.toJSON())
      expect(rendered.match(new RegExp(expectedMessageToken, 'gu'))).toHaveLength(2)
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
      activateProfile: vi.fn(async (request: any) => ({
        configuration: Object.freeze({ ...configuration, activeProfileId: request.profileId }),
      })),
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
    expect(JSON.stringify(renderer.toJSON())).toContain('配置“”有未保存修改')

    await act(async () => {
      ;(buttonByText(renderer, '放弃当前修改并切换').props.onClick as () => void)()
      await Promise.resolve()
    })
    await act(async () => {
      ;(renderer.root.findAllByType('select')[0]!.props.onChange as (event: unknown) => void)({ target: { value: 'custom' } })
      await Promise.resolve()
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
        activeProfileId: request.activateProfileId,
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
    expect(JSON.stringify(renderer.toJSON())).toContain('配置“已修改系统视觉”有未保存修改')

    await act(async () => {
      ;(buttonByText(renderer, '继续编辑当前配置').props.onClick as () => void)()
    })
    expect(JSON.stringify(renderer.toJSON())).not.toContain('请选择保存修改、放弃修改或继续编辑')
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
    expect(saveProfile.mock.calls[0]![0]).toMatchObject({ operation: 'update', activateProfileId: 'custom' })
    expect(JSON.stringify(renderer.toJSON())).not.toContain('请选择保存修改、放弃修改或继续编辑')
    expect(inputByType(renderer, 'text', 0).props.value).toBe('另一份系统视觉')
    renderer.unmount()
  })

  it('renders loading, unavailable, read-only, and writable settings states', async () => {
    const api = { models: vi.fn(async () => modelCatalog), saveProfile: vi.fn(), deleteProfile: vi.fn() }
    const cases = [
      { scope: settingsScope(runtimeConfiguration, { status: 'loading' }), text: '正在读取图片读取设置', disabled: true },
      { scope: settingsScope(runtimeConfiguration, { status: 'unavailable' }), text: '当前 Harness 环境没有提供可写的图片读取设置', disabled: true },
      { scope: settingsScope(runtimeConfiguration, { writable: false }), text: '当前图片读取设置为只读；当前配置的修改不能保存', disabled: true },
      { scope: settingsScope(runtimeConfiguration), text: '保存配置“系统视觉”', disabled: false },
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

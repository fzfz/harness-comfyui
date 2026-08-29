import { useEffect, useState, useSyncExternalStore } from 'react'

import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { SettingsSectionOwnerProps } from '@deepseek-ai/dsh-client-ui-settings/client'

import errorCatalog from '../../../config/error-catalog.json' with { type: 'json' }

import type {
  ImageReaderCredentialUpdate,
  ImageReaderModelCatalog,
  ImageReaderModelOption,
  SaveImageReaderSettingsRequest,
  SaveImageReaderSettingsResult,
} from '../../image-reader/contract.ts'
import {
  IMAGE_READER_DEFAULT_CONFIGURATION,
  IMAGE_READER_MAX_PROFILES,
  activeImageReaderProfile,
  createImageReaderProfile,
  validateImageReaderConfiguration,
  type ImageReaderConfiguration,
  type ImageReaderProfile,
  type ImageReaderSettingsView,
} from '../../image-reader/settings.ts'

export class ImageReaderSettingsError extends Error {
  readonly code: string

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ImageReaderSettingsError'
    this.code = code
  }
}

export interface ImageReaderSettingsApi {
  readonly models: (signal: AbortSignal) => Promise<ImageReaderModelCatalog>
  readonly saveSettings: (
    request: SaveImageReaderSettingsRequest,
    signal: AbortSignal,
  ) => Promise<SaveImageReaderSettingsResult>
}

export interface ImageReaderSettingsPageProps extends SettingsSectionOwnerProps {
  readonly scope: SettingsScope<ImageReaderSettingsView>
  readonly api: ImageReaderSettingsApi
}

export function modelsForProvider(
  catalog: ImageReaderModelCatalog | null,
  provider: string,
): readonly ImageReaderModelOption[] {
  return catalog?.groups.find(group => group.provider === provider)?.models ?? []
}

export async function saveImageReaderSettings(
  api: Pick<ImageReaderSettingsApi, 'saveSettings'>,
  configuration: ImageReaderConfiguration,
  credentialUpdates: readonly ImageReaderCredentialUpdate[],
  signal: AbortSignal,
): Promise<SaveImageReaderSettingsResult> {
  try {
    validateImageReaderConfiguration(configuration)
  } catch (error) {
    throw new ImageReaderSettingsError(
      'IMAGE_READER_SETTINGS_INVALID',
      '请完整填写每份配置的名称、连接方式、视觉模型、默认提示词、温度和最大输出 Token 数。系统 Provider 配置还需要选择 Provider；OpenAI 兼容配置还需要填写完整的 Chat Completions 地址。',
      { cause: error },
    )
  }
  return api.saveSettings(Object.freeze({ configuration, credentialUpdates }), signal)
}

export function imageReaderSettingsErrorMessage(error: unknown): string {
  const code = error instanceof ImageReaderSettingsError
    ? error.code
    : typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'IMAGE_READER_SETTINGS_REQUEST_FAILED'
  const entry = errorCatalog[code as keyof typeof errorCatalog]
    ?? errorCatalog.IMAGE_READER_SETTINGS_REQUEST_FAILED
  return `${entry.code}：${entry.reason}${entry.next_step}`
}

export function endpointTransportMessage(endpoint: string): string | null {
  let protocol: string
  try {
    protocol = new URL(endpoint).protocol
  } catch {
    return null
  }
  if (protocol === 'http:') {
    return '当前 HTTP 地址不会加密 API Key 与图片内容；使用者必须确认目标内网链路符合部署要求。'
  }
  if (protocol === 'https:') {
    return '当前 HTTPS 地址将通过 TLS 传输 API Key 与图片内容。'
  }
  return null
}

function profileId(): string {
  return `profile_${globalThis.crypto.randomUUID().replaceAll('-', '')}`
}

function replaceProfile(
  configuration: ImageReaderConfiguration,
  update: (profile: ImageReaderProfile) => ImageReaderProfile,
): ImageReaderConfiguration {
  return Object.freeze({
    ...configuration,
    profiles: Object.freeze(configuration.profiles.map(profile => (
      profile.id === configuration.activeProfileId ? Object.freeze(update(profile)) : profile
    ))),
  })
}

export function ImageReaderSettingsPage({ scope, api }: ImageReaderSettingsPageProps) {
  const settings = useSyncExternalStore(
    listener => scope.subscribe(listener),
    () => scope.getSnapshot(),
  )
  const [draft, setDraft] = useState<ImageReaderConfiguration>(
    settings.value?.configuration ?? IMAGE_READER_DEFAULT_CONFIGURATION,
  )
  const [credentialUpdates, setCredentialUpdates] = useState<Readonly<Record<string, string | null>>>({})
  const [modelCatalog, setModelCatalog] = useState<ImageReaderModelCatalog | null>(null)
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [catalogVersion, setCatalogVersion] = useState(0)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (settings.status === 'ready' && settings.value !== undefined) {
      setDraft(settings.value.configuration)
      setCredentialUpdates({})
    }
  }, [settings])

  useEffect(() => {
    const controller = new AbortController()
    setCatalogStatus('loading')
    setCatalogError(null)
    void api.models(controller.signal).then(value => {
      if (controller.signal.aborted) return
      setModelCatalog(value)
      setCatalogStatus('ready')
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      setModelCatalog(null)
      setCatalogError(imageReaderSettingsErrorMessage(error))
      setCatalogStatus('error')
    })
    return () => controller.abort()
  }, [api, catalogVersion])

  const activeProfile = activeImageReaderProfile(draft)
  const availableModels = modelsForProvider(modelCatalog, activeProfile.provider)
  const currentModelIsMissing = activeProfile.connectionType === 'runtime'
    && activeProfile.model.length > 0
    && !availableModels.some(model => model.id === activeProfile.model)
  const writable = settings.status === 'ready' && settings.writable
  const markChanged = () => {
    setSaveStatus('idle')
    setSaveError(null)
  }
  const updateDraft = (update: (current: ImageReaderConfiguration) => ImageReaderConfiguration) => {
    setDraft(update)
    markChanged()
  }
  const updateActiveProfile = (update: (profile: ImageReaderProfile) => ImageReaderProfile) => {
    updateDraft(current => replaceProfile(current, update))
  }
  const selectProfile = (id: string) => {
    updateDraft(current => Object.freeze({ ...current, activeProfileId: id }))
  }
  const addProfile = () => {
    const id = profileId()
    const next = createImageReaderProfile(id, `图片读取配置 ${draft.profiles.length + 1}`)
    updateDraft(current => Object.freeze({
      activeProfileId: id,
      profiles: Object.freeze([...current.profiles, next]),
    }))
  }
  const duplicateProfile = () => {
    const id = profileId()
    const next = Object.freeze({ ...activeProfile, id, name: `${activeProfile.name} 副本`, hasApiKey: false })
    updateDraft(current => Object.freeze({
      activeProfileId: id,
      profiles: Object.freeze([...current.profiles, next]),
    }))
  }
  const deleteProfile = () => {
    if (draft.profiles.length === 1) return
    const index = draft.profiles.findIndex(profile => profile.id === activeProfile.id)
    const profiles = draft.profiles.filter(profile => profile.id !== activeProfile.id)
    const nextActive = profiles[Math.min(index, profiles.length - 1)]!
    setCredentialUpdates(current => {
      const { [activeProfile.id]: _removed, ...remaining } = current
      return remaining
    })
    updateDraft(() => Object.freeze({ activeProfileId: nextActive.id, profiles: Object.freeze(profiles) }))
  }
  const updateCredential = (value: string | null | undefined) => {
    setCredentialUpdates(current => {
      if (value === undefined) {
        const { [activeProfile.id]: _removed, ...remaining } = current
        return remaining
      }
      return Object.freeze({ ...current, [activeProfile.id]: value })
    })
    markChanged()
  }
  const save = async () => {
    const controller = new AbortController()
    setSaveStatus('saving')
    setSaveError(null)
    try {
      const result = await saveImageReaderSettings(
        api,
        draft,
        Object.entries(credentialUpdates).map(([profileId, apiKey]) => Object.freeze({ profileId, apiKey })),
        controller.signal,
      )
      setDraft(result.configuration)
      setCredentialUpdates({})
      setSaveStatus('saved')
    } catch (error) {
      setSaveError(imageReaderSettingsErrorMessage(error))
      setSaveStatus('error')
    }
  }

  const credentialDraft = credentialUpdates[activeProfile.id]
  const credentialState = credentialDraft === null
    ? '保存后清除已保存的 API Key。'
    : typeof credentialDraft === 'string'
      ? activeProfile.hasApiKey
        ? '保存后替换这份配置的 API Key。'
        : '保存后首次设置这份配置的 API Key。'
      : activeProfile.hasApiKey
        ? '这份配置已经保存 API Key；留空不会修改。'
        : '这份配置没有保存 API Key；本地免鉴权接口可以留空。'

  return (
    <section className="harness-comfyui-image-reader-settings" aria-labelledby="harness-comfyui-image-reader-title">
      <header className="harness-comfyui-image-reader-header">
        <div>
          <h2 id="harness-comfyui-image-reader-title">图片读取</h2>
          <p>保存多份独立读图配置，并切换 inspect_image 当前使用的配置。图片读取不会跟随当前会话或生图模型。</p>
        </div>
        <button type="button" onClick={() => setCatalogVersion(value => value + 1)} disabled={catalogStatus === 'loading'}>
          {catalogStatus === 'loading' ? '正在读取模型…' : '刷新系统模型'}
        </button>
      </header>

      {settings.status === 'loading' ? <p role="status">正在读取图片读取设置…</p> : null}
      {settings.status === 'unavailable' ? <p role="alert">当前 Harness 环境没有提供可写的图片读取设置。</p> : null}
      {settings.status === 'ready' && !settings.writable ? <p role="alert">当前图片读取设置为只读；页面中的草稿不能保存。</p> : null}
      {catalogStatus === 'error' ? <p role="alert">系统模型目录读取失败：{catalogError} 请点击“刷新系统模型”重试。OpenAI 兼容配置仍可编辑。</p> : null}
      {modelCatalog?.failures.map(failure => (
        <p role="status" key={failure.provider}>
          无法读取 {failure.provider} 的系统模型目录。{imageReaderSettingsErrorMessage(undefined)} 请点击“刷新系统模型”重试；其他已加载 Provider 仍可选择。
        </p>
      ))}

      <div className="harness-comfyui-image-reader-profile-bar">
        <label>
          <span>当前使用的配置</span>
          <select value={draft.activeProfileId} onChange={event => selectProfile(event.target.value)}>
            {draft.profiles.map(profile => (
              <option key={profile.id} value={profile.id}>{profile.name}</option>
            ))}
          </select>
          <small>切换后点击“保存全部配置”，下一次 inspect_image 调用会使用所选配置。</small>
        </label>
        <div className="harness-comfyui-image-reader-profile-actions">
          <button type="button" onClick={addProfile} disabled={draft.profiles.length >= IMAGE_READER_MAX_PROFILES}>新建配置</button>
          <button type="button" onClick={duplicateProfile} disabled={draft.profiles.length >= IMAGE_READER_MAX_PROFILES}>复制配置</button>
          <button type="button" onClick={deleteProfile} disabled={draft.profiles.length === 1}>删除配置</button>
        </div>
        <small>复制配置会复制连接参数、模型、提示词和采样参数，但不会复制 API Key。</small>
      </div>

      <div className="harness-comfyui-image-reader-form">
        <label className="harness-comfyui-image-reader-wide-field">
          <span>配置名称</span>
          <input
            type="text"
            maxLength={80}
            value={activeProfile.name}
            onChange={event => updateActiveProfile(profile => ({ ...profile, name: event.target.value }))}
          />
        </label>

        <fieldset className="harness-comfyui-image-reader-connection">
          <legend>连接方式</legend>
          <label>
            <input
              type="radio"
              name="image-reader-connection"
              checked={activeProfile.connectionType === 'runtime'}
              onChange={() => updateActiveProfile(profile => ({
                ...profile,
                connectionType: 'runtime',
                endpoint: '',
                hasApiKey: false,
                model: '',
              }))}
            />
            <span><strong>系统 Provider</strong><small>从当前 Harness LLM 运行时选择明确支持图片输入的模型。</small></span>
          </label>
          <label>
            <input
              type="radio"
              name="image-reader-connection"
              checked={activeProfile.connectionType === 'openai-compatible'}
              onChange={() => updateActiveProfile(profile => ({
                ...profile,
                connectionType: 'openai-compatible',
                provider: '',
                model: '',
              }))}
            />
            <span><strong>OpenAI 兼容接口</strong><small>向自定义 Chat Completions 地址发送单张本地图片和读图提示词。</small></span>
          </label>
        </fieldset>

        {activeProfile.connectionType === 'runtime' ? (
          <>
            <label>
              <span>系统 Provider</span>
              <select
                value={activeProfile.provider}
                onChange={event => updateActiveProfile(profile => ({ ...profile, provider: event.target.value, model: '' }))}
                disabled={catalogStatus !== 'ready'}
              >
                <option value="">请选择系统 Provider</option>
                {modelCatalog?.groups.map(group => <option key={group.provider} value={group.provider}>{group.name}</option>)}
              </select>
            </label>

            <label>
              <span>视觉模型</span>
              <select
                value={activeProfile.model}
                onChange={event => updateActiveProfile(profile => ({ ...profile, model: event.target.value }))}
                disabled={activeProfile.provider.length === 0 || (availableModels.length === 0 && !currentModelIsMissing)}
              >
                <option value="">请选择明确支持图片输入的模型</option>
                {currentModelIsMissing ? <option value={activeProfile.model}>{activeProfile.model}（当前目录中不可用）</option> : null}
                {availableModels.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
              </select>
            </label>
          </>
        ) : (
          <>
            <label className="harness-comfyui-image-reader-wide-field">
              <span>Chat Completions 地址</span>
              <input
                type="url"
                placeholder="http://127.0.0.1:11434/v1/chat/completions"
                value={activeProfile.endpoint}
                onChange={event => updateActiveProfile(profile => ({ ...profile, endpoint: event.target.value }))}
              />
              <small>填写接受 POST 请求的完整地址；Harness 不会自动追加 /v1/chat/completions。</small>
              {endpointTransportMessage(activeProfile.endpoint) === null ? null : (
                <small role="status">{endpointTransportMessage(activeProfile.endpoint)}</small>
              )}
            </label>

            <label>
              <span>模型 ID</span>
              <input
                type="text"
                placeholder="请输入接口接受的精确模型 ID"
                value={activeProfile.model}
                onChange={event => updateActiveProfile(profile => ({ ...profile, model: event.target.value }))}
              />
            </label>

            <label>
              <span>API Key（可选）</span>
              <input
                type="password"
                autoComplete="new-password"
                placeholder={activeProfile.hasApiKey ? '已保存；输入新值可以替换' : '本地免鉴权接口可以留空'}
                value={typeof credentialDraft === 'string' ? credentialDraft : ''}
                onChange={event => updateCredential(event.target.value.length > 0 ? event.target.value : undefined)}
              />
              <small>{credentialState}</small>
              {activeProfile.hasApiKey && credentialDraft !== null ? (
                <button type="button" className="harness-comfyui-image-reader-inline-action" onClick={() => updateCredential(null)}>清除已保存的 API Key</button>
              ) : null}
              {credentialDraft === null ? (
                <button type="button" className="harness-comfyui-image-reader-inline-action" onClick={() => updateCredential(undefined)}>保留已保存的 API Key</button>
              ) : null}
            </label>
          </>
        )}

        <label className="harness-comfyui-image-reader-wide-field">
          <span>默认读图提示词</span>
          <textarea
            rows={18}
            value={activeProfile.defaultPrompt}
            onChange={event => updateActiveProfile(profile => ({ ...profile, defaultPrompt: event.target.value }))}
          />
          <small>inspect_image 没有传入单次 prompt 时使用。该提示词只负责读取一张图片，不负责 Generation Prompt 对比或改写。</small>
        </label>

        <label>
          <span>温度</span>
          <input
            type="number"
            min={0}
            max={2}
            step={0.05}
            value={activeProfile.temperature}
            onChange={event => updateActiveProfile(profile => ({ ...profile, temperature: Number(event.target.value) }))}
          />
        </label>

        <label>
          <span>最大输出 Token 数</span>
          <input
            type="number"
            min={1}
            max={32768}
            step={1}
            value={activeProfile.maxTokens}
            onChange={event => updateActiveProfile(profile => ({ ...profile, maxTokens: Number(event.target.value) }))}
          />
        </label>
      </div>

      <footer className="harness-comfyui-image-reader-actions">
        <button type="button" onClick={() => void save()} disabled={!writable || saveStatus === 'saving'}>
          {saveStatus === 'saving' ? '正在保存…' : '保存全部配置'}
        </button>
        {saveStatus === 'saved' ? <span role="status">图片读取配置已保存，当前配置已经生效。</span> : null}
        {saveStatus === 'error' ? <span role="alert">保存失败：{saveError}</span> : null}
      </footer>
    </section>
  )
}

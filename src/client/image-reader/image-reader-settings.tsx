import { useEffect, useState, useSyncExternalStore } from 'react'

import type { SettingsSectionOwnerProps } from '@deepseek-ai/dsh-client-ui-settings/client'

import errorCatalog from '../../../config/error-catalog.json' with { type: 'json' }

import type {
  DeleteImageReaderProfileRequest,
  DeleteImageReaderProfileResult,
  ImageReaderCredentialAction,
  ImageReaderModelCatalog,
  ImageReaderModelOption,
  SaveImageReaderProfileRequest,
  SaveImageReaderProfileResult,
} from '../../image-reader/contract.ts'
import {
  IMAGE_READER_SETTINGS_FIELD_BY_CODE,
  ImageReaderProfileValidationError,
  validateSaveImageReaderProfileRequest,
  type ImageReaderSettingsField,
} from '../../image-reader/settings-errors.ts'
import {
  IMAGE_READER_ENDPOINT_MAX_LENGTH,
  IMAGE_READER_DEFAULT_CONFIGURATION,
  IMAGE_READER_MAX_PROFILES,
  IMAGE_READER_MAX_TOKENS_MAX,
  IMAGE_READER_MAX_TOKENS_MIN,
  IMAGE_READER_MODEL_MAX_LENGTH,
  IMAGE_READER_PROFILE_NAME_MAX_LENGTH,
  IMAGE_READER_PROMPT_MAX_LENGTH,
  IMAGE_READER_PROVIDER_MAX_LENGTH,
  IMAGE_READER_TEMPERATURE_MAX,
  IMAGE_READER_TEMPERATURE_MIN,
  activeImageReaderProfile,
  createImageReaderProfile,
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
  readonly saveProfile: (
    request: SaveImageReaderProfileRequest,
    signal: AbortSignal,
  ) => Promise<SaveImageReaderProfileResult>
  readonly deleteProfile: (
    request: DeleteImageReaderProfileRequest,
    signal: AbortSignal,
  ) => Promise<DeleteImageReaderProfileResult>
}

interface SettingsScope<T> {
  readonly getSnapshot: () => {
    readonly status: 'loading' | 'ready' | 'unavailable'
    readonly value?: T
    readonly writable: boolean
  }
  readonly subscribe: (listener: () => void) => () => void
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

function saveRequest(
  profile: ImageReaderProfile,
  credential: ImageReaderCredentialAction,
): SaveImageReaderProfileRequest {
  const common = {
    id: profile.id,
    name: profile.name,
    model: profile.model,
    defaultPrompt: profile.defaultPrompt,
    temperature: profile.temperature,
    maxTokens: profile.maxTokens,
  }
  if (profile.connectionType === 'runtime') {
    return Object.freeze({
      profile: Object.freeze({ ...common, connectionType: 'runtime', provider: profile.provider }),
    })
  }
  return Object.freeze({
    profile: Object.freeze({ ...common, connectionType: 'openai-compatible', endpoint: profile.endpoint }),
    credential,
  })
}

export async function saveImageReaderProfile(
  api: Pick<ImageReaderSettingsApi, 'saveProfile'>,
  profile: ImageReaderProfile,
  credential: ImageReaderCredentialAction,
  persistedConfiguration: ImageReaderConfiguration,
  signal: AbortSignal,
): Promise<SaveImageReaderProfileResult> {
  const request = saveRequest(profile, credential)
  try {
    validateSaveImageReaderProfileRequest(request, {
      persistedProfileCount: persistedConfiguration.profiles.length,
      profileExists: persistedConfiguration.profiles.some(candidate => candidate.id === profile.id),
    })
  } catch (error) {
    if (error instanceof ImageReaderProfileValidationError) {
      throw new ImageReaderSettingsError(error.code, error.code, { cause: error })
    }
    throw new ImageReaderSettingsError(
      'IMAGE_READER_SETTINGS_REQUEST_FAILED',
      'The current image reader profile could not be validated.',
      { cause: error },
    )
  }
  return api.saveProfile(request, signal)
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

function savedProfile(configuration: ImageReaderConfiguration, id: string): ImageReaderProfile {
  const profile = configuration.profiles.find(candidate => candidate.id === id)
  if (profile === undefined) throw new TypeError(`Image reader profile "${id}" does not exist.`)
  return Object.freeze({ ...profile })
}

function initialCredentialAction(profile: ImageReaderProfile): ImageReaderCredentialAction {
  return profile.connectionType === 'openai-compatible'
    ? Object.freeze({ action: 'keep' })
    : Object.freeze({ action: 'clear' })
}

function settingsErrorCode(error: unknown): string {
  return error instanceof ImageReaderSettingsError
    ? error.code
    : typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'IMAGE_READER_SETTINGS_REQUEST_FAILED'
}

export function ImageReaderSettingsPage({ scope, api }: ImageReaderSettingsPageProps) {
  const settings = useSyncExternalStore(
    listener => scope.subscribe(listener),
    () => scope.getSnapshot(),
  )
  const initialConfiguration = settings.value?.configuration ?? IMAGE_READER_DEFAULT_CONFIGURATION
  const [persistedConfiguration, setPersistedConfiguration] = useState<ImageReaderConfiguration>(initialConfiguration)
  const [activeProfile, setActiveProfile] = useState<ImageReaderProfile>(activeImageReaderProfile(initialConfiguration))
  const [credentialAction, setCredentialAction] = useState<ImageReaderCredentialAction>(
    initialCredentialAction(activeImageReaderProfile(initialConfiguration)),
  )
  const [dirty, setDirty] = useState(false)
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null)
  const [newProfileReturnId, setNewProfileReturnId] = useState(initialConfiguration.activeProfileId)
  const [modelCatalog, setModelCatalog] = useState<ImageReaderModelCatalog | null>(null)
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [catalogVersion, setCatalogVersion] = useState(0)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [pendingOperation, setPendingOperation] = useState<'save' | 'delete' | null>(null)
  const [failedOperation, setFailedOperation] = useState<'save' | 'delete' | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveErrorCode, setSaveErrorCode] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    if (settings.status === 'ready') {
      const configuration = settings.value?.configuration ?? IMAGE_READER_DEFAULT_CONFIGURATION
      const profile = activeImageReaderProfile(configuration)
      setPersistedConfiguration(configuration)
      setActiveProfile(savedProfile(configuration, profile.id))
      setCredentialAction(initialCredentialAction(profile))
      setDirty(false)
      setPendingProfileId(null)
      setNewProfileReturnId(configuration.activeProfileId)
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

  const availableModels = modelsForProvider(modelCatalog, activeProfile.provider)
  const currentModelIsMissing = activeProfile.connectionType === 'runtime'
    && activeProfile.model.length > 0
    && !availableModels.some(model => model.id === activeProfile.model)
  const writable = settings.status === 'ready' && settings.writable
  const currentProfileIsPersisted = persistedConfiguration.profiles.some(profile => profile.id === activeProfile.id)
  const profileOptions = currentProfileIsPersisted
    ? persistedConfiguration.profiles
    : Object.freeze([...persistedConfiguration.profiles, activeProfile])
  const resetMessages = () => {
    setSaveStatus('idle')
    setSaveError(null)
    setSaveErrorCode(null)
    setSuccessMessage(null)
    setFailedOperation(null)
  }
  const updateActiveProfile = (update: (profile: ImageReaderProfile) => ImageReaderProfile) => {
    setActiveProfile(current => Object.freeze(update(current)))
    setDirty(true)
    resetMessages()
  }
  const loadPersistedProfile = (configuration: ImageReaderConfiguration, id: string) => {
    const profile = savedProfile(configuration, id)
    setActiveProfile(profile)
    setCredentialAction(initialCredentialAction(profile))
    setDirty(false)
    setPendingProfileId(null)
    resetMessages()
  }
  const selectProfile = (id: string) => {
    if (id === activeProfile.id) return
    if (dirty) {
      setPendingProfileId(id)
      resetMessages()
      return
    }
    loadPersistedProfile(persistedConfiguration, id)
  }
  const addProfile = () => {
    if (persistedConfiguration.profiles.length >= IMAGE_READER_MAX_PROFILES) return
    const id = profileId()
    const next = createImageReaderProfile(id, `图片读取配置 ${persistedConfiguration.profiles.length + 1}`)
    setNewProfileReturnId(persistedConfiguration.activeProfileId)
    setActiveProfile(next)
    setCredentialAction(Object.freeze({ action: 'clear' }))
    setDirty(true)
    setPendingProfileId(null)
    resetMessages()
  }
  const duplicateProfile = () => {
    if (persistedConfiguration.profiles.length >= IMAGE_READER_MAX_PROFILES) return
    const id = profileId()
    const next = Object.freeze({ ...activeProfile, id, name: `${activeProfile.name} 副本`, hasApiKey: false })
    setNewProfileReturnId(persistedConfiguration.activeProfileId)
    setActiveProfile(next)
    setCredentialAction(Object.freeze({ action: 'clear' }))
    setDirty(true)
    setPendingProfileId(null)
    resetMessages()
  }
  const discardAndSwitch = () => {
    const id = pendingProfileId ?? (currentProfileIsPersisted ? activeProfile.id : newProfileReturnId)
    loadPersistedProfile(persistedConfiguration, id)
  }
  const updateCredential = (action: ImageReaderCredentialAction) => {
    setCredentialAction(Object.freeze(action))
    setDirty(true)
    resetMessages()
  }
  const save = async () => {
    const controller = new AbortController()
    setPendingOperation('save')
    setSaveStatus('idle')
    setSaveError(null)
    setSaveErrorCode(null)
    setSuccessMessage(null)
    try {
      const result = await saveImageReaderProfile(
        api,
        activeProfile,
        credentialAction,
        persistedConfiguration,
        controller.signal,
      )
      setPersistedConfiguration(result.configuration)
      const nextProfile = savedProfile(result.configuration, result.configuration.activeProfileId)
      setActiveProfile(nextProfile)
      setCredentialAction(initialCredentialAction(nextProfile))
      setDirty(false)
      setPendingProfileId(null)
      setSaveStatus('saved')
      setSuccessMessage('当前图片读取配置已保存并生效。')
      setPendingOperation(null)
    } catch (error) {
      const code = settingsErrorCode(error)
      setSaveErrorCode(code)
      setSaveError(imageReaderSettingsErrorMessage(error))
      setSaveStatus('error')
      setFailedOperation('save')
      setPendingOperation(null)
    }
  }

  const deleteProfile = async () => {
    if (!currentProfileIsPersisted) {
      loadPersistedProfile(persistedConfiguration, newProfileReturnId)
      return
    }
    if (persistedConfiguration.profiles.length === 1) return
    const controller = new AbortController()
    setPendingOperation('delete')
    setSaveStatus('idle')
    setSaveError(null)
    setSaveErrorCode(null)
    setSuccessMessage(null)
    try {
      const result = await api.deleteProfile({ profileId: activeProfile.id }, controller.signal)
      setPersistedConfiguration(result.configuration)
      const nextProfile = activeImageReaderProfile(result.configuration)
      setActiveProfile(savedProfile(result.configuration, nextProfile.id))
      setCredentialAction(initialCredentialAction(nextProfile))
      setDirty(false)
      setPendingProfileId(null)
      setSaveStatus('saved')
      setSuccessMessage('当前图片读取配置已删除。')
      setPendingOperation(null)
    } catch (error) {
      const code = settingsErrorCode(error)
      setSaveErrorCode(code)
      setSaveError(imageReaderSettingsErrorMessage(error))
      setSaveStatus('error')
      setFailedOperation('delete')
      setPendingOperation(null)
    }
  }

  const credentialDraft = credentialAction.action === 'replace' ? credentialAction.apiKey : ''
  const credentialState = credentialAction.action === 'clear'
    ? activeProfile.hasApiKey
      ? '保存后清除已保存的 API Key。'
      : '这份配置没有保存 API Key；本地免鉴权接口可以留空。'
    : credentialAction.action === 'replace'
      ? activeProfile.hasApiKey
        ? '保存后替换这份配置的 API Key。'
        : '保存后首次设置这份配置的 API Key。'
      : activeProfile.hasApiKey
        ? '这份配置已经保存 API Key；留空不会修改。'
        : '这份配置没有保存 API Key；本地免鉴权接口可以留空。'
  const errorField = saveErrorCode === null
    ? null
    : IMAGE_READER_SETTINGS_FIELD_BY_CODE[saveErrorCode as keyof typeof IMAGE_READER_SETTINGS_FIELD_BY_CODE] ?? null
  const fieldError = (field: ImageReaderSettingsField) => errorField === field ? saveError : null
  const renderFieldError = (field: ImageReaderSettingsField) => {
    const message = fieldError(field)
    return message === null ? null : (
      <small role="alert" data-image-reader-error-field={field}>{message}</small>
    )
  }

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
      {settings.status === 'ready' && !settings.writable ? <p role="alert">当前图片读取设置为只读；当前配置的修改不能保存。</p> : null}
      {catalogStatus === 'error' ? <p role="alert">系统模型目录读取失败：{catalogError} 请点击“刷新系统模型”重试。OpenAI 兼容配置仍可编辑。</p> : null}
      {modelCatalog?.failures.map(failure => (
        <p role="status" key={failure.provider}>
          无法读取 {failure.provider} 的系统模型目录。{imageReaderSettingsErrorMessage(undefined)} 请点击“刷新系统模型”重试；其他已加载 Provider 仍可选择。
        </p>
      ))}

      <div className="harness-comfyui-image-reader-profile-bar">
        <label>
          <span>当前编辑的配置</span>
          <select value={activeProfile.id} onChange={event => selectProfile(event.target.value)}>
            {profileOptions.map(profile => (
              <option key={profile.id} value={profile.id}>{profile.name}</option>
            ))}
          </select>
          <small>选择已保存配置时，页面从 Harness Settings 的持久化快照加载该配置。保存当前配置后，下一次 inspect_image 调用使用该配置。</small>
        </label>
        <div className="harness-comfyui-image-reader-profile-actions">
          <button type="button" onClick={addProfile} disabled={dirty || persistedConfiguration.profiles.length >= IMAGE_READER_MAX_PROFILES}>新建配置</button>
          <button type="button" onClick={duplicateProfile} disabled={dirty || persistedConfiguration.profiles.length >= IMAGE_READER_MAX_PROFILES}>复制配置</button>
          <button
            type="button"
            onClick={() => void deleteProfile()}
            disabled={pendingOperation !== null || (currentProfileIsPersisted && persistedConfiguration.profiles.length === 1)}
          >删除配置</button>
        </div>
        <small>复制配置会复制连接参数、模型、提示词和采样参数，但不会复制 API Key。</small>
        {renderFieldError('profile')}
      </div>

      {pendingProfileId === null ? null : (
        <div role="alert" className="harness-comfyui-image-reader-switch-gate">
          <p>当前配置有未保存修改。请保存当前配置或放弃当前修改后再切换。</p>
          <button type="button" onClick={() => void save()} disabled={!writable || pendingOperation !== null}>保存当前配置</button>
          <button type="button" onClick={discardAndSwitch}>放弃当前修改并切换</button>
          <button type="button" onClick={() => setPendingProfileId(null)}>继续编辑当前配置</button>
        </div>
      )}

      <div className="harness-comfyui-image-reader-form">
        <label className="harness-comfyui-image-reader-wide-field">
          <span>配置名称</span>
          <input
            type="text"
            maxLength={IMAGE_READER_PROFILE_NAME_MAX_LENGTH}
            value={activeProfile.name}
            onChange={event => updateActiveProfile(profile => ({ ...profile, name: event.target.value }))}
          />
          {renderFieldError('name')}
        </label>

        <fieldset className="harness-comfyui-image-reader-connection">
          <legend>连接方式</legend>
          <label>
            <input
              type="radio"
              name="image-reader-connection"
              checked={activeProfile.connectionType === 'runtime'}
              onChange={() => {
                updateActiveProfile(profile => ({
                  ...profile,
                  connectionType: 'runtime',
                  endpoint: '',
                  hasApiKey: false,
                  model: '',
                }))
                setCredentialAction(Object.freeze({ action: 'clear' }))
              }}
            />
            <span><strong>系统 Provider</strong><small>从当前 Harness LLM 运行时选择明确支持图片输入的模型。</small></span>
          </label>
          <label>
            <input
              type="radio"
              name="image-reader-connection"
              checked={activeProfile.connectionType === 'openai-compatible'}
              onChange={() => {
                updateActiveProfile(profile => ({
                  ...profile,
                  connectionType: 'openai-compatible',
                  provider: '',
                  model: '',
                }))
                setCredentialAction(Object.freeze({ action: 'clear' }))
              }}
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
              {renderFieldError('provider')}
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
              {renderFieldError('model')}
            </label>
          </>
        ) : (
          <>
            <label className="harness-comfyui-image-reader-wide-field">
              <span>Chat Completions 地址</span>
              <input
                type="url"
                maxLength={IMAGE_READER_ENDPOINT_MAX_LENGTH}
                placeholder="http://127.0.0.1:11434/v1/chat/completions"
                value={activeProfile.endpoint}
                onChange={event => updateActiveProfile(profile => ({ ...profile, endpoint: event.target.value }))}
              />
              <small>填写接受 POST 请求的完整地址；Harness 不会自动追加 /v1/chat/completions。</small>
              {endpointTransportMessage(activeProfile.endpoint) === null ? null : (
                <small role="status">{endpointTransportMessage(activeProfile.endpoint)}</small>
              )}
              {renderFieldError('endpoint')}
            </label>

            <label>
              <span>模型 ID</span>
              <input
                type="text"
                maxLength={IMAGE_READER_MODEL_MAX_LENGTH}
                placeholder="请输入接口接受的精确模型 ID"
                value={activeProfile.model}
                onChange={event => updateActiveProfile(profile => ({ ...profile, model: event.target.value }))}
              />
              {renderFieldError('model')}
            </label>

            <label>
              <span>API Key（可选）</span>
              <input
                type="password"
                autoComplete="new-password"
                placeholder={activeProfile.hasApiKey ? '已保存；输入新值可以替换' : '本地免鉴权接口可以留空'}
                value={credentialDraft}
                onChange={event => updateCredential(event.target.value.length > 0
                  ? { action: 'replace', apiKey: event.target.value }
                  : activeProfile.hasApiKey
                    ? { action: 'keep' }
                    : { action: 'clear' })}
              />
              <small>{credentialState}</small>
              {renderFieldError('credential')}
              {activeProfile.hasApiKey && credentialAction.action !== 'clear' ? (
                <button type="button" className="harness-comfyui-image-reader-inline-action" onClick={() => updateCredential({ action: 'clear' })}>清除已保存的 API Key</button>
              ) : null}
              {activeProfile.hasApiKey && credentialAction.action === 'clear' ? (
                <button type="button" className="harness-comfyui-image-reader-inline-action" onClick={() => updateCredential({ action: 'keep' })}>保留已保存的 API Key</button>
              ) : null}
            </label>
          </>
        )}

        <label className="harness-comfyui-image-reader-wide-field">
          <span>读图提示词</span>
          <textarea
            rows={18}
            maxLength={IMAGE_READER_PROMPT_MAX_LENGTH}
            value={activeProfile.defaultPrompt}
            onChange={event => updateActiveProfile(profile => ({ ...profile, defaultPrompt: event.target.value }))}
          />
          <small>inspect_image 或受管 CLI 省略 prompt 时使用该默认提示词；任一调用提供 prompt 时只覆盖本次调用。</small>
          {renderFieldError('defaultPrompt')}
        </label>

        <label>
          <span>温度</span>
          <input
            type="number"
            min={IMAGE_READER_TEMPERATURE_MIN}
            max={IMAGE_READER_TEMPERATURE_MAX}
            step={0.05}
            value={activeProfile.temperature}
            onChange={event => updateActiveProfile(profile => ({
              ...profile,
              temperature: event.target.value === '' ? Number.NaN : Number(event.target.value),
            }))}
          />
          {renderFieldError('temperature')}
        </label>

        <label>
          <span>最大输出 Token 数</span>
          <input
            type="number"
            min={IMAGE_READER_MAX_TOKENS_MIN}
            max={IMAGE_READER_MAX_TOKENS_MAX}
            step={1}
            value={activeProfile.maxTokens}
            onChange={event => updateActiveProfile(profile => ({
              ...profile,
              maxTokens: event.target.value === '' ? Number.NaN : Number(event.target.value),
            }))}
          />
          {renderFieldError('maxTokens')}
        </label>
      </div>

      <footer className="harness-comfyui-image-reader-actions">
        <button type="button" onClick={() => void save()} disabled={!writable || pendingOperation !== null}>
          {pendingOperation === 'save' ? '正在保存…' : '保存当前配置'}
        </button>
        {dirty ? <button type="button" onClick={discardAndSwitch}>放弃当前修改</button> : null}
        {saveStatus === 'saved' && successMessage !== null ? <span role="status">{successMessage}</span> : null}
        {saveStatus === 'error' ? (
          <span role="alert">{`${failedOperation === 'delete' ? '删除失败' : '保存失败'}：${saveError}`}</span>
        ) : null}
      </footer>
    </section>
  )
}

import { useEffect, useState, useSyncExternalStore } from 'react'

import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { SettingsSectionOwnerProps } from '@deepseek-ai/dsh-client-ui-settings/client'

import type { ImageReaderModelCatalog, ImageReaderModelOption } from '../../image-reader/contract.ts'
import {
  IMAGE_READER_DEFAULTS,
  decodeImageReaderSettings,
  type ImageReaderSettings,
  type ImageReaderSettingsSection,
} from '../../image-reader/settings.ts'

class ImageReaderSettingsError extends Error {
  readonly code: string

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ImageReaderSettingsError'
    this.code = code
  }
}

export interface ImageReaderModelCatalogApi {
  readonly models: (signal: AbortSignal) => Promise<ImageReaderModelCatalog>
}

export interface ImageReaderSettingsPageProps extends SettingsSectionOwnerProps {
  readonly scope: SettingsScope<ImageReaderSettingsSection>
  readonly catalog: ImageReaderModelCatalogApi
}

export function modelsForProvider(
  catalog: ImageReaderModelCatalog | null,
  provider: string,
): readonly ImageReaderModelOption[] {
  return catalog?.groups.find(group => group.provider === provider)?.models ?? []
}

export async function saveImageReaderSettings(
  scope: Pick<SettingsScope<ImageReaderSettingsSection>, 'set'>,
  draft: ImageReaderSettings,
  catalog: ImageReaderModelCatalog | null,
): Promise<void> {
  const availableModels = modelsForProvider(catalog, draft.provider)
  if (
    draft.provider.trim().length === 0
    || draft.model.trim().length === 0
    || decodeImageReaderSettings(draft) === undefined
    || !availableModels.some(model => model.id === draft.model)
  ) {
    throw new ImageReaderSettingsError(
      'IMAGE_READER_SETTINGS_INVALID',
      '请选择可读取图片的 Provider 和模型，并填写有效的提示词、温度和最大输出 Token 数。',
    )
  }
  await scope.set('configuration', draft)
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message
  return 'Harness 无法完成图片读取设置请求。请刷新模型目录并重新保存图片读取设置。'
}

export function ImageReaderSettingsPage({ scope, catalog }: ImageReaderSettingsPageProps) {
  const settings = useSyncExternalStore(
    listener => scope.subscribe(listener),
    () => scope.getSnapshot(),
  )
  const [draft, setDraft] = useState<ImageReaderSettings>(settings.value?.configuration ?? IMAGE_READER_DEFAULTS)
  const [modelCatalog, setModelCatalog] = useState<ImageReaderModelCatalog | null>(null)
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [catalogVersion, setCatalogVersion] = useState(0)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (settings.status === 'ready' && settings.value !== undefined) setDraft(settings.value.configuration)
  }, [settings])

  useEffect(() => {
    const controller = new AbortController()
    setCatalogStatus('loading')
    setCatalogError(null)
    void catalog.models(controller.signal).then(value => {
      if (controller.signal.aborted) return
      setModelCatalog(value)
      setCatalogStatus('ready')
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      setModelCatalog(null)
      setCatalogError(errorMessage(error))
      setCatalogStatus('error')
    })
    return () => controller.abort()
  }, [catalog, catalogVersion])

  const availableModels = modelsForProvider(modelCatalog, draft.provider)
  const writable = settings.status === 'ready' && settings.writable
  const updateDraft = (update: (current: ImageReaderSettings) => ImageReaderSettings) => {
    setDraft(update)
    setSaveStatus('idle')
    setSaveError(null)
  }
  const save = async () => {
    setSaveStatus('saving')
    setSaveError(null)
    try {
      await saveImageReaderSettings(scope, draft, modelCatalog)
      setSaveStatus('saved')
    } catch (error) {
      setSaveError(errorMessage(error))
      setSaveStatus('error')
    }
  }

  return (
    <section className="harness-comfyui-image-reader-settings" aria-labelledby="harness-comfyui-image-reader-title">
      <header className="harness-comfyui-image-reader-header">
        <div>
          <h2 id="harness-comfyui-image-reader-title">图片读取</h2>
          <p>从当前 Harness LLM 运行时选择支持图片输入的 Provider 与视觉模型。图片读取不会跟随当前会话或生图模型。</p>
        </div>
        <button type="button" onClick={() => setCatalogVersion(value => value + 1)} disabled={catalogStatus === 'loading'}>
          {catalogStatus === 'loading' ? '正在读取模型…' : '刷新模型'}
        </button>
      </header>

      {settings.status === 'loading' ? <p role="status">正在读取图片读取设置…</p> : null}
      {settings.status === 'unavailable' ? <p role="alert">当前 Harness 环境没有提供可写的图片读取设置。</p> : null}
      {catalogStatus === 'error' ? <p role="alert">模型目录读取失败：{catalogError} 请点击“刷新模型”重试。</p> : null}
      {modelCatalog?.failures.map(failure => (
        <p role="status" key={failure.provider}>
          {failure.provider} 的模型目录读取失败：{failure.message} 请点击“刷新模型”重试；其他已加载 Provider 仍可选择。
        </p>
      ))}

      <div className="harness-comfyui-image-reader-form">
        <label>
          <span>Provider</span>
          <select
            value={draft.provider}
            onChange={event => updateDraft(current => ({ ...current, provider: event.target.value, model: '' }))}
            disabled={catalogStatus !== 'ready'}
          >
            <option value="">请选择运行时 Provider</option>
            {modelCatalog?.groups.map(group => <option key={group.provider} value={group.provider}>{group.name}</option>)}
          </select>
        </label>

        <label>
          <span>视觉模型</span>
          <select
            value={draft.model}
            onChange={event => updateDraft(current => ({ ...current, model: event.target.value }))}
            disabled={draft.provider.length === 0 || availableModels.length === 0}
          >
            <option value="">请选择明确支持图片输入的模型</option>
            {availableModels.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
          </select>
        </label>

        <label className="harness-comfyui-image-reader-wide-field">
          <span>默认读图提示词</span>
          <textarea
            rows={7}
            value={draft.defaultPrompt}
            onChange={event => updateDraft(current => ({ ...current, defaultPrompt: event.target.value }))}
          />
          <small>调用 inspect_image 时没有传入 prompt，inspect_image Tool 会使用这段提示词。</small>
        </label>

        <label>
          <span>温度</span>
          <input
            type="number"
            min={0}
            max={2}
            step={0.05}
            value={draft.temperature}
            onChange={event => updateDraft(current => ({ ...current, temperature: Number(event.target.value) }))}
          />
        </label>

        <label>
          <span>最大输出 Token 数</span>
          <input
            type="number"
            min={1}
            max={32768}
            step={1}
            value={draft.maxTokens}
            onChange={event => updateDraft(current => ({ ...current, maxTokens: Number(event.target.value) }))}
          />
        </label>
      </div>

      <footer className="harness-comfyui-image-reader-actions">
        <button type="button" onClick={() => void save()} disabled={!writable || saveStatus === 'saving'}>
          {saveStatus === 'saving' ? '正在保存…' : '保存图片读取设置'}
        </button>
        {saveStatus === 'saved' ? <span role="status">图片读取设置已保存。</span> : null}
        {saveStatus === 'error' ? (
          <span role="alert">
            保存失败：{saveError} 请检查 Provider、视觉模型、提示词、温度和最大输出 Token 数后重新保存。
          </span>
        ) : null}
      </footer>
    </section>
  )
}

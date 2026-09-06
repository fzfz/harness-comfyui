import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'

import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SettingsSectionOwnerProps } from '@deepseek-ai/dsh-client-ui-settings/client'

import {
  SourceSettingsValidationError,
  sourceOrigin,
  validateSourceSettingsSection,
  type SourceSettingsView,
} from '../../source-settings.ts'
import {
  ImageReaderSettingsPage,
  type ImageReaderSettingsPageProps,
} from '../image-reader/image-reader-settings.tsx'

export const SOURCE_SETTINGS_COPY = Object.freeze({
  urlFormatInvalid: '数据源服务 URL 格式不正确，必须包含 http:// 或 https:// 和主机名。',
  urlPortNotAllowed: '数据源服务 URL 中包含端口。请从 URL 中移除端口，并在“端口”字段中填写该端口。',
  urlComponentNotAllowed: '数据源服务 URL 仅接受协议、主机名和可选的根路径“/”。请移除 URL 中的用户名、密码、其他路径、查询参数和片段标识。',
  portInvalid: '端口必须是 1 至 65535 的整数。',
  saveFailed: '数据源服务设置保存失败，请重试。',
  saved: '当前数据源服务设置已保存。Harness-ComfyUI 的下一次数据源请求将使用此 URL 和端口。',
})

type SettingsTab = 'image-reader' | 'source'

const SETTINGS_TABS = Object.freeze<readonly SettingsTab[]>(['image-reader', 'source'])
const SETTINGS_TAB_IDS: Readonly<Record<SettingsTab, string>> = Object.freeze({
  'image-reader': 'harness-comfyui-image-reader-tab',
  source: 'harness-comfyui-source-tab',
})

export interface HarnessComfyuiSettingsPageProps extends SettingsSectionOwnerProps {
  readonly imageReaderScope: ImageReaderSettingsPageProps['scope']
  readonly imageReaderApi: ImageReaderSettingsPageProps['api']
  readonly sourceScope: SettingsScope<SourceSettingsView>
}

function sourceErrorMessage(error: SourceSettingsValidationError): string {
  switch (error.code) {
    case 'SOURCE_URL_PORT_NOT_ALLOWED': return SOURCE_SETTINGS_COPY.urlPortNotAllowed
    case 'SOURCE_URL_COMPONENT_NOT_ALLOWED': return SOURCE_SETTINGS_COPY.urlComponentNotAllowed
    case 'SOURCE_PORT_INVALID': return SOURCE_SETTINGS_COPY.portInvalid
    default: return SOURCE_SETTINGS_COPY.urlFormatInvalid
  }
}

function portValue(value: string): number {
  if (!/^[0-9]+$/u.test(value)) throw new SourceSettingsValidationError('SOURCE_PORT_INVALID')
  return Number(value)
}

export function HarnessComfyuiSettingsPage({
  close,
  imageReaderScope,
  imageReaderApi,
  sourceScope,
}: HarnessComfyuiSettingsPageProps) {
  const settings = useSyncExternalStore(
    listener => sourceScope.subscribe(listener),
    () => sourceScope.getSnapshot(),
  )
  const initial = settings.value?.configuration
  const [tab, setTab] = useState<SettingsTab>('image-reader')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [port, setPort] = useState(initial === undefined ? '' : String(initial.port))
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const [fieldError, setFieldError] = useState<{ field: 'url' | 'port'; message: string } | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    if (settings.status !== 'ready' || settings.value === undefined || dirtyRef.current) return
    setUrl(settings.value.configuration.url)
    setPort(String(settings.value.configuration.port))
  }, [settings])

  const updateUrl = (value: string) => {
    setUrl(value)
    setDirty(true)
    setFieldError(null)
    setSaveStatus('idle')
  }
  const updatePort = (value: string) => {
    setPort(value)
    setDirty(true)
    setFieldError(null)
    setSaveStatus('idle')
  }
  const moveTabFocus = (event: KeyboardEvent<HTMLButtonElement>, current: SettingsTab) => {
    const currentIndex = SETTINGS_TABS.indexOf(current)
    let nextIndex: number | undefined
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % SETTINGS_TABS.length
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = SETTINGS_TABS.length - 1
    if (nextIndex === undefined) return
    event.preventDefault()
    const next = SETTINGS_TABS[nextIndex]!
    setTab(next)
    event.currentTarget.ownerDocument.getElementById(SETTINGS_TAB_IDS[next])?.focus()
  }
  const save = async () => {
    let nextPort: number
    try {
      nextPort = portValue(port)
      validateSourceSettingsSection({ configuration: { url, port: nextPort } })
    } catch (error) {
      if (error instanceof SourceSettingsValidationError) {
        setFieldError({
          field: error.code === 'SOURCE_PORT_INVALID' ? 'port' : 'url',
          message: sourceErrorMessage(error),
        })
        setSaveStatus('idle')
        return
      }
      throw error
    }

    setFieldError(null)
    setSaveStatus('saving')
    try {
      await sourceScope.mutate([
        { op: 'set', path: ['configuration', 'url'], value: url },
        { op: 'set', path: ['configuration', 'port'], value: nextPort },
      ], settings.revision)
      setDirty(false)
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    }
  }

  const address = (() => {
    try {
      const nextPort = portValue(port)
      validateSourceSettingsSection({ configuration: { url, port: nextPort } })
      return sourceOrigin({ url, port: nextPort })
    } catch {
      return '请填写有效的 URL 和端口。'
    }
  })()
  const writable = settings.status === 'ready' && settings.writable

  return (
    <section className="harness-comfyui-settings" aria-labelledby="harness-comfyui-settings-title">
      <header className="harness-comfyui-settings-header">
        <h1 id="harness-comfyui-settings-title">Harness-ComfyUI</h1>
        <p>在此配置 Harness-ComfyUI 使用的图片读取参数和数据源服务地址。</p>
      </header>

      <div className="harness-comfyui-settings-tabs" role="tablist" aria-label="Harness-ComfyUI 设置">
        <Button
          type="button"
          variant="toolbar"
          size="sm"
          role="tab"
          aria-selected={tab === 'image-reader'}
          aria-controls="harness-comfyui-image-reader-panel"
          id={SETTINGS_TAB_IDS['image-reader']}
          tabIndex={tab === 'image-reader' ? 0 : -1}
          onClick={() => setTab('image-reader')}
          onKeyDown={event => moveTabFocus(event, 'image-reader')}
        >图片读取</Button>
        <Button
          type="button"
          variant="toolbar"
          size="sm"
          role="tab"
          aria-selected={tab === 'source'}
          aria-controls="harness-comfyui-source-panel"
          id={SETTINGS_TAB_IDS.source}
          tabIndex={tab === 'source' ? 0 : -1}
          onClick={() => setTab('source')}
          onKeyDown={event => moveTabFocus(event, 'source')}
        >数据源服务</Button>
      </div>

      <div
        id="harness-comfyui-image-reader-panel"
        role="tabpanel"
        aria-labelledby="harness-comfyui-image-reader-tab"
        hidden={tab !== 'image-reader'}
      >
        <ImageReaderSettingsPage close={close} scope={imageReaderScope} api={imageReaderApi} />
      </div>

      <div
        id="harness-comfyui-source-panel"
        role="tabpanel"
        aria-labelledby="harness-comfyui-source-tab"
        hidden={tab !== 'source'}
      >
        <section className="harness-comfyui-source-settings" aria-labelledby="harness-comfyui-source-title">
          <header>
            <h2 id="harness-comfyui-source-title">数据源服务</h2>
            <p>Harness-ComfyUI 向此服务发送语义查询和上下文插入请求，并从此服务读取 ComfyUI 实例信息和 Workflow 列表。</p>
          </header>

          {settings.status === 'loading' ? <p role="status">正在读取数据源服务设置…</p> : null}
          {settings.status === 'unavailable' ? <p role="alert">当前 Harness 环境的数据源服务设置需要启用写入权限。请联系负责配置 Harness 环境的人员启用写入权限后再修改。</p> : null}
          {settings.status === 'ready' && !settings.writable ? <p role="alert">当前数据源服务设置处于只读状态。请联系负责配置 Harness 环境的人员启用写入权限后再修改。</p> : null}

          <form noValidate onSubmit={(event) => { event.preventDefault(); void save() }}>
            <label className="harness-comfyui-source-wide-field">
              <span className="harness-comfyui-source-field-label">数据源服务 URL</span>
              <Input
                className="harness-comfyui-source-input"
                type="url"
                name="source-url"
                value={url}
                placeholder="https://catalog.example.com"
                aria-describedby="harness-comfyui-source-url-help harness-comfyui-source-url-error"
                disabled={!writable || saveStatus === 'saving'}
                onChange={event => updateUrl(event.target.value)}
              />
              <small id="harness-comfyui-source-url-help">例如 http://127.0.0.1 或 https://catalog.example.com。端口请单独填写。</small>
              {fieldError?.field === 'url' ? <small id="harness-comfyui-source-url-error" role="alert">{fieldError.message}</small> : null}
            </label>

            <label>
              <span className="harness-comfyui-source-field-label">端口</span>
              <Input
                className="harness-comfyui-source-input"
                type="number"
                name="source-port"
                min={1}
                max={65535}
                step={1}
                value={port}
                aria-describedby="harness-comfyui-source-port-help harness-comfyui-source-port-error"
                disabled={!writable || saveStatus === 'saving'}
                onChange={event => updatePort(event.target.value)}
              />
              <small id="harness-comfyui-source-port-help">填写 1 至 65535 的整数端口号。</small>
              {fieldError?.field === 'port' ? <small id="harness-comfyui-source-port-error" role="alert">{fieldError.message}</small> : null}
            </label>

            <p className="harness-comfyui-source-address">
              <span>连接地址</span>
              <code>{address}</code>
            </p>

            <footer className="harness-comfyui-source-actions">
              <p role={saveStatus === 'error' ? 'alert' : 'status'}>
                {saveStatus === 'saved'
                  ? SOURCE_SETTINGS_COPY.saved
                  : saveStatus === 'error'
                    ? SOURCE_SETTINGS_COPY.saveFailed
                    : '保存后，下一次数据源请求将使用此 URL 和端口。'}
              </p>
              <Button type="submit" variant="primary" disabled={!writable || saveStatus === 'saving'}>
                {saveStatus === 'saving' ? '正在保存…' : '保存数据源服务设置'}
              </Button>
            </footer>
          </form>
        </section>
      </div>
    </section>
  )
}

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import errorCatalog from '../../../config/error-catalog.json' with { type: 'json' }
import settingsEntryIds from '../../../config/settings-entry-ids.json' with { type: 'json' }
import {
  BROWSER_SETTINGS,
  parseBrowserExecutablePathRequest,
  type BrowserExecutablePathRequest,
  type BrowserExecutablePathResult,
  type BrowserSettingsView,
} from '../../browser-settings-schema.ts'

export interface BrowserSettingsApi {
  configuration(signal: AbortSignal): Promise<BrowserExecutablePathRequest>
  validate(request: BrowserExecutablePathRequest, signal: AbortSignal): Promise<BrowserExecutablePathResult>
}

export interface BrowserSettingsPageProps {
  readonly scope: ConfigForm<BrowserSettingsView>
  readonly api: BrowserSettingsApi
}

type BrowserSettingsErrorCode = 'BROWSER_EXECUTABLE_PATH_INVALID' | 'BROWSER_EXECUTABLE_PATH_UNAVAILABLE'
  | 'BROWSER_SETTINGS_REQUEST_FAILED' | 'BROWSER_SETTINGS_SAVE_FAILED'
interface BrowserSettingsFailure { readonly code: BrowserSettingsErrorCode; readonly path?: string; readonly reason?: string }

const copy = BROWSER_SETTINGS.ui

export function BrowserSettingsPage({ scope, api }: BrowserSettingsPageProps) {
  const settings = useSyncExternalStore(listener => scope.subscribe(listener), () => scope.getSnapshot())
  const [path, setPath] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [failure, setFailure] = useState<BrowserSettingsFailure | null>(null)
  const saveController = useRef<AbortController | null>(null)
  const configuredPath = settings.value?.browserExecutablePath

  useEffect(() => {
    const controller = new AbortController()
    if (configuredPath !== undefined && configuredPath !== '') {
      if (!dirtyRef.current) setPath(configuredPath)
      setLoading(false)
      setFailure(current => current?.code === 'BROWSER_SETTINGS_REQUEST_FAILED' ? null : current)
      return () => controller.abort()
    }
    setLoading(true)
    void api.configuration(controller.signal).then(value => {
      if (controller.signal.aborted) return
      if (!dirtyRef.current) setPath(value.browserExecutablePath)
      setLoading(false)
      setFailure(current => current?.code === 'BROWSER_SETTINGS_REQUEST_FAILED' ? null : current)
    }).catch(error => {
      if (controller.signal.aborted) return
      setLoading(false)
      setFailure({ code: 'BROWSER_SETTINGS_REQUEST_FAILED', reason: error instanceof Error ? error.message : String(error) })
    })
    return () => controller.abort()
  }, [api, configuredPath, settings.revision, loadAttempt])

  useEffect(() => () => { saveController.current?.abort() }, [])

  const save = async () => {
    let request: BrowserExecutablePathRequest
    try { request = parseBrowserExecutablePathRequest({ browserExecutablePath: path }) } catch {
      setFailure({ code: 'BROWSER_EXECUTABLE_PATH_INVALID', path })
      return
    }
    const controller = new AbortController()
    saveController.current = controller
    setFailure(null)
    setStatus('saving')
    let stage: 'validate' | 'save' = 'validate'
    try {
      const validated = await api.validate(request, controller.signal)
      controller.signal.throwIfAborted()
      if (!validated.ok) { setFailure(validated.error); setStatus('idle'); return }
      stage = 'save'
      const saved = await scope.mutate([
        { op: 'set', path: [BROWSER_SETTINGS.fieldName], value: request.browserExecutablePath },
      ], settings.revision)
      if (controller.signal.aborted) return
      if (!saved) { setFailure({ code: 'BROWSER_SETTINGS_SAVE_FAILED', path }); setStatus('idle'); return }
      setDirty(false)
      setStatus('saved')
    } catch (error) {
      if (controller.signal.aborted) return
      setFailure({
        code: stage === 'save' ? 'BROWSER_SETTINGS_SAVE_FAILED' : 'BROWSER_SETTINGS_REQUEST_FAILED',
        path, reason: error instanceof Error ? error.message : String(error),
      })
      setStatus('idle')
    } finally {
      if (saveController.current === controller) saveController.current = null
    }
  }

  const writable = settings.status === 'ready' && settings.writable && !loading
  const error = failure === null ? null : errorCatalog[failure.code]
  const detail = failure?.path === undefined ? null : copy.pathDetailsTemplate
    .replace(/\{path\}|\{reason\}/gu, token => token === '{path}' ? failure.path! : failure.reason ?? error!.reason)
  const writeLocation = copy.settingsWriteLocationTemplate
    .replace('{entryId}', settingsEntryIds.core).replace('{fieldName}', BROWSER_SETTINGS.fieldName)

  return <section aria-labelledby={`${copy.panelId}-title`}>
    <h2 id={`${copy.panelId}-title`}>{copy.heading}</h2>
    <p>{copy.description}</p>
    {loading ? <p role="status">{copy.loadingMessage}</p> : null}
    {settings.status === 'ready' && !settings.writable ? <p role="alert">{copy.readOnlyMessage}</p> : null}
    {settings.status === 'unavailable' ? <p role="alert">{copy.unavailableMessage}</p> : null}
    <form noValidate onSubmit={event => { event.preventDefault(); return save() }}>
      <label>
        <span>{copy.pathLabel}</span>
        <Input type="text" name={copy.inputName} value={path} disabled={!writable || status === 'saving'}
          aria-invalid={failure?.code === 'BROWSER_EXECUTABLE_PATH_INVALID' || failure?.code === 'BROWSER_EXECUTABLE_PATH_UNAVAILABLE'}
          aria-describedby={failure === null ? undefined : `${copy.panelId}-error`}
          onChange={event => { setPath(event.target.value); setDirty(true); setFailure(null); setStatus('idle') }} />
      </label>
      {error === null ? null : <div role="alert" id={`${copy.panelId}-error`}>
        <p>{error.reason}{error.next_step}</p>
        {detail === null ? null : <p>{detail}</p>}
        {failure?.code === 'BROWSER_SETTINGS_SAVE_FAILED' ? <p>{writeLocation}</p> : null}
      </div>}
      {failure?.code === 'BROWSER_SETTINGS_REQUEST_FAILED'
        ? <Button type="button" onClick={() => setLoadAttempt(attempt => attempt + 1)}>{copy.retryButton}</Button> : null}
      <Button type="submit" variant="primary" disabled={!writable || status === 'saving'}>{status === 'saving' ? copy.savingMessage : copy.saveButton}</Button>
      {status === 'saved' ? <p role="status">{copy.savedMessage}</p> : null}
    </form>
  </section>
}

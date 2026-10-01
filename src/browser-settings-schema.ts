import Schema from '@deepseek-ai/schemastery'
import configuration from '../config/browser-settings.json' with { type: 'json' }

const browserSettingsConfigurationSchema = Schema.object({
  remoteNamespace: Schema.const('harnessComfyuiBrowserSettings').required(),
  fieldName: Schema.const('browserExecutablePath').required(),
  ui: Schema.object({
    tabId: Schema.string().min(1).required(),
    panelId: Schema.string().min(1).required(),
    tabLabel: Schema.string().min(1).required(),
    heading: Schema.string().min(1).required(),
    description: Schema.string().min(1).required(),
    pathLabel: Schema.string().min(1).required(),
    inputName: Schema.string().min(1).required(),
    saveButton: Schema.string().min(1).required(),
    savedMessage: Schema.string().min(1).required(),
    retryButton: Schema.string().min(1).required(),
    pathDetailsTemplate: Schema.string().min(1).required(),
    settingsWriteLocationTemplate: Schema.string().min(1).required(),
    loadingMessage: Schema.string().min(1).required(),
    savingMessage: Schema.string().min(1).required(),
    readOnlyMessage: Schema.string().min(1).required(),
    unavailableMessage: Schema.string().min(1).required(),
  }).required(),
})

export const BROWSER_SETTINGS = Schema.resolve(configuration, browserSettingsConfigurationSchema, {}, true)[0] as {
  readonly remoteNamespace: 'harnessComfyuiBrowserSettings'
  readonly fieldName: 'browserExecutablePath'
  readonly ui: Readonly<typeof configuration.ui>
}
export const BROWSER_SETTINGS_REMOTE_NAMESPACE = BROWSER_SETTINGS.remoteNamespace
export const BROWSER_SETTINGS_REMOTE_SERVICE = `remote.${BROWSER_SETTINGS_REMOTE_NAMESPACE}` as const

export interface BrowserSettingsView {
  readonly browserExecutablePath?: string
}

export interface BrowserExecutablePathRequest {
  readonly browserExecutablePath: string
}

export type BrowserExecutablePathResult = {
  readonly ok: true
  readonly value: BrowserExecutablePathRequest
} | {
  readonly ok: false
  readonly error: {
    readonly code: 'BROWSER_EXECUTABLE_PATH_UNAVAILABLE'
    readonly path: string
    readonly reason: string
  }
}

export const BROWSER_EXECUTABLE_PATH_SCHEMA = Schema.string().min(1).pattern(/^\/[^\0]*$/u)
export const BROWSER_EXECUTABLE_REQUEST_SCHEMA = Schema.object({
  browserExecutablePath: BROWSER_EXECUTABLE_PATH_SCHEMA.required(),
})

export function parseBrowserExecutablePathRequest(value: unknown): BrowserExecutablePathRequest {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== 1 || !Object.hasOwn(value, 'browserExecutablePath')) {
    throw new TypeError('Browser validation requires one browserExecutablePath field; provide the absolute path to an accessible Chrome or Chromium executable.')
  }
  const path = (value as Record<string, unknown>).browserExecutablePath
  if (typeof path !== 'string') {
    throw new TypeError('browserExecutablePath must be a string; provide the absolute path to an accessible Chrome or Chromium executable.')
  }
  return BROWSER_EXECUTABLE_REQUEST_SCHEMA({ browserExecutablePath: path })
}

export function parseBrowserExecutablePathResult(value: unknown): BrowserExecutablePathResult {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('The browser validation response is not an object; update the response producer to return a validation result object.')
  }
  const result = value as Record<string, unknown>
  if (result.ok === true && Object.keys(result).length === 2) {
    return { ok: true, value: parseBrowserExecutablePathRequest(result.value) }
  }
  const error = result.error
  if (result.ok !== false || Object.keys(result).length !== 2 || error === null
    || typeof error !== 'object' || Array.isArray(error)) {
    throw new TypeError('The browser validation response has invalid fields; return exactly ok=true and value for success, or ok=false and error for failure.')
  }
  const detail = error as Record<string, unknown>
  if (Object.keys(detail).length !== 3 || detail.code !== 'BROWSER_EXECUTABLE_PATH_UNAVAILABLE'
    || typeof detail.path !== 'string' || typeof detail.reason !== 'string' || detail.reason.trim() === '') {
    throw new TypeError('The browser validation failure response has an invalid code, path or reason; return error.code=BROWSER_EXECUTABLE_PATH_UNAVAILABLE, an absolute error.path and a nonempty error.reason.')
  }
  parseBrowserExecutablePathRequest({ browserExecutablePath: detail.path })
  return { ok: false, error: { code: detail.code, path: detail.path, reason: detail.reason } }
}

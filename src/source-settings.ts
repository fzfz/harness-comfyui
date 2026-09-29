import Schema from '@deepseek-ai/schemastery'
import settingsEntryIds from '../config/settings-entry-ids.json' with { type: 'json' }

export const SOURCE_SETTINGS_NAMESPACE = 'harness-comfyui-source'
export const SOURCE_PROFILE_ENTRY_ID = settingsEntryIds.core
export const SOURCE_SETTINGS_SECTION_ID = 'harness-comfyui-settings'
export const SOURCE_SETTINGS_DEFAULT_URL = 'http://127.0.0.1'

export type SourceSettingsErrorCode =
  | 'SOURCE_URL_FORMAT_INVALID'
  | 'SOURCE_URL_PORT_NOT_ALLOWED'
  | 'SOURCE_URL_COMPONENT_NOT_ALLOWED'
  | 'SOURCE_PORT_INVALID'

export class SourceSettingsValidationError extends TypeError {
  readonly code: SourceSettingsErrorCode

  constructor(code: SourceSettingsErrorCode) {
    super(code)
    this.name = 'SourceSettingsValidationError'
    this.code = code
  }
}

export interface SourceAddress {
  readonly url: string
  readonly port: number
}

export interface SourceSettingsSection {
  readonly configuration: SourceAddress
}

export type SourceSettingsView = SourceSettingsSection

export const SOURCE_ADDRESS_SCHEMA = Schema.object({
  url: Schema.string().min(1).max(2048).required(),
  port: Schema.natural().min(1).max(65535).required(),
})

export const SOURCE_SETTINGS_SCHEMA = Schema.object({
  configuration: SOURCE_ADDRESS_SCHEMA.required(),
})

export function createSourceSettingsDefaults(port: number): SourceSettingsSection {
  const defaults = Object.freeze({
    configuration: Object.freeze({ url: SOURCE_SETTINGS_DEFAULT_URL, port }),
  })
  validateSourceSettingsSection(defaults)
  return defaults
}

function sourceUrl(value: unknown): URL {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new SourceSettingsValidationError('SOURCE_URL_FORMAT_INVALID')
  }
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new SourceSettingsValidationError('SOURCE_URL_FORMAT_INVALID')
  }
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.hostname.length === 0) {
    throw new SourceSettingsValidationError('SOURCE_URL_FORMAT_INVALID')
  }
  const authority = value.slice(value.indexOf('://') + 3).split(/[/?#]/u, 1)[0]!
  const host = authority.slice(authority.lastIndexOf('@') + 1)
  const hasExplicitPort = host.startsWith('[')
    ? host.slice(host.indexOf(']') + 1).startsWith(':')
    : host.includes(':')
  if (hasExplicitPort) {
    throw new SourceSettingsValidationError('SOURCE_URL_PORT_NOT_ALLOWED')
  }
  if (
    parsed.username.length > 0
    || parsed.password.length > 0
    || parsed.pathname !== '/'
    || value.includes('?')
    || value.includes('#')
  ) {
    throw new SourceSettingsValidationError('SOURCE_URL_COMPONENT_NOT_ALLOWED')
  }
  return parsed
}

export function validateSourceSettingsSection(value: SourceSettingsSection): void {
  sourceUrl(value.configuration.url)
  if (!Number.isSafeInteger(value.configuration.port) || value.configuration.port < 1 || value.configuration.port > 65535) {
    throw new SourceSettingsValidationError('SOURCE_PORT_INVALID')
  }
}

export function decodeSourceSettingsView(value: unknown): SourceSettingsView | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const configuration = (value as { configuration?: unknown }).configuration
  if (configuration === null || typeof configuration !== 'object' || Array.isArray(configuration)) return undefined
  const { url, port } = configuration as { url?: unknown; port?: unknown }
  if (typeof url !== 'string' || typeof port !== 'number') return undefined
  const view = Object.freeze({ configuration: Object.freeze({ url, port }) })
  try {
    validateSourceSettingsSection(view)
  } catch {
    return undefined
  }
  return view
}

export function readSourceAddress(
  scope: { get(): SourceAddress },
): SourceAddress {
  const { url, port } = scope.get()
  return Object.freeze({ url, port })
}

export function configuredSourceAddress(
  configuration: { get(): SourceAddress } | undefined,
  profilePort: number,
): SourceAddress {
  const address = configuration?.get() ?? createSourceSettingsDefaults(profilePort).configuration
  validateSourceSettingsSection({ configuration: address })
  return Object.freeze({ url: address.url, port: address.port })
}

export function sourceOrigin(address: SourceAddress): string {
  const parsed = sourceUrl(address.url)
  return `${parsed.protocol}//${parsed.hostname}:${address.port}`
}

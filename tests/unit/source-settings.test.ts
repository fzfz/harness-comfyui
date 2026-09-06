import Schema from '@deepseek-ai/schemastery'
import { describe, expect, it } from 'vitest'

import {
  SOURCE_SETTINGS_NAMESPACE,
  SOURCE_SETTINGS_SCHEMA,
  SourceSettingsValidationError,
  createSourceSettingsDefaults,
  decodeSourceSettingsView,
  readSourceAddress,
  sourceOrigin,
  validateSourceSettingsSection,
} from '../../src/source-settings.ts'

describe('data source settings', () => {
  it('uses the profile port as the live Settings base and returns a detached address per read', () => {
    const defaults = createSourceSettingsDefaults(18093)
    expect(SOURCE_SETTINGS_NAMESPACE).toBe('harness-comfyui-source')
    expect(defaults).toEqual({
      configuration: { url: 'http://127.0.0.1', port: 18093 },
    })
    expect(Schema.resolve(defaults, SOURCE_SETTINGS_SCHEMA, {}, true)[0]).toEqual(defaults)

    let current = defaults
    const scope = { get: () => current }
    expect(readSourceAddress(scope)).toEqual({ url: 'http://127.0.0.1', port: 18093 })
    current = { configuration: { url: 'https://catalog.example.com', port: 443 } }
    expect(readSourceAddress(scope)).toEqual({ url: 'https://catalog.example.com', port: 443 })
  })

  it.each([
    ['missing scheme', 'catalog.example.com', 'SOURCE_URL_FORMAT_INVALID'],
    ['unsupported scheme', 'ftp://catalog.example.com', 'SOURCE_URL_FORMAT_INVALID'],
    ['missing hostname', 'http://', 'SOURCE_URL_FORMAT_INVALID'],
    ['explicit port', 'https://catalog.example.com:8443', 'SOURCE_URL_PORT_NOT_ALLOWED'],
    ['explicit default HTTP port', 'http://catalog.example.com:80', 'SOURCE_URL_PORT_NOT_ALLOWED'],
    ['explicit default HTTPS port', 'https://catalog.example.com:443', 'SOURCE_URL_PORT_NOT_ALLOWED'],
    ['credentials', 'https://user:secret@catalog.example.com', 'SOURCE_URL_COMPONENT_NOT_ALLOWED'],
    ['path', 'https://catalog.example.com/api', 'SOURCE_URL_COMPONENT_NOT_ALLOWED'],
    ['query', 'https://catalog.example.com/?mode=search', 'SOURCE_URL_COMPONENT_NOT_ALLOWED'],
    ['fragment', 'https://catalog.example.com/#source', 'SOURCE_URL_COMPONENT_NOT_ALLOWED'],
  ])('rejects an invalid data source URL: %s', (_label, url, code) => {
    expect(() => validateSourceSettingsSection({
      configuration: { url, port: 18093 },
    })).toThrow(expect.objectContaining({ code }))
  })

  it.each([
    ['HTTP IPv4', 'http://127.0.0.1', 1],
    ['HTTPS hostname', 'https://catalog.example.com', 443],
    ['root path', 'https://catalog.example.com/', 65535],
    ['HTTP IPv6', 'http://[::1]', 18093],
  ])('accepts %s source address', (_label, url, port) => {
    expect(() => validateSourceSettingsSection({ configuration: { url, port } })).not.toThrow()
  })

  it.each([
    ['HTTP IPv4', 'http://127.0.0.1', 18093, 'http://127.0.0.1:18093'],
    ['HTTPS hostname', 'https://catalog.example.com', 443, 'https://catalog.example.com:443'],
    ['HTTP IPv6', 'http://[::1]', 18093, 'http://[::1]:18093'],
  ])('renders the exact %s connection origin', (_label, url, port, expected) => {
    expect(sourceOrigin({ url, port })).toBe(expected)
  })

  it.each([0, 65536, 1.5, Number.NaN])('rejects invalid port %s', (port) => {
    expect(() => validateSourceSettingsSection({
      configuration: { url: 'http://127.0.0.1', port },
    })).toThrow(expect.objectContaining({ code: 'SOURCE_PORT_INVALID' }))
  })

  it('decodes only a complete browser view and preserves validation error identity', () => {
    const view = { configuration: { url: 'https://catalog.example.com', port: 443 } }
    expect(decodeSourceSettingsView(view)).toEqual(view)
    expect(decodeSourceSettingsView({ configuration: { url: 'https://catalog.example.com' } })).toBeUndefined()
    expect(() => validateSourceSettingsSection({
      configuration: { url: 'https://catalog.example.com:8443', port: 443 },
    })).toThrow(SourceSettingsValidationError)
  })
})

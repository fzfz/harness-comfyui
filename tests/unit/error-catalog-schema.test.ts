import { describe, expect, it } from 'vitest'
import input from '../../config/error-catalog.json' with { type: 'json' }
import { parseErrorCatalog } from '../../config/error-catalog-schema.ts'
import { parseBaseModelResult } from '../../src/catalog/contract.ts'
import { catalogFailureText } from '../../src/client/workbench/contract.ts'

describe('error catalog diagnostics', () => {
  it('accepts the shared catalog and preserves connection diagnostics beyond the old 1000-character limit', () => {
    expect(parseErrorCatalog(input)).toEqual(input)
    const message = 'Source http://127.0.0.1:18093: ' + 'ECONNREFUSED '.repeat(100)
    expect(parseBaseModelResult({ ok: false, error: { code: 'CATALOG_QUERY_FAILED', message } }))
      .toEqual({ ok: false, error: { code: 'CATALOG_QUERY_FAILED', message } })
    expect(catalogFailureText(Object.assign(new Error(message), { code: 'CATALOG_QUERY_FAILED' })))
      .toContain(message)
  })

  it.each([
    null, [],
    { X: null },
    { X: { ...input.CATALOG_REMOTE_FAILED, code: 'X', title: '' } },
    { X: { ...input.CATALOG_REMOTE_FAILED, code: 'OTHER' } },
    { X: { ...input.CATALOG_REMOTE_FAILED, code: 'X', cancellable: 'false' } },
    { X: { ...input.CATALOG_REMOTE_FAILED, code: 'X', diagnostic_template: '' } },
    { X: { ...input.CATALOG_REMOTE_FAILED, code: 'X', output_limit: 0 } },
    { X: { ...input.CATALOG_REMOTE_FAILED, code: 'X', message_limit: 1.5 } },
    { CATALOG_QUERY_FAILED: { ...input.CATALOG_QUERY_FAILED, diagnostic_template: '{url}' } },
    { COMFYUI_CONNECTION_FAILED: { ...input.COMFYUI_CONNECTION_FAILED, diagnostic_template: undefined } },
    { CATALOG_QUERY_FAILED: { ...input.CATALOG_QUERY_FAILED, message_limit: undefined } },
    { CATALOG_RESPONSE_TOO_LARGE: { ...input.CATALOG_RESPONSE_TOO_LARGE, output_limit: undefined } },
  ])('rejects invalid schema input %#', value => {
    expect(() => parseErrorCatalog(value)).toThrow(TypeError)
  })

  it('keeps an unknown frontend failure on the existing remote-failure guidance', () => {
    expect(catalogFailureText(null)).toContain(input.CATALOG_REMOTE_FAILED.next_step)
  })
})

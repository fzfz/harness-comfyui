import { describe, expect, it } from 'vitest'
import { BROWSER_SETTINGS_REMOTE } from '../../src/browser-settings/remote.ts'
import HARNESS_COMFYUI_REMOTE from '../../src/remote.ts'
import { parsePluginDataDirectory } from '../../src/plugin-storage-schema.ts'

describe('browser settings Remote wire contract', () => {
  it('includes both browser operations in the product Remote registration with cancellation', () => {
    for (const descriptor of BROWSER_SETTINGS_REMOTE.descriptors) {
      expect(HARNESS_COMFYUI_REMOTE.descriptors).toContain(descriptor)
      expect(descriptor.invocation).toEqual({ kind: 'direct' })
      expect(descriptor.cancellation).toEqual({ parameter: 'signal' })
    }
  })

  it('validates configuration responses and browser validation request/result at the wire boundary', () => {
    const [configuration, validation] = BROWSER_SETTINGS_REMOTE.descriptors
    const request = { browserExecutablePath: '/Applications/Browser With Spaces/browser' }
    expect(configuration.result.create().parse(JSON.parse(JSON.stringify(request)))).toEqual(request)
    const parameter = validation.parameters[0]!
    expect(parameter.codec.mode).toBe('strict')
    expect(parameter.codec.create().parse(JSON.parse(JSON.stringify(request)))).toEqual(request)
    expect(() => parameter.codec.create().parse({ ...request, unknown: true })).toThrow()
    expect(validation.result.create().parse({ ok: true, value: request })).toEqual({ ok: true, value: request })
    const failure = { ok: false, error: { code: 'BROWSER_EXECUTABLE_PATH_UNAVAILABLE', path: request.browserExecutablePath, reason: 'EACCES: permission denied' } }
    expect(validation.result.create().parse(JSON.parse(JSON.stringify(failure)))).toEqual(failure)
    expect(() => validation.result.create().parse({ ok: false, error: { ...failure.error, path: 'relative' } })).toThrow()
  })

  it.each([null, 3, {}, false])('rejects a non-string data directory %j', value => {
    expect(() => parsePluginDataDirectory(value)).toThrow('absolute writable data directory')
  })
})

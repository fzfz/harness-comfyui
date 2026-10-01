import { describe, expect, it, vi } from 'vitest'

import { createOfficialProfilePatchAdapter } from '../desktop/fixtures/official-profile-patch.mjs'

const PROFILE_PATCH_RULE = Object.freeze({
  entryId: 'webserver',
  hostField: 'host',
  portField: 'port',
})
const LOOPBACK_HOST = '127.0.0.1'
const SOURCE = 'deterministic parser input'
const ORIGINAL_PROFILE = [
  {
    id: 'provider',
    config: {
      name: 'openrouter',
      requestTemplate: { __jsExpr: 'function makeRequest(context) { return context.model }' },
    },
  },
  {
    id: 'webserver',
    config: { host: '0.0.0.0', port: 19387, path: '/api', pluginSetting: { enabled: true } },
  },
  { id: 'other-plugin', config: { enabled: false, nested: ['keep', 'as-is'] } },
]

function createAdapter({ document = ORIGINAL_PROFILE, parseError, ...options } = {}) {
  const parseYaml = vi.fn(async source => {
    if (parseError !== undefined) throw parseError
    if (source !== SOURCE) throw new SyntaxError('deterministic parser rejected input')
    return structuredClone(document)
  })
  const serializeYaml = vi.fn(async value => JSON.stringify(value))
  const adapter = createOfficialProfilePatchAdapter({
    profilePortPatch: PROFILE_PATCH_RULE,
    loopbackHost: LOOPBACK_HOST,
    parseYaml,
    serializeYaml,
    ...options,
  })
  return { adapter, parseYaml, serializeYaml }
}

describe('official Desktop profile patch adapter with deterministic parser injection', () => {
  it('injects the official YAML boundary and changes only the configured webserver host and port', async () => {
    const { adapter, parseYaml, serializeYaml } = createAdapter()
    const parsed = await adapter.parse(SOURCE)
    const updated = await adapter.updateProfilePatch(parsed, {
      entryId: 'webserver',
      config: { host: LOOPBACK_HOST, port: 41873 },
    })

    expect(parseYaml).toHaveBeenCalledExactlyOnceWith(SOURCE)
    expect(parsed).toEqual(ORIGINAL_PROFILE)
    expect(updated).not.toBe(parsed)
    expect(updated).toEqual([
      ORIGINAL_PROFILE[0],
      {
        ...ORIGINAL_PROFILE[1],
        config: { ...ORIGINAL_PROFILE[1].config, host: LOOPBACK_HOST, port: 41873 },
      },
      ORIGINAL_PROFILE[2],
    ])
    expect(updated[0].config.requestTemplate).toEqual({
      __jsExpr: 'function makeRequest(context) { return context.model }',
    })
    expect(updated[1].config).toMatchObject({ path: '/api', pluginSetting: { enabled: true } })

    const serialized = await adapter.serialize(updated)
    expect(serializeYaml).toHaveBeenCalledExactlyOnceWith(updated)
    expect(JSON.parse(serialized)).toEqual(updated)
  })

  it('rejects a duplicate target entry instead of choosing one', async () => {
    const { adapter } = createAdapter({ document: [
      { id: 'plugin-group', group: true, config: [{ id: 'webserver', config: { host: '127.0.0.1', port: 1 } }] },
      { id: 'webserver', config: { host: '127.0.0.1', port: 2 } },
    ] })
    const document = await adapter.parse(SOURCE)

    await expect(adapter.updateProfilePatch(document, {
      entryId: 'webserver',
      config: { host: LOOPBACK_HOST, port: 41873 },
    })).rejects.toThrow(/webserver.*more than once/u)
  })

  it('rejects a missing target entry', async () => {
    const { adapter } = createAdapter({ document: [{ id: 'provider', config: {} }] })
    const document = await adapter.parse(SOURCE)

    await expect(adapter.updateProfilePatch(document, {
      entryId: 'webserver',
      config: { host: LOOPBACK_HOST, port: 41873 },
    })).rejects.toThrow(/webserver.*not found/u)
  })

  it('rejects a target whose config is not a mapping', async () => {
    const { adapter } = createAdapter({ document: [{ id: 'webserver', config: [] }] })
    const document = await adapter.parse(SOURCE)

    await expect(adapter.updateProfilePatch(document, {
      entryId: 'webserver',
      config: { host: LOOPBACK_HOST, port: 41873 },
    })).rejects.toThrow(/webserver\.config must be an object/u)
  })

  it.each([
    ['non-array document', { id: 'webserver', config: {} }],
    ['null entry', [null]],
    ['array entry', [[]]],
    ['invalid entry id', [{ id: 42 }]],
  ])('rejects a malformed profile shape: %s', async (_label, document) => {
    const { adapter } = createAdapter({ document })

    await expect(adapter.parse(SOURCE)).rejects.toThrow(/profile .*must be/u)
  })

  it('rejects malformed or unknown patch fields while preserving unrelated existing config fields', async () => {
    const { adapter, serializeYaml } = createAdapter()
    const document = await adapter.parse(SOURCE)
    const invalidPatches = [
      { host: LOOPBACK_HOST },
      { host: LOOPBACK_HOST, port: 41873, path: '/replacement' },
      { host: '0.0.0.0', port: 41873 },
      { host: LOOPBACK_HOST, port: 0 },
      { host: LOOPBACK_HOST, port: 1.5 },
    ]

    for (const config of invalidPatches) {
      await expect(adapter.updateProfilePatch(document, { entryId: 'webserver', config }))
        .rejects.toThrow(/profile patch config/u)
    }
    expect(serializeYaml).not.toHaveBeenCalled()
  })

  it('rejects an update for a different entry id or unknown update arguments', async () => {
    const { adapter } = createAdapter()
    const document = await adapter.parse(SOURCE)

    await expect(adapter.updateProfilePatch(document, {
      entryId: 'provider',
      config: { host: LOOPBACK_HOST, port: 41873 },
    })).rejects.toThrow(/must target webserver/u)
    await expect(adapter.updateProfilePatch(document, {
      entryId: 'webserver',
      config: { host: LOOPBACK_HOST, port: 41873 },
      unexpected: true,
    })).rejects.toThrow(/unexpected/u)
  })

  it('does not fall back when an injected parser rejects malicious or invalid YAML', async () => {
    const failure = new SyntaxError('unknown YAML tag: !!python/object/apply')
    const maliciousYaml = '!!python/object/apply:os.system [touch, /tmp/pwned]'
    const { adapter, parseYaml, serializeYaml } = createAdapter({ parseError: failure })

    await expect(adapter.parse(maliciousYaml)).rejects.toBe(failure)
    expect(parseYaml).toHaveBeenCalledExactlyOnceWith(maliciousYaml)
    expect(serializeYaml).not.toHaveBeenCalled()
  })

  it('rejects cyclic group entries returned by the parser', async () => {
    const cyclicProfile = [{ id: 'group', group: true }]
    cyclicProfile[0].config = cyclicProfile
    const { adapter } = createAdapter({ document: cyclicProfile })

    await expect(adapter.parse(SOURCE)).rejects.toThrow(/must not contain cycles/u)
  })

  it('requires explicit parser functions and rejects unknown adapter configuration fields', () => {
    expect(() => createOfficialProfilePatchAdapter({
      profilePortPatch: PROFILE_PATCH_RULE,
      loopbackHost: LOOPBACK_HOST,
      parseYaml: () => [],
    })).toThrow(/serializeYaml/u)

    expect(() => createAdapter({ silentFallback: true })).toThrow(/unexpected.*silentFallback/u)
    expect(() => createOfficialProfilePatchAdapter({
      profilePortPatch: { ...PROFILE_PATCH_RULE, unexpected: true },
      loopbackHost: LOOPBACK_HOST,
      parseYaml: () => [],
      serializeYaml: () => '',
    })).toThrow(/profilePortPatch.*unexpected/u)
  })
})

describe('official profile parser loading', () => {
  it('uses the public include schema for both loading and saving', async () => {
    const { loadOfficialProfilePatchAdapter } = await import('../desktop/fixtures/official-profile-patch.mjs')
    const schema = Symbol('official entry list schema')
    const load = vi.fn(() => structuredClone(ORIGINAL_PROFILE))
    const dump = vi.fn(() => 'saved profile')
    const loadModule = vi.fn(async name => {
      if (name === '@deepseek-ai/cordis-plugin-include') return { entryListSchema: schema }
      if (name === 'js-yaml') return { load, dump }
      throw new Error('unexpected dependency')
    })
    const adapter = await loadOfficialProfilePatchAdapter({
      profilePortPatch: PROFILE_PATCH_RULE,
      ports: { host: LOOPBACK_HOST },
    }, loadModule)
    const parsed = await adapter.parse('profile YAML')
    await adapter.serialize(parsed)
    expect(loadModule.mock.calls.map(([name]) => name)).toEqual([
      '@deepseek-ai/cordis-plugin-include', 'js-yaml',
    ])
    expect(load).toHaveBeenCalledExactlyOnceWith('profile YAML', { schema })
    expect(dump).toHaveBeenCalledExactlyOnceWith(parsed, { schema })
  })

  it('reports unavailable dependencies with an actionable error and omits loader details', async () => {
    const { loadOfficialProfilePatchAdapter } = await import('../desktop/fixtures/official-profile-patch.mjs')
    await expect(loadOfficialProfilePatchAdapter({
      profilePortPatch: PROFILE_PATCH_RULE,
      ports: { host: LOOPBACK_HOST },
    }, async () => { throw new Error('private loader details') }))
      .rejects.toMatchObject({
        code: 'OFFICIAL_PROFILE_PARSER_UNAVAILABLE',
        message: expect.not.stringContaining('private loader details'),
      })
  })

  it.each([
    [{}, { load() {}, dump() {} }],
    [{ entryListSchema: {} }, { dump() {} }],
    [{ entryListSchema: {} }, { load() {} }],
  ])('rejects incomplete public parser exports', async (include, yaml) => {
    const { loadOfficialProfilePatchAdapter } = await import('../desktop/fixtures/official-profile-patch.mjs')
    await expect(loadOfficialProfilePatchAdapter({
      profilePortPatch: PROFILE_PATCH_RULE,
      ports: { host: LOOPBACK_HOST },
    }, async name => name === 'js-yaml' ? yaml : include))
      .rejects.toMatchObject({ code: 'OFFICIAL_PROFILE_PARSER_UNAVAILABLE' })
  })
})

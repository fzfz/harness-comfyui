import { describe, expect, it } from 'vitest'

import { CliShellCapabilityStore } from '../../src/host/cli/shell-capability.ts'

function execution(overrides: Record<string, unknown> = {}) {
  const token = Symbol('shell-call')
  return {
    token,
    callId: 'call_shell_1',
    name: 'bash',
    arguments: { command: 'node cli.mjs catalog instance list', description: 'List instances' },
    signal: new AbortController().signal,
    agent: {
      session: {
        id: 'session-1',
        header: { cwd: '/workspace' },
        snapshotEvents: () => [{
          type: 'tool/call',
          data: { callId: 'call_shell_1', name: 'bash', turn: 4 },
        }],
      },
    },
    ...overrides,
  } as never
}

describe('CLI shell capability', () => {
  const sourceOptions = {
    semanticQueryCliPath: '/repo/scripts/source-client/imagegen-semantic-query.mjs',
    sourceAddress: () => ({ url: 'https://catalog.example.com', port: 18093 }),
  }

  it('binds one opaque capability to the current foreground shell call and revokes it', () => {
    const store = new CliShellCapabilityStore({
      cliPath: '/repo/scripts/cli/harness-comfyui.mjs',
      apiUrl: 'http://127.0.0.1:4173/api/harness-comfyui/cli/v1',
      ...sourceOptions,
      createCapability: () => 'capability-1',
    })
    const exec = execution()

    const environment = store.environment(exec)

    expect(environment).toEqual({
      DSH_HARNESS_COMFYUI_CLI: '/repo/scripts/cli/harness-comfyui.mjs',
      DSH_HARNESS_COMFYUI_CLI_API: 'http://127.0.0.1:4173/api/harness-comfyui/cli/v1',
      DSH_HARNESS_COMFYUI_CLI_CAPABILITY: 'capability-1',
      DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI: '/repo/scripts/source-client/imagegen-semantic-query.mjs',
      DSH_HARNESS_COMFYUI_SOURCE_URL: 'https://catalog.example.com',
      DSH_HARNESS_COMFYUI_SOURCE_PORT: '18093',
    })
    expect(store.environment(exec)).toEqual(environment)
    expect(store.authorize('capability-1')).toEqual({
      sessionId: 'session-1',
      turn: 4,
      callId: 'call_shell_1',
      cwd: '/workspace',
    })

    store.revoke(exec)
    expect(store.authorize('capability-1')).toBeUndefined()
  })

  it('does not issue capabilities to background, agentless, or ambiguous shell calls', () => {
    const store = new CliShellCapabilityStore({
      cliPath: '/repo/scripts/cli/harness-comfyui.mjs',
      apiUrl: 'http://127.0.0.1:4173/api/harness-comfyui/cli/v1',
      ...sourceOptions,
      createCapability: () => 'capability-1',
    })

    expect(store.environment(execution({ arguments: { run_in_background: true } }))).toEqual({})
    expect(store.environment(execution({ agent: undefined }))).toEqual({})
    expect(store.environment(execution({
      agent: { session: { id: 'session-1', header: { cwd: '/workspace' }, snapshotEvents: () => [] } },
    }))).toEqual({})
    expect(store.environment(execution({ name: 'skill' }))).toEqual({})
    expect(store.environment(execution({
      agent: {
        session: {
          id: 'session-1',
          header: { cwd: '/workspace' },
          snapshotEvents: () => [{ type: 'tool/call', data: { callId: 'call_shell_1', name: 'bash', turn: -1 } }],
        },
      },
    }))).toEqual({})
  })

  it('supports pwsh and rejects duplicate generated capabilities across executions', () => {
    const store = new CliShellCapabilityStore({
      cliPath: 'C:\\repo\\scripts\\cli\\harness-comfyui.mjs',
      apiUrl: 'http://127.0.0.1:4173/api/harness-comfyui/cli/v1',
      ...sourceOptions,
      createCapability: () => 'same-capability',
    })
    const first = execution({
      name: 'pwsh',
      agent: {
        session: {
          id: 'session-1',
          header: { cwd: 'C:\\workspace' },
          snapshotEvents: () => [{ type: 'tool/call', data: { callId: 'call_shell_1', name: 'pwsh', turn: 2 } }],
        },
      },
    })
    expect(store.environment(first).DSH_HARNESS_COMFYUI_CLI_CAPABILITY).toBe('same-capability')
    expect(store.authorize('same-capability')).toMatchObject({ cwd: 'C:\\workspace', turn: 2 })
    expect(() => store.environment(execution({ token: Symbol('second') }))).toThrow('capability generator')
  })

  it('rejects missing executable and endpoint configuration', () => {
    expect(() => new CliShellCapabilityStore({ cliPath: '', apiUrl: 'http://127.0.0.1', ...sourceOptions })).toThrow('CLI path')
    expect(() => new CliShellCapabilityStore({ cliPath: '/cli.mjs', apiUrl: '', ...sourceOptions })).toThrow('CLI API URL')
    expect(() => new CliShellCapabilityStore({
      cliPath: '/cli.mjs',
      apiUrl: 'http://127.0.0.1',
      ...sourceOptions,
      semanticQueryCliPath: '',
    })).toThrow('Semantic query CLI path')
  })

  it('creates a random capability when no generator is provided', () => {
    const store = new CliShellCapabilityStore({
      cliPath: '/repo/scripts/cli/harness-comfyui.mjs',
      apiUrl: 'http://127.0.0.1:4173/api/harness-comfyui/cli/v1',
      ...sourceOptions,
    })
    const capability = store.environment(execution()).DSH_HARNESS_COMFYUI_CLI_CAPABILITY
    expect(capability).toMatch(/^[A-Za-z0-9_-]{43}$/u)
    expect(store.authorize(capability!)).toBeDefined()
    store.revoke({ token: Symbol('unknown') } as never)
  })

  it('reads the current Source address whenever it resolves a foreground environment', () => {
    let address = { url: 'http://127.0.0.1', port: 18093 }
    const store = new CliShellCapabilityStore({
      cliPath: '/repo/scripts/cli/harness-comfyui.mjs',
      apiUrl: 'http://127.0.0.1:4173/api/harness-comfyui/cli/v1',
      semanticQueryCliPath: '/repo/scripts/source-client/imagegen-semantic-query.mjs',
      sourceAddress: () => address,
      createCapability: () => 'capability-1',
    })
    const exec = execution()

    expect(store.environment(exec)).toMatchObject({
      DSH_HARNESS_COMFYUI_SOURCE_URL: 'http://127.0.0.1',
      DSH_HARNESS_COMFYUI_SOURCE_PORT: '18093',
    })
    address = { url: 'https://catalog.example.com', port: 443 }
    expect(store.environment(exec)).toMatchObject({
      DSH_HARNESS_COMFYUI_SOURCE_URL: 'https://catalog.example.com',
      DSH_HARNESS_COMFYUI_SOURCE_PORT: '443',
    })
  })
  it('clears all capabilities and execution mappings on plugin shutdown', () => {
    let serial = 0
    const store = new CliShellCapabilityStore({ cliPath: '/cli.mjs', apiUrl: 'http://127.0.0.1', ...sourceOptions, createCapability: () => `capability-${++serial}` })
    const first = execution()
    const second = execution({ token: Symbol('second') })
    const a = store.environment(first).DSH_HARNESS_COMFYUI_CLI_CAPABILITY!
    const b = store.environment(second).DSH_HARNESS_COMFYUI_CLI_CAPABILITY!
    store.clear()
    expect(store.authorize(a)).toBeUndefined()
    expect(store.authorize(b)).toBeUndefined()
    expect(store.environment(first).DSH_HARNESS_COMFYUI_CLI_CAPABILITY).not.toBe(a)
  })

})

import { describe, expect, it } from 'vitest'

import * as agentEntrypoint from '../../src/agent.ts'
import * as hostEntrypoint from '../../src/index.ts'
import * as typesEntrypoint from '../../src/types.ts'

describe('public package entrypoints', () => {
  it('imports the Host, Agent, and type entrypoints safely with their public runtime shapes', () => {
    expect(Object.keys(hostEntrypoint).sort()).toEqual([
      'Config',
      'PluginStatusService',
      'apply',
      'inject',
      'name',
    ])
    expect(hostEntrypoint.name).toBe('harness-comfyui')
    expect(hostEntrypoint.inject).toEqual([])
    expect(typeof hostEntrypoint.apply).toBe('function')
    expect(typeof hostEntrypoint.PluginStatusService).toBe('function')
    expect(typeof hostEntrypoint.Config['~standard'].validate).toBe('function')

    expect(Object.keys(agentEntrypoint).sort()).toEqual([
      'apply',
      'inject',
      'name',
    ])
    expect(agentEntrypoint.name).toBe('harness-comfyui/agent')
    expect(agentEntrypoint.inject).toEqual(['tools'])
    expect(typeof agentEntrypoint.apply).toBe('function')

    expect(Object.keys(typesEntrypoint)).toEqual([])
  })
})

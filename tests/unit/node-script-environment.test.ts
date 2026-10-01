import { describe, expect, it } from 'vitest'

import nodeScriptRuntimeConfig from '../../config/node-script-runtime.json' with { type: 'json' }
import { parseNodeScriptRuntime } from '../../config/node-script-runtime-schema.ts'
import { nodeScriptEnvironment } from '../../src/host/node-script-environment.ts'

function withElectronRuntime<T>(operation: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(process.versions, 'electron')
  Object.defineProperty(process.versions, 'electron', { configurable: true, value: '0.2.0' })
  try {
    return operation()
  } finally {
    if (descriptor === undefined) Reflect.deleteProperty(process.versions, 'electron')
    else Object.defineProperty(process.versions, 'electron', descriptor)
  }
}

describe('node script runtime', () => {
  it('validates the configured Electron Node environment', () => {
    expect(parseNodeScriptRuntime(nodeScriptRuntimeConfig)).toEqual(nodeScriptRuntimeConfig)
    expect(() => parseNodeScriptRuntime({ schemaVersion: 1 })).toThrow(/electronNodeEnvironment/u)
    expect(() => parseNodeScriptRuntime({
      ...nodeScriptRuntimeConfig,
      electronNodeEnvironment: { ELECTRON_RUN_AS_NODE: 'true' },
    })).toThrow(/ELECTRON_RUN_AS_NODE/u)
    expect(() => parseNodeScriptRuntime({ ...nodeScriptRuntimeConfig, unexpected: true })).toThrow(/unexpected/u)
  })

  it('enables Electron Node mode for the Host executable and keeps existing module launches', () => {
    const inheritedValue = process.env.ELECTRON_RUN_AS_NODE
    process.env.ELECTRON_RUN_AS_NODE = 'inherited-value'
    try {
      withElectronRuntime(() => {
        const hostRuntime = nodeScriptEnvironment(process.execPath)
        const moduleRuntime = nodeScriptEnvironment('/plugin/source-client.mjs')

        expect(hostRuntime).not.toBe(process.env)
        expect(hostRuntime.ELECTRON_RUN_AS_NODE).toBe('1')
        expect(moduleRuntime.ELECTRON_RUN_AS_NODE).toBe('1')
        expect(process.env.ELECTRON_RUN_AS_NODE).toBe('inherited-value')
      })
    } finally {
      if (inheritedValue === undefined) delete process.env.ELECTRON_RUN_AS_NODE
      else process.env.ELECTRON_RUN_AS_NODE = inheritedValue
    }
  })

  it('leaves the inherited environment untouched outside Electron', () => {
    expect(nodeScriptEnvironment(process.execPath)).toBe(process.env)
  })
})

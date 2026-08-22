import { describe, expect, it } from 'vitest'

import { installModuleLoaderCapture } from '../../src/testing/browser-cdp.ts'

describe('browser ModuleLoader capture', () => {
  it('keeps capturing registrations after the loader replaces load and wraps each handoff once', () => {
    const state = {
      contexts: Object.create(null) as Record<string, unknown>,
      fibers: Object.create(null) as Record<string, unknown>,
      loadedModules: [] as string[],
    }
    const registrations: Array<{ receiver: unknown; id: string }> = []
    const loader: { load(handoff: { id: string }): void } = {
      load(handoff) {
        registrations.push({ receiver: this, id: handoff.id })
      },
    }
    const target: { __ModuleLoader__?: unknown } = {}
    installModuleLoaderCapture(target, state)
    target.__ModuleLoader__ = loader

    loader.load({ id: '@deepseek-ai/dsh-client-modules' })
    loader.load = function (handoff) {
      registrations.push({ receiver: this, id: handoff.id })
    }
    const handoff = {
      id: 'harness-comfyui',
      factory: () => ({ apply: async () => undefined }),
    }
    loader.load(handoff)
    const wrappedFactory = handoff.factory
    loader.load(handoff)

    expect(state.loadedModules).toEqual(['@deepseek-ai/dsh-client-modules', 'harness-comfyui'])
    expect(handoff.factory).toBe(wrappedFactory)
    expect(registrations).toEqual([
      { receiver: loader, id: '@deepseek-ai/dsh-client-modules' },
      { receiver: loader, id: 'harness-comfyui' },
      { receiver: loader, id: 'harness-comfyui' },
    ])
  })
})

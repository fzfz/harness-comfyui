import { describe, expect, it } from 'vitest'

import {
  browserScreenshotPath,
  browserWindowSizeArgument,
  installModuleLoaderCapture,
  runRealBrowserProbe,
} from '../../src/testing/browser-cdp.ts'

describe('browser viewport input', () => {
  it('accepts only an absolute PNG screenshot destination for the fixed desktop viewport', () => {
    expect(browserScreenshotPath('/tmp/workbench.png')).toBe('/tmp/workbench.png')
    expect(() => browserScreenshotPath('workbench.png')).toThrow('absolute')
    expect(() => browserScreenshotPath('/tmp/workbench.jpg')).toThrow('PNG')
  })

  it('rejects screenshot capture requests outside the single approved viewport before launching Chrome', async () => {
    await expect(runRealBrowserProbe(
      'about:blank',
      { viewport: { width: 1440, height: 960 }, screenshotPath: '/tmp/workbench.png' },
    )).rejects.toThrow('exact 1440x1000')
  })

  it('formats a validated custom viewport for the Chrome window-size argument', () => {
    expect(browserWindowSizeArgument({ width: 1440, height: 1000 })).toBe('--window-size=1440,1000')
  })

  it('keeps the default Chrome viewport at 1280 by 900', () => {
    expect(browserWindowSizeArgument()).toBe('--window-size=1280,900')
  })

  it.each([
    [null, 'must be an object containing exactly width and height'],
    [{ width: 1440 }, 'must contain exactly width and height'],
    [{ width: 1440, height: 960, scale: 2 }, 'must contain exactly width and height'],
    [{ width: 0, height: 960 }, 'width must be a positive integer'],
    [{ width: 1440.5, height: 960 }, 'width must be a positive integer'],
    [{ width: 1440, height: -1 }, 'height must be a positive integer'],
  ])('rejects invalid structured viewport input %#', (viewport, message) => {
    expect(() => browserWindowSizeArgument(viewport as never)).toThrow(message)
  })
})

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

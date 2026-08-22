import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { harnessComfyuiRemote } = vi.hoisted(() => ({
  harnessComfyuiRemote: { package: 'harness-comfyui', descriptors: [] },
}))

vi.mock('@deepseek-ai/dsh-client-runtime/client', () => ({
  defineStore: (definition: unknown) => definition,
}))
vi.mock('harness-comfyui/remote', () => ({
  default: harnessComfyuiRemote,
}))

import { apply, inject } from '../../src/client/index.tsx'

afterEach(() => vi.restoreAllMocks())

function createContext(options: { mountError?: Error } = {}) {
  const events: string[] = []
  const unmount = vi.fn(async () => undefined)
  const mount = vi.fn(async (_contribution: unknown) => {
    events.push('remote:mount')
    if (options.mountError !== undefined) throw options.mountError
    return async () => {
      events.push('remote:unmount')
      await unmount()
    }
  })
  const register = vi.fn(() => {
    events.push('root:register')
    return () => {
      events.push('root:dispose')
    }
  })
  const provide = vi.fn(() => {
    events.push('layout:provide')
    return async () => {
      events.push('layout:dispose')
    }
  })
  return {
    context: {
      remote: { $mount: mount },
      slots: { register },
      reflect: { provide },
    },
    mount,
    unmount,
    register,
    provide,
    events,
  }
}

describe('Client plugin Host projection', () => {
  it('exports the exact Issue #3 Client service inject contract', () => {
    expect(inject).toEqual(['slots', 'sessions', 'remote', 'theme', 'inputTriggers'])
  })

  it.each(inject)('waits for the public %s service before activating', async (missingService) => {
    const ctx = new Context()
    const unmount = vi.fn(async () => undefined)
    const mount = vi.fn(async () => unmount)
    const register = vi.fn(() => () => undefined)
    const disposers: Array<() => unknown> = []

    for (const service of inject) {
      if (service === missingService) continue
      const value = service === 'remote'
        ? { $mount: mount }
        : service === 'slots'
          ? { register }
          : {}
      disposers.push(ctx.provide(service, value))
    }

    const fiber = ctx.plugin({ name: 'harness-comfyui', inject, apply })
    expect(mount).not.toHaveBeenCalled()

    const value = missingService === 'remote'
      ? { $mount: mount }
      : missingService === 'slots'
        ? { register }
        : {}
    disposers.push(ctx.provide(missingService, value))
    await fiber

    expect(mount).toHaveBeenCalledOnce()
    await fiber.dispose()
    for (const dispose of disposers.reverse()) await dispose()
    await ctx.fiber.dispose()
  })

  it('mounts the generated Remote contribution, registers the project root, and unmounts once', async () => {
    const fixture = createContext()

    const dispose = await apply(fixture.context as never)

    expect(fixture.mount).toHaveBeenCalledOnce()
    expect(fixture.mount).toHaveBeenCalledWith(harnessComfyuiRemote)
    expect(fixture.events).toEqual([
      'remote:mount',
      'root:register',
      'layout:provide',
    ])
    expect(fixture.register).toHaveBeenCalledOnce()
    expect(fixture.register).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'root',
        children: {
          sidebar: { kind: 'single', scope: 'root' },
          conversation: { kind: 'single', scope: 'session-maybe' },
          details: { kind: 'single', scope: 'session' },
          'shell.overlay': { kind: 'list', scope: 'root' },
        },
      }),
      expect.any(Function),
    )

    await dispose()
    expect(fixture.unmount).toHaveBeenCalledOnce()
    expect(fixture.provide).toHaveBeenCalledWith('layout', expect.anything())
    expect(fixture.events).toEqual([
      'remote:mount',
      'root:register',
      'layout:provide',
      'layout:dispose',
      'root:dispose',
      'remote:unmount',
    ])
  })

  it('fails startup and does not register a slot when the generated contribution cannot mount', async () => {
    const fixture = createContext({ mountError: new Error('Remote contribution rejected') })

    await expect(apply(fixture.context as never)).rejects.toThrow(
      'Remote contribution rejected',
    )
    expect(fixture.register).not.toHaveBeenCalled()
    expect(fixture.unmount).not.toHaveBeenCalled()
  })
})

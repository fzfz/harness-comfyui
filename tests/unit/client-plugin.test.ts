import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

function createTestDocument() {
  const createStyle = () => {
    const values = new Map<string, string>()
    return {
      getPropertyPriority: () => '',
      getPropertyValue: (name: string) => values.get(name) ?? '',
      removeProperty: (name: string) => values.delete(name),
      setProperty: (name: string, value: string) => {
        values.set(name, value)
      },
    }
  }
  const createElement = () => {
    const attributes = new Map<string, string>()
    return {
      style: createStyle(),
      getAttribute: (name: string) => attributes.get(name) ?? null,
      hasAttribute: (name: string) => attributes.has(name),
      removeAttribute: (name: string) => attributes.delete(name),
      setAttribute: (name: string, value: string) => {
        attributes.set(name, value)
      },
    }
  }
  return { documentElement: createElement(), body: createElement() }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: createTestDocument(),
  })
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'document')
  vi.restoreAllMocks()
})

function createContext(options: { mountError?: Error } = {}) {
  const events: string[] = []
  const themeSnapshot = { active: { colorScheme: 'light' as const, tokens: {} } }
  const unmount = vi.fn(async () => undefined)
  const mount = vi.fn(async (_contribution: unknown) => {
    events.push('remote:mount')
    if (options.mountError !== undefined) throw options.mountError
    return async () => {
      events.push('remote:unmount')
      await unmount()
    }
  })
  const register = vi.fn((options: { name?: string }) => {
    events.push(`${options.name ?? 'unknown'}:register`)
    return () => {
      events.push(`${options.name ?? 'unknown'}:dispose`)
    }
  })
  const inject = vi.fn((name: string, callback: () => () => void) => {
    events.push(`${name}:inject`)
    return callback()
  })
  const provide = vi.fn(() => {
    events.push('layout:provide')
    return async () => {
      events.push('layout:dispose')
    }
  })
  const getTheme = vi.fn(() => {
    events.push('theme:get')
    return themeSnapshot
  })
  const on = vi.fn((_event: string, _listener: (snapshot: typeof themeSnapshot) => void) => {
    events.push('theme:subscribe')
    return () => {
      events.push('theme:unsubscribe')
    }
  })
  return {
    context: {
      remote: { $mount: mount },
      slots: { register, inject },
      reflect: { provide },
      theme: { getTheme },
      on,
    },
    mount,
    unmount,
    register,
    inject,
    provide,
    getTheme,
    on,
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
    const injectSlot = vi.fn((_name: string, callback: () => () => void) => callback())
    const disposers: Array<() => unknown> = []

    for (const service of inject) {
      if (service === missingService) continue
      const value = service === 'remote'
        ? { $mount: mount }
        : service === 'slots'
          ? { register, inject: injectSlot }
          : service === 'theme'
            ? { getTheme: () => ({ active: { colorScheme: 'light' as const, tokens: {} } }) }
          : {}
      disposers.push(ctx.provide(service, value))
    }

    const fiber = ctx.plugin({ name: 'harness-comfyui', inject, apply })
    expect(mount).not.toHaveBeenCalled()

    const value = missingService === 'remote'
      ? { $mount: mount }
      : missingService === 'slots'
        ? { register, inject: injectSlot }
        : missingService === 'theme'
          ? { getTheme: () => ({ active: { colorScheme: 'light' as const, tokens: {} } }) }
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
      'sidebar:register',
      'conversation.session.header:inject',
      'conversation.session.header:register',
      'conversation.view:inject',
      'conversation.view:register',
      'layout:provide',
      'theme:get',
      'theme:subscribe',
    ])
    expect(fixture.register).toHaveBeenCalledTimes(4)
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
    expect(fixture.register).toHaveBeenNthCalledWith(
      3,
      { name: 'conversation.session.header', priority: -10 },
      expect.any(Function),
    )
    expect(fixture.register).toHaveBeenNthCalledWith(
      4,
      { name: 'conversation.view', id: 'chat', order: 0, priority: -10 },
      expect.any(Function),
    )
    expect(fixture.register).toHaveBeenNthCalledWith(
      2,
      { name: 'sidebar', priority: -10 },
      expect.any(Function),
    )

    await dispose()
    expect(fixture.unmount).toHaveBeenCalledOnce()
    expect(fixture.provide).toHaveBeenCalledWith('layout', expect.anything())
    expect(fixture.events).toEqual([
      'remote:mount',
      'root:register',
      'sidebar:register',
      'conversation.session.header:inject',
      'conversation.session.header:register',
      'conversation.view:inject',
      'conversation.view:register',
      'layout:provide',
      'theme:get',
      'theme:subscribe',
      'theme:unsubscribe',
      'layout:dispose',
      'conversation.view:dispose',
      'conversation.session.header:dispose',
      'sidebar:dispose',
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

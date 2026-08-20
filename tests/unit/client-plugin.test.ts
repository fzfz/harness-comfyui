import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-runtime/client', () => ({
  defineStore: (definition: unknown) => definition,
}))

import { applyWithRemote } from '../../src/client/index.tsx'

afterEach(() => vi.restoreAllMocks())

function createContext(options: { mountError?: Error } = {}) {
  const unmount = vi.fn(async () => undefined)
  const mount = vi.fn(async () => {
    if (options.mountError !== undefined) throw options.mountError
    return unmount
  })
  const register = vi.fn(() => () => undefined)
  const inject = vi.fn((_name: string, callback: () => unknown) => callback())
  return {
    context: {
      remote: { $mount: mount },
      slots: { inject, register },
    },
    mount,
    unmount,
    inject,
    register,
  }
}

describe('Client plugin Host projection', () => {
  it('mounts the generated Remote contribution before registering details and unmounts it', async () => {
    const fixture = createContext()

    const dispose = await applyWithRemote(fixture.context as never, {} as never)

    expect(fixture.mount).toHaveBeenCalledOnce()
    expect(fixture.inject).toHaveBeenCalledAfter(fixture.mount)
    expect(fixture.register).toHaveBeenCalledOnce()

    await dispose()
    expect(fixture.unmount).toHaveBeenCalledOnce()
  })

  it('fails startup and does not register a slot when the generated contribution cannot mount', async () => {
    const fixture = createContext({ mountError: new Error('Remote contribution rejected') })

    await expect(applyWithRemote(fixture.context as never, {} as never)).rejects.toThrow(
      'Remote contribution rejected',
    )
    expect(fixture.inject).not.toHaveBeenCalled()
    expect(fixture.unmount).not.toHaveBeenCalled()
  })
})

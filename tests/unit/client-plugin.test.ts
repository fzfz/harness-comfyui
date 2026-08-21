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

import { apply } from '../../src/client/index.tsx'

afterEach(() => vi.restoreAllMocks())

function createContext(options: { mountError?: Error } = {}) {
  const unmount = vi.fn(async () => undefined)
  const mount = vi.fn(async (_contribution: unknown) => {
    if (options.mountError !== undefined) throw options.mountError
    return unmount
  })
  const register = vi.fn(() => () => undefined)
  const inject = vi.fn()
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
  it('mounts the generated Remote contribution without changing native slots and unmounts once', async () => {
    const fixture = createContext()

    const dispose = await apply(fixture.context as never)

    expect(fixture.mount).toHaveBeenCalledOnce()
    expect(fixture.mount).toHaveBeenCalledWith(harnessComfyuiRemote)
    expect(fixture.inject).not.toHaveBeenCalled()
    expect(fixture.register).not.toHaveBeenCalled()

    await dispose()
    expect(fixture.unmount).toHaveBeenCalledOnce()
  })

  it('fails startup and does not register a slot when the generated contribution cannot mount', async () => {
    const fixture = createContext({ mountError: new Error('Remote contribution rejected') })

    await expect(apply(fixture.context as never)).rejects.toThrow(
      'Remote contribution rejected',
    )
    expect(fixture.inject).not.toHaveBeenCalled()
    expect(fixture.unmount).not.toHaveBeenCalled()
  })
})

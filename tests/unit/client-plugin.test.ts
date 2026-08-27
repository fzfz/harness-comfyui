import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: () => null,
  IconCheckOutline16: () => null,
  IconChevronDownOutline14: () => null,
  IconChevronLeftOutline14: () => null,
  IconChevronRightOutline14: () => null,
  IconCloseOutline16: () => null,
  IconSearchOutline16: () => null,
  IconSparkle16: () => null,
  Input: () => null,
  Menu: () => null,
  Modal: () => null,
  Pill: () => null,
}))

import { apply, inject, name } from '../../src/client/index.tsx'
import {
  WORKBENCH_DOCK_ID,
  WORKBENCH_ENTRY_ID,
  WORKBENCH_RESULTS_OVERLAY_ID,
} from '../../src/client/workbench/contract.ts'

type Registration = {
  name: string
  id: string
  order: number
  inject: (...args: never[]) => unknown
}

class MemoryStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function installImmediateInject(context: Record<string, any>): void {
  context.get = vi.fn((service: string) => {
    if (service === 'remote.harnessComfyuiCatalog') return context.remote.harnessComfyuiCatalog
    if (service === 'remote.harnessComfyuiGeneration') return context.remote.harnessComfyuiGeneration
    return undefined
  })
  context.inject = vi.fn((_services: readonly string[], callback: (scope: unknown) => unknown) => {
    let effects: Array<() => void | Promise<void>> = []
    let failure: unknown
    try {
      const value = callback(context)
      effects = Array.isArray(value) ? value : []
    } catch (error) {
      failure = error
    }
    return {
      dispose: vi.fn(async () => {
        for (const dispose of [...effects].reverse()) await dispose()
      }),
      then(resolve: (value: undefined) => void, reject: (error: unknown) => void) {
        if (failure === undefined) resolve(undefined)
        else reject(failure)
      },
    }
  })
}

describe('Harness Client plugin registration', () => {
  it('registers only the supported additive native seats', async () => {
    const registrationDisposers = new Map<string, ReturnType<typeof vi.fn>>()
    const injectionDisposers = new Map<string, ReturnType<typeof vi.fn>>()
    const registrations = new Map<string, Registration>()

    const register = vi.fn((registration: Registration) => {
      registrations.set(registration.name, registration)
      const dispose = vi.fn()
      registrationDisposers.set(registration.name, dispose)
      return dispose
    })
    const slotInject = vi.fn((slotName: string, setup: () => () => void) => {
      const disposeRegistration = setup()
      const disposeInjection = vi.fn(() => disposeRegistration())
      injectionDisposers.set(slotName, disposeInjection)
      return disposeInjection
    })
    const sessionContext = { sessionId: 'session-1' }
    const sessionInput = { state: { getSnapshot: vi.fn() } }
    const scope = vi.fn(() => sessionContext)
    const inputFor = vi.fn(() => sessionInput)
    const remoteDispose = vi.fn()
    const remoteSearch = vi.fn(async () => ({
      ok: true,
      value: { ok: true, value: { kind: 'model', query: '', page: 1, items: [], totalCount: 0 } },
    }))
    const remoteBaseModels = vi.fn(async () => ({
      ok: true,
      value: { ok: true, value: { items: [{ id: '2', label: 'wai' }] } },
    }))
    const remoteGenerationList = vi.fn(async () => ({
      ok: true,
      value: { sessionId: 'session-1', runs: [], media: [], hasActiveRuns: false, refreshAfterMs: 1000 },
    }))

    const context = {
      slots: { inject: slotInject, register },
      sessions: { scope },
      conversation: { input: { for: inputFor } },
      remote: {
        $mount: vi.fn(async () => remoteDispose),
        harnessComfyuiCatalog: { search: remoteSearch, baseModels: remoteBaseModels },
        harnessComfyuiGeneration: { list: remoteGenerationList },
      },
      layout: { openDetails: vi.fn(), closeDetails: vi.fn(), toggleSidebar: vi.fn() },
    }
    installImmediateInject(context)
    const dispose = await apply(context as never)

    expect(name).toBe('harness-comfyui')
    expect(inject).toEqual(['slots', 'sessions', 'conversation', 'remote', 'layout'])
    expect([...registrations.keys()]).toEqual([
      'sidebar.footer.action',
      'conversation.input.dock',
      'details',
      'shell.overlay',
    ])
    expect(registrations.get('sidebar.footer.action')).toMatchObject({
      id: WORKBENCH_ENTRY_ID,
      order: 10,
    })
    expect(registrations.get('conversation.input.dock')).toMatchObject({
      id: WORKBENCH_DOCK_ID,
      order: 20,
    })
    expect(registrations.get('details')).toMatchObject({ priority: -10 })
    expect(registrations.get('shell.overlay')).toMatchObject({
      id: WORKBENCH_RESULTS_OVERLAY_ID,
      order: 20,
    })

    const entryFace = registrations.get('sidebar.footer.action')!.inject()
    const dockFace = registrations.get('conversation.input.dock')!.inject('session-1' as never)
    const detailsFace = registrations.get('details')!.inject('session-1' as never)
    const overlayFace = registrations.get('shell.overlay')!.inject()
    expect(entryFace).toMatchObject({ workbench: expect.any(Object) })
    expect(dockFace).toMatchObject({
      catalog: expect.objectContaining({ search: expect.any(Function), baseModels: expect.any(Function) }),
      sessionId: 'session-1',
      dialogNavigation: expect.objectContaining({
        getSnapshot: expect.any(Function),
        subscribe: expect.any(Function),
        update: expect.any(Function),
      }),
      workbench: expect.any(Object),
      sessionInput,
    })
    expect(detailsFace).toMatchObject({ workbench: expect.any(Object), generationStore: expect.any(Object) })
    expect(overlayFace).toMatchObject({ workbench: expect.any(Object) })
    expect(scope).toHaveBeenCalledWith('session-1')
    expect(inputFor).toHaveBeenCalledWith(sessionContext)
    const sessionTwoDock = registrations.get('conversation.input.dock')!.inject('session-2' as never) as {
      dialogNavigation: {
        getSnapshot: () => { state: { currentPage: number } }
        update: (updater: (state: Record<string, unknown>) => Record<string, unknown>) => void
      }
    }
    const sessionOneNavigation = (dockFace as { dialogNavigation: typeof sessionTwoDock.dialogNavigation }).dialogNavigation
    sessionOneNavigation.update(state => ({ ...state, currentPage: 2 }))
    expect(sessionOneNavigation.getSnapshot().state.currentPage).toBe(2)
    expect(sessionTwoDock.dialogNavigation.getSnapshot().state.currentPage).toBe(1)
    const catalog = (dockFace as { catalog: { search: Function; baseModels: Function } }).catalog
    await expect(catalog.search(
      { kind: 'model', query: '', page: 1, baseModelId: null },
      new AbortController().signal,
    )).resolves.toEqual({ kind: 'model', query: '', page: 1, items: [], totalCount: 0 })
    await expect(catalog.baseModels(new AbortController().signal))
      .resolves.toEqual({ items: [{ id: '2', label: 'wai' }] })
    const generationStore = (detailsFace as { generationStore: { subscribe: Function; getSnapshot: Function } }).generationStore
    const stopGeneration = generationStore.subscribe('session-1', vi.fn())
    await vi.waitFor(() => expect(remoteGenerationList).toHaveBeenCalledOnce())
    expect(generationStore.getSnapshot('session-1').projection.sessionId).toBe('session-1')
    stopGeneration()

    await dispose()

    expect(injectionDisposers.get('conversation.input.dock')).toHaveBeenCalledOnce()
    expect(injectionDisposers.get('sidebar.footer.action')).toHaveBeenCalledOnce()
    expect(injectionDisposers.get('details')).toHaveBeenCalledOnce()
    expect(injectionDisposers.get('shell.overlay')).toHaveBeenCalledOnce()
    expect(registrationDisposers.get('conversation.input.dock')).toHaveBeenCalledOnce()
    expect(registrationDisposers.get('sidebar.footer.action')).toHaveBeenCalledOnce()
    expect(registrationDisposers.get('details')).toHaveBeenCalledOnce()
    expect(registrationDisposers.get('shell.overlay')).toHaveBeenCalledOnce()
    expect(remoteDispose).toHaveBeenCalledOnce()
  })

  it('registers the Session dock when reading the browser localStorage property throws', async () => {
    const registrations = new Map<string, Registration>()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => { throw new DOMException('storage access denied', 'SecurityError') },
    })
    const context = {
      slots: {
        inject: (_slotName: string, setup: () => () => void) => setup(),
        register: (registration: Registration) => {
          registrations.set(registration.name, registration)
          return vi.fn()
        },
      },
      sessions: { scope: vi.fn(() => ({ sessionId: 'session-1' })) },
      conversation: { input: { for: vi.fn(() => ({})) } },
      remote: {
        $mount: vi.fn(async () => vi.fn()),
        harnessComfyuiCatalog: { search: vi.fn(), baseModels: vi.fn() },
        harnessComfyuiGeneration: { list: vi.fn() },
      },
      layout: { openDetails: vi.fn(), closeDetails: vi.fn(), toggleSidebar: vi.fn() },
    }
    installImmediateInject(context)

    const dispose = await apply(context as never)
    const dock = registrations.get('conversation.input.dock')!.inject('session-1' as never) as {
      dialogNavigation: { getSnapshot: () => { persistenceErrorCode: string | null } }
    }

    expect(dock.dialogNavigation.getSnapshot().persistenceErrorCode)
      .toBe('CONTEXT_DIALOG_NAVIGATION_STORAGE_FAILED')
    await dispose()
  })

  it('fails loudly when Harness renders a Session dock without a Session scope', async () => {
    const registrations = new Map<string, Registration>()
    const context = {
      slots: {
        inject: (_slotName: string, setup: () => () => void) => setup(),
        register: (registration: Registration) => {
          registrations.set(registration.name, registration)
          return vi.fn()
        },
      },
      sessions: { scope: vi.fn(() => undefined) },
      conversation: { input: { for: vi.fn() } },
      remote: {
        $mount: vi.fn(async () => vi.fn()),
        harnessComfyuiCatalog: { search: vi.fn(), baseModels: vi.fn() },
      },
      layout: { openDetails: vi.fn(), closeDetails: vi.fn(), toggleSidebar: vi.fn() },
    }
    installImmediateInject(context)

    const dispose = await apply(context as never)
    expect(() => registrations.get('conversation.input.dock')!.inject('missing' as never))
      .toThrow('Harness did not provide the Session scope for missing.')
    await dispose()
  })

  it('rolls back the Remote mount when a later registration fails', async () => {
    const remoteDispose = vi.fn()
    const context = {
      slots: { inject: vi.fn(() => { throw new Error('registration failed') }), register: vi.fn() },
      sessions: { scope: vi.fn() },
      conversation: { input: { for: vi.fn() } },
      remote: {
        $mount: vi.fn(async () => remoteDispose),
        harnessComfyuiCatalog: { search: vi.fn(), baseModels: vi.fn() },
      },
      layout: { openDetails: vi.fn(), closeDetails: vi.fn(), toggleSidebar: vi.fn() },
    }
    installImmediateInject(context)

    await expect(apply(context as never)).rejects.toThrow('registration failed')
    expect(remoteDispose).toHaveBeenCalledOnce()
  })

  it('maps Remote failures and cancellation to rejected catalog queries', async () => {
    const registrations = new Map<string, Registration>()
    const remoteFailure = vi.fn(async () => ({
      ok: false,
      error: { code: 'remote-failed', message: 'failed', details: {} },
    }))
    const context = {
      slots: {
        inject: (_slotName: string, setup: () => () => void) => setup(),
        register: (registration: Registration) => {
          registrations.set(registration.name, registration)
          return vi.fn()
        },
      },
      sessions: { scope: vi.fn(() => ({ sessionId: 'session-1' })) },
      conversation: { input: { for: vi.fn(() => ({})) } },
      remote: {
        $mount: vi.fn(async () => vi.fn()),
        harnessComfyuiCatalog: { search: remoteFailure, baseModels: remoteFailure },
      },
      layout: { openDetails: vi.fn(), closeDetails: vi.fn(), toggleSidebar: vi.fn() },
    }
    installImmediateInject(context)
    const dispose = await apply(context as never)
    const dock = registrations.get('conversation.input.dock')!.inject('session-1' as never) as {
      catalog: { search: Function; baseModels: Function }
    }
    await expect(dock.catalog.search(
      { kind: 'model', query: '', page: 1, baseModelId: null },
      new AbortController().signal,
    ))
      .rejects.toThrow('remote-failed')
    await expect(dock.catalog.baseModels(new AbortController().signal)).rejects.toThrow('remote-failed')

    const controller = new AbortController()
    controller.abort()
    await expect(dock.catalog.search(
      { kind: 'model', query: '', page: 1, baseModelId: null },
      controller.signal,
    ))
      .rejects.toMatchObject({ name: 'AbortError' })
    await dispose()
  })

  it('preserves Catalog business error codes and messages returned by the Host service', async () => {
    const registrations = new Map<string, Registration>()
    const catalogFailure = vi.fn(async () => ({
      ok: true,
      value: {
        ok: false,
        error: { code: 'CATALOG_PROTOCOL_ERROR', message: 'Catalog template parameter is invalid.' },
      },
    }))
    const context = {
      slots: {
        inject: (_slotName: string, setup: () => () => void) => setup(),
        register: (registration: Registration) => {
          registrations.set(registration.name, registration)
          return vi.fn()
        },
      },
      sessions: { scope: vi.fn(() => ({ sessionId: 'session-1' })) },
      conversation: { input: { for: vi.fn(() => ({})) } },
      remote: {
        $mount: vi.fn(async () => vi.fn()),
        harnessComfyuiCatalog: { search: catalogFailure, baseModels: catalogFailure },
        harnessComfyuiGeneration: { list: vi.fn() },
      },
      layout: { openDetails: vi.fn(), closeDetails: vi.fn(), toggleSidebar: vi.fn() },
    }
    installImmediateInject(context)
    const dispose = await apply(context as never)
    const dock = registrations.get('conversation.input.dock')!.inject('session-1' as never) as {
      catalog: { search: Function; baseModels: Function }
    }

    await expect(dock.catalog.search(
      { kind: 'comfyui-template', query: '', page: 1, baseModelId: null },
      new AbortController().signal,
    )).rejects.toMatchObject({
      code: 'CATALOG_PROTOCOL_ERROR',
      message: 'Catalog template parameter is invalid.',
    })
    await expect(dock.catalog.baseModels(new AbortController().signal)).rejects.toMatchObject({
      code: 'CATALOG_PROTOCOL_ERROR',
      message: 'Catalog template parameter is invalid.',
    })
    await dispose()
  })
})

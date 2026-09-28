import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, vi } from 'vitest'

import { CatalogRemoteService } from '../../src/host/catalog/catalog-service.ts'
import { CatalogCliError } from '../../src/host/catalog/catalog-cli.ts'

describe('Catalog Remote service', () => {
  it('registers its public Remote marker and delegates the cancellable query', async () => {
    const context = new Context()
    const controller = new AbortController()
    const page = { kind: 'model', query: '', page: 1, items: [], totalCount: 0 } as const
    const baseModelList = { items: [{ id: '2', label: 'wai' }] } as const
    const search = vi.fn(async () => page)
    const baseModels = vi.fn(async () => baseModelList)
    const details = vi.fn(async () => ({ kind: 'work', id: '1', fields: [] }))
    const readSourceAddress = vi.fn(() => ({ url: 'http://127.0.0.1', port: 8188 }))
    const service = new CatalogRemoteService(context, { search, baseModels, details } as never, readSourceAddress)

    expect(remoteMethods(service)).toEqual([
      { method: 'search', invocation: { kind: 'direct' } },
      { method: 'baseModels', invocation: { kind: 'direct' } },
      { method: 'sourceAddress', invocation: { kind: 'direct' } },
      { method: 'details', invocation: { kind: 'direct' } },
    ])
    const request = { kind: 'model', query: '', page: 1, baseModelId: null } as const
    await expect(service.search(request, controller.signal)).resolves.toEqual({ ok: true, value: page })
    expect(search).toHaveBeenCalledWith(request, controller.signal)
    await expect(service.baseModels(controller.signal)).resolves.toEqual({ ok: true, value: baseModelList })
    expect(baseModels).toHaveBeenCalledWith(controller.signal)
    await expect(service.sourceAddress(controller.signal)).resolves.toEqual({ ok: true, value: { url: 'http://127.0.0.1', port: 8188 } })
    expect(readSourceAddress).toHaveBeenCalledOnce()
    const cancelled = new AbortController()
    cancelled.abort()
    await expect(service.sourceAddress(cancelled.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(readSourceAddress).toHaveBeenCalledOnce()
    await expect(service.details({ kind: 'work', id: '1' }, controller.signal)).resolves.toEqual({ ok: true, value: { kind: 'work', id: '1', fields: [] } })
    expect(details).toHaveBeenCalledWith({ kind: 'work', id: '1' }, controller.signal)
    await context.fiber.dispose()
  })

  it('returns Catalog CLI failures with their stable code and message', async () => {
    const context = new Context()
    const failure = new CatalogCliError('CATALOG_PROTOCOL_ERROR', 'Catalog template parameter is invalid.')
    const service = new CatalogRemoteService(context, {
      details: vi.fn(async () => { throw failure }),
      search: vi.fn(async () => { throw failure }),
      baseModels: vi.fn(async () => { throw failure }),
    } as never, () => ({ url: 'http://127.0.0.1', port: 8188 }))

    await expect(service.search(
      { kind: 'comfyui-template', query: '', page: 1, baseModelId: null },
      new AbortController().signal,
    )).resolves.toEqual({
      ok: false,
      error: { code: 'CATALOG_PROTOCOL_ERROR', message: 'Catalog template parameter is invalid.' },
    })
    await expect(service.details({ kind: 'work', id: '1' }, new AbortController().signal)).resolves.toMatchObject({ ok: false, error: { code: 'CATALOG_PROTOCOL_ERROR' } })
    await expect(service.baseModels(new AbortController().signal)).resolves.toEqual({
      ok: false,
      error: { code: 'CATALOG_PROTOCOL_ERROR', message: 'Catalog template parameter is invalid.' },
    })
    await context.fiber.dispose()
  })

  it('does not convert cancellation or unexpected implementation errors into Catalog business failures', async () => {
    const context = new Context()
    const abort = new DOMException('cancelled', 'AbortError')
    const service = new CatalogRemoteService(context, {
      details: vi.fn(async () => { throw abort }),
      search: vi.fn(async () => { throw abort }),
      baseModels: vi.fn(async () => { throw new Error('unexpected') }),
    } as never, () => ({ url: 'http://127.0.0.1', port: 8188 }))

    await expect(service.search(
      { kind: 'model', query: '', page: 1, baseModelId: null },
      new AbortController().signal,
    )).rejects.toBe(abort)
    await expect(service.details({ kind: 'work', id: '1' }, new AbortController().signal)).rejects.toBe(abort)
    await expect(service.baseModels(new AbortController().signal)).rejects.toThrow('unexpected')
    await context.fiber.dispose()
  })
})

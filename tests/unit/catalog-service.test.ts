import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, vi } from 'vitest'

import { CatalogRemoteService } from '../../src/host/catalog/catalog-service.ts'

describe('Catalog Remote service', () => {
  it('registers its public Remote marker and delegates the cancellable query', async () => {
    const context = new Context()
    const controller = new AbortController()
    const page = { kind: 'model', query: '', page: 1, items: [], totalCount: 0 } as const
    const baseModelList = { items: [{ id: '2', label: 'wai' }] } as const
    const search = vi.fn(async () => page)
    const baseModels = vi.fn(async () => baseModelList)
    const service = new CatalogRemoteService(context, { search, baseModels } as never)

    expect(remoteMethods(service)).toEqual([
      { method: 'search', invocation: { kind: 'direct' } },
      { method: 'baseModels', invocation: { kind: 'direct' } },
    ])
    const request = { kind: 'model', query: '', page: 1, baseModelId: null } as const
    await expect(service.search(request, controller.signal)).resolves.toBe(page)
    expect(search).toHaveBeenCalledWith(request, controller.signal)
    await expect(service.baseModels(controller.signal)).resolves.toBe(baseModelList)
    expect(baseModels).toHaveBeenCalledWith(controller.signal)
    await context.fiber.dispose()
  })
})

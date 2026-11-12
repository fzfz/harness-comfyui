import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CatalogPage, CatalogQueryRequest } from '../../src/catalog/contract.ts'
import { useCatalogBrowser, type CatalogApi } from '../../src/client/workbench/catalog-browser.tsx'

interface RenderNode { readonly props: Record<string, any>; readonly children: readonly (RenderNode | string)[]; findByType(type: string): RenderNode }
interface ReactTestRenderer { readonly root: RenderNode; unmount(): void; update(node: React.ReactElement): void }
const { act, create } = await vi.importActual('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => Promise<void>
  create: (node: React.ReactElement) => ReactTestRenderer
}

const initial: CatalogQueryRequest = { kind: 'lora', query: '', page: 1, baseModelId: null, modelId: null }
const mounted: ReactTestRenderer[] = []
afterEach(async () => { await act(() => { for (const renderer of mounted.splice(0)) renderer.unmount() }) })

function Browser({ catalog, query, enabled = true }: { catalog: CatalogApi; query: CatalogQueryRequest; enabled?: boolean }) {
  const browser = useCatalogBrowser({ catalog, query, enabled })
  return <><output data-status={browser.status}>{browser.page?.items.map(item => item.label).join(',') ?? browser.error ?? ''}</output><button onClick={browser.retry}>刷新</button></>
}

function api(): CatalogApi {
  let sequence = 0
  return {
    baseModels: vi.fn(async () => ({ items: [] })),
    details: vi.fn(),
    search: vi.fn(async (request): Promise<CatalogPage> => ({ ...request, totalCount: 1, items: [{
      label: `result-${++sequence}`, subtitle: '', baseModelId: request.baseModelId, modelId: request.modelId, coverUrl: null, sampleImageUrls: [],
      context: request.kind === 'work' ? { kind: 'work', id: String(sequence), name: 'test' } : { kind: 'lora', id: String(sequence), file_name: 'test.safetensors' },
    }] })),
  }
}

async function mount(catalog: CatalogApi, query = initial) {
  let renderer!: ReactTestRenderer
  await act(async () => { renderer = create(<Browser catalog={catalog} query={query} />) })
  mounted.push(renderer)
  return {
    renderer,
    text: () => renderer.root.findByType('output').children.join(''),
    update: async (query: CatalogQueryRequest, enabled = true, source = catalog) => { await act(async () => renderer.update(<Browser catalog={source} query={query} enabled={enabled} />)) },
    refresh: async () => { await act(async () => renderer.root.findByType('button').props.onClick()) },
  }
}

describe('Catalog browser query cache', () => {
  it('keeps separate pages for category, search, base model, model and page number', async () => {
    const catalog = api(), browser = await mount(catalog)
    expect(browser.text()).toBe('result-1')
    const variants: CatalogQueryRequest[] = [
      { ...initial, kind: 'work' }, { ...initial, query: 'matte' }, { ...initial, baseModelId: '2' }, { ...initial, modelId: '20' }, { ...initial, page: 2 },
    ]
    for (const [index, query] of variants.entries()) {
      await browser.update(query)
      expect(browser.text()).toBe(`result-${index + 2}`)
      await browser.update(initial)
      expect(browser.text()).toBe('result-1')
    }
    expect(catalog.search).toHaveBeenCalledTimes(6)
    await browser.update({ ...initial, kind: 'work', baseModelId: '2', modelId: '20' })
    expect(browser.text()).toBe('result-2')
    expect(catalog.search).toHaveBeenCalledTimes(6)
  })

  it('refreshes the active query while preserving another cached category', async () => {
    const catalog = api(), browser = await mount(catalog)
    await browser.update({ ...initial, kind: 'work' })
    await browser.update(initial)
    await browser.refresh()
    expect(browser.text()).toBe('result-3')
    await browser.update({ ...initial, kind: 'work' })
    expect(browser.text()).toBe('result-2')
    expect(catalog.search).toHaveBeenCalledTimes(3)
  })

  it('rejects a superseded response after refreshing the same query', async () => {
    const catalog = api(), search = vi.mocked(catalog.search).getMockImplementation()!
    let finish!: () => Promise<void>, signal!: AbortSignal
    vi.mocked(catalog.search).mockImplementationOnce((request, requestSignal) => new Promise(resolve => {
      signal = requestSignal; finish = async () => resolve({ ...await search(request, requestSignal), items: [] })
    }))
    const browser = await mount(catalog)
    await browser.refresh()
    expect(signal.aborted).toBe(true)
    expect(browser.text()).toBe('result-1')
    await act(async () => finish())
    expect(browser.text()).toBe('result-1')
  })

  it.each(['disable', 'source', 'unmount'] as const)('releases all in-flight pages on %s', async boundary => {
    const catalog = api(), signals: AbortSignal[] = []
    vi.mocked(catalog.search).mockImplementation((_request, signal) => { signals.push(signal); return new Promise(() => undefined) })
    const browser = await mount(catalog)
    await browser.update({ ...initial, kind: 'work' })
    expect(signals.map(signal => signal.aborted)).toEqual([false, false])
    if (boundary === 'unmount') await act(() => browser.renderer.unmount())
    else await browser.update(initial, boundary !== 'disable', boundary === 'source' ? api() : catalog)
    expect(signals.map(signal => signal.aborted)).toEqual([true, true])
  })
})

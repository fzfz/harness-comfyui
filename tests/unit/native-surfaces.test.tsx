import { createRequire } from 'node:module'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const React = await import('react')
  return {
    Button: ({ icon: _icon, children, ...props }: Record<string, unknown>) => React.createElement(
      'button', props, children as ReactNode,
    ),
    IconCheckOutline16: () => React.createElement('i', { 'data-icon': 'check' }),
    IconChevronDownOutline14: () => React.createElement('i', { 'data-icon': 'chevron' }),
    IconChevronLeftOutline14: () => React.createElement('i', { 'data-icon': 'chevron-left' }),
    IconChevronRightOutline14: () => React.createElement('i', { 'data-icon': 'chevron-right' }),
    IconSparkle16: () => React.createElement('i', { 'data-icon': 'sparkle' }),
    IconSearchOutline16: () => React.createElement('i', { 'data-icon': 'search' }),
    Input: ({ icon: _icon, ...props }: Record<string, unknown>) => React.createElement('input', props),
    Menu: ({ open, anchor, items, onSelect, onClose }: Record<string, unknown>) => React.createElement(
      'div',
      { 'data-menu': true, onBlur: onClose },
      anchor as ReactNode,
      open
        ? (items as Array<{ id: string; label: ReactNode }>).map(item => React.createElement(
          'button', { key: item.id, onClick: () => (onSelect as (id: string) => void)(item.id) }, item.label,
        ))
        : null,
    ),
    Pill: ({ active, children, onClick, ...props }: Record<string, unknown>) => React.createElement(
      onClick ? 'button' : 'span', { ...props, onClick, 'data-active': active }, children as ReactNode,
    ),
    Modal: ({ open, onClose, title, children, footer }: Record<string, unknown>) => (
      open
        ? React.createElement(
          'div',
          { role: 'dialog', 'aria-label': title, onClick: onClose },
          children as ReactNode,
          React.createElement('footer', null, footer as ReactNode),
        )
        : null
    ),
  }
})

import {
  CATALOG_KIND_DEFINITIONS,
  contextLabel,
  type CatalogItem,
  type CatalogQueryRequest,
} from '../../src/catalog/contract.ts'
import {
  catalogFailureText,
  serializeWorkbenchContext,
  WORKBENCH_COPY,
  workbenchContextsFromDraft,
} from '../../src/client/workbench/contract.ts'
import { WorkbenchController } from '../../src/client/workbench/controller.ts'
import { ContextDialogNavigationStore } from '../../src/client/workbench/context-dialog-navigation.ts'
import {
  WorkbenchDock,
  WorkbenchEntry,
  type CatalogApi,
} from '../../src/client/workbench/native-surfaces.tsx'

const { act, create } = createRequire(import.meta.url)('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>
  create: (node: ReactNode, options?: { createNodeMock?: (element: { props: Record<string, unknown> }) => unknown }) => {
    root: {
      findAllByType(type: string): Array<{ props: Record<string, unknown> }>
      findAllByProps(props: Record<string, unknown>): Array<{ props: Record<string, unknown> }>
      findByProps(props: Record<string, unknown>): { props: Record<string, unknown> }
    }
    toJSON(): unknown
    unmount(): void
    update(node: ReactNode): void
  }
}

const CONTEXT_OPTIONS: readonly CatalogItem[] = [
  {
    context: { kind: 'comfyui-template', id: '37', title: 'wai_txt2img_lora' },
    label: 'wai_txt2img_lora',
    subtitle: 'text_to_image',
    coverUrl: 'http://127.0.0.1:18092/media/images/template.webp',
    sampleImageUrls: [
      'http://127.0.0.1:18092/media/images/template-2.webp',
      'http://127.0.0.1:18092/media/images/template-3.webp',
    ],
  },
  {
    context: { kind: 'comfyui-template', id: '36', title: 'wai_txt2img' },
    label: 'wai_txt2img',
    subtitle: 'text_to_image',
    coverUrl: null,
    sampleImageUrls: [],
  },
  {
    context: { kind: 'lora', id: '91', file_name: 'StS_Age_Slider_Illustrious_v1.safetensors' },
    label: 'StS_Age_Slider_Illustrious_v1.safetensors',
    subtitle: 'Shed_The_Skin',
    coverUrl: 'http://127.0.0.1:18092/media/images/lora.jpg',
    sampleImageUrls: ['http://127.0.0.1:18092/media/images/lora-2.jpg'],
  },
]

class MemoryStorage {
  private readonly values = new Map<string, string>()
  failWrites = false

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new DOMException('storage write denied', 'SecurityError')
    this.values.set(key, value)
  }
}

function freshDialogNavigation(sessionId = 'session-1') {
  const storage = new MemoryStorage()
  return new ContextDialogNavigationStore(() => storage).for(sessionId)
}

function catalog(items: readonly CatalogItem[] = CONTEXT_OPTIONS, totalCount?: number): CatalogApi & {
  search: ReturnType<typeof vi.fn>
  baseModels: ReturnType<typeof vi.fn>
} {
  const search = vi.fn(async (request: CatalogQueryRequest, signal: AbortSignal) => {
    if (signal.aborted) throw new DOMException('cancelled', 'AbortError')
    const matching = items.filter(item => item.context.kind === request.kind)
    return {
      kind: request.kind,
      query: request.query,
      page: request.page,
      items: matching,
      totalCount: totalCount ?? matching.length,
    }
  })
  const baseModels = vi.fn(async (signal: AbortSignal) => {
    if (signal.aborted) throw new DOMException('cancelled', 'AbortError')
    return { items: [{ id: '2', label: 'wai' }, { id: '1', label: 'anima' }] }
  })
  return { search, baseModels } as never
}

function inputState(draft = '') {
  return { draft, draftRev: 0, occurrences: [] }
}

function sessionInput(draft = '') {
  let state = inputState(draft)
  return {
    state: { getSnapshot: () => state },
    setDraft: vi.fn((next: string) => {
      state = { ...state, draft: next, draftRev: state.draftRev + 1 }
    }),
  }
}

function activeController(): WorkbenchController {
  const controller = new WorkbenchController({ openDetails: vi.fn(), closeDetails: vi.fn() })
  controller.toggle()
  return controller
}

function buttonByText(renderer: ReturnType<typeof create>, text: ReactNode) {
  return renderer.root.findAllByType('button').find(button => button.props.children === text)!
}

async function openDialog(renderer: ReturnType<typeof create>): Promise<void> {
  const open = buttonByText(renderer, WORKBENCH_COPY.insertContext)
  await act(async () => {
    ;(open.props.onClick as () => void)()
    await Promise.resolve()
  })
}

describe('native Harness workbench surfaces', () => {
  let documentTarget: EventTarget

  beforeEach(() => {
    vi.clearAllMocks()
    documentTarget = new EventTarget()
    vi.stubGlobal('document', documentTarget)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('renders a native left entry in wide and rail modes and toggles its active state', () => {
    const controller = new WorkbenchController({ openDetails: vi.fn(), closeDetails: vi.fn() })
    let renderer: ReturnType<typeof create>
    act(() => {
      renderer = create(createElement(WorkbenchEntry, { wide: true, workbench: controller }))
    })
    const entry = renderer!.root.findAllByType('button')[0]!
    expect(entry.props.children).toBe(WORKBENCH_COPY.entry)
    expect(entry.props['aria-pressed']).toBe(false)
    act(() => { (entry.props.onClick as () => void)() })
    expect(renderer!.root.findAllByType('button')[0]!.props['aria-pressed']).toBe(true)
    act(() => renderer!.unmount())

    act(() => {
      renderer = create(createElement(WorkbenchEntry, { wide: false, workbench: controller }))
    })
    expect(renderer!.root.findAllByType('button')[0]!.props.children).toBeNull()
    act(() => renderer!.unmount())
  })

  it('keeps the dock absent until entry and removes selected contexts from the workbench pill', () => {
    const layout = { openDetails: vi.fn(), closeDetails: vi.fn() }
    const controller = new WorkbenchController(layout)
    const draft = serializeWorkbenchContext(CONTEXT_OPTIONS[0]!.context)
    const input = sessionInput(draft)
    let renderer: ReturnType<typeof create>
    act(() => {
      renderer = create(createElement(WorkbenchDock, {
        catalog: catalog(), dialogNavigation: freshDialogNavigation(), input: inputState(draft) as never,
        sessionId: 'session-1', sessionInput: input as never, workbench: controller,
      }))
    })
    expect(renderer!.toJSON()).toBeNull()
    act(() => controller.toggle())
    expect(renderer!.root.findByProps({ 'aria-label': WORKBENCH_COPY.selectedContexts })).toBeDefined()
    act(() => { (buttonByText(renderer!, WORKBENCH_COPY.openResults).props.onClick as () => void)() })
    expect(layout.openDetails).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(renderer!.toJSON())).toContain(contextLabel(CONTEXT_OPTIONS[0]!.context))
    const remove = renderer!.root.findByProps({
      'aria-label': `${WORKBENCH_COPY.removeContext} ${contextLabel(CONTEXT_OPTIONS[0]!.context)}`,
    })
    act(() => { (remove.props.onClick as () => void)() })
    expect(input.setDraft).toHaveBeenCalledWith('')
    act(() => renderer!.unmount())
  })

  it('loads covered cards, selects multiple resources, inserts all selections, and closes', async () => {
    const api = catalog()
    const input = sessionInput()
    let renderer: ReturnType<typeof create>
    act(() => {
      renderer = create(createElement(WorkbenchDock, {
        catalog: api, dialogNavigation: freshDialogNavigation(), input: inputState() as never,
        sessionId: 'session-1', sessionInput: input as never, workbench: activeController(),
      }))
    })
    await openDialog(renderer!)
    expect(api.baseModels).toHaveBeenCalledOnce()
    expect(api.search).toHaveBeenCalledWith({
      kind: 'comfyui-template', query: '', page: 1, baseModelId: null,
    }, expect.any(AbortSignal))
    expect(renderer!.root.findAllByType('img')).toHaveLength(1)
    expect(JSON.stringify(renderer!.toJSON())).toContain(WORKBENCH_COPY.noCover)
    expect(buttonByText(renderer!, CATALOG_KIND_DEFINITIONS[7].label).props.variant).toBe('primary')
    expect(buttonByText(renderer!, CATALOG_KIND_DEFINITIONS[0].label).props.variant).toBe('toolbar')

    for (const option of CONTEXT_OPTIONS.slice(0, 2)) {
      const card = renderer!.root.findByProps({ 'aria-label': `${WORKBENCH_COPY.selectItem} ${option.label}` })
      act(() => { (card.props.onClick as () => void)() })
      expect(renderer!.root.findByProps({
        'aria-label': `${WORKBENCH_COPY.selectedItem} ${option.label}`,
      })).toBeDefined()
    }
    expect(renderer!.root.findByProps({ className: 'harness-comfyui-selection-count' }).props.children)
      .toEqual([WORKBENCH_COPY.selected, ' ', 2])
    const confirm = buttonByText(renderer!, WORKBENCH_COPY.confirm)
    act(() => { (confirm.props.onClick as () => void)() })
    expect(workbenchContextsFromDraft(input.setDraft.mock.calls[0]![0] as string))
      .toEqual(CONTEXT_OPTIONS.slice(0, 2).map(option => option.context))
    expect(renderer!.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
    act(() => renderer!.unmount())
  })

  it('keeps cover preview separate from record selection and inserts the exact selected context', async () => {
    const input = sessionInput()
    const openerFocus = vi.fn()
    const galleryFocus = vi.fn()
    let renderer: ReturnType<typeof create>
    act(() => {
      renderer = create(createElement(WorkbenchDock, {
        catalog: catalog(), dialogNavigation: freshDialogNavigation(), input: inputState() as never,
        sessionId: 'session-1', sessionInput: input as never, workbench: activeController(),
      }), {
        createNodeMock: element => {
          if (element.props.className === 'harness-comfyui-gallery-current') return { focus: galleryFocus }
          if (element.props.className === 'harness-comfyui-catalog-card') {
            return { querySelector: () => ({ focus: openerFocus }) }
          }
          return null
        },
      })
    })
    await openDialog(renderer!)

    const option = CONTEXT_OPTIONS[0]!
    const preview = renderer!.root.findByProps({
      'aria-label': `${WORKBENCH_COPY.openGallery} ${option.label}`,
    })
    act(() => { (preview.props.onClick as () => void)() })
    expect(galleryFocus).toHaveBeenCalledOnce()
    expect(input.setDraft).not.toHaveBeenCalled()
    expect(renderer!.root.findByProps({ role: 'dialog' }).props['aria-label'])
      .toBe(`${WORKBENCH_COPY.galleryTitle}：${option.label}`)

    act(() => { (renderer!.root.findByProps({ role: 'dialog' }).props.onClick as () => void)() })
    expect(openerFocus).toHaveBeenCalledOnce()
    expect(renderer!.root.findByProps({
      'aria-label': `${WORKBENCH_COPY.selectItem} ${option.label}`,
    })).toBeDefined()

    const select = renderer!.root.findByProps({
      'aria-label': `${WORKBENCH_COPY.selectItem} ${option.label}`,
    })
    act(() => { (select.props.onClick as () => void)() })
    expect(renderer!.root.findByProps({
      'aria-label': `${WORKBENCH_COPY.selectedItem} ${option.label}`,
    }).props['aria-pressed']).toBe(true)
    expect(renderer!.root.findByProps({ className: 'harness-comfyui-selection-count' }).props.children)
      .toEqual([WORKBENCH_COPY.selected, ' ', 1])

    act(() => {
      ;(renderer!.root.findByProps({
        'aria-label': `${WORKBENCH_COPY.selectedItem} ${option.label}`,
      }).props.onClick as () => void)()
    })
    expect(buttonByText(renderer!, WORKBENCH_COPY.confirm).props.disabled).toBe(true)
    expect(input.setDraft).not.toHaveBeenCalled()

    act(() => {
      ;(renderer!.root.findByProps({
        'aria-label': `${WORKBENCH_COPY.selectItem} ${option.label}`,
      }).props.onClick as () => void)()
    })
    act(() => { (buttonByText(renderer!, WORKBENCH_COPY.confirm).props.onClick as () => void)() })
    expect(workbenchContextsFromDraft(input.setDraft.mock.calls[0]![0] as string)).toEqual([option.context])
    act(() => renderer!.unmount())
  })

  it('navigates gallery images with buttons and keyboard, reports failures, and removes the listener on close', async () => {
    const removeListener = vi.spyOn(documentTarget, 'removeEventListener')
    let renderer: ReturnType<typeof create>
    act(() => {
      renderer = create(createElement(WorkbenchDock, {
        catalog: catalog(), dialogNavigation: freshDialogNavigation(), input: inputState() as never,
        sessionId: 'session-1', sessionInput: sessionInput() as never, workbench: activeController(),
      }))
    })
    await openDialog(renderer!)
    const option = CONTEXT_OPTIONS[0]!
    const preview = renderer!.root.findByProps({
      'aria-label': `${WORKBENCH_COPY.openGallery} ${option.label}`,
    })
    act(() => { (preview.props.onClick as () => void)() })

    expect(renderer!.root.findAllByType('img')[0]!.props.src).toBe(option.coverUrl)
    expect(renderer!.root.findByProps({ 'aria-label': WORKBENCH_COPY.previousImage }).props.disabled).toBe(true)
    expect(renderer!.root.findByProps({ 'aria-label': WORKBENCH_COPY.nextImage }).props.disabled).toBe(false)

    act(() => {
      ;(renderer!.root.findByProps({ 'aria-label': WORKBENCH_COPY.nextImage }).props.onClick as () => void)()
    })
    expect(renderer!.root.findAllByType('img')[0]!.props.src).toBe(option.sampleImageUrls[0])

    act(() => {
      ;(renderer!.root.findByProps({ 'aria-label': WORKBENCH_COPY.previousImage }).props.onClick as () => void)()
    })
    expect(renderer!.root.findAllByType('img')[0]!.props.src).toBe(option.coverUrl)
    act(() => {
      ;(renderer!.root.findByProps({ 'aria-label': WORKBENCH_COPY.nextImage }).props.onClick as () => void)()
    })
    expect(renderer!.root.findAllByType('img')[0]!.props.src).toBe(option.sampleImageUrls[0])

    const right = new Event('keydown', { cancelable: true })
    Object.defineProperty(right, 'key', { value: 'ArrowRight' })
    act(() => { documentTarget.dispatchEvent(right) })
    expect(right.defaultPrevented).toBe(true)
    expect(renderer!.root.findAllByType('img')[0]!.props.src).toBe(option.sampleImageUrls[1])
    expect(renderer!.root.findByProps({ 'aria-label': WORKBENCH_COPY.nextImage }).props.disabled).toBe(true)

    const left = new Event('keydown', { cancelable: true })
    Object.defineProperty(left, 'key', { value: 'ArrowLeft' })
    act(() => { documentTarget.dispatchEvent(left) })
    expect(renderer!.root.findAllByType('img')[0]!.props.src).toBe(option.sampleImageUrls[0])

    act(() => { (renderer!.root.findAllByType('img')[0]!.props.onError as () => void)() })
    expect(JSON.stringify(renderer!.toJSON())).toContain(WORKBENCH_COPY.imageLoadFailed)
    act(() => {
      ;(renderer!.root.findByProps({ 'aria-label': WORKBENCH_COPY.nextImage }).props.onClick as () => void)()
    })
    expect(JSON.stringify(renderer!.toJSON())).not.toContain(WORKBENCH_COPY.imageLoadFailed)

    act(() => { (renderer!.root.findByProps({ role: 'dialog' }).props.onClick as () => void)() })
    expect(removeListener).toHaveBeenCalledWith('keydown', expect.any(Function))
    expect(renderer!.root.findByProps({ role: 'dialog' }).props['aria-label']).toBe(WORKBENCH_COPY.dialogTitle)
    act(() => renderer!.unmount())
  })

  it('disables both gallery arrows for one image and leaves no-cover records selectable', async () => {
    const single = { ...CONTEXT_OPTIONS[0]!, sampleImageUrls: [] }
    let renderer: ReturnType<typeof create>
    act(() => {
      renderer = create(createElement(WorkbenchDock, {
        catalog: catalog([single, CONTEXT_OPTIONS[1]!]),
        dialogNavigation: freshDialogNavigation(),
        input: inputState() as never,
        sessionId: 'session-1',
        sessionInput: sessionInput() as never,
        workbench: activeController(),
      }))
    })
    await openDialog(renderer!)
    expect(renderer!.root.findAllByProps({
      'aria-label': `${WORKBENCH_COPY.openGallery} ${CONTEXT_OPTIONS[1]!.label}`,
    })).toHaveLength(0)
    expect(renderer!.root.findByProps({
      'aria-label': `${WORKBENCH_COPY.selectItem} ${CONTEXT_OPTIONS[1]!.label}`,
    })).toBeDefined()

    act(() => {
      ;(renderer!.root.findByProps({
        'aria-label': `${WORKBENCH_COPY.openGallery} ${single.label}`,
      }).props.onClick as () => void)()
    })
    expect(renderer!.root.findByProps({ 'aria-label': WORKBENCH_COPY.previousImage }).props.disabled).toBe(true)
    expect(renderer!.root.findByProps({ 'aria-label': WORKBENCH_COPY.nextImage }).props.disabled).toBe(true)
    act(() => renderer!.unmount())
  })

  it('keeps confirmed selections unchanged when cancel or native close discards pending changes', async () => {
    const draft = serializeWorkbenchContext(CONTEXT_OPTIONS[0]!.context)
    const input = sessionInput(draft)
    let renderer: ReturnType<typeof create>
    act(() => {
      renderer = create(createElement(WorkbenchDock, {
        catalog: catalog(), dialogNavigation: freshDialogNavigation(), input: inputState(draft) as never,
        sessionId: 'session-1', sessionInput: input as never, workbench: activeController(),
      }))
    })
    await openDialog(renderer!)
    const pending = renderer!.root.findByProps({
      'aria-label': `${WORKBENCH_COPY.selectItem} ${CONTEXT_OPTIONS[1]!.label}`,
    })
    act(() => { (pending.props.onClick as () => void)() })
    act(() => { (buttonByText(renderer!, WORKBENCH_COPY.cancel).props.onClick as () => void)() })
    expect(renderer!.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
    expect(input.setDraft).not.toHaveBeenCalled()

    await openDialog(renderer!)
    const current = renderer!.root.findByProps({
      'aria-label': `${WORKBENCH_COPY.selectedItem} ${CONTEXT_OPTIONS[0]!.label}`,
    })
    act(() => { (current.props.onClick as () => void)() })
    const dialog = renderer!.root.findByProps({ role: 'dialog' })
    act(() => { (dialog.props.onClick as () => void)() })
    expect(renderer!.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
    expect(input.setDraft).not.toHaveBeenCalled()
    act(() => renderer!.unmount())
  })

  it('opens with the persisted navigation state for the current Session', async () => {
    const storage = new MemoryStorage()
    const navigationStore = new ContextDialogNavigationStore(() => storage)
    const dialogNavigation = navigationStore.for('session-a')
    dialogNavigation.update(() => ({
      selectedBaseModelId: '2',
      selectedKind: 'lora',
      queryText: 'Age refined',
      submittedQuery: 'Age',
      currentPage: 2,
    }))
    const api = catalog([CONTEXT_OPTIONS[2]!], 13)
    let renderer: ReturnType<typeof create>
    act(() => {
      renderer = create(createElement(WorkbenchDock, {
        catalog: api,
        dialogNavigation,
        input: inputState() as never,
        sessionId: 'session-a',
        sessionInput: sessionInput() as never,
        workbench: activeController(),
      } as never))
    })

    await openDialog(renderer!)

    expect(renderer!.root.findAllByType('input')[0]!.props.value).toBe('Age refined')
    expect(buttonByText(renderer!, CATALOG_KIND_DEFINITIONS[1].label).props.variant).toBe('primary')
    expect(api.search).toHaveBeenLastCalledWith({
      kind: 'lora', query: 'Age', page: 2, baseModelId: '2',
    }, expect.any(AbortSignal))
    act(() => { (buttonByText(renderer!, WORKBENCH_COPY.cancel).props.onClick as () => void)() })
    api.search.mockClear()
    await openDialog(renderer!)
    expect(api.search).toHaveBeenLastCalledWith({
      kind: 'lora', query: 'Age', page: 2, baseModelId: '2',
    }, expect.any(AbortSignal))
    act(() => renderer!.unmount())
  })

  it('keeps all persisted navigation values while opening, moving, and closing the gallery', async () => {
    const storage = new MemoryStorage()
    const navigationStore = new ContextDialogNavigationStore(() => storage)
    const dialogNavigation = navigationStore.for('session-a')
    const persistedNavigation = {
      selectedBaseModelId: '2',
      selectedKind: 'lora' as const,
      queryText: 'Age refined',
      submittedQuery: 'Age',
      currentPage: 2,
    }
    dialogNavigation.update(() => persistedNavigation)
    const api = catalog([CONTEXT_OPTIONS[2]!], 13)
    let renderer: ReturnType<typeof create>
    act(() => {
      renderer = create(createElement(WorkbenchDock, {
        catalog: api,
        dialogNavigation,
        input: inputState() as never,
        sessionId: 'session-a',
        sessionInput: sessionInput() as never,
        workbench: activeController(),
      }))
    })

    await openDialog(renderer!)
    const option = CONTEXT_OPTIONS[2]!
    act(() => {
      ;(renderer!.root.findByProps({
        'aria-label': `${WORKBENCH_COPY.openGallery} ${option.label}`,
      }).props.onClick as () => void)()
    })
    act(() => {
      ;(renderer!.root.findByProps({ 'aria-label': WORKBENCH_COPY.nextImage }).props.onClick as () => void)()
    })
    act(() => { (renderer!.root.findByProps({ role: 'dialog' }).props.onClick as () => void)() })

    expect(dialogNavigation.getSnapshot().state).toEqual(persistedNavigation)
    expect(renderer!.root.findAllByType('input')[0]!.props.value).toBe('Age refined')
    expect(api.search).toHaveBeenLastCalledWith({
      kind: 'lora', query: 'Age', page: 2, baseModelId: '2',
    }, expect.any(AbortSignal))
    act(() => renderer!.unmount())
  })

  it('resets a removed base model before querying the current Catalog', async () => {
    const storage = new MemoryStorage()
    const navigationStore = new ContextDialogNavigationStore(() => storage)
    const dialogNavigation = navigationStore.for('session-a')
    dialogNavigation.update(() => ({
      selectedBaseModelId: '9',
      selectedKind: 'lora',
      queryText: 'Age',
      submittedQuery: 'Age',
      currentPage: 2,
    }))
    const api = catalog([CONTEXT_OPTIONS[2]!], 1)
    let renderer: ReturnType<typeof create>
    act(() => {
      renderer = create(createElement(WorkbenchDock, {
        catalog: api,
        dialogNavigation,
        input: inputState() as never,
        sessionId: 'session-a',
        sessionInput: sessionInput() as never,
        workbench: activeController(),
      }))
    })

    await openDialog(renderer!)

    expect(api.search).not.toHaveBeenCalledWith(expect.objectContaining({ baseModelId: '9' }), expect.anything())
    expect(api.search).toHaveBeenLastCalledWith({
      kind: 'lora', query: 'Age', page: 1, baseModelId: null,
    }, expect.any(AbortSignal))
    expect(dialogNavigation.getSnapshot().state).toMatchObject({
      selectedBaseModelId: null,
      currentPage: 1,
    })
    act(() => renderer!.unmount())
  })

  it('blocks a removed base model query when the corrected state cannot be persisted', async () => {
    const storage = new MemoryStorage()
    const navigationStore = new ContextDialogNavigationStore(() => storage)
    const dialogNavigation = navigationStore.for('session-a')
    dialogNavigation.update(() => ({
      selectedBaseModelId: '9',
      selectedKind: 'lora',
      queryText: 'Age',
      submittedQuery: 'Age',
      currentPage: 2,
    }))
    storage.failWrites = true
    const api = catalog([CONTEXT_OPTIONS[2]!], 1)
    let renderer: ReturnType<typeof create>
    act(() => {
      renderer = create(createElement(WorkbenchDock, {
        catalog: api,
        dialogNavigation,
        input: inputState() as never,
        sessionId: 'session-a',
        sessionInput: sessionInput() as never,
        workbench: activeController(),
      }))
    })

    await openDialog(renderer!)

    expect(api.search).not.toHaveBeenCalled()
    expect(dialogNavigation.getSnapshot()).toMatchObject({
      state: { selectedBaseModelId: '9', currentPage: 2 },
      persistenceErrorCode: 'CONTEXT_DIALOG_NAVIGATION_STORAGE_FAILED',
    })
    expect(JSON.stringify(renderer!.toJSON())).toContain('CONTEXT_DIALOG_NAVIGATION_STORAGE_FAILED')
    expect(JSON.stringify(renderer!.toJSON())).not.toContain(CONTEXT_OPTIONS[2]!.label)
    act(() => renderer!.unmount())
  })

  it('searches, switches type, filters by base model, paginates, and renders empty state', async () => {
    const api = catalog([CONTEXT_OPTIONS[2]!], 13)
    let renderer: ReturnType<typeof create>
    act(() => {
      renderer = create(createElement(WorkbenchDock, {
        catalog: api, dialogNavigation: freshDialogNavigation(), input: inputState() as never,
        sessionId: 'session-1', sessionInput: sessionInput() as never, workbench: activeController(),
      }))
    })
    await openDialog(renderer!)

    const menuAnchor = renderer!.root.findByProps({ 'aria-haspopup': 'menu' })
    act(() => { (menuAnchor.props.onClick as () => void)() })
    const menu = renderer!.root.findByProps({ 'data-menu': true })
    act(() => { (menu.props.onBlur as () => void)() })
    expect(renderer!.root.findByProps({ 'aria-haspopup': 'menu' }).props['aria-expanded']).toBe(false)
    act(() => {
      ;(renderer!.root.findByProps({ 'aria-haspopup': 'menu' }).props.onClick as () => void)()
    })
    const wai = buttonByText(renderer!, 'wai')
    await act(async () => {
      ;(wai.props.onClick as () => void)()
      await Promise.resolve()
    })

    const lora = buttonByText(renderer!, CATALOG_KIND_DEFINITIONS[1].label)
    await act(async () => {
      ;(lora.props.onClick as () => void)()
      await Promise.resolve()
    })
    expect(buttonByText(renderer!, CATALOG_KIND_DEFINITIONS[1].label).props.variant).toBe('primary')
    expect(buttonByText(renderer!, CATALOG_KIND_DEFINITIONS[7].label).props.variant).toBe('toolbar')
    expect(api.search).toHaveBeenLastCalledWith({
      kind: 'lora', query: '', page: 1, baseModelId: '2',
    }, expect.any(AbortSignal))

    const searchInput = renderer!.root.findAllByType('input')[0]!
    act(() => {
      ;(searchInput.props.onChange as (event: unknown) => void)({ currentTarget: { value: 'Age' } })
    })
    const form = renderer!.root.findAllByType('form')[0]!
    await act(async () => {
      ;(form.props.onSubmit as (event: unknown) => void)({ preventDefault: vi.fn() })
      await Promise.resolve()
    })
    expect(api.search).toHaveBeenLastCalledWith({
      kind: 'lora', query: 'Age', page: 1, baseModelId: '2',
    }, expect.any(AbortSignal))

    const next = buttonByText(renderer!, WORKBENCH_COPY.nextPage)
    await act(async () => {
      ;(next.props.onClick as () => void)()
      await Promise.resolve()
    })
    expect(api.search).toHaveBeenLastCalledWith({
      kind: 'lora', query: 'Age', page: 2, baseModelId: '2',
    }, expect.any(AbortSignal))
    const previous = buttonByText(renderer!, WORKBENCH_COPY.previousPage)
    await act(async () => {
      ;(previous.props.onClick as () => void)()
      await Promise.resolve()
    })
    expect(api.search).toHaveBeenLastCalledWith({
      kind: 'lora', query: 'Age', page: 1, baseModelId: '2',
    }, expect.any(AbortSignal))
    act(() => renderer!.unmount())

    act(() => {
      renderer = create(createElement(WorkbenchDock, {
        catalog: catalog([]), dialogNavigation: freshDialogNavigation(), input: inputState() as never,
        sessionId: 'session-1', sessionInput: sessionInput() as never, workbench: activeController(),
      }))
    })
    await openDialog(renderer!)
    expect(JSON.stringify(renderer!.toJSON())).toContain(WORKBENCH_COPY.empty)
    act(() => renderer!.unmount())
  })

  it('isolates navigation and discards pending candidates when the reused Dock changes Session', async () => {
    const storage = new MemoryStorage()
    const navigationStore = new ContextDialogNavigationStore(() => storage)
    const sessionA = navigationStore.for('session-a')
    const sessionB = navigationStore.for('session-b')
    sessionB.update(() => ({
      selectedBaseModelId: null,
      selectedKind: 'work',
      queryText: 'city refined',
      submittedQuery: 'city',
      currentPage: 3,
    }))
    const api = catalog(CONTEXT_OPTIONS, 30)
    const workbench = activeController()
    const draftA = serializeWorkbenchContext(CONTEXT_OPTIONS[0]!.context)
    const renderDock = (
      sessionId: string,
      dialogNavigation: ReturnType<ContextDialogNavigationStore['for']>,
      draft = '',
    ) => createElement(WorkbenchDock, {
      catalog: api,
      dialogNavigation,
      input: inputState(draft) as never,
      sessionId,
      sessionInput: sessionInput(draft) as never,
      workbench,
    })
    let renderer: ReturnType<typeof create>
    act(() => {
      renderer = create(renderDock('session-a', sessionA, draftA))
    })
    await openDialog(renderer!)
    const pending = renderer!.root.findByProps({
      'aria-label': `${WORKBENCH_COPY.selectItem} ${CONTEXT_OPTIONS[1]!.label}`,
    })
    act(() => { (pending.props.onClick as () => void)() })

    act(() => { renderer!.update(renderDock('session-b', sessionB)) })
    expect(renderer!.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
    await openDialog(renderer!)
    expect(renderer!.root.findAllByType('input')[0]!.props.value).toBe('city refined')
    expect(api.search).toHaveBeenLastCalledWith({
      kind: 'work', query: 'city', page: 3, baseModelId: null,
    }, expect.any(AbortSignal))

    act(() => { renderer!.update(renderDock('session-a', sessionA, draftA)) })
    await openDialog(renderer!)
    expect(renderer!.root.findAllByType('input')[0]!.props.value).toBe('')
    expect(renderer!.root.findByProps({
      'aria-label': `${WORKBENCH_COPY.selectItem} ${CONTEXT_OPTIONS[1]!.label}`,
    })).toBeDefined()
    expect(renderer!.root.findByProps({
      'aria-label': `${WORKBENCH_COPY.selectedItem} ${CONTEXT_OPTIONS[0]!.label}`,
    })).toBeDefined()
    act(() => renderer!.unmount())
  })

  it('cleans up an open gallery and pending selection when the reused Dock changes Session', async () => {
    const removeListener = vi.spyOn(documentTarget, 'removeEventListener')
    const storage = new MemoryStorage()
    const navigationStore = new ContextDialogNavigationStore(() => storage)
    const sessionA = navigationStore.for('session-a')
    const sessionANavigation = {
      selectedBaseModelId: '2',
      selectedKind: 'lora' as const,
      queryText: 'Age refined',
      submittedQuery: 'Age',
      currentPage: 2,
    }
    sessionA.update(() => sessionANavigation)
    const sessionB = navigationStore.for('session-b')
    sessionB.update(() => ({
      selectedBaseModelId: null,
      selectedKind: 'work',
      queryText: 'city refined',
      submittedQuery: 'city',
      currentPage: 3,
    }))
    const api = catalog([CONTEXT_OPTIONS[2]!], 30)
    const workbench = activeController()
    const renderDock = (
      sessionId: string,
      dialogNavigation: ReturnType<ContextDialogNavigationStore['for']>,
    ) => createElement(WorkbenchDock, {
      catalog: api,
      dialogNavigation,
      input: inputState() as never,
      sessionId,
      sessionInput: sessionInput() as never,
      workbench,
    })
    let renderer: ReturnType<typeof create>
    act(() => { renderer = create(renderDock('session-a', sessionA)) })
    await openDialog(renderer!)

    const option = CONTEXT_OPTIONS[2]!
    act(() => {
      ;(renderer!.root.findByProps({
        'aria-label': `${WORKBENCH_COPY.selectItem} ${option.label}`,
      }).props.onClick as () => void)()
    })
    act(() => {
      ;(renderer!.root.findByProps({
        'aria-label': `${WORKBENCH_COPY.openGallery} ${option.label}`,
      }).props.onClick as () => void)()
    })

    act(() => { renderer!.update(renderDock('session-b', sessionB)) })
    expect(renderer!.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
    expect(removeListener).toHaveBeenCalledWith('keydown', expect.any(Function))

    act(() => { renderer!.update(renderDock('session-a', sessionA)) })
    await openDialog(renderer!)
    expect(sessionA.getSnapshot().state).toEqual(sessionANavigation)
    expect(renderer!.root.findAllByType('input')[0]!.props.value).toBe('Age refined')
    expect(api.search).toHaveBeenLastCalledWith({
      kind: 'lora', query: 'Age', page: 2, baseModelId: '2',
    }, expect.any(AbortSignal))
    expect(renderer!.root.findByProps({
      'aria-label': `${WORKBENCH_COPY.selectItem} ${option.label}`,
    })).toBeDefined()
    act(() => renderer!.unmount())
  })

  it('aborts the previous Session requests when the reused Dock changes Session', async () => {
    const activeSignals: AbortSignal[] = []
    const pendingApi = {
      search: vi.fn((_request: CatalogQueryRequest, signal: AbortSignal) => {
        activeSignals.push(signal)
        return new Promise<never>(() => undefined)
      }),
      baseModels: vi.fn((signal: AbortSignal) => {
        activeSignals.push(signal)
        return new Promise<never>(() => undefined)
      }),
    }
    const navigationStore = new ContextDialogNavigationStore(() => new MemoryStorage())
    const workbench = activeController()
    const renderDock = (sessionId: string) => createElement(WorkbenchDock, {
      catalog: pendingApi,
      dialogNavigation: navigationStore.for(sessionId),
      input: inputState() as never,
      sessionId,
      sessionInput: sessionInput() as never,
      workbench,
    })
    let renderer: ReturnType<typeof create>
    act(() => { renderer = create(renderDock('session-a')) })
    await openDialog(renderer!)

    act(() => { renderer!.update(renderDock('session-b')) })

    expect(activeSignals).toHaveLength(2)
    expect(activeSignals.every(signal => signal.aborted)).toBe(true)
    expect(renderer!.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
    act(() => renderer!.unmount())
  })

  it('renders query and base-model failures and aborts both active requests on close', async () => {
    const queryFailure = Object.assign(new Error('Catalog template parameter is invalid.'), {
      code: 'CATALOG_PROTOCOL_ERROR',
    })
    const baseFailure = Object.assign(new Error('Catalog CLI output exceeded the limit.'), {
      code: 'CATALOG_RESPONSE_TOO_LARGE',
    })
    const failedApi = {
      search: vi.fn(async () => { throw queryFailure }),
      baseModels: vi.fn(async () => { throw baseFailure }),
    }
    let renderer: ReturnType<typeof create>
    act(() => {
      renderer = create(createElement(WorkbenchDock, {
        catalog: failedApi, dialogNavigation: freshDialogNavigation(), input: inputState() as never,
        sessionId: 'session-1', sessionInput: sessionInput() as never, workbench: activeController(),
      }))
    })
    await openDialog(renderer!)
    const renderedFailure = JSON.stringify(renderer!.toJSON())
    expect(renderedFailure).toContain(catalogFailureText(queryFailure))
    expect(renderedFailure).toContain(catalogFailureText(baseFailure))
    expect(renderedFailure).not.toContain('目录加载失败。')
    act(() => renderer!.unmount())

    const activeSignals: AbortSignal[] = []
    const pendingApi = {
      search: vi.fn((_request: CatalogQueryRequest, signal: AbortSignal) => {
        activeSignals.push(signal)
        return new Promise<never>(() => undefined)
      }),
      baseModels: vi.fn((signal: AbortSignal) => {
        activeSignals.push(signal)
        return new Promise<never>(() => undefined)
      }),
    }
    act(() => {
      renderer = create(createElement(WorkbenchDock, {
        catalog: pendingApi, dialogNavigation: freshDialogNavigation(), input: inputState() as never,
        sessionId: 'session-1', sessionInput: sessionInput() as never, workbench: activeController(),
      }))
    })
    await openDialog(renderer!)
    act(() => { (buttonByText(renderer!, WORKBENCH_COPY.cancel).props.onClick as () => void)() })
    expect(activeSignals).toHaveLength(2)
    expect(activeSignals.every(signal => signal.aborted)).toBe(true)
    act(() => renderer!.unmount())
  })
})

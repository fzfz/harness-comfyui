import { createRequire } from 'node:module'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const React = await import('react')
  return {
    Button: ({ icon, children, ...props }: Record<string, unknown>) => React.createElement(
      'button', props,
      icon ? React.createElement('span', { 'data-button-icon': true }, icon as ReactNode) : children as ReactNode,
    ),
    IconChevronDownOutline14: () => React.createElement('i'),
    IconChevronLeftOutline14: () => React.createElement('i'),
    IconChevronRightOutline14: () => React.createElement('i'),
    IconCloseOutline16: () => React.createElement('i'),
    IconDownloadOutline16: () => React.createElement('i', { 'data-icon': 'download' }),
    Menu: ({ open, anchor, items, onSelect, onClose }: Record<string, unknown>) => React.createElement(
      'div',
      { 'data-menu-open': open, onBlur: onClose },
      anchor as ReactNode,
      open
        ? (items as Array<{ id: string; label: ReactNode }>).map(item => React.createElement(
          'button', { key: item.id, onClick: () => (onSelect as (id: string) => void)(item.id) }, item.label,
        ))
        : null,
    ),
    Pill: ({ children, ...props }: Record<string, unknown>) => React.createElement('span', props, children as ReactNode),
  }
})

import { WorkbenchController } from '../../src/client/workbench/controller.ts'
import {
  WorkbenchDetails,
  WorkbenchResultsOverlay,
} from '../../src/client/workbench/results-drawer.tsx'
import {
  filterStaticMedia,
  getMediaWorkflowDownloadLabel,
  STATIC_MEDIA,
  STATIC_RESULTS_COPY,
} from '../../src/client/workbench/static-results.ts'

const { act, create } = createRequire(import.meta.url)('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>
  create: (node: ReactNode) => {
    root: {
      findAllByType(type: string): Array<{ props: Record<string, unknown> }>
      findAllByProps(props: Record<string, unknown>): Array<{ props: Record<string, unknown> }>
      findByProps(props: Record<string, unknown>): { props: Record<string, unknown> }
    }
    toJSON(): unknown
    unmount(): void
  }
}

function buttonByText(renderer: ReturnType<typeof create>, text: ReactNode) {
  return renderer.root.findAllByType('button').find(button => button.props.children === text)!
}

describe('static native result drawer', () => {
  it('provides one native Workflow download icon for every visible media card', () => {
    const workbench = new WorkbenchController({ openDetails: vi.fn(), closeDetails: vi.fn() })
    workbench.openResults()
    let detailsRenderer: ReturnType<typeof create>
    let overlayRenderer: ReturnType<typeof create>
    act(() => {
      detailsRenderer = create(createElement(WorkbenchDetails, { sessionId: 'session-1', workbench }))
      overlayRenderer = create(createElement(WorkbenchResultsOverlay, {
        workbench,
        useSessions: (selector: (state: unknown) => unknown) => selector({
          current: 'session-blank',
          byId: { 'session-blank': { blank: true } },
        }),
        useWorkspaces: vi.fn(),
      } as never))
    })

    for (const renderer of [detailsRenderer!, overlayRenderer!]) {
      expect(renderer.root.findAllByProps({ 'aria-label': STATIC_RESULTS_COPY.downloadWorkflow })).toHaveLength(0)
      act(() => { (buttonByText(renderer, STATIC_RESULTS_COPY.sessionTab).props.onClick as () => void)() })
      const visibleItems = STATIC_MEDIA.slice(0, 4)
      expect(renderer.root.findAllByProps({ 'data-icon': 'download' })).toHaveLength(visibleItems.length)
      for (const item of visibleItems) {
        const button = renderer.root.findByProps({ 'aria-label': getMediaWorkflowDownloadLabel(item) })
        expect(button.props.children).toBeUndefined()
        expect(button.props.title).toBe(STATIC_RESULTS_COPY.downloadWorkflow)
      }
    }

    act(() => {
      detailsRenderer!.unmount()
      overlayRenderer!.unmount()
    })
  })

  it('renders the root overlay drawer only for a blank current Session while results are open', () => {
    const workbench = new WorkbenchController({ openDetails: vi.fn(), closeDetails: vi.fn() })
    workbench.openResults()
    const useSessions = (selector: (state: unknown) => unknown) => selector({
      current: 'session-blank',
      byId: { 'session-blank': { blank: true } },
    })
    let renderer: ReturnType<typeof create>
    act(() => {
      renderer = create(createElement(WorkbenchResultsOverlay, {
        workbench,
        useSessions,
        useWorkspaces: vi.fn(),
      } as never))
    })

    expect(renderer!.root.findAllByProps({
      className: 'harness-comfyui-results-drawer harness-comfyui-results-overlay',
    })).toHaveLength(1)
    expect(JSON.stringify(renderer!.toJSON())).toContain(STATIC_RESULTS_COPY.title)

    act(() => {
      ;(renderer!.root.findByProps({ 'aria-label': STATIC_RESULTS_COPY.close }).props.onClick as () => void)()
    })
    expect(renderer!.toJSON()).toBeNull()
    act(() => renderer!.unmount())
  })

  it('does not duplicate the overlay drawer for a connected non-blank Session', () => {
    const workbench = new WorkbenchController({ openDetails: vi.fn(), closeDetails: vi.fn() })
    workbench.openResults()
    let renderer: ReturnType<typeof create>
    act(() => {
      renderer = create(createElement(WorkbenchResultsOverlay, {
        workbench,
        useSessions: (selector: (state: unknown) => unknown) => selector({
          current: 'session-connected',
          byId: { 'session-connected': { blank: false } },
        }),
        useWorkspaces: vi.fn(),
      } as never))
    })

    expect(renderer!.toJSON()).toBeNull()
    act(() => renderer!.unmount())
  })

  it('filters the structured media fixture by every supported dimension', () => {
    expect(filterStaticMedia(STATIC_MEDIA, { turn: 'all', kind: 'all', time: 'all' })).toHaveLength(6)
    expect(filterStaticMedia(STATIC_MEDIA, { turn: 'turn_portrait_03', kind: 'all', time: 'all' })).toHaveLength(3)
    expect(filterStaticMedia(STATIC_MEDIA, { turn: 'all', kind: 'audio', time: 'all' })).toHaveLength(1)
    expect(filterStaticMedia(STATIC_MEDIA, { turn: 'all', kind: 'all', time: 'older' })).toHaveLength(2)
    expect(filterStaticMedia(STATIC_MEDIA, {
      turn: 'turn_portrait_03', kind: 'audio', time: 'older',
    })).toHaveLength(0)
  })

  it('renders run cards, changes focused run, switches tabs, and closes through the layout service', () => {
    const layout = { openDetails: vi.fn(), closeDetails: vi.fn() }
    const workbench = new WorkbenchController(layout)
    let renderer: ReturnType<typeof create>
    act(() => {
      renderer = create(createElement(WorkbenchDetails, { sessionId: 'session-1', workbench }))
    })

    expect(renderer!.root.findByProps({ 'data-session-id': 'session-1' })).toBeDefined()
    expect(JSON.stringify(renderer!.toJSON())).toContain(STATIC_RESULTS_COPY.currentTurn)
    const runCards = renderer!.root.findAllByType('button')
      .filter(button => button.props.className === 'harness-comfyui-run-card')
    expect(runCards).toHaveLength(4)
    expect(runCards[0]!.props['aria-pressed']).toBe(true)
    act(() => { (runCards[1]!.props.onClick as () => void)() })
    expect(renderer!.root.findAllByType('button')
      .filter(button => button.props.className === 'harness-comfyui-run-card')[1]!.props['aria-pressed']).toBe(true)

    act(() => { (buttonByText(renderer!, STATIC_RESULTS_COPY.sessionTab).props.onClick as () => void)() })
    expect(buttonByText(renderer!, STATIC_RESULTS_COPY.sessionTab).props['aria-selected']).toBe(true)
    expect(renderer!.root.findAllByProps({ className: 'harness-comfyui-media-card' })).toHaveLength(4)

    act(() => {
      ;(renderer!.root.findByProps({ 'aria-label': STATIC_RESULTS_COPY.close }).props.onClick as () => void)()
    })
    expect(layout.closeDetails).toHaveBeenCalledOnce()
    act(() => renderer!.unmount())
  })

  it('uses native menus for media filters, resets pagination, and renders the empty result', () => {
    const workbench = new WorkbenchController({ openDetails: vi.fn(), closeDetails: vi.fn() })
    let renderer: ReturnType<typeof create>
    act(() => {
      renderer = create(createElement(WorkbenchDetails, { sessionId: 'session-1', workbench }))
    })
    act(() => { (buttonByText(renderer!, STATIC_RESULTS_COPY.sessionTab).props.onClick as () => void)() })

    for (let index = 0; index < 3; index += 1) {
      const anchor = renderer!.root.findAllByType('button')
        .filter(button => button.props['aria-haspopup'] === 'menu')[index]!
      act(() => { (anchor.props.onClick as () => void)() })
      const openMenu = renderer!.root.findAllByProps({ 'data-menu-open': true })[0]!
      act(() => { (openMenu.props.onBlur as () => void)() })
    }

    let filterAnchors = renderer!.root.findAllByType('button')
      .filter(button => button.props['aria-haspopup'] === 'menu')
    act(() => { (filterAnchors[1]!.props.onClick as () => void)() })
    act(() => { (buttonByText(renderer!, STATIC_RESULTS_COPY.audio).props.onClick as () => void)() })
    expect(renderer!.root.findAllByProps({ className: 'harness-comfyui-audio-preview' })).toHaveLength(1)

    filterAnchors = renderer!.root.findAllByType('button')
      .filter(button => button.props['aria-haspopup'] === 'menu')
    act(() => { (filterAnchors[1]!.props.onClick as () => void)() })
    act(() => { (buttonByText(renderer!, STATIC_RESULTS_COPY.allKinds).props.onClick as () => void)() })

    const next = renderer!.root.findByProps({ 'aria-label': STATIC_RESULTS_COPY.nextPage })
    act(() => { (next.props.onClick as () => void)() })
    expect(renderer!.root.findAllByProps({ className: 'harness-comfyui-media-card' })).toHaveLength(2)
    expect(renderer!.root.findByProps({ 'aria-label': STATIC_RESULTS_COPY.previousPage }).props.disabled).toBe(false)
    act(() => {
      ;(renderer!.root.findByProps({ 'aria-label': STATIC_RESULTS_COPY.previousPage }).props.onClick as () => void)()
    })
    expect(renderer!.root.findAllByProps({ className: 'harness-comfyui-media-card' })).toHaveLength(4)

    filterAnchors = renderer!.root.findAllByType('button')
      .filter(button => button.props['aria-haspopup'] === 'menu')
    act(() => { (filterAnchors[0]!.props.onClick as () => void)() })
    act(() => { (buttonByText(renderer!, '第 3 轮 · 服装与背景变体').props.onClick as () => void)() })
    expect(renderer!.root.findAllByProps({ className: 'harness-comfyui-media-card' })).toHaveLength(3)
    expect(renderer!.root.findByProps({ 'aria-label': STATIC_RESULTS_COPY.nextPage }).props.disabled).toBe(true)

    const currentFilterAnchors = renderer!.root.findAllByType('button')
      .filter(button => button.props['aria-haspopup'] === 'menu')
    act(() => { (currentFilterAnchors[1]!.props.onClick as () => void)() })
    act(() => { (buttonByText(renderer!, STATIC_RESULTS_COPY.audio).props.onClick as () => void)() })
    expect(JSON.stringify(renderer!.toJSON())).toContain(STATIC_RESULTS_COPY.noMedia)
    expect(renderer!.root.findAllByProps({ className: 'harness-comfyui-media-card' })).toHaveLength(0)

    const timeFilter = renderer!.root.findAllByType('button')
      .filter(button => button.props['aria-haspopup'] === 'menu')[2]!
    act(() => { (timeFilter.props.onClick as () => void)() })
    act(() => { (buttonByText(renderer!, STATIC_RESULTS_COPY.older).props.onClick as () => void)() })

    act(() => { (buttonByText(renderer!, STATIC_RESULTS_COPY.currentTab).props.onClick as () => void)() })
    expect(buttonByText(renderer!, STATIC_RESULTS_COPY.currentTab).props['aria-selected']).toBe(true)
    act(() => renderer!.unmount())
  })
})

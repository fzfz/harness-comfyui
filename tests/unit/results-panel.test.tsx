import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { createElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'

import {
  createResultsPanel,
  renderResultsPanel,
  type ResultsTab,
} from '../../src/client/workbench/results-panel.tsx'

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup(node: ReactNode): string
}

function childrenOf(element: ReactElement): ReactElement[] {
  const children = (Array.isArray(element.props.children)
    ? element.props.children
    : [element.props.children]) as ReactNode[]
  return children.filter((child): child is ReactElement => (
    child !== null && typeof child === 'object' && 'type' in child
  ))
}

function viewElements(activeTab: ResultsTab = 'current') {
  const onTabChange = vi.fn()
  const root = renderResultsPanel({
    sessionId: 'portrait' as SessionId,
    activeTab,
    onTabChange,
  }) as ReactElement
  const [heading, tabs, scroll] = childrenOf(root)
  const tabButtons = childrenOf(tabs)
  const panels = childrenOf(scroll)
  return { root, heading, tabs, scroll, tabButtons, panels, onTabChange }
}

describe('Issue 3 empty results panel', () => {
  it('renders accessible current/session tabs and only the two exact empty states', () => {
    const view = viewElements()
    const [currentButton, sessionButton] = view.tabButtons
    const [currentPanel, sessionPanel] = view.panels
    const markup = renderToStaticMarkup(view.root)

    expect(markup).toContain('<p class="section-kicker">OUTPUT</p>')
    expect(markup).toContain('<h2>生成结果</h2>')
    expect(currentButton?.props).toMatchObject({
      type: 'button',
      role: 'tab',
      'aria-selected': true,
      'aria-controls': 'panel-current',
      tabIndex: 0,
    })
    expect(sessionButton?.props).toMatchObject({
      type: 'button',
      role: 'tab',
      'aria-selected': false,
      'aria-controls': 'panel-session',
      tabIndex: -1,
    })
    expect(currentPanel?.props).toMatchObject({
      role: 'tabpanel',
      'aria-labelledby': 'tab-current',
      hidden: false,
    })
    expect(sessionPanel?.props).toMatchObject({
      role: 'tabpanel',
      'aria-labelledby': 'tab-session',
      hidden: true,
    })
    expect(markup).toContain('当前轮次结果')
    expect(markup).toContain('本会话结果')
    expect(markup).toContain('本会话共 0 项运行')
    expect(markup).toContain('此轮对话没有创建 ComfyUI 运行')
    expect(markup).toContain('当前聊天轮次没有关联的生成运行。')
    expect(markup).toContain('当前会话还没有生成运行')
    expect(markup).toContain('当前会话中没有可显示的生成运行。')
    expect(markup).not.toContain('generate_with_comfyui')
    expect(markup).not.toContain('run_id')
    expect(markup).not.toContain('媒体')
    expect(markup).not.toContain('上下文')
  })

  it('switches tabs through the public view handler and resets to current for a new Session', () => {
    const currentView = viewElements()
    currentView.tabButtons[0]?.props.onClick()
    expect(currentView.onTabChange).toHaveBeenCalledWith('current')

    const sessionView = viewElements('session')
    const [, sessionButton] = sessionView.tabButtons
    sessionButton?.props.onClick()
    expect(sessionView.onTabChange).toHaveBeenCalledWith('session')
    expect(sessionView.panels[0]?.props.hidden).toBe(true)
    expect(sessionView.panels[1]?.props.hidden).toBe(false)

    const switchedSession = renderResultsPanel({
      sessionId: 'video' as SessionId,
      activeTab: 'current',
      onTabChange: vi.fn(),
    }) as ReactElement
    const switchedTabs = childrenOf(switchedSession)
    const switchedButtons = childrenOf(switchedTabs[1] as ReactElement)
    const switchedPanels = childrenOf(switchedTabs[2] as ReactElement)
    expect(switchedButtons[0]?.props['aria-selected']).toBe(true)
    expect(switchedButtons[1]?.props['aria-selected']).toBe(false)
    expect(switchedPanels[0]?.props.hidden).toBe(false)
    expect(switchedPanels[1]?.props.hidden).toBe(true)
  })

  it('starts every session-scoped occupant on the current tab', () => {
    const ResultsPanel = createResultsPanel()
    const portrait = renderToStaticMarkup(createElement(ResultsPanel, { sessionId: 'portrait' as SessionId }))
    const video = renderToStaticMarkup(createElement(ResultsPanel, { sessionId: 'video' as SessionId }))
    expect(portrait).toContain('id="tab-current" type="button" role="tab" aria-selected="true"')
    expect(video).toContain('id="tab-current" type="button" role="tab" aria-selected="true"')
  })

  it('keeps the result panel desktop CSS limited to the current empty-state surface', () => {
    const stylesheet = readFileSync(new URL('../../src/client/styles.css', import.meta.url), 'utf8')

    expect(stylesheet).toContain('.results-panel {')
    expect(stylesheet).toContain('min-height: 66px;')
    expect(stylesheet).toContain('grid-template-columns: repeat(3, 1fr);')
    expect(stylesheet).toContain('padding: 10px 3px 9px;')
    expect(stylesheet).toContain('min-height: 320px;')
    expect(stylesheet).toContain('height: 62px;')
    expect(stylesheet).toContain('width: 90px;')
    expect(stylesheet).not.toContain('.result-filter-row')
    expect(stylesheet).not.toContain('.session-media-grid')
    expect(stylesheet).not.toContain('.session-media-pagination')
  })
})

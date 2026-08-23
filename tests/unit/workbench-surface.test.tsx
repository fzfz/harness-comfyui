import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { LayoutController } from '../../src/client/workbench/layout-contract.ts'
import { createWorkbenchRoot } from '../../src/client/workbench/root.tsx'

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup(node: ReactNode): string
}

const css = readFileSync(new URL('../../src/client/styles.css', import.meta.url), 'utf8')

function renderRoot(): string {
  const Root = createWorkbenchRoot(new LayoutController())
  return renderToStaticMarkup(createElement(Root, {
    renderSlot: key => createElement('span', { 'data-rendered-slot': key }),
  }))
}

describe('Issue 3 desktop workbench surface contract', () => {
  it('renders the complete prototype desktop Header before the fixed columns', () => {
    const markup = renderRoot()
    const headerStart = markup.indexOf('<header class="app-header">')
    const columnsStart = markup.indexOf('class="harness-comfyui-columns"')

    expect(headerStart).toBeGreaterThanOrEqual(0)
    expect(columnsStart).toBeGreaterThan(headerStart)
    expect(markup).toContain('<svg class="brand-mark" viewBox="0 0 36 36" aria-hidden="true">')
    expect(markup).toContain('<path d="M7 10h8v8H7zM21 18h8v8h-8z"></path>')
    expect(markup).toContain('<path d="M15 14h6M18 14v8M18 22h3"></path>')
    expect(markup).toContain('<p class="eyebrow">DEEPSEEK HARNESS</p>')
    expect(markup).toContain('<h1>生成工作台</h1>')
    expect(markup).toContain('<span class="connection-indicator" aria-hidden="true"></span>')
    expect(markup).toContain('<span>静态数据</span>')
    expect(markup).toContain('<span class="header-divider" aria-hidden="true"></span>')
    expect(markup).toContain('<span class="agent-avatar" aria-hidden="true">DS</span>')
    expect(markup).toContain('<span>图像生成 Agent</span>')
    let previous = headerStart
    for (const token of [
      'DEEPSEEK HARNESS',
      '生成工作台',
      '静态数据',
      'DS',
      '图像生成 Agent',
    ]) {
      const next = markup.indexOf(token, previous)
      expect(next).toBeGreaterThan(previous)
      previous = next
    }
    expect(markup).not.toContain('mobile-nav')
    expect(markup).not.toContain('data-mobile-panel')
  })

  it('keeps the Header and desktop three-column geometry deterministic', () => {
    const markup = renderRoot()

    expect(css).toContain('.app-header {')
    expect(css).toContain('height: 58px;')
    expect(css).toContain('stroke: var(--dsw-alias-state-warn-primary);')
    expect(css).toContain('.harness-comfyui-shell {')
    expect(css).toContain('flex-direction: column;')
    expect(css).toContain('.harness-comfyui-columns {')
    expect(css).toContain('flex: 1;')
    expect(css).toContain('grid-template-rows: 100%;')
    expect(markup).toContain('grid-template-columns:294px minmax(0, 1fr) 432px')
    expect(markup.indexOf('data-layout-column="sidebar"')).toBeLessThan(
      markup.indexOf('data-layout-column="conversation"'),
    )
    expect(markup.indexOf('data-layout-column="conversation"')).toBeLessThan(
      markup.indexOf('data-layout-column="details"'),
    )
    expect(markup.indexOf('data-layout-column="details"')).toBeLessThan(
      markup.indexOf('data-shell-overlay'),
    )
  })

  it('keeps the current desktop surface selectors and excludes later-scope UI', () => {
    const requiredSelectors = [
      '.app-header',
      '.brand-lockup',
      '.brand-mark',
      '.eyebrow',
      '.header-context',
      '.connection-indicator',
      '.header-divider',
      '.agent-avatar',
      '.session-panel',
      '.panel-heading',
      '.search-field',
      '.session-list',
      '.list-date',
      '.session-row',
      '.session-title',
      '.session-meta',
      '.run-count',
      '.session-footer',
      '.storage-glyph',
      '.conversation-header',
      '.message-list',
      '.message',
      '.message-avatar',
      '.message-body',
      '.message-byline',
      '.conversation-turn',
      '.turn-heading',
      '.stream-caret',
      '.message-interrupted',
      '.empty-conversation',
      '.conversation-state',
      '.conversation-error',
      '.composer-wrap',
      '.composer-box',
      '.composer-overlay',
      '.send-button',
      '.composer-box.is-error',
      '.results-panel',
      '.results-heading',
      '.details-tabs',
      '.results-scroll',
      '.empty-results',
      '.result-tab-panel[hidden]',
    ]
    for (const selector of requiredSelectors) {
      expect(css.includes(`${selector} {`) || css.includes(`${selector},`)).toBe(true)
    }

    expect(css).not.toMatch(/@media\b/u)
    expect(css).not.toContain('.mobile-nav')
    expect(css).not.toContain('.sidebar-library-entry')
    expect(css).not.toContain('.context-')
    expect(css).not.toContain('.tool-call')
    expect(css).not.toContain('.result-filter-row')
    expect(css).not.toContain('.run-list')
    expect(css).not.toContain('.session-media-grid')
    expect(css).not.toContain('.dialog')
  })

  it('defines exactly one reusable desktop visual evidence viewport', () => {
    const path = new URL('../../tests/visual/prototype-fidelity-viewports.json', import.meta.url)
    const document = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    expect(Object.keys(document)).toEqual(['schema_version', 'viewports'])
    expect(document.schema_version).toBe(1)
    expect(document.viewports).toEqual([{ width: 1440, height: 1000 }])
  })

  it('does not import static prototype files into the product client', () => {
    const sourcePaths = [
      '../../src/client/index.tsx',
      '../../src/client/styles.css',
      '../../src/client/workbench/root.tsx',
      '../../src/client/workbench/session-sidebar.tsx',
      '../../src/client/workbench/session-header.tsx',
      '../../src/client/workbench/conversation-view.tsx',
      '../../src/client/workbench/composer-bar.tsx',
      '../../src/client/workbench/results-panel.tsx',
    ]
    const source = sourcePaths
      .map(path => readFileSync(new URL(path, import.meta.url), 'utf8'))
      .join('\n')
    expect(source).not.toMatch(/(?:import|from)\s+[^\n]*prototype\//u)
    expect(source).not.toContain('prototype/generation-workbench')
  })
})

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { createElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type {
  ISessions,
  SessionListState,
  SessionSummary,
} from '@deepseek-ai/dsh-client-runtime/client'

import {
  createSessionSidebar,
  renderSessionSidebar,
} from '../../src/client/workbench/session-sidebar.tsx'

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup(node: ReactNode): string
}

function summary(id: string, title: string, updatedAt: number): SessionSummary {
  return {
    id: id as SessionSummary['id'],
    displayTitle: title,
    title,
    updatedAt,
    agentPreset: 'harness-comfyui',
    running: false,
    blank: false,
  }
}

function state(current: string | undefined, entries: readonly SessionSummary[]): SessionListState {
  return {
    ids: entries.map(entry => entry.id),
    byId: Object.fromEntries(entries.map(entry => [entry.id, entry])) as SessionListState['byId'],
    current: current as SessionListState['current'],
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  }
}

function findElements(node: ReactNode, predicate: (element: ReactElement) => boolean): ReactElement[] {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return []
  }
  if (Array.isArray(node)) return node.flatMap(child => findElements(child, predicate))
  if (typeof node !== 'object' || !('type' in node) || !('props' in node)) return []
  const element = node as ReactElement
  return [
    ...(predicate(element) ? [element] : []),
    ...findElements(element.props.children, predicate),
  ]
}

describe('real Harness Session sidebar', () => {
  it('renders public session state, searches it, and opens a selected row', () => {
    const sessions = {
      open: vi.fn(),
      list: {
        getSnapshot: () => state('portrait', [
          summary('portrait', '角色立绘调整', 1_723_300_320_000),
          summary('video', '测试视频工作流', 1_723_296_480_000),
          summary('comparison', '画风参数对比', 1_721_088_000_000),
        ]),
        subscribe: () => () => undefined,
      },
    } as unknown as ISessions
    const sidebar = createSessionSidebar(sessions)
    const initialState = sessions.list.getSnapshot()
    const initial = renderToStaticMarkup(createElement(sidebar, {
      collapsed: false,
      width: 294,
      useSessions: <S,>(selector: (snapshot: SessionListState) => S) => selector(initialState),
    }))

    expect(initial).toContain('data-session-id="portrait"')
    expect(initial).toContain('data-session-id="video"')
    expect(initial).toContain('data-session-id="comparison"')
    expect(initial).toContain('class="session-row is-current"')
    expect(initial).toContain('data-sidebar-collapsed="false"')
    expect(initial).toContain('data-sidebar-width="294"')
    expect(initial).toContain('<div class="session-heading-copy">')
    expect(initial).toContain('<p class="section-kicker">SESSION</p>')
    expect(initial).toContain('<svg viewBox="0 0 20 20" aria-hidden="true">')
    expect(initial).toContain('<kbd>⌘ K</kbd>')
    expect(initial).toContain('class="list-date"')
    expect(initial).toContain('<span class="storage-glyph" aria-hidden="true"></span>')
    expect(initial).toContain('<span>会话历史由 Harness 保存</span>')
    expect(initial).toContain('placeholder="搜索会话"')
    expect(initial).toContain('0 项运行')

    const collapsed = renderToStaticMarkup(createElement(sidebar, {
      collapsed: true,
      width: 320,
      useSessions: <S,>(selector: (snapshot: SessionListState) => S) => selector(initialState),
    }))
    expect(collapsed).toContain('data-sidebar-collapsed="true"')
    expect(collapsed).toContain('data-sidebar-width="320"')

    const today = new Date()
    today.setHours(12, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const groupedMarkup = renderToStaticMarkup(renderSessionSidebar({
      collapsed: false,
      width: 294,
      state: state('portrait', [
        summary('portrait', '角色立绘调整', today.getTime()),
        summary('video', '测试视频工作流', yesterday.getTime()),
      ]),
      query: '',
      onQueryChange: () => undefined,
      onOpen: id => sessions.open(id as never),
    }))
    expect(groupedMarkup).toContain('<p class="list-date">今天</p>')
    expect(groupedMarkup).toContain('<p class="list-date">昨天</p>')

    let query = ''
    const currentState = state('portrait', [
      summary('portrait', '角色立绘调整', 1_723_300_320_000),
      summary('video', '测试视频工作流', 1_723_296_480_000),
      summary('comparison', '画风参数对比', 1_721_088_000_000),
    ])
    const renderView = () => renderSessionSidebar({
      collapsed: false,
      width: 294,
      state: currentState,
      query,
      onQueryChange: value => {
        query = value
      },
      onOpen: id => sessions.open(id as never),
    })
    const searchInput = findElements(renderView(), element => element.type === 'input')[0]
    searchInput?.props.onChange({ currentTarget: { value: '视频' } })
    expect(query).toBe('视频')
    expect(renderToStaticMarkup(renderView())).toContain('data-session-id="video"')
    expect(renderToStaticMarkup(renderView())).not.toContain('data-session-id="portrait"')

    searchInput?.props.onChange({ currentTarget: { value: '' } })
    expect(findElements(renderView(), element => element.type === 'button' && element.props['data-session-id']).length).toBe(3)

    searchInput?.props.onChange({ currentTarget: { value: '不存在的会话' } })
    expect(renderToStaticMarkup(renderView())).toContain('当前搜索没有匹配的会话')

    searchInput?.props.onChange({ currentTarget: { value: '' } })
    const selectedRow = findElements(renderView(), element => element.type === 'button' && element.props['data-session-id'] === 'comparison')[0]
    selectedRow?.props.onClick()
    expect(sessions.open).toHaveBeenCalledWith('comparison')

    const updated = state('video', [summary('video', '测试视频工作流', 1_723_296_480_000)])
    const updatedMarkup = renderToStaticMarkup(renderSessionSidebar({
      collapsed: false,
      width: 294,
      state: updated,
      query: '',
      onQueryChange: () => undefined,
      onOpen: id => sessions.open(id as never),
    }))
    expect(updatedMarkup).toContain('data-session-id="video"')
    expect(updatedMarkup).toContain('class="session-row is-current"')
    expect(updatedMarkup).not.toContain('data-session-id="portrait"')
    expect(updatedMarkup).not.toContain('data-session-id="comparison"')
  })

  it('keeps the owned sidebar CSS at prototype desktop values', () => {
    const stylesheet = readFileSync(new URL('../../src/client/styles.css', import.meta.url), 'utf8')
    expect(stylesheet).toContain('.session-heading-copy {')
    expect(stylesheet).toContain('display: flex;')
    expect(stylesheet).toContain('color: var(--ink);')
    expect(stylesheet).toContain('opacity: 1;')
    expect(stylesheet).toContain('visibility: visible;')
    expect(stylesheet).toContain('min-height: 66px;')
    expect(stylesheet).toContain('padding: 13px 16px 12px;')
    expect(stylesheet).toContain('gap: 8px;')
    expect(stylesheet).toContain('min-height: 36px;')
    expect(stylesheet).toContain('padding: 0 10px;')
    expect(stylesheet).toContain('padding: 0 8px;')
    expect(stylesheet).toContain('margin-bottom: 3px;')
    expect(stylesheet).toContain('padding: 10px 10px 9px;')
    expect(stylesheet).toContain('height: calc(100% - 14px);')
    expect(stylesheet).toContain('padding: 11px 16px;')
    expect(stylesheet).toContain('.storage-glyph::after')
    expect(stylesheet).not.toContain('border-radius: 14px;')
  })
})

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import type {
  SessionListState,
  SessionSummary,
} from '@deepseek-ai/dsh-client-runtime/client'

import { createSessionHeader } from '../../src/client/workbench/session-header.tsx'

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup(node: ReactNode): string
}

type SelectorHook<T> = <S>(selector: (snapshot: T) => S) => S

function summary(id: string, title: string, running: boolean): SessionSummary {
  return {
    id: id as SessionSummary['id'],
    displayTitle: title,
    title,
    updatedAt: 1_723_300_320_000,
    running,
    blank: false,
  }
}

function state(current: SessionSummary): SessionListState {
  return {
    ids: [current.id],
    byId: { [current.id]: current },
    current: current.id,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  }
}

describe('current Harness Session conversation header', () => {
  it('renders two public Session titles with the prototype Agent status', () => {
    const header = createSessionHeader()
    const first = summary('portrait', '角色立绘调整', false)
    const firstState = state(first)
    const firstMarkup = renderToStaticMarkup(createElement(header, {
      sessionId: first.id,
      useSessions: <S,>(selector: (value: SessionListState) => S) => selector(firstState),
    }))

    expect(firstMarkup).toContain('class="conversation-header"')
    expect(firstMarkup).toContain('<p class="section-kicker">CONVERSATION</p>')
    expect(firstMarkup).toContain('<h2 id="conversation-title">角色立绘调整</h2>')
    expect(firstMarkup).toContain('class="agent-status"')
    expect(firstMarkup).toContain('Agent 就绪')
    expect(firstMarkup).toContain('aria-hidden="true"')

    const second = summary('comparison', '画风参数对比', true)
    const secondState = state(second)
    const secondMarkup = renderToStaticMarkup(createElement(header, {
      sessionId: second.id,
      useSessions: <S,>(selector: (value: SessionListState) => S) => selector(secondState),
    }))

    expect(secondMarkup).toContain('<h2 id="conversation-title">画风参数对比</h2>')
    expect(secondMarkup).not.toContain('角色立绘调整')
    expect(secondMarkup).toContain('Agent 就绪')
    expect(secondMarkup).not.toContain('Agent 运行中')
  })

  it('keeps the owned header CSS at prototype desktop values', () => {
    const stylesheet = readFileSync(new URL('../../src/client/styles.css', import.meta.url), 'utf8')
    expect(stylesheet).toContain('.conversation-header {')
    expect(stylesheet).toContain('min-height: 66px;')
    expect(stylesheet).toContain('padding: 13px 20px 12px;')
    expect(stylesheet).toContain('.agent-status {')
    expect(stylesheet).toContain('gap: 7px;')
    expect(stylesheet).toContain('.agent-status > span {')
    expect(stylesheet).toContain('height: 7px;')
    expect(stylesheet).toContain('width: 7px;')
    expect(readFileSync(new URL('../../src/client/workbench/session-header.tsx', import.meta.url), 'utf8'))
      .not.toContain('Agent 运行中')
  })
})

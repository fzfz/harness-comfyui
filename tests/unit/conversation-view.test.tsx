import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import type {
  AssistantMessageNode,
  ConversationSnapshot,
  SessionId,
  UserMessageNode,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { AssistantChatData, ChatNode } from '@deepseek-ai/dsh-client-ui-conversation/client'

import { createConversationView } from '../../src/client/workbench/conversation-view.tsx'

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup(node: ReactNode): string
}

type SelectorHook<T> = <S>(selector: (snapshot: T) => S) => S

const sessionId = 'portrait' as SessionId

function user(seq: number, text: string, time = 1_723_300_320_000): UserMessageNode {
  return {
    kind: 'user',
    seq,
    time,
    content: [{ type: 'text', text }],
    source: 'test',
  }
}

function assistant(
  seq: number,
  turn: number,
  text: string,
  options: { interrupted?: true; time?: number } = {},
): AssistantMessageNode {
  return {
    kind: 'assistant',
    seq,
    time: options.time ?? 1_723_300_321_000,
    turn,
    step: 1,
    blocks: [{ kind: 'text', text }],
    ...(options.interrupted === true ? { interrupted: true } : {}),
  }
}

type VisibleChatNode = ChatNode<'user' | 'assistant-step'>

function chatLocation(turn: number, step?: number): VisibleChatNode['location'] {
  const turnLocation = {
    turn,
    start: undefined,
    end: undefined,
    status: step === undefined ? 'closed' : 'open',
    steps: [],
    data: { get: () => undefined },
  }
  if (step === undefined) return { kind: 'turn', turn: turnLocation } as VisibleChatNode['location']
  return {
    kind: 'step',
    turn: turnLocation,
    step: {
      turn,
      step,
      start: undefined,
      end: undefined,
      status: 'open',
      data: { get: () => undefined },
    },
  } as VisibleChatNode['location']
}

function chatUser(key: string, seq: number, text: string, turn: number): ChatNode<'user'> {
  return {
    key,
    kind: 'user',
    id: key,
    target: 'chat',
    anchorSeq: seq,
    location: chatLocation(turn),
    visibility: 'visible',
    data: {
      kind: 'user',
      seq,
      time: 1_723_300_320_000,
      content: [{ type: 'text', text }],
      source: 'test',
    },
  }
}

function chatAssistant(
  key: string,
  seq: number,
  turn: number,
  text: string,
  status: AssistantChatData['status'] = 'settled',
  step = 1,
): ChatNode<'assistant-step'> {
  return {
    key,
    kind: 'assistant-step',
    id: key,
    target: 'chat',
    anchorSeq: seq,
    location: chatLocation(turn, step),
    visibility: 'visible',
    data: {
      status,
      turn,
      step,
      blocks: [{ kind: 'text', text }],
      time: 1_723_300_321_000,
    },
  }
}

function structuredChat(nodes: readonly VisibleChatNode[]): ConversationSnapshot['chat'] {
  const byKey = new Map(nodes.map(node => [node.key, node]))
  return {
    order: nodes.map(node => node.key),
    nodes: {
      get: key => byKey.get(key),
      values: () => [...byKey.values()],
    },
    locations: {
      getTurn: () => [],
      getStep: () => [],
    },
    timeline: {} as ConversationSnapshot['chat']['timeline'],
    legacy: {} as ConversationSnapshot['chat']['legacy'],
  }
}

function snapshot(
  nodes: readonly ConversationSnapshot['nodes'][number][] = [],
  overrides: Partial<ConversationSnapshot> = {},
): ConversationSnapshot {
  return {
    sessionId,
    views: {} as ConversationSnapshot['views'],
    chat: structuredChat([]),
    nodes,
    turnTimings: new Map(),
    turnEnds: new Map(),
    partial: null,
    runningCalls: [],
    pending: [],
    queue: [],
    running: false,
    subagent: null,
    composerPhase: 'active',
    removed: false,
    openState: 'open',
    openError: null,
    hasMore: false,
    loadingOlder: false,
    promptError: null,
    blank: false,
    lastAgentError: null,
    ...overrides,
  }
}

function chatSnapshot(
  nodes: readonly VisibleChatNode[],
  overrides: Partial<ConversationSnapshot> = {},
): ConversationSnapshot {
  return snapshot([], { chat: structuredChat(nodes), ...overrides })
}

function renderView(value: ConversationSnapshot) {
  const view = createConversationView()
  return renderToStaticMarkup(createElement(view, {
    sessionId,
    useSession: <S,>(selector: (current: ConversationSnapshot) => S) => selector(value),
  } satisfies {
    sessionId: SessionId
    useSession: SelectorHook<ConversationSnapshot>
  }))
}

describe('native ConversationSnapshot chat view', () => {
  it('uses authoritative public Chat locations instead of nearest legacy Assistant inference', () => {
    const markup = renderView(snapshot([
      user(1, '第一用户'),
      user(2, '第二用户'),
      assistant(3, 1, '第一轮回复'),
      assistant(4, 2, '第二轮回复'),
    ], {
      chat: structuredChat([
        chatUser('user-1', 1, '第一用户', 1),
        chatUser('user-2', 2, '第二用户', 2),
        chatAssistant('assistant-1', 3, 1, '第一轮回复'),
        chatAssistant('assistant-2', 4, 2, '第二轮回复'),
      ]),
    }))

    expect(markup).toMatch(/data-turn-id="turn-2"[\s\S]*第二用户/u)
    const turnOne = markup.slice(
      markup.indexOf('data-turn-id="turn-1"'),
      markup.indexOf('data-turn-id="turn-2"'),
    )
    expect(turnOne).not.toContain('第二用户')
  })

  it('does not read legacy nodes or partial values and keeps Message Context out of the empty copy', () => {
    const source = readFileSync(new URL('../../src/client/workbench/conversation-view.tsx', import.meta.url), 'utf8')
    expect(source).not.toContain('snapshot.nodes')
    expect(source).not.toContain('snapshot.partial')
    expect(source).not.toContain('带上下文')
    expect(source).not.toContain('已中断')
  })

  it('renders public user and Agent nodes with the prototype turn/no-run structure', () => {
    const markup = renderView(chatSnapshot([
      chatUser('user-1', 1, '请先说明这个角色的视觉方向。', 1),
      chatAssistant('assistant-1', 2, 1, '我会先整理视觉方向，再继续处理。'),
    ]))

    expect(markup).toContain('class="message-list"')
    expect(markup).toContain('class="conversation-turn"')
    expect(markup).toContain('第 1 轮')
    expect(markup).toContain('查看本轮回复 · 无 ComfyUI 运行')
    expect(markup).toContain('class="message user-message"')
    expect(markup).toContain('<strong>你</strong>')
    expect(markup).toContain('请先说明这个角色的视觉方向。')
    expect(markup).toContain('class="message agent-message"')
    expect(markup).toContain('<strong>图像生成 Agent</strong>')
    expect(markup).toContain('我会先整理视觉方向，再继续处理。')
  })

  it('replaces successive public Agent deltas and marks completed output', () => {
    const first = renderView(chatSnapshot([
      chatUser('user-1', 1, '继续', 1),
      chatAssistant('assistant-1', 2, 1, '第一段', 'running'),
    ]))
    expect(first).toContain('第一段')
    expect(first).toContain('正在输出')
    expect(first).toContain('class="stream-caret"')

    const second = renderView(chatSnapshot([
      chatUser('user-1', 1, '继续', 1),
      chatAssistant('assistant-1', 2, 1, '第二段', 'running'),
    ]))
    expect(second).toContain('第二段')
    expect(second).not.toContain('第一段')
    expect(second).toContain('正在输出')

    const completed = renderView(chatSnapshot([
      chatUser('user-1', 1, '继续', 1),
      chatAssistant('assistant-1', 2, 1, '完成答复'),
    ]))
    expect(completed).toContain('完成答复')
    expect(completed).not.toContain('正在输出')
    expect(completed).not.toContain('stream-caret')
  })

  it('preserves interrupted public text and does not retain a replaced Session', () => {
    const interrupted = renderView(chatSnapshot([
      chatUser('user-1', 1, '停止后保留文本', 1),
      chatAssistant('assistant-1', 2, 1, '已收到，当前输出被停止。', 'interrupted'),
    ]))
    expect(interrupted).toContain('已收到，当前输出被停止。')
    expect(interrupted).toContain('已停止')
    expect(interrupted).not.toContain('已中断')

    const first = renderView(chatSnapshot([
      chatUser('user-1', 1, '旧 Session 请求', 1),
      chatAssistant('assistant-1', 2, 1, '旧 Session 回复'),
    ]))
    expect(first).toContain('旧 Session 回复')

    const replacement = renderView(chatSnapshot([
      chatUser('user-1', 1, '新 Session 请求', 1),
      chatAssistant('assistant-1', 2, 1, '新 Session 回复'),
    ]))
    expect(replacement).toContain('新 Session 回复')
    expect(replacement).not.toContain('旧 Session 请求')
    expect(replacement).not.toContain('旧 Session 回复')
  })

  it('uses public loading, error, and empty snapshot states', () => {
    expect(renderView(chatSnapshot([], { openState: 'loading', blank: true })))
      .toContain('载入历史…')

    expect(renderView(chatSnapshot([], {
      openState: 'error',
      openError: { message: 'network down', code: 'SESSION_LOAD_FAILED' } as never,
    }))).toContain('历史加载失败：network down（SESSION_LOAD_FAILED）')

    const empty = renderView(chatSnapshot([], { blank: true }))
    expect(empty).toContain('class="empty-conversation"')
    expect(empty).toContain('当前会话还没有消息')
  })

  it('keeps the owned desktop message and turn CSS explicit', () => {
    const stylesheet = readFileSync(new URL('../../src/client/styles.css', import.meta.url), 'utf8')
    expect(stylesheet).toContain('.message-list {')
    expect(stylesheet).toContain('padding: 24px clamp(20px, 4vw, 54px) 36px;')
    expect(stylesheet).toContain('.conversation-turn {')
    expect(stylesheet).toContain('margin: 0 -10px 22px;')
    expect(stylesheet).toContain('.turn-heading button {')
    expect(stylesheet).toContain('.user-message .message-body {')
    expect(stylesheet).toContain('.stream-caret {')
    expect(stylesheet).toContain('@keyframes caret {')
  })
})

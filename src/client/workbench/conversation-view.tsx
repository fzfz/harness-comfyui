import type {
  ChatConversationViewNode,
  ConversationSnapshot,
  SessionId,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { AssistantChatData, ChatNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { type ReactNode } from 'react'

type SelectorHook<T> = <S>(selector: (snapshot: T) => S) => S

export type ConversationViewProps = {
  sessionId: SessionId
  useSession: SelectorHook<ConversationSnapshot>
}

type VisibleChatNode = ChatNode<'user' | 'assistant-step'>
type ChatUserNode = ChatNode<'user'>
type ChatAssistantNode = ChatNode<'assistant-step'>

type ConversationTurn = {
  turn: number
  messages: VisibleChatNode[]
}

function textFromContent(content: readonly { type: string; text?: string }[]): string {
  return content
    .filter(block => block.type === 'text')
    .map(block => block.text ?? '')
    .join('')
}

function textFromAssistantBlocks(blocks: AssistantChatData['blocks']): string {
  return blocks
    .filter((block): block is Extract<AssistantChatData['blocks'][number], { kind: 'text' }> => block.kind === 'text')
    .map(block => block.text)
    .join('')
}

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function formatMessageTime(time: number): string {
  return timeFormatter.format(time)
}

function isVisibleChatNode(node: ChatConversationViewNode): node is VisibleChatNode {
  return node.visibility === 'visible' && (node.kind === 'user' || node.kind === 'assistant-step')
}

function orderedVisibleChatNodes(snapshot: ConversationSnapshot): VisibleChatNode[] {
  return snapshot.chat.order.flatMap(key => {
    const node = snapshot.chat.nodes.get(key)
    return node !== undefined && isVisibleChatNode(node) ? [node] : []
  })
}

function turnFromLocation(node: VisibleChatNode): number | undefined {
  if (node.kind === 'assistant-step') {
    if (node.location.kind === 'turn' || node.location.kind === 'step') {
      return node.location.turn.turn
    }
    return node.data.turn
  }

  if (node.location.kind === 'turn' || node.location.kind === 'step') {
    return node.location.turn.turn
  }
  return undefined
}

function stepFromAssistant(node: ChatAssistantNode): number {
  return node.location.kind === 'step' ? node.location.step.step : node.data.step
}

function groupMessages(snapshot: ConversationSnapshot): ConversationTurn[] {
  const turns: ConversationTurn[] = []
  const byTurn = new Map<number, ConversationTurn>()

  for (const node of orderedVisibleChatNodes(snapshot)) {
    const turn = turnFromLocation(node)
    if (turn === undefined) continue
    let group = byTurn.get(turn)
    if (group === undefined) {
      group = { turn, messages: [] }
      byTurn.set(turn, group)
      turns.push(group)
    }
    group.messages.push(node)
  }

  return turns
}

function renderUserMessage(node: ChatUserNode): ReactNode {
  return (
    <article
      className="message user-message"
      data-message-kind="user"
      data-message-seq={node.data.seq}
      key={node.key}
    >
      <div className="message-body">
        <div className="message-byline">
          <strong>你</strong>
          <time dateTime={String(node.data.time)}>{formatMessageTime(node.data.time)}</time>
        </div>
        <p>{textFromContent(node.data.content)}</p>
      </div>
    </article>
  )
}

function renderAssistantMessage(node: ChatAssistantNode): ReactNode {
  const text = textFromAssistantBlocks(node.data.blocks)
  const streaming = node.data.status === 'running'
  const status = streaming ? '正在输出' : formatMessageTime(node.data.time)
  const step = stepFromAssistant(node)

  return (
    <article
      className="message agent-message"
      data-message-kind="agent"
      data-message-step={step}
      data-message-turn={node.data.turn}
      key={node.key}
    >
      <div className="message-avatar" aria-hidden="true">DS</div>
      <div className="message-body">
        <div className="message-byline">
          <strong>图像生成 Agent</strong>
          <time>{status}</time>
        </div>
        <p>
          {text}
          {streaming ? <span className="stream-caret" aria-label="Agent 正在流式输出" /> : null}
        </p>
        {node.data.status === 'interrupted' ? <span className="message-interrupted">已停止</span> : null}
      </div>
    </article>
  )
}

function renderTurn(turn: ConversationTurn): ReactNode {
  return (
    <section className="conversation-turn" data-turn-id={`turn-${turn.turn}`} key={turn.turn}>
      <div className="turn-heading">
        <button type="button" data-select-turn={`turn-${turn.turn}`}>
          <span>{`第 ${turn.turn} 轮`}</span>
          <strong>查看本轮回复 · 无 ComfyUI 运行</strong>
        </button>
      </div>
      {turn.messages.map(message => message.kind === 'user'
        ? renderUserMessage(message)
        : renderAssistantMessage(message))}
    </section>
  )
}

function renderOpenError(snapshot: ConversationSnapshot): ReactNode {
  if (snapshot.openState !== 'error' || snapshot.openError === null) return null
  return (
    <div className="conversation-state conversation-error" role="alert">
      {`历史加载失败：${snapshot.openError.message}（${snapshot.openError.code}）`}
    </div>
  )
}

function renderConversationBody(snapshot: ConversationSnapshot): ReactNode {
  if (snapshot.openState === 'loading') {
    return <div className="conversation-state">载入历史…</div>
  }

  if (snapshot.openState === 'error') {
    return renderOpenError(snapshot)
  }

  const turns = groupMessages(snapshot)
  if (turns.length === 0) {
    return (
      <div className="empty-conversation">
        <h3>当前会话还没有消息</h3>
      </div>
    )
  }

  return (
    <>
      {turns.map(renderTurn)}
      {snapshot.lastAgentError ? (
        <div className="conversation-state conversation-error" role="alert">
          {snapshot.lastAgentError}
        </div>
      ) : null}
    </>
  )
}

export function renderConversationView(snapshot: ConversationSnapshot): ReactNode {
  return (
    <div className="message-list" aria-live="polite">
      {renderConversationBody(snapshot)}
    </div>
  )
}

/** Render ordinary public ConversationSnapshot nodes for the active Session. */
export function createConversationView() {
  return function ConversationView(props: ConversationViewProps): ReactNode {
    const snapshot = props.useSession(current => current)
    return renderConversationView(snapshot)
  }
}

import type { SessionEvent } from '@deepseek-ai/dsh-session'

export interface SessionRequest {
  request_id: string
  harness_turn: number | null
  start_seq: number
}

export function requestTurn(events: readonly SessionEvent[], request: SessionRequest) {
  const relevant = events.filter(event => event.seq > request.start_seq)
  let current: number | null = null
  let turn = request.harness_turn
  for (const event of relevant) {
    if (event.type === 'turn/start') current = event.data.turn
    if (event.type === 'user/message' && event.data.source.kind === 'user' && 'rpcId' in event.data.source && event.data.source.rpcId === request.request_id) turn = current
  }
  if (turn === null) return null
  const end = relevant.find(event => event.type === 'turn/end' && event.data.turn === turn)
  const reply = [...relevant].reverse().find(event => event.type === 'assistant/message' && event.data.turn === turn && !event.data.interrupted)
  const text = reply?.type === 'assistant/message' ? reply.data.message.content.filter(block => block.type === 'text').map(block => block.text).join('') : ''
  const accepted = relevant.some(event => event.type === 'turn/start' && event.data.turn === turn)
  return { turn, accepted, end: end?.type === 'turn/end' ? end : null, text }
}

export class SessionEventConsumer {
  private readonly processing = new Map<string, Promise<void>>()
  constructor(private readonly read: (sessionId: string) => readonly SessionEvent[] | Promise<readonly SessionEvent[]>) {}

  async consume(sessionId: string, apply: (events: readonly SessionEvent[]) => void | Promise<void>): Promise<void> {
    const previous = this.processing.get(sessionId) ?? Promise.resolve()
    const operation = previous.catch(() => {}).then(async () => {
      const events = [...await this.read(sessionId)].sort((left, right) => left.seq - right.seq)
      await apply(events)
    })
    this.processing.set(sessionId, operation)
    try { await operation } finally { if (this.processing.get(sessionId) === operation) this.processing.delete(sessionId) }
  }

  clear(): void { this.processing.clear() }
}

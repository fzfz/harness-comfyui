import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadTestDesktopContext } from '../support/desktop-context.mjs'

const desktop = await loadTestDesktopContext()
const requireDesktop = createRequire(resolve(desktop.desktopSource, 'package.json'))
const driver = await import(pathToFileURL(requireDesktop.resolve('@deepseek-ai/dsh-goal-round-driver')).href)

function fixture() {
  const listeners = new Map()
  const runs = []
  const goal = { id: 'goal-1', revision: 1, objective: '完成图片任务', phase: 'active',
    activation: 'armed', roundsStarted: 0, maxGoalRounds: 10 }
  const queued = []
  const parent = { id: 'parent', status: 'running', session: {}, inbox: { nextStep: [], nextTurn: [] },
    followup: vi.fn(message => { queued.push(message); parent.inbox.nextTurn.push(message) }) }
  const child = { id: 'child', status: 'running', session: { header: { parentSession: parent.id } } }
  const ctx = {
    fiber: { state: 2 }, logger: { warn: vi.fn() },
    agents: { get: id => id === parent.id ? parent : child, list: () => [],
      withoutInitiator: fn => { const promise = fn(); runs.push(promise); return promise } },
    goals: { get: vi.fn(() => goal), disarm: vi.fn(), block: vi.fn(), pause: vi.fn() },
    sessions: { flush: vi.fn(async () => {}) },
    on: (name, listener) => { listeners.set(name, listener) },
    effect: fn => { fn().next() },
  }
  driver.apply(ctx)
  async function emit(name, data) {
    listeners.get(name)?.(data)
    await Promise.all(runs)
    await Promise.resolve()
  }
  return { ctx, parent, child, goal, queued, emit, listeners }
}

afterEach(() => vi.useRealTimers())

describe('installed native Goal driver while a continuable child is running', () => {
  it('does not poll elapsed time but queues a Goal round when the parent becomes idle', async () => {
    vi.useFakeTimers()
    const { ctx, parent, child, queued, emit } = fixture()
    await emit('agent/created', { agent: parent })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(queued).toHaveLength(0)
    expect(ctx.goals.get).not.toHaveBeenCalled()
    parent.status = 'idle'
    await emit('agent/status', { agent: parent, status: 'idle' })
    expect(child.status).toBe('running')
    expect(queued).toHaveLength(1)
    expect(queued[0].source).toMatchObject({ kind: 'goal', round: 1 })
    const reads = ctx.goals.get.mock.calls.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(queued).toHaveLength(1)
    expect(ctx.goals.get).toHaveBeenCalledTimes(reads)
  })

  it('queues another Goal round after an admitted round ends even when the child still runs', async () => {
    const { parent, child, goal, queued, emit, listeners } = fixture()
    parent.status = 'idle'
    await emit('agent/status', { agent: parent, status: 'idle' })
    const message = queued[0]
    parent.status = 'running'
    parent.inbox.nextTurn = []
    await emit('agent/inbox/claimed', { agent: parent, message })
    const enter = { kind: 'enter', messages: [message] }
    expect(await listeners.get('agent/pre-step')({ agent: parent, messages: [message],
      signal: new AbortController().signal }, async () => enter)).toMatchObject(enter)
    listeners.get('session/event')(parent.session, { type: 'user/message', data: message })
    goal.roundsStarted = 1
    parent.status = 'idle'
    await emit('agent/status', { agent: parent, status: 'idle' })
    expect(child.status).toBe('running')
    expect(queued.map(item => item.source.round)).toEqual([1, 2])
  })
})

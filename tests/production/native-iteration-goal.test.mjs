import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { loadTestDesktopContext } from '../support/desktop-context.mjs'

const desktop = await loadTestDesktopContext()
const requireDesktop = createRequire(resolve(desktop.desktopSource, 'package.json'))
const load = name => import(pathToFileURL(requireDesktop.resolve(name)).href)
const [{ Context, Service }, domain, goalTools, command] = await Promise.all([
  load('@deepseek-ai/cordis'), load('@deepseek-ai/dsh-goal'),
  load('@deepseek-ai/dsh-tool-goal'), load('@deepseek-ai/dsh-command-goal'),
])

async function setup() {
  const ctx = new Context()
  const events = [{ type: 'turn/start', data: {} },
    { type: 'user/message', data: { source: { kind: 'user' } } }]
  let projection = domain.goalProjectionDefinition.init()
  let boundary = 0
  const parent = { id: 'parent', status: 'running' }
  let roots = [parent]
  const session = {
    id: 'parent', get seq() { return events.length }, snapshotEvents: () => events,
    append(type, data) {
      const event = { type, data, seq: events.length }
      events.push(event)
      projection = domain.applyGoalProjection(projection, event)
      ctx.emit('session/event', session, event)
      return event
    },
  }
  parent.session = session
  class Agents extends Service {
    constructor(ctx) { super(ctx, 'agents') }
    get(id) { return id === parent.id ? parent : undefined }
    currentInitiator() { return parent }
    roots() { return roots }
  }
  class Projections extends Service {
    constructor(ctx) { super(ctx, 'sessionProjections') }
    register() {}
    stateOf(_session, key) { return key === 'goal' ? projection : { openTurnStartSeq: boundary } }
  }
  const fibers = [await ctx.plugin(Agents), await ctx.plugin(Projections), await ctx.plugin(domain.GoalService)]
  const tools = new Map()
  let goalCommand
  goalTools.apply({ agents: ctx.agents, goals: ctx.goals, sessionProjections: ctx.sessionProjections,
    systemPrompt: { section() {}, getSectionOrder: () => 1 },
    tools: { register: tool => tools.set(tool.name, tool) },
  }, {})
  command.apply({ goals: ctx.goals, commands: { register: definition => { goalCommand = definition } } })
  const exec = { agent: parent, signal: new AbortController().signal, deferContext: vi.fn() }
  return {
    parent, tools, exec, goals: ctx.goals, command: goalCommand,
    call: (name, args = {}) => tools.get(name).execute(args, exec),
    removeFromRoots: () => { roots = [] },
    newTurn(source) {
      boundary = events.length
      session.append('turn/start', {})
      session.append('user/message', { source })
    },
    close: async () => { for (const fiber of fibers.reverse()) await fiber.dispose() },
  }
}

describe('installed native Goal tools for the iteration parent', () => {
  it('creates, reads and completes a persisted goal from a human task', async () => {
    const f = await setup()
    try {
      expect(await f.call('get_goal')).toEqual({ goal: null })
      const created = await f.call('create_goal', { objective: '完成指定画面', max_goal_rounds: 5 })
      expect(created.goal).toMatchObject({ objective: '完成指定画面', phase: 'active' })
      const { goal } = await f.call('get_goal')
      expect(await f.call('update_goal', { goal_id: goal.id, revision: goal.revision, action: 'complete' }))
        .toMatchObject({ goal: { phase: 'complete' } })
    } finally { await f.close() }
  })

  it('supports native /goal create, edit, pause, resume and clear without model calls', async () => {
    const f = await setup()
    try {
      const invoke = rawInput => f.command.handler({ agent: f.parent, rawInput, attachments: [] })
      expect(invoke('完成指定画面').kind).toBe('success')
      expect(f.goals.get(f.parent)).toMatchObject({ phase: 'active', activation: 'armed' })
      expect(invoke('edit 完成修改后的画面').kind).toBe('success')
      expect(f.goals.get(f.parent).objective).toBe('完成修改后的画面')
      expect(invoke('pause').kind).toBe('success')
      expect(f.goals.get(f.parent)).toMatchObject({ phase: 'paused', activation: 'disarmed' })
      expect(invoke('resume').kind).toBe('success')
      expect(f.goals.get(f.parent)).toMatchObject({ phase: 'active', activation: 'armed' })
      expect(invoke('clear').kind).toBe('success')
      expect(f.goals.get(f.parent)).toBeUndefined()
    } finally { await f.close() }
  })

  it('does not allow a subagent to create the parent task goal', async () => {
    const f = await setup()
    try {
      f.removeFromRoots()
      await expect(f.call('create_goal', { objective: 'wrong owner' })).rejects.toThrow('top-level')
      expect(f.goals.get(f.parent)).toBeUndefined()
    } finally { await f.close() }
  })

  it('completes during the matching Goal round and stops automatic continuation', async () => {
    const f = await setup()
    try {
      const { goal } = await f.call('create_goal', { objective: '完成指定画面' })
      f.newTurn({ kind: 'goal', goalId: goal.id, revision: goal.revision, round: 1 })
      const current = (await f.call('get_goal')).goal
      expect(current.roundsStarted).toBe(1)
      expect(await f.call('update_goal', { goal_id: current.id, revision: current.revision, action: 'complete' }))
        .toMatchObject({ goal: { phase: 'complete' } })
      expect(f.goals.get(f.parent).activation).toBe('disarmed')
      expect(f.exec.deferContext).toHaveBeenCalledOnce()
    } finally { await f.close() }
  })

  it('keeps a goal active when completion is attempted from only a child notice', async () => {
    const f = await setup()
    try {
      const { goal } = await f.call('create_goal', { objective: '完成指定画面' })
      f.newTurn({ kind: 'subagent-settled', senderSessionId: 'child' })
      await expect(f.call('update_goal', { goal_id: goal.id, revision: goal.revision, action: 'complete' }))
        .rejects.toThrow('current goal round')
      expect(f.goals.get(f.parent).phase).toBe('active')
    } finally { await f.close() }
  })
})

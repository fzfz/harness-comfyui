import { createRequire } from 'node:module'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  SessionFace,
  SessionListState,
  SessionSummary,
} from '@deepseek-ai/dsh-client-runtime/client'

import { LayoutController } from '../../src/client/workbench/layout-contract.ts'
import { renderSessionSidebar } from '../../src/client/workbench/session-sidebar.tsx'
import { WORKBENCH_SESSION_ERROR_MESSAGES } from '../../src/client/workbench/session-binding-errors.ts'
import {
  startWorkbenchSessionBinding,
  type WorkbenchSessionBinding,
} from '../../src/client/workbench/workbench-session-binding.ts'
import { createWorkbenchRoot } from '../../src/client/workbench/root.tsx'

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup(node: ReactNode): string
}

function summary(
  id: string,
  updatedAt: number,
  options: Pick<SessionSummary, 'agentPreset' | 'origin'> = {},
): SessionSummary {
  return {
    id: id as SessionSummary['id'],
    displayTitle: id,
    title: id,
    updatedAt,
    running: false,
    blank: false,
    ...options,
  }
}

function state(
  current: string | undefined,
  entries: readonly SessionSummary[],
  phase: SessionListState['phase'] = 'ready',
): SessionListState {
  return {
    ids: entries.map(entry => entry.id),
    byId: Object.fromEntries(entries.map(entry => [entry.id, entry])) as SessionListState['byId'],
    current: current as SessionListState['current'],
    phase,
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  }
}

type PendingCreate = {
  payload: unknown
  signal: AbortSignal | undefined
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

function sessionListHarness(initialState: SessionListState, options: { createThrows?: boolean } = {}) {
  let snapshot = initialState
  let hostSnapshot: { cwd: string } | undefined = { cwd: '/workspace' }
  const hostListeners = new Set<() => void>()
  const listListeners = new Set<() => void>()
  const open = vi.fn()
  let pendingCreate: PendingCreate | undefined
  const create = vi.fn((payload: unknown, signal?: AbortSignal) => {
    if (options.createThrows === true) throw new Error('create rejected synchronously')
    return new Promise<unknown>((resolve, reject) => {
      pendingCreate = { payload, signal, resolve, reject }
    })
  })
  const connection = {
    hostDescription: {
      getSnapshot: () => hostSnapshot,
      subscribe: (listener: () => void) => {
        hostListeners.add(listener)
        return () => hostListeners.delete(listener)
      },
    },
    api: { sessions: { create } },
  }
  const sessions = {
    list: {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listListeners.add(listener)
        return () => listListeners.delete(listener)
      },
    },
    open,
  }

  return {
    connection,
    sessions,
    open,
    create,
    setState(next: SessionListState) {
      snapshot = next
      for (const listener of listListeners) listener()
    },
    setHost(next: { cwd: string } | undefined) {
      hostSnapshot = next
      for (const listener of hostListeners) listener()
    },
    notifyHost() {
      for (const listener of hostListeners) listener()
    },
    notify() {
      for (const listener of listListeners) listener()
    },
    resolveCreate(value: unknown) {
      if (pendingCreate === undefined) throw new Error('create was not called')
      pendingCreate.resolve(value)
    },
    rejectCreate(reason: unknown) {
      if (pendingCreate === undefined) throw new Error('create was not called')
      pendingCreate.reject(reason)
    },
    pendingCreate() {
      return pendingCreate
    },
  }
}

function successfulCreate(sessionId: string, agentPreset = 'harness-comfyui') {
  return {
    rpcId: 'rpc-1',
    result: {
      ok: true,
      value: { sessionId, agentPreset },
    },
  }
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function renderBindingRoot(binding: WorkbenchSessionBinding, session: SessionFace): string {
  const Root = createWorkbenchRoot(new LayoutController(), binding)
  return renderToStaticMarkup(createElement(Root, {
    renderSlot: key => {
      if (key === 'conversation') {
        void session.prompt([], 'queue')
        return createElement(
          'div',
          { 'data-conversation-occupant': 'mounted' },
          createElement('button', { 'data-submit-entry': 'mounted' }, '提交入口'),
        )
      }
      return createElement('span', { 'data-slot': key })
    },
  }))
}

async function assertCreateFailureBlocksConversation(
  settle: (harness: ReturnType<typeof sessionListHarness>) => void,
) {
  const harness = sessionListHarness(state(undefined, []))
  const binding = startWorkbenchSessionBinding({
    connection: harness.connection as never,
    sessions: harness.sessions as never,
  })
  settle(harness)
  await flushMicrotasks()

  const prompt = vi.fn(async (..._args: unknown[]) => undefined)
  const session = { prompt } as unknown as SessionFace
  const markup = renderBindingRoot(binding, session)

  expect(binding.getSnapshot()).toMatchObject({
    phase: 'error',
    error: { code: 'WORKBENCH_SESSION_CREATE_FAILED' },
  })
  expect(markup).toContain('data-slot="sidebar"')
  expect(markup).toContain('data-slot="details"')
  expect(markup).toContain('class="conversation-state conversation-error"')
  expect(markup).toContain(WORKBENCH_SESSION_ERROR_MESSAGES.WORKBENCH_SESSION_CREATE_FAILED)
  expect(markup).not.toContain('data-conversation-occupant="mounted"')
  expect(markup).not.toContain('data-submit-entry="mounted"')
  expect(prompt).not.toHaveBeenCalled()
  binding.dispose()
}

describe('Workbench Session binding', () => {
  it('leaves ready only for a confirmed project current and corrects one invalid current once', () => {
    const entries = [
      summary('standard', 500, { agentPreset: 'standard' }),
      summary('project-a', 300, { agentPreset: 'harness-comfyui' }),
      summary('project-b', 100, { agentPreset: 'harness-comfyui' }),
    ]
    const harness = sessionListHarness(state('standard', entries))
    const binding = startWorkbenchSessionBinding({
      connection: harness.connection as never,
      sessions: harness.sessions as never,
    })

    expect(harness.open).toHaveBeenCalledOnce()
    expect(harness.open).toHaveBeenCalledWith('project-a')
    expect(binding.getSnapshot().phase).not.toBe('ready')

    harness.setState(state('project-a', entries))
    expect(binding.getSnapshot()).toMatchObject({ phase: 'ready', error: undefined })

    harness.setState(state('standard', entries))
    expect(binding.getSnapshot().phase).not.toBe('ready')
    expect(harness.open).toHaveBeenCalledTimes(2)
    expect(harness.open).toHaveBeenLastCalledWith('project-a')

    harness.notify()
    expect(harness.open).toHaveBeenCalledTimes(2)

    harness.setState(state('project-a', entries))
    expect(binding.getSnapshot()).toMatchObject({ phase: 'ready', error: undefined })
    binding.dispose()
  })

  it('notifies a subscribed listener for a state change and stops after unsubscribe', () => {
    const entries = [
      summary('standard', 500, { agentPreset: 'standard' }),
      summary('project-a', 300, { agentPreset: 'harness-comfyui' }),
    ]
    const harness = sessionListHarness(state('standard', entries))
    const binding = startWorkbenchSessionBinding({
      connection: harness.connection as never,
      sessions: harness.sessions as never,
    })
    const listener = vi.fn()
    const unsubscribe = binding.subscribe(listener)

    harness.setState(state('project-a', entries))
    expect(listener).toHaveBeenCalledOnce()
    expect(binding.getSnapshot()).toMatchObject({ phase: 'ready', error: undefined })

    unsubscribe()
    harness.setState(state('standard', entries))
    expect(listener).toHaveBeenCalledOnce()
    binding.dispose()
  })

  it('waits for a connected Host and ready list, then opens the deterministic project Session once', () => {
    const harness = sessionListHarness(state('standard', [
      summary('standard', 500, { agentPreset: 'standard' }),
      summary('subagent-newest', 900, { agentPreset: 'harness-comfyui', origin: 'subagent' }),
      summary('project-b', 200, { agentPreset: 'harness-comfyui' }),
      summary('project-a', 200, { agentPreset: 'harness-comfyui' }),
    ], 'pending'))
    harness.setHost(undefined)

    const binding = startWorkbenchSessionBinding({
      connection: harness.connection as never,
      sessions: harness.sessions as never,
    })

    expect(harness.open).not.toHaveBeenCalled()
    harness.setState(state('standard', [
      summary('standard', 500, { agentPreset: 'standard' }),
      summary('subagent-newest', 900, { agentPreset: 'harness-comfyui', origin: 'subagent' }),
      summary('project-b', 200, { agentPreset: 'harness-comfyui' }),
      summary('project-a', 200, { agentPreset: 'harness-comfyui' }),
    ]))

    expect(harness.open).not.toHaveBeenCalled()
    harness.setHost({ cwd: '/workspace' })
    expect(harness.open).toHaveBeenCalledOnce()
    expect(harness.open).toHaveBeenCalledWith('project-a')
    expect(harness.create).not.toHaveBeenCalled()

    harness.notify()
    harness.setState(state('project-a', [
      summary('standard', 500, { agentPreset: 'standard' }),
      summary('subagent-newest', 900, { agentPreset: 'harness-comfyui', origin: 'subagent' }),
      summary('project-b', 200, { agentPreset: 'harness-comfyui' }),
      summary('project-a', 200, { agentPreset: 'harness-comfyui' }),
    ]))
    expect(harness.open).toHaveBeenCalledOnce()

    binding.dispose()
  })

  it('drops a pending target that no longer qualifies and opens the next project Session', () => {
    const harness = sessionListHarness(state('standard', [
      summary('standard', 500, { agentPreset: 'standard' }),
      summary('project-a', 300, { agentPreset: 'harness-comfyui' }),
      summary('project-b', 200, { agentPreset: 'harness-comfyui' }),
    ]))
    const binding = startWorkbenchSessionBinding({
      connection: harness.connection as never,
      sessions: harness.sessions as never,
    })

    expect(harness.open).toHaveBeenCalledWith('project-a')
    harness.setState(state('standard', [
      summary('standard', 500, { agentPreset: 'standard' }),
      summary('project-a', 300, { agentPreset: 'standard' }),
      summary('project-b', 200, { agentPreset: 'harness-comfyui' }),
    ]))

    expect(harness.open).toHaveBeenCalledTimes(2)
    expect(harness.open).toHaveBeenLastCalledWith('project-b')
    expect(harness.create).not.toHaveBeenCalled()
    binding.dispose()
  })

  it('keeps the current project Session and does not create a Session', () => {
    const harness = sessionListHarness(state('project-current', [
      summary('project-current', 100, { agentPreset: 'harness-comfyui' }),
      summary('project-newer', 900, { agentPreset: 'harness-comfyui' }),
    ]))

    const binding = startWorkbenchSessionBinding({
      connection: harness.connection as never,
      sessions: harness.sessions as never,
    })

    expect(harness.open).not.toHaveBeenCalled()
    expect(harness.create).not.toHaveBeenCalled()
    binding.dispose()
  })

  it('creates exactly once with the current Host cwd and opens only after matching list convergence', async () => {
    const harness = sessionListHarness(state(undefined, []))
    const binding = startWorkbenchSessionBinding({
      connection: harness.connection as never,
      sessions: harness.sessions as never,
    })

    expect(harness.create).toHaveBeenCalledOnce()
    expect(harness.pendingCreate()?.payload).toEqual({
      cwd: '/workspace',
      agentPreset: 'harness-comfyui',
    })
    expect(harness.pendingCreate()?.signal).toBeInstanceOf(AbortSignal)

    harness.notify()
    harness.notifyHost()
    expect(harness.create).toHaveBeenCalledOnce()

    harness.resolveCreate(successfulCreate('created-session'))
    await flushMicrotasks()
    expect(binding.getSnapshot()).toMatchObject({
      phase: 'awaiting-list',
      pendingSessionId: 'created-session',
    })
    expect(harness.open).not.toHaveBeenCalled()

    harness.setState(state(undefined, [summary('created-session', 100, { agentPreset: 'harness-comfyui' })]))
    expect(harness.open).toHaveBeenCalledOnce()
    expect(harness.open).toHaveBeenCalledWith('created-session')
    expect(binding.getSnapshot().phase).not.toBe('ready')
    harness.setState(state('created-session', [summary('created-session', 100, { agentPreset: 'harness-comfyui' })]))
    expect(binding.getSnapshot()).toMatchObject({ phase: 'ready', error: undefined })
    binding.dispose()
  })

  it('maps a synchronous Session create throw to CREATE_FAILED', () => {
    const harness = sessionListHarness(state(undefined, []), { createThrows: true })
    const binding = startWorkbenchSessionBinding({
      connection: harness.connection as never,
      sessions: harness.sessions as never,
    })

    expect(binding.getSnapshot()).toMatchObject({
      phase: 'error',
      error: { code: 'WORKBENCH_SESSION_CREATE_FAILED' },
    })
    binding.dispose()
  })

  it('maps a rejected Session create Promise to CREATE_FAILED', async () => {
    const harness = sessionListHarness(state(undefined, []))
    const binding = startWorkbenchSessionBinding({
      connection: harness.connection as never,
      sessions: harness.sessions as never,
    })

    harness.rejectCreate(new Error('create rejected'))
    await flushMicrotasks()

    expect(binding.getSnapshot()).toMatchObject({
      phase: 'error',
      error: { code: 'WORKBENCH_SESSION_CREATE_FAILED' },
    })
    binding.dispose()
  })

  it('maps a result.ok=false Session create envelope to CREATE_FAILED', async () => {
    const harness = sessionListHarness(state(undefined, []))
    const binding = startWorkbenchSessionBinding({
      connection: harness.connection as never,
      sessions: harness.sessions as never,
    })

    harness.resolveCreate({
      rpcId: 'rpc-1',
      result: { ok: false, error: { code: 'CREATE_REJECTED', message: 'rejected' } },
    })
    await flushMicrotasks()

    expect(binding.getSnapshot()).toMatchObject({
      phase: 'error',
      error: { code: 'WORKBENCH_SESSION_CREATE_FAILED' },
    })
    binding.dispose()
  })

  it('blocks the public SessionFace prompt after a rejected create Promise', async () => {
    await assertCreateFailureBlocksConversation(harness => {
      harness.rejectCreate(new Error('create rejected'))
    })
  })

  it('blocks the public SessionFace prompt after a result.ok=false create envelope', async () => {
    await assertCreateFailureBlocksConversation(harness => {
      harness.resolveCreate({
        rpcId: 'rpc-1',
        result: { ok: false, error: { code: 'CREATE_REJECTED', message: 'rejected' } },
      })
    })
  })

  it('publishes PRESET_MISMATCH when create resolves a different Agent Preset', async () => {
    const harness = sessionListHarness(state(undefined, []))
    const binding = startWorkbenchSessionBinding({
      connection: harness.connection as never,
      sessions: harness.sessions as never,
    })

    harness.resolveCreate(successfulCreate('created-session', 'standard'))
    await flushMicrotasks()

    expect(binding.getSnapshot()).toMatchObject({
      phase: 'error',
      error: { code: 'WORKBENCH_SESSION_PRESET_MISMATCH' },
    })
    expect(harness.open).not.toHaveBeenCalled()
    binding.dispose()
  })

  it('publishes CREATE_FAILED when the successful envelope has no session ID', async () => {
    const harness = sessionListHarness(state(undefined, []))
    const binding = startWorkbenchSessionBinding({
      connection: harness.connection as never,
      sessions: harness.sessions as never,
    })

    harness.resolveCreate({
      rpcId: 'rpc-1',
      result: { ok: true, value: { agentPreset: 'harness-comfyui' } },
    })
    await flushMicrotasks()

    expect(binding.getSnapshot()).toMatchObject({
      phase: 'error',
      error: { code: 'WORKBENCH_SESSION_CREATE_FAILED' },
    })
    binding.dispose()
  })

  it('publishes LIST_TIMEOUT at the configured 10 second convergence deadline', async () => {
    const harness = sessionListHarness(state(undefined, []))
    const binding = startWorkbenchSessionBinding({
      connection: harness.connection as never,
      sessions: harness.sessions as never,
    })

    harness.resolveCreate(successfulCreate('created-session'))
    await flushMicrotasks()
    vi.advanceTimersByTime(9_999)
    expect(binding.getSnapshot().error).toBeUndefined()
    vi.advanceTimersByTime(1)

    expect(binding.getSnapshot()).toMatchObject({
      phase: 'error',
      error: { code: 'WORKBENCH_SESSION_LIST_TIMEOUT' },
    })
    expect(harness.open).not.toHaveBeenCalled()
    binding.dispose()
  })

  it('publishes LIST_MISMATCH when the created list row reports another Agent Preset', async () => {
    const harness = sessionListHarness(state(undefined, []))
    const binding = startWorkbenchSessionBinding({
      connection: harness.connection as never,
      sessions: harness.sessions as never,
    })

    harness.resolveCreate(successfulCreate('created-session'))
    await flushMicrotasks()
    harness.setState(state(undefined, [summary('created-session', 100, { agentPreset: 'standard' })]))

    expect(binding.getSnapshot()).toMatchObject({
      phase: 'error',
      error: { code: 'WORKBENCH_SESSION_LIST_MISMATCH' },
    })
    expect(harness.open).not.toHaveBeenCalled()
    binding.dispose()
  })

  it('publishes OPEN_FAILED when the confirmed created Session cannot open', async () => {
    const harness = sessionListHarness(state(undefined, []))
    harness.open.mockImplementationOnce(() => {
      throw new Error('open rejected')
    })
    const binding = startWorkbenchSessionBinding({
      connection: harness.connection as never,
      sessions: harness.sessions as never,
    })

    harness.resolveCreate(successfulCreate('created-session'))
    await flushMicrotasks()
    harness.setState(state(undefined, [summary('created-session', 100, { agentPreset: 'harness-comfyui' })]))

    expect(binding.getSnapshot()).toMatchObject({
      phase: 'error',
      error: { code: 'WORKBENCH_SESSION_OPEN_FAILED' },
    })
    expect(harness.open).toHaveBeenCalledOnce()
    binding.dispose()
  })

  it('aborts create and publishes HOST_DISCONNECTED when the Host generation disconnects', async () => {
    const harness = sessionListHarness(state(undefined, []))
    const binding = startWorkbenchSessionBinding({
      connection: harness.connection as never,
      sessions: harness.sessions as never,
    })
    const signal = harness.pendingCreate()?.signal

    harness.setHost(undefined)

    expect(signal?.aborted).toBe(true)
    expect(binding.getSnapshot()).toMatchObject({
      phase: 'error',
      error: { code: 'WORKBENCH_HOST_DISCONNECTED' },
    })
    binding.dispose()
  })

  it('aborts create, cancels convergence, and unsubscribes when disposed', async () => {
    const harness = sessionListHarness(state(undefined, []))
    const binding = startWorkbenchSessionBinding({
      connection: harness.connection as never,
      sessions: harness.sessions as never,
    })
    const signal = harness.pendingCreate()?.signal

    binding.dispose()

    expect(signal?.aborted).toBe(true)
    vi.advanceTimersByTime(10_000)
    harness.setState(state(undefined, [summary('late-session', 100, { agentPreset: 'harness-comfyui' })]))
    harness.notify()
    expect(harness.open).not.toHaveBeenCalled()
    expect(harness.create).toHaveBeenCalledOnce()
  })

  it('re-reads the project Session list for a new Host generation without creating again', () => {
    const harness = sessionListHarness(state(undefined, []))
    const binding = startWorkbenchSessionBinding({
      connection: harness.connection as never,
      sessions: harness.sessions as never,
    })
    const firstCreateSignal = harness.pendingCreate()?.signal

    harness.setHost(undefined)
    expect(firstCreateSignal?.aborted).toBe(true)

    harness.setState(state(undefined, [
      summary('restored-session', 100, { agentPreset: 'harness-comfyui' }),
    ]))
    harness.setHost({ cwd: '/workspace-new-generation' })

    expect(harness.create).toHaveBeenCalledOnce()
    expect(harness.open).toHaveBeenCalledOnce()
    expect(harness.open).toHaveBeenCalledWith('restored-session')
    harness.setState(state('restored-session', [
      summary('restored-session', 100, { agentPreset: 'harness-comfyui' }),
    ]))
    expect(binding.getSnapshot()).toMatchObject({ phase: 'ready', error: undefined })
    binding.dispose()
  })

  it('shows only non-subagent harness-comfyui Sessions in the project sidebar', () => {
    const markup = renderToStaticMarkup(renderSessionSidebar({
      collapsed: false,
      width: 294,
      state: state('project-a', [
        summary('project-a', 300, { agentPreset: 'harness-comfyui' }),
        summary('standard', 200, { agentPreset: 'standard' }),
        summary('subagent-project', 100, { agentPreset: 'harness-comfyui', origin: 'subagent' }),
      ]),
      query: '',
      onQueryChange: () => undefined,
      onOpen: () => undefined,
    }))

    expect(markup).toContain('data-session-id="project-a"')
    expect(markup).not.toContain('data-session-id="standard"')
    expect(markup).not.toContain('data-session-id="subagent-project"')
  })
})

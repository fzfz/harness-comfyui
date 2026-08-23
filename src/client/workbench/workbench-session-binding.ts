import productAgentConfig from '../../../config/product-agent.json' with { type: 'json' }
import type { ConnectionHandle, HostDescription } from '@deepseek-ai/dsh-client-connection/client'
import type {
  ISessions,
  SessionListState,
  SessionSummary,
} from '@deepseek-ai/dsh-client-runtime/client'

import {
  createWorkbenchSessionError,
  type WorkbenchSessionBindingError,
  type WorkbenchSessionErrorCode,
} from './session-binding-errors.ts'

export const WORKBENCH_AGENT_PRESET = productAgentConfig.agentPresetId

const SESSION_LIST_CONVERGENCE_TIMEOUT_MS = productAgentConfig.sessionListConvergenceTimeoutMs

export type WorkbenchSessionConnection = Pick<ConnectionHandle, 'hostDescription' | 'api'>
export type WorkbenchSessionService = Pick<ISessions, 'list' | 'open'>

export type WorkbenchSessionBindingPhase = 'idle' | 'ready' | 'creating' | 'awaiting-list' | 'error'

export type WorkbenchSessionBindingState = Readonly<{
  phase: WorkbenchSessionBindingPhase
  pendingSessionId: SessionSummary['id'] | undefined
  error: WorkbenchSessionBindingError | undefined
}>

export interface WorkbenchSessionBinding {
  getSnapshot(): WorkbenchSessionBindingState
  subscribe(listener: () => void): () => void
  dispose(): void
}

/** A Session belongs in the project Workbench only when Harness marked it as a root project Session. */
export function isWorkbenchSession(session: SessionSummary): boolean {
  return session.origin !== 'subagent' && session.agentPreset === WORKBENCH_AGENT_PRESET
}

/** Read project Sessions from the Harness list snapshot without creating a local Session collection. */
export function workbenchSessions(state: SessionListState): SessionSummary[] {
  return state.ids
    .map(id => state.byId[id])
    .filter(isWorkbenchSession)
}

function compareByRecency(left: SessionSummary, right: SessionSummary): number {
  const recency = right.updatedAt - left.updatedAt
  if (recency !== 0) return recency
  if (left.id < right.id) return -1
  if (left.id > right.id) return 1
  return 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSessionId(value: unknown): value is SessionSummary['id'] {
  return typeof value === 'string' && value.length > 0
}

/**
 * Start the one Workbench binding for a Client connection. The binding owns
 * only create/convergence coordination; Session rows remain Harness-owned.
 */
export function startWorkbenchSessionBinding(dependencies: {
  connection: WorkbenchSessionConnection
  sessions: WorkbenchSessionService
}): WorkbenchSessionBinding {
  let disposed = false
  let generation = 0
  let activeHost: HostDescription | undefined
  let hasConnected = false
  let openIssued = false
  let createdSessionId: SessionSummary['id'] | undefined
  let createPromise: Promise<void> | undefined
  let createController: AbortController | undefined
  let convergenceTimer: ReturnType<typeof setTimeout> | undefined
  let snapshot: WorkbenchSessionBindingState = {
    phase: 'idle',
    pendingSessionId: undefined,
    error: undefined,
  }
  const listeners = new Set<() => void>()
  let unsubscribeSessions: (() => void) | undefined

  const publish = (
    phase: WorkbenchSessionBindingPhase,
    pendingSessionId: SessionSummary['id'] | undefined,
    error: WorkbenchSessionBindingError | undefined,
  ) => {
    if (disposed) return
    if (
      snapshot.phase === phase
      && snapshot.pendingSessionId === pendingSessionId
      && snapshot.error?.code === error?.code
    ) return
    snapshot = { phase, pendingSessionId, error }
    for (const listener of [...listeners]) listener()
  }

  const clearConvergenceTimer = () => {
    if (convergenceTimer === undefined) return
    clearTimeout(convergenceTimer)
    convergenceTimer = undefined
  }

  const cancelSessionsSubscription = () => {
    unsubscribeSessions?.()
    unsubscribeSessions = undefined
  }

  const subscribeSessions = () => {
    if (disposed || unsubscribeSessions !== undefined) return
    unsubscribeSessions = dependencies.sessions.list.subscribe(reconcile)
  }

  const abortGeneration = () => {
    createController?.abort()
    createController = undefined
    createPromise = undefined
    clearConvergenceTimer()
    cancelSessionsSubscription()
    openIssued = false
    createdSessionId = undefined
  }

  const fail = (code: WorkbenchSessionErrorCode, pendingSessionId = createdSessionId) => {
    if (disposed) return
    abortGeneration()
    publish('error', pendingSessionId, createWorkbenchSessionError(code))
  }

  const openSession = (sessionId: SessionSummary['id']) => {
    if (disposed || openIssued) return
    openIssued = true
    try {
      dependencies.sessions.open(sessionId)
      createdSessionId = undefined
      clearConvergenceTimer()
      publish('ready', undefined, undefined)
    } catch {
      fail('WORKBENCH_SESSION_OPEN_FAILED', sessionId)
    }
  }

  const convergeCreatedSession = (list: SessionListState) => {
    if (createdSessionId === undefined) return false
    const created = list.byId[createdSessionId]
    if (created === undefined) return true
    if (created.agentPreset !== WORKBENCH_AGENT_PRESET) {
      fail('WORKBENCH_SESSION_LIST_MISMATCH', createdSessionId)
      return true
    }
    openSession(createdSessionId)
    return true
  }

  const isActiveCreate = (expectedGeneration: number, controller: AbortController) => (
    !disposed
    && expectedGeneration === generation
    && activeHost !== undefined
    && createController === controller
    && !controller.signal.aborted
  )

  const startCreate = (host: HostDescription) => {
    if (createPromise !== undefined || disposed) return
    const expectedGeneration = generation
    const controller = new AbortController()
    createController = controller
    createPromise = Promise.resolve()
    publish('creating', undefined, undefined)

    let request: Promise<unknown>
    try {
      request = dependencies.connection.api.sessions.create({
        cwd: host.cwd,
        agentPreset: WORKBENCH_AGENT_PRESET,
      }, controller.signal)
    } catch {
      fail('WORKBENCH_SESSION_CREATE_FAILED')
      return
    }

    createPromise = request
      .then(response => {
        if (!isActiveCreate(expectedGeneration, controller)) return
        if (!isRecord(response) || !isRecord(response.result) || response.result.ok !== true) {
          fail('WORKBENCH_SESSION_CREATE_FAILED')
          return
        }
        const value = response.result.value
        if (!isRecord(value) || !isSessionId(value.sessionId)) {
          fail('WORKBENCH_SESSION_CREATE_FAILED')
          return
        }
        if (value.agentPreset !== WORKBENCH_AGENT_PRESET) {
          fail('WORKBENCH_SESSION_PRESET_MISMATCH')
          return
        }

        createPromise = undefined
        createController = undefined
        createdSessionId = value.sessionId
        publish('awaiting-list', createdSessionId, undefined)
        convergenceTimer = setTimeout(() => {
          if (
            !disposed
            && expectedGeneration === generation
            && createdSessionId !== undefined
            && snapshot.phase === 'awaiting-list'
          ) {
            fail('WORKBENCH_SESSION_LIST_TIMEOUT', createdSessionId)
          }
        }, SESSION_LIST_CONVERGENCE_TIMEOUT_MS)
        reconcile()
      })
      .catch(() => {
        if (isActiveCreate(expectedGeneration, controller)) {
          fail('WORKBENCH_SESSION_CREATE_FAILED')
        }
      })
  }

  const activateGeneration = (host: HostDescription) => {
    generation += 1
    abortGeneration()
    activeHost = host
    hasConnected = true
    publish('idle', undefined, undefined)
    subscribeSessions()
  }

  function reconcile() {
    if (disposed) return
    const host = dependencies.connection.hostDescription.getSnapshot()
    if (host === undefined) {
      if (activeHost !== undefined) {
        generation += 1
        abortGeneration()
        activeHost = undefined
        publish('error', undefined, createWorkbenchSessionError('WORKBENCH_HOST_DISCONNECTED'))
      } else if (hasConnected && snapshot.error?.code !== 'WORKBENCH_HOST_DISCONNECTED') {
        publish('error', undefined, createWorkbenchSessionError('WORKBENCH_HOST_DISCONNECTED'))
      }
      return
    }

    if (activeHost !== host) activateGeneration(host)
    if (snapshot.phase === 'error') return

    const list = dependencies.sessions.list.getSnapshot()
    if (list.phase !== 'ready') return
    if (convergeCreatedSession(list)) return

    const current = list.current === undefined ? undefined : list.byId[list.current]
    if (current !== undefined && isWorkbenchSession(current)) {
      publish('ready', undefined, undefined)
      return
    }

    if (openIssued) return
    const target = workbenchSessions(list).sort(compareByRecency)[0]
    if (target !== undefined) {
      openSession(target.id)
      return
    }
    startCreate(host)
  }

  const unsubscribeHost = dependencies.connection.hostDescription.subscribe(reconcile)
  reconcile()

  return {
    getSnapshot: () => snapshot,
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      generation += 1
      abortGeneration()
      unsubscribeHost()
      listeners.clear()
    },
  }
}

import { createRequire } from 'node:module'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type {
  SessionListState,
  SessionSummary,
} from '@deepseek-ai/dsh-client-runtime/client'

import { renderSessionSidebar } from '../../src/client/workbench/session-sidebar.tsx'
import {
  startWorkbenchSessionBinding,
} from '../../src/client/workbench/workbench-session-binding.ts'

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

function sessionListHarness(initialState: SessionListState) {
  let snapshot = initialState
  let hostSnapshot: { cwd: string } | undefined = { cwd: '/workspace' }
  const listeners = new Set<() => void>()
  const open = vi.fn()
  const create = vi.fn()
  const connection = {
    hostDescription: {
      getSnapshot: () => hostSnapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
    api: { sessions: { create } },
  }
  const sessions = {
    list: {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
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
      for (const listener of listeners) listener()
    },
    setHost(next: { cwd: string } | undefined) {
      hostSnapshot = next
      for (const listener of listeners) listener()
    },
    notify() {
      for (const listener of listeners) listener()
    },
  }
}

describe('Workbench Session binding', () => {
  it('waits for a connected Host and ready list, then opens the deterministic project Session once', () => {
    const harness = sessionListHarness(state('standard', [
      summary('standard', 500, { agentPreset: 'standard' }),
      summary('subagent-newest', 900, { agentPreset: 'harness-comfyui', origin: 'subagent' }),
      summary('project-b', 200, { agentPreset: 'harness-comfyui' }),
      summary('project-a', 200, { agentPreset: 'harness-comfyui' }),
    ], 'pending'))
    harness.setHost(undefined)

    const dispose = startWorkbenchSessionBinding({
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

    dispose()
  })

  it('keeps the current project Session and does not create a Session', () => {
    const harness = sessionListHarness(state('project-current', [
      summary('project-current', 100, { agentPreset: 'harness-comfyui' }),
      summary('project-newer', 900, { agentPreset: 'harness-comfyui' }),
    ]))

    const dispose = startWorkbenchSessionBinding({
      connection: harness.connection as never,
      sessions: harness.sessions as never,
    })

    expect(harness.open).not.toHaveBeenCalled()
    expect(harness.create).not.toHaveBeenCalled()
    dispose()
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

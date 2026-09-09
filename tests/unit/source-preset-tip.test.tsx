import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconWarningOutline16: () => createElement('span', { 'data-warning-icon': true }),
  Toast: ({ text, onDone }: { text: string; onDone: () => void }) => createElement('div', {
    'data-toast': text,
    onClick: onDone,
  }, text),
}))

import {
  COMFYUI_PRESET_ID,
  SOURCE_PRESET_TIP_COPY,
  SourcePresetTip,
} from '../../src/client/settings/source-preset-tip.tsx'

const { act, create } = await vi.importActual('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>
    create: (node: ReactNode) => {
      root: { findByType(type: string): { props: Record<string, any> } }
      toJSON(): unknown
      update(node: ReactNode): void
      unmount(): void
    }
}

function settingsStore(user: unknown, initialStatus: 'loading' | 'ready' = 'ready') {
  let snapshot = {
    status: initialStatus,
    writable: true,
    value: { configuration: { url: 'http://127.0.0.1', port: 18093 } },
    base: { configuration: { url: 'http://127.0.0.1', port: 18093 } },
    user,
    revision: 0,
    mode: 'host' as const,
  }
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) },
    setUser(next: unknown) {
      snapshot = { ...snapshot, user: next, revision: snapshot.revision + 1 }
      for (const listener of listeners) listener()
    },
    setStatus(status: 'loading' | 'ready') {
      snapshot = { ...snapshot, status, revision: snapshot.revision + 1 }
      for (const listener of listeners) listener()
    },
  }
}

function useSessions(preset: string | undefined) {
  return <T,>(selector: (state: any) => T): T => selector({
    byId: { session_1: { projectionValues: { agentPreset: preset } } },
  })
}

describe('ComfyUI preset data source tip', () => {
  it('waits for the settings snapshot before deciding whether the data source is configured', async () => {
    const sourceScope = settingsStore(
      { configuration: { url: 'https://catalog.example.com', port: 443 } },
      'loading',
    )
    const probe = vi.fn(async () => undefined)
    let renderer!: ReturnType<typeof create>

    await act(async () => {
      renderer = create(createElement(SourcePresetTip, {
        sessionId: 'session_1', useSessions: useSessions(COMFYUI_PRESET_ID), sourceScope, probe,
      } as never))
    })

    expect(renderer.toJSON()).toBeNull()
    expect(probe).not.toHaveBeenCalled()

    await act(async () => {
      sourceScope.setStatus('ready')
      await Promise.resolve()
    })
    expect(probe).toHaveBeenCalledOnce()
    renderer.unmount()
  })

  it('asks the user to configure the data source when URL or port is absent from the user layer', async () => {
    const sourceScope = settingsStore({ configuration: { url: 'http://127.0.0.1' } })
    const probe = vi.fn(async () => undefined)
    let renderer!: ReturnType<typeof create>

    await act(async () => {
      renderer = create(createElement(SourcePresetTip, {
        sessionId: 'session_1', useSessions: useSessions(COMFYUI_PRESET_ID), sourceScope, probe,
      } as never))
    })

    expect(JSON.stringify(renderer.toJSON())).toContain(SOURCE_PRESET_TIP_COPY.notConfigured)
    expect(probe).not.toHaveBeenCalled()
    renderer.unmount()
  })

  it('does not probe or show a tip for another preset', async () => {
    const sourceScope = settingsStore({ configuration: { url: 'https://catalog.example.com', port: 443 } })
    const probe = vi.fn(async () => undefined)
    let renderer!: ReturnType<typeof create>

    await act(async () => {
      renderer = create(createElement(SourcePresetTip, {
        sessionId: 'session_1', useSessions: useSessions('general'), sourceScope, probe,
      } as never))
    })

    expect(renderer.toJSON()).toBeNull()
    expect(probe).not.toHaveBeenCalled()
    renderer.unmount()
  })

  it('shows the check-failed tip only when the production Catalog probe fails', async () => {
    const sourceScope = settingsStore({ configuration: { url: 'https://catalog.example.com', port: 443 } })
    const probe = vi.fn(async () => { throw new Error('offline') })
    let renderer!: ReturnType<typeof create>

    await act(async () => {
      renderer = create(createElement(SourcePresetTip, {
        sessionId: 'session_1', useSessions: useSessions(COMFYUI_PRESET_ID), sourceScope, probe,
      } as never))
      await Promise.resolve()
    })

    expect(JSON.stringify(renderer.toJSON())).toContain(SOURCE_PRESET_TIP_COPY.checkFailed)
    expect(probe).toHaveBeenCalledOnce()
    await act(async () => {
      renderer.root.findByType('div').props.onClick()
    })
    expect(renderer.toJSON()).toBeNull()
    renderer.unmount()
  })

  it('checks again with the production Catalog probe after the saved URL or port changes', async () => {
    const sourceScope = settingsStore({ configuration: { url: 'http://127.0.0.1', port: 18093 } })
    const probe = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined)
    let renderer!: ReturnType<typeof create>

    await act(async () => {
      renderer = create(createElement(SourcePresetTip, {
        sessionId: 'session_1', useSessions: useSessions(COMFYUI_PRESET_ID), sourceScope, probe,
      } as never))
      await Promise.resolve()
    })
    expect(JSON.stringify(renderer.toJSON())).toContain(SOURCE_PRESET_TIP_COPY.checkFailed)

    await act(async () => {
      sourceScope.setUser({ configuration: { url: 'https://catalog.example.com', port: 443 } })
      await Promise.resolve()
    })
    expect(probe).toHaveBeenCalledTimes(2)
    expect(renderer.toJSON()).toBeNull()
    renderer.unmount()
  })
})

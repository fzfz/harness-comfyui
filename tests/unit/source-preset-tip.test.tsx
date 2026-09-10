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
  SourcePresetTip,
} from '../../src/client/settings/source-preset-tip.tsx'

const CHECK_FAILED_COPY = '数据源服务检查失败。请打开设置，检查“ComfyUI → 数据源服务”的 URL、端口和服务状态。'

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
    setValue(configuration: { readonly url: string; readonly port: number }) {
      snapshot = { ...snapshot, value: { configuration }, revision: snapshot.revision + 1 }
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

  it.each([
    { name: 'absent', user: undefined },
    { name: 'partial', user: { configuration: { url: 'http://127.0.0.1' } } },
    { name: 'complete', user: { configuration: { url: 'https://catalog.example.com', port: 443 } } },
  ])('checks the effective data source when the user override layer is $name', async ({ user }) => {
    const sourceScope = settingsStore(user)
    const probe = vi.fn(async () => undefined)
    let renderer!: ReturnType<typeof create>

    await act(async () => {
      renderer = create(createElement(SourcePresetTip, {
        sessionId: 'session_1', useSessions: useSessions(COMFYUI_PRESET_ID), sourceScope, probe,
      } as never))
    })

    expect(renderer.toJSON()).toBeNull()
    expect(probe).toHaveBeenCalledOnce()
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

    expect(renderer.root.findByType('div').props['data-toast']).toBe(CHECK_FAILED_COPY)
    expect(probe).toHaveBeenCalledOnce()
    await act(async () => {
      renderer.root.findByType('div').props.onClick()
    })
    expect(renderer.toJSON()).toBeNull()
    renderer.unmount()
  })

  it('cancels the old check and checks again after the effective URL or port changes', async () => {
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
    expect(renderer.root.findByType('div').props['data-toast']).toBe(CHECK_FAILED_COPY)

    await act(async () => {
      sourceScope.setValue({ url: 'https://catalog.example.com', port: 443 })
      await Promise.resolve()
    })
    expect(probe).toHaveBeenCalledTimes(2)
    expect(probe.mock.calls[0]?.[0].aborted).toBe(true)
    expect(renderer.toJSON()).toBeNull()
    renderer.unmount()
  })

  it('ignores a cancelled check that fails after the effective address changes', async () => {
    let rejectOldCheck!: (error: Error) => void
    const oldCheck = new Promise<unknown>((_resolve, reject) => { rejectOldCheck = reject })
    const sourceScope = settingsStore(undefined)
    const probe = vi.fn()
      .mockReturnValueOnce(oldCheck)
      .mockResolvedValueOnce(undefined)
    let renderer!: ReturnType<typeof create>

    await act(async () => {
      renderer = create(createElement(SourcePresetTip, {
        sessionId: 'session_1', useSessions: useSessions(COMFYUI_PRESET_ID), sourceScope, probe,
      } as never))
    })

    await act(async () => {
      sourceScope.setValue({ url: 'https://catalog.example.com', port: 443 })
      await Promise.resolve()
    })
    expect(probe).toHaveBeenCalledTimes(2)
    expect(probe.mock.calls[0]?.[0].aborted).toBe(true)

    await act(async () => {
      rejectOldCheck(new Error('late offline response'))
      await oldCheck.catch(() => undefined)
    })
    expect(renderer.toJSON()).toBeNull()
    renderer.unmount()
  })
})

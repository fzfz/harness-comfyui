import React, { StrictMode, useSyncExternalStore } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { ExperimentLeading, type ExperimentShortcuts } from '../../src/client/workbench/experiment-leading.tsx'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconPanelLeftOutlineRegular: ({ size }: { size: number }) => <svg width={size} data-icon="panel-left" />,
  IconSparkleRegular: () => null,
  Button: () => null,
  Tooltip: ({ children, label, shortcutKeys, delayMs }: any) =>
    <span data-tooltip={label} data-shortcut-keys={shortcutKeys} data-delay-ms={delayMs}>{children}</span>,
}))

const { act, create } = await vi.importActual<any>('react-test-renderer')
const mounts: any[] = []

afterEach(async () => {
  await act(() => { for (const renderer of mounts.splice(0)) renderer.unmount() })
})

it('offers only the sidebar opener with native locale, tooltip and current shortcut metadata', async () => {
  type Shortcuts = ReturnType<ExperimentShortcuts['getSnapshot']>
  let rows = [{ id: 'sidebar.left.toggle', keys: ['Meta', 'B'], aria: 'Meta+B' }] as unknown as Shortcuts
  const listeners = new Set<() => void>()
  const source: ExperimentShortcuts = {
    getSnapshot: () => rows,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
  const useShortcuts = (<T,>(selector: (value: Shortcuts) => T) =>
    selector(useSyncExternalStore(source.subscribe, source.getSnapshot))) as SnapshotSelectorHook<Shortcuts>
  const toggleSidebar = vi.fn()
  const english = vi.fn(() => 'Open sidebar')
  let renderer: any
  await act(() => {
    renderer = create(<StrictMode><ExperimentLeading toggleSidebar={toggleSidebar} useShortcuts={useShortcuts} t={english} /></StrictMode>)
  })
  mounts.push(renderer)
  expect(english).toHaveBeenCalledWith('toggle.open')
  expect(renderer.root.findAllByType('button')).toHaveLength(1)
  const button = renderer.root.findByType('button')
  expect(button.props.type).toBe('button')
  expect(button.props['aria-label']).toBe('Open sidebar')
  expect(button.props['aria-keyshortcuts']).toBe('Meta+B')
  expect(button.props.tabIndex).not.toBe(-1)
  expect(renderer.root.findByProps({ 'data-icon': 'panel-left' }).props.width).toBe(16)
  expect(renderer.root.findByType('span').props).toMatchObject({
    'data-tooltip': 'Open sidebar', 'data-shortcut-keys': ['Meta', 'B'], 'data-delay-ms': 500,
  })
  await act(() => button.props.onClick())
  expect(toggleSidebar).toHaveBeenCalledOnce()

  await act(() => {
    rows = [{ id: 'sidebar.left.toggle', keys: ['Control', 'S'], aria: 'Control+S' }] as unknown as Shortcuts
    for (const listener of listeners) listener()
  })
  expect(renderer.root.findByType('button').props['aria-keyshortcuts']).toBe('Control+S')
  expect(renderer.root.findByType('span').props['data-shortcut-keys']).toEqual(['Control', 'S'])
  await act(() => {
    renderer.update(<StrictMode><ExperimentLeading toggleSidebar={toggleSidebar} useShortcuts={useShortcuts} t={() => '展开侧栏'} /></StrictMode>)
  })
  expect(renderer.root.findByType('button').props['aria-label']).toBe('展开侧栏')
  expect(renderer.root.findByType('span').props['data-tooltip']).toBe('展开侧栏')
  await act(() => {
    rows = []
    for (const listener of listeners) listener()
  })
  expect(renderer.root.findByType('button').props['aria-keyshortcuts']).toBeUndefined()
  expect(renderer.root.findByType('span').props['data-shortcut-keys']).toBeUndefined()
  await act(() => renderer.root.findByType('button').props.onClick())
  expect(toggleSidebar).toHaveBeenCalledTimes(2)
  await act(() => renderer.unmount())
  expect(listeners.size).toBe(0)
})

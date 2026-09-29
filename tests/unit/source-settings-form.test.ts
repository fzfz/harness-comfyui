import { describe, expect, it, vi } from 'vitest'

import { withSourceAddress } from '../../src/client/settings/source-settings-form.ts'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SourceSettingsView } from '../../src/source-settings.ts'

function sourceForm(configuration?: { url: string; port: number }, status: 'ready' | 'unavailable' = 'ready') {
  let snapshot: ConfigFormSnapshot<SourceSettingsView> = {
    status,
    value: configuration === undefined ? undefined : { configuration },
    base: undefined,
    user: undefined,
    revision: 1,
    writable: true,
    mode: 'host' as const,
  }
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    mutate: vi.fn(async () => true),
    set: vi.fn(async () => true),
    unset: vi.fn(async () => true),
    update(configuration: { url: string; port: number }) {
      snapshot = { ...snapshot, value: { configuration } }
      for (const listener of listeners) listener()
    },
  }
}

describe('Source Settings Host default projection', () => {
  it('uses the actual Host address only while the form has no configured address', async () => {
    const current = sourceForm()
    const projected = withSourceAddress(current, async () => ({ url: 'http://127.0.0.1', port: 18094 }))
    await vi.waitFor(() => {
      expect(projected.form.getSnapshot().value).toEqual({ configuration: { url: 'http://127.0.0.1', port: 18094 } })
    })
    expect(projected.form.getSnapshot().base).toEqual({ configuration: { url: 'http://127.0.0.1', port: 18094 } })
    current.update({ url: 'https://catalog.example.com', port: 443 })
    expect(projected.form.getSnapshot().value).toEqual({ configuration: { url: 'https://catalog.example.com', port: 443 } })
    expect(await projected.form.mutate([{ op: 'set', path: ['configuration', 'port'], value: 444 }])).toBe(true)
    expect(current.mutate).toHaveBeenCalledOnce()
    projected.dispose()
  })

  it('keeps a configured address when the Host default arrives later', async () => {
    const current = sourceForm({ url: 'https://saved.example.com', port: 443 })
    const projected = withSourceAddress(current, async () => ({ url: 'http://127.0.0.1', port: 18094 }))
    await Promise.resolve()
    expect(projected.form.getSnapshot().value).toEqual({ configuration: { url: 'https://saved.example.com', port: 443 } })
    projected.dispose()
  })

  it('shows the actual Host address read only when the settings namespace is unavailable', async () => {
    const projected = withSourceAddress(sourceForm(undefined, 'unavailable'), async () => ({ url: 'http://127.0.0.1', port: 18094 }))
    await vi.waitFor(() => {
      expect(projected.form.getSnapshot().value).toEqual({ configuration: { url: 'http://127.0.0.1', port: 18094 } })
    })
    expect(projected.form.getSnapshot().status).toBe('ready')
    expect(projected.form.getSnapshot().writable).toBe(false)
    projected.dispose()
  })

  it('rejects an invalid Host address and ignores a result after disposal', async () => {
    const current = sourceForm()
    const invalid = withSourceAddress(current, async () => ({ url: 'file:///tmp/catalog', port: 18093 }))
    await Promise.resolve()
    await Promise.resolve()
    expect(invalid.form.getSnapshot().value).toBeUndefined()
    expect(invalid.form.getSnapshot().status).toBe('unavailable')
    invalid.dispose()

    let release!: (value: { url: string; port: number }) => void
    const delayed = withSourceAddress(current, () => new Promise(resolve => { release = resolve }))
    delayed.dispose()
    release({ url: 'http://127.0.0.1', port: 18093 })
    await Promise.resolve()
    expect(delayed.form.getSnapshot().value).toBeUndefined()
  })

  it('notifies active subscribers and forwards edits to the underlying form', async () => {
    const current = sourceForm()
    const projected = withSourceAddress(current, async () => ({ url: 'http://127.0.0.1', port: 18094 }))
    const listener = vi.fn()
    const unsubscribe = projected.form.subscribe(listener)

    await vi.waitFor(() => { expect(listener).toHaveBeenCalledOnce() })
    expect(projected.form.getSnapshot().value).toEqual({ configuration: { url: 'http://127.0.0.1', port: 18094 } })

    current.update({ url: 'https://catalog.example.com', port: 443 })
    expect(listener).toHaveBeenCalledTimes(2)
    expect(await projected.form.mutate([{ op: 'set', path: ['configuration', 'port'], value: 444 }], 7)).toBe(true)
    expect(current.mutate).toHaveBeenCalledWith([{ op: 'set', path: ['configuration', 'port'], value: 444 }], 7)
    expect(await projected.form.set('configuration', { url: 'https://new.example.com', port: 444 })).toBe(true)
    expect(current.set).toHaveBeenCalledWith('configuration', { url: 'https://new.example.com', port: 444 })
    expect(await projected.form.unset('configuration')).toBe(true)
    expect(current.unset).toHaveBeenCalledWith('configuration')

    unsubscribe()
    current.update({ url: 'https://other.example.com', port: 443 })
    expect(listener).toHaveBeenCalledTimes(2)
    expect(projected.form.getSnapshot().value).toEqual({ configuration: { url: 'https://other.example.com', port: 443 } })
    projected.dispose()
  })

  it('marks a failed Host address lookup unavailable and ignores it after disposal', async () => {
    const failed = withSourceAddress(sourceForm(), async () => { throw new Error('Host unavailable') })
    await vi.waitFor(() => { expect(failed.form.getSnapshot().status).toBe('unavailable') })
    failed.dispose()

    let reject!: (reason: Error) => void
    const delayed = withSourceAddress(sourceForm(), () => new Promise((_, rejectPromise) => { reject = rejectPromise }))
    delayed.dispose()
    reject(new Error('Host unavailable'))
    await Promise.resolve()
    await Promise.resolve()
    expect(delayed.form.getSnapshot().status).toBe('ready')
  })
})

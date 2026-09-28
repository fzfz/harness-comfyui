import { describe, expect, it, vi } from 'vitest'

import { withImageReaderConfiguration } from '../../src/client/settings/image-reader-settings-form.ts'
import { createImageReaderProfile } from '../../src/image-reader/settings.ts'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ImageReaderSettingsView } from '../../src/image-reader/settings.ts'

function currentForm(configuration?: { activeProfileId: string; profiles: readonly ReturnType<typeof createImageReaderProfile>[] }, status: 'ready' | 'unavailable' = 'ready') {
  let snapshot: ConfigFormSnapshot<ImageReaderSettingsView> = {
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
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    mutate: vi.fn(async () => true),
    set: vi.fn(async () => true),
    unset: vi.fn(async () => true),
    update(configuration: { activeProfileId: string; profiles: readonly ReturnType<typeof createImageReaderProfile>[] }) {
      snapshot = { ...snapshot, value: { configuration } }
      for (const listener of listeners) listener()
    },
  }
}

describe('ImageReader Settings Host default projection', () => {
  const actual = { activeProfileId: 'default', profiles: [{ ...createImageReaderProfile('default'), provider: 'actual', model: 'vision' }] }

  it('shows the Host configuration until a saved form value arrives', async () => {
    const current = currentForm()
    const projected = withImageReaderConfiguration(current, async () => actual)
    await vi.waitFor(() => { expect(projected.form.getSnapshot().value).toEqual({ configuration: actual }) })
    const saved = { activeProfileId: 'saved', profiles: [createImageReaderProfile('saved')] }
    current.update(saved)
    expect(projected.form.getSnapshot().value).toEqual({ configuration: saved })
    projected.dispose()
  })

  it('keeps a saved form value when the Host result arrives', async () => {
    const saved = { activeProfileId: 'saved', profiles: [createImageReaderProfile('saved')] }
    const current = currentForm(saved)
    const projected = withImageReaderConfiguration(current, async () => actual)
    await Promise.resolve()
    expect(projected.form.getSnapshot().value).toEqual({ configuration: saved })
    projected.dispose()
  })

  it('accepts a Host profile whose API key is hidden from public configuration', async () => {
    const configuration = {
      activeProfileId: 'remote',
      profiles: [{
        ...createImageReaderProfile('remote'),
        connectionType: 'openai-compatible' as const,
        provider: '',
        endpoint: 'https://api.example.com/v1/chat/completions',
        model: 'vision',
        hasApiKey: true,
      }],
    }
    const projected = withImageReaderConfiguration(currentForm(), async () => configuration)
    await vi.waitFor(() => {
      expect(projected.form.getSnapshot().value).toEqual({ configuration })
    })
    expect(projected.form.getSnapshot().status).toBe('ready')
    projected.dispose()
  })

  it('shows the actual Host configuration read only when the settings namespace is unavailable', async () => {
    const projected = withImageReaderConfiguration(currentForm(undefined, 'unavailable'), async () => actual)
    await vi.waitFor(() => { expect(projected.form.getSnapshot().value).toEqual({ configuration: actual }) })
    expect(projected.form.getSnapshot().status).toBe('ready')
    expect(projected.form.getSnapshot().writable).toBe(false)
    projected.dispose()
  })

  it('does not project an invalid Host configuration', async () => {
    const current = currentForm()
    const projected = withImageReaderConfiguration(current, async () => ({ activeProfileId: 'missing', profiles: [createImageReaderProfile('default')] }))
    await Promise.resolve()
    await Promise.resolve()
    expect(projected.form.getSnapshot().value).toBeUndefined()
    expect(projected.form.getSnapshot().status).toBe('unavailable')
    projected.dispose()
  })

  it('notifies active subscribers and forwards edits to the underlying form', async () => {
    const current = currentForm()
    const projected = withImageReaderConfiguration(current, async () => actual)
    const listener = vi.fn()
    const unsubscribe = projected.form.subscribe(listener)

    await vi.waitFor(() => { expect(listener).toHaveBeenCalledOnce() })
    expect(projected.form.getSnapshot().value).toEqual({ configuration: actual })

    const saved = { activeProfileId: 'saved', profiles: [createImageReaderProfile('saved')] }
    current.update(saved)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(await projected.form.mutate([{ op: 'set', path: ['configuration', 'activeProfileId'], value: 'saved' }], 7)).toBe(true)
    expect(current.mutate).toHaveBeenCalledWith([{ op: 'set', path: ['configuration', 'activeProfileId'], value: 'saved' }], 7)
    expect(await projected.form.set('configuration', saved)).toBe(true)
    expect(current.set).toHaveBeenCalledWith('configuration', saved)
    expect(await projected.form.unset('configuration')).toBe(true)
    expect(current.unset).toHaveBeenCalledWith('configuration')

    unsubscribe()
    current.update(actual)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(projected.form.getSnapshot().value).toEqual({ configuration: actual })
    projected.dispose()
  })

  it('marks a failed Host configuration lookup unavailable and ignores settled loads after disposal', async () => {
    const failed = withImageReaderConfiguration(currentForm(), async () => { throw new Error('Host unavailable') })
    await vi.waitFor(() => { expect(failed.form.getSnapshot().status).toBe('unavailable') })
    failed.dispose()

    let resolve!: (value: typeof actual) => void
    const delayedSuccess = withImageReaderConfiguration(currentForm(), () => new Promise(settle => { resolve = settle }))
    delayedSuccess.dispose()
    resolve(actual)
    await Promise.resolve()
    expect(delayedSuccess.form.getSnapshot().value).toBeUndefined()

    let reject!: (reason: Error) => void
    const delayedFailure = withImageReaderConfiguration(currentForm(), () => new Promise((_, rejectPromise) => { reject = rejectPromise }))
    delayedFailure.dispose()
    reject(new Error('Host unavailable'))
    await Promise.resolve()
    await Promise.resolve()
    expect(delayedFailure.form.getSnapshot().status).toBe('ready')
  })
})

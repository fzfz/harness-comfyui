import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'

import {
  decodeImageReaderConfiguration,
  type ImageReaderConfiguration,
  type ImageReaderSettingsView,
} from '../../image-reader/settings.ts'

export interface ImageReaderSettingsForm {
  readonly form: ConfigForm<ImageReaderSettingsView>
  dispose(): void
}

export function withImageReaderConfiguration(
  current: ConfigForm<ImageReaderSettingsView>,
  load: () => Promise<ImageReaderConfiguration>,
): ImageReaderSettingsForm {
  const listeners = new Set<() => void>()
  let fallback: ImageReaderConfiguration | undefined
  let fallbackFailed = false
  let disposed = false
  let snapshot: ConfigFormSnapshot<ImageReaderSettingsView> = current.getSnapshot()

  const refresh = () => {
    const base = current.getSnapshot()
    const next = base.value?.configuration !== undefined
      ? base
      : fallback !== undefined ? {
        ...base,
        status: 'ready' as const,
        writable: base.status === 'ready' && base.writable,
        value: { configuration: fallback },
        base: base.base ?? { configuration: fallback },
      } : fallbackFailed ? { ...base, status: 'unavailable' as const } : base
    if (next === snapshot) return
    snapshot = next
    for (const listener of listeners) listener()
  }
  const unsubscribe = current.subscribe(refresh)
  void load().then(configuration => {
    if (disposed) return
    const decoded = decodeImageReaderConfiguration(configuration)
    if (decoded === undefined) throw new TypeError('Image reader configuration is invalid.')
    fallback = decoded
    refresh()
  }).catch(() => {
    if (disposed) return
    fallbackFailed = true
    refresh()
  })

  return {
    form: {
      getSnapshot: () => snapshot,
      subscribe(listener) {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      mutate: (ops, expectedRevision) => current.mutate(ops, expectedRevision),
      set: (field, value) => current.set(field, value),
      unset: field => current.unset(field),
    },
    dispose() {
      disposed = true
      unsubscribe()
      listeners.clear()
    },
  }
}

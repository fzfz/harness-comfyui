import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'

import {
  validateSourceSettingsSection,
  type SourceAddress,
  type SourceSettingsView,
} from '../../source-settings.ts'

export interface SourceSettingsForm {
  readonly form: ConfigForm<SourceSettingsView>
  dispose(): void
}

export function withSourceAddress(
  current: ConfigForm<SourceSettingsView>,
  load: () => Promise<SourceAddress>,
): SourceSettingsForm {
  const listeners = new Set<() => void>()
  let fallback: SourceAddress | undefined
  let fallbackFailed = false
  let disposed = false
  let snapshot: ConfigFormSnapshot<SourceSettingsView> = current.getSnapshot()

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
  void load().then(address => {
    if (disposed) return
    validateSourceSettingsSection({ configuration: address })
    fallback = address
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

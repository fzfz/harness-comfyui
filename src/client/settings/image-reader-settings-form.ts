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
  current: ConfigForm<unknown>,
  load: () => Promise<ImageReaderConfiguration>,
): ImageReaderSettingsForm {
  const listeners = new Set<() => void>()
  let disposed = false
  let loadGeneration = 0
  let snapshot: ConfigFormSnapshot<ImageReaderSettingsView> = {
    ...current.getSnapshot(), status: 'loading', value: undefined, writable: false,
  }

  const publish = (status: ConfigFormSnapshot<ImageReaderSettingsView>['status'], value: ImageReaderSettingsView | undefined) => {
    const base = current.getSnapshot()
    snapshot = { ...base, status, value, writable: status === 'ready' && base.status === 'ready' && base.writable }
    for (const listener of listeners) listener()
  }
  const refresh = () => {
    const generation = ++loadGeneration
    publish('loading', snapshot.value)
    void load().then(configuration => {
      if (disposed || generation !== loadGeneration) return
      const decoded = decodeImageReaderConfiguration(configuration)
      if (decoded === undefined) throw new TypeError('Image reader configuration is invalid.')
      publish('ready', { configuration: decoded })
    }).catch(() => {
      if (disposed || generation !== loadGeneration) return
      publish('unavailable', undefined)
    })
  }
  const unsubscribe = current.subscribe(refresh)
  refresh()

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

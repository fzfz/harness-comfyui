import type { Context } from '@deepseek-ai/cordis'

import {
  IMAGE_READER_SETTINGS_DEFAULTS,
  IMAGE_READER_PROFILE_ENTRY_ID,
  validateImageReaderSettingsSection,
  type ImageReaderSettingsSection,
} from '../../image-reader/settings.ts'

export interface ImageReaderSettingsStore {
  get(): ImageReaderSettingsSection
  replace(section: ImageReaderSettingsSection): Promise<void>
  readPersistedUserOverride(): { readonly kind: 'readable'; readonly value: unknown } | { readonly kind: 'unreadable' }
}

export function imageReaderSettingsStore(
  ctx: Pick<Context, 'settings'>,
  defaults: ImageReaderSettingsSection = IMAGE_READER_SETTINGS_DEFAULTS,
): ImageReaderSettingsStore {
  return {
    get() {
      const value = ctx.settings.describe().find(row => row.ns === IMAGE_READER_PROFILE_ENTRY_ID)?.value as Partial<ImageReaderSettingsSection> | undefined
      const section = {
        configuration: value?.configuration ?? defaults.configuration,
        credentialRefs: value?.credentialRefs ?? defaults.credentialRefs,
      }
      validateImageReaderSettingsSection(section)
      return section
    },
    async replace(section) {
      validateImageReaderSettingsSection(section)
      await ctx.settings.replace(IMAGE_READER_PROFILE_ENTRY_ID, section)
    },
    readPersistedUserOverride() {
      try {
        const descriptors = ctx.settings.describe() as unknown
        if (!Array.isArray(descriptors)) return Object.freeze({ kind: 'unreadable' })
        const descriptor = descriptors.find(value => {
          if (value === null || typeof value !== 'object') return false
          return (value as Record<string, unknown>).ns === IMAGE_READER_PROFILE_ENTRY_ID
        })
        if (descriptor === undefined) return Object.freeze({ kind: 'readable', value: undefined })
        if (!Object.prototype.hasOwnProperty.call(descriptor, 'user')) return Object.freeze({ kind: 'unreadable' })
        return Object.freeze({
          kind: 'readable',
          value: (descriptor as Record<string, unknown>).user,
        })
      } catch {
        return Object.freeze({ kind: 'unreadable' })
      }
    },
  }
}

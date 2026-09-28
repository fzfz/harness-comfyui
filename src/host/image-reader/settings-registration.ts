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
        credentials: value?.credentials ?? defaults.credentials,
      }
      validateImageReaderSettingsSection(section)
      return section
    },
    async replace(section) {
      validateImageReaderSettingsSection(section)
      await ctx.settings.replace(IMAGE_READER_PROFILE_ENTRY_ID, section)
    },
  }
}

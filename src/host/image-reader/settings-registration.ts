import type { Context } from '@deepseek-ai/cordis'
import { type SettingsScope } from '@deepseek-ai/dsh-settings'

import {
  IMAGE_READER_LEGACY_SETTINGS_DEFAULTS,
  IMAGE_READER_LEGACY_SETTINGS_NAMESPACE,
  IMAGE_READER_LEGACY_SETTINGS_SCHEMA,
  IMAGE_READER_SETTINGS_DEFAULTS,
  IMAGE_READER_SETTINGS_NAMESPACE,
  IMAGE_READER_SETTINGS_SCHEMA,
  migrateLegacyImageReaderSettings,
  validateImageReaderSettingsSection,
  type ImageReaderSettingsSection,
  type LegacyImageReaderSettingsSection
} from '../../image-reader/settings.ts'

export async function registerImageReaderSettings(
  ctx: Pick<Context, 'settings'>,
  defaults: ImageReaderSettingsSection = IMAGE_READER_SETTINGS_DEFAULTS,
): Promise<SettingsScope<ImageReaderSettingsSection>> {
  const legacy = ctx.settings.register<typeof IMAGE_READER_LEGACY_SETTINGS_NAMESPACE, LegacyImageReaderSettingsSection>(
    IMAGE_READER_LEGACY_SETTINGS_NAMESPACE,
    IMAGE_READER_LEGACY_SETTINGS_SCHEMA as never,
    { base: IMAGE_READER_LEGACY_SETTINGS_DEFAULTS, applies: 'live' },
  )
  const current = ctx.settings.register<typeof IMAGE_READER_SETTINGS_NAMESPACE, ImageReaderSettingsSection>(
    IMAGE_READER_SETTINGS_NAMESPACE,
    IMAGE_READER_SETTINGS_SCHEMA as never,
    { base: defaults, applies: 'live', validate: validateImageReaderSettingsSection },
  )
  const descriptors = ctx.settings.describe()
  const legacyUserExists = descriptors.some(descriptor => (
    descriptor.ns === IMAGE_READER_LEGACY_SETTINGS_NAMESPACE && descriptor.user !== undefined
  ))
  const currentUserExists = descriptors.some(descriptor => (
    descriptor.ns === IMAGE_READER_SETTINGS_NAMESPACE && descriptor.user !== undefined
  ))
  if (legacyUserExists && !currentUserExists) {
    await current.replace(migrateLegacyImageReaderSettings(legacy.get()))
  }
  return current
}

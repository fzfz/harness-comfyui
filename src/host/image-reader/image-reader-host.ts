import type { Context } from '@deepseek-ai/cordis'
import type { LlmRuntime } from '@deepseek-ai/dsh-llm'
import { settingsNamespace, type SettingsScope } from '@deepseek-ai/dsh-settings'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

import {
  IMAGE_READER_REMOTE_NAMESPACE,
  type ImageReaderModelCatalog,
  type ImageReaderProviderGroup,
  type SaveImageReaderSettingsRequest,
  type SaveImageReaderSettingsResult,
} from '../../image-reader/contract.ts'
import {
  IMAGE_READER_SETTINGS_DEFAULTS,
  IMAGE_READER_LEGACY_SETTINGS_DEFAULTS,
  IMAGE_READER_LEGACY_SETTINGS_NAMESPACE,
  IMAGE_READER_LEGACY_SETTINGS_SCHEMA,
  IMAGE_READER_SETTINGS_NAMESPACE,
  IMAGE_READER_SETTINGS_SCHEMA,
  migrateLegacyImageReaderSettings,
  validateImageReaderConfiguration,
  validateImageReaderSettingsSection,
  type LegacyImageReaderSettingsSection,
  type ImageReaderSettingsSection,
} from '../../image-reader/settings.ts'
import { ImageReaderError } from './errors.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    harnessComfyuiImageReader: ImageReaderRemoteService
  }
}

export async function registerImageReaderSettings(
  ctx: Pick<Context, 'settings'>,
): Promise<SettingsScope<ImageReaderSettingsSection>> {
  const legacy = ctx.settings.register<LegacyImageReaderSettingsSection>(
    settingsNamespace(IMAGE_READER_LEGACY_SETTINGS_NAMESPACE),
    IMAGE_READER_LEGACY_SETTINGS_SCHEMA,
    { base: IMAGE_READER_LEGACY_SETTINGS_DEFAULTS, applies: 'live' },
  )
  const current = ctx.settings.register<ImageReaderSettingsSection>(
    settingsNamespace(IMAGE_READER_SETTINGS_NAMESPACE),
    IMAGE_READER_SETTINGS_SCHEMA as never,
    { base: IMAGE_READER_SETTINGS_DEFAULTS, applies: 'live', validate: validateImageReaderSettingsSection },
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

export class ImageReaderRemoteService extends TypertRemoteService {
  private readonly llm: Pick<LlmRuntime, 'listProviders' | 'listModels'>
  private readonly settings: SettingsScope<ImageReaderSettingsSection>

  constructor(
    ctx: Context,
    llm: Pick<LlmRuntime, 'listProviders' | 'listModels'>,
    settings: SettingsScope<ImageReaderSettingsSection>,
  ) {
    super(ctx, IMAGE_READER_REMOTE_NAMESPACE)
    this.llm = llm
    this.settings = settings
    for (const initialize of imageReaderRemoteInitializers) initialize(this)
  }

  async models(signal: AbortSignal): Promise<ImageReaderModelCatalog> {
    signal.throwIfAborted()
    const groups: ImageReaderProviderGroup[] = []
    const failures: { provider: string; message: string }[] = []
    for (const provider of this.llm.listProviders()) {
      signal.throwIfAborted()
      try {
        const models = (await this.llm.listModels(provider.id))
          .filter(model => model.inputModalities?.includes('image') === true)
          .map(model => Object.freeze({
            id: model.id,
            name: model.name,
            description: model.description?.trim().length ? model.description : null,
          }))
        signal.throwIfAborted()
        if (models.length > 0) {
          groups.push(Object.freeze({
            provider: provider.id,
            name: provider.name,
            models: Object.freeze(models),
          }))
        }
      } catch (error) {
        if (signal.aborted) throw signal.reason
        failures.push(Object.freeze({
          provider: provider.id,
          message: 'The provider model catalog could not be loaded.',
        }))
      }
    }
    return Object.freeze({ groups: Object.freeze(groups), failures: Object.freeze(failures) })
  }

  async saveSettings(request: SaveImageReaderSettingsRequest, signal: AbortSignal): Promise<SaveImageReaderSettingsResult> {
    signal.throwIfAborted()
    let configuration: ImageReaderSettingsSection['configuration']
    let section: ImageReaderSettingsSection
    try {
      validateImageReaderConfiguration(request.configuration)
      const profilesById = new Map(request.configuration.profiles.map(profile => [profile.id, profile]))
      const credentials: Record<string, string> = {}
      for (const [profileId, apiKey] of Object.entries(this.settings.get().credentials)) {
        const profile = profilesById.get(profileId)
        if (profile?.connectionType === 'openai-compatible') credentials[profileId] = apiKey
      }
      for (const update of request.credentialUpdates) {
        const profile = profilesById.get(update.profileId)
        if (profile?.connectionType !== 'openai-compatible') {
          throw new TypeError('API Key changes require an OpenAI-compatible profile.')
        }
        if (update.apiKey === null) delete credentials[update.profileId]
        else credentials[update.profileId] = update.apiKey
      }
      configuration = Object.freeze({
        activeProfileId: request.configuration.activeProfileId,
        profiles: Object.freeze(request.configuration.profiles.map(profile => Object.freeze({
          ...profile,
          hasApiKey: credentials[profile.id] !== undefined,
        }))),
      })
      section = Object.freeze({ configuration, credentials: Object.freeze(credentials) })
      validateImageReaderSettingsSection(section)
    } catch (error) {
      if (signal.aborted) throw signal.reason
      if (error instanceof ImageReaderError) throw error
      throw new ImageReaderError(
        'IMAGE_READER_SETTINGS_INVALID',
        'The image reader configurations could not be saved. Check every profile and credential change.',
        { cause: error },
      )
    }
    signal.throwIfAborted()
    try {
      await this.settings.replace(section)
    } catch (error) {
      throw new ImageReaderError(
        'IMAGE_READER_SETTINGS_SAVE_FAILED',
        'Harness could not persist the image reader configurations.',
        { cause: error },
      )
    }
    return Object.freeze({ configuration })
  }
}

const imageReaderRemoteInitializers: Array<(service: ImageReaderRemoteService) => void> = []

Remote(ImageReaderRemoteService.prototype.models, {
  private: false,
  static: false,
  name: 'models',
  addInitializer(initialize: (this: ImageReaderRemoteService) => void) {
    imageReaderRemoteInitializers.push(service => initialize.call(service))
  },
} as never)

Remote(ImageReaderRemoteService.prototype.saveSettings, {
  private: false,
  static: false,
  name: 'saveSettings',
  addInitializer(initialize: (this: ImageReaderRemoteService) => void) {
    imageReaderRemoteInitializers.push(service => initialize.call(service))
  },
} as never)

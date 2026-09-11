import type { LlmRuntime } from '@deepseek-ai/dsh-llm'
import { type SettingsScope } from '@deepseek-ai/dsh-settings'

import {
  type ActivateImageReaderProfileRequest,
  type ActivateImageReaderProfileResult,
  type DeleteImageReaderProfileRequest,
  type DeleteImageReaderProfileResult,
  type ImageReaderModelCatalog,
  type ImageReaderProviderGroup,
  type SaveImageReaderProfileRequest,
  type SaveImageReaderProfileResult
} from '../../image-reader/contract.ts'
import {
  ImageReaderProfileValidationError,
  validateImageReaderProfileId,
  validateSaveImageReaderProfileRequest,
} from '../../image-reader/settings-errors.ts'
import {
  validateImageReaderSettingsSection,
  type ImageReaderProfile,
  type ImageReaderSettingsSection
} from '../../image-reader/settings.ts'
import { ImageReaderError } from './errors.ts'

export class ImageReaderConfigurationService {
  private readonly llm: Pick<LlmRuntime, 'listProviders' | 'listModels'>
  private readonly settings: SettingsScope<ImageReaderSettingsSection>
  private settingsMutationTail: Promise<void> = Promise.resolve()

  constructor(
    llm: Pick<LlmRuntime, 'listProviders' | 'listModels'>,
    settings: SettingsScope<ImageReaderSettingsSection>,
  ) {
    this.llm = llm
    this.settings = settings
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

  private enqueueSettingsMutation<Result>(operation: () => Promise<Result>): Promise<Result> {
    const pending = this.settingsMutationTail.then(operation)
    this.settingsMutationTail = pending.then(() => undefined, () => undefined)
    return pending
  }

  async activateProfile(
    request: ActivateImageReaderProfileRequest,
    signal: AbortSignal,
  ): Promise<ActivateImageReaderProfileResult> {
    return this.enqueueSettingsMutation(async () => {
      signal.throwIfAborted()
      try {
        validateImageReaderProfileId(request.profileId)
      } catch (error) {
        if (error instanceof ImageReaderProfileValidationError) {
          throw new ImageReaderError(error.code, error.code, { cause: error })
        }
        throw error
      }
      const current = this.settings.get()
      if (!current.configuration.profiles.some(profile => profile.id === request.profileId)) {
        throw new ImageReaderError(
          'IMAGE_READER_PROFILE_ACTIVATION_TARGET_NOT_FOUND',
          'The requested image reader activation target does not exist.',
        )
      }
      if (current.configuration.activeProfileId === request.profileId) {
        return Object.freeze({ configuration: current.configuration })
      }
      const configuration = Object.freeze({
        activeProfileId: request.profileId,
        profiles: current.configuration.profiles,
      })
      const section = Object.freeze({ configuration, credentials: current.credentials })
      signal.throwIfAborted()
      try {
        await this.settings.replace(section)
      } catch (error) {
        throw new ImageReaderError(
          'IMAGE_READER_SETTINGS_ACTIVATE_FAILED',
          'Harness could not persist the active image reader profile.',
          { cause: error },
        )
      }
      return Object.freeze({ configuration })
    })
  }

  async saveProfile(request: SaveImageReaderProfileRequest, signal: AbortSignal): Promise<SaveImageReaderProfileResult> {
    return this.enqueueSettingsMutation(async () => {
      signal.throwIfAborted()
      let configuration: ImageReaderSettingsSection['configuration']
      let section: ImageReaderSettingsSection
      try {
        const current = this.settings.get()
        const profileIndex = current.configuration.profiles.findIndex(candidate => candidate.id === request.profile.id)
        validateSaveImageReaderProfileRequest(request, {
          persistedProfileCount: current.configuration.profiles.length,
          profileExists: profileIndex !== -1,
        })
        const credentials: Record<string, string> = { ...current.credentials }
        let storedProfile: ImageReaderProfile
        if (!('credential' in request)) {
          const profile = request.profile
          delete credentials[profile.id]
          storedProfile = Object.freeze({ ...profile, endpoint: '', hasApiKey: false })
        } else {
          const profile = request.profile
          if (request.credential.action === 'replace') credentials[profile.id] = request.credential.apiKey
          if (request.credential.action === 'clear') delete credentials[profile.id]
          storedProfile = Object.freeze({
            ...profile,
            provider: '',
            hasApiKey: credentials[profile.id] !== undefined,
          })
        }
        const profiles = [...current.configuration.profiles]
        if (request.operation === 'create') profiles.push(storedProfile)
        else profiles[profileIndex] = storedProfile
        if (!profiles.some(profile => profile.id === request.activateProfileId)) {
          throw new ImageReaderError(
            'IMAGE_READER_PROFILE_ACTIVATION_TARGET_NOT_FOUND',
            'The requested image reader activation target does not exist.',
          )
        }
        configuration = Object.freeze({
          activeProfileId: request.activateProfileId,
          profiles: Object.freeze(profiles),
        })
        section = Object.freeze({ configuration, credentials: Object.freeze(credentials) })
        validateImageReaderSettingsSection(section)
      } catch (error) {
        if (signal.aborted) throw signal.reason
        if (error instanceof ImageReaderError) throw error
        if (error instanceof ImageReaderProfileValidationError) {
          throw new ImageReaderError(error.code, error.code, { cause: error })
        }
        throw new ImageReaderError(
          'IMAGE_READER_SETTINGS_SAVE_FAILED',
          'Harness could not construct a valid persisted image reader settings section.',
          { cause: error },
        )
      }
      signal.throwIfAborted()
      try {
        await this.settings.replace(section)
      } catch (error) {
        throw new ImageReaderError(
          'IMAGE_READER_SETTINGS_SAVE_FAILED',
          'Harness could not persist the current image reader profile.',
          { cause: error },
        )
      }
      return Object.freeze({ configuration })
    })
  }

  async deleteProfile(request: DeleteImageReaderProfileRequest, signal: AbortSignal): Promise<DeleteImageReaderProfileResult> {
    return this.enqueueSettingsMutation(async () => {
      signal.throwIfAborted()
      try {
        validateImageReaderProfileId(request.profileId)
      } catch (error) {
        if (error instanceof ImageReaderProfileValidationError) {
          throw new ImageReaderError(error.code, error.code, { cause: error })
        }
        throw error
      }
      const current = this.settings.get()
      const index = current.configuration.profiles.findIndex(profile => profile.id === request.profileId)
      if (index === -1) {
        throw new ImageReaderError('IMAGE_READER_PROFILE_NOT_FOUND', 'The requested image reader profile does not exist.')
      }
      if (current.configuration.profiles.length === 1) {
        throw new ImageReaderError('IMAGE_READER_LAST_PROFILE_DELETE_FORBIDDEN', 'The only image reader profile cannot be deleted.')
      }
      const profiles = current.configuration.profiles.filter(profile => profile.id !== request.profileId)
      const activeProfileId = current.configuration.activeProfileId === request.profileId
        ? profiles[Math.min(index, profiles.length - 1)]!.id
        : current.configuration.activeProfileId
      const credentials = { ...current.credentials }
      delete credentials[request.profileId]
      const configuration = Object.freeze({ activeProfileId, profiles: Object.freeze(profiles) })
      const section = Object.freeze({ configuration, credentials: Object.freeze(credentials) })
      signal.throwIfAborted()
      try {
        await this.settings.replace(section)
      } catch (error) {
        throw new ImageReaderError(
          'IMAGE_READER_SETTINGS_DELETE_FAILED',
          'Harness could not delete the image reader profile.',
          { cause: error },
        )
      }
      return Object.freeze({ configuration })
    })
  }
}

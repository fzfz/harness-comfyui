import type { LlmRuntime } from '@deepseek-ai/dsh-llm'
import type { ImageReaderSettingsStore } from './settings-registration.ts'
import type { ImageReaderCredentialStore } from './credential-store.ts'

import {
  type ActivateImageReaderProfileRequest,
  type ActivateImageReaderProfileResult,
  type DeleteImageReaderProfileRequest,
  type DeleteImageReaderProfileResult,
  type ImageReaderModelCatalog,
  type ImageReaderProviderGroup,
  type SaveImageReaderProfileRequest,
  type SaveImageReaderProfileResult,
} from '../../image-reader/contract.ts'
import {
  ImageReaderProfileValidationError,
  validateImageReaderProfileId,
  validateSaveImageReaderProfileRequest,
} from '../../image-reader/settings-errors.ts'
import {
  validateImageReaderSettingsSection,
  type ImageReaderConfiguration,
  type ImageReaderProfile,
  type ImageReaderSettingsSection,
} from '../../image-reader/settings.ts'
import {
  createImageReaderCredentialFailure,
  type ImageReaderCredentialRef,
} from '../../image-reader/credential-schema.ts'
import { ImageReaderError } from './errors.ts'

type PersistedUserOverride = ReturnType<ImageReaderSettingsStore['readPersistedUserOverride']>
type ProfileProjection = {
  readonly configuration: ImageReaderConfiguration
  readonly configuredByProfileId: ReadonlyMap<string, boolean>
}
type SettingsWriteResult =
  | { readonly kind: 'committed' }
  | { readonly kind: 'rejected-previous'; readonly cause: unknown }
  | { readonly kind: 'rejected-candidate'; readonly cause: unknown }
  | { readonly kind: 'rejected-unknown'; readonly cause: unknown }

function structurallyEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((value, index) => structurallyEqual(value, right[index]))
  }
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord).sort()
  const rightKeys = Object.keys(rightRecord).sort()
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && structurallyEqual(leftRecord[key], rightRecord[key]))
}

function cleanupCause(primary: unknown, cleanup: unknown): Readonly<{ primary: unknown; cleanup: unknown }> {
  return Object.freeze({ primary, cleanup })
}

function credentialReadFailure(cause: unknown): ImageReaderError {
  return new ImageReaderError(
    'IMAGE_READER_CREDENTIAL_PROVIDER_READ_FAILED',
    'The official credential provider could not read an image reader credential.',
    { cause },
  )
}

export class ImageReaderConfigurationService {
  private readonly llm: Pick<LlmRuntime, 'listProviders' | 'listModels'>
  private readonly settings: ImageReaderSettingsStore
  private readonly credentials: ImageReaderCredentialStore
  private settingsMutationTail: Promise<void> = Promise.resolve()

  constructor(
    llm: Pick<LlmRuntime, 'listProviders' | 'listModels'>,
    settings: ImageReaderSettingsStore,
    credentials: ImageReaderCredentialStore,
  ) {
    this.llm = llm
    this.settings = settings
    this.credentials = credentials
  }

  async configuration(): Promise<ImageReaderConfiguration> {
    return (await this.projectSection(this.settings.get())).configuration
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

  private async projectSection(section: ImageReaderSettingsSection): Promise<ProfileProjection> {
    const configuredByProfileId = new Map<string, boolean>()
    for (const profile of section.configuration.profiles) {
      const reference = section.credentialRefs[profile.id]
      if (reference === undefined) {
        configuredByProfileId.set(profile.id, false)
        continue
      }
      try {
        const info = await this.credentials.describe(reference)
        configuredByProfileId.set(profile.id, info.configured)
      } catch (error) {
        throw credentialReadFailure(error)
      }
    }
    const profiles = section.configuration.profiles.map(profile => Object.freeze({
      ...profile,
      hasApiKey: configuredByProfileId.get(profile.id) === true,
    }))
    return Object.freeze({
      configuration: Object.freeze({
        activeProfileId: section.configuration.activeProfileId,
        profiles: Object.freeze(profiles),
      }),
      configuredByProfileId,
    })
  }

  private enqueueSettingsMutation<Result>(operation: () => Promise<Result>): Promise<Result> {
    const pending = this.settingsMutationTail.then(operation)
    this.settingsMutationTail = pending.then(() => undefined, () => undefined)
    return pending
  }

  private async inspectNewReference(reference: ImageReaderCredentialRef): Promise<void> {
    let info
    try {
      info = await this.credentials.describe(reference)
    } catch (error) {
      throw credentialReadFailure(error)
    }
    if (info.configured || !info.writable) {
      throw new ImageReaderError(
        'IMAGE_READER_CREDENTIAL_REFERENCE_UNAVAILABLE',
        'The newly allocated image reader credential reference is already configured or is not writable.',
      )
    }
  }

  private async ensureWritableReference(reference: ImageReaderCredentialRef): Promise<void> {
    let info
    try {
      info = await this.credentials.describe(reference)
    } catch (error) {
      throw credentialReadFailure(error)
    }
    if (!info.writable) {
      throw new ImageReaderError(
        'IMAGE_READER_CREDENTIAL_REFERENCE_READ_ONLY',
        'The existing image reader credential reference is read-only and cannot be replaced or cleared.',
      )
    }
  }

  private async cleanupStagedReference(
    reference: ImageReaderCredentialRef,
    primary: unknown,
  ): Promise<void> {
    try {
      await this.credentials.unset(reference)
    } catch (cleanup) {
      throw new ImageReaderError(
        'IMAGE_READER_CREDENTIAL_STAGE_CLEANUP_FAILED',
        'The image reader credential operation failed and its staged credential reference could not be cleared.',
        {
          cause: cleanupCause(primary, cleanup),
          credentialFailure: createImageReaderCredentialFailure(reference, 'staged-cleanup'),
        },
      )
    }
  }

  private async cleanupCommittedReference(
    reference: ImageReaderCredentialRef | undefined,
    settingsFailure?: unknown,
  ): Promise<void> {
    if (reference === undefined) return
    try {
      await this.credentials.unset(reference)
    } catch (cleanup) {
      throw new ImageReaderError(
        'IMAGE_READER_CREDENTIAL_COMMITTED_CLEANUP_FAILED',
        'The image reader profile was committed, but the credential provider could not clear its previous credential reference.',
        {
          cause: settingsFailure === undefined ? cleanup : cleanupCause(settingsFailure, cleanup),
          credentialFailure: createImageReaderCredentialFailure(reference, 'committed-cleanup'),
        },
      )
    }
  }

  private async replaceSettings(
    section: ImageReaderSettingsSection,
    previous: PersistedUserOverride,
  ): Promise<SettingsWriteResult> {
    try {
      await this.settings.replace(section)
      return Object.freeze({ kind: 'committed' })
    } catch (cause) {
      const observed = this.settings.readPersistedUserOverride()
      if (observed.kind === 'readable' && structurallyEqual(observed.value, section)) {
        return Object.freeze({ kind: 'rejected-candidate', cause })
      }
      if (
        previous.kind === 'readable'
        && observed.kind === 'readable'
        && structurallyEqual(observed.value, previous.value)
      ) {
        return Object.freeze({ kind: 'rejected-previous', cause })
      }
      return Object.freeze({ kind: 'rejected-unknown', cause })
    }
  }

  private committedWriteRejected(cause: unknown): ImageReaderError {
    return new ImageReaderError(
      'IMAGE_READER_CREDENTIAL_COMMITTED_WRITE_REJECTED',
      'The image reader profile was persisted, but the Settings service rejected the write operation.',
      { cause },
    )
  }

  private commitStatusUnknown(cause: unknown): ImageReaderError {
    return new ImageReaderError(
      'IMAGE_READER_CREDENTIAL_COMMIT_STATUS_UNKNOWN',
      'The Settings service rejected the image reader write and its persisted profile state could not be confirmed.',
      { cause },
    )
  }

  private throwPreviousWriteFailure(
    result: Extract<SettingsWriteResult, { readonly kind: 'rejected-previous' }>,
    code: 'IMAGE_READER_SETTINGS_SAVE_FAILED' | 'IMAGE_READER_SETTINGS_ACTIVATE_FAILED' | 'IMAGE_READER_SETTINGS_DELETE_FAILED',
    message: string,
  ): never {
    throw new ImageReaderError(code, message, { cause: result.cause })
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
      const projection = await this.projectSection(current)
      if (current.configuration.activeProfileId === request.profileId) {
        return Object.freeze({ configuration: projection.configuration })
      }
      const configuration = Object.freeze({
        activeProfileId: request.profileId,
        profiles: projection.configuration.profiles,
      })
      const section = Object.freeze({
        configuration: Object.freeze({ activeProfileId: request.profileId, profiles: current.configuration.profiles }),
        credentialRefs: current.credentialRefs,
      })
      signal.throwIfAborted()
      const previous = this.settings.readPersistedUserOverride()
      const write = await this.replaceSettings(section, previous)
      if (write.kind === 'rejected-previous') {
        this.throwPreviousWriteFailure(
          write,
          'IMAGE_READER_SETTINGS_ACTIVATE_FAILED',
          'Harness could not persist the active image reader profile.',
        )
      }
      if (write.kind === 'rejected-candidate') throw this.committedWriteRejected(write.cause)
      if (write.kind === 'rejected-unknown') throw this.commitStatusUnknown(write.cause)
      return Object.freeze({ configuration })
    })
  }

  async saveProfile(request: SaveImageReaderProfileRequest, signal: AbortSignal): Promise<SaveImageReaderProfileResult> {
    return this.enqueueSettingsMutation(async () => {
      signal.throwIfAborted()
      let current: ImageReaderSettingsSection
      let projection: ProfileProjection
      let profileIndex: number
      try {
        current = this.settings.get()
        profileIndex = current.configuration.profiles.findIndex(candidate => candidate.id === request.profile.id)
        validateSaveImageReaderProfileRequest(request, {
          persistedProfileCount: current.configuration.profiles.length,
          profileExists: profileIndex !== -1,
        })
        if (!current.configuration.profiles.some(profile => profile.id === request.activateProfileId)
          && !(request.operation === 'create' && request.profile.id === request.activateProfileId)) {
          throw new ImageReaderError(
            'IMAGE_READER_PROFILE_ACTIVATION_TARGET_NOT_FOUND',
            'The requested image reader activation target does not exist.',
          )
        }
        projection = await this.projectSection(current)
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

      const profileId = request.profile.id
      const oldReference = current.credentialRefs[profileId]
      let credentialAction: 'keep' | 'replace' | 'clear' = 'clear'
      let replacementApiKey: string | undefined
      if ('credential' in request) {
        credentialAction = request.credential.action
        if (request.credential.action === 'replace') replacementApiKey = request.credential.apiKey
      }
      const removesOldReference = oldReference !== undefined && credentialAction !== 'keep'
      if (removesOldReference) await this.ensureWritableReference(oldReference)

      let stagedReference: ImageReaderCredentialRef | undefined
      let configured = credentialAction === 'keep'
        ? projection.configuredByProfileId.get(profileId) === true
        : false
      const credentialRefs: Record<string, ImageReaderCredentialRef> = { ...current.credentialRefs }

      if (credentialAction === 'replace') {
        signal.throwIfAborted()
        stagedReference = this.credentials.createRef()
        await this.inspectNewReference(stagedReference)
        signal.throwIfAborted()
        try {
          await this.credentials.set(stagedReference, replacementApiKey!)
          configured = true
          credentialRefs[profileId] = stagedReference
        } catch (cause) {
          await this.cleanupStagedReference(stagedReference, cause)
          throw new ImageReaderError(
            'IMAGE_READER_CREDENTIAL_PROVIDER_WRITE_FAILED',
            'The official credential provider could not store the new image reader API Key.',
            { cause },
          )
        }
      } else if (credentialAction === 'clear') {
        delete credentialRefs[profileId]
      }

      if (request.profile.connectionType === 'runtime') delete credentialRefs[profileId]
      const profile: ImageReaderProfile = request.profile.connectionType === 'runtime'
        ? Object.freeze({ ...request.profile, endpoint: '', hasApiKey: false })
        : Object.freeze({
          ...request.profile,
          provider: '',
          hasApiKey: credentialRefs[profileId] !== undefined,
        })
      const profiles = [...current.configuration.profiles]
      if (request.operation === 'create') profiles.push(profile)
      else profiles[profileIndex] = profile
      const targetExists = profiles.some(candidate => candidate.id === request.activateProfileId)
      if (!targetExists) {
        if (stagedReference !== undefined) await this.cleanupStagedReference(stagedReference, new Error('Activation target not found.'))
        throw new ImageReaderError(
          'IMAGE_READER_PROFILE_ACTIVATION_TARGET_NOT_FOUND',
          'The requested image reader activation target does not exist.',
        )
      }
      const storedConfiguration = Object.freeze({
        activeProfileId: request.activateProfileId,
        profiles: Object.freeze(profiles),
      })
      const section = Object.freeze({ configuration: storedConfiguration, credentialRefs: Object.freeze(credentialRefs) })
      try {
        validateImageReaderSettingsSection(section)
      } catch (error) {
        if (stagedReference !== undefined) await this.cleanupStagedReference(stagedReference, error)
        throw new ImageReaderError(
          'IMAGE_READER_SETTINGS_SAVE_FAILED',
          'Harness could not construct a valid persisted image reader settings section.',
          { cause: error },
        )
      }

      const candidateProfiles = profiles.map(candidate => Object.freeze({
        ...candidate,
        hasApiKey: candidate.id === profileId
          ? configured
          : projection.configuredByProfileId.get(candidate.id) === true,
      }))
      const resultConfiguration = Object.freeze({
        activeProfileId: storedConfiguration.activeProfileId,
        profiles: Object.freeze(candidateProfiles),
      })
      const previous = this.settings.readPersistedUserOverride()
      try {
        signal.throwIfAborted()
      } catch (cause) {
        if (stagedReference !== undefined) await this.cleanupStagedReference(stagedReference, cause)
        throw cause
      }
      const write = await this.replaceSettings(section, previous)
      if (write.kind === 'rejected-previous') {
        if (stagedReference !== undefined) await this.cleanupStagedReference(stagedReference, write.cause)
        if (signal.aborted) throw signal.reason
        this.throwPreviousWriteFailure(
          write,
          'IMAGE_READER_SETTINGS_SAVE_FAILED',
          'Harness could not persist the current image reader profile.',
        )
      }
      if (write.kind === 'rejected-unknown') throw this.commitStatusUnknown(write.cause)

      if (removesOldReference) {
        await this.cleanupCommittedReference(oldReference, write.kind === 'rejected-candidate' ? write.cause : undefined)
      }
      if (write.kind === 'rejected-candidate') throw this.committedWriteRejected(write.cause)
      return Object.freeze({ configuration: resultConfiguration })
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
      const projection = await this.projectSection(current)
      const oldReference = current.credentialRefs[request.profileId]
      if (oldReference !== undefined) await this.ensureWritableReference(oldReference)
      const profiles = projection.configuration.profiles.filter(profile => profile.id !== request.profileId)
      const activeProfileId = current.configuration.activeProfileId === request.profileId
        ? profiles[Math.min(index, profiles.length - 1)]!.id
        : current.configuration.activeProfileId
      const credentialRefs: Record<string, ImageReaderCredentialRef> = { ...current.credentialRefs }
      delete credentialRefs[request.profileId]
      const configuration = Object.freeze({ activeProfileId, profiles: Object.freeze(profiles) })
      const section = Object.freeze({
        configuration: Object.freeze({
          activeProfileId,
          profiles: Object.freeze(current.configuration.profiles.filter(profile => profile.id !== request.profileId)),
        }),
        credentialRefs: Object.freeze(credentialRefs),
      })
      signal.throwIfAborted()
      const previous = this.settings.readPersistedUserOverride()
      const write = await this.replaceSettings(section, previous)
      if (write.kind === 'rejected-previous') {
        this.throwPreviousWriteFailure(
          write,
          'IMAGE_READER_SETTINGS_DELETE_FAILED',
          'Harness could not delete the image reader profile.',
        )
      }
      if (write.kind === 'rejected-unknown') throw this.commitStatusUnknown(write.cause)
      await this.cleanupCommittedReference(oldReference, write.kind === 'rejected-candidate' ? write.cause : undefined)
      if (write.kind === 'rejected-candidate') throw this.committedWriteRejected(write.cause)
      return Object.freeze({ configuration })
    })
  }
}

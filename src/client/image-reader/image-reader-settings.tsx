import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import type { SettingsSectionOwnerProps } from '@deepseek-ai/dsh-client-ui-settings/client'

import errorCatalog from '../../../config/error-catalog.json' with { type: 'json' }

import type {
  ActivateImageReaderProfileRequest,
  ActivateImageReaderProfileResult,
  DeleteImageReaderProfileRequest,
  DeleteImageReaderProfileResult,
  ImageReaderCredentialAction,
  ImageReaderModelCatalog,
  ImageReaderModelOption,
  SaveImageReaderProfileRequest,
  SaveImageReaderProfileResult,
  SaveImageReaderProfileOperation,
} from '../../image-reader/contract.ts'
import {
  IMAGE_READER_SETTINGS_FIELD_BY_CODE,
  ImageReaderProfileValidationError,
  validateSaveImageReaderProfileRequest,
  type ImageReaderSettingsField,
} from '../../image-reader/settings-errors.ts'
import {
  IMAGE_READER_ENDPOINT_MAX_LENGTH,
  IMAGE_READER_DEFAULT_CONFIGURATION,
  IMAGE_READER_MAX_PROFILES,
  IMAGE_READER_MAX_TOKENS_MAX,
  IMAGE_READER_MAX_TOKENS_MIN,
  IMAGE_READER_MODEL_MAX_LENGTH,
  IMAGE_READER_PROFILE_NAME_MAX_LENGTH,
  IMAGE_READER_PROMPT_MAX_LENGTH,
  IMAGE_READER_PROVIDER_MAX_LENGTH,
  IMAGE_READER_TEMPERATURE_MAX,
  IMAGE_READER_TEMPERATURE_MIN,
  activeImageReaderProfile,
  createImageReaderProfile,
  type ImageReaderConfiguration,
  type ImageReaderProfile,
  type ImageReaderSettingsView,
} from '../../image-reader/settings.ts'

export class ImageReaderSettingsError extends Error {
  readonly code: string

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ImageReaderSettingsError'
    this.code = code
  }
}

export interface ImageReaderSettingsApi {
  readonly models: (signal: AbortSignal) => Promise<ImageReaderModelCatalog>
  readonly saveProfile: (
    request: SaveImageReaderProfileRequest,
    signal: AbortSignal,
  ) => Promise<SaveImageReaderProfileResult>
  readonly activateProfile: (
    request: ActivateImageReaderProfileRequest,
    signal: AbortSignal,
  ) => Promise<ActivateImageReaderProfileResult>
  readonly deleteProfile: (
    request: DeleteImageReaderProfileRequest,
    signal: AbortSignal,
  ) => Promise<DeleteImageReaderProfileResult>
}

export const IMAGE_READER_SETTINGS_COPY = Object.freeze({
  activeSelectorLabel: '当前生效配置',
  activeSelectorHelp: '选择已保存配置后，该配置立即用于下一次图片读取。',
  editingPersisted: (name: string) => `正在编辑配置“${name}”。该配置是当前生效配置。`,
  editingDirtyPersisted: (name: string) => `配置“${name}”有未保存修改。图片读取继续使用该配置上一次保存的内容。`,
  editingDirtyWhileAnotherActive: (draftName: string, activeName: string) => `配置“${draftName}”有未保存修改。图片读取当前使用配置“${activeName}”。`,
  editingUnsaved: (draftName: string, activeName: string) => `配置“${draftName}”尚未保存。图片读取继续使用配置“${activeName}”。`,
  savePersisted: (name: string) => `保存配置“${name}”`,
  savePersistedWhileAnotherActive: (draftName: string, activeName: string) => `保存配置“${draftName}”并继续使用当前生效配置“${activeName}”`,
  saveUnsaved: (name: string) => `保存配置“${name}”并使该配置生效`,
  discardUnsaved: (name: string) => `放弃未保存配置“${name}”`,
  discardPersisted: (name: string) => `放弃配置“${name}”的未保存修改`,
  savedAndActive: (name: string) => `配置“${name}”已保存并生效。`,
  savedWhileAnotherActive: (draftName: string, activeName: string) => `配置“${draftName}”已保存。图片读取继续使用当前生效配置“${activeName}”。`,
  savedAndSwitched: (draftName: string, activeName: string) => `配置“${draftName}”已保存，配置“${activeName}”已生效。下一次图片读取将使用配置“${activeName}”。`,
  deletedAndActivated: (deletedName: string, activeName: string) => `配置“${deletedName}”已删除，配置“${activeName}”现在生效。下一次图片读取将使用配置“${activeName}”。`,
  deletedWhileAnotherActive: (deletedName: string, activeName: string) => `配置“${deletedName}”已删除。图片读取继续使用当前生效配置“${activeName}”。`,
  activating: (targetName: string, activeName: string) => `正在切换到配置“${targetName}”。切换完成前，图片读取继续使用配置“${activeName}”。`,
  activated: (name: string) => `配置“${name}”已生效。下一次图片读取将使用该配置。`,
  saveAndSwitch: (draftName: string, targetName: string) => `保存配置“${draftName}”并切换到配置“${targetName}”`,
  discardAndSwitch: (draftName: string, targetName: string) => `放弃配置“${draftName}”的未保存修改并切换到配置“${targetName}”`,
  continueEditing: (name: string) => `继续编辑配置“${name}”`,
  switchGate: (name: string) => `配置“${name}”有未保存修改。请选择保存修改、放弃修改或继续编辑。`,
  discardAndDelete: (name: string) => `放弃配置“${name}”的未保存修改并删除配置“${name}”`,
  deleteGate: (name: string) => `配置“${name}”有未保存修改。删除该配置前必须明确放弃修改。`,
  activationCancelled: (targetName: string, activeName: string, discardedDraftName?: string) => discardedDraftName === undefined
    ? `配置“${targetName}”的切换请求已取消。图片读取继续使用当前生效配置“${activeName}”。请重新选择配置“${targetName}”。`
    : `配置“${targetName}”的切换请求已取消。配置“${discardedDraftName}”的未保存修改已按使用者选择放弃，图片读取继续使用当前生效配置“${activeName}”。请重新选择配置“${targetName}”。`,
  saveCancelled: (name: string) => `配置“${name}”的保存请求已取消。未保存修改仍然保留，图片读取继续使用提交前的配置。请重新保存配置“${name}”。`,
  deleteCancelled: (name: string, discardedDraft: boolean) => discardedDraft
    ? `配置“${name}”的删除请求已取消。配置“${name}”的未保存修改已按使用者选择放弃，该配置没有被删除。请重新删除配置“${name}”或继续使用。`
    : `配置“${name}”的删除请求已取消。该配置没有被删除。请重新删除配置“${name}”或继续使用。`,
  updateTargetDeleted: (draftName: string, activeName: string) => `配置“${draftName}”已被其他设置操作删除。当前草稿不能保存；请放弃该草稿以加载当前生效配置“${activeName}”。`,
  activationTargetDeleted: (targetName: string, draftName: string) => `目标配置“${targetName}”已被其他设置操作删除，无法完成切换。配置“${draftName}”的未保存修改仍然保留。`,
})

interface SettingsScope<T> {
  readonly getSnapshot: () => {
    readonly status: 'loading' | 'ready' | 'unavailable'
    readonly value?: T
    readonly writable: boolean
  }
  readonly subscribe: (listener: () => void) => () => void
}

export interface ImageReaderSettingsPageProps extends SettingsSectionOwnerProps {
  readonly scope: SettingsScope<ImageReaderSettingsView>
  readonly api: ImageReaderSettingsApi
}

export function modelsForProvider(
  catalog: ImageReaderModelCatalog | null,
  provider: string,
): readonly ImageReaderModelOption[] {
  return catalog?.groups.find(group => group.provider === provider)?.models ?? []
}

function saveRequest(
  profile: ImageReaderProfile,
  credential: ImageReaderCredentialAction,
  operation: SaveImageReaderProfileOperation,
  activateProfileId: string,
): SaveImageReaderProfileRequest {
  const common = {
    id: profile.id,
    name: profile.name,
    model: profile.model,
    defaultPrompt: profile.defaultPrompt,
    temperature: profile.temperature,
    maxTokens: profile.maxTokens,
  }
  if (profile.connectionType === 'runtime') {
    return Object.freeze({
      operation,
      activateProfileId,
      profile: Object.freeze({ ...common, connectionType: 'runtime', provider: profile.provider }),
    })
  }
  return Object.freeze({
    operation,
    activateProfileId,
    profile: Object.freeze({ ...common, connectionType: 'openai-compatible', endpoint: profile.endpoint }),
    credential,
  })
}

export async function saveImageReaderProfile(
  api: Pick<ImageReaderSettingsApi, 'saveProfile'>,
  profile: ImageReaderProfile,
  credential: ImageReaderCredentialAction,
  persistedConfiguration: ImageReaderConfiguration,
  operation: SaveImageReaderProfileOperation,
  activateProfileId: string,
  signal: AbortSignal,
): Promise<SaveImageReaderProfileResult> {
  const request = saveRequest(profile, credential, operation, activateProfileId)
  try {
    validateSaveImageReaderProfileRequest(request, {
      persistedProfileCount: persistedConfiguration.profiles.length,
      profileExists: persistedConfiguration.profiles.some(candidate => candidate.id === profile.id),
    })
  } catch (error) {
    if (error instanceof ImageReaderProfileValidationError) {
      throw new ImageReaderSettingsError(error.code, error.code, { cause: error })
    }
    throw new ImageReaderSettingsError(
      'IMAGE_READER_SETTINGS_REQUEST_FAILED',
      'The current image reader profile could not be validated.',
      { cause: error },
    )
  }
  return api.saveProfile(request, signal)
}

export function imageReaderSettingsErrorMessage(error: unknown): string {
  const code = error instanceof ImageReaderSettingsError
    ? error.code
    : typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'IMAGE_READER_SETTINGS_REQUEST_FAILED'
  const entry = errorCatalog[code as keyof typeof errorCatalog]
    ?? errorCatalog.IMAGE_READER_SETTINGS_REQUEST_FAILED
  return `${entry.code}：${entry.reason}${entry.next_step}`
}

export function endpointTransportMessage(endpoint: string): string | null {
  let protocol: string
  try {
    protocol = new URL(endpoint).protocol
  } catch {
    return null
  }
  if (protocol === 'http:') {
    return '当前 HTTP 地址不会加密 API Key 与图片内容；使用者必须确认目标内网链路符合部署要求。'
  }
  if (protocol === 'https:') {
    return '当前 HTTPS 地址将通过 TLS 传输 API Key 与图片内容。'
  }
  return null
}

function profileId(): string {
  return `profile_${globalThis.crypto.randomUUID().replaceAll('-', '')}`
}

function savedProfile(configuration: ImageReaderConfiguration, id: string): ImageReaderProfile {
  const profile = configuration.profiles.find(candidate => candidate.id === id)
  if (profile === undefined) throw new TypeError(`Image reader profile "${id}" does not exist.`)
  return Object.freeze({ ...profile })
}

function initialCredentialAction(profile: ImageReaderProfile): ImageReaderCredentialAction {
  return profile.connectionType === 'openai-compatible'
    ? Object.freeze({ action: 'keep' })
    : Object.freeze({ action: 'clear' })
}

function settingsErrorCode(error: unknown): string {
  return error instanceof ImageReaderSettingsError
    ? error.code
    : typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'IMAGE_READER_SETTINGS_REQUEST_FAILED'
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

type ImageReaderDraftOrigin = 'persisted' | 'new' | 'duplicate'

type ImageReaderPendingIntent =
  | { readonly kind: 'switch'; readonly targetProfileId: string }
  | { readonly kind: 'delete'; readonly profileId: string }

export function ImageReaderSettingsPage({ scope, api }: ImageReaderSettingsPageProps) {
  const settings = useSyncExternalStore(
    listener => scope.subscribe(listener),
    () => scope.getSnapshot(),
  )
  const initialConfiguration = settings.value?.configuration ?? IMAGE_READER_DEFAULT_CONFIGURATION
  const [persistedConfiguration, setPersistedConfiguration] = useState<ImageReaderConfiguration>(initialConfiguration)
  const [editorDraft, setEditorDraft] = useState<ImageReaderProfile>(activeImageReaderProfile(initialConfiguration))
  const [draftOrigin, setDraftOrigin] = useState<ImageReaderDraftOrigin>('persisted')
  const [credentialAction, setCredentialAction] = useState<ImageReaderCredentialAction>(
    initialCredentialAction(activeImageReaderProfile(initialConfiguration)),
  )
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty
  const [pendingIntent, setPendingIntent] = useState<ImageReaderPendingIntent | null>(null)
  const [modelCatalog, setModelCatalog] = useState<ImageReaderModelCatalog | null>(null)
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [catalogVersion, setCatalogVersion] = useState(0)
  const [operationStatus, setOperationStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [pendingOperation, setPendingOperation] = useState<'activate' | 'save' | 'delete' | null>(null)
  const [failedOperation, setFailedOperation] = useState<'activate' | 'save' | 'delete' | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [operationErrorCode, setOperationErrorCode] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const operationController = useRef<AbortController | null>(null)
  const persistedConfigurationRef = useRef(persistedConfiguration)
  persistedConfigurationRef.current = persistedConfiguration
  const editorDraftRef = useRef(editorDraft)
  editorDraftRef.current = editorDraft
  const draftOriginRef = useRef(draftOrigin)
  draftOriginRef.current = draftOrigin
  const pendingIntentRef = useRef(pendingIntent)
  pendingIntentRef.current = pendingIntent

  useEffect(() => {
    if (settings.status === 'ready') {
      const configuration = settings.value?.configuration ?? IMAGE_READER_DEFAULT_CONFIGURATION
      const previousConfiguration = persistedConfigurationRef.current
      const currentDraft = editorDraftRef.current
      const currentDraftOrigin = draftOriginRef.current
      const currentIntent = pendingIntentRef.current
      setPersistedConfiguration(configuration)
      if (!dirtyRef.current) {
        const profile = activeImageReaderProfile(configuration)
        setEditorDraft(savedProfile(configuration, profile.id))
        setDraftOrigin('persisted')
        setCredentialAction(initialCredentialAction(profile))
        setPendingIntent(null)
      } else if (
        currentDraftOrigin === 'persisted'
        && !configuration.profiles.some(profile => profile.id === currentDraft.id)
      ) {
        setPendingIntent(null)
        setOperationStatus('error')
        setFailedOperation('save')
        setOperationErrorCode('IMAGE_READER_PROFILE_UPDATE_TARGET_NOT_FOUND')
        setOperationError(IMAGE_READER_SETTINGS_COPY.updateTargetDeleted(
          currentDraft.name,
          activeImageReaderProfile(configuration).name,
        ))
      } else if (
        currentIntent?.kind === 'switch'
        && !configuration.profiles.some(profile => profile.id === currentIntent.targetProfileId)
      ) {
        const removedTargetName = previousConfiguration.profiles.find(
          profile => profile.id === currentIntent.targetProfileId,
        )?.name ?? currentIntent.targetProfileId
        setPendingIntent(null)
        setOperationStatus('error')
        setFailedOperation('activate')
        setOperationErrorCode('IMAGE_READER_PROFILE_ACTIVATION_TARGET_NOT_FOUND')
        setOperationError(IMAGE_READER_SETTINGS_COPY.activationTargetDeleted(removedTargetName, currentDraft.name))
      }
    }
  }, [settings])

  useEffect(() => () => {
    operationController.current?.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setCatalogStatus('loading')
    setCatalogError(null)
    void api.models(controller.signal).then(value => {
      if (controller.signal.aborted) return
      setModelCatalog(value)
      setCatalogStatus('ready')
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      setModelCatalog(null)
      setCatalogError(imageReaderSettingsErrorMessage(error))
      setCatalogStatus('error')
    })
    return () => controller.abort()
  }, [api, catalogVersion])

  const availableModels = modelsForProvider(modelCatalog, editorDraft.provider)
  const currentModelIsMissing = editorDraft.connectionType === 'runtime'
    && editorDraft.model.length > 0
    && !availableModels.some(model => model.id === editorDraft.model)
  const writable = settings.status === 'ready' && settings.writable
  const controlsDisabled = !writable || pendingOperation !== null
  const actualProfile = activeImageReaderProfile(persistedConfiguration)
  const draftSourceMissing = dirty
    && draftOrigin === 'persisted'
    && !persistedConfiguration.profiles.some(profile => profile.id === editorDraft.id)
  const mutationControlsDisabled = controlsDisabled || draftSourceMissing
  const resetMessages = () => {
    setOperationStatus('idle')
    setOperationError(null)
    setOperationErrorCode(null)
    setSuccessMessage(null)
    setFailedOperation(null)
  }
  const loadActualProfile = (configuration: ImageReaderConfiguration) => {
    const profile = activeImageReaderProfile(configuration)
    setEditorDraft(savedProfile(configuration, profile.id))
    setDraftOrigin('persisted')
    setCredentialAction(initialCredentialAction(profile))
    setDirty(false)
    setPendingIntent(null)
  }
  const adoptConfiguration = (configuration: ImageReaderConfiguration) => {
    setPersistedConfiguration(configuration)
    loadActualProfile(configuration)
  }
  const updateEditorDraft = (update: (profile: ImageReaderProfile) => ImageReaderProfile) => {
    if (mutationControlsDisabled) return
    setEditorDraft(current => Object.freeze(update(current)))
    setDirty(true)
    resetMessages()
  }
  const addProfile = () => {
    if (mutationControlsDisabled || dirty || persistedConfiguration.profiles.length >= IMAGE_READER_MAX_PROFILES) return
    const id = profileId()
    const next = createImageReaderProfile(id, `图片读取配置 ${persistedConfiguration.profiles.length + 1}`)
    setEditorDraft(next)
    setDraftOrigin('new')
    setCredentialAction(Object.freeze({ action: 'clear' }))
    setDirty(true)
    setPendingIntent(null)
    resetMessages()
  }
  const duplicateProfile = () => {
    if (mutationControlsDisabled || dirty || persistedConfiguration.profiles.length >= IMAGE_READER_MAX_PROFILES) return
    const id = profileId()
    const next = Object.freeze({ ...editorDraft, id, name: `${editorDraft.name} 副本`, hasApiKey: false })
    setEditorDraft(next)
    setDraftOrigin('duplicate')
    setCredentialAction(Object.freeze({ action: 'clear' }))
    setDirty(true)
    setPendingIntent(null)
    resetMessages()
  }
  const updateCredential = (action: ImageReaderCredentialAction) => {
    if (mutationControlsDisabled) return
    setCredentialAction(Object.freeze(action))
    setDirty(true)
    resetMessages()
  }

  const activatePersistedProfile = async (targetProfileId: string, discardedDraftName?: string) => {
    if (controlsDisabled || targetProfileId === persistedConfiguration.activeProfileId) return
    const targetName = savedProfile(persistedConfiguration, targetProfileId).name
    const activeName = actualProfile.name
    const controller = new AbortController()
    operationController.current = controller
    setPendingIntent(Object.freeze({ kind: 'switch', targetProfileId }))
    setPendingOperation('activate')
    resetMessages()
    try {
      const result = await api.activateProfile({ profileId: targetProfileId }, controller.signal)
      adoptConfiguration(result.configuration)
      const activatedName = activeImageReaderProfile(result.configuration).name
      setOperationStatus('saved')
      setSuccessMessage(IMAGE_READER_SETTINGS_COPY.activated(activatedName))
    } catch (error) {
      if (discardedDraftName !== undefined) loadActualProfile(persistedConfiguration)
      const message = isAbortError(error)
        ? IMAGE_READER_SETTINGS_COPY.activationCancelled(targetName, activeName, discardedDraftName)
        : imageReaderSettingsErrorMessage(error)
      setOperationErrorCode(settingsErrorCode(error))
      setOperationError(message)
      setOperationStatus('error')
      setFailedOperation('activate')
      setPendingIntent(null)
    } finally {
      if (operationController.current === controller) operationController.current = null
      setPendingOperation(null)
    }
  }

  const selectProfile = (id: string) => {
    if (mutationControlsDisabled || id === persistedConfiguration.activeProfileId) return
    if (dirty) {
      setPendingIntent(Object.freeze({ kind: 'switch', targetProfileId: id }))
      resetMessages()
      return
    }
    void activatePersistedProfile(id)
  }

  const save = async () => {
    if (mutationControlsDisabled) return
    const switchIntent = pendingIntent?.kind === 'switch' ? pendingIntent : null
    const activateProfileId = switchIntent?.targetProfileId
      ?? (draftOrigin === 'persisted' ? persistedConfiguration.activeProfileId : editorDraft.id)
    const targetName = activateProfileId === editorDraft.id
      ? editorDraft.name
      : savedProfile(persistedConfiguration, activateProfileId).name
    const controller = new AbortController()
    operationController.current = controller
    setPendingOperation('save')
    setOperationStatus('idle')
    setOperationError(null)
    setOperationErrorCode(null)
    setSuccessMessage(null)
    try {
      const result = await saveImageReaderProfile(
        api,
        editorDraft,
        credentialAction,
        persistedConfiguration,
        draftOrigin === 'persisted' ? 'update' : 'create',
        activateProfileId,
        controller.signal,
      )
      adoptConfiguration(result.configuration)
      const activeResult = activeImageReaderProfile(result.configuration)
      setOperationStatus('saved')
      setSuccessMessage(switchIntent !== null
        ? IMAGE_READER_SETTINGS_COPY.savedAndSwitched(editorDraft.name, activeResult.name)
        : activeResult.id === editorDraft.id
          ? IMAGE_READER_SETTINGS_COPY.savedAndActive(editorDraft.name)
          : IMAGE_READER_SETTINGS_COPY.savedWhileAnotherActive(editorDraft.name, activeResult.name))
    } catch (error) {
      const code = settingsErrorCode(error)
      setOperationErrorCode(code)
      setOperationError(isAbortError(error)
        ? IMAGE_READER_SETTINGS_COPY.saveCancelled(editorDraft.name)
        : code === 'IMAGE_READER_PROFILE_UPDATE_TARGET_NOT_FOUND'
          ? IMAGE_READER_SETTINGS_COPY.updateTargetDeleted(editorDraft.name, actualProfile.name)
          : code === 'IMAGE_READER_PROFILE_ACTIVATION_TARGET_NOT_FOUND' && switchIntent !== null
            ? IMAGE_READER_SETTINGS_COPY.activationTargetDeleted(targetName, editorDraft.name)
            : imageReaderSettingsErrorMessage(error))
      setOperationStatus('error')
      setFailedOperation('save')
    } finally {
      if (operationController.current === controller) operationController.current = null
      setPendingOperation(null)
    }
  }

  const performDelete = async (profileIdToDelete: string, discardedDraft: boolean) => {
    if (controlsDisabled) return
    if (persistedConfiguration.profiles.length === 1) return
    const controller = new AbortController()
    operationController.current = controller
    setPendingIntent(Object.freeze({ kind: 'delete', profileId: profileIdToDelete }))
    setPendingOperation('delete')
    setOperationStatus('idle')
    setOperationError(null)
    setOperationErrorCode(null)
    setSuccessMessage(null)
    const deletedProfileName = persistedConfiguration.profiles.find(profile => profile.id === profileIdToDelete)?.name
      ?? editorDraft.name
    const deletedWasActive = persistedConfiguration.activeProfileId === profileIdToDelete
    try {
      const result = await api.deleteProfile({ profileId: profileIdToDelete }, controller.signal)
      adoptConfiguration(result.configuration)
      const activeResult = activeImageReaderProfile(result.configuration)
      setOperationStatus('saved')
      setSuccessMessage(deletedWasActive
        ? IMAGE_READER_SETTINGS_COPY.deletedAndActivated(deletedProfileName, activeResult.name)
        : IMAGE_READER_SETTINGS_COPY.deletedWhileAnotherActive(deletedProfileName, activeResult.name))
    } catch (error) {
      if (discardedDraft) loadActualProfile(persistedConfiguration)
      const code = settingsErrorCode(error)
      setOperationErrorCode(code)
      setOperationError(isAbortError(error)
        ? IMAGE_READER_SETTINGS_COPY.deleteCancelled(deletedProfileName, discardedDraft)
        : imageReaderSettingsErrorMessage(error))
      setOperationStatus('error')
      setFailedOperation('delete')
      setPendingIntent(null)
    } finally {
      if (operationController.current === controller) operationController.current = null
      setPendingOperation(null)
    }
  }

  const requestDelete = () => {
    if (mutationControlsDisabled) return
    if (draftOrigin !== 'persisted') {
      loadActualProfile(persistedConfiguration)
      resetMessages()
      return
    }
    if (dirty) {
      setPendingIntent(Object.freeze({ kind: 'delete', profileId: editorDraft.id }))
      resetMessages()
      return
    }
    void performDelete(editorDraft.id, false)
  }

  const discardDraft = () => {
    loadActualProfile(persistedConfiguration)
    resetMessages()
  }

  const discardAndSwitch = () => {
    if (pendingIntent?.kind !== 'switch') return
    const targetProfileId = pendingIntent.targetProfileId
    const discardedDraftName = editorDraft.name
    loadActualProfile(persistedConfiguration)
    void activatePersistedProfile(targetProfileId, discardedDraftName)
  }

  const discardAndDelete = () => {
    if (pendingIntent?.kind !== 'delete') return
    const profileIdToDelete = pendingIntent.profileId
    loadActualProfile(persistedConfiguration)
    void performDelete(profileIdToDelete, true)
  }

  const credentialDraft = credentialAction.action === 'replace' ? credentialAction.apiKey : ''
  const credentialState = credentialAction.action === 'clear'
    ? editorDraft.hasApiKey
      ? '保存后清除已保存的 API Key。'
      : '这份配置没有保存 API Key；本地免鉴权接口可以留空。'
    : credentialAction.action === 'replace'
      ? editorDraft.hasApiKey
        ? '保存后替换这份配置的 API Key。'
        : '保存后首次设置这份配置的 API Key。'
      : editorDraft.hasApiKey
        ? '这份配置已经保存 API Key；留空不会修改。'
        : '这份配置没有保存 API Key；本地免鉴权接口可以留空。'
  const errorField = operationErrorCode === null
    ? null
    : IMAGE_READER_SETTINGS_FIELD_BY_CODE[operationErrorCode as keyof typeof IMAGE_READER_SETTINGS_FIELD_BY_CODE] ?? null
  const fieldError = (field: ImageReaderSettingsField) => errorField === field ? operationError : null
  const renderFieldError = (field: ImageReaderSettingsField) => {
    const message = fieldError(field)
    return message === null ? null : (
      <small role="alert" data-image-reader-error-field={field}>{message}</small>
    )
  }
  const switchIntent = pendingIntent?.kind === 'switch' ? pendingIntent : null
  const switchTarget = switchIntent === null
    ? null
    : persistedConfiguration.profiles.find(profile => profile.id === switchIntent.targetProfileId) ?? null
  const editorStateMessage = draftOrigin === 'persisted'
    ? dirty
      ? editorDraft.id === actualProfile.id
        ? IMAGE_READER_SETTINGS_COPY.editingDirtyPersisted(editorDraft.name)
        : IMAGE_READER_SETTINGS_COPY.editingDirtyWhileAnotherActive(editorDraft.name, actualProfile.name)
      : IMAGE_READER_SETTINGS_COPY.editingPersisted(editorDraft.name)
    : IMAGE_READER_SETTINGS_COPY.editingUnsaved(editorDraft.name, actualProfile.name)
  const saveButtonLabel = draftOrigin === 'persisted'
    ? editorDraft.id === actualProfile.id
      ? IMAGE_READER_SETTINGS_COPY.savePersisted(editorDraft.name)
      : IMAGE_READER_SETTINGS_COPY.savePersistedWhileAnotherActive(editorDraft.name, actualProfile.name)
    : IMAGE_READER_SETTINGS_COPY.saveUnsaved(editorDraft.name)

  return (
    <section className="harness-comfyui-image-reader-settings" aria-labelledby="harness-comfyui-image-reader-title">
      <header className="harness-comfyui-image-reader-header">
        <div>
          <h2 id="harness-comfyui-image-reader-title">图片读取</h2>
          <p>保存多份独立读图配置，并切换 inspect_image 当前使用的配置。图片读取不会跟随当前会话或生图模型。</p>
        </div>
        <button type="button" onClick={() => setCatalogVersion(value => value + 1)} disabled={catalogStatus === 'loading'}>
          {catalogStatus === 'loading' ? '正在读取模型…' : '刷新系统模型'}
        </button>
      </header>

      {settings.status === 'loading' ? <p role="status">正在读取图片读取设置…</p> : null}
      {settings.status === 'unavailable' ? <p role="alert">{errorCatalog.IMAGE_READER_SETTINGS_UNAVAILABLE.reason}{errorCatalog.IMAGE_READER_SETTINGS_UNAVAILABLE.next_step}</p> : null}
      {settings.status === 'ready' && !settings.writable ? <p role="alert">当前图片读取设置为只读；当前配置的修改不能保存。</p> : null}
      {catalogStatus === 'error' ? <p role="alert">系统模型目录读取失败：{catalogError} 请点击“刷新系统模型”重试。OpenAI 兼容配置仍可编辑。</p> : null}
      {modelCatalog?.failures.map(failure => (
        <p role="status" key={failure.provider}>
          无法读取 {failure.provider} 的系统模型目录。{imageReaderSettingsErrorMessage(undefined)} 请点击“刷新系统模型”重试；其他已加载 Provider 仍可选择。
        </p>
      ))}

      <div className="harness-comfyui-image-reader-profile-bar">
        <label>
          <span>{IMAGE_READER_SETTINGS_COPY.activeSelectorLabel}</span>
          <select
            value={persistedConfiguration.activeProfileId}
            onChange={event => selectProfile(event.target.value)}
            disabled={mutationControlsDisabled}
          >
            {persistedConfiguration.profiles.map(profile => (
              <option key={profile.id} value={profile.id}>{profile.name}</option>
            ))}
          </select>
          <small>{IMAGE_READER_SETTINGS_COPY.activeSelectorHelp}</small>
        </label>
        <p role="status">{editorStateMessage}</p>
        {pendingOperation === 'activate' && switchTarget !== null ? (
          <p role="status">{IMAGE_READER_SETTINGS_COPY.activating(switchTarget.name, actualProfile.name)}</p>
        ) : null}
        <div className="harness-comfyui-image-reader-profile-actions">
          <button type="button" onClick={addProfile} disabled={mutationControlsDisabled || dirty || persistedConfiguration.profiles.length >= IMAGE_READER_MAX_PROFILES}>新建配置</button>
          <button type="button" onClick={duplicateProfile} disabled={mutationControlsDisabled || dirty || persistedConfiguration.profiles.length >= IMAGE_READER_MAX_PROFILES}>复制配置</button>
          <button
            type="button"
            onClick={requestDelete}
            disabled={mutationControlsDisabled || (draftOrigin === 'persisted' && persistedConfiguration.profiles.length === 1)}
          >删除配置</button>
        </div>
        <small>复制配置会复制连接参数、模型、提示词和采样参数，但不会复制 API Key。</small>
        {renderFieldError('profile')}
      </div>

      {switchIntent === null || switchTarget === null || !dirty ? null : (
        <div role="alert" className="harness-comfyui-image-reader-switch-gate">
          <p>{IMAGE_READER_SETTINGS_COPY.switchGate(editorDraft.name)}</p>
          <button type="button" onClick={() => void save()} disabled={mutationControlsDisabled}>
            {IMAGE_READER_SETTINGS_COPY.saveAndSwitch(editorDraft.name, switchTarget.name)}
          </button>
          <button type="button" onClick={discardAndSwitch} disabled={mutationControlsDisabled}>
            {IMAGE_READER_SETTINGS_COPY.discardAndSwitch(editorDraft.name, switchTarget.name)}
          </button>
          <button type="button" onClick={() => setPendingIntent(null)} disabled={mutationControlsDisabled}>
            {IMAGE_READER_SETTINGS_COPY.continueEditing(editorDraft.name)}
          </button>
        </div>
      )}

      {pendingIntent?.kind !== 'delete' || !dirty ? null : (
        <div role="alert" className="harness-comfyui-image-reader-switch-gate">
          <p>{IMAGE_READER_SETTINGS_COPY.deleteGate(editorDraft.name)}</p>
          <button type="button" onClick={discardAndDelete} disabled={mutationControlsDisabled}>
            {IMAGE_READER_SETTINGS_COPY.discardAndDelete(editorDraft.name)}
          </button>
          <button type="button" onClick={() => setPendingIntent(null)} disabled={mutationControlsDisabled}>
            {IMAGE_READER_SETTINGS_COPY.continueEditing(editorDraft.name)}
          </button>
        </div>
      )}

      <div className="harness-comfyui-image-reader-form">
        <label className="harness-comfyui-image-reader-wide-field">
          <span>配置名称</span>
          <input
            type="text"
            maxLength={IMAGE_READER_PROFILE_NAME_MAX_LENGTH}
            value={editorDraft.name}
            onChange={event => updateEditorDraft(profile => ({ ...profile, name: event.target.value }))}
            disabled={mutationControlsDisabled}
          />
          {renderFieldError('name')}
        </label>

        <fieldset className="harness-comfyui-image-reader-connection">
          <legend>连接方式</legend>
          <label>
            <input
              type="radio"
              name="image-reader-connection"
              checked={editorDraft.connectionType === 'runtime'}
              disabled={mutationControlsDisabled}
              onChange={() => {
                updateEditorDraft(profile => ({
                  ...profile,
                  connectionType: 'runtime',
                  endpoint: '',
                  hasApiKey: false,
                  model: '',
                }))
                setCredentialAction(Object.freeze({ action: 'clear' }))
              }}
            />
            <span><strong>系统 Provider</strong><small>从当前 Harness LLM 运行时选择明确支持图片输入的模型。</small></span>
          </label>
          <label>
            <input
              type="radio"
              name="image-reader-connection"
              checked={editorDraft.connectionType === 'openai-compatible'}
              disabled={mutationControlsDisabled}
              onChange={() => {
                updateEditorDraft(profile => ({
                  ...profile,
                  connectionType: 'openai-compatible',
                  provider: '',
                  model: '',
                }))
                setCredentialAction(Object.freeze({ action: 'clear' }))
              }}
            />
            <span><strong>OpenAI 兼容接口</strong><small>向自定义 Chat Completions 地址发送单张本地图片和读图提示词。</small></span>
          </label>
        </fieldset>

        {editorDraft.connectionType === 'runtime' ? (
          <>
            <label>
              <span>系统 Provider</span>
              <select
                value={editorDraft.provider}
                onChange={event => updateEditorDraft(profile => ({ ...profile, provider: event.target.value, model: '' }))}
                disabled={mutationControlsDisabled || catalogStatus !== 'ready'}
              >
                <option value="">请选择系统 Provider</option>
                {modelCatalog?.groups.map(group => <option key={group.provider} value={group.provider}>{group.name}</option>)}
              </select>
              {renderFieldError('provider')}
            </label>

            <label>
              <span>视觉模型</span>
              <select
                value={editorDraft.model}
                onChange={event => updateEditorDraft(profile => ({ ...profile, model: event.target.value }))}
                disabled={mutationControlsDisabled || editorDraft.provider.length === 0 || (availableModels.length === 0 && !currentModelIsMissing)}
              >
                <option value="">请选择明确支持图片输入的模型</option>
                {currentModelIsMissing ? <option value={editorDraft.model}>{editorDraft.model}（当前目录中不可用）</option> : null}
                {availableModels.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
              </select>
              {renderFieldError('model')}
            </label>
          </>
        ) : (
          <>
            <label className="harness-comfyui-image-reader-wide-field">
              <span>Chat Completions 地址</span>
              <input
                type="url"
                maxLength={IMAGE_READER_ENDPOINT_MAX_LENGTH}
                placeholder="http://127.0.0.1:11434/v1/chat/completions"
                value={editorDraft.endpoint}
                onChange={event => updateEditorDraft(profile => ({ ...profile, endpoint: event.target.value }))}
                disabled={mutationControlsDisabled}
              />
              <small>填写接受 POST 请求的完整地址；Harness 不会自动追加 /v1/chat/completions。</small>
              {endpointTransportMessage(editorDraft.endpoint) === null ? null : (
                <small role="status">{endpointTransportMessage(editorDraft.endpoint)}</small>
              )}
              {renderFieldError('endpoint')}
            </label>

            <label>
              <span>模型 ID</span>
              <input
                type="text"
                maxLength={IMAGE_READER_MODEL_MAX_LENGTH}
                placeholder="请输入接口接受的精确模型 ID"
                value={editorDraft.model}
                onChange={event => updateEditorDraft(profile => ({ ...profile, model: event.target.value }))}
                disabled={mutationControlsDisabled}
              />
              {renderFieldError('model')}
            </label>

            <label>
              <span>API Key（可选）</span>
              <input
                type="password"
                autoComplete="new-password"
                placeholder={editorDraft.hasApiKey ? '已保存；输入新值可以替换' : '本地免鉴权接口可以留空'}
                value={credentialDraft}
                disabled={mutationControlsDisabled}
                onChange={event => updateCredential(event.target.value.length > 0
                  ? { action: 'replace', apiKey: event.target.value }
                  : editorDraft.hasApiKey
                    ? { action: 'keep' }
                    : { action: 'clear' })}
              />
              <small>{credentialState}</small>
              {renderFieldError('credential')}
              {editorDraft.hasApiKey && credentialAction.action !== 'clear' ? (
                <button type="button" className="harness-comfyui-image-reader-inline-action" disabled={mutationControlsDisabled} onClick={() => updateCredential({ action: 'clear' })}>清除已保存的 API Key</button>
              ) : null}
              {editorDraft.hasApiKey && credentialAction.action === 'clear' ? (
                <button type="button" className="harness-comfyui-image-reader-inline-action" disabled={mutationControlsDisabled} onClick={() => updateCredential({ action: 'keep' })}>保留已保存的 API Key</button>
              ) : null}
            </label>
          </>
        )}

        <label className="harness-comfyui-image-reader-wide-field">
          <span>读图提示词</span>
          <textarea
            rows={18}
            maxLength={IMAGE_READER_PROMPT_MAX_LENGTH}
            value={editorDraft.defaultPrompt}
            onChange={event => updateEditorDraft(profile => ({ ...profile, defaultPrompt: event.target.value }))}
            disabled={mutationControlsDisabled}
          />
          <small>inspect_image 或受管 CLI 省略 prompt 时使用该默认提示词；任一调用提供 prompt 时只覆盖本次调用。</small>
          {renderFieldError('defaultPrompt')}
        </label>

        <label>
          <span>温度</span>
          <input
            type="number"
            min={IMAGE_READER_TEMPERATURE_MIN}
            max={IMAGE_READER_TEMPERATURE_MAX}
            step={0.05}
            value={editorDraft.temperature}
            disabled={mutationControlsDisabled}
            onChange={event => updateEditorDraft(profile => ({
              ...profile,
              temperature: event.target.value === '' ? Number.NaN : Number(event.target.value),
            }))}
          />
          {renderFieldError('temperature')}
        </label>

        <label>
          <span>最大输出 Token 数</span>
          <input
            type="number"
            min={IMAGE_READER_MAX_TOKENS_MIN}
            max={IMAGE_READER_MAX_TOKENS_MAX}
            step={1}
            value={editorDraft.maxTokens}
            disabled={mutationControlsDisabled}
            onChange={event => updateEditorDraft(profile => ({
              ...profile,
              maxTokens: event.target.value === '' ? Number.NaN : Number(event.target.value),
            }))}
          />
          {renderFieldError('maxTokens')}
        </label>
      </div>

      <footer className="harness-comfyui-image-reader-actions">
        <button type="button" onClick={() => void save()} disabled={mutationControlsDisabled}>
          {pendingOperation === 'save' ? '正在保存…' : saveButtonLabel}
        </button>
        {dirty && switchIntent === null && pendingIntent?.kind !== 'delete' ? (
          <button type="button" onClick={discardDraft} disabled={controlsDisabled}>
            {draftOrigin === 'persisted'
              ? IMAGE_READER_SETTINGS_COPY.discardPersisted(editorDraft.name)
              : IMAGE_READER_SETTINGS_COPY.discardUnsaved(editorDraft.name)}
          </button>
        ) : null}
        {operationStatus === 'saved' && successMessage !== null ? <span role="status">{successMessage}</span> : null}
        {operationStatus === 'error' ? (
          <span role="alert">{`${failedOperation === 'delete' ? '删除失败' : failedOperation === 'activate' ? '切换失败' : '保存失败'}：${operationError}`}</span>
        ) : null}
      </footer>
    </section>
  )
}

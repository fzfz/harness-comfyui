import {
  decodeImageReaderConfiguration,
  validateImageReaderConfiguration,
  type ImageReaderConfiguration,
} from './settings.ts'

export const IMAGE_READER_REMOTE_NAMESPACE = 'harnessComfyuiImageReader'
export const IMAGE_READER_REMOTE_SERVICE = `remote.${IMAGE_READER_REMOTE_NAMESPACE}`

export interface ImageReaderModelOption {
  readonly id: string
  readonly name: string
  readonly description: string | null
}

export interface ImageReaderProviderGroup {
  readonly provider: string
  readonly name: string
  readonly models: readonly ImageReaderModelOption[]
}

export interface ImageReaderModelCatalogFailure {
  readonly provider: string
  readonly message: string
}

export interface ImageReaderModelCatalog {
  readonly groups: readonly ImageReaderProviderGroup[]
  readonly failures: readonly ImageReaderModelCatalogFailure[]
}

export interface ImageReaderCredentialUpdate {
  readonly profileId: string
  readonly apiKey: string | null
}

export interface SaveImageReaderSettingsRequest {
  readonly configuration: ImageReaderConfiguration
  readonly credentialUpdates: readonly ImageReaderCredentialUpdate[]
}

export interface SaveImageReaderSettingsResult {
  readonly configuration: ImageReaderConfiguration
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`)
  return value as Record<string, unknown>
}

function exactKeys(source: Record<string, unknown>, expected: readonly string[], label: string): void {
  const keys = Object.keys(source).sort()
  const wanted = [...expected].sort()
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} has invalid properties`)
  }
}

function text(value: unknown, label: string, nullable = false): string | null {
  if (nullable && value === null) return null
  if (typeof value !== 'string' || value.length === 0 || value.length > 10_000) throw new TypeError(`${label} is invalid`)
  return value
}

function model(value: unknown): ImageReaderModelOption {
  const source = record(value, 'Image reader model')
  exactKeys(source, ['id', 'name', 'description'], 'Image reader model')
  return Object.freeze({
    id: text(source.id, 'Image reader model id')!,
    name: text(source.name, 'Image reader model name')!,
    description: text(source.description, 'Image reader model description', true),
  })
}

function group(value: unknown): ImageReaderProviderGroup {
  const source = record(value, 'Image reader provider group')
  exactKeys(source, ['provider', 'name', 'models'], 'Image reader provider group')
  if (!Array.isArray(source.models)) throw new TypeError('Image reader provider models are invalid')
  return Object.freeze({
    provider: text(source.provider, 'Image reader provider id')!,
    name: text(source.name, 'Image reader provider name')!,
    models: Object.freeze(source.models.map(model)),
  })
}

function failure(value: unknown): ImageReaderModelCatalogFailure {
  const source = record(value, 'Image reader model catalog failure')
  exactKeys(source, ['provider', 'message'], 'Image reader model catalog failure')
  return Object.freeze({
    provider: text(source.provider, 'Image reader failed provider id')!,
    message: text(source.message, 'Image reader model catalog failure message')!,
  })
}

export function parseImageReaderModelCatalog(value: unknown): ImageReaderModelCatalog {
  const source = record(value, 'Image reader model catalog')
  exactKeys(source, ['groups', 'failures'], 'Image reader model catalog')
  if (!Array.isArray(source.groups) || !Array.isArray(source.failures)) throw new TypeError('Image reader model catalog collections are invalid')
  return Object.freeze({
    groups: Object.freeze(source.groups.map(group)),
    failures: Object.freeze(source.failures.map(failure)),
  })
}

function credentialUpdate(value: unknown): ImageReaderCredentialUpdate {
  const source = record(value, 'Image reader credential update')
  exactKeys(source, ['profileId', 'apiKey'], 'Image reader credential update')
  const profileId = text(source.profileId, 'Image reader credential profile id')!
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(profileId)) throw new TypeError('Image reader credential profile id is invalid')
  if (source.apiKey !== null && (typeof source.apiKey !== 'string' || source.apiKey.length < 1 || source.apiKey.length > 8192)) {
    throw new TypeError('Image reader credential API key is invalid')
  }
  return Object.freeze({ profileId, apiKey: source.apiKey })
}

export function parseSaveImageReaderSettingsRequest(value: unknown): SaveImageReaderSettingsRequest {
  const source = record(value, 'Image reader settings request')
  exactKeys(source, ['configuration', 'credentialUpdates'], 'Image reader settings request')
  const configuration = decodeImageReaderConfiguration(source.configuration)
  if (configuration === undefined) throw new TypeError('Image reader configuration is invalid')
  validateImageReaderConfiguration(configuration)
  if (!Array.isArray(source.credentialUpdates)) throw new TypeError('Image reader credential updates are invalid')
  const credentialUpdates = source.credentialUpdates.map(credentialUpdate)
  if (new Set(credentialUpdates.map(update => update.profileId)).size !== credentialUpdates.length) {
    throw new TypeError('Image reader credential updates contain duplicate profile ids')
  }
  return Object.freeze({ configuration, credentialUpdates: Object.freeze(credentialUpdates) })
}

export function parseSaveImageReaderSettingsResult(value: unknown): SaveImageReaderSettingsResult {
  const source = record(value, 'Image reader settings result')
  exactKeys(source, ['configuration'], 'Image reader settings result')
  const configuration = decodeImageReaderConfiguration(source.configuration)
  if (configuration === undefined) throw new TypeError('Image reader saved configuration is invalid')
  return Object.freeze({ configuration })
}

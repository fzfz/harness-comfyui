import type {} from '@deepseek-ai/dsh-typert-protocol'
import type errorCatalog from '../../config/error-catalog.json'

import {
  decodeImageReaderConfiguration,
  type ImageReaderConfiguration,
} from './settings.ts'

export type ImageReaderErrorCode = Extract<keyof typeof errorCatalog, `IMAGE_READER_${string}`>

type ImageReaderRemoteErrorDetails = {
  readonly [Code in ImageReaderErrorCode]: Readonly<Record<string, never>>
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap extends ImageReaderRemoteErrorDetails {}
}

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

export function parseImageReaderCurrentConfiguration(value: unknown): ImageReaderConfiguration {
  const configuration = decodeImageReaderConfiguration(value)
  if (configuration === undefined) throw new TypeError('The ImageReader Host returned an invalid configuration. Check the ImageReader plugin configuration and reopen Settings.')
  return configuration
}

export type ImageReaderCredentialAction =
  | { readonly action: 'keep' }
  | { readonly action: 'replace'; readonly apiKey: string }
  | { readonly action: 'clear' }

export type SaveImageReaderProfileOperation = 'create' | 'update'

export interface EditableImageReaderProfileBase {
  readonly id: string
  readonly name: string
  readonly model: string
  readonly defaultPrompt: string
  readonly temperature: number
  readonly maxTokens: number
}

export type EditableImageReaderProfile =
  | EditableImageReaderProfileBase & {
      readonly connectionType: 'runtime'
      readonly provider: string
    }
  | EditableImageReaderProfileBase & {
      readonly connectionType: 'openai-compatible'
      readonly endpoint: string
    }

export type SaveImageReaderProfileRequest =
  | {
      readonly operation: SaveImageReaderProfileOperation
      readonly activateProfileId: string
      readonly profile: Extract<EditableImageReaderProfile, { readonly connectionType: 'runtime' }>
    }
  | {
      readonly operation: SaveImageReaderProfileOperation
      readonly activateProfileId: string
      readonly profile: Extract<EditableImageReaderProfile, { readonly connectionType: 'openai-compatible' }>
      readonly credential: ImageReaderCredentialAction
    }

export interface SaveImageReaderProfileResult {
  readonly configuration: ImageReaderConfiguration
}

export interface ActivateImageReaderProfileRequest {
  readonly profileId: string
}

export interface ActivateImageReaderProfileResult {
  readonly configuration: ImageReaderConfiguration
}

export interface DeleteImageReaderProfileRequest {
  readonly profileId: string
}

export interface DeleteImageReaderProfileResult {
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

function primitiveString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`)
  return value
}

function primitiveNumber(value: unknown, label: string): number {
  if (typeof value !== 'number') throw new TypeError(`${label} must be a number`)
  return value
}

function editableProfile(value: unknown): EditableImageReaderProfile {
  const source = record(value, 'Editable image reader profile')
  const connection = primitiveString(source.connectionType, 'Image reader connection type')
  const common = {
    id: primitiveString(source.id, 'Image reader profile id'),
    name: primitiveString(source.name, 'Image reader profile name'),
    model: primitiveString(source.model, 'Image reader model'),
    defaultPrompt: primitiveString(source.defaultPrompt, 'Image reader default prompt'),
    temperature: primitiveNumber(source.temperature, 'Image reader temperature'),
    maxTokens: primitiveNumber(source.maxTokens, 'Image reader maximum output tokens'),
  }
  if (connection === 'runtime') {
    exactKeys(source, ['id', 'name', 'connectionType', 'provider', 'model', 'defaultPrompt', 'temperature', 'maxTokens'], 'Runtime image reader profile')
    return Object.freeze({
      ...common,
      connectionType: 'runtime',
      provider: primitiveString(source.provider, 'Image reader runtime provider'),
    })
  }
  if (connection === 'openai-compatible') {
    exactKeys(source, ['id', 'name', 'connectionType', 'endpoint', 'model', 'defaultPrompt', 'temperature', 'maxTokens'], 'OpenAI-compatible image reader profile')
    return Object.freeze({
      ...common,
      connectionType: 'openai-compatible',
      endpoint: primitiveString(source.endpoint, 'Image reader endpoint'),
    })
  }
  throw new TypeError('Image reader connection type is invalid')
}

function credentialAction(value: unknown): ImageReaderCredentialAction {
  const source = record(value, 'Image reader credential action')
  const action = primitiveString(source.action, 'Image reader credential action')
  if (action === 'keep' || action === 'clear') {
    exactKeys(source, ['action'], 'Image reader credential action')
    return Object.freeze({ action })
  }
  if (action === 'replace') {
    exactKeys(source, ['action', 'apiKey'], 'Image reader credential action')
    return Object.freeze({ action, apiKey: primitiveString(source.apiKey, 'Image reader API key') })
  }
  throw new TypeError('Image reader credential action is invalid')
}

function saveOperation(value: unknown): SaveImageReaderProfileOperation {
  if (value === 'create' || value === 'update') return value
  throw new TypeError('Image reader profile save operation is invalid')
}

export function parseSaveImageReaderProfileRequest(value: unknown): SaveImageReaderProfileRequest {
  const source = record(value, 'Image reader profile save request')
  const profile = editableProfile(source.profile)
  const operation = saveOperation(source.operation)
  const activateProfileId = primitiveString(source.activateProfileId, 'Image reader active profile id')
  if (profile.connectionType === 'runtime') {
    exactKeys(source, ['operation', 'activateProfileId', 'profile'], 'Runtime image reader profile save request')
    return Object.freeze({ operation, activateProfileId, profile })
  }
  exactKeys(source, ['operation', 'activateProfileId', 'profile', 'credential'], 'OpenAI-compatible image reader profile save request')
  return Object.freeze({ operation, activateProfileId, profile, credential: credentialAction(source.credential) })
}

function parseConfigurationResult(value: unknown, label: string): ImageReaderConfiguration {
  const source = record(value, label)
  exactKeys(source, ['configuration'], label)
  const configuration = decodeImageReaderConfiguration(source.configuration)
  if (configuration === undefined) throw new TypeError('Image reader saved configuration is invalid')
  return configuration
}

export function parseSaveImageReaderProfileResult(value: unknown): SaveImageReaderProfileResult {
  return Object.freeze({ configuration: parseConfigurationResult(value, 'Image reader profile save result') })
}

export function parseActivateImageReaderProfileRequest(value: unknown): ActivateImageReaderProfileRequest {
  const source = record(value, 'Image reader profile activation request')
  exactKeys(source, ['profileId'], 'Image reader profile activation request')
  return Object.freeze({ profileId: primitiveString(source.profileId, 'Image reader profile id') })
}

export function parseActivateImageReaderProfileResult(value: unknown): ActivateImageReaderProfileResult {
  return Object.freeze({ configuration: parseConfigurationResult(value, 'Image reader profile activation result') })
}

export function parseDeleteImageReaderProfileRequest(value: unknown): DeleteImageReaderProfileRequest {
  const source = record(value, 'Image reader profile delete request')
  exactKeys(source, ['profileId'], 'Image reader profile delete request')
  return Object.freeze({ profileId: primitiveString(source.profileId, 'Image reader profile id') })
}

export function parseDeleteImageReaderProfileResult(value: unknown): DeleteImageReaderProfileResult {
  return Object.freeze({ configuration: parseConfigurationResult(value, 'Image reader profile delete result') })
}

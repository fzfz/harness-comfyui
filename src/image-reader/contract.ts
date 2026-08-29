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

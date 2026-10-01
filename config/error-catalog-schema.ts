import input from './error-catalog.json' with { type: 'json' }

export interface ErrorCatalogEntry {
  readonly code: string
  readonly title: string
  readonly reason: string
  readonly next_step: string
  readonly cancellable: boolean
  readonly confirm_repeat: boolean
  readonly diagnostic_template?: string
  readonly message_limit?: number
  readonly output_limit?: number
}

export function parseErrorCatalog(value: unknown): Readonly<Record<string, ErrorCatalogEntry>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Error catalog: provide an object keyed by error code.')
  }
  for (const [code, item] of Object.entries(value)) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new TypeError(`Error catalog ${code}: provide an error entry object.`)
    }
    const entry = item as Record<string, unknown>
    for (const field of ['code', 'title', 'reason', 'next_step']) {
      if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
        throw new TypeError(`Error catalog ${code}.${field}: provide nonempty text.`)
      }
    }
    if (entry.code !== code) throw new TypeError(`Error catalog ${code}.code: set this field to the outer object key ${code}.`)
    for (const field of ['cancellable', 'confirm_repeat']) {
      if (typeof entry[field] !== 'boolean') throw new TypeError(`Error catalog ${code}.${field}: provide a boolean.`)
    }
    if (entry.diagnostic_template !== undefined && (typeof entry.diagnostic_template !== 'string' || entry.diagnostic_template.trim() === '')) {
      throw new TypeError(`Error catalog ${code}.diagnostic_template: provide nonempty text.`)
    }
    for (const field of ['message_limit', 'output_limit']) {
      if (entry[field] !== undefined && (!Number.isSafeInteger(entry[field]) || Number(entry[field]) < 1)) {
        throw new TypeError(`Error catalog ${code}.${field}: provide a positive integer.`)
      }
    }
    const tokens = code === 'CATALOG_QUERY_FAILED'
      ? ['{url}', '{port}', '{exitCode}', '{diagnostic}']
      : code === 'COMFYUI_CONNECTION_FAILED' ? ['{origin}', '{path}', '{diagnostic}'] : []
    if (tokens.some(token => typeof entry.diagnostic_template !== 'string' || !entry.diagnostic_template.includes(token))) {
      throw new TypeError(`Error catalog ${code}.diagnostic_template: include ${tokens.join(', ')}.`)
    }
    const requiredLimit = code === 'CATALOG_QUERY_FAILED' ? 'message_limit'
      : code === 'CATALOG_RESPONSE_TOO_LARGE' ? 'output_limit' : null
    if (requiredLimit !== null && entry[requiredLimit] === undefined) {
      throw new TypeError(`Error catalog ${code}.${requiredLimit}: provide the configured positive integer limit.`)
    }
  }
  return value as Readonly<Record<string, ErrorCatalogEntry>>
}

export const ERROR_CATALOG = Object.freeze(parseErrorCatalog(input)) as typeof input

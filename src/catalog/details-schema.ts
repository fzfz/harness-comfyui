import { CATALOG_PRESENTATION as presentation } from './presentation-schema.ts'
import { catalogDefinition, parseCatalogStableId, parseCatalogOperationResult, type CatalogKind } from './contract.ts'

export interface CatalogDetailsRequest { readonly kind: CatalogKind; readonly id: string }
export type CatalogDetailValue = string | number | readonly (string | number)[] | null
export interface CatalogDetailField { readonly key: string; readonly value: CatalogDetailValue }
export type CatalogDetails = { [K in CatalogKind]: { readonly kind: K; readonly id: string; readonly fields: readonly CatalogDetailField[] } }[CatalogKind]
export const CATALOG_PRESENTATION = presentation
export const CATALOG_FIELDS = presentation.fields

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Catalog details request, response or field: provide an object.')
  return value as Record<string, unknown>
}
export function parseCatalogDetailsRequest(value: unknown): CatalogDetailsRequest {
  const input = object(value)
  if (Object.keys(input).length !== 2 || typeof input.kind !== 'string') throw new TypeError('Catalog details request: provide exactly kind and id; kind must be a supported category string.')
  if (!catalogDefinition(input.kind as CatalogKind)) throw new TypeError('Catalog details request kind: use model, lora, work, character, style, prompt-term, artist-string or comfyui-template.')
  return { kind: input.kind as CatalogKind, id: parseCatalogStableId(input.id) }
}
function fieldValue(key: string, value: unknown): CatalogDetailValue {
  if (value === null && key !== 'id') return null
  const type = CATALOG_FIELDS[key]!.type
  if (type === 'id') return parseCatalogStableId(value)
  if (type === 'text' && typeof value === 'string') return value
  if (type === 'number' && typeof value === 'number' && Number.isFinite(value)) return value
  if (type === 'list' && Array.isArray(value) && value.every(item => typeof item === 'string' || (typeof item === 'number' && Number.isFinite(item)))) return [...value]
  throw new TypeError(`Catalog details field ${key}: provide a ${type} value or null for an empty field.`)
}
export function parseCatalogDetails(value: unknown): CatalogDetails {
  const input = object(value)
  if (Object.keys(input).length !== 3) throw new TypeError('Catalog details response: provide exactly kind, id and fields.')
  const identity = parseCatalogDetailsRequest({ kind: input.kind, id: input.id })
  const keys = presentation.kinds[identity.kind].details
  if (!Array.isArray(input.fields) || input.fields.length !== keys.length) throw new TypeError('Catalog details response fields: provide every field of the requested category in its configured order.')
  const fields = input.fields.map((raw, index) => {
    const field = object(raw)
    if (Object.keys(field).length !== 2 || field.key !== keys[index]) throw new TypeError('Catalog details field: provide exactly key and value, using the configured field key and order.')
    return { key: keys[index]!, value: fieldValue(keys[index]!, field.value) }
  })
  if (fields[0]!.value !== identity.id) throw new TypeError('Catalog details response: return the requested id in the first field as well as the top-level id.')
  return { ...identity, fields }
}
export function parseCatalogDetailsResult(value: unknown) {
  return parseCatalogOperationResult(value, parseCatalogDetails, 'catalog details result')
}

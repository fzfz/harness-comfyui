import input from './presentation.json' with { type: 'json' }
type CatalogKind = keyof typeof input.kinds

export interface CatalogFieldDefinition { readonly label: string; readonly type: 'id' | 'text' | 'number' | 'list' }
export interface CatalogPresentation {
  readonly pageSize: number
  readonly copy: { readonly details: string; readonly returnToList: string; readonly returnToDetails: string; readonly retry: string; readonly emptyValue: string }
  readonly fields: Readonly<Record<string, CatalogFieldDefinition>>
  readonly kinds: Readonly<Record<CatalogKind, { readonly details: readonly string[]; readonly summary: readonly string[]; readonly prompt_fields: readonly string[]; readonly multiple: boolean }>>
  readonly resourceDetails: readonly string[]
  readonly resourceSources: Readonly<Partial<Record<CatalogKind, Readonly<Record<string, string>>>>>
  readonly templateTypes: Readonly<Record<string, string>>
}
function object(value: unknown, keys: readonly string[] | null, subject: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${subject}: provide an object.`)
  const result = value as Record<string, unknown>
  if (keys && (Object.keys(result).length !== keys.length || keys.some(key => !Object.hasOwn(result, key)))) throw new TypeError(`${subject}: provide exactly these properties: ${keys.join(', ')}.`)
  return result
}
function text(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError('Catalog presentation label: provide a nonempty string.')
  return value
}
export function parseCatalogPresentation(value: unknown): CatalogPresentation {
  const root = object(value, ['pageSize', 'copy', 'fields', 'kinds', 'resourceDetails', 'resourceSources', 'templateTypes'], 'Catalog presentation')
  if (!Number.isInteger(root.pageSize) || Number(root.pageSize) < 2 || Number(root.pageSize) > 100 || Number(root.pageSize) % 2 !== 0) throw new TypeError('Catalog presentation pageSize: use an even integer between 2 and 100.')
  const copy = object(root.copy, ['details', 'returnToList', 'returnToDetails', 'retry', 'emptyValue'], 'Catalog presentation copy')
  const fields = Object.fromEntries(Object.entries(object(root.fields, null, 'Catalog presentation fields')).map(([key, value]) => {
    const field = object(value, ['label', 'type'], `Catalog presentation field ${key}`)
    if (typeof field.type !== 'string' || !['id', 'text', 'number', 'list'].includes(field.type)) throw new TypeError(`Catalog presentation field ${key}: use type id, text, number or list.`)
    return [key, { label: text(field.label), type: field.type as CatalogFieldDefinition['type'] }]
  }))
  const kinds = object(root.kinds, ['model', 'lora', 'work', 'character', 'style', 'prompt-term', 'artist-string', 'comfyui-template'], 'Catalog presentation kinds')
  const parsedKinds = Object.fromEntries(Object.entries(kinds).map(([kind, value]) => {
    const lists = object(value, ['details', 'summary', 'prompt_fields', 'multiple'], `Catalog presentation kind ${kind}`)
    if (typeof lists.multiple !== 'boolean') throw new TypeError(`Catalog presentation ${kind}.multiple: provide a boolean.`)
    for (const name of ['details', 'summary', 'prompt_fields']) {
      const keys = lists[name]
      if (!Array.isArray(keys) || keys.some(key => typeof key !== 'string' || !Object.hasOwn(fields, key)) || new Set(keys).size !== keys.length) throw new TypeError(`Catalog presentation ${kind}.${name}: reference distinct keys from fields.`)
    }
    const details = lists.details as string[]
    const summary = lists.summary as string[]
    if (details[0] !== 'id' || summary.some(key => !details.includes(key)) || fields.id?.type !== 'id') throw new TypeError(`Catalog presentation ${kind}: start details with the id field of type id and select summary fields from details.`)
    return [kind, { details, summary, prompt_fields: lists.prompt_fields as string[], multiple: lists.multiple }]
  })) as unknown as CatalogPresentation['kinds']
  const resourceDetails = root.resourceDetails
  if (!Array.isArray(resourceDetails) || resourceDetails.some(key => typeof key !== 'string' || !Object.hasOwn(fields, key)) || new Set(resourceDetails).size !== resourceDetails.length) throw new TypeError('Catalog resourceDetails: reference distinct keys from fields.')
  const resourceSources = Object.fromEntries(Object.entries(object(root.resourceSources, null, 'Catalog resource sources')).map(([kind, value]) => {
    if (!Object.hasOwn(parsedKinds, kind)) throw new TypeError('Catalog resource sources: use a configured resource kind.')
    const mapping = object(value, null, `Catalog ${kind} resource sources`)
    for (const [key, source] of Object.entries(mapping)) {
      if (!resourceDetails.includes(key) || typeof source !== 'string' || !parsedKinds[kind as CatalogKind].details.includes(source)) throw new TypeError('Catalog resource sources: map a resource field to a detail field of its configured kind.')
    }
    return [kind, mapping]
  })) as CatalogPresentation['resourceSources']
  const templateTypes = Object.fromEntries(Object.entries(object(root.templateTypes, null, 'Catalog template types')).map(([key, value]) => [key, text(value)]))
  return { pageSize: Number(root.pageSize), fields, kinds: parsedKinds, resourceDetails, resourceSources, templateTypes, copy: {
    details: text(copy.details), returnToList: text(copy.returnToList), returnToDetails: text(copy.returnToDetails), retry: text(copy.retry), emptyValue: text(copy.emptyValue),
  } }
}
export const CATALOG_PRESENTATION = parseCatalogPresentation(input)

import Schema from '@deepseek-ai/schemastery'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | { readonly [key: string]: JsonValue } | readonly JsonValue[]

export const JSON_VALUE_ROLE = 'json-value'
export const JSON_OBJECT_ROLE = 'json-object'
export const JSON_ARRAY_ROLE = 'json-array'

export interface JsonContract {
  readonly keySchema: Schema<string>
  readonly maxDepth?: number
}

export function parseJsonValue(value: unknown, contract: JsonContract, label: string, depth = 0): JsonValue {
  if (contract.maxDepth !== undefined && depth > contract.maxDepth) throw new TypeError(`${label} exceeds the maximum JSON depth`)
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${label} contains an invalid number`)
    return value
  }
  if (Array.isArray(value)) return Object.freeze(Array.from(value, (item, index) => parseJsonValue(item, contract, `${label}[${index}]`, depth + 1)))
  if (typeof value !== 'object') throw new TypeError(`${label} must be an object`)
  const entries = Object.entries(value).map(([key, item]) => {
    try { Schema.resolve(key, contract.keySchema, {}) }
    catch { throw new TypeError(`${label} key is invalid`) }
    return [key, parseJsonValue(item, contract, `${label}.${key}`, depth + 1)] as const
  })
  return Object.freeze(Object.fromEntries(entries))
}

export function jsonValueSchema(contract: JsonContract) {
  return Schema.transform(Schema.any<JsonValue>(), value => parseJsonValue(value, contract, 'JSON value'), true).role(JSON_VALUE_ROLE, contract)
}

export function jsonObjectSchema(contract: JsonContract) {
  return Schema.transform(Schema.any<unknown>().required(), value => {
    const parsed = parseJsonValue(value, contract, 'JSON object')
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('JSON value must be an object')
    return parsed as Readonly<Record<string, JsonValue>>
  }, true).required().role(JSON_OBJECT_ROLE, contract)
}

export function jsonArraySchema(contract: JsonContract) {
  return Schema.transform(Schema.any<unknown>(), value => {
    const parsed = parseJsonValue(value, contract, 'JSON array')
    if (!Array.isArray(parsed)) throw new TypeError('JSON value must be an array')
    return parsed as readonly JsonValue[]
  }, true).role(JSON_ARRAY_ROLE, contract)
}

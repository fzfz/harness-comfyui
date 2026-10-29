import Schema from '@deepseek-ai/schemastery'
import { JSON_VALUE_ROLE } from './json-contract.ts'

const REQUIRED_NULLABLE = 'required-nullable'
const CONTRACT_OBJECT = 'contract-object'

export function fieldIsRequired(field: Schema): boolean {
  return field.meta.required === true || field.meta.role === REQUIRED_NULLABLE
}

export function contractFields(schema: Schema): Readonly<Record<string, Schema>> | undefined {
  if (schema.type === 'object' || schema.meta.role === CONTRACT_OBJECT) return schema.dict
  return schema.type === 'transform' ? contractFields(schema.inner!) : undefined
}

export function requiredNullable<T>(inner: Schema<any, T>) {
  return Schema.union([inner, Schema.const(null)]).role(REQUIRED_NULLABLE)
}

function acceptsNull(field: Schema): boolean {
  return field.meta.role === REQUIRED_NULLABLE
    || field.meta.role === JSON_VALUE_ROLE
    || (field.type === 'const' && field.value === null)
    || (field.type === 'union' && field.list!.some(acceptsNull))
}

export function contractObject<const Fields extends Record<string, Schema>>(fields: Fields, options: { readonly exact?: boolean } = {}) {
  const object = Schema.object(fields).required()
  const result = Schema.transform(Schema.any<unknown>().required(), value => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError('Expected an object')
    }
    const source = value as Record<string, unknown>
    if (options.exact) {
      for (const key of Object.keys(source)) {
        if (!Object.hasOwn(fields, key)) throw new TypeError(`Property ${key} is not defined`)
        if (source[key] === undefined) throw new TypeError(`Property ${key} must have a value`)
      }
    }
    for (const [key, field] of Object.entries(fields)) {
      if (fieldIsRequired(field) && (!Object.hasOwn(source, key) || source[key] === undefined)) {
        throw new TypeError(`Property ${key} is required`)
      }
      if (source[key] === null && !acceptsNull(field)) {
        throw new TypeError(`Property ${key} does not accept null`)
      }
    }
    return Schema.resolve(value, object, {})[0] as ReturnType<typeof object>
  }, true).required().role(CONTRACT_OBJECT)
  result.dict = object.dict
  return result
}

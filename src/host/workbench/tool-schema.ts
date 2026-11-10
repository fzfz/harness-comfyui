import type Schema from '@deepseek-ai/schemastery'
import type { JsonSchemaNode } from '@deepseek-ai/dsh-tools'
import { contractFields, fieldIsRequired } from '../../shared/field-contract.ts'
import { JSON_ARRAY_ROLE, JSON_OBJECT_ROLE, JSON_VALUE_ROLE } from '../../shared/json-contract.ts'

export function nativeToolSchema(schema: Schema, descriptions: Readonly<Record<string, string>> = {}, path = ''): JsonSchemaNode {
  const fields = contractFields(schema)
  let result: JsonSchemaNode
  if (fields) {
    result = { type: 'object', properties: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, nativeToolSchema(value, descriptions, path ? `${path}.${key}` : key)])), required: Object.entries(fields).filter(([, value]) => fieldIsRequired(value)).map(([key]) => key), additionalProperties: false }
  } else if (schema.meta.role === JSON_VALUE_ROLE || schema.type === 'any') result = {}
  else if (schema.meta.role === JSON_OBJECT_ROLE || schema.type === 'dict') result = { type: 'object' }
  else if (schema.meta.role === JSON_ARRAY_ROLE) result = { type: 'array', items: {} }
  else if (schema.type === 'transform') result = nativeToolSchema(schema.inner!, descriptions, path)
  else if (schema.type === 'array') result = { type: 'array', items: nativeToolSchema(schema.inner!, descriptions, `${path}[]`) }
  else if (schema.type === 'union') {
    const alternatives = schema.list!.map(item => nativeToolSchema(item, descriptions, path))
    result = alternatives.length === 1 ? alternatives[0]! : { oneOf: alternatives }
  } else if (schema.type === 'const') {
    const value = schema.value as string | number | boolean | null
    result = { type: value === null ? 'null' : typeof value as 'string' | 'number' | 'boolean', const: value }
  } else if (schema.type === 'number') result = { type: schema.meta.step === 1 ? 'integer' : 'number' }
  else if (schema.type === 'string' || schema.type === 'boolean') result = { type: schema.type }
  else throw new TypeError(`Unsupported workbench schema type: ${schema.type}`)
  const constraints = Object.fromEntries(Object.entries({ min: schema.meta.min, max: schema.meta.max, step: schema.meta.step, pattern: schema.meta.pattern }).filter(([, value]) => value !== undefined))
  const description = [descriptions[path], typeof schema.meta.description === 'string' ? schema.meta.description : undefined, Object.keys(constraints).length ? JSON.stringify(constraints) : undefined].filter(Boolean).join('\n')
  return { ...result, ...(description ? { description } : {}) }
}

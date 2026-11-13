import Schema from '@deepseek-ai/schemastery'

function assertSerializable(id: string, value: unknown, path: string, seen: Set<object>, declaration = false): void {
  if (typeof value === 'function' && !declaration) {
    throw new TypeError(`${id} settings ${path}: function cannot be reconstructed from settings JSON; use a declarative contract`)
  }
  if (!value || typeof value !== 'object' && typeof value !== 'function' || seen.has(value)) return
  seen.add(value)
  if (!declaration) {
    for (const [name, item] of Object.entries(value)) assertSerializable(id, item, Array.isArray(value) ? `${path}[${name}]` : `${path}.${name}`, seen)
    return
  }
  const schema = value as Schema
  for (const [capability, item] of Object.entries(schema)) {
    if (capability === 'toString' || item === undefined) continue
    if (typeof item === 'function' && !(item instanceof Schema) || capability === 'callback' || capability === 'builder' || capability === 'constructor') {
      throw new TypeError(`${id} settings ${path}: ${capability} cannot be reconstructed from settings JSON; use a declarative contract`)
    }
  }
  assertSerializable(id, schema.meta, `${path}.meta`, seen)
  for (const [name, field] of Object.entries(schema.dict ?? {})) assertSerializable(id, field, `${path}.${name}`, seen, true)
  if (schema.sKey) assertSerializable(id, schema.sKey, `${path}{key}`, seen, true)
  if (schema.inner) assertSerializable(id, schema.inner, schema.type === 'array' ? `${path}[]` : path, seen, true)
  for (const [index, branch] of (schema.list ?? []).entries()) assertSerializable(id, branch, `${path}.branches[${index}]`, seen, true)
}

export function settingsDeclaration<Node extends Schema>(id: string, schema: Node): Node {
  assertSerializable(id, schema, '$', new Set(), true)
  return new Schema(JSON.parse(JSON.stringify(schema))) as Node
}

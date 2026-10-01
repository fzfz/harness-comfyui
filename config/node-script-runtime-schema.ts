import Schema from '@deepseek-ai/schemastery'

export interface NodeScriptRuntimeConfiguration {
  readonly schemaVersion: 1
  readonly electronNodeEnvironment: {
    readonly ELECTRON_RUN_AS_NODE: '1'
  }
}

export const NodeScriptRuntimeSchema = Schema.object({
  schemaVersion: Schema.const(1).required(),
  electronNodeEnvironment: Schema.object({
    ELECTRON_RUN_AS_NODE: Schema.const('1').required(),
  }).required(),
})

function exactRecord(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`)
  }
  const record = value as Record<string, unknown>
  const allowed = new Set(keys)
  const missing = keys.filter(key => !Object.hasOwn(record, key))
  const unexpected = Object.keys(record).filter(key => !allowed.has(key))
  if (missing.length > 0 || unexpected.length > 0) {
    throw new TypeError(`${label} must contain exactly ${keys.join(', ')}${
      missing.length > 0 ? `; missing ${missing.join(', ')}` : ''
    }${unexpected.length > 0 ? `; unexpected ${unexpected.join(', ')}` : ''}`)
  }
  return record
}

export function parseNodeScriptRuntime(value: unknown): NodeScriptRuntimeConfiguration {
  try {
    const config = exactRecord(value, ['schemaVersion', 'electronNodeEnvironment'], 'Node script runtime config')
    const electronNodeEnvironment = exactRecord(
      config.electronNodeEnvironment,
      ['ELECTRON_RUN_AS_NODE'],
      'Node script runtime config.electronNodeEnvironment',
    )
    return Schema.resolve({ ...config, electronNodeEnvironment }, NodeScriptRuntimeSchema, {}, true)[0] as NodeScriptRuntimeConfiguration
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new TypeError(`Node script runtime config validation failed: ${message}`)
  }
}

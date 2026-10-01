import Schema from '@deepseek-ai/schemastery'

export interface ManagedCliEnvironmentConfiguration {
  readonly schemaVersion: 1
  readonly environmentNames: {
    readonly executable: string
    readonly nodeExecutable: string
    readonly api: string
    readonly capability: string
    readonly semanticQueryCli: string
    readonly sourceUrl: string
    readonly sourcePort: string
  }
}

const environmentName = Schema.string().pattern(/^DSH_[A-Z0-9_]+$/u).required()

export const ManagedCliEnvironmentSchema = Schema.object({
  schemaVersion: Schema.const(1).required(),
  environmentNames: Schema.object({
    executable: environmentName,
    nodeExecutable: environmentName,
    api: environmentName,
    capability: environmentName,
    semanticQueryCli: environmentName,
    sourceUrl: environmentName,
    sourcePort: environmentName,
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

export function parseManagedCliEnvironment(value: unknown): ManagedCliEnvironmentConfiguration {
  try {
    const config = exactRecord(value, ['schemaVersion', 'environmentNames'], 'Managed CLI environment config')
    const environmentNames = exactRecord(
      config.environmentNames,
      ['executable', 'nodeExecutable', 'api', 'capability', 'semanticQueryCli', 'sourceUrl', 'sourcePort'],
      'Managed CLI environment config.environmentNames',
    )
    if (new Set(Object.values(environmentNames)).size !== Object.keys(environmentNames).length) {
      throw new TypeError('environmentNames contains duplicate variable names. Assign a distinct variable name to each field in environmentNames, then retry.')
    }
    const resolved = Schema.resolve({ ...config, environmentNames }, ManagedCliEnvironmentSchema, {}, true)[0]
    return resolved as ManagedCliEnvironmentConfiguration
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new TypeError(`Managed CLI environment config validation failed: ${message}`)
  }
}

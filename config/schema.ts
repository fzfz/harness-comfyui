import Schema from '@deepseek-ai/schemastery'

const nonEmptyString = Schema.string().pattern(/\S+/).required()
const nonNegativeInteger = Schema.natural().required()
const positiveInteger = Schema.natural().min(1).required()

export const configurationProfileNames = [
  'production',
] as const

export type ConfigurationProfileName = (typeof configurationProfileNames)[number]

export interface ConfigurationProfileValues {
  paths: {
    dataDir: string
    apiWorkflowCacheDirectory: string
    runRepositoryFile: string
    runDirectory: string
    savedMediaDirectory: string
    logDirectory: string
  }
  comfyui: {
    defaultInstanceId: string
    frontendCompiler: {
      browserExecutablePath: string
      instanceCacheEpoch: string
      timeoutMs: number
      preReadiness: {
        devToolsPortMs: number
        targetCreateMs: number
        webSocketConnectMs: number
        domainEnableMs: number
        navigationMs: number
        infrastructureAttempts: 1 | 2
      }
    }
  }
  source: {
    catalogPort: number
  }
  jobs: {
    pollIntervalMs: number
    missingObservationMs: number
  }
  media: {
    maxFileBytes: number
  }
  client: {
    runRefreshIntervalMs: number
  }
  cliServer: {
    host: '127.0.0.1'
    port: 0
    shutdownTimeoutMs: number
  }
}

export interface ConfigurationProfile extends ConfigurationProfileValues {
  configurationProfile: ConfigurationProfileName
}

const ConfigurationProfileSchema = Schema.object({
  paths: Schema.object({
    dataDir: nonEmptyString,
    apiWorkflowCacheDirectory: nonEmptyString,
    runRepositoryFile: nonEmptyString,
    runDirectory: nonEmptyString,
    savedMediaDirectory: nonEmptyString,
    logDirectory: nonEmptyString,
  }).required(),
  comfyui: Schema.object({
    defaultInstanceId: nonEmptyString,
    frontendCompiler: Schema.object({
      browserExecutablePath: nonEmptyString,
      instanceCacheEpoch: nonEmptyString,
      timeoutMs: positiveInteger,
      preReadiness: Schema.object({
        devToolsPortMs: positiveInteger,
        targetCreateMs: positiveInteger,
        webSocketConnectMs: positiveInteger,
        domainEnableMs: positiveInteger,
        navigationMs: positiveInteger,
        infrastructureAttempts: Schema.union([Schema.const(1), Schema.const(2)]).required(),
      }).required(),
    }).required(),
  }).required(),
  source: Schema.object({
    catalogPort: Schema.natural().min(1).max(65535).required(),
  }).required(),
  jobs: Schema.object({
    pollIntervalMs: nonNegativeInteger,
    missingObservationMs: nonNegativeInteger,
  }).required(),
  media: Schema.object({
    maxFileBytes: positiveInteger,
  }).required(),
  client: Schema.object({
    runRefreshIntervalMs: positiveInteger,
  }).required(),
  cliServer: Schema.object({
    host: Schema.const('127.0.0.1').required(),
    port: Schema.const(0).required(),
    shutdownTimeoutMs: positiveInteger,
  }).required(),
})

export { ConfigurationProfileSchema }

export function parseConfigurationProfile(value: unknown): ConfigurationProfileValues {
  try {
    return Schema.resolve(value, ConfigurationProfileSchema, {}, true)[0] as ConfigurationProfileValues
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new TypeError(`Configuration Profile validation failed: ${message}`)
  }
}

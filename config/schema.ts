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
    runRepositoryFile: string
    runDirectory: string
    savedMediaDirectory: string
    logDirectory: string
  }
  comfyui: {
    defaultInstanceId: string
  }
  source: {
    catalogCliPath: string
    sourceCliPath: string
    contractId: string
    sourceReleaseVersion: string
  }
  jobs: {
    pollIntervalMs: number
    missingObservationMs: number
  }
  client: {
    runRefreshIntervalMs: number
  }
  server: {
    host: string
    port: number
  }
  process: {
    shutdownTimeoutMs: number
  }
}

export interface ConfigurationProfile extends ConfigurationProfileValues {
  configurationProfile: ConfigurationProfileName
}

const ConfigurationProfileSchema = Schema.object({
  paths: Schema.object({
    dataDir: nonEmptyString,
    runRepositoryFile: nonEmptyString,
    runDirectory: nonEmptyString,
    savedMediaDirectory: nonEmptyString,
    logDirectory: nonEmptyString,
  }).required(),
  comfyui: Schema.object({
    defaultInstanceId: nonEmptyString,
  }).required(),
  source: Schema.object({
    catalogCliPath: nonEmptyString,
    sourceCliPath: nonEmptyString,
    contractId: Schema.const('imagegen-source-contract').required(),
    sourceReleaseVersion: Schema.const('0.82.2').required(),
  }).required(),
  jobs: Schema.object({
    pollIntervalMs: nonNegativeInteger,
    missingObservationMs: nonNegativeInteger,
  }).required(),
  client: Schema.object({
    runRefreshIntervalMs: positiveInteger,
  }).required(),
  server: Schema.object({
    host: nonEmptyString,
    port: Schema.natural().min(0).max(65535).required(),
  }).required(),
  process: Schema.object({
    shutdownTimeoutMs: nonNegativeInteger,
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

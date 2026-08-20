import type { ConfigurationProfileName } from '../../config/schema.ts'

/** Stable Host-loading projection exposed through the typed Remote boundary. */
export interface PluginStatus {
  readonly packageName: string
  readonly packageVersion: string
  readonly configurationProfile: ConfigurationProfileName
  readonly hostLoaded: true
}

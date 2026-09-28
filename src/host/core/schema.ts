import Schema from '@deepseek-ai/schemastery'
import type { Volatile } from '@deepseek-ai/cordis'
import { configurationProfileNames, type ConfigurationProfileName } from '../../../config/schema.ts'
import type { ConfigurationProfile } from '../../../config/schema.ts'
import { SOURCE_ADDRESS_SCHEMA, type SourceAddress } from '../../source-settings.ts'
import type { CatalogCli } from '../catalog/catalog-cli.ts'
import type { GenerationRuntime } from '../generation/generation-runtime.ts'
export interface CoreServices {
  readonly catalog: CatalogCli
  readonly runtime: GenerationRuntime
  readonly profile: ConfigurationProfile
  readonly sourceAddress: () => SourceAddress
  readonly semanticQueryClientPath: string
}

export interface Config {
  readonly configurationProfile: ConfigurationProfileName
  readonly startupWorkspacePath?: string
  readonly configuration?: Volatile<SourceAddress>
}

const configurationProfileSchema = Schema.union(
  configurationProfileNames.map(profile => Schema.const(profile)),
).required()
/** Standard Schema validated Host plugin configuration. */
export const Config = Schema.object({
  configurationProfile: configurationProfileSchema,
  startupWorkspacePath: Schema.string().min(1).pattern(/\S/u),
  configuration: SOURCE_ADDRESS_SCHEMA.default(undefined as never).volatile(),

})

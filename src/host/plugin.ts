import Schema from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'

import {
  configurationProfileNames,
  type ConfigurationProfileName,
} from '../../config/schema.ts'
import { loadProfile } from '../config/load-profile.ts'
import { PluginStatusService } from '../service/plugin-status.ts'

export interface Config {
  readonly configurationProfile: ConfigurationProfileName
}

const configurationProfileSchema = Schema.union(
  configurationProfileNames.map(profile => Schema.const(profile)),
).required()

/** Standard Schema validated Host plugin configuration. */
export const Config = Schema.object({
  configurationProfile: configurationProfileSchema,
})

export const name = 'harness-comfyui'
export const inject: [] = []

/** Load Configuration Profile before registering the Host Remote service. */
export function apply(ctx: Context, config: Config): void {
  const {
    HARNESS_COMFYUI_CONFIGURATION_PROFILE: _profileSelector,
    HARNESS_COMFYUI_PACKAGE_VERSION: _packageVersion,
    ...environment
  } = process.env
  loadProfile(config.configurationProfile, { environment })
  new PluginStatusService(ctx, config.configurationProfile)
}

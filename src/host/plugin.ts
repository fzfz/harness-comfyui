import Schema from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'

import {
  configurationProfileNames,
  type ConfigurationProfileName,
} from '../../config/schema.ts'
import { loadProfile } from '../config/load-profile.ts'

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

/** Validate the selected Configuration Profile before Host startup completes. */
export function apply(ctx: Context, config: Config): void {
  const {
    HARNESS_COMFYUI_CONFIGURATION_PROFILE: _profileSelector,
    ...environment
  } = process.env
  loadProfile(config.configurationProfile, { environment })
}

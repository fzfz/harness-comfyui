import Schema from '@deepseek-ai/schemastery'
import configuration from '../config/plugin-storage.json' with { type: 'json' }
import type { ConfigurationProfileValues } from '../config/schema.ts'

const directoryFieldSchema = Schema.union([
  Schema.const('dataDir'), Schema.const('apiWorkflowCacheDirectory'), Schema.const('runDirectory'),
  Schema.const('savedMediaDirectory'), Schema.const('logDirectory'),
])
const pluginStorageConfigurationSchema = Schema.object({
  directoryFields: Schema.array(directoryFieldSchema).min(5).max(5).required(),
  repositoryField: Schema.const('runRepositoryFile').required(),
  failureDetailsTemplate: Schema.string().min(1).required(),
})
export type PluginStoragePaths = ConfigurationProfileValues['paths']
export const PLUGIN_STORAGE = Schema.resolve(configuration, pluginStorageConfigurationSchema, {}, true)[0] as {
  readonly directoryFields: ReadonlyArray<Exclude<keyof PluginStoragePaths, 'runRepositoryFile'>>
  readonly repositoryField: 'runRepositoryFile'
  readonly failureDetailsTemplate: string
}
if (new Set(PLUGIN_STORAGE.directoryFields).size !== PLUGIN_STORAGE.directoryFields.length) {
  throw new TypeError('Plugin storage configuration contains duplicate directory fields; list each storage directory field once.')
}

export interface PluginStorageSettings { readonly dataDirectory?: string }
export const PLUGIN_DATA_DIRECTORY_SCHEMA = Schema.string().min(1).pattern(/^\/[^\0]*$/u)
export function parsePluginDataDirectory(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('Plugin dataDirectory must be a string; configure an absolute writable data directory in the official Profile.')
  return PLUGIN_DATA_DIRECTORY_SCHEMA(value)
}

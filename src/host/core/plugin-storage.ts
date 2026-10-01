import { accessSync, constants, lstatSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { PluginStorageError } from '../plugin-storage-error.ts'
export { PluginStorageError } from '../plugin-storage-error.ts'
import { PLUGIN_STORAGE, type PluginStoragePaths } from '../../plugin-storage-schema.ts'

function assertDirectoryWritable(target: string): void {
  try {
    let parent = target
    while (lstatSync(parent, { throwIfNoEntry: false }) === undefined) {
      const next = dirname(parent)
      if (next === parent) throw new Error('The parent directory for the plugin storage path does not exist; create an accessible parent directory or configure storage under an existing writable directory.')
      parent = next
    }
    if (!statSync(parent).isDirectory()) {
      throw new TypeError('The plugin storage path or the parent directory needed to create it points to a file; configure the plugin storage under an accessible directory.')
    }
    accessSync(parent, constants.W_OK | constants.X_OK)
  } catch (error) { throw new PluginStorageError(target, error) }
}

/** Check existing storage or its creation parent before opening the business database. */
export function assertPluginStorageWritable(paths: PluginStoragePaths): void {
  for (const field of PLUGIN_STORAGE.directoryFields) assertDirectoryWritable(paths[field])
  const repository = paths[PLUGIN_STORAGE.repositoryField]
  assertDirectoryWritable(dirname(repository))
  try {
    if (lstatSync(repository, { throwIfNoEntry: false }) === undefined) return
    if (!statSync(repository).isFile()) throw new TypeError('The Run database path points to a directory or another file type; set harness-comfyui-core.config.dataDirectory in the official Profile to an accessible directory with an available Run database file path.')
    accessSync(repository, constants.R_OK | constants.W_OK)
  } catch (error) { throw new PluginStorageError(repository, error) }
}

import errorCatalog from '../../config/error-catalog.json' with { type: 'json' }
import { PLUGIN_STORAGE } from '../plugin-storage-schema.ts'

export class PluginStorageError extends Error {
  readonly code = 'PLUGIN_DATA_DIRECTORY_UNAVAILABLE'
  constructor(readonly path: string, cause: unknown) {
    const entry = errorCatalog.PLUGIN_DATA_DIRECTORY_UNAVAILABLE
    const reason = cause instanceof Error ? cause.message : String(cause)
    const details = PLUGIN_STORAGE.failureDetailsTemplate.replace(/\{path\}|\{reason\}/gu,
      (field) => field === '{path}' ? path : reason)
    super(`${entry.reason}${entry.next_step} ${details}`, { cause })
    this.name = 'PluginStorageError'
  }
}

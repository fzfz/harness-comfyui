import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { lstatSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { loadOfficialProfilePatchAdapter } from './official-profile-patch.mjs'
import { rawCaptureConfiguration } from './official-raw-capture.mjs'
import { createTraceEvidenceWriter } from './official-trace-evidence.mjs'

function entriesWithId(rows, id, result = []) {
  for (const row of rows) {
    if (row.id === id) result.push(row)
    if (Array.isArray(row.config)) entriesWithId(row.config, id, result)
    if (Array.isArray(row.insert)) entriesWithId(row.insert, id, result)
  }
  return result
}

function removeObserverEntry(rows, observerEntry) {
  const index = rows.indexOf(observerEntry)
  if (index >= 0) { rows.splice(index, 1); return true }
  for (const [index, row] of rows.entries()) {
    if (Array.isArray(row.insert) && removeObserverEntry(row.insert, observerEntry)) {
      if (!row.insert.length && Object.keys(row).length === 1) rows.splice(index, 1)
      return true
    }
    if (Array.isArray(row.config) && removeObserverEntry(row.config, observerEntry)) return true
  }
  return false
}

function selectedProvider(rows, providerId, providerEntryId) {
  const entries = entriesWithId(rows, providerEntryId)
  if (entries.length !== 1) throw new TypeError('Raw capture requires exactly one ' + providerEntryId + ' Profile entry')
  const provider = entries[0].config?.providers?.[providerId]
  if (!provider || typeof provider !== 'object') throw new TypeError('Raw capture provider was not found: ' + providerId)
  return provider
}

function assertIsolatedProfile(profilePath) {
  const root = resolve(import.meta.dirname, '../../../.local')
  const child = relative(root, profilePath)
  if (!isAbsolute(profilePath) || !child || child === '..' || child.startsWith('..' + sep) || isAbsolute(child)) throw new TypeError('Raw capture Profile must remain under this checkout .local directory')
  for (let path = profilePath; path !== dirname(path); path = dirname(path)) {
    try { if (lstatSync(path).isSymbolicLink()) throw new TypeError('Raw capture Profile paths must not contain symbolic links') }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
}

async function replaceProfile(profilePath, previous, next) {
  if (await readFile(profilePath, 'utf8') !== previous) throw new Error('RAW_CAPTURE_PROFILE_CHANGED: retry after the Profile writer has finished')
  const temporary = profilePath + '.' + randomUUID() + '.tmp'
  try {
    await writeFile(temporary, next, { flag: 'wx', mode: 0o600 })
    await rename(temporary, profilePath)
  } finally { await rm(temporary, { force: true }) }
}

export async function prepareRawCaptureProfile({ config, capture, providerId, profilePatchAdapter }) {
  const captureConfig = capture.captureConfig ?? rawCaptureConfiguration(config)
  if (typeof providerId !== 'string' || !providerId) throw new TypeError('Raw capture requires an explicit providerId')
  const adapter = profilePatchAdapter ?? await loadOfficialProfilePatchAdapter(config)
  const writer = createTraceEvidenceWriter({ directory: capture.directory })
  const observerEntry = { id: captureConfig.observer.entryId,
    name: new URL('./official-raw-observer.mjs', import.meta.url).href,
    config: { outputDirectory: capture.directory, captureConfig } }
  const restorationPath = join(capture.directory, captureConfig.filenames.profileRestoration)
  let restoration
  const patch = rows => {
    const updated = structuredClone(rows)
    const observerEntries = entriesWithId(updated, observerEntry.id)
    const provider = selectedProvider(updated, providerId, captureConfig.observer.providerEntryId)
    if (observerEntries.length) {
      if (restoration && observerEntries.length === 1 && isDeepStrictEqual(observerEntries[0], observerEntry) && provider.baseURL === capture.baseURL) return updated
      throw new Error('RAW_CAPTURE_OBSERVER_ALREADY_REGISTERED: restore the previous capture Profile before starting another capture')
    }
    if (capture.upstreamBaseUrl && new URL(provider.baseURL).href.replace(/\/$/u, '') !== new URL(capture.upstreamBaseUrl).href.replace(/\/$/u, '')) {
      throw new Error('RAW_CAPTURE_UPSTREAM_MISMATCH: start the forwarder with the selected Profile provider baseURL')
    }
    restoration = { schemaVersion: 1, providerId, originalBaseURL: provider.baseURL,
      captureBaseURL: capture.baseURL, observerEntry }
    provider.baseURL = capture.baseURL
    updated.push({ insert: [structuredClone(observerEntry)] })
    writer.writeJson(captureConfig.filenames.profileRestoration, restoration)
    return updated
  }
  const patchedConfig = structuredClone(config)
  const patchedAdapter = {
    updateInitialProfilePatch: patch,
    parse: source => adapter.parse(source),
    serialize: document => adapter.serialize(document),
    async updateProfilePatch(document, update) { return patch(await adapter.updateProfilePatch(document, update)) },
  }
  return { config: patchedConfig, profilePatchAdapter: patchedAdapter, restorationPath, observerEntry,
    async applyToProfile({ profilePath }) {
      assertIsolatedProfile(profilePath)
      const previous = await readFile(profilePath, 'utf8')
      const updated = patch(await adapter.parse(previous))
      await replaceProfile(profilePath, previous, await adapter.serialize(updated))
      return { profilePath, restorationPath, baseURL: capture.baseURL }
    },
    async restore({ profilePath }) {
      assertIsolatedProfile(profilePath)
      if (!restoration) return { restored: true, notApplied: true, profilePath }
      const previous = await readFile(profilePath, 'utf8')
      const rows = await adapter.parse(previous)
      const observers = entriesWithId(rows, observerEntry.id)
      const provider = selectedProvider(rows, providerId, captureConfig.observer.providerEntryId)
      if (observers.length === 0 && provider.baseURL === restoration.originalBaseURL) return { restored: true, alreadyRestored: true, profilePath }
      if (observers.length !== 1 || !isDeepStrictEqual(observers[0], observerEntry) || provider.baseURL !== capture.baseURL) {
        throw new Error('RAW_CAPTURE_PROFILE_RESTORE_CONFLICT: temporary capture fields changed; compare profile-restoration.json before restoring those fields')
      }
      provider.baseURL = restoration.originalBaseURL
      removeObserverEntry(rows, observers[0])
      await replaceProfile(profilePath, previous, await adapter.serialize(rows))
      return { restored: true, alreadyRestored: false, profilePath }
    },
  }
}

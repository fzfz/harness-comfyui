import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const LEGACY_PROJECTION_CACHE_VERSION = 3
const CURRENT_PROJECTION_RECORD_VERSION = 4
const WORKSPACE_STORAGE_VERSION = 2

async function readJsonIfPresent(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

async function directoryEntries(path) {
  try {
    return await readdir(path, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

async function mergeDirectory(source, target) {
  const entries = await directoryEntries(source)
  if (entries.length === 0) return
  await mkdir(target, { recursive: true })
  for (const entry of entries) {
    await cp(resolve(source, entry.name), resolve(target, entry.name), {
      recursive: true,
      force: false,
      errorOnExist: false,
    })
  }
}

async function writeJsonAtomically(path, value) {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.legacy-session-migration-${process.pid}.tmp`
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value)}\n`, { flag: 'wx', mode: 0o600 })
    await rename(temporaryPath, path)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

async function migrateProjectionCache(legacyDshHome, dshHome) {
  const legacyPath = resolve(legacyDshHome, 'storages/session_projcache.json')
  const legacy = await readJsonIfPresent(legacyPath)
  if (legacy === undefined) return
  if (
    legacy.unit?.name !== 'session_projcache'
    || legacy.unit.version !== LEGACY_PROJECTION_CACHE_VERSION
    || legacy.tables?.sessions === null
    || typeof legacy.tables?.sessions !== 'object'
    || Array.isArray(legacy.tables.sessions)
  ) {
    throw new Error(`legacy Session projection cache has an unsupported structure: ${legacyPath}`)
  }

  const targetRoot = resolve(dshHome, 'storages/session_projcache/sessions')
  await mkdir(targetRoot, { recursive: true })
  for (const [sessionId, record] of Object.entries(legacy.tables.sessions)) {
    const targetPath = resolve(targetRoot, `${sessionId}.json`)
    try {
      await writeFile(targetPath, `${JSON.stringify({
        version: CURRENT_PROJECTION_RECORD_VERSION,
        record,
      })}\n`, { flag: 'wx', mode: 0o600 })
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
    }
  }
}

function assertWorkspaceStorage(value, path) {
  if (
    value.unit?.name !== 'workspace'
    || value.unit.version !== WORKSPACE_STORAGE_VERSION
    || value.tables?.workspaces === null
    || typeof value.tables?.workspaces !== 'object'
    || Array.isArray(value.tables.workspaces)
  ) {
    throw new Error(`Workspace storage has an unsupported structure: ${path}`)
  }
}

function mergeWorkspaceRecords(current, legacy, currentPath) {
  const currentWorkspaces = current.tables.workspaces
  for (const [legacyId, legacyWorkspace] of Object.entries(legacy.tables.workspaces)) {
    const currentEntry = Object.entries(currentWorkspaces)
      .find(([, workspace]) => workspace.path === legacyWorkspace.path)
    if (currentEntry !== undefined) {
      const [currentId, currentWorkspace] = currentEntry
      currentWorkspaces[currentId] = {
        ...currentWorkspace,
        sessionIds: [...new Set([
          ...(currentWorkspace.sessionIds ?? []),
          ...(legacyWorkspace.sessionIds ?? []),
        ])],
      }
      continue
    }
    if (currentWorkspaces[legacyId] !== undefined) {
      throw new Error(`Workspace ID ${legacyId} identifies different paths in ${currentPath}`)
    }
    currentWorkspaces[legacyId] = legacyWorkspace
  }
}

async function migrateWorkspaceStorage(legacyDshHome, dshHome) {
  const legacyPath = resolve(legacyDshHome, 'storages/workspace.json')
  const legacy = await readJsonIfPresent(legacyPath)
  if (legacy === undefined) return
  assertWorkspaceStorage(legacy, legacyPath)

  const currentPath = resolve(dshHome, 'storages/workspace.json')
  const current = await readJsonIfPresent(currentPath)
  if (current === undefined) {
    await writeJsonAtomically(currentPath, legacy)
    return
  }
  assertWorkspaceStorage(current, currentPath)
  mergeWorkspaceRecords(current, legacy, currentPath)
  await writeJsonAtomically(currentPath, current)
}

export async function migrateLegacyProductionSessionData(context) {
  if (context.legacyDshHome === undefined) return
  if (resolve(context.legacyDshHome) === resolve(context.dshHome)) return

  await mergeDirectory(
    resolve(context.legacyDshHome, 'sessions'),
    resolve(context.dshHome, 'sessions'),
  )
  await mergeDirectory(
    resolve(context.legacyDshHome, 'attachments'),
    resolve(context.dshHome, 'attachments'),
  )
  await migrateProjectionCache(context.legacyDshHome, context.dshHome)
  await migrateWorkspaceStorage(context.legacyDshHome, context.dshHome)
}

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { migrateLegacyProductionSessionData } from '../../scripts/desktop/legacy-session-migration.mjs'

const roots = []

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'desktop-session-migration-'))
  roots.push(root)
  const legacyDshHome = resolve(root, 'legacy-dsh-home')
  const dshHome = resolve(root, 'current-dsh-home')
  const workspacePath = resolve(root, 'workspace')
  const sessionId = 'session-legacy'
  const record = {
    identity: { createdAt: 1, cwd: workspacePath },
    rows: { title: { ver: 1, seq: 0, val: { title: 'Legacy session' } } },
  }
  await Promise.all([
    mkdir(resolve(legacyDshHome, 'sessions/--workspace--', sessionId), { recursive: true }),
    mkdir(resolve(legacyDshHome, 'attachments/v1/legacy'), { recursive: true }),
    mkdir(resolve(legacyDshHome, 'storages'), { recursive: true }),
  ])
  await Promise.all([
    writeFile(resolve(
      legacyDshHome,
      'sessions/--workspace--',
      sessionId,
      'session.jsonl.zstd',
    ), 'legacy-session'),
    writeFile(resolve(legacyDshHome, 'attachments/v1/legacy/image.png'), 'legacy-attachment'),
    writeFile(resolve(legacyDshHome, 'storages/session_projcache.json'), JSON.stringify({
      unit: { name: 'session_projcache', version: 3 },
      global: null,
      tables: { sessions: { [sessionId]: record } },
    })),
    writeFile(resolve(legacyDshHome, 'storages/workspace.json'), JSON.stringify({
      unit: { name: 'workspace', version: 2 },
      global: {},
      tables: {
        workspaces: {
          'legacy-workspace': {
            path: workspacePath,
            title: 'Legacy workspace',
            sessionIds: [sessionId],
            createdAt: '2026-08-01T00:00:00.000Z',
            updatedAt: '2026-08-01T00:00:00.000Z',
          },
        },
      },
    })),
  ])
  return { root, legacyDshHome, dshHome, workspacePath, sessionId, record }
}

describe('legacy production Session migration', () => {
  it('does nothing when the legacy production DSH home does not exist', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'desktop-session-migration-empty-'))
    roots.push(root)
    await expect(migrateLegacyProductionSessionData({
      legacyDshHome: resolve(root, 'missing'),
      dshHome: resolve(root, 'current'),
    })).resolves.toBeUndefined()
  })

  it('copies the legacy Session data into an empty current DSH home without changing the source', async () => {
    const value = await fixture()

    await migrateLegacyProductionSessionData(value)

    expect(await readFile(resolve(
      value.dshHome,
      'sessions/--workspace--',
      value.sessionId,
      'session.jsonl.zstd',
    ), 'utf8')).toBe('legacy-session')
    expect(await readFile(resolve(value.dshHome, 'attachments/v1/legacy/image.png'), 'utf8'))
      .toBe('legacy-attachment')
    expect(JSON.parse(await readFile(resolve(
      value.dshHome,
      'storages/session_projcache/sessions',
      `${value.sessionId}.json`,
    ), 'utf8'))).toEqual({ version: 4, record: value.record })
    expect(JSON.parse(await readFile(resolve(value.dshHome, 'storages/workspace.json'), 'utf8'))
      .tables.workspaces['legacy-workspace'].sessionIds).toEqual([value.sessionId])
    expect(await readFile(resolve(
      value.legacyDshHome,
      'sessions/--workspace--',
      value.sessionId,
      'session.jsonl.zstd',
    ), 'utf8')).toBe('legacy-session')
  })

  it('does not overwrite migrated Session files or projection records on a repeated start', async () => {
    const value = await fixture()
    await migrateLegacyProductionSessionData(value)
    const migratedSessionPath = resolve(
      value.dshHome,
      'sessions/--workspace--',
      value.sessionId,
      'session.jsonl.zstd',
    )
    const migratedProjectionPath = resolve(
      value.dshHome,
      'storages/session_projcache/sessions',
      `${value.sessionId}.json`,
    )
    await Promise.all([
      writeFile(migratedSessionPath, 'current-session'),
      writeFile(migratedProjectionPath, JSON.stringify({ version: 4, record: { current: true } })),
    ])

    await migrateLegacyProductionSessionData(value)

    expect(await readFile(migratedSessionPath, 'utf8')).toBe('current-session')
    expect(JSON.parse(await readFile(migratedProjectionPath, 'utf8')))
      .toEqual({ version: 4, record: { current: true } })
  })
})

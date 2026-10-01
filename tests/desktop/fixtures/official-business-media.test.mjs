import { mkdtemp, rm } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { publishSavedDesktopRun } from './official-business-media.mjs'

async function withRepositoryFiles(run) {
  const directory = await mkdtemp(join(tmpdir(), 'official-business-media-'))
  const sourceFile = join(directory, 'staged.sqlite')
  const destinationFile = join(directory, 'destination.sqlite')
  try {
    await run({ sourceFile, destinationFile })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function createRepository(filePath) {
  const database = new DatabaseSync(filePath)
  database.exec(`
    CREATE TABLE generation_runs (
      run_id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      title TEXT NOT NULL
    );
    CREATE TABLE generation_media (
      media_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      filename TEXT NOT NULL
    );
  `)
  return database
}

function readRows(filePath, table) {
  const database = new DatabaseSync(filePath)
  try {
    return database.prepare(`SELECT * FROM main.${table} ORDER BY 1`).all()
  } finally {
    database.close()
  }
}

describe('official Desktop staged generation publication', () => {
  it('copies one run without changing the source or replacing destination records', async () => {
    await withRepositoryFiles(({ sourceFile, destinationFile }) => {
      const source = createRepository(sourceFile)
      source.prepare('INSERT INTO generation_runs VALUES (?, ?, ?)').run('run_publish', 10, 'published')
      source.prepare('INSERT INTO generation_runs VALUES (?, ?, ?)').run('run_unrelated', 20, 'unrelated')
      source.prepare('INSERT INTO generation_media VALUES (?, ?, ?)').run('media_publish', 'run_publish', 'published.gif')
      source.prepare('INSERT INTO generation_media VALUES (?, ?, ?)').run('media_unrelated', 'run_unrelated', 'unrelated.gif')
      source.close()

      const destination = createRepository(destinationFile)
      destination.prepare('INSERT INTO generation_runs VALUES (?, ?, ?)').run('run_existing', 1, 'existing')
      destination.prepare('INSERT INTO generation_media VALUES (?, ?, ?)').run('media_existing', 'run_existing', 'existing.gif')
      destination.close()

      const sourceBefore = {
        runs: readRows(sourceFile, 'generation_runs'),
        media: readRows(sourceFile, 'generation_media'),
      }
      publishSavedDesktopRun(destinationFile, sourceFile, 'run_publish')

      expect(readRows(destinationFile, 'generation_runs')).toEqual([
        { run_id: 'run_existing', created_at: 1, title: 'existing' },
        { run_id: 'run_publish', created_at: 10, title: 'published' },
      ])
      expect(readRows(destinationFile, 'generation_media')).toEqual([
        { media_id: 'media_existing', run_id: 'run_existing', filename: 'existing.gif' },
        { media_id: 'media_publish', run_id: 'run_publish', filename: 'published.gif' },
      ])
      expect(readRows(sourceFile, 'generation_runs')).toEqual(sourceBefore.runs)
      expect(readRows(sourceFile, 'generation_media')).toEqual(sourceBefore.media)
    })
  })

  it('requires destination tables when the staged database is attached', async () => {
    await withRepositoryFiles(({ sourceFile, destinationFile }) => {
      const source = createRepository(sourceFile)
      source.prepare('INSERT INTO generation_runs VALUES (?, ?, ?)').run('run_source', 10, 'source')
      source.prepare('INSERT INTO generation_media VALUES (?, ?, ?)').run('media_source', 'run_source', 'source.gif')
      source.close()
      new DatabaseSync(destinationFile).close()

      expect(() => publishSavedDesktopRun(destinationFile, sourceFile, 'run_source'))
        .toThrow(/no such table: main\.generation_runs/u)
      expect(readRows(sourceFile, 'generation_runs')).toEqual([
        { run_id: 'run_source', created_at: 10, title: 'source' },
      ])
      expect(readRows(sourceFile, 'generation_media')).toEqual([
        { media_id: 'media_source', run_id: 'run_source', filename: 'source.gif' },
      ])
    })
  })

  it('rolls back a copied run when media insertion conflicts', async () => {
    await withRepositoryFiles(({ sourceFile, destinationFile }) => {
      const source = createRepository(sourceFile)
      source.prepare('INSERT INTO generation_runs VALUES (?, ?, ?)').run('run_new', 10, 'new')
      source.prepare('INSERT INTO generation_media VALUES (?, ?, ?)').run('media_conflict', 'run_new', 'new.gif')
      source.close()

      const destination = createRepository(destinationFile)
      destination.prepare('INSERT INTO generation_runs VALUES (?, ?, ?)').run('run_existing', 1, 'existing')
      destination.prepare('INSERT INTO generation_media VALUES (?, ?, ?)')
        .run('media_conflict', 'run_existing', 'existing.gif')
      destination.close()

      expect(() => publishSavedDesktopRun(destinationFile, sourceFile, 'run_new'))
        .toThrow(/UNIQUE constraint failed: generation_media\.media_id/u)
      expect(readRows(destinationFile, 'generation_runs')).toEqual([
        { run_id: 'run_existing', created_at: 1, title: 'existing' },
      ])
      expect(readRows(destinationFile, 'generation_media')).toEqual([
        { media_id: 'media_conflict', run_id: 'run_existing', filename: 'existing.gif' },
      ])
      expect(readRows(sourceFile, 'generation_runs')).toEqual([
        { run_id: 'run_new', created_at: 10, title: 'new' },
      ])
      expect(readRows(sourceFile, 'generation_media')).toEqual([
        { media_id: 'media_conflict', run_id: 'run_new', filename: 'new.gif' },
      ])
    })
  })
})

import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadProfile } from '../../src/config/load-profile.ts'
import { assertPluginStorageWritable } from '../../src/host/core/plugin-storage.ts'
import { PluginStorageError } from '../../src/host/plugin-storage-error.ts'

const directories: string[] = []
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }) })
function paths() {
  const root = mkdtempSync(join(tmpdir(), 'plugin storage with spaces-'))
  directories.push(root)
  return loadProfile('production', { environment: {}, storageRoot: root }).paths
}

describe('plugin storage activation guard', () => {
  it.each(['$&', "$'", '$`', '$$', '{reason}'])('preserves literal path and system error text containing %s', (literal) => {
    const path = `/tmp/plugin-${literal}/runs.sqlite`
    const cause = new Error(`cannot open ${literal} {path}`)
    const error = new PluginStorageError(path, cause)
    expect(error.path).toBe(path)
    expect(error.cause).toBe(cause)
    expect(error.message).toContain(`路径：${path}。系统原因：${cause.message}`)
  })

  it('includes the literal cause when the runtime throws a non-Error value', () => {
    expect(new PluginStorageError('/tmp/runs.sqlite', '$& {path}').message)
      .toContain('路径：/tmp/runs.sqlite。系统原因：$& {path}')
  })

  it('allows creating new storage under a writable parent without creating files during validation', () => {
    const storage = paths()
    expect(() => assertPluginStorageWritable(storage)).not.toThrow()
    expect(existsSync(storage.dataDir)).toBe(false)
    expect(existsSync(storage.runRepositoryFile)).toBe(false)
  })

  it('reports a directory occupied by a file and preserves that file', () => {
    const storage = paths()
    mkdirSync(storage.dataDir, { recursive: true })
    writeFileSync(storage.savedMediaDirectory, 'existing file')
    expect(() => assertPluginStorageWritable(storage)).toThrowError(expect.objectContaining({
      code: 'PLUGIN_DATA_DIRECTORY_UNAVAILABLE', path: storage.savedMediaDirectory,
    }))
    expect(readFileSync(storage.savedMediaDirectory, 'utf8')).toBe('existing file')
  })

  it('reports an unwritable directory with the target and permission correction', () => {
    const storage = paths()
    mkdirSync(storage.dataDir, { recursive: true })
    chmodSync(storage.dataDir, 0o500)
    try {
      expect(() => assertPluginStorageWritable(storage)).toThrowError(expect.objectContaining({
        code: 'PLUGIN_DATA_DIRECTORY_UNAVAILABLE', path: storage.dataDir,
      }))
      expect(() => assertPluginStorageWritable(storage)).toThrow('读取、写入和目录访问权限')
    } finally { chmodSync(storage.dataDir, 0o700) }
  })

  it('reports an unwritable database and preserves its contents', () => {
    const storage = paths()
    mkdirSync(storage.dataDir, { recursive: true })
    writeFileSync(storage.runRepositoryFile, 'existing database')
    chmodSync(storage.runRepositoryFile, 0o400)
    try {
      expect(() => assertPluginStorageWritable(storage)).toThrowError(expect.objectContaining({
        code: 'PLUGIN_DATA_DIRECTORY_UNAVAILABLE', path: storage.runRepositoryFile,
      }))
      expect(readFileSync(storage.runRepositoryFile, 'utf8')).toBe('existing database')
    } finally { chmodSync(storage.runRepositoryFile, 0o600) }
  })

  it('checks the parent of an existing external SQLite database before WAL writes', () => {
    const storage = paths()
    const external = mkdtempSync(join(tmpdir(), 'external readonly SQLite parent-'))
    directories.push(external)
    const repository = join(external, 'runs.sqlite')
    writeFileSync(repository, 'existing database', { mode: 0o600 })
    chmodSync(external, 0o500)
    try {
      expect(() => assertPluginStorageWritable({ ...storage, runRepositoryFile: repository }))
        .toThrowError(expect.objectContaining({ code: 'PLUGIN_DATA_DIRECTORY_UNAVAILABLE', path: dirname(repository) }))
      expect(readFileSync(repository, 'utf8')).toBe('existing database')
    } finally { chmodSync(external, 0o700) }
  })

  it('reports a broken storage symlink instead of accepting its writable parent', () => {
    const storage = paths()
    mkdirSync(storage.dataDir, { recursive: true })
    symlinkSync(join(storage.dataDir, 'missing-target'), storage.savedMediaDirectory)
    expect(() => assertPluginStorageWritable(storage)).toThrowError(expect.objectContaining({
      code: 'PLUGIN_DATA_DIRECTORY_UNAVAILABLE', path: storage.savedMediaDirectory,
    }))
  })

  it('rejects a directory at the database path', () => {
    const storage = paths()
    mkdirSync(storage.runRepositoryFile, { recursive: true })
    expect(() => assertPluginStorageWritable(storage)).toThrowError(expect.objectContaining({
      code: 'PLUGIN_DATA_DIRECTORY_UNAVAILABLE', path: storage.runRepositoryFile,
    }))
  })
})

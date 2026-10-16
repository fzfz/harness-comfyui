import * as fileSystem from 'node:fs/promises'
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { prepareResultFile, writeResultFile, discardUnpublishedResult } from '../../scripts/cli/result-file.mjs'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function temporaryDirectory() {
  const root = await mkdtemp(join(tmpdir(), 'cli-result-files-中文 space-'))
  roots.push(root)
  return root
}

describe('managed CLI result files', () => {
  it('allocates distinct files for concurrent calls with identical inputs', async () => {
    const root = await temporaryDirectory()
    const handles = await Promise.all(Array.from({ length: 5 }, () => prepareResultFile({ temporaryDirectory: root })))
    await Promise.all(handles.map(handle => writeResultFile(handle, { seeds: [12] })))
    expect(new Set(handles.map(handle => handle.path)).size).toBe(5)
    for (const handle of handles) expect(await readFile(handle.path, 'utf8')).toBe('{"seeds":[12]}\n')
  })

  it('reports serialization failure and discards only its own unpublished directory', async () => {
    const root = await temporaryDirectory()
    const saved = await prepareResultFile({ temporaryDirectory: root })
    await writeResultFile(saved, { seeds: [1] })
    const unpublished = await prepareResultFile({ temporaryDirectory: root })
    const cycle = {}; cycle.self = cycle
    await expect(writeResultFile(unpublished, cycle)).rejects.toMatchObject({ stage: 'serialization', path: unpublished.path })
    await discardUnpublishedResult(unpublished)
    expect(await readdir(root)).toEqual([saved.directory.split('/').at(-1)])
    expect(await readFile(saved.path, 'utf8')).toBe('{"seeds":[1]}\n')
  })

  it.each(['write', 'close'])('keeps a %s failure unpublished and closes before cleanup', async stage => {
    const root = await temporaryDirectory()
    let closes = 0
    const fs = {
      ...fileSystem,
      open: async (...args) => {
        const file = await fileSystem.open(...args)
        return {
          chmod: mode => file.chmod(mode),
          writeFile: (...values) => stage === 'write' ? Promise.reject(new Error('disk full')) : file.writeFile(...values),
          close: async () => {
            closes += 1
            if (stage === 'close' && closes === 1) throw new Error('close failed')
            await file.close()
          },
        }
      },
    }
    const handle = await prepareResultFile({ temporaryDirectory: root, fs })
    await expect(writeResultFile(handle, { seeds: [1] })).rejects.toMatchObject({ stage, path: handle.path })
    await discardUnpublishedResult(handle)
    expect(closes).toBe(stage === 'close' ? 2 : 1)
    expect(await readdir(root)).toEqual([])
  })

  it('cleans an allocated directory when exclusive open or permission setup fails', async () => {
    const root = await temporaryDirectory()
    const fs = { ...fileSystem, open: async () => { throw new Error('open failed') } }
    await expect(prepareResultFile({ temporaryDirectory: root, fs })).rejects.toMatchObject({ stage: 'prepare' })
    expect(await readdir(root)).toEqual([])
    const chmodFailure = { ...fileSystem, chmod: async () => { throw new Error('chmod failed') } }
    await expect(prepareResultFile({ temporaryDirectory: root, fs: chmodFailure })).rejects.toMatchObject({ stage: 'prepare' })
    expect(await readdir(root)).toEqual([])
  })

  it('reports cleanup errors with its directory while preserving other completed files', async () => {
    const root = await temporaryDirectory()
    const saved = await prepareResultFile({ temporaryDirectory: root })
    await writeResultFile(saved, { seeds: [2] })
    const fs = { ...fileSystem, rm: async () => { throw new Error('remove denied') } }
    const handle = await prepareResultFile({ temporaryDirectory: root, fs })
    await expect(discardUnpublishedResult(handle)).rejects.toMatchObject({ stage: 'cleanup', path: handle.directory })
    expect(await readFile(saved.path, 'utf8')).toBe('{"seeds":[2]}\n')
    await fileSystem.rm(handle.directory, { recursive: true })
  })

  it('rejects temporary directories containing control characters before allocation', async () => {
    const root = await temporaryDirectory()
    for (const suffix of ['\n', '\r', '\t', '\u007f', '\u0085']) {
      await expect(prepareResultFile({ temporaryDirectory: root + suffix })).rejects.toMatchObject({ stage: 'prepare' })
    }
    expect(await readdir(root)).toEqual([])
  })


  it('retains exact UTF-8 JSON in a private, absolute result file after completion', async () => {
    const handle = await prepareResultFile({ temporaryDirectory: await temporaryDirectory() })
    expect(isAbsolute(handle.path)).toBe(true)
    expect((await stat(handle.directory)).mode & 0o777).toBe(0o700)
    expect((await stat(handle.path)).mode & 0o777).toBe(0o600)
    await writeResultFile(handle, { runs: [{ run_id: 'run_1', workflow: { title: '中文 workflow' } }] })
    await discardUnpublishedResult(handle)
    expect(await readFile(handle.path, 'utf8')).toBe('{"runs":[{"run_id":"run_1","workflow":{"title":"中文 workflow"}}]}\n')
  })
})

import { mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import sharp from 'sharp'
import { afterEach, expect, it } from 'vitest'
import { WorkbenchInputFileService } from '../../src/host/generation/input-file-service.ts'

const cleanup: (() => void)[] = []
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close() })

it('preserves imported image identity and bytes after reopening the file service', async () => {
  const root = mkdtempSync(join(tmpdir(), 'workbench-image-files-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const database = new DatabaseSync(join(root, 'files.sqlite'))
  cleanup.push(() => database.close())
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ace' } }).png().toBuffer()
  const service = new WorkbenchInputFileService({ database, directory: join(root, 'files'), maxFileBytes: 1024 })
  const imported = await service.importFile({ name: 'reference.png', media_type: 'image/png', bytes })
  const restored = new WorkbenchInputFileService({ database, directory: join(root, 'files'), maxFileBytes: 1024 })
  const file = await restored.resolve(imported.file_id)
  expect(file).toMatchObject({ filename: 'reference.png', mediaType: 'image/png' })
  expect(await readFile(file.filePath)).toEqual(bytes)
  await expect(restored.importFile({ name: 'broken.png', media_type: 'image/png', bytes: new Uint8Array([1, 2, 3]) })).rejects.toMatchObject({ code: 'WORKBENCH_IMAGE_FILE_INVALID' })
  await expect(restored.resolve('missing')).rejects.toMatchObject({ code: 'WORKBENCH_IMAGE_FILE_NOT_FOUND' })
})

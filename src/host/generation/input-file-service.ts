import { randomUUID } from 'node:crypto'
import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import sharp from 'sharp'
import imageReaderProcessing from '../../../config/image-reader-processing.json' with { type: 'json' }
import { GenerationRuntimeError } from './generation-error.ts'

export interface WorkbenchInputFile {
  readonly file_id: string
  readonly relative_path: string
  readonly original_name: string
  readonly media_type: string
  readonly byte_size: number
  readonly created_at: number
}

export interface WorkbenchInputFileServiceOptions {
  readonly database: DatabaseSync
  readonly directory: string
  readonly maxFileBytes: number
}

export class WorkbenchInputFileService {
  constructor(private readonly options: WorkbenchInputFileServiceOptions) {
    options.database.exec(`CREATE TABLE IF NOT EXISTS workbench_input_files (
      file_id TEXT PRIMARY KEY, relative_path TEXT NOT NULL UNIQUE, original_name TEXT NOT NULL,
      media_type TEXT NOT NULL, byte_size INTEGER NOT NULL, created_at INTEGER NOT NULL
    )`)
  }

  async importFile(input: { readonly name: string; readonly media_type: string; readonly bytes: Uint8Array }, signal?: AbortSignal): Promise<WorkbenchInputFile> {
    signal?.throwIfAborted()
    if (!input.name.trim() || basename(input.name) !== input.name || input.bytes.byteLength < 1 || input.bytes.byteLength > this.options.maxFileBytes) {
      throw new GenerationRuntimeError('WORKBENCH_IMAGE_FILE_INVALID', `Choose an image with a filename and size between 1 and ${this.options.maxFileBytes} bytes.`)
    }
    try {
      const metadata = await sharp(input.bytes, { failOn: 'warning' }).metadata()
      const format = metadata.format
      if (!metadata.width || !metadata.height || !Object.hasOwn(imageReaderProcessing.formatOptions, format) || `image/${format}` !== input.media_type) throw new Error('The image media type does not match its contents.')
    } catch (error) {
      throw new GenerationRuntimeError('WORKBENCH_IMAGE_FILE_INVALID', `Image ${input.name} could not be read. Choose a valid image. ${error instanceof Error ? error.message : String(error)}`)
    }
    signal?.throwIfAborted()
    const fileId = `file_${randomUUID()}`
    const record: WorkbenchInputFile = { file_id: fileId, relative_path: fileId, original_name: input.name, media_type: input.media_type, byte_size: input.bytes.byteLength, created_at: Date.now() }
    await mkdir(this.options.directory, { recursive: true })
    const filePath = join(this.options.directory, record.relative_path)
    try {
      await writeFile(filePath, input.bytes, { flag: 'wx', signal })
      this.options.database.prepare('INSERT INTO workbench_input_files(file_id, relative_path, original_name, media_type, byte_size, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(record.file_id, record.relative_path, record.original_name, record.media_type, record.byte_size, record.created_at)
    } catch (error) {
      await rm(filePath, { force: true })
      throw error
    }
    return record
  }

  async resolve(fileId: string, signal?: AbortSignal): Promise<{ readonly filePath: string; readonly filename: string; readonly mediaType: string }> {
    signal?.throwIfAborted()
    const record = this.options.database.prepare('SELECT * FROM workbench_input_files WHERE file_id = ?').get(fileId) as unknown as WorkbenchInputFile | undefined
    if (!record) throw new GenerationRuntimeError('WORKBENCH_IMAGE_FILE_NOT_FOUND', `Image file ${fileId} was not found. Select the image again.`)
    const filePath = join(this.options.directory, record.relative_path)
    try { await access(filePath); signal?.throwIfAborted() }
    catch (error) {
      if (signal?.aborted) throw error
      throw new GenerationRuntimeError('WORKBENCH_IMAGE_FILE_NOT_FOUND', `Image file ${fileId} could not be opened. Select the image again.`)
    }
    return { filePath, filename: record.original_name, mediaType: record.media_type }
  }
}

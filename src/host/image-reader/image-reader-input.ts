import { basename, isAbsolute } from 'node:path'
import { open } from 'node:fs/promises'

import type { ImageMediaType } from '@deepseek-ai/dsh-attachment'
import sharp from 'sharp'

import imageReaderProcessing from '../../../config/image-reader-processing.json' with { type: 'json' }
import { ImageReaderError, isAbortError } from './errors.ts'

export interface PreparedImageReaderInput {
  readonly data: Uint8Array
  readonly mediaType: ImageMediaType
  readonly name: string
}

type SupportedImageFormat = 'png' | 'jpeg' | 'webp' | 'gif'

const MEDIA_TYPES = Object.freeze({
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
} satisfies Record<SupportedImageFormat, ImageMediaType>)

function processingConfiguration(): typeof imageReaderProcessing {
  const valid = imageReaderProcessing.schemaVersion === 1
    && Number.isFinite(imageReaderProcessing.resizeScale)
    && imageReaderProcessing.resizeScale > 0
    && imageReaderProcessing.resizeScale < 1
    && imageReaderProcessing.dimensionRounding === 'round'
    && Number.isSafeInteger(imageReaderProcessing.minimumDimension)
    && imageReaderProcessing.minimumDimension >= 1
    && imageReaderProcessing.preserveInputFormat === true
    && imageReaderProcessing.preserveAlpha === true
    && imageReaderProcessing.preserveAnimation === true
  if (!valid) {
    throw new TypeError('Image reader processing configuration must define the supported format-preserving resize behavior.')
  }
  return imageReaderProcessing
}

const PROCESSING = processingConfiguration()

function abort(signal?: AbortSignal): never {
  throw signal?.reason instanceof Error ? signal.reason : new DOMException('Image inspection was cancelled.', 'AbortError')
}

function imageFormat(data: Uint8Array): SupportedImageFormat | undefined {
  if (data.length >= 8
    && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47
    && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a
  ) return 'png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpeg'
  const ascii = (offset: number, value: string) => value
    .split('')
    .every((character, index) => data[offset + index] === character.charCodeAt(0))
  if (data.length >= 6 && (ascii(0, 'GIF87a') || ascii(0, 'GIF89a'))) return 'gif'
  if (data.length >= 12 && ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'webp'
  return undefined
}

async function readImage(filePath: string, maxImageBytes: number, signal?: AbortSignal): Promise<Uint8Array> {
  if (signal?.aborted === true) abort(signal)
  if (!isAbsolute(filePath)) {
    throw new ImageReaderError('IMAGE_READER_FILE_INVALID', 'The image path must be an absolute path to a PNG, JPEG, WebP, or GIF file.')
  }
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(filePath, 'r')
    const file = await handle.stat()
    if (!file.isFile() || file.size < 1 || file.size > maxImageBytes) throw new Error('invalid image file size')
    const data = new Uint8Array(file.size)
    let offset = 0
    while (offset < data.byteLength) {
      signal?.throwIfAborted()
      const { bytesRead } = await handle.read(data, offset, data.byteLength - offset, offset)
      if (bytesRead === 0) throw new Error('image file changed while reading')
      offset += bytesRead
    }
    return data
  } catch (error) {
    if (isAbortError(error, signal)) abort(signal)
    throw new ImageReaderError('IMAGE_READER_FILE_INVALID', 'The image file could not be read.', { cause: error })
  } finally {
    await handle?.close()
  }
}

export async function prepareImageReaderInput(
  filePath: string,
  maxImageBytes: number,
  signal?: AbortSignal,
): Promise<PreparedImageReaderInput> {
  const data = await readImage(filePath, maxImageBytes, signal)
  const format = imageFormat(data)
  if (format === undefined) {
    throw new ImageReaderError('IMAGE_READER_FILE_INVALID', 'The image file could not be read.')
  }
  try {
    signal?.throwIfAborted()
    const input = sharp(data, { animated: true, failOn: 'warning' })
    const metadata = await input.metadata()
    signal?.throwIfAborted()
    if (!Number.isSafeInteger(metadata.width) || metadata.width < 1) throw new Error('invalid image width')
    const frameHeight = metadata.pageHeight ?? metadata.height
    if (!Number.isSafeInteger(frameHeight) || frameHeight < 1) throw new Error('invalid image height')
    const targetLongSide = Math.max(
      PROCESSING.minimumDimension,
      Math.round(Math.max(metadata.width, frameHeight) * PROCESSING.resizeScale),
    )
    const resize = metadata.width >= frameHeight
      ? { width: targetLongSide, withoutEnlargement: true }
      : { height: targetLongSide, withoutEnlargement: true }
    let outputPipeline = input
      .resize(resize)
      .keepMetadata()
    if (format === 'jpeg') outputPipeline = outputPipeline.jpeg(PROCESSING.formatOptions.jpeg)
    if (format === 'png') outputPipeline = outputPipeline.png(PROCESSING.formatOptions.png)
    if (format === 'webp') {
      outputPipeline = outputPipeline.webp({
        ...PROCESSING.formatOptions.webp,
        ...(metadata.loop === undefined ? {} : { loop: metadata.loop }),
        ...(metadata.delay === undefined ? {} : { delay: metadata.delay }),
      })
    }
    if (format === 'gif') {
      outputPipeline = outputPipeline.gif({
        ...PROCESSING.formatOptions.gif,
        ...(metadata.loop === undefined ? {} : { loop: metadata.loop }),
        ...(metadata.delay === undefined ? {} : { delay: metadata.delay }),
      })
    }
    const output = await outputPipeline.toBuffer()
    signal?.throwIfAborted()
    if (output.byteLength > maxImageBytes) throw new Error('processed image exceeds image byte limit')
    return { data: output, mediaType: MEDIA_TYPES[format], name: basename(filePath) }
  } catch (error) {
    if (isAbortError(error, signal)) abort(signal)
    throw new ImageReaderError('IMAGE_READER_FILE_INVALID', 'The image file could not be read.', { cause: error })
  }
}

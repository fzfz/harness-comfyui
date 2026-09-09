import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { prepareImageReaderInput } from '../../src/host/image-reader/image-reader-input.ts'

const temporaryDirectories: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function temporaryFile(name: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'harness-comfyui-image-reader-input-'))
  temporaryDirectories.push(directory)
  return join(directory, name)
}

async function animatedFixture(format: 'gif' | 'webp', width = 20, frameHeight = 20): Promise<Buffer> {
  const pixels = Buffer.alloc(width * frameHeight * 2 * 4)
  for (let index = 0; index < width * frameHeight * 2; index += 1) {
    const firstFrame = index < width * frameHeight
    const x = index % width
    pixels.set(firstFrame
      ? [255, 0, 0, x >= Math.floor(width * 0.75) ? 0 : 255]
      : [0, 0, 255, x >= Math.floor(width * 0.75) ? 0 : 255], index * 4)
  }
  return sharp(pixels, { raw: { width, height: frameHeight * 2, pageHeight: frameHeight, channels: 4 } })
    .toFormat(format, { loop: 2, delay: [100, 200] })
    .toBuffer()
}

describe('prepareImageReaderInput', () => {
  it('resizes a PNG to seventy percent while preserving its format', async () => {
    const filePath = temporaryFile('input.png')
    await sharp({
      create: {
        width: 1000,
        height: 800,
        channels: 4,
        background: { r: 20, g: 40, b: 60, alpha: 0.5 },
      },
    }).png().toFile(filePath)
    const original = readFileSync(filePath)

    const result = await prepareImageReaderInput(filePath, 10 * 1024 * 1024)
    const metadata = await sharp(result.data, { animated: true }).metadata()

    expect(result).toMatchObject({ mediaType: 'image/png', name: 'input.png' })
    expect(metadata).toMatchObject({ format: 'png', width: 700, height: 560, hasAlpha: true })
    const pixels = await sharp(result.data).ensureAlpha().raw().toBuffer()
    expect(pixels[3]).toBeGreaterThan(0)
    expect(pixels[3]).toBeLessThan(255)
    expect(readFileSync(filePath)).toEqual(original)
  })

  it('resizes an exact portrait dimension to seventy percent', async () => {
    const filePath = temporaryFile('exact-portrait.png')
    await sharp({
      create: {
        width: 800,
        height: 1000,
        channels: 3,
        background: { r: 20, g: 40, b: 60 },
      },
    }).png().toFile(filePath)

    const result = await prepareImageReaderInput(filePath, 10 * 1024 * 1024)

    await expect(sharp(result.data).metadata()).resolves.toMatchObject({ width: 560, height: 700 })
  })

  it.each([
    ['jpeg', 'image/jpeg', 'input.jpeg'],
    ['webp', 'image/webp', 'input.webp'],
    ['gif', 'image/gif', 'input.gif'],
  ] as const)('preserves %s input as the same output format', async (format, mediaType, name) => {
    const filePath = temporaryFile(name)
    await sharp({
      create: {
        width: 100,
        height: 80,
        channels: 3,
        background: { r: 20, g: 40, b: 60 },
      },
    }).toFormat(format).toFile(filePath)

    const result = await prepareImageReaderInput(filePath, 10 * 1024 * 1024)
    const metadata = await sharp(result.data).metadata()

    expect(result).toMatchObject({ mediaType, name })
    expect(metadata).toMatchObject({ format, width: 70, height: 56 })
  })

  it.each(['gif', 'webp'] as const)('resizes every animated %s frame and preserves animation metadata', async (format) => {
    const filePath = temporaryFile(`animated.${format}`)
    writeFileSync(filePath, await animatedFixture(format))

    const result = await prepareImageReaderInput(filePath, 10 * 1024 * 1024)
    const metadata = await sharp(result.data, { animated: true }).metadata()

    expect(metadata).toMatchObject({
      format,
      width: 14,
      height: 28,
      pageHeight: 14,
      pages: 2,
      loop: 2,
      delay: [100, 200],
      hasAlpha: true,
    })
    const { data: pixels, info } = await sharp(result.data, { animated: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const secondFrameOffset = info.width * info.pageHeight! * info.channels
    expect(pixels[0]).toBeGreaterThan(pixels[2]!)
    expect(pixels[3]).toBe(255)
    expect(pixels[secondFrameOffset + 2]!).toBeGreaterThan(pixels[secondFrameOffset]!)
    const alphaValues = Array.from({ length: pixels.length / info.channels }, (_, index) => pixels[index * info.channels + 3]!)
    expect(Math.min(...alphaValues)).toBe(0)
    expect(Math.max(...alphaValues)).toBe(255)
  })

  it('uses each frame height when scaling a portrait animation', async () => {
    const filePath = temporaryFile('portrait-animation.gif')
    writeFileSync(filePath, await animatedFixture('gif', 10, 20))

    const result = await prepareImageReaderInput(filePath, 10 * 1024 * 1024)

    await expect(sharp(result.data, { animated: true }).metadata()).resolves.toMatchObject({
      format: 'gif', width: 7, height: 28, pageHeight: 14, pages: 2,
    })
  })

  it('rounds the longer side to the nearest seventy-percent pixel for portrait images', async () => {
    const filePath = temporaryFile('portrait.png')
    await sharp({
      create: {
        width: 101,
        height: 303,
        channels: 3,
        background: { r: 20, g: 40, b: 60 },
      },
    }).png().toFile(filePath)

    const result = await prepareImageReaderInput(filePath, 10 * 1024 * 1024)

    await expect(sharp(result.data).metadata()).resolves.toMatchObject({ width: 71, height: 212 })
  })

  it.each([
    [303, 101, 212, 71],
    [303, 303, 212, 212],
  ] as const)('rounds a %d×%d input from its long side', async (width, height, expectedWidth, expectedHeight) => {
    const filePath = temporaryFile(`rounded-${width}x${height}.png`)
    await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 20, g: 40, b: 60 },
      },
    }).png().toFile(filePath)

    const result = await prepareImageReaderInput(filePath, 10 * 1024 * 1024)

    await expect(sharp(result.data).metadata()).resolves.toMatchObject({
      width: expectedWidth,
      height: expectedHeight,
    })
  })

  it.each([
    [1, 1, 1, 1],
    [1, 2, 1, 1],
    [2, 1, 1, 1],
  ] as const)('keeps a minimum one-pixel dimension for %d×%d input', async (width, height, expectedWidth, expectedHeight) => {
    const filePath = temporaryFile(`minimum-${width}x${height}.png`)
    await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 20, g: 40, b: 60 },
      },
    }).png().toFile(filePath)

    const result = await prepareImageReaderInput(filePath, 10 * 1024 * 1024)

    await expect(sharp(result.data).metadata()).resolves.toMatchObject({
      width: expectedWidth,
      height: expectedHeight,
    })
    expect(Buffer.from(result.data)).not.toEqual(readFileSync(filePath))
  })

  it('preserves EXIF orientation without rotating the encoded pixel matrix', async () => {
    const filePath = temporaryFile('oriented.jpeg')
    await sharp({
      create: {
        width: 100,
        height: 80,
        channels: 3,
        background: { r: 20, g: 40, b: 60 },
      },
    }).withMetadata({ orientation: 6 }).jpeg({ quality: 100 }).toFile(filePath)

    const result = await prepareImageReaderInput(filePath, 10 * 1024 * 1024)

    await expect(sharp(result.data).metadata()).resolves.toMatchObject({
      format: 'jpeg', width: 70, height: 56, orientation: 6,
    })
  })

  it('rejects an output that exceeds the configured image byte limit', async () => {
    const filePath = temporaryFile('low-quality.jpeg')
    const pixels = Buffer.alloc(40 * 40 * 3)
    for (let index = 0; index < pixels.length; index += 1) pixels[index] = (index * 37 + index * index * 13) % 256
    await sharp(pixels, { raw: { width: 40, height: 40, channels: 3 } })
      .jpeg({ quality: 1 })
      .toFile(filePath)
    expect(readFileSync(filePath).byteLength).toBeLessThan(500)

    await expect(prepareImageReaderInput(filePath, 500)).rejects.toMatchObject({ code: 'IMAGE_READER_FILE_INVALID' })
  })

  it('rejects relative, missing, directory, empty, and oversized inputs', async () => {
    await expect(prepareImageReaderInput('relative.png', 1024)).rejects.toMatchObject({
      code: 'IMAGE_READER_FILE_INVALID',
    })

    const missingPath = temporaryFile('missing.png')
    await expect(prepareImageReaderInput(missingPath, 1024)).rejects.toMatchObject({
      code: 'IMAGE_READER_FILE_INVALID',
    })

    const directoryPath = temporaryFile('directory.png')
    mkdirSync(directoryPath)
    await expect(prepareImageReaderInput(directoryPath, 1024)).rejects.toMatchObject({
      code: 'IMAGE_READER_FILE_INVALID',
    })

    const emptyPath = temporaryFile('empty.png')
    writeFileSync(emptyPath, '')
    await expect(prepareImageReaderInput(emptyPath, 1024)).rejects.toMatchObject({
      code: 'IMAGE_READER_FILE_INVALID',
    })

    const oversizedPath = temporaryFile('oversized.png')
    writeFileSync(oversizedPath, Buffer.alloc(1025))
    await expect(prepareImageReaderInput(oversizedPath, 1024)).rejects.toMatchObject({
      code: 'IMAGE_READER_FILE_INVALID',
    })
  })

  it('rejects unsupported bytes and a PNG signature without decodable metadata', async () => {
    const unsupportedPath = temporaryFile('unsupported.png')
    writeFileSync(unsupportedPath, 'not an image')
    await expect(prepareImageReaderInput(unsupportedPath, 1024)).rejects.toMatchObject({ code: 'IMAGE_READER_FILE_INVALID' })

    const truncatedPath = temporaryFile('truncated.png')
    writeFileSync(truncatedPath, Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    await expect(prepareImageReaderInput(truncatedPath, 1024)).rejects.toMatchObject({ code: 'IMAGE_READER_FILE_INVALID' })
  })

  it.each(['width', 'height'] as const)('rejects decoded metadata without a valid %s', async (missingDimension) => {
    const filePath = temporaryFile(`missing-${missingDimension}.png`)
    await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 20, g: 40, b: 60 },
      },
    }).png().toFile(filePath)
    vi.spyOn(sharp.prototype, 'metadata').mockResolvedValueOnce({
      format: 'png',
      ...(missingDimension === 'width' ? { height: 10 } : { width: 10 }),
    })

    await expect(prepareImageReaderInput(filePath, 1024)).rejects.toMatchObject({
      code: 'IMAGE_READER_FILE_INVALID',
    })
  })

  it('stops before image processing when the caller has already cancelled', async () => {
    const filePath = temporaryFile('cancelled.png')
    await sharp({
      create: {
        width: 100,
        height: 80,
        channels: 3,
        background: { r: 20, g: 40, b: 60 },
      },
    }).png().toFile(filePath)
    const controller = new AbortController()
    controller.abort(new DOMException('cancelled by caller', 'AbortError'))

    await expect(prepareImageReaderInput(filePath, 1024, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('stops after a real AbortSignal is cancelled while Sharp is processing', async () => {
    const filePath = temporaryFile('cancelled-during-processing.png')
    await sharp({
      create: {
        width: 100,
        height: 80,
        channels: 3,
        background: { r: 20, g: 40, b: 60 },
      },
    }).png().toFile(filePath)
    const controller = new AbortController()
    const reason = new DOMException('cancelled during image processing', 'AbortError')
    const cancelConversion = () => {
      if (!controller.signal.aborted) controller.abort(reason)
    }
    sharp.queue.on('change', cancelConversion)
    try {
      await expect(prepareImageReaderInput(filePath, 1024, controller.signal)).rejects.toBe(reason)
      expect(controller.signal.aborted).toBe(true)
    } finally {
      sharp.queue.off('change', cancelConversion)
    }
  })
})

import { mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import errorCatalog from '../../config/error-catalog.json' with { type: 'json' }
import { ImageReaderService } from '../../src/host/image-reader/image-reader-service.ts'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-image-reader-'))
  temporaryDirectories.push(root)
  const filePath = join(root, 'result.png')
  writeFileSync(filePath, Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const scope = {
    get: vi.fn(() => ({
      configuration: {
        provider: 'vision-provider',
        model: 'vision-model',
        defaultPrompt: '默认读图提示词',
        temperature: 0.35,
        maxTokens: 1536,
      },
    })),
  }
  const imageLimits = {
    maxImageBytes: 1024,
    maxImagesPerMessage: 1,
    maxMessageImageBytes: 1024,
    maxImagePixels: 1_000_000,
    maxImageDimension: 4096,
    mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  } as const
  const attachment = {
    attachmentId: 'attachment_1', mediaType: 'image/png', bytes: 8, width: 1, height: 1,
  }
  const saveImage = vi.fn(async () => attachment)
  const stream = vi.fn(async function* () {
    yield { type: 'text-delta', index: 0, text: '主体为白发角色。' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  })
  const prepareCall = vi.fn(async (): Promise<any> => ({
    config: { provider: 'vision-provider', model: 'vision-model', temperature: 0.35, maxTokens: 1536 },
    inputModalities: ['text', 'image'],
    stream,
  }))
  return {
    filePath,
    scope,
    saveImage,
    prepareCall,
    service: new ImageReaderService({ scope, attachments: { imageLimits, saveImage }, llm: { prepareCall } } as never),
  }
}

describe('ImageReaderService', () => {
  it('publishes every image reading error code in the project error catalog', () => {
    expect(Object.keys(errorCatalog).filter(code => code.startsWith('IMAGE_READER_')).sort()).toEqual([
      'IMAGE_READER_ATTACHMENT_FAILED',
      'IMAGE_READER_EMPTY_RESPONSE',
      'IMAGE_READER_FILE_INVALID',
      'IMAGE_READER_MODEL_IMAGE_UNSUPPORTED',
      'IMAGE_READER_MODEL_NOT_CONFIGURED',
      'IMAGE_READER_MODEL_UNAVAILABLE',
      'IMAGE_READER_PROVIDER_FAILED',
      'IMAGE_READER_SETTINGS_INVALID',
    ])
  })

  it('reads one image with the configured independent route and default prompt', async () => {
    const { service, filePath, saveImage, prepareCall } = fixture()

    await expect(service.inspect(filePath, undefined, new AbortController().signal)).resolves.toEqual({
      provider: 'vision-provider',
      model: 'vision-model',
      filePath,
      observation: '主体为白发角色。',
    })
    expect(saveImage).toHaveBeenCalledWith(expect.objectContaining({ mediaType: 'image/png', name: 'result.png' }))
    expect(prepareCall).toHaveBeenCalledWith({
      provider: 'vision-provider', model: 'vision-model', temperature: 0.35, maxTokens: 1536,
    }, expect.any(AbortSignal))
    const request = (await prepareCall.mock.results[0]!.value).stream.mock.calls[0]![0]
    expect(request.messages[0].content).toEqual([
      { type: 'text', text: '默认读图提示词' },
      { type: 'image', attachment: expect.objectContaining({ attachmentId: 'attachment_1' }) },
    ])
  })

  it('uses a non-empty command prompt without changing stored settings', async () => {
    const { service, filePath, scope, prepareCall } = fixture()

    await service.inspect(filePath, '只描述构图', new AbortController().signal)

    const request = (await prepareCall.mock.results[0]!.value).stream.mock.calls[0]![0]
    expect(request.messages[0].content[0]).toEqual({ type: 'text', text: '只描述构图' })
    expect(scope.get).toHaveBeenCalledOnce()
  })

  it.each([
    [{ provider: '', model: 'model' }, 'IMAGE_READER_MODEL_NOT_CONFIGURED'],
    [{ provider: 'provider', model: '' }, 'IMAGE_READER_MODEL_NOT_CONFIGURED'],
  ])('rejects incomplete route settings %#', async (patch, code) => {
    const { service, filePath, scope } = fixture()
    scope.get.mockReturnValue({
      configuration: {
        provider: patch.provider,
        model: patch.model,
        defaultPrompt: 'prompt',
        temperature: 0.2,
        maxTokens: 1000,
      },
    })
    await expect(service.inspect(filePath)).rejects.toMatchObject({ code })
  })

  it('rejects unsupported paths and models without image input capability', async () => {
    const { service, filePath, prepareCall } = fixture()
    await expect(service.inspect(join(tmpdir(), 'missing.png'))).rejects.toMatchObject({ code: 'IMAGE_READER_FILE_INVALID' })
    prepareCall.mockResolvedValueOnce({
      config: { provider: 'vision-provider', model: 'vision-model', temperature: 0.35, maxTokens: 1536 },
      inputModalities: ['text'],
      stream: vi.fn(),
    })
    await expect(service.inspect(filePath)).rejects.toMatchObject({ code: 'IMAGE_READER_MODEL_IMAGE_UNSUPPORTED' })
  })

  it('uses the encoded image signature and rejects invalid or oversized files before attachment admission', async () => {
    const mismatch = fixture()
    const jpegPath = join(mismatch.filePath, '..', 'mislabeled.png')
    writeFileSync(jpegPath, Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))
    await mismatch.service.inspect(jpegPath)
    expect(mismatch.saveImage).toHaveBeenCalledWith(expect.objectContaining({ mediaType: 'image/jpeg' }))

    const invalid = fixture()
    writeFileSync(invalid.filePath, 'not an image')
    await expect(invalid.service.inspect(invalid.filePath)).rejects.toMatchObject({ code: 'IMAGE_READER_FILE_INVALID' })
    expect(invalid.saveImage).not.toHaveBeenCalled()

    const oversized = fixture()
    truncateSync(oversized.filePath, 1025)
    await expect(oversized.service.inspect(oversized.filePath)).rejects.toMatchObject({ code: 'IMAGE_READER_FILE_INVALID' })
    expect(oversized.saveImage).not.toHaveBeenCalled()
  })

  it('maps provider failure and empty output into stable errors', async () => {
    const { service, filePath, prepareCall } = fixture()
    prepareCall.mockResolvedValueOnce({
      config: { provider: 'vision-provider', model: 'vision-model', temperature: 0.35, maxTokens: 1536 },
      inputModalities: ['image'],
      stream: async function* () {
        yield { type: 'finish', reason: { kind: 'error', failure: { code: 'REMOTE', message: 'failed' } } }
      },
    })
    await expect(service.inspect(filePath)).rejects.toMatchObject({ code: 'IMAGE_READER_PROVIDER_FAILED' })

    prepareCall.mockResolvedValueOnce({
      config: { provider: 'vision-provider', model: 'vision-model', temperature: 0.35, maxTokens: 1536 },
      inputModalities: ['image'],
      stream: async function* () {
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    })
    await expect(service.inspect(filePath)).rejects.toMatchObject({ code: 'IMAGE_READER_EMPTY_RESPONSE' })
  })

  it('maps attachment admission and model preparation failures into stable errors', async () => {
    const attachmentFailure = fixture()
    attachmentFailure.saveImage.mockRejectedValueOnce(new Error('invalid bytes'))
    await expect(attachmentFailure.service.inspect(attachmentFailure.filePath))
      .rejects.toMatchObject({ code: 'IMAGE_READER_ATTACHMENT_FAILED' })

    const modelFailure = fixture()
    modelFailure.prepareCall.mockRejectedValueOnce(new Error('route missing'))
    await expect(modelFailure.service.inspect(modelFailure.filePath))
      .rejects.toMatchObject({ code: 'IMAGE_READER_MODEL_UNAVAILABLE' })
  })

  it('preserves caller cancellation as AbortError', async () => {
    const { service, filePath, saveImage } = fixture()
    const controller = new AbortController()
    controller.abort(new DOMException('cancelled', 'AbortError'))
    await expect(service.inspect(filePath, undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(saveImage).not.toHaveBeenCalled()
  })
})

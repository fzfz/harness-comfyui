import { Buffer } from 'node:buffer'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { vi } from 'vitest'

import { createImageReaderProfile } from '../../src/image-reader/settings.ts'
import { ImageReaderService } from '../../src/host/image-reader/image-reader-service.ts'

export const IMAGE_READER_FORBIDDEN_SOURCE_SENTINELS = Object.freeze([
  'CREDENTIAL_SENTINEL',
  'ENDPOINT_SENTINEL',
  'PROMPT_SENTINEL',
  'IMAGE_INPUT_SENTINEL',
  'ATTACHMENT_REF_SENTINEL',
  'FAILURE_MESSAGE_SENTINEL',
])

export const IMAGE_READER_SENTINEL_PROMPT = 'PROMPT_SENTINEL'

export function createImageReaderProviderFailureFixture() {
  const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-image-reader-failure-'))
  const filePath = join(root, 'sentinel.png')
  writeFileSync(filePath, Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...Buffer.from('IMAGE_INPUT_SENTINEL'),
  ]))
  const scope = {
    get: vi.fn(() => ({
      configuration: {
        activeProfileId: 'runtime-profile',
        profiles: [{
          ...createImageReaderProfile('runtime-profile', '生产视觉配置'),
          provider: 'opencode-go',
          endpoint: 'ENDPOINT_SENTINEL',
          model: 'qwen3.8-flash',
          defaultPrompt: 'PROMPT_SENTINEL',
          temperature: 0.1,
          maxTokens: 8192,
        }],
      },
      credentials: { 'runtime-profile': 'CREDENTIAL_SENTINEL' },
    })),
    replace: vi.fn(async () => undefined),
  }
  const saveImage = vi.fn(async () => ({
    attachmentId: 'ATTACHMENT_REF_SENTINEL', mediaType: 'image/png' as const, bytes: 28, width: 1, height: 1,
  }))
  const prepareCall = vi.fn(async (): Promise<any> => ({
    config: { provider: 'opencode-go', model: 'qwen3.8-flash', temperature: 0.1, maxTokens: 8192 },
    inputModalities: ['text', 'image'],
    stream: async function* () {
      yield {
        type: 'finish',
        reason: {
          kind: 'error',
          failure: {
            code: 'UPSTREAM_IMAGE_ERROR',
            message: 'FAILURE_MESSAGE_SENTINEL',
            status: 422,
            providerRetryAfterMs: 1250,
            requestId: 'request-123',
          },
        },
      }
    },
  }))
  const service = new ImageReaderService({
    scope,
    attachments: {
      imageLimits: {
        maxImageBytes: 1024,
        maxImagesPerMessage: 1,
        maxMessageImageBytes: 1024,
        maxImagePixels: 1_000_000,
        maxImageDimension: 4096,
        mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
      },
      saveImage,
    },
    llm: { prepareCall },
  } as never)
  return Object.freeze({
    filePath,
    prepareCall,
    saveImage,
    scope,
    service,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  })
}

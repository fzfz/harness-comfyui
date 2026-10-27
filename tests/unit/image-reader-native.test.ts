import { describe, expect, it, vi } from 'vitest'
import { ImageReaderService } from '../../src/host/image-reader/image-reader-service.ts'
import { createImageReaderProfile } from '../../src/image-reader/settings.ts'

describe('native image reader model calls', () => {
  it('prepares migrated settings before reading the native model route', async () => {
    let migrated = false
    const prepare = vi.fn(async () => { migrated = true })
    const prepareCall = vi.fn(async (config: unknown) => ({ config, inputModalities: ['text', 'image'], async *stream() { yield { type: 'text-delta', index: 0, text: 'Native observation' } } }))
    const saveImage = vi.fn(async () => ({ attachmentId: 'native-image' }))
    const profile = { ...createImageReaderProfile('custom'), provider: 'native-custom', model: 'visual' }
    const service = new ImageReaderService({
      scope: { prepare, get: () => {
        return { configuration: { activeProfileId: 'custom', profiles: [{ ...profile, provider: migrated ? profile.provider : '' }] }, credentialRefs: {} }
      } },
      attachments: { imageLimits: { maxImageBytes: 1024 }, saveImage },
      prepareInput: async () => ({ data: new Uint8Array([1]), mediaType: 'image/png', name: 'sample.png' }),
      llm: { prepareCall },
    } as never)
    await expect(service.inspect('/sample.png')).resolves.toMatchObject({ provider: 'native-custom', observation: 'Native observation' })
    expect(prepare).toHaveBeenCalledOnce()
    expect(saveImage).toHaveBeenCalledOnce()
    expect(prepareCall).toHaveBeenCalledWith(expect.objectContaining({ provider: 'native-custom', model: 'visual' }), undefined)
  })
  it('reports a native max-tokens finish as an incomplete observation', async () => {
    const profile = { ...createImageReaderProfile('vision'), provider: 'vision', model: 'vision-model' }
    const service = new ImageReaderService({
      scope: { get: () => ({ configuration: { activeProfileId: profile.id, profiles: [profile] }, credentialRefs: {} }) },
      prepareInput: async () => ({ data: new Uint8Array([1]), mediaType: 'image/png', name: 'sample.png' }),
      attachments: { imageLimits: { maxImageBytes: 1024 } as never, saveImage: vi.fn(async () => ({ attachmentId: 'image' } as never)) },
      llm: { prepareCall: vi.fn(async () => ({
        config: { provider: 'vision', model: 'vision-model' },
        inputModalities: ['text', 'image'],
        async *stream() {
          yield { type: 'text-delta', index: 0, text: 'Partial observation' }
          yield { type: 'finish', reason: { kind: 'max-tokens' } }
        },
      } as never)) },
    })
    await expect(service.inspect('/sample.png')).rejects.toMatchObject({ code: 'IMAGE_READER_OUTPUT_LIMIT' })
  })
})

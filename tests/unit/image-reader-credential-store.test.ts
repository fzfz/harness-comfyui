import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { describe, expect, it, vi } from 'vitest'

import { IMAGE_READER_CREDENTIAL_REF_PREFIX } from '../../src/image-reader/credential-schema.ts'
import { imageReaderCredentialStore } from '../../src/host/image-reader/credential-store.ts'

describe('image reader credential store', () => {
  it('creates a fresh plugin-owned SDK reference for each allocation', () => {
    const provider = {
      describe: vi.fn(async () => ({ configured: false, writable: true })),
      resolve: vi.fn(async () => undefined),
      set: vi.fn(async () => undefined),
      unset: vi.fn(async () => undefined),
    }
    const store = imageReaderCredentialStore(provider as never)

    const first = store.createRef()
    const second = store.createRef()

    expect(String(first)).toMatch(new RegExp(`^${IMAGE_READER_CREDENTIAL_REF_PREFIX}[0-9a-f]{32}$`, 'u'))
    expect(second).not.toBe(first)
    expect(provider.describe).not.toHaveBeenCalled()
  })

  it('forwards only validated plugin references and preserves the SDK credential result', async () => {
    const expectedReference = `DSH_HARNESS_COMFYUI_IMAGE_READER_${'a'.repeat(32)}`
    const expectedResolved = { value: 'provider-owned-secret', source: 'user-env' }
    const provider = {
      describe: vi.fn(async () => ({ configured: true, source: 'user-env', writable: true })),
      resolve: vi.fn(async () => expectedResolved),
      set: vi.fn(async () => undefined),
      unset: vi.fn(async () => undefined),
    }
    const store = imageReaderCredentialStore(provider as never)
    const reference = credentialRef(expectedReference) as never

    await expect(store.describe(reference)).resolves.toEqual({ configured: true, source: 'user-env', writable: true })
    await expect(store.resolve(reference)).resolves.toBe(expectedResolved)
    await store.set(reference, 'provider-owned-secret')
    await store.unset(reference)

    expect(provider.describe).toHaveBeenCalledWith(reference)
    expect(provider.resolve).toHaveBeenCalledWith(reference)
    expect(provider.set).toHaveBeenCalledWith(reference, 'provider-owned-secret')
    expect(provider.unset).toHaveBeenCalledWith(reference)
  })

  it('rejects external SDK references before they reach the provider', async () => {
    const provider = {
      describe: vi.fn(async () => ({ configured: false, writable: true })),
      resolve: vi.fn(async () => undefined),
      set: vi.fn(async () => undefined),
      unset: vi.fn(async () => undefined),
    }
    const store = imageReaderCredentialStore(provider as never)
    const externalReference = credentialRef('OPENAI_API_KEY') as never

    await expect(store.describe(externalReference)).rejects.toThrow('Image reader credential reference is invalid.')
    expect(provider.describe).not.toHaveBeenCalled()
    await expect(store.resolve(externalReference)).rejects.toThrow('Image reader credential reference is invalid.')
    expect(provider.resolve).not.toHaveBeenCalled()
    await expect(store.set(externalReference, 'secret')).rejects.toThrow('Image reader credential reference is invalid.')
    expect(provider.set).not.toHaveBeenCalled()
    await expect(store.unset(externalReference)).rejects.toThrow('Image reader credential reference is invalid.')
    expect(provider.unset).not.toHaveBeenCalled()
  })
})

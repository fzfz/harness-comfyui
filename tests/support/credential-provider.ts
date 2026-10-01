import type { CredentialRef } from '@deepseek-ai/dsh-credentials/types'
import { vi } from 'vitest'

export function createTestCredentialProvider() {
  const values = new Map<CredentialRef, string>()
  return {
    values,
    describe: vi.fn(async (ref: CredentialRef) => ({
      configured: values.has(ref),
      writable: true,
      ...(values.has(ref) ? { source: 'test' } : {}),
    })),
    resolve: vi.fn(async (ref: CredentialRef) => {
      const value = values.get(ref)
      return value === undefined ? undefined : { value, source: 'test' }
    }),
    set: vi.fn(async (ref: CredentialRef, value: string) => { values.set(ref, value) }),
    unset: vi.fn(async (ref: CredentialRef) => { values.delete(ref) }),
  }
}

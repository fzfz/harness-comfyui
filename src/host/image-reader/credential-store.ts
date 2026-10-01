import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef, type CredentialInfo, type ResolvedCredential } from '@deepseek-ai/dsh-credentials'

import {
  IMAGE_READER_CREDENTIAL_REF_PREFIX,
  isImageReaderCredentialRef,
  type ImageReaderCredentialRef,
} from '../../image-reader/credential-schema.ts'

export type ImageReaderCredentialProvider = Pick<Context['credentials'], 'describe' | 'resolve' | 'set' | 'unset'>

export interface ImageReaderCredentialStore {
  createRef(): ImageReaderCredentialRef
  describe(reference: ImageReaderCredentialRef): Promise<CredentialInfo>
  resolve(reference: ImageReaderCredentialRef): Promise<ResolvedCredential | undefined>
  set(reference: ImageReaderCredentialRef, value: string): Promise<void>
  unset(reference: ImageReaderCredentialRef): Promise<void>
}

function toSdkReference(reference: ImageReaderCredentialRef): ReturnType<typeof credentialRef> {
  const value = String(reference)
  if (!isImageReaderCredentialRef(value)) {
    throw new TypeError('Image reader credential reference is invalid.')
  }
  return credentialRef(value)
}

export function imageReaderCredentialStore(provider: ImageReaderCredentialProvider): ImageReaderCredentialStore {
  return Object.freeze({
    createRef(): ImageReaderCredentialRef {
      const value = `${IMAGE_READER_CREDENTIAL_REF_PREFIX}${randomUUID().replaceAll('-', '')}`
      if (!isImageReaderCredentialRef(value)) throw new TypeError('Image reader credential reference format is invalid.')
      return credentialRef(value)
    },
    async describe(reference: ImageReaderCredentialRef) {
      return provider.describe(toSdkReference(reference))
    },
    async resolve(reference: ImageReaderCredentialRef) {
      return provider.resolve(toSdkReference(reference))
    },
    async set(reference: ImageReaderCredentialRef, value: string) {
      return provider.set(toSdkReference(reference), value)
    },
    async unset(reference: ImageReaderCredentialRef) {
      return provider.unset(toSdkReference(reference))
    },
  })
}

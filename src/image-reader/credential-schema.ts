import runtime from '../../config/image-reader-runtime.json' with { type: 'json' }
import Schema from '@deepseek-ai/schemastery'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials/types'

export type ImageReaderCredentialRef = CredentialRef
export type ImageReaderCredentialFailureStage = 'staged-cleanup' | 'committed-cleanup'

export interface ImageReaderCredentialFailure {
  readonly reference: ImageReaderCredentialRef
  readonly stage: ImageReaderCredentialFailureStage
  readonly profileCommitted: boolean
}

export const IMAGE_READER_CREDENTIAL_REF_PREFIX = runtime.credentialReferencePrefix
export const IMAGE_READER_CREDENTIAL_REF_PATTERN = new RegExp(
  `^${IMAGE_READER_CREDENTIAL_REF_PREFIX.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}[0-9a-f]{32}$`,
  'u',
)

export const imageReaderCredentialRefSchema = Schema.string().pattern(IMAGE_READER_CREDENTIAL_REF_PATTERN)
export const imageReaderCredentialsSchema = Schema.dict(imageReaderCredentialRefSchema)
export const imageReaderCredentialFailureSchema = Schema.object({
  reference: imageReaderCredentialRefSchema.required(),
  stage: Schema.union(['staged-cleanup', 'committed-cleanup'].map(value => Schema.const(value))).required(),
  profileCommitted: Schema.boolean().required(),
})

export function createImageReaderCredentialFailure(
  reference: ImageReaderCredentialRef,
  stage: ImageReaderCredentialFailureStage,
): ImageReaderCredentialFailure {
  const failure = Object.freeze({
    reference,
    stage,
    profileCommitted: stage === 'committed-cleanup',
  })
  imageReaderCredentialFailureSchema(failure)
  return failure
}

export function isImageReaderCredentialRef(value: unknown): value is ImageReaderCredentialRef {
  return typeof value === 'string' && IMAGE_READER_CREDENTIAL_REF_PATTERN.test(value)
}

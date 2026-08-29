import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'

import {
  IMAGE_READER_REMOTE_NAMESPACE,
  parseImageReaderModelCatalog,
  type ImageReaderModelCatalog,
} from './contract.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    harnessComfyuiImageReader: {
      models: () => Promise<RemoteResult<ImageReaderModelCatalog>>
    }
  }

  interface TypertRemoteMap {
    'harnessComfyuiImageReader/models': () => Promise<RemoteResult<ImageReaderModelCatalog>>
  }
}

export const IMAGE_READER_REMOTE: TypertRemoteContribution = Object.freeze({
  package: 'harness-comfyui',
  descriptors: Object.freeze([Object.freeze({
    id: 'harness-comfyui#harnessComfyuiImageReader/models',
    service: IMAGE_READER_REMOTE_NAMESPACE,
    namespace: IMAGE_READER_REMOTE_NAMESPACE,
    method: 'models',
    invocation: Object.freeze({ kind: 'direct' as const }),
    parameters: Object.freeze([]),
    cancellation: Object.freeze({ parameter: 'signal' as const }),
    result: Object.freeze({
      mode: 'strict' as const,
      typeSymbol: 'harness-comfyui/image-reader#ImageReaderModelCatalog',
      schema: Object.freeze({ parse: parseImageReaderModelCatalog }),
    }),
  })]),
})

export default IMAGE_READER_REMOTE

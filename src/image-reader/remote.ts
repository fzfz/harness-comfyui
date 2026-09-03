import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'

import {
  IMAGE_READER_REMOTE_NAMESPACE,
  parseActivateImageReaderProfileRequest,
  parseActivateImageReaderProfileResult,
  parseDeleteImageReaderProfileRequest,
  parseDeleteImageReaderProfileResult,
  parseImageReaderModelCatalog,
  parseSaveImageReaderProfileRequest,
  parseSaveImageReaderProfileResult,
  type ActivateImageReaderProfileRequest,
  type ActivateImageReaderProfileResult,
  type DeleteImageReaderProfileRequest,
  type DeleteImageReaderProfileResult,
  type ImageReaderModelCatalog,
  type SaveImageReaderProfileRequest,
  type SaveImageReaderProfileResult,
} from './contract.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    harnessComfyuiImageReader: {
      models: () => Promise<RemoteResult<ImageReaderModelCatalog>>
      activateProfile: (request: ActivateImageReaderProfileRequest) => Promise<RemoteResult<ActivateImageReaderProfileResult>>
      saveProfile: (request: SaveImageReaderProfileRequest) => Promise<RemoteResult<SaveImageReaderProfileResult>>
      deleteProfile: (request: DeleteImageReaderProfileRequest) => Promise<RemoteResult<DeleteImageReaderProfileResult>>
    }
  }

  interface TypertRemoteMap {
    'harnessComfyuiImageReader/models': () => Promise<RemoteResult<ImageReaderModelCatalog>>
    'harnessComfyuiImageReader/activateProfile': (request: ActivateImageReaderProfileRequest) => Promise<RemoteResult<ActivateImageReaderProfileResult>>
    'harnessComfyuiImageReader/saveProfile': (request: SaveImageReaderProfileRequest) => Promise<RemoteResult<SaveImageReaderProfileResult>>
    'harnessComfyuiImageReader/deleteProfile': (request: DeleteImageReaderProfileRequest) => Promise<RemoteResult<DeleteImageReaderProfileResult>>
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
  }), Object.freeze({
    id: 'harness-comfyui#harnessComfyuiImageReader/activateProfile',
    service: IMAGE_READER_REMOTE_NAMESPACE,
    namespace: IMAGE_READER_REMOTE_NAMESPACE,
    method: 'activateProfile',
    invocation: Object.freeze({ kind: 'direct' as const }),
    parameters: Object.freeze([Object.freeze({
      name: 'request',
      wire: 'request',
      source: 'json' as const,
      codec: Object.freeze({
        mode: 'strict' as const,
        typeSymbol: 'harness-comfyui/image-reader#ActivateImageReaderProfileRequest',
        schema: Object.freeze({ parse: parseActivateImageReaderProfileRequest }),
      }),
    })]),
    cancellation: Object.freeze({ parameter: 'signal' as const }),
    result: Object.freeze({
      mode: 'strict' as const,
      typeSymbol: 'harness-comfyui/image-reader#ActivateImageReaderProfileResult',
      schema: Object.freeze({ parse: parseActivateImageReaderProfileResult }),
    }),
  }), Object.freeze({
    id: 'harness-comfyui#harnessComfyuiImageReader/saveProfile',
    service: IMAGE_READER_REMOTE_NAMESPACE,
    namespace: IMAGE_READER_REMOTE_NAMESPACE,
    method: 'saveProfile',
    invocation: Object.freeze({ kind: 'direct' as const }),
    parameters: Object.freeze([Object.freeze({
      name: 'request',
      wire: 'request',
      source: 'json' as const,
      codec: Object.freeze({
        mode: 'strict' as const,
        typeSymbol: 'harness-comfyui/image-reader#SaveImageReaderProfileRequest',
        schema: Object.freeze({ parse: parseSaveImageReaderProfileRequest }),
      }),
    })]),
    cancellation: Object.freeze({ parameter: 'signal' as const }),
    result: Object.freeze({
      mode: 'strict' as const,
      typeSymbol: 'harness-comfyui/image-reader#SaveImageReaderProfileResult',
      schema: Object.freeze({ parse: parseSaveImageReaderProfileResult }),
    }),
  }), Object.freeze({
    id: 'harness-comfyui#harnessComfyuiImageReader/deleteProfile',
    service: IMAGE_READER_REMOTE_NAMESPACE,
    namespace: IMAGE_READER_REMOTE_NAMESPACE,
    method: 'deleteProfile',
    invocation: Object.freeze({ kind: 'direct' as const }),
    parameters: Object.freeze([Object.freeze({
      name: 'request',
      wire: 'request',
      source: 'json' as const,
      codec: Object.freeze({
        mode: 'strict' as const,
        typeSymbol: 'harness-comfyui/image-reader#DeleteImageReaderProfileRequest',
        schema: Object.freeze({ parse: parseDeleteImageReaderProfileRequest }),
      }),
    })]),
    cancellation: Object.freeze({ parameter: 'signal' as const }),
    result: Object.freeze({
      mode: 'strict' as const,
      typeSymbol: 'harness-comfyui/image-reader#DeleteImageReaderProfileResult',
      schema: Object.freeze({ parse: parseDeleteImageReaderProfileResult }),
    }),
  })]),
})

export default IMAGE_READER_REMOTE

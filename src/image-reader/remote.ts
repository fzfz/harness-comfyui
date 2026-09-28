import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'

import {
  IMAGE_READER_REMOTE_NAMESPACE,
  parseActivateImageReaderProfileRequest,
  parseActivateImageReaderProfileResult,
  parseDeleteImageReaderProfileRequest,
  parseDeleteImageReaderProfileResult,
  parseImageReaderModelCatalog,
  parseImageReaderCurrentConfiguration,
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
import type { ImageReaderConfiguration } from './settings.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    harnessComfyuiImageReader: {
      models: () => Promise<RemoteResult<ImageReaderModelCatalog>>
      configuration: () => Promise<RemoteResult<ImageReaderConfiguration>>
      activateProfile: (request: ActivateImageReaderProfileRequest) => Promise<RemoteResult<ActivateImageReaderProfileResult>>
      saveProfile: (request: SaveImageReaderProfileRequest) => Promise<RemoteResult<SaveImageReaderProfileResult>>
      deleteProfile: (request: DeleteImageReaderProfileRequest) => Promise<RemoteResult<DeleteImageReaderProfileResult>>
    }
  }

  interface TypertRemoteMap {
    'harnessComfyuiImageReader/models': () => Promise<RemoteResult<ImageReaderModelCatalog>>
    'harnessComfyuiImageReader/configuration': () => Promise<RemoteResult<ImageReaderConfiguration>>
    'harnessComfyuiImageReader/activateProfile': (request: ActivateImageReaderProfileRequest) => Promise<RemoteResult<ActivateImageReaderProfileResult>>
    'harnessComfyuiImageReader/saveProfile': (request: SaveImageReaderProfileRequest) => Promise<RemoteResult<SaveImageReaderProfileResult>>
    'harnessComfyuiImageReader/deleteProfile': (request: DeleteImageReaderProfileRequest) => Promise<RemoteResult<DeleteImageReaderProfileResult>>
  }
}

export const IMAGE_READER_REMOTE = Object.freeze({
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
      create: () => Object.freeze({ parse: parseImageReaderModelCatalog }),
    }),
  }), Object.freeze({
    id: 'harness-comfyui#harnessComfyuiImageReader/configuration',
    service: IMAGE_READER_REMOTE_NAMESPACE,
    namespace: IMAGE_READER_REMOTE_NAMESPACE,
    method: 'configuration',
    invocation: Object.freeze({ kind: 'direct' as const }),
    parameters: Object.freeze([]),
    cancellation: Object.freeze({ parameter: 'signal' as const }),
    result: Object.freeze({
      mode: 'strict' as const,
      typeSymbol: 'harness-comfyui/image-reader#ImageReaderConfiguration',
      create: () => Object.freeze({ parse: parseImageReaderCurrentConfiguration }),
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
        create: () => Object.freeze({ parse: parseActivateImageReaderProfileRequest }),
      }),
    })]),
    cancellation: Object.freeze({ parameter: 'signal' as const }),
    result: Object.freeze({
      mode: 'strict' as const,
      typeSymbol: 'harness-comfyui/image-reader#ActivateImageReaderProfileResult',
      create: () => Object.freeze({ parse: parseActivateImageReaderProfileResult }),
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
        create: () => Object.freeze({ parse: parseSaveImageReaderProfileRequest }),
      }),
    })]),
    cancellation: Object.freeze({ parameter: 'signal' as const }),
    result: Object.freeze({
      mode: 'strict' as const,
      typeSymbol: 'harness-comfyui/image-reader#SaveImageReaderProfileResult',
      create: () => Object.freeze({ parse: parseSaveImageReaderProfileResult }),
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
        create: () => Object.freeze({ parse: parseDeleteImageReaderProfileRequest }),
      }),
    })]),
    cancellation: Object.freeze({ parameter: 'signal' as const }),
    result: Object.freeze({
      mode: 'strict' as const,
      typeSymbol: 'harness-comfyui/image-reader#DeleteImageReaderProfileResult',
      create: () => Object.freeze({ parse: parseDeleteImageReaderProfileResult }),
    }),
  })]),
}) satisfies TypertRemoteContribution

export default IMAGE_READER_REMOTE

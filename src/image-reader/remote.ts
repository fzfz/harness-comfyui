import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'

import {
  IMAGE_READER_REMOTE_NAMESPACE,
  parseImageReaderModelCatalog,
  parseSaveImageReaderSettingsRequest,
  parseSaveImageReaderSettingsResult,
  type ImageReaderModelCatalog,
  type SaveImageReaderSettingsRequest,
  type SaveImageReaderSettingsResult,
} from './contract.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    harnessComfyuiImageReader: {
      models: () => Promise<RemoteResult<ImageReaderModelCatalog>>
      saveSettings: (request: SaveImageReaderSettingsRequest) => Promise<RemoteResult<SaveImageReaderSettingsResult>>
    }
  }

  interface TypertRemoteMap {
    'harnessComfyuiImageReader/models': () => Promise<RemoteResult<ImageReaderModelCatalog>>
    'harnessComfyuiImageReader/saveSettings': (request: SaveImageReaderSettingsRequest) => Promise<RemoteResult<SaveImageReaderSettingsResult>>
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
    id: 'harness-comfyui#harnessComfyuiImageReader/saveSettings',
    service: IMAGE_READER_REMOTE_NAMESPACE,
    namespace: IMAGE_READER_REMOTE_NAMESPACE,
    method: 'saveSettings',
    invocation: Object.freeze({ kind: 'direct' as const }),
    parameters: Object.freeze([Object.freeze({
      name: 'request',
      wire: 'request',
      source: 'json' as const,
      codec: Object.freeze({
        mode: 'strict' as const,
        typeSymbol: 'harness-comfyui/image-reader#SaveImageReaderSettingsRequest',
        schema: Object.freeze({ parse: parseSaveImageReaderSettingsRequest }),
      }),
    })]),
    cancellation: Object.freeze({ parameter: 'signal' as const }),
    result: Object.freeze({
      mode: 'strict' as const,
      typeSymbol: 'harness-comfyui/image-reader#SaveImageReaderSettingsResult',
      schema: Object.freeze({ parse: parseSaveImageReaderSettingsResult }),
    }),
  })]),
})

export default IMAGE_READER_REMOTE

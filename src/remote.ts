import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'

import GENERATION_REMOTE from './generation/remote.ts'
import IMAGE_READER_REMOTE from './image-reader/remote.ts'
import {
  CATALOG_REMOTE_NAMESPACE,
  parseBaseModelResult,
  parseCatalogPageResult,
  parseCatalogQueryRequest,
  type BaseModelList,
  type CatalogPage,
  type CatalogQueryRequest,
  type CatalogOperationResult,
} from './catalog/contract.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    harnessComfyuiCatalog: {
      search: (request: CatalogQueryRequest) => Promise<RemoteResult<CatalogOperationResult<CatalogPage>>>
      baseModels: () => Promise<RemoteResult<CatalogOperationResult<BaseModelList>>>
    }
  }

  interface TypertRemoteMap {
    'harnessComfyuiCatalog/search': (request: CatalogQueryRequest) => Promise<RemoteResult<CatalogOperationResult<CatalogPage>>>
    'harnessComfyuiCatalog/baseModels': () => Promise<RemoteResult<CatalogOperationResult<BaseModelList>>>
  }
}

export const CATALOG_REMOTE: TypertRemoteContribution = Object.freeze({
  package: 'harness-comfyui',
  descriptors: Object.freeze([Object.freeze({
    id: 'harness-comfyui#harnessComfyuiCatalog/search',
    service: CATALOG_REMOTE_NAMESPACE,
    namespace: CATALOG_REMOTE_NAMESPACE,
    method: 'search',
    invocation: Object.freeze({ kind: 'direct' as const }),
    parameters: Object.freeze([Object.freeze({
      name: 'request',
      wire: 'request',
      source: 'json' as const,
      codec: Object.freeze({
        mode: 'strict' as const,
        typeSymbol: 'harness-comfyui/catalog#CatalogQueryRequest',
        schema: Object.freeze({ parse: parseCatalogQueryRequest }),
      }),
    })]),
    cancellation: Object.freeze({ parameter: 'signal' as const }),
    result: Object.freeze({
      mode: 'strict' as const,
      typeSymbol: 'harness-comfyui/catalog#CatalogPageResult',
      schema: Object.freeze({ parse: parseCatalogPageResult }),
    }),
  }), Object.freeze({
    id: 'harness-comfyui#harnessComfyuiCatalog/baseModels',
    service: CATALOG_REMOTE_NAMESPACE,
    namespace: CATALOG_REMOTE_NAMESPACE,
    method: 'baseModels',
    invocation: Object.freeze({ kind: 'direct' as const }),
    parameters: Object.freeze([]),
    cancellation: Object.freeze({ parameter: 'signal' as const }),
    result: Object.freeze({
      mode: 'strict' as const,
      typeSymbol: 'harness-comfyui/catalog#BaseModelResult',
      schema: Object.freeze({ parse: parseBaseModelResult }),
    }),
  })]),
})

export const HARNESS_COMFYUI_REMOTE: TypertRemoteContribution = Object.freeze({
  package: CATALOG_REMOTE.package,
  descriptors: Object.freeze([
    ...CATALOG_REMOTE.descriptors,
    ...GENERATION_REMOTE.descriptors,
    ...IMAGE_READER_REMOTE.descriptors,
  ]),
})

export default HARNESS_COMFYUI_REMOTE

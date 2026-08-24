import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'

import {
  CATALOG_REMOTE_NAMESPACE,
  parseBaseModelList,
  parseCatalogPage,
  parseCatalogQueryRequest,
  type BaseModelList,
  type CatalogPage,
  type CatalogQueryRequest,
} from './catalog/contract.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    harnessComfyuiCatalog: {
      search: (request: CatalogQueryRequest) => Promise<RemoteResult<CatalogPage>>
      baseModels: () => Promise<RemoteResult<BaseModelList>>
    }
  }

  interface TypertRemoteMap {
    'harnessComfyuiCatalog/search': (request: CatalogQueryRequest) => Promise<RemoteResult<CatalogPage>>
    'harnessComfyuiCatalog/baseModels': () => Promise<RemoteResult<BaseModelList>>
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
      typeSymbol: 'harness-comfyui/catalog#CatalogPage',
      schema: Object.freeze({ parse: parseCatalogPage }),
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
      typeSymbol: 'harness-comfyui/catalog#BaseModelList',
      schema: Object.freeze({ parse: parseBaseModelList }),
    }),
  })]),
})

export default CATALOG_REMOTE

import { parseCatalogDetailsRequest, parseCatalogDetailsResult, type CatalogDetailsRequest, type CatalogDetails } from './catalog/details-schema.ts'
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { SourceAddress } from './source-settings.ts'

import GENERATION_REMOTE from './generation/remote.ts'
import IMAGE_READER_REMOTE from './image-reader/remote.ts'
import {
  CATALOG_REMOTE_NAMESPACE,
  parseBaseModelResult,
  parseCatalogPageResult,
  parseCatalogQueryRequest,
  parseCatalogSourceAddressResult,
  type BaseModelList,
  type CatalogPage,
  type CatalogQueryRequest,
  type CatalogOperationResult,
} from './catalog/contract.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    harnessComfyuiCatalog: {
      details: (request: CatalogDetailsRequest) => Promise<RemoteResult<CatalogOperationResult<CatalogDetails>>>
      search: (request: CatalogQueryRequest) => Promise<RemoteResult<CatalogOperationResult<CatalogPage>>>
      baseModels: () => Promise<RemoteResult<CatalogOperationResult<BaseModelList>>>
      sourceAddress: () => Promise<RemoteResult<CatalogOperationResult<SourceAddress>>>
    }
  }

  interface TypertRemoteMap {
    'harnessComfyuiCatalog/details': (request: CatalogDetailsRequest) => Promise<RemoteResult<CatalogOperationResult<CatalogDetails>>>
    'harnessComfyuiCatalog/search': (request: CatalogQueryRequest) => Promise<RemoteResult<CatalogOperationResult<CatalogPage>>>
    'harnessComfyuiCatalog/baseModels': () => Promise<RemoteResult<CatalogOperationResult<BaseModelList>>>
    'harnessComfyuiCatalog/sourceAddress': () => Promise<RemoteResult<CatalogOperationResult<SourceAddress>>>
  }
}

export const CATALOG_REMOTE = Object.freeze({
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
        create: () => Object.freeze({ parse: parseCatalogQueryRequest }),
      }),
    })]),
    cancellation: Object.freeze({ parameter: 'signal' as const }),
    result: Object.freeze({
      mode: 'strict' as const,
      typeSymbol: 'harness-comfyui/catalog#CatalogPageResult',
      create: () => Object.freeze({ parse: parseCatalogPageResult }),
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
      create: () => Object.freeze({ parse: parseBaseModelResult }),
    }),
  }), Object.freeze({
    id: 'harness-comfyui#harnessComfyuiCatalog/sourceAddress',
    service: CATALOG_REMOTE_NAMESPACE,
    namespace: CATALOG_REMOTE_NAMESPACE,
    method: 'sourceAddress',
    invocation: Object.freeze({ kind: 'direct' as const }),
    parameters: Object.freeze([]),
    cancellation: Object.freeze({ parameter: 'signal' as const }),
    result: Object.freeze({
      mode: 'strict' as const,
      typeSymbol: 'harness-comfyui/catalog#CatalogSourceAddressResult',
      create: () => Object.freeze({ parse: parseCatalogSourceAddressResult }),
    }),
  }), Object.freeze({
    id: 'harness-comfyui#harnessComfyuiCatalog/details',
    service: CATALOG_REMOTE_NAMESPACE,
    namespace: CATALOG_REMOTE_NAMESPACE,
    method: 'details',
    invocation: Object.freeze({ kind: 'direct' as const }),
    parameters: Object.freeze([Object.freeze({
      name: 'request', wire: 'request', source: 'json' as const,
      codec: Object.freeze({ mode: 'strict' as const, typeSymbol: 'harness-comfyui/catalog#CatalogDetailsRequest', create: () => Object.freeze({ parse: parseCatalogDetailsRequest }) }),
    })]),
    cancellation: Object.freeze({ parameter: 'signal' as const }),
    result: Object.freeze({ mode: 'strict' as const, typeSymbol: 'harness-comfyui/catalog#CatalogDetailsResult', create: () => Object.freeze({ parse: parseCatalogDetailsResult }) }),
  })]),
}) satisfies TypertRemoteContribution

export const HARNESS_COMFYUI_REMOTE = Object.freeze({
  package: CATALOG_REMOTE.package,
  descriptors: Object.freeze([
    ...CATALOG_REMOTE.descriptors,
    ...GENERATION_REMOTE.descriptors,
    ...IMAGE_READER_REMOTE.descriptors,
  ]),
}) satisfies TypertRemoteContribution

export default HARNESS_COMFYUI_REMOTE

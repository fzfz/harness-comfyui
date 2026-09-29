import type { CatalogDetailsRequest, CatalogDetails } from '../../catalog/details-schema.ts'
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

import {
  CATALOG_REMOTE_NAMESPACE,
  catalogOperationFailure,
  catalogOperationSuccess,
  type BaseModelList,
  type CatalogOperationResult,
  type CatalogPage,
  type CatalogQueryRequest,
} from '../../catalog/contract.ts'
import { CatalogCliError, type CatalogCli } from './catalog-cli.ts'
import type { SourceAddress } from '../../source-settings.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    harnessComfyuiCatalog: CatalogRemoteService
  }
}

export class CatalogRemoteService extends TypertRemoteService {
  private readonly catalog: CatalogCli
  private readonly readSourceAddress: () => SourceAddress

  constructor(ctx: Context, catalog: CatalogCli, readSourceAddress: () => SourceAddress) {
    super(ctx, CATALOG_REMOTE_NAMESPACE)
    this.catalog = catalog
    this.readSourceAddress = readSourceAddress
    for (const initialize of catalogRemoteInitializers) initialize(this)
  }

  async search(request: CatalogQueryRequest, signal: AbortSignal): Promise<CatalogOperationResult<CatalogPage>> {
    try {
      return catalogOperationSuccess(await this.catalog.search(request, signal))
    } catch (error) {
      if (error instanceof CatalogCliError) {
        return catalogOperationFailure({ code: error.code, message: error.message })
      }
      throw error
    }
  }

  async details(request: CatalogDetailsRequest, signal: AbortSignal): Promise<CatalogOperationResult<CatalogDetails>> {
    try {
      return catalogOperationSuccess(await this.catalog.details(request, signal))
    } catch (error) {
      if (error instanceof CatalogCliError) return catalogOperationFailure({ code: error.code, message: error.message })
      throw error
    }
  }

  async baseModels(signal: AbortSignal): Promise<CatalogOperationResult<BaseModelList>> {
    try {
      return catalogOperationSuccess(await this.catalog.baseModels(signal))
    } catch (error) {
      if (error instanceof CatalogCliError) {
        return catalogOperationFailure({ code: error.code, message: error.message })
      }
      throw error
    }
  }

  async sourceAddress(signal: AbortSignal): Promise<CatalogOperationResult<SourceAddress>> {
    signal.throwIfAborted()
    return catalogOperationSuccess(this.readSourceAddress())
  }
}

const catalogRemoteInitializers: Array<(service: CatalogRemoteService) => void> = []

Remote(CatalogRemoteService.prototype.search, {
  private: false,
  static: false,
  name: 'search',
  addInitializer(initialize: (this: CatalogRemoteService) => void) {
    catalogRemoteInitializers.push(service => initialize.call(service))
  },
} as never)

Remote(CatalogRemoteService.prototype.baseModels, {
  private: false,
  static: false,
  name: 'baseModels',
  addInitializer(initialize: (this: CatalogRemoteService) => void) {
    catalogRemoteInitializers.push(service => initialize.call(service))
  },
} as never)

Remote(CatalogRemoteService.prototype.sourceAddress, {
  private: false,
  static: false,
  name: 'sourceAddress',
  addInitializer(initialize: (this: CatalogRemoteService) => void) {
    catalogRemoteInitializers.push(service => initialize.call(service))
  },
} as never)

Remote(CatalogRemoteService.prototype.details, {
  private: false, static: false, name: 'details',
  addInitializer(initialize: (this: CatalogRemoteService) => void) {
    catalogRemoteInitializers.push(service => initialize.call(service))
  },
} as never)

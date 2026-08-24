import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

import {
  CATALOG_REMOTE_NAMESPACE,
  type BaseModelList,
  type CatalogPage,
  type CatalogQueryRequest,
} from '../../catalog/contract.ts'
import type { CatalogCli } from './catalog-cli.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    harnessComfyuiCatalog: CatalogRemoteService
  }
}

export class CatalogRemoteService extends TypertRemoteService {
  private readonly catalog: CatalogCli

  constructor(ctx: Context, catalog: CatalogCli) {
    super(ctx, CATALOG_REMOTE_NAMESPACE)
    this.catalog = catalog
    for (const initialize of catalogRemoteInitializers) initialize(this)
  }

  search(request: CatalogQueryRequest, signal: AbortSignal): Promise<CatalogPage> {
    return this.catalog.search(request, signal)
  }

  baseModels(signal: AbortSignal): Promise<BaseModelList> {
    return this.catalog.baseModels(signal)
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

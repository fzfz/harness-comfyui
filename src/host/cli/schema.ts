import type { IncomingMessage, ServerResponse } from 'node:http'

import {
  CATALOG_COMFYUI_INSTANCE_QUERY,
  type CatalogComfyuiInstancePage,
  type CatalogPage,
  type CatalogQueryRequest,
  type CatalogResolvedGenerationModel,
  type CatalogResolvedLora,
  type CatalogResolvedTemplate,
} from '../../catalog/contract.ts'
import {
  type GenerationRuntime
} from '../generation/generation-runtime.ts'
import type { ImageReaderService } from '../image-reader/image-reader-service.ts'
import type {
  CliShellCapabilityStore
} from './shell-capability.ts'

interface CliCatalog {
  resolveTemplate(id: string, signal: AbortSignal): Promise<CatalogResolvedTemplate>
  resolveGenerationModel(id: string, signal: AbortSignal): Promise<CatalogResolvedGenerationModel>
  resolveLora(id: string, signal: AbortSignal): Promise<CatalogResolvedLora>
  queryComfyuiInstances(
    input: typeof CATALOG_COMFYUI_INSTANCE_QUERY,
    signal: AbortSignal,
  ): Promise<CatalogComfyuiInstancePage>
  search(input: CatalogQueryRequest, signal: AbortSignal): Promise<CatalogPage>
}

export interface CliHandlerOptions {
  readonly capabilities: Pick<CliShellCapabilityStore, 'authorize'>
  readonly catalog: CliCatalog
  readonly runtime: Pick<
    GenerationRuntime,
    'acceptGeneration' | 'inspectTemplateRuntimeParameters' | 'readGenerationRunInputs' | 'readGenerationRunMedia'
  >
  readonly imageReader: Pick<ImageReaderService, 'inspect'>
  readonly workspaceRegistry: {
    resolveByPath(path: string): Promise<{
      readonly id: string | number
      readonly sessionIds: readonly (string | number)[]
    } | undefined>
  }
}

export type CliHandler = (request: IncomingMessage, response: ServerResponse) => void | Promise<void>

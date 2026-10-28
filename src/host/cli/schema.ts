import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WorkspaceRegistryProjection } from '../generation/workspace-access.ts'

import {
  type GenerationRuntime
} from '../generation/generation-runtime.ts'
import type { ImageReaderService } from '../image-reader/image-reader-service.ts'
import type {
  CliShellCapabilityStore
} from './shell-capability.ts'

export interface CliHandlerOptions {
  readonly capabilities: Pick<CliShellCapabilityStore, 'authorize'>
  readonly runtime: Pick<
    GenerationRuntime,
    'acceptGenerations' | 'inspectTemplateRuntimeParameters' | 'readGenerationRunInputs' | 'readGenerationRunMedia'
  >
  readonly imageReader: Pick<ImageReaderService, 'inspect'>
  readonly workspaceRegistry: WorkspaceRegistryProjection
}

export type CliHandler = (request: IncomingMessage, response: ServerResponse) => void | Promise<void>

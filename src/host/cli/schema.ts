import type { IncomingMessage, ServerResponse } from 'node:http'

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

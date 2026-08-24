import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'

import {
  GENERATION_REMOTE_NAMESPACE,
  parseGenerationProjection,
  parseGenerationProjectionRequest,
  type GenerationProjection,
  type GenerationProjectionRequest,
} from './contract.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    harnessComfyuiGeneration: {
      list: (request: GenerationProjectionRequest) => Promise<RemoteResult<GenerationProjection>>
    }
  }

  interface TypertRemoteMap {
    'harnessComfyuiGeneration/list': (request: GenerationProjectionRequest) => Promise<RemoteResult<GenerationProjection>>
  }
}

export const GENERATION_REMOTE: TypertRemoteContribution = Object.freeze({
  package: 'harness-comfyui',
  descriptors: Object.freeze([Object.freeze({
    id: 'harness-comfyui#harnessComfyuiGeneration/list',
    service: GENERATION_REMOTE_NAMESPACE,
    namespace: GENERATION_REMOTE_NAMESPACE,
    method: 'list',
    invocation: Object.freeze({ kind: 'direct' as const }),
    parameters: Object.freeze([Object.freeze({
      name: 'request',
      wire: 'request',
      source: 'json' as const,
      codec: Object.freeze({
        mode: 'strict' as const,
        typeSymbol: 'harness-comfyui/generation#GenerationProjectionRequest',
        schema: Object.freeze({ parse: parseGenerationProjectionRequest }),
      }),
    })]),
    cancellation: Object.freeze({ parameter: 'signal' as const }),
    result: Object.freeze({
      mode: 'strict' as const,
      typeSymbol: 'harness-comfyui/generation#GenerationProjection',
      schema: Object.freeze({ parse: parseGenerationProjection }),
    }),
  })]),
})

export default GENERATION_REMOTE

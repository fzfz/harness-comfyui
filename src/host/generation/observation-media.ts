import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'

import { MAX_RUN_INPUT_QUERY_IDS } from '../../generation/run-input-contract.ts'
import type { AvailableGenerationRunMedia } from '../../image-reader/run-media-contract.ts'
import { GenerationRuntimeError, type GenerationRuntime } from './generation-runtime.ts'
import { deriveGenerationToolExecutionIdentity } from './tool-execution-identity.ts'

export interface ObservationMediaReference {
  readonly run_id: string
  readonly media_id: string
}

export interface ResolvedObservationMedia extends ObservationMediaReference {
  readonly path: string
}

export async function resolveObservationMedia(
  services: {
    readonly runtime: Pick<GenerationRuntime, 'readGenerationRunMedia'>
    readonly workspaceRegistry: Pick<WorkspaceRegistry, 'resolveByPath'>
  },
  exec: ToolRunContext,
  toolName: string,
  images: readonly ObservationMediaReference[],
): Promise<readonly ResolvedObservationMedia[]> {
  exec.signal.throwIfAborted()
  if (!Array.isArray(images) || images.length === 0) throw new GenerationRuntimeError(
    'GENERATION_PARAMETER_INVALID', 'images must contain at least one object with run_id and media_id. Select saved images from a Generation Run media query.',
  )
  for (const [index, image] of images.entries()) {
    if (image === null || typeof image !== 'object' || Array.isArray(image)
      || Object.keys(image).some(field => field !== 'run_id' && field !== 'media_id')) {
      throw new GenerationRuntimeError('GENERATION_PARAMETER_INVALID', `images[${index}] must be an object containing only run_id and media_id.`)
    }
    for (const field of ['run_id', 'media_id'] as const) {
      if (typeof image[field] !== 'string' || image[field].trim().length === 0) {
        throw new GenerationRuntimeError('GENERATION_PARAMETER_INVALID', `images[${index}].${field} must be a non-empty string from the Generation Run media query.`)
      }
    }
  }
  const identity = await deriveGenerationToolExecutionIdentity(services.workspaceRegistry, exec, toolName)
  const runIds = [...new Set(images.map(image => image.run_id))]
  const runs = new Map<string, AvailableGenerationRunMedia>()
  for (let offset = 0; offset < runIds.length; offset += MAX_RUN_INPUT_QUERY_IDS) {
    exec.signal.throwIfAborted()
    const batch = runIds.slice(offset, offset + MAX_RUN_INPUT_QUERY_IDS)
    const result = await services.runtime.readGenerationRunMedia({ workspaceId: identity.workspaceId, runIds: batch }, exec.signal)
    for (const [index, run] of result.runs.entries()) {
      if (run.lookup_status === 'error') throw new GenerationRuntimeError(run.error.code, run.error.message)
      runs.set(batch[index]!, run)
    }
  }
  exec.signal.throwIfAborted()
  return images.map(image => {
    const run = runs.get(image.run_id)!
    const media = run.images.find(value => value.media_id === image.media_id)
    if (media === undefined) throw new GenerationRuntimeError(
      'GENERATION_MEDIA_NOT_FOUND',
      `Generation Run ${run.run_id} has no saved image with media_id ${image.media_id}. Query its media and select an available media_id.`,
    )
    return Object.freeze({ run_id: run.run_id, media_id: media.media_id, path: media.file_path })
  })
}

import { CATALOG_COMFYUI_INSTANCE_QUERY } from '../../catalog/contract.ts'
import { toGenerationRequest, type CliRequest } from '../../cli/contract.ts'
import { GenerationRuntimeError } from '../generation/generation-runtime.ts'
import type { CliHandlerOptions } from './schema.ts'
import type { CliExecutionIdentity } from './shell-capability.ts'
const RANDOM_SEED_MAX_EXCLUSIVE = 2_147_483_648
function ordinaryRandomSeeds(count: number): readonly number[] {
  const seeds = new Set<number>()
  while (seeds.size < count) seeds.add(Math.floor(Math.random() * RANDOM_SEED_MAX_EXCLUSIVE))
  return Object.freeze([...seeds])
}

async function generationIdentity(
  options: CliHandlerOptions,
  identity: CliExecutionIdentity,
) {
  const workspace = await options.workspaceRegistry.resolveByPath(identity.cwd)
  if (
    workspace === undefined
    || !workspace.sessionIds.some(sessionId => String(sessionId) === identity.sessionId)
  ) {
    throw new GenerationRuntimeError(
      'GENERATION_WORKSPACE_REQUIRED',
      'The current Session is not attached to a Harness Workspace.',
    )
  }
  return Object.freeze({
    workspaceId: String(workspace.id),
    sessionId: identity.sessionId,
    turn: identity.turn,
    callId: identity.callId,
  })
}

export async function dispatch(
  options: CliHandlerOptions,
  identity: CliExecutionIdentity,
  request: CliRequest,
  signal: AbortSignal,
): Promise<unknown> {
  switch (request.command) {
    case 'catalog.template.resolve':
      return options.catalog.resolveTemplate(request.id, signal)
    case 'catalog.generation-model.resolve':
      return options.catalog.resolveGenerationModel(request.id, signal)
    case 'catalog.lora.resolve':
      return options.catalog.resolveLora(request.id, signal)
    case 'catalog.instance.list':
      return options.catalog.queryComfyuiInstances(CATALOG_COMFYUI_INSTANCE_QUERY, signal)
    case 'catalog.search':
      return options.catalog.search({
        kind: request.kind,
        query: request.query,
        page: request.page,
        baseModelId: request.base_model_id,
      }, signal)
    case 'generation.submit': {
      const owner = await generationIdentity(options, identity)
      const accepted = await options.runtime.acceptGeneration(owner, toGenerationRequest(request.request), signal)
      return Object.freeze({ run_id: accepted.runId })
    }
    case 'generation.inspect-template-parameters':
      return options.runtime.inspectTemplateRuntimeParameters({
        templateId: request.template_id,
        instanceId: request.instance_id,
      }, signal)
    case 'generation.random-seeds':
      return Object.freeze({ seeds: ordinaryRandomSeeds(request.count) })
    case 'generation.run-inputs': {
      const owner = await generationIdentity(options, identity)
      return options.runtime.readGenerationRunInputs({
        workspaceId: owner.workspaceId,
        runIds: request.run_ids,
      }, signal)
    }
    case 'generation.resolve-media': {
      const owner = await generationIdentity(options, identity)
      return options.runtime.readGenerationRunMedia({
        workspaceId: owner.workspaceId,
        runIds: request.run_ids,
      }, signal)
    }
    case 'image.inspect': {
      const result = await options.imageReader.inspect(request.file_path, {
        prompt: request.prompt,
        sessionId: identity.sessionId,
        signal,
      })
      return Object.freeze({
        provider: result.provider,
        model: result.model,
        file_path: result.filePath,
        observation: result.observation,
      })
    }
  }
}

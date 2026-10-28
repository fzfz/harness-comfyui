import { toGenerationRequest, type CliRequest } from '../../cli/contract.ts'
import { resolveGenerationWorkspaceId } from '../generation/workspace-access.ts'
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
  const workspaceId = await resolveGenerationWorkspaceId(options.workspaceRegistry, identity.cwd)
  return Object.freeze({
    workspaceId,
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
    case 'generation.submit': {
      const owner = await generationIdentity(options, identity)
      const accepted = await options.runtime.acceptGenerations(owner, request.items.map(item => ({
        requestId: item.request_id,
        request: toGenerationRequest(item.request),
      })), signal)
      return Object.freeze({ items: Object.freeze(accepted.items.map(item => Object.freeze({
        request_id: item.requestId,
        run_id: item.runId,
        acceptance: item.acceptance,
      }))) })
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
        includeParameters: request.include_parameters,
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

import { toGenerationRequest, type CliRequest } from '../../cli/contract.ts'
import { resolveGenerationWorkspaceId } from '../generation/workspace-access.ts'
import type { CliHandlerOptions } from './schema.ts'
import type { CliExecutionIdentity } from './shell-capability.ts'
import { RANDOM_SEED_MAX_EXCLUSIVE } from '../../generation/submission-contract.ts'

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
    case 'workbench.task.get':
    case 'workbench.task.publish':
    case 'workbench.experiment.end': {
      if (!options.workbench) throw new Error('Workbench service is unavailable')
      const owner = await generationIdentity(options, identity)
      if (request.command === 'workbench.task.get') return options.workbench.getTask({ taskId: request.task_id }, owner)
      if (request.command === 'workbench.task.publish') return options.workbench.publish({ taskId: request.task_id, artifact: request.artifact }, owner)
      return options.workbench.endExperiment({ taskId: request.task_id, reason: request.reason }, owner)
    }
    case 'generation.submit': {
      const owner = await generationIdentity(options, identity)
      await options.workbench?.authorizeGeneration(request.workbench_task_id ?? null, owner)
      const accepted = await options.runtime.acceptGenerations(owner, request.items.map(item => ({
        requestId: item.request_id,
        request: toGenerationRequest(item.request),
      })), signal, request.workbench_task_id)
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
    case 'generation.wait': {
      const owner = await generationIdentity(options, identity)
      return options.runWait.register({
        workspaceId: owner.workspaceId,
        sessionId: identity.sessionId,
        callId: identity.callId,
        rootCallId: identity.rootCallId,
      }, request.run_ids, signal)
    }
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

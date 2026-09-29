import { Service, type Context, type Logger } from '@deepseek-ai/cordis'

import runtimeArtifacts from '../../../config/runtime-artifacts.json' with { type: 'json' }
import { loadProfile } from '../../config/load-profile.ts'
import {
  configuredSourceAddress,
  readSourceAddress,
  type SourceAddress,
} from '../../source-settings.ts'
import { CatalogCli } from '../catalog/catalog-cli.ts'
import {
  createComfyuiInstanceQueryTool,
  createGenerationModelResolverTool,
  createLoraResolverTool,
  createTemplateResolverTool,
} from '../catalog/catalog-tool.ts'
import type { FrontendAttemptDiagnostic } from '../generation/comfy-frontend-browser.ts'
import { NodeWorkerComfyFrontend } from '../generation/comfy-frontend-worker-client.ts'
import { ComfyHttpTransport } from '../generation/comfy-http-transport.ts'
import { GenerationCoordinator } from '../generation/generation-coordinator.ts'
import { createGenerationRunMediaTool } from '../generation/generation-media-tool.ts'
import { generationRunInputToolForContext } from '../generation/generation-run-input-tool.ts'
import {
  GenerationRuntime,
  type GenerationRunInputLookupErrorReport,
} from '../generation/generation-runtime.ts'
import { generationToolForContext } from '../generation/generation-tool.ts'
import { OfficialApiWorkflowCompiler } from '../generation/official-api-workflow.ts'
import { GenerationSourceCli } from '../generation/source-cli.ts'
import { SourceGenerationPreparer } from '../generation/source-preparer.ts'
import { ComfyWorkflowCompiler } from '../generation/workflow-compiler.ts'
import { registerProjectTools } from '../tools/register-project-tools.ts'

import { repositoryResource } from '../resource-path.ts'
export { Config } from './schema.ts'
import { Config, type CoreServices } from './schema.ts'

export const name = 'harness-comfyui-core'
export const inject = ['tools', 'workspaceRegistry'] as const


declare module '@deepseek-ai/cordis' { interface Context { harnessComfyuiCore: ComfyuiCoreService } }
export class ComfyuiCoreService extends Service {
  constructor(ctx: Context, readonly services: CoreServices) { super(ctx, 'harnessComfyuiCore') }
}

export function reportGenerationRunInputLookupError(
  logger: Pick<Logger, 'error'>,
  { workspaceId, runId, error }: GenerationRunInputLookupErrorReport,
): void {
  logger.error(
    'Historical Generation Run input lookup failed for Workspace %s and Run %s.',
    workspaceId,
    runId,
  )
  logger.error(error)
}

export function reportFrontendAttemptDiagnostic(
  logger: Pick<Logger, 'error' | 'info'>,
  diagnostic: FrontendAttemptDiagnostic,
): void {
  const serialized = JSON.stringify(diagnostic)
  if (diagnostic.status === 'failed') {
    logger.error('Official ComfyUI frontend browser attempt diagnostic: %s', serialized)
  } else {
    logger.info('Official ComfyUI frontend browser attempt diagnostic: %s', serialized)
  }
}

/** Validate the selected Configuration Profile before Host startup completes. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const {
    HARNESS_COMFYUI_CONFIGURATION_PROFILE: _profileSelector,
    HARNESS_COMFYUI_STARTUP_WORKSPACE_PATH: _startupWorkspacePath,
    ...environment
  } = process.env
  const profile = loadProfile(config.configurationProfile, { environment })
  if (config.startupWorkspacePath !== undefined) {
    await ctx.workspaceRegistry.create(config.startupWorkspacePath)
  }
  const sourceSettings = {
    get(): SourceAddress {
      return configuredSourceAddress(config.configuration, profile.source.catalogPort)
    },
  }
  const semanticQueryClientPath = repositoryResource('scripts/source-client/imagegen-semantic-query.mjs')
  const sourceReadClientPath = repositoryResource('scripts/source-client/imagegen-comfyui-source-read.mjs')
  const catalog = new CatalogCli({
    executable: semanticQueryClientPath,
    settings: sourceSettings,
  })
  const source = new GenerationSourceCli({
    executable: sourceReadClientPath,
    settings: sourceSettings,
  })
  const generationLogger = ctx.logger('harness-comfyui')
  const frontendCompiler = new NodeWorkerComfyFrontend({
    nodeExecutable: 'node',
    workerModulePath: repositoryResource(runtimeArtifacts.frontendCompilerWorker.outputEntryRelativePath),
    browserExecutablePath: profile.comfyui.frontendCompiler.browserExecutablePath,
    timeoutMs: profile.comfyui.frontendCompiler.timeoutMs,
    preReadiness: profile.comfyui.frontendCompiler.preReadiness,
    reportDiagnostic: reportFrontendAttemptDiagnostic.bind(undefined, generationLogger),
  })
  const officialApiWorkflowCompiler = new OfficialApiWorkflowCompiler({
    cacheDirectory: profile.paths.apiWorkflowCacheDirectory,
    instanceCacheEpoch: profile.comfyui.frontendCompiler.instanceCacheEpoch,
    frontend: frontendCompiler,
  })
  const runtime = new GenerationRuntime({
    runRepositoryFile: profile.paths.runRepositoryFile,
    runDirectory: profile.paths.runDirectory,
    savedMediaDirectory: profile.paths.savedMediaDirectory,
    preparer: new SourceGenerationPreparer({
      defaultInstanceId: profile.comfyui.defaultInstanceId,
      source,
      compiler: new ComfyWorkflowCompiler({
        timeoutMs: profile.comfyui.frontendCompiler.timeoutMs,
        officialApiWorkflowCompiler,
      }),
    }),
    transport: new ComfyHttpTransport({ source, maxMediaBytes: profile.media.maxFileBytes }),
    missingObservationMs: profile.jobs.missingObservationMs,
    reportRunInputLookupError: reportGenerationRunInputLookupError.bind(undefined, generationLogger),
  })
  const coordinator = new GenerationCoordinator({
    runtime,
    pollIntervalMs: profile.jobs.pollIntervalMs,
    onError: generationLogger.error.bind(generationLogger),
  })
  ctx.effect(() => {
    coordinator.start()
    return async () => {
      await coordinator.stop()
      runtime.close()
    }
  }, 'Generation coordinator')
  new ComfyuiCoreService(ctx, { catalog, runtime, profile, sourceAddress: () => readSourceAddress(sourceSettings), semanticQueryClientPath })
  ctx.effect(() => registerProjectTools(ctx, [
    createTemplateResolverTool(catalog),
    createLoraResolverTool(catalog),
    createGenerationModelResolverTool(catalog),
    createComfyuiInstanceQueryTool(catalog),
    generationToolForContext(ctx, runtime),
    generationRunInputToolForContext(ctx, runtime),
    createGenerationRunMediaTool({ runtime, workspaceRegistry: ctx.workspaceRegistry }),
  ]), 'project Tool registry')

}

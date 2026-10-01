import { Service, type Context, type Logger } from '@deepseek-ai/cordis'

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

import { assertPluginRuntimeResourcesAvailable } from '../plugin-resources.ts'
import { assertPluginStorageWritable } from './plugin-storage.ts'
export { Config } from './schema.ts'
import { Config, type CoreServices } from './schema.ts'

export const name = 'harness-comfyui-core'
export const inject = ['tools', 'workspaceRegistry', 'dshHomePath'] as const


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
  const runtimeResources = assertPluginRuntimeResourcesAvailable()
  const {
    HARNESS_COMFYUI_CONFIGURATION_PROFILE: _profileSelector,
    HARNESS_COMFYUI_STARTUP_WORKSPACE_PATH: _startupWorkspacePath,
    ...environment
  } = process.env
  const homeContext = ctx as Context & { dshHomePath(...segments: string[]): string }
  const profile = loadProfile(config.configurationProfile, {
    environment,
    storageRoot: homeContext.dshHomePath(),
    ...(config.dataDirectory === undefined ? {} : { dataDirectory: config.dataDirectory }),
  })
  const browserExecutablePath = () => config.browserExecutablePath?.get()
    ?? profile.comfyui.frontendCompiler.browserExecutablePath
  const effectiveProfile: CoreServices['profile'] = {
    ...profile,
    comfyui: {
      ...profile.comfyui,
      frontendCompiler: {
        ...profile.comfyui.frontendCompiler,
        get browserExecutablePath() { return browserExecutablePath() },
      },
    },
  }
  assertPluginStorageWritable(effectiveProfile.paths)
  if (config.startupWorkspacePath !== undefined) {
    await ctx.workspaceRegistry.create(config.startupWorkspacePath)
  }
  const sourceSettings = {
    get(): SourceAddress {
      return configuredSourceAddress(config.configuration, effectiveProfile.source.catalogPort)
    },
  }
  const semanticQueryClientPath = runtimeResources.semanticQueryClient
  const sourceReadClientPath = runtimeResources.sourceReadClient
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
    nodeExecutable: process.execPath,
    workerModulePath: runtimeResources.frontendCompilerWorker,
    get browserExecutablePath() { return browserExecutablePath() },
    timeoutMs: effectiveProfile.comfyui.frontendCompiler.timeoutMs,
    preReadiness: effectiveProfile.comfyui.frontendCompiler.preReadiness,
    reportDiagnostic: reportFrontendAttemptDiagnostic.bind(undefined, generationLogger),
  })
  const officialApiWorkflowCompiler = new OfficialApiWorkflowCompiler({
    cacheDirectory: effectiveProfile.paths.apiWorkflowCacheDirectory,
    instanceCacheEpoch: effectiveProfile.comfyui.frontendCompiler.instanceCacheEpoch,
    frontend: frontendCompiler,
  })
  const runtime = new GenerationRuntime({
    runRepositoryFile: effectiveProfile.paths.runRepositoryFile,
    runDirectory: effectiveProfile.paths.runDirectory,
    savedMediaDirectory: effectiveProfile.paths.savedMediaDirectory,
    preparer: new SourceGenerationPreparer({
      defaultInstanceId: effectiveProfile.comfyui.defaultInstanceId,
      source,
      compiler: new ComfyWorkflowCompiler({
        timeoutMs: effectiveProfile.comfyui.frontendCompiler.timeoutMs,
        officialApiWorkflowCompiler,
      }),
    }),
    transport: new ComfyHttpTransport({ source, maxMediaBytes: profile.media.maxFileBytes }),
    missingObservationMs: effectiveProfile.jobs.missingObservationMs,
    reportRunInputLookupError: reportGenerationRunInputLookupError.bind(undefined, generationLogger),
  })
  const coordinator = new GenerationCoordinator({
    runtime,
    pollIntervalMs: effectiveProfile.jobs.pollIntervalMs,
    onError: generationLogger.error.bind(generationLogger),
  })
  ctx.effect(() => {
    coordinator.start()
    return async () => {
      await coordinator.stop()
      runtime.close()
    }
  }, 'Generation coordinator')
  new ComfyuiCoreService(ctx, { catalog, runtime, profile: effectiveProfile, sourceAddress: () => readSourceAddress(sourceSettings), semanticQueryClientPath })
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

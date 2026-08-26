import Schema from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'

import {
  configurationProfileNames,
  type ConfigurationProfileName,
} from '../../config/schema.ts'
import { loadProfile } from '../config/load-profile.ts'
import { CatalogCli } from './catalog/catalog-cli.ts'
import { CatalogRemoteService } from './catalog/catalog-service.ts'
import {
  createComfyuiInstanceQueryTool,
  createGenerationModelResolverTool,
  createLoraResolverTool,
  createTemplateResolverTool,
} from './catalog/catalog-tool.ts'
import { ComfyHttpTransport } from './generation/comfy-http-transport.ts'
import { GenerationCoordinator } from './generation/generation-coordinator.ts'
import { GenerationRemoteService } from './generation/generation-service.ts'
import { GenerationRuntime } from './generation/generation-runtime.ts'
import { generationToolForContext } from './generation/generation-tool.ts'
import { registerGenerationMediaRoutes, type GenerationWebServer } from './generation/media-routes.ts'
import { GenerationSourceCli } from './generation/source-cli.ts'
import { SourceGenerationPreparer } from './generation/source-preparer.ts'
import { ComfyWorkflowCompiler } from './generation/workflow-compiler.ts'
import { registerProjectTools } from './tools/register-project-tools.ts'

export interface Config {
  readonly configurationProfile: ConfigurationProfileName
}

const configurationProfileSchema = Schema.union(
  configurationProfileNames.map(profile => Schema.const(profile)),
).required()

/** Standard Schema validated Host plugin configuration. */
export const Config = Schema.object({
  configurationProfile: configurationProfileSchema,
})

export const name = 'harness-comfyui'
export const inject = ['tools', 'webServer', 'workspaceRegistry'] as const

/** Validate the selected Configuration Profile before Host startup completes. */
export function apply(ctx: Context, config: Config): void {
  const {
    HARNESS_COMFYUI_CONFIGURATION_PROFILE: _profileSelector,
    ...environment
  } = process.env
  const profile = loadProfile(config.configurationProfile, { environment })
  const catalog = new CatalogCli({
    executable: profile.source.catalogCliPath,
    port: profile.source.catalogPort,
  })
  new CatalogRemoteService(ctx, catalog)
  const source = new GenerationSourceCli({
    executable: profile.source.sourceCliPath,
    port: profile.source.catalogPort,
  })
  const runtime = new GenerationRuntime({
    runRepositoryFile: profile.paths.runRepositoryFile,
    runDirectory: profile.paths.runDirectory,
    savedMediaDirectory: profile.paths.savedMediaDirectory,
    preparer: new SourceGenerationPreparer({
      defaultInstanceId: profile.comfyui.defaultInstanceId,
      source,
      compiler: new ComfyWorkflowCompiler(),
    }),
    transport: new ComfyHttpTransport({ source, maxMediaBytes: profile.media.maxFileBytes }),
    missingObservationMs: profile.jobs.missingObservationMs,
  })
  new GenerationRemoteService(ctx, runtime, profile.client.runRefreshIntervalMs, ctx.workspaceRegistry)
  const generationLogger = ctx.logger('harness-comfyui')
  const coordinator = new GenerationCoordinator({
    runtime,
    pollIntervalMs: profile.jobs.pollIntervalMs,
    onError: generationLogger.error.bind(generationLogger),
  })
  ctx.effect(() => registerProjectTools(ctx, [
    createTemplateResolverTool(catalog),
    createLoraResolverTool(catalog),
    createGenerationModelResolverTool(catalog),
    createComfyuiInstanceQueryTool(catalog),
    generationToolForContext(ctx, runtime),
  ]), 'project Tool registry')
  ctx.effect(() => registerGenerationMediaRoutes({
    webServer: (ctx as unknown as { webServer: GenerationWebServer }).webServer,
    runtime,
    workspaceRegistry: ctx.workspaceRegistry,
  }), 'Generation media routes')
  ctx.effect(() => {
    coordinator.start()
    return async () => {
      await coordinator.stop()
      runtime.close()
    }
  }, 'Generation coordinator')
}

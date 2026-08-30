import Schema from '@deepseek-ai/schemastery'
import type { Context, Logger } from '@deepseek-ai/cordis'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { fileURLToPath } from 'node:url'

import {
  configurationProfileNames,
  type ConfigurationProfileName,
} from '../../config/schema.ts'
import { CLI_ROUTE_PATH } from '../cli/contract.ts'
import { loadProfile } from '../config/load-profile.ts'
import { CatalogCli } from './catalog/catalog-cli.ts'
import { CatalogRemoteService } from './catalog/catalog-service.ts'
import {
  createComfyuiInstanceQueryTool,
  createGenerationModelResolverTool,
  createLoraResolverTool,
  createTemplateResolverTool,
} from './catalog/catalog-tool.ts'
import { registerHarnessComfyuiCliRoute } from './cli/route.ts'
import {
  CLI_ENVIRONMENT_VARIABLES,
  CliShellCapabilityStore,
} from './cli/shell-capability.ts'
import { ComfyHttpTransport } from './generation/comfy-http-transport.ts'
import { ChromeComfyFrontend } from './generation/comfy-frontend-browser.ts'
import { GenerationCoordinator } from './generation/generation-coordinator.ts'
import { GenerationRemoteService } from './generation/generation-service.ts'
import {
  GenerationRuntime,
  type GenerationRunInputLookupErrorReport,
} from './generation/generation-runtime.ts'
import { generationRunInputToolForContext } from './generation/generation-run-input-tool.ts'
import { generationToolForContext } from './generation/generation-tool.ts'
import { ImageReaderService } from './image-reader/image-reader-service.ts'
import {
  ImageReaderRemoteService,
  registerImageReaderSettings,
} from './image-reader/image-reader-host.ts'
import { createGenerationRunMediaTool, createInspectImageTool } from './image-reader/image-reader-tool.ts'
import {
  createImageReaderSettingsDefaults,
  type ImageReaderDefaultModel,
} from '../image-reader/settings.ts'
import { registerGenerationMediaRoutes, type GenerationWebServer } from './generation/media-routes.ts'
import { OfficialApiWorkflowCompiler } from './generation/official-api-workflow.ts'
import { GenerationSourceCli } from './generation/source-cli.ts'
import { SourceGenerationPreparer } from './generation/source-preparer.ts'
import { ComfyWorkflowCompiler } from './generation/workflow-compiler.ts'
import { registerProjectTools } from './tools/register-project-tools.ts'

export interface Config {
  readonly configurationProfile: ConfigurationProfileName
  readonly startupWorkspacePath?: string
  readonly imageReaderDefaultModel?: ImageReaderDefaultModel
}

const configurationProfileSchema = Schema.union(
  configurationProfileNames.map(profile => Schema.const(profile)),
).required()
/** Standard Schema validated Host plugin configuration. */
export const Config = Schema.object({
  configurationProfile: configurationProfileSchema,
  startupWorkspacePath: Schema.string().min(1).pattern(/\S/u),
  imageReaderDefaultModel: Schema.object({
    provider: Schema.string().max(10_000).required(),
    model: Schema.string().min(1).max(10_000).required(),
  }).default(undefined as never),
})

export const name = 'harness-comfyui'
export const inject = ['tools', 'webServer', 'workspaceRegistry', 'shellEnv', 'attachments', 'llm', 'settings'] as const

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

interface ManagedShellEnvironmentRegistry {
  register(contributor: {
    readonly name: string
    readonly variables: typeof CLI_ENVIRONMENT_VARIABLES
    resolve(execution: ToolExecution): Readonly<Record<string, string>>
  }): () => void
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
  const catalog = new CatalogCli({
    executable: profile.source.catalogCliPath,
    port: profile.source.catalogPort,
  })
  new CatalogRemoteService(ctx, catalog)
  const source = new GenerationSourceCli({
    executable: profile.source.sourceCliPath,
    port: profile.source.catalogPort,
  })
  const frontendCompiler = new ChromeComfyFrontend({
    browserExecutablePath: profile.comfyui.frontendCompiler.browserExecutablePath,
    timeoutMs: profile.comfyui.frontendCompiler.timeoutMs,
  })
  const officialApiWorkflowCompiler = new OfficialApiWorkflowCompiler({
    cacheDirectory: profile.paths.apiWorkflowCacheDirectory,
    instanceCacheEpoch: profile.comfyui.frontendCompiler.instanceCacheEpoch,
    frontend: frontendCompiler,
  })
  const generationLogger = ctx.logger('harness-comfyui')
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
  const capabilities = new CliShellCapabilityStore({
    cliPath: fileURLToPath(new URL('../../scripts/cli/harness-comfyui.mjs', import.meta.url)),
    apiUrl: `http://${profile.server.host}:${profile.server.port}${CLI_ROUTE_PATH}`,
  })
  const imageReaderDefaults = config.imageReaderDefaultModel === undefined
    ? undefined
    : createImageReaderSettingsDefaults(config.imageReaderDefaultModel)
  const imageReaderScope = await registerImageReaderSettings(ctx, imageReaderDefaults)
  const imageReader = new ImageReaderService({
    scope: imageReaderScope,
    attachments: ctx.attachments,
    llm: ctx.llm,
  })
  new ImageReaderRemoteService(ctx, ctx.llm, imageReaderScope)
  new GenerationRemoteService(ctx, runtime, profile.client.runRefreshIntervalMs, ctx.workspaceRegistry)
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
    generationRunInputToolForContext(ctx, runtime),
    createGenerationRunMediaTool({ runtime, workspaceRegistry: ctx.workspaceRegistry }),
    createInspectImageTool(imageReader),
  ]), 'project Tool registry')
  ctx.effect(() => registerGenerationMediaRoutes({
    webServer: (ctx as unknown as { webServer: GenerationWebServer }).webServer,
    runtime,
    workspaceRegistry: ctx.workspaceRegistry,
  }), 'Generation media routes')
  ctx.effect(() => registerHarnessComfyuiCliRoute({
    webServer: (ctx as unknown as { webServer: GenerationWebServer }).webServer,
    capabilities,
    catalog,
    runtime,
    imageReader,
    workspaceRegistry: ctx.workspaceRegistry,
  }), 'Managed Harness ComfyUI CLI route')
  ctx.effect(() => {
    const shellEnv = (ctx as unknown as { shellEnv: ManagedShellEnvironmentRegistry }).shellEnv
    const disposeEnvironment = shellEnv.register({
      name: 'harness-comfyui-cli',
      variables: CLI_ENVIRONMENT_VARIABLES,
      resolve: execution => capabilities.environment(execution),
    })
    const disposeRevocation = ctx.on('tools/result', (execution) => {
      capabilities.revoke(execution)
      return undefined
    })
    return () => {
      disposeRevocation()
      disposeEnvironment()
    }
  }, 'Managed Harness ComfyUI CLI shell capability')
  ctx.effect(() => {
    coordinator.start()
    return async () => {
      await coordinator.stop()
      runtime.close()
    }
  }, 'Generation coordinator')
}

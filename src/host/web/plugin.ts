import type { Context } from '@deepseek-ai/cordis'
import { CatalogRemoteService } from '../catalog/catalog-service.ts'
import type { } from '../core/plugin.ts'
import { GenerationRemoteService } from '../generation/generation-service.ts'
import { registerGenerationMediaRoutes, type GenerationWebServer } from '../generation/media-routes.ts'
import { ImageReaderRemoteService } from '../image-reader/image-reader-host.ts'
import type { } from '../image-reader/plugin.ts'

export const name = 'harness-comfyui-web'
export const inject = ['harnessComfyuiCore', 'imageReader', 'webServer', 'workspaceRegistry'] as const
export function apply(ctx: Context): void {
  const { catalog, runtime, profile } = ctx.harnessComfyuiCore.services
  new CatalogRemoteService(ctx, catalog)
  new GenerationRemoteService(ctx, runtime, profile.client.runRefreshIntervalMs, ctx.workspaceRegistry)
  new ImageReaderRemoteService(ctx, ctx.imageReader)
  ctx.effect(() => registerGenerationMediaRoutes({
    webServer: (ctx as unknown as { webServer: GenerationWebServer }).webServer,
    runtime, workspaceRegistry: ctx.workspaceRegistry,
  }), 'Generation media routes')
}

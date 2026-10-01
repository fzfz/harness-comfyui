import runtime from '../../../config/image-reader-runtime.json' with { type: 'json' }
import { drainPendingRequests } from '../pending-requests.ts'
import { Service, type Context } from '@deepseek-ai/cordis'
import { createImageReaderSettingsDefaults } from '../../image-reader/settings.ts'
import type { ImageReaderConfiguration } from '../../image-reader/settings.ts'
import { registerProjectTools } from '../tools/register-project-tools.ts'
import { ImageReaderConfigurationService } from './configuration-service.ts'
import { ImageReaderService, type ImageInspectionOptions } from './image-reader-service.ts'
import { imageReaderCredentialStore } from './credential-store.ts'
import { createInspectImageTool } from './image-reader-tool.ts'
import { imageReaderSettingsStore } from './settings-registration.ts'

export { Config } from '../../image-reader/plugin-schema.ts'
import type { Config } from '../../image-reader/plugin-schema.ts'
export const name = 'harness-comfyui-image-reader'
export const inject = ['settings', 'attachments', 'llm', 'tools', 'credentials'] as const

declare module '@deepseek-ai/cordis' {
  interface Context { imageReader: ImageReaderPluginService }
}

export class ImageReaderPluginService extends Service {
  private readonly controller = new AbortController()
  private readonly pending = new Set<Promise<unknown>>()
  constructor(ctx: Context, private readonly configurationService: ImageReaderConfigurationService, private readonly reader: ImageReaderService, shutdownTimeoutMs: number) {
    super(ctx, 'imageReader')
    ctx.effect(() => async () => {
      this.controller.abort()
      await drainPendingRequests(this.pending, shutdownTimeoutMs, 'Image reader requests did not stop within shutdownTimeoutMs. Check the current DSH logs for image reader requests that are still running.')
    }, 'Image reader requests')
  }
  private run<T>(signal: AbortSignal | undefined, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const combined = signal === undefined ? this.controller.signal : AbortSignal.any([this.controller.signal, signal])
    const pending = Promise.resolve().then(() => { combined.throwIfAborted(); return operation(combined) })
    this.pending.add(pending)
    const cleanup = () => { this.pending.delete(pending) }
    void pending.then(cleanup, cleanup)
    return pending
  }
  configuration(): Promise<ImageReaderConfiguration> { return this.configurationService.configuration() }
  models(signal: AbortSignal) { return this.run(signal, signal => this.configurationService.models(signal)) }
  saveProfile(request: Parameters<ImageReaderConfigurationService['saveProfile']>[0], signal: AbortSignal) {
    return this.run(signal, signal => this.configurationService.saveProfile(request, signal))
  }
  activateProfile(request: Parameters<ImageReaderConfigurationService['activateProfile']>[0], signal: AbortSignal) {
    return this.run(signal, signal => this.configurationService.activateProfile(request, signal))
  }
  deleteProfile(request: Parameters<ImageReaderConfigurationService['deleteProfile']>[0], signal: AbortSignal) {
    return this.run(signal, signal => this.configurationService.deleteProfile(request, signal))
  }
  inspect(filePath: string, options: ImageInspectionOptions = {}) {
    return this.run(options.signal, signal => this.reader.inspect(filePath, { ...options, signal }))
  }
}

export async function apply(ctx: Context, config: Config): Promise<void> {
  const defaults = config.imageReaderDefaultModel === undefined ? undefined : createImageReaderSettingsDefaults(config.imageReaderDefaultModel)
  const scope = imageReaderSettingsStore(ctx, defaults)
  const credentials = imageReaderCredentialStore(ctx.credentials)
  const logger = ctx.logger('harness-comfyui-image-reader')
  const service = new ImageReaderPluginService(ctx, new ImageReaderConfigurationService(ctx.llm, scope, credentials), new ImageReaderService({ scope, credentials, attachments: ctx.attachments, llm: ctx.llm, onDiagnostic: record => logger.info(runtime.diagnosticLogFormat, JSON.stringify(record)) }), config.shutdownTimeoutMs ?? runtime.shutdownTimeoutMs)
  ctx.effect(() => registerProjectTools(ctx, [createInspectImageTool(service)]), 'Image inspection Tool')
}

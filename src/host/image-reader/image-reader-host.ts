import type { Context } from '@deepseek-ai/cordis'
import type { LlmRuntime } from '@deepseek-ai/dsh-llm'
import { settingsNamespace, type SettingsScope } from '@deepseek-ai/dsh-settings'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

import {
  IMAGE_READER_REMOTE_NAMESPACE,
  type ImageReaderModelCatalog,
  type ImageReaderProviderGroup,
} from '../../image-reader/contract.ts'
import {
  IMAGE_READER_SETTINGS_DEFAULTS,
  IMAGE_READER_SETTINGS_NAMESPACE,
  IMAGE_READER_SETTINGS_SCHEMA,
  type ImageReaderSettingsSection,
} from '../../image-reader/settings.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    harnessComfyuiImageReader: ImageReaderRemoteService
  }
}

export function registerImageReaderSettings(
  ctx: Pick<Context, 'settings'>,
): SettingsScope<ImageReaderSettingsSection> {
  return ctx.settings.register(
    settingsNamespace(IMAGE_READER_SETTINGS_NAMESPACE),
    IMAGE_READER_SETTINGS_SCHEMA,
    { base: IMAGE_READER_SETTINGS_DEFAULTS, applies: 'live' },
  )
}

export class ImageReaderRemoteService extends TypertRemoteService {
  private readonly llm: Pick<LlmRuntime, 'listProviders' | 'listModels'>

  constructor(ctx: Context, llm: Pick<LlmRuntime, 'listProviders' | 'listModels'>) {
    super(ctx, IMAGE_READER_REMOTE_NAMESPACE)
    this.llm = llm
    for (const initialize of imageReaderRemoteInitializers) initialize(this)
  }

  async models(signal: AbortSignal): Promise<ImageReaderModelCatalog> {
    signal.throwIfAborted()
    const groups: ImageReaderProviderGroup[] = []
    const failures: { provider: string; message: string }[] = []
    for (const provider of this.llm.listProviders()) {
      signal.throwIfAborted()
      try {
        const models = (await this.llm.listModels(provider.id))
          .filter(model => model.inputModalities?.includes('image') === true)
          .map(model => Object.freeze({
            id: model.id,
            name: model.name,
            description: model.description?.trim().length ? model.description : null,
          }))
        signal.throwIfAborted()
        if (models.length > 0) {
          groups.push(Object.freeze({
            provider: provider.id,
            name: provider.name,
            models: Object.freeze(models),
          }))
        }
      } catch (error) {
        if (signal.aborted) throw signal.reason
        failures.push(Object.freeze({
          provider: provider.id,
          message: 'The provider model catalog could not be loaded.',
        }))
      }
    }
    return Object.freeze({ groups: Object.freeze(groups), failures: Object.freeze(failures) })
  }
}

const imageReaderRemoteInitializers: Array<(service: ImageReaderRemoteService) => void> = []

Remote(ImageReaderRemoteService.prototype.models, {
  private: false,
  static: false,
  name: 'models',
  addInitializer(initialize: (this: ImageReaderRemoteService) => void) {
    imageReaderRemoteInitializers.push(service => initialize.call(service))
  },
} as never)

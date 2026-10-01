import type { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { IMAGE_READER_REMOTE_NAMESPACE, type ActivateImageReaderProfileRequest, type DeleteImageReaderProfileRequest, type SaveImageReaderProfileRequest } from '../../image-reader/contract.ts'
import type { ImageReaderConfigurationService } from './configuration-service.ts'
import { ImageReaderError } from './errors.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { harnessComfyuiImageReader: ImageReaderRemoteService }
}

export class ImageReaderRemoteService extends TypertRemoteService {
  private readonly logger: ReturnType<Context['logger']>

  constructor(ctx: Context, private readonly service: Pick<ImageReaderConfigurationService, 'models' | 'configuration' | 'saveProfile' | 'activateProfile' | 'deleteProfile'>) {
    super(ctx, IMAGE_READER_REMOTE_NAMESPACE)
    this.logger = ctx.logger('harness-comfyui-image-reader')
    for (const initialize of imageReaderRemoteInitializers) initialize(this)
  }
  models(signal: AbortSignal) { return this.service.models(signal) }
  async configuration(signal: AbortSignal) {
    signal.throwIfAborted()
    return this.mutation(this.service.configuration())
  }
  private async mutation<T>(operation: Promise<T>): Promise<T> {
    try { return await operation } catch (error) {
      if (error instanceof ImageReaderError) {
        if (
          (error.code === 'IMAGE_READER_CREDENTIAL_STAGE_CLEANUP_FAILED'
            || error.code === 'IMAGE_READER_CREDENTIAL_COMMITTED_CLEANUP_FAILED')
          && error.credentialFailure !== undefined
        ) {
          const credentialFailure = Object.freeze({ code: error.code, credentialFailure: error.credentialFailure })
          this.logger.error('Image reader credential cleanup failed: %s', JSON.stringify(credentialFailure))
        }
        throw new RemoteError(error.code, error.message, Object.freeze({}))
      }
      throw error
    }
  }
  saveProfile(request: SaveImageReaderProfileRequest, signal: AbortSignal) {
    return this.mutation(this.service.saveProfile(request, signal))
  }
  activateProfile(request: ActivateImageReaderProfileRequest, signal: AbortSignal) {
    return this.mutation(this.service.activateProfile(request, signal))
  }
  deleteProfile(request: DeleteImageReaderProfileRequest, signal: AbortSignal) {
    return this.mutation(this.service.deleteProfile(request, signal))
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

Remote(ImageReaderRemoteService.prototype.configuration, {
  private: false,
  static: false,
  name: 'configuration',
  addInitializer(initialize: (this: ImageReaderRemoteService) => void) {
    imageReaderRemoteInitializers.push(service => initialize.call(service))
  },
} as never)

Remote(ImageReaderRemoteService.prototype.saveProfile, {
  private: false,
  static: false,
  name: 'saveProfile',
  addInitializer(initialize: (this: ImageReaderRemoteService) => void) {
    imageReaderRemoteInitializers.push(service => initialize.call(service))
  },
} as never)

Remote(ImageReaderRemoteService.prototype.activateProfile, {
  private: false,
  static: false,
  name: 'activateProfile',
  addInitializer(initialize: (this: ImageReaderRemoteService) => void) {
    imageReaderRemoteInitializers.push(service => initialize.call(service))
  },
} as never)

Remote(ImageReaderRemoteService.prototype.deleteProfile, {
  private: false,
  static: false,
  name: 'deleteProfile',
  addInitializer(initialize: (this: ImageReaderRemoteService) => void) {
    imageReaderRemoteInitializers.push(service => initialize.call(service))
  },
} as never)

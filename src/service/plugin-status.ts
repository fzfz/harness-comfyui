import packageManifest from '../../package.json' with { type: 'json' }
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'

import type { ConfigurationProfileName } from '../../config/schema.ts'
import type { PluginStatus } from '../contract/plugin-status.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    pluginStatus: PluginStatusService
  }
}

export class PluginStatusService extends TypertRemoteService {
  private readonly status: PluginStatus

  constructor(ctx: Context, configurationProfile: ConfigurationProfileName) {
    super(ctx, 'pluginStatus')
    const runtimePackageVersion = process.env.HARNESS_COMFYUI_PACKAGE_VERSION
    if (runtimePackageVersion !== undefined && runtimePackageVersion.trim().length === 0) {
      throw new TypeError('HARNESS_COMFYUI_PACKAGE_VERSION must be a non-empty string')
    }
    this.status = Object.freeze({
      packageName: packageManifest.name,
      packageVersion: runtimePackageVersion ?? packageManifest.version,
      configurationProfile,
      hostLoaded: true,
    })
  }

  @Remote('get')
  get(): PluginStatus {
    return this.status
  }
}

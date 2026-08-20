import packageManifest from '../../package.json' with { type: 'json' }
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'

import type { ConfigurationProfileName } from '../../config/schema.ts'
import type { PluginStatus } from '../contract/plugin-status.ts'

export class PluginStatusService extends TypertRemoteService {
  private readonly status: PluginStatus

  constructor(ctx: Context, configurationProfile: ConfigurationProfileName) {
    super(ctx, 'pluginStatus')
    this.status = Object.freeze({
      packageName: packageManifest.name,
      packageVersion: packageManifest.version,
      configurationProfile,
      hostLoaded: true,
    })
  }

  @Remote('get')
  get(): PluginStatus {
    return this.status
  }
}

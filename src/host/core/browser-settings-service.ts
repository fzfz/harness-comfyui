import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  BROWSER_SETTINGS_REMOTE_NAMESPACE,
  parseBrowserExecutablePathRequest,
  type BrowserExecutablePathRequest,
  type BrowserExecutablePathResult,
} from '../../browser-settings-schema.ts'
import { validateBrowserExecutable } from './browser-settings.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { harnessComfyuiBrowserSettings: BrowserSettingsRemoteService }
}

export class BrowserSettingsRemoteService extends TypertRemoteService {
  constructor(ctx: Context, private readonly readBrowserExecutablePath: () => string) {
    super(ctx, BROWSER_SETTINGS_REMOTE_NAMESPACE)
    parseBrowserExecutablePathRequest({ browserExecutablePath: readBrowserExecutablePath() })
    for (const initialize of browserRemoteInitializers) initialize(this)
  }

  async configuration(signal: AbortSignal): Promise<BrowserExecutablePathRequest> {
    signal.throwIfAborted()
    return { browserExecutablePath: this.readBrowserExecutablePath() }
  }

  async validate(request: BrowserExecutablePathRequest, signal: AbortSignal): Promise<BrowserExecutablePathResult> {
    return validateBrowserExecutable(request, signal)
  }
}

const browserRemoteInitializers: Array<(service: BrowserSettingsRemoteService) => void> = []
const addBrowserRemoteInitializer = (initialize: (this: BrowserSettingsRemoteService) => void) => {
  browserRemoteInitializers.push(service => initialize.call(service))
}
Remote(BrowserSettingsRemoteService.prototype.configuration, {
  private: false, static: false, name: 'configuration', addInitializer: addBrowserRemoteInitializer,
} as never)
Remote(BrowserSettingsRemoteService.prototype.validate, {
  private: false, static: false, name: 'validate', addInitializer: addBrowserRemoteInitializer,
} as never)

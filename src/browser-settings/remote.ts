import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import {
  BROWSER_SETTINGS_REMOTE_NAMESPACE,
  parseBrowserExecutablePathRequest,
  parseBrowserExecutablePathResult,
  type BrowserExecutablePathRequest,
  type BrowserExecutablePathResult,
} from '../browser-settings-schema.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    harnessComfyuiBrowserSettings: {
      configuration: () => Promise<RemoteResult<BrowserExecutablePathRequest>>
      validate: (request: BrowserExecutablePathRequest) => Promise<RemoteResult<BrowserExecutablePathResult>>
    }
  }
  interface TypertRemoteMap {
    'harnessComfyuiBrowserSettings/configuration': () => Promise<RemoteResult<BrowserExecutablePathRequest>>
    'harnessComfyuiBrowserSettings/validate': (request: BrowserExecutablePathRequest) => Promise<RemoteResult<BrowserExecutablePathResult>>
  }
}

export const BROWSER_SETTINGS_REMOTE = {
  package: 'harness-comfyui',
  descriptors: [{
    id: `harness-comfyui#${BROWSER_SETTINGS_REMOTE_NAMESPACE}/configuration`,
    service: BROWSER_SETTINGS_REMOTE_NAMESPACE,
    namespace: BROWSER_SETTINGS_REMOTE_NAMESPACE,
    method: 'configuration',
    invocation: { kind: 'direct' as const },
    parameters: [],
    cancellation: { parameter: 'signal' as const },
    result: {
      mode: 'strict' as const,
      typeSymbol: 'harness-comfyui/browser-settings#BrowserExecutablePathRequest',
      create: () => ({ parse: parseBrowserExecutablePathRequest }),
    },
  }, {
    id: `harness-comfyui#${BROWSER_SETTINGS_REMOTE_NAMESPACE}/validate`,
    service: BROWSER_SETTINGS_REMOTE_NAMESPACE,
    namespace: BROWSER_SETTINGS_REMOTE_NAMESPACE,
    method: 'validate',
    invocation: { kind: 'direct' as const },
    parameters: [{
      name: 'request', wire: 'request', source: 'json' as const,
      codec: {
        mode: 'strict' as const,
        typeSymbol: 'harness-comfyui/browser-settings#BrowserExecutablePathRequest',
        create: () => ({ parse: parseBrowserExecutablePathRequest }),
      },
    }],
    cancellation: { parameter: 'signal' as const },
    result: {
      mode: 'strict' as const,
      typeSymbol: 'harness-comfyui/browser-settings#BrowserExecutablePathResult',
      create: () => ({ parse: parseBrowserExecutablePathResult }),
    },
  }],
} satisfies TypertRemoteContribution

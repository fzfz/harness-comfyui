import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'

import HARNESS_COMFYUI_REMOTE from '../remote.ts'
import { CATALOG_REMOTE_SERVICE } from '../catalog/contract.ts'
import { GENERATION_REMOTE_SERVICE } from '../generation/contract.ts'
import { IMAGE_READER_REMOTE_SERVICE } from '../image-reader/contract.ts'
import {
  IMAGE_READER_SETTINGS_NAMESPACE,
  IMAGE_READER_SETTINGS_SECTION_ID,
  decodeImageReaderSettingsView,
} from '../image-reader/settings.ts'
import { ImageReaderSettingsError, ImageReaderSettingsPage } from './image-reader/image-reader-settings.tsx'

import {
  WORKBENCH_DETAILS_PRIORITY,
  WORKBENCH_DOCK_ID,
  WORKBENCH_ENTRY_ID,
  WORKBENCH_RESULTS_OVERLAY_ID,
} from './workbench/contract.ts'
import { WorkbenchController } from './workbench/controller.ts'
import { ContextDialogNavigationStore } from './workbench/context-dialog-navigation.ts'
import { GenerationProjectionStore } from './workbench/generation-store.ts'
import { WorkbenchDock, WorkbenchEntry } from './workbench/native-surfaces.tsx'
import { WorkbenchDetails, WorkbenchResultsOverlay } from './workbench/results-drawer.tsx'

export const name = 'harness-comfyui'
export const inject = ['slots', 'sessions', 'conversation', 'remote', 'layout', 'settingsScope'] as const

interface ClientSessions {
  readonly scope: (sessionId: string) => Context | undefined
}

interface ClientSlotRegistry {
  readonly inject: (...arguments_: any[]) => any
  readonly register: (...arguments_: any[]) => any
}

type ClientContext = Context & {
  readonly sessions: ClientSessions
  readonly slots: ClientSlotRegistry
}

class CatalogRequestError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'CatalogRequestError'
    this.code = code
  }
}

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const workbench = new WorkbenchController(ctx.layout)
  const contextDialogNavigationStore = new ContextDialogNavigationStore(() => globalThis.localStorage)
  const clientSessions = ctx.sessions
  const disposers: Array<() => void | Promise<void>> = [() => contextDialogNavigationStore.dispose()]
  try {
    disposers.push(await ctx.remote.$mount(HARNESS_COMFYUI_REMOTE))
    const remoteFiber = ctx.inject([CATALOG_REMOTE_SERVICE, GENERATION_REMOTE_SERVICE, IMAGE_READER_REMOTE_SERVICE], (remoteContext) => {
      const remoteCatalog = remoteContext.get(CATALOG_REMOTE_SERVICE) as typeof ctx.remote.harnessComfyuiCatalog
      const remoteGeneration = remoteContext.get(GENERATION_REMOTE_SERVICE) as typeof ctx.remote.harnessComfyuiGeneration
      const remoteImageReader = remoteContext.get(IMAGE_READER_REMOTE_SERVICE) as typeof ctx.remote.harnessComfyuiImageReader
      const imageReaderSettingsScope = ctx.settingsScope.bind({
        namespace: IMAGE_READER_SETTINGS_NAMESPACE,
        decode: decodeImageReaderSettingsView,
      })
      const ensureActive = (signal: AbortSignal) => {
        if (signal.aborted) throw new DOMException('Catalog query was cancelled.', 'AbortError')
      }
      const catalog = {
        search: async (request: Parameters<typeof remoteCatalog.search>[0], signal: AbortSignal) => {
          ensureActive(signal)
          const result = await remoteCatalog.search(request)
          ensureActive(signal)
          if (!result.ok) throw new CatalogRequestError(result.error.code, `${result.error.code}: ${result.error.message}`)
          if (!result.value.ok) throw new CatalogRequestError(result.value.error.code, result.value.error.message)
          return result.value.value
        },
        baseModels: async (signal: AbortSignal) => {
          ensureActive(signal)
          const result = await remoteCatalog.baseModels()
          ensureActive(signal)
          if (!result.ok) throw new CatalogRequestError(result.error.code, `${result.error.code}: ${result.error.message}`)
          if (!result.value.ok) throw new CatalogRequestError(result.value.error.code, result.value.error.message)
          return result.value.value
        },
      }
      const generationStore = new GenerationProjectionStore({
        list: async (sessionId, signal) => {
          ensureActive(signal)
          const result = await remoteGeneration.list({ sessionId, turn: null })
          ensureActive(signal)
          if (!result.ok) throw new Error(result.error.code)
          return result.value
        },
      }, 1000)
      const imageReaderSettingsApi = {
        models: async (signal: AbortSignal) => {
          ensureActive(signal)
          const result = await remoteImageReader.models()
          ensureActive(signal)
          if (!result.ok) throw new ImageReaderSettingsError(result.error.code, result.error.code)
          return result.value
        },
        saveProfile: async (request: Parameters<typeof remoteImageReader.saveProfile>[0], signal: AbortSignal) => {
          ensureActive(signal)
          const result = await remoteImageReader.saveProfile(request)
          ensureActive(signal)
          if (!result.ok) throw new ImageReaderSettingsError(result.error.code, result.error.code)
          return result.value
        },
        deleteProfile: async (request: Parameters<typeof remoteImageReader.deleteProfile>[0], signal: AbortSignal) => {
          ensureActive(signal)
          const result = await remoteImageReader.deleteProfile(request)
          ensureActive(signal)
          if (!result.ok) throw new ImageReaderSettingsError(result.error.code, result.error.code)
          return result.value
        },
      }
      return [
        () => generationStore.dispose(),
        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: WORKBENCH_ENTRY_ID,
          order: 10,
          inject: () => ({ workbench }),
        }, WorkbenchEntry)),
        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
          name: 'conversation.input.dock',
          id: WORKBENCH_DOCK_ID,
          order: 20,
          inject: (sessionId: string) => {
            const sessionContext = clientSessions.scope(sessionId)
            if (!sessionContext) {
              throw new Error(`Harness did not provide the Session scope for ${sessionId}.`)
            }
            return {
              catalog,
              dialogNavigation: contextDialogNavigationStore.for(sessionId),
              sessionId,
              workbench,
              sessionInput: ctx.conversation.input.for(sessionContext),
            }
          },
        }, WorkbenchDock)),
        ctx.slots.inject('details', () => ctx.slots.register({
          name: 'details',
          priority: WORKBENCH_DETAILS_PRIORITY,
          inject: () => ({ workbench, generationStore }),
        }, WorkbenchDetails)),
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: WORKBENCH_RESULTS_OVERLAY_ID,
          order: 20,
          inject: () => ({ workbench }),
        }, WorkbenchResultsOverlay)),
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: IMAGE_READER_SETTINGS_SECTION_ID,
          order: 40,
          label: '图片读取',
          inject: () => ({ scope: imageReaderSettingsScope, api: imageReaderSettingsApi }),
        }, ImageReaderSettingsPage)),
      ]
    })
    await remoteFiber
    disposers.push(() => remoteFiber.dispose())
  } catch (error) {
    for (const dispose of disposers.reverse()) await dispose()
    throw error
  }

  return async () => {
    for (const dispose of disposers.reverse()) await dispose()
  }
}

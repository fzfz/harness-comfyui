import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'

import HARNESS_COMFYUI_REMOTE from '../remote.ts'
import { CATALOG_REMOTE_SERVICE } from '../catalog/contract.ts'
import { GENERATION_REMOTE_SERVICE } from '../generation/contract.ts'
import { IMAGE_READER_REMOTE_SERVICE } from '../image-reader/contract.ts'
import {
  IMAGE_READER_PROFILE_ENTRY_ID,
  type ImageReaderSettingsView,
} from '../image-reader/settings.ts'
import {
  SOURCE_PROFILE_ENTRY_ID,
  SOURCE_SETTINGS_SECTION_ID,
  type SourceSettingsView,
} from '../source-settings.ts'
import { ImageReaderSettingsError } from './image-reader/image-reader-settings.tsx'
import { HarnessComfyuiSettingsPage } from './settings/harness-comfyui-settings.tsx'
import { withImageReaderConfiguration } from './settings/image-reader-settings-form.ts'
import { withSourceAddress } from './settings/source-settings-form.ts'
import { SourcePresetTip } from './settings/source-preset-tip.tsx'

import {
  WORKBENCH_DOCK_ID,
  WORKBENCH_ENTRY_ID,
  WORKBENCH_RESULTS_TAB,
} from './workbench/contract.ts'
import { WorkbenchController } from './workbench/controller.ts'
import { ContextDialogNavigationStore } from './workbench/context-dialog-navigation.ts'
import { GenerationProjectionStore } from './workbench/generation-store.ts'
import { WorkbenchDock, WorkbenchEntry } from './workbench/native-surfaces.tsx'
import { WorkbenchDetails } from './workbench/results-drawer.tsx'

export const name = 'harness-comfyui'
export const inject = [
  'slots',
  'sessions',
  'conversation',
  'remote',
  'sidebarRight',
  'sidebarRightTabs',
  'configForms',
] as const

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
  const workbench = new WorkbenchController(ctx.sidebarRight)
  const contextDialogNavigationStore = new ContextDialogNavigationStore(() => globalThis.localStorage)
  const clientSessions = ctx.sessions
  const disposers: Array<() => void | Promise<void>> = [() => contextDialogNavigationStore.dispose()]
  try {
    disposers.push(await ctx.remote.$mount(HARNESS_COMFYUI_REMOTE))
    disposers.push(ctx.sidebarRightTabs.register({
      id: WORKBENCH_RESULTS_TAB.id,
      kind: WORKBENCH_RESULTS_TAB.kind,
      title: () => WORKBENCH_RESULTS_TAB.title,
    }))
    const remoteFiber = ctx.inject([CATALOG_REMOTE_SERVICE, GENERATION_REMOTE_SERVICE, IMAGE_READER_REMOTE_SERVICE], (remoteContext) => {
      const remoteCatalog = remoteContext.get(CATALOG_REMOTE_SERVICE) as typeof ctx.remote.harnessComfyuiCatalog
      const remoteGeneration = remoteContext.get(GENERATION_REMOTE_SERVICE) as typeof ctx.remote.harnessComfyuiGeneration
      const remoteImageReader = remoteContext.get(IMAGE_READER_REMOTE_SERVICE) as typeof ctx.remote.harnessComfyuiImageReader
      const imageReaderForm = withImageReaderConfiguration(
        ctx.configForms.get<ImageReaderSettingsView>(IMAGE_READER_PROFILE_ENTRY_ID),
        async () => {
          const result = await remoteImageReader.configuration()
          if (!result.ok) throw new ImageReaderSettingsError(result.error.code, result.error.code)
          return result.value
        },
      )
      const imageReaderSettingsScope = imageReaderForm.form
      const sourceForm = withSourceAddress(
        ctx.configForms.get<SourceSettingsView>(SOURCE_PROFILE_ENTRY_ID),
        async () => {
          const result = await remoteCatalog.sourceAddress()
          if (!result.ok) throw new CatalogRequestError(result.error.code, result.error.message)
          if (!result.value.ok) throw new CatalogRequestError(result.value.error.code, result.value.error.message)
          return result.value.value
        },
      )
      const sourceSettingsScope = sourceForm.form
      const ensureActive = (signal: AbortSignal) => {
        if (signal.aborted) throw new DOMException('Catalog query was cancelled.', 'AbortError')
      }
      const completeImageReaderSettingsWrite = async <T,>(
        signal: AbortSignal,
        send: () => Promise<{ readonly ok: true; readonly value: T } | {
          readonly ok: false
          readonly error: { readonly code: string }
        }>,
      ): Promise<T> => {
        ensureActive(signal)
        const result = await send()
        if (!result.ok) {
          ensureActive(signal)
          throw new ImageReaderSettingsError(result.error.code, result.error.code)
        }
        return result.value
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
        details: async (request: Parameters<typeof remoteCatalog.details>[0], signal: AbortSignal) => {
          ensureActive(signal)
          const result = await remoteCatalog.details(request)
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
          return completeImageReaderSettingsWrite(signal, () => remoteImageReader.saveProfile(request))
        },
        activateProfile: async (request: Parameters<typeof remoteImageReader.activateProfile>[0], signal: AbortSignal) => {
          return completeImageReaderSettingsWrite(signal, () => remoteImageReader.activateProfile(request))
        },
        deleteProfile: async (request: Parameters<typeof remoteImageReader.deleteProfile>[0], signal: AbortSignal) => {
          return completeImageReaderSettingsWrite(signal, () => remoteImageReader.deleteProfile(request))
        },
      }
      return [
        () => imageReaderForm.dispose(),
        () => sourceForm.dispose(),
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
        ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
          name: 'conversation.session.header.actions',
          id: 'harness-comfyui-source-tip',
          order: 10,
          inject: () => ({
            sourceScope: sourceSettingsScope,
            probe: catalog.baseModels,
          }),
        }, SourcePresetTip)),
        ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: WORKBENCH_RESULTS_TAB.id,
          inject: () => ({ workbench, generationStore }),
        }, WorkbenchDetails)),
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: SOURCE_SETTINGS_SECTION_ID,
          order: 40,
          label: 'ComfyUI',
          inject: () => ({
            imageReaderScope: imageReaderSettingsScope,
            imageReaderApi: imageReaderSettingsApi,
            sourceScope: sourceSettingsScope,
          }),
        }, HarnessComfyuiSettingsPage)),
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

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { defineStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type {
  ChatStore,
  ChatStoreState,
  DetailsInjected,
  SelectionTarget,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'

import { GenerationResultsPanel } from './plugin.tsx'

export const name = 'harness-comfyui'
export const inject = ['slots', 'remote'] as const

type PluginStatusClientContext = ClientContext & {
  readonly remote: {
    $mount(contribution: TypertRemoteContribution): Promise<() => Promise<void>>
  }
}

function createDetailsStore(): ChatStore {
  return defineStore({
    init: (): ChatStoreState => ({
      selection: null,
      draft: '',
      view: null,
      inspect: null,
    }),
    actions: {
      select: (draft: ChatStoreState, target: SelectionTarget | null) => {
        draft.selection = target
      },
      setDraft: (draft: ChatStoreState, text: string) => {
        draft.draft = text
      },
      setView: (draft: ChatStoreState, view: string) => {
        draft.view = view
      },
      setInspect: (draft: ChatStoreState, target: { callId: string } | null) => {
        draft.inspect = target
      },
    },
  })
}

/** Register the ComfyUI details replacement for this Client fiber. */
export function apply(ctx: ClientContext): void {
  const detailsStore = createDetailsStore()
  ctx.slots.inject('details', () =>
    ctx.slots.register(
      {
        name: 'details',
        priority: -10,
        locale: 'conversation',
        store: detailsStore,
        inject: (): DetailsInjected => ({ closeDetails: () => undefined }),
      },
      GenerationResultsPanel,
    ),
  )
}

/** Mount this package's generated Remote contribution around the Client plugin. */
export async function applyWithRemote(
  ctx: ClientContext,
  contribution: TypertRemoteContribution,
): Promise<() => Promise<void>> {
  const remote = (ctx as PluginStatusClientContext).remote
  const unmount = await remote.$mount(contribution)
  try {
    apply(ctx)
    return async () => {
      await unmount()
    }
  } catch (error) {
    await unmount()
    throw error
  }
}

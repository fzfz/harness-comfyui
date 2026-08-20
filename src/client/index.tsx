import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { defineStore } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  ChatStore,
  ChatStoreState,
  DetailsInjected,
  SelectionTarget,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'

import { GenerationResultsPanel } from './plugin.tsx'

export const name = 'harness-comfyui'
export const inject = ['slots'] as const

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

/** Register only the ComfyUI details replacement for the lifetime of this plugin. */
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

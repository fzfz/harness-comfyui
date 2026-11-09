import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SidebarRootInjected } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { InjectFace, PropsLocale, SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import { IconPanelLeftOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { EXPERIMENT_PANEL_ID } from './experiment-host.tsx'

export type ExperimentShortcuts = SidebarRootInjected['hooks']['shortcuts']

export function ExperimentLeading({
  toggleSidebar,
  useShortcuts,
  t,
}: Pick<InjectFace<SidebarRootInjected>, 'toggleSidebar' | 'useShortcuts'> & PropsLocale<'sidebar'>) {
  const shortcut = useShortcuts((rows: readonly { readonly id: string; readonly keys?: readonly string[]; readonly aria?: string }[]) =>
    rows.find(row => row.id === 'sidebar.left.toggle'))
  const label = t('toggle.open')
  return (
    <div className="harness-comfyui-experiment-leading">
      <style>{`
        .harness-comfyui-experiment-leading { display: flex; align-items: center; }
        .harness-comfyui-experiment-leading button {
          display: inline-flex; align-items: center; justify-content: center; flex: none;
          width: 28px; height: 28px; padding: 0; border: none;
          border-radius: var(--dsw-radius-sm); background: transparent;
          color: var(--dsw-alias-label-secondary); cursor: pointer;
        }
        .harness-comfyui-experiment-leading button:hover { background: var(--dsw-alias-interactive-bg-hover); }
      `}</style>
      <Tooltip label={label} shortcutKeys={shortcut?.keys} delayMs={500}>
        <button
          type="button"
          aria-label={label}
          aria-keyshortcuts={shortcut?.aria}
          onClick={toggleSidebar}
        >
          <IconPanelLeftOutlineRegular size={16} />
        </button>
      </Tooltip>
    </div>
  )
}

export function registerExperimentLeading(
  slots: Pick<SlotCore, 'register'>,
  layout: Pick<ILayout, 'panelInfo' | 'toggleSidebar'>,
  shortcuts: ExperimentShortcuts,
): () => void {
  let unregister: (() => void) | undefined
  const sync = () => {
    if (layout.panelInfo.getSnapshot().activePanelId === EXPERIMENT_PANEL_ID) {
      unregister ??= slots.register({
        name: 'shell.leading',
        priority: -1,
        locale: 'sidebar',
        inject: () => ({
          toggleSidebar: () => layout.toggleSidebar(),
          hooks: { shortcuts },
        }),
      }, ExperimentLeading)
    } else {
      unregister?.()
      unregister = undefined
    }
  }
  const unsubscribe = layout.panelInfo.subscribe(sync)
  try {
    sync()
  } catch (error) {
    unsubscribe()
    throw error
  }
  return () => {
    unsubscribe()
    unregister?.()
    unregister = undefined
  }
}

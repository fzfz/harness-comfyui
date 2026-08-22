import { useSyncExternalStore, type ReactNode } from 'react'

import { layoutContract, type LayoutController } from './layout-contract.ts'

type EmptyOwnerProps = Record<never, never>

export type WorkbenchRootProps = {
  renderSlot: {
    (key: 'sidebar', owner: { collapsed: boolean; width: number }): ReactNode
    (key: 'conversation', owner: EmptyOwnerProps): ReactNode
    (key: 'details', owner: EmptyOwnerProps): ReactNode
    (key: 'shell.overlay', owner: EmptyOwnerProps): ReactNode
  }
}

/** Project root composition for the fixed desktop shell. */
export function createWorkbenchRoot(layout: LayoutController) {
  return function WorkbenchRoot(props: WorkbenchRootProps): ReactNode {
    const snapshot = useSyncExternalStore(
      layout.subscribe,
      layout.getSnapshot,
      layout.getSnapshot,
    )

    return (
      <div className="harness-comfyui-shell" data-plugin="harness-comfyui">
        <div
          className="harness-comfyui-columns"
          data-layout-columns
          style={{
            gridTemplateColumns: `${snapshot.sidebarWidth}px minmax(0, 1fr) ${snapshot.detailsWidth}px`,
          }}
        >
          <div className="harness-comfyui-column harness-comfyui-sidebar" data-layout-column="sidebar">
            {props.renderSlot('sidebar', {
              collapsed: snapshot.sidebarWidth === layoutContract.sidebarCollapsedPx,
              width: snapshot.sidebarWidth,
            })}
          </div>
          <div className="harness-comfyui-column harness-comfyui-conversation" data-layout-column="conversation">
            {props.renderSlot('conversation', {})}
          </div>
          <div className="harness-comfyui-column harness-comfyui-details" data-layout-column="details">
            {props.renderSlot('details', {})}
          </div>
        </div>
        <div className="harness-comfyui-shell-overlay" data-shell-overlay>
          {props.renderSlot('shell.overlay', {})}
        </div>
      </div>
    )
  }
}

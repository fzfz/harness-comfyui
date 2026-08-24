import { describe, expect, it } from 'vitest'

import { LayoutController } from '../../src/client/workbench/layout-contract.ts'

describe('LayoutController public transition service', () => {
  it('starts with the desktop panel widths and publishes sidebar transitions', () => {
    const layout = new LayoutController()
    const notifications: Array<{ sidebarWidth: number; detailsWidth: number }> = []
    const unsubscribe = layout.subscribe(() => {
      notifications.push(layout.getSnapshot())
    })

    expect(layout.getSnapshot()).toEqual({ sidebarWidth: 294, detailsWidth: 432 })

    layout.toggleSidebar()
    expect(layout.getSnapshot()).toEqual({ sidebarWidth: 56, detailsWidth: 432 })
    expect(notifications).toEqual([{ sidebarWidth: 56, detailsWidth: 432 }])

    layout.toggleSidebar()
    expect(layout.getSnapshot()).toEqual({ sidebarWidth: 294, detailsWidth: 432 })
    expect(notifications).toEqual([
      { sidebarWidth: 56, detailsWidth: 432 },
      { sidebarWidth: 294, detailsWidth: 432 },
    ])

    unsubscribe()
    layout.toggleSidebar()
    expect(layout.getSnapshot()).toEqual({ sidebarWidth: 56, detailsWidth: 432 })
    expect(notifications).toHaveLength(2)
  })

  it('notifies only when details actually changes between open and closed', () => {
    const layout = new LayoutController()
    const snapshots: Array<{ sidebarWidth: number; detailsWidth: number }> = []
    layout.subscribe(() => snapshots.push(layout.getSnapshot()))

    layout.openDetails()
    expect(snapshots).toHaveLength(0)

    layout.closeDetails()
    expect(layout.getSnapshot()).toEqual({ sidebarWidth: 294, detailsWidth: 0 })
    expect(snapshots).toEqual([{ sidebarWidth: 294, detailsWidth: 0 }])

    layout.closeDetails()
    expect(snapshots).toHaveLength(1)

    layout.openDetails()
    expect(layout.getSnapshot()).toEqual({ sidebarWidth: 294, detailsWidth: 432 })
    expect(snapshots).toEqual([
      { sidebarWidth: 294, detailsWidth: 0 },
      { sidebarWidth: 294, detailsWidth: 432 },
    ])

    layout.openDetails()
    expect(snapshots).toHaveLength(2)
  })
})

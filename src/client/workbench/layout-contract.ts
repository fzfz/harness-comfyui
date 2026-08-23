import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'

/** Desktop shell geometry and initial panel state. */
export const layoutContract = Object.freeze({
  sidebarOpenPx: 294,
  sidebarCollapsedPx: 56,
  detailsOpenPx: 432,
  sidebarOpen: true,
  detailsOpen: true,
} as const)

export interface LayoutSnapshot {
  readonly sidebarWidth: number
  readonly detailsWidth: number
}

/** Project-owned implementation of the public panel transition service. */
export class LayoutController implements ILayout {
  #sidebarOpen: boolean = layoutContract.sidebarOpen
  #detailsOpen: boolean = layoutContract.detailsOpen
  #snapshot: LayoutSnapshot = this.#createSnapshot()
  readonly #listeners = new Set<() => void>()

  readonly getSnapshot = (): LayoutSnapshot => this.#snapshot

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  toggleSidebar(): void {
    this.#sidebarOpen = !this.#sidebarOpen
    this.#publish()
  }

  openDetails(): void {
    if (this.#detailsOpen) return
    this.#detailsOpen = true
    this.#publish()
  }

  closeDetails(): void {
    if (!this.#detailsOpen) return
    this.#detailsOpen = false
    this.#publish()
  }

  #createSnapshot(): LayoutSnapshot {
    return Object.freeze({
      sidebarWidth: this.#sidebarOpen
        ? layoutContract.sidebarOpenPx
        : layoutContract.sidebarCollapsedPx,
      detailsWidth: this.#detailsOpen ? layoutContract.detailsOpenPx : 0,
    })
  }

  #publish(): void {
    this.#snapshot = this.#createSnapshot()
    for (const listener of this.#listeners) listener()
  }
}

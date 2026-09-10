import type { IConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'

import type { CatalogContext } from '../../catalog/contract.ts'
import {
  replaceWorkbenchContextLines,
  WORKBENCH_RESULTS_TAB,
  workbenchContextsFromDraft,
  workbenchContextKey,
} from './contract.ts'

type WorkbenchListener = () => void

export interface WorkbenchSidebarRightActions {
  readonly openTab: (kind: string) => void
}

export type WorkbenchSessionInput = ReturnType<IConversation['input']['for']>

export class WorkbenchController {
  private active = false
  private currentSessionId: string | undefined
  private resultsOpen = false
  private readonly resultTabs = new Map<string, Map<string, {
    readonly visible: boolean
    readonly close: () => void
  }>>()
  private readonly listeners = new Set<WorkbenchListener>()
  private readonly resultListeners = new Set<WorkbenchListener>()

  constructor(private readonly sidebarRight: WorkbenchSidebarRightActions) {}

  readonly getSnapshot = (): boolean => this.active

  readonly subscribe = (listener: WorkbenchListener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  readonly getResultsSnapshot = (): boolean => this.resultsOpen

  readonly subscribeResults = (listener: WorkbenchListener): (() => void) => {
    this.resultListeners.add(listener)
    return () => {
      this.resultListeners.delete(listener)
    }
  }

  syncCurrentSession(sessionId: string): void {
    if (this.currentSessionId === sessionId) return
    this.currentSessionId = sessionId
    this.syncResultsOpen(this.visibleResultTab(sessionId) !== undefined)
  }

  bindResultsTab(
    sessionId: string,
    tabId: string,
    visible: boolean,
    close: () => void,
  ): () => void {
    const tabs = this.resultTabs.get(sessionId) ?? new Map()
    this.resultTabs.set(sessionId, tabs)
    const binding = { visible, close }
    tabs.set(tabId, binding)
    if (this.currentSessionId === sessionId) this.syncResultsOpen(this.visibleResultTab(sessionId) !== undefined)
    return () => {
      if (tabs.get(tabId) !== binding) return
      tabs.delete(tabId)
      if (tabs.size === 0) this.resultTabs.delete(sessionId)
      if (this.currentSessionId === sessionId) this.syncResultsOpen(this.visibleResultTab(sessionId) !== undefined)
    }
  }

  private syncResultsOpen(open: boolean): void {
    if (this.resultsOpen === open) return
    this.resultsOpen = open
    for (const listener of this.resultListeners) listener()
  }

  private visibleResultTab(sessionId: string): { readonly visible: boolean; readonly close: () => void } | undefined {
    return Array.from(this.resultTabs.get(sessionId)?.values() ?? []).find(tab => tab.visible)
  }

  toggle(): void {
    this.active = !this.active
    if (this.active) this.openResults()
    else this.closeResults()
    for (const listener of this.listeners) listener()
  }

  openResults(): void {
    this.sidebarRight.openTab(WORKBENCH_RESULTS_TAB.kind)
    this.syncResultsOpen(true)
  }

  closeResults(): void {
    const visible = this.currentSessionId === undefined ? undefined : this.visibleResultTab(this.currentSessionId)
    visible?.close()
    this.syncResultsOpen(false)
  }
}

export function setWorkbenchContexts(input: WorkbenchSessionInput, items: Iterable<CatalogContext>): void {
  const draft = input.state.getSnapshot().draft
  input.setDraft(replaceWorkbenchContextLines(draft, items))
}

export function removeWorkbenchContext(input: WorkbenchSessionInput, item: CatalogContext): void {
  const retained = workbenchContextsFromDraft(input.state.getSnapshot().draft)
    .filter(candidate => workbenchContextKey(candidate) !== workbenchContextKey(item))
  setWorkbenchContexts(input, retained)
}

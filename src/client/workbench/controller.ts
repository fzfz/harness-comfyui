import type { IConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'

import type { CatalogContext } from '../../catalog/contract.ts'
import {
  replaceWorkbenchContextLines,
  workbenchContextsFromDraft,
  workbenchContextKey,
} from './contract.ts'

type WorkbenchListener = () => void

export interface WorkbenchLayoutActions {
  readonly openDetails: () => void
  readonly closeDetails: () => void
}

export type WorkbenchSessionInput = ReturnType<IConversation['input']['for']>

export class WorkbenchController {
  private active = false
  private resultsOpen = false
  private readonly listeners = new Set<WorkbenchListener>()
  private readonly resultListeners = new Set<WorkbenchListener>()

  constructor(private readonly layout: WorkbenchLayoutActions) {}

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

  toggle(): void {
    this.active = !this.active
    if (this.active) this.openResults()
    else this.closeResults()
    for (const listener of this.listeners) listener()
  }

  openResults(): void {
    const changed = !this.resultsOpen
    this.resultsOpen = true
    this.layout.openDetails()
    if (changed) for (const listener of this.resultListeners) listener()
  }

  closeResults(): void {
    const changed = this.resultsOpen
    this.resultsOpen = false
    this.layout.closeDetails()
    if (changed) for (const listener of this.resultListeners) listener()
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

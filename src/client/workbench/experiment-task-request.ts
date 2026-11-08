import type { TaskRequestDraft } from '../../workbench/contract.ts'
import type { WorkbenchTaskDraftRequest, WorkbenchSaveTaskDraftRequest } from '../../workbench-remote.ts'

interface DraftApi {
  getTaskDraft(request: WorkbenchTaskDraftRequest): Promise<TaskRequestDraft | null>
  saveTaskDraft(request: WorkbenchSaveTaskDraftRequest): Promise<TaskRequestDraft>
}

export class TaskRequestEditor {
  private state: { draft: TaskRequestDraft; loading: boolean; error: string }
  private readonly listeners = new Set<() => void>()
  private queued: TaskRequestDraft | undefined
  private saving: Promise<void> | undefined
  private loading: Promise<void> | undefined
  private dirty = false

  constructor(readonly scope: WorkbenchTaskDraftRequest, private readonly api: DraftApi, instructions: string) {
    this.state = { draft: { instructions, resources: {} }, loading: true, error: '' }
  }

  getSnapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private update(next: typeof this.state) {
    this.state = next
    for (const listener of this.listeners) listener()
  }
  load(instructions: string) {
    if (this.loading || this.saving || this.dirty) return
    this.update({ ...this.state, loading: true, error: '' })
    this.loading = this.api.getTaskDraft(this.scope).then(draft => {
      this.update({ draft: draft ?? { instructions, resources: {} }, loading: false, error: '' })
    }).catch((error: Error) => {
      this.update({ ...this.state, loading: true, error: error.message })
    }).finally(() => { this.loading = undefined })
  }
  change(draft: TaskRequestDraft) {
    this.dirty = true
    this.update({ draft, loading: false, error: '' })
    this.queued = draft
    if (!this.saving) this.saving = this.flush().finally(() => { this.saving = undefined })
  }
  private async flush() {
    while (this.queued) {
      const draft = this.queued
      this.queued = undefined
      try {
        await this.api.saveTaskDraft({ ...this.scope, draft })
        if (this.state.draft === draft) this.dirty = false
      } catch (error) {
        if (!this.queued) this.update({ ...this.state, error: error instanceof Error ? error.message : String(error) })
      }
    }
  }
  async submittedDraft() {
    const draft = this.state.draft
    if (this.state.error && this.dirty) this.change(draft)
    await this.saving
    if (this.state.error) throw new Error(this.state.error)
    return draft
  }
}

import type { Branch, TaskDraft } from '../../workbench/contract.ts'
import { mergeTaskDraft } from '../../workbench/state.ts'

export interface PreparationSnapshot {
  readonly draft: TaskDraft
  readonly name: string
  readonly originalRequest: string
  readonly editing: boolean
  readonly saving: boolean
  readonly pending: boolean
  readonly error: string
}
interface PreparationSave {
  readonly expected: TaskDraft
  readonly expectedEditingDraft: TaskDraft | null
  readonly draft: TaskDraft
  readonly name: string
  readonly expectedName: string
  readonly originalRequest: string
  readonly expectedOriginalRequest: string
}
interface PreparationApi {
  readonly edit: (expected: TaskDraft, draft: TaskDraft | null) => Promise<TaskDraft | null>
  readonly save: (input: PreparationSave) => Promise<void>
  readonly onError: (message: string) => void
}
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

export class PreparationEditor {
  private state: PreparationSnapshot
  private branch: Branch
  private expected: TaskDraft
  private expectedName: string
  private expectedOriginalRequest: string
  private serverEditing: TaskDraft | null
  private readonly listeners = new Set<() => void>()
  private tail: Promise<unknown> = Promise.resolve()
  private conflicted = false
  private queued = false
  private flushing = false
  private operations = 0
  private saveOperation: Promise<void> | null = null

  constructor(branch: Branch, private readonly api: PreparationApi) {
    this.branch = branch
    this.expected = branch.draft
    this.expectedName = branch.name
    this.expectedOriginalRequest = branch.original_request
    this.serverEditing = branch.editing_draft
    this.state = { draft: branch.editing_draft ?? branch.draft, name: branch.name, originalRequest: branch.original_request,
      editing: !!branch.editing_draft,
      saving: false, pending: false, error: '' }
  }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(change: Partial<PreparationSnapshot>) {
    this.state = { ...this.state, ...change }
    for (const listener of this.listeners) listener()
  }
  sync(branch: Branch) {
    this.branch = branch
    if (this.operations || this.queued) return
    this.serverEditing = branch.editing_draft
    if (this.state.error) return
    const editing = this.state.editing || !!branch.editing_draft
    const draft = branch.editing_draft ?? branch.draft
    const name = this.state.name === this.expectedName ? branch.name : this.state.name
    const originalRequest = this.state.originalRequest === this.expectedOriginalRequest ? branch.original_request : this.state.originalRequest
    if (!editing) {
      this.expected = branch.draft
      this.expectedName = branch.name
      this.expectedOriginalRequest = branch.original_request
    }
    if (!equal(this.state.draft, draft) || this.state.name !== name || this.state.originalRequest !== originalRequest || this.state.editing !== editing)
      this.update({ draft, name, originalRequest, editing })
  }
  begin() {
    if (this.state.editing) return
    this.expected = this.branch.draft
    this.expectedName = this.branch.name
    this.expectedOriginalRequest = this.branch.original_request
    this.update({ draft: this.serverEditing ?? this.branch.draft, name: this.branch.name, originalRequest: this.branch.original_request, editing: true, error: '' })
  }
  change(change: Partial<TaskDraft>, metadata: { name?: string; originalRequest?: string } = {}) {
    this.begin()
    this.conflicted = false
    const draft = { ...this.state.draft, ...change }
    this.update({ draft, ...metadata, editing: true, error: '' })
    if (!Object.keys(change).length) return
    this.queued = true
    this.scheduleFlush()
  }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    this.operations++
    this.update({ pending: true })
    const result = this.tail.then(operation, operation)
    this.tail = result.catch(() => undefined)
    return result.finally(() => {
      this.operations--
      this.update({ pending: this.operations > 0 })
    })
  }
  private fail(error: unknown) {
    const failure = error as { code?: string; details?: { code?: string } } | null
    this.conflicted = failure?.code === 'WORKBENCH_EDIT_CONFLICT' || failure?.details?.code === 'WORKBENCH_EDIT_CONFLICT'
    const message = error instanceof Error ? error.message : '输入保存失败，请重试。'
    this.update({ error: message })
    this.api.onError(message)
  }
  private scheduleFlush() {
    if (this.flushing) return
    this.flushing = true
    void this.enqueue(async () => {
      try {
        while (this.queued) {
          this.queued = false
          const submitted = this.state.draft
          const accepted = await this.api.edit(this.serverEditing ?? this.branch.draft, submitted)
          this.serverEditing = accepted
          this.update({ draft: mergeTaskDraft(submitted, this.state.draft, accepted ?? this.branch.draft), error: '' })
        }
      } catch (error) { this.queued = false; this.fail(error) }
      finally { this.flushing = false }
    })
  }
  async flush() {
    await this.tail
    if (this.state.error) throw new Error(this.state.error)
  }
  save(): Promise<void> {
    if (this.saveOperation) return this.saveOperation
    if (this.state.error && !this.conflicted) { this.update({ error: '' }); this.queued = true; this.scheduleFlush() }
    this.update({ saving: true })
    this.saveOperation = this.enqueue(async () => {
      if (this.state.error) throw new Error(this.state.error)
      const submitted = this.state
      await this.api.save({ expected: this.expected, expectedEditingDraft: this.serverEditing, draft: submitted.draft,
        name: submitted.name, expectedName: this.expectedName, originalRequest: submitted.originalRequest, expectedOriginalRequest: this.expectedOriginalRequest })
      this.expected = submitted.draft
      this.expectedName = submitted.name
      this.expectedOriginalRequest = submitted.originalRequest
      this.branch = { ...this.branch, draft: submitted.draft, name: submitted.name, original_request: submitted.originalRequest, editing_draft: null }
      this.serverEditing = null
      const changed = this.state.draft !== submitted.draft || this.state.name !== submitted.name || this.state.originalRequest !== submitted.originalRequest
      this.update({ editing: changed, error: '' })
    }).catch(error => { this.fail(error); throw error }).finally(() => { this.saveOperation = null; this.update({ saving: false }) })
    return this.saveOperation
  }
  async cancel(): Promise<void> {
    this.update({ saving: true })
    try {
      await this.enqueue(async () => {
        const submitted = this.state
        await this.api.edit(this.serverEditing ?? this.branch.draft, null)
        this.serverEditing = null
        this.expected = this.branch.draft
        this.expectedName = this.branch.name
        this.expectedOriginalRequest = this.branch.original_request
        const draft = mergeTaskDraft(submitted.draft, this.state.draft, this.branch.draft)
        const changed = !equal(draft, this.branch.draft)
        this.update({ draft, name: this.state.name === submitted.name ? this.branch.name : this.state.name,
          originalRequest: this.state.originalRequest === submitted.originalRequest ? this.branch.original_request : this.state.originalRequest, editing: changed, error: '' })
      })
    } catch (error) { this.fail(error); throw error }
    finally { this.update({ saving: false }) }
  }
}

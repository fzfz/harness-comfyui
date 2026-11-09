import type { ReviewDraft, ReviewDraftUpdate } from '../../workbench/contract.ts'

export interface RunReviewScope {
  readonly workspaceId: string
  readonly workId: string
  readonly branchId: string
  readonly runId: string
}

export class RunReviewEditor {
  private state: { draft: ReviewDraft; error: string }
  private accepted: ReviewDraft
  private planned: ReviewDraft
  private tail = Promise.resolve()
  private pending = 0
  private blocked = false
  private pendingProjection: ReviewDraft | undefined
  private readonly edited = new Map<keyof ReviewDraft, { readonly value: ReviewDraft[keyof ReviewDraft] }>()
  private readonly listeners = new Set<() => void>()

  constructor(readonly scope: RunReviewScope, draft: ReviewDraft,
    private readonly save: (value: ReviewDraftUpdate) => Promise<void>) {
    this.accepted = structuredClone(draft)
    this.planned = structuredClone(draft)
    this.state = { draft: structuredClone(draft), error: '' }
  }

  getSnapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private update(draft: ReviewDraft, error = '') {
    this.state = { draft, error }
    for (const listener of this.listeners) listener()
  }
  sync(draft: ReviewDraft) {
    if (this.pending) { this.pendingProjection = structuredClone(draft); return }
    this.accepted = structuredClone(draft)
    this.planned = structuredClone(draft)
    const local = Object.fromEntries([...this.edited].map(([field, edit]) => [field, structuredClone(edit.value)]))
    this.update({ ...structuredClone(draft), ...local }, this.state.error)
  }
  private enqueue<T>(draft: ReviewDraft, operation: (value: ReviewDraftUpdate) => Promise<T>) {
    if (!this.pending) this.blocked = false
    const value = { expected: structuredClone(this.planned), draft: structuredClone(draft) }
    const edits = new Map(this.edited)
    this.planned = structuredClone(draft)
    this.pending++
    const result = this.tail.then(async () => {
      if (this.blocked) throw new Error(this.state.error)
      const result = await operation(value)
      this.accepted = structuredClone(value.draft)
      for (const [field, edit] of edits) if (this.edited.get(field) === edit) this.edited.delete(field)
      if (this.state.error) this.update(this.state.draft)
      return result
    }).catch((error: unknown) => {
      this.blocked = true
      this.update(this.state.draft, error instanceof Error ? error.message : String(error))
      throw error
    }).finally(() => {
      this.pending--
      if (!this.pending) {
        this.planned = structuredClone(this.accepted)
        const projection = this.pendingProjection
        this.pendingProjection = undefined
        if (this.blocked && projection) this.sync(projection)
      }
    })
    this.tail = result.then(() => {}, () => {})
    return result
  }
  change<K extends keyof ReviewDraft>(field: K, value: ReviewDraft[K]) {
    const draft = { ...this.state.draft, [field]: value }
    this.edited.set(field, { value: structuredClone(value) })
    this.update(draft)
    void this.enqueue(draft, this.save).catch(() => {})
  }
  submit<T>(operation: (value: ReviewDraftUpdate) => Promise<T>) {
    const draft = structuredClone(this.state.draft)
    return this.enqueue(draft, operation)
  }
}

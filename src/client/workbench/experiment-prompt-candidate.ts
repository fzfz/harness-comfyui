import type { PromptTurn } from '../../workbench/prompt-edit.ts'

type Candidate = NonNullable<PromptTurn['candidate']>
interface CandidateSnapshot {
  readonly result: Candidate
  readonly resultDirty: boolean
  readonly resultSaving: boolean
  readonly error: string
}

export class PromptCandidateEditor {
  private state: CandidateSnapshot
  private saved: Candidate
  private baseline: Candidate
  private tail: Promise<void> = Promise.resolve()
  private revision = 0
  private epoch = 0
  private submittedEpoch = -1
  private readonly listeners = new Set<() => void>()

  constructor(initial: Candidate, private readonly persist: (result: Candidate) => Promise<PromptTurn>) {
    this.saved = initial
    this.baseline = initial
    this.state = { result: initial, resultDirty: false, resultSaving: false, error: '' }
  }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(change: Partial<CandidateSnapshot>) {
    this.state = { ...this.state, ...change }
    for (const listener of this.listeners) listener()
  }
  sync(result: Candidate) {
    this.saved = result
    if (!this.state.resultDirty && !this.state.resultSaving) this.update({ result })
  }
  change(result: Candidate) {
    if (!this.state.resultDirty && !this.state.resultSaving) { this.baseline = this.saved; this.epoch++ }
    this.revision++
    this.update({ result, resultDirty: true })
    void this.save()
  }
  async save() {
    const { result } = this.state, revision = this.revision, epoch = this.epoch
    this.update({ resultSaving: true })
    const operation = this.tail.then(async () => {
      if (epoch !== this.epoch) return
      this.submittedEpoch = epoch
      const saved = await this.persist(result)
      if (epoch !== this.epoch) return
      this.saved = saved.candidate ?? result
      if (revision === this.revision) this.update({ resultDirty: false, error: '' })
    })
    this.tail = operation.catch(error => { if (revision === this.revision) this.fail(error) })
    await this.tail
    if (revision === this.revision) this.update({ resultSaving: false })
  }
  async discard(): Promise<boolean> {
    const result = this.baseline, submitted = this.submittedEpoch === this.epoch, revision = ++this.revision
    this.epoch++
    this.update({ result, resultDirty: submitted, resultSaving: submitted, error: '' })
    if (!submitted) return true
    const operation = this.tail.then(async () => {
      const saved = await this.persist(result)
      this.saved = saved.candidate ?? result
      if (revision === this.revision) this.update({ resultDirty: false, error: '' })
    })
    this.tail = operation.catch(error => { if (revision === this.revision) this.fail(error) })
    await this.tail
    if (revision === this.revision) this.update({ resultSaving: false })
    return revision === this.revision && !this.state.resultDirty
  }
  async flush() {
    await this.tail
    if (this.state.resultDirty) throw new Error(this.state.error || '生成结果的修改尚未保存，请保存后重试。')
  }
  private fail(error: unknown) {
    this.update({ resultDirty: true, error: error instanceof Error ? error.message : '生成结果保存失败，请重试。' })
  }
}

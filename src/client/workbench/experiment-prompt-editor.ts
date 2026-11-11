import type { FunctionBinding } from '../../workbench/contract.ts'
import type { PromptTurn, PromptStartRequest, PromptLookupRequest, PromptListRequest, PromptAdoptRequest } from '../../workbench/prompt-edit.ts'
import { PromptCandidateEditor } from './experiment-prompt-candidate.ts'
import type { PreparationEditor } from './experiment-preparation.ts'

export interface PromptEditingRemote {
  readonly promptStart: (request: PromptStartRequest) => Promise<PromptTurn>
  readonly promptGet: (request: PromptLookupRequest) => Promise<PromptTurn>
  readonly promptList: (request: PromptListRequest) => Promise<PromptTurn[]>
  readonly promptCancel: (request: PromptLookupRequest) => Promise<PromptTurn>
  readonly promptSaveCandidate: (request: PromptAdoptRequest) => Promise<PromptTurn>
  readonly promptAdopt: (request: PromptAdoptRequest) => Promise<PromptTurn>
}
export interface PromptEditingSnapshot {
  readonly open: boolean
  readonly resultSaving: boolean
  readonly resultDirty: boolean
  readonly confirmClose: boolean
  readonly busy: boolean
  readonly error: string
  readonly changeRequest: string
  readonly turn: PromptTurn | null
  readonly before: { positive_prompt: string; negative_prompt: string }
  readonly result: { positive_prompt: string; negative_prompt: string } | null
}
const activeTurn = (turn: PromptTurn) => turn.status === 'queued' || turn.status === 'running'

export function promptResultStatus(turn: PromptTurn | null): 'unavailable' | 'saved' | 'pending' | 'adopted' {
  if (!turn || turn.status !== 'succeeded') return 'unavailable'
  const candidate = turn.candidate, adopted = turn.adopted
  if (candidate && (!adopted || candidate.positive_prompt !== adopted.positive_prompt || candidate.negative_prompt !== adopted.negative_prompt)) return 'pending'
  if (adopted) return 'adopted'
  return turn.intent === 'generate' && turn.candidate === null ? 'saved' : 'unavailable'
}

export class PromptEditingController {
  private state: PromptEditingSnapshot
  private readonly listeners = new Set<() => void>()
  private disposed = false
  private taskId: string | null = null
  private selectedHistoryTaskId: string | null = null
  private selection: object = {}
  private restoration: { readonly taskId: string; readonly selection: object } | null = null
  private binding: FunctionBinding | null = null
  private selectedRequestId: string | null = null
  private readonly requests = new Map<string, { selection: object; delivered: boolean; cancelRequested: boolean }>()
  private readonly turns = new Map<string, PromptTurn>()
  private readonly candidates = new Map<string, PromptCandidateEditor>()

  constructor(private readonly scope: { workspace_id: string; work_id: string; branch_id: string }, private readonly remote: PromptEditingRemote, private readonly editor: PreparationEditor) {
    const draft = editor.getSnapshot().draft
    this.taskId = draft.prompt_edit_task_id ?? null
    this.state = { open: false, resultSaving: false, resultDirty: false, confirmClose: false, busy: false, error: '', changeRequest: draft.prompt_change_request ?? '', turn: null,
      before: { positive_prompt: draft.prompt_input.positive_prompt ?? '', negative_prompt: draft.prompt_input.negative_prompt ?? '' }, result: null }
  }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(change: Partial<PromptEditingSnapshot>) {
    if (this.disposed) return
    this.state = { ...this.state, ...change }
    for (const listener of this.listeners) listener()
  }
  private isCurrent(selection: object, requestId?: string) {
    return !this.disposed && this.selection === selection && (requestId === undefined || this.state.turn?.request_id === requestId)
  }
  private selectTask(taskId: string) {
    if (taskId === this.taskId) return
    this.taskId = taskId
    this.selectedRequestId = null
    this.selection = {}
    this.restoration = null
    this.update({ turn: null, result: null, resultDirty: false, resultSaving: false, confirmClose: false, busy: false, error: '' })
  }
  private restoreTaskId() { return this.selectedHistoryTaskId ?? this.editor.getSnapshot().draft.prompt_edit_task_id ?? this.taskId }
  async restore() {
    const taskId = this.restoreTaskId()
    if (!taskId || this.restoration?.taskId === taskId || this.state.turn?.task_id === taskId) return
    if (this.selectedRequestId && this.requests.get(this.selectedRequestId)?.selection === this.selection) this.taskId = taskId
    else this.selectTask(taskId)
    const restoration = { taskId, selection: this.selection }
    this.restoration = restoration
    try {
      const turns = await this.remote.promptList({ workspace_id: this.scope.workspace_id, task_id: taskId })
      if (!this.isCurrent(restoration.selection) || this.restoration !== restoration || this.taskId !== taskId || this.restoreTaskId() !== taskId || this.state.turn) return
      const turn = this.selectedRequestId ? turns.find(turn => turn.request_id === this.selectedRequestId) : turns.at(-1)
      if (turn) this.receive(turn)
    } catch (error) { if (this.isCurrent(restoration.selection) && this.restoration === restoration && this.taskId === taskId && this.restoreTaskId() === taskId) this.fail(error) }
    finally { if (this.restoration === restoration) this.restoration = null }
  }
  open(binding: FunctionBinding, taskId?: string) {
    this.binding = binding
    if (taskId) this.selectedHistoryTaskId = taskId
    if (taskId && taskId !== this.taskId) {
      this.selectTask(taskId)
      void this.restore()
    }
    const draft = this.editor.getSnapshot().draft
    if (!this.state.result && !this.state.turn) this.update({ before: { positive_prompt: draft.prompt_input.positive_prompt ?? '', negative_prompt: draft.prompt_input.negative_prompt ?? '' } })
    this.update({ open: true, error: this.currentCandidate()?.getSnapshot().error ?? '' })
  }
  close = () => this.state.resultDirty || this.state.resultSaving
    ? this.update({ confirmClose: true }) : this.update({ open: false })
  continueEditing = () => this.update({ confirmClose: false })
  discardResult = async () => {
    const requestId = this.state.turn?.request_id, candidate = this.currentCandidate()
    if (candidate && await candidate.discard() && this.state.turn?.request_id === requestId) this.update({ confirmClose: false, open: false })
  }
  saveAndClose = async () => {
    const requestId = this.state.turn?.request_id, candidate = this.currentCandidate()
    await candidate?.save()
    if (this.state.turn?.request_id === requestId && !this.state.resultDirty && !this.state.resultSaving) this.update({ confirmClose: false, open: false })
  }
  setChangeRequest = (changeRequest: string) => {
    this.update({ changeRequest })
    this.editor.change({ prompt_change_request: changeRequest })
  }
  private currentCandidate() { return this.state.turn ? this.candidates.get(this.state.turn.request_id) : undefined }
  hasUnpersistedCandidateChanges = () => [...this.candidates.values()].some(candidate => {
    const state = candidate.getSnapshot()
    return state.resultDirty || state.resultSaving
  })
  editResult = (result: NonNullable<PromptEditingSnapshot['result']>) => this.currentCandidate()?.change(result)
  saveResult = async () => { await this.currentCandidate()?.save() }
  private candidateFor(turn: PromptTurn): PromptCandidateEditor | undefined {
    if (!turn.result) return undefined
    const result = turn.candidate ?? turn.adopted ?? { positive_prompt: turn.result.positive_prompt, negative_prompt: turn.result.negative_prompt }
    let candidate = this.candidates.get(turn.request_id)
    if (!candidate) {
      candidate = new PromptCandidateEditor(result, result => this.remote.promptSaveCandidate({ workspace_id: this.scope.workspace_id, request_id: turn.request_id, ...result }))
      const bound = candidate
      candidate.subscribe(() => { if (this.state.turn?.request_id === turn.request_id) this.update(bound.getSnapshot()) })
      this.candidates.set(turn.request_id, candidate)
    } else candidate.sync(result)
    return candidate
  }
  async start(binding = this.binding) {
    if (this.state.busy || !binding || this.disposed) return
    this.binding = binding
    const selection = this.selection
    const snapshot = this.editor.getSnapshot(), draft = snapshot.draft
    if (!draft.base_model_id) { this.update({ error: '请先选择底模。' }); return }
    if (!snapshot.originalRequest.trim()) { this.update({ error: '请填写原始需求。' }); return }
    const prompts = this.state.open ? this.state.result ?? this.state.before : {
      positive_prompt: draft.prompt_input.positive_prompt ?? '', negative_prompt: draft.prompt_input.negative_prompt ?? '',
    }
    const revision = !!(prompts.positive_prompt.trim() || prompts.negative_prompt.trim())
    if (revision && !this.state.changeRequest.trim()) { this.update({ error: '请填写改动意见。', open: true }); return }
    this.restoration = null
    const requestId = crypto.randomUUID()
    const requestState = { selection, delivered: false, cancelRequested: false }
    this.requests.set(requestId, requestState)
    this.selectedRequestId = requestId
    this.update({ busy: true, error: '', before: { ...prompts }, result: null, turn: null })
    try {
      const turn = await this.remote.promptStart({ ...this.scope, function_id: binding.function_id, request_id: requestId, intent: revision ? 'rewrite' : 'generate',
        ...(this.taskId ? { task_id: this.taskId } : {}), draft,
        input: { original_request: snapshot.originalRequest, base_model_id: draft.base_model_id, change_request: this.state.changeRequest, ...prompts } })
      if (requestState.cancelRequested) {
        requestState.cancelRequested = false
        try { await this.remote.promptCancel({ workspace_id: this.scope.workspace_id, request_id: requestId }) }
        catch (error) { if (this.isCurrent(selection) && (!this.state.turn || this.state.turn.request_id === requestId)) this.fail(error) }
      }
      if ((!this.isCurrent(selection) && this.taskId !== turn.task_id) || requestState.delivered) return
      this.taskId = turn.task_id
      if (!this.state.turn && this.isCurrent(selection)) this.update({ turn: { ...turn, status: 'running', result: null }, busy: true })
    } catch (error) { if (this.isCurrent(selection)) { this.update({ busy: false }); this.fail(error) } }
  }
  private fail(error: unknown) { this.update({ error: error instanceof Error ? error.message : '提示词请求失败，请重试。' }) }
  receiveRecords(turns: readonly PromptTurn[], taskIds: ReadonlySet<string>) {
    if (this.disposed) return
    for (const turn of turns) {
      if (!taskIds.has(turn.task_id)) continue
      this.turns.set(turn.request_id, turn)
      const request = this.requests.get(turn.request_id)
      if (request && !activeTurn(turn)) request.delivered = true
    }
    if (this.selectedRequestId && this.requests.get(this.selectedRequestId)?.selection === this.selection) {
      const selected = this.turns.get(this.selectedRequestId)
      if (selected && taskIds.has(selected.task_id)) this.receive(selected)
      return
    }
    const localRequest = [...this.requests].reverse().find(([, request]) => request.selection === this.selection)
    const selectedTask = (localRequest ? this.turns.get(localRequest[0])?.task_id : undefined) ?? this.taskId
    const selected = [...this.turns.values()].filter(turn => turn.task_id === selectedTask && taskIds.has(turn.task_id))
      .reduce<PromptTurn | undefined>((latest, turn) => !latest || turn.turn_index > latest.turn_index ? turn : latest, undefined)
    if (selected) this.receive(selected)
  }
  private receive(turn: PromptTurn) {
    if (this.disposed) return
    this.taskId = turn.task_id
    if (this.selectedRequestId === turn.request_id && !activeTurn(turn)) this.selectedRequestId = null
    const candidate = this.candidateFor(turn)?.getSnapshot()
    this.update({ turn, busy: activeTurn(turn), ...(candidate ? { ...candidate, before: { positive_prompt: turn.input.positive_prompt, negative_prompt: turn.input.negative_prompt } } : { result: null, resultDirty: false, resultSaving: false, error: '' }),
      ...(turn.error ? { error: typeof turn.error === 'string' ? turn.error : turn.error.message } : {}) })
  }
  async cancel() {
    const selection = this.selection, turn = this.state.turn
    if (!this.state.busy) return
    if (!turn) {
      const request = this.selectedRequestId ? this.requests.get(this.selectedRequestId) : undefined
      if (request) request.cancelRequested = true
      return
    }
    const request = this.requests.get(turn.request_id)
    if (request) request.cancelRequested = false
    try {
      await this.remote.promptCancel({ workspace_id: this.scope.workspace_id, request_id: turn.request_id })
    } catch (error) { if (this.isCurrent(selection, turn.request_id)) this.fail(error) }
  }
  async adopt() {
    const selection = this.selection
    const { turn, result } = this.state
    if (!turn || !result || this.state.busy || promptResultStatus(turn) !== 'pending') return
    try {
      await this.currentCandidate()?.flush()
      let accepted = turn
      await this.editor.applyPrompts(result, async () => { accepted = await this.remote.promptAdopt({ workspace_id: this.scope.workspace_id, request_id: turn.request_id, ...result }) })
      if (!this.isCurrent(selection, turn.request_id)) return
      this.update({ turn: accepted, open: false, error: '' })
    } catch (error) { if (this.isCurrent(selection, turn.request_id)) this.fail(error) }
  }
  dispose() { this.disposed = true; this.listeners.clear() }
}

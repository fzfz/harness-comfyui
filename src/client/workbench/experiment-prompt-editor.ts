import type { FunctionBinding } from '../../workbench/contract.ts'
import type { PromptTurn, PromptStartRequest, PromptLookupRequest, PromptListRequest, PromptAdoptRequest } from '../../workbench/prompt-edit.ts'
import type { PreparationEditor } from './experiment-preparation.ts'

export interface PromptEditingRemote {
  readonly promptStart: (request: PromptStartRequest) => Promise<PromptTurn>
  readonly promptGet: (request: PromptLookupRequest) => Promise<PromptTurn>
  readonly promptList: (request: PromptListRequest) => Promise<PromptTurn[]>
  readonly promptCancel: (request: PromptLookupRequest) => Promise<PromptTurn>
  readonly promptAdopt: (request: PromptAdoptRequest) => Promise<PromptTurn>
}
export interface PromptEditingSnapshot {
  readonly open: boolean
  readonly busy: boolean
  readonly error: string
  readonly changeRequest: string
  readonly turn: PromptTurn | null
  readonly before: { positive_prompt: string; negative_prompt: string }
  readonly result: { positive_prompt: string; negative_prompt: string } | null
}
const activeTurn = (turn: PromptTurn) => turn.status === 'queued' || turn.status === 'running'

export class PromptEditingController {
  private state: PromptEditingSnapshot
  private readonly listeners = new Set<() => void>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private disposed = false
  private taskId: string | null = null
  private selection: object = {}
  private restoration: { readonly taskId: string; readonly selection: object } | null = null
  private origin: { request: string; base: string | null; positive_prompt: string; negative_prompt: string } | null = null
  private binding: FunctionBinding | null = null
  private cancelRequested = false

  constructor(private readonly scope: { workspace_id: string; work_id: string; branch_id: string }, private readonly remote: PromptEditingRemote, private readonly editor: PreparationEditor, private readonly pollIntervalMs: number) {
    const draft = editor.getSnapshot().draft
    this.taskId = draft.prompt_edit_task_id ?? null
    this.state = { open: false, busy: false, error: '', changeRequest: draft.prompt_change_request ?? '', turn: null,
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
    this.selection = {}
    this.restoration = null
    this.origin = null
    this.cancelRequested = false
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    this.update({ turn: null, result: null, busy: false, error: '' })
  }
  async restore() {
    const taskId = this.editor.getSnapshot().draft.prompt_edit_task_id ?? this.taskId
    if (!taskId || this.restoration?.taskId === taskId || this.state.turn?.task_id === taskId) return
    this.selectTask(taskId)
    const restoration = { taskId, selection: this.selection }
    this.restoration = restoration
    try {
      const turns = await this.remote.promptList({ workspace_id: this.scope.workspace_id, task_id: taskId })
      if (!this.isCurrent(restoration.selection) || this.restoration !== restoration || this.taskId !== taskId || this.editor.getSnapshot().draft.prompt_edit_task_id !== taskId || this.state.turn) return
      const turn = turns.at(-1)
      if (turn) this.receive(turn)
    } catch (error) { if (this.isCurrent(restoration.selection) && this.restoration === restoration && this.taskId === taskId && this.editor.getSnapshot().draft.prompt_edit_task_id === taskId) this.fail(error) }
    finally { if (this.restoration === restoration) this.restoration = null }
  }
  open(binding: FunctionBinding, taskId?: string) {
    this.binding = binding
    if (taskId && taskId !== this.taskId) {
      this.selectTask(taskId)
      this.editor.change({ prompt_edit_task_id: taskId })
      void this.restore()
    }
    const draft = this.editor.getSnapshot().draft
    if (!this.state.result && !this.state.turn) this.update({ before: { positive_prompt: draft.prompt_input.positive_prompt ?? '', negative_prompt: draft.prompt_input.negative_prompt ?? '' } })
    this.update({ open: true, error: '' })
  }
  close = () => this.update({ open: false })
  setChangeRequest = (changeRequest: string) => {
    this.update({ changeRequest })
    this.editor.change({ prompt_change_request: changeRequest })
  }
  editResult = (result: NonNullable<PromptEditingSnapshot['result']>) => this.update({ result })
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
    this.origin = { request: snapshot.originalRequest, base: draft.base_model_id,
      positive_prompt: draft.prompt_input.positive_prompt ?? '', negative_prompt: draft.prompt_input.negative_prompt ?? '' }
    this.cancelRequested = false
    this.restoration = null
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    this.update({ busy: true, error: '', before: { ...prompts }, result: null, turn: null })
    try {
      const turn = await this.remote.promptStart({ ...this.scope, function_id: binding.function_id, request_id: crypto.randomUUID(),
        ...(this.taskId ? { task_id: this.taskId } : {}), draft,
        input: { original_request: snapshot.originalRequest, base_model_id: draft.base_model_id, change_request: this.state.changeRequest, ...prompts } })
      if (!this.isCurrent(selection)) return
      this.taskId = turn.task_id
      this.editor.change({ prompt_edit_task_id: turn.task_id })
      const accepted = this.cancelRequested && activeTurn(turn) ? await this.remote.promptCancel({ workspace_id: this.scope.workspace_id, request_id: turn.request_id }) : turn
      if (this.isCurrent(selection)) this.receive(accepted)
    } catch (error) { if (this.isCurrent(selection)) { this.update({ busy: false }); this.fail(error) } }
  }
  private fail(error: unknown) { this.update({ error: error instanceof Error ? error.message : '提示词请求失败，请重试。' }) }
  private receive(turn: PromptTurn) {
    if (this.disposed) return
    const selection = this.selection
    this.taskId = turn.task_id
    this.update({ turn, busy: activeTurn(turn), ...(turn.result ? { before: {
      positive_prompt: turn.input.positive_prompt, negative_prompt: turn.input.negative_prompt,
    }, result: turn.adopted ?? { positive_prompt: turn.result.positive_prompt, negative_prompt: turn.result.negative_prompt } } : {}),
      ...(turn.error ? { error: typeof turn.error === 'string' ? turn.error : turn.error.message } : {}) })
    if (activeTurn(turn)) { this.poll(turn.request_id); return }
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    if (!turn.result || !this.origin) return
    const snapshot = this.editor.getSnapshot(), draft = snapshot.draft, origin = this.origin
    this.origin = null
    if (!origin.positive_prompt.trim() && !origin.negative_prompt.trim() && snapshot.originalRequest === origin.request && draft.base_model_id === origin.base
      && (draft.prompt_input.positive_prompt ?? '') === origin.positive_prompt && (draft.prompt_input.negative_prompt ?? '') === origin.negative_prompt) {
      this.editor.change({ prompt_input: { positive_prompt: turn.result.positive_prompt, negative_prompt: turn.result.negative_prompt } })
      void this.remote.promptAdopt({ workspace_id: this.scope.workspace_id, request_id: turn.request_id,
        positive_prompt: turn.result.positive_prompt, negative_prompt: turn.result.negative_prompt }).catch(error => { if (this.isCurrent(selection, turn.request_id)) this.fail(error) })
    } else this.update({ open: true })
  }
  private poll(request_id: string) {
    if (this.pollIntervalMs <= 0) return
    const selection = this.selection
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      if (!this.isCurrent(selection, request_id) || !this.state.busy) return
      void this.remote.promptGet({ workspace_id: this.scope.workspace_id, request_id }).then(turn => {
        if (this.isCurrent(selection, request_id) && this.state.busy) this.receive(turn)
      }).catch(error => {
        if (!this.isCurrent(selection, request_id) || !this.state.busy) return
        this.fail(error)
        this.poll(request_id)
      })
    }, this.pollIntervalMs)
  }
  async cancel() {
    const selection = this.selection, turn = this.state.turn
    if (!this.state.busy) return
    if (!turn) { this.cancelRequested = true; return }
    try {
      const stopped = await this.remote.promptCancel({ workspace_id: this.scope.workspace_id, request_id: turn.request_id })
      if (this.isCurrent(selection, turn.request_id)) this.receive(stopped)
    } catch (error) { if (this.isCurrent(selection, turn.request_id)) this.fail(error) }
  }
  async adopt() {
    const selection = this.selection
    const { turn, result } = this.state
    if (!turn || !result || this.state.busy) return
    try {
      const accepted = await this.remote.promptAdopt({ workspace_id: this.scope.workspace_id, request_id: turn.request_id, ...result })
      if (!this.isCurrent(selection, turn.request_id)) return
      this.editor.change({ prompt_input: { ...result } })
      this.update({ turn: accepted, open: false, error: '' })
    } catch (error) { if (this.isCurrent(selection, turn.request_id)) this.fail(error) }
  }
  dispose() { this.disposed = true; if (this.timer) clearTimeout(this.timer); this.listeners.clear() }
}

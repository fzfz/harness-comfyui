import { contracts } from '#contracts'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { SessionEventConsumer, requestTurn } from './session-events.ts'
import type { FunctionDescriptor, ImageRef, ImageSource, ResourceSnapshot, Task, TaskDraft } from '../../workbench/contract.ts'
import type { PromptAdoptRequest, PromptListRequest, PromptLookupRequest, PromptReply, PromptStartRequest, PromptTurn } from '../../workbench/prompt-edit.ts'
import { buildPromptRequest, DEFAULT_PROMPT_REQUEST_PARTS, type PromptRequestInput } from '../../workbench/request-template.ts'
import config from '../../workbench/prompt-edit-config.json' with { type: 'json' }
import { equalValue } from '../../shared/json-contract.ts'
import { WorkbenchError } from '../../workbench/validation.ts'
import type { WorkbenchStore } from '../storage/workbench-store.ts'
import type { HarnessWorkbenchSessions, OfficialSessionController } from './harness-adapter.ts'

interface PromptPorts {
  store: WorkbenchStore
  sessions: HarnessWorkbenchSessions
  controller: OfficialSessionController
  reportError?(error: unknown): void
  isSessionActive?(sessionId: string): boolean
  descriptors: readonly FunctionDescriptor[]
  events(sessionId: string): Promise<readonly SessionEvent[]>
  baseModel(draft: TaskDraft, baseModelId: string): Promise<{ id: string; name: string }>
  images(refs: ImageRef[]): Promise<ImageSource[]>
  resources(draft: TaskDraft): Promise<ResourceSnapshot[]>
}
const failure = (name: keyof typeof config.errors, path: string): never => { const error = config.errors[name]; throw new WorkbenchError(error.code, error.message, path) }
const unfinished = (turn: PromptTurn) => turn.status === 'queued' || turn.status === 'running'

export class WorkbenchPrompts {
  private readonly pending = new Map<string, AbortController>()
  private readonly events: SessionEventConsumer
  constructor(private readonly ports: PromptPorts) { this.events = new SessionEventConsumer(ports.events) }

  async prepare(input: PromptStartRequest['input'], draft: TaskDraft, skill: string | null, fixedResources?: ResourceSnapshot[]): Promise<PromptRequestInput> {
    if (!input.original_request.trim()) failure('requirements', 'input.original_request')
    if (!input.base_model_id && !draft.generation_input.model) failure('baseModel', 'input.base_model_id')
    const baseModel = await this.ports.baseModel(draft, input.base_model_id)
    const selectedResources = fixedResources ?? await this.ports.resources(draft)
    const artifacts = draft.reference_task_ids.flatMap(id => this.ports.store.listArtifacts(id).map(stored => ({ task_id: stored.task_id, artifact_id: stored.artifact_id, artifact: stored.artifact })))
    const experiences = draft.reference_experiences.map(reference => { this.ports.store.getExperience(reference.experience_id); return structuredClone(reference) })
    for (const id of draft.reference_run_ids) this.ports.store.getRun(id)
    const references = draft.image_refs.filter(image => image.purpose === 'agent' || image.purpose === 'both')
    const resolved = await this.ports.images(references)
    const images = references.map(reference => ({ ...reference, ...resolved.find(image => image.image_ref_id === reference.image_ref_id) }))
    return { ...input, base_model_id: baseModel.id, base_model_name: baseModel.name, reference_context: {
      selected_resources: selectedResources,
      ...(skill ? { requested_skill: skill } : {}), ...(experiences.length ? { experiences } : {}),
      ...(artifacts.length ? { task_artifacts: artifacts } : {}), ...(draft.reference_run_ids.length ? { run_ids: draft.reference_run_ids } : {}), ...(images.length ? { images } : {}),
    } }
  }

  async prepareTask(binding: import('../../workbench/contract.ts').FunctionBinding, input: import('../../workbench/contract.ts').TaskInput) {
    const prepared = await this.prepare({ original_request: input.requirements.original_request, base_model_id: input.base_model_id ?? '', positive_prompt: input.prompt_input.positive_prompt ?? '', negative_prompt: input.prompt_input.negative_prompt ?? '', change_request: input.requirements.instructions }, { ...input, instructions: input.requirements.instructions }, binding.requested_skill, input.selected_resources ?? [])
    if (input.reference_task_artifacts.length) prepared.reference_context.task_artifacts = input.reference_task_artifacts
    return { input: prepared, requestText: buildPromptRequest(binding.request_template, prepared, binding.request_parts ?? DEFAULT_PROMPT_REQUEST_PARTS) }
  }
  attachTask(task: Task, sessionId: string, prepared: { input: PromptRequestInput; requestText: string }, requestId: string, delegated: boolean): void {
    if (this.ports.store.listPromptTurns(task.task_id).length) return
    this.ports.store.beginPromptTurn({ request_id: requestId, task_id: task.task_id, function_id: task.function_id, kind: 'prompt', intent: 'generate', candidate: null, session_id: sessionId, harness_turn: delegated ? 1 : null,
      preset_id: task.binding_snapshot.preset_id, agent_model: (task.selected_model ?? task.binding_snapshot.agentModel) as import('../../workbench/contract.ts').AgentModel, input: prepared.input, request_template: task.binding_snapshot.request_template,
      request_parts: task.binding_snapshot.request_parts ?? DEFAULT_PROMPT_REQUEST_PARTS, request_text: prepared.requestText, status: 'running', error: null, artifact_id: null, result: null, adopted: null, applied_at: null, created_at: Date.now(), finished_at: null, start_seq: -1 })
    void this.handleSessionEvents(sessionId).catch(error => this.ports.reportError?.(error))
  }

  async preview(request: PromptStartRequest): Promise<PromptRequestInput> {
    const { store } = this.ports
    store.assertScope(request.workspace_id, request.work_id, request.branch_id)
    const branch = store.getBranch(request.branch_id)
    const binding = store.getFunctionBinding(request.workspace_id, request.function_id)
    if (binding.kind !== 'prompt') return failure('binding', 'function_id')
    return this.prepare(request.input, contracts.parse('taskDraft', 'input', request.draft ?? branch.editing_draft ?? branch.draft), binding.requested_skill)
  }

  private acceptedRequest(request: PromptStartRequest): PromptTurn | null {
    const previous = this.ports.store.getPromptTurn(request.request_id)
    if (previous && !equalValue(this.ports.store.getPromptSubmission(request.request_id), JSON.parse(JSON.stringify(request)))) failure('conflict', 'request_id')
    return previous
  }

  async start(request: PromptStartRequest): Promise<PromptTurn> {
    const { store } = this.ports
    store.assertScope(request.workspace_id, request.work_id, request.branch_id)
    const previous = this.acceptedRequest(request)
    if (previous) return previous
    const branch = store.getBranch(request.branch_id)
    const draft = contracts.parse('taskDraft', 'input', request.draft ?? branch.editing_draft ?? branch.draft)
    const binding = store.getFunctionBinding(request.workspace_id, request.function_id)
    if (binding.kind !== 'prompt') failure('binding', 'function_id')
    const input = await this.prepare(request.input, draft, binding.requested_skill)
    const accepted = this.acceptedRequest(request)
    if (accepted) return accepted
    const existingTaskId = request.task_id ?? (store.getBranch(branch.branch_id).editing_draft ?? draft).prompt_edit_task_id
    let task: Task
    if (existingTaskId) {
      task = store.getTask(existingTaskId)
      if (task.kind !== 'prompt' || task.parent_experiment_task_id !== null || task.branch_id !== request.branch_id || store.taskWorkspace(task.task_id) !== request.workspace_id) failure('scope', 'task_id')
      if (store.listPromptTurns(task.task_id).some(unfinished)) failure('busy', 'task_id')
    } else {
      const descriptor = this.ports.descriptors.find(item => item.kind === 'prompt')!
      const { instructions: _instructions, ...fixed } = draft
      task = store.createTask({ branchId: branch.branch_id, functionId: binding.function_id, title: `${binding.name} · ${branch.name}`, kind: 'prompt',
        input: { ...fixed, selected_resources: contracts.parse('resourceSnapshots', 'input', input.reference_context.selected_resources ?? []), base_model_id: input.base_model_id, requirements: { original_request: input.original_request, instructions: input.change_request }, reference_task_artifacts: [], requested_skill: binding.requested_skill, max_runs: 0 },
        outputContract: { ...descriptor.output_contract, apply_mode: 'record' }, applyTarget: { kind: 'branch', id: branch.branch_id, expected: {} },
        bindingSnapshot: { function_id: binding.function_id, name: binding.name, kind: binding.kind, preset_id: binding.preset_id, agentModel: binding.agent_model, requested_skill: binding.requested_skill, request_template: binding.request_template }, requestText: '',
      })
      const current = store.getBranch(branch.branch_id)
      store.saveEditingDraft({ workspaceId: request.workspace_id, workId: request.work_id, branchId: branch.branch_id, expected: current.editing_draft ?? current.draft, draft: { ...(current.editing_draft ?? current.draft), prompt_edit_task_id: task.task_id, prompt_change_request: draft.prompt_change_request ?? '' } })
    }
    const turns = store.listPromptTurns(task.task_id)
    const last = turns.at(-1)
    const sessionId = last?.preset_id === binding.preset_id ? last.session_id : ''
    const parts = structuredClone(binding.request_parts ?? DEFAULT_PROMPT_REQUEST_PARTS)
    const turn = store.beginPromptTurn({ request_id: request.request_id, task_id: task.task_id, function_id: binding.function_id, kind: 'prompt', intent: request.intent, candidate: null, session_id: sessionId,
      harness_turn: null, preset_id: binding.preset_id, agent_model: structuredClone(binding.agent_model), input, request_template: binding.request_template, request_parts: parts,
      request_text: buildPromptRequest(binding.request_template, input, parts), status: 'queued', error: null, artifact_id: null, result: null, adopted: null, applied_at: null, created_at: Date.now(), finished_at: null, start_seq: -1 }, JSON.parse(JSON.stringify(request)))
    const controller = new AbortController(); this.pending.set(turn.request_id, controller)
    try {
      if (!sessionId) {
        const created = await this.ports.sessions.create({ task, presetId: binding.preset_id, agentModel: binding.agent_model, requestedSkill: binding.requested_skill, onCreated: sessionId => { store.updatePromptTurn(turn.request_id, { session_id: sessionId }) } })
        if (!equalValue(created.selectedModel, binding.agent_model)) failure('session', 'agent_model')
        const attached = store.updatePromptTurn(turn.request_id, { session_id: created.sessionId })
        if (attached.session_id !== created.sessionId || !unfinished(attached)) {
          this.ports.controller.cancel({ sessionId: created.sessionId })
          return attached
        }
      } else {
        const selected = await this.ports.controller.selectModel({ sessionId, ...binding.agent_model })
        if (!equalValue(selected.selected, binding.agent_model)) failure('session', 'agent_model')
      }
      const current = store.getPromptTurn(turn.request_id)!
      if (controller.signal.aborted || !unfinished(current)) return current
      const events = await this.ports.events(current.session_id)
      const dispatching = store.updatePromptTurn(turn.request_id, { start_seq: events.at(-1)?.seq ?? -1, status: 'running' })
      if (controller.signal.aborted || dispatching.status !== 'running') return dispatching
      await this.ports.controller.prompt({ requestId: dispatching.request_id, sessionId: dispatching.session_id, mode: 'queue', content: [{ type: 'text', text: dispatching.request_text }] }, controller.signal)
      void this.handleSessionEvents(dispatching.session_id).catch(error => this.ports.reportError?.(error))
    } catch (error) {
      const current = store.getPromptTurn(turn.request_id)!
      if (unfinished(current)) store.updatePromptTurn(turn.request_id, { status: controller.signal.aborted ? 'interrupted' : 'failed', error: { code: error instanceof WorkbenchError ? error.code : 'WORKBENCH_PROMPT_DISPATCH_FAILED', message: error instanceof Error ? error.message : String(error) } })
    }
    return this.get({ workspace_id: request.workspace_id, request_id: turn.request_id })
  }

  private scoped(request: PromptLookupRequest): PromptTurn {
    const turn = this.ports.store.getPromptTurn(request.request_id)
    if (!turn) return failure('missing', 'request_id')
    if (this.ports.store.taskWorkspace(turn.task_id) !== request.workspace_id) failure('scope', 'workspace_id')
    return turn
  }
  async get(request: PromptLookupRequest): Promise<PromptTurn> {
    return this.scoped(request)
  }
  async list(request: PromptListRequest): Promise<PromptTurn[]> {
    if (this.ports.store.taskWorkspace(request.task_id) !== request.workspace_id) failure('scope', 'workspace_id')
    return this.ports.store.listPromptTurns(request.task_id)
  }
  async associatePublication(taskId: string, sessionId: string, turn: number): Promise<void> {
    await this.events.consume(sessionId, events => {
      for (const request of this.ports.store.listPromptTurns(taskId).filter(request => request.session_id === sessionId && unfinished(request) && request.harness_turn === null)) {
        const matched = requestTurn(events, request)
        if (matched?.turn === turn) this.ports.store.updatePromptTurn(request.request_id, { harness_turn: matched.turn })
      }
    })
  }

  handleSessionEvents(sessionId: string): Promise<void> {
    return this.events.consume(sessionId, events => {
      for (const observed of this.ports.store.listPendingPromptTurns().filter(turn => turn.session_id === sessionId)) {
        const matched = requestTurn(events, observed)
        if (!matched) continue
        const turn = this.ports.store.getPromptTurn(observed.request_id)!
        if (!unfinished(turn)) continue
        if (turn.harness_turn === null) this.ports.store.updatePromptTurn(turn.request_id, { harness_turn: matched.turn })
        const { end, text } = matched
        if (!end) continue
        if (end.data.reason.kind !== 'completed') {
          const error = end.data.reason.kind === 'error' ? { code: 'WORKBENCH_PROMPT_AGENT_FAILED', message: end.data.reason.error.message } : end.data.reason.kind === 'aborted' ? config.errors.stopped : config.errors.incomplete
          this.ports.store.updatePromptTurn(turn.request_id, { status: end.data.reason.kind === 'aborted' ? 'interrupted' : 'failed', error })
          this.pending.delete(turn.request_id)
          continue
        }
        let result: PromptReply
        try { result = parsePromptReply(text) }
        catch {
          this.ports.store.updatePromptTurn(turn.request_id, { status: 'failed', error: config.errors.reply })
          this.pending.delete(turn.request_id)
          continue
        }
        this.ports.store.updatePromptTurn(turn.request_id, { harness_turn: matched.turn, result, status: 'succeeded' })
        this.pending.delete(turn.request_id)
      }
    })
  }

  failSession(sessionId: string, cause?: unknown): void {
    const error = { code: 'WORKBENCH_PROMPT_AGENT_FAILED', message: cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : config.errors.incomplete.message }
    for (const turn of this.ports.store.listPendingPromptTurns().filter(turn => turn.session_id === sessionId)) {
      this.ports.store.updatePromptTurn(turn.request_id, { status: 'failed', error })
      this.pending.delete(turn.request_id)
    }
  }

  async recover(): Promise<void> {
    const observed = this.ports.store.listPendingPromptTurns().filter(turn => !this.pending.has(turn.request_id))
    for (const turn of observed.filter(turn => !turn.session_id)) {
      try { this.ports.store.updatePromptTurn(turn.request_id, { status: 'failed', error: config.errors.incomplete }) } catch (error) { this.ports.reportError?.(error) }
    }
    for (const sessionId of new Set(observed.map(turn => turn.session_id).filter(Boolean))) {
      try {
        await this.handleSessionEvents(sessionId)
        await this.events.consume(sessionId, events => {
          for (const original of observed.filter(turn => turn.session_id === sessionId)) {
            const turn = this.ports.store.getPromptTurn(original.request_id)!
            const matched = requestTurn(events, turn)
            if (unfinished(turn) && !this.pending.has(turn.request_id) && !this.ports.isSessionActive?.(sessionId) && !matched?.end) this.ports.store.updatePromptTurn(turn.request_id, { status: matched?.accepted ? 'interrupted' : 'failed', error: config.errors.incomplete })
          }
        })
      } catch (error) { this.ports.reportError?.(error) }
    }
  }

  saveCandidate(request: PromptAdoptRequest): PromptTurn {
    const turn = this.scoped(request)
    if (turn.status !== 'succeeded') failure('adopt', 'request_id')
    return this.ports.store.updatePromptTurn(turn.request_id, { candidate: { positive_prompt: request.positive_prompt, negative_prompt: request.negative_prompt } })
  }

  cancel(request: PromptLookupRequest): PromptTurn {
    const turn = this.scoped(request)
    if (!unfinished(turn)) return turn
    this.pending.get(turn.request_id)?.abort(); this.pending.delete(turn.request_id)
    if (turn.session_id) this.ports.controller.cancel({ sessionId: turn.session_id })
    return this.ports.store.updatePromptTurn(turn.request_id, { status: 'interrupted', error: config.errors.stopped })
  }
  adopt(request: PromptAdoptRequest): PromptTurn {
    const turn = this.scoped(request)
    if (turn.status !== 'succeeded') failure('adopt', 'request_id')
    return this.ports.store.adoptPrompt(turn.request_id, { positive_prompt: request.positive_prompt, negative_prompt: request.negative_prompt })
  }
  dispose(): void {
    this.pending.clear()
    this.events.clear()
  }
}

export function parsePromptReply(text: string): PromptReply {
  const trimmed = text.trim()
  const source = trimmed.startsWith('```') ? trimmed.replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '') : trimmed
  const artifact = contracts.parse('taskArtifact', 'input', JSON.parse(source))
  if (artifact.type !== 'prompt' || typeof artifact.positive_prompt !== 'string' || typeof artifact.negative_prompt !== 'string') return failure('reply', 'reply')
  return { type: 'prompt', positive_prompt: artifact.positive_prompt, negative_prompt: artifact.negative_prompt }
}

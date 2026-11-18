import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { contracts } from '#contracts'
import { SessionEventConsumer, requestTurn } from './session-events.ts'
import type { FunctionBinding } from '../../workbench/contract.ts'
import type { TranslationRequest, TranslationResult } from '../../workbench/translation.ts'
import configuration from '../../../config/workbench-translation.json' with { type: 'json' }
import { renderRequestTemplate } from '../../workbench/request-template.ts'
import { WorkbenchError } from '../../workbench/validation.ts'
import type { OfficialSessionController } from './harness-adapter.ts'
import type { WorkbenchStore } from '../storage/workbench-store.ts'

interface TranslationPorts {
  store: WorkbenchStore
  binding(workspaceId: string): FunctionBinding
  controller: OfficialSessionController
  events(sessionId: string): readonly SessionEvent[] | Promise<readonly SessionEvent[]>
}

interface PendingTranslation {
  request: TranslationRequest
  controller: AbortController
  session_id: string
  harness_turn: number | null
  start_seq: number
  scope_key: string
  ownership: object
  finish(result: TranslationResult): void
}

export class WorkbenchTranslations {
  private readonly pending = new Map<string, PendingTranslation>()
  private readonly owners = new Map<string, object>()
  private readonly events: SessionEventConsumer
  constructor(private readonly ports: TranslationPorts) { this.events = new SessionEventConsumer(ports.events) }

  translate(request: TranslationRequest, signal?: AbortSignal): AsyncGenerator<TranslationResult> {
    const lifetime = new AbortController()
    const stream = this.stream(request, signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal)
    const close = stream.return.bind(stream)
    const fail = stream.throw.bind(stream)
    stream.return = value => { lifetime.abort(); return close(value) }
    stream.throw = error => { lifetime.abort(); return fail(error) }
    return stream
  }

  private async *stream(request: TranslationRequest, signal: AbortSignal): AsyncGenerator<TranslationResult> {
    signal.throwIfAborted()
    this.ports.store.assertScope(request.workspace_id, request.work_id, request.branch_id)
    if (!request.source_text.trim()) throw new WorkbenchError('WORKBENCH_TRANSLATION_EMPTY', configuration.errors.empty, 'source_text')
    if (this.pending.has(request.request_id)) throw new WorkbenchError('WORKBENCH_TRANSLATION_CONFLICT', configuration.errors.conflict, 'request_id')
    const latest = this.ports.store.getTranslationLatest(request)
    const scopeKey = JSON.stringify([request.workspace_id, request.work_id, request.branch_id, request.target, request.field])
    const ownership = {}
    this.owners.set(scopeKey, ownership)
    if (latest?.source_text === request.source_text) {
      try { yield { request_id: request.request_id, status: 'succeeded', text: latest.text } }
      finally { if (this.owners.get(scopeKey) === ownership) this.owners.delete(scopeKey) }
      return
    }
    let finish!: (result: TranslationResult) => void
    const completion = new Promise<TranslationResult>(resolve => { finish = resolve })
    const state: PendingTranslation = { request, controller: new AbortController(), session_id: '', harness_turn: null, start_seq: -1, scope_key: scopeKey, ownership, finish }
    this.pending.set(request.request_id, state)
    const abort = () => this.cancel(state)
    signal.addEventListener('abort', abort, { once: true })
    try {
      void this.dispatch(state)
      yield { request_id: request.request_id, status: 'running' }
      const result = await completion
      if (!signal.aborted) yield result
    } finally {
      signal.removeEventListener('abort', abort)
      this.cancel(state)
    }
  }

  private async dispatch(state: PendingTranslation): Promise<void> {
    const { request, controller } = state
    try {
      const binding = structuredClone(this.ports.binding(request.workspace_id))
      const problem = contracts.parse('requestTemplateProblem', 'input', { template: binding.request_template, kind: 'translate' })
      if (binding.kind !== 'translate' || problem) throw new WorkbenchError('WORKBENCH_TRANSLATION_CONFIGURATION', problem || configuration.errors.binding, 'request_template')
      const session = await this.ports.controller.create({ workspaceId: request.workspace_id, agentPreset: binding.preset_id })
      state.session_id = session.sessionId
      if (controller.signal.aborted) { this.ports.controller.cancel({ sessionId: session.sessionId }); return }
      const { selected } = await this.ports.controller.selectModel({ sessionId: session.sessionId, ...binding.agent_model })
      controller.signal.throwIfAborted()
      if (selected.provider !== binding.agent_model.provider || selected.model !== binding.agent_model.model || selected.reasoningEffort !== binding.agent_model.reasoningEffort) throw new Error(configuration.errors.model)
      const events = await this.ports.events(session.sessionId)
      controller.signal.throwIfAborted()
      state.start_seq = events.at(-1)?.seq ?? -1
      await this.ports.controller.prompt({ requestId: request.request_id, sessionId: session.sessionId, mode: 'queue', content: [{ type: 'text', text: renderRequestTemplate(binding.request_template, request.source_text, 'translate') }] }, controller.signal)
      await this.handleSessionEvents(session.sessionId)
    } catch (error) {
      this.complete(state, { request_id: request.request_id, status: 'failed', error: controller.signal.aborted ? configuration.errors.cancelled : error instanceof Error ? error.message : String(error) })
    }
  }

  private complete(state: PendingTranslation, result: TranslationResult): void {
    if (this.pending.get(state.request.request_id) !== state) return
    if (result.status === 'succeeded' && this.owners.get(state.scope_key) === state.ownership) {
      const { request_id: _, ...source } = state.request
      this.ports.store.saveTranslationLatest({ ...source, text: result.text })
    }
    if (result.status === 'failed') state.controller.abort()
    this.pending.delete(state.request.request_id)
    if (this.owners.get(state.scope_key) === state.ownership) this.owners.delete(state.scope_key)
    state.finish(result)
  }

  handleSessionEvents(sessionId: string): Promise<void> {
    return this.events.consume(sessionId, events => {
      for (const state of this.pending.values()) {
        if (state.session_id !== sessionId) continue
        const matched = requestTurn(events, { ...state, request_id: state.request.request_id })
        if (!matched) continue
        state.harness_turn = matched.turn
        const { end, text } = matched
        if (!end) continue
        const error = end.data.reason.kind === 'error' ? end.data.reason.error.message : end.data.reason.kind !== 'completed' ? configuration.errors.incomplete : !text.trim() ? configuration.errors.emptyReply : undefined
        this.complete(state, error ? { request_id: state.request.request_id, status: 'failed', error } : { request_id: state.request.request_id, status: 'succeeded', text })
      }
    })
  }

  failSession(sessionId: string, cause?: unknown): void {
    for (const state of this.pending.values()) if (state.session_id === sessionId) this.complete(state, { request_id: state.request.request_id, status: 'failed', error: cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : configuration.errors.incomplete })
  }

  private cancel(state: PendingTranslation): void {
    if (this.pending.get(state.request.request_id) !== state) return
    state.controller.abort()
    if (state.session_id) this.ports.controller.cancel({ sessionId: state.session_id })
    this.complete(state, { request_id: state.request.request_id, status: 'failed', error: configuration.errors.cancelled })
  }

  dispose(): void { for (const state of this.pending.values()) this.cancel(state); this.owners.clear(); this.events.clear() }
}

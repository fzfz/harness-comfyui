import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { SessionEventConsumer, requestTurn } from './session-events.ts'
import type { FunctionBinding } from '../../workbench/contract.ts'
import type { TranslationRequest, TranslationResult, TranslationRecord } from '../../workbench/translation.ts'
import configuration from '../../../config/workbench-translation.json' with { type: 'json' }
import { renderRequestTemplate, requestTemplateProblem } from '../../workbench/request-template.ts'
import { WorkbenchError } from '../../workbench/validation.ts'
import type { OfficialSessionController } from './harness-adapter.ts'
import type { WorkbenchStore } from '../storage/workbench-store.ts'
import { equalValue } from '../../shared/json-contract.ts'

interface TranslationPorts {
  store: WorkbenchStore
  binding(workspaceId: string): FunctionBinding
  controller: OfficialSessionController
  reportError?(error: unknown): void
  isSessionActive?(sessionId: string): boolean
  events(sessionId: string): readonly SessionEvent[] | Promise<readonly SessionEvent[]>
}

export class WorkbenchTranslations {
  private readonly pending = new Map<string, AbortController>()
  private readonly events: SessionEventConsumer
  constructor(private readonly ports: TranslationPorts) { this.events = new SessionEventConsumer(ports.events) }

  async start(request: TranslationRequest): Promise<TranslationResult> {
    this.ports.store.assertScope(request.workspace_id, request.work_id, request.branch_id)
    const previous = this.ports.store.getTranslation(request.request_id)
    if (previous) {
      const original: TranslationRequest = { request_id: previous.request_id, workspace_id: previous.workspace_id, work_id: previous.work_id, branch_id: previous.branch_id, field: previous.field, source_text: previous.source_text }
      if (!equalValue(original, request)) throw new WorkbenchError('WORKBENCH_TRANSLATION_CONFLICT', configuration.errors.conflict, 'request_id')
      return this.get(request.request_id)
    }
    if (!request.source_text.trim()) throw new WorkbenchError('WORKBENCH_TRANSLATION_EMPTY', configuration.errors.empty, 'source_text')
    const binding = structuredClone(this.ports.binding(request.workspace_id))
    const problem = requestTemplateProblem(binding.request_template, 'translate')
    if (binding.kind !== 'translate' || problem) throw new WorkbenchError('WORKBENCH_TRANSLATION_CONFIGURATION', problem || configuration.errors.binding, 'request_template')
    const controller = new AbortController()
    this.pending.set(request.request_id, controller)
    this.ports.store.saveTranslation({ ...request, status: 'running', session_id: '', harness_turn: null, start_seq: -1, created_at: Date.now(), finished_at: null })
    try {
      const session = await this.ports.controller.create({ workspaceId: request.workspace_id, agentPreset: binding.preset_id })
      let current = this.record(request.request_id)
      if (controller.signal.aborted || current.status !== 'running') { this.ports.controller.cancel({ sessionId: session.sessionId }); return this.get(request.request_id) }
      this.ports.store.saveTranslation({ ...current, session_id: session.sessionId })
      const { selected } = await this.ports.controller.selectModel({ sessionId: session.sessionId, ...binding.agent_model })
      controller.signal.throwIfAborted()
      if (selected.provider !== binding.agent_model.provider || selected.model !== binding.agent_model.model || selected.reasoningEffort !== binding.agent_model.reasoningEffort) throw new Error(configuration.errors.model)
      const events = await this.ports.events(session.sessionId)
      current = this.record(request.request_id)
      if (current.status !== 'running') return this.get(request.request_id)
      this.ports.store.saveTranslation({ ...current, session_id: session.sessionId, start_seq: events.at(-1)?.seq ?? -1 })
      await this.ports.controller.prompt({ requestId: request.request_id, sessionId: session.sessionId, mode: 'queue', content: [{ type: 'text', text: renderRequestTemplate(binding.request_template, request.source_text, 'translate') }] }, controller.signal)
      void this.handleSessionEvents(session.sessionId).catch(error => this.ports.reportError?.(error))
    } catch (error) {
      const current = this.record(request.request_id)
      if (current.status === 'running') this.ports.store.saveTranslation({ ...current, status: 'failed', error: controller.signal.aborted ? configuration.errors.cancelled : error instanceof Error ? error.message : String(error), finished_at: Date.now() })
    }
    return this.get(request.request_id)
  }

  private record(requestId: string): TranslationRecord {
    const record = this.ports.store.getTranslation(requestId)
    if (!record) throw new WorkbenchError('WORKBENCH_TRANSLATION_NOT_FOUND', configuration.errors.missing, 'request_id')
    return record
  }

  get(requestId: string): TranslationResult {
    const record = this.record(requestId)
    return { request_id: record.request_id, status: record.status, ...(record.text !== undefined ? { text: record.text } : {}), ...(record.error !== undefined ? { error: record.error } : {}) }
  }

  handleSessionEvents(sessionId: string): Promise<void> {
    return this.events.consume(sessionId, events => {
      for (const observed of this.ports.store.listPendingTranslations().filter(record => record.session_id === sessionId)) {
        const matched = requestTurn(events, observed)
        if (!matched) continue
        const record = this.record(observed.request_id)
        if (record.status !== 'running') continue
        const { end, text, turn } = matched
        if (!end) { if (record.harness_turn === null) this.ports.store.saveTranslation({ ...record, harness_turn: turn }); continue }
        const error = end.data.reason.kind === 'error' ? end.data.reason.error.message : end.data.reason.kind !== 'completed' ? configuration.errors.incomplete : !text.trim() ? configuration.errors.emptyReply : undefined
        this.ports.store.saveTranslation({ ...record, harness_turn: turn, status: error ? 'failed' : 'succeeded', ...(error ? { error } : { text }), finished_at: Date.now() })
        this.pending.delete(record.request_id)
      }
    })
  }

  failSession(sessionId: string, cause?: unknown): void {
    for (const record of this.ports.store.listPendingTranslations().filter(record => record.session_id === sessionId)) {
      this.ports.store.saveTranslation({ ...record, status: 'failed', error: cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : configuration.errors.incomplete, finished_at: Date.now() })
      this.pending.delete(record.request_id)
    }
  }

  async recover(): Promise<void> {
    const observed = this.ports.store.listPendingTranslations().filter(record => !this.pending.has(record.request_id))
    for (const record of observed.filter(record => !record.session_id)) {
      try { this.ports.store.saveTranslation({ ...record, status: 'failed', error: configuration.errors.incomplete, finished_at: Date.now() }) } catch (error) { this.ports.reportError?.(error) }
    }
    for (const sessionId of new Set(observed.map(record => record.session_id).filter(Boolean))) {
      try {
        await this.handleSessionEvents(sessionId)
        await this.events.consume(sessionId, events => {
          for (const original of observed.filter(record => record.session_id === sessionId)) {
            const record = this.record(original.request_id)
            if (record.status === 'running' && !this.pending.has(record.request_id) && !this.ports.isSessionActive?.(sessionId) && !requestTurn(events, record)?.end) this.ports.store.saveTranslation({ ...record, status: 'failed', error: configuration.errors.incomplete, finished_at: Date.now() })
          }
        })
      } catch (error) { this.ports.reportError?.(error) }
    }
  }

  cancel(requestId: string): TranslationResult {
    const record = this.record(requestId)
    if (record.status !== 'running') return this.get(requestId)
    this.pending.get(requestId)?.abort()
    this.pending.delete(requestId)
    if (record.session_id) this.ports.controller.cancel({ sessionId: record.session_id })
    this.ports.store.saveTranslation({ ...record, status: 'failed', error: configuration.errors.cancelled, finished_at: Date.now() })
    return this.get(requestId)
  }

  dispose(): void { this.pending.clear(); this.events.clear() }
}

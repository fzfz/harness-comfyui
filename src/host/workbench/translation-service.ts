import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { FunctionBinding } from '../../workbench/contract.ts'
import type { TranslationRequest, TranslationResult } from '../../workbench/translation.ts'
import configuration from '../../../config/workbench-translation.json' with { type: 'json' }
import { renderRequestTemplate, requestTemplateProblem } from '../../workbench/request-template.ts'
import { WorkbenchError } from '../../workbench/validation.ts'
import type { OfficialSessionController } from './harness-adapter.ts'

interface TranslationPorts {
  binding(workspaceId: string): FunctionBinding
  controller: OfficialSessionController
  events(sessionId: string): readonly SessionEvent[]
}
interface PendingTranslation {
  request: TranslationRequest
  controller: AbortController
  sessionId?: string
  result: TranslationResult
}

export class WorkbenchTranslations {
  private readonly requests = new Map<string, PendingTranslation>()
  constructor(private readonly ports: TranslationPorts) {}

  async start(request: TranslationRequest): Promise<TranslationResult> {
    const previous = this.requests.get(request.request_id)
    if (previous) {
      if (previous.request.source_text !== request.source_text || previous.request.workspace_id !== request.workspace_id) {
        throw new WorkbenchError('WORKBENCH_TRANSLATION_CONFLICT', configuration.errors.conflict, 'request_id')
      }
      return this.get(request.request_id)
    }
    if (!request.source_text.trim()) throw new WorkbenchError('WORKBENCH_TRANSLATION_EMPTY', configuration.errors.empty, 'source_text')
    const binding = structuredClone(this.ports.binding(request.workspace_id))
    const problem = requestTemplateProblem(binding.request_template, 'translate')
    if (binding.kind !== 'translate' || problem) throw new WorkbenchError('WORKBENCH_TRANSLATION_CONFIGURATION', problem || configuration.errors.binding, 'request_template')
    const pending: PendingTranslation = { request: { ...request }, controller: new AbortController(), result: { request_id: request.request_id, status: 'running' } }
    this.requests.set(request.request_id, pending)
    try {
      const session = await this.ports.controller.create({ workspaceId: request.workspace_id, agentPreset: binding.preset_id })
      pending.sessionId = session.sessionId
      if (pending.controller.signal.aborted) this.ports.controller.cancel({ sessionId: session.sessionId })
      pending.controller.signal.throwIfAborted()
      const { selected } = await this.ports.controller.selectModel({ sessionId: session.sessionId, ...binding.agent_model })
      pending.controller.signal.throwIfAborted()
      if (selected.provider !== binding.agent_model.provider || selected.model !== binding.agent_model.model || selected.reasoningEffort !== binding.agent_model.reasoningEffort) throw new Error(configuration.errors.model)
      await this.ports.controller.prompt({ requestId: request.request_id, sessionId: session.sessionId, mode: 'queue', content: [{ type: 'text', text: renderRequestTemplate(binding.request_template, request.source_text, 'translate') }] }, pending.controller.signal)
    } catch (error) {
      pending.result = { request_id: request.request_id, status: 'failed', error: pending.controller.signal.aborted ? configuration.errors.cancelled : error instanceof Error ? error.message : String(error) }
    }
    return { ...pending.result }
  }

  get(requestId: string): TranslationResult {
    const pending = this.requests.get(requestId)
    if (!pending) throw new WorkbenchError('WORKBENCH_TRANSLATION_NOT_FOUND', configuration.errors.missing, 'request_id')
    if (pending.result.status === 'running' && pending.sessionId) {
      const events = this.ports.events(pending.sessionId)
      const end = [...events].reverse().find(event => event.type === 'turn/end')
      if (end?.type === 'turn/end') {
        const reply = [...events].reverse().find(event => event.type === 'assistant/message' && event.data.turn === end.data.turn)
        const text = reply?.type === 'assistant/message' && !reply.data.interrupted
          ? reply.data.message.content.filter(block => block.type === 'text').map(block => block.text).join('') : ''
        const error = end.data.reason.kind === 'error' ? end.data.reason.error.message : end.data.reason.kind !== 'completed' ? configuration.errors.incomplete : !text.trim() ? configuration.errors.emptyReply : undefined
        pending.result = error ? { request_id: requestId, status: 'failed', error } : { request_id: requestId, status: 'succeeded', text }
      }
    }
    return { ...pending.result }
  }

  cancel(requestId: string): TranslationResult {
    const pending = this.requests.get(requestId)
    if (pending) {
      pending.controller.abort()
      if (pending.result.status === 'running' && pending.sessionId) this.ports.controller.cancel({ sessionId: pending.sessionId })
      this.requests.delete(requestId)
    }
    return { request_id: requestId, status: 'failed', error: configuration.errors.cancelled }
  }

  dispose(): void {
    for (const id of this.requests.keys()) this.cancel(id)
  }
}

import { randomUUID } from 'node:crypto'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-tools'
import type { AgentModel, ExecutionState, SkillReadRef, WorkbenchIdentity } from '../../workbench/contract.ts'

export interface OfficialSessionController {
  create(request: { workspaceId: string; agentPreset: string }): Promise<{ sessionId: string; agentPreset?: string }>
  selectModel(request: AgentModel & { sessionId: string }): Promise<{ selected: AgentModel }>
  prompt(request: { requestId: string; sessionId: string; mode: 'queue'; content: { type: 'text'; text: string }[] }, signal: AbortSignal): Promise<{ accepted: true }>
  cancel(request: { sessionId: string }): { accepted: true }
}

function skillName(argumentsValue: unknown): string | null {
  let value = argumentsValue
  if (typeof value === 'string') {
    try { value = JSON.parse(value) }
    catch { return null }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('name' in value)) return null
  return typeof value.name === 'string' && value.name.trim() ? value.name : null
}

export interface HarnessWorkbenchPorts {
  readonly controller: OfficialSessionController
  readonly events: (sessionId: string) => readonly SessionEvent[]
  readonly workspaceForTask: (taskId: string) => string
  readonly scopeForSession: (sessionId: string) => Promise<{ workspaceId: string; sessionIds: readonly string[] }>
  readonly agent: (sessionId: string) => {
    readonly status: 'running' | 'idle'
    readonly skills: () => Promise<readonly { name: string; invocation: { modelInvocable: boolean } }[]>
  } | undefined
}

/** Uses the official Session command boundary and its live Agent scope. */
export class HarnessWorkbenchSessions {
  private readonly failedSessions = new Set<string>()
  constructor(private readonly host: HarnessWorkbenchPorts) {}

  async create(input: { task: { task_id: string }; presetId: string; agentModel: AgentModel; requestedSkill: string | null }) {
    const created = await this.host.controller.create({ workspaceId: this.host.workspaceForTask(input.task.task_id), agentPreset: input.presetId })
    if (created.agentPreset !== input.presetId) throw new Error(`Agent 预设未按要求载入：${input.presetId}。请核对功能配置中选择的 Agent 预设。`)
    const { selected } = await this.host.controller.selectModel({ sessionId: created.sessionId, ...input.agentModel })
    if (input.requestedSkill !== null) {
      const agent = this.host.agent(created.sessionId)
      const skills = agent === undefined ? [] : await agent.skills()
      if (!skills.some(skill => skill.name === input.requestedSkill && skill.invocation.modelInvocable)) {
        throw new Error(`当前预设无法调用 Skill ${input.requestedSkill}。请在功能配置中选择可用 Skill。`)
      }
    }
    return { sessionId: created.sessionId, selectedModel: { ...selected } }
  }

  async dispatch(input: { sessionId: string; taskId: string; text: string; signal: AbortSignal }): Promise<void> {
    const scope = await this.host.scopeForSession(input.sessionId)
    if (input.signal.aborted) return
    for (const sessionId of scope.sessionIds) this.failedSessions.delete(sessionId)
    await this.host.controller.prompt({ requestId: randomUUID(), sessionId: input.sessionId, mode: 'queue', content: [{ type: 'text', text: input.text }] }, input.signal)
  }

  async authorize(input: { task: { task_id: string; session_id: string | null }; identity: WorkbenchIdentity }): Promise<boolean> {
    if (input.task.session_id === null || this.host.workspaceForTask(input.task.task_id) !== input.identity.workspaceId) return false
    const scope = await this.host.scopeForSession(input.task.session_id)
    return scope.workspaceId === input.identity.workspaceId && scope.sessionIds.includes(input.identity.sessionId)
  }

  async status(input: { sessionId: string }): Promise<ExecutionState | null> {
    const scope = await this.host.scopeForSession(input.sessionId)
    if (scope.sessionIds.some(id => this.failedSessions.has(id))) return 'failed'
    if (scope.sessionIds.some(id => this.host.agent(id)?.status === 'running')) return 'running'
    return this.host.agent(input.sessionId)?.status ?? null
  }

  recordFailure(sessionId: string): void { this.failedSessions.add(sessionId) }

  async skillReadRefs(input: { sessionId: string }): Promise<SkillReadRef[]> {
    const scope = await this.host.scopeForSession(input.sessionId)
    const refs: SkillReadRef[] = []
    for (const sessionId of scope.sessionIds) {
      const calls = new Map<string, SessionEvent<'tool/call'>['data']>()
      for (const event of this.host.events(sessionId)) {
        if (event.type === 'tool/call') calls.set(event.data.callId, event.data)
        else if (event.type === 'tool/result') {
          if (event.data.message.isError) continue
          const call = calls.get(event.data.message.toolCallId)
          if (call?.name !== 'skill') continue
          const name = skillName(call.arguments)
          if (name !== null) refs.push({ name, session_id: sessionId, turn: call.turn, call_id: call.callId, source_file: null })
        } else if (event.type === 'tool/ptc-dispatch' && event.data.name === 'skill' && !event.data.isError) {
          const call = calls.get(event.data.parentCallId) ?? calls.get(event.data.rootCallId)
          const name = skillName(event.data.arguments)
          if (call && name !== null) refs.push({ name, session_id: sessionId, turn: call.turn, call_id: event.data.subCallId, source_file: null })
        }
      }
    }
    return refs
  }

  async control(input: { sessionId: string; action: 'interrupt' | 'pause' | 'continue'; signal: AbortSignal }): Promise<void> {
    if (input.action === 'continue') return
    const scope = await this.host.scopeForSession(input.sessionId)
    if (input.signal.aborted) return
    for (const sessionId of scope.sessionIds) {
      if (this.host.agent(sessionId) !== undefined) this.host.controller.cancel({ sessionId })
    }
  }
}

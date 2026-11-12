import type { Context } from '@deepseek-ai/cordis'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { SubagentPromptRequest } from '@deepseek-ai/dsh-subagent'
import { randomUUID } from 'node:crypto'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-workspace'
import experimentControlErrors from '../../workbench/experiment-control-errors.json' with { type: 'json' }
import agentModelSelection from '../../workbench/agent-model-selection.json' with { type: 'json' }
import { agentModelProblem } from '../../workbench/agent-model.ts'
import libraryConfig from '../../workbench/library-config.json' with { type: 'json' }
import productAgent from '../../../config/product-agent.json' with { type: 'json' }
import { WORKBENCH_FUNCTIONS as defaults } from '../../workbench/functions.ts'
import type { WorkbenchEnvironment } from '../../workbench-remote.ts'
import { CATALOG_COMFYUI_INSTANCE_QUERY } from '../../catalog/contract.ts'
import { shouldTrackExecution } from '../../workbench/state.ts'
import { WorkbenchService } from '../../workbench/service.ts'
import type { AgentModel, WorkbenchModelCatalog, GenerationInput, TaskDraft } from '../../workbench/contract.ts'
import { WorkbenchError } from '../../workbench/validation.ts'
import { createWorkbenchInputAdapter } from './input-adapter.ts'
import { workspaceSessionScopeForSession } from '../generation/workspace-access.ts'
import { HarnessWorkbenchSessions, type OfficialSessionController } from './harness-adapter.ts'
import type {} from '../core/plugin.ts'

import { resolveInputImages } from './input-images.ts'
import { WorkbenchTranslations } from './translation-service.ts'
import { requestTurn } from './session-events.ts'
import { WorkbenchPrompts } from './prompt-service.ts'
import promptEditConfig from '../../workbench/prompt-edit-config.json' with { type: 'json' }

import { CatalogError } from '../catalog/catalog-client.ts'

interface SkillCatalog {
  list(options: { cwd?: string; scope?: unknown }): Promise<readonly { name: string; description: string; invocation: { modelInvocable: boolean } }[]>
}
function skillsFor(ctx: Context): SkillCatalog { return ctx.get('skills') as SkillCatalog }
interface WorkbenchHost {
  readonly service: WorkbenchService
  readonly prompts: WorkbenchPrompts
  readonly signal: AbortSignal
  readonly validateDraft: ReturnType<typeof createWorkbenchInputAdapter>['validateDraft']
  readonly validateParameters: ReturnType<typeof createWorkbenchInputAdapter>['validateParameters']
  readonly resolveGenerationDraft: (input: GenerationInput) => Promise<TaskDraft>
  readonly translations: WorkbenchTranslations
  readonly resolveResourceSelection: ReturnType<typeof createWorkbenchInputAdapter>['resolveResourceSelection']
  readonly environment: (workspaceId?: string, presetId?: string) => Promise<WorkbenchEnvironment>
  readonly assertWorkspace: (workspaceId: string) => void
  readonly initializeWorkspace: (workspaceId: string) => Promise<void>
  readonly presetSkills: (workspaceId: string, presetId: string) => Promise<WorkbenchEnvironment['skills']>
  readonly validateFunctionAgentModel: (selection: AgentModel) => Promise<void>
  readonly validateFunctionPreset: (presetId: string) => Promise<void>
}
declare module '@deepseek-ai/cordis' { interface Context { harnessComfyuiWorkbench: WorkbenchHost } }

export const name = 'harness-comfyui-workbench'
export const inject = ['harnessComfyuiCore', 'sessionController', 'agents', 'agentPresets', 'skills', 'workspaceRegistry', 'sessionPersistence', 'subagents'] as const

export async function apply(ctx: Context): Promise<void> {
  const { runtime, catalog, workbenchStore: store } = ctx.harnessComfyuiCore.services
  const controller = ctx.get('sessionController') as unknown as OfficialSessionController & { modelCatalog(): Promise<WorkbenchModelCatalog> }
  const lifecycle = new AbortController()
  const { signal } = lifecycle
  ctx.effect(() => () => lifecycle.abort(), 'Workbench requests')
  const sessions = new HarnessWorkbenchSessions({
    controller,
    delegation: {
      async start(request) {
        const parent = ctx.agents.get(SessionId(request.parentSessionId))
        if (!parent) throw new WorkbenchError('WORKBENCH_PARENT_UNAVAILABLE', '实验主会话当前不可用，请在工作台查看实验状态。', 'task_id')
        return ctx.subagents.startActivation({
          provider: 'spawn', childId: SessionId(request.sessionId), label: request.label, delivery: 'parent', signal: request.signal,
          request: { parent, agentPreset: request.presetId, agentOptions: { ...request.agentModel, reasoningEffort: request.agentModel.reasoningEffort === undefined ? undefined : ReasoningEffortId(request.agentModel.reasoningEffort) }, prompt: [{ type: 'text', text: request.text }], maxDepth: ctx.subagents.resolveMaxDepth() },
        })
      },
      async resume(request) {
        const task = store.getTask(request.taskId)
        if (!task.parent_experiment_task_id) return false
        const parent = store.getTask(task.parent_experiment_task_id)
        if (!parent.session_id) throw new WorkbenchError('WORKBENCH_PARENT_UNAVAILABLE', '实验主会话当前不可用，请在工作台查看实验状态。', 'task_id')
        await ctx.subagents.prompt({ requestId: randomUUID() as SubagentPromptRequest['requestId'], parentSessionId: SessionId(parent.session_id), childSessionId: SessionId(request.sessionId), mode: 'continuable', delivery: 'queue', content: [{ type: 'text', text: request.text }] }, request.signal)
        return true
      },
      async skills(taskId, presetId) { return (await presetSkills(store.taskWorkspace(taskId), presetId)).map(skill => ({ ...skill, invocation: { modelInvocable: true } })) },
      async interrupt(parentId, childId) {
        const parent = ctx.agents.get(SessionId(parentId))
        if (parent) ctx.subagents.interrupt(SessionId(childId), { kind: 'ancestor', agent: parent })
      },
      async disposeDescendants(parentId) {
        const parent = ctx.agents.get(SessionId(parentId))
        if (parent) await ctx.subagents.drainDescendants([parent])
      },
    },
    async events(sessionId) {
      const resident = ctx.agents.get(SessionId(sessionId))
      if (resident) return resident.session.snapshotEvents()
      if (!await ctx.sessionPersistence.stat(SessionId(sessionId))) return []
      const handle = await ctx.sessionPersistence.open(SessionId(sessionId), 'read', { signal })
      try { return (await handle.read(undefined, undefined, { signal })).events }
      finally { await handle.close() }
    },
    workspaceForTask: taskId => store.taskWorkspace(taskId),
    scopeForSession: sessionId => workspaceSessionScopeForSession(ctx.workspaceRegistry, ctx.sessionPersistence, ctx.subagents, sessionId, signal),
    agent: id => {
      const agent = ctx.agents.get(SessionId(id))
      return agent === undefined ? undefined : {
        status: agent.status,
        skills: () => skillsFor(agent.ctx).list({ cwd: agent.session.header.cwd }),
      }
    },
  })
  const input = createWorkbenchInputAdapter({ runtime, catalog, signal })
  const presetSkills = async (workspaceId: string, presetId: string): Promise<WorkbenchEnvironment['skills']> => {
    const workspace = ctx.workspaceRegistry.list().find(candidate => String(candidate.id) === workspaceId)
    if (!workspace) return []
    const scope = await ctx.agentPresets.acquireScope(presetId)
    try { return (await skillsFor(ctx).list({ cwd: workspace.path, scope: scope.key })).filter(skill => skill.invocation.modelInvocable).map(skill => ({ name: skill.name, description: skill.description })) }
    finally { await scope[Symbol.asyncDispose]() }
  }
  const service = new WorkbenchService({
    store, sessions, descriptors: defaults,
    preparePromptRequest: (binding, input) => prompts.prepareTask(binding, input),
    attachPromptTask: (task, sessionId, prepared, requestId, delegated) => prompts.attachTask(task, sessionId, prepared, requestId, delegated),
    associatePromptPublication: (task, identity) => prompts.associatePublication(task.task_id, identity.sessionId, identity.turn),
    resolveImageSources: refs => resolveInputImages(ctx.harnessComfyuiCore.services, refs, signal),
    prepareGenerationInput: input.prepareGenerationInput, resolveResourceRefs: input.resolveResourceRefs, resolveResourceSelection: input.resolveResourceSelection,
    validateResourceRefs: input.validateReferences, resolveSelectedResources: input.resolveSelectedResources,
    resolveParameterMapping: input.resolveParameterMapping, parameterIds: input.parameterIds, validateGenerationInput: input.validateGenerationInput,
    validateParameters: input.validateParameters, resolveGenerationDraft: input.resolveGenerationDraft,
    resolveBaseModelDraft: async (baseModelId, draft) => {
      const available = await catalog.baseModels(signal).catch(error => {
        if (error instanceof CatalogError) {
          const failure = libraryConfig.errors.baseModelCatalogUnavailable
          throw new WorkbenchError(failure.code, failure.message, failure.path)
        }
        throw error
      })
      if (!available.items.some(model => model.id === baseModelId)) {
        const error = libraryConfig.errors.baseModelUnavailable
        throw new WorkbenchError(error.code, error.message, error.path)
      }
      return { ...structuredClone(draft), base_model_id: baseModelId }
    },
    resolveRunModelBaseId: async fixed => {
      try {
        const model = await catalog.resolveGenerationModel(fixed.id, signal)
        return model.id === fixed.id && model.file_name === fixed.file_name ? model.base_model_id : null
      }
      catch (error) {
        if (error instanceof CatalogError) return null
        throw error
      }
    },
    readRunInputDescription: async (workspaceId, runId) => {
      const result = (await runtime.readGenerationRunInputs({ workspaceId, runIds: [runId] })).runs[0]!
      if (result.lookup_status === 'error') throw new WorkbenchError(result.error.code, result.error.message, 'run_id')
      return result.input_description
    },
  })
  const prompts = new WorkbenchPrompts({
    store, sessions, controller, descriptors: defaults, events: id => sessions.events(id), isSessionActive: id => ctx.agents.get(SessionId(id))?.status === 'running', reportError: error => reportFailure(error),
    images: refs => resolveInputImages(ctx.harnessComfyuiCore.services, refs, signal),
    resources: draft => input.resolveSelectedResources(draft, signal),
    async baseModel(draft, baseModelId) {
      let id: string | null = baseModelId
      if (draft.generation_input.model) {
        const model = await catalog.resolveGenerationModel(draft.generation_input.model.id, signal)
        id = model.base_model_id
      }
      const base = (await catalog.baseModels(signal)).items.find(item => item.id === id)
      if (!base) throw new WorkbenchError(promptEditConfig.errors.baseModelMissing.code, promptEditConfig.errors.baseModelMissing.message, 'input.base_model_id')
      return { id: base.id, name: base.label }
    },
  })
  ctx.effect(() => () => prompts.dispose(), 'Workbench prompt editing')
  const translations = new WorkbenchTranslations({ store, controller, isSessionActive: id => ctx.agents.get(SessionId(id))?.status === 'running', reportError: error => reportFailure(error), binding: workspaceId => store.getFunctionBinding(workspaceId, 'translate'), events: sessionId => sessions.events(sessionId) })
  ctx.effect(() => () => translations.dispose(), 'Workbench translations')
  const reportFailure = (error: unknown) => {
    ctx.logger('harness-comfyui').error('Workbench result delivery failed: %s', error instanceof Error ? error.message : String(error))
    store.reportError(error)
  }
  const processing = new Set<Promise<void>>()
  ctx.effect(() => async () => { lifecycle.abort(); await Promise.allSettled([...processing.values()]) }, 'Workbench event delivery')
  const consume = (sessionId: string): Promise<void> => {
    const operation = (async () => {
      if (signal.aborted) return
      await prompts.handleSessionEvents(sessionId)
      await translations.handleSessionEvents(sessionId)
      const events = [...await sessions.events(sessionId)].sort((left, right) => left.seq - right.seq)
      if (signal.aborted) return
      const task = store.taskForSession(sessionId)
      if (!task || task.kind === 'prompt' || !shouldTrackExecution(task, store.getExperiment(task.task_id))) return
      const latest = [...events].reverse().find(event => event.type === 'turn/start' || event.type === 'turn/end')
      if (latest?.type === 'turn/end') {
        const state = sessions.recordCompletion(sessionId, latest.data.reason.kind)
        store.markExecution(task.task_id, state)
      } else if (latest?.type === 'turn/start') store.markExecution(task.task_id, 'running')
    })()
    processing.add(operation)
    void operation.catch(reportFailure).finally(() => { processing.delete(operation) })
    return operation
  }
  ctx.on('session/event', (session, event) => {
    if (event.type === 'turn/end' || event.type === 'turn/start') void consume(String(session.id))
  })
  ctx.on('agent/error', ({ agent }) => {
    const sessionId = String(agent.id)
    sessions.recordFailure(sessionId)
    prompts.failSession(sessionId)
    translations.failSession(sessionId)
    const task = store.taskForSession(sessionId)
    if (task && shouldTrackExecution(task, store.getExperiment(task.task_id))) store.markExecution(task.task_id, 'failed')
    void consume(sessionId)
  })
  ctx.on('subagent/end', info => {
    const state = sessions.recordCompletion(String(info.id), info.stopReason)
    const task = store.taskForSession(String(info.id))
    if (task && shouldTrackExecution(task, store.getExperiment(task.task_id))) store.markExecution(task.task_id, state)
    void consume(String(info.id))
  })
  const recover = async () => {
    const tasks = ctx.workspaceRegistry.list().flatMap(workspace => store.listTasks(String(workspace.id)))
    await prompts.recover()
    await translations.recover()
    const ids = new Set<string>([
      ...store.listPendingPromptTurns().map(turn => turn.session_id),
      ...store.listPendingTranslations().map(record => record.session_id),
    ])
    for (const workspace of ctx.workspaceRegistry.list()) {
      for (const task of store.listTasks(String(workspace.id))) {
        if (task.session_id && !['succeeded', 'failed', 'cancelled'].includes(task.status)) ids.add(task.session_id)
        for (const run of store.listRuns(task.task_id)) store.generationRunChanged(run.run_id)
      }
    }
    for (const id of ids) { try { await consume(id) } catch {} }
    for (const observed of tasks.filter(task => (task.kind !== 'prompt' || store.listPromptTurns(task.task_id).length === 0) && (task.execution_state === 'pending' || task.execution_state === 'running'))) {
      try {
        const events = observed.session_id ? await sessions.events(observed.session_id) : []
        if (signal.aborted) return
        const task = store.getTask(observed.task_id)
        const active = task.session_id && ctx.agents.get(SessionId(task.session_id))?.status === 'running'
        const accepted = requestTurn(events, { request_id: task.task_id, harness_turn: task.parent_experiment_task_id ? 1 : null, start_seq: -1 })?.accepted
        const produced = store.listArtifacts(task.task_id).length || store.listRuns(task.task_id).length || store.listChildTasks(task.task_id).length
        if ((task.execution_state === 'pending' || task.execution_state === 'running') && !['succeeded', 'failed', 'interrupted', 'paused'].includes(task.status) && !active && !produced) store.markExecution(task.task_id, accepted ? 'interrupted' : 'failed', accepted ? experimentControlErrors.interruptedExecution : experimentControlErrors.incompleteDispatch)
      } catch (error) { reportFailure(error) }
    }
  }
  void recover().catch(reportFailure)
  const assertWorkspace = (workspaceId: string) => {
    if (!ctx.workspaceRegistry.list().some(workspace => String(workspace.id) === workspaceId)) throw new WorkbenchError('WORKBENCH_NOT_FOUND', '工作区不存在，请重新选择工作区。', 'workspace_id')
  }
  const initialModels = await controller.modelCatalog()
  for (const workspace of ctx.workspaceRegistry.list()) store.ensureFunctionBindings(String(workspace.id), defaults, { presetId: productAgent.preset.id, agentModel: initialModels.default })
  ctx.provide('harnessComfyuiWorkbench', {
    service, signal, translations, prompts, assertWorkspace, validateDraft: input.validateDraft, validateParameters: input.validateParameters, resolveResourceSelection: input.resolveResourceSelection, resolveGenerationDraft: input.resolveGenerationDraft, presetSkills,
    async validateFunctionAgentModel(selection) {
      const models = await controller.modelCatalog().catch(cause => {
        const failure = agentModelSelection.catalogUnavailable
        const error = new WorkbenchError(failure.code, failure.message, agentModelSelection.path)
        error.cause = cause
        throw error
      })
      const problem = agentModelProblem(selection, models.groups, models.routableProviders)
      if (problem) throw new WorkbenchError(agentModelSelection.invalidSelectionCode, problem, agentModelSelection.path)
    },
    async validateFunctionPreset(presetId) {
      const preset = (await ctx.agentPresets.list()).find(candidate => candidate.id === presetId)
      if (!preset || preset.broken) throw new WorkbenchError('WORKBENCH_PRESET_UNAVAILABLE', '所选 Agent 预设当前不可用，请重新选择预设。', 'preset_id')
    },
    async initializeWorkspace(workspaceId) {
      assertWorkspace(workspaceId)
      const existing = new Set(store.listFunctionBindings(workspaceId).map(binding => binding.function_id))
      if (defaults.every(descriptor => existing.has(descriptor.kind))) return
      const models = await controller.modelCatalog()
      store.ensureFunctionBindings(workspaceId, defaults, { presetId: productAgent.preset.id, agentModel: models.default })
    },
    async environment(workspaceId, presetId) {
      const [presets, models] = await Promise.all([ctx.agentPresets.list(), controller.modelCatalog()])
      const workspaces = ctx.workspaceRegistry.list().map(workspace => ({ id: String(workspace.id), name: workspace.title, path: workspace.path }))
      const skills = workspaceId && presetId && presets.some(preset => preset.id === presetId && !preset.broken)
        ? await presetSkills(workspaceId, presetId) : []
      const instances = await catalog.queryComfyuiInstances(CATALOG_COMFYUI_INSTANCE_QUERY, signal)
        .then(page => page.results.map(item => ({ id: item.id, name: item.title })))
        .catch(error => { ctx.logger('harness-comfyui').warn('Workbench instance catalog unavailable: %s', error instanceof Error ? error.message : String(error)); return [] })
      return { instances, workspaces, defaultPresetId: productAgent.preset.id, presets: presets.map(preset => ({ id: preset.id, name: preset.name ?? preset.id, ...(preset.broken ? { broken: preset.broken } : {}) })), models, skills }
    },
  })
}

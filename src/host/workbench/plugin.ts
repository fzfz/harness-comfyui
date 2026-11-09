import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-workspace'
import agentModelSelection from '../../workbench/agent-model-selection.json' with { type: 'json' }
import { agentModelProblem } from '../../workbench/agent-model.ts'
import libraryConfig from '../../workbench/library-config.json' with { type: 'json' }
import productAgent from '../../../config/product-agent.json' with { type: 'json' }
import { WORKBENCH_FUNCTIONS as defaults } from '../../workbench/functions.ts'
import type { WorkbenchEnvironment } from '../../workbench-remote.ts'
import { CATALOG_COMFYUI_INSTANCE_QUERY } from '../../catalog/contract.ts'
import { WorkbenchService } from '../../workbench/service.ts'
import type { AgentModel, WorkbenchModelCatalog, GenerationInput, ContextRef, TaskDraft } from '../../workbench/contract.ts'
import { WorkbenchError } from '../../workbench/validation.ts'
import { createWorkbenchInputAdapter } from './input-adapter.ts'
import { workspaceSessionScopeForSession } from '../generation/workspace-access.ts'
import { HarnessWorkbenchSessions, type OfficialSessionController } from './harness-adapter.ts'
import type {} from '../core/plugin.ts'

import { CatalogError } from '../catalog/catalog-client.ts'

interface SkillCatalog {
  list(options: { cwd?: string; scope?: unknown }): Promise<readonly { name: string; description: string; invocation: { modelInvocable: boolean } }[]>
}
function skillsFor(ctx: Context): SkillCatalog { return ctx.get('skills') as SkillCatalog }
interface WorkbenchHost {
  readonly service: WorkbenchService
  readonly signal: AbortSignal
  readonly validateParameters: ReturnType<typeof createWorkbenchInputAdapter>['validateParameters']
  readonly resolveGenerationDraft: (input: GenerationInput, refs: ContextRef[]) => Promise<TaskDraft>
  readonly resolveResourceSelection: ReturnType<typeof createWorkbenchInputAdapter>['resolveResourceSelection']
  readonly environment: (workspaceId?: string, presetId?: string) => Promise<WorkbenchEnvironment>
  readonly initializeWorkspace: (workspaceId: string) => Promise<void>
  readonly presetSkills: (workspaceId: string, presetId: string) => Promise<WorkbenchEnvironment['skills']>
  readonly validateFunctionAgentModel: (selection: AgentModel) => Promise<void>
  readonly validateFunctionPreset: (presetId: string) => Promise<void>
}
declare module '@deepseek-ai/cordis' { interface Context { harnessComfyuiWorkbench: WorkbenchHost } }

export const name = 'harness-comfyui-workbench'
export const inject = ['harnessComfyuiCore', 'sessionController', 'agents', 'agentPresets', 'skills', 'workspaceRegistry', 'sessionPersistence', 'subagents'] as const

export function apply(ctx: Context): void {
  const { runtime, catalog, workbenchStore: store, profile } = ctx.harnessComfyuiCore.services
  const controller = ctx.get('sessionController') as unknown as OfficialSessionController & { modelCatalog(): Promise<WorkbenchModelCatalog> }
  const lifecycle = new AbortController()
  const { signal } = lifecycle
  ctx.effect(() => () => lifecycle.abort(), 'Workbench requests')
  const sessions = new HarnessWorkbenchSessions({
    controller,
    events: sessionId => ctx.agents.get(SessionId(sessionId))?.session.snapshotEvents() ?? [],
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
    refreshAfterMs: profile.client.runRefreshIntervalMs,
    prepareGenerationInput: input.prepareGenerationInput, resolveResourceRefs: input.resolveResourceRefs, resolveResourceSelection: input.resolveResourceSelection,
    validateContextRefs: input.validateReferences, validateResourceRefs: input.validateReferences,
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
  ctx.on('agent/error', ({ agent }) => { sessions.recordFailure(String(agent.id)) })
  ctx.provide('harnessComfyuiWorkbench', {
    service, signal, validateParameters: input.validateParameters, resolveResourceSelection: input.resolveResourceSelection, resolveGenerationDraft: input.resolveGenerationDraft, presetSkills,
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
      if (!ctx.workspaceRegistry.list().some(workspace => String(workspace.id) === workspaceId)) throw new WorkbenchError('WORKBENCH_NOT_FOUND', '工作区不存在，请重新选择工作区。', 'workspace_id')
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

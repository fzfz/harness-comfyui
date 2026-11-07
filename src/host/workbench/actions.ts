import type { Context } from '@deepseek-ai/cordis'
import type { ExperimentWorkbenchAction } from '../../workbench-remote.ts'
import type { WorkbenchScope } from '../../workbench-remote.ts'
import type { FunctionBinding, ReviewDraft, ResourceRef } from '../../workbench/contract.ts'
import { flattenWorkflowRuntimeParameters } from '../../generation/inspection-contract.ts'
import { parseCliGenerationRequest, toGenerationRequest } from '../../cli/contract.ts'
import { WorkbenchError } from '../../workbench/validation.ts'
import type {} from './plugin.ts'
import type {} from '../core/plugin.ts'

function fields(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WorkbenchError('WORKBENCH_INVALID_INPUT', '操作输入 value 必须是对象。请按操作要求填写字段。', 'value')
  return value as Record<string, unknown>
}
function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new WorkbenchError('WORKBENCH_INVALID_INPUT', `字段 ${path} 必须是非空文本。请填写后重试。`, path)
  return value
}

export async function executeWorkbenchAction(ctx: Context, request: ExperimentWorkbenchAction): Promise<WorkbenchScope> {
  const { service } = ctx.harnessComfyuiWorkbench
  const { store } = service
  const { runtime } = ctx.harnessComfyuiCore.services
  if (request.type === 'new-workspace') {
    const value = fields(request.value)
    const path = text(value.path, 'path').trim(), name = text(value.name, 'name').trim()
    try {
      const existing = await ctx.workspaceRegistry.resolveByPath(path)
      if (existing) return { workspaceId: String(existing.id) }
      if (ctx.workspaceRegistry.list().some(workspace => workspace.title === name)) {
        throw new WorkbenchError('WORKBENCH_WORKSPACE_NAME_CONFLICT', '已有同名工作区，请使用其他名称。', 'name')
      }
      const workspace = await ctx.workspaceRegistry.create(path, name)
      return { workspaceId: String(workspace.id) }
    } catch (error) {
      if (error instanceof WorkbenchError) throw error
      const failure = new WorkbenchError('WORKBENCH_WORKSPACE_CREATE_FAILED', '无法添加工作区，请填写已存在且可访问的项目目录。', 'path')
      failure.cause = error
      throw failure
    }
  }
  await ctx.harnessComfyuiWorkbench.initializeWorkspace(request.workspaceId)
  if (request.type === 'new-work') {
    const value = fields(request.value)
    const created = store.createWork({ workspaceId: request.workspaceId, name: text(value.name, 'name'), goal: text(value.goal, 'goal') })
    return { workspaceId: request.workspaceId, workId: created.work.work_id, branchId: created.branch.branch_id }
  }
  if (request.type.startsWith('function-')) {
    if (request.type === 'function-remove') store.removeFunctionBinding(request.workspaceId, text(request.id, 'function_id'))
    else if (request.type === 'function-preset') {
      const binding = store.getFunctionBinding(request.workspaceId, text(request.id, 'function_id'))
      store.saveFunctionBinding({ ...binding, preset_id: text(request.value, 'preset_id') })
    } else store.saveFunctionBinding({ ...fields(request.value), workspace_id: request.workspaceId } as unknown as FunctionBinding)
    return { workspaceId: request.workspaceId, ...(request.workId ? { workId: request.workId } : {}), ...(request.branchId ? { branchId: request.branchId } : {}) }
  }
  const workId = text(request.workId, 'work_id'), branchId = text(request.branchId, 'branch_id')
  store.assertScope(request.workspaceId, workId, branchId)
  const branch = store.getBranch(branchId)
  const selection = { workspaceId: request.workspaceId, workId, branchId }
  if (request.runId) store.assertRunInWork(request.runId, workId)
  if (request.taskId && store.getBranch(store.getTask(request.taskId).branch_id).work_id !== workId) throw new WorkbenchError('WORKBENCH_SCOPE_MISMATCH', '请选择当前工作的任务。', 'task_id')
  switch (request.type) {
    case 'create-branch': {
      const value = fields(request.value)
      let draft = structuredClone(branch.draft)
      if (request.runId) {
        const run = store.getRun(request.runId), task = store.getTask(run.workbench_task_id)
        const candidate = run.candidate_artifact_id ? store.getArtifact(run.candidate_artifact_id).artifact : null
        draft = await ctx.harnessComfyuiWorkbench.resolveGenerationDraft(run.generation_input, candidate?.type === 'generation_input' ? candidate.context_refs : task.input.context_refs)
      }
      const created = store.createBranch({ workId, parentBranchId: branchId, name: text(value.name, 'name'), originalRequest: text(value.original_request, 'original_request'), draft, ...(request.runId ? { sourceRunId: request.runId } : {}) })
      return { ...selection, branchId: created.branch_id }
    }
    case 'update-branch': {
      store.saveBranchDraft({ ...selection, expected: branch.draft, draft: branch.draft, ...(request.field === 'name' ? { name: text(request.value, 'name') } : { originalRequest: text(request.value, 'original_request'), expectedOriginalRequest: branch.original_request }) })
      break
    }
    case 'update-execution': {
      const execution = { ...branch.execution, ...(request.field === 'mode' ? { mode: request.value as 'once' | 'continuous' } : { max_runs: Number(request.value) }) }
      store.saveBranchDraft({ ...selection, expected: branch.draft, draft: branch.draft, execution })
      break
    }
    case 'update-draft': {
      const draft = structuredClone(branch.draft)
      const field = text(request.field, 'field')
      if (field === 'positive_prompt' || field === 'negative_prompt') draft.prompt_input[field] = String(request.value ?? '')
      else if (field === 'instance_id') draft.generation_input.instance_id = request.value ? String(request.value) : null
      else if (field === 'lora-weight') {
        const lora = draft.generation_input.loras.find(item => item.id === request.id)
        if (!lora) throw new WorkbenchError('WORKBENCH_NOT_FOUND', '请选择已添加的 LoRA。', 'id')
        lora.weight = Number(request.value)
      } else {
        const input = draft.generation_input
        if (!input.template_id || !input.instance_id) throw new WorkbenchError('WORKBENCH_TEMPLATE_REQUIRED', '请先选择实例和 Workflow 模板，再填写生成参数。', 'generation_input')
        const description = await runtime.inspectTemplateRuntimeParameters({ templateId: input.template_id, instanceId: input.instance_id })
        const set = (kind: string, value: unknown) => {
          const parameters = description.parameters.filter(parameter => parameter.kind === kind)
          if (parameters.length !== 1) throw new WorkbenchError('WORKBENCH_PARAMETER_UNAVAILABLE', `模板没有唯一的 ${kind} 参数，请重新选择模板。`, 'field')
          input.parameters[parameters[0]!.parameter_id] = typeof value === 'string' ? value : Number(value)
        }
        if (field === 'size') {
          const selection = fields(request.value), values = fields(selection.parameters)
          const candidate = description.size_candidates.find(item => item.candidate_id === selection.candidate_id)
          if (!candidate) throw new WorkbenchError('WORKBENCH_INVALID_INPUT', '请重新选择当前模板的画面尺寸。', 'value.candidate_id')
          const allowed = flattenWorkflowRuntimeParameters({ parameters: [], size_candidates: [candidate] })
          const ids = allowed.map(parameter => parameter.parameter_id)
          if (Object.keys(values).length !== ids.length || Object.keys(values).some(id => !ids.includes(id))) throw new WorkbenchError('WORKBENCH_INVALID_INPUT', '画面尺寸参数与所选尺寸选项不匹配。请重新选择画面尺寸。', 'value.parameters')
          for (const id of ids) input.parameters[id] = values[id] as import('../../workbench/contract.ts').JsonValue
          await runtime.validateGenerationRequest(toGenerationRequest(parseCliGenerationRequest(input)))
        } else set(field === 'references' ? 'reference_image' : field, field === 'references' ? String(request.value) : Number(request.value))
      }
      store.saveBranchDraft({ ...selection, expected: branch.draft, draft })
      break
    }
    case 'resource-select': {
      const ref = fields(request.value)
      const draft = await ctx.harnessComfyuiWorkbench.resolveResources([{ kind: text(ref.kind, 'kind'), id: text(ref.id, 'id') } as ResourceRef], branch.draft)
      store.saveBranchDraft({ ...selection, expected: branch.draft, draft }); break
    }
    case 'resource-remove': {
      const draft = structuredClone(branch.draft)
      if (request.value === 'model') draft.generation_input.model = null
      else if (request.value === 'comfyui-template') draft.generation_input.template_id = null
      else if (request.value === 'lora') draft.generation_input.loras = draft.generation_input.loras.filter(item => item.id !== request.id)
      else draft.context_refs = draft.context_refs.filter(item => item.id !== request.id || item.kind !== request.value)
      store.saveBranchDraft({ ...selection, expected: branch.draft, draft }); break
    }
    case 'run': case 'experiment': case 'retry': case 'agent-action': {
      const kind = request.type === 'retry' ? 'run' : request.type
      const functionId = request.type === 'agent-action' ? text(request.id, 'function_id') : store.listFunctionBindings(request.workspaceId).find(item => item.kind === kind)?.function_id
      const value = request.value && typeof request.value === 'object' ? fields(request.value) : {}
      const selectedFunctionId = text(functionId, 'function_id')
      const selectedKind = store.getFunctionBinding(request.workspaceId, selectedFunctionId).kind
      let evaluationInput
      if (['review', 'compare', 'diagnose', 'experience'].includes(selectedKind)) {
        const runId = text(request.runId, 'run_id'), draft = store.getRunReviewDraft(runId)
        evaluationInput = { run_id: runId, verdict: draft.verdict, observation: draft.observation, conclusion: draft.conclusion, experience: { title: draft.title, conditions: draft.conditions, note: draft.note } }
      }
      await service.createTask({ ...selection, functionId: selectedFunctionId, ...(evaluationInput ? { evaluationInput } : {}), ...(typeof value.instructions === 'string' ? { instructions: value.instructions } : {}), ...(typeof value.preset_override === 'string' && value.preset_override ? { presetOverride: value.preset_override } : {}), ...(request.referenceRunIds ? { referenceRunIds: [...request.referenceRunIds] } : request.runId ? { referenceRunIds: [request.runId] } : {}), ...(request.type === 'retry' && request.runId ? { retryOfRunId: request.runId } : {}), maxRuns: branch.execution.max_runs })
      break
    }
    case 'task-interrupt': case 'task-resume': case 'pause-experiment': case 'resume-experiment': {
      await service.controlTask({ taskId: text(request.taskId, 'task_id'), action: request.type === 'task-interrupt' ? 'interrupt' : request.type === 'pause-experiment' ? 'pause' : 'continue' }); break
    }
    case 'stop-experiment': {
      await service.controlTask({ taskId: text(request.taskId, 'task_id'), action: 'pause' })
      store.endExperiment(text(request.taskId, 'task_id'), 'user_ended'); break
    }
    case 'task-answer': {
      await service.replyTask({ taskId: text(request.taskId, 'task_id'), questionArtifactId: text(request.id, 'question_artifact_id'), answer: text(request.value, 'answer') }); break
    }
    case 'favorite': {
      const targetType = request.value === 'experience' ? 'experience' : 'run'
      const targetId = text(request.id ?? request.runId, 'target_id')
      const saved = store.getProjection(selection).favorites.some(item => item.target_type === targetType && item.target_id === targetId)
      store.setFavorite({ workspaceId: request.workspaceId, workId, targetType, targetId, favorite: !saved }); break
    }
    case 'evaluate': {
      const runId = text(request.runId, 'run_id'), value = fields(request.value)
      store.saveRunReview({ workspaceId: request.workspaceId, workId, runId, expected: value.expected as ReviewDraft, draft: value.draft as ReviewDraft, saveExperience: value.saveExperience === true }); break
    }
    case 'task-apply': {
      const artifactId = text(request.id, 'artifact_id')
      const artifact = store.getArtifact(artifactId), task = store.getTask(artifact.task_id)
      if (store.getBranch(task.branch_id).work_id !== workId) throw new WorkbenchError('WORKBENCH_SCOPE_MISMATCH', '请选择当前工作的产物。', 'artifact_id')
      await service.adoptArtifact({ artifactId, expected: fields(request.value) as Record<string, import('../../workbench/contract.ts').JsonValue> }); break
    }
    case 'reuse': {
      const experience = store.getExperience(text(request.id, 'experience_id'))
      if (experience.work_id !== workId) throw new WorkbenchError('WORKBENCH_SCOPE_MISMATCH', '请选择当前工作的经验。', 'experience_id')
      const run = store.getRun(experience.source_run_id)
      const task = store.getTask(run.workbench_task_id)
      const candidate = run.candidate_artifact_id ? store.getArtifact(run.candidate_artifact_id).artifact : null
      const draft = await ctx.harnessComfyuiWorkbench.resolveGenerationDraft(run.generation_input, candidate?.type === 'generation_input' ? candidate.context_refs : task.input.context_refs)
      const created = store.createBranch({ workId, parentBranchId: branchId, name: experience.title.slice(0, 40), originalRequest: experience.note, draft, sourceRunId: run.run_id, sourceExperienceId: experience.experience_id })
      return { ...selection, branchId: created.branch_id }
    }
    case 'task-branch': {
      const artifact = store.getArtifact(text(request.id, 'artifact_id'))
      if (store.getBranch(store.getTask(artifact.task_id).branch_id).work_id !== workId) throw new WorkbenchError('WORKBENCH_SCOPE_MISMATCH', '请选择当前工作的产物。', 'artifact_id')
      let draft = structuredClone(branch.draft)
      if (artifact.artifact.type === 'generation_input') draft = await ctx.harnessComfyuiWorkbench.resolveGenerationDraft(artifact.artifact.generation_input, artifact.artifact.context_refs)
      else if (artifact.artifact.type === 'prompt') draft.prompt_input = { positive_prompt: artifact.artifact.positive_prompt, negative_prompt: artifact.artifact.negative_prompt }
      else throw new WorkbenchError('WORKBENCH_INVALID_INPUT', '请选择提示词或生成输入产物创建分支。', 'artifact_id')
      const created = store.createBranch({ workId, parentBranchId: branchId, name: text(fields(request.value).name, 'name'), originalRequest: branch.original_request, draft, sourceArtifactId: artifact.artifact_id })
      return { ...selection, branchId: created.branch_id }
    }
    default: throw new WorkbenchError('WORKBENCH_INVALID_INPUT', '请选择工作台中的操作。', 'type')
  }
  return selection
}

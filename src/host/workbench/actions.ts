import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { type ExperimentWorkbenchAction } from '../../workbench-remote.ts'
import type { WorkbenchActionReceipt } from '../../workbench-remote.ts'
import { isRunReviewFunctionKind, type JsonValue, type ResourceRef } from '../../workbench/contract.ts'
import { equalValue } from '../../shared/json-contract.ts'
import { jsonValue, validateFavoriteUpdate, validateExperienceReuseInput, validateFunctionBindingEditable, validateReviewDraftUpdate, validateTaskDraft, validateTaskRequestDraft, WorkbenchError } from '../../workbench/validation.ts'
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

export async function executeWorkbenchAction(ctx: Context, request: ExperimentWorkbenchAction, requestSignal = new AbortController().signal): Promise<WorkbenchActionReceipt> {
  const { service, signal: lifecycleSignal } = ctx.harnessComfyuiWorkbench
  const signal = AbortSignal.any([requestSignal, lifecycleSignal])
  signal.throwIfAborted()
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
      const presetId = text(request.value, 'preset_id')
      await ctx.harnessComfyuiWorkbench.validateFunctionPreset(presetId)
      const skills = await ctx.harnessComfyuiWorkbench.presetSkills(request.workspaceId, presetId)
      const binding = { ...store.getFunctionBinding(request.workspaceId, text(request.id, 'function_id')), preset_id: presetId }
      if (binding.requested_skill && !skills.some(skill => skill.name === binding.requested_skill)) binding.requested_skill = null
      store.saveFunctionBinding(binding)
    } else {
      const value = validateFunctionBindingEditable(request.value)
      await ctx.harnessComfyuiWorkbench.validateFunctionPreset(value.preset_id)
      await ctx.harnessComfyuiWorkbench.validateFunctionAgentModel(value.agent_model)
      const identity = request.type === 'function-add'
        ? { workspace_id: request.workspaceId, function_id: randomUUID(), builtin: false }
        : store.getFunctionBinding(request.workspaceId, text(request.id, 'function_id'))
      store.saveFunctionBinding({ ...identity, ...value })
    }
    return { workspaceId: request.workspaceId, ...(request.workId ? { workId: request.workId } : {}), ...(request.branchId ? { branchId: request.branchId } : {}) }
  }
  if (request.type === 'favorite') {
    const value = validateFavoriteUpdate(request.value)
    store.setFavorite({ workspaceId: request.workspaceId, workId: request.workId, targetType: value.targetType, targetId: text(request.id, 'target_id'), favorite: value.favorite })
    return { workspaceId: request.workspaceId, ...(request.workId ? { workId: request.workId } : {}), ...(request.branchId ? { branchId: request.branchId } : {}) }
  }
  const workId = text(request.workId, 'work_id'), branchId = text(request.branchId, 'branch_id')
  store.assertScope(request.workspaceId, workId, branchId)
  const branch = store.getBranch(branchId)
  const selection = { workspaceId: request.workspaceId, workId, branchId }
  if (request.runId) store.getRun(request.runId)
  if (request.taskId && store.getBranch(store.getTask(request.taskId).branch_id).work_id !== workId) throw new WorkbenchError('WORKBENCH_SCOPE_MISMATCH', '请选择当前工作的任务。', 'task_id')
  switch (request.type) {
    case 'save-draft': {
      const value = fields(request.value)
      const draft = validateTaskDraft(value.draft)
      await ctx.harnessComfyuiWorkbench.validateDraft(draft, signal)
      signal.throwIfAborted()
      store.saveBranchDraft({ ...selection, expected: validateTaskDraft(value.expected), draft,
        expectedEditingDraft: value.expectedEditingDraft === null ? null : validateTaskDraft(value.expectedEditingDraft),
        ...(value.name !== undefined ? { name: text(value.name, 'name'), expectedName: text(value.expectedName, 'expectedName') } : {}),
        ...(value.originalRequest !== undefined ? { originalRequest: text(value.originalRequest, 'originalRequest'), expectedOriginalRequest: text(value.expectedOriginalRequest, 'expectedOriginalRequest') } : {}),
      })
      break
    }
    case 'edit-draft': {
      const value = fields(request.value)
      const expected = value.expected === null ? null : validateTaskDraft(value.expected)
      const draft = value.draft === null ? null : validateTaskDraft(value.draft)
      const updated = store.saveEditingDraft({ ...selection, expected, draft })
      return { ...selection, editingDraft: updated.editing_draft }
    }
    case 'create-branch': {
      const value = fields(request.value)
      const name = text(value.name, 'name'), originalRequest = text(value.original_request, 'original_request')
      const created = request.runId
        ? await service.createBranchFromRun({ workspaceId: request.workspaceId, workId, runId: request.runId, name, originalRequest })
        : store.createBranch({ workId, parentBranchId: branchId, name, originalRequest, draft: branch.draft })
      return { ...selection, branchId: created.branch_id }
    }
    case 'update-execution': {
      const execution = { ...branch.execution, ...(request.field === 'mode' ? { mode: request.value as 'once' | 'continuous' } : { max_runs: Number(request.value) }) }
      store.saveBranchExecution({ ...selection, execution })
      break
    }
    case 'resource-select': {
      const ref = fields(request.value)
      const resource = { kind: text(ref.kind, 'kind'), id: text(ref.id, 'id') } as ResourceRef
      const draft = await ctx.harnessComfyuiWorkbench.resolveResourceSelection(resource, branch.editing_draft ?? branch.draft)
      const latest = store.getBranch(branchId)
      if (!equalValue(branch.editing_draft ?? branch.draft, latest.editing_draft ?? latest.draft)) throw new WorkbenchError('WORKBENCH_EDIT_CONFLICT', '编辑内容已改变，请核对当前内容后重新选择资源。', 'expected')
      store.saveEditingDraft({ ...selection, draft }); break
    }
    case 'resource-remove': {
      const draft = structuredClone(branch.editing_draft ?? branch.draft)
      if (request.value === 'model') draft.generation_input.model = null
      else if (request.value === 'comfyui-template') { draft.generation_input.template_id = null; draft.workflow_image_bindings = [] }
      else if (request.value === 'lora') draft.generation_input.loras = draft.generation_input.loras.filter(item => item.id !== request.id)
      const latest = store.getBranch(branchId)
      if (!equalValue(branch.editing_draft ?? branch.draft, latest.editing_draft ?? latest.draft)) throw new WorkbenchError('WORKBENCH_EDIT_CONFLICT', '编辑内容已改变，请核对当前内容后重新选择资源。', 'expected')
      store.saveEditingDraft({ ...selection, draft }); break
    }
    case 'run': case 'experiment': case 'retry': case 'agent-action': {
      const kind = request.type === 'retry' ? 'run' : request.type
      const functionId = request.type === 'agent-action' ? text(request.id, 'function_id') : store.listFunctionBindings(request.workspaceId).find(item => item.kind === kind)?.function_id
      const value = request.value && typeof request.value === 'object' ? fields(request.value) : {}
      const selectedFunctionId = text(functionId, 'function_id')
      const selectedKind = store.getFunctionBinding(request.workspaceId, selectedFunctionId).kind
      const evaluation = selectedKind !== 'translate' && isRunReviewFunctionKind(selectedKind)
        ? { runId: text(request.runId, 'run_id'), evaluationDraft: validateReviewDraftUpdate(value.evaluationDraft) } : {}
      const task = await service.createTask({ ...selection, functionId: selectedFunctionId, ...evaluation, ...(value.draft !== undefined ? { taskDraft: validateTaskRequestDraft(value.draft) } : typeof value.instructions === 'string' ? { instructions: value.instructions } : {}), ...(request.referenceRunIds ? { referenceRunIds: [...request.referenceRunIds] } : request.runId ? { referenceRunIds: [request.runId] } : {}), ...(request.type === 'retry' && request.runId ? { retryOfRunId: request.runId } : {}), maxRuns: branch.execution.max_runs })
      return { ...selection, taskId: task.task_id }
    }
    case 'task-interrupt': case 'task-resume': case 'pause-experiment': case 'resume-experiment': {
      await service.controlTask({ taskId: text(request.taskId, 'task_id'), action: request.type === 'task-interrupt' ? 'interrupt' : request.type === 'pause-experiment' ? 'pause' : 'continue' }); break
    }
    case 'stop-experiment': {
      await service.endExperiment({ taskId: text(request.taskId, 'task_id'), reason: 'user_ended' }, { workspaceId: request.workspaceId, workId }); break
    }
    case 'task-answer': {
      await service.replyTask({ taskId: text(request.taskId, 'task_id'), questionArtifactId: text(request.id, 'question_artifact_id'), answer: text(request.value, 'answer') }); break
    }
    case 'update-review-draft': {
      const runId = text(request.runId, 'run_id'), update = validateReviewDraftUpdate(request.value)
      store.saveRunReviewDraft({ workspaceId: request.workspaceId, workId, runId, ...update }); break
    }
    case 'evaluate': {
      const runId = text(request.runId, 'run_id'), value = fields(request.value)
      await service.saveRunReview({ workspaceId: request.workspaceId, workId, runId, ...validateReviewDraftUpdate({ expected: value.expected, draft: value.draft }), saveExperience: value.saveExperience === true }); break
    }
    case 'task-apply': case 'task-generation-apply': {
      const artifactId = text(request.id, 'artifact_id')
      const artifact = store.getArtifact(artifactId), task = store.getTask(artifact.task_id)
      if (store.getBranch(task.branch_id).work_id !== workId) throw new WorkbenchError('WORKBENCH_SCOPE_MISMATCH', '请选择当前工作的产物。', 'artifact_id')
      const candidate = request.type === 'task-generation-apply'
      const expected = candidate ? jsonValue(validateTaskDraft(request.value)) as Record<string, JsonValue> : fields(request.value) as Record<string, JsonValue>
      await service.adoptArtifact({ artifactId, expected, candidate }); break
    }
    case 'reuse': {
      const value = validateExperienceReuseInput(request.value)
      const created = await service.createBranchFromExperience({ workspaceId: request.workspaceId, workId, experienceId: text(request.id, 'experience_id'), ...value })
      return { ...selection, branchId: created.branch_id }
    }
    case 'task-branch': {
      const created = await service.createBranchFromArtifact({ workspaceId: request.workspaceId, workId, artifactId: text(request.id, 'artifact_id'), name: text(fields(request.value).name, 'name') })
      return { ...selection, branchId: created.branch_id }
    }
    default: throw new WorkbenchError('WORKBENCH_INVALID_INPUT', '请选择工作台中的操作。', 'type')
  }
  return selection
}

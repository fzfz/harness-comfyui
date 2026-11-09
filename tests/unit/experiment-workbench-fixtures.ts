import type { WorkflowRuntimeParameterInspection, WorkflowRuntimeParameterInspectionParameter } from '../../src/generation/inspection-contract.ts'
import type {
  AgentModel,
  Branch,
  FunctionBinding,
  Task,
  TaskDraft,
  TaskKind,
  WorkbenchProjection,
  WorkbenchRun,
} from '../../src/workbench/contract.ts'

import type { ConnectionState, ConnectionStateSource } from '@deepseek-ai/dsh-client-connection/client'

export function createConnectionState(initial: ConnectionState | undefined = 'connected') {
  let state: ConnectionState | undefined = initial
  const listeners = new Set<() => void>()
  const source: ConnectionStateSource = {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
  return {
    source,
    set(next: ConnectionState | undefined) {
      state = next
      for (const listener of listeners) listener()
    },
    get subscriberCount() { return listeners.size },
  }
}

export const functionEnvironment = {
  defaultPresetId: 'preset',
  workspaces: [{ id: 'workspace-a', name: '画面实验', path: '/projects/art' }],
  presets: [
    { id: 'preset', name: '工作台预设' },
    { id: 'preset-other', name: '绘图预设' },
  ],
  models: {
    default: { provider: 'provider', model: 'model', reasoningEffort: 'high' },
    groups: [{
      id: 'provider', name: '提供商',
      models: [{ id: 'model', name: '模型', reasoning: { efforts: [{ id: 'high', name: '高' }] } }],
    }],
    failures: [], routableProviders: ['provider'],
  },
  skills: [{ name: 'comfyui-generate', description: '生成图片' }],
  instances: [{ id: '2', name: 'win3080' }],
}

export const agentModel: AgentModel = {
  provider: 'provider',
  model: 'model',
  reasoningEffort: 'high',
}
export const draft: TaskDraft = {
  parameter_mapping: null,
  prompt_input: { positive_prompt: 'glass house', negative_prompt: 'blur' },
  generation_input: {
    title: '玻璃花房',
    instance_id: '2',
    template_id: '12',
    model: { id: '11', file_name: 'model.safetensors' },
    parameters: {
      seed_1: 1,
      steps_1: 28,
      cfg_1: 5,
      width_1: 1024,
      height_1: 768,
      positive_1: 'glass house',
      negative_1: 'blur',
    },
    loras: [
      {
        id: '13',
        file_name: 'glass.safetensors',
        weight: 0.5,
        trigger_words: [],
      },
    ],
  },
  reference_task_ids: [], reference_run_ids: [], reference_experiences: [], image_refs: [], workflow_image_bindings: [], instructions: '',
  base_model_id: '1',
}
export const makeBranch = (id: string, parent: string | null): Branch => ({
  branch_id: id,
  work_id: 'work-a',
  parent_branch_id: parent,
  name: id === 'root' ? '主分支' : '暖光探索',
  original_request: '玻璃花房',
  source_run_id: parent ? 'r1' : null,
  source_artifact_id: null,
  source_experience_id: parent ? 'experience-a' : null,
  draft: structuredClone(draft),
  editing_draft: null,
  execution: { mode: 'once', max_runs: 3 },
})
export const makeBinding = (
  kind: TaskKind,
  builtin = true,
): FunctionBinding => ({
  workspace_id: 'workspace-a',
  function_id: builtin ? kind : 'custom-' + kind,
  name: builtin ? kind : '自定义' + kind,
  kind,
  builtin,
  preset_id: 'preset',
  agent_model: agentModel,
  requested_skill: 'comfyui-generate',
  request_template: '{{task_id}}',
})
export const makeTask = (
  id: string,
  branchId = 'child',
  kind: TaskKind = 'run',
): Task => ({
  task_id: id,
  branch_id: branchId,
  function_id: kind,
  title: '任务 ' + id,
  kind,
  status: 'succeeded',
  input: {
    ...structuredClone(draft),
    reference_task_artifacts: [],
    requirements: { original_request: '玻璃花房', instructions: '比较光线' },
    reference_run_ids: [],
    requested_skill: null,
    max_runs: 3,
  },
  output_contract: {
    artifact_types: ['prompt'],
    required_artifact_types: ['prompt'],
    parameter_ids: [],
    apply_mode: 'candidate',
    requires_finished_runs: false,
  },
  apply_target: { kind: 'branch', id: branchId, expected: {} },
  binding_snapshot: {
    function_id: kind,
    name: kind,
    kind,
    preset_id: 'preset',
    agentModel,
    requested_skill: null,
    request_template: '{{task_id}}',
  },
  session_id: 'session-' + id,
  request_text: '读取任务',
  selected_model: null,
  answers: [],
  error: null,
  created_at: 1000,
  updated_at: 1000,
  execution_state: 'idle',
  initiator: 'human',
  retry_of_run_id: null,
})
export const makeRun = (
  id: string,
  taskId: string,
  status: WorkbenchRun['status'] = 'succeeded',
): WorkbenchRun => ({
  run_id: id,
  workbench_task_id: taskId,
  iteration_index: null,
  status,
  title: '运行 ' + id,
  generation_input: structuredClone(draft.generation_input),
  candidate_artifact_id: null,
  review_artifact_id: null,
  retry_of_run_id: id === 'r2' ? 'r1' : null,
  initiator: id === 'r2' ? 'agent' : 'human',
  review: {
    verdict: 'met',
    observation: '光线自然',
    conclusion: '符合预期',
    source_artifact_id: null,
  },
  review_draft: {
    verdict: 'met', observation: '光线自然', conclusion: '符合预期', title: '', conditions: 'SDXL', note: '',
    evidence_run_ids: [id], review_artifact_id: null, experience_artifact_id: null, experience_id: null,
  },
  error:
    status === 'failed' ? { code: 'FAILED', message: '实例连接中断' } : null,
  session_id: 'session-' + taskId,
  created_at: 1000,
  updated_at: 1000,
  media:
    status === 'succeeded'
      ? [
          {
            media_id: 'media-' + id,
            run_id: id,
            filename: 'result.png',
            media_kind: 'image',
            media_type: 'image/png',
            byte_size: 100,
            url: '/image.png',
          },
        ]
      : [],
})
export const treeProjection = (): WorkbenchProjection => {
  const data = fullProjection()
  const nodes = [
    { id: 'root', parent: null, name: '主分支', runs: 1 },
    { id: 'warm', parent: 'root', name: '暖光', runs: 2 },
    { id: 'cool', parent: 'root', name: '冷光', runs: 3 },
    { id: 'detail', parent: 'warm', name: '暖光细节', runs: 4 },
  ]
  data.total_branch_count = nodes.length
  data.branches = nodes.map(node => {
    const branch = makeBranch(node.id, node.parent)
    branch.name = node.name
    branch.original_request = `比较${node.name}的表现。`
    branch.draft.prompt_input.positive_prompt = `${node.id} prompt`
    branch.source_run_id = node.parent ? `${node.parent}-r1` : null
    return branch
  })
  data.tasks = nodes.map(node => makeTask(`${node.id}-task`, node.id))
  data.runs = nodes.flatMap(node =>
    Array.from({ length: node.runs }, (_, index) =>
      makeRun(`${node.id}-r${index + 1}`, `${node.id}-task`),
    ),
  )
  data.experiences = []
  data.favorites = []
  return data
}

export const fullProjection = (): WorkbenchProjection => ({
  workspace_id: 'workspace-a',
  reference_destinations: [],
  total_branch_count: 2,
  work_id: 'work-a',
  works: [
    {
      work_id: 'work-a',
      workspace_id: 'workspace-a',
      name: '雨后玻璃花房',
      goal: '探索雨后的光线',
    },
    {
      work_id: 'work-b',
      workspace_id: 'workspace-a',
      name: '第二个工作',
      goal: '实验',
    },
  ],
  branches: [makeBranch('root', null), makeBranch('child', 'root')],
  tasks: [makeTask('t1', 'root'), makeTask('t2'), makeTask('t3')],
  artifacts: [],
  runs: [
    makeRun('r1', 't1'),
    makeRun('r2', 't2'),
    makeRun('r3', 't3', 'failed'),
  ],
  experiments: [],
  experiences: [
    {
      experience_id: 'experience-a',
      work_id: 'work-a',
      branch_id: 'child',
      task_id: null,
      title: '自然光经验',
      conditions: '玻璃花房',
      note: '降低引导强度',
      base_model_id: '1',
      model_id: '11',
      evidence_run_ids: ['r2'],
      provenance: { created_by_task_id: null, evidence: [{ run_id: 'r2', generation_task_id: 't2', role: 'supporting_evidence' }] },
      source_run_id: 'r2',
      source_experience_id: null,
      source_artifact_id: null,
    },
  ],
  favorites: [
    { target_type: 'experience', target_id: 'experience-a' },
    { target_type: 'run', target_id: 'r2' },
  ],
  functions: (
    [
      'prompt',
      'rewrite',
      'parameters',
      'resources',
      'review',
      'compare',
      'diagnose',
      'experience',
      'run',
      'experiment',
    ] as const
  ).flatMap((kind) => [makeBinding(kind), makeBinding(kind, false)]),
  refreshAfterMs: 0,
})

export function runInputDescription(parameters: WorkbenchRun['generation_input']['parameters']): WorkflowRuntimeParameterInspection {
  const current = (parameter: WorkflowRuntimeParameterInspectionParameter) => ({
    ...parameter, current_value: Object.hasOwn(parameters, parameter.parameter_id) ? parameters[parameter.parameter_id]! : parameter.current_value,
  })
  return {
    parameters: inputDescription.parameters.map(current),
    size_candidates: inputDescription.size_candidates.map(candidate => candidate.representation === 'width_height'
      ? { ...candidate, width: current(candidate.width), height: current(candidate.height) }
      : candidate.representation === 'aspect_ratio_megapixels'
        ? { ...candidate, aspect_ratio: current(candidate.aspect_ratio), megapixels: current(candidate.megapixels) }
        : { ...candidate, parameter: current(candidate.parameter) }),
  }
}

export function runInputDefaults(input: import('../../src/workbench/contract.ts').GenerationInput) {
  return { submitted_input: input, effective_input: input, image_uploads: [], parameter_mapping: null, base_model_id: null }
}

export const inputDescription: WorkflowRuntimeParameterInspection = {
  parameters: [
    {
      kind: 'positive_prompt',
      parameter_id: 'positive_1',
      current_value: '',
      value_type: 'string',
    },
    {
      kind: 'negative_prompt',
      parameter_id: 'negative_1',
      current_value: '',
      value_type: 'string',
    },
    {
      kind: 'reference_image',
      parameter_id: 'reference_1',
      current_value: '',
      value_type: 'string',
    },
    {
      kind: 'seed',
      parameter_id: 'seed_1',
      current_value: 0,
      value_type: 'integer',
      minimum: 0,
    },
    {
      kind: 'steps',
      parameter_id: 'steps_1',
      current_value: 20,
      value_type: 'integer',
      minimum: 1,
      maximum: 100,
    },
    {
      kind: 'cfg',
      parameter_id: 'cfg_1',
      current_value: 5,
      value_type: 'number',
      minimum: 0,
      maximum: 30,
    },
    {
      kind: 'width',
      parameter_id: 'width_1',
      current_value: 1024,
      value_type: 'integer',
      minimum: 256,
      maximum: 2048,
    },
    {
      kind: 'height',
      parameter_id: 'height_1',
      current_value: 768,
      value_type: 'integer',
      minimum: 256,
      maximum: 2048,
    },
  ],
  size_candidates: [
    {
      candidate_id: 'size_1',
      representation: 'width_height',
      width: {
        kind: 'width',
        parameter_id: 'width_1',
        current_value: 1024,
        value_type: 'integer',
        minimum: 256,
        maximum: 2048,
      },
      height: {
        kind: 'height',
        parameter_id: 'height_1',
        current_value: 768,
        value_type: 'integer',
        minimum: 256,
        maximum: 2048,
      },
    },
  ],
}

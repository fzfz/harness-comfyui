import type { ArtifactPayload, FunctionBinding, GenerationInput, InputReferences, TaskInput, TaskKind } from '../../workbench/contract.ts';
import { requestTemplateProblem, type TemplateBlockName } from './template-rules.ts';
import { withValidationPath } from './structure.ts';
type ParseData = (id: string, value: unknown) => unknown;
function invalid(path: string, message: string): never {
  throw Object.assign(new TypeError(`${path}: ${message}`), { code: 'WORKBENCH_INVALID_INPUT', issues: [{ path, message }] });
}
function unique(values: readonly string[], path: string, message = '请移除重复引用。'): void {
  if (new Set(values).size !== values.length)
    invalid(path, message);
}
function imageBindings(refs: Pick<InputReferences, 'image_refs' | 'workflow_image_bindings'>): void {
  unique(refs.image_refs.map(image => image.image_ref_id), 'image_refs');
  unique(refs.workflow_image_bindings.map(binding => binding.parameter_id), 'workflow_image_bindings', '同一 Workflow 参数存在多个图片绑定。请将这些图片合并到该参数的一条绑定中。');
  const images = new Map(refs.image_refs.map(image => [image.image_ref_id, image]));
  for (const binding of refs.workflow_image_bindings)
    for (const id of binding.image_ref_ids) {
      const image = images.get(id);
      if (!image || image.purpose === 'agent')
        invalid('workflow_image_bindings', '请绑定用途为 Workflow 输入的图片。');
    }
}
export function refinePromptResourceRefs(value: unknown): void {
  const refs = value as readonly {
    kind: string;
    id: string;
  }[];
  unique(refs.map(ref => `${ref.kind}:${ref.id}`), 'prompt_resource_refs');
}
function generation(input: GenerationInput, ready: boolean): void {
  if (ready && (input.instance_id === null || input.template_id === null))
    invalid('generation_input', '请选择生成实例与模板。');
  unique(input.loras.map(lora => lora.id), 'loras');
}
export function refineInputReferences(value: unknown): void {
  imageBindings(value as InputReferences);
}
export function refineTaskDraft(value: unknown): void {
  refineInputReferences(value);
}
export function refineGenerationInput(value: unknown): void {
  const input = value as GenerationInput;
  generation(input, false);
  imageBindings({ image_refs: input.image_refs ?? [], workflow_image_bindings: input.workflow_image_bindings ?? [] });
}
export function refineGenerationInputReady(value: unknown): void {
  generation(value as GenerationInput, true);
}
export function refineTaskInputForKind(request: {
  kind: TaskKind;
  value: unknown;
}, prefix = 'value'): void {
  const field = (name: string) => prefix ? `${prefix}.${name}` : name;
  const input = request.value as TaskInput;
  generation(input.generation_input, request.kind === 'run' || request.kind === 'experiment');
  if (!Number.isSafeInteger(input.max_runs) || (request.kind === 'run' ? input.max_runs !== 1 : request.kind === 'experiment' ? input.max_runs < 1 : input.max_runs !== 0))
    invalid(field('max_runs'), '运行任务填写 1，持续实验填写正整数，其他任务填写 0。');
  if (['review', 'compare', 'diagnose', 'experience'].includes(request.kind)) {
    if (input.reference_run_ids.length < (request.kind === 'compare' ? 2 : 1))
      invalid(field('reference_run_ids'), request.kind === 'compare' ? '请选择至少 2 个参考运行。' : '请选择至少 1 个参考运行。');
    if (request.kind === 'compare')
      unique(input.reference_run_ids, field('reference_run_ids'));
    if (!input.evaluation_input)
      invalid(field('evaluation_input'), '请选择评价输入。');
    if (!input.reference_run_ids.includes(input.evaluation_input.run_id))
      invalid(field('evaluation_input.run_id'), '请选择本次参考运行。');
  }
  else if (input.evaluation_input !== undefined)
    invalid(field('evaluation_input'), '请移除 evaluation_input 字段后重新提交。');
}
export function refineArtifact(value: unknown): void {
  const artifact = value as ArtifactPayload;
  switch (artifact.type) {
    case 'generation_input':
      generation(artifact.generation_input, true);
      imageBindings({ image_refs: artifact.image_refs ?? [], workflow_image_bindings: artifact.workflow_image_bindings ?? [] });
      break;
    case 'resources':
      unique(artifact.refs.map(ref => `${ref.kind}:${ref.id}`), 'refs');
      break;
    case 'review':
      if (artifact.candidate) {
        generation(artifact.candidate.generation_input, true);
        imageBindings({ image_refs: artifact.candidate.image_refs ?? [], workflow_image_bindings: artifact.candidate.workflow_image_bindings ?? [] });
      }
      break;
  }
}
export function refineFunctionBinding(value: unknown): void {
  const binding = value as FunctionBinding;
  const problem = requestTemplateProblem(binding.request_template, binding.kind);
  if (problem)
    invalid('request_template', problem);
  if (binding.kind === 'prompt' && binding.request_parts)
    for (const [name, template] of Object.entries(binding.request_parts.block_templates)) {
      const issue = requestTemplateProblem(template, 'prompt', name as TemplateBlockName);
      if (issue)
        invalid(`request_parts.block_templates.${name}`, issue);
    }
}
export function refineRemoteAction(value: unknown, parseData: ParseData): void {
  const action = value as {
    type: string;
    value?: unknown;
    workspaceId?: string;
    id?: string;
    runId?: string;
  };
  const parseField = (id: string, field: string, input: unknown) => withValidationPath(field, () => parseData(id, input));
  if (action.type !== 'new-workspace')
    parseField('cliText', 'workspaceId', action.workspaceId);
  const valueContracts = {
    'edit-draft': 'editorUpdate',
    'save-draft': 'branchSave',
    'function-add': 'functionBindingEditable',
    'function-edit': 'functionBindingEditable',
    favorite: 'favoriteUpdate',
    reuse: 'experienceReuseInput',
    'task-generation-apply': 'taskDraft',
    'update-review-draft': 'reviewDraftUpdate'
  } as const;
  if (action.type === 'function-edit' || action.type === 'favorite' || action.type === 'reuse' || action.type === 'task-generation-apply')
    parseField('cliText', 'id', action.id);
  if (action.type === 'update-review-draft')
    parseField('cliText', 'runId', action.runId);
  const contract = valueContracts[action.type as keyof typeof valueContracts];
  if (contract)
    action.value = parseField(contract, 'value', action.value);
  if (action.type === 'agent-action' && action.value && typeof action.value === 'object' && 'evaluationDraft' in action.value)
    action.value = { ...action.value, evaluationDraft: parseField('reviewDraftUpdate', 'value.evaluationDraft', action.value.evaluationDraft) };
}
export function refineTask(value: unknown): void {
  const task = value as {
    kind: TaskKind;
    input: unknown;
  }; refineTaskInputForKind({ kind: task.kind, value: task.input }, 'input');
}
export function refineTaskResult(value: unknown): void {
  const task = value as {
    kind: TaskKind;
  }; refineTaskInputForKind({ kind: task.kind, value: task }, '');
}

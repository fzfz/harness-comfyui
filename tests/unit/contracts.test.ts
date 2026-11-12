import { describe, expect, it } from 'vitest';
import { assertSupportedJsonSchema, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools';
import { contracts, type ContractId } from '#contracts';
import roleConfiguration from '../../config/workbench-agent-roles.json' with { type: 'json' };
const generationInput = () => ({
  title: 'scene',
  instance_id: '1',
  template_id: '2',
  model: null,
  parameters: {},
  loras: []
});
const taskDraft = () => ({
  prompt_input: { positive_prompt: 'scene', negative_prompt: null },
  generation_input: generationInput(),
  base_model_id: null,
  parameter_mapping: null
});
describe('contract module public interface', () => {
  it('isolates public template variables from the canonical configuration', () => {
    const variables = contracts.parse('requestTemplateVariables', 'input', {})
    const originalName = variables[0]!.name
    try {
      variables[0]!.name = 'changed'
      variables.push({ name: 'extra', label: 'Extra' })
      expect(contracts.parse('requestTemplateVariables', 'input', {})).toEqual([{ name: 'task_id', label: '工作台任务 ID' }])
      expect(contracts.parse('requestTemplateProblem', 'input', { template: '{{task_id}}' })).toBe('')
      expect(contracts.parse('requestTemplateProblem', 'input', { template: '{{changed}}' })).not.toBe('')
    } finally {
      variables[0]!.name = originalName
      variables.pop()
    }
  })

  it('validates catalog trigger words while preserving accepted strings and order', () => {
    const words = ['  scene  ', 'scene', 'x'.repeat(500)]
    for (const direction of ['input', 'output'] as const) {
      expect(contracts.parse('catalogLoraTriggerWords', direction, words)).toEqual(words)
      expect(contracts.parse('catalogLoraTriggerWords', direction, Array.from({ length: 100 }, (_, index) => String(index)))).toHaveLength(100)
      for (const invalid of [['scene', 'scene'], [' '], ['x'.repeat(501)], [1], Array.from({ length: 101 }, (_, index) => String(index))]) expect(() => contracts.parse('catalogLoraTriggerWords', direction, invalid)).toThrow()
    }
  })

  it('selects template variables and validates templates through the public contract', () => {
    expect(contracts.parse('requestTemplateVariables', 'input', {})).toEqual([{ name: 'task_id', label: '工作台任务 ID' }])
    expect(contracts.parse('requestTemplateVariables', 'input', { kind: 'translate' }).map(value => value.name)).toEqual(['source_text'])
    expect(contracts.parse('requestTemplateVariables', 'input', { kind: 'prompt', block: 'references_block' }).map(value => value.name)).toEqual(['reference_context'])
    for (const input of [{ template: 'Read {{task_id}}.' }, { template: 'Translate {{source_text}}.', kind: 'translate' }, {
      template: '{{reference_context}}',
      kind: 'prompt',
      block: 'references_block'
    }]) expect(contracts.parse('requestTemplateProblem', 'input', input)).toBe('')
    for (const template of ['', 'Read the task.', '{{unsupported}}', '{{task_id}} {{']) expect(contracts.parse('requestTemplateProblem', 'input', { template })).not.toBe('')
    const variables = contracts.parse('requestTemplateVariables', 'input', { kind: 'prompt' })
    expect(contracts.parse('requestTemplateVariables', 'output', variables)).toEqual(variables)
    expect(contracts.parse('requestTemplateProblem', 'output', '')).toBe('')
    expect(() => contracts.parse('requestTemplateVariables', 'input', { block: 'unknown' })).toThrow()
    expect(() => contracts.parse('requestTemplateProblem', 'output', {})).toThrow()
  })

  it('reports complete paths for nested custom constraints', () => {
    const binding = {
      name: 'Rewrite',
      kind: 'prompt',
      preset_id: 'preset-a',
      agent_model: { provider: 'provider-a', model: 'model-a' },
      requested_skill: null,
      request_template: 'Read {{task_id}}.'
    };
    expect(() => contracts.parse('workbench remote mutate', 'input', {
      workspaceId: 'workspace-a',
      type: 'function-add',
      value: binding
    })).toThrowError(expect.objectContaining({ issues: [expect.objectContaining({ path: '$.value.request_template' })] }));
  });
  it('accepts JSON validator inputs and rejects non-JSON values', () => {
    for (const input of [null, { words: ['scene', 1, true] }])
      expect(contracts.parse('workbench_prompt_validate', 'input', { skill_name: 'prompt', input })).toHaveProperty('input', input);
    for (const input of [NaN, () => 1, { bad: undefined }])
      expect(() => contracts.parse('workbench_prompt_validate', 'input', { skill_name: 'prompt', input })).toThrow();
  });
  it('requires declared arrays in both directions and fills only explicit optional defaults', () => {
    for (const direction of ['input', 'output'] as const) {
      expect(() => contracts.parse('workflowRuntimeParameterInspection', direction, { parameters: [] })).toThrow('size_candidates');
      expect(contracts.parse('inputReferences', direction, {})).toMatchObject({
        image_refs: [],
        workflow_image_bindings: [],
        reference_run_ids: []
      });
    }
  });
  it('applies artifact rules to output values and artifacts nested in task delivery', () => {
    const artifact = {
      type: 'review',
      observation: 'scene',
      conclusion: 'reviewed',
      run_ids: []
    };
    expect(() => contracts.parse('taskArtifact', 'output', artifact)).toThrow('run_ids');
    const task = {
      ...taskDraft(),
      task_id: 'task-a',
      parent_experiment_task_id: null,
      children: [],
      kind: 'run',
      status: 'running',
      requirements: { original_request: 'scene', instructions: '' },
      requested_skill: null,
      max_runs: 1,
      output_contract: {
        artifact_types: [],
        required_artifact_types: [],
        parameter_ids: [],
        apply_mode: 'record',
        requires_finished_runs: true
      },
      artifacts: [{
        task_id: 'task-a',
        artifact_id: 'artifact-a',
        artifact,
        disposition: 'recorded'
      }],
      iterations: [],
      answers: [],
    };
    delete (task as {
      parameter_mapping?: unknown;
    }).parameter_mapping;
    expect(() => contracts.parse('workbench_task_get', 'output', task)).toThrow('run_ids');
  });
  it('applies draft uniqueness rules when the draft is nested in a Remote request', () => {
    const ref = { kind: 'artist-string', id: '1' };
    const draft = { ...taskDraft(), prompt_resource_refs: [ref, ref] };
    expect(() => contracts.parse('taskDraft', 'input', draft)).toThrow();
    expect(() => contracts.parse('workbench remote promptStart', 'input', {
      workspace_id: 'workspace-a',
      work_id: 'work-a',
      branch_id: 'branch-a',
      function_id: 'prompt',
      request_id: 'request-a',
      intent: 'generate',
      input: {
        original_request: 'scene',
        base_model_id: '1',
        positive_prompt: '',
        negative_prompt: '',
        change_request: ''
      },
      draft,
    })).toThrow();
  });
  it('preserves every legal dictionary key through file manifests and parameter mappings', () => {
    const parameter_files = JSON.parse('{"__proto__":"/tmp/prompt.txt","constructor":"/tmp/other.txt"}') as Record<string, string>;
    const item = contracts.parse('cliManifestItem', 'input', {
      request_id: 'a1bb69ae-881f-404d-b946-51cc403d461e',
      request: generationInput(),
      parameter_files
    });
    expect(Object.hasOwn(item.parameter_files!, '__proto__')).toBe(true);
    expect(item.parameter_files).toEqual(parameter_files);
    const parameter_mapping = JSON.parse('{"__proto__":"seed","constructor":"steps"}') as Record<string, string>;
    const draft = contracts.parse('taskDraft', 'input', { ...taskDraft(), parameter_mapping });
    expect(Object.hasOwn(draft.parameter_mapping!, '__proto__')).toBe(true);
    expect(draft.parameter_mapping).toEqual(parameter_mapping);
  });
  it('preserves a custom collection constraint failure when structural items are valid', () => {
    const item = { request_id: 'a1bb69ae-881f-404d-b946-51cc403d461e', request: generationInput() };
    expect(() => contracts.parse('cliGenerationManifest', 'input', { items: [item, item] })).toThrow('duplicates');
  });
  it('validates normalized converter results in their output direction without repeating conversion', () => {
    const request = {
      title: 'scene',
      instance_id: '1',
      template_id: '2',
      model: null,
      parameters: { seed: 1 },
      loras: []
    };
    const cases: readonly [
      ContractId,
      unknown
    ][] = [
        ['runtimeGenerationRequest', request],
        ['historicalGenerationRequest', {
          title: 'scene',
          instanceId: null,
          templateId: '2',
          parameters: {}
        }],
        ['generationRunArguments', {
          title: 'scene',
          instanceId: null,
          templateId: '2',
          parameters: {},
          loras: []
        }],
        ['cliArguments', { argv: ['generation', 'run-inputs', '--stdin'], stdin: '{"run_ids":["run-a"]}' }],
        ['cliGenerationManifest', { items: [{ request_id: 'a1bb69ae-881f-404d-b946-51cc403d461e', request }] }],
        ['loraWeightValid', 1], ['loraWeightValid', null], ['loraTriggerWordsUnique', ['a', 'b']],
        ['generationRequestIdValid', 'invalid'], ['imageReaderPromptIssue', ''], ['imageReaderPromptIssue', 'valid prompt'],
      ];
    for (const [id, input] of cases) {
      const normalized = contracts.parse(id, 'input', input);
      expect(contracts.parse(id, 'output', normalized), id).toEqual(normalized);
    }
    expect(() => contracts.parse('loraWeightValid', 'output', 'true')).toThrow();
    expect(() => contracts.parse('imageReaderPromptIssue', 'output', null)).toThrow();
    expect(() => contracts.parse('imageReaderPromptIssue', 'output', 'other')).toThrow();
  });
  it('registers every configured native tool using the official supported schema subset', () => {
    const names = new Set(roleConfiguration.roles.flatMap(role => role.nativeTools));
    for (const name of names) {
      const tool = contracts.bind(name as Extract<ContractId, `workbench_${string}`>, 'native', { assertSchema: assertSupportedJsonSchema, execute: async () => ({}) });
      expect(() => assertSupportedJsonSchema(tool.parameters), `${name} input`).not.toThrow();
      expect(() => assertSupportedJsonSchema(tool.output.schema), `${name} output`).not.toThrow();
    }
  });
  it('delivers a nullable model resource through the same contract and native tool declaration', async () => {
    const snapshot = {
      kind: 'model',
      id: '19',
      name: 'model.safetensors',
      fields: {
        base_model_id: '4',
        file_name: 'model.safetensors',
        description: null,
        usage: null,
        skill_name: null
      }
    };
    expect(contracts.parse('resourceSnapshot', 'input', snapshot)).toEqual(snapshot);
  });
  it('delivers a valid nullable Workflow value and rejects an invalid output before delivery', async () => {
    let result: unknown = {
      parameters: [{
        parameter_id: 'seed',
        kind: 'seed',
        value_type: 'integer',
        current_value: null
      }], size_candidates: []
    };
    const tool = contracts.bind('workbench_workflow_parameters', 'native', { assertSchema: assertSupportedJsonSchema, execute: async () => result });
    const execution = { signal: new AbortController().signal } as never;
    const value = await tool.execute({ template_id: '1', instance_id: '2' }, execution);
    expect(validateJsonSchemaValue(tool.output.schema, value)).toEqual([]);
    result = {
      parameters: [], size_candidates: [{
        candidate_id: 'x',
        representation: 'resolution_preset',
        parameter: {
          parameter_id: 'size',
          kind: 'resolution_preset',
          value_type: 'choice',
          current_value: 'small'
        },
        mapped_options: [{
          value: 'small',
          width: -1,
          height: 1
        }],
        unmapped_values: []
      }]
    };
    await expect(tool.execute({ template_id: '1', instance_id: '2' }, execution)).rejects.toThrow('width');
  });
});

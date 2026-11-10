import Schema from '@deepseek-ai/schemastery'
import { describe, expect, it } from 'vitest'

import { cliResultSchemas } from '../../src/cli/result-schema.ts'

const branchKinds = ['prompt', 'parameters', 'resources'] as const
const completeInputKinds = ['run', 'experiment', 'review', 'compare', 'diagnose', 'experience'] as const
const allKinds = [...branchKinds, ...completeInputKinds]

function taskResult(kind: string): Record<string, unknown> {
  return {
    task_id: 'task_1', parent_experiment_task_id: null, children: [], kind, status: 'running',
    prompt_input: { positive_prompt: 'current prompt', negative_prompt: null },
    generation_input: { title: 'scene', instance_id: '2', template_id: '12', model: null, parameters: { steps_7: 28 }, loras: [] },
    reference_task_ids: [], reference_task_artifacts: [], reference_experiences: [], image_refs: [], workflow_image_bindings: [], image_sources: [], base_model_id: null,
    requirements: { original_request: 'glass house', instructions: '' },
    reference_run_ids: [], requested_skill: null, max_runs: kind === 'run' ? 1 : kind === 'experiment' ? 3 : 0,
    output_contract: { artifact_types: [], required_artifact_types: [], parameter_ids: [], apply_mode: 'automatic', requires_finished_runs: false },
    artifacts: [], iterations: [], answers: [],
    ...((branchKinds as readonly string[]).includes(kind) ? { unresolved_parameters: { opaque_18: { text: '原值\n第二行', settings: [null, false, 28, { width: 768 }] } } } : {}),
  }
}

describe('workbench task result contract', () => {
  const schema = cliResultSchemas['workbench task get']

  it('returns child discovery summaries and rejects full child task fields through the public CLI schema', () => {
    const child = { task_id: 'child-1', function_id: 'prompt', kind: 'prompt', title: 'Prompt', status: 'failed', session_id: 'session-child', execution_state: 'failed', error: { code: 'AGENT_FAILED', message: 'Execution failed' }, preset_id: 'prompt-preset', agent_model: { provider: 'provider', model: 'model' } }
    const result = { ...taskResult('experiment'), children: [child] }
    expect(Schema.resolve(result, schema, {})[0]).toEqual(result)
    for (const field of ['input', 'output_contract', 'artifacts', 'answers', 'binding_snapshot']) {
      expect(() => Schema.resolve({ ...result, children: [{ ...child, [field]: {} }] }, schema, {})).toThrow()
    }
  })

  it.each(allKinds)('preserves the declared %s result through the public CLI schema', kind => {
    const result = taskResult(kind)
    expect(Schema.resolve(result, schema, {})[0]).toEqual(result)
  })

  it.each(branchKinds)('requires the unresolved parameter object for %s', kind => {
    const result = taskResult(kind)
    delete result.unresolved_parameters
    expect(() => Schema.resolve(result, schema, {})).toThrow()
  })

  it.each(completeInputKinds)('rejects unresolved parameters in the complete %s input variant', kind => {
    expect(() => Schema.resolve({ ...taskResult(kind), unresolved_parameters: {} }, schema, {})).toThrow()
  })

  it.each(allKinds)('rejects internal parameter classification in the %s result', kind => {
    expect(() => Schema.resolve({ ...taskResult(kind), parameter_mapping: null }, schema, {})).toThrow()
  })

  it.each([null, [], 'raw parameter text'])('rejects a non-object unresolved parameter collection: %j', unresolved => {
    expect(() => Schema.resolve({ ...taskResult('prompt'), unresolved_parameters: unresolved }, schema, {})).toThrow()
  })

  it('rejects a task kind outside the declared result variants', () => {
    expect(() => Schema.resolve(taskResult('unknown_function'), schema, {})).toThrow()
  })
})

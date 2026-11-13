import { describe, expect, it, vi } from 'vitest'
import { assertSupportedJsonSchema, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { contracts, ContractError, type ContractId } from '#contracts'

const execution = () => ({ signal: new AbortController().signal }) as never
const fileReadResult = { file_path: '/tmp/prompt.txt', offset: 0, total_lines: 1, text: 'rain', next_offset: null }
const validationResult = { exit_code: 0, stdout: '', stderr: '', result: null, draft_path: null, output_path: null }
const receipt = { task_id: 'task-a', artifact_id: 'artifact-a', disposition: 'candidate' }

type NativeOperation = Extract<ContractId, `workbench_${string}`>

async function deliver<Id extends NativeOperation>(id: Id, input: unknown, output: unknown, expectedInput = input, expectedOutput = output) {
  const parsedInput = contracts.parse(id, 'input', input)
  expect(parsedInput).toEqual(expectedInput)
  expect(contracts.parse(id, 'output', output)).toEqual(expectedOutput)
  const handler = vi.fn(async (_args: unknown) => output)
  const tool = contracts.bind(id, 'native', { assertSchema: assertSupportedJsonSchema, execute: handler })
  expect(validateJsonSchemaValue(tool.parameters, parsedInput)).toEqual([])
  const result = await tool.execute(input, execution())
  expect(result).toEqual(expectedOutput)
  expect(validateJsonSchemaValue(tool.output.schema, result)).toEqual([])
  expect(handler.mock.calls).toHaveLength(1)
  expect(handler.mock.calls[0]?.[0]).toEqual(expectedInput)
  return result
}

const generation = { title: 'rain', instance_id: '1', template_id: '2', model: null, parameters: { width: 768 }, loras: [] }
const requestId = '01234567-89ab-4cde-8fab-0123456789ab'
const submission = { items: [{ request_id: requestId, request: generation }] }
const submitted = { items: [{ request_id: requestId, run_id: 'run-a', acceptance: 'accepted' }], runs: [] }
const media = { runs: [{ workspace_id: 'workspace-a', run_id: 'run-a', request_id: requestId, lookup_status: 'available', title: 'rain', status: 'succeeded', revision: 0, updated_at: 1, instance_id: null, prompt_id: null, run_error: null, images: [{ media_id: 'media-a', node_id: 'node-a', output_index: 0, filename: 'rain.png', media_type: 'image/png', file_path: '/tmp/rain.png' }] }] }

function nestedJson(depth: number): unknown {
  let value: unknown = 1
  for (let level = 0; level < depth; level += 1) value = { child: value }
  return value
}

describe('public contract value semantics', () => {
  it('preserves extra fields on an open discovery result through native delivery', async () => {
    const output = { task_id: 'task-a', functions: [], extension: { choices: [null, true, 12, { name: 'rain' }] } }
    await deliver('workbench_function_list', { task_id: 'task-a' }, output)
  })

  it('normalizes default arrays and optional scalar arguments before native handlers execute', async () => {
    const request = { task_id: 'task-a', function_id: 'function-a', instructions: '', source: { type: 'initial' } }
    const result = { task_id: 'task-b', parent_experiment_task_id: 'task-a', session_id: 'session-b', function_id: 'function-a', status: 'pending' }
    await deliver('workbench_function_delegate', request, result, { ...request, reference_artifact_ids: [] })
    await deliver('workbench_file_read', { file_path: '/tmp/prompt.txt' }, fileReadResult, { file_path: '/tmp/prompt.txt', offset: 0, limit: 160 })
    await deliver('workbench_prompt_validate', { skill_name: 'anima-prompt-builder', input: { values: [null, 'rain'] } }, { ...validationResult, result: { valid: true } }, { skill_name: 'anima-prompt-builder', input: { values: [null, 'rain'] }, help: false })
  })

  it('normalizes a missing persisted model to null and preserves absent image selections', () => {
    const request = { title: 'rain', instanceId: null, templateId: '2', parameters: {}, loras: [] }
    expect(contracts.parse('generationRequest', 'input', request)).toEqual({ ...request, model: null })
  })

  it('delivers nested dictionary values without adding absent Workflow parameter limits', async () => {
    const output = { parameters: [{ parameter_id: 'prompt', kind: 'positive_prompt', value_type: 'string', current_value: { values: [null, false, 0, 'rain', { nested: [] }] } }], size_candidates: [] }
    await deliver('workbench_workflow_parameters', { template_id: '2', instance_id: '1' }, output)
    await deliver('workbench_run_submit', submission, submitted)
    await deliver('workbench_run_media', { run_ids: ['run-a'] }, media, { run_ids: ['run-a'], include_parameters: false })
  })

  it('delivers available historical input with nullable result fields and optional model absence', async () => {
    const args = { title: 'rain', template_id: '2', parameters: { nested: { values: [null, true] } }, loras: [], image_refs: [], workflow_image_bindings: [] }
    const output = { runs: [{ run_id: 'run-a', lookup_status: 'available', workflow_status: 'unavailable', workspace_id: 'workspace-a', arguments: args, submitted_input: args, effective_input: null, image_uploads: [], input_description: null, workflow_error: { code: 'WORKFLOW_UNAVAILABLE', message: 'Select another run.' } }] }
    await deliver('workbench_run_inputs', { run_ids: ['run-a'] }, output)
  })

  it('validates image-reading, file-writing and experiment results through their registered contracts', async () => {
    await deliver('workbench_image_read', { file_path: '/tmp/rain.png', prompt: 'Describe the rain.' }, { provider: 'fixture', model: 'vision', file_path: '/tmp/rain.png', observation: 'Rain falls.' })
    await deliver('workbench_file_write', { file_path: '/tmp/prompt.txt', content: 'rain\n' }, { file_path: '/tmp/prompt.txt' })
    await deliver('workbench_experiment_end', { task_id: 'task-a', reason: 'goal_met' }, { task_id: 'task-a', control_state: 'completed', end_reason: 'goal_met', submitted_count: 1, max_runs: 2 })
  })

  it('delivers a fixed generation task with its nullable fields and explicit image defaults', async () => {
    const output = { task_id: 'task-a', parent_experiment_task_id: null, children: [], kind: 'run', status: 'running', selected_resources: [{ kind: 'model', id: '19', name: 'model.safetensors', fields: { base_model_id: '4', file_name: 'model.safetensors', description: null, usage: null, skill_name: null } }], generation_input: generation, prompt_input: { positive_prompt: null, negative_prompt: '' }, prompt_resource_refs: [], reference_task_ids: [], reference_run_ids: [], reference_task_artifacts: [], reference_experiences: [], image_refs: [], workflow_image_bindings: [], image_sources: [], base_model_id: null, requirements: { original_request: 'Rain falls.', instructions: '' }, requested_skill: null, max_runs: 1, output_contract: { artifact_types: ['generation_input'], required_artifact_types: [], parameter_ids: ['width'], apply_mode: 'automatic', requires_finished_runs: false }, artifacts: [], iterations: [], answers: [] }
    await deliver('workbench_task_get', { task_id: 'task-a' }, output)
  })

  it.each([
    { type: 'prompt', positive_prompt: 'rain', negative_prompt: null },
    { type: 'parameters', parameters: { width: 768, nested: [null, true] } },
    { type: 'generation_input', generation_input: generation, prompt_resource_refs: [], image_refs: [], workflow_image_bindings: [] },
    { type: 'iteration_plan', source_run_id: 'run-a', changes: ['Change the seed.'], reason: 'Compare composition.', expected_result: 'Another composition.' },
    { type: 'resources', refs: [{ kind: 'model', id: '90071992547409931234' }] },
    { type: 'review', observation: 'Rain is visible.', conclusion: 'The goal is met.', run_ids: ['run-a'] },
    { type: 'experience', title: 'Rain', conditions: 'Outdoor scene.', note: 'Use a rain prompt.', base_model_id: null, model_id: null, run_ids: ['run-a'] },
    { type: 'question', question: 'Which composition?', options: ['wide', 'portrait'] },
  ])('preserves the $type artifact discriminator through parsing and native publication', async artifact => {
    await deliver('workbench_task_publish', { task_id: 'task-a', artifact }, receipt)
  })

  it('rejects mixed artifact variants before their handler runs', async () => {
    const handler = vi.fn(async () => receipt)
    const tool = contracts.bind('workbench_task_publish', 'native', { assertSchema: assertSupportedJsonSchema, execute: handler })
    const invalid = { task_id: 'task-a', artifact: { type: 'question', question: 'Which?', options: [], parameters: {} } }
    expect(() => contracts.parse('workbench_task_publish', 'input', invalid)).toThrow(ContractError)
    await expect(tool.execute(invalid, execution())).rejects.toThrow(ContractError)
    expect(handler).not.toHaveBeenCalled()
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('rejects non-finite LoRA weights and nested JSON numbers: %s', async invalidNumber => {
    const tool = contracts.bind('workbench_run_submit', 'native', { assertSchema: assertSupportedJsonSchema, execute: async () => submitted })
    for (const request of [
      { ...generation, loras: [{ id: '3', file_name: 'rain.safetensors', weight: invalidNumber, trigger_words: [] }] },
      { ...generation, parameters: { nested: { value: invalidNumber } } },
    ]) {
      const invalid = { items: [{ request_id: requestId, request }] }
      expect(() => contracts.parse('workbench_run_submit', 'input', invalid)).toThrow(ContractError)
      await expect(tool.execute(invalid, execution())).rejects.toThrow(ContractError)
    }
  })

  it.each([-1, 0.5])('rejects non-natural media revisions before output delivery: %s', async revision => {
    const output = { runs: [{ ...media.runs[0], revision }] }
    expect(() => contracts.parse('workbench_run_media', 'output', output)).toThrow(ContractError)
    const tool = contracts.bind('workbench_run_media', 'native', { assertSchema: assertSupportedJsonSchema, execute: async () => output })
    await expect(tool.execute({ run_ids: ['run-a'] }, execution())).rejects.toThrow(ContractError)
  })

  it('enforces stable-ID and UUID formats before a submission handler runs', async () => {
    const handler = vi.fn(async () => submitted)
    const tool = contracts.bind('workbench_run_submit', 'native', { assertSchema: assertSupportedJsonSchema, execute: handler })
    for (const invalid of [
      { items: [{ request_id: 'not-a-uuid', request: generation }] },
      { items: [{ request_id: requestId, request: { ...generation, template_id: '0' } }] },
      { items: [{ request_id: requestId, request: { ...generation, instance_id: '1\\n' } }] },
    ]) {
      expect(() => contracts.parse('workbench_run_submit', 'input', invalid)).toThrow(ContractError)
      await expect(tool.execute(invalid, execution())).rejects.toThrow(ContractError)
    }
    expect(handler).not.toHaveBeenCalled()
  })

  it.each([null, true, 12.5, 'rain', [], { nested: [null, false, 3, 'rain', { values: [] }] }].map(value => ({ value })))('delivers every JSON value family inside the validator result: $value', async ({ value }) => {
    await deliver('workbench_prompt_validate', { skill_name: 'anima-prompt-builder', help: true }, { ...validationResult, result: value })
  })

  it('parses typed dictionaries without broadening their allowed value kind', () => {
    const draft = { instructions: '', generation_input: generation, prompt_input: { positive_prompt: null, negative_prompt: null }, parameter_mapping: { opaque_width: 'width' }, base_model_id: null, prompt_resource_refs: [], reference_task_ids: [], reference_run_ids: [], reference_experiences: [], image_refs: [], workflow_image_bindings: [] }
    expect(contracts.parse('taskDraft', 'input', draft)).toEqual(draft)
    expect(() => contracts.parse('taskDraft', 'input', { ...draft, parameter_mapping: { opaque_width: 'unsupported_kind' } })).toThrow(ContractError)
  })

  it('accepts finite LoRA weights without adding an undeclared sign restriction', async () => {
    const request = { ...generation, loras: [{ id: '3', file_name: 'rain.safetensors', weight: -2, trigger_words: ['rain'] }] }
    await deliver('workbench_run_submit', { items: [{ request_id: requestId, request }] }, submitted)
  })

  it('enforces numeric bounds on file-reading arguments at both ends', async () => {
    for (const limit of [1, 400]) await deliver('workbench_file_read', { file_path: '/tmp/prompt.txt', offset: 0, limit }, fileReadResult)
    const handler = vi.fn(async () => fileReadResult)
    const tool = contracts.bind('workbench_file_read', 'native', { assertSchema: assertSupportedJsonSchema, execute: handler })
    for (const limit of [0, 401, 1.5]) {
      expect(() => contracts.parse('workbench_file_read', 'input', { file_path: '/tmp/prompt.txt', limit })).toThrow(ContractError)
      await expect(tool.execute({ file_path: '/tmp/prompt.txt', limit }, execution())).rejects.toThrow(ContractError)
    }
    expect(handler).not.toHaveBeenCalled()
  })

  it('enforces run-query array bounds while accepting the upper boundary', async () => {
    const runIds = Array.from({ length: 20 }, (_, index) => `run-${index}`)
    await deliver('workbench_run_inputs', { run_ids: runIds }, { runs: [] })
    const handler = vi.fn(async () => ({ runs: [] }))
    const tool = contracts.bind('workbench_run_inputs', 'native', { assertSchema: assertSupportedJsonSchema, execute: handler })
    for (const run_ids of [[], [...runIds, 'run-20']]) {
      expect(() => contracts.parse('workbench_run_inputs', 'input', { run_ids })).toThrow(ContractError)
      await expect(tool.execute({ run_ids }, execution())).rejects.toThrow(ContractError)
    }
    expect(handler).not.toHaveBeenCalled()
  })

  it('accepts JSON depth 64 and rejects depth 65 through the submission boundary', async () => {
    const request = { ...generation, parameters: nestedJson(64) }
    await deliver('workbench_run_submit', { items: [{ request_id: requestId, request }] }, submitted)
    const invalid = { items: [{ request_id: requestId, request: { ...generation, parameters: nestedJson(65) } }] }
    expect(() => contracts.parse('workbench_run_submit', 'input', invalid)).toThrow(ContractError)
    const tool = contracts.bind('workbench_run_submit', 'native', { assertSchema: assertSupportedJsonSchema, execute: async () => submitted })
    await expect(tool.execute(invalid, execution())).rejects.toThrow(ContractError)
  })

  it('keeps required nullable prompt fields and rejects extra fields on exact requests', async () => {
    const request = { task_id: 'task-a', artifact: { type: 'prompt', positive_prompt: null, negative_prompt: 'rain' } }
    await deliver('workbench_task_publish', request, receipt)
    const tool = contracts.bind('workbench_task_publish', 'native', { assertSchema: assertSupportedJsonSchema, execute: async () => receipt })
    for (const invalid of [
      { ...request, extra: true },
      { task_id: 'task-a', artifact: { type: 'prompt', negative_prompt: '' } },
    ]) {
      expect(() => contracts.parse('workbench_task_publish', 'input', invalid)).toThrow(ContractError)
      await expect(tool.execute(invalid, execution())).rejects.toThrow(ContractError)
    }
  })
})


it.each([
  { id: 'workbench_file_read', input: { file_path: '/tmp/prompt.txt' } },
  { id: 'workbench_file_write', input: { file_path: '/tmp/prompt.txt', content: 'rain' } },
  { id: 'workbench_prompt_validate', input: { skill_name: 'anima-prompt-builder', help: true } },
] as const)('rejects missing required output fields before $id delivers a result', async ({ id, input }) => {
  const tool = contracts.bind(id, 'native', { assertSchema: assertSupportedJsonSchema, execute: async () => ({}) })
  await expect(tool.execute(input, execution())).rejects.toThrow(ContractError)
})

import { contracts, ContractError } from '#contracts'

import { WORKBENCH_FUNCTIONS, TASK_KINDS } from '../../src/workbench/functions.js'
import { describe, expect, it } from 'vitest'
import { taskDraftFromRunInput, WorkbenchError } from '../../src/workbench/validation.js'

const input = { prompt_resource_refs: [], parameter_mapping: null, prompt_input: { positive_prompt: '', negative_prompt: '' }, generation_input: { title: 'test', instance_id: null, template_id: null, model: null, parameters: {}, loras: [] }, reference_task_ids: [], reference_task_artifacts: [], reference_experiences: [], image_refs: [], workflow_image_bindings: [], base_model_id: null, requirements: { original_request: 'a scene', instructions: '' }, reference_run_ids: [], requested_skill: null, max_runs: 0 }

describe('workbench shared validation', () => {
  it('accepts a generation input artifact without a plan reference and preserves explicit plan references', () => {
    const generationInput = { ...input.generation_input, instance_id: '1', template_id: '2' }
    const request = { task_id: 'task-a', artifact: { type: 'generation_input', generation_input: generationInput } }
    expect(contracts.parse('taskPublishRequest', 'output', request).artifact).not.toHaveProperty('plan_artifact_id')
    for (const plan_artifact_id of [null, 'plan-a']) {
      expect(contracts.parse('taskPublishRequest', 'output', { ...request, artifact: { ...request.artifact, plan_artifact_id } }).artifact).toHaveProperty('plan_artifact_id', plan_artifact_id)
    }
  })
  it.each(TASK_KINDS)('validates the %s task input contract', kind => {
    const evaluation = ['review', 'compare', 'diagnose', 'experience'].includes(kind)
    const value = { ...input, generation_input: { ...input.generation_input, instance_id: '1', template_id: '2' }, max_runs: kind === 'run' ? 1 : kind === 'experiment' ? 3 : 0, reference_run_ids: evaluation ? ['run-a', 'run-b'] : [], ...(evaluation ? { evaluation_input: { run_id: 'run-a', verdict: 'unrated', observation: '', conclusion: '', experience: { title: '', conditions: '', note: '' } } } : {}) }
    expect(contracts.parse('taskInputForKind', 'input', { kind: kind, value: value })).toEqual(value)
    expect(() => contracts.parse('taskInputForKind', 'input', { kind: kind, value: { ...value, max_runs: kind === 'run' ? 2 : kind === 'experiment' ? 0 : 1 } })).toThrow(ContractError)
  })

  it('shares publish schemas and preserves large decimal resource ids', () => {
    const request = { task_id: 'task-a', artifact: { type: 'resources', refs: [{ kind: 'model', id: '900719925474099312345' }, { kind: 'lora', id: '2' }, { kind: 'comfyui-template', id: '3' }] } }
    expect(contracts.parse('taskArtifact', 'input', request.artifact)).toEqual(request.artifact)
    expect(contracts.parse('taskPublishRequest', 'output', request)).toEqual(request)
    expect(() => contracts.parse('taskPublishRequest', 'output', { ...request, surprise: true })).toThrow()
    expect(contracts.parse('taskGetRequest', 'output', { task_id: 'task-a' })).toEqual({ task_id: 'task-a' })
    expect(contracts.parse('taskPublishReceipt', 'output', { task_id: 'task-a', artifact_id: 'artifact-a', disposition: 'candidate' })).toHaveProperty('disposition', 'candidate')
    expect(() => contracts.parse('taskArtifact', 'input', { type: 'prompt', positive_prompt: 'text', negative_prompt: '', parameters: {} })).toThrow(ContractError)
  })

  it('returns task inputs without evaluation fields and accepts reviews without candidate inputs', () => {
    const { parameter_mapping, ...publicInput } = input
    const task = { task_id: 'task-a', parent_experiment_task_id: null, children: [], kind: 'prompt', status: 'running', ...publicInput, unresolved_parameters: {}, output_contract: { artifact_types: ['prompt'], required_artifact_types: ['prompt'], parameter_ids: [], apply_mode: 'automatic', requires_finished_runs: false }, artifacts: [], iterations: [], answers: [] }
    const result = contracts.parse('taskGetResult', 'output', task)
    expect(result).toMatchObject({ task_id: 'task-a', kind: 'prompt', max_runs: 0 })
    expect(result.evaluation_input).toBeUndefined()
    const review = { task_id: 'task-review', artifact: { type: 'review', observation: 'rain visible', conclusion: 'goal met', run_ids: ['run-a'] } }
    expect(contracts.parse('taskPublishRequest', 'output', review)).toEqual(review)
  })

  it('validates nested JSON parameters and rejects malformed resource and generation fields', () => {
    expect(contracts.parse('generationInput', 'input', { ...input.generation_input, parameters: { custom: { choices: ['rain', 1, true, null] } } }).parameters.custom).toEqual({ choices: ['rain', 1, true, null] })
    expect(contracts.parse('taskArtifact', 'input', { type: 'resources', refs: [{ kind: 'model', id: '90071992547409931234' }] })).toEqual({ type: 'resources', refs: [{ kind: 'model', id: '90071992547409931234' }] })
    for (const invalid of [null, [], { ...input.generation_input, model: { id: 3, file_name: '' } }, { ...input.generation_input, parameters: { seed: Number.NaN } }, { ...input.generation_input, loras: [{ id: '0', file_name: '', weight: Infinity, trigger_words: [1] }] }, { ...input.generation_input, surprise: true }]) expect(() => contracts.parse('generationInput', 'input', invalid)).toThrow(ContractError)
    expect(() => contracts.parse('taskArtifact', 'input', { type: 'resources', refs: [{ kind: 'unknown-resource', id: '1' }] })).toThrow(ContractError)
    expect(() => contracts.parse('taskArtifact', 'input', { type: 'resources', refs: [{ kind: 'model', id: '1' }, { kind: 'model', id: '1' }] })).toThrow(ContractError)
    expect(() => contracts.parse('taskArtifact', 'input', { type: 'question', question: '', options: [] })).toThrow(ContractError)
  })

  it.each(['image_refs', 'workflow_image_bindings'])('rejects nested %s in saved drafts, fixed inputs and published candidates', field => {
    const nested = { ...input.generation_input, instance_id: '1', template_id: '2', [field]: [] }
    const { requirements, reference_task_artifacts, requested_skill, max_runs, ...saved } = input
    const draft = { ...saved, instructions: '', generation_input: nested }
    expect(() => contracts.parse('taskDraft', 'input', draft)).toThrow(ContractError)
    expect(() => contracts.parse('taskDraft', 'output', draft)).toThrow()
    expect(() => contracts.parse('taskInputForKind', 'input', { kind: 'run', value: { ...input, generation_input: nested, max_runs: 1 } })).toThrow(ContractError)
    for (const artifact of [
      { type: 'generation_input', generation_input: nested, image_refs: [], workflow_image_bindings: [] },
      { type: 'review', observation: 'Inspect result', conclusion: 'Try another image', run_ids: ['run-a'], candidate: { generation_input: nested, image_refs: [], workflow_image_bindings: [] } },
    ]) {
      expect(() => contracts.parse('taskArtifact', 'input', artifact)).toThrow(ContractError)
      expect(() => contracts.parse('taskPublishRequest', 'output', { task_id: 'task-a', artifact })).toThrow()
    }
    expect(contracts.parse('generationInput', 'input', nested)).toEqual(nested)
  })

  it.each([null, { reference_image: 'reference_image' as const, width: 'width' as const }])('restores uploaded Run images without retaining instance filenames in editable parameters: %j', parameter_mapping => {
    const image = { image_ref_id: 'image-a', source: { kind: 'uploaded_file' as const, file_id: 'file-a' }, purpose: 'both' as const, reference_requirement: 'Use the composition' }
    const generation = { ...input.generation_input, instance_id: '1', template_id: '2', parameters: { reference_image: 'previous-upload.png', width: 768 } }
    const restored = taskDraftFromRunInput({ run_id: 'run-image', branch_id: 'branch-image', submitted_input: { ...generation, parameters: { width: 768 } }, effective_input: generation, generation_input: generation,
      image_uploads: [{ image_ref_id: 'image-a', parameter_id: 'reference_image', instance_id: '1', name: 'previous-upload.png', subfolder: '', type: 'input' }],
      image_refs: [image], workflow_image_bindings: [{ parameter_id: 'reference_image', image_ref_ids: ['image-a'] }], parameter_mapping, base_model_id: '1', prompt_input: { positive_prompt: null, negative_prompt: null }, input_description: null,
    })
    expect(restored.generation_input.parameters).toEqual({ width: 768 })
    expect(restored.image_refs).toEqual([image])
    expect(restored.workflow_image_bindings).toEqual([{ parameter_id: 'reference_image', image_ref_ids: ['image-a'] }])
    const removed = contracts.parse('taskDraft', 'input', { ...restored, image_refs: [], workflow_image_bindings: [] })
    expect(removed.generation_input.parameters).toEqual({ width: 768 })
  })

  it('accepts prompt input with unselected generation resources and reports the exact invalid resource path', () => {
    expect(contracts.parse('taskInputForKind', 'input', { kind: 'prompt', value: input })).toEqual(input)
    const { prompt_resource_refs: _refs, ...legacy } = input
    expect(contracts.parse('taskInputForKind', 'input', { kind: 'prompt', value: legacy })).toEqual(input)
    expect(() => contracts.parse('taskInputForKind', 'input', { kind: 'run', value: { ...input, max_runs: 1 } })).toThrow(ContractError)
    try { contracts.parse('taskArtifact', 'input', { type: 'resources', refs: [{ kind: 'character', id: '1e3' }] }) }
    catch (error) { expect((error as ContractError).issues).toContainEqual({ path: '$.refs[0].id', message: expect.stringMatching(/regexp|1e3/u) }) }
  })
})

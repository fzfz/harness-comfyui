import Schema from '@deepseek-ai/schemastery'
import { taskGetRequestSchema, taskGetResultSchema, taskPublishRequestSchema, taskPublishReceiptSchema, taskDraftSchema } from '../../src/workbench/schema.js'
import { WORKBENCH_FUNCTIONS } from '../../src/workbench/functions.js'
import type { TaskKind } from '../../src/workbench/contract.js'
import { describe, expect, it } from 'vitest'
import { validateArtifact, validateTaskDraft, validateTaskInput, validateGenerationInput, taskDraftFromRunInput, WorkbenchError } from '../../src/workbench/validation.js'

const input = { parameter_mapping: null, prompt_input: { positive_prompt: '', negative_prompt: '' }, generation_input: { title: 'test', instance_id: null, template_id: null, model: null, parameters: {}, loras: [] }, reference_task_ids: [], reference_task_artifacts: [], reference_experiences: [], image_refs: [], workflow_image_bindings: [], base_model_id: null, requirements: { original_request: 'a scene', instructions: '' }, reference_run_ids: [], requested_skill: null, max_runs: 0 }

describe('workbench shared validation', () => {
  it.each(['prompt', 'rewrite', 'parameters', 'resources', 'review', 'compare', 'diagnose', 'experience', 'run', 'experiment'] as TaskKind[])('validates the %s task input contract', kind => {
    const evaluation = ['review', 'compare', 'diagnose', 'experience'].includes(kind)
    const value = { ...input, generation_input: { ...input.generation_input, instance_id: '1', template_id: '2' }, max_runs: kind === 'run' ? 1 : kind === 'experiment' ? 3 : 0, reference_run_ids: evaluation ? ['run-a', 'run-b'] : [], ...(evaluation ? { evaluation_input: { run_id: 'run-a', verdict: 'unrated', observation: '', conclusion: '', experience: { title: '', conditions: '', note: '' } } } : {}) }
    expect(validateTaskInput(kind, value)).toEqual(value)
    expect(() => validateTaskInput(kind, { ...value, max_runs: kind === 'run' ? 2 : kind === 'experiment' ? 0 : 1 })).toThrow(WorkbenchError)
  })

  it('shares publish schemas and preserves large decimal resource ids', () => {
    const request = { task_id: 'task-a', artifact: { type: 'resources', refs: [{ kind: 'model', id: '900719925474099312345' }, { kind: 'lora', id: '2' }, { kind: 'comfyui-template', id: '3' }] } }
    expect(validateArtifact(request.artifact)).toEqual(request.artifact)
    expect(Schema.resolve(request, taskPublishRequestSchema, {})[0]).toEqual(request)
    expect(() => Schema.resolve({ ...request, surprise: true }, taskPublishRequestSchema, {})).toThrow()
    expect(Schema.resolve({ task_id: 'task-a' }, taskGetRequestSchema, {})[0]).toEqual({ task_id: 'task-a' })
    expect(Schema.resolve({ task_id: 'task-a', artifact_id: 'artifact-a', disposition: 'candidate' }, taskPublishReceiptSchema, {})[0]).toHaveProperty('disposition', 'candidate')
    expect(() => validateArtifact({ type: 'prompt', positive_prompt: 'text', negative_prompt: '', parameters: {} })).toThrow(WorkbenchError)
  })

  it('returns task inputs without evaluation fields and accepts reviews without candidate inputs', () => {
    const { parameter_mapping, ...publicInput } = input
    const task = { task_id: 'task-a', kind: 'prompt', status: 'running', ...publicInput, unresolved_parameters: {}, output_contract: { artifact_types: ['prompt'], required_artifact_types: ['prompt'], parameter_ids: [], apply_mode: 'automatic', requires_finished_runs: false }, artifacts: [], iterations: [], answers: [] }
    const result = Schema.resolve(task, taskGetResultSchema, {})[0]
    expect(result).toMatchObject({ task_id: 'task-a', kind: 'prompt', max_runs: 0 })
    expect(result.evaluation_input).toBeUndefined()
    const review = { task_id: 'task-review', artifact: { type: 'review', observation: 'rain visible', conclusion: 'goal met', run_ids: ['run-a'] } }
    expect(Schema.resolve(review, taskPublishRequestSchema, {})[0]).toEqual(review)
  })

  it('validates nested JSON parameters and rejects malformed resource and generation fields', () => {
    expect(validateGenerationInput({ ...input.generation_input, parameters: { custom: { choices: ['rain', 1, true, null] } } }).parameters.custom).toEqual({ choices: ['rain', 1, true, null] })
    expect(validateArtifact({ type: 'resources', refs: [{ kind: 'model', id: '90071992547409931234' }] })).toEqual({ type: 'resources', refs: [{ kind: 'model', id: '90071992547409931234' }] })
    for (const invalid of [null, [], { ...input.generation_input, model: { id: 3, file_name: '' } }, { ...input.generation_input, parameters: { seed: Number.NaN } }, { ...input.generation_input, loras: [{ id: '0', file_name: '', weight: Infinity, trigger_words: [1] }] }, { ...input.generation_input, surprise: true }]) expect(() => validateGenerationInput(invalid)).toThrow(WorkbenchError)
    expect(() => validateArtifact({ type: 'resources', refs: [{ kind: 'character', id: '1' }] })).toThrow(WorkbenchError)
    expect(() => validateArtifact({ type: 'resources', refs: [{ kind: 'model', id: '1' }, { kind: 'model', id: '1' }] })).toThrow(WorkbenchError)
    expect(() => validateArtifact({ type: 'question', question: '', options: [] })).toThrow(WorkbenchError)
  })

  it.each(['image_refs', 'workflow_image_bindings'])('rejects nested %s in saved drafts, fixed inputs and published candidates', field => {
    const nested = { ...input.generation_input, instance_id: '1', template_id: '2', [field]: [] }
    const { requirements, reference_task_artifacts, requested_skill, max_runs, ...saved } = input
    const draft = { ...saved, instructions: '', generation_input: nested }
    expect(() => validateTaskDraft(draft)).toThrow(WorkbenchError)
    expect(() => Schema.resolve(draft, taskDraftSchema, {})).toThrow()
    expect(() => validateTaskInput('run', { ...input, generation_input: nested, max_runs: 1 })).toThrow(WorkbenchError)
    for (const artifact of [
      { type: 'generation_input', generation_input: nested, image_refs: [], workflow_image_bindings: [] },
      { type: 'review', observation: 'Inspect result', conclusion: 'Try another image', run_ids: ['run-a'], candidate: { generation_input: nested, image_refs: [], workflow_image_bindings: [] } },
    ]) {
      expect(() => validateArtifact(artifact)).toThrow(WorkbenchError)
      expect(() => Schema.resolve({ task_id: 'task-a', artifact }, taskPublishRequestSchema, {})).toThrow()
    }
    expect(validateGenerationInput(nested)).toEqual(nested)
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
    const removed = validateTaskDraft({ ...restored, image_refs: [], workflow_image_bindings: [] })
    expect(removed.generation_input.parameters).toEqual({ width: 768 })
  })

  it('accepts prompt input with unselected generation resources and reports the exact invalid resource path', () => {
    expect(validateTaskInput('prompt', input)).toEqual(input)
    expect(() => validateTaskInput('run', { ...input, max_runs: 1 })).toThrow(WorkbenchError)
    try { validateArtifact({ type: 'resources', refs: [{ kind: 'character', id: '1e3' }] }) }
    catch (error) { expect((error as WorkbenchError).issues).toContainEqual({ path: 'artifact.refs.0.id', message: '请填写正整数十进制字符串。' }) }
  })
})

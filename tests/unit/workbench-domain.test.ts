import Schema from '@deepseek-ai/schemastery'
import { taskGetRequestSchema, taskGetResultSchema, taskPublishRequestSchema, taskPublishReceiptSchema } from '../../src/workbench/schema.js'
import { WORKBENCH_FUNCTIONS } from '../../src/workbench/functions.js'
import type { TaskKind } from '../../src/workbench/contract.js'
import { describe, expect, it } from 'vitest'
import { validateArtifact, validateTaskInput, validateGenerationInput, validateContextRefs, WorkbenchError } from '../../src/workbench/validation.js'

const input = { parameter_mapping: null, prompt_input: { positive_prompt: '', negative_prompt: '' }, generation_input: { title: 'test', instance_id: null, template_id: null, model: null, parameters: {}, loras: [] }, context_refs: [], base_model_id: null, requirements: { original_request: 'a scene', instructions: '' }, reference_run_ids: [], requested_skill: null, max_runs: 0 }

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
    expect(validateContextRefs([{ kind: 'character', id: '90071992547409931234' }])).toEqual([{ kind: 'character', id: '90071992547409931234' }])
    for (const invalid of [null, [], { ...input.generation_input, model: { id: 3, file_name: '' } }, { ...input.generation_input, parameters: { seed: Number.NaN } }, { ...input.generation_input, loras: [{ id: '0', file_name: '', weight: Infinity, trigger_words: [1] }] }, { ...input.generation_input, surprise: true }]) expect(() => validateGenerationInput(invalid)).toThrow(WorkbenchError)
    expect(() => validateContextRefs([{ kind: 'model', id: '1' }])).toThrow(WorkbenchError)
    expect(() => validateContextRefs([{ kind: 'character', id: '1' }, { kind: 'character', id: '1' }])).toThrow(WorkbenchError)
    expect(() => validateArtifact({ type: 'question', question: '', options: [] })).toThrow(WorkbenchError)
  })

  it('accepts prompt input with unselected generation resources and reports the exact invalid resource path', () => {
    expect(validateTaskInput('prompt', input)).toEqual(input)
    expect(() => validateTaskInput('run', { ...input, max_runs: 1 })).toThrow(WorkbenchError)
    try { validateArtifact({ type: 'resources', refs: [{ kind: 'character', id: '1e3' }] }) }
    catch (error) { expect((error as WorkbenchError).issues).toContainEqual({ path: 'artifact.refs.0.id', message: '请填写正整数十进制字符串。' }) }
  })
})

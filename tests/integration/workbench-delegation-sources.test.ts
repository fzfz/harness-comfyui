import { contracts } from '#contracts'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'

import type { GenerationPreparationAdapter, GenerationTransport } from '../../src/host/generation/generation-runtime.ts'
import type { WorkflowRuntimeParameterInspection } from '../../src/generation/inspection-contract.ts'
import { createWorkbenchHostFixture } from '../support/workbench-host.ts'
import { saveFixtureDraft } from '../support/workbench-draft.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function fixture(withExperience = false) {
  const descriptions: Record<string, WorkflowRuntimeParameterInspection> = {
    '5': { parameters: [
      { parameter_id: 'positive', kind: 'positive_prompt', value_type: 'string', current_value: '' },
      { parameter_id: 'negative', kind: 'negative_prompt', value_type: 'string', current_value: '' },
      { parameter_id: 'seed', kind: 'seed', value_type: 'integer', current_value: 17 },
    ], size_candidates: [] },
    '6': { parameters: [
      { parameter_id: 'sunlight', kind: 'positive_prompt', value_type: 'string', current_value: '' },
      { parameter_id: 'unwanted', kind: 'negative_prompt', value_type: 'string', current_value: '' },
      { parameter_id: 'iterations', kind: 'steps', value_type: 'integer', current_value: 20 },
    ], size_candidates: [] },
  }
  const preparer: GenerationPreparationAdapter = {
    inspectRuntimeParameters: async ({ templateId }) => structuredClone(descriptions[templateId]!),
    validateInput: async () => {},
    prepare: async request => ({
      instanceId: request.instanceId!, instanceTitle: 'Controlled node', templateTitle: `Template ${request.templateId}`, sourceSnapshot: {},
      inputDescription: { ...descriptions[request.templateId]!, parameters: descriptions[request.templateId]!.parameters.map(parameter => ({ ...parameter, current_value: request.parameters[parameter.parameter_id] ?? parameter.current_value })) },
      actualWorkflow: {}, apiWorkflow: {}, expectedOutputNodeIds: [],
      connection: { origin: 'http://comfy.test', url: 'http://comfy.test', authorization: null },
    }),
  }
  const transport: GenerationTransport = {
    submit: async input => { input.onRequestStart(); return { promptId: input.promptId } },
    observe: async () => ({ status: 'error', outputs: [], error: { code: 'CONTROLLED_FAILURE', message: 'Controlled run failure' } }),
    download: async () => { throw new Error('The failed run has no media') },
  }
  const host = await createWorkbenchHostFixture(preparer, transport)
  cleanups.push(host.dispose)
  host.catalog.resolveGenerationModel.mockImplementation(async id => ({ id, file_name: id === '10' ? 'target.safetensors' : 'paint.safetensors', base_model_id: id === '10' ? '9' : '1' }))
  const signal = new AbortController().signal
  const selected = await host.remote.mutate({ workspaceId: 'workspace_1', type: 'new-work', value: { name: 'Source snapshots', goal: 'Warm glass' } }, signal)
  await saveFixtureDraft(host.remote, selected, draft => { draft.generation_input.instance_id = '8' }, signal)
  for (const value of [{ kind: 'model', id: '2' }, { kind: 'comfyui-template', id: '5' }]) await host.remote.mutate({ ...selected, type: 'resource-select', value }, signal)
  await host.remote.mutate({ ...selected, type: 'update-execution', field: 'max_runs', value: 3 }, signal)
  await saveFixtureDraft(host.remote, selected, draft => { draft.prompt_input.positive_prompt = 'Initial glass prompt' }, signal)
  if (withExperience) {
    const experience = host.store.saveExperience({ title: 'Glass lighting', conditions: 'Warm glass', note: 'Retain the bright rim.' })
    await saveFixtureDraft(host.remote, selected, draft => { draft.reference_experiences = [{ experience_id: experience.experience_id, title: experience.title, conditions: experience.conditions, note: experience.note, provenance: experience.provenance }] }, signal)
  }
  const receipt = await host.remote.mutate({ ...selected, type: 'experiment' }, signal)
  const parent = host.store.getTask(receipt.taskId!)
  const start = vi.fn(async (spec: { childId: string }) => {
    const parentAgent = host.official.agents.get(parent.session_id!)!
    const session = { header: { ...parentAgent.session.header }, snapshotEvents: () => host.official.events.get(spec.childId) ?? [] }
    host.official.sessions.set(spec.childId, session)
    host.official.agents.set(spec.childId, { status: 'running', session, ctx: parentAgent.ctx })
    host.descendants.set(parent.session_id!, [...host.descendants.get(parent.session_id!) ?? [], { id: spec.childId, mode: 'spawn' }])
    return { childId: spec.childId, result: Promise.resolve({ stopReason: 'completed' }), dispose: async () => {} }
  })
  const resume = vi.fn(async () => ({ accepted: true }))
  Object.assign(host.ctx.subagents, { startActivation: start, resolveMaxDepth: () => 1, prompt: resume })
  const service = host.ctx.harnessComfyuiWorkbench.service
  const identity = { workspaceId: 'workspace_1', sessionId: parent.session_id!, turn: 1, callId: randomUUID() }
  const delegate = (function_id: string, source: { type: 'initial' } | { type: 'candidate'; artifact_id: string } | { type: 'run'; run_id: string }, reference_artifact_ids: string[] = []) => service.delegateFunction({ task_id: parent.task_id, function_id, instructions: 'Keep the warm glass', source, reference_artifact_ids }, identity)
  return { ...host, selected, parent, service, identity, delegate, start, resume }
}

it('uses the adopted candidate model and saved template mapping when delegating review of the later Run', async () => {
  const f = await fixture()
  const run = async (taskId: string, sessionId: string) => {
    const input = f.store.getTask(taskId).input.generation_input
    const accepted = await f.runtime.acceptGenerations({ ...f.identity, sessionId }, [{ requestId: randomUUID(), request: contracts.parse('runtimeGenerationRequest', 'input', { ...input, instance_id: input.instance_id!, template_id: input.template_id! }) }], undefined, taskId)
    for (let step = 0; step < 5; step += 1) await f.runtime.advance()
    return accepted.items[0]!.runId
  }
  const first = await f.delegate('run', { type: 'initial' })
  const sourceRunId = await run(first.task_id, first.session_id)
  await f.service.publish({ taskId: f.parent.task_id, artifact: { type: 'review', observation: 'Template failed', conclusion: 'Change the model and template', run_ids: [sourceRunId] } }, f.identity)
  const plan = await f.service.publish({ taskId: f.parent.task_id, artifact: { type: 'iteration_plan', source_run_id: sourceRunId, changes: ['Select model 10 and template 6'], reason: 'Use the target model', expected_result: 'Warm sunlight' } }, { ...f.identity, callId: randomUUID() })
  const generationInput = { ...f.parent.input.generation_input, template_id: '6', model: { id: '10', file_name: 'target.safetensors' }, parameters: { sunlight: 'Later sunlight', unwanted: 'blur', iterations: 32 } }
  const candidate = await f.service.publish({ taskId: f.parent.task_id, artifact: { type: 'generation_input', generation_input: generationInput, plan_artifact_id: plan.artifact_id } }, { ...f.identity, callId: randomUUID() })
  const second = await f.delegate('run', { type: 'candidate', artifact_id: candidate.artifact_id })
  const laterRunId = await run(second.task_id, second.session_id)
  const review = await f.delegate('review', { type: 'run', run_id: laterRunId })
  const input = await f.service.getTask({ taskId: review.task_id }, f.identity)
  expect(input.generation_input).toMatchObject(generationInput)
  expect(input.prompt_input).toEqual({ positive_prompt: 'Later sunlight', negative_prompt: 'blur' })
  expect(input.base_model_id).toBe('9')
  expect(input.evaluation_input?.run_id).toBe(laterRunId)
  expect(f.store.getRun(laterRunId)).toMatchObject({ workbench_task_id: f.parent.task_id, execution_task_id: second.task_id, candidate_artifact_id: candidate.artifact_id, iteration_index: 2 })
})

it('resolves candidate model classification and template prompts while freezing explicit child artifact references', async () => {
  const f = await fixture()
  const promptTask = await f.delegate('prompt', { type: 'initial' })
  const reference = await f.service.publish({ taskId: promptTask.task_id, artifact: { type: 'prompt', positive_prompt: 'Warm rim light', negative_prompt: null } }, { ...f.identity, sessionId: promptTask.session_id, callId: randomUUID() })
  const generationInput = { ...f.parent.input.generation_input, template_id: '6', model: { id: '10', file_name: 'target.safetensors' }, parameters: { sunlight: 'New mapped sunlight', unwanted: 'blur', iterations: 28 } }
  const candidate = await f.service.publish({ taskId: f.parent.task_id, artifact: { type: 'generation_input', generation_input: generationInput } }, f.identity)
  const delegated = await f.delegate('prompt', { type: 'candidate', artifact_id: candidate.artifact_id }, [reference.artifact_id])
  const child = f.store.getTask(delegated.task_id)
  expect(child.input.generation_input).toEqual(generationInput)
  expect(child.input.prompt_input).toEqual({ positive_prompt: 'New mapped sunlight', negative_prompt: 'blur' })
  expect(child.input.parameter_mapping).toEqual({ sunlight: 'positive_prompt', unwanted: 'negative_prompt', iterations: 'steps' })
  expect(child.input.reference_task_artifacts).toEqual([{ task_id: promptTask.task_id, artifact_id: reference.artifact_id, artifact: { type: 'prompt', positive_prompt: 'Warm rim light', negative_prompt: null } }])
  expect(f.parent.input.base_model_id).toBe('1')
  expect(child.input.base_model_id).toBe('9')
  const parameters = await f.delegate('parameters', { type: 'candidate', artifact_id: candidate.artifact_id })
  const parameterTask = f.store.getTask(parameters.task_id)
  expect(parameterTask.output_contract.parameter_ids).toEqual(['iterations'])
  const parameterInput = await f.service.getTask({ taskId: parameters.task_id }, f.identity)
  expect(parameterInput.generation_input.parameters).toEqual({ iterations: 28 })
  expect(parameterInput.base_model_id).toBe('9')
})

it('keeps the experiment experience snapshot when its shared library record changes before delegation', async () => {
  const f = await fixture(true)
  const reference = f.parent.input.reference_experiences[0]!
  f.store.saveExperience({ experienceId: reference.experience_id, title: 'Later title', conditions: 'Later conditions', note: 'Later note' })
  const delegated = await f.delegate('prompt', { type: 'initial' })
  const child = f.store.getTask(delegated.task_id)
  expect(child.input.reference_experiences).toEqual([reference])
  expect(f.store.listPromptTurns(child.task_id)[0]!.input.reference_context.experiences).toEqual([reference])
})

it('records the prompt child reply in the parent experiment after the official child session is released', async () => {
  const f = await fixture()
  const delegated = await f.delegate('prompt', { type: 'initial' })
  const child = f.store.getTask(delegated.task_id)
  expect(child.request_text).toContain('Warm glass')
  expect(child.request_text).toContain('Source base')
  f.official.events.set(delegated.session_id, [
    { seq: 0, type: 'turn/start', data: { turn: 1 } },
    { seq: 1, type: 'assistant/message', data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '{"type":"prompt","positive_prompt":"warm glass, reflected light","negative_prompt":""}' }] } } },
    { seq: 2, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ] as unknown as import('@deepseek-ai/dsh-session').SessionEvent[])
  f.official.agents.delete(delegated.session_id)
  await f.ctx.harnessComfyuiWorkbench.prompts.handleSessionEvents(delegated.session_id)
  const parent = await f.service.getTask({ taskId: f.parent.task_id }, f.identity)
  expect(parent.children).toContainEqual(expect.objectContaining({ task_id: child.task_id, status: 'succeeded', session_id: delegated.session_id }))
  expect(parent.artifacts).toContainEqual(expect.objectContaining({ task_id: child.task_id, disposition: 'recorded', artifact: { type: 'prompt', positive_prompt: 'warm glass, reflected light', negative_prompt: '' } }))
  expect(f.store.getBranch(child.branch_id).draft.prompt_input.positive_prompt).toBe('Initial glass prompt')
})

it('returns child questions, answers, artifact owners and run executors through the parent task interface', async () => {
  const f = await fixture()
  const prompt = await f.delegate('resources', { type: 'initial' })
  const childIdentity = { ...f.identity, sessionId: prompt.session_id, callId: randomUUID() }
  const question = await f.service.publish({ taskId: prompt.task_id, artifact: { type: 'question', question: 'Which glass?', options: ['Clear', 'Blue'] } }, childIdentity)
  const waiting = await f.service.getTask({ taskId: f.parent.task_id }, f.identity)
  expect(waiting.status).toBe('waiting_input')
  expect(waiting.children).toContainEqual(expect.objectContaining({ task_id: prompt.task_id, status: 'waiting_input' }))
  expect(waiting.artifacts).toContainEqual(expect.objectContaining({ task_id: prompt.task_id, artifact_id: question.artifact_id }))
  await f.service.replyTask({ taskId: prompt.task_id, questionArtifactId: question.artifact_id, answer: 'Blue' })
  const answered = await f.service.getTask({ taskId: f.parent.task_id }, f.identity)
  expect(answered.answers).toContainEqual({ question_artifact_id: question.artifact_id, answer: 'Blue' })
  expect(answered.status).not.toBe('waiting_input')
  expect(f.resume).toHaveBeenCalledOnce()
  const executor = await f.delegate('run', { type: 'initial' })
  const accepted = await f.runtime.acceptGenerations({ ...f.identity, sessionId: executor.session_id }, [{ requestId: randomUUID(), request: contracts.parse('runtimeGenerationRequest', 'input', { ...f.parent.input.generation_input, instance_id: '8', template_id: '5' }) }], undefined, executor.task_id)
  const runId = accepted.items[0]!.runId
  for (let step = 0; step < 5; step += 1) await f.runtime.advance()
  const reviewer = await f.delegate('review', { type: 'run', run_id: runId }, [question.artifact_id])
  const fixed = f.store.getTask(reviewer.task_id)
  expect(fixed.input.prompt_input).toEqual({ positive_prompt: 'Initial glass prompt', negative_prompt: '' })
  expect(fixed.input.evaluation_input?.run_id).toBe(runId)
  expect(fixed.input.reference_run_ids).toContain(runId)
  expect(fixed.input.reference_task_artifacts[0]).toMatchObject({ task_id: prompt.task_id, artifact_id: question.artifact_id })
  const parent = await f.service.getTask({ taskId: f.parent.task_id }, f.identity)
  expect(parent.iterations).toContainEqual(expect.objectContaining({ run_id: runId, execution_task_id: executor.task_id }))
  expect(parent.children).toContainEqual(expect.objectContaining({ task_id: reviewer.task_id, function_id: 'review' }))
  expect(f.store.getProjection({ workspaceId: 'workspace_1' }).runs).toHaveLength(1)
})

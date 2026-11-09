import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { toGenerationRequest } from '../../src/cli/contract.ts'
import type { GenerationPreparationAdapter, GenerationTransport } from '../../src/host/generation/generation-runtime.ts'
import type { GenerationInput } from '../../src/workbench/contract.ts'
import { createWorkbenchHostFixture } from '../support/workbench-host.ts'

const cleanups: (() => Promise<void>)[] = []
const signal = () => new AbortController().signal
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function controlledGeneration(fails: () => boolean = () => false): { preparer: GenerationPreparationAdapter; transport: GenerationTransport } {
  const description = { parameters: [
    { parameter_id: 'positive', kind: 'positive_prompt' as const, value_type: 'string' as const, current_value: '' },
    { parameter_id: 'negative', kind: 'negative_prompt' as const, value_type: 'string' as const, current_value: '' },
    { parameter_id: 'seed', kind: 'seed' as const, value_type: 'integer' as const, current_value: 17 },
  ], size_candidates: [] }
  return {
    preparer: {
      inspectRuntimeParameters: async () => structuredClone(description), validateInput: async () => {},
      prepare: async request => ({ instanceId: request.instanceId!, instanceTitle: 'Controlled node', templateTitle: 'Controlled template', sourceSnapshot: {},
        inputDescription: { ...description, parameters: description.parameters.map(parameter => ({ ...parameter, current_value: request.parameters[parameter.parameter_id] ?? parameter.current_value })) },
        actualWorkflow: {}, apiWorkflow: { '3': { class_type: 'SaveImage', inputs: {} } }, expectedOutputNodeIds: ['3'],
        connection: { origin: 'http://comfy.test', url: 'http://comfy.test', authorization: null } }),
    },
    transport: {
      submit: async input => { input.onRequestStart(); return { promptId: input.promptId } },
      observe: async () => fails() ? { status: 'error', outputs: [], error: { code: 'COMFYUI_REMOTE_ERROR', message: 'Controlled iteration failure' } }
        : { status: 'success', outputs: [{ nodeId: '3', outputIndex: 0, mediaKind: 'image', filename: 'glass.png', subfolder: '', type: 'output' }] },
      download: async () => ({ bytes: Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]), mediaType: 'image/png' }),
    },
  }
}

async function finishRuns(f: Fixture) { for (let step = 0; step < 5; step += 1) await f.runtime.advance() }

async function setup(maxRuns = 3, preparer?: GenerationPreparationAdapter, transport?: GenerationTransport) {
  const host = await createWorkbenchHostFixture(preparer, transport)
  cleanups.push(host.dispose)
  const selected = await host.remote.mutate({ workspaceId: 'workspace_1', type: 'new-work', value: { name: 'Experiment controls', goal: 'Compare light on glass' } }, signal())
  for (const request of [
    { type: 'update-draft', field: 'instance_id', value: '8' },
    { type: 'resource-select', value: { kind: 'model', id: '2' } },
    { type: 'resource-select', value: { kind: 'comfyui-template', id: '5' } },
    { type: 'update-execution', field: 'max_runs', value: maxRuns },
  ] as const) await host.remote.mutate({ ...selected, ...request }, signal())
  return { ...host, selected }
}

it.each(['prompt', 'experiment'] as const)('retains the unfinished %s snapshot while its Agent is unloaded and observes it after reload', async kind => {
  const f = await setup()
  const receipt = await f.remote.mutate({ ...f.selected, ...(kind === 'prompt' ? { type: 'agent-action' as const, id: 'prompt' } : { type: 'experiment' as const }) }, signal())
  const task = (await f.remote.getProjection(f.selected, signal())).tasks.find(task => task.task_id === receipt.taskId)!
  const agent = f.official.agents.get(task.session_id!)!
  agent.status = 'idle'
  const idle = await f.remote.getProjection(f.selected, signal())
  expect(idle.tasks[0]).toMatchObject({ execution_state: 'idle', status: 'needs_attention' })
  f.official.agents.delete(task.session_id!)
  expect((await f.remote.getProjection(f.selected, signal())).tasks).toEqual(idle.tasks)
  agent.status = 'running'
  f.official.agents.set(task.session_id!, agent)
  const awake = await f.remote.getProjection(f.selected, signal())
  expect(awake.tasks[0]).toMatchObject({ task_id: task.task_id, session_id: task.session_id, execution_state: 'running', status: 'running' })
  expect(f.official.controller.create).toHaveBeenCalledOnce()
  expect(f.official.controller.prompt).toHaveBeenCalledOnce()
})

it.each(['needs_attention', 'waiting_generation', 'waiting_input'] as const)('observes an experimental Session waking from idle while the Task is %s', async status => {
  const f = await fixture()
  if (status === 'waiting_generation') await accept(f)
  if (status === 'waiting_input') await f.service.publish({ taskId: f.task.task_id, artifact: { type: 'question', question: 'Which light?', options: [] } }, { ...f.identity, callId: 'question-while-idle' })
  const agent = f.official.agents.get(f.task.session_id!)!
  agent.status = 'idle'
  const idle = await f.remote.getProjection(f.selected, signal())
  expect(idle.tasks[0]).toMatchObject({ execution_state: 'idle', status })
  agent.status = 'running'
  const awake = await f.remote.getProjection(f.selected, signal())
  expect(awake.tasks[0]).toMatchObject({ task_id: f.task.task_id, session_id: f.task.session_id, execution_state: 'running', status: status === 'needs_attention' ? 'running' : status })
  expect(awake.runs).toEqual(idle.runs)
  expect(awake.artifacts).toEqual(idle.artifacts)
  expect(f.official.controller.create).toHaveBeenCalledOnce()
  expect(f.official.controller.prompt).toHaveBeenCalledOnce()
})

it.each(['paused', 'ended', 'completed', 'failed', 'interrupted'] as const)('keeps the %s experiment snapshot when an official status query returns late', async terminal => {
  const f = await fixture(terminal === 'completed' ? 1 : 3)
  let runId = ''
  if (terminal === 'completed') { runId = (await accept(f)).items[0]!.runId; await f.runtime.advance() }
  const started = deferred<void>(), release = deferred<void>()
  const lookup = f.ctx.subagents.listDescendants.bind(f.ctx.subagents)
  const reads = vi.spyOn(f.ctx.subagents, 'listDescendants').mockImplementationOnce(async (...args) => {
    started.resolve(); await release.promise; return lookup(...args)
  })
  const querying = f.remote.getProjection(f.selected, signal())
  let before!: Awaited<ReturnType<typeof f.remote.getProjection>>, readCount = 0
  try {
    await started.promise
    if (terminal === 'completed') await f.service.publish({ taskId: f.task.task_id, artifact: { type: 'review', observation: 'The Run failed preparation', conclusion: 'The budget is used', run_ids: [runId] } }, { ...f.identity, callId: 'finish-before-status' })
    else if (terminal === 'failed') f.ctx.emit('agent/error', { agent: { id: f.task.session_id } } as never)
    else await f.remote.mutate({ ...f.selected, taskId: f.task.task_id, type: terminal === 'paused' ? 'pause-experiment' : terminal === 'ended' ? 'stop-experiment' : 'task-interrupt' }, signal())
    before = await f.remote.getProjection(f.selected, signal())
    readCount = reads.mock.calls.length
  } finally { release.resolve() }
  const after = await querying
  expect(after.tasks).toEqual(before.tasks)
  expect(after.experiments).toEqual(before.experiments)
  if (terminal === 'failed' || terminal === 'interrupted') expect(after.tasks[0]).toMatchObject({ execution_state: terminal, status: terminal })
  expect(after.experiments[0]!.control_state).toBe(terminal === 'failed' ? 'running' : terminal === 'interrupted' ? 'ended' : terminal)
  await f.remote.getProjection(f.selected, signal())
  expect(reads).toHaveBeenCalledTimes(readCount)
})

it.each(['success', 'failure'] as const)('keeps the newer continue when an older dispatch reports %s', async outcome => {
  const f = await fixture()
  await f.remote.mutate({ ...f.selected, type: 'pause-experiment', taskId: f.task.task_id }, signal())
  const started = deferred<void>(), release = deferred<void>()
  f.official.controller.prompt.mockImplementationOnce(async () => {
    started.resolve(); await release.promise
    if (outcome === 'failure') throw new Error('Older continue failed')
    return { accepted: true }
  })
  const older = f.remote.mutate({ ...f.selected, type: 'resume-experiment', taskId: f.task.task_id }, signal())
  const settled = older.then(value => value, error => error)
  let before!: Awaited<ReturnType<typeof f.remote.getProjection>>
  try {
    await started.promise
    await f.remote.mutate({ ...f.selected, type: 'pause-experiment', taskId: f.task.task_id }, signal())
    await f.remote.mutate({ ...f.selected, type: 'resume-experiment', taskId: f.task.task_id }, signal())
    before = await f.remote.getProjection(f.selected, signal())
  } finally { release.resolve() }
  expect(await settled).toMatchObject(f.selected)
  const after = await f.remote.getProjection(f.selected, signal())
  expect(after.experiments).toEqual(before.experiments)
  expect(after.tasks).toEqual(before.tasks)
})

it('does not cancel the newer continue when an older pause scope lookup returns', async () => {
  const f = await fixture(), started = deferred<void>(), release = deferred<void>()
  const lookup = f.ctx.subagents.listDescendants.bind(f.ctx.subagents)
  vi.spyOn(f.ctx.subagents, 'listDescendants').mockImplementationOnce(async (...args) => {
    started.resolve(); await release.promise; return lookup(...args)
  })
  const older = f.remote.mutate({ ...f.selected, type: 'pause-experiment', taskId: f.task.task_id }, signal())
  try {
    await started.promise
    await f.remote.mutate({ ...f.selected, type: 'resume-experiment', taskId: f.task.task_id }, signal())
    expect(f.official.controller.prompt).toHaveBeenCalledTimes(2)
  } finally { release.resolve(); await older }
  expect(f.official.controller.cancel).not.toHaveBeenCalled()
  expect((await f.remote.getProjection(f.selected, signal())).experiments[0]!.control_state).toBe('running')
})

it.each(['startup', 'continue', 'answer'] as const)('skips the superseded dispatch after its scope lookup: %s', async consumer => {
  const f = consumer === 'startup' ? await setup() : await fixture()
  const service = f.ctx.harnessComfyuiWorkbench.service
  let taskId = consumer === 'startup' ? '' : (await f.remote.getProjection(f.selected, signal())).tasks[0]!.task_id
  let questionId = ''
  if (consumer === 'continue') await f.remote.mutate({ ...f.selected, type: 'pause-experiment', taskId }, signal())
  if (consumer === 'answer') {
    const task = (await f.remote.getProjection(f.selected, signal())).tasks[0]!
    const question = await service.publish({ taskId, artifact: { type: 'question', question: 'Which light?', options: [] } }, { workspaceId: f.selected.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'question-before-dispatch' })
    questionId = question.artifact_id
  }
  const started = deferred<void>(), release = deferred<void>()
  const lookup = f.ctx.subagents.listDescendants.bind(f.ctx.subagents)
  vi.spyOn(f.ctx.subagents, 'listDescendants').mockImplementationOnce(async (...args) => {
    started.resolve(); await release.promise; return lookup(...args)
  })
  const older = f.remote.mutate({ ...f.selected, type: consumer === 'startup' ? 'experiment' : consumer === 'continue' ? 'resume-experiment' : 'task-answer', taskId, ...(consumer === 'answer' ? { id: questionId, value: 'Moonlight' } : {}) }, signal())
  const settled = older.then(value => value, error => error)
  let promptCount = 0
  try {
    await started.promise
    if (consumer === 'startup') taskId = (await f.remote.getProjection(f.selected, signal())).tasks[0]!.task_id
    await f.remote.mutate({ ...f.selected, type: 'pause-experiment', taskId }, signal())
    await f.remote.mutate({ ...f.selected, type: 'resume-experiment', taskId }, signal())
    promptCount = f.official.controller.prompt.mock.calls.length
  } finally { release.resolve() }
  expect(await settled).toMatchObject(f.selected)
  expect(f.official.controller.prompt).toHaveBeenCalledTimes(promptCount)
  expect((await f.remote.getProjection(f.selected, signal())).experiments[0]!.control_state).toBe('running')
})

it.each(['success', 'failure'] as const)('keeps a later pause when a reply dispatch reports %s', async outcome => {
  const f = await fixture()
  const question = await f.service.publish({ taskId: f.task.task_id, artifact: { type: 'question', question: 'Which light?', options: [] } }, { ...f.identity, callId: 'question-before-pause' })
  const started = deferred<void>(), release = deferred<void>()
  f.official.controller.prompt.mockImplementationOnce(async () => {
    started.resolve(); await release.promise
    if (outcome === 'failure') throw new Error('Older answer dispatch failed')
    return { accepted: true }
  })
  const older = f.remote.mutate({ ...f.selected, type: 'task-answer', taskId: f.task.task_id, id: question.artifact_id, value: 'Moonlight' }, signal())
  const settled = older.then(value => value, error => error)
  let before!: Awaited<ReturnType<typeof f.remote.getProjection>>
  try {
    await started.promise
    await f.remote.mutate({ ...f.selected, type: 'pause-experiment', taskId: f.task.task_id }, signal())
    expect(f.official.controller.prompt).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ aborted: true }))
    before = await f.remote.getProjection(f.selected, signal())
  } finally { release.resolve() }
  expect(await settled).toMatchObject(f.selected)
  expect((await f.remote.getProjection(f.selected, signal())).tasks).toEqual(before.tasks)
})

it('keeps the newer operation cancellable after an older operation finishes', async () => {
  const f = await fixture()
  await f.remote.mutate({ ...f.selected, type: 'pause-experiment', taskId: f.task.task_id }, signal())
  const firstStarted = deferred<void>(), secondStarted = deferred<void>(), firstRelease = deferred<void>(), secondRelease = deferred<void>()
  f.official.controller.prompt.mockImplementationOnce(async () => {
    firstStarted.resolve(); await firstRelease.promise; return { accepted: true }
  }).mockImplementationOnce(async () => {
    secondStarted.resolve(); await secondRelease.promise; return { accepted: true }
  })
  const first = f.remote.mutate({ ...f.selected, type: 'resume-experiment', taskId: f.task.task_id }, signal())
  let second!: ReturnType<typeof f.remote.mutate>
  try {
    await firstStarted.promise
    await f.remote.mutate({ ...f.selected, type: 'pause-experiment', taskId: f.task.task_id }, signal())
    second = f.remote.mutate({ ...f.selected, type: 'resume-experiment', taskId: f.task.task_id }, signal())
    await secondStarted.promise
    firstRelease.resolve(); await first
    await f.remote.mutate({ ...f.selected, type: 'pause-experiment', taskId: f.task.task_id }, signal())
    expect(f.official.controller.prompt).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ aborted: true }))
  } finally { firstRelease.resolve(); secondRelease.resolve(); await first; if (second) await second }
  expect((await f.remote.getProjection(f.selected, signal())).experiments[0]!.control_state).toBe('paused')
})

it.each(['pause-experiment', 'stop-experiment'] as const)('closes an experiment during Session creation without dispatching the late Session: %s', async type => {
  const f = await setup(), started = deferred<void>(), release = deferred<void>()
  const create = f.official.controller.create.getMockImplementation()!
  f.official.controller.create.mockImplementationOnce(async input => {
    started.resolve(); await release.promise; return create(input)
  })
  const starting = f.remote.mutate({ ...f.selected, type: 'experiment' }, signal())
  let taskId = ''
  try {
    await started.promise
    const before = await f.remote.getProjection(f.selected, signal())
    taskId = before.tasks[0]!.task_id
    expect(before.tasks[0]!.session_id).toBeNull()
    await expect(f.remote.mutate({ ...f.selected, type, taskId }, signal())).resolves.toMatchObject(f.selected)
  } finally { release.resolve(); await starting }
  const after = await f.remote.getProjection(f.selected, signal())
  expect(after.experiments).toMatchObject([{ task_id: taskId, control_state: type === 'pause-experiment' ? 'paused' : 'ended' }])
  expect(f.official.controller.prompt).not.toHaveBeenCalled()
  expect(after.tasks[0]!.session_id).toEqual(expect.any(String))
})

it('can end an experiment whose Session creation failed while keeping its failed Task record', async () => {
  const f = await setup()
  f.official.controller.create.mockRejectedValueOnce(new Error('Session creation failed'))
  await expect(f.remote.mutate({ ...f.selected, type: 'experiment' }, signal())).rejects.toThrow('Session creation failed')
  const before = await f.remote.getProjection(f.selected, signal()), task = before.tasks[0]!
  expect(task).toMatchObject({ session_id: null, execution_state: 'failed' })
  await f.remote.mutate({ ...f.selected, type: 'stop-experiment', taskId: task.task_id }, signal())
  const after = await f.remote.getProjection(f.selected, signal())
  expect(after.experiments).toMatchObject([{ task_id: task.task_id, control_state: 'ended', end_reason: 'user_ended' }])
  expect(after.tasks[0]).toMatchObject({ input: task.input, error: task.error })
})

it.each(['ended', 'completed'] as const)('preserves a terminal experiment when pause, continue or another end arrives: %s', async terminal => {
  const f = await fixture(terminal === 'completed' ? 1 : 3)
  if (terminal === 'ended') await f.remote.mutate({ ...f.selected, type: 'stop-experiment', taskId: f.task.task_id }, signal())
  else {
    const runId = (await accept(f)).items[0]!.runId
    await f.runtime.advance()
    await f.service.publish({ taskId: f.task.task_id, artifact: { type: 'review', observation: 'Failed preparation', conclusion: 'Budget is used', run_ids: [runId] } }, { ...f.identity, callId: 'last-review' })
  }
  const before = await f.remote.getProjection(f.selected, signal()), experiment = before.experiments[0]!
  for (const type of ['pause-experiment', 'resume-experiment'] as const) {
    await expect(f.remote.mutate({ ...f.selected, type, taskId: f.task.task_id }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_EXPERIMENT_CLOSED' } })
  }
  expect(await f.service.endExperiment({ taskId: f.task.task_id, reason: 'goal_met' }, f.identity)).toEqual(experiment)
  expect((await f.remote.getProjection(f.selected, signal())).experiments).toEqual(before.experiments)
})

it('keeps a failed continue paused with its error and retries the same Task and Session', async () => {
  const f = await fixture(), { candidate } = await nextRound(f)
  await f.remote.mutate({ ...f.selected, type: 'pause-experiment', taskId: f.task.task_id }, signal())
  f.official.controller.prompt.mockRejectedValueOnce(new Error('Continue dispatch failed'))
  await expect(f.remote.mutate({ ...f.selected, type: 'resume-experiment', taskId: f.task.task_id }, signal())).rejects.toThrow('Continue dispatch failed')
  const failed = await f.remote.getProjection(f.selected, signal())
  expect(failed.experiments).toMatchObject([{ control_state: 'paused', submitted_count: 1 }])
  expect(failed.tasks[0]).toMatchObject({ session_id: f.task.session_id, execution_state: 'failed', error: { code: 'WORKBENCH_DISPATCH_FAILED', message: 'Continue dispatch failed' } })
  await expect(accept(f, candidate)).rejects.toMatchObject({ code: 'WORKBENCH_TASK_STOPPED' })
  await f.remote.mutate({ ...f.selected, type: 'resume-experiment', taskId: f.task.task_id }, signal())
  const accepted = await accept(f, candidate), after = await f.remote.getProjection(f.selected, signal())
  expect(after.tasks).toHaveLength(1)
  expect(after.tasks[0]).toMatchObject({ task_id: f.task.task_id, session_id: f.task.session_id, binding_snapshot: f.task.binding_snapshot, selected_model: f.task.selected_model, request_text: f.task.request_text, input: f.task.input, error: null })
  const fixed = await f.service.getTask({ taskId: f.task.task_id }, f.identity)
  expect(fixed.iterations.map(iteration => iteration.run_id)).toEqual(after.runs.map(run => run.run_id))
  expect(fixed.artifacts).toEqual(expect.arrayContaining([expect.objectContaining({ artifact: { type: 'generation_input', generation_input: candidate, context_refs: [] } })]))
  expect(after.runs.find(run => run.run_id === accepted.items[0]!.runId)).toMatchObject({ workbench_task_id: f.task.task_id, iteration_index: 2 })
  expect(f.official.controller.create).toHaveBeenCalledOnce()
})

it.each([
  { type: 'pause-experiment', phase: 'create-failure' },
  { type: 'stop-experiment', phase: 'create-failure' },
  { type: 'pause-experiment', phase: 'dispatch-success' },
  { type: 'stop-experiment', phase: 'dispatch-success' },
  { type: 'pause-experiment', phase: 'dispatch-failure' },
  { type: 'stop-experiment', phase: 'dispatch-failure' },
] as const)('retains control during a late initial $phase after $type', async ({ type, phase }) => {
  const f = await setup(), started = deferred<void>(), release = deferred<void>()
  if (phase === 'create-failure') f.official.controller.create.mockImplementationOnce(async () => {
    started.resolve(); await release.promise; throw new Error('Late startup failure')
  })
  else f.official.controller.prompt.mockImplementationOnce(async () => {
    started.resolve(); await release.promise
    if (phase === 'dispatch-failure') throw new Error('Late startup failure')
    return { accepted: true }
  })
  const starting = f.remote.mutate({ ...f.selected, type: 'experiment' }, signal())
  const settled = starting.then(() => null, error => error)
  let taskId = '', execution = ''
  try {
    await started.promise
    taskId = (await f.remote.getProjection(f.selected, signal())).tasks[0]!.task_id
    await f.remote.mutate({ ...f.selected, type, taskId }, signal())
    execution = (await f.remote.getProjection(f.selected, signal())).tasks[0]!.execution_state
  } finally { release.resolve() }
  const error = await settled
  expect(error).toBeNull()
  const after = await f.remote.getProjection(f.selected, signal())
  expect(after.experiments).toMatchObject([{ task_id: taskId, control_state: type === 'pause-experiment' ? 'paused' : 'ended' }])
  expect(after.tasks[0]).toMatchObject({ execution_state: execution, error: null })
})

it.each([
  { terminal: 'ended', outcome: 'success' },
  { terminal: 'ended', outcome: 'failure' },
  { terminal: 'completed', outcome: 'success' },
  { terminal: 'completed', outcome: 'failure' },
] as const)('preserves $terminal when a continue dispatch later reports $outcome', async ({ terminal, outcome }) => {
  const f = await fixture(terminal === 'completed' ? 1 : 3)
  const runId = (await accept(f)).items[0]!.runId
  await f.remote.mutate({ ...f.selected, type: 'pause-experiment', taskId: f.task.task_id }, signal())
  const started = deferred<void>(), release = deferred<void>()
  f.official.controller.prompt.mockImplementationOnce(async () => {
    started.resolve(); await release.promise
    if (outcome === 'failure') throw new Error('Late continue failure')
    return { accepted: true }
  })
  const continuing = f.remote.mutate({ ...f.selected, type: 'resume-experiment', taskId: f.task.task_id }, signal())
  const settled = continuing.then(() => null, error => error)
  let before!: Awaited<ReturnType<typeof f.remote.getProjection>>
  try {
    await started.promise
    if (terminal === 'ended') await f.remote.mutate({ ...f.selected, type: 'stop-experiment', taskId: f.task.task_id }, signal())
    else {
      await f.runtime.advance()
      await f.service.publish({ taskId: f.task.task_id, artifact: { type: 'review', observation: 'Preparation failed', conclusion: 'Budget complete', run_ids: [runId] } }, { ...f.identity, callId: 'terminal-review' })
    }
    before = await f.remote.getProjection(f.selected, signal())
  } finally { release.resolve() }
  const error = await settled
  if (outcome === 'failure' && terminal === 'completed') expect(error).toBeInstanceOf(Error)
  else expect(error).toBeNull()
  const after = await f.remote.getProjection(f.selected, signal())
  expect(after.experiments).toEqual(before.experiments)
  expect(after.experiments[0]!.control_state).toBe(terminal)
  expect(after.tasks[0]).toEqual(before.tasks[0])
  await expect(accept(f)).rejects.toMatchObject({ code: 'WORKBENCH_TASK_STOPPED' })
})

it.each(['pause-experiment', 'stop-experiment'] as const)('keeps admission closed when official Session control fails: %s', async type => {
  const f = await fixture(), { candidate } = await nextRound(f)
  vi.spyOn(f.ctx.subagents, 'listDescendants').mockRejectedValueOnce(new Error('Official control unavailable'))
  await expect(f.remote.mutate({ ...f.selected, type, taskId: f.task.task_id }, signal())).rejects.toThrow('Official control unavailable')
  const after = await f.remote.getProjection(f.selected, signal())
  expect(after.experiments[0]!.control_state).toBe(type === 'pause-experiment' ? 'paused' : 'ended')
  await expect(accept(f, candidate)).rejects.toMatchObject({ code: 'WORKBENCH_TASK_STOPPED' })
})

it.each([
  { type: 'pause-experiment', fails: false }, { type: 'pause-experiment', fails: true },
  { type: 'stop-experiment', fails: false }, { type: 'stop-experiment', fails: true },
] as const)('finishes accepted Runs and keeps other Tasks active after $type (failure=$fails)', async ({ type, fails }) => {
  const generation = controlledGeneration(() => fails), f = await fixture(3, generation.preparer, generation.transport)
  const requestId = randomUUID(), runId = (await accept(f, f.task.input.generation_input, requestId)).items[0]!.runId
  const receipt = await f.remote.mutate({ ...f.selected, type: 'run' }, signal())
  const other = (await f.remote.getProjection(f.selected, signal())).tasks.find(task => task.task_id === receipt.taskId)!
  const otherAccepted = await f.runtime.acceptGenerations({ ...f.identity, sessionId: other.session_id! }, [{ requestId: randomUUID(), request: toGenerationRequest({ ...other.input.generation_input, instance_id: '8', template_id: '5' }) }], undefined, other.task_id)
  await f.remote.mutate({ ...f.selected, type, taskId: f.task.task_id }, signal())
  await finishRuns(f)
  const after = await f.remote.getProjection(f.selected, signal()), run = after.runs.find(item => item.run_id === runId)!
  expect(after.experiments[0]).toMatchObject({ control_state: type === 'pause-experiment' ? 'paused' : 'ended', submitted_count: 1 })
  expect(after.refreshAfterMs).toBe(777)
  expect(run).toMatchObject({ status: fails ? 'failed' : 'succeeded', generation_input: f.task.input.generation_input })
  if (fails) expect(run.error).toMatchObject({ message: 'Controlled iteration failure' })
  else expect(run.media).toHaveLength(1)
  expect(after.runs.find(item => item.run_id === otherAccepted.items[0]!.runId)!.status).toBe(fails ? 'failed' : 'succeeded')
  expect(f.official.controller.cancel).not.toHaveBeenCalledWith({ sessionId: other.session_id })
  expect((await accept(f, f.task.input.generation_input, requestId)).items[0]).toMatchObject({ runId, acceptance: 'reused' })
  await expect(accept(f)).rejects.toMatchObject({ code: 'WORKBENCH_TASK_STOPPED' })
  expect((await f.remote.getRunInput({ workspaceId: f.selected.workspaceId, workId: f.selected.workId!, runId }, signal())).generation_input).toEqual(f.task.input.generation_input)
})

it('counts successful and failed rounds, requires each review and retains the manual review at budget completion', async () => {
  let fails = false
  const generation = controlledGeneration(() => fails), f = await fixture(2, generation.preparer, generation.transport)
  const first = (await accept(f)).items[0]!.runId
  const candidate = { ...f.task.input.generation_input, parameters: { ...f.task.input.generation_input.parameters, seed: 73 } }
  await expect(accept(f, candidate)).rejects.toMatchObject({ code: 'WORKBENCH_ITERATION_INCOMPLETE' })
  await finishRuns(f)
  const draft = (await f.remote.getProjection(f.selected, signal())).runs.find(run => run.run_id === first)!.review_draft!
  await f.remote.mutate({ ...f.selected, type: 'evaluate', runId: first, value: { expected: draft, draft: { ...draft, verdict: 'met', observation: 'User saved reflection', conclusion: 'User saved judgment' }, saveExperience: false } }, signal())
  const manual = (await f.remote.getProjection(f.selected, signal())).runs.find(run => run.run_id === first)!.review
  await f.service.publish({ taskId: f.task.task_id, artifact: { type: 'generation_input', generation_input: candidate, context_refs: [] } }, { ...f.identity, callId: 'early-candidate' })
  await expect(accept(f, candidate)).rejects.toMatchObject({ code: 'WORKBENCH_ITERATION_INCOMPLETE' })
  const review1 = await f.service.publish({ taskId: f.task.task_id, artifact: { type: 'review', observation: 'Agent first observation', conclusion: 'Try another seed', run_ids: [first] } }, { ...f.identity, callId: 'review-1' })
  await expect(accept(f, candidate)).rejects.toMatchObject({ code: 'WORKBENCH_CANDIDATE_REQUIRED' })
  const published = await f.service.publish({ taskId: f.task.task_id, artifact: { type: 'generation_input', generation_input: candidate, context_refs: [] } }, { ...f.identity, callId: 'fresh-candidate' })
  await expect(accept(f, { ...candidate, parameters: { ...candidate.parameters, seed: 74 } })).rejects.toMatchObject({ code: 'WORKBENCH_CANDIDATE_REQUIRED' })
  const second = (await accept(f, candidate)).items[0]!.runId
  fails = true
  await finishRuns(f)
  const unreviewed = await f.remote.getProjection(f.selected, signal())
  expect(unreviewed.experiments[0]).toMatchObject({ control_state: 'running', submitted_count: 2, max_runs: 2 })
  expect(unreviewed.tasks[0]!.status).toBe('needs_attention')
  await expect(accept(f, candidate)).rejects.toMatchObject({ code: 'WORKBENCH_BUDGET_EXHAUSTED' })
  const review2 = await f.service.publish({ taskId: f.task.task_id, artifact: { type: 'review', observation: 'Agent second observation', conclusion: 'Stop at budget', run_ids: [second] } }, { ...f.identity, callId: 'review-2' })
  const after = await f.remote.getProjection(f.selected, signal())
  expect(after.experiments[0]).toMatchObject({ control_state: 'completed', end_reason: 'budget_used', submitted_count: 2, max_runs: 2 })
  expect(after.tasks[0]).toMatchObject({ task_id: f.task.task_id, status: 'failed', input: f.task.input })
  expect(after.runs).toMatchObject([
    { run_id: first, status: 'succeeded', review_artifact_id: review1.artifact_id, review: manual },
    { run_id: second, status: 'failed', candidate_artifact_id: published.artifact_id, review_artifact_id: review2.artifact_id, error: { message: 'Controlled iteration failure' } },
  ])
  expect(after.artifacts.find(artifact => artifact.artifact_id === review1.artifact_id)!.artifact).toMatchObject({ observation: 'Agent first observation' })
  expect(after.artifacts.find(artifact => artifact.artifact_id === review2.artifact_id)!.artifact).toMatchObject({ observation: 'Agent second observation' })
  await expect(accept(f, candidate)).rejects.toMatchObject({ code: 'WORKBENCH_TASK_STOPPED' })
  expect((await f.remote.getProjection(f.selected, signal())).runs).toHaveLength(2)
})

async function fixture(maxRuns = 3, preparer?: GenerationPreparationAdapter, transport?: GenerationTransport) {
  const host = await setup(maxRuns, preparer, transport), { selected } = host
  const receipt = await host.remote.mutate({ ...selected, type: 'experiment' }, signal())
  const task = (await host.remote.getProjection(selected, signal())).tasks.find(item => item.task_id === receipt.taskId)!
  const identity = { workspaceId: selected.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'experiment' }
  return { ...host, task, identity, service: host.ctx.harnessComfyuiWorkbench.service }
}

type Fixture = Awaited<ReturnType<typeof fixture>>
function accept(f: Fixture, input: GenerationInput = f.task.input.generation_input, requestId = randomUUID()) {
  return f.runtime.acceptGenerations(f.identity, [{ requestId, request: toGenerationRequest({ ...input, instance_id: input.instance_id!, template_id: input.template_id! }) }], undefined, f.task.task_id)
}

async function nextRound(f: Fixture) {
  const runId = (await accept(f)).items[0]!.runId
  await f.runtime.advance()
  await f.service.publish({ taskId: f.task.task_id, artifact: { type: 'review', observation: 'The first preparation failed', conclusion: 'Change the seed', run_ids: [runId] } }, { ...f.identity, callId: 'review-1' })
  const candidate = { ...f.task.input.generation_input, parameters: { ...f.task.input.generation_input.parameters, seed: 41 } }
  await f.service.publish({ taskId: f.task.task_id, artifact: { type: 'generation_input', generation_input: candidate, context_refs: [] } }, { ...f.identity, callId: 'candidate-2' })
  return { runId, candidate }
}

it.each(['pause-experiment', 'stop-experiment'] as const)('closes new Run admission before waiting for official Session control: %s', async type => {
  const f = await fixture(), { candidate } = await nextRound(f)
  const started = deferred<void>(), release = deferred<void>()
  const lookup = f.ctx.subagents.listDescendants.bind(f.ctx.subagents)
  vi.spyOn(f.ctx.subagents, 'listDescendants').mockImplementationOnce(async (...args) => {
    started.resolve(); await release.promise; return lookup(...args)
  })
  const control = f.remote.mutate({ ...f.selected, type, taskId: f.task.task_id }, signal())
  try {
    await started.promise
    await expect(accept(f, candidate)).rejects.toMatchObject({ code: 'WORKBENCH_TASK_STOPPED' })
  } finally { release.resolve(); await control }
  const projection = await f.remote.getProjection(f.selected, signal())
  expect(projection.experiments).toMatchObject([{ task_id: f.task.task_id, control_state: type === 'pause-experiment' ? 'paused' : 'ended', submitted_count: 1 }])
  expect(projection.runs).toHaveLength(1)
})

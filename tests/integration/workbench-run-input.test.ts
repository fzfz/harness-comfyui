import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { toGenerationRequest } from '../../src/cli/contract.ts'
import { createWorkbenchHostFixture } from '../support/workbench-host.ts'
import type { WorkbenchScope } from '../../src/workbench-remote.ts'

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { registerGenerationMediaRoutes } from '../../src/host/generation/media-routes.ts'
import { GenerationRuntimeError, type GenerationTransport } from '../../src/host/generation/generation-runtime.ts'
import { SourceGenerationPreparer, type UiWorkflow } from '../../src/host/generation/source-preparer.ts'
import { ComfyWorkflowCompiler } from '../../src/host/generation/workflow-compiler.ts'
import { CatalogError } from '../../src/host/catalog/catalog-client.ts'
const signal = () => new AbortController().signal
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  try { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() }
  finally { vi.restoreAllMocks() }
})

async function fixture(...args: Parameters<typeof createWorkbenchHostFixture>) {
  const host = await createWorkbenchHostFixture(...args)
  cleanups.push(host.dispose)
  return { ...host, service: host.ctx.harnessComfyuiWorkbench.service }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

async function selectGeneration(host: Fixture, scope: WorkbenchScope) {
  await host.remote.mutate({ ...scope, type: 'update-draft', field: 'instance_id', value: '8' }, signal())
  for (const value of [{ kind: 'model', id: '2' }, { kind: 'comfyui-template', id: '5' }]) await host.remote.mutate({ ...scope, type: 'resource-select', value }, signal())
}

async function preparedFixture(transport?: GenerationTransport) {
  const description = { parameters: [
    { parameter_id: 'positive', kind: 'positive_prompt' as const, value_type: 'string' as const, current_value: '' },
    { parameter_id: 'negative', kind: 'negative_prompt' as const, value_type: 'string' as const, current_value: '' },
    { parameter_id: 'seed', kind: 'seed' as const, value_type: 'integer' as const, current_value: 17 },
  ], size_candidates: [] }
  return fixture({ inspectRuntimeParameters: async () => structuredClone(description), validateInput: async () => {},
    prepare: async request => ({ instanceId: '8', instanceTitle: 'Node', templateTitle: 'Template', sourceSnapshot: {},
      inputDescription: { ...description, parameters: description.parameters.map(parameter => ({ ...parameter, current_value: request.parameters[parameter.parameter_id] ?? parameter.current_value })) },
      actualWorkflow: { parameters: request.parameters }, apiWorkflow: { '3': { class_type: 'SaveImage', inputs: {} } }, expectedOutputNodeIds: ['3'], connection: { origin: 'http://comfy.test', url: 'http://comfy.test', authorization: null } }),
  }, transport)
}
async function acceptRun(host: Fixture, scope: WorkbenchScope, type: 'run' | 'experiment' | 'retry' = 'run', runId?: string) {
  const receipt = await host.remote.mutate({ ...scope, type, ...(runId ? { runId } : {}) }, signal())
  const task = (await host.remote.getProjection(scope, signal())).tasks.find(task => task.task_id === receipt.taskId)!
  const identity = { workspaceId: scope.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'submit' }
  const accepted = await host.runtime.acceptGenerations(identity, [{ requestId: randomUUID(), request: toGenerationRequest({ ...task.input.generation_input, instance_id: task.input.generation_input.instance_id!, template_id: task.input.generation_input.template_id! }) }], undefined, task.task_id)
  return { task, identity, runId: accepted.items[0]!.runId }
}

async function mediaServer(host: Fixture) {
  let handler!: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
  registerGenerationMediaRoutes({ runtime: host.runtime, webServer: { register(route) { handler = route.handler; return () => {} } },
    workspaceRegistry: host.ctx.workspaceRegistry, sessionPersistence: host.ctx.sessionPersistence, subagents: host.ctx.subagents,
  })
  const server = createServer((request, response) => { void handler(request, response) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  cleanups.push(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Media fixture address is missing')
  return `http://127.0.0.1:${address.port}`
}

it.each(['created', 'failed'])('reads a %s Run fixed input and Task context without a saved description or current Branch values', async stage => {
  const host = await fixture(), { remote } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Historical input', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, selected)
  await remote.mutate({ ...selected, type: 'update-draft', field: 'positive_prompt', value: 'Historical rain' }, signal())
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'character', id: '7' } }, signal())
  const { task, runId } = await acceptRun(host, selected)
  if (stage === 'failed') await host.runtime.advance()
  await remote.mutate({ ...selected, type: 'update-draft', field: 'positive_prompt', value: 'Current sunshine' }, signal())
  await remote.mutate({ ...selected, type: 'resource-remove', id: '7', value: 'character' }, signal())
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'character', id: '8' } }, signal())
  const before = (await remote.getProjection(selected, signal())).branches
  host.inspect.mockRejectedValue(new Error('Current template is unavailable'))
  const result = await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())
  expect(result).toEqual({ run_id: runId, branch_id: selected.branchId, generation_input: task.input.generation_input, context_refs: [{ kind: 'character', id: '7' }], input_description: null, prompt_input: { positive_prompt: null, negative_prompt: null } })
  expect((await remote.getProjection(selected, signal())).branches).toEqual(before)
})

it('reads saved parameter kinds and prompts after the current template and model become unavailable', async () => {
  const description = { parameters: [
    { parameter_id: 'positive_prompt_9', kind: 'positive_prompt' as const, value_type: 'string' as const, current_value: 'Prepared rain' },
    { parameter_id: 'negative_prompt_10', kind: 'negative_prompt' as const, value_type: 'string' as const, current_value: 'blur' },
    { parameter_id: 'steps_4', kind: 'steps' as const, value_type: 'integer' as const, current_value: 24 },
  ], size_candidates: [] }
  const inspect = vi.fn(async () => structuredClone(description))
  const host = await fixture({
    inspectRuntimeParameters: inspect, validateInput: async () => {},
    prepare: async () => ({ instanceId: '8', instanceTitle: 'Node', templateTitle: 'Saved template', sourceSnapshot: { template: { id: '5' } }, inputDescription: description,
      actualWorkflow: { nodes: [], links: [] }, apiWorkflow: {}, expectedOutputNodeIds: [], connection: { origin: 'http://comfy.test', url: 'http://comfy.test', authorization: null } }),
  })
  const { remote } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Saved input', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, selected)
  await remote.mutate({ ...selected, type: 'update-draft', field: 'positive_prompt', value: 'Prepared rain' }, signal())
  await remote.mutate({ ...selected, type: 'update-draft', field: 'negative_prompt', value: 'blur' }, signal())
  const { task, runId } = await acceptRun(host, selected)
  await host.runtime.advance()
  inspect.mockRejectedValue(new Error('The current template has changed'))
  host.catalog.resolveGenerationModel.mockRejectedValue(new Error('The model was deleted'))
  const result = await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())
  expect(result).toEqual({ run_id: runId, branch_id: selected.branchId, generation_input: task.input.generation_input, context_refs: [], input_description: description, prompt_input: { positive_prompt: 'Prepared rain', negative_prompt: 'blur' } })
})

it.each([{ kind: 'run', maxRuns: 1 }, { kind: 'experiment', maxRuns: 1 }, { kind: 'experiment', maxRuns: 3 }] as const)('keeps an unknown $kind submission as attention without submitting it again: budget=$maxRuns', async ({ kind, maxRuns }) => {
  const description = { parameters: [{ parameter_id: 'positive', kind: 'positive_prompt' as const, value_type: 'string' as const, current_value: '' }], size_candidates: [] }
  const submit = vi.fn(async (input: { onRequestStart(): boolean }) => {
    input.onRequestStart()
    throw new Error('Connection dropped after submission')
  })
  const host = await fixture({ inspectRuntimeParameters: async () => description, validateInput: async () => {},
    prepare: async () => ({ instanceId: '8', instanceTitle: 'Node', templateTitle: 'Template', inputDescription: description, sourceSnapshot: {}, actualWorkflow: {}, apiWorkflow: {}, expectedOutputNodeIds: [], connection: { origin: 'http://comfy.test', url: 'http://comfy.test', authorization: null } }),
  }, { submit, observe: vi.fn(), download: vi.fn() })
  const { remote, runtime } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Unknown submission', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, selected)
  await remote.mutate({ ...selected, type: 'update-execution', field: 'max_runs', value: maxRuns }, signal())
  const { task, runId, identity } = await acceptRun(host, selected, kind)
  await runtime.advance()
  await runtime.advance()
  const projection = await remote.getProjection(selected, signal())
  expect(projection.runs).toEqual([expect.objectContaining({ run_id: runId, status: 'submission_unknown', error: { code: 'COMFYUI_SUBMISSION_RESULT_UNKNOWN', message: expect.any(String) } })])
  expect(projection.tasks.find(item => item.task_id === task.task_id)?.status).toBe('needs_attention')
  await runtime.advance()
  expect(submit).toHaveBeenCalledOnce()
  if (kind === 'experiment') {
    await host.service.publish({ taskId: task.task_id, artifact: { type: 'review', observation: 'Submission unconfirmed', conclusion: 'Wait for confirmation', run_ids: [runId] } }, { ...identity, callId: 'unknown-review' })
    await host.service.publish({ taskId: task.task_id, artifact: { type: 'generation_input', generation_input: task.input.generation_input, context_refs: [] } }, { ...identity, callId: 'unknown-candidate' })
    const reviewed = await remote.getProjection(selected, signal())
    expect(reviewed.tasks.find(item => item.task_id === task.task_id)?.status).toBe('needs_attention')
    expect(reviewed.experiments.find(item => item.task_id === task.task_id)?.control_state).toBe('running')
  }
  await expect(runtime.acceptGenerations(identity, [{ requestId: randomUUID(), request: toGenerationRequest({ ...task.input.generation_input, instance_id: '8', template_id: '5' }) }], undefined, task.task_id)).rejects.toMatchObject({ code: kind === 'run' || maxRuns === 1 ? 'WORKBENCH_BUDGET_EXHAUSTED' : 'WORKBENCH_ITERATION_INCOMPLETE' })
  expect((await remote.getProjection(selected, signal())).runs).toHaveLength(1)
})

it('creates a Run child under the Run owning branch while browsing a sibling branch', async () => {
  const host = await preparedFixture(), { remote } = host
  const root = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Root', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, root)
  const source = await remote.mutate({ ...root, type: 'create-branch', value: { name: 'Source branch', original_request: 'Source requirements' } }, signal())
  await remote.mutate({ ...source, type: 'update-draft', field: 'positive_prompt', value: 'Source run rain' }, signal())
  const { task, runId } = await acceptRun(host, source)
  await host.runtime.advance()
  await remote.mutate({ ...source, type: 'update-draft', field: 'positive_prompt', value: 'Later parent edit' }, signal())
  const sibling = await remote.mutate({ ...root, type: 'create-branch', value: { name: 'Sibling', original_request: 'Sibling requirements' } }, signal())
  const before = (await remote.getProjection(root, signal())).branches
  const fork = await remote.mutate({ ...sibling, type: 'create-branch', runId, value: { name: 'Run fork', original_request: 'New exploration' } }, signal())
  const after = await remote.getProjection({ workspaceId: root.workspaceId, workId: root.workId }, signal())
  expect(after.branches.find(branch => branch.branch_id === fork.branchId)).toMatchObject({ parent_branch_id: source.branchId, source_run_id: runId, original_request: 'New exploration', draft: { generation_input: task.input.generation_input, prompt_input: { positive_prompt: 'Source run rain', negative_prompt: '' } } })
  expect(after.branches.filter(branch => branch.branch_id !== fork.branchId)).toEqual(before)
  expect((await remote.getProjection(fork, signal())).runs).toEqual([])
  expect(after.runs.map(run => run.run_id)).toEqual([runId])
})

it('returns Work Runs in global creation order when experiment iterations interleave with another Task', async () => {
  const time = vi.spyOn(Date, 'now').mockReturnValue(1000)
  const host = await fixture(), { remote, runtime, service } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Run timeline', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, selected)
  const experiment = await acceptRun(host, selected, 'experiment')
  await runtime.advance()
  time.mockReturnValue(2000)
  const single = await acceptRun(host, selected)
  time.mockReturnValue(3000)
  await service.publish({ taskId: experiment.task.task_id, artifact: { type: 'review', observation: 'Instance unavailable', conclusion: 'Try again', run_ids: [experiment.runId] } }, { ...experiment.identity, callId: 'review' })
  await service.publish({ taskId: experiment.task.task_id, artifact: { type: 'generation_input', generation_input: experiment.task.input.generation_input, context_refs: [] } }, { ...experiment.identity, callId: 'candidate' })
  const second = await runtime.acceptGenerations(experiment.identity, [{ requestId: randomUUID(), request: toGenerationRequest({ ...experiment.task.input.generation_input, instance_id: '8', template_id: '5' }) }], undefined, experiment.task.task_id)
  const projection = await remote.getProjection({ workspaceId: selected.workspaceId, workId: selected.workId }, signal())
  expect(projection.runs.map(run => run.run_id)).toEqual([experiment.runId, single.runId, second.items[0]!.runId])
})

it('projects every real worker stage and routes each Run media while retaining a download failure', async () => {
  const description = { parameters: [{ parameter_id: 'positive', kind: 'positive_prompt' as const, value_type: 'string' as const, current_value: '' }], size_candidates: [] }
  const started = deferred(), release = deferred()
  const promptIndexes = new Map<string, number>(), observations = new Map<string, number>()
  const bytes = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]), Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 2])]
  const transport: GenerationTransport = {
    submit: async input => {
      input.onRequestStart()
      const index = promptIndexes.size
      promptIndexes.set(input.promptId, index)
      if (index === 0) { started.resolve(); await release.promise }
      return { promptId: input.promptId }
    },
    observe: async input => {
      const count = observations.get(input.promptId) ?? 0
      observations.set(input.promptId, count + 1)
      return count === 0 ? { status: 'running', outputs: [] } : { status: 'success', outputs: [{ nodeId: '3', outputIndex: 0, mediaKind: 'image', filename: `output-${promptIndexes.get(input.promptId)}.png`, subfolder: '', type: 'output' }] }
    },
    download: async input => {
      if (input.output.filename === 'output-2.png') throw new GenerationRuntimeError('COMFYUI_HTTP_ERROR', 'Media download failed with HTTP 503')
      return { bytes: bytes[input.output.filename === 'output-0.png' ? 0 : 1]!, mediaType: 'image/png' }
    },
  }
  const host = await fixture({ inspectRuntimeParameters: async () => description, validateInput: async () => {},
    prepare: async () => ({ instanceId: '8', instanceTitle: 'Node', templateTitle: 'Template', inputDescription: description, sourceSnapshot: {}, actualWorkflow: {}, apiWorkflow: { '3': { class_type: 'SaveImage', inputs: {} } }, expectedOutputNodeIds: ['3'], connection: { origin: 'http://comfy.test', url: 'http://comfy.test', authorization: null } }),
  }, transport)
  const { remote, runtime } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Lifecycle', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, selected)
  const first = await acceptRun(host, selected)
  const status = async (runId: string) => (await remote.getProjection(selected, signal())).runs.find(run => run.run_id === runId)!.status
  expect(await status(first.runId)).toBe('created')
  await runtime.advance()
  expect(await status(first.runId)).toBe('prepared')
  const submitting = runtime.advance()
  await started.promise
  expect(await status(first.runId)).toBe('submitting')
  release.resolve()
  await submitting
  expect(await status(first.runId)).toBe('remote_pending')
  for (const expected of ['remote_running', 'downloading', 'succeeded']) { await runtime.advance(); expect(await status(first.runId)).toBe(expected) }
  const second = await acceptRun(host, selected)
  for (let phase = 0; phase < 5; phase += 1) await runtime.advance()
  const third = await acceptRun(host, selected)
  for (let phase = 0; phase < 5; phase += 1) await runtime.advance()
  const projection = await remote.getProjection(selected, signal())
  expect(new Set(projection.runs.map(run => run.run_id)).size).toBe(3)
  expect(projection.runs.find(run => run.run_id === third.runId)).toMatchObject({ status: 'failed', media: [], error: { code: 'COMFYUI_HTTP_ERROR', message: 'Media download failed with HTTP 503' } })
  const origin = await mediaServer(host)
  for (const [index, item] of [first, second].entries()) {
    const media = projection.runs.find(run => run.run_id === item.runId)!.media[0]!
    expect(media.run_id).toBe(item.runId)
    const response = await fetch(origin + media.url)
    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes[index])
    const invalid = new URL(origin + media.url)
    invalid.searchParams.set('session_id', third.task.session_id!)
    expect((await fetch(invalid)).status).toBe(404)
  }
  expect((await remote.getProjection(selected, signal())).runs).toHaveLength(3)
})

it('shares the original candidate context between task iterations and Run input reads', async () => {
  const host = await fixture(), { remote, runtime, service } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Candidate context', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, selected)
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'character', id: '7' } }, signal())
  const source = await acceptRun(host, selected, 'experiment')
  await runtime.advance()
  await service.publish({ taskId: source.task.task_id, artifact: { type: 'review', observation: 'Failed preparation', conclusion: 'Try a candidate', run_ids: [source.runId] } }, { ...source.identity, callId: 'review' })
  const input = { ...source.task.input.generation_input, parameters: { ...source.task.input.generation_input.parameters, positive: 'Candidate prompt' } }
  await service.publish({ taskId: source.task.task_id, artifact: { type: 'generation_input', generation_input: input, context_refs: [{ kind: 'character', id: '8' }] } }, { ...source.identity, callId: 'candidate' })
  const accepted = await runtime.acceptGenerations(source.identity, [{ requestId: randomUUID(), request: toGenerationRequest({ ...input, instance_id: '8', template_id: '5' }) }], undefined, source.task.task_id)
  const runId = accepted.items[0]!.runId
  await remote.mutate({ ...selected, type: 'resource-remove', id: '7', value: 'character' }, signal())
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'character', id: '9' } }, signal())
  const result = await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())
  const task = await service.getTask({ taskId: source.task.task_id }, source.identity)
  expect(result).toMatchObject({ generation_input: input, context_refs: [{ kind: 'character', id: '8' }], input_description: null, prompt_input: { positive_prompt: null, negative_prompt: null } })
  expect(task.iterations.find(item => item.run_id === runId)?.context_refs).toEqual(result.context_refs)
})

it.each(['workspace_1', 'workspace_2'])('rejects historical input reads from another Work in %s', async workspaceId => {
  const host = await fixture(), { remote } = host
  const source = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Source', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, source)
  const { runId } = await acceptRun(host, source)
  const other = await remote.mutate({ type: 'new-work', workspaceId, value: { name: 'Other', goal: 'Paint snow' } }, signal())
  await expect(remote.getRunInput({ workspaceId, workId: other.workId!, runId }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_SCOPE_MISMATCH' } })
  expect((await remote.getProjection(other, signal())).runs).toEqual([])
})

it('rejects incomplete generation input before creating a Task or Run and retains the draft', async () => {
  const host = await fixture(), { remote } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Incomplete input', goal: 'Paint rain' } }, signal())
  await remote.mutate({ ...selected, type: 'update-draft', field: 'positive_prompt', value: 'Retained prompt' }, signal())
  const before = await remote.getProjection(selected, signal())
  await expect(remote.mutate({ ...selected, type: 'run' }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_TEMPLATE_REQUIRED' } })
  const after = await remote.getProjection(selected, signal())
  expect(after.branches).toEqual(before.branches)
  expect(after.tasks).toEqual([])
  expect(after.runs).toEqual([])
})

it('persists the real compiler description through Source preparation and Runtime for historical Remote reads', async () => {
  const workflow: UiWorkflow = { version: 0.4, nodes: [
    { id: 1, type: 'ImageProducer', mode: 0, inputs: [], outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [11] }], widgets_values: ['source.png'] },
    { id: 40, type: 'Seed (rgthree)', mode: 0, inputs: [], outputs: [{ name: 'SEED', type: 'INT', links: [] }], widgets_values: [-1], widgets_values_named: { seed: -1 } },
    { id: 2, type: 'CLIPTextEncode', mode: 0, inputs: [{ name: 'clip', type: 'CLIP', link: 10 }, { name: 'text', type: 'STRING', link: null, widget: { name: 'text' } }], outputs: [], widgets_values: ['Template positive'] },
    { id: 3, type: 'SaveImage', mode: 0, inputs: [{ name: 'images', type: 'IMAGE', link: 11 }, { name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } }], outputs: [], widgets_values: ['output'] },
  ], links: [[10, 1, 0, 2, 0, 'CLIP'], [11, 1, 0, 3, 0, 'IMAGE']] }
  const source = { readTemplate: vi.fn(async () => ({ id: '5', title: 'Archived template', workflow })), readInstance: vi.fn(async (id: string) => ({ id, title: 'Node', url: 'http://comfy.test', credentialType: 'none' as const, authorization: null })) }
  const fetchDefinitions = vi.fn(async () => new Response(JSON.stringify({
    ImageProducer: { input: { required: { source: ['STRING', {}] } }, input_order: { required: ['source'], optional: [] }, output_node: false },
    'Seed (rgthree)': { input: { required: { seed: ['INT', { default: 0, min: -1125899906842624, max: 1125899906842624 }] } }, input_order: { required: ['seed'], optional: [] }, output_node: false },
    CLIPTextEncode: { input: { required: { clip: ['CLIP'], text: ['STRING', {}] } }, input_order: { required: ['clip', 'text'], optional: [] }, output_node: false },
    SaveImage: { input: { required: { images: ['IMAGE'], filename_prefix: ['STRING', {}] } }, input_order: { required: ['images', 'filename_prefix'], optional: [] }, output_node: true },
  })))
  const compiler = new ComfyWorkflowCompiler({ createRandomSeed: () => 38_521_047, fetchImplementation: fetchDefinitions, officialApiWorkflowCompiler: { compile: async input => ({ apiWorkflow: input.runtimeProjection, cacheKey: 'historical-input-fixture', cacheStatus: 'miss' }) } })
  const host = await fixture(new SourceGenerationPreparer({ defaultInstanceId: '8', source, compiler })), { remote } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Compiled history', goal: 'Paint rain' } }, signal())
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal())
  await remote.mutate({ ...selected, type: 'resource-remove', value: 'model' }, signal())
  await remote.mutate({ ...selected, type: 'update-draft', field: 'instance_id', value: '8' }, signal())
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'comfyui-template', id: '5' } }, signal())
  await remote.mutate({ ...selected, type: 'update-draft', field: 'positive_prompt', value: 'Historical effective prompt' }, signal())
  await remote.mutate({ ...selected, type: 'update-draft', field: 'parameter', id: 'seed', value: -1 }, signal())
  const { runId } = await acceptRun(host, selected)
  await host.runtime.advance()
  source.readTemplate.mockRejectedValue(new Error('The template is deleted'))
  fetchDefinitions.mockRejectedValue(new Error('The instance is offline'))
  const result = await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())
  expect(result.prompt_input).toEqual({ positive_prompt: 'Historical effective prompt', negative_prompt: null })
  expect(result.input_description?.parameters).toEqual(expect.arrayContaining([
    expect.objectContaining({ parameter_id: 'positive_prompt', kind: 'positive_prompt', current_value: 'Historical effective prompt' }),
    expect.objectContaining({ parameter_id: 'seed', kind: 'seed', current_value: 38_521_047 }),
  ]))
  expect(result.generation_input.parameters.seed).toBe(-1)
  expect(result.generation_input.parameters.positive_prompt).toBe('Historical effective prompt')
})

it('retries a failed later candidate with its saved prompts, model, context and exact generation input', async () => {
  const host = await preparedFixture({ submit: async input => { input.onRequestStart(); return { promptId: input.promptId } }, observe: async () => ({ status: 'error', outputs: [], error: { code: 'COMFYUI_REMOTE_ERROR', message: 'Controlled generation failure' } }), download: vi.fn() })
  const { remote, runtime, service } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Candidate retry', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, selected)
  await remote.mutate({ ...selected, type: 'update-draft', field: 'positive_prompt', value: 'Initial rain' }, signal())
  const source = await acceptRun(host, selected, 'experiment')
  for (let phase = 0; phase < 3; phase += 1) await runtime.advance()
  await service.publish({ taskId: source.task.task_id, artifact: { type: 'review', observation: 'First failure', conclusion: 'Try snow', run_ids: [source.runId] } }, { ...source.identity, callId: 'review' })
  host.catalog.resolveGenerationModel.mockImplementation(async id => ({ id, file_name: 'paint.safetensors', base_model_id: id === '4' ? '9' : '1' }))
  const candidate = { ...source.task.input.generation_input, model: { id: '4', file_name: 'paint.safetensors' }, parameters: { positive: 'Candidate snow', negative: 'mist', seed: 31 } }
  await service.publish({ taskId: source.task.task_id, artifact: { type: 'generation_input', generation_input: candidate, context_refs: [{ kind: 'character', id: '8' }] } }, { ...source.identity, callId: 'candidate' })
  const accepted = await runtime.acceptGenerations(source.identity, [{ requestId: randomUUID(), request: toGenerationRequest({ ...candidate, instance_id: '8', template_id: '5' }) }], undefined, source.task.task_id)
  const runId = accepted.items[0]!.runId
  for (let phase = 0; phase < 3; phase += 1) await runtime.advance()
  const failed = (await remote.getProjection(selected, signal())).runs.find(run => run.run_id === runId)!
  const retried = await acceptRun(host, selected, 'retry', runId)
  expect(retried.task.input).toMatchObject({ generation_input: candidate, prompt_input: { positive_prompt: 'Candidate snow', negative_prompt: 'mist' }, base_model_id: '9', context_refs: [{ kind: 'character', id: '8' }] })
  const after = await remote.getProjection(selected, signal())
  expect(after.runs.find(run => run.run_id === retried.runId)).toMatchObject({ workbench_task_id: retried.task.task_id, retry_of_run_id: runId, generation_input: candidate })
  expect(after.runs.find(run => run.run_id === runId)).toEqual(failed)
})

it.each([true, false])('copies a described Run input when Catalog metadata is unavailable: explicit model=%s', async explicitModel => {
  const host = await preparedFixture(), { remote } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Archived resources', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, selected)
  if (!explicitModel) await remote.mutate({ ...selected, type: 'resource-remove', value: 'model' }, signal())
  await remote.mutate({ ...selected, type: 'update-draft', field: 'positive_prompt', value: 'Archived rain' }, signal())
  const { task, runId } = await acceptRun(host, selected)
  await host.runtime.advance()
  host.catalog.resolveGenerationModel.mockRejectedValue(new CatalogError('CATALOG_PROTOCOL_ERROR', 'Model record no longer exists'))
  host.catalog.resolveTemplate.mockRejectedValue(new Error('Current template is unavailable'))
  const created = await remote.mutate({ ...selected, type: 'create-branch', runId, value: { name: 'Copied source', original_request: 'Keep the archived input' } }, signal())
  const branch = (await remote.getProjection(created, signal())).branches.find(branch => branch.branch_id === created.branchId)!
  expect(branch.draft).toMatchObject({ generation_input: task.input.generation_input, prompt_input: { positive_prompt: 'Archived rain', negative_prompt: '' }, base_model_id: null })
})

it('preserves unexpected Catalog failures instead of treating them as missing optional metadata', async () => {
  const host = await preparedFixture(), { remote } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Unexpected Catalog failure', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, selected)
  const { runId } = await acceptRun(host, selected)
  await host.runtime.advance()
  const failure = new Error('Unexpected Catalog implementation failure')
  host.catalog.resolveGenerationModel.mockRejectedValue(failure)
  const before = (await remote.getProjection(selected, signal())).branches
  await expect(remote.mutate({ ...selected, type: 'create-branch', runId, value: { name: 'Unwritten branch', original_request: 'Copy the source' } }, signal())).rejects.toBe(failure)
  expect((await remote.getProjection(selected, signal())).branches).toEqual(before)
  expect((await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())).run_id).toBe(runId)
})

it('keeps eight independent Run identities and their own Task provenance for identical fixed input', async () => {
  const host = await fixture(), { remote, runtime } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Run cards', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, selected)
  const accepted = []
  for (let index = 0; index < 8; index += 1) accepted.push(await acceptRun(host, selected))
  const projection = await remote.getProjection(selected, signal())
  expect(new Set(projection.runs.map(run => run.run_id)).size).toBe(8)
  for (const item of accepted) {
    expect(projection.runs.find(run => run.run_id === item.runId)).toMatchObject({ workbench_task_id: item.task.task_id, initiator: 'human', retry_of_run_id: null, generation_input: item.task.input.generation_input })
    expect(projection.tasks.find(task => task.task_id === item.task.task_id)?.binding_snapshot).toEqual(item.task.binding_snapshot)
  }
  const source = accepted[0]!
  await expect(runtime.acceptGenerations(source.identity, [{ requestId: randomUUID(), request: toGenerationRequest({ ...source.task.input.generation_input, instance_id: '8', template_id: '5' }) }], undefined, source.task.task_id)).rejects.toMatchObject({ code: 'WORKBENCH_BUDGET_EXHAUSTED' })
  expect((await remote.getProjection(selected, signal())).runs).toHaveLength(8)
})
async function undescribedCandidateFixture() {
  const host = await fixture(), { remote, runtime, service } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Unmapped candidate', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, selected)
  await remote.mutate({ ...selected, type: 'update-draft', field: 'positive_prompt', value: 'Initial rain' }, signal())
  const source = await acceptRun(host, selected, 'experiment')
  await runtime.advance()
  await service.publish({ taskId: source.task.task_id, artifact: { type: 'review', observation: 'Prepare failed', conclusion: 'Use candidate', run_ids: [source.runId] } }, { ...source.identity, callId: 'review' })
  const candidate = { ...source.task.input.generation_input, parameters: { positive: 'Candidate snow', negative: 'Candidate mist', seed: 31, opaque: { keep: true } } }
  await service.publish({ taskId: source.task.task_id, artifact: { type: 'generation_input', generation_input: candidate, context_refs: [{ kind: 'character', id: '8' }] } }, { ...source.identity, callId: 'candidate' })
  const accepted = await runtime.acceptGenerations(source.identity, [{ requestId: randomUUID(), request: toGenerationRequest({ ...candidate, instance_id: '8', template_id: '5' }) }], undefined, source.task.task_id)
  const runId = accepted.items[0]!.runId
  await runtime.advance()
  return { host, selected, source, candidate, runId }
}

it('retries and branches an undescribed later candidate without borrowing Task prompts or current template defaults', async () => {
  const { host, selected, candidate, runId } = await undescribedCandidateFixture()
  const { remote } = host
  const before = await remote.getProjection(selected, signal())
  const sourceRun = before.runs.find(run => run.run_id === runId)!
  host.inspect.mockClear().mockRejectedValue(new Error('Current template description is unavailable'))
  const historical = await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())
  expect(historical.prompt_input).toEqual({ positive_prompt: null, negative_prompt: null })
  const retried = await acceptRun(host, selected, 'retry', runId)
  expect(retried.task.input).toMatchObject({ generation_input: candidate, prompt_input: { positive_prompt: null, negative_prompt: null }, context_refs: [{ kind: 'character', id: '8' }] })
  const created = await remote.mutate({ ...selected, type: 'create-branch', runId, value: { name: 'Raw candidate branch', original_request: 'Keep all candidate inputs' } }, signal())
  const branch = (await remote.getProjection(created, signal())).branches.find(branch => branch.branch_id === created.branchId)!
  expect(branch).toMatchObject({ parent_branch_id: selected.branchId, source_run_id: runId, draft: { generation_input: candidate, prompt_input: { positive_prompt: null, negative_prompt: null }, context_refs: [{ kind: 'character', id: '8' }] } })
  const copiedRun = await acceptRun(host, created)
  expect(copiedRun.task.input.generation_input).toEqual(candidate)
  expect(host.inspect).not.toHaveBeenCalled()
  const after = await remote.getProjection(selected, signal())
  expect(after.runs.find(run => run.run_id === runId)).toEqual(sourceRun)
  expect(after.branches.find(item => item.branch_id === selected.branchId)).toEqual(before.branches.find(item => item.branch_id === selected.branchId))
})

it.each(['positive_prompt', 'negative_prompt'] as const)('projects only an explicitly edited %s slot, including an explicit empty string', async kind => {
  const { host, selected, candidate, runId } = await undescribedCandidateFixture()
  const { remote, service } = host
  const created = await remote.mutate({ ...selected, type: 'create-branch', runId, value: { name: 'Edit one slot', original_request: 'Keep untouched raw values' } }, signal())
  for (const value of ['Edited candidate prompt', '']) {
    await remote.mutate({ ...created, type: 'update-draft', field: kind, value }, signal())
    const branch = (await remote.getProjection(created, signal())).branches.find(item => item.branch_id === created.branchId)!
    expect(branch.draft.prompt_input).toEqual({ positive_prompt: null, negative_prompt: null, [kind]: value })
    expect(branch.draft.generation_input).toEqual(candidate)
    const submitted = await acceptRun(host, created)
    expect(submitted.task.input.generation_input).toEqual({ ...candidate, parameters: { ...candidate.parameters, [kind === 'positive_prompt' ? 'positive' : 'negative']: value } })
    expect((await service.getTask({ taskId: submitted.task.task_id }, submitted.identity)).prompt_input).toEqual(branch.draft.prompt_input)
  }
  expect((await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())).generation_input).toEqual(candidate)
})
it.each(['positive_prompt', 'negative_prompt'] as const)('applies an Agent Prompt artifact with only %s resolved and preserves the other raw slot', async kind => {
  const { host, selected, candidate, runId } = await undescribedCandidateFixture()
  const { remote, service } = host
  const created = await remote.mutate({ ...selected, type: 'create-branch', runId, value: { name: 'Agent edits one slot', original_request: 'Keep unresolved input' } }, signal())
  const receipt = await remote.mutate({ ...created, type: 'agent-action', id: 'prompt' }, signal())
  const task = (await remote.getProjection(created, signal())).tasks.find(item => item.task_id === receipt.taskId)!
  const identity = { workspaceId: created.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'prompt' }
  const fixed = await service.getTask({ taskId: task.task_id }, identity)
  expect(fixed.prompt_input).toEqual({ positive_prompt: null, negative_prompt: null })
  const artifact = { type: 'prompt', ...fixed.prompt_input, [kind]: '' }
  const published = await service.publish({ taskId: task.task_id, artifact }, identity)
  expect(published.disposition).toBe('applied')
  const result = await service.getTask({ taskId: task.task_id }, identity)
  expect(result.artifacts).toEqual([{ artifact_id: published.artifact_id, artifact, disposition: 'applied' }])
  const branch = (await remote.getProjection(created, signal())).branches.find(item => item.branch_id === created.branchId)!
  expect(branch.draft.prompt_input).toEqual({ positive_prompt: null, negative_prompt: null, [kind]: '' })
  const submitted = await acceptRun(host, created)
  expect(submitted.task.input.generation_input).toEqual({ ...candidate, parameters: { ...candidate.parameters, [kind === 'positive_prompt' ? 'positive' : 'negative']: '' } })
})

it('preserves edited unknown input when its canonical Prompt slot has no available parameter mapping', async () => {
  const { host, selected, runId } = await undescribedCandidateFixture()
  const { remote } = host
  const created = await remote.mutate({ ...selected, type: 'create-branch', runId, value: { name: 'Missing mapping', original_request: 'Keep my edit' } }, signal())
  await remote.mutate({ ...created, type: 'update-draft', field: 'positive_prompt', value: 'Edited positive' }, signal())
  const before = await remote.getProjection(created, signal())
  host.inspect.mockResolvedValue({ parameters: [], size_candidates: [] })
  await expect(remote.mutate({ ...created, type: 'run' }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_PROMPT_PARAMETER_REQUIRED' } })
  const after = await remote.getProjection(created, signal())
  expect(after.branches).toEqual(before.branches)
  expect(after.tasks).toEqual(before.tasks)
  expect(after.runs).toEqual([])
})
it('preserves null Prompt edits and rejects nontext values before changing the draft', async () => {
  const { host, selected, runId } = await undescribedCandidateFixture()
  const { remote } = host
  const created = await remote.mutate({ ...selected, type: 'create-branch', runId, value: { name: 'Nullable edit', original_request: 'Keep unknown distinct from empty' } }, signal())
  await remote.mutate({ ...created, type: 'update-draft', field: 'positive_prompt', value: null }, signal())
  const before = await remote.getProjection(created, signal())
  expect(before.branches.find(item => item.branch_id === created.branchId)!.draft.prompt_input).toEqual({ positive_prompt: null, negative_prompt: null })
  await expect(remote.mutate({ ...created, type: 'update-draft', field: 'negative_prompt', value: 123 }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_INVALID_INPUT' } })
  expect((await remote.getProjection(created, signal())).branches).toEqual(before.branches)
})
it('compiles an unmapped opaque candidate again through Run branch and raw retry without requiring an inspection', async () => {
  const workflow: UiWorkflow = { version: 0.4, nodes: [
    { id: 1, type: 'ImageProducer', mode: 0, inputs: [], outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [11] }], widgets_values: ['source.png'] },
    { id: 2, type: 'CLIPTextEncode', mode: 0, inputs: [{ name: 'clip', type: 'CLIP', link: 10 }, { name: 'text', type: 'STRING', link: null, widget: { name: 'text' } }], outputs: [], widgets_values: ['Template positive'] },
    { id: 3, type: 'SaveImage', mode: 0, inputs: [{ name: 'images', type: 'IMAGE', link: 11 }, { name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } }], outputs: [], widgets_values: ['output'] },
  ], links: [[10, 1, 0, 2, 0, 'CLIP'], [11, 1, 0, 3, 0, 'IMAGE']] }
  const opaqueWorkflow: UiWorkflow = { ...workflow, nodes: [...workflow.nodes, {
    id: 45, type: 'UnpublishedContractNode', mode: 0, inputs: [{ name: 'sampler_name', type: 'UNPUBLISHED_VALUE', link: null, widget: { name: 'sampler_name' } }], outputs: [], widgets_values: [{ a: 1, b: [2] }],
  }] }
  const source = {
    readTemplate: async (id: string) => ({ id, title: id === '6' ? 'Opaque template' : 'Plain template', workflow: id === '6' ? opaqueWorkflow : workflow }),
    readInstance: async (id: string) => ({ id, title: 'Node', url: 'http://comfy.test', credentialType: 'none' as const, authorization: null }),
  }
  const compiler = new ComfyWorkflowCompiler({ fetchImplementation: async () => new Response(JSON.stringify({
    ImageProducer: { input: { required: { source: ['STRING', {}] } }, input_order: { required: ['source'], optional: [] }, output_node: false },
    CLIPTextEncode: { input: { required: { clip: ['CLIP'], text: ['STRING', {}] } }, input_order: { required: ['clip', 'text'], optional: [] }, output_node: false },
    SaveImage: { input: { required: { images: ['IMAGE'], filename_prefix: ['STRING', {}] } }, input_order: { required: ['images', 'filename_prefix'], optional: [] }, output_node: true },
    UnpublishedContractNode: { input: { required: { sampler_name: ['UNPUBLISHED_VALUE', {}] } }, input_order: { required: ['sampler_name'], optional: [] }, output_node: false },
  })), officialApiWorkflowCompiler: { compile: async input => ({ apiWorkflow: input.runtimeProjection, cacheKey: 'opaque-candidate-fixture', cacheStatus: 'miss' }) } })
  const host = await fixture(new SourceGenerationPreparer({ defaultInstanceId: '8', source, compiler }), {
    submit: async input => { input.onRequestStart(); return { promptId: input.promptId } },
    observe: async () => ({ status: 'error', outputs: [], error: { code: 'COMFYUI_REMOTE_ERROR', message: 'Controlled generation failure' } }), download: vi.fn(),
  })
  const { remote, runtime, service } = host
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Opaque candidate history', goal: 'Paint rain' } }, signal())
  await selectGeneration(host, selected)
  await remote.mutate({ ...selected, type: 'resource-remove', value: 'model' }, signal())
  const initial = await acceptRun(host, selected, 'experiment')
  for (let phase = 0; phase < 3; phase += 1) await runtime.advance()
  await service.publish({ taskId: initial.task.task_id, artifact: { type: 'review', observation: 'First run failed', conclusion: 'Try opaque template', run_ids: [initial.runId] } }, { ...initial.identity, callId: 'review' })
  const candidate = { ...initial.task.input.generation_input, template_id: '6', parameters: { positive_prompt: 'Opaque candidate snow', sampler_name: { b: [2], a: 1 } } }
  await service.publish({ taskId: initial.task.task_id, artifact: { type: 'generation_input', generation_input: candidate, context_refs: [{ kind: 'character', id: '8' }] } }, { ...initial.identity, callId: 'candidate' })
  const accepted = await runtime.acceptGenerations(initial.identity, [{ requestId: randomUUID(), request: toGenerationRequest({ ...candidate, instance_id: '8' }) }], undefined, initial.task.task_id)
  const runId = accepted.items[0]!.runId
  for (let phase = 0; phase < 3; phase += 1) await runtime.advance()
  const fixed = await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())
  expect(fixed).toMatchObject({ generation_input: candidate, input_description: null, prompt_input: { positive_prompt: null, negative_prompt: null } })
  const before = (await remote.getProjection(selected, signal())).runs.find(run => run.run_id === runId)!
  const created = await remote.mutate({ ...selected, type: 'create-branch', runId, value: { name: 'Opaque branch', original_request: 'Keep opaque parameters' } }, signal())
  const fromBranch = await acceptRun(host, created)
  await runtime.advance()
  const retry = await acceptRun(host, selected, 'retry', runId)
  await runtime.advance()
  const after = await remote.getProjection({ workspaceId: selected.workspaceId, workId: selected.workId }, signal())
  for (const copied of [fromBranch, retry]) {
    expect(copied.task.input).toMatchObject({ generation_input: candidate, prompt_input: { positive_prompt: null, negative_prompt: null }, context_refs: fixed.context_refs })
    expect(after.runs.find(run => run.run_id === copied.runId)).toMatchObject({ status: copied === fromBranch ? 'remote_pending' : 'prepared', generation_input: candidate })
    expect((await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId: copied.runId }, signal())).input_description).toBeNull()
  }
  expect(after.runs.find(run => run.run_id === runId)).toEqual(before)
})
it('reuses an undescribed experience through the source Run branch with fixed raw input', async () => {
  const { host, selected, candidate, runId } = await undescribedCandidateFixture()
  const { remote } = host
  const before = await remote.getProjection(selected, signal())
  const review = before.runs.find(run => run.run_id === runId)!.review_draft!
  await remote.mutate({ ...selected, type: 'evaluate', runId, value: { expected: review, draft: { ...review, title: 'Opaque source setup', conditions: 'Keep raw input', note: 'Repeat source setup' }, saveExperience: true } }, signal())
  const experience = (await remote.getProjection(selected, signal())).experiences[0]!
  const sibling = await remote.mutate({ ...selected, type: 'create-branch', value: { name: 'Browsing sibling', original_request: 'Other input' } }, signal())
  host.inspect.mockClear().mockRejectedValue(new Error('The current template is unavailable'))
  host.catalog.resolveGenerationModel.mockRejectedValue(new CatalogError('CATALOG_QUERY_FAILED', 'The current model catalog is unavailable'))
  host.catalog.details.mockRejectedValue(new CatalogError('CATALOG_QUERY_FAILED', 'The current resource catalog is unavailable'))
  const reused = await remote.mutate({ ...sibling, type: 'reuse', id: experience.experience_id, value: { name: 'Opaque recheck', baseModelId: '1' } }, signal())
  const after = await remote.getProjection(reused, signal())
  expect(after.branches.find(branch => branch.branch_id === reused.branchId)).toMatchObject({
    name: 'Opaque recheck', original_request: 'Paint rain', parent_branch_id: selected.branchId, source_run_id: runId, source_experience_id: experience.experience_id,
    draft: { base_model_id: '1', generation_input: candidate, context_refs: [{ kind: 'character', id: '8' }], prompt_input: { positive_prompt: null, negative_prompt: null } },
  })
  expect(host.inspect).not.toHaveBeenCalled()
  expect((await remote.getRunInput({ workspaceId: selected.workspaceId, workId: selected.workId!, runId }, signal())).generation_input).toEqual(candidate)
})

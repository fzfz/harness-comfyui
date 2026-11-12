import { contracts } from '#contracts'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { apply as registerWorkbenchTools } from '../../src/host/workbench/tools.ts'
import { afterEach, expect, it, vi } from 'vitest'
import { createWorkbenchHostFixture } from '../support/workbench-host.ts'
import { saveFixtureDraft } from '../support/workbench-draft.ts'

import { WorkbenchService } from '../../src/workbench/service.ts'
import { WORKBENCH_FUNCTIONS as defaults } from '../../src/workbench/functions.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { while (cleanups.length) await cleanups.pop()!() })

async function fixture() {
  const host = await createWorkbenchHostFixture(); cleanups.push(host.dispose)
  const signal = new AbortController().signal
  const selected = await host.remote.mutate({ workspaceId: 'workspace_1', type: 'new-work', value: { name: 'Glass', goal: 'Warm light' } }, signal)
  await saveFixtureDraft(host.remote, selected, draft => { draft.generation_input.instance_id = '8' }, signal)
  for (const value of [{ kind: 'model', id: '2' }, { kind: 'comfyui-template', id: '5' }]) await host.remote.mutate({ ...selected, type: 'resource-select', value }, signal)
  await saveFixtureDraft(host.remote, selected, () => {}, signal)
  const receipt = await host.remote.mutate({ ...selected, type: 'experiment' }, signal)
  const parent = host.store.getTask(receipt.taskId!)
  const delegate = vi.fn(async (input: { taskId: string; sessionId: string }) => {
    expect(host.store.getTask(input.taskId).session_id).toBe(input.sessionId)
  })
  const service = new WorkbenchService({ store: host.store, descriptors: defaults, sessions: { authorize: async () => true, create: vi.fn(), dispatch: vi.fn(), delegate } })
  const identity = { workspaceId: 'workspace_1', sessionId: parent.session_id!, turn: 1, callId: 'delegate-1' }
  return { ...host, selected, parent, delegate, service, identity }
}

it('discovers workspace function bindings and delegates with a fixed input and independent child contract', async () => {
  const f = await fixture()
  const binding = f.store.getFunctionBinding('workspace_1', 'prompt')
  f.store.saveFunctionBinding({ ...binding, preset_id: 'specialist-prompt', agent_model: { provider: 'lan', model: 'luna', reasoningEffort: 'off' } })
  const listed = await f.service.listFunctions({ taskId: f.parent.task_id }, f.identity)
  expect(listed.functions.find(item => item.function_id === 'prompt')).toMatchObject({ preset_id: 'specialist-prompt', agent_model: { model: 'luna' } })
  expect(listed.functions.map(item => item.kind)).not.toContain('experiment')
  expect(listed.functions.map(item => item.kind)).not.toContain('translate')
  const result = await f.service.delegateFunction({ task_id: f.parent.task_id, function_id: 'prompt', instructions: 'Keep the glass structure and change sunlight to warm lamps.', source: { type: 'initial' }, reference_artifact_ids: [] }, f.identity)
  const child = f.store.getTask(result.task_id)
  expect(child).toMatchObject({ parent_experiment_task_id: f.parent.task_id, kind: 'prompt', input: { requirements: { original_request: 'Warm light', instructions: 'Keep the glass structure and change sunlight to warm lamps.' }, generation_input: f.parent.input.generation_input }, binding_snapshot: { preset_id: 'specialist-prompt', agentModel: { model: 'luna' } }, output_contract: { apply_mode: 'record', artifact_types: ['prompt'] } })
  expect(f.delegate).toHaveBeenCalledWith(expect.objectContaining({ presetId: 'specialist-prompt', parentSessionId: f.parent.session_id, taskId: child.task_id, text: child.request_text }))
})

it('rejects recursive experiment delegation and a stopped parent without creating children', async () => {
  const f = await fixture()
  const request = { task_id: f.parent.task_id, function_id: 'experiment', instructions: 'work', source: { type: 'initial' as const }, reference_artifact_ids: [] }
  await expect(f.service.delegateFunction(request, f.identity)).rejects.toThrow()
  f.store.endExperiment(f.parent.task_id, 'user_ended')
  await expect(f.service.delegateFunction({ ...request, function_id: 'prompt' }, f.identity)).rejects.toThrow()
  expect(f.store.listChildTasks(f.parent.task_id)).toEqual([])
})

it('passes the selected preset and route to the official child API after binding its task', async () => {
  const f = await fixture()
  const start = vi.fn(async (spec: { childId: string; request: { parent: unknown; agentPreset: string; agentOptions: unknown }; delivery: string }) => {
    expect(f.store.taskForSession(spec.childId)?.parent_experiment_task_id).toBe(f.parent.task_id)
    return { childId: spec.childId, result: Promise.resolve({ stopReason: 'completed' }), dispose: async () => {} }
  })
  Object.assign(f.ctx.subagents, { startActivation: start, resolveMaxDepth: () => 1 })
  const binding = f.store.getFunctionBinding('workspace_1', 'prompt')
  f.store.saveFunctionBinding({ ...binding, preset_id: 'specific-prompt', agent_model: { provider: 'lan', model: 'luna', reasoningEffort: 'off' } })
  const result = await f.ctx.harnessComfyuiWorkbench.service.delegateFunction({ task_id: f.parent.task_id, function_id: 'prompt', instructions: 'Warm lighting', source: { type: 'initial' }, reference_artifact_ids: [] }, f.identity)
  expect(start).toHaveBeenCalledWith(expect.objectContaining({
    provider: 'spawn', childId: result.session_id, delivery: 'parent',
    request: expect.objectContaining({ parent: f.official.agents.get(f.parent.session_id!), agentPreset: 'specific-prompt', agentOptions: { provider: 'lan', model: 'luna', reasoningEffort: 'off' }, maxDepth: 1 }),
  }))
})

it('exposes function discovery and delegation through the coordinator native tool surface', async () => {
  const f = await fixture()
  const tools = new Map<string, ToolDefinition>()
  const ctx = { tools: { register: (tool: ToolDefinition) => tools.set(tool.name, tool) }, harnessComfyuiWorkbench: { service: f.service } } as unknown as Context
  registerWorkbenchTools(ctx, { tools: ['workbench_function_list', 'workbench_function_delegate'] })
  expect([...tools.keys()]).toEqual(['workbench_function_list', 'workbench_function_delegate'])
  const execution = { callId: 'call', rootCallId: 'call', signal: new AbortController().signal, agent: { session: { id: f.parent.session_id, snapshotEvents: () => [{ type: 'tool/call', data: { callId: 'call', turn: 1 } }] } } } as unknown as ToolRunContext
  const listing = await tools.get('workbench_function_list')!.execute({ task_id: f.parent.task_id }, execution)
  expect(listing).toMatchObject({ task_id: f.parent.task_id, functions: expect.arrayContaining([expect.objectContaining({ function_id: 'review', artifact_types: ['review'] })]) })
  const result = await tools.get('workbench_function_delegate')!.execute({ task_id: f.parent.task_id, function_id: 'prompt', instructions: 'warmer lamps', source: { type: 'initial' } }, execution)
  expect(result).toMatchObject({ parent_experiment_task_id: f.parent.task_id, function_id: 'prompt', task_id: expect.any(String), session_id: expect.any(String) })
})

it.each(['completed', 'blocked'] as const)('persists the official %s child outcome after releasing its session', async stopReason => {
  const f = await fixture()
  Object.assign(f.ctx.subagents, { startActivation: vi.fn(async () => ({ result: new Promise(() => {}), dispose: async () => {} })), resolveMaxDepth: () => 1 })
  const binding = f.store.getFunctionBinding('workspace_1', 'prompt')
  f.store.saveFunctionBinding({ ...binding, requested_skill: 'prompt-builder' })
  const child = await f.ctx.harnessComfyuiWorkbench.service.delegateFunction({ task_id: f.parent.task_id, function_id: 'prompt', instructions: 'Warm lighting', source: { type: 'initial' }, reference_artifact_ids: [] }, f.identity)
  expect(f.official.acquireScope).toHaveBeenCalledWith(binding.preset_id)
  expect(f.official.disposeScope).toHaveBeenCalled()
  f.ctx.emit('subagent/end', { id: child.session_id, stopReason } as never)
  expect(f.store.getTask(child.task_id).execution_state).toBe(stopReason === 'completed' ? 'idle' : 'failed')
  const result = await f.ctx.harnessComfyuiWorkbench.service.getTask({ taskId: f.parent.task_id }, f.identity)
  expect(result.children).toContainEqual(expect.objectContaining({ task_id: child.task_id, execution_state: stopReason === 'completed' ? 'idle' : 'failed' }))
})

it('pauses delegated children through the official subagent service', async () => {
  const f = await fixture()
  const interrupt = vi.fn()
  Object.assign(f.ctx.subagents, { interrupt })
  f.official.sessions.set('active-child', { header: { cwd: '/workspace/project' } })
  f.descendants.set(f.parent.session_id!, [{ id: 'active-child', mode: 'spawn' }])
  await f.remote.mutate({ ...f.selected, type: 'pause-experiment', taskId: f.parent.task_id }, new AbortController().signal)
  expect(interrupt).toHaveBeenCalledWith('active-child', expect.objectContaining({ kind: 'ancestor', agent: f.official.agents.get(f.parent.session_id!) }))
  expect(f.store.getExperiment(f.parent.task_id)!.control_state).toBe('paused')
})

it('allows experience delegation after reaching the goal and keeps generation stopped', async () => {
  const f = await fixture()
  const input = f.parent.input.generation_input
  const receipt = await f.runtime.acceptGenerations(f.identity, [{ requestId: '11111111-1111-4111-8111-111111111111', request: contracts.parse('runtimeGenerationRequest', 'input', { ...input, instance_id: input.instance_id!, template_id: input.template_id! }) }], undefined, f.parent.task_id)
  await f.runtime.advance()
  const runId = receipt.items[0]!.runId
  f.store.publish(f.parent.task_id, { type: 'review', run_ids: [runId], observation: 'The workflow failed.', conclusion: 'Use the failure evidence.' }, f.identity)
  f.store.endExperiment(f.parent.task_id, 'goal_met')
  const request = { task_id: f.parent.task_id, instructions: 'Summarize the applicable failure conditions.', source: { type: 'run' as const, run_id: runId }, reference_artifact_ids: [] }
  const child = await f.service.delegateFunction({ ...request, function_id: 'experience' }, f.identity)
  expect(f.store.getTask(child.task_id)).toMatchObject({ kind: 'experience', parent_experiment_task_id: f.parent.task_id, input: { evaluation_input: { run_id: runId } } })
  await expect(f.service.delegateFunction({ ...request, function_id: 'run' }, f.identity)).rejects.toThrow()
})

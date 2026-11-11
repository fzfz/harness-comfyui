import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import type { Task } from '../../src/workbench/contract.ts'
import { WORKBENCH_FUNCTIONS } from '../../src/workbench/functions.ts'
import { DEFAULT_PROMPT_REQUEST_PARTS } from '../../src/workbench/request-template.ts'
import { createWorkbenchHostFixture } from '../support/workbench-host.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function fixture() {
  const host = await createWorkbenchHostFixture()
  cleanups.push(host.dispose)
  const { store } = host
  store.ensureFunctionBindings('workspace_1', WORKBENCH_FUNCTIONS, { presetId: 'preset-a', agentModel: { provider: 'provider-a', model: 'model-a' } })
  const { branch } = store.createWork({ workspaceId: 'workspace_1', name: 'Glass', goal: 'Warm light on glass' })
  const create = (kind: 'experiment' | 'prompt', parent?: Task) => {
    const binding = store.getFunctionBinding('workspace_1', kind)
    const descriptor = WORKBENCH_FUNCTIONS.find(item => item.kind === kind)!
    const { instructions: _instructions, ...draft } = branch.draft
    return store.createTask({
      branchId: branch.branch_id, parentExperimentTaskId: parent?.task_id, functionId: kind, kind, title: binding.name,
      input: { ...draft, base_model_id: '1', generation_input: { ...draft.generation_input, instance_id: '8', template_id: '5' }, requirements: { original_request: branch.original_request, instructions: '' }, reference_task_artifacts: [], requested_skill: null, max_runs: kind === 'experiment' ? 2 : 0, ...(parent ? { delegation_source: { type: 'initial' as const } } : {}) },
      outputContract: { ...descriptor.output_contract, apply_mode: 'record' }, applyTarget: { kind: 'branch', id: branch.branch_id, expected: {} },
      bindingSnapshot: { function_id: kind, name: binding.name, kind, preset_id: binding.preset_id, agentModel: binding.agent_model, requested_skill: null, request_template: binding.request_template }, requestText: 'Warm glass prompt request',
    })
  }
  const start = (parent: Task) => {
    const task = create('prompt', parent)
    return store.beginPromptTurn({
      request_id: randomUUID(), task_id: task.task_id, function_id: 'prompt', kind: 'prompt', intent: 'generate', candidate: null, session_id: randomUUID(), harness_turn: 1,
      preset_id: task.binding_snapshot.preset_id, agent_model: task.binding_snapshot.agentModel,
      input: { original_request: branch.original_request, base_model_id: '1', base_model_name: 'SDXL', positive_prompt: '', negative_prompt: '', change_request: '', reference_context: {} },
      request_template: task.binding_snapshot.request_template, request_parts: DEFAULT_PROMPT_REQUEST_PARTS, request_text: task.request_text,
      status: 'running', error: null, artifact_id: null, result: null, adopted: null, applied_at: null, created_at: Date.now(), finished_at: null, start_seq: -1,
    })
  }
  return { store, create, start }
}

it.each(['pause', 'interrupt'] as const)('stops active child prompt requests on parent %s while preserving completed and unrelated requests', async action => {
  const { store, create, start } = await fixture()
  const parent = create('experiment'), unrelatedParent = create('experiment')
  const active = start(parent), completed = start(parent), unrelated = start(unrelatedParent)
  const finished = store.updatePromptTurn(completed.request_id, { status: 'succeeded', result: { type: 'prompt', positive_prompt: 'Completed warm glass', negative_prompt: '' } })
  store.controlTask(parent.task_id, action)
  expect(store.getExperiment(parent.task_id)?.control_state).toBe(action === 'pause' ? 'paused' : 'ended')
  expect(store.getPromptTurn(active.request_id)).toMatchObject({ status: 'interrupted', finished_at: expect.any(Number), artifact_id: null })
  expect(store.getPromptTurn(completed.request_id)).toEqual(finished)
  expect(store.getPromptTurn(unrelated.request_id)).toEqual(unrelated)
  expect(store.refreshTask(active.task_id).status).toBe('interrupted')
  expect(store.updatePromptTurn(active.request_id, { status: 'succeeded', result: { type: 'prompt', positive_prompt: 'Late result', negative_prompt: '' } })).toMatchObject({ status: 'interrupted', artifact_id: null })
  expect(store.listArtifacts(active.task_id)).toEqual([])
})

import { expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { apply, Config } from '../../src/host/workbench/tools.ts'
import Schema from '@deepseek-ai/schemastery'
import { createWorkbenchHostFixture } from '../support/workbench-host.ts'
import { saveFixtureDraft } from '../support/workbench-draft.ts'
import { assertSupportedJsonSchema, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'

it.each([
  { input: {}, expected: ['workbench_task_get', 'workbench_task_publish', 'workbench_experiment_end'] },
  { input: { tools: [] }, expected: [] },
])('honors the configured native tool selection after official schema resolution: $input', ({ input, expected }) => {
  const names: string[] = []
  const ctx = { tools: { register: (tool: ToolDefinition) => names.push(tool.name) }, harnessComfyuiWorkbench: { service: {} } } as unknown as Context
  apply(ctx, Schema.resolve(input, Config, {})[0])
  expect(names).toEqual(expected)
})

it('exposes the publication contract as the host-supported native tool schema', () => {
  const tools = new Map<string, ToolDefinition>()
  apply({ tools: { register: (tool: ToolDefinition) => tools.set(tool.name, tool) }, harnessComfyuiWorkbench: { service: {} } } as unknown as Context)
  const schema = tools.get('workbench_task_publish')!.parameters
  expect(() => assertSupportedJsonSchema(schema)).not.toThrow()
  expect(validateJsonSchemaValue(schema, { task_id: 'task-a', artifact: { type: 'prompt', positive_prompt: 'garden', negative_prompt: '' } })).toEqual([])
  expect(validateJsonSchemaValue(schema, { task_id: 'task-a', artifact: { type: 'prompt', positive_prompt: 'garden' } })).not.toEqual([])
  expect(validateJsonSchemaValue(schema, { task_id: 'task-a', artifact: { type: 'invented' } })).not.toEqual([])
})

it('ends an experiment through its registered native tool and renders the accepted state', async () => {
  const fixture = await createWorkbenchHostFixture()
  try {
    const signal = new AbortController().signal
    const selected = await fixture.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Garden', goal: 'A garden' } }, signal)
    await saveFixtureDraft(fixture.remote, selected, draft => { draft.generation_input.instance_id = '8'; draft.generation_input.template_id = '5' }, signal)
    const task = await fixture.ctx.harnessComfyuiWorkbench.service.createTask({ workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId!, functionId: 'experiment', maxRuns: 2 })
    const tools = new Map<string, ToolDefinition>()
    apply({ tools: { register: (tool: ToolDefinition) => tools.set(tool.name, tool) }, harnessComfyuiWorkbench: fixture.ctx.harnessComfyuiWorkbench } as unknown as Context)
    const execution = { callId: 'end-call', rootCallId: 'end-call', signal, agent: { session: { id: task.session_id!, header: { cwd: '/workspace/project' }, snapshotEvents: () => [{ type: 'tool/call', data: { callId: 'end-call', turn: 1 } }] as SessionEvent[] } } } as unknown as ToolRunContext
    const end = tools.get('workbench_experiment_end')!
    const result = await end.execute({ task_id: task.task_id, reason: 'user_ended' }, execution)
    expect(validateJsonSchemaValue(end.output.schema, result)).toEqual([])
    expect(result).toMatchObject({ task_id: task.task_id, control_state: 'ended', end_reason: 'user_ended' })
    expect(end.output.render({}, result as never)[0]).toMatchObject({ type: 'text', text: expect.stringContaining('"end_reason":"user_ended"') })
    expect(fixture.store.getExperiment(task.task_id)).toMatchObject({ control_state: 'ended', end_reason: 'user_ended' })
  } finally { await fixture.dispose() }
})

it('reads a task and publishes its prompt through the registered native tools', async () => {
  const fixture = await createWorkbenchHostFixture()
  try {
    await fixture.ctx.harnessComfyuiWorkbench.initializeWorkspace('workspace_1')
    const { work, branch } = fixture.store.createWork({ workspaceId: 'workspace_1', name: 'Garden', goal: 'A garden' })
    await saveFixtureDraft(fixture.remote, { workspaceId: 'workspace_1', workId: work.work_id, branchId: branch.branch_id }, draft => { draft.base_model_id = '1' }, new AbortController().signal)
    const task = await fixture.ctx.harnessComfyuiWorkbench.service.createTask({ workspaceId: 'workspace_1', workId: work.work_id, branchId: branch.branch_id, functionId: 'prompt', instructions: '' })
    fixture.official.events.set(task.session_id!, [
      { type: 'turn/start', seq: 0, data: { turn: 1 } },
      { type: 'user/message', seq: 1, data: { source: { kind: 'user', rpcId: task.task_id } } },
    ] as SessionEvent[])
    const tools = new Map<string, ToolDefinition>()
    apply({ tools: { register: (tool: ToolDefinition) => tools.set(tool.name, tool) }, harnessComfyuiWorkbench: fixture.ctx.harnessComfyuiWorkbench, workspaceRegistry: { resolveByPath: async () => undefined } } as unknown as Context)
    const execution = { callId: 'get-call', rootCallId: 'get-call', signal: new AbortController().signal, agent: { session: { id: task.session_id!, header: { cwd: '/unregistered/other-project' }, snapshotEvents: () => [{ type: 'tool/call', data: { callId: 'get-call', turn: 1 } }] as SessionEvent[] } } } as unknown as ToolRunContext
    const get = tools.get('workbench_task_get')!
    const input = await get.execute({ task_id: task.task_id }, execution)
    expect(validateJsonSchemaValue(get.output.schema, input)).toEqual([])
    expect(get.output.render({}, input as never)[0]).toMatchObject({ type: 'text', text: expect.stringContaining('reference_experiences') })
    const publish = tools.get('workbench_task_publish')!
    const receipt = await publish.execute({ task_id: task.task_id, artifact: { type: 'prompt', positive_prompt: 'a quiet garden', negative_prompt: '' } }, execution)
    expect(receipt).toMatchObject({ task_id: task.task_id, disposition: 'applied' })
    expect(publish.output.render({}, receipt as never)[0]).toMatchObject({ type: 'text', text: expect.stringContaining('"disposition":"applied"') })
    expect(fixture.store.getBranch(branch.branch_id).draft.prompt_input.positive_prompt).toBe('a quiet garden')
    expect(fixture.store.getBranch(branch.branch_id).editing_draft).toBeNull()
  } finally { await fixture.dispose() }
})

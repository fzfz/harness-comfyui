import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'
import {
  assertObjectJsonSchema,
  assertSupportedJsonSchema,
  validateJsonSchemaValue,
} from '@deepseek-ai/dsh-tools'

import { apply } from '../../agent-presets/project-iteration-dispatch.mjs'
import { readProjectAgentPresetResources } from '../../scripts/build/agent-preset-resources.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const { composition } = await readProjectAgentPresetResources(repositoryRoot, 'harness-comfyui-cli-candidate')
const role = composition.find(entry => entry.id === 'task-agent')

function setup() {
  const registered = new Map()
  const subagents = {
    startContinuable: vi.fn(async () => ({ childId: 'child-1' })),
    sendMessage: vi.fn(async () => 'message-1'),
    interrupt: vi.fn(),
  }
  const ctx = {
    tools: { register: tool => {
      assertObjectJsonSchema(tool.parameters)
      assertSupportedJsonSchema(tool.output.schema)
      registered.set(tool.name, tool)
    } },
    subagents,
  }
  apply(ctx, role.config)
  return { registered, subagents }
}

function execution(signal = new AbortController().signal) {
  return { agent: { id: 'parent-1' }, signal }
}

const task = { description: '核对生成参数', task: '读取输入文件并核对本轮生成参数。\n报告具体结果。' }
const message = [{ type: 'text', text: `# 子 Agent 任务\n\n## 本次任务\n${JSON.stringify({ task: task.task }, null, 2)}` }]

describe('workbench project subagent dispatch component', () => {
  it('registers its dispatch tool and declares workspace and native control components', () => {
    expect([...setup().registered.keys()]).toEqual(['subagent_task'])
    expect(role.config.toolFilter.deny).toEqual(['subagent_task', 'interrupt_agent'])
    expect(role.config.parameters.required).toEqual(['description', 'task'])
    expect(role.config.parameters.additionalProperties).toBe(false)
    expect(role.config.agentOptions).toEqual({})
    expect(composition.find(entry => entry.name === '../project-subagent-workspace.mjs')).toBeDefined()
    expect(composition.find(entry => entry.name === '@deepseek-ai/dsh-tool-subagent-control')).toBeDefined()
  })

  it('requests a continuable child through the Subagents service boundary', async () => {
    const { registered, subagents } = setup()
    const exec = execution()
    const result = await registered.get('subagent_task').execute(task, exec)
    expect(result).toEqual({ kind: 'continuable', subagentId: 'child-1' })
    expect(validateJsonSchemaValue(role.config.outputSchema, result, '')).toEqual([])
    expect(subagents.startContinuable).toHaveBeenCalledExactlyOnceWith({
      provider: 'spawn', label: task.description, signal: exec.signal,
      request: {
        parent: exec.agent, label: task.description, prompt: message,
        persona: role.config.persona, agentOptions: {},
        toolFilter: { deny: ['subagent_task', 'interrupt_agent'] }, maxDepth: 1,
      },
    })
    expect(subagents.sendMessage).not.toHaveBeenCalled()
  })

  it('continues the named child from the same calling parent and preserves the full task', async () => {
    const { registered, subagents } = setup()
    const exec = execution()
    const result = await registered.get('subagent_task').execute({ ...task, agent_id: 'child-1' }, exec)
    expect(result).toEqual({ messageId: 'message-1' })
    expect(validateJsonSchemaValue(role.config.outputSchema, result, '')).toEqual([])
    expect(subagents.sendMessage).toHaveBeenCalledExactlyOnceWith(exec.agent, 'child-1', message,
      { signal: exec.signal })
    expect(subagents.startContinuable).not.toHaveBeenCalled()
  })

  it.each([
    {}, { description: 'label' }, { task: 'body' }, { ...task, prompt: 'unexpected' },
  ])('rejects missing or unknown fields at the native Tool schema', args => {
    expect(validateJsonSchemaValue(role.config.parameters, args, '')).not.toEqual([])
  })

  it.each([
    [{ ...task, description: '' }, 'description'],
    [{ ...task, task: '  \n' }, 'task'],
    [{ ...task, agent_id: '' }, 'agent_id'],
  ])('rejects empty %s before dispatch', async (args, field) => {
    const { registered, subagents } = setup()
    await expect(registered.get('subagent_task').execute(args, execution()))
      .rejects.toThrow(role.config.nonEmptyFieldErrors[field])
    expect(subagents.startContinuable).not.toHaveBeenCalled()
    expect(subagents.sendMessage).not.toHaveBeenCalled()
  })

  it('passes native creation and continuation errors to the caller without retry', async () => {
    const { registered, subagents } = setup()
    const error = new Error('subagent "child-1" belongs to another parent session')
    subagents.startContinuable.mockRejectedValueOnce(error)
    await expect(registered.get('subagent_task').execute(task, execution())).rejects.toBe(error)
    expect(subagents.startContinuable).toHaveBeenCalledTimes(1)
    subagents.sendMessage.mockRejectedValueOnce(error)
    await expect(registered.get('subagent_task').execute({ ...task, agent_id: 'child-1' }, execution()))
      .rejects.toBe(error)
    expect(subagents.sendMessage).toHaveBeenCalledTimes(1)
  })

  it.each([false, true])('stops before calling the native service on cancellation; continuation=%s', async continuation => {
    const { registered, subagents } = setup()
    await expect(registered.get('subagent_task').execute({
      ...task, ...(continuation ? { agent_id: 'child-1' } : {}),
    }, execution(AbortSignal.abort()))).rejects.toThrow()
    expect(subagents.startContinuable).not.toHaveBeenCalled()
    expect(subagents.sendMessage).not.toHaveBeenCalled()
  })

})

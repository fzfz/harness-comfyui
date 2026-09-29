import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import { apply } from '../../agent-presets/project-iteration-dispatch.mjs'
import { validateAgentPresetComposition } from '../../scripts/profile/agent-preset.mjs'

const requireFromModule = createRequire(import.meta.url)
const requireFromDsh = createRequire(requireFromModule.resolve('@deepseek-ai/dsh/package.json'))
const nativeTools = requireFromDsh('@deepseek-ai/dsh-tools')
const controls = requireFromDsh('@deepseek-ai/dsh-tool-subagent-control')
const composition = await validateAgentPresetComposition(resolve(import.meta.dirname,
  '../../agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml'))
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
      nativeTools.assertObjectJsonSchema(tool.parameters)
      nativeTools.assertSupportedJsonSchema(tool.output.schema)
      registered.set(tool.name, tool)
    } },
    subagents,
  }
  apply(ctx, role.config)
  controls.apply(ctx)
  return { registered, subagents }
}

function execution(signal = new AbortController().signal) {
  return { agent: { id: 'parent-1' }, signal }
}

const task = { description: '核对生成参数', task: '读取输入文件并核对本轮生成参数。\n报告具体结果。' }
const message = [{ type: 'text', text: `# 子 Agent 任务\n\n## 本次任务\n${JSON.stringify({ task: task.task }, null, 2)}` }]

describe('workbench native subagent tool', () => {
  it('registers one dispatch tool and the native communication tools', () => {
    expect([...setup().registered.keys()]).toEqual(['subagent_task', 'send_message', 'interrupt_agent'])
    expect(role.config.toolFilter.deny).toEqual(['subagent_task', 'interrupt_agent'])
    expect(role.config.parameters.required).toEqual(['description', 'task'])
    expect(role.config.parameters.additionalProperties).toBe(false)
    expect(role.config.agentOptions).toEqual({})
    expect(composition.find(entry => entry.name === '../project-subagent-workspace.mjs')).toBeDefined()
  })

  it('creates a real continuable child under the calling parent with inherited model and Workspace', async () => {
    const { registered, subagents } = setup()
    const exec = execution()
    const result = await registered.get('subagent_task').execute(task, exec)
    expect(result).toEqual({ kind: 'continuable', subagentId: 'child-1' })
    expect(nativeTools.validateJsonSchemaValue(role.config.outputSchema, result, '')).toEqual([])
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
    expect(nativeTools.validateJsonSchemaValue(role.config.outputSchema, result, '')).toEqual([])
    expect(subagents.sendMessage).toHaveBeenCalledExactlyOnceWith(exec.agent, 'child-1', message,
      { signal: exec.signal })
    expect(subagents.startContinuable).not.toHaveBeenCalled()
  })

  it.each([
    {}, { description: 'label' }, { task: 'body' }, { ...task, prompt: 'unexpected' },
  ])('rejects missing or unknown fields at the native Tool schema', args => {
    expect(nativeTools.validateJsonSchemaValue(role.config.parameters, args, '')).not.toEqual([])
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

  it('inherits the current parent route and effort through the installed native resolver', async () => {
    const { resolveChildAgentOptions, childSessionMeta } = await import(pathToFileURL(
      requireFromDsh.resolve('@deepseek-ai/dsh-subagent')).href)
    const parent = {
      options: { provider: 'old', model: 'old' },
      ctx: { get: () => ({ composedPreset: () => 'harness-comfyui-cli-candidate' }) },
      session: {
        header: { id: 'parent-1', cwd: '/workspace' },
        requestHeader: () => ({ config: { provider: 'openrouter', model: 'parent-model', reasoningEffort: 'high' } }),
      },
    }
    expect(resolveChildAgentOptions(parent, role.config.agentOptions, 1)).toMatchObject({
      provider: 'openrouter', model: 'parent-model', reasoningEffort: 'high', subagentDepth: 1,
    })
    expect(childSessionMeta(parent, 1, 0)).toMatchObject({
      cwd: '/workspace', parentSession: 'parent-1', origin: 'subagent', delegationDepth: 1,
      agentPreset: 'harness-comfyui-cli-candidate',
    })
  })
})

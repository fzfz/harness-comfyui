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
const { composition: preset } = await readProjectAgentPresetResources(repositoryRoot, 'harness-comfyui-iteration')
const roles = preset.filter(entry => entry.name === '../project-iteration-dispatch.mjs')

function registerTools() {
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
  for (const role of roles) apply(ctx, role.config)
  return { registered, subagents }
}

function execution() {
  return { agent: { id: 'parent-1' }, signal: new AbortController().signal }
}

const names = ['构图', '生成', '观察', '比较']
function task(index) {
  const shared = {
    description: '处理本次材料',
    output_files: [{ path: '/任务/第二轮/结果.md', purpose: '本轮结果' }],
  }
  if (index === 2) return {
    ...shared,
    images: [{ path: '/图片/实际 图片.png', run_id: 'run-1' }],
    questions: ['人物的双手在哪里？'],
  }
  return {
    ...shared,
    requirements: ['原始要求\n保留人物关系', '新增要求：主体照明清晰'],
    input_files: [{ path: '/材料/故事.md', purpose: '故事' },
      { path: '/任务/第一轮/比较.md', purpose: '此前比较' }],
    reference_files: ['/技能/参考.md'],
    ...(index === 1 ? { supplied_data: '{"prompt":"保留 \\n 和 {{output_files}} 原文"}' } : {}),
  }
}

function expectedMessage(index, args) {
  const section = (heading, data) => `## ${heading}\n${JSON.stringify(data, null, 2)}`
  return [`# ${names[index]}任务`, section('本次任务名称', { description: args.description }),
    ...(index === 2
      ? [section('需要观察的图片与问题', { images: args.images, questions: args.questions })]
      : [section('本次要求', { requirements: args.requirements }),
        section('需要读取的材料与参考', { input_files: args.input_files, reference_files: args.reference_files })]),
    ...(args.supplied_data === undefined ? [] : [section('本次提供的生成数据', { supplied_data: args.supplied_data })]),
    section('需要写入的结果文件', { output_files: args.output_files }),
  ].join('\n\n')
}

async function call(tool, args, exec) {
  expect(validateJsonSchemaValue(tool.parameters, args, '')).toEqual([])
  const result = await tool.execute(args, exec)
  expect(validateJsonSchemaValue(tool.output.schema, result, '')).toEqual([])
  expect(tool.output.render(args, result)).toEqual([{ type: 'text', text: JSON.stringify(result) }])
  return result
}

describe('iteration role dispatch components', () => {
  it('registers the four project role tools and keeps host control components in the Preset resources', () => {
    expect(roles).toHaveLength(4)
    expect([...registerTools().registered.keys()]).toEqual([
      'subagent_composition', 'subagent_generation', 'subagent_observation', 'subagent_comparison',
    ])
    expect(preset.find(entry => entry.name === '@deepseek-ai/dsh-tool-subagent-control')).toBeDefined()
    expect(preset.find(entry => entry.name === '@deepseek-ai/dsh-tool-goal')).toBeDefined()
    expect(preset.find(entry => entry.name === '@deepseek-ai/dsh-command-goal')).toBeDefined()
  })

  it.each(roles.map((role, index) => ({ role, index })))('creates $role.id with its template and persona', async ({ role, index }) => {
    const { registered, subagents } = registerTools()
    const exec = execution()
    const args = task(index)
    const before = structuredClone(args)
    expect(await call(registered.get(role.config.toolName), args, exec))
      .toEqual({ kind: 'continuable', subagentId: 'child-1' })
    expect(subagents.startContinuable).toHaveBeenCalledExactlyOnceWith({
      provider: 'spawn', label: args.description, signal: exec.signal,
      request: {
        label: args.description, prompt: [{ type: 'text', text: expectedMessage(index, args) }],
        parent: exec.agent, persona: role.config.persona,
        agentOptions: role.config.agentOptions, toolFilter: role.config.toolFilter, maxDepth: 1,
      },
    })
    expect(args).toEqual(before)
    expect(subagents.sendMessage).not.toHaveBeenCalled()
  })

  it.each(roles.map((role, index) => ({ role, index })))('continues $role.id with the same task template', async ({ role, index }) => {
    const { registered, subagents } = registerTools()
    const exec = execution()
    const args = { ...task(index), agent_id: 'existing-child' }
    expect(await call(registered.get(role.config.toolName), args, exec)).toEqual({ messageId: 'message-1' })
    expect(subagents.sendMessage).toHaveBeenCalledExactlyOnceWith(exec.agent, 'existing-child',
      [{ type: 'text', text: expectedMessage(index, args) }], { signal: exec.signal })
    expect(subagents.startContinuable).not.toHaveBeenCalled()
  })

  it('omits unsupplied optional generation data', async () => {
    const { registered, subagents } = registerTools()
    const args = task(1)
    delete args.supplied_data
    await call(registered.get('subagent_generation'), args, execution())
    expect(subagents.startContinuable.mock.calls[0][0].request.prompt)
      .toEqual([{ type: 'text', text: expectedMessage(1, args) }])
  })

  it.each(roles)('exposes structured task arguments for $id', role => {
    const schema = role.config.parameters
    expect(schema.additionalProperties).toBe(false)
    expect(schema.properties).not.toHaveProperty('prompt')
    expect(schema.properties).not.toHaveProperty('message')
    expect(schema.properties).not.toHaveProperty('run_in_background')
    expect(schema.required).not.toContain('agent_id')
    const index = roles.indexOf(role)
    for (const field of schema.required) {
      const args = task(index)
      delete args[field]
      expect(validateJsonSchemaValue(schema, args, '')).not.toEqual([])
    }
    expect(validateJsonSchemaValue(schema, { ...task(index), prompt: 'unstructured' }, ''))
      .not.toEqual([])
    expect(role.config.toolFilter.deny).toEqual(expect.arrayContaining([
      ...roles.map(item => item.config.toolName), 'interrupt_agent', 'get_goal', 'create_goal', 'update_goal',
    ]))
  })

  it('gives observation only image, question and output parameters', () => {
    expect(Object.keys(roles[2].config.parameters.properties).sort()).toEqual([
      'agent_id', 'description', 'images', 'output_files', 'questions',
    ])
  })

  it.each([false, true])('propagates native errors without retry; continuation=%s', async continuation => {
    const { registered, subagents } = registerTools()
    const error = new Error('native service failure')
    const service = continuation ? subagents.sendMessage : subagents.startContinuable
    service.mockRejectedValueOnce(error)
    const args = { ...task(0), ...(continuation ? { agent_id: 'child-1' } : {}) }
    await expect(registered.get('subagent_composition').execute(args, execution())).rejects.toBe(error)
    expect(service).toHaveBeenCalledTimes(1)
  })

  it.each([false, true])('honors cancellation; continuation=%s', async continuation => {
    const { registered, subagents } = registerTools()
    const exec = { ...execution(), signal: AbortSignal.abort() }
    const args = { ...task(0), ...(continuation ? { agent_id: 'child-1' } : {}) }
    await expect(registered.get('subagent_composition').execute(args, exec)).rejects.toThrow()
    expect(subagents.startContinuable).not.toHaveBeenCalled()
    expect(subagents.sendMessage).not.toHaveBeenCalled()
  })
})

import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import { apply } from '../../agent-presets/project-iteration-dispatch.mjs'
import { validateAgentPresetComposition } from '../../scripts/profile/agent-preset.mjs'
import { loadTestDesktopContext } from '../support/desktop-context.mjs'

const desktop = await loadTestDesktopContext()
const requireFromDesktop = createRequire(resolve(desktop.desktopSource, 'package.json'))
const nativeTools = await import(pathToFileURL(requireFromDesktop.resolve('@deepseek-ai/dsh-tools')).href)
const controls = await import(pathToFileURL(requireFromDesktop.resolve('@deepseek-ai/dsh-tool-subagent-control')).href)
const preset = await validateAgentPresetComposition(resolve(import.meta.dirname,
  '../../agent-presets/harness-comfyui-iteration/agent.cordis.yml'))
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
      nativeTools.assertObjectJsonSchema(tool.parameters)
      nativeTools.assertSupportedJsonSchema(tool.output.schema)
      registered.set(tool.name, tool)
    } },
    subagents,
  }
  for (const role of roles) apply(ctx, role.config)
  controls.apply(ctx)
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
  expect(nativeTools.validateJsonSchemaValue(tool.parameters, args, '')).toEqual([])
  const result = await tool.execute(args, exec)
  expect(nativeTools.validateJsonSchemaValue(tool.output.schema, result, '')).toEqual([])
  expect(tool.output.render(args, result)).toEqual([{ type: 'text', text: JSON.stringify(result) }])
  return result
}

describe('iteration task templates using the target Desktop subagent service interface', () => {
  it('registers the four configured role tools', () => {
    expect(roles).toHaveLength(4)
    expect([...registerTools().registered.keys()]).toEqual([
      'subagent_composition', 'subagent_generation', 'subagent_observation', 'subagent_comparison',
      'send_message', 'interrupt_agent',
    ])
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
      expect(nativeTools.validateJsonSchemaValue(schema, args, '')).not.toEqual([])
    }
    expect(nativeTools.validateJsonSchemaValue(schema, { ...task(index), prompt: 'unstructured' }, ''))
      .not.toEqual([])
  })

  it('gives observation only image, question and output parameters', () => {
    expect(Object.keys(roles[2].config.parameters.properties).sort()).toEqual([
      'agent_id', 'description', 'images', 'output_files', 'questions',
    ])
  })

  it('keeps the native message tool for reports to the parent', async () => {
    const { registered, subagents } = registerTools()
    const exec = execution()
    expect(await registered.get('send_message').execute({ agent_id: 'parent-0', message: '需要补充材料' }, exec))
      .toEqual({ messageId: 'message-1' })
    expect(subagents.sendMessage).toHaveBeenCalledExactlyOnceWith(exec.agent, 'parent-0',
      [{ type: 'text', text: '需要补充材料' }], { signal: exec.signal })
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

describe('iteration components in the target Desktop Tool Registry', () => {
  it('registers, executes and disposes role tools within their Cordis scope', async () => {
    const load = name => import(pathToFileURL(requireFromDesktop.resolve(name)).href)
    const [{ Context, Service }, { SystemPrompt }, { createScope }] = await Promise.all([
      load('@deepseek-ai/cordis'), load('@deepseek-ai/dsh-system-prompt'), load('@deepseek-ai/dsh-scope'),
    ])
    const recorded = registerTools().subagents
    class RecordedSubagents extends Service {
      constructor(ctx) {
        super(ctx, 'subagents')
        this.startContinuable = recorded.startContinuable
        this.sendMessage = recorded.sendMessage
      }
    }
    const ctx = new Context()
    const services = [
      await ctx.plugin(SystemPrompt, {}),
      await ctx.plugin(nativeTools.ToolRuntime, { mode: 'native' }),
      await ctx.plugin(RecordedSubagents),
    ]
    const parent = { id: 'parent-scope' }
    const other = { id: 'other-scope' }
    const scope = createScope(ctx, parent)
    try {
      const fibers = []
      for (const role of roles) fibers.push(await scope.ctx.plugin({
        name: role.id, inject: ['tools', 'subagents'], apply,
      }, role.config))
      expect(ctx.tools.schemas(parent).map(tool => tool.name)).toEqual(roles.map(role => role.config.toolName))
      expect(ctx.tools.schemas(other)).toEqual([])
      for (const [index, role] of roles.entries()) {
        const args = task(index)
        const run = extra => ctx.tools.execute({
          callId: 'call-' + index, name: role.config.toolName,
          arguments: { ...args, ...extra }, agent: parent,
          signal: new AbortController().signal,
        })
        expect(await run({})).toMatchObject({ isError: false, value: { kind: 'continuable', subagentId: 'child-1' } })
        expect(recorded.startContinuable.mock.lastCall[0].request.prompt)
          .toEqual([{ type: 'text', text: expectedMessage(index, args) }])
        expect(await run({ agent_id: 'child-1' })).toMatchObject({ isError: false, value: { messageId: 'message-1' } })
        expect(recorded.sendMessage.mock.lastCall[2])
          .toEqual([{ type: 'text', text: expectedMessage(index, args) }])
      }
      await fibers[0].dispose()
      expect(ctx.tools.schemas(parent).map(tool => tool.name)).toEqual(roles.slice(1).map(role => role.config.toolName))
      await scope.dispose()
      expect(ctx.tools.schemas(parent)).toEqual([])
      const replacement = createScope(ctx, parent)
      try {
        await replacement.ctx.plugin({ name: roles[0].id, inject: ['tools', 'subagents'], apply }, roles[0].config)
        expect(ctx.tools.schemas(parent).map(tool => tool.name)).toEqual([roles[0].config.toolName])
      } finally {
        await replacement.dispose()
      }
      expect(ctx.tools.schemas(parent)).toEqual([])
    } finally {
      await scope.dispose()
      for (const service of services.reverse()) await service.dispose()
    }
  })
})


describe('native child reasoning-effort inheritance', () => {
  const parent = {
    options: { provider: 'old-provider', model: 'old-model', reasoningEffort: 'low' },
    session: { requestHeader: () => ({ config: {
      provider: 'parent-provider', model: 'parent-model', reasoningEffort: 'max',
    } }) },
  }

  it.each(roles)('lets $id use its own route default instead of a fixed effort', async role => {
    const { resolveChildAgentOptions } = await import(pathToFileURL(requireFromDesktop.resolve('@deepseek-ai/dsh-subagent')).href)
    const { registered, subagents } = registerTools()
    await call(registered.get(role.config.toolName), task(roles.indexOf(role)), execution())
    const requested = subagents.startContinuable.mock.calls[0][0].request.agentOptions
    const resolved = resolveChildAgentOptions(parent, requested, 1)
    expect(resolved).toMatchObject({ provider: requested.provider, model: requested.model })
    expect(resolved).not.toHaveProperty('reasoningEffort')
  })

  it.each([
    ['same route', {}, 'max'],
    ['different provider', { provider: 'other-provider' }, undefined],
    ['different model', { model: 'other-model' }, undefined],
    ['explicit override', { provider: 'other-provider', reasoningEffort: 'high' }, 'high'],
  ])('%s follows native inheritance', async (_label, requested, effort) => {
    const { resolveChildAgentOptions } = await import(pathToFileURL(requireFromDesktop.resolve('@deepseek-ai/dsh-subagent')).href)
    expect(resolveChildAgentOptions(parent, requested, 1).reasoningEffort).toBe(effort)
  })

  it('validates omitted and explicit effort against the installed OpenRouter model capabilities', async () => {
    const { LlmRuntime } = await import(pathToFileURL(requireFromDesktop.resolve('@deepseek-ai/dsh-llm')).href)
    const piRoot = resolve(desktop.desktopSource, 'node_modules/@earendil-works/pi-ai/dist')
    const { getBuiltinModels } = await import(pathToFileURL(resolve(piRoot, 'providers/all.js')).href)
    const { getSupportedThinkingLevels } = await import(pathToFileURL(resolve(piRoot, 'index.js')).href)
    const model = getBuiltinModels('openrouter').find(model => model.id === roles[0].config.agentOptions.model)
    expect(model).toBeDefined()
    const info = { reasoning: { efforts: getSupportedThinkingLevels(model).map(id => ({ id })) } }
    const validate = config => LlmRuntime.prototype.resolveCallWithInfo.call({}, config, info).config
    const config = { provider: 'openrouter', model: model.id }
    expect(validate(config)).not.toHaveProperty('reasoningEffort')
    expect(() => validate({ ...config, reasoningEffort: 'max' }))
      .toThrow(expect.objectContaining({ code: 'UNSUPPORTED_REASONING_EFFORT' }))
  })

  it.each([
    ['provider default', { reasoning: { efforts: [{ id: 'high' }], defaultEffort: 'high' } }, 'high'],
    ['model without reasoning', {}, undefined],
  ])('preserves %s when effort is omitted', async (_label, info, effort) => {
    const { LlmRuntime } = await import(pathToFileURL(requireFromDesktop.resolve('@deepseek-ai/dsh-llm')).href)
    const config = { provider: 'other-provider', model: 'other-model' }
    expect(LlmRuntime.prototype.resolveCallWithInfo.call({}, config, info).config.reasoningEffort).toBe(effort)
    expect(() => LlmRuntime.prototype.resolveCallWithInfo.call({}, { ...config, reasoningEffort: 'max' }, info))
      .toThrow(expect.objectContaining({ code: 'UNSUPPORTED_REASONING_EFFORT' }))
  })
})

import { rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertObjectJsonSchema,
  assertSupportedJsonSchema,
  validateJsonSchemaValue,
} from '@deepseek-ai/dsh-tools'

import { apply } from '../../agent-presets/project-iteration-dispatch.mjs'
import { apply as applyObservation } from '../../agent-presets/project-observation-dispatch.mjs'
import { observationExecution, observationMediaFixture } from '../unit/fixtures/observation-media-runtime.ts'
import { readProjectAgentPresetResources } from '../../scripts/build/agent-preset-resources.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const { composition: preset } = await readProjectAgentPresetResources(repositoryRoot, 'harness-comfyui-iteration')
const roles = preset.filter(entry => ['../project-iteration-dispatch.mjs', '../project-observation-dispatch.mjs'].includes(entry.name))
const mediaFixtures = []
afterEach(() => {
  for (const { root, runtime } of mediaFixtures.splice(0)) {
    runtime.close()
    rmSync(root, { recursive: true, force: true })
  }
})

async function registerTools() {
  const media = observationMediaFixture()
  mediaFixtures.push(media)
  await media.accept()
  const registered = new Map()
  const listeners = new Map()
  const emit = (name, ...args) => { for (const callback of listeners.get(name) ?? []) callback(...args) }
  const finish = childId => {
    emit('session/event', { id: childId, header: { parentSession: 'parent-1' } }, {
      type: 'agent/inbox/spliced', data: { inserted: [{ id: 'message-1' }] },
    })
    emit('subagent/end', { id: childId, runId: 'activation-1', stopReason: 'completed' })
  }
  const subagents = {
    startContinuable: vi.fn(async () => { finish('child-1'); return { childId: 'child-1', messageId: 'message-1' } }),
    sendMessage: vi.fn(async (_parent, childId) => { finish(childId); return 'message-1' }),
    interrupt: vi.fn(),
  }
  const ctx = {
    effect: callback => callback(),
    on(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name).add(callback)
      return () => listeners.get(name).delete(callback)
    },
    tools: { register: tool => {
      assertObjectJsonSchema(tool.parameters)
      assertSupportedJsonSchema(tool.output.schema)
      registered.set(tool.name, tool)
    } },
    subagents,
    harnessComfyuiCore: { services: { resolveObservationMedia: media.resolveMedia } },
  }
  for (const role of roles) (role.name === '../project-observation-dispatch.mjs' ? applyObservation : apply)(ctx, role.config)
  return { registered, subagents, media, listeners, finish, emit, ctx }
}

function execution(callId) {
  return { ...observationExecution(callId), deferContext: vi.fn() }
}

const names = ['构图', '生成', '观察', '比较']
function task(index) {
  const shared = {
    description: '处理本次材料',
    output_files: [{ path: '/任务/第二轮/结果.md', purpose: '本轮结果' }],
  }
  if (index === 2) return {
    ...shared,
    images: [{ run_id: 'run_00000001-1111-4111-8111-111111111111', media_id: 'media_aa_bb_1' }],
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

function expectedMessage(index, args, root) {
  if (index === 2) args = { ...args, images: [{
    run_id: 'run_00000001-1111-4111-8111-111111111111', media_id: 'media_aa_bb_1',
    path: join(root, 'media/aa/bb/media_aa_bb_1.png'),
  }] }
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
  it.each(['failure', 'cancellation'])('stops before creating completion observers when asynchronous parameter preparation ends in %s', async mode => {
    const { registered, subagents, listeners, ctx } = await registerTools()
    const controller = new AbortController()
    const reason = new Error(`parameter preparation ${mode}`)
    apply(ctx, roles[0].config, async args => {
      if (mode === 'failure') throw reason
      controller.abort(reason)
      return args
    })
    await expect(registered.get('subagent_composition').execute(task(0), { ...execution(), signal: controller.signal })).rejects.toBe(reason)
    expect(subagents.startContinuable).not.toHaveBeenCalled()
    expect(subagents.sendMessage).not.toHaveBeenCalled()
    expect([...listeners.values()].flatMap(value => [...value])).toEqual([])
  })

  it.each([false, true])('rejects observation cancellation before resolving media; continuation=%s', async continuation => {
    const { registered, subagents, media } = await registerTools()
    const exec = { ...execution(), signal: AbortSignal.abort() }
    const args = { ...task(2), ...(continuation ? { agent_id: 'existing-child' } : {}) }
    await expect(registered.get('subagent_observation').execute(args, exec)).rejects.toThrow()
    expect(media.workspaceRegistry.resolveByPath).not.toHaveBeenCalled()
    expect(subagents.startContinuable).not.toHaveBeenCalled()
    expect(subagents.sendMessage).not.toHaveBeenCalled()
  })

  it('dispatches media from multiple Run query batches in the original selected order', async () => {
    const { registered, subagents, media } = await registerTools()
    const images = [...task(2).images]
    for (let index = 1; index < 21; index += 1) images.push({ run_id: await media.accept(), media_id: `media_aa_bb_${index * 3 + 1}` })
    await call(registered.get('subagent_observation'), { ...task(2), images: [...images].reverse() }, execution())
    const text = subagents.startContinuable.mock.calls[0][0].request.prompt[0].text
    const section = text.split('## 需要观察的图片与问题\n')[1].split('\n\n')[0]
    const selected = JSON.parse(section).images
    expect(selected).toHaveLength(21)
    expect(selected[0]).toEqual({ run_id: 'run_00000015-1111-4111-8111-111111111111', media_id: 'media_aa_bb_61', path: join(media.root, 'media/aa/bb/media_aa_bb_61.png') })
    expect(selected[20]).toEqual({ run_id: 'run_00000001-1111-4111-8111-111111111111', media_id: 'media_aa_bb_1', path: join(media.root, 'media/aa/bb/media_aa_bb_1.png') })
  })

  it('dispatches only selected media identities and exact saved paths while preserving the other observation values', async () => {
    const { registered, subagents, media } = await registerTools()
    const args = { ...task(2), images: [
      { run_id: 'run_00000001', media_id: 'media_aa_bb_3' },
      { run_id: 'run_00000001-1111-4111-8111-111111111111', media_id: 'media_aa_bb_1' },
      { run_id: 'run_00000001', media_id: 'media_aa_bb_3' },
    ] }
    const before = structuredClone(args)
    await call(registered.get('subagent_observation'), args, execution())
    const text = subagents.startContinuable.mock.calls[0][0].request.prompt[0].text
    expect(text).toContain(JSON.stringify([
      { run_id: 'run_00000001-1111-4111-8111-111111111111', media_id: 'media_aa_bb_3', path: join(media.root, 'media/aa/bb/media_aa_bb_3.png') },
      { run_id: 'run_00000001-1111-4111-8111-111111111111', media_id: 'media_aa_bb_1', path: join(media.root, 'media/aa/bb/media_aa_bb_1.png') },
      { run_id: 'run_00000001-1111-4111-8111-111111111111', media_id: 'media_aa_bb_3', path: join(media.root, 'media/aa/bb/media_aa_bb_3.png') },
    ], null, 2).split('\n').map(line => `  ${line}`).join('\n').trim())
    expect(text).toContain(JSON.stringify({ output_files: args.output_files }, null, 2))
    expect(text).toContain(JSON.stringify({ description: args.description }, null, 2))
    expect(text).toContain(JSON.stringify(args.questions[0]))
    expect(text).not.toContain('TARGET_TITLE_MUST_STAY_PRIVATE')
    expect(text).not.toContain('TARGET_PROMPT_MUST_STAY_PRIVATE')
    expect(args).toEqual(before)
  })

  it.each([false, true])('fails a later media query batch before any child dispatch; continuation=%s', async continuation => {
    const { registered, subagents, media, listeners } = await registerTools()
    const images = [...task(2).images]
    for (let index = 1; index < 21; index += 1) {
      images.push({ run_id: await media.accept(), media_id: `media_aa_bb_${index * 3 + 1}` })
    }
    images.push({ run_id: 'run_ffffffff', media_id: 'media_missing' })
    const args = { ...task(2), images, ...(continuation ? { agent_id: 'existing-child' } : {}) }
    await expect(registered.get('subagent_observation').execute(args, execution())).rejects.toMatchObject({ code: 'GENERATION_RUN_NOT_FOUND' })
    expect(subagents.startContinuable).not.toHaveBeenCalled()
    expect(subagents.sendMessage).not.toHaveBeenCalled()
    expect([...listeners.values()].flatMap(value => [...value])).toEqual([])
  })

  it.each([
    { name: 'empty references', code: 'GENERATION_PARAMETER_INVALID', change: args => { args.images = [] } },
    { name: 'blank run ID', code: 'GENERATION_PARAMETER_INVALID', change: args => { args.images[0].run_id = ' ' } },
    { name: 'blank media ID', code: 'GENERATION_PARAMETER_INVALID', change: args => { args.images[0].media_id = ' ' } },
    { name: 'invalid Run', code: 'GENERATION_RUN_ID_INVALID', change: args => { args.images[0].run_id = 'invalid run' } },
    { name: 'missing Run', code: 'GENERATION_RUN_NOT_FOUND', change: args => { args.images[0].run_id = 'run_ffffffff' } },
    { name: 'missing media', code: 'GENERATION_MEDIA_NOT_FOUND', change: args => { args.images[0].media_id = 'media_missing' } },
    { name: 'forged call ID', code: 'GENERATION_TOOL_CONTEXT_INVALID', change: (_args, exec) => { exec.callId = 'forged' } },
    { name: 'wrong tool name', code: 'GENERATION_TOOL_CONTEXT_INVALID', change: (_args, exec) => { exec.agent.session.snapshotEvents = () => [{ type: 'tool/call', data: { callId: exec.callId, name: 'subagent_generation', turn: 3 } }] } },
    { name: 'no Workspace', code: 'GENERATION_WORKSPACE_REQUIRED', change: (_args, exec) => { exec.agent.session.header.cwd = undefined } },
    { name: 'unregistered Workspace', code: 'GENERATION_WORKSPACE_REQUIRED', change: (_args, _exec, media) => { media.workspaceRegistry.resolveByPath.mockResolvedValue(undefined) } },
    { name: 'session outside Workspace', code: 'GENERATION_WORKSPACE_REQUIRED', change: (_args, _exec, media) => { media.workspaceRegistry.resolveByPath.mockResolvedValue({ id: 'workspace-1', sessionIds: ['another-session'] }) } },
    { name: 'cross Workspace Run', code: 'GENERATION_RUN_NOT_FOUND', change: async (args, _exec, media) => { args.images = [{ run_id: await media.accept('workspace-2'), media_id: 'media_aa_bb_4' }] } },
    { name: 'media not yet saved', code: 'GENERATION_MEDIA_NOT_FOUND', change: async (args, _exec, media) => { args.images = [{ run_id: await media.accept('workspace-1', false), media_id: 'media_aa_bb_4' }] } },
  ])('rejects $name without creating or continuing a child', async ({ code, change }) => {
    const { registered, subagents, media, listeners } = await registerTools()
    const args = task(2)
    const exec = execution()
    await change(args, exec, media)
    await expect(registered.get('subagent_observation').execute(args, exec)).rejects.toMatchObject({ code })
    expect(subagents.startContinuable).not.toHaveBeenCalled()
    expect(subagents.sendMessage).not.toHaveBeenCalled()
    expect(exec.deferContext).not.toHaveBeenCalled()
    expect([...listeners.values()].flatMap(value => [...value])).toEqual([])
  })

  it.each([false, true])('cancels during media resolution with no dispatch; continuation=%s', async continuation => {
    const { registered, subagents, media, listeners } = await registerTools()
    const controller = new AbortController()
    const reason = new Error('cancelled during resolution')
    media.workspaceRegistry.resolveByPath.mockImplementationOnce(async () => {
      controller.abort(reason)
      return { id: 'workspace-1', sessionIds: ['parent-1'] }
    })
    const exec = { ...execution(), signal: controller.signal }
    const args = { ...task(2), ...(continuation ? { agent_id: 'existing-child' } : {}) }
    await expect(registered.get('subagent_observation').execute(args, exec)).rejects.toBe(reason)
    expect(subagents.startContinuable).not.toHaveBeenCalled()
    expect(subagents.sendMessage).not.toHaveBeenCalled()
    expect(exec.deferContext).not.toHaveBeenCalled()
    expect([...listeners.values()].flatMap(value => [...value])).toEqual([])
  })

  it('keeps the accepted observation identity after cancellation and resumes the original child', async () => {
    const { registered, subagents, listeners } = await registerTools()
    const controller = new AbortController()
    const reason = new Error('cancelled after acceptance')
    subagents.startContinuable.mockResolvedValueOnce({ childId: 'accepted-child', messageId: 'accepted-message' })
    const exec = { ...execution(), signal: controller.signal }
    exec.deferContext.mockImplementationOnce(() => controller.abort(reason))
    const tool = registered.get('subagent_observation')
    await expect(tool.execute(task(2), exec)).rejects.toBe(reason)
    const accepted = JSON.parse(exec.deferContext.mock.calls[0][0].content[0].text)
    expect(accepted).toEqual({ toolName: 'subagent_observation', callId: 'observation-1', subagentId: 'accepted-child', messageId: 'accepted-message', status: 'accepted' })
    expect([...listeners.values()].flatMap(value => [...value])).toEqual([])
    expect(await call(tool, { ...task(2), agent_id: accepted.subagentId }, execution('observation-2'))).toEqual({ messageId: 'message-1' })
    expect(subagents.startContinuable).toHaveBeenCalledTimes(1)
    expect(subagents.sendMessage.mock.calls[0][1]).toBe('accepted-child')
  })

  it('registers the four project role tools and keeps host control components in the Preset resources', async () => {
    expect(roles).toHaveLength(4)
    expect([...(await registerTools()).registered.keys()]).toEqual([
      'subagent_composition', 'subagent_generation', 'subagent_observation', 'subagent_comparison',
    ])
    expect(preset.find(entry => entry.name === '../project-subagent-control.mjs')).toBeDefined()
    expect(preset.find(entry => entry.name === '@deepseek-ai/dsh-tool-goal')).toBeDefined()
    expect(preset.find(entry => entry.name === '@deepseek-ai/dsh-command-goal')).toBeDefined()
  })

  it.each(roles.map((role, index) => ({ role, index })))('creates $role.id with its template and persona', async ({ role, index }) => {
    const { registered, subagents, media } = await registerTools()
    const exec = execution()
    const args = task(index)
    const before = structuredClone(args)
    expect(await call(registered.get(role.config.toolName), args, exec))
      .toEqual({ kind: 'continuable', subagentId: 'child-1' })
    expect(subagents.startContinuable).toHaveBeenCalledExactlyOnceWith({
      provider: 'spawn', label: args.description, signal: expect.any(AbortSignal),
      request: {
        label: args.description, prompt: [{ type: 'text', text: expectedMessage(index, args, media.root) }],
        parent: exec.agent, persona: role.config.persona,
        agentOptions: role.config.agentOptions, toolFilter: role.config.toolFilter, maxDepth: 1,
      },
    })
    expect(args).toEqual(before)
    expect(subagents.sendMessage).not.toHaveBeenCalled()
  })

  it.each(roles.map((role, index) => ({ role, index })))('continues $role.id with the same task template', async ({ role, index }) => {
    const { registered, subagents, media } = await registerTools()
    const exec = execution()
    const args = { ...task(index), agent_id: 'existing-child' }
    expect(await call(registered.get(role.config.toolName), args, exec)).toEqual({ messageId: 'message-1' })
    expect(subagents.sendMessage).toHaveBeenCalledExactlyOnceWith(exec.agent, 'existing-child',
      [{ type: 'text', text: expectedMessage(index, args, media.root) }], { signal: expect.any(AbortSignal) })
    expect(subagents.startContinuable).not.toHaveBeenCalled()
  })

  it('omits unsupplied optional generation data', async () => {
    const { registered, subagents, media } = await registerTools()
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
    const { registered, subagents, media } = await registerTools()
    const error = new Error('native service failure')
    const service = continuation ? subagents.sendMessage : subagents.startContinuable
    service.mockRejectedValueOnce(error)
    const args = { ...task(0), ...(continuation ? { agent_id: 'child-1' } : {}) }
    await expect(registered.get('subagent_composition').execute(args, execution())).rejects.toBe(error)
    expect(service).toHaveBeenCalledTimes(1)
  })

  it.each([false, true])('honors cancellation; continuation=%s', async continuation => {
    const { registered, subagents, media } = await registerTools()
    const exec = { ...execution(), signal: AbortSignal.abort() }
    const args = { ...task(0), ...(continuation ? { agent_id: 'child-1' } : {}) }
    await expect(registered.get('subagent_composition').execute(args, exec)).rejects.toThrow()
    expect(subagents.startContinuable).not.toHaveBeenCalled()
    expect(subagents.sendMessage).not.toHaveBeenCalled()
  })
})

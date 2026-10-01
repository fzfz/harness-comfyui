import { mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { readProjectAgentPresetResources } from '../../scripts/build/agent-preset-resources.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const PRODUCT_PRESET_ID = 'harness-comfyui-cli-candidate'
const ITERATION_PRESET_ID = 'harness-comfyui-iteration'
const temporaryPaths = []

async function temporaryDirectory(prefix) {
  const path = await mkdtemp(join(tmpdir(), prefix))
  temporaryPaths.push(path)
  return path
}

async function loadListener(componentName, eventName, services, config) {
  const componentPath = resolve(repositoryRoot, 'agent-presets', componentName)
  const { apply } = await import(pathToFileURL(componentPath).href)
  let listener
  const ctx = {
    ...services,
    on: vi.fn((name, callback) => {
      if (name !== eventName) throw new Error(`unexpected event: ${name}`)
      listener = callback
      return vi.fn()
    }),
  }
  apply(ctx, config)
  return { ctx, invoke: (...args) => listener(...args) }
}

function visibilityContext(hostNames) {
  const denied = new Set()
  const restrictions = []
  let onToolsChange
  let cleanup
  const ctx = {
    root: { tools: { schemas: vi.fn(() => hostNames.map(name => ({ name }))) } },
    tools: {
      restrict: vi.fn(({ deny }) => {
        const name = deny[0]
        denied.add(name)
        const dispose = vi.fn(() => denied.delete(name))
        restrictions.push(dispose)
        return dispose
      }),
    },
    on: vi.fn((event, listener) => {
      if (event !== 'tools/change') throw new Error(`unexpected event: ${event}`)
      onToolsChange = listener
      return vi.fn(() => { onToolsChange = undefined })
    }),
    effect: vi.fn(effect => {
      cleanup = effect()
      return cleanup
    }),
  }
  return {
    ctx,
    denied,
    restrictions,
    emitToolsChange: () => onToolsChange?.(),
    cleanup: () => cleanup?.(),
  }
}

function testAgent(id, origin, cwd, parentSession) {
  return {
    id,
    session: {
      id,
      header: {
        id,
        origin,
        ...(cwd === undefined ? {} : { cwd }),
        ...(parentSession === undefined ? {} : { parentSession }),
      },
    },
  }
}

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('project Agent Preset resources', () => {
  it('keeps the workbench persona and continuable task contract in project-owned resources', async () => {
    const { metadata, composition } = await readProjectAgentPresetResources(repositoryRoot, PRODUCT_PRESET_ID)
    const persona = composition.find(row => row.name === '@deepseek-ai/dsh-persona')
    const task = composition.find(row => row.id === 'task-agent')

    expect(metadata).toMatchObject({ name: 'ComfyUI工作台预设', order: 91 })
    expect(persona.config.prefix).toContain('ComfyUI workbench Agent')
    expect(persona.config).not.toHaveProperty('text')
    expect(task.config).toMatchObject({
      provider: 'spawn',
      toolName: 'subagent_task',
      maxDepth: 1,
      agentOptions: {},
      toolFilter: { deny: ['subagent_task', 'interrupt_agent'] },
      parameters: {
        required: ['description', 'task'],
        additionalProperties: false,
      },
      taskTemplate: {
        title: '子 Agent 任务',
        sections: [{ heading: '本次任务', fields: ['task'] }],
      },
    })
    expect(task.config.parameters.properties).toHaveProperty('agent_id')
    expect(task.config.outputSchema.oneOf.map(schema => schema.required)).toEqual([
      ['kind', 'subagentId'],
      ['messageId'],
    ])
    expect(composition.map(row => row.name)).toContain('../project-subagent-workspace.mjs')
    expect(composition.map(row => row.name)).toContain('@deepseek-ai/dsh-tool-subagent-control')
  })

  it('keeps four independent iteration role contracts and their child restrictions', async () => {
    const { metadata, composition } = await readProjectAgentPresetResources(repositoryRoot, ITERATION_PRESET_ID)
    const roles = composition.filter(row => row.name === '../project-iteration-dispatch.mjs')
    const names = roles.map(row => row.config.toolName)

    expect(metadata).toMatchObject({ name: 'ComfyUI迭代预设', order: 92 })
    expect(names).toEqual([
      'subagent_composition', 'subagent_generation', 'subagent_observation', 'subagent_comparison',
    ])
    expect(new Set(roles.map(row => row.config.persona)).size).toBe(4)
    for (const role of roles) {
      expect(role.config).toMatchObject({
        provider: 'spawn',
        maxDepth: 1,
        persona: expect.any(String),
        agentOptions: { provider: expect.any(String), model: expect.any(String) },
        toolFilter: {
          deny: expect.arrayContaining([
            ...names, 'interrupt_agent', 'get_goal', 'create_goal', 'update_goal',
          ]),
        },
      })
      expect(role.config.parameters.additionalProperties).toBe(false)
      expect(role.config.outputSchema.oneOf.map(schema => schema.required)).toEqual([
        ['kind', 'subagentId'], ['messageId'],
      ])
    }
    expect(composition.map(row => row.name)).toContain('../project-subagent-workspace.mjs')
    expect(composition.map(row => row.name)).toContain('@deepseek-ai/dsh-command-goal')
    expect(composition.map(row => row.name)).toContain('@deepseek-ai/dsh-tool-goal')
    expect(composition.map(row => row.name)).toContain('@deepseek-ai/dsh-tool-subagent-control')
  })
})

describe('project Tool visibility modes', () => {
  it('keeps Host Tools in inherited mode and hides later Host Tools only in local mode', async () => {
    const { apply } = await import(pathToFileURL(resolve(repositoryRoot,
      'agent-presets/project-tool-visibility.mjs')).href)
    const inherited = visibilityContext(['host-query', 'run_code'])
    apply(inherited.ctx, { mode: 'inherit-host-global' })
    expect(inherited.ctx.effect).not.toHaveBeenCalled()
    expect(inherited.denied).toEqual(new Set())

    const local = visibilityContext(['host-query', 'run_code'])
    apply(local.ctx, { mode: 'local-only' })
    expect([...local.denied]).toEqual(['host-query'])
    local.ctx.root.tools.schemas.mockImplementation(() => [
      { name: 'host-query' }, { name: 'run_code' }, { name: 'host-late' },
    ])
    local.emitToolsChange()
    expect([...local.denied]).toEqual(['host-query', 'host-late'])
    expect(local.ctx.tools.restrict).toHaveBeenCalledTimes(2)
    local.cleanup()
    expect(local.denied).toEqual(new Set())
    expect(local.restrictions.every(dispose => dispose.mock.calls.length === 1)).toBe(true)
  })

  it.each([null, [], {}, { mode: 'unknown' }])('rejects invalid visibility config %j', async config => {
    const { apply } = await import(pathToFileURL(resolve(repositoryRoot,
      'agent-presets/project-tool-visibility.mjs')).href)
    const ctx = {
      root: { tools: { schemas: () => [] } },
      tools: { restrict: vi.fn() },
      on: vi.fn(),
      effect: vi.fn(),
    }

    expect(() => apply(ctx, config)).toThrow(TypeError)
    expect(ctx.effect).not.toHaveBeenCalled()
  })

  it('removes prior restrictions when the Host rejects a later restriction', async () => {
    const { apply } = await import(pathToFileURL(resolve(repositoryRoot,
      'agent-presets/project-tool-visibility.mjs')).href)
    const firstDispose = vi.fn()
    const stopListening = vi.fn()
    const ctx = {
      root: { tools: { schemas: () => [{ name: 'first-host' }, { name: 'second-host' }] } },
      tools: { restrict: vi.fn(({ deny }) => {
        if (deny[0] === 'second-host') throw new Error('restriction failed')
        return firstDispose
      }) },
      on: vi.fn(() => stopListening),
      effect: effect => effect(),
    }

    expect(() => apply(ctx, { mode: 'local-only' })).toThrow('restriction failed')
    expect(stopListening).toHaveBeenCalledOnce()
    expect(firstDispose).toHaveBeenCalledOnce()
  })
})

describe('project system prompt visibility', () => {
  it('removes only configured Harness sections while preserving other assembled data', async () => {
    const { composition } = await readProjectAgentPresetResources(repositoryRoot, PRODUCT_PRESET_ID)
    const row = composition.find(entry => entry.name === '../project-system-prompt-visibility.mjs')
    const listener = await loadListener(
      'project-system-prompt-visibility.mjs', 'system-prompt/assemble', {}, row.config,
    )
    const contexts = [{ name: 'runtime:permissions', text: 'Current permission state.' }]
    const tools = [{ name: 'bash', description: 'Run a foreground shell command.' }]
    const variables = { cwd: '/workspace' }
    const assembly = {
      sections: [
        { name: 'harness:identity', text: 'Harness identity.' },
        { name: 'harness:source', text: 'Harness source checkout.' },
        { name: 'app:web-surface', text: 'Harness Web instructions.' },
        { name: 'deployment:persona', text: 'Project persona.' },
        { name: 'tool:bash', text: 'Bash guidance.' },
      ],
      contexts,
      tools,
      variables,
    }

    await expect(listener.invoke(assembly, {}, async () => assembly)).resolves.toEqual({
      sections: [
        { name: 'deployment:persona', text: 'Project persona.' },
        { name: 'tool:bash', text: 'Bash guidance.' },
      ],
      contexts,
      tools,
      variables,
    })
  })

  it('passes an assembly error through unchanged', async () => {
    const listener = await loadListener(
      'project-system-prompt-visibility.mjs', 'system-prompt/assemble', {},
      { hiddenSectionNames: ['harness:identity'] },
    )
    const error = new Error('downstream assembly failed')

    await expect(listener.invoke({ sections: [] }, {}, async () => { throw error })).rejects.toBe(error)
  })

  it.each([
    null,
    [],
    {},
    { hiddenSectionNames: ['harness:identity'], extra: true },
    { hiddenSectionNames: 'harness:identity' },
    { hiddenSectionNames: [] },
    { hiddenSectionNames: [''] },
    { hiddenSectionNames: ['   '] },
    { hiddenSectionNames: [1] },
    { hiddenSectionNames: ['harness:identity', 'harness:identity'] },
  ])('rejects invalid hidden-section config %j', async config => {
    const { apply } = await import(pathToFileURL(resolve(repositoryRoot,
      'agent-presets/project-system-prompt-visibility.mjs')).href)

    expect(() => apply({ on: vi.fn() }, config)).toThrow(TypeError)
  })
})

describe('iteration Preset Workspace registration', () => {
  async function listenerFor(services) {
    return loadListener('project-subagent-workspace.mjs', 'agent/pre-step', services)
  }

  it('passes non-subagent Sessions through without reading Workspace state', async () => {
    const agents = { get: vi.fn() }
    const workspaceRegistry = { resolveByPath: vi.fn() }
    const listener = await listenerFor({ agents, workspaceRegistry })
    const next = vi.fn(async () => 'continued')

    await expect(listener.invoke({ agent: testAgent('session_main', 'user', '/workspace') }, next))
      .resolves.toBe('continued')

    expect(next).toHaveBeenCalledOnce()
    expect(agents.get).not.toHaveBeenCalled()
    expect(workspaceRegistry.resolveByPath).not.toHaveBeenCalled()
  })

  it('attaches the child Session once before repeated pre-steps continue', async () => {
    const cwd = await temporaryDirectory('harness-subagent-workspace-')
    const parent = testAgent('session_parent', 'user', cwd)
    const child = testAgent('session_child', 'subagent', cwd, parent.session.id)
    const sessionIds = [parent.session.id]
    const callOrder = []
    const attachSession = vi.fn(async sessionId => {
      callOrder.push('attach')
      sessionIds.push(sessionId)
    })
    const workspace = { id: 'workspace_1', sessionIds, attachSession }
    const resolveByPath = vi.fn(async () => workspace)
    const listener = await listenerFor({
      agents: { get: vi.fn(id => id === parent.session.id ? parent : undefined) },
      workspaceRegistry: { resolveByPath },
    })
    const next = vi.fn(async () => {
      callOrder.push('next')
      return 'continued'
    })

    await expect(listener.invoke({ agent: child }, next)).resolves.toBe('continued')
    await expect(listener.invoke({ agent: child }, next)).resolves.toBe('continued')

    expect(resolveByPath).toHaveBeenCalledTimes(2)
    expect(resolveByPath).toHaveBeenNthCalledWith(1, cwd)
    expect(attachSession).toHaveBeenCalledOnce()
    expect(attachSession).toHaveBeenCalledWith(child.session.id)
    expect(sessionIds).toEqual([parent.session.id, child.session.id])
    expect(next).toHaveBeenCalledTimes(2)
    expect(callOrder).toEqual(['attach', 'next', 'next'])
  })

  it('stops before the next handler when the parent Session is missing', async () => {
    const cwd = await temporaryDirectory('harness-subagent-missing-parent-')
    const listener = await listenerFor({
      agents: { get: vi.fn(() => undefined) },
      workspaceRegistry: { resolveByPath: vi.fn() },
    })
    const next = vi.fn()

    await expect(listener.invoke({
      agent: testAgent('session_child', 'subagent', cwd, 'session_missing'),
    }, next)).rejects.toThrow('parent Session session_missing was not found; set the child Session header.parentSession field to an existing parent Session ID')
    expect(next).not.toHaveBeenCalled()
  })

  it.each([
    ['child', undefined, 'same', 'child Session has no cwd; set the child Session cwd to its parent Session cwd'],
    ['parent', 'same', undefined, 'parent Session has no cwd; set the parent Session cwd to a directory within its Workspace'],
  ])('stops when the %s Session cwd is missing', async (_name, childCwd, parentCwd, message) => {
    const cwd = await temporaryDirectory('harness-subagent-missing-cwd-')
    const parent = testAgent('session_parent', 'user', parentCwd === 'same' ? cwd : parentCwd)
    const child = testAgent('session_child', 'subagent', childCwd === 'same' ? cwd : childCwd, parent.session.id)
    const listener = await listenerFor({
      agents: { get: vi.fn(() => parent) },
      workspaceRegistry: { resolveByPath: vi.fn() },
    })
    const next = vi.fn()

    await expect(listener.invoke({ agent: child }, next)).rejects.toThrow(message)
    expect(next).not.toHaveBeenCalled()
  })

  it.each(['child', 'parent'])('reports an unavailable %s cwd before resolving a Workspace', async label => {
    const cwd = await temporaryDirectory('harness-subagent-unavailable-cwd-')
    const missingCwd = resolve(cwd, 'missing')
    const parent = testAgent('session_parent', 'user', label === 'parent' ? missingCwd : cwd)
    const child = testAgent('session_child', 'subagent', label === 'child' ? missingCwd : cwd, parent.session.id)
    const resolveByPath = vi.fn()
    const listener = await listenerFor({
      agents: { get: vi.fn(() => parent) },
      workspaceRegistry: { resolveByPath },
    })
    const next = vi.fn()

    await expect(listener.invoke({ agent: child }, next))
      .rejects.toThrow(`${label} Session cwd at ${missingCwd} is unavailable:`)
    expect(resolveByPath).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it('accepts equivalent child and parent cwd paths after resolving symlinks', async () => {
    const cwd = await temporaryDirectory('harness-subagent-realpath-')
    const alias = resolve(cwd, 'alias')
    await symlink(cwd, alias, 'dir')
    const parent = testAgent('session_parent', 'user', cwd)
    const child = testAgent('session_child', 'subagent', alias, parent.session.id)
    const workspace = { id: 'workspace_1', sessionIds: [parent.session.id, child.session.id] }
    const resolveByPath = vi.fn(async () => workspace)
    const listener = await listenerFor({
      agents: { get: vi.fn(() => parent) },
      workspaceRegistry: { resolveByPath },
    })
    const next = vi.fn(async () => 'continued')

    await expect(listener.invoke({ agent: child }, next)).resolves.toBe('continued')
    expect(await realpath(alias)).toBe(await realpath(cwd))
    expect(next).toHaveBeenCalledOnce()
  })

  it('stops when the child and parent resolve to different directories', async () => {
    const [parentCwd, childCwd] = await Promise.all([
      temporaryDirectory('harness-subagent-parent-cwd-'),
      temporaryDirectory('harness-subagent-child-cwd-'),
    ])
    const parent = testAgent('session_parent', 'user', parentCwd)
    const child = testAgent('session_child', 'subagent', childCwd, parent.session.id)
    const resolveByPath = vi.fn()
    const listener = await listenerFor({
      agents: { get: vi.fn(() => parent) },
      workspaceRegistry: { resolveByPath },
    })
    const next = vi.fn()
    const [resolvedChildCwd, resolvedParentCwd] = await Promise.all([
      realpath(childCwd),
      realpath(parentCwd),
    ])

    await expect(listener.invoke({ agent: child }, next))
      .rejects.toThrow(`child cwd ${resolvedChildCwd} differs from parent cwd ${resolvedParentCwd}; set the child Session cwd to the parent cwd`)
    expect(resolveByPath).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it('preserves lookup failure context and stops the child step', async () => {
    const cwd = await temporaryDirectory('harness-subagent-lookup-failure-')
    const parent = testAgent('session_parent', 'user', cwd)
    const child = testAgent('session_child', 'subagent', cwd, parent.session.id)
    const cause = new Error('Workspace storage read failed')
    const resolveByPath = vi.fn(async () => { throw cause })
    const listener = await listenerFor({
      agents: { get: vi.fn(() => parent) },
      workspaceRegistry: { resolveByPath },
    })
    const next = vi.fn()

    await expect(listener.invoke({ agent: child }, next)).rejects.toMatchObject({
      message: `Registration of subagent Session session_child failed because Workspace lookup for parent cwd ${cwd} failed with Workspace storage read failed; check the Workspace registry and parent Session cwd, then retry.`,
      cause,
    })
    expect(resolveByPath).toHaveBeenCalledExactlyOnceWith(cwd)
    expect(next).not.toHaveBeenCalled()
  })

  it('stops when the parent cwd has no Workspace', async () => {
    const cwd = await temporaryDirectory('harness-subagent-no-workspace-')
    const parent = testAgent('session_parent', 'user', cwd)
    const child = testAgent('session_child', 'subagent', cwd, parent.session.id)
    const listener = await listenerFor({
      agents: { get: vi.fn(() => parent) },
      workspaceRegistry: { resolveByPath: vi.fn(async () => undefined) },
    })
    const next = vi.fn()

    await expect(listener.invoke({ agent: child }, next))
      .rejects.toThrow(`no Workspace contains parent cwd ${cwd}; register a Workspace containing that cwd or set the parent Session cwd to a directory in an existing Workspace`)
    expect(next).not.toHaveBeenCalled()
  })

  it('stops when the parent Session is not attached to the resolved Workspace', async () => {
    const cwd = await temporaryDirectory('harness-subagent-parent-unregistered-')
    const parent = testAgent('session_parent', 'user', cwd)
    const child = testAgent('session_child', 'subagent', cwd, parent.session.id)
    const attachSession = vi.fn()
    const listener = await listenerFor({
      agents: { get: vi.fn(() => parent) },
      workspaceRegistry: {
        resolveByPath: vi.fn(async () => ({ id: 'workspace_1', sessionIds: [], attachSession })),
      },
    })
    const next = vi.fn()

    await expect(listener.invoke({ agent: child }, next))
      .rejects.toThrow('parent Session session_parent is not attached to Workspace workspace_1; attach the parent Session to that Workspace')
    expect(attachSession).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it('reports an attach failure and does not continue the child task', async () => {
    const cwd = await temporaryDirectory('harness-subagent-attach-failure-')
    const parent = testAgent('session_parent', 'user', cwd)
    const child = testAgent('session_child', 'subagent', cwd, parent.session.id)
    const attachSession = vi.fn(async () => { throw new Error('storage rejected attachment') })
    const listener = await listenerFor({
      agents: { get: vi.fn(() => parent) },
      workspaceRegistry: {
        resolveByPath: vi.fn(async () => ({
          id: 'workspace_1',
          sessionIds: [parent.session.id],
          attachSession,
        })),
      },
    })
    const next = vi.fn()

    await expect(listener.invoke({ agent: child }, next))
      .rejects.toThrow('Workspace workspace_1 could not attach the child Session: storage rejected attachment; check the Workspace Session record and retry')
    expect(attachSession).toHaveBeenCalledWith(child.session.id)
    expect(next).not.toHaveBeenCalled()
  })
})

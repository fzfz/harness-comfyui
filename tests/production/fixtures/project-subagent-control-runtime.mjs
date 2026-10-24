import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { readProjectComposition as readProjectAgentPresetResources } from '../../fixtures/preset-composition.mjs'
import { apply as applyVisibility } from '../../../agent-presets/project-tool-visibility.mjs'
import { fixtureTool, renderToolsSdk, toolRegistry } from './tool-registry-runtime.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../../..')
const interruptRequests = []
const registry = toolRegistry({ subagents: { interrupt: (id, authority) => interruptRequests.push({ id, authority }) } })
try {
  registry.root.tools.register(fixtureTool('inspect_image'))
  const parent = {}
  const scope = registry.scope(parent)
  if (process.argv[2] === '--restriction-contract') {
    const errors = []
    for (const registerOwn of [false, true]) {
      if (registerOwn) scope.ctx.tools.register(fixtureTool('send_message'))
      assert.throws(() => scope.ctx.tools.restrict({ deny: ['send_message'] }), error => {
        errors.push(error.message)
        return error.message === 'tools.restrict() names unknown global tool "send_message"; known global tools: inspect_image'
      })
    }
    assert.ok(registry.root.tools.get('send_message', parent))
    const child = {}
    registry.scope(child, parent).ctx.tools.restrict({ deny: ['send_message'] })
    assert.equal(registry.root.tools.get('send_message', child), undefined)
    assert.ok(registry.root.tools.get('send_message', parent))
    console.log(JSON.stringify({ errors, ownVisible: true, childVisible: false }))
  } else {
    const presetId = process.argv[2]
    const { composition } = await readProjectAgentPresetResources(repositoryRoot, presetId)
    const visibility = composition.find(row => row.name === '../project-tool-visibility.mjs')
    applyVisibility(scope.ctx, visibility.config)
    const control = composition.find(row => row.id === 'tool-subagent-control')
    assert.equal(control.name, '../project-subagent-control.mjs')
    const module = await import(pathToFileURL(resolve(repositoryRoot, 'agent-presets', presetId, control.name)).href)
    const controlFiber = scope.ctx.plugin(module)
    await controlFiber.inertia
    const names = registry.root.tools.schemas(parent).map(tool => tool.name)
    assert.deepEqual(names, ['interrupt_agent'])
    assert.equal(composition.filter(row => row.name === '@deepseek-ai/dsh-tool-subagent-control/list-agents').length, 1)
    assert.equal(composition.some(row => row.name === '@deepseek-ai/dsh-tool-subagent-control'), false)

    const standard = {}
    const standardScope = registry.scope(standard)
    standardScope.ctx.tools.register(fixtureTool('send_message'))
    const standardBefore = registry.root.tools.schemas(standard)
    const dispatchers = composition.filter(row => ['../project-iteration-dispatch.mjs', '../project-observation-dispatch.mjs'].includes(row.name))
    scope.ctx.tools.register({ ...fixtureTool('list_agents'), description: 'Use send_message to continue the conversation.' })
    for (const row of dispatchers) scope.ctx.tools.register(fixtureTool(row.config.toolName))
    const children = []
    for (const row of dispatchers) {
      const agent = {}
      const childScope = registry.scope(agent)
      const { composition: childRows } = await readProjectAgentPresetResources(repositoryRoot, row.config.agentPreset)
      assert.equal(childRows.some(entry => ['../project-subagent-control.mjs', '../project-iteration-dispatch.mjs',
        '../project-observation-dispatch.mjs', '@deepseek-ai/dsh-tool-goal'].includes(entry.name)), false)
      const childVisibility = childRows.find(entry => entry.name === '../project-tool-visibility.mjs')
      applyVisibility(childScope.ctx, childVisibility.config)
      assert.ok(childRows.some(entry => entry.name === '@deepseek-ai/dsh-tool-subagent-control/list-agents'))
      childScope.ctx.tools.register(fixtureTool('list_agents'))
      childScope.ctx.tools.register(fixtureTool('skill'))
      children.push({ agent, ctx: childScope.ctx, toolName: row.config.toolName })
    }
    const scopes = [{ agent: parent, ctx: scope.ctx, toolName: 'parent' }, ...children]
    const surfaces = []
    for (const mode of ['native', 'ptc']) {
      if (mode === 'ptc') {
        registry.root.provide('ptcRuntime', { language: 'typescript' })
        for (const scoped of scopes) scoped.ctx.tools.presentAs(mode)
      }
      for (const { agent, toolName } of scopes) {
        const nativeNames = registry.root.tools.wireSchemas(agent).schemas.map(tool => tool.name)
        const sdk = registry.root.tools.sdkSchemas(agent)
        assert.ok(!nativeNames.includes('send_message'))
        assert.ok(!sdk.some(tool => tool.name === 'send_message'))
        assert.ok(!/^\s*(?:send_message|"send_message")\s*:/m.test(renderToolsSdk(sdk)))
        assert.equal(registry.root.tools.get('send_message', agent), undefined)
        if (agent !== parent) assert.equal(registry.root.tools.get('interrupt_agent', agent), undefined)
        for (const nested of [false, true]) {
          assert.equal(registry.root.tools.resolveExecution('send_message', agent, nested), undefined)
          const result = await registry.root.tools.execute({
            callId: 'retired-message', name: 'send_message', agent, arguments: {},
            signal: new AbortController().signal,
            ...(nested ? { parent: {} } : {}),
          })
          assert.equal(result.isError, true)
          assert.equal(result.error.info.code, 'UNKNOWN_TOOL')
        }
        if (agent === parent) {
          const executeInterrupt = args => registry.root.tools.execute({
            callId: 'interrupt-request', name: 'interrupt_agent', agent, arguments: args,
            signal: new AbortController().signal,
            ...(mode === 'ptc' ? { parent: {} } : {}),
          })
          const previous = interruptRequests.length
          for (const args of [{}, { agent_id: null }, { agent_id: 1 }]) {
            const result = await executeInterrupt(args)
            assert.equal(result.isError, true)
            assert.equal(result.error.info.code, 'INVALID_ARGS')
          }
          assert.equal(interruptRequests.length, previous)
          const accepted = await executeInterrupt({ agent_id: 'child-1' })
          assert.notEqual(accepted.isError, true)
          assert.equal(interruptRequests.length, previous + 1)
          assert.equal(interruptRequests.at(-1).id, 'child-1')
          assert.equal(interruptRequests.at(-1).authority.kind, 'ancestor')
          assert.equal(interruptRequests.at(-1).authority.agent, parent)
        } else {
          const result = await registry.root.tools.execute({
            callId: 'child-interrupt', name: 'interrupt_agent', agent, arguments: { agent_id: 'child-1' },
            signal: new AbortController().signal, parent: {},
          })
          assert.equal(result.error.info.code, 'UNKNOWN_TOOL')
        }
        surfaces.push({ mode, toolName, nativeNames, sdkNames: sdk.map(tool => tool.name) })
      }
    }
    const unload = async () => {
      await controlFiber.dispose()
      while (controlFiber.inertia !== undefined) await controlFiber.inertia
    }
    await unload()
    assert.equal(registry.root.tools.get('interrupt_agent', parent), undefined)
    assert.ok(registry.root.tools.get('list_agents', parent))
    assert.deepEqual(registry.root.tools.schemas(standard), standardBefore)
    assert.ok(registry.root.tools.resolveExecution('send_message', standard, false))
    const reload = scope.ctx.plugin(module)
    await reload.inertia
    assert.ok(registry.root.tools.get('interrupt_agent', parent))
    assert.equal(registry.root.tools.get('send_message', parent), undefined)
    assert.deepEqual(registry.root.tools.schemas(standard), standardBefore)
    console.log(JSON.stringify({ presetId, names, surfaces, unloadPreservedList: true, controlScopeUnchanged: true }))
  }
} finally {
  await registry.dispose()
}

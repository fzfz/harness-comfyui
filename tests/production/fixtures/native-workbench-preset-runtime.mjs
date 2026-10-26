import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { fixtureTool } from './native-preset-tool.mjs'

const localRequire = createRequire(import.meta.url)
const sdkRequire = createRequire(localRequire.resolve('@deepseek-ai/dsh-agent-preset-registry'))
const load = name => import(pathToFileURL(sdkRequire.resolve(name)).href)
const [cordis, loader, include, presets, sessions, projections, prompt, tools, scope] = await Promise.all([
  load('@deepseek-ai/cordis'), load('@deepseek-ai/cordis-plugin-loader'),
  load('@deepseek-ai/cordis-plugin-include'), load('@deepseek-ai/dsh-agent-preset-registry'),
  load('@deepseek-ai/dsh-session'), load('@deepseek-ai/dsh-session-projection'),
  load('@deepseek-ai/dsh-system-prompt'), load('@deepseek-ai/dsh-tools'), load('@deepseek-ai/dsh-scope'),
])

const directory = await mkdtemp(join(tmpdir(), 'native-workbench-preset-'))
const root = new cordis.Context()
const agentScopes = []
const registrations = []

async function declare(id = 'workbench', config = {}) {
  const composition = join(directory, `${id}.json`)
  await writeFile(composition, JSON.stringify([
    { id: 'preset-tool', name: new URL('./native-preset-tool.mjs', import.meta.url).href, config },
  ]))
  const unregister = await root.agentPresets.register({
    id, plugins: [{ name: 'cordis:include', config: { path: pathToFileURL(composition).href } }],
  })
  registrations.push(unregister)
  return unregister
}

function agentContext(id) {
  const agent = { id }
  const agentScope = scope.createScope(root, agent)
  agentScopes.push(agentScope)
  return { agent, scope: agentScope }
}

async function mountAgent(id, presetId = 'workbench') {
  const mounted = agentContext(id)
  await root.agentPresets.mount(mounted.scope.ctx, presetId)
  return mounted
}

function composeChild(id, parent) {
  const child = agentContext(id)
  assert.equal(root.agentPresets.composeFrom(child.scope.ctx, parent.scope.ctx), 'workbench')
  return child
}

function names(key) {
  return root.tools.schemas(key).map(tool => tool.name).sort()
}

async function assertTools(key, expected) {
  assert.deepEqual(names(key), expected)
  const assembly = await root.systemPrompt.assemble({ scope: key })
  assert.deepEqual(assembly.tools.map(tool => tool.name).sort(), expected)
}

const scenarios = {
  async inheritance() {
    await declare()
    const parent = await mountAgent('parent')
    const child = composeChild('child', parent)
    root.tools.register(fixtureTool('host_late'))
    await assertTools(parent.agent, ['host_global', 'host_late', 'preset_tool'])
    await assertTools(child.agent, ['host_global', 'host_late', 'preset_tool'])
    const standing = await root.agentPresets.acquireScope('workbench')
    await assertTools(standing.key, ['host_global', 'host_late', 'preset_tool'])
    await standing[Symbol.asyncDispose]()
    await declare('other', { toolName: 'other_preset_tool' })
    const other = await mountAgent('other-parent', 'other')
    await assertTools(other.agent, ['host_global', 'host_late', 'other_preset_tool'])
    assert.deepEqual(names(), ['host_global', 'host_late'])
  },

  async lifecycle() {
    const unregister = await declare()
    const parent = await mountAgent('parent')
    const child = composeChild('child', parent)
    const standing = await root.agentPresets.acquireScope('workbench')
    const retiredKey = standing.key
    await standing[Symbol.asyncDispose]()
    await unregister()
    await assert.rejects(root.agentPresets.resolve('workbench'), /Unknown agent preset/u)
    await assertTools(parent.agent, ['host_global', 'preset_tool'])
    await assertTools(child.agent, ['host_global', 'preset_tool'])
    await child.scope.dispose()
    await parent.scope.dispose()
    await assertTools(retiredKey, ['host_global'])
    await declare()
    const reloaded = await mountAgent('reloaded-parent')
    await assertTools(reloaded.agent, ['host_global', 'preset_tool'])
  },

  async failure() {
    const unregister = await declare('workbench', { fail: true })
    const broken = await root.agentPresets.resolve('workbench')
    assert.match(broken.broken, /fixture activation failed/u)
    const rejected = agentContext('rejected-parent')
    await assert.rejects(root.agentPresets.mount(rejected.scope.ctx, 'workbench'), /fixture activation failed/u)
    await assertTools(rejected.agent, ['host_global'])
    assert.deepEqual(names(), ['host_global'])
    await unregister()
    await declare()
    await root.agentPresets.mount(rejected.scope.ctx, 'workbench')
    await assertTools(rejected.agent, ['host_global', 'preset_tool'])
    const child = composeChild('recovered-child', rejected)
    await assertTools(child.agent, ['host_global', 'preset_tool'])
  },

  async prompt() {
    await declare()
    const parent = await mountAgent('parent')
    const child = composeChild('child', parent)
    for (const [name, placement, text] of [
      ['harness:source', 'HARNESS_SOURCE', 'Host source guidance'],
      ['app:web-surface', 'WEB_SURFACE', 'Host web guidance'],
      ['ui:deliverable-file-references', 'DELIVERABLE_FILE_REFERENCES', 'Host file guidance'],
    ]) root.systemPrompt.section({ name, order: root.systemPrompt.getSectionOrder(placement), text })
    root.systemPrompt.context({ name: 'fixture:runtime', order: 100, text: 'Current directory' })
    root.systemPrompt.variable('fixture_value', () => 'value')
    const parentAssembly = await root.systemPrompt.assemble({ scope: parent.agent })
    const childAssembly = await root.systemPrompt.assemble({ scope: child.agent })
    assert.deepEqual(childAssembly, parentAssembly)
    for (const name of ['harness:identity', 'harness:source', 'app:web-surface', 'ui:deliverable-file-references', 'fixture:preset']) {
      assert.ok(parentAssembly.sections.some(section => section.name === name), `${name} is present`)
    }
    assert.deepEqual(parentAssembly.contexts, [{ name: 'fixture:runtime', text: 'Current directory' }])
    assert.equal(parentAssembly.variables.fixture_value, 'value')
    await assertTools(parent.agent, ['host_global', 'preset_tool'])
    await assertTools(child.agent, ['host_global', 'preset_tool'])
  },
}

const scenario = process.argv[2]
assert.ok(Object.hasOwn(scenarios, scenario), `Unknown scenario: ${scenario}`)
try {
  root.baseUrl = pathToFileURL(`${directory}/`).href
  await root.plugin(loader.Loader)
  root.loader.builtins.include = include.default
  root.loader.internal = { import: name => import(name) }
  await root.plugin(sessions.default)
  await root.plugin(projections.default)
  await root.plugin(prompt.default)
  await root.plugin(tools.default)
  await root.plugin(presets.default, { default: 'workbench' })
  root.tools.register(fixtureTool('host_global'))
  await scenarios[scenario]()
  console.log(JSON.stringify({ scenario, passed: true }))
} finally {
  for (const agentScope of agentScopes.reverse()) await agentScope.dispose()
  for (const unregister of registrations.reverse()) await unregister()
  await root.fiber.dispose()
  await rm(directory, { recursive: true, force: true })
}

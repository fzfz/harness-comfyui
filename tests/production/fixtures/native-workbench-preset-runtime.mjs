import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { fixtureTool } from './native-preset-tool.mjs'

const sdkRequire = createRequire(process.argv[3])
const [cordis, loader, include, presets, sessions, projections, prompt, tools, scope, group, skillRegistry,
  agents, goals, commands, agentLoop, llm] = [
  '@deepseek-ai/cordis', '@deepseek-ai/cordis-plugin-loader',
  '@deepseek-ai/cordis-plugin-include', '@deepseek-ai/dsh-agent-preset-registry',
  '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-session-projection',
  '@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-scope',
  '@deepseek-ai/cordis-plugin-group', '@deepseek-ai/dsh-skill',
  '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-goal', '@deepseek-ai/dsh-commands',
  '@deepseek-ai/dsh-agent-loop', '@deepseek-ai/dsh-llm',
].map(name => sdkRequire(name))

const directory = await mkdtemp(join(tmpdir(), 'native-workbench-preset-'))
const root = new cordis.Context()
const agentScopes = []
const registrations = []
let removeDependencies

async function declare(id = 'workbench', config = {}, customSkillDirs) {
  const sharedPatches = ['noobai-mcp', 'tool-working-directory', 'tool-bash',
    'tool-pwsh', 'tool-presentation', 'tool-subagent-list', 'compaction']
    .map(id => ({ id, disabled: true }))
  if (customSkillDirs !== undefined) {
    const rows = sdkRequire('js-yaml').load(await readFile(resolve(import.meta.dirname,
      '../../../agent-presets/shared/agent.cordis.yml'), 'utf8'), { schema: include.entryListSchema })
    const group = rows.find(row => row.id === 'workbench-skills')
    sharedPatches.push({ id: group.id, config: group.config.map(row => row.id === 'skill-filesystem'
      ? { ...row, config: { ...row.config, customSkillDirs } } : row) })
  }
  const plugins = [{ id: 'preset-tool', name: new URL('./native-preset-tool.mjs', import.meta.url).href, config }]
  if (id === 'workbench') {
    plugins.push({
      name: 'cordis:include',
      config: {
        path: pathToFileURL(resolve(import.meta.dirname, '../../../agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml')).href,
        patches: [
          { id: 'task-agent', disabled: true },
          { id: 'tool-subagent-control', disabled: true },
          { id: 'project-common', config: {
            path: '../shared/agent.cordis.yml',
            patches: sharedPatches,
          } },
        ],
      },
    })
  }
  const unregister = await root.agentPresets.register({ id, plugins })
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
  async goal() {
    const unregister = await declare()
    const parent = await mountAgent('goal-parent')
    const child = composeChild('goal-child', parent)
    for (const mounted of [parent, child]) {
      Object.assign(mounted.agent, {
        session: root.sessions.create(mounted.agent.id), options: {}, status: 'running',
        ctx: mounted.scope.ctx,
      })
      registrations.push(root.agents.enter(mounted.agent, mounted === child ? parent.agent : undefined))
      await root.agents.announce(mounted.agent, 'startup')
      mounted.agent.session.append('turn/start', { turn: 1 })
      mounted.agent.session.append('user/message', llm.createUserMessage({
        content: [{ type: 'text', text: 'Create a goal to verify the selected Run.' }],
        source: mounted === parent ? { kind: 'user' } : { kind: 'subagent', agentId: parent.agent.id },
      }), { surfaceOp: 'append' })
    }
    const execute = (mounted, name, args = {}) => root.agents.withInitiator(mounted.agent,
      () => root.tools.execute({ name, arguments: args, agent: mounted.agent,
        callId: name, signal: new AbortController().signal }))
    const read = async (mounted, name, args) => {
      const result = await execute(mounted, name, args)
      assert.equal(result.isError, false, JSON.stringify(result))
      return result.value
    }
    assert.deepEqual(await read(parent, 'get_goal'), { goal: null })
    const created = await read(parent, 'create_goal', { objective: 'Verify the selected Run', max_goal_rounds: 2 })
    assert.equal(created.goal.phase, 'active')
    assert.equal(created.activation, 'armed')
    assert.equal(created.goal.maxGoalRounds, 2)
    assert.deepEqual(await read(child, 'get_goal'), { goal: null })
    const denied = await execute(child, 'create_goal', { objective: 'Delegated goal' })
    assert.equal(denied.isError, true)
    assert.match(JSON.stringify(denied), /direct human turn/u)
    const blocked = await read(parent, 'update_goal', {
      goal_id: created.goal.id, revision: created.goal.revision, action: 'blocked',
      blocked_reason: 'Select a Workflow before generation.',
    })
    assert.equal(blocked.goal.phase, 'blocked')
    const resumed = await read(parent, 'update_goal', {
      goal_id: blocked.goal.id, revision: blocked.goal.revision, action: 'resume',
    })
    assert.equal(resumed.activation, 'armed')
    const ref = { goal_id: resumed.goal.id, revision: resumed.goal.revision }
    const paused = await read(parent, 'update_goal', { ...ref, action: 'pause' })
    assert.equal(paused.goal.phase, 'paused')
    assert.equal(paused.activation, 'disarmed')
    const stale = await execute(parent, 'update_goal', { ...ref, action: 'complete' })
    assert.equal(stale.isError, true)
    const resume = await execute(parent, 'update_goal', {
      ...ref, revision: paused.goal.revision, action: 'resume',
    })
    assert.equal(resume.isError, true)
    assert.match(JSON.stringify(resume), /paused/u)
    parent.agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    parent.agent.status = 'idle'
    const command = await root.commands.execute(parent.agent, '/goal resume', [], new AbortController().signal)
    assert.equal(command.result.kind, 'success')
    assert.equal(root.goals.get(parent.agent).activation, 'armed')
    await unregister()
    await child.scope.dispose()
    await parent.scope.dispose()
    assert.equal(root.commands.find(parent.agent, 'goal'), undefined)
    assert.equal(root.tools.get('get_goal', parent.agent), undefined)
    await declare()
    const reloaded = await mountAgent('goal-reloaded')
    Object.assign(reloaded.agent, {
      session: root.sessions.create(reloaded.agent.id), options: {}, status: 'idle', ctx: reloaded.scope.ctx,
    })
    await root.agents.register(reloaded.agent)
    const createdByCommand = await root.commands.execute(reloaded.agent, '/goal Verify reloaded preset',
      [], new AbortController().signal)
    assert.equal(createdByCommand.result.kind, 'success')
    assert.equal(root.goals.get(reloaded.agent).objective, 'Verify reloaded preset')
    reloaded.agent.status = 'running'
    reloaded.agent.session.append('turn/start', { turn: 2 })
    reloaded.agent.session.append('user/message', llm.createUserMessage({
      content: [{ type: 'text', text: 'Read the reloaded Goal.' }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    const reloadedGoal = await read(reloaded, 'get_goal')
    assert.equal(reloadedGoal.goal.objective, 'Verify reloaded preset')
    const complete = await read(reloaded, 'update_goal', {
      goal_id: reloadedGoal.goal.id, revision: reloadedGoal.goal.revision, action: 'complete',
    })
    assert.equal(complete.goal.phase, 'complete')
  },

  async lateRegistration() {
    removeDependencies()
    const unregister = await declare()
    const parent = await mountAgent('parent')
    const child = composeChild('child', parent)
    const standing = await root.agentPresets.acquireScope('workbench')
    await declare('other', { toolName: 'other_preset_tool' })
    const other = await mountAgent('other-parent', 'other')
    for (const key of [parent.agent, child.agent, standing.key]) {
      await assertTools(key, ['create_goal', 'get_goal', 'host_global', 'preset_tool', 'skill', 'update_goal'])
    }
    for (let registration = 0; registration < 2; registration++) {
      removeDependencies = root.tools.register(fixtureTool('load_workspace_dependencies'))
      for (const key of [parent.agent, child.agent, standing.key]) {
        assert.equal(root.tools.get('load_workspace_dependencies', key), undefined)
        const result = await root.tools.execute({ name: 'load_workspace_dependencies', arguments: {},
          agent: key, callId: 'late-denied-dependencies', signal: new AbortController().signal })
        assert.ok(result.error, JSON.stringify(result))
        assert.match(JSON.stringify(result), /unknown tool/u)
        await assertTools(key, ['create_goal', 'get_goal', 'host_global', 'preset_tool', 'skill', 'update_goal'])
      }
      await assertTools(other.agent, ['host_global', 'load_workspace_dependencies', 'other_preset_tool'])
      removeDependencies()
    }
    const retiredKey = standing.key
    await standing[Symbol.asyncDispose]()
    await unregister()
    await child.scope.dispose()
    await parent.scope.dispose()
    removeDependencies = root.tools.register(fixtureTool('load_workspace_dependencies'))
    await assertTools(retiredKey, ['host_global', 'load_workspace_dependencies'])
  },

  async inheritance() {
    await declare()
    const parent = await mountAgent('parent')
    const child = composeChild('child', parent)
    removeDependencies()
    removeDependencies = root.tools.register(fixtureTool('load_workspace_dependencies'))
    root.tools.register(fixtureTool('host_late'))
    for (const mounted of [parent, child]) {
      assert.equal(root.tools.get('load_workspace_dependencies', mounted.agent), undefined)
      const result = await root.tools.execute({ name: 'load_workspace_dependencies', arguments: {},
        agent: mounted.agent, callId: 'denied-dependencies', signal: new AbortController().signal })
      assert.ok(result.error, JSON.stringify(result))
      assert.match(JSON.stringify(result), /unknown tool/u)
    }
    await assertTools(parent.agent, ['create_goal', 'get_goal', 'host_global', 'host_late', 'preset_tool', 'skill', 'update_goal'])
    await assertTools(child.agent, ['create_goal', 'get_goal', 'host_global', 'host_late', 'preset_tool', 'skill', 'update_goal'])
    const standing = await root.agentPresets.acquireScope('workbench')
    await assertTools(standing.key, ['create_goal', 'get_goal', 'host_global', 'host_late', 'preset_tool', 'skill', 'update_goal'])
    await standing[Symbol.asyncDispose]()
    await declare('other', { toolName: 'other_preset_tool' })
    const other = await mountAgent('other-parent', 'other')
    await assertTools(other.agent, ['host_global', 'host_late', 'load_workspace_dependencies', 'other_preset_tool'])
    assert.deepEqual(names(), ['host_global', 'host_late', 'load_workspace_dependencies'])
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
    await assertTools(parent.agent, ['create_goal', 'get_goal', 'host_global', 'preset_tool', 'skill', 'update_goal'])
    await assertTools(child.agent, ['create_goal', 'get_goal', 'host_global', 'preset_tool', 'skill', 'update_goal'])
    await child.scope.dispose()
    await parent.scope.dispose()
    await assertTools(retiredKey, ['host_global', 'load_workspace_dependencies'])
    await declare()
    const reloaded = await mountAgent('reloaded-parent')
    await assertTools(reloaded.agent, ['create_goal', 'get_goal', 'host_global', 'preset_tool', 'skill', 'update_goal'])
  },

  async failure() {
    const unregister = await declare('workbench', { fail: true })
    const broken = await root.agentPresets.resolve('workbench')
    assert.match(broken.broken, /fixture activation failed/u)
    const rejected = agentContext('rejected-parent')
    await assert.rejects(root.agentPresets.mount(rejected.scope.ctx, 'workbench'), /fixture activation failed/u)
    await assertTools(rejected.agent, ['host_global', 'load_workspace_dependencies'])
    assert.deepEqual(names(), ['host_global', 'load_workspace_dependencies'])
    await unregister()
    await declare()
    await root.agentPresets.mount(rejected.scope.ctx, 'workbench')
    await assertTools(rejected.agent, ['create_goal', 'get_goal', 'host_global', 'preset_tool', 'skill', 'update_goal'])
    const child = composeChild('recovered-child', rejected)
    await assertTools(child.agent, ['create_goal', 'get_goal', 'host_global', 'preset_tool', 'skill', 'update_goal'])
  },

  async prompt() {
    for (const [name, text] of [
      ['harness:source', 'Host source guidance'],
      ['app:web-surface', 'Host web guidance'],
      ['ui:deliverable-file-references', 'Prefer showing the primary results within your final response. Use present.'],
      ['fixture:new-static', 'Unrelated host static text'],
    ]) root.systemPrompt.section({ name, order: 100, text })
    for (const name of ['harness:source', 'app:web-surface', 'working-directory:current',
      'sandbox:policy', 'approval:policy', 'tool:subagent:depth']) {
      root.systemPrompt.context({ name, order: 100, text: name })
    }
    await declare()
    const parent = await mountAgent('parent')
    const child = composeChild('child', parent)
    await child.scope.ctx.plugin({ inject: ['systemPrompt'], apply(ctx) {
      ctx.systemPrompt.context({ name: 'subagent:delegation', order: 100, text: 'Child task' })
    } })
    const yaml = sdkRequire('js-yaml')
    const rows = yaml.load(await readFile(resolve(import.meta.dirname,
      '../../../agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml'), 'utf8'), { schema: include.entryListSchema })
    const persona = rows.find(row => row.id === 'persona').config.prefix
    for (const mounted of [parent, child]) {
      const assembly = await root.systemPrompt.assemble({ scope: mounted.agent })
      assert.deepEqual(assembly.sections, [{ name: 'deployment:persona-prefix', text: persona }])
      const expected = ['working-directory:current', 'sandbox:policy', 'approval:policy', 'tool:subagent:depth']
      if (mounted === child) expected.push('subagent:delegation')
      assert.deepEqual(prompt.renderContextSections(assembly).map(entry => entry.name), expected)
      assert.deepEqual(prompt.renderContextSections(root.systemPrompt.refreshContext(assembly,
        { scope: mounted.agent })).map(entry => entry.name), expected)
      await assertTools(mounted.agent, ['create_goal', 'get_goal', 'host_global', 'preset_tool', 'skill', 'update_goal'])
    }
    await declare('other')
    const other = await mountAgent('other-parent', 'other')
    const assembly = await root.systemPrompt.assemble({ scope: other.agent })
    assert.ok(assembly.sections.some(section => section.name === 'ui:deliverable-file-references'))
    assert.ok(prompt.renderContextSections(assembly).some(section => section.name === 'harness:source'))
  },

  async customSkills() {
    const extra = join(directory, 'extra-skills')
    await mkdir(join(extra, 'custom-image'), { recursive: true })
    await writeFile(join(extra, 'custom-image/SKILL.md'), '---\nname: custom-image\ndescription: User image workflow\n---\nCUSTOM IMAGE')
    await declare('workbench', {}, [extra])
    const parent = await mountAgent('parent')
    const child = composeChild('child', parent)
    for (const mounted of [parent, child]) {
      const skill = root.tools.get('skill', mounted.agent)
      const exec = { agent: mounted.agent, signal: new AbortController().signal }
      const custom = await skill.execute({ name: 'custom-image' }, exec)
      assert.equal(custom.resourceBase.path, join(extra, 'custom-image'))
      assert.match(custom.content, /CUSTOM IMAGE/u)
      const bundled = await skill.execute({ name: 'comfyui-generate' }, exec)
      assert.equal(bundled.resourceBase.path, resolve(import.meta.dirname, '../../../.agents/skills/comfyui-generate'))
    }
  },

  async skills() {
    const workspaceSkill = join(directory, '.agents/skills/comfyui-generate')
    await mkdir(workspaceSkill, { recursive: true })
    await writeFile(join(workspaceSkill, 'SKILL.md'), '---\nname: comfyui-generate\ndescription: Workspace override\n---\nWORKSPACE OVERRIDE')
    await declare()
    const parent = await mountAgent('parent')
    const child = composeChild('child', parent)
    for (const mounted of [parent, child]) {
      for (const name of ['anima-prompt-builder', 'character-portrait-prompt-designer', 'comfyui-generate',
        'comfyui-image-review', 'krea2-anime-prompt-builder', 'local-image-reader', 'moss-prompt-builder',
        'wai-sdxl-prompt-builder']) {
        const result = await root.tools.get('skill', mounted.agent).execute({ name },
          { agent: mounted.agent, signal: new AbortController().signal })
        assert.equal(result.name, name)
        assert.equal(result.resourceBase.path, resolve(import.meta.dirname, '../../../.agents/skills', name))
        assert.ok(result.content.length > 0)
      }
      await assert.rejects(root.tools.get('skill', mounted.agent).execute({ name: 'office-example' },
        { agent: mounted.agent, signal: new AbortController().signal }), /unknown or no longer available/u)
    }
    assert.equal((await root.skills.get('office-example')).content, 'OFFICE')
  },
}

const scenario = process.argv[2]
assert.ok(Object.hasOwn(scenarios, scenario), `Unknown scenario: ${scenario}`)
try {
  root.baseUrl = pathToFileURL(`${directory}/`).href
  await root.plugin(loader.Loader)
  root.loader.builtins.include = include.default
  root.loader.builtins.group = group.default
  root.loader.internal = { import: (name, baseUrl) => name.startsWith('@deepseek-ai/')
    ? sdkRequire(name) : import(new URL(name, baseUrl).href) }
  root.provide('workingDirectory', { ensure: async () => directory })
  await root.plugin(skillRegistry.default)
  root.skills.register({ name: 'office-example', description: 'Global Office fixture', source: 'bundled', content: 'OFFICE' })
  await root.plugin(sessions.default)
  await root.plugin(projections.default)
  await root.plugin(agents.default)
  root.sessionProjections.register(agentLoop.turnBoundaryProjectionDefinition)
  await root.plugin(goals.default)
  await root.plugin(commands.default)
  await root.plugin(prompt.default)
  await root.plugin(tools.default)
  await root.plugin(presets.default, { default: 'workbench' })
  root.tools.register(fixtureTool('host_global'))
  removeDependencies = root.tools.register(fixtureTool('load_workspace_dependencies'))
  await scenarios[scenario]()
  console.log(JSON.stringify({ scenario, passed: true }))
} finally {
  for (const agentScope of agentScopes.reverse()) await agentScope.dispose()
  for (const unregister of registrations.reverse()) await unregister()
  await root.fiber.dispose()
  await rm(directory, { recursive: true, force: true })
}

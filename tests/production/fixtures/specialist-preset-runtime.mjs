import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire, registerHooks } from 'node:module'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import configuration from '../../../config/workbench-agent-roles.json' with { type: 'json' }
import { specialistComposition } from '../../../agent-presets/specialist-preset.mjs'
import { fixtureTool } from './native-preset-tool.mjs'

const sdk = createRequire(process.argv[2])
registerHooks({ resolve(specifier, context, next) {
  return next(specifier, specifier.startsWith('@deepseek-ai/') ? { ...context, parentURL: pathToFileURL(process.argv[2]).href } : context)
} })
const [cordis, loader, include, presets, sessions, projections, prompt, tools, scope, group, skills, agents, jobsLocal] = [
  '@deepseek-ai/cordis', '@deepseek-ai/cordis-plugin-loader', '@deepseek-ai/cordis-plugin-include', '@deepseek-ai/dsh-agent-preset-registry',
  '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-session-projection', '@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-scope', '@deepseek-ai/cordis-plugin-group', '@deepseek-ai/dsh-skill', '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-jobs-local',
].map(name => sdk(name))
const root = new cordis.Context()
const directory = await mkdtemp(join(tmpdir(), 'specialist-presets-'))
const scopes = []
const mountedAgents = []
const evidence = []
const loadedSkillTools = []
const mcpContexts = []
const lateServices = new Set()
const registrations = []
const nativeRuns = new Map()
const nativeRuntime = {
  async acceptGenerations(identity, items) {
    return { items: items.map(item => {
      const runId = `run_${item.requestId}`
      nativeRuns.set(runId, { workspace_id: identity.workspaceId, run_id: runId, request_id: item.requestId, lookup_status: 'available', title: item.request.title, status: 'remote_running', revision: 1, updated_at: Date.now(), instance_id: item.request.instanceId, prompt_id: 'prompt-one', run_error: null, images: [] })
      return { runId, requestId: item.requestId, acceptance: 'accepted' }
    }) }
  },
  async readGenerationRunMedia({ runIds }) { return { runs: runIds.map(id => nativeRuns.get(id)) } },
}
const names = key => root.tools.schemas(key).map(tool => tool.name).sort()
try {
  root.baseUrl = pathToFileURL(`${directory}/`).href
  await root.plugin(loader.Loader)
  root.loader.builtins.include = include.default
  root.loader.builtins.group = group.default
  root.loader.internal = { import(name, baseUrl) {
    if (name === 'harness-comfyui/workbench-tools') return import('../../../src/host/workbench/tools.ts')
    if (name === 'harness-comfyui/specialist-tools') return import('../../../src/host/workbench/specialist-tools.ts')
    if (name === '@deepseek-ai/dsh-mcp-client') return { inject: ['tools'], apply(ctx) { mcpContexts.push(ctx); ctx.tools.register(fixtureTool('catalog_query')); ctx.tools.register(fixtureTool('catalog_detail')) } }
    return name.startsWith('@deepseek-ai/') ? sdk(name) : import(URL.canParse(name) ? name : pathToFileURL(createRequire(baseUrl).resolve(name)).href)
  } }
  root.provide('workingDirectory', { ensure: async () => directory })
  root.provide('harnessComfyuiCore', { services: { runtime: nativeRuntime, profile: { jobs: { pollIntervalMs: 5 } } } })
  root.provide('harnessComfyuiWorkbench', { service: { async authorizeGeneration() {} } })
  root.provide('imageReader', {})
  root.provide('workspaceRegistry', { async resolveByPath() { return { id: 'native-workspace' } } })
  root.provide('subagents', { list: async () => [], listDescendants: async () => ({ agents: [] }) })
  await root.plugin(sessions.default)
  await root.plugin(projections.default)
  await root.plugin(agents.default)
  await root.plugin(jobsLocal.default)
  await root.plugin(prompt.default)
  await root.plugin(tools.default)
  await root.plugin(skills.default)
  await root.plugin(presets.default, { default: 'harness-comfyui-prompt' })
  root.tools.register(fixtureTool('unrelated_global'))
  for (const role of configuration.roles) registrations.push(await root.agentPresets.register({ id: role.id, name: role.name, plugins: specialistComposition(role.id) }))
  for (const role of configuration.roles) {
    const parent = { id: `parent-${role.id}` }
    const parentScope = scope.createScope(root, parent)
    scopes.push(parentScope)
    await parentScope.ctx.plugin({ inject: ['tools'], apply(ctx) { ctx.tools.register(fixtureTool('unrelated_parent')) } })
    for (const kind of ['standalone', 'child']) {
      const agent = { id: `${kind}-${role.id}` }
      const mounted = scope.createScope(kind === 'child' ? parentScope.ctx : root, agent)
      scopes.push(mounted)
      await root.agentPresets.mount(mounted.ctx, role.id)
      mountedAgents.push(agent)
      const lateName = `unrelated_late_${agent.id}`
      registrations.push(root.tools.register(fixtureTool(lateName)))
      assert.equal(names(agent).includes(lateName), false)
      if (role.mcpServices.length && !lateServices.has(role.id)) {
        const serviceContext = mcpContexts.find(ctx => scope.scopeOf(ctx) === scope.scopeParentOf(agent))
        assert.ok(serviceContext)
        serviceContext.tools.register(fixtureTool('catalog_late'))
        lateServices.add(role.id)
      }
      const actual = names(agent)
      const business = actual.filter(name => name.startsWith('workbench_'))
      assert.deepEqual(business, [...role.nativeTools].sort(), role.id)
      assert.deepEqual(actual.filter(name => !name.startsWith('catalog_')), [...role.nativeTools, ...role.hostTools].sort(), role.id)
      assert.equal(actual.includes('unrelated_global'), false)
      assert.equal(actual.includes('unrelated_parent'), false)
      assert.equal(actual.includes('bash'), false)
      assert.equal(actual.includes('pwsh'), false)
      if (role.id === 'harness-comfyui-prompt') {
        assert.equal(actual.includes('workbench_task_get'), false)
        assert.equal(actual.includes('workbench_task_publish'), false)
      }
      assert.deepEqual(actual.filter(name => name.startsWith('catalog_')), role.mcpServices.length ? ['catalog_detail', 'catalog_late', 'catalog_query'] : [])
      const assembled = await root.systemPrompt.assemble({ scope: agent })
      assert.ok(assembled.sections.some(section => section.text.includes(role.persona)))
      assert.deepEqual(assembled.tools.map(tool => tool.name).sort(), actual)
      evidence.push({ role: role.id, kind, tools: actual, skills: role.skills.map(skill => skill.name), mcp_services: role.mcpServices, persona: role.persona })
      const skillTool = root.tools.get('skill', agent)
      if (skillTool) loadedSkillTools.push({ tool: skillTool, agent, skill: role.skills[0].name })
      assert.equal(Boolean(skillTool), role.skills.length > 0)
      for (const entry of role.skills) {
        const skill = await skillTool.execute({ name: entry.name }, { agent, signal: new AbortController().signal })
        assert.equal(skill.resourceBase.path, resolve(import.meta.dirname, '../../../.agents/skills', entry.name))
        assert.ok(skill.content.length > 0)
      }
      if (skillTool) await assert.rejects(skillTool.execute({ name: 'comfyui-generate' }, { agent, signal: new AbortController().signal }), /unknown or no longer available/u)
      if (role.mcpServices.length) {
        const result = await root.tools.get('catalog_query', agent).execute({}, { agent, signal: new AbortController().signal })
        assert.ok(result)
      }
      if (role.id === 'harness-comfyui-run' && kind === 'child') {
        Object.assign(agent, { session: root.sessions.create(agent.id, { meta: { cwd: directory } }), options: {}, status: 'running', ctx: mounted.ctx })
        registrations.push(root.agents.enter(agent))
        await root.agents.announce(agent, 'startup')
        const submit = (callId, signal) => {
          const input = { items: [{ request_id: randomUUID(), request: { title: 'controlled portrait', instance_id: '2', template_id: '34', model: null, parameters: {}, loras: [] } }] }
          agent.session.append('tool/call', { callId, name: 'workbench_run_submit', turn: 1, step: 1, arguments: JSON.stringify(input) })
          return root.tools.execute({ name: 'workbench_run_submit', arguments: input, agent, callId, signal })
        }
        const registered = () => new Promise(resolveRegistered => {
          const off = root.jobs.events.subscribe({ owner: agent.id }, event => { if (event.type === 'registered') { off(); resolveRegistered(event.job.id) } })
        })
        const firstRegistration = registered()
        let returned = false
        const pending = submit('native-delayed', new AbortController().signal).then(result => { returned = true; return result })
        await firstRegistration
        assert.equal(returned, false)
        const first = [...nativeRuns.values()].at(-1)
        first.status = 'succeeded'
        first.images = [{ media_id: 'native-image', node_id: 'output', output_index: 0, filename: 'result.png', media_type: 'image/png', file_path: join(directory, 'result.png') }]
        const result = await pending
        assert.equal(result.isError, false, JSON.stringify(result))
        const final = JSON.parse(result.content[0].text)
        assert.equal(final.runs[0].status, 'succeeded')
        assert.equal(final.runs[0].images[0].media_id, 'native-image')
        assert.equal(root.jobs.list(agent.id).length, 0)
        const controller = new AbortController()
        const secondRegistration = registered()
        const cancelled = submit('native-cancelled', controller.signal)
        const jobId = await secondRegistration
        controller.abort(new Error('User stopped foreground observation'))
        assert.equal((await cancelled).isError, true)
        assert.equal((await root.jobs.wait(jobId, 1000, agent.id)).status, 'killed')
        assert.equal([...nativeRuns.values()].at(-1).status, 'remote_running')
      }
      const switchRole = configuration.roles.find(candidate => candidate.id !== role.id && candidate.functions.includes('parameters')) ?? configuration.roles.find(candidate => candidate.functions.includes('resources'))
      await root.agentPresets.mount(mounted.ctx, switchRole.id)
      assert.deepEqual(names(agent).filter(name => name.startsWith('workbench_')), [...switchRole.nativeTools].sort())
      assert.equal(names(agent).includes('skill'), false)
      await mounted.dispose()

    }
  }
  for (const unregister of registrations.splice(0).reverse()) await unregister()
  for (const agent of mountedAgents) assert.equal(names(agent).some(name => name.startsWith('workbench_')), false)
  for (const loaded of loadedSkillTools) await assert.rejects(loaded.tool.execute({ name: loaded.skill }, { agent: loaded.agent, signal: new AbortController().signal }))
  const evidenceDirectory = resolve(import.meta.dirname, '../../../.local/implementation/experiment-agent-presets')
  await mkdir(evidenceDirectory, { recursive: true })
  await writeFile(join(evidenceDirectory, 'preset-scope-evidence.json'), JSON.stringify({ sdk: process.argv[2], observations: evidence, late_global_hidden: true, late_mcp_visible: true, preset_switch_verified: true, tools_and_skill_providers_released: true, foreground_wait_verified: true, cancellation_preserves_run: true }, null, 2) + '\n')
  console.log(JSON.stringify({ roles: 7, standalone: 7, child: 7, released: true }))
} finally {
  for (const mounted of scopes.reverse()) await mounted.dispose()
  for (const unregister of registrations.reverse()) await unregister()
  await root.fiber.dispose()
  await rm(directory, { recursive: true, force: true })
}

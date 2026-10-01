import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const repositoryRoot = resolve(import.meta.dirname, '../../..')
const localRequire = createRequire(import.meta.url)
const registryEntry = localRequire.resolve('@deepseek-ai/dsh-agent-preset-registry')
const registryRequire = createRequire(registryEntry)
const yaml = registryRequire('js-yaml')

const [cordis, registryModule, scopeModule, skillModule, loaderModule, includeModule] = await Promise.all([
  import(pathToFileURL(registryRequire.resolve('@deepseek-ai/cordis')).href),
  import(pathToFileURL(registryEntry).href),
  import(pathToFileURL(registryRequire.resolve('@deepseek-ai/dsh-scope')).href),
  import(pathToFileURL(registryRequire.resolve('@deepseek-ai/dsh-skill')).href),
  import(pathToFileURL(registryRequire.resolve('@deepseek-ai/cordis-plugin-loader')).href),
  import(pathToFileURL(registryRequire.resolve('@deepseek-ai/cordis-plugin-include')).href),
])

const { Context } = cordis
const { AgentPresetRegistry, livePresetMounts } = registryModule
const { createScope, scopeOf } = scopeModule
const SkillRegistry = skillModule.default
const presetRows = yaml.load(await readFile(
  resolve(repositoryRoot, 'agent-presets/presets.cordis.yml'),
  'utf8',
))

async function scopedDefinition(presetRow) {
  const compositionPath = resolve(repositoryRoot, 'agent-presets', presetRow.config.id, 'agent.cordis.yml')
  const composition = yaml.load(await readFile(compositionPath, 'utf8'), {
    schema: includeModule.entryListSchema,
  })
  const installedSkillsRow = composition.find(row => row.id === 'skill-filesystem')
  const group = presetRow.config.plugins.find(row => row.id === 'project-skill-scope')
  const skillsRow = group.config.find(row => row.id === 'skills')

  assert.equal(installedSkillsRow?.name, '../project-installed-skills.mjs')
  // Preserve the candidate's exact isolation group and actual filesystem row; omit unrelated plugins that need Desktop Host services.
  return {
    ...structuredClone(presetRow.config),
    plugins: [{
      ...structuredClone(group),
      config: [
        structuredClone(skillsRow),
        {
          ...structuredClone(installedSkillsRow),
          name: pathToFileURL(resolve(dirname(compositionPath), installedSkillsRow.name)).href,
        },
      ],
    }],
  }
}

async function skillNamesOnDisk() {
  const directory = resolve(repositoryRoot, '.agents/skills')
  const entries = await readdir(directory, { withFileTypes: true })
  const names = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if ((await readdir(resolve(directory, entry.name))).includes('SKILL.md')) names.push(entry.name)
  }
  return names.sort()
}

function hostProvider() {
  const candidate = {
    name: 'host-workspace-skill',
    description: 'Host workspace instructions',
    invocation: { modelInvocable: true, userInvocable: false },
    source: 'user-agents',
    provider: 'test-host',
    rank: 600,
    locator: 'host-workspace-skill',
  }
  return {
    name: 'test-host',
    list: async () => [candidate],
    get: async () => ({ ...candidate, content: 'Host workspace instructions' }),
  }
}

async function assertSkills(skills, session, names) {
  const scope = scopeOf(session.ctx)
  assert.ok(scope)
  const rows = await skills.list({ scope })
  assert.deepEqual(rows.map(row => row.name).sort(), names)
  for (const name of names) {
    const skill = await skills.get(name, { scope })
    assert.equal(skill?.name, name)
    assert.equal(skill?.provider, 'harness-comfyui')
    assert.ok(skill.content.trim().length > 0, `${name} should load its actual Skill content`)
  }
}

async function assertHostSkills(skills) {
  assert.deepEqual((await skills.list()).map(row => row.name), ['host-workspace-skill'])
  assert.equal((await skills.get('host-workspace-skill'))?.content, 'Host workspace instructions')
  assert.equal(await skills.get('anima-prompt-builder'), undefined)
}

function presetMountCount(presetId) {
  return livePresetMounts().filter(mount => mount.presetId === presetId).length
}

const context = new Context()
const unregisterById = new Map()
const sessions = []
const redEvidence = []
let unregisterHostProvider = () => {}

try {
  const baseUrl = pathToFileURL(resolve(repositoryRoot, 'agent-presets/presets.cordis.yml')).href
  context.provide('sessionProjections', { register: () => () => {}, stateOf: () => undefined })
  context.provide('settings', { configure: () => () => {} })

  const hostSkillsFiber = context.plugin(SkillRegistry)
  await hostSkillsFiber
  const hostSkills = hostSkillsFiber.ctx.skills
  unregisterHostProvider = hostSkills.registerProvider(hostProvider)
  const loaderFiber = context.plugin(loaderModule.Loader, {
    baseUrl: pathToFileURL(resolve(repositoryRoot, 'cordis.patch.yml')).href,
  })
  await loaderFiber
  loaderFiber.ctx.loader.builtins.group = loaderModule.Group

  const registryContext = context.extend({ baseUrl })
  const registryFiber = registryContext.plugin(AgentPresetRegistry, { default: 'harness-comfyui-cli-candidate' })
  await registryFiber
  const registry = registryFiber.ctx.agentPresets
  const workbenchRow = presetRows.find(row => row.config.id === 'harness-comfyui-cli-candidate')
  const iterationRow = presetRows.find(row => row.config.id === 'harness-comfyui-iteration')
  const workbenchDefinition = await scopedDefinition(workbenchRow)
  const iterationDefinition = await scopedDefinition(iterationRow)
  const names = await skillNamesOnDisk()
  assert.equal(names.length, 8)

  const noIsolationDefinition = structuredClone(workbenchDefinition)
  noIsolationDefinition.id = 'harness-comfyui-cli-candidate-without-isolation'
  noIsolationDefinition.plugins[0].id = 'control-skill-scope-without-isolation'
  delete noIsolationDefinition.plugins[0].isolate
  unregisterById.set(noIsolationDefinition.id, await registry.register(noIsolationDefinition))
  const noIsolation = await registry.resolve(noIsolationDefinition.id)
  assert.match(noIsolation.broken ?? '', /skills/u)
  redEvidence.push(noIsolation.broken)
  await unregisterById.get(noIsolationDefinition.id)()
  unregisterById.delete(noIsolationDefinition.id)
  await assertHostSkills(hostSkills)

  unregisterById.set(iterationDefinition.id, await registry.register(iterationDefinition))
  unregisterById.set(workbenchDefinition.id, await registry.register(workbenchDefinition))
  assert.deepEqual(await registry.resolve(iterationDefinition.id), { id: iterationDefinition.id })
  assert.deepEqual(await registry.resolve(workbenchDefinition.id), { id: workbenchDefinition.id })

  const iterationSession = createScope(context, { sessionId: Symbol(iterationDefinition.id) })
  sessions.push(iterationSession)
  assert.deepEqual(await registry.mount(iterationSession.ctx, iterationDefinition.id), { id: iterationDefinition.id })
  const workbenchSession = createScope(context, { sessionId: Symbol(workbenchDefinition.id) })
  sessions.push(workbenchSession)
  assert.deepEqual(await registry.mount(workbenchSession.ctx, workbenchDefinition.id), { id: workbenchDefinition.id })
  const iterationSkills = registry.serviceFor({ ctx: iterationSession.ctx }, 'skills')
  const workbenchSkills = registry.serviceFor({ ctx: workbenchSession.ctx }, 'skills')

  assert.equal(registry.composedPreset(iterationSession.ctx), iterationDefinition.id)
  assert.equal(registry.composedPreset(workbenchSession.ctx), workbenchDefinition.id)
  assert.ok(iterationSkills, 'iteration Session must expose its isolated Skills registry')
  assert.ok(workbenchSkills, 'workbench Session must expose its isolated Skills registry')
  assert.equal(iterationSkills === hostSkills, false, 'iteration Session must not share the Host Skills registry')
  assert.equal(workbenchSkills === hostSkills, false, 'workbench Session must not share the Host Skills registry')
  assert.equal(iterationSkills === workbenchSkills, false, 'product Presets must have distinct Skills registries')
  await assertSkills(iterationSkills, iterationSession, names)
  await assertSkills(workbenchSkills, workbenchSession, names)
  await assertHostSkills(hostSkills)

  assert.equal(presetMountCount(workbenchDefinition.id), 1)
  await unregisterById.get(workbenchDefinition.id)()
  unregisterById.delete(workbenchDefinition.id)
  await assert.rejects(registry.resolve(workbenchDefinition.id), /Unknown agent preset/u)
  assert.equal(presetMountCount(workbenchDefinition.id), 1)
  const retiredSessionSkills = registry.serviceFor({ ctx: workbenchSession.ctx }, 'skills')
  assert.equal(retiredSessionSkills !== undefined, true, 'retired generation must keep its Session service live')
  assert.equal(registryModule.standingMountFor(workbenchSession.ctx)?.presetId, workbenchDefinition.id)
  await assertSkills(retiredSessionSkills, workbenchSession, names)
  await assertSkills(iterationSkills, iterationSession, names)
  await assertHostSkills(hostSkills)

  unregisterById.set(workbenchDefinition.id, await registry.register(workbenchDefinition))
  const workbenchReloadedSession = createScope(context, { sessionId: Symbol('workbench-reloaded') })
  sessions.push(workbenchReloadedSession)
  await registry.mount(workbenchReloadedSession.ctx, workbenchDefinition.id)
  const reloadedSkills = registry.serviceFor({ ctx: workbenchReloadedSession.ctx }, 'skills')
  assert.ok(reloadedSkills)
  assert.equal(reloadedSkills === workbenchSkills, false, 'reloaded Preset must use a new Skills registry')
  assert.equal(presetMountCount(workbenchDefinition.id), 2)
  await assertSkills(reloadedSkills, workbenchReloadedSession, names)
  await assertSkills(workbenchSkills, workbenchSession, names)

  await workbenchSession.dispose()
  sessions.splice(sessions.indexOf(workbenchSession), 1)
  assert.equal(registry.serviceFor({ ctx: workbenchSession.ctx }, 'skills') === undefined, true)
  assert.equal(presetMountCount(workbenchDefinition.id), 1)
  await assertSkills(reloadedSkills, workbenchReloadedSession, names)
  await assertSkills(iterationSkills, iterationSession, names)

  await unregisterById.get(workbenchDefinition.id)()
  unregisterById.delete(workbenchDefinition.id)
  assert.equal(presetMountCount(workbenchDefinition.id), 1)
  await assertSkills(reloadedSkills, workbenchReloadedSession, names)
  await workbenchReloadedSession.dispose()
  sessions.splice(sessions.indexOf(workbenchReloadedSession), 1)
  assert.equal(registry.serviceFor({ ctx: workbenchReloadedSession.ctx }, 'skills') === undefined, true)
  assert.equal(presetMountCount(workbenchDefinition.id), 0)

  unregisterById.set(workbenchDefinition.id, await registry.register(workbenchDefinition))
  const restoredSession = createScope(context, { sessionId: Symbol('workbench-restored') })
  sessions.push(restoredSession)
  await registry.mount(restoredSession.ctx, workbenchDefinition.id)
  const restoredSkills = registry.serviceFor({ ctx: restoredSession.ctx }, 'skills')
  assert.ok(restoredSkills)
  await assertSkills(restoredSkills, restoredSession, names)
  await assertSkills(iterationSkills, iterationSession, names)
  await assertHostSkills(hostSkills)

  console.log(JSON.stringify({
    activeProductSessions: 2,
    hostSkills: 1,
    installedSkills: names,
    retiredGenerationSurvivedUser: true,
    disposedAfterUserRelease: true,
    restoredAfterReload: true,
    counterfactualWithoutIsolation: redEvidence,
  }))
} finally {
  for (const session of sessions.reverse()) await session.dispose()
  for (const unregister of [...unregisterById.values()].reverse()) await unregister()
  unregisterHostProvider()
  await context.fiber.dispose()
}

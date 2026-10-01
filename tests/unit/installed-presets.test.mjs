import { execFile } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'

const requireFromModule = createRequire(import.meta.url)
const yaml = requireFromModule('js-yaml')
const executeFile = promisify(execFile)
const repositoryRoot = resolve(import.meta.dirname, '../..')
const temporaryPaths = []

async function readYaml(path) {
  return yaml.load(await readFile(path, 'utf8'))
}

function findRow(rows, id) {
  return rows.find(row => row.id === id)
}

async function entryListProblemFor(rows) {
  const registryEntry = requireFromModule.resolve('@deepseek-ai/dsh-agent-preset-registry')
  const registryModule = await import(pathToFileURL(registryEntry).href)
  return registryModule.entryListProblem(rows)
}

async function findFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...await findFiles(path))
    else if (entry.isFile() && /\.ya?ml$/u.test(entry.name)) files.push(path)
  }
  return files
}

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('official installed Preset declarations', () => {
  it('loads the Client-bearing package and installed Presets without changing Host defaults', async () => {
    const patch = await readFile(resolve(repositoryRoot, 'cordis.patch.yml'), 'utf8')
    expect(patch).toMatch(/name: harness-comfyui\s*$/m)
    expect(patch).toContain('name: ./agent-presets/project-installed-presets.mjs')
    expect(patch).not.toMatch(/^- id: (?:agent-default-model|llm-pi-ai|agent-preset-registry|bash-sandbox)$/m)
    expect(patch).not.toContain('process.env.HARNESS_COMFYUI_CONFIGURATION_PROFILE')
  })

  it('declares exactly the two existing Presets and loads each installed composition', async () => {
    const entries = await readYaml(resolve(repositoryRoot, 'agent-presets/presets.cordis.yml'))
    const workbench = findRow(entries, 'preset-harness-comfyui-cli-candidate')
    const iteration = findRow(entries, 'preset-harness-comfyui-iteration')

    expect(entries).toHaveLength(2)
    expect(entries.map(({ id }) => id).sort()).toEqual([
      'preset-harness-comfyui-cli-candidate',
      'preset-harness-comfyui-iteration',
    ])
    expect(entries.every(row => row.name === '@deepseek-ai/dsh-agent-preset')).toBe(true)
    expect(workbench.config).toMatchObject({
      id: 'harness-comfyui-cli-candidate',
      name: 'ComfyUI工作台预设',
      order: 91,
    })
    expect(iteration.config).toMatchObject({
      id: 'harness-comfyui-iteration',
      name: 'ComfyUI迭代预设',
      order: 92,
    })
    expect(await entryListProblemFor(workbench.config.plugins)).toBeUndefined()
    expect(await entryListProblemFor(iteration.config.plugins)).toBeUndefined()
    expect(await entryListProblemFor([{ name: 'cordis:group', group: true, config: {} }]))
      .toBe('group row 1 must hold a list of plugin rows')

    for (const [row, compositionPath] of [
      [workbench, './harness-comfyui-cli-candidate/agent.cordis.yml'],
      [iteration, './harness-comfyui-iteration/agent.cordis.yml'],
    ]) {
      expect(row.config.plugins).toEqual([{
        id: 'project-skill-scope',
        name: 'cordis:group',
        group: true,
        isolate: { skills: true },
        config: [
          { id: 'skills', name: '@deepseek-ai/dsh-skill' },
          { id: 'composition', name: 'cordis:include', config: { path: compositionPath } },
        ],
      }])
    }
    expect(entries.some(row => row.id === 'agent-preset-registry')).toBe(false)
  })

  it('mounts the declaration resource from the installed package and disposes its loader', async () => {
    const installationRoot = await mkdtemp(join(tmpdir(), 'official presets with spaces-'))
    temporaryPaths.push(installationRoot)
    const { createInstalledPresetsComponent } = await import('../../agent-presets/project-installed-presets.mjs')
    const received = vi.fn()
    const disposed = vi.fn()
    function Include(ctx, config) {
      received(config)
      ctx.effect(() => disposed, 'test installed declaration loader')
    }
    const component = createInstalledPresetsComponent({
      moduleUrl: pathToFileURL(join(installationRoot, 'agent-presets/project-installed-presets.mjs')).href,
      loadIncludePlugin: async () => ({ default: Include }),
    })
    const context = new Context()
    const fiber = context.plugin(component)
    await Promise.resolve()
    expect(received).not.toHaveBeenCalled()
    context.provide('loader', {})
    context.provide('agentPresets', {})
    await fiber
    expect(received).toHaveBeenCalledExactlyOnceWith({ path: join(installationRoot, 'agent-presets/presets.cordis.yml') })
    await fiber.dispose()
    expect(disposed).toHaveBeenCalledOnce()
    await context.fiber.dispose()
  })

  it('reports an unavailable official declaration loader before registering Presets', async () => {
    const { createInstalledPresetsComponent } = await import('../../agent-presets/project-installed-presets.mjs')
    const component = createInstalledPresetsComponent({
      loadIncludePlugin: async () => { throw new Error('official include loader unavailable') },
    })
    const context = new Context()
    context.provide('loader', {})
    context.provide('agentPresets', {})
    await expect(context.plugin(component)).rejects.toThrow('official include loader unavailable')
    await context.fiber.dispose()
  })

  it('mounts the installed filesystem component only in the two product Presets', async () => {
    const presetRoot = resolve(repositoryRoot, 'agent-presets')
    const productCompositions = new Set([
      resolve(presetRoot, 'harness-comfyui-cli-candidate/agent.cordis.yml'),
      resolve(presetRoot, 'harness-comfyui-iteration/agent.cordis.yml'),
    ])
    const componentReferences = []

    for (const path of await findFiles(presetRoot)) {
      const content = await readFile(path, 'utf8')
      if (!content.includes('../project-installed-skills.mjs')) continue
      componentReferences.push(path)
    }

    expect(new Set(componentReferences)).toEqual(productCompositions)
    const hostComposition = await readFile(resolve(repositoryRoot, 'cordis.patch.yml'), 'utf8')
    expect(hostComposition).not.toContain('project-installed-skills.mjs')
  })

  it('isolates both live product Sessions on one shared Host and preserves registry revisions', async () => {
    const fixturePath = resolve(repositoryRoot, 'tests/unit/fixtures/installed-presets-runtime.mjs')
    // Native Node keeps the Registry and Scope package identities shared; Vitest transforms created separate scope-key symbols.
    const { stdout } = await executeFile(process.execPath, [fixturePath], {
      cwd: repositoryRoot,
      env: { NODE_ENV: 'test' },
      encoding: 'utf8',
    })
    const result = JSON.parse(stdout.trim())

    expect(result).toMatchObject({
      activeProductSessions: 2,
      hostSkills: 1,
      installedSkills: [
        'anima-prompt-builder',
        'character-portrait-prompt-designer',
        'comfyui-generate',
        'comfyui-image-review',
        'comfyui-iterate-generation',
        'krea2-anime-prompt-builder',
        'local-image-reader',
        'wai-sdxl-prompt-builder',
      ],
      retiredGenerationSurvivedUser: true,
      disposedAfterUserRelease: true,
      restoredAfterReload: true,
      counterfactualWithoutIsolation: [expect.stringMatching(/skills .* service .*registered at <SkillRegistry>/u)],
    })
  })

  it('waits for the scoped skills service, resolves the installed root across spaces, and disposes the provider', async () => {
    const installationRoot = await mkdtemp(join(tmpdir(), 'official plugin install with spaces-'))
    temporaryPaths.push(installationRoot)
    const moduleUrl = pathToFileURL(join(installationRoot, 'agent-presets', 'project-installed-skills.mjs')).href
    const cleanup = vi.fn()
    const filesystemOptions = vi.fn()
    const filesystemPlugin = {
      name: '@deepseek-ai/dsh-skill-filesystem',
      apply(ctx, config) {
        filesystemOptions(config)
        ctx.effect(() => cleanup, 'test filesystem provider')
      },
    }
    const componentModule = await import(pathToFileURL(resolve(
      repositoryRoot,
      'agent-presets/project-installed-skills.mjs',
    )).href)
    const component = componentModule.createProjectInstalledSkillsComponent({
      moduleUrl,
      loadFilesystemPlugin: async () => filesystemPlugin,
    })
    expect(component.inject).toEqual(['skills'])
    const context = new Context()
    const componentFiber = context.plugin(component)

    await Promise.resolve()
    expect(filesystemOptions).not.toHaveBeenCalled()
    const disposeSkills = context.provide('skills', {})
    await componentFiber

    expect(filesystemOptions).toHaveBeenCalledOnce()
    expect(filesystemOptions).toHaveBeenCalledWith({
      providerName: 'harness-comfyui',
      includeDefaultRoots: false,
      watch: false,
      customSkillDirs: [resolve(installationRoot, '.agents', 'skills')],
    })

    await componentFiber.dispose()
    expect(cleanup).toHaveBeenCalledOnce()
    disposeSkills()
    await context.fiber.dispose()
  })

  it('propagates a missing official provider module after the skills service becomes available', async () => {
    const componentModule = await import(pathToFileURL(resolve(
      repositoryRoot,
      'agent-presets/project-installed-skills.mjs',
    )).href)
    const loadFilesystemPlugin = vi.fn(async () => { throw new Error('provider module unavailable') })
    const plugin = componentModule.createProjectInstalledSkillsComponent({ loadFilesystemPlugin })
    const context = new Context()
    const disposeSkills = context.provide('skills', {})
    const componentFiber = context.plugin(plugin)

    await expect(componentFiber).rejects.toThrow('provider module unavailable')
    expect(loadFilesystemPlugin).toHaveBeenCalledOnce()
    disposeSkills()
    await context.fiber.dispose()
  })

  it('propagates provider activation failures through the component fiber', async () => {
    const componentModule = await import(pathToFileURL(resolve(
      repositoryRoot,
      'agent-presets/project-installed-skills.mjs',
    )).href)
    const filesystemPlugin = {
      name: '@deepseek-ai/dsh-skill-filesystem',
      apply() { throw new Error('provider activation failed') },
    }
    const plugin = componentModule.createProjectInstalledSkillsComponent({
      loadFilesystemPlugin: async () => filesystemPlugin,
    })
    const context = new Context()
    const disposeSkills = context.provide('skills', {})

    await expect(context.plugin(plugin)).rejects.toThrow('provider activation failed')

    disposeSkills()
    await context.fiber.dispose()
  })
})

import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import runtimeArtifacts from '../../config/runtime-artifacts.json' with { type: 'json' }
import {
  parseArguments,
  runDesktopDevelopmentCommand,
  runDesktopLifecycleCommand,
} from '../../scripts/desktop/cli.mjs'
import {
  desktopWorktreeStatus,
  desktopWorktreeContext,
  loadDesktopWorktreeContext,
  installSourcePluginGeneration,
  packagedPluginManifest,
  prepareDesktopWorktree,
  SOURCE_PLUGIN_PACKAGE_PATHS,
  sourceProfileInitializeArguments,
  sourcePluginRemoveArguments,
  startDesktopWorktree,
  stopDesktopWorktree,
} from '../../scripts/desktop/worktree.mjs'

const roots = []

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'desktop-worktree-'))
  roots.push(root)
  const desktopSource = resolve(root, '.local/upstreams/dsh-desktop')
  const workspace = resolve(root, 'workspace')
  const skills = resolve(root, '.agents/skills')
  const globalSkills = resolve(root, 'parent-home/.agents/skills')
  const environmentFile = resolve(root, 'user.env')
  await mkdir(resolve(desktopSource, 'node_modules/@deepseek-ai/dsh/lib'), { recursive: true })
  await mkdir(resolve(desktopSource, 'node_modules/.bin'), { recursive: true })
  await mkdir(resolve(root, 'node_modules/.pnpm'), { recursive: true })
  await mkdir(workspace)
  await Promise.all([
    mkdir(skills, { recursive: true }),
    mkdir(globalSkills, { recursive: true }),
  ])
  await writeFile(resolve(root, '.git'), 'gitdir: fixture\n')
  await writeFile(resolve(desktopSource, 'package.json'), '{}\n')
  await writeFile(resolve(desktopSource, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), '')
  await writeFile(resolve(root, 'node_modules/.modules.yaml'), JSON.stringify({
    storeDir: resolve(root, '.pnpm-store/v11'),
    virtualStoreDir: '.pnpm',
  }))
  await writeFile(
    environmentFile,
    'KEY=value\nCOMFYUI_WORKBENCH_DESKTOP_MOBILE_BRIDGE_PORT=shared-development-port-must-not-be-read\n',
  )
  const definition = {
    mainCheckoutPath: root,
    runtimeRelativeRoot: '.local/desktop-development',
    skillSourceRelativePath: '.agents/skills',
  }
  const definitionPath = resolve(root, 'config/desktop-worktree.json')
  const productionDefinitionPath = resolve(root, 'config/desktop-production.json')
  const productionDefinition = {
    desktopSourceRelativePath: '.local/upstreams/dsh-desktop',
    runtimeRelativeRoot: '.local/desktop-production',
    environmentFileRelativePath: 'user.env',
    startupWorkspacePath: workspace,
  }
  const sourceDefinition = {
    source: {
      catalogPort: 18093,
      catalogCliRelativePath: '../catalog/query.mjs',
      sourceCliRelativePath: '../catalog/source.mjs',
    },
  }
  await mkdir(resolve(root, 'config'))
  await writeFile(definitionPath, `${JSON.stringify(definition)}\n`)
  await writeFile(productionDefinitionPath, `${JSON.stringify(productionDefinition)}\n`)
  await writeFile(resolve(root, 'config/source-production.json'), `${JSON.stringify(sourceDefinition)}\n`)
  return {
    root,
    definition,
    definitionPath,
    environmentFile,
    globalSkills,
    productionDefinition,
    productionDefinitionPath,
    skills,
    sourceDefinition,
    workspace,
  }
}

async function freePort() {
  const server = createServer()
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '0.0.0.0', resolveListen)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('cannot allocate fixture port')
  await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()))
  return address.port
}

function developmentPortReservation(port) {
  return { port, release: vi.fn(async () => undefined) }
}

describe('DSH Desktop worktree lifecycle', () => {
  it('starts the complete development Desktop after linking the worktree environment and dependencies to main', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'desktop-development-command-'))
    roots.push(root)
    const mainCheckout = resolve(root, 'main')
    const worktree = resolve(root, 'worktree')
    const desktopSource = resolve(mainCheckout, '.local/upstreams/dsh-desktop')
    const runtimeRoot = resolve(worktree, '.local/desktop-development')
    await Promise.all([
      mkdir(resolve(mainCheckout, 'node_modules/.pnpm'), { recursive: true }),
      mkdir(resolve(desktopSource, 'node_modules/.bin'), { recursive: true }),
      mkdir(worktree, { recursive: true }),
    ])
    await Promise.all([
      writeFile(resolve(mainCheckout, '.env'), 'KEY=value\n'),
      writeFile(resolve(mainCheckout, 'node_modules/.modules.yaml'), JSON.stringify({
        storeDir: resolve(mainCheckout, '.pnpm-store/v11'),
        virtualStoreDir: '.pnpm',
      })),
      writeFile(resolve(worktree, '.git'), 'gitdir: fixture\n'),
    ])
    const definitionPath = resolve(worktree, 'desktop-worktree.json')
    await writeFile(definitionPath, `${JSON.stringify({ mainCheckoutPath: mainCheckout })}\n`)
    const spawnDesktop = vi.fn(() => {
      const child = new EventEmitter()
      child.pid = 43120
      setTimeout(() => child.emit('close', 0, null), 10)
      return child
    })
    const context = {
      repositoryRoot: worktree,
      desktopSource,
      runtimeRoot,
      runtimeHome: resolve(runtimeRoot, 'home'),
      dshHome: resolve(runtimeRoot, 'home/Library/Application Support/dsh-desktop-dev/harness'),
      pidFile: resolve(runtimeRoot, 'desktop.pid'),
      mobileBridgeStateFile: resolve(runtimeRoot, 'state/mobile-bridge.json'),
      harnessLog: resolve(runtimeRoot, 'harness.log'),
      environmentFilePath: resolve(worktree, '.env'),
      startupWorkspacePath: resolve(root, 'workspace'),
      mobileBridgePort: undefined,
      developmentPortClaimRoot: resolve(mainCheckout, '.local/development-port-claims'),
      desktopBuildOutput: resolve(runtimeRoot, 'desktop-out'),
      launchCommand: 'dev',
      catalogPort: 18093,
      catalogCliPath: resolve(root, 'catalog.mjs'),
      sourceCliPath: resolve(root, 'source.mjs'),
      skillSource: resolve(root, 'skills'),
    }
    await Promise.all([mkdir(context.startupWorkspacePath), mkdir(context.skillSource)])
    await mkdir(context.desktopBuildOutput, { recursive: true })
    await writeFile(resolve(context.desktopBuildOutput, 'stale.js'), 'stale output\n')
    const mobileBridgePort = await freePort()

    const installPlugin = vi.fn()
    await expect(runDesktopDevelopmentCommand('start', {
      contextOptions: { repositoryRoot: worktree, definitionPath },
      loadContext: async () => context,
      materializeCli: async () => undefined,
      materializeClient: async () => undefined,
      materializeHost: async () => undefined,
      materializePreset: async () => undefined,
      packagePlugin: async () => resolve(root, 'harness-comfyui.tgz'),
      installPlugin,
      reservePort: async () => developmentPortReservation(mobileBridgePort),
      waitForPortTakeover: async () => undefined,
      remoteDebuggingPort: 43129,
      spawnDesktop,
    })).resolves.toMatchObject({ status: 'stopped', pid: 43120 })

    expect(resolve(worktree, await readlink(resolve(worktree, '.env')))).toBe(resolve(mainCheckout, '.env'))
    expect(resolve(worktree, await readlink(resolve(worktree, 'node_modules')))).toBe(resolve(mainCheckout, 'node_modules'))
    await expect(readFile(resolve(context.desktopBuildOutput, 'stale.js'), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' })
    expect(spawnDesktop).toHaveBeenCalledWith(
      resolve(desktopSource, 'node_modules/node/bin/node'),
      [
        resolve(desktopSource, 'node_modules/pnpm/bin/pnpm.cjs'),
        'dev',
        '--outDir',
        context.desktopBuildOutput,
        '--remoteDebuggingPort',
        '43129',
      ],
      expect.objectContaining({
        cwd: desktopSource,
        detached: true,
        env: expect.objectContaining({
          KEY: 'value',
          COMFYUI_WORKBENCH_DESKTOP_MOBILE_BRIDGE_PORT: String(mobileBridgePort),
          DSH_DESKTOP_MOBILE_BRIDGE_PORT: String(mobileBridgePort),
        }),
      }),
    )

    await expect(runDesktopDevelopmentCommand('start', {
      contextOptions: { repositoryRoot: worktree, definitionPath },
      loadContext: async () => context,
      materializeCli: async () => undefined,
      materializeClient: async () => undefined,
      materializeHost: async () => undefined,
      materializePreset: async () => undefined,
      packagePlugin: async () => resolve(root, 'harness-comfyui.tgz'),
      installPlugin,
      reservePort: async () => developmentPortReservation(mobileBridgePort),
      waitForPortTakeover: async () => undefined,
      remoteDebuggingPort: 43129,
      spawnDesktop,
    })).resolves.toMatchObject({ status: 'stopped', pid: 43120 })
    expect(spawnDesktop).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['a regular .env file', async worktree => writeFile(resolve(worktree, '.env'), 'LOCAL=true\n')],
    ['a wrong .env link', async (worktree, mainCheckout) => {
      const wrongEnvironment = resolve(mainCheckout, 'wrong.env')
      await writeFile(wrongEnvironment, 'WRONG=true\n')
      await symlink(wrongEnvironment, resolve(worktree, '.env'), 'file')
    }],
    ['a regular node_modules directory', async worktree => mkdir(resolve(worktree, 'node_modules'))],
  ])('rejects %s instead of replacing worktree state', async (_name, createConflict) => {
    const root = await mkdtemp(resolve(tmpdir(), 'desktop-development-conflict-'))
    roots.push(root)
    const mainCheckout = resolve(root, 'main')
    const worktree = resolve(root, 'worktree')
    await Promise.all([
      mkdir(resolve(mainCheckout, 'node_modules'), { recursive: true }),
      mkdir(worktree, { recursive: true }),
    ])
    await Promise.all([
      writeFile(resolve(mainCheckout, '.env'), 'KEY=value\n'),
      writeFile(resolve(worktree, '.git'), 'gitdir: fixture\n'),
    ])
    await createConflict(worktree, mainCheckout)
    const definitionPath = resolve(worktree, 'desktop-worktree.json')
    await writeFile(definitionPath, `${JSON.stringify({ mainCheckoutPath: mainCheckout })}\n`)
    const loadContext = vi.fn()

    await expect(runDesktopDevelopmentCommand('start', {
      contextOptions: { repositoryRoot: worktree, definitionPath },
      loadContext,
    })).rejects.toThrow('development checkout')
    expect(loadContext).not.toHaveBeenCalled()
  })

  it('loads the directory-local paths used by this worktree', async () => {
    const value = await fixture()
    const context = await loadDesktopWorktreeContext({
      repositoryRoot: value.root,
      definitionPath: value.definitionPath,
      productionDefinitionPath: value.productionDefinitionPath,
      homeDirectory: resolve(value.root, 'parent-home'),
    })

    expect(context.runtimeRoot).toBe(resolve(value.root, '.local/desktop-development'))
    expect(context.mobileBridgePort).toBeUndefined()
    expect(context.mobileBridgeStateFile).toBe(resolve(
      value.root,
      '.local/desktop-development/state/mobile-bridge.json',
    ))
    expect(context.desktopBuildOutput).toBe(resolve(value.root, '.local/desktop-development/desktop-out'))
    expect(context.dshHome).toBe(resolve(
      value.root,
      '.local/desktop-development/home/Library/Application Support/dsh-desktop-dev/harness',
    ))
    expect(context.skillSource).toBe(value.skills)
    expect(context.skillSource).not.toBe(value.globalSkills)
    expect(desktopWorktreeContext({
      ...value.productionDefinition,
      desktopMode: 'development',
      runtimeRelativeRoot: value.definition.runtimeRelativeRoot,
    }, value.sourceDefinition, {
      repositoryRoot: value.root,
      homeDirectory: resolve(value.root, 'parent-home'),
    }).desktopSource).toBe(resolve(value.root, '.local/upstreams/dsh-desktop'))
  })

  it('allows local release acceptance to use the current checkout as the Desktop source root', async () => {
    const value = await fixture()
    const candidateCheckout = resolve(value.root, 'candidate-checkout')
    const context = await loadDesktopWorktreeContext({
      repositoryRoot: value.root,
      definitionPath: value.definitionPath,
      productionDefinitionPath: value.productionDefinitionPath,
      desktopSourceRoot: candidateCheckout,
      homeDirectory: resolve(value.root, 'parent-home'),
    })

    expect(context.desktopSource).toBe(resolve(candidateCheckout, '.local/upstreams/dsh-desktop'))
  })

  it('links the environment and current worktree Skills before installing the standard Harness plugin', async () => {
    const value = await fixture()
    await Promise.all([
      writeFile(resolve(value.skills, 'candidate-marker.txt'), 'candidate\n'),
      writeFile(resolve(value.globalSkills, 'global-marker.txt'), 'global\n'),
    ])
    const context = await loadDesktopWorktreeContext({
      repositoryRoot: value.root,
      definitionPath: value.definitionPath,
      homeDirectory: resolve(value.root, 'parent-home'),
    })
    const materializeCli = vi.fn(async () => undefined)
    const materializeClient = vi.fn(async () => undefined)
    const materializeHost = vi.fn(async () => undefined)
    const materializePreset = vi.fn(async () => undefined)
    const packagePlugin = vi.fn(async () => resolve(value.root, 'harness-comfyui.tgz'))
    const installPlugin = vi.fn()

    const activeContext = { ...context, mobileBridgePort: 45128 }
    const prepared = await prepareDesktopWorktree(activeContext, {
      materializeCli,
      materializeClient,
      materializeHost,
      materializePreset,
      packagePlugin,
      installPlugin,
      environment: { PATH: '/usr/bin' },
    })

    expect(resolve(activeContext.dshHome, await readlink(resolve(activeContext.dshHome, '.env')))).toBe(value.environmentFile)
    expect(resolve(activeContext.runtimeHome, '.agents', await readlink(resolve(activeContext.runtimeHome, '.agents/skills')))).toBe(value.skills)
    await expect(readFile(resolve(activeContext.runtimeHome, '.agents/skills/candidate-marker.txt'), 'utf8'))
      .resolves.toBe('candidate\n')
    await expect(readFile(resolve(value.globalSkills, 'global-marker.txt'), 'utf8')).resolves.toBe('global\n')
    expect(materializeCli).toHaveBeenCalledWith(value.root)
    expect(materializeClient).toHaveBeenCalledWith(value.root)
    expect(materializeHost).toHaveBeenCalledWith(value.root)
    expect(materializePreset).toHaveBeenCalledWith(value.root, activeContext.dshHome)
    expect(packagePlugin).toHaveBeenCalledWith(activeContext)
    expect(installPlugin).toHaveBeenCalledWith(activeContext, prepared.environment, resolve(value.root, 'harness-comfyui.tgz'))
    expect(prepared.environment).toMatchObject({
      KEY: 'value',
      HOME: activeContext.runtimeHome,
      CFFIXED_USER_HOME: activeContext.runtimeHome,
      DSH_HOME: activeContext.dshHome,
      HARNESS_COMFYUI_CONFIGURATION_PROFILE: 'production',
      HARNESS_COMFYUI_STARTUP_WORKSPACE_PATH: value.workspace,
      HARNESS_COMFYUI_DATA_DIR: resolve(activeContext.runtimeRoot, 'data'),
      HARNESS_COMFYUI_CATALOG_PORT: '18093',
      HARNESS_COMFYUI_CATALOG_CLI_PATH: resolve(value.root, '../catalog/query.mjs'),
      HARNESS_COMFYUI_SOURCE_CLI_PATH: resolve(value.root, '../catalog/source.mjs'),
      DSH_DESKTOP_MOBILE_BRIDGE_PORT: '45128',
      COMFYUI_WORKBENCH_DESKTOP_MOBILE_BRIDGE_PORT: '45128',
    })
  })

  it.each([
    ['missing', undefined],
    ['absolute', '/tmp/external-skills'],
    ['outside the worktree', '../external-skills'],
  ])('rejects a %s development Skill source path without falling back to global Skills', async (_name, path) => {
    const value = await fixture()
    const definition = { ...value.definition }
    if (path === undefined) delete definition.skillSourceRelativePath
    else definition.skillSourceRelativePath = path
    await writeFile(value.definitionPath, `${JSON.stringify(definition)}\n`)

    await expect(loadDesktopWorktreeContext({
      repositoryRoot: value.root,
      definitionPath: value.definitionPath,
      productionDefinitionPath: value.productionDefinitionPath,
      homeDirectory: resolve(value.root, 'parent-home'),
    })).rejects.toThrow('skillSourceRelativePath')
  })

  it('rejects a configured development Skill source that is not a directory', async () => {
    const value = await fixture()
    await rm(value.skills, { recursive: true, force: true })
    await writeFile(value.skills, 'not a directory\n')

    await expect(loadDesktopWorktreeContext({
      repositoryRoot: value.root,
      definitionPath: value.definitionPath,
      productionDefinitionPath: value.productionDefinitionPath,
      homeDirectory: resolve(value.root, 'parent-home'),
    })).rejects.toThrow('skillSourceRelativePath')
  })

  it('rejects a development Skill source symlink that resolves outside the current worktree', async () => {
    const value = await fixture()
    const externalSkills = await mkdtemp(resolve(tmpdir(), 'external-skills-'))
    roots.push(externalSkills)
    await rm(value.skills, { recursive: true, force: true })
    await symlink(externalSkills, value.skills, 'dir')

    await expect(loadDesktopWorktreeContext({
      repositoryRoot: value.root,
      definitionPath: value.definitionPath,
      productionDefinitionPath: value.productionDefinitionPath,
      homeDirectory: resolve(value.root, 'parent-home'),
    })).rejects.toThrow('skillSourceRelativePath')
  })

  it('does not package or install the Desktop plugin when the CLI bundle fails', async () => {
    const value = await fixture()
    const context = await loadDesktopWorktreeContext({
      repositoryRoot: value.root,
      definitionPath: value.definitionPath,
      homeDirectory: resolve(value.root, 'parent-home'),
    })
    const packagePlugin = vi.fn()
    const installPlugin = vi.fn()

    await expect(prepareDesktopWorktree(context, {
      materializeCli: async () => { throw new Error('CLI bundle failed') },
      materializeClient: async () => undefined,
      materializeHost: async () => undefined,
      materializePreset: async () => undefined,
      packagePlugin,
      installPlugin,
    })).rejects.toThrow('CLI bundle failed')
    expect(packagePlugin).not.toHaveBeenCalled()
    expect(installPlugin).not.toHaveBeenCalled()
  })

  it('keeps start in the foreground and lets the stop command terminate the Desktop process group', async () => {
    const value = await fixture()
    const context = await loadDesktopWorktreeContext({
      repositoryRoot: value.root,
      definitionPath: value.definitionPath,
      homeDirectory: resolve(value.root, 'parent-home'),
    })
    const child = new EventEmitter()
    child.pid = 43210
    const spawnDesktop = vi.fn(() => child)
    const mobileBridgePort = await freePort()
    const startPromise = startDesktopWorktree(context, {
      materializeCli: async () => undefined,
      materializeClient: async () => undefined,
      materializeHost: async () => undefined,
      materializePreset: async () => undefined,
      packagePlugin: async () => resolve(value.root, 'harness-comfyui.tgz'),
      installPlugin: () => undefined,
      reservePort: async () => developmentPortReservation(mobileBridgePort),
      waitForPortTakeover: async () => undefined,
      spawnDesktop,
      signalProcess: () => { throw Object.assign(new Error('missing'), { code: 'ESRCH' }) },
    })
    await vi.waitFor(async () => expect((await readFile(context.pidFile, 'utf8')).trim()).toBe('43210'))
    await expect(desktopWorktreeStatus(context, { signalProcess: () => undefined })).resolves.toEqual({
      status: 'running',
      pid: 43210,
      mobileBridgePort,
    })
    child.emit('close', 0, null)
    await expect(startPromise).resolves.toMatchObject({ status: 'stopped', pid: 43210 })

    await writeFile(context.pidFile, '43210\n')
    let running = true
    const signalProcess = vi.fn((pid, signal) => {
      if (signal === 0 && !running) throw Object.assign(new Error('missing'), { code: 'ESRCH' })
      if (pid === -43210 && signal === 'SIGTERM') running = false
    })
    await mkdir(resolve(context.mobileBridgeStateFile, '..'), { recursive: true })
    await writeFile(context.mobileBridgeStateFile, `${JSON.stringify({
      schemaVersion: 1,
      mobileBridgePort,
    })}\n`)
    await expect(desktopWorktreeStatus(context, { signalProcess })).resolves.toEqual({
      status: 'running',
      pid: 43210,
      mobileBridgePort,
    })
    await expect(stopDesktopWorktree(context, { signalProcess })).resolves.toEqual({ status: 'stopped', pid: 43210 })
    await expect(desktopWorktreeStatus(context, { signalProcess })).resolves.toEqual({ status: 'stopped' })
  })

  it('runs two linked-worktree Desktops concurrently with separate ports and process state', async () => {
    const firstFixture = await fixture()
    const secondFixture = await fixture()
    const loadedFirstContext = await loadDesktopWorktreeContext({
      repositoryRoot: firstFixture.root,
      definitionPath: firstFixture.definitionPath,
      homeDirectory: resolve(firstFixture.root, 'parent-home'),
    })
    const loadedSecondContext = await loadDesktopWorktreeContext({
      repositoryRoot: secondFixture.root,
      definitionPath: secondFixture.definitionPath,
      homeDirectory: resolve(secondFixture.root, 'parent-home'),
    })
    const sharedClaimRoot = resolve(firstFixture.root, '.local/shared-development-port-claims')
    const firstContext = { ...loadedFirstContext, developmentPortClaimRoot: sharedClaimRoot }
    const secondContext = {
      ...loadedSecondContext,
      desktopSource: firstContext.desktopSource,
      environmentFilePath: firstContext.environmentFilePath,
      developmentPortClaimRoot: sharedClaimRoot,
    }
    const children = [new EventEmitter(), new EventEmitter()]
    children[0].pid = 43220
    children[1].pid = 43221
    const allocatedPorts = []
    const runningPids = new Set(children.map(child => child.pid))
    const signalProcess = (pid, signal) => {
      const processId = Math.abs(pid)
      if (signal === 'SIGTERM') {
        runningPids.delete(processId)
        return
      }
      if (!runningPids.has(processId)) throw Object.assign(new Error('missing'), { code: 'ESRCH' })
    }
    const sharedStartOptions = {
      materializeCli: async () => undefined,
      materializeClient: async () => undefined,
      materializeHost: async () => undefined,
      materializePreset: async () => undefined,
      packagePlugin: async context => resolve(context.repositoryRoot, 'harness-comfyui.tgz'),
      installPlugin: () => undefined,
      signalProcess,
    }
    const firstStart = startDesktopWorktree(firstContext, {
      ...sharedStartOptions,
      waitForPortTakeover: async () => undefined,
      spawnDesktop: (_command, _arguments, spawnOptions) => {
        allocatedPorts[0] = Number(spawnOptions.env.DSH_DESKTOP_MOBILE_BRIDGE_PORT)
        return children[0]
      },
    })
    const secondStart = startDesktopWorktree(secondContext, {
      ...sharedStartOptions,
      waitForPortTakeover: async () => undefined,
      spawnDesktop: (_command, _arguments, spawnOptions) => {
        allocatedPorts[1] = Number(spawnOptions.env.DSH_DESKTOP_MOBILE_BRIDGE_PORT)
        return children[1]
      },
    })
    await vi.waitFor(async () => {
      expect((await readFile(firstContext.pidFile, 'utf8')).trim()).toBe('43220')
      expect((await readFile(secondContext.pidFile, 'utf8')).trim()).toBe('43221')
    })
    expect(allocatedPorts[0]).not.toBe(allocatedPorts[1])
    expect(firstContext.desktopSource).toBe(secondContext.desktopSource)
    expect(firstContext.environmentFilePath).toBe(secondContext.environmentFilePath)
    expect(firstContext.desktopBuildOutput).not.toBe(secondContext.desktopBuildOutput)

    await expect(desktopWorktreeStatus(firstContext, { signalProcess })).resolves.toEqual({
      status: 'running',
      pid: 43220,
      mobileBridgePort: allocatedPorts[0],
    })
    await expect(desktopWorktreeStatus(secondContext, { signalProcess })).resolves.toEqual({
      status: 'running',
      pid: 43221,
      mobileBridgePort: allocatedPorts[1],
    })

    await expect(stopDesktopWorktree(firstContext, { signalProcess })).resolves.toEqual({
      status: 'stopped',
      pid: 43220,
    })
    children[0].emit('close', 0, null)
    await expect(firstStart).resolves.toMatchObject({ status: 'stopped', pid: 43220 })
    await expect(desktopWorktreeStatus(secondContext, { signalProcess })).resolves.toEqual({
      status: 'running',
      pid: 43221,
      mobileBridgePort: allocatedPorts[1],
    })

    await expect(stopDesktopWorktree(secondContext, { signalProcess })).resolves.toEqual({
      status: 'stopped',
      pid: 43221,
    })
    children[1].emit('close', 0, null)
    await expect(secondStart).resolves.toMatchObject({ status: 'stopped', pid: 43221 })
  })

  it('rejects a second Desktop before Electron starts when the mobile bridge port is occupied', async () => {
    const value = await fixture()
    const context = await loadDesktopWorktreeContext({
      repositoryRoot: value.root,
      definitionPath: value.definitionPath,
      homeDirectory: resolve(value.root, 'parent-home'),
    })
    const mobileBridgePort = await freePort()
    const isolatedContext = { ...context, mobileBridgePort }
    const server = createServer()
    await new Promise((resolveListen, reject) => {
      server.once('error', reject)
      server.listen(mobileBridgePort, '0.0.0.0', resolveListen)
    })
    const spawnDesktop = vi.fn(() => { throw new Error('Electron must not start') })
    try {
      await expect(startDesktopWorktree(isolatedContext, {
        materializeCli: async () => undefined,
        materializeClient: async () => undefined,
        materializeHost: async () => undefined,
        materializePreset: async () => undefined,
        packagePlugin: async () => resolve(value.root, 'harness-comfyui.tgz'),
        installPlugin: () => undefined,
        spawnDesktop,
      })).rejects.toThrow(`DSH Desktop mobile bridge port ${mobileBridgePort} is already in use`)
      expect(spawnDesktop).not.toHaveBeenCalled()
    } finally {
      await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()))
    }
  })

  it('does not publish Desktop state when an unrelated process takes the claimed port', async () => {
    const value = await fixture()
    const context = await loadDesktopWorktreeContext({
      repositoryRoot: value.root,
      definitionPath: value.definitionPath,
      homeDirectory: resolve(value.root, 'parent-home'),
    })
    const mobileBridgePort = await freePort()
    const reservation = developmentPortReservation(mobileBridgePort)
    const child = new EventEmitter()
    child.pid = 43232
    const unrelatedServer = createServer()
    const signalProcess = vi.fn((pid, signal) => {
      if (pid === -43232 && signal === 'SIGTERM') {
        unrelatedServer.close(() => child.emit('close', null, 'SIGTERM'))
      }
    })

    await expect(startDesktopWorktree(context, {
      materializeCli: async () => undefined,
      materializeClient: async () => undefined,
      materializeHost: async () => undefined,
      materializePreset: async () => undefined,
      packagePlugin: async () => resolve(value.root, 'harness-comfyui.tgz'),
      installPlugin: () => undefined,
      reservePort: async () => reservation,
      spawnDesktop: () => {
        unrelatedServer.listen(mobileBridgePort, '0.0.0.0')
        return child
      },
      signalProcess,
      mobileBridgeStartupTimeoutMs: 150,
    })).rejects.toThrow(
      `Desktop process group 43232 did not take ownership of mobile bridge port ${mobileBridgePort}`,
    )
    expect(signalProcess).toHaveBeenCalledWith(-43232, 'SIGTERM')
    expect(reservation.release).toHaveBeenCalled()
    await expect(readFile(context.pidFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(context.mobileBridgeStateFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not start Electron when development port reservation fails', async () => {
    const value = await fixture()
    const context = await loadDesktopWorktreeContext({
      repositoryRoot: value.root,
      definitionPath: value.definitionPath,
      homeDirectory: resolve(value.root, 'parent-home'),
    })
    const spawnDesktop = vi.fn()

    await expect(startDesktopWorktree(context, {
      materializeCli: async () => undefined,
      materializeClient: async () => undefined,
      materializeHost: async () => undefined,
      materializePreset: async () => undefined,
      packagePlugin: async () => resolve(value.root, 'harness-comfyui.tgz'),
      installPlugin: () => undefined,
      reservePort: async () => { throw new Error('development port reservation failed') },
      spawnDesktop,
    })).rejects.toThrow('development port reservation failed')
    expect(spawnDesktop).not.toHaveBeenCalled()
    await expect(readFile(context.pidFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(context.mobileBridgeStateFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each([
    ['close', (child) => child.emit('close', 0, null)],
    ['error', (child) => child.emit('error', new Error('Electron failed before mobile bridge takeover'))],
  ])('observes a child %s before publishing Desktop process state', async (eventName, emitOutcome) => {
    const value = await fixture()
    const context = await loadDesktopWorktreeContext({
      repositoryRoot: value.root,
      definitionPath: value.definitionPath,
      homeDirectory: resolve(value.root, 'parent-home'),
    })
    const child = new EventEmitter()
    child.pid = 43230
    const reservation = developmentPortReservation(await freePort())
    const signalProcess = vi.fn((pid, signal) => {
      if (eventName === 'error' && pid === -43230 && signal === 'SIGTERM') {
        queueMicrotask(() => child.emit('close', null, 'SIGTERM'))
      }
    })
    const start = startDesktopWorktree(context, {
      materializeCli: async () => undefined,
      materializeClient: async () => undefined,
      materializeHost: async () => undefined,
      materializePreset: async () => undefined,
      packagePlugin: async () => resolve(value.root, 'harness-comfyui.tgz'),
      installPlugin: () => undefined,
      reservePort: async () => reservation,
      waitForPortTakeover: async () => new Promise(() => undefined),
      spawnDesktop: () => {
        queueMicrotask(() => emitOutcome(child))
        return child
      },
      signalProcess,
    })

    if (eventName === 'error') await expect(start).rejects.toThrow('Electron failed before mobile bridge takeover')
    else await expect(start).resolves.toEqual({ status: 'stopped', pid: 43230, code: 0, signal: null })
    if (eventName === 'error') expect(signalProcess).toHaveBeenCalledWith(-43230, 'SIGTERM')
    expect(reservation.release).toHaveBeenCalledOnce()
    await expect(readFile(context.pidFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(context.mobileBridgeStateFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each(['mobile bridge state', 'PID'])('terminates Electron when writing %s fails', async failureStage => {
    const value = await fixture()
    const context = await loadDesktopWorktreeContext({
      repositoryRoot: value.root,
      definitionPath: value.definitionPath,
      homeDirectory: resolve(value.root, 'parent-home'),
    })
    const child = new EventEmitter()
    child.pid = 43231
    const reservation = developmentPortReservation(await freePort())
    const signalProcess = vi.fn((pid, signal) => {
      if (pid === -43231 && signal === 'SIGTERM') queueMicrotask(() => child.emit('close', null, 'SIGTERM'))
    })
    const writeFailure = vi.fn(async () => { throw new Error(`${failureStage} write failed`) })
    const options = {
      materializeCli: async () => undefined,
      materializeClient: async () => undefined,
      materializeHost: async () => undefined,
      materializePreset: async () => undefined,
      packagePlugin: async () => resolve(value.root, 'harness-comfyui.tgz'),
      installPlugin: () => undefined,
      reservePort: async () => reservation,
      waitForPortTakeover: async () => undefined,
      spawnDesktop: () => child,
      signalProcess,
      ...(failureStage === 'mobile bridge state'
        ? { writeMobileBridgeState: writeFailure }
        : { writePid: writeFailure }),
    }

    await expect(startDesktopWorktree(context, options)).rejects.toThrow(`${failureStage} write failed`)
    expect(signalProcess).toHaveBeenCalledWith(-43231, 'SIGTERM')
    expect(reservation.release).toHaveBeenCalled()
    await expect(readFile(context.pidFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(context.mobileBridgeStateFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not create a PID file or start Electron when plugin preparation fails', async () => {
    const value = await fixture()
    const context = await loadDesktopWorktreeContext({
      repositoryRoot: value.root,
      definitionPath: value.definitionPath,
      homeDirectory: resolve(value.root, 'parent-home'),
    })
    const spawnDesktop = vi.fn()

    await expect(startDesktopWorktree(context, {
      materializeCli: async () => undefined,
      materializeClient: async () => { throw new Error('client bundle failed') },
      reservePort: async () => developmentPortReservation(await freePort()),
      spawnDesktop,
    })).rejects.toThrow('client bundle failed')
    await expect(readFile(context.pidFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(spawnDesktop).not.toHaveBeenCalled()
  })

  it('removes the PID file when Electron emits a startup error', async () => {
    const value = await fixture()
    const context = await loadDesktopWorktreeContext({
      repositoryRoot: value.root,
      definitionPath: value.definitionPath,
      homeDirectory: resolve(value.root, 'parent-home'),
    })
    const child = new EventEmitter()
    child.pid = 43211
    const signalProcess = vi.fn((pid, signal) => {
      if (pid === -43211 && signal === 'SIGTERM') queueMicrotask(() => child.emit('close', null, 'SIGTERM'))
    })
    const start = startDesktopWorktree(context, {
      materializeCli: async () => undefined,
      materializeClient: async () => undefined,
      materializeHost: async () => undefined,
      materializePreset: async () => undefined,
      packagePlugin: async () => resolve(value.root, 'harness-comfyui.tgz'),
      installPlugin: () => undefined,
      reservePort: async () => developmentPortReservation(await freePort()),
      waitForPortTakeover: async () => undefined,
      spawnDesktop: () => child,
      signalProcess,
    })
    await vi.waitFor(async () => expect((await readFile(context.pidFile, 'utf8')).trim()).toBe('43211'))
    child.emit('error', new Error('Electron failed to start'))

    await expect(start).rejects.toThrow('Electron failed to start')
    expect(signalProcess).toHaveBeenCalledWith(-43211, 'SIGTERM')
    await expect(readFile(context.pidFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('reports a non-zero Electron exit and removes the PID file', async () => {
    const value = await fixture()
    const context = await loadDesktopWorktreeContext({
      repositoryRoot: value.root,
      definitionPath: value.definitionPath,
      homeDirectory: resolve(value.root, 'parent-home'),
    })
    const child = new EventEmitter()
    child.pid = 43212
    const start = startDesktopWorktree(context, {
      materializeCli: async () => undefined,
      materializeClient: async () => undefined,
      materializeHost: async () => undefined,
      materializePreset: async () => undefined,
      packagePlugin: async () => resolve(value.root, 'harness-comfyui.tgz'),
      installPlugin: () => undefined,
      reservePort: async () => developmentPortReservation(await freePort()),
      waitForPortTakeover: async () => undefined,
      spawnDesktop: () => child,
    })
    await vi.waitFor(async () => expect((await readFile(context.pidFile, 'utf8')).trim()).toBe('43212'))
    child.emit('close', 7, null)

    await expect(start).resolves.toEqual({ status: 'failed', pid: 43212, code: 7, signal: null })
    await expect(readFile(context.pidFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a duplicate start before preparing the plugin', async () => {
    const value = await fixture()
    const context = await loadDesktopWorktreeContext({
      repositoryRoot: value.root,
      definitionPath: value.definitionPath,
      homeDirectory: resolve(value.root, 'parent-home'),
    })
    await mkdir(resolve(context.pidFile, '..'), { recursive: true })
    await writeFile(context.pidFile, '43213\n')
    const materializeClient = vi.fn()

    await expect(startDesktopWorktree({ ...context, mobileBridgePort: 45128 }, {
      materializeClient,
      signalProcess: () => undefined,
    })).rejects.toThrow('DSH Desktop is already running with PID 43213')
    expect(materializeClient).not.toHaveBeenCalled()
  })

  it.each([
    ['a non-object state', [], 'must be an object'],
    ['an unknown property', { schemaVersion: 1, mobileBridgePort: 45128, unknown: true }, 'must contain exactly'],
    ['an unsupported schema', { schemaVersion: 2, mobileBridgePort: 45128 }, 'schemaVersion must be 1'],
    ['an invalid port', { schemaVersion: 1, mobileBridgePort: 0 }, 'mobileBridgePort must be an integer'],
  ])('rejects %s for a running Desktop', async (_name, state, message) => {
    const value = await fixture()
    const context = await loadDesktopWorktreeContext({
      repositoryRoot: value.root,
      definitionPath: value.definitionPath,
      homeDirectory: resolve(value.root, 'parent-home'),
    })
    await mkdir(resolve(context.mobileBridgeStateFile, '..'), { recursive: true })
    await writeFile(context.pidFile, '43216\n')
    await writeFile(context.mobileBridgeStateFile, `${JSON.stringify(state)}\n`)

    await expect(desktopWorktreeStatus(context, { signalProcess: () => undefined })).rejects.toThrow(message)
  })

  it('rejects a running development Desktop without mobile bridge state', async () => {
    const value = await fixture()
    const context = await loadDesktopWorktreeContext({
      repositoryRoot: value.root,
      definitionPath: value.definitionPath,
      homeDirectory: resolve(value.root, 'parent-home'),
    })
    await mkdir(resolve(context.pidFile, '..'), { recursive: true })
    await writeFile(context.pidFile, '43217\n')

    await expect(desktopWorktreeStatus(context, { signalProcess: () => undefined }))
      .rejects.toThrow('running DSH Desktop does not define its mobile bridge port')
  })

  it('allows stop to be repeated after the Desktop is already stopped', async () => {
    const value = await fixture()
    const context = await loadDesktopWorktreeContext({
      repositoryRoot: value.root,
      definitionPath: value.definitionPath,
      homeDirectory: resolve(value.root, 'parent-home'),
    })

    await expect(stopDesktopWorktree(context)).resolves.toEqual({ status: 'stopped' })
    await expect(stopDesktopWorktree(context)).resolves.toEqual({ status: 'stopped' })
  })

  it('fails stop when the Desktop process group does not exit before the timeout', async () => {
    const value = await fixture()
    const context = await loadDesktopWorktreeContext({
      repositoryRoot: value.root,
      definitionPath: value.definitionPath,
      homeDirectory: resolve(value.root, 'parent-home'),
    })
    await mkdir(resolve(context.pidFile, '..'), { recursive: true })
    await writeFile(context.pidFile, '43214\n')

    await expect(stopDesktopWorktree(context, {
      signalProcess: () => undefined,
      stopTimeoutMs: 0,
    })).rejects.toThrow('DSH Desktop process 43214 did not stop')
  })

  it('runs restart as stop followed by a new foreground Desktop start', async () => {
    const value = await fixture()
    const context = await loadDesktopWorktreeContext({
      repositoryRoot: value.root,
      definitionPath: value.definitionPath,
      homeDirectory: resolve(value.root, 'parent-home'),
    })
    const child = new EventEmitter()
    child.pid = 43215
    const spawnDesktop = vi.fn(() => {
      setTimeout(() => child.emit('close', 0, null), 10)
      return child
    })

    await expect(runDesktopLifecycleCommand('restart', {
      loadContext: async () => context,
      materializeCli: async () => undefined,
      materializeClient: async () => undefined,
      materializeHost: async () => undefined,
      materializePreset: async () => undefined,
      packagePlugin: async () => resolve(value.root, 'harness-comfyui.tgz'),
      installPlugin: () => undefined,
      reservePort: async () => developmentPortReservation(await freePort()),
      waitForPortTakeover: async () => undefined,
      spawnDesktop,
    })).resolves.toMatchObject({ status: 'stopped', pid: 43215 })
    expect(spawnDesktop).toHaveBeenCalledOnce()
    await expect(readFile(context.pidFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('accepts only the five Desktop worktree commands', () => {
    expect(parseArguments(['restart'])).toEqual({ command: 'restart' })
    expect(() => parseArguments(['health'])).toThrow('start, stop, restart, status, logs')
    expect(() => parseArguments([])).toThrow('start, stop, restart, status, logs')
  })

  it('initializes the web profile without adding the plugin to the legacy shared tree', () => {
    expect(sourcePluginRemoveArguments()).toEqual([
      'plugin', '--profile', 'web', 'remove', '--workspace-root', 'harness-comfyui',
    ])
    expect(sourceProfileInitializeArguments()).toEqual([
      'plugin', '--profile', 'web', 'install', '--no-frozen-lockfile',
    ])
  })

  it('installs and enables the packaged plugin through the Desktop generation interfaces', async () => {
    const value = await fixture()
    const context = await loadDesktopWorktreeContext({
      repositoryRoot: value.root,
      definitionPath: value.definitionPath,
      homeDirectory: resolve(value.root, 'parent-home'),
    })
    await mkdir(resolve(context.dshHome, 'profiles/web'), { recursive: true })
    const installGeneration = vi.fn(async () => ({
      ok: true,
      generation: { id: 'harness-comfyui+0.36.1+fixture', pluginName: 'harness-comfyui' },
    }))
    const writeDesired = vi.fn(async () => undefined)
    const projectGenerations = vi.fn(async () => undefined)
    const spawnedGeneration = { pid: 43129 }
    const spawnGenerationProcess = vi.fn(() => spawnedGeneration)
    const loadDesktopModule = vi.fn(async specifier => {
      if (specifier.endsWith('/installer')) return { installGeneration }
      if (specifier.endsWith('/projection')) return { projectGenerations }
      return {
        withRegistryLock: async (_home, run) => run(),
        readDesired: async () => ['other+1', 'harness-comfyui+old'],
        listGenerations: async () => [
          { id: 'other+1', pluginName: 'other' },
          { id: 'harness-comfyui+old', pluginName: 'harness-comfyui' },
        ],
        writeDesired,
      }
    })

    await installSourcePluginGeneration(context, { PATH: '/usr/bin' }, '/runtime/harness-comfyui.tgz', {
      initializeProfile: async () => undefined,
      loadDesktopModule,
      spawnGenerationProcess,
    })

    expect(installGeneration).toHaveBeenCalledWith(expect.objectContaining({
      dshHome: context.dshHome,
      pluginSpec: '/runtime/harness-comfyui.tgz',
      expectedPluginName: 'harness-comfyui',
    }))
    const generationSpawn = installGeneration.mock.calls[0][0].spawnProcess
    expect(generationSpawn('/desktop/node', ['/desktop/pnpm.cjs', 'add', '/runtime/harness-comfyui.tgz'], {
      cwd: '/runtime/staging',
    })).toBe(spawnedGeneration)
    expect(spawnGenerationProcess).toHaveBeenCalledWith(
      '/desktop/node',
      [
        '/desktop/pnpm.cjs',
        '--ignore-workspace',
        '--store-dir',
        resolve(value.root, '.pnpm-store/v11'),
        'add',
        '/runtime/harness-comfyui.tgz',
      ],
      { cwd: '/runtime/staging' },
    )
    expect(writeDesired).toHaveBeenCalledWith(context.dshHome, [
      'other+1',
      'harness-comfyui+0.36.1+fixture',
    ])
    expect(projectGenerations).toHaveBeenCalledWith(context.dshHome)
    expect(await readFile(resolve(context.dshHome, 'profiles/web/.generations-migrated'), 'utf8')).not.toBe('')
  })

  it('uses the compiled Host module only in the packaged Desktop plugin', () => {
    const source = {
      name: 'harness-comfyui',
      exports: {
        '.': { types: './src/index.ts', default: './src/index.ts' },
        './client': { default: './.local/source-client/client.js' },
      },
    }

    expect(packagedPluginManifest(source)).toMatchObject({
      exports: {
        '.': { types: './src/index.ts', default: './.local/source-host/index.js' },
        './client': { default: './.local/source-client/client.js' },
      },
    })
    expect(source.exports['.'].default).toBe('./src/index.ts')
  })

  it('packages the compiled CLI without the CLI source entry', () => {
    expect(SOURCE_PLUGIN_PACKAGE_PATHS)
      .toContain(dirname(runtimeArtifacts.managedCli.outputEntryRelativePath))
    expect(SOURCE_PLUGIN_PACKAGE_PATHS).not.toContain('scripts/cli')
  })
})

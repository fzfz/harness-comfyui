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
  const skills = resolve(root, 'parent-home/.agents/skills')
  const environmentFile = resolve(root, 'user.env')
  await mkdir(resolve(desktopSource, 'node_modules/@deepseek-ai/dsh/lib'), { recursive: true })
  await mkdir(resolve(desktopSource, 'node_modules/.bin'), { recursive: true })
  await mkdir(resolve(root, 'node_modules/.pnpm'), { recursive: true })
  await mkdir(workspace)
  await mkdir(skills, { recursive: true })
  await writeFile(resolve(root, '.git'), 'gitdir: fixture\n')
  await writeFile(resolve(desktopSource, 'package.json'), '{}\n')
  await writeFile(resolve(desktopSource, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), '')
  await writeFile(resolve(root, 'node_modules/.modules.yaml'), JSON.stringify({
    storeDir: resolve(root, '.pnpm-store/v11'),
    virtualStoreDir: '.pnpm',
  }))
  await writeFile(environmentFile, 'KEY=value\nCOMFYUI_WORKBENCH_DESKTOP_MOBILE_BRIDGE_PORT=45128\n')
  const definition = {
    mainCheckoutPath: root,
    runtimeRelativeRoot: '.local/desktop-development',
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
      harnessLog: resolve(runtimeRoot, 'harness.log'),
      environmentFilePath: resolve(worktree, '.env'),
      startupWorkspacePath: resolve(root, 'workspace'),
      mobileBridgePort: await freePort(),
      launchCommand: 'dev',
      catalogPort: 18093,
      catalogCliPath: resolve(root, 'catalog.mjs'),
      sourceCliPath: resolve(root, 'source.mjs'),
      skillSource: resolve(root, 'skills'),
    }
    await Promise.all([mkdir(context.startupWorkspacePath), mkdir(context.skillSource)])

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
      remoteDebuggingPort: 43129,
      spawnDesktop,
    })).resolves.toMatchObject({ status: 'stopped', pid: 43120 })

    expect(resolve(worktree, await readlink(resolve(worktree, '.env')))).toBe(resolve(mainCheckout, '.env'))
    expect(resolve(worktree, await readlink(resolve(worktree, 'node_modules')))).toBe(resolve(mainCheckout, 'node_modules'))
    expect(spawnDesktop).toHaveBeenCalledWith(
      resolve(desktopSource, 'node_modules/node/bin/node'),
      [
        resolve(desktopSource, 'node_modules/pnpm/bin/pnpm.cjs'),
        'dev',
        '--remoteDebuggingPort',
        '43129',
      ],
      expect.objectContaining({
        cwd: desktopSource,
        detached: true,
        env: expect.objectContaining({
          KEY: 'value',
          DSH_DESKTOP_MOBILE_BRIDGE_PORT: String(context.mobileBridgePort),
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
    expect(context.mobileBridgePort).toBe(45128)
    expect(context.dshHome).toBe(resolve(
      value.root,
      '.local/desktop-development/home/Library/Application Support/dsh-desktop-dev/harness',
    ))
    expect(desktopWorktreeContext({
      ...value.productionDefinition,
      desktopMode: 'development',
      runtimeRelativeRoot: value.definition.runtimeRelativeRoot,
    }, value.sourceDefinition, {
      repositoryRoot: value.root,
      homeDirectory: resolve(value.root, 'parent-home'),
    }).desktopSource).toBe(resolve(value.root, '.local/upstreams/dsh-desktop'))
  })

  it('allows CI acceptance to use the current checkout as the Desktop source root', async () => {
    const value = await fixture()
    const ciCheckout = resolve(value.root, 'ci-checkout')
    const context = await loadDesktopWorktreeContext({
      repositoryRoot: value.root,
      definitionPath: value.definitionPath,
      productionDefinitionPath: value.productionDefinitionPath,
      desktopSourceRoot: ciCheckout,
      homeDirectory: resolve(value.root, 'parent-home'),
    })

    expect(context.desktopSource).toBe(resolve(ciCheckout, '.local/upstreams/dsh-desktop'))
  })

  it('links the environment and all global Skills before installing the standard Harness plugin', async () => {
    const value = await fixture()
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

    const prepared = await prepareDesktopWorktree(context, {
      materializeCli,
      materializeClient,
      materializeHost,
      materializePreset,
      packagePlugin,
      installPlugin,
      environment: { PATH: '/usr/bin' },
    })

    expect(resolve(context.dshHome, await readlink(resolve(context.dshHome, '.env')))).toBe(value.environmentFile)
    expect(resolve(context.runtimeHome, '.agents', await readlink(resolve(context.runtimeHome, '.agents/skills')))).toBe(value.skills)
    expect(materializeCli).toHaveBeenCalledWith(value.root)
    expect(materializeClient).toHaveBeenCalledWith(value.root)
    expect(materializeHost).toHaveBeenCalledWith(value.root)
    expect(materializePreset).toHaveBeenCalledWith(value.root, context.dshHome)
    expect(packagePlugin).toHaveBeenCalledWith(context)
    expect(installPlugin).toHaveBeenCalledWith(context, prepared.environment, resolve(value.root, 'harness-comfyui.tgz'))
    expect(prepared.environment).toMatchObject({
      KEY: 'value',
      HOME: context.runtimeHome,
      CFFIXED_USER_HOME: context.runtimeHome,
      DSH_HOME: context.dshHome,
      HARNESS_COMFYUI_CONFIGURATION_PROFILE: 'production',
      HARNESS_COMFYUI_STARTUP_WORKSPACE_PATH: value.workspace,
      HARNESS_COMFYUI_DATA_DIR: resolve(context.runtimeRoot, 'data'),
      HARNESS_COMFYUI_CATALOG_PORT: '18093',
      HARNESS_COMFYUI_CATALOG_CLI_PATH: resolve(value.root, '../catalog/query.mjs'),
      HARNESS_COMFYUI_SOURCE_CLI_PATH: resolve(value.root, '../catalog/source.mjs'),
      DSH_DESKTOP_MOBILE_BRIDGE_PORT: '45128',
      COMFYUI_WORKBENCH_DESKTOP_MOBILE_BRIDGE_PORT: '45128',
    })
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

  it.each(['', '0', '-1', '1.5', '65536', 'port'])(
    'rejects invalid mobile bridge port %j from the linked environment file',
    async configuredPort => {
      const value = await fixture()
      await writeFile(value.environmentFile, `COMFYUI_WORKBENCH_DESKTOP_MOBILE_BRIDGE_PORT=${configuredPort}\n`)

      await expect(loadDesktopWorktreeContext({
        repositoryRoot: value.root,
        definitionPath: value.definitionPath,
        productionDefinitionPath: value.productionDefinitionPath,
        homeDirectory: resolve(value.root, 'parent-home'),
      })).rejects.toThrow('COMFYUI_WORKBENCH_DESKTOP_MOBILE_BRIDGE_PORT must be an integer from 1 to 65535')
    },
  )

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
    const startPromise = startDesktopWorktree(context, {
      materializeCli: async () => undefined,
      materializeClient: async () => undefined,
      materializeHost: async () => undefined,
      materializePreset: async () => undefined,
      packagePlugin: async () => resolve(value.root, 'harness-comfyui.tgz'),
      installPlugin: () => undefined,
      spawnDesktop,
      signalProcess: () => { throw Object.assign(new Error('missing'), { code: 'ESRCH' }) },
    })
    await vi.waitFor(async () => expect((await readFile(context.pidFile, 'utf8')).trim()).toBe('43210'))
    child.emit('close', 0, null)
    await expect(startPromise).resolves.toMatchObject({ status: 'stopped', pid: 43210 })

    await writeFile(context.pidFile, '43210\n')
    let running = true
    const signalProcess = vi.fn((pid, signal) => {
      if (signal === 0 && !running) throw Object.assign(new Error('missing'), { code: 'ESRCH' })
      if (pid === -43210 && signal === 'SIGTERM') running = false
    })
    await expect(desktopWorktreeStatus(context, { signalProcess })).resolves.toEqual({ status: 'running', pid: 43210 })
    await expect(stopDesktopWorktree(context, { signalProcess })).resolves.toEqual({ status: 'stopped', pid: 43210 })
    await expect(desktopWorktreeStatus(context, { signalProcess })).resolves.toEqual({ status: 'stopped' })
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
    const start = startDesktopWorktree(context, {
      materializeCli: async () => undefined,
      materializeClient: async () => undefined,
      materializeHost: async () => undefined,
      materializePreset: async () => undefined,
      packagePlugin: async () => resolve(value.root, 'harness-comfyui.tgz'),
      installPlugin: () => undefined,
      spawnDesktop: () => child,
    })
    await vi.waitFor(async () => expect((await readFile(context.pidFile, 'utf8')).trim()).toBe('43211'))
    child.emit('error', new Error('Electron failed to start'))

    await expect(start).rejects.toThrow('Electron failed to start')
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

    await expect(startDesktopWorktree(context, {
      materializeClient,
      signalProcess: () => undefined,
    })).rejects.toThrow('DSH Desktop is already running with PID 43213')
    expect(materializeClient).not.toHaveBeenCalled()
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

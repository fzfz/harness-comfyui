import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readlink, realpath, rm, symlink, writeFile } from 'node:fs/promises'
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
  PROCESS_STATE_SCHEMA_VERSION,
  SOURCE_PLUGIN_PACKAGE_PATHS,
  desktopWorktreeStatus,
  loadDesktopWorktreeContext,
  packagedPluginManifest,
  prepareAnywhereDesktop,
  readDesktopWorktreeLogs,
  startDesktopWorktree,
  stopDesktopWorktree,
  verifyManagedProfileInstallation,
} from '../../scripts/desktop/anywhere.mjs'
import { prepareDesktopDevelopmentCheckout } from '../../scripts/desktop/development-checkout.mjs'

const roots = []
const startedAt = '2026-09-09T12:00:00.000Z'

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function fixture(name = 'desktop-anywhere-') {
  const root = await mkdtemp(resolve(tmpdir(), name))
  roots.push(root)
  const desktopRepository = resolve(root, 'desktop-repository')
  const desktopWorkspace = resolve(desktopRepository, 'dsh-plugin-desktop')
  const repositorySkillsRoot = resolve(root, '.agents/skills')
  const startupWorkspacePath = resolve(root, 'workspace')
  const runtimeRoot = resolve(root, '.local/desktop-development')
  const runtimeHome = resolve(runtimeRoot, 'home')
  const dshHome = resolve(runtimeHome, 'harness')
  await Promise.all([
    mkdir(resolve(desktopWorkspace, 'lib'), { recursive: true }),
    mkdir(resolve(desktopWorkspace, 'node_modules/electron'), { recursive: true }),
    mkdir(resolve(desktopWorkspace, 'node_modules/yaml'), { recursive: true }),
    mkdir(repositorySkillsRoot, { recursive: true }),
    mkdir(startupWorkspacePath, { recursive: true }),
    mkdir(resolve(root, 'config'), { recursive: true }),
  ])
  await Promise.all([
    writeFile(resolve(desktopWorkspace, 'package.json'), JSON.stringify({ name: 'dsh-plugin-desktop' })),
    writeFile(resolve(desktopWorkspace, 'lib/main.js'), 'export {}\n'),
    writeFile(resolve(desktopWorkspace, 'node_modules/electron/package.json'), JSON.stringify({
      name: 'electron', version: '43.3.0', main: 'index.cjs',
    })),
    writeFile(resolve(desktopWorkspace, 'node_modules/electron/index.cjs'), "module.exports = '/candidate/electron'\n"),
    writeFile(resolve(desktopWorkspace, 'node_modules/yaml/package.json'), JSON.stringify({
      name: 'yaml', version: '2.8.1', main: 'index.cjs',
    })),
    writeFile(resolve(desktopWorkspace, 'node_modules/yaml/index.cjs'), [
      'exports.parse = JSON.parse',
      'exports.stringify = value => JSON.stringify(value, null, 2)',
      '',
    ].join('\n')),
    writeFile(resolve(root, '.env'), 'KEY=file-value\nHARNESS_COMFYUI_SKILL_DIR=/untrusted/override\n'),
    writeFile(resolve(root, 'config/source-production.json'), JSON.stringify({ source: { catalogPort: 18093 } })),
  ])
  const baseline = Object.freeze({
    packages: {
      desktop: { name: 'dsh-plugin-desktop', version: '2.0.6' },
      harness: { name: '@deepseek-ai/dsh', version: '0.1.2-rc.1' },
      electron: { name: 'electron', version: '43.3.0' },
    },
    profile: {
      name: 'desktop',
      pluginPackageName: 'harness-comfyui',
      setupStateVersion: 2,
      setupRevision: 1,
    },
    startup: {
      host: '127.0.0.1',
      mode: 'compatibility',
      networkExposure: 'loopback',
      openBrowser: false,
      readyTimeoutMs: 100,
      stopTimeoutMs: 0,
    },
    desktopRepository,
    desktopWorkspace,
    desktopMain: resolve(desktopWorkspace, 'lib/main.js'),
  })
  const context = Object.freeze({
    mode: 'development',
    repositoryRoot: root,
    runtimeRoot,
    runtimeHome,
    userData: resolve(runtimeRoot, 'user-data'),
    dshHome,
    environmentFilePath: resolve(root, '.env'),
    startupWorkspacePath,
    catalogPort: 18093,
    agentsHome: resolve(root, 'parent-home/.agents'),
    pidFile: resolve(runtimeRoot, 'desktop.pid'),
    stateFile: resolve(runtimeRoot, 'state/desktop.json'),
    logFile: resolve(runtimeRoot, 'anywhere.log'),
    lifecycleEvidenceFile: resolve(runtimeRoot, 'user-data/lifecycle-events/startup.jsonl'),
    desktopBuildOutput: resolve(runtimeRoot, 'desktop-out'),
    managedPluginDirectory: resolve(runtimeRoot, 'managed-plugins/harness-comfyui'),
    developmentPortClaimRoot: resolve(root, '.local/development-port-claims'),
    desktopRepository,
    desktopWorkspace,
    desktopSource: desktopWorkspace,
    desktopMain: baseline.desktopMain,
    baseline,
  })
  return { baseline, context, repositorySkillsRoot, root }
}

async function installProfile(value, context = value.context) {
  const plugin = { name: 'harness-comfyui', version: '0.40.0' }
  const profileDirectory = resolve(context.dshHome, 'profiles/desktop')
  const manifestPath = resolve(profileDirectory, 'package.json')
  const specifier = 'link:../../managed-plugins/harness-comfyui'
  await Promise.all([
    mkdir(context.managedPluginDirectory, { recursive: true }),
    mkdir(resolve(profileDirectory, 'node_modules'), { recursive: true }),
  ])
  await writeFile(resolve(context.managedPluginDirectory, 'package.json'), JSON.stringify(plugin) + '\n')
  await writeFile(manifestPath, JSON.stringify({
    dependencies: { [plugin.name]: specifier },
    dsh: { profile: { bundles: [plugin.name] } },
  }) + '\n')
  const link = resolve(profileDirectory, 'node_modules', plugin.name)
  await rm(link, { recursive: true, force: true })
  await symlink(context.managedPluginDirectory, link, 'dir')
  return { plugin, profile: { profileDirectory, manifestPath, specifier } }
}

function preparationOptions(value, overrides = {}) {
  const reservation = overrides.reservation ?? { port: 43155, release: vi.fn(async () => undefined) }
  return {
    loadProductAgentConfiguration: async () => ({
      repositorySkillsRoot: value.repositorySkillsRoot,
      repositorySkillsEnvironmentVariable: 'HARNESS_COMFYUI_SKILL_DIR',
    }),
    materializeCli: vi.fn(async () => undefined),
    materializeClient: vi.fn(async () => undefined),
    materializeHost: vi.fn(async () => undefined),
    materializePreset: vi.fn(async () => undefined),
    materializeManagedPlugin: async context => (await installProfile(value, context)).plugin,
    ensureManagedProfile: async context => (await installProfile(value, context)).profile,
    initializeDesktopSettings: async () => true,
    initializeSetupState: async () => true,
    reservePort: async () => reservation,
    environment: {
      PATH: '/caller/bin',
      ELECTRON_RUN_AS_NODE: '1',
      HARNESS_COMFYUI_SKILL_DIR: '/caller/skills',
    },
    recordedAt: startedAt,
    ...overrides,
    reservation,
  }
}

function lifecycleLines(runId, outcome = 'ready') {
  const events = [{ timestamp: startedAt, eventName: 'startup.run.started', runId }]
  if (outcome === 'failed') {
    events.push({
      timestamp: startedAt,
      eventName: 'startup.run.failed',
      runId,
      details: { finalStage: 'renderer' },
    })
  } else {
    events.push(
      {
        timestamp: startedAt,
        eventName: 'renderer.boot.completed',
        runId,
        details: { rendererStatus: 'healthy' },
      },
      {
        timestamp: startedAt,
        eventName: 'startup.run.completed',
        runId,
        details: { rendererStatus: 'healthy' },
      },
    )
  }
  return events.map(event => JSON.stringify(event)).join('\n') + '\n'
}

function childController(pid) {
  const child = new EventEmitter()
  child.pid = pid
  let running = true
  const close = (code = 0, signal = null) => {
    if (!running) return
    running = false
    child.emit('close', code, signal)
  }
  const signalProcess = vi.fn((_pid, signal) => {
    if (signal === 0) {
      if (!running) throw Object.assign(new Error('missing'), { code: 'ESRCH' })
      return
    }
    if (signal === 'SIGTERM' || signal === 'SIGKILL') close(null, signal)
  })
  return { child, close, signalProcess, isRunning: () => running }
}

function processOptions(context, pid, controller, startTime = '42') {
  return {
    signalProcess: controller.signalProcess,
    readProcessIdentity: async () => ({
      startTime,
      command: '/candidate/electron ' + resolve(context.desktopBuildOutput, 'main.cjs'),
    }),
    spawnSync: () => ({ status: 0, stdout: String(pid) + '\n', stderr: '' }),
  }
}

async function writeLifecycle(context, text) {
  await mkdir(dirname(context.lifecycleEvidenceFile), { recursive: true })
  await writeFile(context.lifecycleEvidenceFile, text)
}

async function writeProcessState(context, {
  pid,
  ready,
  runId,
  webPorts,
  startTime = '42',
  runtimeIdentity = {
    runtimeRoot: context.runtimeRoot,
    stateFile: context.stateFile,
    entryPath: resolve(context.desktopBuildOutput, 'main.cjs'),
  },
  processGroupMembers = [{
    pid,
    startTime,
    command: '/candidate/electron ' + resolve(context.desktopBuildOutput, 'main.cjs'),
  }],
}) {
  await mkdir(dirname(context.stateFile), { recursive: true })
  await Promise.all([
    writeFile(context.pidFile, String(pid) + '\n'),
    writeFile(context.stateFile, JSON.stringify({
      schemaVersion: PROCESS_STATE_SCHEMA_VERSION,
      pid,
      startedAt,
      ready,
      ...(runId === undefined ? {} : { runId }),
      processIdentity: {
        startTime,
        command: '/candidate/electron ' + resolve(context.desktopBuildOutput, 'main.cjs'),
      },
      runtimeIdentity,
      processGroupMembers,
      webPorts,
      installation: { packageName: 'harness-comfyui', version: '0.40.0' },
    }) + '\n'),
  ])
}

describe('anywhere Desktop development checkout and preparation', () => {
  it('links the main environment and prepares the dependency view against the Stable workspace', async () => {
    const value = await fixture('desktop-development-checkout-')
    const mainCheckout = resolve(value.root, 'main')
    const worktree = resolve(value.root, 'worktree')
    await Promise.all([
      mkdir(resolve(mainCheckout, 'node_modules'), { recursive: true }),
      mkdir(worktree),
    ])
    await Promise.all([
      writeFile(resolve(mainCheckout, '.env'), 'KEY=value\n'),
      writeFile(resolve(worktree, '.git'), 'gitdir: fixture\n'),
      writeFile(resolve(worktree, 'desktop-worktree.json'), JSON.stringify({ mainCheckoutPath: mainCheckout })),
    ])
    const prepareDesktopDependencies = vi.fn(async () => ({ nodeModulesRoot: resolve(worktree, 'node_modules') }))
    await prepareDesktopDevelopmentCheckout({
      repositoryRoot: worktree,
      definitionPath: resolve(worktree, 'desktop-worktree.json'),
      loadDesktopBaseline: async () => value.baseline,
      prepareDesktopDependencies,
    })

    expect(resolve(worktree, await readlink(resolve(worktree, '.env')))).toBe(resolve(mainCheckout, '.env'))
    expect(prepareDesktopDependencies).toHaveBeenCalledWith({
      repositoryRoot: worktree,
      mainCheckoutRoot: mainCheckout,
      desktopWorkspace: value.baseline.desktopWorkspace,
    })
  })

  it.each([
    ['a regular .env file', async worktree => writeFile(resolve(worktree, '.env'), 'LOCAL=true\n')],
    ['a wrong .env link', async (worktree, mainCheckout) => {
      const wrong = resolve(mainCheckout, 'wrong.env')
      await writeFile(wrong, 'WRONG=true\n')
      await symlink(wrong, resolve(worktree, '.env'), 'file')
    }],
  ])('rejects %s without replacing worktree state', async (_name, createConflict) => {
    const value = await fixture('desktop-development-conflict-')
    const mainCheckout = resolve(value.root, 'main')
    const worktree = resolve(value.root, 'worktree')
    await Promise.all([mkdir(resolve(mainCheckout, 'node_modules'), { recursive: true }), mkdir(worktree)])
    await Promise.all([
      writeFile(resolve(mainCheckout, '.env'), 'KEY=value\n'),
      writeFile(resolve(worktree, '.git'), 'gitdir: fixture\n'),
      writeFile(resolve(worktree, 'desktop-worktree.json'), JSON.stringify({ mainCheckoutPath: mainCheckout })),
    ])
    await createConflict(worktree, mainCheckout)
    await expect(prepareDesktopDevelopmentCheckout({
      repositoryRoot: worktree,
      definitionPath: resolve(worktree, 'desktop-worktree.json'),
      loadDesktopBaseline: async () => value.baseline,
      prepareDesktopDependencies: async () => undefined,
    })).rejects.toThrow('development checkout')
  })

  it('loads isolated anywhere paths while resolving the Stable workspace from the main checkout baseline', async () => {
    const value = await fixture()
    const definitionPath = resolve(value.root, 'config/desktop-worktree.json')
    const productionDefinitionPath = resolve(value.root, 'config/desktop-production.json')
    await Promise.all([
      writeFile(definitionPath, JSON.stringify({
        mainCheckoutPath: resolve(value.root, 'main'),
        runtimeRelativeRoot: '.local/desktop-development',
      })),
      writeFile(productionDefinitionPath, JSON.stringify({
        runtimeRelativeRoot: '.local/desktop-production',
        environmentFileRelativePath: '.env',
        startupWorkspacePath: value.context.startupWorkspacePath,
      })),
    ])

    const context = await loadDesktopWorktreeContext({
      repositoryRoot: value.root,
      definitionPath,
      productionDefinitionPath,
      baseline: value.baseline,
      homeDirectory: resolve(value.root, 'parent-home'),
    })

    expect(context).toMatchObject({
      mode: 'development',
      runtimeRoot: resolve(value.root, '.local/desktop-development'),
      desktopWorkspace: value.baseline.desktopWorkspace,
      desktopMain: value.baseline.desktopMain,
      dshHome: resolve(value.root, '.local/desktop-development/home/harness'),
      userData: resolve(value.root, '.local/desktop-development/user-data'),
    })
    expect(context.developmentPortClaimRoot).toBe(
      resolve(value.root, 'main/.local/development-port-claims'),
    )
  })

  it('prepares Preset-scoped Skills, the managed Profile, first-run state, and the isolated environment', async () => {
    const value = await fixture()
    const options = preparationOptions(value)
    const prepared = await prepareAnywhereDesktop(value.context, options)
    const installation = await verifyManagedProfileInstallation(prepared.context, prepared)

    expect(options.materializeCli).toHaveBeenCalledWith(value.root)
    expect(options.materializeClient).toHaveBeenCalledWith(value.root)
    expect(options.materializeHost).toHaveBeenCalledWith(value.root)
    expect(options.materializePreset).toHaveBeenCalledWith(value.root, value.context.dshHome)
    expect(installation).toMatchObject({
      packageName: 'harness-comfyui',
      version: '0.40.0',
      directory: await realpath(value.context.managedPluginDirectory),
    })
    expect(prepared.environment).toMatchObject({
      KEY: 'file-value',
      HOME: value.context.runtimeHome,
      DSH_HOME: value.context.dshHome,
      DSH_AGENTS_HOME: value.context.agentsHome,
      HARNESS_COMFYUI_SKILL_DIR: value.repositorySkillsRoot,
      HARNESS_COMFYUI_CONFIGURATION_PROFILE: 'production',
      HARNESS_COMFYUI_STARTUP_WORKSPACE_PATH: value.context.startupWorkspacePath,
      HARNESS_COMFYUI_DATA_DIR: resolve(value.context.runtimeRoot, 'data'),
      HARNESS_COMFYUI_CATALOG_PORT: '18093',
      PATH: resolve(value.context.desktopWorkspace, 'node_modules/.bin') + ':/caller/bin',
    })
    expect(prepared.environment).not.toHaveProperty('ELECTRON_RUN_AS_NODE')
    expect(prepared.webPort).toBe(43155)
  })

  it('preserves saved Desktop settings and does not reserve a replacement Host port', async () => {
    const value = await fixture()
    const settingsPath = resolve(value.context.dshHome, 'settings.yaml')
    await mkdir(value.context.dshHome, { recursive: true })
    await writeFile(settingsPath, JSON.stringify({ 'dsh-desktop': { port: 43222, saved: true } }))
    const reservePort = vi.fn()
    const initializeDesktopSettings = vi.fn(async () => false)

    const prepared = await prepareAnywhereDesktop(value.context, preparationOptions(value, {
      reservePort,
      initializeDesktopSettings,
    }))

    expect(prepared.webPort).toBe(43222)
    expect(prepared.reservation).toBeUndefined()
    expect(reservePort).not.toHaveBeenCalled()
    expect(initializeDesktopSettings).toHaveBeenCalledWith(
      expect.objectContaining({ dshHome: value.context.dshHome }),
      expect.any(Function),
      43222,
    )
    expect(JSON.parse(await readFile(settingsPath, 'utf8'))['dsh-desktop'].saved).toBe(true)
  })

  it('stops preparation before Profile installation when a required build fails', async () => {
    const value = await fixture()
    const materializeManagedPlugin = vi.fn()
    const ensureManagedProfile = vi.fn()

    await expect(prepareAnywhereDesktop(value.context, preparationOptions(value, {
      materializeCli: async () => { throw new Error('CLI bundle failed') },
      materializeManagedPlugin,
      ensureManagedProfile,
    }))).rejects.toThrow('CLI bundle failed')
    expect(materializeManagedPlugin).not.toHaveBeenCalled()
    expect(ensureManagedProfile).not.toHaveBeenCalled()
  })

  it('rejects a Profile link that does not target the managed plugin installation', async () => {
    const value = await fixture()
    const installed = await installProfile(value)
    const external = resolve(value.root, 'unexpected-plugin')
    await mkdir(external)
    await rm(resolve(installed.profile.profileDirectory, 'node_modules/harness-comfyui'))
    await symlink(external, resolve(installed.profile.profileDirectory, 'node_modules/harness-comfyui'), 'dir')

    await expect(verifyManagedProfileInstallation(value.context, installed))
      .rejects.toThrow('link does not target the managed installation')
  })
})

describe('anywhere Desktop development lifecycle', () => {
  it('starts Electron and reports ready only after the current Renderer run and Host port ownership are verified', async () => {
    const value = await fixture()
    const controller = childController(43210)
    const options = preparationOptions(value, {
      now: () => new Date(startedAt),
      spawnDesktop: vi.fn(() => {
        setTimeout(() => writeLifecycle(value.context, lifecycleLines('run-current')), 5)
        return controller.child
      }),
      readProcessIdentity: async () => ({
        startTime: '42',
        command: '/candidate/electron ' + resolve(value.context.desktopBuildOutput, 'main.cjs'),
      }),
      signalProcess: controller.signalProcess,
      processGroupIsRunning: async () => controller.isRunning(),
      readProcessGroupMembers: async pid => controller.isRunning() ? [{
        pid,
        startTime: '42',
        command: '/candidate/electron ' + resolve(value.context.desktopBuildOutput, 'main.cjs'),
      }] : [],
      waitForPort: vi.fn(async () => undefined),
      listeningPorts: vi.fn(async () => [43155, 43156]),
    })
    const start = startDesktopWorktree(value.context, options)

    await vi.waitFor(async () => {
      expect(JSON.parse(await readFile(value.context.stateFile, 'utf8'))).toMatchObject({
        ready: true,
        runId: 'run-current',
        webPorts: [43155, 43156],
        installation: { packageName: 'harness-comfyui', version: '0.40.0' },
      })
    })
    await expect(desktopWorktreeStatus(value.context, {
      ...processOptions(value.context, 43210, controller),
      listeningPorts: async () => [43155, 43156],
    })).resolves.toEqual({
      status: 'ready',
      pid: 43210,
      runId: 'run-current',
      webPorts: [43155, 43156],
    })
    expect(options.spawnDesktop).toHaveBeenCalledWith(
      '/candidate/electron',
      [
        resolve(value.context.desktopBuildOutput, 'main.cjs'),
        '--user-data-dir=' + value.context.userData,
      ],
      expect.objectContaining({
        cwd: value.context.runtimeRoot,
        detached: true,
        env: expect.objectContaining({ DSH_HOME: value.context.dshHome }),
      }),
    )
    expect(options.waitForPort).toHaveBeenCalledWith(43155, 43210, expect.any(Number))
    expect(options.waitForPort.mock.calls[0][2]).toBeGreaterThan(0)
    expect(options.waitForPort.mock.calls[0][2]).toBeLessThanOrEqual(100)
    controller.close()
    await expect(start).resolves.toEqual({ status: 'stopped', pid: 43210, code: 0, signal: null })
    expect(options.reservation.release).toHaveBeenCalled()
  })

  it('keeps two worktree instances isolated by Profile, user data, PID state, and Host port', async () => {
    const first = await fixture('desktop-anywhere-first-')
    const second = await fixture('desktop-anywhere-second-')
    const firstController = childController(43220)
    const secondController = childController(43221)
    const makeOptions = (value, controller, port, runId) => preparationOptions(value, {
      reservation: { port, release: vi.fn(async () => undefined) },
      now: () => new Date(startedAt),
      spawnDesktop: vi.fn(() => {
        setTimeout(() => writeLifecycle(value.context, lifecycleLines(runId)), 5)
        return controller.child
      }),
      readProcessIdentity: async () => ({
        startTime: String(controller.child.pid),
        command: '/candidate/electron ' + resolve(value.context.desktopBuildOutput, 'main.cjs'),
      }),
      signalProcess: controller.signalProcess,
      processGroupIsRunning: async () => controller.isRunning(),
      readProcessGroupMembers: async pid => controller.isRunning() ? [{
        pid,
        startTime: String(pid),
        command: '/candidate/electron ' + resolve(value.context.desktopBuildOutput, 'main.cjs'),
      }] : [],
      waitForPort: async () => undefined,
      listeningPorts: async () => [port],
    })
    const firstOptions = makeOptions(first, firstController, 43230, 'run-first')
    const secondOptions = makeOptions(second, secondController, 43231, 'run-second')
    const firstStart = startDesktopWorktree(first.context, firstOptions)
    const secondStart = startDesktopWorktree(second.context, secondOptions)

    await vi.waitFor(async () => {
      expect(JSON.parse(await readFile(first.context.stateFile, 'utf8')).webPorts).toEqual([43230])
      expect(JSON.parse(await readFile(second.context.stateFile, 'utf8')).webPorts).toEqual([43231])
    })
    expect(first.context.dshHome).not.toBe(second.context.dshHome)
    expect(first.context.userData).not.toBe(second.context.userData)
    expect(first.context.pidFile).not.toBe(second.context.pidFile)
    expect(firstOptions.spawnDesktop.mock.calls[0][1]).toContain('--user-data-dir=' + first.context.userData)
    expect(secondOptions.spawnDesktop.mock.calls[0][1]).toContain('--user-data-dir=' + second.context.userData)
    firstController.close()
    secondController.close()
    await expect(Promise.all([firstStart, secondStart])).resolves.toEqual([
      { status: 'stopped', pid: 43220, code: 0, signal: null },
      { status: 'stopped', pid: 43221, code: 0, signal: null },
    ])
  })

  it.each([
    ['a stale healthy run', JSON.stringify({
      timestamp: '2026-09-09T11:59:59.000Z',
      eventName: 'startup.run.completed',
      runId: 'run-old',
      details: { rendererStatus: 'healthy' },
    }) + '\n', 'did not report a healthy current startup run'],
    ['a failed current Renderer run', lifecycleLines('run-failed', 'failed'), 'failed at renderer'],
  ])('terminates Electron and clears state when startup contains %s', async (_name, evidence, message) => {
    const value = await fixture()
    const controller = childController(43232)
    await writeLifecycle(value.context, evidence)
    const options = preparationOptions(value, {
      now: () => new Date(startedAt),
      spawnDesktop: () => controller.child,
      readProcessIdentity: async () => ({
        startTime: '42',
        command: '/candidate/electron ' + resolve(value.context.desktopBuildOutput, 'main.cjs'),
      }),
      signalProcess: controller.signalProcess,
      processGroupIsRunning: async () => controller.isRunning(),
      readyTimeoutMs: 30,
    })

    await expect(startDesktopWorktree(value.context, options)).rejects.toThrow(message)
    expect(controller.signalProcess).toHaveBeenCalledWith(-43232, 'SIGTERM')
    expect(options.reservation.release).toHaveBeenCalled()
    await expect(readFile(value.context.pidFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(value.context.stateFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a Host port owned by another process and cleans up the failed Electron start', async () => {
    const value = await fixture()
    const controller = childController(43233)
    const options = preparationOptions(value, {
      now: () => new Date(startedAt),
      spawnDesktop: () => {
        setTimeout(() => writeLifecycle(value.context, lifecycleLines('run-wrong-port')), 5)
        return controller.child
      },
      readProcessIdentity: async () => ({
        startTime: '42',
        command: '/candidate/electron ' + resolve(value.context.desktopBuildOutput, 'main.cjs'),
      }),
      signalProcess: controller.signalProcess,
      processGroupIsRunning: async () => controller.isRunning(),
      readProcessGroupMembers: async pid => controller.isRunning() ? [{
        pid,
        startTime: '42',
        command: '/candidate/electron ' + resolve(value.context.desktopBuildOutput, 'main.cjs'),
      }] : [],
      waitForPort: async () => undefined,
      listeningPorts: async () => [43156],
    })

    await expect(startDesktopWorktree(value.context, options))
      .rejects.toThrow('does not own configured Web port 43155')
    expect(controller.signalProcess).toHaveBeenCalledWith(-43233, 'SIGTERM')
    expect(options.reservation.release).toHaveBeenCalled()
    await expect(readFile(value.context.pidFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not spawn Electron when Profile preparation fails', async () => {
    const value = await fixture()
    const spawnDesktop = vi.fn()
    const options = preparationOptions(value, {
      ensureManagedProfile: async () => { throw new Error('Profile install failed') },
      spawnDesktop,
    })

    await expect(startDesktopWorktree(value.context, options)).rejects.toThrow('Profile install failed')
    expect(spawnDesktop).not.toHaveBeenCalled()
    await expect(readFile(value.context.pidFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not spawn Electron or publish state when Host port reservation fails', async () => {
    const value = await fixture()
    const spawnDesktop = vi.fn()
    const options = preparationOptions(value, {
      reservePort: async () => { throw new Error('Host port reservation failed') },
      spawnDesktop,
    })

    await expect(startDesktopWorktree(value.context, options))
      .rejects.toThrow('Host port reservation failed')
    expect(spawnDesktop).not.toHaveBeenCalled()
    await expect(readFile(value.context.pidFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(value.context.stateFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects duplicate start and mismatched PID identity before preparing or signalling a process', async () => {
    const value = await fixture()
    const controller = childController(43234)
    await writeProcessState(value.context, { pid: 43234, ready: false, webPorts: [] })
    const materializeCli = vi.fn()

    await expect(startDesktopWorktree(value.context, {
      materializeCli,
      ...processOptions(value.context, 43234, controller),
    })).rejects.toThrow('Desktop is already running with PID 43234')
    expect(materializeCli).not.toHaveBeenCalled()

    await expect(stopDesktopWorktree(value.context, {
      signalProcess: controller.signalProcess,
      readProcessIdentity: async () => ({ startTime: '99', command: '/unrelated/process' }),
      spawnSync: () => ({ status: 0, stdout: '43234\n', stderr: '' }),
    })).rejects.toThrow('is not the process-group leader launched from')
    expect(controller.signalProcess).not.toHaveBeenCalledWith(-43234, expect.any(String))
  })

  it('reports starting, ready, failed ownership, and failed Renderer states', async () => {
    const value = await fixture()
    const controller = childController(43235)
    const options = processOptions(value.context, 43235, controller)
    await writeProcessState(value.context, {
      pid: 43235, ready: false, runId: 'run-status', webPorts: [],
    })
    await writeLifecycle(value.context, JSON.stringify({
      timestamp: startedAt, eventName: 'startup.run.started', runId: 'run-status',
    }) + '\n')
    await expect(desktopWorktreeStatus(value.context, options)).resolves.toEqual({
      status: 'starting', pid: 43235, runId: 'run-status', webPorts: [],
    })

    await writeProcessState(value.context, {
      pid: 43235, ready: true, runId: 'run-status', webPorts: [43155],
    })
    await writeLifecycle(value.context, lifecycleLines('run-status'))
    await expect(desktopWorktreeStatus(value.context, {
      ...options, listeningPorts: async () => [43155],
    })).resolves.toEqual({
      status: 'ready', pid: 43235, runId: 'run-status', webPorts: [43155],
    })
    await expect(desktopWorktreeStatus(value.context, {
      ...options, listeningPorts: async () => [43156],
    })).resolves.toEqual({
      status: 'failed', pid: 43235, runId: 'run-status', webPorts: [43156],
    })

    await writeLifecycle(value.context, lifecycleLines('run-status', 'failed'))
    await expect(desktopWorktreeStatus(value.context, options)).resolves.toEqual({
      status: 'failed', pid: 43235, runId: 'run-status', webPorts: [43155],
    })
  })

  it('rejects stale state when the surviving process-group member identity no longer matches', async () => {
    const value = await fixture()
    const entryPath = resolve(value.context.desktopBuildOutput, 'main.cjs')
    const recordedMember = {
      pid: 43251,
      startTime: 'recorded-child-start',
      command: '/candidate/electron ' + entryPath + ' --renderer',
    }
    await writeProcessState(value.context, {
      pid: 43249,
      ready: true,
      runId: 'run-stale-group',
      webPorts: [43155],
      processGroupMembers: [recordedMember],
    })
    const signalProcess = vi.fn((pid, signal) => {
      if (pid === 43249 && signal === 0) throw Object.assign(new Error('leader exited'), { code: 'ESRCH' })
    })
    const options = {
      signalProcess,
      processGroupIsRunning: async () => true,
      readProcessGroupMembers: async () => [{
        ...recordedMember,
        startTime: 'reused-child-start',
      }],
    }

    await expect(desktopWorktreeStatus(value.context, options)).rejects.toThrow('process group')
    await expect(stopDesktopWorktree(value.context, options)).rejects.toThrow('process group')
    expect(signalProcess.mock.calls.filter(([_pid, signal]) => signal !== 0)).toEqual([])
    await expect(readFile(value.context.pidFile, 'utf8')).resolves.toBe('43249\n')
    await expect(readFile(value.context.stateFile, 'utf8')).resolves.not.toBe('')
  })

  it('rejects another worktree runtime identity before inspecting or signalling its process group', async () => {
    const value = await fixture('desktop-current-worktree-')
    const other = await fixture('desktop-other-worktree-')
    const member = {
      pid: 43253,
      startTime: 'other-child-start',
      command: '/candidate/electron ' + resolve(other.context.desktopBuildOutput, 'main.cjs'),
    }
    await writeProcessState(value.context, {
      pid: 43252,
      ready: true,
      runId: 'run-other-worktree',
      webPorts: [43156],
      runtimeIdentity: {
        runtimeRoot: other.context.runtimeRoot,
        stateFile: other.context.stateFile,
        entryPath: resolve(other.context.desktopBuildOutput, 'main.cjs'),
      },
      processGroupMembers: [member],
    })
    const signalProcess = vi.fn((pid, signal) => {
      if (pid === 43252 && signal === 0) throw Object.assign(new Error('leader exited'), { code: 'ESRCH' })
    })
    const readProcessGroupMembers = vi.fn(async () => [member])
    const options = {
      signalProcess,
      processGroupIsRunning: async () => true,
      readProcessGroupMembers,
    }

    await expect(desktopWorktreeStatus(value.context, options)).rejects.toThrow('different worktree runtime')
    await expect(stopDesktopWorktree(value.context, options)).rejects.toThrow('different worktree runtime')
    expect(readProcessGroupMembers).not.toHaveBeenCalled()
    expect(signalProcess.mock.calls.filter(([_pid, signal]) => signal !== 0)).toEqual([])
    await expect(readFile(value.context.pidFile, 'utf8')).resolves.toBe('43252\n')
  })

  it('keeps and terminates a matching managed process group when the Electron leader has exited', async () => {
    const value = await fixture()
    let groupRunning = true
    const member = {
      pid: 43250,
      startTime: 'managed-child-start',
      command: '/candidate/electron ' + resolve(value.context.desktopBuildOutput, 'main.cjs') + ' --renderer',
    }
    await writeProcessState(value.context, {
      pid: 43239,
      ready: true,
      runId: 'run-leader-exited',
      webPorts: [43155],
      processGroupMembers: [member],
    })
    const signalProcess = vi.fn((pid, signal) => {
      if (pid === 43239 && signal === 0) throw Object.assign(new Error('leader exited'), { code: 'ESRCH' })
      if (pid === -43239 && signal === 'SIGTERM') groupRunning = false
    })
    const options = {
      signalProcess,
      processGroupIsRunning: async () => groupRunning,
      readProcessGroupMembers: async () => [member],
      stopTimeoutMs: 0,
    }

    await expect(desktopWorktreeStatus(value.context, options)).resolves.toEqual({
      status: 'failed',
      pid: 43239,
      runId: 'run-leader-exited',
      webPorts: [43155],
    })
    await expect(readFile(value.context.pidFile, 'utf8')).resolves.toBe('43239\n')
    await expect(stopDesktopWorktree(value.context, options)).resolves.toEqual({
      status: 'stopped',
      pid: 43239,
    })
    expect(signalProcess).toHaveBeenCalledWith(-43239, 'SIGTERM')
    await expect(readFile(value.context.pidFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(value.context.stateFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('terminates Electron and releases the port claim when initial state publication fails', async () => {
    const value = await fixture()
    const controller = childController(43240)
    const options = preparationOptions(value, {
      now: () => new Date(startedAt),
      spawnDesktop: () => {
        writeFileSync(dirname(value.context.stateFile), 'state path conflict\n')
        return controller.child
      },
      readProcessIdentity: async () => ({
        startTime: '42',
        command: '/candidate/electron ' + resolve(value.context.desktopBuildOutput, 'main.cjs'),
      }),
      signalProcess: controller.signalProcess,
      processGroupIsRunning: async () => controller.isRunning(),
    })

    await expect(startDesktopWorktree(value.context, options)).rejects.toThrow()
    expect(controller.signalProcess).toHaveBeenCalledWith(-43240, 'SIGTERM')
    expect(options.reservation.release).toHaveBeenCalled()
    await expect(readFile(value.context.pidFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('reports an abnormal Electron exit after readiness and removes its process state', async () => {
    const value = await fixture()
    const controller = childController(43241)
    const options = preparationOptions(value, {
      now: () => new Date(startedAt),
      spawnDesktop: () => {
        setTimeout(() => writeLifecycle(value.context, lifecycleLines('run-abnormal-exit')), 5)
        return controller.child
      },
      readProcessIdentity: async () => ({
        startTime: '42',
        command: '/candidate/electron ' + resolve(value.context.desktopBuildOutput, 'main.cjs'),
      }),
      signalProcess: controller.signalProcess,
      processGroupIsRunning: async () => controller.isRunning(),
      readProcessGroupMembers: async pid => controller.isRunning() ? [{
        pid,
        startTime: '42',
        command: '/candidate/electron ' + resolve(value.context.desktopBuildOutput, 'main.cjs'),
      }] : [],
      waitForPort: async () => undefined,
      listeningPorts: async () => [43155],
    })
    const start = startDesktopWorktree(value.context, options)
    await vi.waitFor(async () => {
      expect(JSON.parse(await readFile(value.context.stateFile, 'utf8')).ready).toBe(true)
    })
    controller.close(7, null)

    await expect(start).resolves.toEqual({ status: 'failed', pid: 43241, code: 7, signal: null })
    await expect(readFile(value.context.pidFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(value.context.stateFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('uses the real leader exit event to clean a same-group child that keeps inherited log pipes open', async () => {
    const value = await fixture('desktop-real-exit-event-')
    const context = {
      ...value.context,
      baseline: {
        ...value.baseline,
        startup: { ...value.baseline.startup, readyTimeoutMs: 500, stopTimeoutMs: 1000 },
      },
    }
    const holderPidFile = resolve(value.root, 'holder.pid')
    const entryPath = resolve(context.desktopBuildOutput, 'main.cjs')
    const holderCode = 'setInterval(() => undefined, 1000)'
    const leaderCode = [
      "const { spawn } = require('node:child_process')",
      "const { writeFileSync } = require('node:fs')",
      'const holder = spawn(' + JSON.stringify(process.execPath) + ', '
        + JSON.stringify(['-e', holderCode]) + ", { stdio: ['ignore', 'inherit', 'inherit'] })",
      'writeFileSync(' + JSON.stringify(holderPidFile) + ', String(holder.pid))',
      'setTimeout(() => process.exit(0), 250)',
    ].join(';')
    let leaderPid
    let holderPid
    let exitAt
    let closeAt
    let termAt
    const signalProcess = vi.fn((pid, signal) => {
      if (pid < 0 && signal === 'SIGTERM') termAt = Date.now()
      return process.kill(pid, signal)
    })
    const options = preparationOptions(value, {
      now: () => new Date(startedAt),
      readyTimeoutMs: 500,
      spawnDesktop: () => {
        const child = spawn(process.execPath, ['-e', leaderCode], {
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        leaderPid = child.pid
        child.once('exit', () => { exitAt = Date.now() })
        child.once('close', () => { closeAt = Date.now() })
        setTimeout(() => writeLifecycle(context, lifecycleLines('run-real-exit')), 40)
        return child
      },
      readProcessIdentity: async pid => ({
        startTime: 'fixture-start-' + String(pid),
        command: pid === leaderPid
          ? '/candidate/electron ' + entryPath
          : '/fixture/pipe-holder ' + entryPath,
      }),
      signalProcess,
      waitForPort: async () => undefined,
      listeningPorts: async () => [43155],
    })

    try {
      const result = await Promise.race([
        startDesktopWorktree(context, options),
        new Promise((_, reject) => setTimeout(() => reject(new Error('real exit regression timed out')), 3000)),
      ])
      holderPid = Number(await readFile(holderPidFile, 'utf8'))

      expect(result).toEqual({
        status: 'failed',
        pid: leaderPid,
        code: 0,
        signal: null,
        residualProcessGroupTerminated: true,
      })
      expect(exitAt).toBeTypeOf('number')
      expect(termAt).toBeTypeOf('number')
      expect(termAt).toBeGreaterThanOrEqual(exitAt)
      if (closeAt !== undefined) expect(termAt).toBeLessThanOrEqual(closeAt)
      expect(signalProcess).toHaveBeenCalledWith(-leaderPid, 'SIGTERM')
      await expect(readFile(context.pidFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      if (Number.isSafeInteger(leaderPid) && leaderPid > 0) {
        try { process.kill(-leaderPid, 'SIGKILL') } catch {}
      }
      if (Number.isSafeInteger(holderPid) && holderPid > 0) {
        try { process.kill(holderPid, 'SIGKILL') } catch {}
      }
    }
  })

  it('does not signal when the leader identity disappears during stop revalidation', async () => {
    const value = await fixture()
    const pid = 43242
    await writeProcessState(value.context, { pid, ready: true, webPorts: [43155] })
    const signalProcess = vi.fn(() => undefined)
    const identity = {
      startTime: '42',
      command: '/candidate/electron ' + resolve(value.context.desktopBuildOutput, 'main.cjs'),
    }
    const readProcessIdentity = vi.fn()
      .mockResolvedValueOnce(identity)
      .mockResolvedValueOnce(null)
    const readProcessGroupMembers = vi.fn(async () => [])

    await expect(stopDesktopWorktree(value.context, {
      signalProcess,
      readProcessIdentity,
      readProcessGroupMembers,
      spawnSync: () => ({ status: 0, stdout: String(pid) + '\n', stderr: '' }),
    })).resolves.toEqual({ status: 'stopped', pid })

    expect(readProcessIdentity).toHaveBeenCalledTimes(2)
    expect(readProcessGroupMembers).toHaveBeenCalledOnce()
    expect(signalProcess.mock.calls.filter(([_pid, signal]) => signal !== 0)).toEqual([])
    await expect(readFile(value.context.pidFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(value.context.stateFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('cleans a matching residual group when the leader disappears during stop revalidation', async () => {
    const value = await fixture()
    const pid = 43244
    const member = {
      pid: 43245,
      startTime: 'managed-child-start',
      command: '/candidate/electron '
        + resolve(value.context.desktopBuildOutput, 'main.cjs')
        + ' --renderer',
    }
    await writeProcessState(value.context, {
      pid,
      ready: true,
      webPorts: [43155],
      processGroupMembers: [member],
    })
    let groupRunning = true
    const signalProcess = vi.fn((_target, signal) => {
      if (signal === 'SIGTERM') groupRunning = false
    })
    const leaderIdentity = {
      startTime: '42',
      command: '/candidate/electron ' + resolve(value.context.desktopBuildOutput, 'main.cjs'),
    }
    const readProcessIdentity = vi.fn()
      .mockResolvedValueOnce(leaderIdentity)
      .mockResolvedValueOnce(null)
    const readProcessGroupMembers = vi.fn(async () => groupRunning ? [member] : [])

    await expect(stopDesktopWorktree(value.context, {
      signalProcess,
      readProcessIdentity,
      readProcessGroupMembers,
      spawnSync: () => ({ status: 0, stdout: String(pid) + '\n', stderr: '' }),
    })).resolves.toEqual({ status: 'stopped', pid })

    expect(readProcessIdentity).toHaveBeenCalledTimes(2)
    expect(readProcessGroupMembers).toHaveBeenCalled()
    expect(signalProcess).toHaveBeenCalledWith(-pid, 'SIGTERM')
    expect(signalProcess).not.toHaveBeenCalledWith(-pid, 'SIGKILL')
    await expect(readFile(value.context.pidFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(value.context.stateFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not signal when a leader-exit group probe finds no matching live members', async () => {
    const value = await fixture()
    const controller = childController(43243)
    const member = {
      pid: 43243,
      startTime: '42',
      command: '/candidate/electron ' + resolve(value.context.desktopBuildOutput, 'main.cjs'),
    }
    const readProcessGroupMembers = vi.fn()
      .mockResolvedValueOnce([member])
      .mockResolvedValueOnce([member])
      .mockResolvedValueOnce([])
    const processGroupIsRunning = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    const options = preparationOptions(value, {
      now: () => new Date(startedAt),
      spawnDesktop: () => {
        setTimeout(() => writeLifecycle(value.context, lifecycleLines('run-empty-residual')), 5)
        return controller.child
      },
      readProcessIdentity: async () => ({ startTime: '42', command: member.command }),
      readProcessGroupMembers,
      processGroupIsRunning,
      signalProcess: controller.signalProcess,
      waitForPort: async () => undefined,
      listeningPorts: async () => [43155],
    })
    const start = startDesktopWorktree(value.context, options)
    await vi.waitFor(async () => {
      expect(JSON.parse(await readFile(value.context.stateFile, 'utf8')).ready).toBe(true)
    })
    controller.close()

    await expect(start).resolves.toEqual({ status: 'stopped', pid: 43243, code: 0, signal: null })
    expect(readProcessGroupMembers).toHaveBeenCalledTimes(3)
    expect(controller.signalProcess.mock.calls.filter(([_pid, signal]) => signal !== 0)).toEqual([])
    await expect(readFile(value.context.pidFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(value.context.stateFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('stops idempotently and escalates from SIGTERM to SIGKILL', async () => {
    const value = await fixture()
    let running = true
    const signalProcess = vi.fn((_pid, signal) => {
      if (signal === 0 && !running) throw Object.assign(new Error('missing'), { code: 'ESRCH' })
      if (signal === 'SIGKILL') running = false
    })
    const controller = { signalProcess }
    await writeProcessState(value.context, { pid: 43236, ready: false, webPorts: [] })
    const options = {
      ...processOptions(value.context, 43236, controller),
      processGroupIsRunning: async () => running,
      stopTimeoutMs: 0,
    }

    await expect(stopDesktopWorktree(value.context, options)).resolves.toEqual({
      status: 'stopped', pid: 43236,
    })
    expect(signalProcess).toHaveBeenCalledWith(-43236, 'SIGTERM')
    expect(signalProcess).toHaveBeenCalledWith(-43236, 'SIGKILL')
    await expect(stopDesktopWorktree(value.context, options)).resolves.toEqual({ status: 'stopped' })
  })

  it('runs restart as verified stop followed by a new foreground Electron start', async () => {
    const value = await fixture()
    const oldController = childController(43237)
    await writeProcessState(value.context, { pid: 43237, ready: false, webPorts: [] })
    const nextController = childController(43238)
    const signalProcess = vi.fn((pid, signal) => {
      if (pid === -43237 && signal === 'SIGTERM') oldController.close(null, 'SIGTERM')
      if (pid === 43237 && signal === 0 && !oldController.isRunning()) {
        throw Object.assign(new Error('missing'), { code: 'ESRCH' })
      }
      if (pid === 43238 && signal === 0 && !nextController.isRunning()) {
        throw Object.assign(new Error('missing'), { code: 'ESRCH' })
      }
    })
    const events = []
    const materialize = vi.fn(async () => {
      expect(oldController.isRunning()).toBe(false)
      events.push('materialize')
    })
    const prepareDevelopmentSettings = vi.fn(async () => {
      events.push('validate')
      return { materialize }
    })
    const options = preparationOptions(value, {
      now: () => new Date(startedAt),
      spawnSync: () => ({ status: 0, stdout: '43237\n', stderr: '' }),
      spawnDesktop: () => {
        events.push('spawn')
        setTimeout(() => writeLifecycle(value.context, lifecycleLines('run-restart')), 5)
        return nextController.child
      },
      readProcessIdentity: async pid => ({
        startTime: pid === 43237 ? '42' : '43',
        command: '/candidate/electron ' + resolve(value.context.desktopBuildOutput, 'main.cjs'),
      }),
      signalProcess,
      processGroupIsRunning: async pid => pid === 43237
        ? oldController.isRunning()
        : nextController.isRunning(),
      readProcessGroupMembers: async pid => {
        const controller = pid === 43237 ? oldController : nextController
        if (!controller.isRunning()) return []
        return [{
          pid,
          startTime: pid === 43237 ? '42' : '43',
          command: '/candidate/electron ' + resolve(value.context.desktopBuildOutput, 'main.cjs'),
        }]
      },
      waitForPort: async () => undefined,
      listeningPorts: async () => [43155],
    })
    const restart = runDesktopDevelopmentCommand('restart', {
      loadContext: async () => value.context,
      prepareCheckout: async () => ({
        definition: { managedDshSettings: {} },
        mainCheckoutPath: value.root,
      }),
      prepareDevelopmentSettings,
      ...options,
    })
    await vi.waitFor(async () => {
      expect(JSON.parse(await readFile(value.context.stateFile, 'utf8')).ready).toBe(true)
    })
    nextController.close()
    await expect(restart).resolves.toEqual({
      status: 'stopped', pid: 43238, code: 0, signal: null,
    })
    expect(prepareDevelopmentSettings).toHaveBeenCalledOnce()
    expect(materialize).toHaveBeenCalledOnce()
    expect(events).toEqual(['validate', 'materialize', 'spawn'])
  })

  it('validates development settings but does not materialize them when start finds a running Desktop', async () => {
    const value = await fixture()
    const controller = childController(43244)
    await writeProcessState(value.context, { pid: 43244, ready: false, webPorts: [] })
    const materialize = vi.fn(async () => undefined)
    const prepareDevelopmentSettings = vi.fn(async () => ({ materialize }))

    await expect(runDesktopDevelopmentCommand('start', {
      loadContext: async () => value.context,
      prepareCheckout: async () => ({
        definition: { managedDshSettings: {} },
        mainCheckoutPath: value.root,
      }),
      prepareDevelopmentSettings,
      ...processOptions(value.context, 43244, controller),
      processGroupIsRunning: async () => true,
    })).rejects.toThrow('Desktop is already running with PID 43244')
    expect(prepareDevelopmentSettings).toHaveBeenCalledOnce()
    expect(materialize).not.toHaveBeenCalled()
  })

  it('does not initialize development settings for status, logs, or stop', async () => {
    const value = await fixture()
    const prepareCheckout = vi.fn()
    const prepareDevelopmentSettings = vi.fn()

    await expect(runDesktopDevelopmentCommand('status', {
      loadContext: async () => value.context,
      prepareCheckout,
      prepareDevelopmentSettings,
    })).resolves.toEqual({ status: 'stopped' })
    await expect(runDesktopDevelopmentCommand('logs', {
      loadContext: async () => value.context,
      prepareCheckout,
      prepareDevelopmentSettings,
    })).resolves.toEqual({ status: 'logs', output: 'Desktop log has not been created.\n' })
    await expect(runDesktopDevelopmentCommand('stop', {
      loadContext: async () => value.context,
      prepareCheckout,
      prepareDevelopmentSettings,
    })).resolves.toEqual({ status: 'stopped' })
    expect(prepareCheckout).not.toHaveBeenCalled()
    expect(prepareDevelopmentSettings).not.toHaveBeenCalled()
  })

  it('combines Desktop logs and redacts credentials and Harness environment values', async () => {
    const value = await fixture()
    await Promise.all([
      mkdir(resolve(value.context.userData, 'logs'), { recursive: true }),
      mkdir(dirname(value.context.logFile), { recursive: true }),
    ])
    await Promise.all([
      writeFile(
        value.context.logFile,
        'authorization: Bearer launch-secret\nHARNESS_COMFYUI_TOKEN=launch-token\n',
      ),
      writeFile(resolve(value.context.userData, 'logs/host.log'), 'password=host-secret\nhost ready\n'),
    ])

    const output = await readDesktopWorktreeLogs(value.context)
    expect(output).toContain('authorization: Bearer [REDACTED]')
    expect(output).toContain('HARNESS_COMFYUI_TOKEN=[REDACTED]')
    expect(output).toContain('password=[REDACTED]')
    expect(output).toContain('host ready')
    expect(output).not.toContain('launch-secret')
    expect(output).not.toContain('host-secret')
  })

  it('accepts only the five Desktop lifecycle commands', () => {
    expect(parseArguments(['restart'])).toEqual({ command: 'restart' })
    expect(() => parseArguments(['health'])).toThrow('start, stop, restart, status, logs')
    expect(() => parseArguments([])).toThrow('start, stop, restart, status, logs')
  })

  it('uses the compiled Host and managed CLI artifacts in the packaged plugin', () => {
    const source = {
      name: 'harness-comfyui',
      exports: {
        '.': { types: './src/index.ts', default: './src/index.ts' },
        './client': { default: './.local/source-client/client.js' },
      },
    }

    expect(packagedPluginManifest(source).exports['.'].default).toBe('./.local/source-host/index.js')
    expect(source.exports['.'].default).toBe('./src/index.ts')
    expect(SOURCE_PLUGIN_PACKAGE_PATHS).toContain(dirname(runtimeArtifacts.managedCli.outputEntryRelativePath))
    expect(SOURCE_PLUGIN_PACKAGE_PATHS).not.toContain('scripts/cli')
    expect(SOURCE_PLUGIN_PACKAGE_PATHS).toContain('scripts/source-client')
  })
})

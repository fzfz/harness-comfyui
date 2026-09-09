import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { runDesktopProductionCommand } from '../../scripts/desktop/production-cli.mjs'
import { loadDesktopProductionContext, startDesktopWorktree } from '../../scripts/desktop/anywhere.mjs'

const roots = []
const startedAt = '2026-09-09T14:00:00.000Z'

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'desktop-production-anywhere-'))
  roots.push(root)
  const workspace = resolve(root, 'workspace')
  const desktopRepository = resolve(root, 'desktop-repository')
  const desktopWorkspace = resolve(desktopRepository, 'dsh-plugin-desktop')
  const repositorySkillsRoot = resolve(root, '.agents/skills')
  await Promise.all([
    mkdir(resolve(root, 'config'), { recursive: true }),
    mkdir(workspace),
    mkdir(resolve(desktopWorkspace, 'lib'), { recursive: true }),
    mkdir(resolve(desktopWorkspace, 'node_modules/electron'), { recursive: true }),
    mkdir(resolve(desktopWorkspace, 'node_modules/yaml'), { recursive: true }),
    mkdir(repositorySkillsRoot, { recursive: true }),
  ])
  await Promise.all([
    writeFile(resolve(root, '.env'), 'KEY=production-value\nHARNESS_COMFYUI_SKILL_DIR=/ignored\n'),
    writeFile(resolve(root, 'config/desktop-production.json'), JSON.stringify({
      runtimeRelativeRoot: '.local/desktop-production',
      environmentFileRelativePath: '.env',
      startupWorkspacePath: workspace,
    })),
    writeFile(resolve(root, 'config/source-production.json'), JSON.stringify({
      runtimeRelativeRoot: '.local/production',
      source: { catalogPort: 18093 },
    })),
    writeFile(resolve(root, 'config/product-agent.json'), JSON.stringify({
      schemaVersion: 3,
      preset: {
        id: 'harness-comfyui-cli-candidate',
        additionalManagedPresetIds: ['harness-comfyui-iteration'],
        sourceRootRelativePath: 'agent-presets',
        installRootRelativePath: '.agent-presets',
        retiredManagedPresetIds: ['harness-comfyui-schema-control'],
        sharedFiles: [
          'project-tool-visibility.mjs',
          'project-system-prompt-visibility.mjs',
          'project-subagent-workspace.mjs',
        ],
      },
      skills: {
        sourceRootRelativePath: '.agents/skills',
        environmentVariable: 'HARNESS_COMFYUI_SKILL_DIR',
      },
    })),
    writeFile(resolve(root, 'config/environment-overrides.json'), JSON.stringify({
      HARNESS_COMFYUI_SKILL_DIR: { passThrough: true, valueType: 'string' },
    })),
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
  const context = await loadDesktopProductionContext({
    repositoryRoot: root,
    baseline,
    homeDirectory: resolve(root, 'parent-home'),
  })
  return { context, baseline, repositorySkillsRoot, root, workspace }
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

async function writeReadyLifecycle(context) {
  const runId = 'run-production'
  await mkdir(dirname(context.lifecycleEvidenceFile), { recursive: true })
  await writeFile(context.lifecycleEvidenceFile, [
    { timestamp: startedAt, eventName: 'startup.run.started', runId },
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
  ].map(event => JSON.stringify(event)).join('\n') + '\n')
}

describe('anywhere Desktop production lifecycle', () => {
  it('loads production paths and the pinned Stable Electron entrypoint', async () => {
    const value = await fixture()

    expect(value.context).toMatchObject({
      mode: 'production',
      runtimeRoot: resolve(value.root, '.local/desktop-production'),
      runtimeHome: resolve(value.root, '.local/desktop-production/home'),
      userData: resolve(value.root, '.local/desktop-production/user-data'),
      dshHome: resolve(value.root, '.local/desktop-production/home/harness'),
      desktopWorkspace: value.baseline.desktopWorkspace,
      desktopMain: value.baseline.desktopMain,
      startupWorkspacePath: value.workspace,
    })
    expect(value.context).not.toHaveProperty('mobileBridgePort')
    expect(value.context).not.toHaveProperty('launchCommand')
  })

  it.each([
    ['missing', async value => rm(value.repositorySkillsRoot, { recursive: true }), 'does not exist'],
    ['a regular file', async value => {
      await rm(value.repositorySkillsRoot, { recursive: true })
      await writeFile(value.repositorySkillsRoot, 'not a directory\n')
    }, 'must be a directory'],
    ['a symbolic link', async value => {
      const target = resolve(value.root, 'external-skills')
      await mkdir(target)
      await rm(value.repositorySkillsRoot, { recursive: true })
      await symlink(target, value.repositorySkillsRoot, 'dir')
    }, 'must not be a symbolic link'],
  ])('rejects a Repository Skills root that is %s before production Electron starts', async (_name, change, message) => {
    const value = await fixture()
    await change(value)
    const spawnDesktop = vi.fn()

    await expect(startDesktopWorktree(value.context, { spawnDesktop })).rejects.toThrow(message)
    expect(spawnDesktop).not.toHaveBeenCalled()
  })

  it('keeps status, stop, and logs available when Repository Skills are missing', async () => {
    const value = await fixture()
    await rm(value.repositorySkillsRoot, { recursive: true })
    const commandOptions = { loadContext: async () => value.context }

    await expect(runDesktopProductionCommand('status', commandOptions)).resolves.toEqual({ status: 'stopped' })
    await expect(runDesktopProductionCommand('stop', commandOptions)).resolves.toEqual({ status: 'stopped' })
    await expect(runDesktopProductionCommand('logs', commandOptions)).resolves.toEqual({
      status: 'logs',
      output: 'Desktop log has not been created.\n',
    })
    for (const command of ['start', 'restart']) {
      await expect(runDesktopProductionCommand(command, commandOptions))
        .rejects.toThrow('Repository Skills root does not exist')
    }
  })

  it('starts Electron with the production Profile, environment, Workspace, and current healthy run', async () => {
    const value = await fixture()
    const child = new EventEmitter()
    child.pid = 54001
    let running = true
    const close = (code = 0, signal = null) => {
      running = false
      child.emit('close', code, signal)
    }
    const signalProcess = vi.fn((_pid, signal) => {
      if (signal === 0 && !running) throw Object.assign(new Error('missing'), { code: 'ESRCH' })
      if (signal === 'SIGTERM' || signal === 'SIGKILL') close(null, signal)
    })
    const materializePreset = vi.fn(async () => undefined)
    const spawnDesktop = vi.fn(() => {
      setTimeout(() => writeReadyLifecycle(value.context), 5)
      return child
    })
    const reservation = { port: 44001, release: vi.fn(async () => undefined) }
    const start = startDesktopWorktree(value.context, {
      loadProductAgentConfiguration: async () => ({
        repositorySkillsRoot: value.repositorySkillsRoot,
        repositorySkillsEnvironmentVariable: 'HARNESS_COMFYUI_SKILL_DIR',
      }),
      materializeCli: async () => undefined,
      materializeClient: async () => undefined,
      materializeHost: async () => undefined,
      materializePreset,
      materializeManagedPlugin: async context => (await installProfile(value, context)).plugin,
      ensureManagedProfile: async context => (await installProfile(value, context)).profile,
      initializeDesktopSettings: async () => true,
      initializeSetupState: async () => true,
      migrateLegacySessionData: vi.fn(async () => undefined),
      reservePort: async () => reservation,
      environment: { PATH: '/production/bin', ELECTRON_RUN_AS_NODE: '1' },
      now: () => new Date(startedAt),
      spawnDesktop,
      readProcessIdentity: async () => ({
        startTime: 'production-start',
        command: '/candidate/electron ' + resolve(value.context.desktopBuildOutput, 'main.cjs'),
      }),
      signalProcess,
      processGroupIsRunning: async () => running,
      readProcessGroupMembers: async pid => [{
        pid,
        startTime: 'production-start',
        command: '/candidate/electron ' + resolve(value.context.desktopBuildOutput, 'main.cjs'),
      }],
      waitForPort: async () => undefined,
      listeningPorts: async () => [44001],
    })

    await vi.waitFor(async () => {
      expect(JSON.parse(await readFile(value.context.stateFile, 'utf8'))).toMatchObject({
        ready: true,
        runId: 'run-production',
        webPorts: [44001],
        installation: { packageName: 'harness-comfyui', version: '0.40.0' },
      })
    })
    expect(materializePreset).toHaveBeenCalledWith(value.root, value.context.dshHome)
    expect(spawnDesktop).toHaveBeenCalledWith(
      '/candidate/electron',
      [
        resolve(value.context.desktopBuildOutput, 'main.cjs'),
        '--user-data-dir=' + value.context.userData,
      ],
      expect.objectContaining({
        cwd: value.context.runtimeRoot,
        detached: true,
        env: expect.objectContaining({
          KEY: 'production-value',
          HOME: value.context.runtimeHome,
          DSH_HOME: value.context.dshHome,
          HARNESS_COMFYUI_SKILL_DIR: value.repositorySkillsRoot,
          HARNESS_COMFYUI_STARTUP_WORKSPACE_PATH: value.workspace,
          PATH: resolve(value.context.desktopWorkspace, 'node_modules/.bin') + ':/production/bin',
        }),
      }),
    )
    expect(spawnDesktop.mock.calls[0][2].env).not.toHaveProperty('ELECTRON_RUN_AS_NODE')
    close()
    await expect(start).resolves.toEqual({ status: 'stopped', pid: 54001, code: 0, signal: null })
    expect(reservation.release).toHaveBeenCalled()
  })

  it('exposes one production Desktop group, one development Desktop group, and one Web Host group', async () => {
    const repositoryRoot = resolve(import.meta.dirname, '../..')
    const manifest = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'))
    expect(manifest.scripts).toMatchObject({
      'prod:start': 'node scripts/desktop/production-cli.mjs start',
      'prod:stop': 'node scripts/desktop/production-cli.mjs stop',
      'prod:restart': 'node scripts/desktop/production-cli.mjs restart',
      'prod:status': 'node scripts/desktop/production-cli.mjs status',
      'prod:logs': 'node scripts/desktop/production-cli.mjs logs',
      'dev:start': 'node scripts/desktop/cli.mjs start',
      'dev:stop': 'node scripts/desktop/cli.mjs stop',
      'dev:restart': 'node scripts/desktop/cli.mjs restart',
      'dev:status': 'node scripts/desktop/cli.mjs status',
      'dev:logs': 'node scripts/desktop/cli.mjs logs',
      'web:start': 'node scripts/worktree/cli.mjs start',
      'web:stop': 'node scripts/worktree/cli.mjs stop',
      'web:restart': 'node scripts/worktree/cli.mjs restart',
      'web:status': 'node scripts/worktree/cli.mjs status',
      'web:health': 'node scripts/worktree/cli.mjs health',
      'web:logs': 'node scripts/worktree/cli.mjs logs',
    })
    for (const prefix of ['worktree:', 'desktop:worktree:', 'desktop:prod:']) {
      expect(Object.keys(manifest.scripts).some(name => name.startsWith(prefix))).toBe(false)
    }
    const productionCli = await import('../../scripts/desktop/production-cli.mjs')
    expect(productionCli.parseArguments(['restart'])).toEqual({ command: 'restart' })
    expect(() => productionCli.parseArguments(['health'])).toThrow('start, stop, restart, status, logs')
  })
})

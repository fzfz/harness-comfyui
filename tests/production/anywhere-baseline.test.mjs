import { mkdtemp, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'

import { describe, expect, it, vi } from 'vitest'

import {
  loadDesktopBaseline,
  parseDesktopBaseline,
} from '../../scripts/desktop/baseline.mjs'
import {
  currentStartupLifecycle,
  desktopSetupState,
  initializeDesktopSettings,
  prepareAnywhereDesktop,
  reconcileManagedProfileManifest,
  resolveInstalledPackageManifest,
} from '../../scripts/desktop/anywhere.mjs'

function baseline(overrides = {}) {
  return {
    schemaVersion: 1,
    source: {
      repository: 'https://github.com/anywhere-labs/dsh-desktop.git',
      commit: 'b39ffbf5621aea51e87f27e7b83d9c3e1ff5e24d',
      relativePath: '.local/upstreams/dsh-desktop-anywhere-candidate',
      stableWorkspace: 'dsh-plugin-desktop',
    },
    packages: {
      desktop: { name: 'dsh-plugin-desktop', version: '2.0.11' },
      harness: { name: '@deepseek-ai/dsh', version: '0.1.5-rc.2' },
      electron: { name: 'electron', version: '43.3.0' },
    },
    profile: {
      name: 'desktop',
      pluginPackageName: 'harness-comfyui',
      setupStateVersion: 2,
      setupRevision: 1,
      setupStateRootDirectory: 'profile-setup',
      setupStateFilename: 'state.json',
    },
    startup: {
      host: '127.0.0.1',
      mode: 'compatibility',
      networkExposure: 'loopback',
      openBrowser: false,
      readyTimeoutMs: 60_000,
      stopTimeoutMs: 5_000,
    },
    entrypoints: { desktopMain: 'lib/main.js' },
    ...overrides,
  }
}

async function writePackage(path, manifest, entry) {
  await mkdir(path, { recursive: true })
  await writeFile(resolve(path, 'package.json'), `${JSON.stringify(manifest)}\n`)
  if (entry !== undefined) {
    await mkdir(resolve(path, 'lib'), { recursive: true })
    await writeFile(resolve(path, entry), 'export {}\n')
  }
}

describe('anywhere Stable Desktop baseline', () => {
  it('parses the single fixed source, package, Profile, and startup contract', () => {
    const parsed = parseDesktopBaseline(baseline())
    expect(parsed.source.commit).toBe('b39ffbf5621aea51e87f27e7b83d9c3e1ff5e24d')
    expect(parsed.packages).toEqual({
      desktop: { name: 'dsh-plugin-desktop', version: '2.0.11' },
      harness: { name: '@deepseek-ai/dsh', version: '0.1.5-rc.2' },
      electron: { name: 'electron', version: '43.3.0' },
    })
    expect(parsed.startup).toEqual({
      host: '127.0.0.1',
      mode: 'compatibility',
      networkExposure: 'loopback',
      openBrowser: false,
      readyTimeoutMs: 60_000,
      stopTimeoutMs: 5_000,
    })
    expect(parsed.profile).toMatchObject({
      setupStateRootDirectory: 'profile-setup',
      setupStateFilename: 'state.json',
    })
  })

  it.each([
    ['abbreviated commit SHA', { source: { ...baseline().source, commit: 'b39ffbf' } }, 'full commit SHA'],
    ['absolute source path', { source: { ...baseline().source, relativePath: '/tmp/desktop' } }, 'configured root'],
    ['unknown top-level property', { unexpected: true }, 'must contain exactly'],
    ['non-loopback startup', { startup: { ...baseline().startup, host: '0.0.0.0' } }, 'must be 127.0.0.1'],
    ['advanced mode', { startup: { ...baseline().startup, mode: 'advanced' } }, 'must be compatibility'],
  ])('rejects %s', (_label, override, message) => {
    expect(() => parseDesktopBaseline(baseline(override))).toThrow(message)
  })

  it('validates the source checkout and installed package versions', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'anywhere-baseline-'))
    const desktopRepository = resolve(root, '.local/upstreams/dsh-desktop-anywhere-candidate')
    const workspace = resolve(desktopRepository, 'dsh-plugin-desktop')
    await writePackage(workspace, { name: 'dsh-plugin-desktop', version: '2.0.11' }, 'lib/main.js')
    await writePackage(resolve(workspace, 'node_modules/@deepseek-ai/dsh'), {
      name: '@deepseek-ai/dsh', version: '0.1.5-rc.2',
    })
    await writePackage(resolve(workspace, 'node_modules/electron'), { name: 'electron', version: '43.3.0' })
    const definitionPath = resolve(root, 'desktop-baseline.json')
    await writeFile(definitionPath, `${JSON.stringify(baseline())}\n`)
    const spawnSync = (_command, args) => args.includes('rev-parse')
      ? { status: 0, stdout: `${baseline().source.commit}\n` }
      : { status: 0, stdout: `${baseline().source.repository}\n` }

    const loaded = await loadDesktopBaseline({ repositoryRoot: root, definitionPath, spawnSync })
    expect(loaded.desktopWorkspace).toBe(workspace)
    expect(loaded.desktopMain).toBe(resolve(workspace, 'lib/main.js'))
  })

  it('rejects a checkout at a different commit before reading package versions', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'anywhere-baseline-wrong-sha-'))
    const definitionPath = resolve(root, 'desktop-baseline.json')
    await writeFile(definitionPath, `${JSON.stringify(baseline())}\n`)
    await expect(loadDesktopBaseline({
      repositoryRoot: root,
      definitionPath,
      spawnSync: () => ({ status: 0, stdout: `${'0'.repeat(40)}\n` }),
    })).rejects.toThrow(`must be checked out at ${baseline().source.commit}`)
  })
})

describe('anywhere managed Profile contract', () => {
  it('declares the local link dependency and bundle while preserving existing Profile state', () => {
    const updated = reconcileManagedProfileManifest({
      name: 'dsh-profile-desktop',
      dependencies: { existing: '1.2.3' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'existing'], patchReload: 'restart' } },
      custom: { preserved: true },
    }, { packageName: 'harness-comfyui', specifier: 'link:../../managed-plugins/harness-comfyui' })
    expect(updated.dependencies).toEqual({
      existing: '1.2.3',
      'harness-comfyui': 'link:../../managed-plugins/harness-comfyui',
    })
    expect(updated.dsh.profile).toEqual({
      bundles: ['@deepseek-ai/dsh-base', 'existing', 'harness-comfyui'],
      patchReload: 'restart',
    })
    expect(updated.custom).toEqual({ preserved: true })
  })

  it('does not duplicate the managed bundle on repeated installation', () => {
    const once = reconcileManagedProfileManifest({ dsh: { profile: { bundles: [] } } }, {
      packageName: 'harness-comfyui', specifier: 'link:../../managed-plugins/harness-comfyui',
    })
    const twice = reconcileManagedProfileManifest(once, {
      packageName: 'harness-comfyui', specifier: 'link:../../managed-plugins/harness-comfyui',
    })
    expect(twice.dsh.profile.bundles).toEqual(['harness-comfyui'])
  })

  it('creates the fixed version-two first-run setup state', () => {
    const state = desktopSetupState({ baseline: parseDesktopBaseline(baseline()) }, '/runtime/home/profiles/desktop', '2026-09-09T01:02:03.000Z')
    expect(state).toEqual({
      version: 2,
      profileHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      outcome: 'skipped',
      desktopVersion: '2.0.11',
      dshVersion: '0.1.5-rc.2',
      setupRevision: 1,
      recordedAt: '2026-09-09T01:02:03.000Z',
    })
  })

  it('adds the Desktop section to existing settings without replacing other settings', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'anywhere-settings-'))
    const context = {
      dshHome: root,
      baseline: parseDesktopBaseline(baseline()),
    }
    const yaml = { parse: JSON.parse, stringify: value => `${JSON.stringify(value, null, 2)}\n` }
    await writeFile(resolve(root, 'settings.yaml'), `${JSON.stringify({ llm: { provider: 'saved' } })}\n`)
    await expect(initializeDesktopSettings(context, () => yaml, 45_678)).resolves.toBe(true)
    expect(JSON.parse(await readFile(resolve(root, 'settings.yaml'), 'utf8'))).toEqual({
      llm: { provider: 'saved' },
      'dsh-desktop': {
        mode: 'compatibility',
        port: 45_678,
        networkExposure: 'loopback',
        openBrowser: false,
      },
    })
  })

  it('preserves a complete saved Desktop section on repeated preparation', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'anywhere-saved-settings-'))
    const context = { dshHome: root, baseline: parseDesktopBaseline(baseline()) }
    const source = `${JSON.stringify({
      'dsh-desktop': { mode: 'advanced', port: 49_999, networkExposure: 'lan', openBrowser: true },
    })}\n`
    await writeFile(resolve(root, 'settings.yaml'), source)
    const yaml = { parse: JSON.parse, stringify: value => `${JSON.stringify(value)}\n` }
    await expect(initializeDesktopSettings(context, () => yaml, 45_678)).resolves.toBe(false)
    expect(await readFile(resolve(root, 'settings.yaml'), 'utf8')).toBe(source)
  })

  it('replaces saved port zero with the port claimed for this managed run', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'anywhere-zero-port-settings-'))
    const context = { dshHome: root, baseline: parseDesktopBaseline(baseline()) }
    await writeFile(resolve(root, 'settings.yaml'), `${JSON.stringify({
      'dsh-desktop': { mode: 'compatibility', port: 0, networkExposure: 'loopback', openBrowser: false },
    })}\n`)
    const yaml = { parse: JSON.parse, stringify: value => `${JSON.stringify(value)}\n` }
    await expect(initializeDesktopSettings(context, () => yaml, 45_678)).resolves.toBe(true)
    expect(JSON.parse(await readFile(resolve(root, 'settings.yaml'), 'utf8'))['dsh-desktop'].port).toBe(45_678)
  })

  it('releases a claimed Web port when later preparation fails', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'anywhere-prepare-failure-'))
    const dshHome = resolve(root, 'home/harness')
    await mkdir(dshHome, { recursive: true })
    await writeFile(resolve(root, '.env'), 'KEY=value\n')
    const release = vi.fn(async () => {})
    const parsed = parseDesktopBaseline(baseline())
    const context = {
      repositoryRoot: root,
      runtimeRoot: resolve(root, 'runtime'),
      runtimeHome: resolve(root, 'runtime/home'),
      dshHome,
      userData: resolve(root, 'runtime/user-data'),
      environmentFilePath: resolve(root, '.env'),
      desktopWorkspace: resolve(root, 'candidate/dsh-plugin-desktop'),
      developmentPortClaimRoot: resolve(root, 'claims'),
      baseline: parsed,
    }
    const noOperation = async () => {}
    await expect(prepareAnywhereDesktop(context, {
      loadProductAgentConfiguration: async () => ({
        repositorySkillsRoot: resolve(root, '.agents/skills'),
        repositorySkillsEnvironmentVariable: 'HARNESS_COMFYUI_SKILL_DIR',
      }),
      materializeCli: noOperation,
      materializeClient: noOperation,
      materializeHost: noOperation,
      materializePreset: noOperation,
      materializeManagedPlugin: async () => ({ name: 'harness-comfyui', version: '0.41.1' }),
      ensureManagedProfile: async () => ({
        profileDirectory: resolve(dshHome, 'profiles/desktop'),
        manifestPath: resolve(dshHome, 'profiles/desktop/package.json'),
        specifier: 'link:../../managed-plugins/harness-comfyui',
      }),
      reservePort: async () => ({ port: 45_678, release }),
      initializeDesktopSettings: async () => { throw new Error('settings write failed') },
    })).rejects.toThrow('settings write failed')
    expect(release).toHaveBeenCalledOnce()
  })

  it('finds a dependency manifest when the package exports hide package.json', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'anywhere-closed-exports-'))
    const packageDirectory = resolve(root, 'node_modules/closed-exports')
    await mkdir(resolve(packageDirectory, 'lib'), { recursive: true })
    await writeFile(resolve(root, 'package.json'), '{"type":"module"}\n')
    await writeFile(resolve(packageDirectory, 'package.json'), `${JSON.stringify({
      name: 'closed-exports',
      version: '1.0.0',
      type: 'module',
      exports: { '.': './lib/index.js' },
    })}\n`)
    await writeFile(resolve(packageDirectory, 'lib/index.js'), 'export default true\n')

    await expect(resolveInstalledPackageManifest(
      createRequire(resolve(root, 'package.json')),
      'closed-exports',
    )).resolves.toBe(await realpath(resolve(packageDirectory, 'package.json')))
  })
})

describe('anywhere current startup lifecycle', () => {
  const startedAt = '2026-09-09T01:00:00.000Z'
  const event = (timestamp, runId, eventName, details = {}) => JSON.stringify({
    schemaVersion: 1,
    timestamp,
    monotonicMs: 1,
    runId,
    operationId: `operation-${runId}`,
    eventName,
    details,
  })

  it('accepts only a current run with Renderer healthy and startup completed', () => {
    const text = [
      event('2026-09-09T00:59:59.000Z', 'stale', 'startup.run.started'),
      event('2026-09-09T00:59:59.100Z', 'stale', 'renderer.boot.completed', { rendererStatus: 'healthy' }),
      event('2026-09-09T00:59:59.200Z', 'stale', 'startup.run.completed', { rendererStatus: 'healthy' }),
      event('2026-09-09T01:00:00.100Z', 'current', 'startup.run.started'),
      event('2026-09-09T01:00:00.200Z', 'current', 'renderer.boot.completed', { rendererStatus: 'healthy' }),
      event('2026-09-09T01:00:00.300Z', 'current', 'startup.run.completed', { rendererStatus: 'healthy' }),
    ].join('\n')
    expect(currentStartupLifecycle(text, startedAt)).toMatchObject({ status: 'ready', runId: 'current' })
  })

  it('keeps a current incomplete run in starting state', () => {
    expect(currentStartupLifecycle([
      event('2026-09-09T01:00:00.100Z', 'current', 'startup.run.started'),
      event('2026-09-09T01:00:00.200Z', 'current', 'renderer.boot.completed', { rendererStatus: 'healthy' }),
    ].join('\n'), startedAt)).toEqual({ status: 'starting', runId: 'current' })
  })

  it('reports a current failed run and ignores malformed partial lines', () => {
    expect(currentStartupLifecycle([
      '{',
      event('2026-09-09T01:00:00.100Z', 'current', 'startup.run.started'),
      event('2026-09-09T01:00:00.200Z', 'current', 'startup.run.failed', {
        finalStage: 'renderer-startup', failureReason: 'renderer-failed',
      }),
    ].join('\n'), startedAt)).toMatchObject({
      status: 'failed',
      runId: 'current',
      event: { details: { finalStage: 'renderer-startup', failureReason: 'renderer-failed' } },
    })
  })
})

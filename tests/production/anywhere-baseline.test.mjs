import { mkdtemp, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'

import { describe, expect, it, vi } from 'vitest'
import yamlFixture from '../support/fake-profile-yaml.cjs'
import { IMAGE_READER_SETTINGS_DEFAULTS } from '../../src/image-reader/settings.ts'

import {
  loadDesktopBaseline,
  parseDesktopBaseline,
} from '../../scripts/desktop/baseline.mjs'
import {
  currentStartupLifecycle,
  desktopSetupState,
  initializeDesktopSettings,
  readConfiguredWebPort,
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
      desktop: { name: 'dsh-plugin-desktop', version: '2.0.15' },
      harness: { name: '@deepseek-ai/dsh', version: '0.1.7-rc.2' },
      electron: { name: 'electron', version: '44.0.0' },
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
      desktop: { name: 'dsh-plugin-desktop', version: '2.0.15' },
      harness: { name: '@deepseek-ai/dsh', version: '0.1.7-rc.2' },
      electron: { name: 'electron', version: '44.0.0' },
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
    await writePackage(workspace, { name: 'dsh-plugin-desktop', version: '2.0.15' }, 'lib/main.js')
    await writePackage(resolve(workspace, 'node_modules/@deepseek-ai/dsh'), {
      name: '@deepseek-ai/dsh', version: '0.1.7-rc.2',
    })
    await writePackage(resolve(workspace, 'node_modules/electron'), { name: 'electron', version: '44.0.0' })
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
      desktopVersion: '2.0.15',
      dshVersion: '0.1.7-rc.2',
      setupRevision: 1,
      recordedAt: '2026-09-09T01:02:03.000Z',
    })
  })

  async function desktopSettingsFixture(label, patch = [{ insert: [{ id: 'desktop-shell', config: { mode: 'compatibility' } }] }]) {
    const root = await mkdtemp(resolve(tmpdir(), label))
    const profileDirectory = resolve(root, 'profiles/desktop')
    const desktopWorkspace = resolve(root, 'desktop-workspace')
    await mkdir(profileDirectory, { recursive: true })
    await mkdir(desktopWorkspace, { recursive: true })
    await writeFile(resolve(profileDirectory, 'cordis.patch.yml'), `${JSON.stringify(patch)}\n`)
    await writeFile(resolve(desktopWorkspace, 'cordis.patch.yml'), `${JSON.stringify([
      { insert: [{ id: 'desktop-shell', config: { mode: 'compatibility' } }] },
    ])}\n`)
    await writeFile(resolve(root, 'cordis.patch.yml'), `${JSON.stringify([{ insert: [
      { id: 'harness-comfyui-core', config: {
        configurationProfile: 'profile-expression', startupWorkspacePath: 'workspace-expression',
      } },
      { id: 'harness-comfyui-image-reader', config: {
        imageReaderDefaultModel: { provider: 'provider-a', model: 'vision-a' },
      } },
    ] }])}\n`)
    return {
      root,
      profileDirectory,
      context: { repositoryRoot: root, desktopWorkspace, dshHome: root, baseline: parseDesktopBaseline(baseline()) },
      yaml: yamlFixture,
    }
  }

  it('fills the Profile Desktop entry and keeps settings.yaml absent on a fresh start', async () => {
    const value = await desktopSettingsFixture('anywhere-profile-settings-')
    await expect(initializeDesktopSettings(value.context, () => value.yaml, 45_678, value.profileDirectory)).resolves.toBe(true)
    const patchPath = resolve(value.profileDirectory, 'cordis.patch.yml')
    const patch = JSON.parse(await readFile(patchPath, 'utf8'))
    expect(patch[0].insert[0].config).toEqual({ mode: 'compatibility', port: 45_678, networkExposure: 'loopback', openBrowser: false })
    expect((await stat(patchPath)).mode & 0o777).toBe(0o600)
    await expect(readFile(resolve(value.root, 'settings.yaml'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readConfiguredWebPort(value.context, () => value.yaml, value.profileDirectory)).resolves.toBe(45_678)
  })

  it('adds a Desktop override when the Profile patch contains only other plugins', async () => {
    const value = await desktopSettingsFixture('anywhere-bundle-only-desktop-', [
      { insert: [{ id: 'harness-comfyui-web', name: 'harness-comfyui' }] },
    ])
    await expect(readConfiguredWebPort(value.context, () => value.yaml, value.profileDirectory)).resolves.toBeUndefined()
    await expect(initializeDesktopSettings(value.context, () => value.yaml, 45_678, value.profileDirectory)).resolves.toBe(true)
    const patch = JSON.parse(await readFile(resolve(value.profileDirectory, 'cordis.patch.yml'), 'utf8'))
    expect(patch.find(row => row.id === 'desktop-shell').config).toMatchObject({
      mode: 'compatibility', port: 45_678, networkExposure: 'loopback', openBrowser: false,
    })
    await expect(initializeDesktopSettings(value.context, () => value.yaml, 45_678, value.profileDirectory)).resolves.toBe(false)
  })

  it('retains an existing Profile port when archiving a pending legacy Desktop section', async () => {
    const value = await desktopSettingsFixture('anywhere-saved-profile-', [
      { insert: [{ id: 'desktop-shell', config: { mode: 'advanced', port: 49_999, networkExposure: 'lan', openBrowser: true } }] },
    ])
    const source = `${JSON.stringify({ 'dsh-desktop': { mode: 'compatibility', port: 45_678 } })}\n`
    await writeFile(resolve(value.root, 'settings.yaml'), source)
    await expect(initializeDesktopSettings(value.context, () => value.yaml, 45_678, value.profileDirectory)).resolves.toBe(true)
    await expect(readFile(resolve(value.root, 'settings.yaml'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(resolve(value.root, 'settings.yaml.imported'), 'utf8')).toBe(source)
    await expect(readConfiguredWebPort(value.context, () => value.yaml, value.profileDirectory)).resolves.toBe(49_999)
  })

  it('moves saved Desktop appearance and logging settings into the Profile', async () => {
    const value = await desktopSettingsFixture('anywhere-legacy-appearance-', [
      { insert: [{ id: 'desktop-shell', config: { mode: 'compatibility', logLevel: 'warn' } }] },
    ])
    await writeFile(resolve(value.root, 'settings.yaml'), `${JSON.stringify({
      'dsh-desktop': {
        mode: 'advanced',
        port: 45_678,
        macosMaterial: 'transparent',
        windowsMaterial: 'mica',
        linuxMaterial: 'transparent',
        logLevel: 'debug',
      },
    })}\n`)
    await expect(initializeDesktopSettings(value.context, () => value.yaml, 45_678, value.profileDirectory)).resolves.toBe(true)
    const patch = JSON.parse(await readFile(resolve(value.profileDirectory, 'cordis.patch.yml'), 'utf8'))
    expect(patch[0].insert[0].config).toMatchObject({
      mode: 'advanced',
      port: 45_678,
      macosMaterial: 'transparent',
      windowsMaterial: 'mica',
      linuxMaterial: 'transparent',
      logLevel: 'warn',
    })
    await expect(initializeDesktopSettings(value.context, () => value.yaml, 45_678, value.profileDirectory)).resolves.toBe(false)
  })

  it('moves project settings before the DSH legacy importer can discard their old namespace IDs', async () => {
    const value = await desktopSettingsFixture('anywhere-project-settings-')
    const source = { configuration: { url: 'http://127.0.0.1', port: 23_456 } }
    await writeFile(resolve(value.root, 'settings.yaml'), `${JSON.stringify({
      'harness-comfyui-source': source,
      'harness-comfyui-image-reader-profiles': IMAGE_READER_SETTINGS_DEFAULTS,
    })}\n`)
    await expect(initializeDesktopSettings(value.context, () => value.yaml, 45_678, value.profileDirectory)).resolves.toBe(true)
    const patch = JSON.parse(await readFile(resolve(value.profileDirectory, 'cordis.patch.yml'), 'utf8'))
    expect(patch.find(row => row.id === 'harness-comfyui-core').config).toMatchObject({
      ...source, configurationProfile: 'profile-expression', startupWorkspacePath: 'workspace-expression',
    })
    expect(patch.find(row => row.id === 'harness-comfyui-image-reader').config).toMatchObject({
      ...IMAGE_READER_SETTINGS_DEFAULTS,
      imageReaderDefaultModel: { provider: 'provider-a', model: 'vision-a' },
    })
    await expect(readFile(resolve(value.root, 'settings.yaml'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(initializeDesktopSettings(value.context, () => value.yaml, 45_678, value.profileDirectory)).resolves.toBe(false)
  })

  it('keeps a saved image reader Profile when the old document contains different credentials', async () => {
    const value = await desktopSettingsFixture('anywhere-saved-image-profile-', [
      { insert: [{ id: 'desktop-shell', config: { mode: 'compatibility' } }] },
      { id: 'harness-comfyui-image-reader', config: { configuration: IMAGE_READER_SETTINGS_DEFAULTS.configuration } },
    ])
    const oldImage = {
      configuration: {
        activeProfileId: 'old-api',
        profiles: [{
          id: 'old-api', name: 'Old API', connectionType: 'openai-compatible', provider: '',
          endpoint: 'https://example.test/v1/chat/completions', model: 'old-vision', hasApiKey: true,
          defaultPrompt: 'Describe the image.', temperature: 0.2, maxTokens: 2048,
        }],
      },
      credentials: { 'old-api': 'old-secret' },
    }
    await writeFile(resolve(value.root, 'settings.yaml'), `${JSON.stringify({
      'harness-comfyui-image-reader-profiles': oldImage,
    })}\n`)
    await expect(initializeDesktopSettings(value.context, () => value.yaml, 45_678, value.profileDirectory)).resolves.toBe(true)
    const patch = JSON.parse(await readFile(resolve(value.profileDirectory, 'cordis.patch.yml'), 'utf8'))
    expect(patch.find(row => row.id === 'harness-comfyui-image-reader').config).toEqual({
      configuration: IMAGE_READER_SETTINGS_DEFAULTS.configuration,
      imageReaderDefaultModel: { provider: 'provider-a', model: 'vision-a' },
    })
    await expect(readFile(resolve(value.root, 'settings.yaml'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('keeps a nested Profile source entry ahead of the old source namespace', async () => {
    const current = { configuration: { url: 'http://127.0.0.1', port: 49_000 } }
    const value = await desktopSettingsFixture('anywhere-nested-source-profile-', [
      { insert: [
        { id: 'desktop-shell', config: { mode: 'compatibility' } },
        { id: 'harness-comfyui-core', config: current },
      ] },
    ])
    await writeFile(resolve(value.root, 'settings.yaml'), `${JSON.stringify({
      'harness-comfyui-source': { configuration: { url: 'http://127.0.0.1', port: 23_456 } },
    })}\n`)
    await expect(initializeDesktopSettings(value.context, () => value.yaml, 45_678, value.profileDirectory)).resolves.toBe(true)
    const patch = JSON.parse(await readFile(resolve(value.profileDirectory, 'cordis.patch.yml'), 'utf8'))
    expect(patch[0].insert[1].config).toMatchObject({
      ...current, configurationProfile: 'profile-expression', startupWorkspacePath: 'workspace-expression',
    })
    expect(patch.some(row => row.id === 'harness-comfyui-core')).toBe(false)
  })

  it('keeps a saved dynamic source expression when importing an old static source value', async () => {
    const dynamic = { __jsExpr: 'process.env.SOURCE_ADDRESS' }
    const value = await desktopSettingsFixture('anywhere-dynamic-source-profile-', [
      { insert: [{ id: 'desktop-shell', config: { mode: 'compatibility' } }] },
      { id: 'harness-comfyui-core', config: { configuration: dynamic } },
    ])
    await writeFile(resolve(value.root, 'settings.yaml'), `${JSON.stringify({
      'harness-comfyui-source': { configuration: { url: 'http://127.0.0.1', port: 23_456 } },
    })}\n`)
    await expect(initializeDesktopSettings(value.context, () => value.yaml, 45_678, value.profileDirectory)).resolves.toBe(true)
    const patch = JSON.parse(await readFile(resolve(value.profileDirectory, 'cordis.patch.yml'), 'utf8'))
    expect(patch.find(row => row.id === 'harness-comfyui-core').config.configuration).toEqual(dynamic)
  })

  it('converts the older image reader shape into a runtime Profile', async () => {
    const value = await desktopSettingsFixture('anywhere-older-image-settings-')
    await writeFile(resolve(value.root, 'settings.yaml'), `${JSON.stringify({
      'harness-comfyui-image-reader': {
        configuration: {
          provider: 'provider-a', model: 'vision-a', defaultPrompt: 'Read this image.',
          temperature: 0.3, maxTokens: 1024,
        },
      },
    })}\n`)
    await expect(initializeDesktopSettings(value.context, () => value.yaml, 45_678, value.profileDirectory)).resolves.toBe(true)
    const patch = JSON.parse(await readFile(resolve(value.profileDirectory, 'cordis.patch.yml'), 'utf8'))
    const image = patch.find(row => row.id === 'harness-comfyui-image-reader').config
    expect(image.configuration.profiles[0]).toMatchObject({
      connectionType: 'runtime', provider: 'provider-a', model: 'vision-a',
      defaultPrompt: 'Read this image.', temperature: 0.3, maxTokens: 1024,
    })
    expect(image.credentials).toEqual({})
  })

  it('preserves an invalid old project setting for repair before launch', async () => {
    const value = await desktopSettingsFixture('anywhere-invalid-source-settings-')
    const old = `${JSON.stringify({
      'harness-comfyui-source': { configuration: { url: 'not-a-url', port: 23_456 } },
    })}\n`
    await writeFile(resolve(value.root, 'settings.yaml'), old)
    await expect(initializeDesktopSettings(value.context, () => value.yaml, 45_678, value.profileDirectory)).rejects.toThrow()
    expect(await readFile(resolve(value.root, 'settings.yaml'), 'utf8')).toBe(old)
    const patch = JSON.parse(await readFile(resolve(value.profileDirectory, 'cordis.patch.yml'), 'utf8'))
    expect(patch.some(row => row.id === 'harness-comfyui-core')).toBe(false)
  })

  it('preserves real YAML expression tags when importing a source override', async () => {
    const checkout = JSON.parse(await readFile(resolve('config/desktop-worktree.json'), 'utf8'))
    const selected = JSON.parse(await readFile(resolve('config/desktop-baseline.json'), 'utf8'))
    const desktopRoot = resolve(checkout.mainCheckoutPath, selected.source.relativePath)
    const yaml = createRequire(resolve(desktopRoot, selected.source.stableWorkspace, 'package.json'))('yaml')
    const root = await mkdtemp(resolve(tmpdir(), 'anywhere-real-yaml-source-'))
    const profileDirectory = resolve(root, 'profiles/desktop')
    await mkdir(profileDirectory, { recursive: true })
    await writeFile(resolve(root, 'cordis.patch.yml'), await readFile(resolve('cordis.patch.yml')))
    await writeFile(resolve(profileDirectory, 'cordis.patch.yml'), '- insert:\n    - id: desktop-shell\n      config:\n        mode: compatibility\n')
    await writeFile(resolve(root, 'settings.yaml'), 'harness-comfyui-source:\n  configuration:\n    url: http://127.0.0.1\n    port: 23456\n')
    const context = { repositoryRoot: root, dshHome: root, baseline: parseDesktopBaseline(baseline()) }
    await expect(initializeDesktopSettings(context, () => yaml, 45_678, profileDirectory)).resolves.toBe(true)
    const saved = await readFile(resolve(profileDirectory, 'cordis.patch.yml'), 'utf8')
    expect(saved).toContain('configurationProfile: !!js')
    expect(saved).toContain('startupWorkspacePath: !!js')
    const document = yaml.parseDocument(saved, { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }] })
    expect(document.errors).toEqual([])
    const core = document.toJS().find(row => row.id === 'harness-comfyui-core')
    expect(core.config.configuration).toEqual({ url: 'http://127.0.0.1', port: 23_456 })
  })

  it('moves a pending legacy port zero into the Profile before archiving the document', async () => {
    const value = await desktopSettingsFixture('anywhere-zero-port-settings-')
    await writeFile(resolve(value.root, 'settings.yaml'), `${JSON.stringify({
      'dsh-desktop': { mode: 'compatibility', port: 0, networkExposure: 'loopback', openBrowser: false },
    })}\n`)
    await expect(readConfiguredWebPort(value.context, () => value.yaml, value.profileDirectory)).resolves.toBe(0)
    await expect(initializeDesktopSettings(value.context, () => value.yaml, 45_678, value.profileDirectory)).resolves.toBe(true)
    const patch = JSON.parse(await readFile(resolve(value.profileDirectory, 'cordis.patch.yml'), 'utf8'))
    expect(patch[0].insert[0].config.port).toBe(45_678)
    await expect(readFile(resolve(value.root, 'settings.yaml'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('retains other legacy sections for the DSH importer', async () => {
    const value = await desktopSettingsFixture('anywhere-other-legacy-')
    await writeFile(resolve(value.root, 'settings.yaml'), `${JSON.stringify({
      'dsh-desktop': { mode: 'advanced', port: 49_999, networkExposure: 'lan', openBrowser: true },
      'agent-default-model': { provider: 'saved', model: 'saved-model' },
    })}\n`)
    await expect(initializeDesktopSettings(value.context, () => value.yaml, 49_999, value.profileDirectory)).resolves.toBe(true)
    expect(JSON.parse(await readFile(resolve(value.root, 'settings.yaml'), 'utf8'))).toEqual({
      'agent-default-model': { provider: 'saved', model: 'saved-model' },
    })
    const patch = JSON.parse(await readFile(resolve(value.profileDirectory, 'cordis.patch.yml'), 'utf8'))
    expect(patch[0].insert[0].config).toMatchObject({ mode: 'advanced', port: 49_999, networkExposure: 'lan', openBrowser: true })
  })

  it('preserves an existing migration archive when a legacy Desktop section reappears', async () => {
    const value = await desktopSettingsFixture('anywhere-archive-collision-')
    const pending = `${JSON.stringify({ 'dsh-desktop': { port: 49_999 } })}\n`
    await writeFile(resolve(value.root, 'settings.yaml'), pending)
    await writeFile(resolve(value.root, 'settings.yaml.imported'), 'saved archive\n')
    await expect(initializeDesktopSettings(value.context, () => value.yaml, 49_999, value.profileDirectory))
      .rejects.toThrow('resolve the archive collision before startup')
    expect(await readFile(resolve(value.root, 'settings.yaml'), 'utf8')).toBe(pending)
    expect(await readFile(resolve(value.root, 'settings.yaml.imported'), 'utf8')).toBe('saved archive\n')
  })

  it('rejects duplicate legacy Desktop sections before changing either value', async () => {
    const value = await desktopSettingsFixture('anywhere-duplicate-legacy-')
    const source = `${JSON.stringify({
      'desktop-shell': { port: 41_001 },
      'dsh-desktop': { port: 41_002 },
    })}\n`
    await writeFile(resolve(value.root, 'settings.yaml'), source)
    await expect(initializeDesktopSettings(value.context, () => value.yaml, 41_001, value.profileDirectory))
      .rejects.toThrow('resolve the duplicate Desktop sections before startup')
    expect(await readFile(resolve(value.root, 'settings.yaml'), 'utf8')).toBe(source)
  })

  it('releases a claimed Web port when later preparation fails', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'anywhere-prepare-failure-'))
    const dshHome = resolve(root, 'home/harness')
    await mkdir(dshHome, { recursive: true })
    const profileDirectory = resolve(dshHome, 'profiles/desktop')
    await mkdir(profileDirectory, { recursive: true })
    await writeFile(resolve(profileDirectory, 'cordis.patch.yml'), `${JSON.stringify([
      { insert: [{ id: 'desktop-shell', config: { mode: 'compatibility' } }] },
    ])}\n`)
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
    const yamlDirectory = resolve(context.desktopWorkspace, 'node_modules/yaml')
    await mkdir(yamlDirectory, { recursive: true })
    await writeFile(resolve(yamlDirectory, 'package.json'), JSON.stringify({ name: 'yaml', main: 'index.cjs' }))
    await writeFile(resolve(yamlDirectory, 'index.cjs'), await readFile(resolve('tests/support/fake-profile-yaml.cjs')))
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
        profileDirectory,
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

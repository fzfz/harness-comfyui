import { lstat, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { materializeDesktopDevelopmentSettings } from '../../scripts/desktop/development-settings.mjs'

const requireFromModule = createRequire(import.meta.url)
const requireFromDsh = createRequire(requireFromModule.resolve('@deepseek-ai/dsh/package.json'))
const yaml = requireFromDsh('js-yaml')
const profileTestSchema = yaml.DEFAULT_SCHEMA.extend([new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar', construct: expression => expression,
})])
const roots = []

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function writeYaml(path, value) {
  await mkdir(resolve(path, '..'), { recursive: true })
  await writeFile(path, yaml.dump(value, { lineWidth: -1, noRefs: true }), { mode: 0o600 })
}

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'desktop-development-settings-'))
  roots.push(root)
  const mainCheckoutPath = resolve(root, 'main')
  const repositoryRoot = resolve(root, 'worktree')
  const privateSourceDshHomeRelativePath = '.local/private-dsh-source'
  const dshHome = resolve(repositoryRoot, '.local/desktop-development/home/harness')
  const profileDirectory = resolve(dshHome, 'profiles/desktop')
  const privateDshHome = resolve(mainCheckoutPath, privateSourceDshHomeRelativePath)
  const providerConfigurationRelativePath = 'config/provider.json'
  const imageReaderConfigurationRelativePath = 'config/image-reader.json'
  const providerConfigurationPath = resolve(repositoryRoot, providerConfigurationRelativePath)
  const imageReaderConfigurationPath = resolve(repositoryRoot, imageReaderConfigurationRelativePath)
  const providerConfiguration = {
    schemaVersion: 1,
    managedNamespaces: {
      'agent-default-model': { provider: 'provider-a', model: 'model-a' },
      'llm-deepseek': { models: [{ id: 'deepseek-a' }] },
      'llm-pi-ai': {
        providers: {
          providerA: { apiKeyEnv: 'PROVIDER_A_KEY', models: [{ id: 'model-a' }] },
          providerB: { models: [{ id: 'model-b' }] },
        },
      },
    },
    credentialRefs: ['DEEPSEEK_API_KEY', 'PROVIDER_A_KEY'],
  }
  const imageReaderConfiguration = {
    schemaVersion: 1,
    configuration: {
      activeProfileId: 'private-image-reader',
      profiles: [
        {
          id: 'runtime',
          name: 'Runtime profile',
          connectionType: 'runtime',
          provider: 'provider-a',
          endpoint: '',
          model: 'vision-runtime',
          hasApiKey: false,
          defaultPrompt: 'Describe the image.',
          temperature: 0.2,
          maxTokens: 2048,
        },
        {
          id: 'private-image-reader',
          name: 'Private profile',
          connectionType: 'openai-compatible',
          provider: '',
          endpoint: 'http://127.0.0.1/v1/chat/completions',
          model: 'vision-private',
          hasApiKey: true,
          defaultPrompt: 'Describe the image.',
          temperature: 0.2,
          maxTokens: 2048,
        },
      ],
    },
  }
  const privateSettings = {
    'harness-comfyui-image-reader-profiles': {
      configuration: { activeProfileId: 'old', profiles: [] },
      credentials: {
        'private-image-reader': 'private-image-key',
        'unused-private-image-reader': 'must-not-be-copied',
      },
    },
  }
  const privateCredentials = {
    version: 1,
    refs: {
      DEEPSEEK_API_KEY: 'deepseek-key',
      PROVIDER_A_KEY: 'provider-a-key',
      EXTRA_SOURCE_KEY: 'must-not-be-copied',
    },
  }
  await Promise.all([
    mkdir(resolve(repositoryRoot, 'config'), { recursive: true }),
    mkdir(privateDshHome, { recursive: true }),
    mkdir(profileDirectory, { recursive: true }),
  ])
  await Promise.all([
    writeFile(providerConfigurationPath, `${JSON.stringify(providerConfiguration, null, 2)}\n`),
    writeFile(resolve(repositoryRoot, 'config/settings-entry-ids.json'), JSON.stringify({
      core: 'harness-comfyui-core', imageReader: 'harness-comfyui-image-reader',
    })),
    writeFile(imageReaderConfigurationPath, `${JSON.stringify(imageReaderConfiguration, null, 2)}\n`),
    writeFile(resolve(repositoryRoot, 'cordis.patch.yml'), [
      '- insert:',
      '    - id: harness-comfyui-core',
      '      name: harness-comfyui/core',
      '      config:',
      '        configurationProfile: !!js process.env.HARNESS_COMFYUI_CONFIGURATION_PROFILE',
      '        startupWorkspacePath: !!js process.env.HARNESS_COMFYUI_STARTUP_WORKSPACE_PATH',
      '    - id: harness-comfyui-image-reader',
      '      name: harness-comfyui/image-reader',
      '      config:',
      '        imageReaderDefaultModel:',
      '          provider: provider-a',
      '          model: vision-runtime',
      '',
    ].join('\n')),
    writeYaml(resolve(profileDirectory, 'cordis.patch.yml'), []),
    writeYaml(resolve(privateDshHome, 'settings.yaml'), privateSettings),
    writeYaml(resolve(privateDshHome, '.credentials.yaml'), privateCredentials),
  ])
  return {
    checkout: {
      definition: {
        managedDshSettings: {
          providerConfigurationRelativePath,
          imageReaderConfigurationRelativePath,
          privateSourceDshHomeRelativePath,
        },
      },
      mainCheckoutPath,
    },
    context: { baseline: { profile: { name: 'desktop' } }, dshHome, repositoryRoot },
    dshHome,
    imageReaderConfiguration,
    imageReaderConfigurationPath,
    mainCheckoutPath,
    privateCredentials,
    privateDshHome,
    privateSettings,
    profileDirectory,
    providerConfiguration,
    providerConfigurationPath,
    repositoryRoot,
  }
}

async function readYaml(path) {
  return yaml.load(await readFile(path, 'utf8'), { schema: profileTestSchema })
}

describe('Desktop development Settings materialization', () => {
  it('creates an independent worktree configuration from tracked configuration and main private values', async () => {
    const value = await fixture()

    await expect(materializeDesktopDevelopmentSettings(value, value.profileDirectory)).resolves.toEqual({
      credentialRefCount: 2,
      imageProfileCount: 2,
      providerNamespaces: ['agent-default-model', 'llm-deepseek', 'llm-pi-ai'],
    })

    const settingsPath = resolve(value.dshHome, 'settings.yaml')
    const patchPath = resolve(value.profileDirectory, 'cordis.patch.yml')
    const credentialsPath = resolve(value.dshHome, '.credentials.yaml')
    const patch = await readYaml(patchPath)
    const credentials = await readYaml(credentialsPath)
    expect(patch.find(row => row.id === 'agent-default-model').config).toEqual(value.providerConfiguration.managedNamespaces['agent-default-model'])
    expect(patch.find(row => row.id === 'llm-deepseek').config).toEqual(value.providerConfiguration.managedNamespaces['llm-deepseek'])
    expect(patch.find(row => row.id === 'llm-pi-ai').config).toEqual(value.providerConfiguration.managedNamespaces['llm-pi-ai'])
    expect(patch.find(row => row.id === 'harness-comfyui-image-reader').config).toEqual({
      configuration: value.imageReaderConfiguration.configuration,
      credentials: { 'private-image-reader': 'private-image-key' },
      imageReaderDefaultModel: { provider: 'provider-a', model: 'vision-runtime' },
    })
    expect((await readFile(resolve(value.repositoryRoot, 'cordis.patch.yml'), 'utf8'))).toContain('configurationProfile: !!js')
    expect(patch.some(row => row.id === 'harness-comfyui-core')).toBe(false)
    await expect(readFile(settingsPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(credentials).toEqual({
      version: 1,
      refs: {
        DEEPSEEK_API_KEY: 'deepseek-key',
        PROVIDER_A_KEY: 'provider-a-key',
      },
    })
    expect((await stat(patchPath)).mode & 0o777).toBe(0o600)
    expect((await stat(credentialsPath)).mode & 0o777).toBe(0o600)
    expect((await lstat(patchPath)).isSymbolicLink()).toBe(false)
    expect((await lstat(credentialsPath)).isSymbolicLink()).toBe(false)
  })

  it('preserves profile edits and credentials on repeat starts', async () => {
    const value = await fixture()
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    const patchPath = resolve(value.profileDirectory, 'cordis.patch.yml')
    const firstPatch = await readYaml(patchPath)
    const firstCredentials = await readYaml(resolve(value.dshHome, '.credentials.yaml'))
    await writeYaml(patchPath, firstPatch.map(row => row.id === 'agent-default-model'
      ? { ...row, config: { ...row.config, model: 'user-model' } }
      : row))
    await writeYaml(resolve(value.dshHome, '.credentials.yaml'), {
      ...firstCredentials,
      refs: {
        ...firstCredentials.refs,
        PROVIDER_A_KEY: 'stale-provider-key',
        WORKTREE_OWNED_KEY: 'worktree-key',
      },
      records: {
        'worktree-record': { token: 'record-value' },
      },
    })
    value.providerConfiguration.managedNamespaces['agent-default-model'].model = 'model-b'
    value.privateCredentials.refs.PROVIDER_A_KEY = 'provider-a-key-updated'
    await writeFile(
      value.providerConfigurationPath,
      `${JSON.stringify(value.providerConfiguration, null, 2)}\n`,
    )
    await writeYaml(resolve(value.privateDshHome, '.credentials.yaml'), value.privateCredentials)

    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    const patch = await readYaml(patchPath)
    const credentials = await readYaml(resolve(value.dshHome, '.credentials.yaml'))
    expect(patch.find(row => row.id === 'agent-default-model').config.model).toBe('user-model')
    expect(patch.find(row => row.id === 'harness-comfyui-image-reader').config.credentials).toEqual({
      'private-image-reader': 'private-image-key',
    })
    expect(credentials.refs).toEqual({
      PROVIDER_A_KEY: 'stale-provider-key',
      WORKTREE_OWNED_KEY: 'worktree-key',
      DEEPSEEK_API_KEY: 'deepseek-key',
    })
    expect(credentials.records).toEqual({ 'worktree-record': { token: 'record-value' } })
  })

  it('does not restore a user-cleared image reader API key on repeat starts', async () => {
    const value = await fixture()
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    const patchPath = resolve(value.profileDirectory, 'cordis.patch.yml')
    const patch = await readYaml(patchPath)
    const changed = patch.map(row => {
      if (row.id !== 'harness-comfyui-image-reader') return row
      return {
        ...row,
        config: {
          ...row.config,
          credentials: {},
          configuration: {
            ...row.config.configuration,
            profiles: row.config.configuration.profiles.map(profile => profile.id === 'private-image-reader'
              ? { ...profile, hasApiKey: false }
              : profile),
          },
        },
      }
    })
    await writeYaml(patchPath, changed)
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    const repeated = await readYaml(patchPath)
    const imageReader = repeated.find(row => row.id === 'harness-comfyui-image-reader').config
    expect(imageReader.credentials).toEqual({})
    expect(imageReader.configuration.profiles.find(profile => profile.id === 'private-image-reader').hasApiKey).toBe(false)
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    const next = await readYaml(patchPath)
    expect(next.find(row => row.id === 'harness-comfyui-image-reader').config.credentials).toEqual({})
  })

  it('fills bundle config fields around existing Profile edits without restoring cleared credentials', async () => {
    const value = await fixture()
    const patchPath = resolve(value.profileDirectory, 'cordis.patch.yml')
    await writeYaml(patchPath, [
      { id: 'harness-comfyui-core', config: {
        configurationProfile: 'user-profile',
        configuration: { url: 'http://127.0.0.1', port: 23456 },
      } },
      { id: 'harness-comfyui-image-reader', config: {
        imageReaderDefaultModel: { model: 'user-vision' },
        credentials: {},
      } },
    ])
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    const first = await readYaml(patchPath)
    expect(first.find(row => row.id === 'harness-comfyui-core').config).toEqual({
      configurationProfile: 'user-profile',
      startupWorkspacePath: 'process.env.HARNESS_COMFYUI_STARTUP_WORKSPACE_PATH',
      configuration: { url: 'http://127.0.0.1', port: 23456 },
    })
    expect(first.find(row => row.id === 'harness-comfyui-image-reader').config.imageReaderDefaultModel).toEqual({
      provider: 'provider-a', model: 'user-vision',
    })
    expect(first.find(row => row.id === 'harness-comfyui-image-reader').config.credentials).toEqual({})
    expect(await readFile(patchPath, 'utf8')).toContain('startupWorkspacePath: !!js')
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    const repeated = await readYaml(patchPath)
    expect(repeated).toEqual(first)
    expect(await readFile(patchPath, 'utf8')).toContain('startupWorkspacePath: !!js')
  })

  it('preserves deleted and cleared Provider entries across repeated starts', async () => {
    const value = await fixture()
    const patchPath = resolve(value.profileDirectory, 'cordis.patch.yml')
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    const initial = await readYaml(patchPath)
    const keepOnlyA = initial.map(row => row.id === 'llm-pi-ai'
      ? { ...row, config: { ...row.config, providers: { providerA: row.config.providers.providerA } } }
      : row)
    await writeYaml(patchPath, keepOnlyA)
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    const withoutB = await readYaml(patchPath)
    expect(Object.keys(withoutB.find(row => row.id === 'llm-pi-ai').config.providers)).toEqual(['providerA'])
    const cleared = withoutB.map(row => row.id === 'llm-pi-ai'
      ? { ...row, config: { ...row.config, providers: {} } }
      : row)
    await writeYaml(patchPath, cleared)
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    const repeated = await readYaml(patchPath)
    expect(repeated.find(row => row.id === 'llm-pi-ai').config.providers).toEqual({})
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    const next = await readYaml(patchPath)
    expect(next.find(row => row.id === 'llm-pi-ai').config.providers).toEqual({})
  })

  it('preserves nested Profile settings as a complete image reader pair over legacy settings', async () => {
    const value = await fixture()
    const patchPath = resolve(value.profileDirectory, 'cordis.patch.yml')
    const settingsPath = resolve(value.dshHome, 'settings.yaml')
    const newerConfiguration = {
      activeProfileId: 'runtime',
      profiles: [value.imageReaderConfiguration.configuration.profiles[0]],
    }
    await writeYaml(settingsPath, {
      'harness-comfyui-image-reader-profiles': {
        configuration: value.imageReaderConfiguration.configuration,
        credentials: { 'private-image-reader': 'legacy-target-key' },
      },
    })
    await writeYaml(patchPath, [{ insert: [
      { id: 'harness-comfyui-core', config: {
        configuration: { url: 'http://127.0.0.1', port: 34567 },
      } },
      { id: 'harness-comfyui-image-reader', config: { configuration: newerConfiguration } },
    ] }])
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    const patch = await readYaml(patchPath)
    expect(patch.filter(row => row.id === 'harness-comfyui-core' || row.id === 'harness-comfyui-image-reader')).toEqual([])
    const [core, imageReader] = patch[0].insert
    expect(core.config.configuration.port).toBe(34567)
    expect(core.config.configurationProfile).toBe('process.env.HARNESS_COMFYUI_CONFIGURATION_PROFILE')
    expect(core.config.startupWorkspacePath).toBe('process.env.HARNESS_COMFYUI_STARTUP_WORKSPACE_PATH')
    expect(imageReader.config.configuration).toEqual(newerConfiguration)
    expect(Object.hasOwn(imageReader.config, 'credentials')).toBe(false)
    expect(imageReader.config.imageReaderDefaultModel).toEqual({ provider: 'provider-a', model: 'vision-runtime' })
    expect(await readFile(patchPath, 'utf8')).toContain('startupWorkspacePath: !!js')
    await expect(readFile(settingsPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    const repeated = await readYaml(patchPath)
    expect(repeated).toEqual(patch)
  })

  it('does not add legacy image configuration when the Profile only stores credentials', async () => {
    const value = await fixture()
    const patchPath = resolve(value.profileDirectory, 'cordis.patch.yml')
    await writeYaml(patchPath, [{ id: 'harness-comfyui-image-reader', config: {
      credentials: {},
    } }])
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    const patch = await readYaml(patchPath)
    const config = patch.find(row => row.id === 'harness-comfyui-image-reader').config
    expect(config.credentials).toEqual({})
    expect(Object.hasOwn(config, 'configuration')).toBe(false)
    expect(config.imageReaderDefaultModel).toEqual({ provider: 'provider-a', model: 'vision-runtime' })
  })

  it('reads the main checkout imported archive when the active settings file was consumed', async () => {
    const value = await fixture()
    await rename(
      resolve(value.privateDshHome, 'settings.yaml'),
      resolve(value.privateDshHome, 'settings.yaml.imported'),
    )
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    const patch = await readYaml(resolve(value.profileDirectory, 'cordis.patch.yml'))
    expect(patch.find(row => row.id === 'harness-comfyui-image-reader').config.credentials).toEqual({
      'private-image-reader': 'private-image-key',
    })
  })

  it('uses the archive when an active main settings document has no image reader section', async () => {
    const value = await fixture()
    await rename(
      resolve(value.privateDshHome, 'settings.yaml'),
      resolve(value.privateDshHome, 'settings.yaml.imported'),
    )
    await writeYaml(resolve(value.privateDshHome, 'settings.yaml'), { 'dsh-desktop': { port: 23456 } })
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    const patch = await readYaml(resolve(value.profileDirectory, 'cordis.patch.yml'))
    expect(patch.find(row => row.id === 'harness-comfyui-image-reader').config.credentials).toEqual({
      'private-image-reader': 'private-image-key',
    })
  })

  it('uses active main settings before its historical archive', async () => {
    const value = await fixture()
    await writeYaml(resolve(value.privateDshHome, 'settings.yaml.imported'), value.privateSettings)
    await writeYaml(resolve(value.privateDshHome, 'settings.yaml'), {
      'harness-comfyui-image-reader-profiles': {
        configuration: value.imageReaderConfiguration.configuration,
        credentials: { 'private-image-reader': 'active-main-key' },
      },
    })
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    const patch = await readYaml(resolve(value.profileDirectory, 'cordis.patch.yml'))
    expect(patch.find(row => row.id === 'harness-comfyui-image-reader').config.credentials).toEqual({
      'private-image-reader': 'active-main-key',
    })
  })

  it('uses the main checkout Profile before active settings and preserves target edits on repeat starts', async () => {
    const value = await fixture()
    const mainPatchPath = resolve(value.privateDshHome, 'profiles/desktop/cordis.patch.yml')
    const targetPatchPath = resolve(value.profileDirectory, 'cordis.patch.yml')
    const sourceSection = {
      configuration: value.imageReaderConfiguration.configuration,
      credentials: { 'private-image-reader': 'main-profile-key' },
    }
    await writeYaml(mainPatchPath, [{ insert: [{ id: 'harness-comfyui-image-reader', config: sourceSection }] }])
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    const initial = await readYaml(targetPatchPath)
    expect(initial.find(row => row.id === 'harness-comfyui-image-reader').config.credentials).toEqual(sourceSection.credentials)
    await writeYaml(targetPatchPath, initial.map(row => row.id === 'harness-comfyui-image-reader'
      ? { ...row, config: { ...row.config, credentials: { 'private-image-reader': 'target-user-key' } } }
      : row))
    sourceSection.credentials['private-image-reader'] = 'updated-main-key'
    await writeYaml(mainPatchPath, [{ insert: [{ id: 'harness-comfyui-image-reader', config: sourceSection }] }])
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    const repeated = await readYaml(targetPatchPath)
    expect(repeated.find(row => row.id === 'harness-comfyui-image-reader').config.credentials).toEqual({
      'private-image-reader': 'target-user-key',
    })
  })

  it('keeps a key cleared in the main checkout Profile instead of restoring an archived key', async () => {
    const value = await fixture()
    const mainPatchPath = resolve(value.privateDshHome, 'profiles/desktop/cordis.patch.yml')
    const config = {
      ...value.imageReaderConfiguration.configuration,
      profiles: value.imageReaderConfiguration.configuration.profiles.map(profile => profile.id === 'private-image-reader'
        ? { ...profile, hasApiKey: false }
        : profile),
    }
    await writeYaml(mainPatchPath, [{ id: 'harness-comfyui-image-reader', config: {
      configuration: config, credentials: {},
    } }])
    await rename(
      resolve(value.privateDshHome, 'settings.yaml'),
      resolve(value.privateDshHome, 'settings.yaml.imported'),
    )
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    const patch = await readYaml(resolve(value.profileDirectory, 'cordis.patch.yml'))
    const imageReader = patch.find(row => row.id === 'harness-comfyui-image-reader').config
    expect(imageReader.credentials).toEqual({})
    expect(imageReader.configuration.profiles.find(profile => profile.id === 'private-image-reader').hasApiKey).toBe(false)
  })

  it('moves legacy source and image reader values into the matching profile entries once', async () => {
    const value = await fixture()
    const settingsPath = resolve(value.dshHome, 'settings.yaml')
    const source = { configuration: { url: 'http://127.0.0.1', port: 23456 } }
    const imageReader = {
      configuration: value.imageReaderConfiguration.configuration,
      credentials: { 'private-image-reader': 'user-image-key' },
    }
    await writeYaml(settingsPath, {
      'harness-comfyui-source': source,
      'harness-comfyui-image-reader-profiles': imageReader,
      'dsh-desktop': { port: 23457 },
    })
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    const patch = await readYaml(resolve(value.profileDirectory, 'cordis.patch.yml'))
    expect(patch.find(row => row.id === 'harness-comfyui-core').config).toEqual({
      ...source,
      configurationProfile: 'process.env.HARNESS_COMFYUI_CONFIGURATION_PROFILE',
      startupWorkspacePath: 'process.env.HARNESS_COMFYUI_STARTUP_WORKSPACE_PATH',
    })
    expect(patch.find(row => row.id === 'harness-comfyui-image-reader').config).toEqual({
      ...imageReader,
      imageReaderDefaultModel: { provider: 'provider-a', model: 'vision-runtime' },
    })
    expect(await readYaml(settingsPath)).toEqual({ 'dsh-desktop': { port: 23457 } })
    await writeYaml(resolve(value.profileDirectory, 'cordis.patch.yml'), patch.map(row =>
      row.id === 'harness-comfyui-core'
        ? { ...row, config: { configuration: { url: 'http://127.0.0.1', port: 45678 } } }
        : row))
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    const repeated = await readYaml(resolve(value.profileDirectory, 'cordis.patch.yml'))
    expect(repeated.find(row => row.id === 'harness-comfyui-core').config.configuration.port).toBe(45678)
    expect(await readYaml(settingsPath)).toEqual({ 'dsh-desktop': { port: 23457 } })
  })

  it('archives the exact original settings.yaml when every section is migrated', async () => {
    const value = await fixture()
    const settingsPath = resolve(value.dshHome, 'settings.yaml')
    const importedPath = resolve(value.dshHome, 'settings.yaml.imported')
    await writeYaml(settingsPath, {
      'harness-comfyui-source': { configuration: { url: 'http://127.0.0.1', port: 23456 } },
      'harness-comfyui-image-reader-profiles': {
        configuration: value.imageReaderConfiguration.configuration,
        credentials: { 'private-image-reader': 'user-image-key' },
      },
    })
    const original = await readFile(settingsPath, 'utf8')
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    await expect(readFile(settingsPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(importedPath, 'utf8')).toBe(original)
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    expect(await readFile(importedPath, 'utf8')).toBe(original)
  })

  it('migrates the older single image reader section into the modern Profile entry', async () => {
    const value = await fixture()
    const settingsPath = resolve(value.dshHome, 'settings.yaml')
    const older = {
      configuration: {
        provider: 'provider-a', model: 'vision-old', defaultPrompt: 'Read the old image.',
        temperature: 0.4, maxTokens: 1024,
      },
    }
    await writeYaml(settingsPath, { 'harness-comfyui-image-reader': older })
    const original = await readFile(settingsPath, 'utf8')
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    const patch = await readYaml(resolve(value.profileDirectory, 'cordis.patch.yml'))
    const migrated = patch.find(row => row.id === 'harness-comfyui-image-reader').config
    expect(migrated.configuration.profiles).toHaveLength(1)
    expect(migrated.configuration.profiles[0]).toMatchObject({
      provider: 'provider-a', model: 'vision-old', defaultPrompt: 'Read the old image.',
      temperature: 0.4, maxTokens: 1024, connectionType: 'runtime', hasApiKey: false,
    })
    expect(migrated.credentials).toEqual({})
    await expect(readFile(settingsPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(resolve(value.dshHome, 'settings.yaml.imported'), 'utf8')).toBe(original)
  })

  it('prefers the modern image reader section when both legacy formats exist', async () => {
    const value = await fixture()
    const settingsPath = resolve(value.dshHome, 'settings.yaml')
    const modern = {
      configuration: value.imageReaderConfiguration.configuration,
      credentials: { 'private-image-reader': 'modern-key' },
    }
    await writeYaml(settingsPath, {
      'harness-comfyui-image-reader': { configuration: { provider: 'old', model: 'old' } },
      'harness-comfyui-image-reader-profiles': modern,
    })
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    const patch = await readYaml(resolve(value.profileDirectory, 'cordis.patch.yml'))
    expect(patch.find(row => row.id === 'harness-comfyui-image-reader').config).toEqual({
      ...modern,
      imageReaderDefaultModel: { provider: 'provider-a', model: 'vision-runtime' },
    })
    await expect(readFile(settingsPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects coexisting settings.yaml and archive before changing the Profile or either file', async () => {
    const value = await fixture()
    const settingsPath = resolve(value.dshHome, 'settings.yaml')
    const importedPath = resolve(value.dshHome, 'settings.yaml.imported')
    const patchPath = resolve(value.profileDirectory, 'cordis.patch.yml')
    const credentialsPath = resolve(value.dshHome, '.credentials.yaml')
    await writeYaml(settingsPath, { 'worktree-owned': { enabled: true } })
    await writeFile(importedPath, 'original archive\n', { mode: 0o600 })
    await writeYaml(credentialsPath, { version: 1, refs: { EXISTING_KEY: 'worktree-key' } })
    const [settings, patch, credentials] = await Promise.all([
      readFile(settingsPath, 'utf8'), readFile(patchPath, 'utf8'), readFile(credentialsPath, 'utf8'),
    ])
    await expect(materializeDesktopDevelopmentSettings(value, value.profileDirectory))
      .rejects.toThrow('settings.yaml and settings.yaml.imported both exist')
    expect(await readFile(settingsPath, 'utf8')).toBe(settings)
    expect(await readFile(importedPath, 'utf8')).toBe('original archive\n')
    expect(await readFile(patchPath, 'utf8')).toBe(patch)
    expect(await readFile(credentialsPath, 'utf8')).toBe(credentials)
  })

  it('fills missing Profile fields while retaining expressions and user-selected values', async () => {
    const value = await fixture()
    const patchPath = resolve(value.profileDirectory, 'cordis.patch.yml')
    await writeFile(patchPath, [
      '- id: agent-default-model',
      '  config:',
      '    model: user-model',
      '- id: unrelated',
      '  config:',
      '    disabled: !!js "process.env.UNRELATED_DISABLED === \'1\'"',
      '- id: llm-pi-ai',
      '  config:',
      '    providers: !!js "({ dynamic: true })"',
      '',
    ].join('\n'), { mode: 0o600 })
    await materializeDesktopDevelopmentSettings(value, value.profileDirectory)
    const source = await readFile(patchPath, 'utf8')
    expect(source).toContain('!!js')
    expect(source).toContain('process.env.UNRELATED_DISABLED')
    const patch = yaml.load(source, {
      schema: yaml.DEFAULT_SCHEMA.extend([new yaml.Type('tag:yaml.org,2002:js', {
        kind: 'scalar', construct: expression => expression,
      })]),
    })
    expect(patch.find(row => row.id === 'agent-default-model').config).toEqual({
      model: 'user-model', provider: 'provider-a',
    })
    expect(patch.find(row => row.id === 'unrelated').config.disabled).toBe("process.env.UNRELATED_DISABLED === '1'")
    expect(patch.find(row => row.id === 'llm-pi-ai').config.providers).toBe('({ dynamic: true })')
  })

  it.each([
    ['a missing tracked Provider file', async value => rm(value.providerConfigurationPath)],
    ['a private source path outside the main checkout', async value => {
      value.checkout.definition.managedDshSettings.privateSourceDshHomeRelativePath = '../private-dsh-source'
    }],
    ['an invalid tracked Provider schema', async value => writeFile(
      value.providerConfigurationPath,
      `${JSON.stringify({ ...value.providerConfiguration, schemaVersion: 2 })}\n`,
    )],
    ['a tracked Provider credential value', async value => writeFile(
      value.providerConfigurationPath,
      `${JSON.stringify({
        ...value.providerConfiguration,
        managedNamespaces: {
          ...value.providerConfiguration.managedNamespaces,
          'llm-deepseek': { apiKey: 'must-not-be-tracked' },
        },
      })}\n`,
    )],
    ['tracked image reader credentials', async value => writeFile(
      value.imageReaderConfigurationPath,
      `${JSON.stringify({ ...value.imageReaderConfiguration, credentials: { private: 'forbidden' } })}\n`,
    )],
    ['nested tracked image reader credentials', async value => writeFile(
      value.imageReaderConfigurationPath,
      `${JSON.stringify({
        ...value.imageReaderConfiguration,
        configuration: {
          ...value.imageReaderConfiguration.configuration,
          profiles: value.imageReaderConfiguration.configuration.profiles.map(profile => (
            profile.id === 'runtime' ? { ...profile, credentials: { private: 'forbidden' } } : profile
          )),
        },
      })}\n`,
    )],
    ['an incomplete image reader profile', async value => writeFile(
      value.imageReaderConfigurationPath,
      `${JSON.stringify({
        ...value.imageReaderConfiguration,
        configuration: {
          ...value.imageReaderConfiguration.configuration,
          profiles: value.imageReaderConfiguration.configuration.profiles.map(profile => (
            profile.id === 'runtime' ? { ...profile, connectionType: undefined } : profile
          )),
        },
      })}\n`,
    )],
    ['mismatched image reader credentials', async value => writeYaml(
      resolve(value.privateDshHome, 'settings.yaml'),
      {
        ...value.privateSettings,
        'harness-comfyui-image-reader-profiles': { credentials: { wrong: 'wrong-key' } },
      },
    )],
    ['a missing Provider credential ref', async value => writeYaml(
      resolve(value.privateDshHome, '.credentials.yaml'),
      { version: 1, refs: { PROVIDER_A_KEY: 'provider-a-key' } },
    )],
    ['a missing main private Settings file', async value => rm(resolve(value.privateDshHome, 'settings.yaml'))],
    ['invalid main private credential YAML', async value => writeFile(
      resolve(value.privateDshHome, '.credentials.yaml'),
      'refs: [unterminated\n',
    )],
    ['an invalid main Profile patch', async value => {
      const path = resolve(value.privateDshHome, 'profiles/desktop/cordis.patch.yml')
      await mkdir(resolve(path, '..'), { recursive: true })
      await writeFile(path, '[unterminated\n')
    }],
    ['an incompatible worktree credential version', async value => writeYaml(
      resolve(value.dshHome, '.credentials.yaml'),
      { version: 2, refs: { WORKTREE_OWNED_KEY: 'worktree-key' } },
    )],
    ['an invalid legacy source address', async value => writeYaml(
      resolve(value.dshHome, 'settings.yaml'),
      { 'harness-comfyui-source': { configuration: { url: 'not-a-url', port: 1 } } },
    )],
    ['an invalid older image reader section without a modern section', async value => writeYaml(
      resolve(value.dshHome, 'settings.yaml'),
      { 'harness-comfyui-image-reader': { configuration: { provider: 'provider-a', model: '' } } },
    )],
    ['a duplicate managed Profile entry', async value => writeYaml(
      resolve(value.profileDirectory, 'cordis.patch.yml'),
      [{ id: 'agent-default-model', config: {} }, { id: 'agent-default-model', config: {} }],
    )],
    ['a duplicate nested managed Profile entry', async value => writeYaml(
      resolve(value.profileDirectory, 'cordis.patch.yml'),
      [{ insert: [
        { id: 'harness-comfyui-image-reader', config: {} },
        { id: 'harness-comfyui-image-reader', config: {} },
      ] }],
    )],
  ])('rejects %s before replacing either target file', async (_name, corrupt) => {
    const value = await fixture()
    const settingsPath = resolve(value.dshHome, 'settings.yaml')
    const patchPath = resolve(value.profileDirectory, 'cordis.patch.yml')
    const credentialsPath = resolve(value.dshHome, '.credentials.yaml')
    await writeYaml(settingsPath, { existing: { value: 'settings-sentinel' } })
    await writeYaml(credentialsPath, { version: 1, refs: { EXISTING_KEY: 'credentials-sentinel' } })
    await corrupt(value)
    const settingsBefore = await readFile(settingsPath, 'utf8')
    const patchBefore = await readFile(patchPath, 'utf8')
    const credentialsBefore = await readFile(credentialsPath, 'utf8')

    await expect(materializeDesktopDevelopmentSettings(value, value.profileDirectory)).rejects.toThrow()
    await expect(readFile(settingsPath, 'utf8')).resolves.toBe(settingsBefore)
    await expect(readFile(patchPath, 'utf8')).resolves.toBe(patchBefore)
    await expect(readFile(credentialsPath, 'utf8')).resolves.toBe(credentialsBefore)
  })
})

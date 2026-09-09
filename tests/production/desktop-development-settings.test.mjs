import { lstat, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { materializeDesktopDevelopmentSettings } from '../../scripts/desktop/development-settings.mjs'

const requireFromModule = createRequire(import.meta.url)
const requireFromDsh = createRequire(requireFromModule.resolve('@deepseek-ai/dsh/package.json'))
const yaml = requireFromDsh('js-yaml')
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
  ])
  await Promise.all([
    writeFile(providerConfigurationPath, `${JSON.stringify(providerConfiguration, null, 2)}\n`),
    writeFile(imageReaderConfigurationPath, `${JSON.stringify(imageReaderConfiguration, null, 2)}\n`),
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
    context: { dshHome, repositoryRoot },
    dshHome,
    imageReaderConfiguration,
    imageReaderConfigurationPath,
    mainCheckoutPath,
    privateCredentials,
    privateDshHome,
    privateSettings,
    providerConfiguration,
    providerConfigurationPath,
    repositoryRoot,
  }
}

async function readYaml(path) {
  return yaml.load(await readFile(path, 'utf8'))
}

describe('Desktop development Settings materialization', () => {
  it('creates an independent worktree configuration from tracked configuration and main private values', async () => {
    const value = await fixture()

    await expect(materializeDesktopDevelopmentSettings(value)).resolves.toEqual({
      credentialRefCount: 2,
      imageProfileCount: 2,
      providerNamespaces: ['agent-default-model', 'llm-deepseek', 'llm-pi-ai'],
    })

    const settingsPath = resolve(value.dshHome, 'settings.yaml')
    const credentialsPath = resolve(value.dshHome, '.credentials.yaml')
    const settings = await readYaml(settingsPath)
    const credentials = await readYaml(credentialsPath)
    expect(settings['agent-default-model']).toEqual(value.providerConfiguration.managedNamespaces['agent-default-model'])
    expect(settings['llm-deepseek']).toEqual(value.providerConfiguration.managedNamespaces['llm-deepseek'])
    expect(settings['llm-pi-ai']).toEqual(value.providerConfiguration.managedNamespaces['llm-pi-ai'])
    expect(settings['harness-comfyui-image-reader-profiles']).toEqual({
      configuration: value.imageReaderConfiguration.configuration,
      credentials: { 'private-image-reader': 'private-image-key' },
    })
    expect(credentials).toEqual({
      version: 1,
      refs: {
        DEEPSEEK_API_KEY: 'deepseek-key',
        PROVIDER_A_KEY: 'provider-a-key',
      },
    })
    expect((await stat(settingsPath)).mode & 0o777).toBe(0o600)
    expect((await stat(credentialsPath)).mode & 0o777).toBe(0o600)
    expect((await lstat(settingsPath)).isSymbolicLink()).toBe(false)
    expect((await lstat(credentialsPath)).isSymbolicLink()).toBe(false)
  })

  it('replaces managed values while preserving worktree-owned settings, refs, and records', async () => {
    const value = await fixture()
    await materializeDesktopDevelopmentSettings(value)
    const firstSettings = await readYaml(resolve(value.dshHome, 'settings.yaml'))
    const firstCredentials = await readYaml(resolve(value.dshHome, '.credentials.yaml'))
    await writeYaml(resolve(value.dshHome, 'settings.yaml'), {
      ...firstSettings,
      'worktree-owned-setting': { enabled: true },
    })
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

    await materializeDesktopDevelopmentSettings(value)
    const settings = await readYaml(resolve(value.dshHome, 'settings.yaml'))
    const credentials = await readYaml(resolve(value.dshHome, '.credentials.yaml'))
    expect(settings['worktree-owned-setting']).toEqual({ enabled: true })
    expect(settings['agent-default-model']).toEqual(value.providerConfiguration.managedNamespaces['agent-default-model'])
    expect(settings['harness-comfyui-image-reader-profiles'].credentials).toEqual({
      'private-image-reader': 'private-image-key',
    })
    expect(credentials.refs).toEqual({
      PROVIDER_A_KEY: 'provider-a-key-updated',
      WORKTREE_OWNED_KEY: 'worktree-key',
      DEEPSEEK_API_KEY: 'deepseek-key',
    })
    expect(credentials.records).toEqual({ 'worktree-record': { token: 'record-value' } })
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
    ['an incompatible worktree credential version', async value => writeYaml(
      resolve(value.dshHome, '.credentials.yaml'),
      { version: 2, refs: { WORKTREE_OWNED_KEY: 'worktree-key' } },
    )],
  ])('rejects %s before replacing either target file', async (_name, corrupt) => {
    const value = await fixture()
    const settingsPath = resolve(value.dshHome, 'settings.yaml')
    const credentialsPath = resolve(value.dshHome, '.credentials.yaml')
    await writeYaml(settingsPath, { existing: { value: 'settings-sentinel' } })
    await writeYaml(credentialsPath, { version: 1, refs: { EXISTING_KEY: 'credentials-sentinel' } })
    await corrupt(value)
    const settingsBefore = await readFile(settingsPath, 'utf8')
    const credentialsBefore = await readFile(credentialsPath, 'utf8')

    await expect(materializeDesktopDevelopmentSettings(value)).rejects.toThrow()
    await expect(readFile(settingsPath, 'utf8')).resolves.toBe(settingsBefore)
    await expect(readFile(credentialsPath, 'utf8')).resolves.toBe(credentialsBefore)
  })
})

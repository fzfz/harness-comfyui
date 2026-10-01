import { createTestCredentialProvider } from '../support/credential-provider.ts'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { Context } from '@deepseek-ai/cordis'
import { SettingsForms, type SettingsPathOp } from '@deepseek-ai/dsh-settings'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { afterEach, describe, expect, it, vi } from 'vitest'

import errorCatalog from '../../config/error-catalog.json' with { type: 'json' }
import pluginRuntimeResources from '../../config/plugin-runtime-resources.json' with { type: 'json' }
import runtimeArtifacts from '../../config/runtime-artifacts.json' with { type: 'json' }
import { Config as CoreConfig } from '../../src/host/core/schema.ts'
import { materializeManagedCliModuleFromSources } from '../../scripts/build/cli-module.mjs'
import { materializeHostModule } from '../../scripts/build/host-module.mjs'
import IMAGE_READER_REMOTE from '../../src/image-reader/remote.ts'
import { IMAGE_READER_PROFILE_ENTRY_ID } from '../../src/image-reader/settings.ts'
import * as harnessComfyui from '../support/product-plugin.ts'
import { SOURCE_PROFILE_ENTRY_ID } from '../../src/source-settings.ts'
import { PLUGIN_RUNTIME_RESOURCE_PATHS } from '../../src/host/plugin-resources.ts'
import {
  reportFrontendAttemptDiagnostic,
  reportGenerationRunInputLookupError,
} from '../../src/host/plugin.ts'
import {
  IMAGE_READER_FORBIDDEN_SOURCE_SENTINELS,
  IMAGE_READER_SENTINEL_PROMPT,
  createImageReaderProviderFailureFixture,
} from '../support/image-reader-provider-failure.ts'

const temporaryDirectories: string[] = []

afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function stubTestProfileEnvironment(): string {
  const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-host-plugin-'))
  temporaryDirectories.push(root)
  const values: Record<string, string> = {
    HARNESS_COMFYUI_DATA_DIR: join(root, 'data'),
    HARNESS_COMFYUI_API_WORKFLOW_CACHE_DIRECTORY: join(root, 'data/api-workflow-cache'),
    HARNESS_COMFYUI_RUN_REPOSITORY_FILE: join(root, 'runs.sqlite'),
    HARNESS_COMFYUI_RUN_DIRECTORY: join(root, 'runs'),
    HARNESS_COMFYUI_SAVED_MEDIA_DIRECTORY: join(root, 'media'),
    HARNESS_COMFYUI_LOG_DIRECTORY: join(root, 'logs'),
    HARNESS_COMFYUI_CATALOG_PORT: '18093',
  }
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value)
  return root
}

async function materializeTestHostModule(options: {
  omitResource?: keyof typeof PLUGIN_RUNTIME_RESOURCE_PATHS
  omitRequiredFile?: string
} = {}): Promise<string> {
  const outputRoot = mkdtempSync(join(process.cwd(), '.host-module-test-'))
  temporaryDirectories.push(outputRoot)
  const output = await materializeHostModule(process.cwd(), { outputRoot })
  const packageRoot = dirname(dirname(dirname(output)))
  const paths = Object.fromEntries(Object.entries(PLUGIN_RUNTIME_RESOURCE_PATHS)
    .map(([key, relativePath]) => [key, resolve(packageRoot, relativePath)])) as Record<keyof typeof PLUGIN_RUNTIME_RESOURCE_PATHS, string>

  for (const key of ['semanticQueryClient', 'sourceReadClient'] as const) {
    if (options.omitResource === key) continue
    const source = resolve(process.cwd(), PLUGIN_RUNTIME_RESOURCE_PATHS[key])
    mkdirSync(dirname(paths[key]), { recursive: true })
    copyFileSync(source, paths[key])
  }
  await materializeManagedCliModuleFromSources(process.cwd(), packageRoot)
  if (options.omitResource === 'managedCli') rmSync(paths.managedCli)
  if (options.omitResource === 'frontendCompilerWorker') rmSync(paths.frontendCompilerWorker)
  for (const relativePath of pluginRuntimeResources.requiredFiles) {
    if (options.omitRequiredFile === relativePath) continue
    const source = resolve(process.cwd(), relativePath)
    const destination = resolve(packageRoot, relativePath)
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(source, destination)
  }
  return output
}

function packageRootForHostEntry(entry: string): string {
  return dirname(dirname(dirname(entry)))
}

function provideHostServices(ctx: Context) {
  const harnessHome = mkdtempSync(join(tmpdir(), 'harness-comfyui-harness-home-'))
  temporaryDirectories.push(harnessHome)
  const dshHomePath = vi.fn((...segments: string[]) => join(harnessHome, ...segments))
  ctx.provide('dshHomePath' as never, dshHomePath as never)
  ctx.provide('credentials' as never, createTestCredentialProvider() as never)
  const registerTool = vi.fn((_definition: { readonly name: string }) => vi.fn())
  const registerRoute = vi.fn(() => vi.fn())
  const disposeShellEnvironment = vi.fn()
  const registerShellEnvironment = vi.fn((_contributor: {
    readonly name: string
    resolve(execution: never): Readonly<Record<string, string>>
  }) => disposeShellEnvironment)
  const createWorkspace = vi.fn(async () => ({ id: 'workspace_1', sessionIds: [] }))
  ctx.provide('tools', { register: registerTool })
  ctx.provide('webServer', { host: '127.0.0.1', port: 43199, register: registerRoute })
  ctx.provide('shellEnv' as never, { register: registerShellEnvironment } as never)
  const saveImage = vi.fn()
  ctx.provide('attachments' as never, {
    imageLimits: {
      maxImageBytes: 8 * 1024 * 1024,
      maxImagesPerMessage: 1,
      maxMessageImageBytes: 8 * 1024 * 1024,
      maxImagePixels: 16_000_000,
      maxImageDimension: 8192,
      mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    },
    saveImage,
  } as never)
  const prepareCall = vi.fn()
  ctx.provide('llm' as never, {
    listProviders: vi.fn(() => []),
    listModels: vi.fn(async () => []),
    prepareCall,
  } as never)
  const describeSettings = vi.fn(() => [])
  const replaceSettings = vi.fn(async () => undefined)
  ctx.provide('settings' as never, {
    describe: describeSettings,
    replace: replaceSettings,
  } as never)
  ctx.provide('workspaceRegistry', {
    create: createWorkspace,
    resolveByPath: vi.fn(async () => ({ id: 'workspace_1', sessionIds: ['session_1'] })),
  })
  ctx.provide('sessionPersistence' as never, { stat: vi.fn(async () => undefined) } as never)
  return {
    harnessHome,
    dshHomePath,
    createWorkspace,
    disposeShellEnvironment,
    registerRoute,
    describeSettings,
    replaceSettings,
    registerShellEnvironment,
    registerTool,
    prepareCall,
    saveImage,
  }
}

function createBrowserSettingsForms() {
  const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-browser-config-form-'))
  temporaryDirectories.push(root)
  const entry = {
    id: SOURCE_PROFILE_ENTRY_ID,
    options: { id: SOURCE_PROFILE_ENTRY_ID, name: 'Harness ComfyUI Core', config: {} },
    fiber: {
      uid: 1,
      runtime: { Config: CoreConfig },
      state: 2,
      config: CoreConfig({ configurationProfile: 'production' }),
    },
  }
  let profilePatch: Record<string, unknown> = {}
  const configEditor = {
    documentPath: join(root, 'cordis.patch.yml'),
    entries: () => [entry],
    configuration: () => [{ entry, inherited: {}, override: profilePatch }],
    edit: async (_entry: typeof entry, change: (current: Record<string, unknown>, inherited: Record<string, unknown>) => Record<string, unknown>) => {
      profilePatch = change(profilePatch, {})
      entry.options.config = profilePatch
    },
  }
  const ctx = new Context()
  ctx.root.provide('loader' as never, { await: () => Promise.resolve() } as never)
  ctx.provide('configEditor' as never, configEditor as never)
  ctx.provide('profileContext' as never, { home: root, dir: root, installAnchor: root } as never)
  const forms = new SettingsForms(ctx)
  return {
    ctx,
    forms,
    close: () => ctx.fiber.dispose(),
  }
}

describe('Harness ComfyUI Host plugin', () => {
  it('stores default business files under the official Harness home across Host restarts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'official harness home with spaces-'))
    temporaryDirectories.push(root)
    const defaultPaths = {
      dataDir: join(root, 'data/plugins/harness-comfyui'),
      apiWorkflowCacheDirectory: join(root, 'data/plugins/harness-comfyui/api-workflow-cache'),
      runRepositoryFile: join(root, 'data/plugins/harness-comfyui/runs.sqlite'),
      runDirectory: join(root, 'data/plugins/harness-comfyui/runs'),
      savedMediaDirectory: join(root, 'data/plugins/harness-comfyui/media'),
      logDirectory: join(root, 'data/plugins/harness-comfyui/logs'),
    }
    for (const name of ['HARNESS_COMFYUI_DATA_DIR', 'HARNESS_COMFYUI_API_WORKFLOW_CACHE_DIRECTORY',
      'HARNESS_COMFYUI_RUN_REPOSITORY_FILE', 'HARNESS_COMFYUI_RUN_DIRECTORY',
      'HARNESS_COMFYUI_SAVED_MEDIA_DIRECTORY', 'HARNESS_COMFYUI_LOG_DIRECTORY']) vi.stubEnv(name, undefined)
    const core = await import('../../src/host/core/plugin.ts')
    for (let restart = 0; restart < 2; restart++) {
      const context = new Context()
      provideHostServices(context)
      context.set('dshHomePath' as never, ((...segments: string[]) => join(root, ...segments)) as never)
      await context.plugin(core, { configurationProfile: 'production' })
      expect(context.harnessComfyuiCore.services.profile.paths).toEqual(defaultPaths)
      await context.fiber.dispose()
    }
  })

  it('loads the saved browser path and exposes packaged Remote validation without starting a browser', async () => {
    stubTestProfileEnvironment()
    const output = await materializeTestHostModule()
    const packaged = await harnessComfyui.packagedProduct(output)
    const ctx = new Context()
    provideHostServices(ctx)
    const browserExecutablePath = process.execPath
    const fiber = await ctx.plugin(packaged, { configurationProfile: 'production', browserExecutablePath })
    try {
      expect(ctx.harnessComfyuiCore.services.profile.comfyui.frontendCompiler.browserExecutablePath)
        .toBe(browserExecutablePath)
      const browser = ctx.harnessComfyuiBrowserSettings
      expect(remoteMethods(browser)).toEqual([
        { method: 'configuration', invocation: { kind: 'direct' } },
        { method: 'validate', invocation: { kind: 'direct' } },
      ])
      const signal = new AbortController().signal
      await expect(browser.configuration(signal)).resolves.toEqual({ browserExecutablePath })
      await expect(browser.validate({ browserExecutablePath }, signal))
        .resolves.toEqual({ ok: true, value: { browserExecutablePath } })
      await expect(browser.validate({ browserExecutablePath: '/missing-browser-for-settings' }, signal))
        .resolves.toMatchObject({ ok: false, error: { code: 'BROWSER_EXECUTABLE_PATH_UNAVAILABLE', path: '/missing-browser-for-settings' } })
      await expect(browser.configuration(AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' })
    } finally {
      await fiber.dispose()
      expect(ctx.reflect.get('harnessComfyuiBrowserSettings')).toBeUndefined()
      await ctx.fiber.dispose()
    }
  })

  it('saves a Browser path through the installed ConfigForms API into the core Profile patch', async () => {
    const { forms, close } = createBrowserSettingsForms()
    try {
      const namespace = forms.describe().find(row => row.ns === SOURCE_PROFILE_ENTRY_ID)
      expect(namespace).toBeDefined()
      const operation: SettingsPathOp = {
        op: 'set',
        path: ['browserExecutablePath'],
        value: '/Applications/Other Browser/browser',
      }

      await forms.mutate(SOURCE_PROFILE_ENTRY_ID, [operation], namespace!.revision)

      expect(forms.describe().find(row => row.ns === SOURCE_PROFILE_ENTRY_ID)?.user)
        .toEqual({ browserExecutablePath: '/Applications/Other Browser/browser' })
    } finally {
      await close()
    }
  })

  it('reports an unwritable plugin data directory and preserves existing media before activation', async () => {
    stubTestProfileEnvironment()
    const output = await materializeTestHostModule()
    const packaged = await harnessComfyui.packagedProduct(output)
    const root = mkdtempSync(join(tmpdir(), 'official plugin readonly data-'))
    temporaryDirectories.push(root)
    const data = join(root, 'data')
    const media = join(root, 'media')
    mkdirSync(data)
    mkdirSync(media)
    const existing = join(media, 'existing.png')
    writeFileSync(existing, 'existing media')
    vi.stubEnv('HARNESS_COMFYUI_DATA_DIR', data)
    vi.stubEnv('HARNESS_COMFYUI_RUN_REPOSITORY_FILE', join(data, 'runs.sqlite'))
    vi.stubEnv('HARNESS_COMFYUI_API_WORKFLOW_CACHE_DIRECTORY', join(data, 'api-workflow-cache'))
    vi.stubEnv('HARNESS_COMFYUI_SAVED_MEDIA_DIRECTORY', media)
    const ctx = new Context()
    const { registerTool } = provideHostServices(ctx)
    chmodSync(data, 0o500)
    try {
      await expect(ctx.plugin(packaged, { configurationProfile: 'production' }))
        .rejects.toMatchObject({ code: 'PLUGIN_DATA_DIRECTORY_UNAVAILABLE', path: data })
      expect(registerTool).not.toHaveBeenCalled()
      expect(readFileSync(existing, 'utf8')).toBe('existing media')
    } finally {
      chmodSync(data, 0o700)
      await ctx.fiber.dispose()
    }
  })

  it('reports missing installed package resources before workspace or business data initialization', async () => {
    const profileRoot = stubTestProfileEnvironment()
    const media = join(profileRoot, 'media')
    mkdirSync(media)
    const existingMedia = join(media, 'preserved.png')
    writeFileSync(existingMedia, 'existing business data')
    const output = await materializeTestHostModule({ omitResource: 'sourceReadClient' })
    const packaged = await harnessComfyui.packagedProduct(output)
    const ctx = new Context()
    const { createWorkspace, registerRoute, registerTool } = provideHostServices(ctx)

    try {
      await expect(ctx.plugin(packaged, {
        configurationProfile: 'production',
        startupWorkspacePath: '/test/workspace',
      })).rejects.toMatchObject({
        code: 'PLUGIN_PACKAGE_RESOURCES_UNAVAILABLE',
        detail: expect.stringContaining(resolve(dirname(dirname(dirname(output))), PLUGIN_RUNTIME_RESOURCE_PATHS.sourceReadClient)),
      })
      expect(createWorkspace).not.toHaveBeenCalled()
      expect(registerRoute).not.toHaveBeenCalled()
      expect(registerTool).not.toHaveBeenCalled()
      expect(existsSync(process.env.HARNESS_COMFYUI_RUN_REPOSITORY_FILE!)).toBe(false)
      expect(readFileSync(existingMedia, 'utf8')).toBe('existing business data')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it.each([
    ['Skill instructions', '.agents/skills/comfyui-generate/SKILL.md'],
    ['Preset composition', 'agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml'],
  ])('stops activation when the installed package is missing %s before business data initialization', async (_kind, relativePath) => {
    const profileRoot = stubTestProfileEnvironment()
    const media = join(profileRoot, 'media')
    mkdirSync(media)
    const existingMedia = join(media, 'preserved.png')
    writeFileSync(existingMedia, 'existing business data')
    const output = await materializeTestHostModule({ omitRequiredFile: relativePath })
    const packageRoot = packageRootForHostEntry(output)
    const target = resolve(packageRoot, relativePath)
    const packaged = await harnessComfyui.packagedProduct(output)
    const ctx = new Context()
    const { createWorkspace, registerRoute, registerTool } = provideHostServices(ctx)

    try {
      await expect(ctx.plugin(packaged, {
        configurationProfile: 'production',
        startupWorkspacePath: '/test/workspace',
      })).rejects.toMatchObject({
        code: 'PLUGIN_PACKAGE_RESOURCES_UNAVAILABLE',
        detail: expect.stringContaining(target),
        message: expect.stringContaining(errorCatalog.PLUGIN_PACKAGE_RESOURCES_UNAVAILABLE.next_step),
      })
      expect(createWorkspace).not.toHaveBeenCalled()
      expect(registerRoute).not.toHaveBeenCalled()
      expect(registerTool).not.toHaveBeenCalled()
      expect(existsSync(process.env.HARNESS_COMFYUI_RUN_REPOSITORY_FILE!)).toBe(false)
      expect(readFileSync(existingMedia, 'utf8')).toBe('existing business data')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('writes failed and successful frontend attempt diagnostics to the matching Host log levels', () => {
    const logger = { error: vi.fn(), info: vi.fn() }

    reportFrontendAttemptDiagnostic(logger, {
      attempt: 1,
      status: 'failed',
      stage: 'navigation',
      code: 'COMFYUI_FRONTEND_NAVIGATION_FAILED',
    })
    reportFrontendAttemptDiagnostic(logger, { attempt: 2, status: 'succeeded' })

    expect(logger.error).toHaveBeenCalledWith(
      'Official ComfyUI frontend browser attempt diagnostic: %s',
      JSON.stringify({
        attempt: 1,
        status: 'failed',
        stage: 'navigation',
        code: 'COMFYUI_FRONTEND_NAVIGATION_FAILED',
      }),
    )
    expect(logger.info).toHaveBeenCalledWith(
      'Official ComfyUI frontend browser attempt diagnostic: %s',
      JSON.stringify({ attempt: 2, status: 'succeeded' }),
    )
  })

  it('writes historical Run lookup context and the original error to the Host logger', () => {
    const logger = { error: vi.fn() }
    const error = new Error('private failure')

    reportGenerationRunInputLookupError(logger, {
      workspaceId: 'workspace_1',
      runId: 'run_1',
      error,
    })

    expect(logger.error).toHaveBeenNthCalledWith(
      1,
      'Historical Generation Run input lookup failed for Workspace %s and Run %s.',
      'workspace_1',
      'run_1',
    )
    expect(logger.error).toHaveBeenNthCalledWith(2, error)
  })

  it('exports the Loader plugin shape and Standard Schema configuration', () => {
    expect(harnessComfyui.name).toBe('harness-comfyui')
    expect(harnessComfyui.inject).toEqual([
      'tools', 'webServer', 'workspaceRegistry', 'shellEnv', 'attachments', 'llm', 'settings', 'credentials', 'sessionPersistence',
    ])
    expect(typeof harnessComfyui.apply).toBe('function')
    expect(typeof harnessComfyui.Config?.['~standard'].validate).toBe('function')
  })

  it('loads a valid Configuration Profile from source', async () => {
    stubTestProfileEnvironment()
    const output = await materializeTestHostModule()
    const packageRoot = packageRootForHostEntry(output)
    const packaged = await harnessComfyui.packagedProduct(output)
    const ctx = new Context()
    const {
      createWorkspace,
      disposeShellEnvironment,
      registerRoute,
      registerShellEnvironment,
      registerTool,
    } = provideHostServices(ctx)
    const fiber = await ctx.plugin(packaged, { configurationProfile: 'production' })

    expect(createWorkspace).not.toHaveBeenCalled()
    expect(registerTool.mock.calls.map(([definition]) => definition.name)).toEqual([
      'query_semantic_comfyui_templates',
      'query_semantic_loras',
      'query_semantic_generation_models',
      'query_semantic_comfyui_instances',
      'generate_with_comfyui',
      'read_comfyui_run_inputs',
      'get_generation_run_media',
      'inspect_image',
    ])
    expect(registerRoute).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'prefix',
      path: '/api/harness-comfyui/media',
    }))
    expect(registerRoute).not.toHaveBeenCalledWith(expect.objectContaining({ path: '/api/harness-comfyui/cli/v1' }))
    expect(registerShellEnvironment).toHaveBeenCalledWith(expect.objectContaining({
      name: 'harness-comfyui-cli',
    }))
    const contributor = registerShellEnvironment.mock.calls[0]![0]
    const execution = {
      token: Symbol('host-plugin-shell'),
      callId: 'call_shell_1',
      name: 'bash',
      arguments: { command: 'node "$DSH_HARNESS_COMFYUI_CLI" catalog instance list' },
      signal: new AbortController().signal,
      agent: {
        session: {
          id: 'session_1',
          header: { cwd: '/workspace' },
          snapshotEvents: () => [{ type: 'tool/call', data: { callId: 'call_shell_1', name: 'bash', turn: 1 } }],
        },
      },
    } as never
    const firstCapability = contributor.resolve(execution).DSH_HARNESS_COMFYUI_CLI_CAPABILITY
    expect(firstCapability).toMatch(/^[A-Za-z0-9_-]{43}$/u)
    expect(contributor.resolve(execution).DSH_HARNESS_COMFYUI_CLI)
      .toBe(resolve(packageRoot, runtimeArtifacts.managedCli.outputEntryRelativePath))
    expect(contributor.resolve(execution).DSH_HARNESS_COMFYUI_CLI_API)
      .toMatch(/^http:\/\/127\.0\.0\.1:\d+\/api\/harness-comfyui\/cli\/v1$/)
    expect(contributor.resolve(execution).DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI)
      .toBe(resolve(packageRoot, PLUGIN_RUNTIME_RESOURCE_PATHS.semanticQueryClient))
    expect(contributor.resolve(execution).DSH_HARNESS_COMFYUI_SOURCE_URL).toBe('http://127.0.0.1')
    expect(contributor.resolve(execution).DSH_HARNESS_COMFYUI_SOURCE_PORT).toBe('18093')
    ctx.emit('tools/result', execution, { status: 'success', value: null } as never)
    const replacementCapability = contributor.resolve(execution).DSH_HARNESS_COMFYUI_CLI_CAPABILITY
    expect(replacementCapability).not.toBe(firstCapability)
    await fiber.dispose()
    expect(disposeShellEnvironment).toHaveBeenCalledOnce()
    await ctx.fiber.dispose()
  })

  it('loads the packaged Host with Remote markers visible to the Desktop Harness protocol', async () => {
    stubTestProfileEnvironment()
    const output = await materializeTestHostModule()
    const packaged = await harnessComfyui.packagedProduct(output)
    const ctx = new Context()
    provideHostServices(ctx)

    const fiber = await ctx.plugin(packaged, { configurationProfile: 'production' })
    const imageReader = ctx.reflect.get('harnessComfyuiImageReader')

    expect(remoteMethods(imageReader)).toEqual([
      { method: 'models', invocation: { kind: 'direct' } },
      { method: 'configuration', invocation: { kind: 'direct' } },
      { method: 'saveProfile', invocation: { kind: 'direct' } },
      { method: 'activateProfile', invocation: { kind: 'direct' } },
      { method: 'deleteProfile', invocation: { kind: 'direct' } },
    ])
    await fiber.dispose()
    await ctx.fiber.dispose()
  })

  it('keeps forbidden Provider sources out of a mounted Host Tool error and Cordis logger sink', async () => {
    stubTestProfileEnvironment()
    const output = await materializeTestHostModule()
    const packaged = await harnessComfyui.packagedProduct(output)
    const failureFixture = createImageReaderProviderFailureFixture()
    const ctx = new Context()
    const logger = { error: vi.fn(), info: vi.fn() }
    vi.spyOn(ctx, 'logger').mockReturnValue(logger as never)
    const { prepareCall, describeSettings, registerTool, saveImage } = provideHostServices(ctx)
    describeSettings.mockImplementation(() => [{
      ns: IMAGE_READER_PROFILE_ENTRY_ID,
      value: { ...failureFixture.scope.get(), credentialRefs: {} },
    }] as never)
    saveImage.mockImplementation(failureFixture.saveImage)
    prepareCall.mockImplementation(failureFixture.prepareCall)
    const fiber = await ctx.plugin(packaged, { configurationProfile: 'production' })
    try {
      const inspectImage = registerTool.mock.calls
        .map(([definition]) => definition)
        .find(definition => definition.name === 'inspect_image') as unknown as {
          execute(args: unknown, execution: unknown): Promise<unknown>
        } | undefined
      if (inspectImage === undefined) throw new Error('Mounted Host did not register inspect_image.')
      const error = await inspectImage.execute({
        file_path: failureFixture.filePath,
        prompt: IMAGE_READER_SENTINEL_PROMPT,
      }, {
        callId: 'call_inspect',
        rootCallId: 'call_inspect',
        name: 'inspect_image',
        arguments: {},
        signal: new AbortController().signal,
        token: Symbol('execution'),
        deferContext: vi.fn(),
        concludeTurn: vi.fn(),
        agent: { id: 'session_1', session: { id: 'session_1', header: { cwd: '/workspace' }, snapshotEvents: () => [] } },
      }).catch(cause => cause) as Error

      expect(error).toMatchObject({ code: 'IMAGE_READER_PROVIDER_FAILED' })
      const toolError = JSON.stringify(error)
      const hostLog = JSON.stringify([...logger.error.mock.calls, ...logger.info.mock.calls])
      for (const source of IMAGE_READER_FORBIDDEN_SOURCE_SENTINELS) {
        expect(toolError).not.toContain(source)
        expect(hostLog).not.toContain(source)
      }
    } finally {
      await fiber.dispose()
      await ctx.fiber.dispose()
      failureFixture.dispose()
    }
  })

  it('passes a JSON-representable invalid value through the strict Remote wire codec to the mounted Host', async () => {
    stubTestProfileEnvironment()
    const output = await materializeTestHostModule()
    const packaged = await harnessComfyui.packagedProduct(output)
    const ctx = new Context()
    provideHostServices(ctx)
    const fiber = await ctx.plugin(packaged, { configurationProfile: 'production' })
    const imageReader = ctx.reflect.get('harnessComfyuiImageReader') as {
      saveProfile(request: unknown, signal: AbortSignal): Promise<unknown>
    }
    const descriptor = IMAGE_READER_REMOTE.descriptors.find(candidate => candidate.method === 'saveProfile')
    const requestCodec = descriptor?.parameters[0]?.codec
    if (requestCodec?.mode !== 'strict') throw new Error('Image reader profile save request requires a strict Remote codec')
    const wireValue = JSON.parse(JSON.stringify({
      operation: 'create',
      activateProfileId: 'custom',
      profile: {
        id: 'custom',
        name: '本地视觉',
        connectionType: 'openai-compatible',
        endpoint: 'not-a-url',
        model: 'qwen-vl',
        defaultPrompt: '描述图片',
        temperature: 0.2,
        maxTokens: 2048,
      },
      credential: { action: 'clear' },
    }))
    const parsedRequest = requestCodec.create().parse(wireValue)

    expect(parsedRequest).toEqual(wireValue)
    await expect(imageReader.saveProfile(parsedRequest, new AbortController().signal)).rejects.toMatchObject({
      name: 'RemoteError',
      code: 'IMAGE_READER_ENDPOINT_URL_INVALID',
    })
    await fiber.dispose()
    await ctx.fiber.dispose()
  })

  it('registers the configured startup workspace before exposing Host capabilities', async () => {
    stubTestProfileEnvironment()
    const output = await materializeTestHostModule()
    const packaged = await harnessComfyui.packagedProduct(output)
    const ctx = new Context()
    const { createWorkspace, registerRoute, registerTool } = provideHostServices(ctx)
    const startupWorkspacePath = '/Volumes/4Tdisk/work/AI2/run-comfyui-workflows-harness'
    vi.stubEnv('HARNESS_COMFYUI_STARTUP_WORKSPACE_PATH', startupWorkspacePath)

    const fiber = await ctx.plugin(packaged, {
      configurationProfile: 'production',
      startupWorkspacePath,
    })

    expect(createWorkspace).toHaveBeenCalledOnce()
    expect(createWorkspace).toHaveBeenCalledWith(startupWorkspacePath)
    expect(createWorkspace.mock.invocationCallOrder[0]).toBeLessThan(registerTool.mock.invocationCallOrder[0]!)
    expect(createWorkspace.mock.invocationCallOrder[0]).toBeLessThan(registerRoute.mock.invocationCallOrder[0]!)
    await fiber.dispose()
    await ctx.fiber.dispose()
  })

  it('registers the configured visual model as the image-reader base', async () => {
    stubTestProfileEnvironment()
    const output = await materializeTestHostModule()
    const packaged = await harnessComfyui.packagedProduct(output)
    const ctx = new Context()
    provideHostServices(ctx)

    const fiber = await ctx.plugin(packaged, {
      configurationProfile: 'production',
      imageReaderDefaultModel: {
        provider: 'opencode-go',
        model: 'vision-model',
      },
    })

    expect(await ctx.imageReader.configuration()).toEqual(expect.objectContaining({
      profiles: [expect.objectContaining({
        connectionType: 'runtime',
        provider: 'opencode-go',
        model: 'vision-model',
      })],
    }))
    await fiber.dispose()
    await ctx.fiber.dispose()
  })

  it('rejects Host activation when the configured startup workspace cannot be registered', async () => {
    stubTestProfileEnvironment()
    const output = await materializeTestHostModule()
    const packaged = await harnessComfyui.packagedProduct(output)
    const ctx = new Context()
    const { createWorkspace, registerRoute, registerTool } = provideHostServices(ctx)
    createWorkspace.mockRejectedValueOnce(new Error('workspace directory is unavailable'))

    await expect(ctx.plugin(packaged, {
      configurationProfile: 'production',
      startupWorkspacePath: '/missing/workspace',
    })).rejects.toThrow('workspace directory is unavailable')

    expect(registerTool).not.toHaveBeenCalled()
    expect(registerRoute).not.toHaveBeenCalled()
    await ctx.fiber.dispose()
  })

  it.each([undefined, null])('uses the packaged production profile for an unset Host selection %j', async configurationProfile => {
    const result = await harnessComfyui.Config['~standard'].validate({ configurationProfile })
    expect(result).toMatchObject({ value: { configurationProfile: 'production' } })
    expect(result).not.toHaveProperty('issues')
  })

  it.each(['invalid', ''])('rejects profile %j before Host startup completes', async configurationProfile => {
    const result = await harnessComfyui.Config['~standard'].validate({ configurationProfile })
    expect(result).toHaveProperty('issues')
  })

  it.each(['', '   '])('rejects a blank startup workspace path %j', async startupWorkspacePath => {
    const result = await harnessComfyui.Config['~standard'].validate({
      configurationProfile: 'production',
      startupWorkspacePath,
    })
    expect(result).toHaveProperty('issues')
  })
})

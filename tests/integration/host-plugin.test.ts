import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { afterEach, describe, expect, it, vi } from 'vitest'

import runtimeArtifacts from '../../config/runtime-artifacts.json' with { type: 'json' }
import { materializeSourceHostModule } from '../../scripts/production/host-module.mjs'
import IMAGE_READER_REMOTE from '../../src/image-reader/remote.ts'
import * as harnessComfyui from '../../src/index.ts'
import { reportGenerationRunInputLookupError } from '../../src/host/plugin.ts'

const temporaryDirectories: string[] = []

afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function stubTestProfileEnvironment(): void {
  const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-host-plugin-'))
  temporaryDirectories.push(root)
  const values: Record<string, string> = {
    HARNESS_COMFYUI_DATA_DIR: join(root, 'data'),
    HARNESS_COMFYUI_API_WORKFLOW_CACHE_DIRECTORY: join(root, 'data/api-workflow-cache'),
    HARNESS_COMFYUI_RUN_REPOSITORY_FILE: join(root, 'runs.sqlite'),
    HARNESS_COMFYUI_RUN_DIRECTORY: join(root, 'runs'),
    HARNESS_COMFYUI_SAVED_MEDIA_DIRECTORY: join(root, 'media'),
    HARNESS_COMFYUI_LOG_DIRECTORY: join(root, 'logs'),
    HARNESS_COMFYUI_CATALOG_CLI_PATH: 'node',
    HARNESS_COMFYUI_CATALOG_PORT: '18093',
    HARNESS_COMFYUI_SOURCE_CLI_PATH: 'node',
  }
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value)
}

function provideHostServices(ctx: Context) {
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
  ctx.provide('attachments' as never, {
    imageLimits: {
      maxImageBytes: 8 * 1024 * 1024,
      maxImagesPerMessage: 1,
      maxMessageImageBytes: 8 * 1024 * 1024,
      maxImagePixels: 16_000_000,
      maxImageDimension: 8192,
      mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    },
    saveImage: vi.fn(),
  } as never)
  ctx.provide('llm' as never, {
    listProviders: vi.fn(() => []),
    listModels: vi.fn(async () => []),
    prepareCall: vi.fn(),
  } as never)
  const registerSettings = vi.fn(() => ({
      get: vi.fn(() => ({
        configuration: {
          activeProfileId: 'default',
          profiles: [{
            id: 'default', name: '默认配置', connectionType: 'runtime', provider: '', endpoint: '', model: '',
            hasApiKey: false, defaultPrompt: '描述图片', temperature: 0.2, maxTokens: 2048,
          }],
        },
        credentials: {},
      })),
      replace: vi.fn(async () => undefined),
    }))
  ctx.provide('settings' as never, {
    register: registerSettings,
    describe: vi.fn(() => []),
  } as never)
  ctx.provide('workspaceRegistry', {
    create: createWorkspace,
    resolveByPath: vi.fn(async () => ({ id: 'workspace_1', sessionIds: ['session_1'] })),
  })
  return {
    createWorkspace,
    disposeShellEnvironment,
    registerRoute,
    registerSettings,
    registerShellEnvironment,
    registerTool,
  }
}

describe('Harness ComfyUI Host plugin', () => {
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
      'tools', 'webServer', 'workspaceRegistry', 'shellEnv', 'attachments', 'llm', 'settings',
    ])
    expect(typeof harnessComfyui.apply).toBe('function')
    expect(typeof harnessComfyui.Config?.['~standard'].validate).toBe('function')
  })

  it('loads a valid Configuration Profile from source', async () => {
    stubTestProfileEnvironment()
    const ctx = new Context()
    const {
      createWorkspace,
      disposeShellEnvironment,
      registerRoute,
      registerShellEnvironment,
      registerTool,
    } = provideHostServices(ctx)
    const fiber = await ctx.plugin(harnessComfyui, { configurationProfile: 'production' })

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
    expect(registerRoute).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'prefix',
      path: '/api/harness-comfyui/cli/v1',
    }))
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
          events: [{ type: 'tool/call', data: { callId: 'call_shell_1', name: 'bash', turn: 1 } }],
        },
      },
    } as never
    const firstCapability = contributor.resolve(execution).DSH_HARNESS_COMFYUI_CLI_CAPABILITY
    expect(firstCapability).toMatch(/^[A-Za-z0-9_-]{43}$/u)
    expect(contributor.resolve(execution).DSH_HARNESS_COMFYUI_CLI)
      .toBe(resolve(process.cwd(), runtimeArtifacts.managedCli.outputEntryRelativePath))
    expect(contributor.resolve(execution).DSH_HARNESS_COMFYUI_CLI_API)
      .toBe('http://127.0.0.1:43199/api/harness-comfyui/cli/v1')
    ctx.emit('tools/result', execution, { status: 'success', value: null } as never)
    const replacementCapability = contributor.resolve(execution).DSH_HARNESS_COMFYUI_CLI_CAPABILITY
    expect(replacementCapability).not.toBe(firstCapability)
    await fiber.dispose()
    expect(disposeShellEnvironment).toHaveBeenCalledOnce()
    await ctx.fiber.dispose()
  })

  it('loads the packaged Host with Remote markers visible to the Desktop Harness protocol', async () => {
    stubTestProfileEnvironment()
    const output = await materializeSourceHostModule(process.cwd())
    const packaged = await import(`${pathToFileURL(output).href}?test=${crypto.randomUUID()}`) as typeof harnessComfyui
    const ctx = new Context()
    provideHostServices(ctx)

    const fiber = await ctx.plugin(packaged, { configurationProfile: 'production' })
    const imageReader = ctx.reflect.get('harnessComfyuiImageReader')

    expect(remoteMethods(imageReader)).toEqual([
      { method: 'models', invocation: { kind: 'direct' } },
      { method: 'saveProfile', invocation: { kind: 'direct' } },
      { method: 'deleteProfile', invocation: { kind: 'direct' } },
    ])
    await fiber.dispose()
    await ctx.fiber.dispose()
  })

  it('passes a JSON-representable invalid value through the strict Remote wire codec to the mounted Host', async () => {
    stubTestProfileEnvironment()
    const output = await materializeSourceHostModule(process.cwd())
    const packaged = await import(`${pathToFileURL(output).href}?test=${crypto.randomUUID()}`) as typeof harnessComfyui
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
    const parsedRequest = requestCodec.schema.parse(wireValue)

    expect(parsedRequest).toEqual(wireValue)
    await expect(imageReader.saveProfile(parsedRequest, new AbortController().signal)).rejects.toMatchObject({
      code: 'IMAGE_READER_ENDPOINT_URL_INVALID',
    })
    await fiber.dispose()
    await ctx.fiber.dispose()
  })

  it('registers the configured startup workspace before exposing Host capabilities', async () => {
    stubTestProfileEnvironment()
    const ctx = new Context()
    const { createWorkspace, registerRoute, registerTool } = provideHostServices(ctx)
    const startupWorkspacePath = '/Volumes/4Tdisk/work/AI2/run-comfyui-workflows-harness'
    vi.stubEnv('HARNESS_COMFYUI_STARTUP_WORKSPACE_PATH', startupWorkspacePath)

    const fiber = await ctx.plugin(harnessComfyui, {
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
    const ctx = new Context()
    const { registerSettings } = provideHostServices(ctx)

    const fiber = await ctx.plugin(harnessComfyui, {
      configurationProfile: 'production',
      imageReaderDefaultModel: {
        provider: 'opencode-go',
        model: 'vision-model',
      },
    })

    expect(registerSettings).toHaveBeenNthCalledWith(
      2,
      'harness-comfyui-image-reader-profiles',
      expect.anything(),
      expect.objectContaining({
        base: expect.objectContaining({
          configuration: expect.objectContaining({
            profiles: [expect.objectContaining({
              connectionType: 'runtime',
              provider: 'opencode-go',
              model: 'vision-model',
            })],
          }),
        }),
      }),
    )
    await fiber.dispose()
    await ctx.fiber.dispose()
  })

  it('rejects Host activation when the configured startup workspace cannot be registered', async () => {
    stubTestProfileEnvironment()
    const ctx = new Context()
    const { createWorkspace, registerRoute, registerTool } = provideHostServices(ctx)
    createWorkspace.mockRejectedValueOnce(new Error('workspace directory is unavailable'))

    await expect(ctx.plugin(harnessComfyui, {
      configurationProfile: 'production',
      startupWorkspacePath: '/missing/workspace',
    })).rejects.toThrow('workspace directory is unavailable')

    expect(registerTool).not.toHaveBeenCalled()
    expect(registerRoute).not.toHaveBeenCalled()
    await ctx.fiber.dispose()
  })

  it.each([
    [undefined, 'missing profile'],
    ['invalid', 'unknown profile'],
  ])('rejects %s before Host startup completes', async (configurationProfile, _caseName) => {
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

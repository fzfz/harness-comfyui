import { createTestCredentialProvider } from '../support/credential-provider.ts'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CLI_ENVIRONMENT_NAMES, CLI_ROUTE_PATH } from '../../src/cli/contract.ts'
import { BROWSER_SETTINGS_REMOTE_NAMESPACE } from '../../src/browser-settings-schema.ts'
import { BROWSER_SETTINGS_REMOTE } from '../../src/browser-settings/remote.ts'
import { GENERATION_MEDIA_ROUTE_PREFIX } from '../../src/host/generation/media-routes.ts'
import type { CoreServices } from '../../src/host/core/schema.ts'
import HARNESS_COMFYUI_REMOTE from '../../src/remote.ts'
import * as cli from '../../src/host/cli/plugin.ts'
import * as imageReaderPlugin from '../../src/host/image-reader/plugin.ts'
import * as web from '../../src/host/web/plugin.ts'

const fibers: Array<{ dispose(): Promise<void> }> = []
const temporaryDirectories: string[] = []

afterEach(async () => {
  for (const fiber of fibers.splice(0).reverse()) await fiber.dispose()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  for (const directory of temporaryDirectories.splice(0)) await rm(directory, { recursive: true, force: true })
})

async function disposeFiber(fiber: { dispose(): Promise<void> }): Promise<void> {
  const index = fibers.indexOf(fiber)
  if (index !== -1) fibers.splice(index, 1)
  await fiber.dispose()
}

describe('official Host plugin activation', () => {
  it('registers strict Browser settings Remotes and releases web routes with the plugin fiber', async () => {
    const context = new Context()
    let browserExecutablePath = process.execPath
    const unregisterRoute = vi.fn()
    const registerRoute = vi.fn(() => unregisterRoute)
    const sourceAddress = vi.fn(() => ({ url: 'https://catalog.example.com', port: 443 }))
    const core = {
      services: {
        catalog: {
          search: vi.fn(async () => ({ items: [], totalCount: 0 })),
          details: vi.fn(async () => ({ kind: 'work', id: 'work-1', fields: [] })),
          baseModels: vi.fn(async () => ({ items: [] })),
        },
        runtime: { queryRuns: vi.fn(() => []), queryMedia: vi.fn(() => []) },
        profile: {
          client: { runRefreshIntervalMs: 500 },
          comfyui: { frontendCompiler: { get browserExecutablePath() { return browserExecutablePath } } },
        },
        sourceAddress,
      },
    }
    context.provide('harnessComfyuiCore' as never, core as never)
    context.provide('webServer' as never, { register: registerRoute } as never)
    context.provide('workspaceRegistry', { resolveByPath: vi.fn(async () => undefined) })
    context.provide('sessionPersistence' as never, { stat: vi.fn(async () => undefined) } as never)
    context.provide('credentials' as never, createTestCredentialProvider() as never)
    context.provide('settings' as never, {
      describe: vi.fn(() => []),
      replace: vi.fn(async () => undefined),
    } as never)
    context.provide('attachments' as never, {
      imageLimits: {
        maxImageBytes: 1_000_000,
        maxImagesPerMessage: 1,
        maxMessageImageBytes: 1_000_000,
        maxImagePixels: 1_000_000,
        maxImageDimension: 4096,
        mediaTypes: ['image/png'],
      },
      saveImage: vi.fn(),
    } as never)
    context.provide('llm' as never, {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(async () => []),
      prepareCall: vi.fn(),
    } as never)
    context.provide('tools' as never, { register: vi.fn(() => vi.fn()) } as never)

    const imageReaderFiber = await context.plugin(imageReaderPlugin)
    fibers.push(imageReaderFiber)

    const fiber = await context.plugin(web)
    fibers.push(fiber)

    const browserSettings = context.reflect.get(BROWSER_SETTINGS_REMOTE_NAMESPACE) as unknown as {
      configuration(signal: AbortSignal): Promise<{ browserExecutablePath: string }>
      validate(request: { browserExecutablePath: string }, signal: AbortSignal): Promise<unknown>
    }
    expect(remoteMethods(browserSettings)).toEqual([
      { method: 'configuration', invocation: { kind: 'direct' } },
      { method: 'validate', invocation: { kind: 'direct' } },
    ])
    expect(registerRoute).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'prefix',
      path: GENERATION_MEDIA_ROUTE_PREFIX,
    }))
    expect(HARNESS_COMFYUI_REMOTE.descriptors).toContain(BROWSER_SETTINGS_REMOTE.descriptors[0])
    const imageReaderRemote = context.reflect.get('harnessComfyuiImageReader') as {
      configuration(signal: AbortSignal): Promise<{ activeProfileId: string; profiles: readonly { id: string }[] }>
    }
    await expect(imageReaderRemote.configuration(new AbortController().signal)).resolves.toMatchObject({
      activeProfileId: 'default',
      profiles: [{ id: 'default' }],
    })

    const signal = new AbortController().signal
    await expect(browserSettings.configuration(signal)).resolves.toEqual({ browserExecutablePath: process.execPath })
    browserExecutablePath = '/profile/other-browser'
    await expect(browserSettings.configuration(signal)).resolves.toEqual({ browserExecutablePath })
    await expect(browserSettings.validate({ browserExecutablePath: process.execPath }, signal))
      .resolves.toEqual({ ok: true, value: { browserExecutablePath: process.execPath } })
    await expect(browserSettings.validate({ browserExecutablePath: '/missing-browser-for-settings' }, signal))
      .resolves.toMatchObject({
        ok: false,
        error: { code: 'BROWSER_EXECUTABLE_PATH_UNAVAILABLE', path: '/missing-browser-for-settings' },
      })
    await expect(browserSettings.configuration(AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' })
    await expect(browserSettings.validate({ browserExecutablePath: process.execPath }, AbortSignal.abort()))
      .rejects.toMatchObject({ name: 'AbortError' })

    const [configuration, validation] = BROWSER_SETTINGS_REMOTE.descriptors
    const wirePath = { browserExecutablePath: process.execPath }
    expect(configuration!.result.create().parse(JSON.parse(JSON.stringify(wirePath)))).toEqual(wirePath)
    const requestCodec = validation!.parameters[0]!.codec
    expect(requestCodec.create().parse(JSON.parse(JSON.stringify(wirePath)))).toEqual(wirePath)
    expect(() => requestCodec.create().parse({ ...wirePath, unexpected: true })).toThrow()
    expect(validation!.result.create().parse({ ok: true, value: wirePath })).toEqual({ ok: true, value: wirePath })
    const unavailable = await browserSettings.validate({ browserExecutablePath: '/missing-browser-for-settings' }, signal)
    expect(validation!.result.create().parse(JSON.parse(JSON.stringify(unavailable)))).toEqual(unavailable)
    expect(() => validation!.result.create().parse({
      ok: false,
      error: { code: 'BROWSER_EXECUTABLE_PATH_UNAVAILABLE', path: process.execPath, reason: '  ' },
    })).toThrow()

    await disposeFiber(fiber)
    expect(unregisterRoute).toHaveBeenCalledOnce()
    expect(context.reflect.get('harnessComfyuiBrowserSettings')).toBeUndefined()
    await disposeFiber(imageReaderFiber)
  })

  it('binds the foreground shell capability to the CLI listener and revokes it on result and shutdown', async () => {
    const context = new Context()
    const queryComfyuiInstances = vi.fn(async () => ({ items: [{ id: 'instance-1' }], totalCount: 1 }))
    const sourceAddress = vi.fn(() => ({ url: 'http://127.0.0.1', port: 18093 }))
    const core = {
      services: {
        profile: {
          cliServer: { host: '127.0.0.1', port: 0, shutdownTimeoutMs: 1_000 },
          paths: {},
        },
        catalog: { queryComfyuiInstances },
        runtime: {},
        sourceAddress,
        semanticQueryClientPath: '/plugin/source-query.mjs',
      },
    }
    const unregisterEnvironment = vi.fn()
    let contributor: { resolve(execution: ToolExecution): Readonly<Record<string, string>> } | undefined
    const registerEnvironment = vi.fn((value: { resolve(execution: ToolExecution): Readonly<Record<string, string>> }) => {
      contributor = value
      return unregisterEnvironment
    })
    context.provide('harnessComfyuiCore' as never, core as never)
    context.provide('imageReader' as never, { inspect: vi.fn() } as never)
    context.provide('shellEnv' as never, { register: registerEnvironment } as never)
    context.provide('tools' as never, { register: vi.fn() } as never)
    context.provide('workspaceRegistry', { resolveByPath: vi.fn(async () => undefined) })

    const fiber = await context.plugin(cli)
    fibers.push(fiber)

    const execution = {
      callId: 'call_shell_1',
      name: 'bash',
      arguments: {},
      token: Symbol('shell-execution'),
      signal: new AbortController().signal,
      agent: {
        session: {
          id: 'session-1',
          header: { cwd: '/workspace/project' },
          snapshotEvents: () => [{
            type: 'tool/call',
            data: { callId: 'call_shell_1', name: 'bash', turn: 7 },
          }],
        },
      },
    } as unknown as ToolExecution
    if (contributor === undefined) throw new Error('The CLI plugin did not register its shell environment contributor.')
    const variables = contributor.resolve(execution)
    const capability = variables[CLI_ENVIRONMENT_NAMES.capability]!
    expect(contributor.resolve(execution)[CLI_ENVIRONMENT_NAMES.capability]).toBe(capability)
    expect(variables[CLI_ENVIRONMENT_NAMES.sourceUrl]).toBe('http://127.0.0.1')
    expect(variables[CLI_ENVIRONMENT_NAMES.sourcePort]).toBe('18093')
    expect(variables[CLI_ENVIRONMENT_NAMES.api]).toContain(CLI_ROUTE_PATH)

    const origin = context.harnessComfyuiCli.origin
    const request = () => fetch(`${origin}${CLI_ROUTE_PATH}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${capability}`, 'content-type': 'application/json' },
      body: JSON.stringify({ command: 'catalog.instance.list' }),
    })
    const success = await request()
    expect(success.status).toBe(200)
    expect(await success.json()).toEqual({ ok: true, data: { items: [{ id: 'instance-1' }], totalCount: 1 } })
    expect(queryComfyuiInstances).toHaveBeenCalledOnce()

    context.emit('tools/result', execution, { status: 'success', value: null } as never)
    const revoked = await request()
    expect(revoked.status).toBe(401)
    expect(await revoked.json()).toMatchObject({ ok: false, error: { code: 'CLI_CAPABILITY_INVALID' } })

    await disposeFiber(fiber)
    expect(unregisterEnvironment).toHaveBeenCalledOnce()
    await expect(fetch(`${origin}${CLI_ROUTE_PATH}`)).rejects.toThrow()
  })

  it('uses configured Core source and Browser paths during accepted generations', async () => {
    vi.stubEnv('HARNESS_COMFYUI_FRONTEND_BROWSER_EXECUTABLE_PATH', undefined)
    const directory = await mkdtemp(join(tmpdir(), 'official-core-plugin-'))
    temporaryDirectories.push(directory)
    const sourceAddressesUsed: Array<{ url: string; port: number }> = []
    const browserPathsUsed: string[] = []
    const workflow = {
      version: 0.4,
      nodes: [{
        id: 1,
        type: 'SaveImage',
        mode: 0,
        inputs: [{ name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } }],
        outputs: [],
        widgets_values: ['controlled-output'],
      }],
      links: [],
    }

    vi.doMock('../../src/host/generation/source-cli.ts', () => ({
      GenerationSourceCli: class {
        constructor(private readonly options: { settings: { get(): { url: string; port: number } } }) {}

        async readInstance(instanceId: string) {
          sourceAddressesUsed.push(this.options.settings.get())
          return {
            id: instanceId,
            title: 'Controlled ComfyUI',
            url: 'http://127.0.0.1:8188',
            credentialType: 'none' as const,
            authorization: null,
          }
        }

        async readTemplate(templateId: string) {
          return { id: templateId, title: `Controlled ${templateId}`, workflow }
        }
      },
    }))
    vi.doMock('../../src/host/generation/comfy-frontend-worker-client.ts', () => ({
      NodeWorkerComfyFrontend: class {
        constructor(private readonly options: { readonly browserExecutablePath: string }) {}

        async exportWorkflow(input: { workflow: typeof workflow }) {
          browserPathsUsed.push(this.options.browserExecutablePath)
          const node = input.workflow.nodes[0]!
          const filenamePrefix = (node.widgets_values as readonly string[])[0]!
          return { '1': { class_type: 'SaveImage', inputs: { filename_prefix: filenamePrefix } } }
        }
      },
    }))

    const fetchDefinitions = vi.fn(async () => new Response(JSON.stringify({
      SaveImage: {
        input: { required: { filename_prefix: ['STRING', {}] } },
        input_order: { required: ['filename_prefix'], optional: [] },
        output_node: true,
      },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchDefinitions)

    try {
      const core = await import('../../src/host/core/plugin.ts')
      const activateCore = async (label: string, configuration: { url: string; port: number }, browserExecutablePath?: string) => {
        const context = new Context()
        context.provide('tools' as never, { register: vi.fn(() => vi.fn()) } as never)
        context.provide('workspaceRegistry', { resolveByPath: vi.fn(async () => undefined) })
        context.provide('dshHomePath' as never, ((...segments: string[]) => join(directory, 'home', ...segments)) as never)
        const fiber = await context.plugin(core, {
          configurationProfile: 'production',
          dataDirectory: join(directory, `plugin-data-${label}`),
          configuration,
          ...(browserExecutablePath === undefined ? {} : { browserExecutablePath }),
        } as never)
        fibers.push(fiber)
        return { context, fiber, services: context.harnessComfyuiCore.services }
      }
      const accept = (services: CoreServices, templateId: string, callId: string) => services.runtime.acceptGeneration({
        workspaceId: 'workspace_1',
        sessionId: 'session_1',
        turn: 1,
        callId,
      }, {
        title: `Generation from ${templateId}`,
        instanceId: null,
        templateId,
        model: null,
        parameters: {},
        loras: [],
      })

      const defaultCore = await activateCore('default', { url: 'https://catalog.example.com', port: 18093 })
      expect(defaultCore.services.profile.comfyui.frontendCompiler.browserExecutablePath)
        .toBe('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
      expect(defaultCore.services.sourceAddress()).toEqual({ url: 'https://catalog.example.com', port: 18093 })
      const first = await accept(defaultCore.services, 'template-1', 'call-generation-1')
      expect(browserPathsUsed).toEqual(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'])
      await disposeFiber(defaultCore.fiber)
      expect(defaultCore.context.reflect.get('harnessComfyuiCore')).toBeUndefined()

      const overriddenCore = await activateCore('override', { url: 'http://source.internal', port: 19094 }, process.execPath)
      expect(overriddenCore.services.profile.comfyui.frontendCompiler.browserExecutablePath).toBe(process.execPath)
      expect(overriddenCore.services.sourceAddress()).toEqual({ url: 'http://source.internal', port: 19094 })
      const second = await accept(overriddenCore.services, 'template-2', 'call-generation-2')
      expect(browserPathsUsed).toEqual([
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        process.execPath,
      ])
      expect(sourceAddressesUsed).toEqual([
        { url: 'https://catalog.example.com', port: 18093 },
        { url: 'http://source.internal', port: 19094 },
      ])
      expect(second.runId).not.toBe(first.runId)
      expect(fetchDefinitions).toHaveBeenCalledTimes(2)
      await disposeFiber(overriddenCore.fiber)
      expect(overriddenCore.context.reflect.get('harnessComfyuiCore')).toBeUndefined()
    } finally {
      vi.doUnmock('../../src/host/generation/source-cli.ts')
      vi.doUnmock('../../src/host/generation/comfy-frontend-worker-client.ts')
    }
  })
})

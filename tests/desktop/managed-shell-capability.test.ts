import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'

import runtimeArtifacts from '../../config/runtime-artifacts.json' with { type: 'json' }
import { materializeSourceCliModule } from '../../scripts/production/cli-module.mjs'
import { materializeSourceHostModule } from '../../scripts/production/host-module.mjs'
// @ts-expect-error The desktop worktree launcher is implemented as a Node.js ESM script.
import { loadDesktopWorktreeContext } from '../../scripts/desktop/worktree.mjs'

const temporaryDirectories: string[] = []

afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function provideProjectHostDependencies(ctx: Context): void {
  ctx.provide('workspaceRegistry', {
    create: vi.fn(async () => ({ id: 'workspace_1', sessionIds: [] })),
    resolveByPath: vi.fn(async () => ({ id: 'workspace_1', sessionIds: ['session_1'] })),
  })
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
  ctx.provide('settings' as never, {
    register: vi.fn(() => ({
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
    })),
    describe: vi.fn(() => []),
  } as never)
}

describe('DSH Desktop managed shell capability', () => {
  it('passes the project CLI capability through the real DSH bash execution path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-managed-shell-'))
    temporaryDirectories.push(root)
    const context = await loadDesktopWorktreeContext({ desktopSourceRoot: process.cwd() })
    const fromDesktop = async (name: string) => import(pathToFileURL(
      resolve(context.desktopSource, 'node_modules', name, 'lib/index.js'),
    ).href)
    const [webServer, systemPrompt, tools, shellEnv, subprocess, bash, toolBash] = await Promise.all([
      fromDesktop('@deepseek-ai/dsh-host-webserver'),
      fromDesktop('@deepseek-ai/dsh-system-prompt'),
      fromDesktop('@deepseek-ai/dsh-tools'),
      fromDesktop('@deepseek-ai/dsh-shell-env'),
      fromDesktop('@deepseek-ai/dsh-subprocess-local'),
      fromDesktop('@deepseek-ai/dsh-bash-local'),
      fromDesktop('@deepseek-ai/dsh-tool-bash'),
    ])

    vi.stubEnv('HARNESS_COMFYUI_DATA_DIR', resolve(root, 'data'))
    vi.stubEnv('HARNESS_COMFYUI_API_WORKFLOW_CACHE_DIRECTORY', resolve(root, 'data/api-workflow-cache'))
    vi.stubEnv('HARNESS_COMFYUI_RUN_REPOSITORY_FILE', resolve(root, 'data/runs.sqlite'))
    vi.stubEnv('HARNESS_COMFYUI_RUN_DIRECTORY', resolve(root, 'runs'))
    vi.stubEnv('HARNESS_COMFYUI_SAVED_MEDIA_DIRECTORY', resolve(root, 'media'))
    vi.stubEnv('HARNESS_COMFYUI_LOG_DIRECTORY', resolve(root, 'logs'))
    vi.stubEnv('HARNESS_COMFYUI_CATALOG_CLI_PATH', 'node')
    vi.stubEnv('HARNESS_COMFYUI_CATALOG_PORT', '18093')
    vi.stubEnv('HARNESS_COMFYUI_SOURCE_CLI_PATH', 'node')

    await materializeSourceCliModule(process.cwd())
    const hostModule = await materializeSourceHostModule(process.cwd())
    const projectPlugin = await import(`${pathToFileURL(hostModule).href}?test=${crypto.randomUUID()}`)
    const ctx = new Context()
    provideProjectHostDependencies(ctx)
    const fibers = []
    try {
      fibers.push(await ctx.plugin(webServer.default, { host: '127.0.0.1', port: 0 }))
      fibers.push(await ctx.plugin(systemPrompt.default, {}))
      fibers.push(await ctx.plugin(tools.default, { mode: 'native' }))
      fibers.push(await ctx.plugin(shellEnv, { dshHome: resolve(root, 'dsh-home') }))
      fibers.push(await ctx.plugin(subprocess.default, {}))
      fibers.push(await ctx.plugin(bash.default, {}))
      fibers.push(await ctx.plugin(toolBash, { enableRunInBackground: true }))
      fibers.push(await ctx.plugin(projectPlugin, { configurationProfile: 'production' }))

      const callId = 'call_managed_shell_1'
      const result = await (ctx as Context & { tools: { execute(input: unknown): Promise<unknown> } }).tools.execute({
        callId,
        name: 'bash',
        arguments: {
          command: `printf "%s\\n%s\\n%s\\n" "$DSH_HARNESS_COMFYUI_CLI" "$DSH_HARNESS_COMFYUI_CLI_API" "$DSH_HARNESS_COMFYUI_CLI_CAPABILITY"; printf '%s' '{"run_ids":["run_missing"]}' | node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin`,
          description: 'Call the managed project CLI through the current Host route',
        },
        signal: new AbortController().signal,
        agent: {
          session: {
            id: 'session_1',
            header: { cwd: process.cwd() },
            events: [{ type: 'tool/call', data: { callId, name: 'bash', turn: 1 } }],
          },
        },
      }) as { isError: boolean; value?: { stdout?: { text?: string } } }

      expect(result.isError).toBe(false)
      const [cliPath, apiUrl, capability, responseText] = result.value?.stdout?.text?.trim().split('\n') ?? []
      expect(cliPath).toBe(resolve(process.cwd(), runtimeArtifacts.managedCli.outputEntryRelativePath))
      const activeWebServer = (ctx as Context & { webServer: { host: string; port: number } }).webServer
      expect(apiUrl).toBe(`http://${activeWebServer.host}:${activeWebServer.port}/api/harness-comfyui/cli/v1`)
      expect(activeWebServer.port).not.toBe(4173)
      expect(capability).toMatch(/^[A-Za-z0-9_-]{43}$/u)
      expect(JSON.parse(responseText!)).toEqual({
        runs: [{
          run_id: 'run_missing',
          lookup_status: 'error',
          error: expect.objectContaining({ code: 'GENERATION_RUN_NOT_FOUND' }),
        }],
      })
    } finally {
      for (const fiber of fibers.reverse()) await fiber.dispose()
      await ctx.fiber.dispose()
    }
  })
})

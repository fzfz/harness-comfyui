import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { materializeSourceHostModule } from '../../scripts/production/host-module.mjs'
// @ts-expect-error The desktop worktree launcher is implemented as a Node.js ESM script.
import { loadDesktopWorktreeContext } from '../../scripts/desktop/worktree.mjs'

const temporaryDirectories: string[] = []

afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function provideProjectHostDependencies(ctx: Context): void {
  ctx.provide('webServer', { register: vi.fn(() => vi.fn()) })
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
    const context = await loadDesktopWorktreeContext()
    const fromDesktop = async (name: string) => import(pathToFileURL(
      resolve(context.desktopSource, 'node_modules', name, 'lib/index.js'),
    ).href)
    const [systemPrompt, tools, shellEnv, subprocess, bash, toolBash] = await Promise.all([
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

    const hostModule = await materializeSourceHostModule(process.cwd())
    const projectPlugin = await import(`${pathToFileURL(hostModule).href}?test=${crypto.randomUUID()}`)
    const ctx = new Context()
    provideProjectHostDependencies(ctx)
    const fibers = []
    try {
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
          command: 'printf "%s\\n%s\\n%s" "$DSH_HARNESS_COMFYUI_CLI" "$DSH_HARNESS_COMFYUI_CLI_API" "$DSH_HARNESS_COMFYUI_CLI_CAPABILITY"',
          description: 'Read managed project CLI environment',
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
      const [cliPath, apiUrl, capability] = result.value?.stdout?.text?.split('\n') ?? []
      expect(cliPath).toBe(resolve(process.cwd(), 'scripts/cli/harness-comfyui.mjs'))
      expect(apiUrl).toBe('http://127.0.0.1:4173/api/harness-comfyui/cli/v1')
      expect(capability).toMatch(/^[A-Za-z0-9_-]{43}$/u)
    } finally {
      for (const fiber of fibers.reverse()) await fiber.dispose()
      await ctx.fiber.dispose()
    }
  })
})

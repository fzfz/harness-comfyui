import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as harnessComfyui from '../../src/index.ts'

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
  const createWorkspace = vi.fn(async () => ({ id: 'workspace_1', sessionIds: [] }))
  ctx.provide('tools', { register: registerTool })
  ctx.provide('webServer', { register: registerRoute })
  ctx.provide('workspaceRegistry', {
    create: createWorkspace,
    resolveByPath: vi.fn(async () => ({ id: 'workspace_1', sessionIds: ['session_1'] })),
  })
  return { createWorkspace, registerRoute, registerTool }
}

describe('Harness ComfyUI Host plugin', () => {
  it('exports the Loader plugin shape and Standard Schema configuration', () => {
    expect(harnessComfyui.name).toBe('harness-comfyui')
    expect(harnessComfyui.inject).toEqual(['tools', 'webServer', 'workspaceRegistry'])
    expect(typeof harnessComfyui.apply).toBe('function')
    expect(typeof harnessComfyui.Config?.['~standard'].validate).toBe('function')
  })

  it('loads a valid Configuration Profile from source', async () => {
    stubTestProfileEnvironment()
    const ctx = new Context()
    const { createWorkspace, registerRoute, registerTool } = provideHostServices(ctx)
    const fiber = await ctx.plugin(harnessComfyui, { configurationProfile: 'production' })

    expect(createWorkspace).not.toHaveBeenCalled()
    expect(registerTool.mock.calls.map(([definition]) => definition.name)).toEqual([
      'query_semantic_comfyui_templates',
      'query_semantic_loras',
      'query_semantic_generation_models',
      'query_semantic_comfyui_instances',
      'generate_with_comfyui',
    ])
    expect(registerRoute).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'prefix',
      path: '/api/harness-comfyui/media',
    }))
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

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { afterEach, describe, expect, it, vi } from 'vitest'

import packageManifest from '../../package.json' with { type: 'json' }
import type { PluginStatus } from '../../src/contract/plugin-status.ts'
import * as harnessComfyui from '../../src/index.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function stubTestProfileEnvironment(): void {
  const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-plugin-status-'))
  temporaryDirectories.push(root)
  const values: Record<string, string> = {
    HARNESS_COMFYUI_DATA_DIR: join(root, 'data'),
    HARNESS_COMFYUI_RUN_REPOSITORY_FILE: join(root, 'runs.sqlite'),
    HARNESS_COMFYUI_RUN_DIRECTORY: join(root, 'runs'),
    HARNESS_COMFYUI_SAVED_MEDIA_DIRECTORY: join(root, 'media'),
    HARNESS_COMFYUI_LOG_DIRECTORY: join(root, 'logs'),
    HARNESS_COMFYUI_CATALOG_CLI_PATH: 'node',
    HARNESS_COMFYUI_SOURCE_CLI_PATH: 'node',
  }
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value)
  vi.stubEnv('HARNESS_COMFYUI_CONFIGURATION_PROFILE', 'test')
}

function pluginConfigFromEnvironment(): unknown {
  return { configurationProfile: process.env.HARNESS_COMFYUI_CONFIGURATION_PROFILE }
}

describe('Harness ComfyUI Host plugin status', () => {
  it('exports the Loader plugin shape and typed Standard Schema configuration', () => {
    expect(harnessComfyui.name).toBe('harness-comfyui')
    expect(harnessComfyui.inject).toEqual([])
    expect(typeof harnessComfyui.apply).toBe('function')
    expect(harnessComfyui.Config).toBeDefined()
    expect(typeof harnessComfyui.Config?.['~standard'].validate).toBe('function')
  })

  it('loads the real Host plugin in a test Configuration Profile and exposes only PluginStatus', async () => {
    stubTestProfileEnvironment()
    const ctx = new Context()
    const fiber = await ctx.plugin(harnessComfyui, pluginConfigFromEnvironment() as never)

    try {
      const status = (ctx as unknown as { pluginStatus: { get(): PluginStatus } }).pluginStatus
      expect(remoteMethods(status)).toEqual([
        { method: 'get', invocation: { kind: 'direct' } },
      ])
      expect(status.get()).toEqual({
        packageName: 'harness-comfyui',
        packageVersion: packageManifest.version,
        configurationProfile: 'test',
        hostLoaded: true,
      })
      expect(Object.keys(status.get()).sort()).toEqual([
        'configurationProfile',
        'hostLoaded',
        'packageName',
        'packageVersion',
      ])
    } finally {
      await fiber.dispose()
      await ctx.fiber.dispose()
    }
  })

  it('reports the managed runtime version supplied by the process manager', async () => {
    stubTestProfileEnvironment()
    vi.stubEnv('HARNESS_COMFYUI_PACKAGE_VERSION', '0.1.17-source-test')
    const ctx = new Context()
    const fiber = await ctx.plugin(harnessComfyui, pluginConfigFromEnvironment() as never)

    try {
      const status = (ctx as unknown as { pluginStatus: { get(): PluginStatus } }).pluginStatus
      expect(status.get().packageVersion).toBe('0.1.17-source-test')
    } finally {
      await fiber.dispose()
      await ctx.fiber.dispose()
    }
  })

  it('rejects a missing Configuration Profile before registering pluginStatus', async () => {
    const ctx = new Context()

    await expect(ctx.plugin(harnessComfyui, pluginConfigFromEnvironment() as never)).rejects.toThrow()
    expect((ctx as unknown as { pluginStatus?: unknown }).pluginStatus).toBeUndefined()
    await ctx.fiber.dispose()
  })

  it('rejects an invalid Configuration Profile before registering pluginStatus', async () => {
    vi.stubEnv('HARNESS_COMFYUI_CONFIGURATION_PROFILE', 'invalid')
    const ctx = new Context()

    await expect(ctx.plugin(harnessComfyui, pluginConfigFromEnvironment() as never)).rejects.toThrow()
    expect((ctx as unknown as { pluginStatus?: unknown }).pluginStatus).toBeUndefined()
    await ctx.fiber.dispose()
  })
})

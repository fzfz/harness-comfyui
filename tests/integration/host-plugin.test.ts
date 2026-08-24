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

describe('Harness ComfyUI Host plugin', () => {
  it('exports the Loader plugin shape and Standard Schema configuration', () => {
    expect(harnessComfyui.name).toBe('harness-comfyui')
    expect(harnessComfyui.inject).toEqual([])
    expect(typeof harnessComfyui.apply).toBe('function')
    expect(typeof harnessComfyui.Config?.['~standard'].validate).toBe('function')
  })

  it('loads a valid Configuration Profile from source', async () => {
    stubTestProfileEnvironment()
    const ctx = new Context()
    const fiber = await ctx.plugin(harnessComfyui, { configurationProfile: 'production' })

    expect((ctx as unknown as { pluginStatus?: unknown }).pluginStatus).toBeUndefined()
    await fiber.dispose()
    await ctx.fiber.dispose()
  })

  it.each([
    [undefined, 'missing profile'],
    ['invalid', 'unknown profile'],
  ])('rejects %s before Host startup completes', async (configurationProfile, _caseName) => {
    stubTestProfileEnvironment()
    const ctx = new Context()

    await expect(ctx.plugin(harnessComfyui, { configurationProfile } as never)).rejects.toThrow()
    await ctx.fiber.dispose()
  })
})

import type { Context } from '@deepseek-ai/cordis'
import * as core from '../../src/host/core/plugin.ts'
import * as imageReader from '../../src/host/image-reader/plugin.ts'
import * as cli from '../../src/host/cli/plugin.ts'
import * as web from '../../src/host/web/plugin.ts'

export const name = 'harness-comfyui'
export const inject = ['tools', 'webServer', 'workspaceRegistry', 'shellEnv', 'attachments', 'llm', 'settings']
export const Config = core.Config
export async function apply(ctx: Context, config: core.Config & imageReader.Config) {
  await ctx.plugin(core, config)
  await ctx.plugin(imageReader, config)
  await ctx.plugin(cli)
  await ctx.plugin(web)
}
export async function packagedProduct(path: string) {
  const { pathToFileURL } = await import('node:url')
  const { dirname, join } = await import('node:path')
  const modules = await Promise.all(['core', 'image-reader', 'cli', 'web'].map(name => import(pathToFileURL(join(dirname(path), `${name}.js`)).href)))
  return {
    name, inject, Config, async apply(ctx: Context, config: core.Config & imageReader.Config) {
      for (const module of modules) await ctx.plugin(module, config)
    }
  }
}

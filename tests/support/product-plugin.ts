import type { Context } from '@deepseek-ai/cordis'
import * as core from '../../src/host/core/plugin.ts'
import * as imageReader from '../../src/host/image-reader/plugin.ts'
import * as cli from '../../src/host/cli/plugin.ts'
import * as web from '../../src/host/web/plugin.ts'

export const name = 'harness-comfyui'
export const inject = ['tools', 'webServer', 'workspaceRegistry', 'shellEnv', 'attachments', 'llm', 'settings', 'credentials', 'sessionPersistence']
export const Config = core.Config
type ProductConfigInput = NonNullable<Parameters<typeof core.Config>[0]> & NonNullable<Parameters<typeof imageReader.Config>[0]>
function childConfig(config: ProductConfigInput) {
  const unwrap = (value: unknown) => value && typeof value === 'object' && 'get' in value && typeof value.get === 'function'
    ? value.get() : value
  return {
    ...config,
    browserExecutablePath: unwrap(config.browserExecutablePath),
    configuration: unwrap(config.configuration),
    credentialRefs: unwrap(config.credentialRefs),
  }
}
export async function apply(ctx: Context, config: ProductConfigInput) {
  const input = childConfig(config)
  await ctx.plugin(core, input)
  await ctx.plugin(imageReader, input)
  await ctx.plugin(cli)
  await ctx.plugin(web)
}
export async function packagedProduct(path: string) {
  const { pathToFileURL } = await import('node:url')
  const { dirname, join } = await import('node:path')
  const modules = await Promise.all(['core', 'image-reader', 'cli', 'web'].map(name => import(pathToFileURL(join(dirname(path), `${name}.js`)).href)))
  return {
    name, inject, Config, async apply(ctx: Context, config: ProductConfigInput) {
      const input = childConfig(config)
      for (const module of modules) await ctx.plugin(module, input)
    }
  }
}

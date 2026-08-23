import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '../..')

const frozenEntries = [
  'lib/agent.js',
  'deployment/runtime/package.json',
  'deployment/runtime/pnpm-lock.yaml',
  'deployment/runtime/pnpm-workspace.yaml',
  'config/base.json',
  'config/environment-overrides.json',
  'config/profiles/production.json',
  'config/product-agent.json',
  'agent-presets/harness-comfyui/preset.yml',
  'agent-presets/harness-comfyui/agent.cordis.yml',
] as const

/** Populate a synthetic package with the same runtime/config evidence preflight requires. */
export async function writeFrozenRuntimeAndConfiguration(packageRoot: string): Promise<void> {
  await Promise.all(frozenEntries.map(async relativePath => {
    await mkdir(join(packageRoot, dirname(relativePath)), { recursive: true })
    await writeFile(
      join(packageRoot, relativePath),
      await readFile(join(repositoryRoot, relativePath), 'utf8'),
      'utf8',
    )
  }))
}

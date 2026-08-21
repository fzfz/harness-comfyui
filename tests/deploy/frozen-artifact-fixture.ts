import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '../..')

const frozenEntries = [
  'deployment/runtime/package.json',
  'deployment/runtime/pnpm-lock.yaml',
  'deployment/runtime/pnpm-workspace.yaml',
  'config/base.json',
  'config/environment-overrides.json',
  'config/profiles/production.json',
] as const

/** Populate a synthetic package with the same runtime/config evidence preflight requires. */
export async function writeFrozenRuntimeAndConfiguration(packageRoot: string): Promise<void> {
  await mkdir(join(packageRoot, 'deployment/runtime'), { recursive: true })
  await mkdir(join(packageRoot, 'config/profiles'), { recursive: true })
  await Promise.all(frozenEntries.map(async relativePath => {
    await writeFile(
      join(packageRoot, relativePath),
      await readFile(join(repositoryRoot, relativePath), 'utf8'),
      'utf8',
    )
  }))
}

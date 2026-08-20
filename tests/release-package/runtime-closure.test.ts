import { spawnSync } from 'node:child_process'
import { builtinModules } from 'node:module'
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const temporaryDirectories: string[] = []

function packageName(specifier: string): string {
  return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]!
}

async function javascriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.map(async entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return javascriptFiles(path)
    return entry.isFile() && entry.name.endsWith('.js') ? [path] : []
  }))).flat()
}

function externalImports(source: string): string[] {
  const specifiers = new Set<string>()
  for (const pattern of [
    /\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gu,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/gu,
  ]) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]!
      if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:') || builtinModules.includes(specifier)) continue
      specifiers.add(packageName(specifier))
    }
  }
  return [...specifiers]
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('packed runtime dependency closure', () => {
  it('installs production dependencies and imports both generated Typert entry points', async () => {
    const artifact = JSON.parse(await readFile(join(repositoryRoot, '.release/quality/artifact.json'), 'utf8')) as {
      tarballPath: string
    }
    const consumerRoot = await mkdtemp(join(tmpdir(), 'harness-comfyui-production-consumer-'))
    temporaryDirectories.push(consumerRoot)
    await writeFile(join(consumerRoot, 'package.json'), `${JSON.stringify({
      name: 'harness-comfyui-production-consumer',
      private: true,
      type: 'module',
      dependencies: {
        'harness-comfyui': `file:${artifact.tarballPath}`,
      },
    }, null, 2)}\n`)

    const install = spawnSync('pnpm', [
      'install',
      '--prod',
      '--ignore-scripts',
      '--config.auto-install-peers=false',
      '--config.link-workspace-packages=false',
      '--offline',
    ], {
      cwd: consumerRoot,
      encoding: 'utf8',
      shell: false,
      timeout: 60000,
    })
    expect({ status: install.status, signal: install.signal, stderr: install.stderr }).toEqual({
      status: 0,
      signal: null,
      stderr: '',
    })

    const imported = spawnSync(process.execPath, [
      '--input-type=module',
      '--eval',
      "const host = await import('harness-comfyui/typert'); const remote = await import('harness-comfyui/remote'); if (host.TYPERT?.face !== 'host' || remote.default?.package !== 'harness-comfyui') process.exit(2)",
    ], {
      cwd: consumerRoot,
      encoding: 'utf8',
      shell: false,
      timeout: 10000,
    })
    expect({ status: imported.status, signal: imported.signal, stderr: imported.stderr }).toEqual({
      status: 0,
      signal: null,
      stderr: '',
    })
    const installedPackageRoot = join(consumerRoot, 'node_modules', 'harness-comfyui')
    const [consumerRealpath, installedPackageRealpath] = await Promise.all([
      realpath(consumerRoot),
      realpath(installedPackageRoot),
    ])
    const installedRelativePath = relative(consumerRealpath, installedPackageRealpath)
    expect(installedRelativePath.startsWith('..') || isAbsolute(installedRelativePath)).toBe(false)
    expect(installedPackageRealpath.startsWith(repositoryRoot)).toBe(false)
    const manifest = JSON.parse(await readFile(join(installedPackageRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ])
    const imports = new Set<string>()
    for (const path of await javascriptFiles(join(installedPackageRoot, 'lib'))) {
      for (const specifier of externalImports(await readFile(path, 'utf8'))) imports.add(specifier)
    }

    expect([...imports].sort()).toContain('zod')
    expect([...imports].filter(specifier => !declared.has(specifier)).sort()).toEqual([])
  }, 70000)
})

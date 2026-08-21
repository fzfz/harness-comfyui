import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { checkRuntimeManifest, syncRuntimeManifest } from '../../scripts/release/sync-runtime-manifest.mjs'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const script = resolve(root, 'scripts/release/sync-runtime-manifest.mjs')
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function createFixture(): Promise<string> {
  const fixture = await mkdtemp(join(tmpdir(), 'harness-comfyui-runtime-manifest-'))
  temporaryDirectories.push(fixture)
  await mkdir(join(fixture, 'deployment', 'runtime'), { recursive: true })
  await copyFile(resolve(root, 'package.json'), join(fixture, 'package.json'))
  await copyFile(resolve(root, 'pnpm-workspace.yaml'), join(fixture, 'pnpm-workspace.yaml'))
  return fixture
}

function runCheck(rootPath: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [script, '--check', '--root', rootPath], {
      cwd: root,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.once('error', reject)
    child.once('close', code => resolveResult({ code, stdout, stderr }))
  })
}

describe('release:sync-runtime-manifest', () => {
  it('generates a deterministic runtime manifest and passes check mode', async () => {
    const fixture = await createFixture()

    await syncRuntimeManifest(fixture)
    await expect(readFile(join(fixture, 'deployment/runtime/pnpm-workspace.yaml'), 'utf8'))
      .resolves.toContain('strictDepBuilds: true')
    await expect(checkRuntimeManifest(fixture)).resolves.toMatchObject({ current: true })
    const result = await runCheck(fixture)

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('runtime manifest is current')
  })

  it('fails check mode when the generated runtime manifest is stale', async () => {
    const fixture = await createFixture()
    await syncRuntimeManifest(fixture)
    const runtimePath = join(fixture, 'deployment/runtime/package.json')
    const runtimeManifest = JSON.parse(await readFile(runtimePath, 'utf8')) as {
      dependencies: Record<string, string>
    }
    runtimeManifest.dependencies['@deepseek-ai/dsh'] = '0.1.0-rc.6'
    await writeFile(runtimePath, `${JSON.stringify(runtimeManifest, null, 2)}\n`)

    await expect(checkRuntimeManifest(fixture)).rejects.toThrow(/runtime manifest|dsh|stale/i)
    const result = await runCheck(fixture)

    expect(result.code).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/runtime manifest|dsh|stale/i)
  })

  it('fails closed when the root packageManager is not an exact pnpm declaration', async () => {
    const fixture = await createFixture()
    const manifestPath = join(fixture, 'package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>
    manifest.packageManager = 'pnpm@latest'
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

    await expect(syncRuntimeManifest(fixture)).rejects.toThrow(/packageManager.*exact/i)
    await expect(readFile(join(fixture, 'deployment/runtime/package.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

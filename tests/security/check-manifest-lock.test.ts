import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const script = resolve(root, 'scripts/security/check-manifest-lock.mjs')
const temporaryDirectories: string[] = []

interface CommandResult {
  readonly code: number | null
  readonly stdout: string
  readonly stderr: string
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

function runScript(args: readonly string[]): Promise<CommandResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
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

async function createFixture(): Promise<string> {
  const fixture = await mkdtemp(join(tmpdir(), 'harness-comfyui-manifest-lock-'))
  temporaryDirectories.push(fixture)
  await mkdir(join(fixture, 'scripts', 'security'), { recursive: true })
  await copyFile(resolve(root, 'package.json'), join(fixture, 'package.json'))
  await copyFile(resolve(root, 'pnpm-lock.yaml'), join(fixture, 'pnpm-lock.yaml'))
  await copyFile(resolve(root, '.npmrc'), join(fixture, '.npmrc'))
  await copyFile(resolve(root, 'pnpm-workspace.yaml'), join(fixture, 'pnpm-workspace.yaml'))
  return fixture
}

describe('check:manifest-lock', () => {
  it('passes the current manifest and lockfile without changing either file', async () => {
    const fixture = await createFixture()
    const manifestBefore = await readFile(join(fixture, 'package.json'))
    const lockfileBefore = await readFile(join(fixture, 'pnpm-lock.yaml'))

    const result = await runScript(['--root', fixture])

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('manifest and lockfile are consistent')
    await expect(readFile(join(fixture, 'package.json'))).resolves.toEqual(manifestBefore)
    await expect(readFile(join(fixture, 'pnpm-lock.yaml'))).resolves.toEqual(lockfileBefore)
  })

  it('fails when a locked dependency specifier drifts in package.json', async () => {
    const fixture = await createFixture()
    const manifestPath = join(fixture, 'package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      dependencies: Record<string, string>
    }
    manifest.dependencies['@deepseek-ai/schemastery'] = '3.18.0'
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

    const result = await runScript(['--root', fixture])

    expect(result.code).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/manifest\/lockfile drift|schemastery/i)
  })
})

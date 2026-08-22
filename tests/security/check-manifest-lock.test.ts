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
  await mkdir(join(fixture, 'deployment', 'runtime'), { recursive: true })
  await copyFile(resolve(root, 'package.json'), join(fixture, 'package.json'))
  await copyFile(resolve(root, 'pnpm-lock.yaml'), join(fixture, 'pnpm-lock.yaml'))
  await copyFile(resolve(root, '.npmrc'), join(fixture, '.npmrc'))
  await copyFile(resolve(root, 'pnpm-workspace.yaml'), join(fixture, 'pnpm-workspace.yaml'))
  await copyFile(resolve(root, 'deployment/runtime/package.json'), join(fixture, 'deployment/runtime/package.json'))
  await copyFile(resolve(root, 'deployment/runtime/pnpm-lock.yaml'), join(fixture, 'deployment/runtime/pnpm-lock.yaml'))
  await copyFile(resolve(root, 'deployment/runtime/pnpm-workspace.yaml'), join(fixture, 'deployment/runtime/pnpm-workspace.yaml'))
  return fixture
}

async function rewriteBothWorkspaces(fixture: string, edit: (workspace: string) => string): Promise<void> {
  for (const relativePath of ['pnpm-workspace.yaml', 'deployment/runtime/pnpm-workspace.yaml']) {
    const workspacePath = join(fixture, relativePath)
    await writeFile(workspacePath, edit(await readFile(workspacePath, 'utf8')))
  }
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

  it('fails closed when the root packageManager is not an exact pnpm declaration', async () => {
    const fixture = await createFixture()
    const manifestPath = join(fixture, 'package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>
    manifest.packageManager = 'npm@11.7.0'
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

    const result = await runScript(['--root', fixture])

    expect(result.code).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/packageManager.*pnpm/i)
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

  it('fails when the runtime manifest drifts even though the root manifest is unchanged', async () => {
    const fixture = await createFixture()
    const manifestPath = join(fixture, 'deployment/runtime/package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      dependencies: Record<string, string>
    }
    manifest.dependencies['@deepseek-ai/dsh'] = '0.1.0-rc.6'
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

    const result = await runScript(['--root', fixture])

    expect(result.code).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/runtime|dsh|version|manifest/i)
  })

  it.each([
    ['is missing', undefined],
    ['has a different exact version', 'pnpm@11.8.0'],
    ['has a non-exact version', 'pnpm@latest'],
  ])('fails when the runtime packageManager %s', async (_label, packageManager) => {
    const fixture = await createFixture()
    const manifestPath = join(fixture, 'deployment/runtime/package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>
    if (packageManager === undefined) delete manifest.packageManager
    else manifest.packageManager = packageManager
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

    const result = await runScript(['--root', fixture])

    expect(result.code).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/runtime.*packageManager|packageManager.*pnpm/i)
  })

  it('fails when a runtime lock resolution drifts while both manifests remain unchanged', async () => {
    const fixture = await createFixture()
    const lockfilePath = join(fixture, 'deployment/runtime/pnpm-lock.yaml')
    const lockfile = await readFile(lockfilePath, 'utf8')
    await writeFile(lockfilePath, lockfile.replace(/'@deepseek-ai\/dsh@0\.1\.0-rc\.8'/u, "'@deepseek-ai/dsh@0.1.0-rc.6'"))

    const result = await runScript(['--root', fixture])

    expect(result.code).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/runtime|lock|dsh|version/i)
  })

  it('fails when root and runtime workspace build policies drift', async () => {
    const fixture = await createFixture()
    const workspacePath = join(fixture, 'deployment/runtime/pnpm-workspace.yaml')
    const workspace = await readFile(workspacePath, 'utf8')
    await writeFile(workspacePath, workspace.replace(/'koffi@3\.1\.5': true/u, "'koffi@3.1.4': true"))

    const result = await runScript(['--root', fixture])

    expect(result.code).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/workspace|allowBuilds|overrides|runtime/i)
  })

  it('fails when root workspace strictDepBuilds is missing', async () => {
    const fixture = await createFixture()
    const workspacePath = join(fixture, 'pnpm-workspace.yaml')
    const workspace = await readFile(workspacePath, 'utf8')
    await writeFile(workspacePath, workspace.replace('strictDepBuilds: true\n\n', ''))

    const result = await runScript(['--root', fixture])

    expect(result.code).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/strictDepBuilds|workspace|missing/i)
  })

  it('fails when root workspace strictDepBuilds is false', async () => {
    const fixture = await createFixture()
    const workspacePath = join(fixture, 'pnpm-workspace.yaml')
    const workspace = await readFile(workspacePath, 'utf8')
    await writeFile(workspacePath, workspace.replace('strictDepBuilds: true', 'strictDepBuilds: false'))

    const result = await runScript(['--root', fixture])

    expect(result.code).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/strictDepBuilds|workspace|true/i)
  })

  it('fails when only runtime workspace strictDepBuilds drifts', async () => {
    const fixture = await createFixture()
    const workspacePath = join(fixture, 'deployment/runtime/pnpm-workspace.yaml')
    const workspace = await readFile(workspacePath, 'utf8')
    await writeFile(workspacePath, workspace.replace('strictDepBuilds: true', 'strictDepBuilds: false'))

    const result = await runScript(['--root', fixture])

    expect(result.code).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/strictDepBuilds|workspace|runtime/i)
  })

  it.each([
    ['both workspaces add an allowBuilds decision', (workspace: string) => workspace.replace(
      'allowBuilds:\n',
      "allowBuilds:\n  'unreviewed-package@1.0.0': true\n",
    ), 'allowBuilds'],
    ['both workspaces add an override', (workspace: string) => workspace.replace(
      'overrides:\n',
      "overrides:\n  'unreviewed-package@1.0.0': '1.0.0'\n",
    ), 'overrides'],
    ['both workspaces replace an override value', (workspace: string) => workspace.replace(
      "  'nanoid@>=3.0.0 <3.3.18': '3.3.18'\n",
      "  'nanoid@>=3.0.0 <3.3.18': '3.3.17'\n",
    ), 'overrides'],
    ['both workspaces delete an override', (workspace: string) => workspace.replace(
      "  'nanoid@>=3.0.0 <3.3.18': '3.3.18'\n",
      '',
    ), 'overrides'],
  ])('fails when %s despite root/runtime equality', async (_label, edit, field) => {
    const fixture = await createFixture()
    await rewriteBothWorkspaces(fixture, edit)

    const result = await runScript(['--root', fixture])

    expect(result.code).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(new RegExp(`runtime contract.*${field}|${field}.*runtime contract`, 'i'))
  })
})

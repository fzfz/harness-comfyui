import { createHash } from 'node:crypto'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { basename, join, resolve } from 'node:path'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { access, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import { terminateChild } from '../../scripts/release/process-lifecycle.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const smokeScript = resolve(repositoryRoot, 'scripts/release/smoke.mjs')
const artifactManifestPath = resolve(repositoryRoot, '.release/quality/artifact.json')

interface ChildResult {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}

function waitForClose(child: ChildProcess, stdout: () => string, stderr: () => string): Promise<ChildResult> {
  return new Promise((resolveResult, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolveResult({ code, signal, stdout: stdout(), stderr: stderr() }))
  })
}

function createDivergentArtifactFixture() {
  const base = JSON.parse(readFileSync(artifactManifestPath, 'utf8')) as {
    tarballPath: string
    filename: string
    version: string
    commit: string
    byteLength: number
    sha256: string
  }
  const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-divergent-artifact-'))
  const extracted = join(root, 'extracted')
  mkdirSync(extracted)
  const unpack = spawnSync('tar', ['-xzf', base.tarballPath, '-C', extracted], { encoding: 'utf8' })
  if (unpack.status !== 0) throw new Error(unpack.stderr)
  const packageManifestPath = join(extracted, 'package/package.json')
  const packageManifest = JSON.parse(readFileSync(packageManifestPath, 'utf8')) as { version: string }
  const appVersion = `${base.version}-app-fixture`
  packageManifest.version = appVersion
  writeFileSync(packageManifestPath, `${JSON.stringify(packageManifest, null, 2)}\n`)
  const tarballPath = join(root, `harness-comfyui-${appVersion}.tgz`)
  const pack = spawnSync('tar', ['-czf', tarballPath, '-C', extracted, 'package'], { encoding: 'utf8' })
  if (pack.status !== 0) throw new Error(pack.stderr)
  const bytes = readFileSync(tarballPath)
  const manifest = {
    ...base,
    filename: basename(tarballPath),
    version: appVersion,
    tarballPath,
    byteLength: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
  const manifestPath = join(root, 'artifact.json')
  writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`)
  return { manifestPath, manifest, root }
}

async function runSmoke(manifestPath = artifactManifestPath): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [smokeScript, '--artifact-manifest', manifestPath], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', chunk => { stdout += String(chunk) })
  child.stderr?.on('data', chunk => { stderr += String(chunk) })
  const close = waitForClose(child, () => stdout, () => stderr)
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      close,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(async () => {
          try {
            await terminateChild(child, {
              processGroup: false,
              gracefulTimeoutMs: 1000,
              forceTimeoutMs: 5000,
            })
            reject(new Error('release-smoke process exceeded 90 seconds'))
          } catch (error) {
            reject(new Error('release-smoke process timeout cleanup failed', { cause: error }))
          }
        }, 90_000)
      }),
    ])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

async function waitForSmokeRoot(before: Set<string>): Promise<string> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const entries = await readdir(tmpdir())
    const created = entries.find(entry => entry.startsWith('harness-comfyui-release-smoke-') && !before.has(entry))
    if (created !== undefined) return resolve(tmpdir(), created)
    await new Promise(resolvePromise => setTimeout(resolvePromise, 25))
  }
  throw new Error('release-smoke did not create an isolated temporary root')
}

async function waitForRemoved(path: string): Promise<boolean> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    try {
      await access(path)
    } catch {
      return true
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 50))
  }
  return false
}

async function runInterruptedSmoke(): Promise<{ result: ChildResult; smokeRoot: string }> {
  const before = new Set(await readdir(tmpdir()))
  const child = spawn(process.execPath, [smokeScript, '--artifact-manifest', artifactManifestPath], {
    cwd: repositoryRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', chunk => { stdout += String(chunk) })
  child.stderr?.on('data', chunk => { stderr += String(chunk) })
  const close = waitForClose(child, () => stdout, () => stderr)
  const smokeRoot = await waitForSmokeRoot(before)
  expect(child.exitCode).toBeNull()
  expect(child.signalCode).toBeNull()
  child.kill('SIGTERM')
  const result = await close
  return { result, smokeRoot }
}

describe('release artifact smoke', () => {
  it('materializes dependencies with a frozen isolated install instead of copying development node_modules', async () => {
    const source = await readFile(smokeScript, 'utf8')
    expect(source).not.toMatch(/cp\(resolve\(repositoryRoot, ['"]node_modules['"]\)/)
    expect(source).toContain("const dependencyDescriptors = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc']")
    expect(source).toContain("runCommand('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts']")
    expect(source).toContain("await rm(join(runtimeRoot, dependencyDescriptor), { force: true })")
  })

  it('runs the exact artifact from an isolated extracted directory', async () => {
    const divergent = createDivergentArtifactFixture()
    try {
      const manifest = divergent.manifest
      const result = await runSmoke(divergent.manifestPath)
      expect(result.code, result.stderr || result.stdout).toBe(0)
      const evidence = JSON.parse(result.stdout.trim()) as {
        artifact: { commit: string; sha256: string; version: string }
        configuration: string
        bootEntries: string[]
        runtimeVersions: { cliDsh: string; dshBase: string; dshWebApp: string; harnessComfyui: string }
        cleanup: { processExited: boolean; portReleased: boolean; directoryRemoved: boolean }
      }
      expect(evidence.artifact).toEqual({
        commit: manifest.commit,
        sha256: manifest.sha256,
        version: manifest.version,
      })
      expect(evidence.configuration).toBe('release-smoke')
      expect(evidence.bootEntries).toContain('@deepseek-ai/dsh-client-ui-layout')
      expect(evidence.bootEntries).toContain('@deepseek-ai/dsh-client-ui-conversation')
      expect(evidence.bootEntries).toContain('harness-comfyui')
      const sourcePackage = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8')) as {
        devDependencies: Record<string, string>
      }
      const expectedRuntimeBundleVersions = {
        cliDsh: sourcePackage.devDependencies['@deepseek-ai/dsh'],
        dshBase: sourcePackage.devDependencies['@deepseek-ai/dsh-base'],
        dshWebApp: sourcePackage.devDependencies['@deepseek-ai/dsh-web-app'],
      }
      expect(manifest.version).not.toBe(expectedRuntimeBundleVersions.cliDsh)
      expect(evidence.runtimeVersions).toEqual({
        ...expectedRuntimeBundleVersions,
        harnessComfyui: manifest.version,
      })
      expect(evidence.cleanup).toEqual({
        processExited: true,
        portReleased: true,
        directoryRemoved: true,
      })
    } finally {
      rmSync(divergent.root, { recursive: true, force: true })
    }
  }, 120000)

  it('cleans the running smoke process and temporary root when interrupted during isolated setup', async () => {
    const { result, smokeRoot } = await runInterruptedSmoke()
    expect(result.signal ?? result.code).toBeTruthy()
    expect(await waitForRemoved(smokeRoot)).toBe(true)
  }, 180000)
})

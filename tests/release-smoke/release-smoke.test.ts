import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

import { afterEach, describe, expect, it } from 'vitest'

import { terminateChild } from '../../scripts/release/process-lifecycle.mjs'
import { createProfileFixture } from '../../src/testing/profile-fixture.ts'

const artifactManifestPath = process.env.HARNESS_COMFYUI_ARTIFACT_MANIFEST_PATH
const fixtures: Array<Awaited<ReturnType<typeof createProfileFixture>>> = []
const runnerRoots = new Set<string>()

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose()))
  await Promise.all([...runnerRoots].map(root => rm(root, { recursive: true, force: true })))
  runnerRoots.clear()
})

interface ChildResult {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}

function waitForClose(child: ChildProcess): Promise<ChildResult> {
  return new Promise((resolveResult, reject) => {
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', chunk => { stdout += String(chunk) })
    child.stderr?.on('data', chunk => { stderr += String(chunk) })
    child.once('error', reject)
    child.once('close', (code, signal) => resolveResult({ code, signal, stdout, stderr }))
  })
}

async function waitForRoles(markerPath: string, roles: string[]): Promise<Record<string, number>> {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    try {
      const rows = (await readFile(markerPath, 'utf8')).trim().split(/\r?\n/u).filter(Boolean)
      const pids = Object.fromEntries(rows.map(row => {
        const [role, pid] = row.split(':')
        return [role, Number(pid)]
      }))
      if (roles.every(role => Number.isSafeInteger(pids[role]))) return pids
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await delay(20)
  }
  throw new Error(`runner process tree did not write ${roles.join(', ')} PIDs`)
}

async function waitForExit(pid: number): Promise<void> {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return
      throw error
    }
    await delay(20)
  }
  throw new Error(`process ${pid} remained after runner interruption`)
}

async function createRunnerProcessTree(root: string): Promise<{ wrapperPath: string; markerPath: string }> {
  const markerPath = join(root, 'process-tree-pids.txt')
  const treePath = join(root, 'process-tree.mjs')
  const smokePath = resolve(dirname(fileURLToPath(import.meta.url)), '../../scripts/release/smoke.mjs')
  const wrapperPath = join(root, 'runner-wrapper.mjs')
  await writeFile(treePath, `
import { appendFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'

const [role, markerPath] = process.argv.slice(2)
const nextRole = { pnpm: 'vitest', vitest: 'stable', stable: 'host' }[role]
await appendFile(markerPath, role + ':' + process.pid + '\\n')
if (nextRole !== undefined) spawn(process.execPath, [process.argv[1], nextRole, markerPath], { stdio: 'ignore' })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {})
setInterval(() => {}, 1000)
`, 'utf8')
  await writeFile(wrapperPath, `
import { runReleaseSmoke } from ${JSON.stringify(smokePath)}

const result = await runReleaseSmoke({
  executable: process.execPath,
  command: [${JSON.stringify(treePath)}, 'pnpm', ${JSON.stringify(markerPath)}],
  cwd: ${JSON.stringify(root)},
})
process.stdout.write(JSON.stringify(result) + '\\n')
`, 'utf8')
  return { wrapperPath, markerPath }
}

describe('release artifact smoke', () => {
  it('runs the shared release-smoke test through one runner without building, packing, or materializing directly', async () => {
    const source = await readFile(new URL('../../scripts/release/smoke.mjs', import.meta.url), 'utf8')
    expect(source).not.toMatch(/(?:pnpm|npm)\s+(?:install|run\s+(?:build|package:pack))/u)
    expect(source).not.toMatch(/(?:materialize\.mjs|start\.mjs|tar\s+-)/u)
    expect(source).toContain("'tests/release-smoke'")
    expect(source).toContain("'--maxWorkers=1'")
    expect(source).toContain("'--no-file-parallelism'")
  })

  it('uses the existing artifact through npm exec and then only the stable lifecycle CLI', async () => {
    const fixture = await createProfileFixture({
      configuration: 'release-smoke',
      ...(artifactManifestPath === undefined ? {} : { artifactManifestPath }),
    })
    fixtures.push(fixture)

    try {
      await fixture.install()
      expect(fixture.configuration).toBe('release-smoke')

      const profileManifest = JSON.parse(await readFile(fixture.profileManifestPath, 'utf8')) as {
        dependencies?: Record<string, string>
      }
      expect(profileManifest.dependencies?.['harness-comfyui']).toBe(`file:${fixture.artifact.tarballPath}`)

      await fixture.start()
      await expect(fixture.status()).resolves.toMatchObject({
        installationId: expect.any(String),
        activeVersion: fixture.artifact.version,
        host: '127.0.0.1',
        port: fixture.port,
        status: 'running',
      })

      const boot = await fixture.readBootGraph()
      expect(boot.entries.map(entry => entry.id)).toEqual(expect.arrayContaining([
        '@deepseek-ai/dsh-client-ui-conversation',
        'harness-comfyui',
      ]))
      expect(boot.entries.map(entry => entry.id)).not.toContain('@deepseek-ai/dsh-client-ui-layout')
      expect(await fixture.readClientModule('harness-comfyui')).toContain('__ModuleLoader__')

      await expect(fixture.health()).resolves.toMatchObject({
        stage: 'health',
        status: 'passed',
      })
      await expect(fixture.logs()).resolves.toEqual(expect.stringContaining('[operations]'))
    } finally {
      await fixture.stop()
      await fixture.dispose()
    }

    expect(fixture.cleanupEvidence.processExit).toBeDefined()
    expect(fixture.cleanupEvidence.processStateRemoved).toBe(true)
    expect(fixture.cleanupEvidence.portReleased).toBe(true)
    expect(fixture.cleanupEvidence.installationRemoved).toBe(true)
    expect(fixture.cleanupEvidence.noChildProcesses).toBe(true)
    expect(fixture.cleanupEvidence.dshHomeRemoved).toBe(true)
  }, 120000)

  it.each(['SIGINT', 'SIGTERM'] as const)('cleans the pnpm/Vitest/stable CLI/Host process tree on %s', async signal => {
    if (process.platform === 'win32') return
    const root = await mkdtemp(join(tmpdir(), 'harness-comfyui-release-runner-'))
    runnerRoots.add(root)
    const { wrapperPath, markerPath } = await createRunnerProcessTree(root)
    const runner = spawn(process.execPath, [wrapperPath], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    try {
      const pids = await waitForRoles(markerPath, ['pnpm', 'vitest', 'stable', 'host'])
      expect(runner.exitCode).toBeNull()
      runner.kill(signal)
      const result = await waitForClose(runner)
      expect(result.stderr).toBe('')
      expect(JSON.parse(result.stdout.trim())).toMatchObject({ signal: 'SIGKILL' })
      await Promise.all(Object.values(pids).map(pid => waitForExit(pid)))
    } finally {
      if (runner.exitCode === null && runner.signalCode === null) {
        await terminateChild(runner, {
          processGroup: false,
          gracefulTimeoutMs: 100,
          forceTimeoutMs: 2000,
        }).catch(() => undefined)
      }
      await Promise.all((await readFile(markerPath, 'utf8').catch(() => '')).split(/\r?\n/u).filter(Boolean).map(row => {
        const pid = Number(row.split(':')[1])
        if (!Number.isSafeInteger(pid)) return undefined
        try {
          process.kill(pid, 'SIGKILL')
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
        }
        return undefined
      }))
    }
  }, 20000)
})

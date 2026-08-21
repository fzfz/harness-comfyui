import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createConnection, createServer, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

import { afterEach, describe, expect, it } from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const temporaryRoots: string[] = []
const runningChildren: ChildProcess[] = []

type ProcessResult = {
  status: number
  stdout: string
  stderr: string
}

function runProcess(command: string, args: string[], env: NodeJS.ProcessEnv, cwd = repositoryRoot): Promise<ProcessResult> {
  return new Promise((resolveResult) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', chunk => { stdout += String(chunk) })
    child.stderr?.on('data', chunk => { stderr += String(chunk) })
    child.on('close', code => resolveResult({ status: code ?? 1, stdout, stderr }))
  })
}

function spawnProcess(command: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess & {
  output: Promise<ProcessResult>
} {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  }) as ChildProcess & { output: Promise<ProcessResult> }
  runningChildren.push(child)
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', chunk => { stdout += String(chunk) })
  child.stderr?.on('data', chunk => { stderr += String(chunk) })
  child.output = new Promise(resolveResult => child.on('close', code => resolveResult({ status: code ?? 1, stdout, stderr })))
  return child
}

async function findFreePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolveListen())
  })
  const port = (server.address() as AddressInfo).port
  await new Promise<void>((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()))
  return port
}

async function waitForLines(path: string, count: number, timeoutMs = 10_000): Promise<string[]> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const lines = (await readFile(path, 'utf8')).trim().split('\n').filter(Boolean)
      if (lines.length >= count) return lines
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await delay(20)
  }
  throw new Error(`timed out waiting for ${count} lines in ${path}`)
}

async function waitForPortClosed(host: string, port: number, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const open = await new Promise<boolean>(resolveOpen => {
      const socket = createConnection({ host, port })
      const timer = setTimeout(() => {
        socket.destroy()
        resolveOpen(false)
      }, 100)
      socket.once('connect', () => {
        clearTimeout(timer)
        socket.destroy()
        resolveOpen(true)
      })
      socket.once('error', () => {
        clearTimeout(timer)
        resolveOpen(false)
      })
    })
    if (!open) return
    await delay(20)
  }
  throw new Error(`timed out waiting for ${host}:${port} to close`)
}

async function waitForState(path: string, timeoutMs = 10_000): Promise<Record<string, any>> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      return JSON.parse(await readFile(path, 'utf8')) as Record<string, any>
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await delay(20)
  }
  throw new Error(`timed out waiting for ${path}`)
}

async function stateExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return false
  }
}

async function createFakePnpm(root: string): Promise<{ binDirectory: string; home: string }> {
  const binDirectory = join(root, 'fake-bin')
  const home = join(root, 'home')
  const dshSource = join(root, 'fake-dsh.mjs')
  const metricsPath = join(root, 'host-metrics.json')
  await mkdir(binDirectory, { recursive: true })
  await mkdir(home, { recursive: true })
  await writeFile(metricsPath, JSON.stringify({ active: 0, maxActive: 0, events: [] }) + '\n', 'utf8')
  await writeFile(dshSource, `#!/usr/bin/env node
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'

const args = process.argv.slice(2)
if (args.slice(0, 3).join(' ') === 'plugin --profile comfyui-workbench') {
  const manifestPath = join(process.env.DSH_HOME, 'profiles', 'comfyui-workbench', 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.dependencies = { ...(manifest.dependencies ?? {}), 'harness-comfyui': 'file:' + args.at(-1) }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\\n')
  process.exit(0)
}
if (args[0] !== '--profile' || args[1] !== 'comfyui-workbench') process.exit(2)
const metricsPath = process.env.HOST_METRICS_FILE
const updateMetrics = (delta, event) => {
  const metrics = JSON.parse(readFileSync(metricsPath, 'utf8'))
  metrics.active += delta
  metrics.maxActive = Math.max(metrics.maxActive, metrics.active)
  metrics.events.push({ event, pid: process.pid })
  writeFileSync(metricsPath, JSON.stringify(metrics) + '\\n')
}
const server = createServer((_request, response) => response.end('fixture host'))
server.listen(Number(process.env.HARNESS_COMFYUI_SERVER_PORT), process.env.HARNESS_COMFYUI_SERVER_HOST, () => {
  updateMetrics(1, 'started')
  appendFileSync(process.env.HOST_READY_FILE, String(process.pid) + '\\n')
  process.stdout.write('fixture-host-ready\\n')
})
let closing = false
const shutdown = () => {
  if (closing) return
  closing = true
  server.close(() => {
    updateMetrics(-1, 'stopped')
    process.exit(0)
  })
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
setInterval(() => {}, 1000)
`, 'utf8')
  await chmod(dshSource, 0o755)
  await writeFile(join(binDirectory, 'pnpm'), `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const args = process.argv.slice(2)
if (args.length === 1 && args[0] === '--version') {
  process.stdout.write('11.7.0\\n')
  process.exit(0)
}
if (args[0] !== 'install') process.exit(2)
const target = path.join(process.cwd(), 'node_modules', '.bin')
fs.mkdirSync(target, { recursive: true })
fs.copyFileSync(process.env.FAKE_DSH_SOURCE, path.join(target, 'dsh'))
fs.chmodSync(path.join(target, 'dsh'), 0o755)
`, 'utf8')
  await chmod(join(binDirectory, 'pnpm'), 0o755)
  return { binDirectory, home }
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'harness-restart-cli-'))
  temporaryRoots.push(root)
  const installationRoot = join(root, 'installation')
  const packageRoot = join(root, 'package')
  const tarballPath = join(root, 'harness-comfyui-0.1.0-test.1.tgz')
  const inputPath = join(root, 'installation.json')
  const hostReadyFile = join(root, 'host-ready')
  const metricsPath = join(root, 'host-metrics.json')
  const catalogCliPath = join(root, 'catalog-discovery.mjs')
  const sourceCliPath = join(root, 'source-discovery.mjs')
  const discovery = {
    contract_id: 'imagegen-source-contract',
    contract_version: 1,
    openapi: { openapi: '3.1.0', info: { title: 'fixture', version: '1' }, paths: {} },
  }
  const packageFiles = [
    'scripts/deploy/cli.mjs',
    'scripts/deploy/contracts.mjs',
    'scripts/deploy/install.mjs',
    'scripts/deploy/lifecycle.mjs',
    'scripts/deploy/restart.mjs',
    'scripts/deploy/start.mjs',
    'scripts/deploy/stop.mjs',
    'scripts/deploy/status.mjs',
    'scripts/deploy/preflight.mjs',
    'scripts/profile/materialize.mjs',
    'scripts/profile/start.mjs',
    'profiles/comfyui-workbench/package.json',
    'profiles/comfyui-workbench/cordis.patch.yml',
    'profiles/comfyui-workbench/pnpm-workspace.yaml',
    'deployment/runtime/package.json',
    'deployment/runtime/pnpm-lock.yaml',
    'deployment/runtime/pnpm-workspace.yaml',
  ]
  await mkdir(packageRoot, { recursive: true })
  await writeFile(join(packageRoot, 'package.json'), `${JSON.stringify({
    name: 'harness-comfyui',
    version: '0.1.0-test.1',
    engines: { node: '^22.19.0 || >=24.0.0' },
    bin: { 'harness-comfyui': 'scripts/deploy/cli.mjs' },
    devDependencies: {
      '@deepseek-ai/dsh': '0.1.0-rc.7',
      '@deepseek-ai/dsh-base': '0.1.0-rc.7',
      '@deepseek-ai/dsh-web-app': '0.1.0-rc.7',
    },
    files: packageFiles,
  }, null, 2)}\n`, 'utf8')
  for (const relativePath of packageFiles) {
    const target = join(packageRoot, relativePath)
    await mkdir(resolve(target, '..'), { recursive: true })
    await copyFile(join(repositoryRoot, relativePath), target)
    if (relativePath === 'scripts/deploy/cli.mjs') await chmod(target, 0o755)
  }
  const runtimeDirectory = join(packageRoot, 'deployment/runtime')
  await writeFile(join(runtimeDirectory, 'package.json'), `${JSON.stringify({
    name: 'harness-comfyui-runtime',
    private: true,
    dependencies: {
      '@deepseek-ai/dsh': '0.1.0-rc.7',
      '@deepseek-ai/dsh-base': '0.1.0-rc.7',
      '@deepseek-ai/dsh-web-app': '0.1.0-rc.7',
    },
  }, null, 2)}\n`, 'utf8')
  await writeFile(join(runtimeDirectory, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n\nimporters: {}\n", 'utf8')
  await writeFile(join(runtimeDirectory, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n', 'utf8')
  for (const path of [catalogCliPath, sourceCliPath]) {
    await writeFile(path, `#!/usr/bin/env node
if (process.argv[2] !== '--discovery-json') process.exit(2)
process.stdout.write(${JSON.stringify(JSON.stringify(discovery))})
`, 'utf8')
    await chmod(path, 0o755)
  }
  const tar = await runProcess('tar', ['-czf', tarballPath, '-C', root, 'package'], process.env)
  if (tar.status !== 0) throw new Error(`fixture tarball failed: ${tar.stderr}`)
  const fake = await createFakePnpm(root)
  const port = await findFreePort()
  const installation = {
    schemaVersion: 1,
    installationId: 'fixture-restart',
    root: installationRoot,
    configurationProfile: 'production',
    host: '127.0.0.1',
    port,
    paths: {
      dataDir: join(installationRoot, 'shared/data'),
      runRepositoryFile: join(installationRoot, 'shared/data/runs.sqlite'),
      runDirectory: join(installationRoot, 'shared/runs'),
      savedMediaDirectory: join(installationRoot, 'shared/saved-media'),
      logDirectory: join(installationRoot, 'shared/logs'),
    },
    comfyui: { defaultInstanceId: 'fixture-instance' },
    source: {
      catalogCliPath,
      sourceCliPath,
      contractId: 'imagegen-source-contract',
      supportedContractVersions: [1],
    },
    client: { runRefreshIntervalMs: 1000 },
    process: { shutdownTimeoutMs: 10_000 },
  }
  await writeFile(inputPath, `${JSON.stringify(installation, null, 2)}\n`, 'utf8')
  const env = {
    ...process.env,
    HOME: fake.home,
    USERPROFILE: fake.home,
    npm_config_cache: join(root, 'npm-cache'),
    NPM_CONFIG_CACHE: join(root, 'npm-cache'),
    PATH: `${fake.binDirectory}${delimiter}${process.env.PATH ?? ''}`,
    FAKE_DSH_SOURCE: join(root, 'fake-dsh.mjs'),
    HOST_READY_FILE: hostReadyFile,
    HOST_METRICS_FILE: metricsPath,
  }
  return { root, installation, inputPath, tarballPath, hostReadyFile, metricsPath, env }
}

async function installFixture(fixture: Awaited<ReturnType<typeof createFixture>>): Promise<ProcessResult> {
  return runProcess('npm', [
    'exec',
    '--yes',
    `--package=${fixture.tarballPath}`,
    '--',
    'harness-comfyui',
    'install',
    '--installation', fixture.inputPath,
    '--artifact', fixture.tarballPath,
  ], fixture.env, fixture.root)
}

afterEach(async () => {
  for (const child of runningChildren.splice(0)) {
    if (child.exitCode === null) child.kill('SIGKILL')
  }
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('installed restart CLI', () => {
  it('stops the old Host before starting one new Host on the same port', async () => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr).toBe(0)

    const stableBin = join(fixture.installation.root, 'bin/harness-comfyui')
    const processPath = join(fixture.installation.root, 'state/process.json')
    const start = spawnProcess(stableBin, ['start', '--installation', fixture.inputPath], fixture.env)
    const readyLines = await waitForLines(fixture.hostReadyFile, 1)
    const oldState = await waitForState(processPath)
    expect(Number(readyLines[0])).toBe(oldState.pid)

    const restart = spawnProcess(stableBin, ['restart', '--installation', fixture.inputPath], fixture.env)
    const restartedLines = await waitForLines(fixture.hostReadyFile, 2)
    const newState = await waitForState(processPath)

    expect(Number(restartedLines[0])).toBe(oldState.pid)
    expect(Number(restartedLines[1])).toBe(newState.pid)
    expect(newState.pid).not.toBe(oldState.pid)
    expect(newState.operationId).toEqual(expect.any(String))
    expect(await start.output).toMatchObject({ status: 0 })
    expect(await stateExists(processPath)).toBe(true)

    const stop = await runProcess(stableBin, ['stop', '--installation', fixture.inputPath], fixture.env)
    expect(stop.status, stop.stderr).toBe(0)
    expect(await restart.output).toMatchObject({ status: 0 })
    await waitForPortClosed(fixture.installation.host, fixture.installation.port)
    expect(await stateExists(processPath)).toBe(false)

    const metrics = JSON.parse(await readFile(fixture.metricsPath, 'utf8')) as { active: number; maxActive: number; events: Array<{ event: string; pid: number }> }
    expect(metrics.maxActive).toBe(1)
    expect(metrics.active).toBe(0)
    expect(metrics.events.filter(event => event.event === 'started').map(event => event.pid)).toEqual([oldState.pid, newState.pid])
  }, 20_000)

  it('uses start semantics when stopped and exits after another stable CLI stops the new Host', async () => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr).toBe(0)

    const stableBin = join(fixture.installation.root, 'bin/harness-comfyui')
    const processPath = join(fixture.installation.root, 'state/process.json')
    const missingInstallation = await runProcess(stableBin, ['restart'], fixture.env)
    expect(missingInstallation.status).not.toBe(0)
    expect(missingInstallation.stderr).toContain('usage: harness-comfyui restart --installation <absolute-json>')
    expect(missingInstallation.stderr).not.toContain('not implemented in this slice')

    const restart = spawnProcess(stableBin, ['restart', '--installation', fixture.inputPath], fixture.env)
    const ready = await waitForLines(fixture.hostReadyFile, 1)
    const state = await waitForState(processPath)
    expect(Number(ready[0])).toBe(state.pid)

    const stop = await runProcess(stableBin, ['stop', '--installation', fixture.inputPath], fixture.env)
    expect(stop.status, stop.stderr).toBe(0)
    expect(await restart.output).toMatchObject({ status: 0 })
    await waitForPortClosed(fixture.installation.host, fixture.installation.port)
    expect(await stateExists(processPath)).toBe(false)
  }, 20_000)
})

import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createConnection, createServer, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

import { afterEach, describe, expect, it } from 'vitest'

import { writeFrozenRuntimeAndConfiguration } from './frozen-artifact-fixture.ts'
// @ts-expect-error The process identity seam is a checked-in JavaScript lifecycle module.
import { isExitedProcessIdentity } from '../../scripts/deploy/lifecycle.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const cliScript = join(repositoryRoot, 'scripts/deploy/cli.mjs')
const temporaryRoots: string[] = []
const runningChildren: ChildProcess[] = []

type ProcessResult = {
  status: number
  stdout: string
  stderr: string
}

function runProcess(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<ProcessResult> {
  return new Promise((resolveResult) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
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

async function waitForFile(path: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await lstat(path)
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await delay(20)
  }
  throw new Error(`timed out waiting for ${path}`)
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

async function readProcessState(path: string): Promise<Record<string, any>> {
  return JSON.parse(await readFile(path, 'utf8')) as Record<string, any>
}

async function processStateExists(path: string): Promise<boolean> {
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
  await mkdir(binDirectory, { recursive: true })
  await mkdir(home, { recursive: true })
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
appendFileSync(process.env.HOST_ENV_LOG, JSON.stringify({
  dshHome: process.env.DSH_HOME,
  configurationProfile: process.env.HARNESS_COMFYUI_CONFIGURATION_PROFILE,
  dataDir: process.env.HARNESS_COMFYUI_DATA_DIR,
  runRepositoryFile: process.env.HARNESS_COMFYUI_RUN_REPOSITORY_FILE,
  runDirectory: process.env.HARNESS_COMFYUI_RUN_DIRECTORY,
  savedMediaDirectory: process.env.HARNESS_COMFYUI_SAVED_MEDIA_DIRECTORY,
  logDirectory: process.env.HARNESS_COMFYUI_LOG_DIRECTORY,
  defaultInstanceId: process.env.HARNESS_COMFYUI_DEFAULT_INSTANCE_ID,
  catalogCliPath: process.env.HARNESS_COMFYUI_CATALOG_CLI_PATH,
  sourceCliPath: process.env.HARNESS_COMFYUI_SOURCE_CLI_PATH,
  sourceContractId: process.env.HARNESS_COMFYUI_SOURCE_CONTRACT_ID,
  sourceContractVersion: process.env.HARNESS_COMFYUI_SOURCE_CONTRACT_VERSION,
  refreshInterval: process.env.HARNESS_COMFYUI_CLIENT_RUN_REFRESH_INTERVAL_MS,
  serverHost: process.env.HARNESS_COMFYUI_SERVER_HOST,
  serverPort: process.env.HARNESS_COMFYUI_SERVER_PORT,
  ambientRemoved: process.env.HARNESS_COMFYUI_AMBIENT,
}) + '\\n', 'utf8')
const server = createServer((_request, response) => response.end('fixture host'))
server.listen(Number(process.env.HARNESS_COMFYUI_SERVER_PORT), process.env.HARNESS_COMFYUI_SERVER_HOST, () => {
  writeFileSync(process.env.HOST_READY_FILE, String(process.pid))
  process.stdout.write('fixture-host-ready\\n')
})
let closing = false
const shutdown = () => {
  if (closing) return
  closing = true
  server.close(() => process.exit(0))
}
process.once('SIGINT', shutdown)
if (process.env.FAKE_DSH_DEFAULT_SIGTERM !== '1') process.once('SIGTERM', shutdown)
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
  const root = await mkdtemp(join(tmpdir(), 'harness-lifecycle-cli-'))
  temporaryRoots.push(root)
  const installationRoot = join(root, 'installation')
  const packageRoot = join(root, 'package')
  const tarballPath = join(root, 'harness-comfyui-0.1.0-test.1.tgz')
  const inputPath = join(root, 'installation.json')
  const hostReadyFile = join(root, 'host-ready')
  const hostEnvLog = join(root, 'host-env.jsonl')
  const catalogCliPath = join(root, 'catalog-discovery.mjs')
  const sourceCliPath = join(root, 'source-discovery.mjs')
  const discovery = {
    contract_id: 'imagegen-source-contract',
    contract_version: 1,
    openapi: { openapi: '3.1.0', info: { title: 'fixture', version: '1' }, paths: {} },
  }
  const packageFiles = [
    'lib/index.js',
    'lib/config-profile-validator.js',
    'scripts/deploy/cli.mjs',
    'scripts/deploy/contracts.mjs',
    'scripts/deploy/install.mjs',
    'scripts/deploy/lifecycle.mjs',
    'scripts/deploy/start.mjs',
    'scripts/deploy/stop.mjs',
    'scripts/deploy/status.mjs',
    'scripts/deploy/preflight.mjs',
    'scripts/deploy/runtime-contract.mjs',
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
    packageManager: 'pnpm@11.7.0',
    engines: { node: '^22.19.0 || >=24.0.0' },
    bin: { 'harness-comfyui': 'scripts/deploy/cli.mjs' },
    devDependencies: {
      '@deepseek-ai/dsh': '0.1.0-rc.8',
      '@deepseek-ai/dsh-base': '0.1.0-rc.8',
      '@deepseek-ai/dsh-web-app': '0.1.0-rc.8',
    },
    files: packageFiles,
  }, null, 2)}
`, 'utf8')
  for (const relativePath of packageFiles) {
    const target = join(packageRoot, relativePath)
    await mkdir(resolve(target, '..'), { recursive: true })
    await copyFile(join(repositoryRoot, relativePath), target)
  }
  await writeFrozenRuntimeAndConfiguration(packageRoot)
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
    installationId: 'fixture-lifecycle',
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
    process: { shutdownTimeoutMs: 10000 },
  }
  await writeFile(inputPath, `${JSON.stringify(installation, null, 2)}\n`, 'utf8')
  const env = {
    ...process.env,
    HOME: fake.home,
    USERPROFILE: fake.home,
    PATH: `${fake.binDirectory}${delimiter}${process.env.PATH ?? ''}`,
    FAKE_DSH_SOURCE: join(root, 'fake-dsh.mjs'),
    HOST_READY_FILE: hostReadyFile,
    HOST_ENV_LOG: hostEnvLog,
    HARNESS_COMFYUI_AMBIENT: 'must-be-removed',
  }
  return { root, installation, inputPath, tarballPath, hostReadyFile, hostEnvLog, env }
}

async function installFixture(fixture: Awaited<ReturnType<typeof createFixture>>): Promise<ProcessResult> {
  return runProcess(process.execPath, [
    cliScript,
    'install',
    '--installation', fixture.inputPath,
    '--artifact', fixture.tarballPath,
  ], fixture.env)
}

afterEach(async () => {
  for (const child of runningChildren.splice(0)) {
    if (child.exitCode === null) child.kill('SIGKILL')
  }
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('process identity exit classification', () => {
  const startTime = 'Sat Aug 22 09:44:18 2026'
  const expected = { startTime, command: '/installation/releases/0.1.0-test.1/harness-runtime/node_modules/.bin/dsh --no-open' }

  it.each([
    { name: 'same start time and Z state', observed: { startTime, command: '[node]', processState: 'Z+' }, result: true },
    { name: 'same start time and defunct command', observed: { startTime, command: '<defunct>' }, result: true },
    { name: 'same start time and parenthesized command', observed: { startTime, command: '(node)' }, result: true },
    { name: 'different start time and Z state', observed: { startTime: 'Sat Aug 22 09:44:19 2026', command: '[node]', processState: 'Z' }, result: false },
    { name: 'different start time and defunct command', observed: { startTime: 'Sat Aug 22 09:44:19 2026', command: '<defunct>' }, result: false },
    { name: 'active [node] command', observed: { startTime, command: '[node]', processState: 'R' }, result: false },
  ])('$name', ({ observed, result }) => {
    expect(isExitedProcessIdentity(expected, observed)).toBe(result)
  })
})

describe('installed lifecycle CLI', () => {
  it('starts the installed stable CLI in the foreground, reports status, and stops it', async () => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr).toBe(0)

    const stableBin = join(fixture.installation.root, 'bin/harness-comfyui')
    const statePath = join(fixture.installation.root, 'state/process.json')
    const start = spawnProcess(stableBin, ['start', '--installation', fixture.inputPath], fixture.env)
    await waitForFile(fixture.hostReadyFile)
    await waitForFile(statePath)
    const processState = JSON.parse(await readFile(statePath, 'utf8'))
    expect(processState).toMatchObject({
      schemaVersion: 1,
      installationId: 'fixture-lifecycle',
      activeVersion: '0.1.0-test.1',
      pid: expect.any(Number),
      operationId: expect.any(String),
      startedAt: expect.any(String),
      host: '127.0.0.1',
      port: fixture.installation.port,
      processIdentity: {
        startTime: expect.any(String),
        command: expect.any(String),
      },
    })
    expect(processState.processIdentity.command).toContain('harness-runtime/node_modules/.bin/dsh')
    expect(processState.processIdentity).toEqual({
      startTime: expect.any(String),
      command: expect.any(String),
    })
    expect(processState.processIdentity).not.toHaveProperty('processState')

    const status = await runProcess(stableBin, ['status', '--json', '--installation', fixture.inputPath], fixture.env)
    expect(status.status, status.stderr).toBe(0)
    expect(JSON.parse(status.stdout)).toMatchObject({
      installationId: 'fixture-lifecycle',
      activeVersion: '0.1.0-test.1',
      pid: expect.any(Number),
      startedAt: expect.any(String),
      host: '127.0.0.1',
      port: fixture.installation.port,
      status: 'running',
    })

    const environment = JSON.parse((await readFile(fixture.hostEnvLog, 'utf8')).trim())
    expect(environment).toMatchObject({
      dshHome: join(fixture.installation.root, 'releases/0.1.0-test.1/dsh-home'),
      configurationProfile: 'production',
      dataDir: fixture.installation.paths.dataDir,
      runRepositoryFile: fixture.installation.paths.runRepositoryFile,
      runDirectory: fixture.installation.paths.runDirectory,
      savedMediaDirectory: fixture.installation.paths.savedMediaDirectory,
      logDirectory: fixture.installation.paths.logDirectory,
      defaultInstanceId: 'fixture-instance',
      catalogCliPath: fixture.installation.source.catalogCliPath,
      sourceCliPath: fixture.installation.source.sourceCliPath,
      refreshInterval: '1000',
      serverHost: '127.0.0.1',
      serverPort: String(fixture.installation.port),
    })
    expect(environment).not.toHaveProperty('ambientRemoved')
    expect(environment).not.toHaveProperty('sourceContractId')
    expect(environment).not.toHaveProperty('sourceContractVersion')

    const stop = await runProcess(stableBin, ['stop', '--installation', fixture.inputPath], fixture.env)
    expect(stop.status, stop.stderr).toBe(0)
    const startResult = await start.output
    expect(startResult.status, startResult.stderr).toBe(0)
    await expect(lstat(join(fixture.installation.root, 'shared/logs/host.stdout.log'))).resolves.toBeDefined()
    await expect(lstat(join(fixture.installation.root, 'shared/logs/host.stderr.log'))).resolves.toBeDefined()
    await waitForPortClosed(fixture.installation.host, fixture.installation.port)
    await expect(lstat(join(fixture.installation.root, 'state/process.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  }, 30_000)

  it('reports a foreground start as stopped when product stop terminates the running Host with SIGTERM', async () => {
    const fixture = await createFixture()
    Object.assign(fixture.env, { FAKE_DSH_DEFAULT_SIGTERM: '1' })
    const install = await installFixture(fixture)
    expect(install.status, install.stderr).toBe(0)

    const stableBin = join(fixture.installation.root, 'bin/harness-comfyui')
    const statePath = join(fixture.installation.root, 'state/process.json')
    const start = spawnProcess(stableBin, ['start', '--installation', fixture.inputPath], fixture.env)
    await waitForFile(fixture.hostReadyFile)
    await waitForFile(statePath)

    const stop = await runProcess(stableBin, ['stop', '--installation', fixture.inputPath], fixture.env)
    expect(stop.status, stop.stderr).toBe(0)
    const startResult = await start.output
    expect(startResult.status, startResult.stderr).toBe(0)
    const terminalLine = startResult.stdout.trim().split('\n').at(-1)
    expect(JSON.parse(terminalLine!)).toMatchObject({ stage: 'start', status: 'stopped' })
    await expect(lstat(statePath)).rejects.toMatchObject({ code: 'ENOENT' })
    await waitForPortClosed(fixture.installation.host, fixture.installation.port)
  }, 30_000)

  it('rejects a duplicate start while the installed Host is running', async () => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr).toBe(0)

    const stableBin = join(fixture.installation.root, 'bin/harness-comfyui')
    const statePath = join(fixture.installation.root, 'state/process.json')
    const start = spawnProcess(stableBin, ['start', '--installation', fixture.inputPath], fixture.env)
    await waitForFile(fixture.hostReadyFile)
    await waitForFile(statePath)

    const duplicate = await runProcess(stableBin, ['start', '--installation', fixture.inputPath], fixture.env)
    expect(duplicate.status).not.toBe(0)
    expect(duplicate.stderr).toMatch(/already running/i)

    const stop = await runProcess(stableBin, ['stop', '--installation', fixture.inputPath], fixture.env)
    expect(stop.status, stop.stderr).toBe(0)
    expect((await start.output).status).toBe(0)
  }, 30_000)

  it('clears a stale process state and reports stopped without signaling a PID', async () => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr).toBe(0)

    await writeFile(join(fixture.installation.root, 'state/process.json'), `${JSON.stringify({
      schemaVersion: 1,
      installationId: fixture.installation.installationId,
      activeVersion: '0.1.0-test.1',
      pid: 99_999_999,
      operationId: 'stale-operation',
      startedAt: '2026-08-22T00:00:00.000Z',
      host: fixture.installation.host,
      port: fixture.installation.port,
      processIdentity: { startTime: 'stale', command: '/stale/dsh' },
    }, null, 2)}\n`, 'utf8')

    const status = await runProcess(join(fixture.installation.root, 'bin/harness-comfyui'), [
      'status', '--json', '--installation', fixture.inputPath,
    ], fixture.env)

    expect(status.status, status.stderr).toBe(0)
    expect(JSON.parse(status.stdout)).toMatchObject({
      installationId: fixture.installation.installationId,
      status: 'stopped',
      pid: null,
      startedAt: null,
    })
    await expect(lstat(join(fixture.installation.root, 'state/process.json'))).rejects.toMatchObject({ code: 'ENOENT' })

    const start = spawnProcess(join(fixture.installation.root, 'bin/harness-comfyui'), [
      'start', '--installation', fixture.inputPath,
    ], fixture.env)
    await waitForFile(fixture.hostReadyFile)
    await waitForFile(join(fixture.installation.root, 'state/process.json'))
    const stop = await runProcess(join(fixture.installation.root, 'bin/harness-comfyui'), [
      'stop', '--installation', fixture.inputPath,
    ], fixture.env)
    expect(stop.status, stop.stderr).toBe(0)
    expect((await start.output).status).toBe(0)
  })

  it('clears a zombie process whose Linux command has collapsed to [node]', async () => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr).toBe(0)

    const fixedStartTime = 'Sat Aug 22 09:44:18 2026'
    const zombiePs = join(fixture.root, 'fake-bin/ps')
    await writeFile(zombiePs, `#!/usr/bin/env node
const field = process.argv.at(-1)?.replace(/=$/u, '')
const values = { lstart: ${JSON.stringify(fixedStartTime)}, command: '[node]', stat: 'Z' }
process.stdout.write(values[field] ?? '')
`, 'utf8')
    await chmod(zombiePs, 0o755)

    const statePath = join(fixture.installation.root, 'state/process.json')
    await writeFile(statePath, `${JSON.stringify({
      schemaVersion: 1,
      installationId: fixture.installation.installationId,
      activeVersion: '0.1.0-test.1',
      pid: 99_999_999,
      operationId: 'zombie-operation',
      startedAt: '2026-08-22T00:00:00.000Z',
      host: fixture.installation.host,
      port: fixture.installation.port,
      processIdentity: {
        startTime: fixedStartTime,
        command: '/installation/releases/0.1.0-test.1/harness-runtime/node_modules/.bin/dsh --profile comfyui-workbench --no-open',
      },
    }, null, 2)}\n`, 'utf8')

    const stop = await runProcess(join(fixture.installation.root, 'bin/harness-comfyui'), [
      'stop', '--installation', fixture.inputPath,
    ], fixture.env)

    expect(stop.status, stop.stderr).toBe(0)
    await expect(lstat(statePath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('waits for a same-start-time bracketed command to become a zombie before clearing state', async () => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr).toBe(0)

    const fixedStartTime = 'Sat Aug 22 09:44:18 2026'
    const transitionAt = Date.now() + 3_000
    const transientPs = join(fixture.root, 'fake-bin/ps')
    await writeFile(transientPs, `#!/usr/bin/env node
const field = process.argv.at(-1)?.replace(/=$/u, '')
const values = {
  lstart: ${JSON.stringify(fixedStartTime)},
  command: '[node]',
  stat: Date.now() < Number(process.env.FAKE_PS_TRANSITION_AT) ? 'R' : 'Z',
}
    process.stdout.write(values[field] ?? '')
`, 'utf8')
    await chmod(transientPs, 0o755)
    Object.assign(fixture.env, { FAKE_PS_TRANSITION_AT: String(transitionAt) })

    const statePath = join(fixture.installation.root, 'state/process.json')
    await writeFile(statePath, `${JSON.stringify({
      schemaVersion: 1,
      installationId: fixture.installation.installationId,
      activeVersion: '0.1.0-test.1',
      pid: 99_999_997,
      operationId: 'transient-zombie-operation',
      startedAt: '2026-08-22T00:00:00.000Z',
      host: fixture.installation.host,
      port: fixture.installation.port,
      processIdentity: {
        startTime: fixedStartTime,
        command: '/installation/releases/0.1.0-test.1/harness-runtime/node_modules/.bin/dsh --profile comfyui-workbench --no-open',
      },
    }, null, 2)}\n`, 'utf8')

    const stop = await runProcess(join(fixture.installation.root, 'bin/harness-comfyui'), [
      'stop', '--installation', fixture.inputPath,
    ], fixture.env)

    expect(stop.status, stop.stderr).toBe(0)
    await expect(lstat(statePath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects an active [node] process with a matching start time', async () => {
    const fixture = await createFixture()
    fixture.installation.process.shutdownTimeoutMs = 100
    await writeFile(fixture.inputPath, `${JSON.stringify(fixture.installation, null, 2)}\n`, 'utf8')
    const install = await installFixture(fixture)
    expect(install.status, install.stderr).toBe(0)

    const fixedStartTime = 'Sat Aug 22 09:44:18 2026'
    const activePs = join(fixture.root, 'fake-bin/ps')
    await writeFile(activePs, `#!/usr/bin/env node
const field = process.argv.at(-1)?.replace(/=$/u, '')
const values = { lstart: ${JSON.stringify(fixedStartTime)}, command: '[node]', stat: 'R' }
process.stdout.write(values[field] ?? '')
`, 'utf8')
    await chmod(activePs, 0o755)

    const statePath = join(fixture.installation.root, 'state/process.json')
    await writeFile(statePath, `${JSON.stringify({
      schemaVersion: 1,
      installationId: fixture.installation.installationId,
      activeVersion: '0.1.0-test.1',
      pid: 99_999_998,
      operationId: 'active-node-operation',
      startedAt: '2026-08-22T00:00:00.000Z',
      host: fixture.installation.host,
      port: fixture.installation.port,
      processIdentity: {
        startTime: fixedStartTime,
        command: '/installation/releases/0.1.0-test.1/harness-runtime/node_modules/.bin/dsh --profile comfyui-workbench --no-open',
      },
    }, null, 2)}\n`, 'utf8')

    const stop = await runProcess(join(fixture.installation.root, 'bin/harness-comfyui'), [
      'stop', '--installation', fixture.inputPath,
    ], fixture.env)

    expect(stop.status).not.toBe(0)
    expect(stop.stderr).toMatch(/process identity mismatch/u)
    await expect(lstat(statePath)).resolves.toBeDefined()
  })

  it('rejects PID reuse without sending a signal to the replacement process', async () => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr).toBe(0)

    const replacement = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      cwd: repositoryRoot,
      env: fixture.env,
      stdio: 'ignore',
    })
    runningChildren.push(replacement)
    if (replacement.pid === undefined) throw new Error('replacement process did not provide a PID')
    await delay(100)
    await writeFile(join(fixture.installation.root, 'state/process.json'), `${JSON.stringify({
      schemaVersion: 1,
      installationId: fixture.installation.installationId,
      activeVersion: '0.1.0-test.1',
      pid: replacement.pid,
      operationId: 'reused-operation',
      startedAt: '2026-08-22T00:00:00.000Z',
      host: fixture.installation.host,
      port: fixture.installation.port,
      processIdentity: { startTime: 'not-the-current-start', command: '/not/the/current/process' },
    }, null, 2)}\n`, 'utf8')

    const stop = await runProcess(join(fixture.installation.root, 'bin/harness-comfyui'), [
      'stop', '--installation', fixture.inputPath,
    ], fixture.env)

    expect(stop.status).not.toBe(0)
    expect(stop.stderr).toMatch(/identity mismatch/i)
    expect(() => process.kill(replacement.pid!, 0)).not.toThrow()
    replacement.kill('SIGTERM')
    await new Promise(resolveClose => replacement.once('close', resolveClose))
  })

  it.each([
    { field: 'installationId', value: 'another-installation' },
    { field: 'activeVersion', value: '0.1.0-test.other' },
    { field: 'host', value: '127.0.0.2' },
    { field: 'port', value: 1 },
  ])('refuses %s ownership mismatches before status or stop acts', async ({ field, value }) => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr).toBe(0)

    const stableBin = join(fixture.installation.root, 'bin/harness-comfyui')
    const statePath = join(fixture.installation.root, 'state/process.json')
    const start = spawnProcess(stableBin, ['start', '--installation', fixture.inputPath], fixture.env)
    await waitForFile(fixture.hostReadyFile)
    await waitForFile(statePath)
    const originalState = await readProcessState(statePath)
    const mismatchedState = { ...originalState, [field]: value }

    let statusResult: ProcessResult | undefined
    let stateAfterStatus = false
    let statusReportedRunning = false
    let stopResult: ProcessResult | undefined
    let stateAfterStop = false
    let startAliveAfterStop = false
    try {
      await writeFile(statePath, `${JSON.stringify(mismatchedState, null, 2)}\n`, 'utf8')
      statusResult = await runProcess(stableBin, ['status', '--json', '--installation', fixture.inputPath], fixture.env)
      stateAfterStatus = await processStateExists(statePath)
      if (statusResult.status === 0) statusReportedRunning = JSON.parse(statusResult.stdout).status === 'running'

      await writeFile(statePath, `${JSON.stringify(mismatchedState, null, 2)}\n`, 'utf8')
      stopResult = await runProcess(stableBin, ['stop', '--installation', fixture.inputPath], fixture.env)
      stateAfterStop = await processStateExists(statePath)
      startAliveAfterStop = start.exitCode === null
    } finally {
      await writeFile(statePath, `${JSON.stringify(originalState, null, 2)}\n`, 'utf8')
      if (start.exitCode === null) {
        const cleanup = await runProcess(stableBin, ['stop', '--installation', fixture.inputPath], fixture.env)
        expect(cleanup.status, cleanup.stderr).toBe(0)
      }
      await start.output
    }

    expect(statusResult?.status).not.toBe(0)
    expect(statusResult?.stderr).toMatch(/does not match current installation/i)
    expect(statusReportedRunning).toBe(false)
    expect(stateAfterStatus).toBe(true)
    expect(stopResult?.status).not.toBe(0)
    expect(stopResult?.stderr).toMatch(/does not match current installation/i)
    expect(stateAfterStop).toBe(true)
    expect(startAliveAfterStop).toBe(true)
  }, 30_000)

  it('refuses a process identity with matching start time but a different command', async () => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr).toBe(0)

    const stableBin = join(fixture.installation.root, 'bin/harness-comfyui')
    const statePath = join(fixture.installation.root, 'state/process.json')
    const start = spawnProcess(stableBin, ['start', '--installation', fixture.inputPath], fixture.env)
    await waitForFile(fixture.hostReadyFile)
    await waitForFile(statePath)
    const originalState = await readProcessState(statePath)
    const mismatchedState = {
      ...originalState,
      processIdentity: {
        ...originalState.processIdentity,
        command: `${originalState.processIdentity.command} --different-command`,
      },
    }

    let statusResult: ProcessResult | undefined
    let stopResult: ProcessResult | undefined
    let startAliveAfterStop = false
    try {
      await writeFile(statePath, `${JSON.stringify(mismatchedState, null, 2)}\n`, 'utf8')
      statusResult = await runProcess(stableBin, ['status', '--json', '--installation', fixture.inputPath], fixture.env)

      await writeFile(statePath, `${JSON.stringify(mismatchedState, null, 2)}\n`, 'utf8')
      stopResult = await runProcess(stableBin, ['stop', '--installation', fixture.inputPath], fixture.env)
      startAliveAfterStop = start.exitCode === null
    } finally {
      await writeFile(statePath, `${JSON.stringify(originalState, null, 2)}\n`, 'utf8')
      if (start.exitCode === null) {
        const cleanup = await runProcess(stableBin, ['stop', '--installation', fixture.inputPath], fixture.env)
        expect(cleanup.status, cleanup.stderr).toBe(0)
      }
      await start.output
    }

    expect(statusResult?.status).not.toBe(0)
    expect(statusResult?.stderr).toMatch(/identity mismatch/i)
    expect(stopResult?.status).not.toBe(0)
    expect(stopResult?.stderr).toMatch(/identity mismatch/i)
    expect(startAliveAfterStop).toBe(true)
  }, 30_000)

  it('preserves a stale process state owned by another installation', async () => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr).toBe(0)

    const statePath = join(fixture.installation.root, 'state/process.json')
    const foreignState = {
      schemaVersion: 1,
      installationId: 'another-installation',
      activeVersion: '0.1.0-test.1',
      pid: 99_999_999,
      operationId: 'foreign-stale-operation',
      startedAt: '2026-08-22T00:00:00.000Z',
      host: fixture.installation.host,
      port: fixture.installation.port,
      processIdentity: { startTime: 'stale', command: '/stale/dsh' },
    }
    await writeFile(statePath, `${JSON.stringify(foreignState, null, 2)}\n`, 'utf8')

    const status = await runProcess(join(fixture.installation.root, 'bin/harness-comfyui'), [
      'status', '--json', '--installation', fixture.inputPath,
    ], fixture.env)
    const stateAfterStatus = await processStateExists(statePath)
    await writeFile(statePath, `${JSON.stringify(foreignState, null, 2)}\n`, 'utf8')
    const stop = await runProcess(join(fixture.installation.root, 'bin/harness-comfyui'), [
      'stop', '--installation', fixture.inputPath,
    ], fixture.env)
    const stateAfterStop = await processStateExists(statePath)

    expect(status.status).not.toBe(0)
    expect(status.stderr).toMatch(/does not match current installation/i)
    expect(stateAfterStatus).toBe(true)
    expect(stop.status).not.toBe(0)
    expect(stop.stderr).toMatch(/does not match current installation/i)
    expect(stateAfterStop).toBe(true)
  })

})

import { appendFile, chmod, copyFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'

import { afterEach, describe, expect, it } from 'vitest'

import { writeFrozenRuntimeAndConfiguration } from './frozen-artifact-fixture.ts'

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
  return new Promise(resolveResult => {
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
  waitForOutput: (text: string) => Promise<void>
} {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  }) as ChildProcess & { output: Promise<ProcessResult>; waitForOutput: (text: string) => Promise<void> }
  runningChildren.push(child)
  let stdout = ''
  let stderr = ''
  const outputWaiters: Array<{ text: string; resolve: () => void }> = []
  child.stdout?.on('data', chunk => {
    stdout += String(chunk)
    for (const waiter of outputWaiters.splice(0)) {
      if (stdout.includes(waiter.text)) waiter.resolve()
      else outputWaiters.push(waiter)
    }
  })
  child.stderr?.on('data', chunk => { stderr += String(chunk) })
  child.output = new Promise(resolveResult => child.on('close', code => resolveResult({ status: code ?? 1, stdout, stderr })))
  child.waitForOutput = text => new Promise(resolveResult => {
    if (stdout.includes(text)) resolveResult()
    else outputWaiters.push({ text, resolve: resolveResult })
  })
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
    await new Promise(resolveDelay => setTimeout(resolveDelay, 20))
  }
  throw new Error(`timed out waiting for ${path}`)
}

async function createFakePnpm(root: string): Promise<{ binDirectory: string; home: string }> {
  const binDirectory = join(root, 'fake-bin')
  const home = join(root, 'home')
  const dshSource = join(root, 'fake-dsh.mjs')
  await mkdir(binDirectory, { recursive: true })
  await mkdir(home, { recursive: true })
  await writeFile(dshSource, `#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
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

const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/plain' })
  response.end('logs fixture host')
})
server.listen(Number(process.env.HARNESS_COMFYUI_SERVER_PORT), process.env.HARNESS_COMFYUI_SERVER_HOST, () => {
  process.stdout.write('ordinary stdout line\\n')
  process.stdout.write('Authorization: Bearer stdout-secret\\n')
  process.stdout.write('token=stdout-token-secret\\n')
  process.stdout.write('password: stdout-password-secret\\n')
  process.stdout.write('HARNESS_COMFYUI_SERVER_PORT=stdout-env-secret\\n')
  process.stdout.write('{"Authorization":"Bearer json-secret","credential":"json-credential","secret":"json-secret","token":"json-token","password":"json-password","message":"keep json text"}\\n')
  process.stderr.write('ordinary stderr line\\n')
  process.stderr.write('authorization: Basic stderr-secret\\n')
  process.stderr.write('credential = stderr-credential-secret\\n')
  process.stderr.write('HARNESS_COMFYUI_DATA_DIR=stderr-env-secret\\n')
  process.stderr.write('{"Authorization":"Bearer stderr-json-secret","credential":"stderr-json-credential","secret":"stderr-json-secret","token":"stderr-json-token","password":"stderr-json-password","message":"keep stderr json text"}\\n')
  writeFileSync(process.env.LOGS_HOST_READY_FILE, String(process.pid))
})
let closing = false
const shutdown = () => {
  if (closing) return
  closing = true
  server.close(() => process.exit(0))
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
  const root = await mkdtemp(join(tmpdir(), 'harness-logs-cli-'))
  temporaryRoots.push(root)
  const installationRoot = join(root, 'installation')
  const packageRoot = join(root, 'package')
  const tarballPath = join(root, 'harness-comfyui-0.1.0-test.1.tgz')
  const inputPath = join(root, 'installation.json')
  const hostReadyFile = join(root, 'host-ready')
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
    'scripts/deploy/health.mjs',
    'scripts/deploy/logs.mjs',
    'scripts/deploy/preflight.mjs',
    'scripts/deploy/start.mjs',
    'scripts/deploy/stop.mjs',
    'scripts/deploy/status.mjs',
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
    installationId: 'fixture-logs',
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
    LOGS_HOST_READY_FILE: hostReadyFile,
  }
  return { root, installation, inputPath, tarballPath, hostReadyFile, env }
}

async function installFixture(fixture: Awaited<ReturnType<typeof createFixture>>): Promise<ProcessResult> {
  return runProcess(process.execPath, [
    cliScript,
    'install',
    '--installation', fixture.inputPath,
    '--artifact', fixture.tarballPath,
  ], fixture.env)
}

async function stopFixture(fixture: Awaited<ReturnType<typeof createFixture>>): Promise<void> {
  const stop = await runProcess(join(fixture.installation.root, 'bin/harness-comfyui'), [
    'stop', '--installation', fixture.inputPath,
  ], fixture.env)
  if (stop.status !== 0) throw new Error(stop.stderr || stop.stdout)
}

afterEach(async () => {
  for (const child of runningChildren.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('installed logs CLI', () => {
  it('redacts quoted JSON keys and values while preserving ordinary text', async () => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr).toBe(0)

    const stableBin = join(fixture.installation.root, 'bin/harness-comfyui')
    const line = '{"Authorization":"Bearer json-secret","credential":"json-credential","secret":"json-secret","token":"json-token","password":"json-password","message":"keep this"}\n' + 'token: "quoted-token"\n'
    await appendFile(join(fixture.installation.root, 'shared/logs/host.stdout.log'), line, 'utf8')

    const logs = await runProcess(stableBin, [
      'logs', '--installation', fixture.inputPath, '--source', 'stdout', '--lines', '2',
    ], fixture.env)
    expect(logs.status, logs.stderr).toBe(0)
    expect(logs.stdout).toContain('{"Authorization":"[REDACTED]","credential":"[REDACTED]","secret":"[REDACTED]","token":"[REDACTED]","password":"[REDACTED]","message":"keep this"}')
    expect(logs.stdout).toContain('token: "[REDACTED]"')
    expect(logs.stdout).not.toMatch(/json-secret|json-credential|json-token|json-password/u)
  })

  it('reads a redacted stdout tail through the installed stable CLI', async () => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr).toBe(0)

    const stableBin = join(fixture.installation.root, 'bin/harness-comfyui')
    const start = spawnProcess(stableBin, ['start', '--installation', fixture.inputPath], fixture.env)
    await waitForFile(fixture.hostReadyFile)
    await appendFile(join(fixture.installation.root, 'shared/logs/host.stdout.log'), 'Authorization: Bearer historical-secret\n', 'utf8')

    const logs = await runProcess(stableBin, [
      'logs', '--installation', fixture.inputPath, '--source', 'stdout', '--lines', '2',
    ], fixture.env)
    expect(logs.status, logs.stderr).toBe(0)
    expect(logs.stdout).toContain('[stdout]')
    expect(logs.stdout).not.toContain('stdout-secret')
    expect(logs.stdout).not.toContain('stdout-token-secret')
    expect(logs.stdout).not.toContain('historical-secret')

    await stopFixture(fixture)
    const startResult = await start.output
    expect(startResult.status).toBe(0)
    expect(startResult.stdout).not.toMatch(/stdout-secret|stdout-token-secret|stdout-password-secret|stdout-env-secret|json-secret|json-credential|json-token|json-password/u)
    expect(startResult.stderr).not.toMatch(/stderr-secret|stderr-credential-secret|stderr-env-secret|stderr-json-secret|stderr-json-credential|stderr-json-token|stderr-json-password/u)
  }, 30_000)

  it('distinguishes stdout, stderr, and operations, correlates start state, and redacts persisted secrets', async () => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr).toBe(0)

    const stableBin = join(fixture.installation.root, 'bin/harness-comfyui')
    const start = spawnProcess(stableBin, ['start', '--installation', fixture.inputPath], fixture.env)
    await waitForFile(fixture.hostReadyFile)

    const processState = JSON.parse(await readFile(join(fixture.installation.root, 'state/process.json'), 'utf8'))
    const operationsPath = join(fixture.installation.root, 'state/operations.jsonl')
    const operationsBeforeStop = (await readFile(operationsPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    const startEvent = operationsBeforeStop.find(event => event.command === 'start' && event.status === 'started')
    expect(startEvent).toMatchObject({ operationId: processState.operationId, installationId: 'fixture-logs' })

    const stdout = await runProcess(stableBin, [
      'logs', '--installation', fixture.inputPath, '--source', 'stdout', '--lines', '10',
    ], fixture.env)
    const stderr = await runProcess(stableBin, [
      'logs', '--installation', fixture.inputPath, '--source', 'stderr', '--lines', '10',
    ], fixture.env)
    const all = await runProcess(stableBin, [
      'logs', '--installation', fixture.inputPath, '--source', 'all', '--lines', '1',
    ], fixture.env)
    expect(stdout.status, stdout.stderr).toBe(0)
    expect(stderr.status, stderr.stderr).toBe(0)
    expect(all.status, all.stderr).toBe(0)
    expect(stdout.stdout).toContain('[stdout] ordinary stdout line')
    expect(stderr.stdout).toContain('[stderr] ordinary stderr line')
    expect(all.stdout).toMatch(/\[stdout\]/u)
    expect(all.stdout).toMatch(/\[stderr\]/u)
    expect(all.stdout).toMatch(/\[operations\]/u)
    for (const output of [stdout.stdout, stderr.stdout, all.stdout]) {
      expect(output).not.toMatch(/stdout-secret|stdout-token-secret|stdout-password-secret|stdout-env-secret|json-secret|json-credential|json-token|json-password/u)
      expect(output).not.toMatch(/stderr-secret|stderr-credential-secret|stderr-env-secret|stderr-json-secret|stderr-json-credential|stderr-json-token|stderr-json-password/u)
    }

    await stopFixture(fixture)
    const startResult = await start.output
    expect(startResult.status).toBe(0)
    expect(startResult.stdout).not.toMatch(/stdout-secret|stdout-token-secret|stdout-password-secret|stdout-env-secret|json-secret|json-credential|json-token|json-password/u)
    expect(startResult.stderr).not.toMatch(/stderr-secret|stderr-credential-secret|stderr-env-secret|stderr-json-secret|stderr-json-credential|stderr-json-token|stderr-json-password/u)

    const persistedLogs = await Promise.all([
      readFile(join(fixture.installation.root, 'shared/logs/host.stdout.log'), 'utf8'),
      readFile(join(fixture.installation.root, 'shared/logs/host.stderr.log'), 'utf8'),
    ])
    for (const log of persistedLogs) {
      expect(log).not.toMatch(/stdout-secret|stdout-token-secret|stdout-password-secret|stdout-env-secret|json-secret|json-credential|json-token|json-password/u)
      expect(log).not.toMatch(/stderr-secret|stderr-credential-secret|stderr-env-secret|stderr-json-secret|stderr-json-credential|stderr-json-token|stderr-json-password/u)
    }

    const operations = (await readFile(operationsPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    expect(operations.filter(event => event.command === 'start' && event.status === 'passed')).toHaveLength(1)
    expect(operations.filter(event => event.command === 'stop' && event.status === 'started')).toHaveLength(1)
    const allowedKeys = new Set(['schemaVersion', 'operationId', 'command', 'status', 'startedAt', 'finishedAt', 'installationId', 'activeVersion'])
    for (const event of operations) {
      expect(Object.keys(event).every(key => allowedKeys.has(key))).toBe(true)
      expect(event).not.toHaveProperty('path')
      expect(event).not.toHaveProperty('arguments')
      expect(event).not.toHaveProperty('environment')
      expect(JSON.stringify(event)).not.toMatch(/Authorization|HARNESS_COMFYUI_|secret|token|password/u)
    }

    await writeFile(join(fixture.installation.root, 'state/process.json'), '{ malformed\n', 'utf8')
    const failed = await runProcess(stableBin, ['status', '--json', '--installation', fixture.inputPath], fixture.env)
    expect(failed.status).not.toBe(0)
    await rm(join(fixture.installation.root, 'state/process.json'), { force: true })
    const operationsAfterFailure = (await readFile(operationsPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    expect(operationsAfterFailure.filter(event => event.command === 'status' && event.status === 'failed')).toHaveLength(1)
  }, 30_000)

  it('follows appended lines until SIGTERM and exits without an orphan process', async () => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr).toBe(0)
    const stableBin = join(fixture.installation.root, 'bin/harness-comfyui')
    const logPath = join(fixture.installation.root, 'shared/logs/host.stdout.log')
    await appendFile(logPath, 'follow initial\n', 'utf8')

    const follow = spawnProcess(stableBin, [
      'logs', '--installation', fixture.inputPath, '--source', 'stdout', '--lines', '1', '--follow',
    ], fixture.env)
    await follow.waitForOutput('[stdout] follow initial')
    await appendFile(logPath, 'follow appended\n', 'utf8')
    await follow.waitForOutput('[stdout] follow appended')
    expect(follow.kill('SIGTERM')).toBe(true)
    const result = await follow.output
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('[stdout] follow appended')
    if (follow.pid !== undefined) {
      expect(() => process.kill(follow.pid!, 0)).toThrow()
    }
  }, 30_000)

  it('rejects unknown, duplicate, and invalid log options', async () => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr).toBe(0)
    const stableBin = join(fixture.installation.root, 'bin/harness-comfyui')
    const cases = [
      ['--wat'],
      ['--source', 'stdout', '--source', 'stderr', '--lines', '1'],
      ['--source', 'stdout', '--lines', '0'],
      ['--source', 'stdout', '--lines', '1', '--follow', '--follow'],
    ]
    for (const extra of cases) {
      const result = await runProcess(stableBin, ['logs', '--installation', fixture.inputPath, ...extra], fixture.env)
      expect(result.status).not.toBe(0)
    }
  })

  it('fails on malformed active-release state before dispatching the installed CLI or Host', async () => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr).toBe(0)
    const stableBin = join(fixture.installation.root, 'bin/harness-comfyui')
    const operationsPath = join(fixture.installation.root, 'state/operations.jsonl')
    const before = (await readFile(operationsPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    const activeStatePath = join(fixture.installation.root, 'state/active-release.json')
    const activeState = JSON.parse(await readFile(activeStatePath, 'utf8'))
    await writeFile(activeStatePath, `${JSON.stringify({ ...activeState, activeVersion: '' })}\n`, 'utf8')

    const status = await runProcess(stableBin, [
      'status', '--json', '--installation', fixture.inputPath,
    ], fixture.env)
    const start = await runProcess(stableBin, [
      'start', '--installation', fixture.inputPath,
    ], fixture.env)

    expect(status.status).not.toBe(0)
    expect(status.stderr).toMatch(/active-release|activeVersion/u)
    expect(start.status).not.toBe(0)
    expect(start.stderr).toMatch(/active-release|activeVersion/u)
    await expect(lstat(join(fixture.installation.root, 'state/process.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(lstat(fixture.hostReadyFile)).rejects.toMatchObject({ code: 'ENOENT' })

    const after = (await readFile(operationsPath, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    expect(after).toHaveLength(before.length)
    expect(after).toEqual(before)
  })
})

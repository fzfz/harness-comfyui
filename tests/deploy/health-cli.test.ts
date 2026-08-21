import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

import { afterEach, describe, expect, it } from 'vitest'

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

const graph = {
  rev: 'fixture-revision',
  entries: [
    { id: '@deepseek-ai/dsh-client-ui-layout', url: '/assets/layout.js', rev: 'layout-revision' },
    { id: '@deepseek-ai/dsh-client-ui-conversation', url: '/assets/conversation.js', rev: 'conversation-revision' },
    { id: 'harness-comfyui', url: '/assets/harness-comfyui.js', rev: 'harness-revision' },
  ],
}
const pluginStatus = {
  packageName: 'harness-comfyui',
  packageVersion: '0.1.0-test.1',
  configurationProfile: 'production',
  hostLoaded: process.env.HEALTH_PLUGIN_STATUS_LOADED === 'true',
}
const server = createServer((request, response) => {
  let body = ''
  request.on('data', chunk => { body += String(chunk) })
  request.on('end', () => {
    appendFileSync(process.env.HEALTH_REQUEST_LOG, JSON.stringify({ method: request.method, url: request.url, body }) + '\\n')
    if (request.method === 'GET' && request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end('<!doctype html><script>window.__DSH_BOOT__ = ' + JSON.stringify(graph) + '</script>')
      return
    }
    if (request.method === 'GET' && request.url === '/assets/harness-comfyui.js') {
      response.writeHead(200, { 'content-type': 'text/javascript' })
      response.end('export const harnessComfyuiHealthFixture = true\\n')
      return
    }
    if (request.method === 'GET' && (request.url === '/assets/layout.js' || request.url === '/assets/conversation.js')) {
      response.writeHead(200, { 'content-type': 'text/javascript' })
      response.end('export const nativeBundle = true\\n')
      return
    }
    if (request.method === 'POST' && request.url === '/api/pluginStatus/get') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        type: 'server-response',
        rpcId: 'health',
        result: { ok: true, value: pluginStatus },
      }))
      return
    }
    response.writeHead(404)
    response.end('not found')
  })
})
server.listen(Number(process.env.HARNESS_COMFYUI_SERVER_PORT), process.env.HARNESS_COMFYUI_SERVER_HOST, () => {
  writeFileSync(process.env.HEALTH_HOST_READY_FILE, String(process.pid))
  process.stdout.write('health-fixture-host-ready\\n')
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

async function createFixture({ pluginStatusLoaded = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'harness-health-cli-'))
  temporaryRoots.push(root)
  const installationRoot = join(root, 'installation')
  const packageRoot = join(root, 'package')
  const tarballPath = join(root, 'harness-comfyui-0.1.0-test.1.tgz')
  const inputPath = join(root, 'installation.json')
  const hostReadyFile = join(root, 'host-ready')
  const requestLog = join(root, 'health-requests.jsonl')
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
    'scripts/deploy/health.mjs',
    'scripts/deploy/install.mjs',
    'scripts/deploy/lifecycle.mjs',
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
  await writeFile(join(runtimeDirectory, 'pnpm-lock.yaml'), 'lockfileVersion: \'9.0\'\n\nimporters: {}\n', 'utf8')
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
    installationId: 'fixture-health',
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
    HEALTH_HOST_READY_FILE: hostReadyFile,
    HEALTH_REQUEST_LOG: requestLog,
    HEALTH_PLUGIN_STATUS_LOADED: String(pluginStatusLoaded),
  }
  return { root, installation, inputPath, tarballPath, hostReadyFile, requestLog, env }
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
  if (stop.status !== 0 && stop.stderr.length > 0) throw new Error(stop.stderr)
}

afterEach(async () => {
  for (const child of runningChildren.splice(0)) {
    if (child.exitCode === null) child.kill('SIGKILL')
  }
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('installed health CLI', () => {
  it('checks the running installation without conversation or ComfyUI requests', async () => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr).toBe(0)

    const stableBin = join(fixture.installation.root, 'bin/harness-comfyui')
    const start = spawnProcess(stableBin, ['start', '--installation', fixture.inputPath], fixture.env)
    await waitForFile(fixture.hostReadyFile)

    const health = await runProcess(stableBin, ['health', '--json', '--installation', fixture.inputPath], fixture.env)
    expect(health.status, health.stderr).toBe(0)
    const evidence = JSON.parse(health.stdout)
    expect(evidence).toMatchObject({
      stage: 'health',
      status: 'passed',
      process: { status: 'passed' },
      activeRelease: { status: 'passed' },
      harnessWeb: { status: 'passed' },
      clientBundle: { status: 'passed' },
      pluginStatus: {
        status: 'passed',
        packageName: 'harness-comfyui',
        packageVersion: '0.1.0-test.1',
        configurationProfile: 'production',
        hostLoaded: true,
      },
      catalogContract: { status: 'passed', contractId: 'imagegen-source-contract', contractVersion: 1 },
      sourceContract: { status: 'passed', contractId: 'imagegen-source-contract', contractVersion: 1 },
      runRepository: { status: 'passed' },
      savedMedia: { status: 'passed' },
    })
    expect(JSON.stringify(evidence)).not.toMatch(/Authorization|HARNESS_COMFYUI_|\/tmp\//u)
    expect(JSON.parse(await readFile(join(fixture.installation.root, 'state/last-health.json'), 'utf8'))).toEqual(evidence)

    const requests = (await readFile(fixture.requestLog, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    expect(requests.map(request => ({ method: request.method, url: request.url }))).toEqual([
      { method: 'GET', url: '/' },
      { method: 'GET', url: '/assets/harness-comfyui.js' },
      { method: 'POST', url: '/api/pluginStatus/get' },
    ])
    expect(JSON.parse(requests[2].body)).toMatchObject({
      type: 'client-request',
      method: 'pluginStatus/get',
      payload: { args: {} },
    })
    expect(requests.some(request => String(request.url).includes('/prompt'))).toBe(false)
    expect(requests.some(request => String(request.url).includes('conversation'))).toBe(false)

    await stopFixture(fixture)
    expect((await start.output).status).toBe(0)
  }, 30_000)

  it('returns failed health evidence and a nonzero exit when pluginStatus is not loaded', async () => {
    const fixture = await createFixture({ pluginStatusLoaded: false })
    const install = await installFixture(fixture)
    expect(install.status, install.stderr).toBe(0)

    const stableBin = join(fixture.installation.root, 'bin/harness-comfyui')
    const start = spawnProcess(stableBin, ['start', '--installation', fixture.inputPath], fixture.env)
    await waitForFile(fixture.hostReadyFile)

    const health = await runProcess(stableBin, ['health', '--json', '--installation', fixture.inputPath], fixture.env)
    expect(health.status).not.toBe(0)
    const evidence = JSON.parse(health.stdout)
    expect(evidence).toMatchObject({
      stage: 'health',
      status: 'failed',
      pluginStatus: { status: 'failed' },
    })
    expect(evidence.process.status).toBe('passed')
    expect(JSON.parse(await readFile(join(fixture.installation.root, 'state/last-health.json'), 'utf8'))).toEqual(evidence)

    await stopFixture(fixture)
    expect((await start.output).status).toBe(0)
  }, 30_000)
})

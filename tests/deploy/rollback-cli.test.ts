import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createServer, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

import { afterEach, describe, expect, it } from 'vitest'

import { writeFrozenRuntimeAndConfiguration } from './frozen-artifact-fixture.ts'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const temporaryRoots: string[] = []
const runningChildren: ChildProcess[] = []
type ProcessResult = { status: number; stdout: string; stderr: string }

function runProcess(command: string, args: string[], env: NodeJS.ProcessEnv, cwd = repositoryRoot): Promise<ProcessResult> {
  return new Promise(resolveResult => {
    const child = spawn(command, args, { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', chunk => { stdout += String(chunk) })
    child.stderr?.on('data', chunk => { stderr += String(chunk) })
    child.on('close', code => resolveResult({ status: code ?? 1, stdout, stderr }))
  })
}

function spawnProcess(command: string, args: string[], env: NodeJS.ProcessEnv, cwd = repositoryRoot) {
  const child = spawn(command, args, { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
  runningChildren.push(child)
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', chunk => { stdout += String(chunk) })
  child.stderr?.on('data', chunk => { stderr += String(chunk) })
  const output = new Promise<ProcessResult>(resolveResult => {
    child.on('close', code => resolveResult({ status: code ?? 1, stdout, stderr }))
  })
  return { child, output }
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

async function waitForLines(path: string, count: number, timeoutMs = 15_000): Promise<string[]> {
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

async function waitForState(path: string, version: string, timeoutMs = 15_000): Promise<Record<string, any>> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const state = JSON.parse(await readFile(path, 'utf8')) as Record<string, any>
      if (state.activeVersion === version) return state
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await delay(20)
  }
  throw new Error(`timed out waiting for active version ${version}`)
}

async function createFakePnpm(root: string, stageReadyFile: string): Promise<{ binDirectory: string; home: string }> {
  const binDirectory = join(root, 'fake-bin')
  const home = join(root, 'home')
  const dshSource = join(root, 'fake-dsh.mjs')
  await mkdir(binDirectory, { recursive: true })
  await mkdir(home, { recursive: true })
  await writeFile(dshSource, `#!/usr/bin/env node
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'

const args = process.argv.slice(2)
if (args.slice(0, 3).join(' ') === 'plugin --profile comfyui-workbench') {
  const manifestPath = process.env.DSH_HOME + '/profiles/comfyui-workbench/package.json'
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.dependencies = { ...(manifest.dependencies ?? {}), 'harness-comfyui': 'file:' + args.at(-1) }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\\n')
  process.exit(0)
}
if (args[0] !== '--profile' || args[1] !== 'comfyui-workbench') process.exit(2)

const version = process.env.DSH_HOME.split('/').at(-2)
if (version === '0.1.0-test.1' && process.env.FAIL_ROLLBACK_START === '1') process.exit(23)
appendFileSync(process.env.ROLLBACK_HOST_ENV_LOG, JSON.stringify({
  version,
  dshHome: process.env.DSH_HOME,
  skillDirectory: process.env.HARNESS_COMFYUI_SKILL_DIR,
  toolsMode: process.env.DSH_TOOLS_MODE,
}) + '\\n')
const badHealth = version === '0.1.0-test.1' && process.env.FAIL_ROLLBACK_HEALTH === '1'
const readyPath = process.env.ROLLBACK_HOST_READY_FILE
const metricsPath = process.env.ROLLBACK_HOST_METRICS_FILE
const metrics = () => JSON.parse(readFileSync(metricsPath, 'utf8'))
const recordHealthProbe = () => {
  const value = metrics()
  value.healthProbes = (value.healthProbes ?? 0) + 1
  writeFileSync(metricsPath, JSON.stringify(value) + '\\n')
}
const updateMetrics = (delta, event) => {
  const value = metrics()
  value.active += delta
  value.maxActive = Math.max(value.maxActive, value.active)
  value.events.push({ event, version, pid: process.pid })
  writeFileSync(metricsPath, JSON.stringify(value) + '\\n')
}
const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/') {
    recordHealthProbe()
    const entries = badHealth ? [] : [
      { id: '@deepseek-ai/dsh-client-ui-conversation', url: '/conversation.js' },
      { id: 'harness-comfyui', url: '/client.js' },
    ]
    response.end('<script>window.__DSH_BOOT__ = ' + JSON.stringify({ rev: version, entries }) + '</script>')
    return
  }
  if (request.method === 'GET' && request.url === '/client.js') { response.end('client bundle'); return }
  if (request.method === 'POST' && request.url === '/api/agentPreset.list') {
    let body = ''
    request.on('data', chunk => { body += String(chunk) })
    request.on('end', () => {
      let rpcId = 'unknown'
      try { rpcId = JSON.parse(body).rpcId } catch {}
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ type: 'server-response', rpcId, result: { ok: true, value: {
        presets: [{ id: 'harness-comfyui', trust: 'user', isDefault: true }],
        authorable: true,
        hasDocument: true,
      } } }))
    })
    return
  }
  if (request.method === 'POST' && request.url === '/api/pluginStatus/get') {
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ type: 'server-response', result: { ok: true, value: {
      packageName: 'harness-comfyui', packageVersion: version,
      configurationProfile: 'production', hostLoaded: true,
    } } }))
    return
  }
  response.statusCode = 404
  response.end('not found')
})
server.listen(Number(process.env.HARNESS_COMFYUI_SERVER_PORT), process.env.HARNESS_COMFYUI_SERVER_HOST, () => {
  updateMetrics(1, 'started')
  appendFileSync(readyPath, version + ':' + process.pid + '\\n')
  process.stdout.write('rollback-host-ready ' + version + '\\n')
})
let closing = false
const shutdown = () => {
  if (closing) return
  closing = true
  server.close(() => { updateMetrics(-1, 'stopped'); process.exit(0) })
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
if (args.length === 1 && args[0] === '--version') { process.stdout.write('11.7.0\\n'); process.exit(0) }
if (args[0] !== 'install') process.exit(2)
fs.mkdirSync(path.join(process.cwd(), 'node_modules', '.bin'), { recursive: true })
fs.copyFileSync(process.env.FAKE_DSH_SOURCE, path.join(process.cwd(), 'node_modules', '.bin', 'dsh'))
fs.chmodSync(path.join(process.cwd(), 'node_modules', '.bin', 'dsh'), 0o755)
fs.appendFileSync(${JSON.stringify(stageReadyFile)}, process.cwd() + '\\n')
`, 'utf8')
  await chmod(join(binDirectory, 'pnpm'), 0o755)
  return { binDirectory, home }
}

const catalogDiscovery = {
  openapi: '3.1.0', info: { title: 'rollback catalog fixture', version: '0.82.2' },
  'x-imagegen-media-origin': {}, paths: {}, components: {},
}
const sourceDiscovery = {
  status: 'ok', message: null,
  results: [{ openapi: '3.1.0', info: { title: 'rollback source fixture', version: '0.82.2' }, paths: {}, components: {} }],
  page: 1, page_size: 1, total_count: 1,
}

const packageFiles = [
  'lib/config-profile-validator.js',
  'lib/agent.js',
  'agent-presets/harness-comfyui/preset.yml',
  'agent-presets/harness-comfyui/agent.cordis.yml',
  'config/product-agent.json',
  'scripts/deploy/cli.mjs', 'scripts/deploy/contracts.mjs', 'scripts/deploy/install.mjs',
  'scripts/deploy/lifecycle.mjs', 'scripts/deploy/preflight.mjs', 'scripts/deploy/runtime-contract.mjs', 'scripts/deploy/activate.mjs',
  'scripts/deploy/upgrade.mjs', 'scripts/deploy/rollback.mjs', 'scripts/deploy/start.mjs',
  'scripts/deploy/stop.mjs', 'scripts/deploy/status.mjs', 'scripts/deploy/health.mjs',
  'scripts/deploy/logs.mjs', 'scripts/deploy/restart.mjs', 'scripts/profile/materialize.mjs',
  'scripts/profile/start.mjs', 'profiles/comfyui-workbench/package.json',
  'profiles/comfyui-workbench/cordis.patch.yml', 'profiles/comfyui-workbench/pnpm-workspace.yaml',
  'deployment/runtime/package.json', 'deployment/runtime/pnpm-lock.yaml',
  'deployment/runtime/pnpm-workspace.yaml',
]

async function createArtifact(root: string, version: string): Promise<string> {
  const packageRoot = join(root, `package-${version}`)
  await mkdir(packageRoot, { recursive: true })
  const manifest = {
    name: 'harness-comfyui', version, packageManager: 'pnpm@11.7.0', engines: { node: '^22.19.0 || >=24.0.0' },
    exports: { './agent': { default: './lib/agent.js' } },
    bin: { 'harness-comfyui': 'scripts/deploy/cli.mjs' },
    devDependencies: { '@deepseek-ai/dsh': '0.1.0-rc.8', '@deepseek-ai/dsh-base': '0.1.0-rc.8', '@deepseek-ai/dsh-web-app': '0.1.0-rc.8' },
    files: packageFiles,
  }
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  for (const relativePath of packageFiles) {
    const target = join(packageRoot, relativePath)
    await mkdir(resolve(target, '..'), { recursive: true })
    await copyFile(join(repositoryRoot, relativePath), target)
  }
  await writeFrozenRuntimeAndConfiguration(packageRoot)
  const artifactPath = join(root, `harness-comfyui-${version}.tgz`)
  const tar = await runProcess('tar', ['-czf', artifactPath, '-C', root, `package-${version}`], process.env)
  if (tar.status !== 0) throw new Error(`fixture tarball failed: ${tar.stderr}`)
  const normalizedRoot = join(root, `normalized-${version}`)
  await mkdir(normalizedRoot, { recursive: true })
  const extract = await runProcess('tar', ['-xzf', artifactPath, '-C', normalizedRoot], process.env)
  if (extract.status !== 0) throw new Error(extract.stderr)
  await rename(join(normalizedRoot, `package-${version}`), join(normalizedRoot, 'package'))
  const normalizedArtifact = join(root, `normalized-${version}.tgz`)
  const normalizedTar = await runProcess('tar', ['-czf', normalizedArtifact, '-C', normalizedRoot, 'package'], process.env)
  if (normalizedTar.status !== 0) throw new Error(normalizedTar.stderr)
  return normalizedArtifact
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'harness-rollback-cli-'))
  temporaryRoots.push(root)
  const installationRoot = join(root, 'installation')
  const inputPath = join(root, 'installation.json')
  const readyPath = join(root, 'host-ready')
  const metricsPath = join(root, 'host-metrics.json')
  const envLogPath = join(root, 'host-env.jsonl')
  const stageReadyFile = join(root, 'stage-ready')
  const catalogCliPath = join(root, 'catalog-discovery.mjs')
  const sourceCliPath = join(root, 'source-discovery.mjs')
  await writeFile(metricsPath, JSON.stringify({ active: 0, maxActive: 0, healthProbes: 0, events: [] }) + '\n', 'utf8')
  for (const [path, discovery] of [[catalogCliPath, catalogDiscovery], [sourceCliPath, sourceDiscovery]] as const) {
    await writeFile(path, `#!/usr/bin/env node\nif (process.argv[2] !== '--discovery-json') process.exit(2)\nprocess.stdout.write(${JSON.stringify(JSON.stringify(discovery))})\n`, 'utf8')
    await chmod(path, 0o755)
  }
  const port = await findFreePort()
  const installation = {
    schemaVersion: 1, installationId: 'rollback-fixture', root: installationRoot,
    configurationProfile: 'production', host: '127.0.0.1', port,
    paths: {
      dataDir: join(installationRoot, 'shared/data'), runRepositoryFile: join(installationRoot, 'shared/data/runs.sqlite'),
      runDirectory: join(installationRoot, 'shared/runs'), savedMediaDirectory: join(installationRoot, 'shared/saved-media'),
      logDirectory: join(installationRoot, 'shared/logs'),
    },
    comfyui: { defaultInstanceId: 'rollback-instance' },
    source: { catalogCliPath, sourceCliPath, contractId: 'imagegen-source-contract', sourceReleaseVersion: '0.82.2' },
    client: { runRefreshIntervalMs: 1000 }, process: { shutdownTimeoutMs: 10_000 },
  }
  await writeFile(inputPath, JSON.stringify(installation, null, 2) + '\n', 'utf8')
  for (const relativePath of ['shared/data', 'shared/runs', 'shared/saved-media', 'shared/logs']) {
    await mkdir(join(installationRoot, relativePath), { recursive: true })
  }
  await writeFile(join(installationRoot, 'shared/data/keep.txt'), 'keep-data\n', 'utf8')
  await writeFile(join(installationRoot, 'shared/runs/keep.txt'), 'keep-runs\n', 'utf8')
  await writeFile(join(installationRoot, 'shared/saved-media/keep.txt'), 'keep-media\n', 'utf8')
  await writeFile(join(installationRoot, 'shared/logs/keep.txt'), 'keep-logs\n', 'utf8')
  const fake = await createFakePnpm(root, stageReadyFile)
  const env = {
    ...process.env,
    HOME: fake.home,
    USERPROFILE: fake.home,
    PATH: `${fake.binDirectory}${delimiter}${process.env.PATH ?? ''}`,
    FAKE_DSH_SOURCE: join(root, 'fake-dsh.mjs'),
    ROLLBACK_HOST_READY_FILE: readyPath,
    ROLLBACK_HOST_ENV_LOG: envLogPath,
    ROLLBACK_HOST_METRICS_FILE: metricsPath,
    FAIL_ROLLBACK_START: '0',
    FAIL_ROLLBACK_HEALTH: '0',
    DSH_HOME: '/ambient/dsh-home',
    HARNESS_COMFYUI_SKILL_DIR: '/ambient/skills',
    DSH_TOOLS_MODE: 'ambient',
  }
  const firstArtifact = await createArtifact(root, '0.1.0-test.1')
  const candidateArtifact = await createArtifact(root, '0.1.0-test.2')
  return { root, installation, inputPath, firstArtifact, candidateArtifact, readyPath, envLogPath, metricsPath, stageReadyFile, env }
}

type Fixture = Awaited<ReturnType<typeof createFixture>>

async function waitForPassedHealth(fixture: Fixture, version: string, timeoutMs = 30_000): Promise<Record<string, any>> {
  const statePath = join(fixture.installation.root, 'state/active-release.json')
  const healthPath = join(fixture.installation.root, 'state/last-health.json')
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const state = JSON.parse(await readFile(statePath, 'utf8')) as Record<string, any>
      const health = JSON.parse(await readFile(healthPath, 'utf8')) as Record<string, any>
      if (state.activeVersion === version
        && state.installationId === fixture.installation.installationId
        && health.stage === 'health'
        && health.status === 'passed'
        && health.activeRelease?.status === 'passed'
        && health.activeRelease.version === version
        && health.process?.status === 'passed') {
        return health
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await delay(20)
  }
  throw new Error(`timed out waiting for passed health evidence for ${version}`)
}

async function installFixture(fixture: Fixture): Promise<ProcessResult> {
  return runProcess('npm', [
    'exec', '--yes', `--package=${fixture.firstArtifact}`, '--', 'harness-comfyui', 'install',
    '--installation', fixture.inputPath, '--artifact', fixture.firstArtifact,
  ], fixture.env, fixture.root)
}

function stableBin(fixture: Fixture) {
  return join(fixture.installation.root, 'bin/harness-comfyui')
}

async function stopFixture(fixture: Fixture): Promise<ProcessResult> {
  return runProcess(stableBin(fixture), ['stop', '--installation', fixture.inputPath], fixture.env)
}

async function upgradeFixture(fixture: Fixture) {
  const upgrade = spawnProcess(stableBin(fixture), [
    'upgrade', '--installation', fixture.inputPath, '--artifact', fixture.candidateArtifact,
  ], fixture.env)
  await waitForLines(fixture.readyPath, 2)
  await waitForState(join(fixture.installation.root, 'state/active-release.json'), '0.1.0-test.2')
  await waitForPassedHealth(fixture, '0.1.0-test.2')
  return upgrade
}

async function assertSharedContent(fixture: Fixture) {
  await expect(readFile(join(fixture.installation.root, 'shared/data/keep.txt'), 'utf8')).resolves.toBe('keep-data\n')
  await expect(readFile(join(fixture.installation.root, 'shared/runs/keep.txt'), 'utf8')).resolves.toBe('keep-runs\n')
  await expect(readFile(join(fixture.installation.root, 'shared/saved-media/keep.txt'), 'utf8')).resolves.toBe('keep-media\n')
  await expect(readFile(join(fixture.installation.root, 'shared/logs/keep.txt'), 'utf8')).resolves.toBe('keep-logs\n')
}

afterEach(async () => {
  for (const child of runningChildren.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('installed rollback CLI', () => {
  it('swaps active and previous releases, preserves shared data, and keeps one foreground Host', async () => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr || install.stdout).toBe(0)
    const processPath = join(fixture.installation.root, 'state/process.json')
    const statePath = join(fixture.installation.root, 'state/active-release.json')
    const initial = spawnProcess(stableBin(fixture), ['start', '--installation', fixture.inputPath], fixture.env)
    const initialReady = await waitForLines(fixture.readyPath, 1)
    const initialPid = Number(initialReady[0].split(':')[1])
    const upgrade = await upgradeFixture(fixture)
    const afterUpgrade = JSON.parse(await readFile(statePath, 'utf8'))
    expect(afterUpgrade).toMatchObject({
      activeVersion: '0.1.0-test.2',
      previousRelease: {
        activeVersion: '0.1.0-test.1',
        releasePath: join(fixture.installation.root, 'releases/0.1.0-test.1'),
      },
    })
    const secondReady = await waitForLines(fixture.readyPath, 2)
    const secondPid = Number(secondReady[1].split(':')[1])
    expect(secondPid).not.toBe(initialPid)
    expect(JSON.parse(await readFile(fixture.metricsPath, 'utf8'))).toMatchObject({ active: 1, maxActive: 1 })

    await waitForPassedHealth(fixture, '0.1.0-test.2')
    const rollback = spawnProcess(stableBin(fixture), ['rollback', '--installation', fixture.inputPath], fixture.env)
    const thirdReady = await waitForLines(fixture.readyPath, 3)
    const thirdPid = Number(thirdReady[2].split(':')[1])
    const rolledBack = await waitForState(statePath, '0.1.0-test.1')
    expect(thirdPid).not.toBe(secondPid)
    expect(rolledBack).toEqual({
      schemaVersion: 1,
      installationId: fixture.installation.installationId,
      activeVersion: '0.1.0-test.1',
      releasePath: join(fixture.installation.root, 'releases/0.1.0-test.1'),
      previousRelease: {
        activeVersion: '0.1.0-test.2',
        releasePath: join(fixture.installation.root, 'releases/0.1.0-test.2'),
      },
    })
    const health = await runProcess(stableBin(fixture), ['health', '--json', '--installation', fixture.inputPath], fixture.env)
    expect(health.status, health.stderr).toBe(0)
    expect(JSON.parse(health.stdout)).toMatchObject({ stage: 'health', status: 'passed' })
    await assertSharedContent(fixture)

    const secondRollback = spawnProcess(stableBin(fixture), ['rollback', '--installation', fixture.inputPath], fixture.env)
    const fourthReady = await waitForLines(fixture.readyPath, 4)
    const environmentLines = await waitForLines(fixture.envLogPath, 4)
    const fourthPid = Number(fourthReady[3].split(':')[1])
    expect(environmentLines.map(line => JSON.parse(line))).toEqual([
      {
        version: '0.1.0-test.1',
        dshHome: join(fixture.installation.root, 'releases/0.1.0-test.1/dsh-home'),
        skillDirectory: join(fixture.installation.root, 'releases/0.1.0-test.1/package/skills'),
        toolsMode: 'native',
      },
      {
        version: '0.1.0-test.2',
        dshHome: join(fixture.installation.root, 'releases/0.1.0-test.2/dsh-home'),
        skillDirectory: join(fixture.installation.root, 'releases/0.1.0-test.2/package/skills'),
        toolsMode: 'native',
      },
      {
        version: '0.1.0-test.1',
        dshHome: join(fixture.installation.root, 'releases/0.1.0-test.1/dsh-home'),
        skillDirectory: join(fixture.installation.root, 'releases/0.1.0-test.1/package/skills'),
        toolsMode: 'native',
      },
      {
        version: '0.1.0-test.2',
        dshHome: join(fixture.installation.root, 'releases/0.1.0-test.2/dsh-home'),
        skillDirectory: join(fixture.installation.root, 'releases/0.1.0-test.2/package/skills'),
        toolsMode: 'native',
      },
    ])
    const switchedAgain = await waitForState(statePath, '0.1.0-test.2')
    expect(fourthPid).not.toBe(thirdPid)
    expect(switchedAgain.previousRelease).toEqual({
      activeVersion: '0.1.0-test.1',
      releasePath: join(fixture.installation.root, 'releases/0.1.0-test.1'),
    })
    const switchedHealth = await runProcess(stableBin(fixture), ['health', '--json', '--installation', fixture.inputPath], fixture.env)
    expect(switchedHealth.status, switchedHealth.stderr).toBe(0)
    expect(JSON.parse(switchedHealth.stdout)).toMatchObject({ stage: 'health', status: 'passed' })
    const stopped = await stopFixture(fixture)
    expect(stopped.status, `${stopped.stdout}\n${stopped.stderr}`).toBe(0)
    const secondRollbackResult = await secondRollback.output
    expect(secondRollbackResult.status, `${secondRollbackResult.stdout}\n${secondRollbackResult.stderr}`).toBe(0)
    const rollbackResult = await rollback.output
    expect(rollbackResult.status, `${rollbackResult.stdout}\n${rollbackResult.stderr}`).toBe(0)
    const upgradeResult = await upgrade.output
    expect(upgradeResult.status, `${upgradeResult.stdout}\n${upgradeResult.stderr}`).toBe(0)
    const initialResult = await initial.output
    expect(initialResult.status, `${initialResult.stdout}\n${initialResult.stderr}`).toBe(0)
    await expect(lstat(processPath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(JSON.parse(await readFile(fixture.metricsPath, 'utf8'))).toMatchObject({ active: 0, maxActive: 1 })
    await assertSharedContent(fixture)
  }, 60_000)

  it('rejects strict arguments and missing previous state without stopping the current Host', async () => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr || install.stdout).toBe(0)
    const statePath = join(fixture.installation.root, 'state/active-release.json')
    const processPath = join(fixture.installation.root, 'state/process.json')
    const initial = spawnProcess(stableBin(fixture), ['start', '--installation', fixture.inputPath], fixture.env)
    await waitForLines(fixture.readyPath, 1)
    const before = await readFile(statePath, 'utf8')
    const withJson = await runProcess(stableBin(fixture), ['rollback', '--json', '--installation', fixture.inputPath], fixture.env)
    expect(withJson.status).not.toBe(0)
    expect(withJson.stderr).toMatch(/--json is not supported/u)
    const missingPrevious = await runProcess(stableBin(fixture), ['rollback', '--installation', fixture.inputPath], fixture.env)
    expect(missingPrevious.status).not.toBe(0)
    expect(missingPrevious.stderr).toMatch(/previous release/u)
    expect(await readFile(statePath, 'utf8')).toBe(before)
    expect(JSON.parse(await readFile(fixture.metricsPath, 'utf8'))).toMatchObject({ active: 1, maxActive: 1 })
    await stopFixture(fixture)
    const initialResult = await initial.output
    expect(initialResult.status, `${initialResult.stdout}\n${initialResult.stderr}`).toBe(0)
    await expect(lstat(processPath)).rejects.toMatchObject({ code: 'ENOENT' })
  }, 40_000)

  it('fails closed on a corrupt active state before dispatching or stopping the Host', async () => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr || install.stdout).toBe(0)
    const statePath = join(fixture.installation.root, 'state/active-release.json')
    const processPath = join(fixture.installation.root, 'state/process.json')
    const operationsPath = join(fixture.installation.root, 'state/operations.jsonl')
    const initial = spawnProcess(stableBin(fixture), ['start', '--installation', fixture.inputPath], fixture.env)
    await waitForLines(fixture.readyPath, 1)
    const beforeOperations = await readFile(operationsPath, 'utf8')
    const state = JSON.parse(await readFile(statePath, 'utf8'))
    await writeFile(statePath, JSON.stringify({ ...state, activeVersion: '' }) + '\n', 'utf8')
    const result = await runProcess(stableBin(fixture), ['rollback', '--installation', fixture.inputPath], fixture.env)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/active-release|activeVersion/u)
    expect(await readFile(operationsPath, 'utf8')).toBe(beforeOperations)
    expect(JSON.parse(await readFile(processPath, 'utf8')).activeVersion).toBe('0.1.0-test.1')
    expect(JSON.parse(await readFile(fixture.metricsPath, 'utf8'))).toMatchObject({ active: 1, maxActive: 1 })
    await writeFile(statePath, `${JSON.stringify(state)}\n`, 'utf8')
    expect((await stopFixture(fixture)).status).toBe(0)
    expect((await initial.output).status).toBe(0)
  }, 40_000)

  it.each([
    ['restored start', { FAIL_ROLLBACK_START: '1' }, /Host exited|rollback/u],
    ['restored health', { FAIL_ROLLBACK_HEALTH: '1' }, /rollback health check failed/u],
  ])('returns failure and leaves a consistent swapped state when %s fails', async (_name, failureEnv, errorPattern) => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr || install.stdout).toBe(0)
    const initial = spawnProcess(stableBin(fixture), ['start', '--installation', fixture.inputPath], fixture.env)
    await waitForLines(fixture.readyPath, 1)
    const upgrade = await upgradeFixture(fixture)
    const rollbackEnv = { ...fixture.env, ...failureEnv }
    const rollback = spawnProcess(stableBin(fixture), ['rollback', '--installation', fixture.inputPath], rollbackEnv)
    const healthFailure = 'FAIL_ROLLBACK_HEALTH' in failureEnv && failureEnv.FAIL_ROLLBACK_HEALTH === '1'
    if (healthFailure) await waitForLines(fixture.readyPath, 3)
    const result = await rollback.output
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(errorPattern)
    const state = await waitForState(join(fixture.installation.root, 'state/active-release.json'), '0.1.0-test.1')
    expect(state.previousRelease).toEqual({
      activeVersion: '0.1.0-test.2',
      releasePath: join(fixture.installation.root, 'releases/0.1.0-test.2'),
    })
    expect(JSON.parse(await readFile(fixture.metricsPath, 'utf8'))).toMatchObject({ active: 0, maxActive: 1 })
    await expect(lstat(join(fixture.installation.root, 'state/process.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    if (healthFailure) {
      expect(JSON.parse(await readFile(join(fixture.installation.root, 'state/last-health.json'), 'utf8'))).toMatchObject({ status: 'failed' })
      expect(JSON.parse(await readFile(fixture.metricsPath, 'utf8')).healthProbes).toBeGreaterThan(1)
    }
    await assertSharedContent(fixture)
    expect((await upgrade.output).status).toBe(0)
    expect((await initial.output).status).toBe(0)
  }, 60_000)
})

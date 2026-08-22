import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createServer, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

import { afterEach, describe, expect, it } from 'vitest'

import { writeFrozenRuntimeAndConfiguration } from './frozen-artifact-fixture.ts'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const cliScript = join(repositoryRoot, 'scripts/deploy/cli.mjs')
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
  const output = new Promise<ProcessResult>(resolveResult => child.on('close', code => resolveResult({ status: code ?? 1, stdout, stderr })))
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

async function waitForState(path: string, version: string, timeoutMs = 10_000): Promise<Record<string, any>> {
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
if (version !== '0.1.0-test.1' && process.env.FAIL_CANDIDATE_START === '1') process.exit(23)
appendFileSync(process.env.UPGRADE_HOST_ENV_LOG, JSON.stringify({
  version,
  dshHome: process.env.DSH_HOME,
  skillDirectory: process.env.HARNESS_COMFYUI_SKILL_DIR,
  toolsMode: process.env.DSH_TOOLS_MODE,
}) + '\\n')
const badHealth = version !== '0.1.0-test.1' && process.env.FAIL_CANDIDATE_HEALTH === '1'
const readyPath = process.env.UPGRADE_HOST_READY_FILE
const metricsPath = process.env.UPGRADE_HOST_METRICS_FILE
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
      { id: '@deepseek-ai/dsh-client-ui-layout', url: '/layout.js' },
      { id: '@deepseek-ai/dsh-client-ui-conversation', url: '/conversation.js' },
      { id: 'harness-comfyui', url: '/client.js' },
    ]
    response.end('<script>window.__DSH_BOOT__ = ' + JSON.stringify({ rev: version, entries }) + '</script>')
    return
  }
  if (request.method === 'GET' && request.url === '/client.js') { response.end('client bundle'); return }
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
  process.stdout.write('upgrade-host-ready ' + version + '\\n')
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

const discovery = {
  contract_id: 'imagegen-source-contract',
  contract_version: 1,
  openapi: { openapi: '3.1.0', info: { title: 'upgrade fixture', version: '1' }, paths: {} },
}
const packageFiles = [
  'lib/config-profile-validator.js',
  'lib/agent.js',
  'agent-presets/harness-comfyui/preset.yml',
  'agent-presets/harness-comfyui/agent.cordis.yml',
  'config/product-agent.json',
  'scripts/deploy/cli.mjs', 'scripts/deploy/contracts.mjs', 'scripts/deploy/install.mjs',
  'scripts/deploy/lifecycle.mjs', 'scripts/deploy/preflight.mjs', 'scripts/deploy/activate.mjs',
  'scripts/deploy/runtime-contract.mjs',
  'scripts/deploy/upgrade.mjs', 'scripts/deploy/start.mjs', 'scripts/deploy/stop.mjs',
  'scripts/deploy/status.mjs', 'scripts/deploy/health.mjs', 'scripts/deploy/logs.mjs',
  'scripts/profile/materialize.mjs', 'scripts/profile/start.mjs',
  'profiles/comfyui-workbench/package.json', 'profiles/comfyui-workbench/cordis.patch.yml',
  'profiles/comfyui-workbench/pnpm-workspace.yaml', 'deployment/runtime/package.json',
  'deployment/runtime/pnpm-lock.yaml', 'deployment/runtime/pnpm-workspace.yaml',
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

async function createFixture(options: { failCandidateStart?: boolean; failCandidateHealth?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'harness-upgrade-cli-'))
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
  for (const path of [catalogCliPath, sourceCliPath]) {
    await writeFile(path, `#!/usr/bin/env node\nif (process.argv[2] !== '--discovery-json') process.exit(2)\nprocess.stdout.write(${JSON.stringify(JSON.stringify(discovery))})\n`, 'utf8')
    await chmod(path, 0o755)
  }
  const port = await findFreePort()
  const installation = {
    schemaVersion: 1, installationId: 'upgrade-fixture', root: installationRoot,
    configurationProfile: 'production', host: '127.0.0.1', port,
    paths: {
      dataDir: join(installationRoot, 'shared/data'), runRepositoryFile: join(installationRoot, 'shared/data/runs.sqlite'),
      runDirectory: join(installationRoot, 'shared/runs'), savedMediaDirectory: join(installationRoot, 'shared/saved-media'),
      logDirectory: join(installationRoot, 'shared/logs'),
    },
    comfyui: { defaultInstanceId: 'upgrade-instance' },
    source: { catalogCliPath, sourceCliPath, contractId: 'imagegen-source-contract', supportedContractVersions: [1] },
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
    ...process.env, HOME: fake.home, USERPROFILE: fake.home,
    PATH: `${fake.binDirectory}${delimiter}${process.env.PATH ?? ''}`,
    FAKE_DSH_SOURCE: join(root, 'fake-dsh.mjs'),
    UPGRADE_HOST_READY_FILE: readyPath,
    UPGRADE_HOST_ENV_LOG: envLogPath,
    UPGRADE_HOST_METRICS_FILE: metricsPath, FAIL_CANDIDATE_START: options.failCandidateStart ? '1' : '0',
    FAIL_CANDIDATE_HEALTH: options.failCandidateHealth ? '1' : '0',
    DSH_HOME: '/ambient/dsh-home',
    HARNESS_COMFYUI_SKILL_DIR: '/ambient/skills',
    DSH_TOOLS_MODE: 'ambient',
  }
  const firstArtifact = await createArtifact(root, '0.1.0-test.1')
  const candidateArtifact = await createArtifact(root, '0.1.0-test.2')
  return { root, installation, inputPath, firstArtifact, candidateArtifact, readyPath, envLogPath, metricsPath, stageReadyFile, env }
}

async function waitForPassedHealth(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  version: string,
  timeoutMs = 30_000,
): Promise<Record<string, any>> {
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

async function installFixture(fixture: Awaited<ReturnType<typeof createFixture>>): Promise<ProcessResult> {
  return runProcess('npm', [
    'exec', '--yes', `--package=${fixture.firstArtifact}`, '--', 'harness-comfyui', 'install',
    '--installation', fixture.inputPath, '--artifact', fixture.firstArtifact,
  ], fixture.env, fixture.root)
}

async function stopFixture(fixture: Awaited<ReturnType<typeof createFixture>>): Promise<ProcessResult> {
  return runProcess(join(fixture.installation.root, 'bin/harness-comfyui'), [
    'stop', '--installation', fixture.inputPath,
  ], fixture.env)
}

async function assertSharedContent(fixture: Awaited<ReturnType<typeof createFixture>>) {
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

describe('installed upgrade CLI', () => {
  it('implements the fixed upgrade command contract', async () => {
    const result = await runProcess(process.execPath, [cliScript, 'upgrade'], process.env)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('usage: harness-comfyui upgrade --installation <absolute-json> --artifact <absolute-tarball>')
    expect(result.stderr).not.toContain('not implemented in this slice')
  })

  it('does not dispatch the first release CLI or Host when the active state is corrupt', async () => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr || install.stdout).toBe(0)
    const stableBin = join(fixture.installation.root, 'bin/harness-comfyui')
    const activeStatePath = join(fixture.installation.root, 'state/active-release.json')
    const operationsPath = join(fixture.installation.root, 'state/operations.jsonl')
    const beforeOperations = await readFile(operationsPath, 'utf8')
    const activeState = JSON.parse(await readFile(activeStatePath, 'utf8'))
    await writeFile(activeStatePath, `${JSON.stringify({ ...activeState, activeVersion: '' })}\n`, 'utf8')

    const status = await runProcess(stableBin, ['status', '--json', '--installation', fixture.inputPath], fixture.env)
    const start = await runProcess(stableBin, ['start', '--installation', fixture.inputPath], fixture.env)

    expect(status.status).not.toBe(0)
    expect(status.stderr).toMatch(/active-release|activeVersion/u)
    expect(start.status).not.toBe(0)
    expect(start.stderr).toMatch(/active-release|activeVersion/u)
    expect(await readFile(operationsPath, 'utf8')).toBe(beforeOperations)
    await expect(lstat(join(fixture.installation.root, 'state/process.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(lstat(fixture.readyPath)).rejects.toMatchObject({ code: 'ENOENT' })
  }, 30_000)

  it('stages without stopping the old Host, atomically upgrades, preserves shared data, and keeps foreground ownership', async () => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr || install.stdout).toBe(0)
    const stableBin = join(fixture.installation.root, 'bin/harness-comfyui')
    const oldReleaseRoot = join(fixture.installation.root, 'releases/0.1.0-test.1')
    const oldPresetContents = await Promise.all([
      'preset.yml',
      'agent.cordis.yml',
    ].map(relativePath => readFile(join(oldReleaseRoot, 'dsh-home/.agent-presets/harness-comfyui', relativePath), 'utf8')))
    const oldSkillStats = await lstat(join(oldReleaseRoot, 'package/skills'))
    expect(oldSkillStats.isDirectory()).toBe(true)
    const stableBinBeforeUpgrade = await readFile(stableBin, 'utf8')
    const initialStageLines = (await readFile(fixture.stageReadyFile, 'utf8')).trim().split('\n').filter(Boolean).length
    const processPath = join(fixture.installation.root, 'state/process.json')
    const oldHost = spawnProcess(stableBin, ['start', '--installation', fixture.inputPath], fixture.env)
    const initialReady = await waitForLines(fixture.readyPath, 1)
    const oldState = await waitForState(processPath, '0.1.0-test.1')
    expect(initialReady[0]).toMatch(/^0\.1\.0-test\.1:/u)

    const upgrade = spawnProcess(stableBin, [
      'upgrade', '--installation', fixture.inputPath, '--artifact', fixture.candidateArtifact,
    ], fixture.env)
    await waitForLines(fixture.stageReadyFile, initialStageLines + 1)
    expect(JSON.parse(await readFile(fixture.metricsPath, 'utf8'))).toMatchObject({ active: 1 })
    expect(JSON.parse(await readFile(join(fixture.installation.root, 'state/active-release.json'), 'utf8'))).toMatchObject({ activeVersion: '0.1.0-test.1' })
    expect(await readFile(stableBin, 'utf8')).toBe(stableBinBeforeUpgrade)
    const candidateReady = await waitForLines(fixture.readyPath, 2)
    const environmentLines = await waitForLines(fixture.envLogPath, 2)
    expect(candidateReady[1]).toMatch(/^0\.1\.0-test\.2:/u)
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
    ])
    const candidateState = await waitForState(join(fixture.installation.root, 'state/active-release.json'), '0.1.0-test.2')
    expect(candidateState.previousRelease).toEqual({ activeVersion: '0.1.0-test.1', releasePath: join(fixture.installation.root, 'releases/0.1.0-test.1') })
    expect(candidateState.releasePath).toBe(join(fixture.installation.root, 'releases/0.1.0-test.2'))
    for (const relativePath of [
      'dsh-home/.agent-presets/harness-comfyui/preset.yml',
      'dsh-home/.agent-presets/harness-comfyui/agent.cordis.yml',
    ]) {
      await expect(lstat(join(candidateState.releasePath, relativePath))).resolves.toBeDefined()
    }
    const candidateSkillStats = await lstat(join(candidateState.releasePath, 'package/skills'))
    expect(candidateSkillStats.isDirectory()).toBe(true)
    for (const relativePath of ['dsh-home/skills', '.dsh/skills', '.agents/skills']) {
      await expect(lstat(join(candidateState.releasePath, relativePath))).rejects.toMatchObject({ code: 'ENOENT' })
    }
    await expect(lstat(oldReleaseRoot)).resolves.toBeDefined()
    await expect(readFile(join(oldReleaseRoot, 'dsh-home/.agent-presets/harness-comfyui/preset.yml'), 'utf8'))
      .resolves.toBe(oldPresetContents[0])
    await expect(readFile(join(oldReleaseRoot, 'dsh-home/.agent-presets/harness-comfyui/agent.cordis.yml'), 'utf8'))
      .resolves.toBe(oldPresetContents[1])
    const oldSkillStatsAfter = await lstat(join(oldReleaseRoot, 'package/skills'))
    expect(oldSkillStatsAfter.isDirectory()).toBe(true)
    const candidateProfile = JSON.parse(await readFile(join(candidateState.releasePath, 'dsh-home/profiles/comfyui-workbench/package.json'), 'utf8'))
    expect(candidateProfile.dependencies['harness-comfyui']).toBe(`file:${fixture.candidateArtifact}`)
    expect(candidateProfile.dependencies['harness-comfyui']).not.toBe(`file:${candidateState.releasePath}/package`)
    expect(JSON.parse(await readFile(processPath, 'utf8')).pid).not.toBe(oldState.pid)
    await assertSharedContent(fixture)

    const candidateHealth = await runProcess(stableBin, ['health', '--json', '--installation', fixture.inputPath], fixture.env)
    expect(candidateHealth.status, candidateHealth.stderr).toBe(0)
    expect(JSON.parse(candidateHealth.stdout)).toMatchObject({ stage: 'health', status: 'passed' })
    expect((await stopFixture(fixture)).status).toBe(0)
    expect((await upgrade.output).status).toBe(0)
    expect((await oldHost.output).status).toBe(0)
    await expect(lstat(processPath)).rejects.toMatchObject({ code: 'ENOENT' })
    const metrics = JSON.parse(await readFile(fixture.metricsPath, 'utf8')) as { active: number; maxActive: number }
    expect(metrics).toMatchObject({ active: 0, maxActive: 1 })
    await assertSharedContent(fixture)
  }, 40_000)

  it('rejects same-version and pre-existing candidate releases before stopping the old Host', async () => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr || install.stdout).toBe(0)
    const stableBin = join(fixture.installation.root, 'bin/harness-comfyui')
    const processPath = join(fixture.installation.root, 'state/process.json')
    const activeStatePath = join(fixture.installation.root, 'state/active-release.json')
    const oldHost = spawnProcess(stableBin, ['start', '--installation', fixture.inputPath], fixture.env)
    await waitForLines(fixture.readyPath, 1)
    const beforeState = await readFile(activeStatePath, 'utf8')

    const sameVersion = await runProcess(stableBin, [
      'upgrade', '--installation', fixture.inputPath, '--artifact', fixture.firstArtifact,
    ], fixture.env)
    expect(sameVersion.status).not.toBe(0)
    expect(sameVersion.stderr).toMatch(/already exists/u)
    expect(await readFile(activeStatePath, 'utf8')).toBe(beforeState)
    expect(JSON.parse(await readFile(processPath, 'utf8')).activeVersion).toBe('0.1.0-test.1')
    expect(JSON.parse(await readFile(fixture.metricsPath, 'utf8'))).toMatchObject({ active: 1, maxActive: 1 })

    const candidateRoot = join(fixture.installation.root, 'releases/0.1.0-test.2')
    await mkdir(candidateRoot, { recursive: true })
    const sentinel = join(candidateRoot, 'sentinel.txt')
    await writeFile(sentinel, 'pre-existing\n', 'utf8')
    const preExisting = await runProcess(stableBin, [
      'upgrade', '--installation', fixture.inputPath, '--artifact', fixture.candidateArtifact,
    ], fixture.env)
    expect(preExisting.status).not.toBe(0)
    expect(preExisting.stderr).toMatch(/already exists/u)
    expect(await readFile(sentinel, 'utf8')).toBe('pre-existing\n')
    expect(await readFile(activeStatePath, 'utf8')).toBe(beforeState)
    expect(JSON.parse(await readFile(processPath, 'utf8')).activeVersion).toBe('0.1.0-test.1')
    expect(JSON.parse(await readFile(fixture.metricsPath, 'utf8'))).toMatchObject({ active: 1, maxActive: 1 })

    expect((await stopFixture(fixture)).status).toBe(0)
    expect((await oldHost.output).status).toBe(0)
  }, 40_000)

  it('rejects a reused PID before candidate staging without signaling the replacement process', async () => {
    const fixture = await createFixture()
    const install = await installFixture(fixture)
    expect(install.status, install.stderr || install.stdout).toBe(0)

    const stableBin = join(fixture.installation.root, 'bin/harness-comfyui')
    const activeStatePath = join(fixture.installation.root, 'state/active-release.json')
    const processPath = join(fixture.installation.root, 'state/process.json')
    const candidateRoot = join(fixture.installation.root, 'releases/0.1.0-test.2')
    const beforeActiveState = await readFile(activeStatePath, 'utf8')
    const replacement = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      cwd: repositoryRoot,
      env: fixture.env,
      stdio: 'ignore',
    })
    runningChildren.push(replacement)
    if (replacement.pid === undefined) throw new Error('replacement process did not provide a PID')
    try {
      await delay(100)
      const processState = {
        schemaVersion: 1,
        installationId: fixture.installation.installationId,
        activeVersion: '0.1.0-test.1',
        pid: replacement.pid,
        operationId: 'reused-operation',
        startedAt: '2026-08-22T00:00:00.000Z',
        host: fixture.installation.host,
        port: fixture.installation.port,
        processIdentity: { startTime: 'not-the-current-start', command: '/not/the/current/process' },
      }
      await writeFile(processPath, `${JSON.stringify(processState, null, 2)}\n`, 'utf8')

      const result = await runProcess(stableBin, [
        'upgrade', '--installation', fixture.inputPath, '--artifact', fixture.candidateArtifact,
      ], fixture.env)

      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/process identity mismatch/u)
      expect(await readFile(activeStatePath, 'utf8')).toBe(beforeActiveState)
      expect(await readFile(processPath, 'utf8')).toBe(`${JSON.stringify(processState, null, 2)}\n`)
      await expect(lstat(candidateRoot)).rejects.toMatchObject({ code: 'ENOENT' })
      expect(JSON.parse(await readFile(fixture.metricsPath, 'utf8'))).toMatchObject({ active: 0, maxActive: 0 })
      expect(() => process.kill(replacement.pid!, 0)).not.toThrow()
    } finally {
      if (replacement.exitCode === null && replacement.signalCode === null) {
        replacement.kill('SIGTERM')
        await new Promise(resolveClose => replacement.once('close', resolveClose))
      }
    }
  }, 30_000)

  it.each([
    ['candidate start failure', { failCandidateStart: true }],
    ['candidate health failure', { failCandidateHealth: true }],
  ])('automatically restores the previous release after %s and exits failure after external stop', async (_name, options) => {
    const fixture = await createFixture(options)
    const install = await installFixture(fixture)
    expect(install.status, install.stderr || install.stdout).toBe(0)
    const stableBin = join(fixture.installation.root, 'bin/harness-comfyui')
    const processPath = join(fixture.installation.root, 'state/process.json')
    const oldHost = spawnProcess(stableBin, ['start', '--installation', fixture.inputPath], fixture.env)
    await waitForLines(fixture.readyPath, 1)
    const upgrade = spawnProcess(stableBin, [
      'upgrade', '--installation', fixture.inputPath, '--artifact', fixture.candidateArtifact,
    ], fixture.env)
    const readyLines = await waitForLines(
      fixture.readyPath,
      'failCandidateStart' in options && options.failCandidateStart ? 2 : 3,
      30_000,
    )
    expect(readyLines.at(-1)).toMatch(/^0\.1\.0-test\.1:/u)
    const recoveredState = await waitForState(join(fixture.installation.root, 'state/active-release.json'), '0.1.0-test.1')
    expect(recoveredState.previousRelease).toBeNull()
    const recoveredProcessState = await waitForState(processPath, '0.1.0-test.1')
    expect(recoveredProcessState.activeVersion).toBe('0.1.0-test.1')
    await waitForPassedHealth(fixture, '0.1.0-test.1')
    if ('failCandidateHealth' in options && options.failCandidateHealth) {
      const healthMetrics = JSON.parse(await readFile(fixture.metricsPath, 'utf8')) as { healthProbes: number }
      expect(healthMetrics.healthProbes).toBeGreaterThan(1)
    }
    await assertSharedContent(fixture)
    const candidateRoot = join(fixture.installation.root, 'releases/0.1.0-test.2')
    await expect(lstat(candidateRoot)).resolves.toBeDefined()
    expect(recoveredState.releasePath).not.toBe(candidateRoot)
    expect((await stopFixture(fixture)).status).toBe(0)
    expect((await upgrade.output).status).toBe(1)
    expect((await oldHost.output).status).toBe(0)
    await expect(lstat(processPath)).rejects.toMatchObject({ code: 'ENOENT' })
    const metrics = JSON.parse(await readFile(fixture.metricsPath, 'utf8')) as { active: number; maxActive: number }
    expect(metrics).toMatchObject({ active: 0, maxActive: 1 })
    await assertSharedContent(fixture)
  }, 40_000)
})

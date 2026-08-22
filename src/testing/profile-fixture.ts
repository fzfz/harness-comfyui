import { createHash } from 'node:crypto'
import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { access, chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createConnection, createServer, type AddressInfo } from 'node:net'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import type { Readable } from 'node:stream'

import {
  runRealBrowserProbe,
  type RealBrowserProbe,
  type RealBrowserProbeOptions,
} from './browser-cdp.ts'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const qualityArtifactManifestPath = resolve(repositoryRoot, '.release/quality/artifact.json')
const profileName = 'comfyui-workbench'
const fixtureConfigurations = ['test', 'release-smoke'] as const
type FixtureConfiguration = (typeof fixtureConfigurations)[number]
const profileBundles = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  'harness-comfyui',
] as const
const discovery = {
  contract_id: 'imagegen-source-contract',
  contract_version: 1,
  openapi: {
    openapi: '3.1.0',
    info: { title: 'harness-comfyui composition test discovery', version: '1' },
    paths: {},
  },
}
const harnessEnvironmentKeys = [
  'HARNESS_COMFYUI_CONFIGURATION_PROFILE',
  'HARNESS_COMFYUI_DATA_DIR',
  'HARNESS_COMFYUI_RUN_REPOSITORY_FILE',
  'HARNESS_COMFYUI_RUN_DIRECTORY',
  'HARNESS_COMFYUI_SAVED_MEDIA_DIRECTORY',
  'HARNESS_COMFYUI_LOG_DIRECTORY',
  'HARNESS_COMFYUI_DEFAULT_INSTANCE_ID',
  'HARNESS_COMFYUI_CATALOG_CLI_PATH',
  'HARNESS_COMFYUI_SOURCE_CLI_PATH',
  'HARNESS_COMFYUI_CLIENT_RUN_REFRESH_INTERVAL_MS',
  'HARNESS_COMFYUI_SERVER_HOST',
  'HARNESS_COMFYUI_SERVER_PORT',
]

type JsonObject = Record<string, unknown>
type FixtureChild = ChildProcessByStdio<null, Readable, Readable>

export interface ArtifactManifest {
  tarballPath: string
  filename: string
  version: string
  commit: string
  byteLength: number
  sha256: string
}

export interface BootEntry {
  id: string
  url: string
  rev: string
  inject?: string[]
  immediately?: boolean
}

export interface BootGraph {
  rev: string
  entries: BootEntry[]
}

export interface InstalledProfileEvidence {
  profileBundles: string[]
  profileVersions: {
    harnessComfyui: string
    dshBase: string | undefined
    dshWebApp: string | undefined
  }
  runtimeBundleVersions: {
    cliDsh: string
    dshBase: string
    dshWebApp: string
  }
  hostLoaderRow: {
    id: string
    name: string
    configurationExpression: string
  }
}

export interface ClientPackageEvidence {
  exportTarget: string
  modulePath: string
  moduleSource: string
}

export interface CleanupEvidence {
  processExit: { code: number | null; signal: NodeJS.Signals | null } | undefined
  processStateRemoved: boolean
  portReleased: boolean
  installationRemoved: boolean
  noChildProcesses: boolean
  dshHomeRemoved: boolean
}

export interface ProfileFixtureOptions {
  configuration: FixtureConfiguration
  artifactManifestPath?: string
}

export interface ProfileFixture {
  readonly artifact: ArtifactManifest
  readonly configuration: FixtureConfiguration
  readonly dshHome: string
  readonly runtimeCwd: string
  readonly installationRoot: string
  readonly installationPath: string
  readonly stableCliPath: string
  readonly profileManifestPath: string
  readonly cleanupEvidence: CleanupEvidence
  readonly port: number
  preflight(): Promise<JsonObject>
  install(): Promise<void>
  start(): Promise<void>
  restart(): Promise<void>
  status(): Promise<JsonObject>
  health(): Promise<JsonObject>
  logs(options?: { source?: 'stdout' | 'stderr' | 'operations' | 'all'; lines?: number }): Promise<string>
  spawnCli(args: string[], environmentOverrides?: Record<string, string>): ProductCliProcess
  stop(): Promise<void>
  dispose(): Promise<void>
  readBootGraph(): Promise<BootGraph>
  readInstalledProfileEvidence(): Promise<InstalledProfileEvidence>
  readClientPackageEvidence(): Promise<ClientPackageEvidence>
  readClientModule(id: string): Promise<string>
  runRealBrowserProbe(options?: RealBrowserProbeOptions): Promise<RealBrowserProbe>
}

export interface ProfileVersionReader {
  profilePackageVersion(packageName: string): Promise<string | undefined>
  runtimePackageVersion(packageName: string): Promise<string>
}

export async function readProfileVersionEvidence(reader: ProfileVersionReader): Promise<Pick<InstalledProfileEvidence, 'profileVersions' | 'runtimeBundleVersions'>> {
  const harnessComfyui = await reader.profilePackageVersion('harness-comfyui')
  if (harnessComfyui === undefined || harnessComfyui.length === 0) {
    throw new Error('materialized profile harness-comfyui version must be a non-empty string')
  }
  return {
    profileVersions: {
      harnessComfyui,
      dshBase: await reader.profilePackageVersion('@deepseek-ai/dsh-base'),
      dshWebApp: await reader.profilePackageVersion('@deepseek-ai/dsh-web-app'),
    },
    runtimeBundleVersions: {
      cliDsh: await reader.runtimePackageVersion('@deepseek-ai/dsh'),
      dshBase: await reader.runtimePackageVersion('@deepseek-ai/dsh-base'),
      dshWebApp: await reader.runtimePackageVersion('@deepseek-ai/dsh-web-app'),
    },
  }
}

export interface ProductCliResult {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}

export interface ProductCliProcess {
  readonly pid: number
  readonly result: Promise<ProductCliResult>
}

type CommandResult = ProductCliResult

function asString(value: unknown, property: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`artifact manifest ${property} must be a non-empty string`)
  return value
}

function parseArtifactManifest(value: unknown): ArtifactManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`artifact manifest ${qualityArtifactManifestPath} must be an object`)
  const manifest = value as JsonObject
  const expectedKeys = ['tarballPath', 'filename', 'version', 'commit', 'byteLength', 'sha256']
  if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify(expectedKeys.sort())) {
    throw new TypeError('artifact manifest must contain exactly tarballPath, filename, version, commit, byteLength, and sha256')
  }
  const parsed: ArtifactManifest = {
    tarballPath: resolve(asString(manifest.tarballPath, 'tarballPath')),
    filename: asString(manifest.filename, 'filename'),
    version: asString(manifest.version, 'version'),
    commit: asString(manifest.commit, 'commit'),
    byteLength: manifest.byteLength as number,
    sha256: asString(manifest.sha256, 'sha256'),
  }
  if (basename(parsed.tarballPath) !== parsed.filename) throw new TypeError('artifact manifest filename does not match tarballPath')
  if (!Number.isSafeInteger(parsed.byteLength) || parsed.byteLength <= 0) throw new TypeError('artifact manifest byteLength must be a positive integer')
  if (!/^[a-f0-9]{64}$/u.test(parsed.sha256)) throw new TypeError('artifact manifest sha256 must be a lowercase SHA-256')
  if (!/^[a-f0-9]{40}$/u.test(parsed.commit)) throw new TypeError('artifact manifest commit must be a lowercase git commit')
  return parsed
}

async function sha256File(path: string): Promise<string> {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', chunk => hash.update(chunk))
    stream.once('error', reject)
    stream.once('end', () => resolveHash(hash.digest('hex')))
  })
}

async function readArtifactManifest(manifestPath = qualityArtifactManifestPath): Promise<ArtifactManifest> {
  const resolvedManifestPath = resolve(manifestPath)
  const manifest = parseArtifactManifest(JSON.parse(await readFile(resolvedManifestPath, 'utf8')))
  const [file, digest] = await Promise.all([
    stat(manifest.tarballPath),
    sha256File(manifest.tarballPath),
  ])
  if (!file.isFile()) throw new Error(`artifact tarball is not a file: ${manifest.tarballPath}`)
  if (manifest.byteLength !== file.size) throw new Error(`artifact byteLength changed: manifest=${manifest.byteLength} actual=${file.size}`)
  if (manifest.sha256 !== digest) throw new Error(`artifact sha256 changed: manifest=${manifest.sha256} actual=${digest}`)
  return manifest
}

async function findFreePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('fixture port server did not expose an address')
  const port = (address as AddressInfo).port
  await new Promise<void>((resolveClose, reject) => server.close(error => error === undefined ? resolveClose() : reject(error)))
  return port
}

function fixtureEnvironment(root: string): NodeJS.ProcessEnv {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !harnessEnvironmentKeys.includes(key)),
  )
  const home = join(root, 'home')
  const npmCache = join(root, 'npm-cache')
  return {
    ...environment,
    HOME: home,
    USERPROFILE: home,
    NPM_CONFIG_CACHE: npmCache,
    npm_config_cache: npmCache,
  }
}

function discoveryScriptSource(): string {
  return `#!/usr/bin/env node
if (process.argv.length !== 3 || process.argv[2] !== '--discovery-json') process.exit(2)
process.stdout.write(${JSON.stringify(JSON.stringify(discovery))})
`
}

async function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; onChild?: (child: FixtureChild) => void },
): Promise<CommandResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    options.onChild?.(child)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.once('error', reject)
    child.once('close', (code, signal) => resolveResult({ code, signal, stdout, stderr }))
  })
}

async function waitUntil<T>(
  probe: () => Promise<T | undefined>,
  description: string,
  timeoutMs = 30000,
  shouldAbortOnError: () => boolean = () => false,
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const result = await probe()
      if (result !== undefined) return result
    } catch (error) {
      if (shouldAbortOnError()) throw error
      lastError = error
    }
    await delay(100)
  }
  throw new Error(`timed out waiting for ${description}${lastError === undefined ? '' : `: ${String(lastError)}`}`)
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2000)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function parseBootGraph(html: string): BootGraph {
  const match = html.match(/window\.__DSH_BOOT__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/u)
  if (!match?.[1]) throw new Error('web app HTML did not contain window.__DSH_BOOT__')
  const graph = JSON.parse(match[1]) as BootGraph
  if (typeof graph.rev !== 'string' || !Array.isArray(graph.entries)) throw new Error('web app boot graph has an invalid shape')
  return graph
}

function parseJsonResult(result: CommandResult, command: string): JsonObject {
  if (result.code !== 0) throw new Error(`${command} failed with ${result.code ?? result.signal}: ${result.stderr || result.stdout}`)
  const lines = result.stdout.trim().split(/\r?\n/u).filter(Boolean)
  const line = lines.at(-1)
  if (line === undefined) throw new Error(`${command} returned no JSON evidence`)
  const value = JSON.parse(line) as unknown
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${command} returned a non-object JSON evidence`)
  return value as JsonObject
}

async function readPackageVersion(path: string, property: string): Promise<string> {
  const manifest = JSON.parse(await readFile(path, 'utf8')) as JsonObject
  return asString(manifest.version, property)
}

function parseHostLoaderRow(patch: string): InstalledProfileEvidence['hostLoaderRow'] {
  const row = patch.match(/- id:\s*(harness-comfyui)\s+name:\s*(harness-comfyui)\s+config:\s+configurationProfile:\s*([^\n]+)/u)
  if (!row?.[1] || !row[2] || !row[3]) throw new Error('materialized profile omitted the harness Host Loader row')
  return {
    id: row[1],
    name: row[2],
    configurationExpression: row[3],
  }
}

class ProfileFixtureImpl implements ProfileFixture {
  readonly artifact: ArtifactManifest
  readonly configuration: FixtureConfiguration
  readonly dshHome: string
  readonly runtimeCwd: string
  readonly installationRoot: string
  readonly installationPath: string
  readonly stableCliPath: string
  readonly profileManifestPath: string
  readonly cleanupEvidence: CleanupEvidence = {
    processExit: undefined,
    processStateRemoved: false,
    portReleased: false,
    installationRemoved: false,
    noChildProcesses: false,
    dshHomeRemoved: false,
  }
  private readonly testRoot: string
  private readonly environment: NodeJS.ProcessEnv
  private readonly currentPort: number
  private readonly children = new Set<FixtureChild>()
  private readonly foregroundResults: Promise<CommandResult>[] = []
  private installed = false
  private stopped = false
  private disposed = false
  private startChild: FixtureChild | undefined
  private startResultPromise: Promise<CommandResult> | undefined
  private restartChild: FixtureChild | undefined
  private restartResultPromise: Promise<CommandResult> | undefined

  constructor(artifact: ArtifactManifest, configuration: FixtureConfiguration, testRoot: string, port: number) {
    this.artifact = artifact
    this.configuration = configuration
    this.testRoot = testRoot
    this.runtimeCwd = join(testRoot, 'command-cwd')
    this.installationRoot = join(testRoot, 'installation')
    this.dshHome = join(this.installationRoot, 'releases', artifact.version, 'dsh-home')
    this.installationPath = join(testRoot, 'installation.json')
    this.stableCliPath = join(this.installationRoot, 'bin/harness-comfyui')
    this.profileManifestPath = join(this.installationRoot, 'releases', artifact.version, 'dsh-home/profiles', profileName, 'package.json')
    this.environment = fixtureEnvironment(testRoot)
    this.currentPort = port
  }

  get port(): number {
    return this.currentPort
  }

  private trackChild(child: FixtureChild): FixtureChild {
    this.children.add(child)
    child.once('close', () => this.children.delete(child))
    return child
  }

  private spawnStable(args: string[], environmentOverrides: Record<string, string> = {}): FixtureChild {
    if (!this.installed) throw new Error('product CLI install has not completed')
    const child = spawn(this.stableCliPath, args, {
      cwd: this.runtimeCwd,
      env: { ...this.environment, ...environmentOverrides },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    return this.trackChild(child)
  }

  private async runStable(args: string[]): Promise<CommandResult> {
    const child = this.spawnStable(args)
    return this.readChildResult(child)
  }

  private readChildResult(child: FixtureChild): Promise<CommandResult> {
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    return new Promise((resolveResult, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolveResult({ code, signal, stdout, stderr }))
    })
  }

  spawnCli(args: string[], environmentOverrides: Record<string, string> = {}): ProductCliProcess {
    if (this.disposed) throw new Error('profile fixture is already disposed')
    const child = this.spawnStable(args, environmentOverrides)
    if (child.pid === undefined) throw new Error('product CLI process did not provide a PID')
    const result = this.readChildResult(child)
    this.foregroundResults.push(result)
    return { pid: child.pid, result }
  }

  async preflight(): Promise<JsonObject> {
    if (this.disposed) throw new Error('profile fixture is already disposed')
    const result = await runCommand('npm', [
      'exec',
      '--yes',
      `--package=${this.artifact.tarballPath}`,
      '--',
      'harness-comfyui',
      'preflight',
      '--installation', this.installationPath,
      '--artifact', this.artifact.tarballPath,
    ], {
      cwd: this.runtimeCwd,
      env: this.environment,
      onChild: child => this.trackChild(child),
    })
    return parseJsonResult(result, 'product CLI preflight')
  }

  async install(): Promise<void> {
    if (this.disposed) throw new Error('profile fixture is already disposed')
    if (this.installed) return
    await mkdir(this.runtimeCwd, { recursive: true })
    const result = await runCommand('npm', [
      'exec',
      '--yes',
      `--package=${this.artifact.tarballPath}`,
      '--',
      'harness-comfyui',
      'install',
      '--installation', this.installationPath,
      '--artifact', this.artifact.tarballPath,
    ], {
      cwd: this.runtimeCwd,
      env: this.environment,
      onChild: child => this.trackChild(child),
    })
    if (result.code !== 0) throw new Error(`product CLI install failed with ${result.code ?? result.signal}: ${result.stderr || result.stdout}`)
    await access(this.stableCliPath)
    await access(this.profileManifestPath)
    this.installed = true
    this.stopped = false
  }

  async start(): Promise<void> {
    if (this.disposed) throw new Error('profile fixture is already disposed')
    if (this.stopped) throw new Error('profile fixture has already been stopped')
    if (this.startChild !== undefined) throw new Error('profile fixture is already running')
    const child = this.spawnStable(['start', '--installation', this.installationPath])
    this.startChild = child
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    this.startResultPromise = new Promise<CommandResult>((resolveResult, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolveResult({ code, signal, stdout, stderr }))
    })
    this.foregroundResults.push(this.startResultPromise)

    await waitUntil(async () => {
      const result = await this.status().catch(() => undefined)
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`product CLI start exited before readiness: ${stderr || stdout}`)
      }
      if (result?.status !== 'running') return undefined
      const response = await fetchWithTimeout(`http://127.0.0.1:${this.currentPort}/`)
      if (!response.ok) return undefined
      parseBootGraph(await response.text())
      return true
    }, 'product CLI boot readiness', 60000, () => child.exitCode !== null || child.signalCode !== null)
  }

  async restart(): Promise<void> {
    if (this.disposed) throw new Error('profile fixture is already disposed')
    if (!this.installed) throw new Error('product CLI install has not completed')
    if (this.stopped) throw new Error('profile fixture has already been stopped')
    if (this.restartChild !== undefined) throw new Error('profile fixture restart is already running')
    const child = this.spawnStable(['restart', '--installation', this.installationPath])
    this.restartChild = child
    let stdout = ''
    let stderr = ''
    this.restartResultPromise = new Promise<CommandResult>((resolveResult, reject) => {
      child.stdout.on('data', chunk => { stdout += String(chunk) })
      child.stderr.on('data', chunk => { stderr += String(chunk) })
      child.once('error', reject)
      child.once('close', (code, signal) => resolveResult({ code, signal, stdout, stderr }))
    })
    this.foregroundResults.push(this.restartResultPromise)

    await waitUntil(async () => {
      const result = await this.status().catch(() => undefined)
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`product CLI restart exited before readiness: ${stderr || stdout}`)
      }
      if (result?.status !== 'running') return undefined
      const response = await fetchWithTimeout(`http://127.0.0.1:${this.currentPort}/`)
      if (!response.ok) return undefined
      parseBootGraph(await response.text())
      return true
    }, 'product CLI restart readiness', 60000, () => child.exitCode !== null || child.signalCode !== null)
  }

  async status(): Promise<JsonObject> {
    return parseJsonResult(await this.runStable(['status', '--json', '--installation', this.installationPath]), 'status')
  }

  async health(): Promise<JsonObject> {
    return parseJsonResult(await this.runStable(['health', '--json', '--installation', this.installationPath]), 'health')
  }

  async logs(options: { source?: 'stdout' | 'stderr' | 'operations' | 'all'; lines?: number } = {}): Promise<string> {
    const source = options.source ?? 'all'
    const lines = String(options.lines ?? 50)
    const result = await this.runStable([
      'logs', '--installation', this.installationPath,
      '--source', source,
      '--lines', lines,
    ])
    if (result.code !== 0) throw new Error(`logs failed with ${result.code ?? result.signal}: ${result.stderr || result.stdout}`)
    return result.stdout
  }

  async stop(): Promise<void> {
    if (!this.installed || this.stopped) return
    const result = await this.runStable(['stop', '--installation', this.installationPath])
    if (result.code !== 0) throw new Error(`product CLI stop failed with ${result.code ?? result.signal}: ${result.stderr || result.stdout}`)
    const lifecycleResults = [...this.foregroundResults]
    const requiredSuccessfulResults = [this.startResultPromise, this.restartResultPromise].filter(
      (promise): promise is Promise<CommandResult> => promise !== undefined,
    )
    let lifecycleFailure: Error | undefined
    if (lifecycleResults.length > 0) {
      const results = await Promise.all(lifecycleResults)
      for (const [index, lifecycleResult] of results.entries()) {
        if (!requiredSuccessfulResults.includes(lifecycleResults[index]!)) continue
        if (lifecycleResult.code !== 0 || lifecycleResult.signal !== null) {
          const output = [
            lifecycleResult.stderr.trim() ? `stderr: ${lifecycleResult.stderr.trim()}` : '',
            lifecycleResult.stdout.trim() ? `stdout: ${lifecycleResult.stdout.trim()}` : '',
          ].filter(Boolean).join('\n')
          lifecycleFailure = new Error(
            `product CLI lifecycle command ${index + 1} exited with ${lifecycleResult.code ?? lifecycleResult.signal}${output ? `\n${output}` : ''}`,
          )
          break
        }
      }
      const firstResult = results[0]
      this.cleanupEvidence.processExit = { code: firstResult.code, signal: firstResult.signal }
      this.startChild = undefined
      this.startResultPromise = undefined
      this.restartChild = undefined
      this.restartResultPromise = undefined
      this.foregroundResults.length = 0
    }
    await waitUntil(async () => {
      try {
        await access(join(this.installationRoot, 'state/process.json'))
        return undefined
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
        throw error
      }
    }, 'product CLI process state cleanup', 10000)
    this.cleanupEvidence.processStateRemoved = true
    this.cleanupEvidence.portReleased = await this.waitForPortReleased()
    this.stopped = true
    if (lifecycleFailure !== undefined) throw lifecycleFailure
  }

  private async waitForPortReleased(): Promise<boolean> {
    return waitUntil(async () => await new Promise<boolean | undefined>(resolveResult => {
      const socket = createConnection({ host: '127.0.0.1', port: this.currentPort })
      const timer = setTimeout(() => {
        socket.destroy()
        resolveResult(undefined)
      }, 250)
      socket.once('connect', () => {
        clearTimeout(timer)
        socket.destroy()
        resolveResult(false)
      })
      socket.once('error', () => {
        clearTimeout(timer)
        socket.destroy()
        resolveResult(true)
      })
    }), 'product CLI port release', 10000)
  }

  async readBootGraph(): Promise<BootGraph> {
    const response = await fetchWithTimeout(`http://127.0.0.1:${this.currentPort}/`)
    if (!response.ok) throw new Error(`web app returned HTTP ${response.status}`)
    return parseBootGraph(await response.text())
  }

  private async activeReleaseRoot(): Promise<string> {
    const state = JSON.parse(await readFile(join(this.installationRoot, 'state/active-release.json'), 'utf8')) as JsonObject
    if (typeof state.releasePath !== 'string' || !isAbsolute(state.releasePath)) throw new Error('active release state has no absolute releasePath')
    return state.releasePath
  }

  async readInstalledProfileEvidence(): Promise<InstalledProfileEvidence> {
    const releaseRoot = await this.activeReleaseRoot()
    const profileDirectory = join(releaseRoot, 'dsh-home/profiles', profileName)
    const profileManifest = JSON.parse(await readFile(join(profileDirectory, 'package.json'), 'utf8')) as JsonObject
    const dsh = profileManifest.dsh
    const profile = dsh && typeof dsh === 'object' && !Array.isArray(dsh) ? (dsh as JsonObject).profile : undefined
    const bundleList = profile && typeof profile === 'object' && !Array.isArray(profile) ? (profile as JsonObject).bundles : undefined
    if (!Array.isArray(bundleList) || bundleList.some(value => typeof value !== 'string')) throw new Error('materialized profile bundle list is invalid')

    const runtimeNodeModules = join(releaseRoot, 'harness-runtime/node_modules')
    const profileNodeModules = join(profileDirectory, 'node_modules')
    const runtimeVersions = {
      cliDsh: await readPackageVersion(join(runtimeNodeModules, '@deepseek-ai/dsh/package.json'), '@deepseek-ai/dsh.version'),
      dshBase: await readPackageVersion(join(runtimeNodeModules, '@deepseek-ai/dsh-base/package.json'), '@deepseek-ai/dsh-base.version'),
      dshWebApp: await readPackageVersion(join(runtimeNodeModules, '@deepseek-ai/dsh-web-app/package.json'), '@deepseek-ai/dsh-web-app.version'),
    }
    const profileVersions = {
      harnessComfyui: await readPackageVersion(join(profileNodeModules, 'harness-comfyui/package.json'), 'harness-comfyui.version'),
      dshBase: runtimeVersions.dshBase,
      dshWebApp: runtimeVersions.dshWebApp,
    }
    const patch = await readFile(join(profileNodeModules, 'harness-comfyui/cordis.patch.yml'), 'utf8')
    return {
      profileBundles: [...bundleList],
      profileVersions,
      runtimeBundleVersions: runtimeVersions,
      hostLoaderRow: parseHostLoaderRow(patch),
    }
  }

  async readClientPackageEvidence(): Promise<ClientPackageEvidence> {
    const releaseRoot = await this.activeReleaseRoot()
    const packageRoot = join(releaseRoot, 'package')
    const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as JsonObject
    const exports = manifest.exports
    if (!exports || typeof exports !== 'object' || Array.isArray(exports)) throw new Error('release package exports are missing')
    const client = (exports as JsonObject)['./client']
    if (!client || typeof client !== 'object' || Array.isArray(client)) throw new Error('release package ./client export is missing')
    const exportTarget = (client as JsonObject).default
    if (typeof exportTarget !== 'string' || exportTarget.length === 0) throw new Error('release package ./client default export is missing')
    const modulePath = join(packageRoot, exportTarget)
    const moduleSource = await readFile(modulePath, 'utf8')
    return { exportTarget, modulePath, moduleSource }
  }

  async readClientModule(id: string): Promise<string> {
    const graph = await this.readBootGraph()
    const entry = graph.entries.find(candidate => candidate.id === id)
    if (!entry) throw new Error(`client manifest has no entry ${id}`)
    const response = await fetchWithTimeout(new URL(entry.url, `http://127.0.0.1:${this.currentPort}`).toString())
    if (!response.ok) throw new Error(`client module ${id} returned HTTP ${response.status}`)
    return response.text()
  }

  async runRealBrowserProbe(options?: RealBrowserProbeOptions): Promise<RealBrowserProbe> {
    return runRealBrowserProbe(`http://127.0.0.1:${this.currentPort}/`, options)
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    try {
      if (this.installed) await this.stop()
    } finally {
      await rm(this.testRoot, { recursive: true, force: true })
      try {
        await access(this.installationRoot)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') this.cleanupEvidence.installationRemoved = true
      }
      try {
        await access(this.dshHome)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') this.cleanupEvidence.dshHomeRemoved = true
      }
      this.cleanupEvidence.noChildProcesses = this.children.size === 0
      this.disposed = true
    }
  }
}

export async function createProfileFixture(options: ProfileFixtureOptions): Promise<ProfileFixture> {
  if (!fixtureConfigurations.includes(options.configuration)) {
    throw new Error(`profile fixture configuration must be one of ${fixtureConfigurations.join(', ')}`)
  }
  const artifact = await readArtifactManifest(options.artifactManifestPath)
  const prefix = options.configuration === 'release-smoke'
    ? 'harness-comfyui-release-smoke-'
    : 'harness-comfyui-composition-'
  const testRoot = await mkdtemp(join(tmpdir(), prefix))
  try {
    const port = await findFreePort()
    const catalogCliPath = join(testRoot, 'catalog-discovery.mjs')
    const sourceCliPath = join(testRoot, 'source-discovery.mjs')
    const installationRoot = join(testRoot, 'installation')
    const installationPath = join(testRoot, 'installation.json')
    const runtimeCwd = join(testRoot, 'command-cwd')
    await mkdir(runtimeCwd, { recursive: true })
    await writeFile(catalogCliPath, discoveryScriptSource(), { encoding: 'utf8', mode: 0o755 })
    await writeFile(sourceCliPath, discoveryScriptSource(), { encoding: 'utf8', mode: 0o755 })
    await chmod(catalogCliPath, 0o755)
    await chmod(sourceCliPath, 0o755)
    await writeFile(installationPath, `${JSON.stringify({
      schemaVersion: 1,
      installationId: `${options.configuration}-${process.pid}-${basename(testRoot)}`,
      root: installationRoot,
      configurationProfile: options.configuration,
      host: '127.0.0.1',
      port,
      paths: {
        dataDir: join(installationRoot, 'shared/data'),
        runRepositoryFile: join(installationRoot, 'shared/data/runs.sqlite'),
        runDirectory: join(installationRoot, 'shared/runs'),
        savedMediaDirectory: join(installationRoot, 'shared/saved-media'),
        logDirectory: join(installationRoot, 'shared/logs'),
      },
      comfyui: { defaultInstanceId: `${options.configuration}-instance` },
      source: {
        catalogCliPath,
        sourceCliPath,
        contractId: discovery.contract_id,
        supportedContractVersions: [discovery.contract_version],
      },
      client: { runRefreshIntervalMs: 1000 },
      process: { shutdownTimeoutMs: 15000 },
    }, null, 2)}\n`, 'utf8')
    return new ProfileFixtureImpl(artifact, options.configuration, testRoot, port)
  } catch (error) {
    await rm(testRoot, { recursive: true, force: true })
    throw error
  }
}

export { profileBundles }

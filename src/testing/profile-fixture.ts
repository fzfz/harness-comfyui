import { createHash } from 'node:crypto'
import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { createConnection } from 'node:net'
import type { Readable } from 'node:stream'
import { createRequire } from 'node:module'

import {
  runRealBrowserProbe,
  type BrowserSlotEntry,
  type RealBrowserProbe,
} from './browser-cdp.ts'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const materializeScript = resolve(repositoryRoot, 'scripts/profile/materialize.mjs')
const startScript = resolve(repositoryRoot, 'scripts/profile/start.mjs')
const qualityArtifactManifestPath = resolve(repositoryRoot, '.release/quality/artifact.json')
const profileName = 'comfyui-workbench'
const profileBundles = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  'harness-comfyui',
] as const

type JsonObject = Record<string, unknown>

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

export interface DetailsComposition {
  registrationError: string | undefined
  priorities: number[]
  activePriority: number | undefined
  entries: BrowserSlotEntry[]
  remainingPriorities: number[]
  remainingEntries: BrowserSlotEntry[]
  unload(): Promise<void>
}

export interface CleanupEvidence {
  processExit: { code: number | null; signal: NodeJS.Signals | null } | undefined
  portReleased: boolean
  dshHomeRemoved: boolean
}

export interface ProfileFixtureOptions {
  configuration: 'development' | 'test' | 'release-smoke' | 'production'
}

export interface ProfileFixture {
  readonly artifact: ArtifactManifest
  readonly dshHome: string
  readonly runtimeCwd: string
  readonly profileManifestPath: string
  readonly cleanupEvidence: CleanupEvidence
  readonly port: number | undefined
  materialize(): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
  dispose(): Promise<void>
  readBootGraph(): Promise<BootGraph>
  readInstalledProfileEvidence(): Promise<InstalledProfileEvidence>
  readClientModule(id: string): Promise<string>
  runRealBrowserProbe(): Promise<RealBrowserProbe>
  inspectDetailsComposition(options: { nativeClientId: string }): Promise<DetailsComposition>
  unloadClient(composition: DetailsComposition): Promise<void>
}

interface RunningProcess {
  child: ChildProcessByStdio<null, Readable, Readable>
  output: string
  errorOutput: string
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

function asString(value: unknown, property: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`artifact manifest ${property} must be a non-empty string`)
  return value
}

function parseArtifactManifest(value: unknown, manifestPath: string): ArtifactManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`artifact manifest ${manifestPath} must be an object`)
  const manifest = value as JsonObject
  const parsed: ArtifactManifest = {
    tarballPath: asString(manifest.tarballPath, 'tarballPath'),
    filename: asString(manifest.filename, 'filename'),
    version: asString(manifest.version, 'version'),
    commit: asString(manifest.commit, 'commit'),
    byteLength: manifest.byteLength as number,
    sha256: asString(manifest.sha256, 'sha256'),
  }
  if (!Number.isSafeInteger(parsed.byteLength) || parsed.byteLength <= 0) throw new TypeError(`artifact manifest byteLength must be a positive integer`)
  parsed.tarballPath = resolve(parsed.tarballPath)
  return parsed
}

async function readArtifactManifest(): Promise<ArtifactManifest> {
  const manifest = parseArtifactManifest(JSON.parse(await readFile(qualityArtifactManifestPath, 'utf8')), qualityArtifactManifestPath)
  const [file, digest] = await Promise.all([
    stat(manifest.tarballPath),
    new Promise<string>((resolveDigest, reject) => {
      const hash = createHash('sha256')
      const stream = createReadStream(manifest.tarballPath)
      stream.on('data', chunk => hash.update(chunk))
      stream.once('error', reject)
      stream.once('end', () => resolveDigest(hash.digest('hex')))
    }),
  ])
  if (!file.isFile()) throw new Error(`artifact tarball is not a file: ${manifest.tarballPath}`)
  if (manifest.byteLength !== file.size) throw new Error(`artifact byteLength changed: manifest=${manifest.byteLength} actual=${file.size}`)
  if (manifest.sha256 !== digest) throw new Error(`artifact sha256 changed: manifest=${manifest.sha256} actual=${digest}`)
  return manifest
}

function environmentFor(home: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DSH_HOME: home,
    HARNESS_COMFYUI_DATA_DIR: join(home, 'data'),
    HARNESS_COMFYUI_RUN_REPOSITORY_FILE: join(home, 'runs.sqlite'),
    HARNESS_COMFYUI_RUN_DIRECTORY: join(home, 'runs'),
    HARNESS_COMFYUI_SAVED_MEDIA_DIRECTORY: join(home, 'media'),
    HARNESS_COMFYUI_LOG_DIRECTORY: join(home, 'logs'),
    HARNESS_COMFYUI_CATALOG_CLI_PATH: 'node',
    HARNESS_COMFYUI_SOURCE_CLI_PATH: 'node',
  }
}

function runProcess(command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.once('error', reject)
    child.once('close', (code, signal) => resolveResult({ code, signal, stdout, stderr }))
  })
}

async function waitUntil<T>(probe: () => Promise<T | undefined>, description: string, timeoutMs = 30000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const result = await probe()
      if (result !== undefined) return result
    } catch (error) {
      lastError = error
    }
    await delay(100)
  }
  throw new Error(`timed out waiting for ${description}${lastError === undefined ? '' : `: ${String(lastError)}`}`)
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2000)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function parseBootGraph(html: string): BootGraph {
  const match = html.match(/window\.__DSH_BOOT__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/)
  if (!match?.[1]) throw new Error('web app HTML did not contain window.__DSH_BOOT__')
  const graph = JSON.parse(match[1]) as BootGraph
  if (typeof graph.rev !== 'string' || !Array.isArray(graph.entries)) throw new Error('web app boot graph has an invalid shape')
  return graph
}

function readInstalledPackageVersion(packageName: string): string {
  const require = createRequire(import.meta.url)
  let directory: string
  try {
    directory = dirname(require.resolve(packageName))
  } catch {
    const packageManifest = resolve(repositoryRoot, 'node_modules', packageName, 'package.json')
    const manifest = JSON.parse(require('node:fs').readFileSync(packageManifest, 'utf8')) as JsonObject
    return asString(manifest.version, `${packageName}.version`)
  }
  for (let depth = 0; depth < 8; depth += 1) {
    try {
      const manifest = JSON.parse(require('node:fs').readFileSync(join(directory, 'package.json'), 'utf8')) as JsonObject
      return asString(manifest.version, `${packageName}.version`)
    } catch {
      directory = dirname(directory)
    }
  }
  throw new Error(`could not locate installed package manifest for ${packageName}`)
}

class ProfileFixtureImpl implements ProfileFixture {
  readonly artifact: ArtifactManifest
  readonly dshHome: string
  readonly runtimeCwd: string
  readonly profileManifestPath: string
  readonly cleanupEvidence: CleanupEvidence = {
    processExit: undefined,
    portReleased: false,
    dshHomeRemoved: false,
  }
  private readonly configuration: ProfileFixtureOptions['configuration']
  private running: RunningProcess | undefined
  private currentPort: number | undefined
  private disposed = false

  constructor(options: ProfileFixtureOptions, artifact: ArtifactManifest, dshHome: string) {
    this.configuration = options.configuration
    this.artifact = artifact
    this.dshHome = dshHome
    this.runtimeCwd = join(dshHome, 'artifact-runtime-cwd')
    this.profileManifestPath = join(dshHome, 'profiles', profileName, 'package.json')
  }

  get port(): number | undefined {
    return this.currentPort
  }

  async materialize(): Promise<void> {
    if (this.disposed) throw new Error('profile fixture is already disposed')
    const command = process.execPath
    const result = await runProcess(command, [materializeScript, '--configuration', this.configuration, '--dsh-home', this.dshHome, '--package-spec', this.artifact.tarballPath], {
      cwd: repositoryRoot,
      env: environmentFor(this.dshHome),
    })
    if (result.code !== 0) throw new Error(`profile materialize failed with ${result.code ?? result.signal}: ${result.stderr || result.stdout}`)
  }

  async start(): Promise<void> {
    if (this.running) throw new Error('profile fixture is already running')
    await mkdir(join(this.runtimeCwd, 'config/profiles'), { recursive: true })
    await Promise.all([
      writeFile(join(this.runtimeCwd, 'config/base.json'), '{"pollutedCheckoutConfig":true}\n'),
      writeFile(join(this.runtimeCwd, 'config/environment-overrides.json'), '{}\n'),
      writeFile(join(this.runtimeCwd, `config/profiles/${this.configuration}.json`), '{}\n'),
      writeFile(join(this.runtimeCwd, 'package.json'), '{"name":"harness-comfyui-artifact-runtime","private":true,"type":"module"}\n'),
    ])
    const child = spawn(process.execPath, [startScript, '--configuration', this.configuration, '--dsh-home', this.dshHome, '--host', '127.0.0.1', '--port', '0'], {
      cwd: this.runtimeCwd,
      env: {
        ...environmentFor(this.dshHome),
        HARNESS_COMFYUI_CONFIGURATION_PROFILE: this.configuration,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    const running: RunningProcess = { child, output: '', errorOutput: '' }
    this.running = running
    child.stdout.on('data', chunk => { running.output += String(chunk) })
    child.stderr.on('data', chunk => { running.errorOutput += String(chunk) })
    child.once('error', error => { running.errorOutput += String(error) })

    this.currentPort = await waitUntil(async () => {
      const match = running.output.match(/dsh web: http:\/\/127\.0\.0\.1:(\d+)/)
      if (!match?.[1]) {
        if (child.exitCode !== null) throw new Error(`profile start exited before readiness: ${running.errorOutput}`)
        return undefined
      }
      const port = Number(match[1])
      const response = await fetchWithTimeout(`http://127.0.0.1:${port}/`)
      if (response.status !== 200) return undefined
      const html = await response.text()
      parseBootGraph(html)
      return port
    }, 'foreground profile readiness')
  }

  async stop(): Promise<void> {
    const running = this.running
    if (!running) return
    const { child } = running
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolveResult, reject) => {
      const timeout = setTimeout(() => reject(new Error(`profile start did not exit: ${running.errorOutput}`)), 30000)
      child.once('close', (code, signal) => {
        clearTimeout(timeout)
        resolveResult({ code, signal })
      })
    })
    this.cleanupEvidence.processExit = result
    if (this.currentPort === undefined) throw new Error('profile did not expose a port before shutdown')
    this.cleanupEvidence.portReleased = await waitUntil(async () => {
      const port = this.currentPort!
      return await new Promise<boolean | undefined>(resolveResult => {
        const socket = createConnection({ host: '127.0.0.1', port })
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
          resolveResult(true)
        })
      })
    }, 'profile port release', 5000)
    this.running = undefined
  }

  async readBootGraph(): Promise<BootGraph> {
    if (this.currentPort === undefined) throw new Error('profile is not running')
    const response = await fetchWithTimeout(`http://127.0.0.1:${this.currentPort}/`)
    if (!response.ok) throw new Error(`web app returned HTTP ${response.status}`)
    return parseBootGraph(await response.text())
  }

  async readInstalledProfileEvidence(): Promise<InstalledProfileEvidence> {
    const profileDirectory = join(this.dshHome, 'profiles', profileName)
    const patch = await readFile(join(profileDirectory, 'node_modules/harness-comfyui/cordis.patch.yml'), 'utf8')
    const row = patch.match(/- id:\s*(harness-comfyui)\s+name:\s*(harness-comfyui)\s+config:\s+configurationProfile:\s*([^\n]+)/)
    if (!row?.[1] || !row[2] || !row[3]) throw new Error('materialized profile omitted the harness Host Loader row')
    const harnessManifest = JSON.parse(await readFile(join(profileDirectory, 'node_modules/harness-comfyui/package.json'), 'utf8')) as JsonObject
    const profilePackageVersion = async (packageName: string): Promise<string | undefined> => {
      try {
        const manifest = JSON.parse(await readFile(join(profileDirectory, 'node_modules', packageName, 'package.json'), 'utf8')) as JsonObject
        return asString(manifest.version, `${packageName}.version`)
      } catch {
        return undefined
      }
    }
    const versionEvidence = await readProfileVersionEvidence({
      async profilePackageVersion(packageName) {
        if (packageName === 'harness-comfyui') return asString(harnessManifest.version, 'harness-comfyui.version')
        return profilePackageVersion(packageName)
      },
      async runtimePackageVersion(packageName) {
        return readInstalledPackageVersion(packageName)
      },
    })
    return {
      ...versionEvidence,
      hostLoaderRow: {
        id: row[1],
        name: row[2],
        configurationExpression: row[3],
      },
    }
  }

  async readClientModule(id: string): Promise<string> {
    const graph = await this.readBootGraph()
    const entry = graph.entries.find(candidate => candidate.id === id)
    if (!entry) throw new Error(`client manifest has no entry ${id}`)
    const response = await fetchWithTimeout(`http://127.0.0.1:${this.currentPort}${entry.url}`)
    if (!response.ok) throw new Error(`client module ${id} returned HTTP ${response.status}`)
    return response.text()
  }

  async runRealBrowserProbe(): Promise<RealBrowserProbe> {
    if (this.currentPort === undefined) throw new Error('profile is not running')
    return runRealBrowserProbe(`http://127.0.0.1:${this.currentPort}/`)
  }

  async inspectDetailsComposition(options: { nativeClientId: string }): Promise<DetailsComposition> {
    const browser = await this.runRealBrowserProbe()
    const registrationErrors = browser.singleSlotDuplicateErrors
    const expectedNative = browser.detailsEntries.some(entry => entry.owner === options.nativeClientId)
    if (!expectedNative) {
      registrationErrors.push(`details snapshot omitted ${options.nativeClientId}: ${JSON.stringify(browser.detailsEntries)}`)
    }
    const composition: DetailsComposition = {
      registrationError: registrationErrors[0],
      priorities: browser.detailsEntries.map(entry => entry.priority),
      activePriority: browser.detailsEntries.find(entry => entry.active)?.priority,
      entries: browser.detailsEntries,
      remainingPriorities: browser.remainingDetailsEntries.map(entry => entry.priority),
      remainingEntries: browser.remainingDetailsEntries,
      async unload() {
        // The real browser probe already disposed the harness-comfyui Fiber.
      },
    }
    return composition
  }

  async unloadClient(composition: DetailsComposition): Promise<void> {
    await composition.unload()
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    try {
      await this.stop()
    } finally {
      await rm(this.dshHome, { recursive: true, force: true })
      try {
        await access(this.dshHome)
      } catch {
        this.cleanupEvidence.dshHomeRemoved = true
      }
    }
  }
}

export async function createProfileFixture(options: ProfileFixtureOptions): Promise<ProfileFixture> {
  const artifact = await readArtifactManifest()
  const head = await runProcess('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, env: process.env })
  const commit = head.stdout.trim()
  if (head.code !== 0 || commit !== artifact.commit) {
    throw new Error(`artifact commit must equal repository HEAD: artifact=${artifact.commit} HEAD=${commit || '<unavailable>'}`)
  }
  const dshHome = await mkdtemp(join(tmpdir(), 'harness-comfyui-profile-'))
  if (!isAbsolute(dshHome)) throw new Error(`fixture DSH_HOME is not absolute: ${dshHome}`)
  return new ProfileFixtureImpl(options, artifact, dshHome)
}

export { profileBundles }

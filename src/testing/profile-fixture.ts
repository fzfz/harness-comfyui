import { createHash } from 'node:crypto'
import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { access, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { createConnection } from 'node:net'
import type { Readable } from 'node:stream'
import { Context } from '@deepseek-ai/cordis'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const materializeScript = resolve(repositoryRoot, 'scripts/profile/materialize.mjs')
const startScript = resolve(repositoryRoot, 'scripts/profile/start.mjs')
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

export interface BrowserProbe {
  appFrame: boolean
  hostClientConnected: boolean
  clientModuleLoaded: boolean
  nativeDetailsModuleLoaded: boolean
  pluginStatus: {
    packageName: string
    packageVersion: string
    configurationProfile: string
    hostLoaded: true
  }
}

export interface DetailsComposition {
  registrationError: string | undefined
  priorities: number[]
  activePriority: number | undefined
  remainingPriorities: number[]
  unload(): Promise<void>
}

export interface CleanupEvidence {
  processExit: { code: number | null; signal: NodeJS.Signals | null } | undefined
  portReleased: boolean
  dshHomeRemoved: boolean
}

export interface ProfileFixtureOptions {
  configuration: 'development' | 'test' | 'release-smoke' | 'production'
  artifactManifestPath: string
}

export interface ProfileFixture {
  readonly artifact: ArtifactManifest
  readonly dshHome: string
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
  runBrowserProbe(): Promise<BrowserProbe>
  inspectDetailsComposition(): Promise<DetailsComposition>
  unloadClient(composition: DetailsComposition): Promise<void>
}

interface RuntimeClientExports {
  SlotRegistry: typeof import('@deepseek-ai/dsh-client-runtime/client').SlotRegistry
}

interface ClientPlugin {
  name: string
  inject: string[]
  apply(ctx: Context): void
}

interface RunningProcess {
  child: ChildProcessByStdio<null, Readable, Readable>
  output: string
  errorOutput: string
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

async function readArtifactManifest(manifestPath: string): Promise<ArtifactManifest> {
  const absolutePath = resolve(repositoryRoot, manifestPath)
  const manifest = parseArtifactManifest(JSON.parse(await readFile(absolutePath, 'utf8')), absolutePath)
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

async function loadRuntimeExports(): Promise<RuntimeClientExports> {
  const require = (await import('node:module')).createRequire(import.meta.url)
  const clientModules = new Map<string, RuntimeClientExports>()
  const hadWindow = Object.hasOwn(globalThis, 'window')
  const previousWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      __ModuleLoader__: {
        load({ id, factory }: { id: string; factory: (require: (specifier: string) => unknown) => RuntimeClientExports }) {
          clientModules.set(id, factory(require))
        },
      },
    },
  })
  try {
    await import('@deepseek-ai/dsh-client-runtime/client')
    const runtimeExports = clientModules.get('@deepseek-ai/dsh-client-runtime')
    if (!runtimeExports) throw new Error('runtime client did not register with ModuleLoader')
    return runtimeExports
  } finally {
    if (hadWindow) Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow })
    else Reflect.deleteProperty(globalThis, 'window')
  }
}

async function detailsCompositionFromModule(moduleCode: string): Promise<DetailsComposition> {
  const vm = await import('node:vm')
  const runtimeExports = await loadRuntimeExports()
  let handoff: { id: string; factory: (require: (specifier: string) => unknown) => ClientPlugin } | undefined
  const styleElements: Array<{ dataset: Record<string, string>; textContent: string }> = []
  const document = {
    head: { appendChild(element: (typeof styleElements)[number]) { styleElements.push(element) } },
    createElement() { return { dataset: {}, textContent: '' } },
    querySelector() { return undefined },
  }
  const window = {
    __ModuleLoader__: {
      load(value: typeof handoff) { handoff = value },
    },
  }
  vm.runInNewContext(moduleCode, { document, window })
  if (!handoff) throw new Error('Client module did not register with ModuleLoader')
  const requireExternal = (specifier: string): unknown => {
    if (specifier === '@deepseek-ai/dsh-client-runtime/client') return runtimeExports
    throw new Error(`built client module requested unexpected external ${specifier}`)
  }
  const plugin = handoff.factory(requireExternal)
  const ctx = new Context()
  let rootDisposer: (() => void) | undefined
  let nativeDetailsDisposer: (() => void) | undefined
  let clientFiber: Awaited<ReturnType<typeof ctx.plugin>> | undefined
  let registrationError: string | undefined
  try {
    await ctx.plugin(runtimeExports.SlotRegistry)
    rootDisposer = ctx.slots.register(
      {
        name: 'root',
        children: {
          sidebar: { kind: 'single', scope: 'root' },
          conversation: { kind: 'single', scope: 'session-maybe' },
          details: { kind: 'single', scope: 'session' },
        },
      },
      (_props: PropsRenderSlots<'sidebar' | 'conversation' | 'details'>) => null,
    )
    nativeDetailsDisposer = ctx.slots.register({ name: 'details', priority: 0 }, () => null)
    clientFiber = ctx.plugin(plugin)
    await clientFiber
  } catch (error) {
    registrationError = error instanceof Error ? error.message : String(error)
  }

  const currentPriorities = (): number[] => ctx.slots.entries('details')
    .map(entry => entry.options.priority)
    .filter((priority): priority is number => priority !== undefined)
  const priorities = currentPriorities()
  const composition: DetailsComposition = {
    registrationError,
    priorities,
    activePriority: ctx.slots.entriesOfSlot('details')[0]?.options.priority,
    remainingPriorities: [],
    async unload() {
      if (clientFiber) await clientFiber.dispose()
      composition.remainingPriorities = currentPriorities()
      nativeDetailsDisposer?.()
      rootDisposer?.()
      await ctx.fiber.dispose()
    },
  }
  return composition
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
    const child = spawn(process.execPath, [startScript, '--configuration', this.configuration, '--dsh-home', this.dshHome, '--host', '127.0.0.1', '--port', '0'], {
      cwd: repositoryRoot,
      env: environmentFor(this.dshHome),
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
    return {
      profileVersions: {
        harnessComfyui: asString(harnessManifest.version, 'harness-comfyui.version'),
        dshBase: await profilePackageVersion('@deepseek-ai/dsh-base'),
        dshWebApp: await profilePackageVersion('@deepseek-ai/dsh-web-app'),
      },
      runtimeBundleVersions: {
        cliDsh: readInstalledPackageVersion('@deepseek-ai/dsh'),
        dshBase: readInstalledPackageVersion('@deepseek-ai/dsh-base'),
        dshWebApp: readInstalledPackageVersion('@deepseek-ai/dsh-web-app'),
      },
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

  async runBrowserProbe(): Promise<BrowserProbe> {
    const htmlResponse = await fetchWithTimeout(`http://127.0.0.1:${this.currentPort}`)
    if (!htmlResponse.ok) throw new Error(`browser shell returned HTTP ${htmlResponse.status}`)
    const html = await htmlResponse.text()
    const graph = parseBootGraph(html)
    const layoutEntry = graph.entries.find(entry => entry.id === '@deepseek-ai/dsh-client-ui-layout')
    const conversationEntry = graph.entries.find(entry => entry.id === '@deepseek-ai/dsh-client-ui-conversation')
    const harnessEntry = graph.entries.find(entry => entry.id === 'harness-comfyui')
    if (!layoutEntry || !conversationEntry || !harnessEntry) throw new Error('browser boot graph omitted AppFrame, native details, or harness Client entry')
    const [layoutResponse, conversationResponse, harnessResponse] = await Promise.all([
      fetchWithTimeout(`http://127.0.0.1:${this.currentPort}${layoutEntry.url}`),
      fetchWithTimeout(`http://127.0.0.1:${this.currentPort}${conversationEntry.url}`),
      fetchWithTimeout(`http://127.0.0.1:${this.currentPort}${harnessEntry.url}`),
    ])
    const layoutModule = await layoutResponse.text()
    const conversationModule = await conversationResponse.text()
    const harnessModule = await harnessResponse.text()
    const appFrame = layoutResponse.ok && /AppFrame/.test(layoutModule)
    const nativeDetailsModuleLoaded = conversationResponse.ok && /details/i.test(conversationModule)
    const clientModuleLoaded = harnessResponse.ok && harnessModule.includes('__ModuleLoader__')
    const apiResponse = await fetchWithTimeout(`http://127.0.0.1:${this.currentPort}/api/pluginStatus/get`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: `browser-${Date.now().toString(36)}`,
        method: 'pluginStatus/get',
        payload: { args: {} },
      }),
    })
    if (!apiResponse.ok) throw new Error(`browser Host-Client bridge returned HTTP ${apiResponse.status}`)
    const wire = JSON.parse(await apiResponse.text()) as JsonObject
    const result = wire.result as JsonObject | undefined
    const value = result?.value as JsonObject | undefined
    if (wire.type !== 'server-response' || result?.ok !== true || value === undefined) throw new Error('browser Host-Client bridge returned an invalid pluginStatus envelope')
    return {
      appFrame,
      hostClientConnected: true,
      clientModuleLoaded,
      nativeDetailsModuleLoaded,
      pluginStatus: {
        packageName: asString(value.packageName, 'pluginStatus.packageName'),
        packageVersion: asString(value.packageVersion, 'pluginStatus.packageVersion'),
        configurationProfile: asString(value.configurationProfile, 'pluginStatus.configurationProfile'),
        hostLoaded: value.hostLoaded === true ? true : (() => { throw new Error('pluginStatus.hostLoaded must be true') })(),
      },
    }
  }

  async inspectDetailsComposition(): Promise<DetailsComposition> {
    return detailsCompositionFromModule(await this.readClientModule('harness-comfyui'))
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
  const artifact = await readArtifactManifest(options.artifactManifestPath)
  const dshHome = await mkdtemp(join(tmpdir(), 'harness-comfyui-profile-'))
  if (!isAbsolute(dshHome)) throw new Error(`fixture DSH_HOME is not absolute: ${dshHome}`)
  return new ProfileFixtureImpl(options, artifact, dshHome)
}

export { profileBundles }

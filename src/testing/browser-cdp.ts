import { execFile, spawn, type ChildProcess, type ChildProcessByStdio } from 'node:child_process'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

interface CdpMessage {
  id?: number
  method?: string
  params?: Record<string, unknown>
  result?: Record<string, unknown>
  error?: { message?: string }
  sessionId?: string
}

interface CdpResponse {
  result?: Record<string, unknown>
  error?: { message?: string }
}

type CdpEventListener = (message: CdpMessage) => void

class CdpConnection {
  private readonly pending = new Map<number, { resolve: (value: CdpResponse) => void; reject: (error: Error) => void }>()
  private readonly listeners = new Map<string, Set<CdpEventListener>>()
  private socket: WebSocket | undefined
  private nextId = 1

  constructor(private readonly endpoint: string) {}

  async connect(): Promise<void> {
    const socket = new WebSocket(this.endpoint)
    this.socket = socket
    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        socket.removeEventListener('error', onError)
        resolve()
      }
      const onError = () => {
        socket.removeEventListener('open', onOpen)
        reject(new Error(`Chrome DevTools WebSocket failed to open: ${this.endpoint}`))
      }
      socket.addEventListener('open', onOpen, { once: true })
      socket.addEventListener('error', onError, { once: true })
    })
    socket.addEventListener('message', event => this.handleMessage(String(event.data)))
    socket.addEventListener('close', () => {
      const error = new Error('Chrome DevTools WebSocket closed')
      for (const pending of this.pending.values()) pending.reject(error)
      this.pending.clear()
    })
  }

  on(method: string, listener: CdpEventListener): () => void {
    const listeners = this.listeners.get(method) ?? new Set<CdpEventListener>()
    listeners.add(listener)
    this.listeners.set(method, listeners)
    return () => listeners.delete(listener)
  }

  async send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<CdpResponse> {
    const socket = this.socket
    if (socket === undefined || socket.readyState !== WebSocket.OPEN) throw new Error('Chrome DevTools WebSocket is not open')
    const id = this.nextId++
    const message = JSON.stringify({ id, method, params, ...(sessionId === undefined ? {} : { sessionId }) })
    const response = new Promise<CdpResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
    socket.send(message)
    return response
  }

  close(): void {
    this.socket?.close()
  }

  private handleMessage(raw: string): void {
    const message = JSON.parse(raw) as CdpMessage
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id)
      if (pending === undefined) return
      this.pending.delete(message.id)
      if (message.error !== undefined) pending.reject(new Error(message.error.message ?? 'Chrome DevTools command failed'))
      else pending.resolve({ result: message.result })
      return
    }
    if (message.method === undefined) return
    for (const listener of this.listeners.get(message.method) ?? []) listener(message)
  }
}

export interface BrowserSlotEntry {
  owner: string | undefined
  priority: number
  active: boolean
}

export interface RealBrowserProbe {
  appFrame: boolean
  hostClientConnected: boolean
  clientModuleLoaded: boolean
  nativeDetailsModuleLoaded: boolean
  loadedModules: string[]
  consoleErrors: string[]
  runtimeExceptions: string[]
  singleSlotDuplicateErrors: string[]
  pluginStatus: {
    packageName: string
    packageVersion: string
    configurationProfile: string
    hostLoaded: true
  }
  detailsEntries: BrowserSlotEntry[]
  remainingDetailsEntries: BrowserSlotEntry[]
  cleanup: {
    browserExited: boolean
    browserProfileRemoved: boolean
    processGroupId: number | undefined
    profileDirectory: string
  }
}

interface BrowserSession {
  process: ChildProcessByStdio<null, Readable, Readable>
  processGroupId: number | undefined
  profileDirectory: string
  connection: CdpConnection
  targetId: string
  sessionId: string
}

const browserCandidates = process.platform === 'darwin'
  ? [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    ]
  : [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ]

async function findBrowserExecutable(): Promise<string> {
  for (const candidate of browserCandidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Continue through the explicit platform candidates.
    }
  }
  throw new Error(`no supported Chrome/Chromium executable found; checked ${browserCandidates.join(', ')}`)
}

async function waitUntil<T>(probe: () => Promise<T | undefined>, description: string, timeoutMs = 20000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await probe()
    if (value !== undefined) return value
    await delay(50)
  }
  throw new Error(`timed out waiting for ${description}`)
}

type BrowserProcess = ChildProcess
type LaunchedBrowserProcess = ChildProcessByStdio<null, Readable, Readable>
const execFileAsync = promisify(execFile)

export interface BrowserProcessCleanupOptions {
  terminateTimeoutMs?: number
  killTimeoutMs?: number
  pollIntervalMs?: number
}

export interface BrowserProfileCleanupOptions {
  stableWindowMs?: number
  timeoutMs?: number
  pollIntervalMs?: number
}

export interface BrowserViewport {
  width: number
  height: number
}

export interface RealBrowserProbeOptions {
  readinessTimeoutMs?: number
  viewport?: BrowserViewport
}

const defaultBrowserViewport: BrowserViewport = { width: 1280, height: 900 }

export function browserWindowSizeArgument(viewport: BrowserViewport = defaultBrowserViewport): string {
  if (viewport === null || typeof viewport !== 'object' || Array.isArray(viewport)) {
    throw new TypeError('browser viewport must be an object containing exactly width and height')
  }
  const keys = Object.keys(viewport).sort()
  if (JSON.stringify(keys) !== JSON.stringify(['height', 'width'])) {
    throw new TypeError('browser viewport must contain exactly width and height')
  }
  if (!Number.isSafeInteger(viewport.width) || viewport.width <= 0) {
    throw new TypeError('browser viewport width must be a positive integer')
  }
  if (!Number.isSafeInteger(viewport.height) || viewport.height <= 0) {
    throw new TypeError('browser viewport height must be a positive integer')
  }
  return `--window-size=${viewport.width},${viewport.height}`
}

async function waitForProcess(child: BrowserProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true
  return await new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), timeoutMs)
    child.once('close', () => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

async function terminateSingleProcess(child: BrowserProcess): Promise<boolean> {
  if (child.exitCode === null && child.signalCode === null) {
    if (child.pid !== undefined && process.platform !== 'win32') {
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch {
        child.kill('SIGTERM')
      }
    } else child.kill('SIGTERM')
  }
  if (await waitForProcess(child, 1500)) return true
  if (child.exitCode === null && child.signalCode === null) {
    if (child.pid !== undefined && process.platform !== 'win32') {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        child.kill('SIGKILL')
      }
    } else child.kill('SIGKILL')
  }
  return waitForProcess(child, 1500)
}

async function processGroupMembers(processGroupId: number): Promise<number[]> {
  const { stdout } = await execFileAsync('/bin/ps', ['-axo', 'pid=,pgid='])
  return stdout.split('\n').flatMap(line => {
    const [pid, pgid] = line.trim().split(/\s+/).map(Number)
    return Number.isSafeInteger(pid) && pgid === processGroupId ? [pid!] : []
  })
}

async function waitForProcessGroupExit(processGroupId: number, timeoutMs: number, pollIntervalMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if ((await processGroupMembers(processGroupId)).length === 0) return true
    await delay(pollIntervalMs)
  }
  return (await processGroupMembers(processGroupId)).length === 0
}

function signalProcessGroup(processGroupId: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-processGroupId, signal)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
}

export function installModuleLoaderCapture(target: any, state: any): void {
  const previousDescriptor = Object.getOwnPropertyDescriptor(target, '__ModuleLoader__')
  let loader: any
  const seenHandoffs = new WeakSet<object>()
  const captureHandoff = (handoff: any): void => {
    if (handoff === null || (typeof handoff !== 'object' && typeof handoff !== 'function')) return
    if (seenHandoffs.has(handoff)) return
    seenHandoffs.add(handoff)
    state.loadedModules.push(handoff.id)
    if (handoff.id !== 'harness-comfyui' && handoff.id !== '@deepseek-ai/dsh-client-ui-conversation' && handoff.id !== '@deepseek-ai/dsh-client-ui-layout') return
    const factory = handoff.factory
    if (typeof factory !== 'function') throw new TypeError(`browser probe module ${String(handoff.id)} factory must be a function`)
    handoff.factory = (require: any) => {
      const module = factory(require)
      if (typeof module?.apply !== 'function') return module
      const apply = module.apply
      module.apply = async (context: any) => {
        state.contexts[handoff.id] = context
        const captureFiber = () => {
          for (const runtime of context.registry.values()) {
            for (const fiber of runtime.fibers) {
              if (fiber.ctx === context) state.fibers[handoff.id] = fiber
            }
          }
        }
        captureFiber()
        const result = await apply(context)
        captureFiber()
        return result
      }
      return module
    }
  }
  const installLoader = (value: any): void => {
    loader = value
    const descriptor = Object.getOwnPropertyDescriptor(value, 'load')
    let delegate = value.load
    const wrapper = function (handoff: any): any {
      captureHandoff(handoff)
      if (typeof delegate !== 'function') throw new TypeError('browser probe ModuleLoader.load delegate must be a function')
      return Reflect.apply(delegate, loader, [handoff])
    }
    Object.defineProperty(value, 'load', {
      configurable: true,
      enumerable: descriptor?.enumerable ?? true,
      get: () => wrapper,
      set: (next: any) => { delegate = next },
    })
  }
  Object.defineProperty(target, '__ModuleLoader__', {
    configurable: true,
    get: () => loader,
    set: (value: any) => {
      installLoader(value)
      if (previousDescriptor?.set) previousDescriptor.set.call(target, value)
    },
  })
}

export async function terminateBrowserProcessGroup(
  child: BrowserProcess,
  processGroupId: number | undefined,
  options: BrowserProcessCleanupOptions = {},
): Promise<boolean> {
  if (process.platform === 'win32' || processGroupId === undefined) return terminateSingleProcess(child)
  if (!Number.isSafeInteger(processGroupId) || processGroupId <= 0) throw new TypeError('browser process group ID must be a positive integer')
  const terminateTimeoutMs = options.terminateTimeoutMs ?? 1500
  const killTimeoutMs = options.killTimeoutMs ?? 1500
  const pollIntervalMs = options.pollIntervalMs ?? 25

  if ((await processGroupMembers(processGroupId)).length > 0) signalProcessGroup(processGroupId, 'SIGTERM')
  let groupExited = await waitForProcessGroupExit(processGroupId, terminateTimeoutMs, pollIntervalMs)
  if (!groupExited) {
    signalProcessGroup(processGroupId, 'SIGKILL')
    groupExited = await waitForProcessGroupExit(processGroupId, killTimeoutMs, pollIntervalMs)
  }
  const leaderExited = await waitForProcess(child, killTimeoutMs)
  return groupExited && leaderExited
}

export async function removeBrowserProfileWhenStable(
  profileDirectory: string,
  options: BrowserProfileCleanupOptions = {},
): Promise<boolean> {
  const stableWindowMs = options.stableWindowMs ?? 250
  const timeoutMs = options.timeoutMs ?? 2000
  const pollIntervalMs = options.pollIntervalMs ?? 25
  if (stableWindowMs <= 0 || timeoutMs < stableWindowMs || pollIntervalMs <= 0) {
    throw new TypeError('browser profile cleanup durations must be positive and timeoutMs must cover stableWindowMs')
  }
  await rm(profileDirectory, { recursive: true, force: true })
  const deadline = Date.now() + timeoutMs
  const absentSince = Date.now()
  while (Date.now() < deadline) {
    try {
      await access(profileDirectory)
      throw new Error(`browser profile was rebuilt before it remained continuously absent for ${stableWindowMs}ms: ${profileDirectory}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (Date.now() - absentSince >= stableWindowMs) return true
    await delay(pollIntervalMs)
  }
  throw new Error(`browser profile did not remain continuously absent for ${stableWindowMs}ms: ${profileDirectory}`)
}

async function launchBrowser(viewport?: BrowserViewport): Promise<BrowserSession> {
  const windowSizeArgument = browserWindowSizeArgument(viewport)
  const executable = await findBrowserExecutable()
  const profileDirectory = await mkdtemp(join(tmpdir(), 'harness-comfyui-chrome-'))
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-sync',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    '--remote-allow-origins=*',
    `--user-data-dir=${profileDirectory}`,
    windowSizeArgument,
    'about:blank',
  ]
  if (process.platform === 'linux' && typeof process.getuid === 'function' && process.getuid() === 0) args.push('--no-sandbox')
  let child: LaunchedBrowserProcess | undefined
  let connection: CdpConnection | undefined
  try {
    child = spawn(executable, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      shell: false,
    })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    const endpoint = await waitUntil(async () => {
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/u)
      if (match?.[1] !== undefined) return match[1]
      if (child?.exitCode !== null || child?.signalCode !== null) throw new Error(`Chrome exited before DevTools became ready: ${stderr}`)
      return undefined
    }, 'Chrome DevTools endpoint')
    connection = new CdpConnection(endpoint)
    await connection.connect()
    const target = await connection.send('Target.createTarget', { url: 'about:blank' })
    const targetId = String(target.result?.targetId ?? '')
    if (targetId.length === 0) throw new Error('Chrome did not create a browser target')
    const attached = await connection.send('Target.attachToTarget', { targetId, flatten: true })
    const sessionId = String(attached.result?.sessionId ?? '')
    if (sessionId.length === 0) throw new Error('Chrome did not attach a browser target')
    await connection.send('Runtime.enable', {}, sessionId)
    await connection.send('Log.enable', {}, sessionId)
    await connection.send('Page.enable', {}, sessionId)
    await connection.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => {
      const state = { contexts: Object.create(null), fibers: Object.create(null), loadedModules: [] };
      (${installModuleLoaderCapture.toString()})(window, state);
      window.__HARNESS_BROWSER_PROBE__ = state;
    })();`,
    }, sessionId)
    return {
      process: child,
      processGroupId: process.platform === 'win32' ? undefined : child.pid,
      profileDirectory,
      connection,
      targetId,
      sessionId,
    }
  } catch (error) {
    connection?.close()
    if (child !== undefined) {
      const exited = await terminateBrowserProcessGroup(child, process.platform === 'win32' ? undefined : child.pid)
      if (!exited) throw new AggregateError([error], 'browser launch failed and Chrome process-group cleanup did not complete')
    }
    await removeBrowserProfileWhenStable(profileDirectory)
    throw error
  }
}

async function evaluate(session: BrowserSession, expression: string): Promise<unknown> {
  const response = await session.connection.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  }, session.sessionId)
  const result = response.result?.result as { value?: unknown; description?: string; type?: string } | undefined
  if (response.result?.exceptionDetails !== undefined) {
    const details = response.result.exceptionDetails as { exception?: { description?: string }; text?: string }
    throw new Error(`browser Runtime.evaluate failed: ${details.exception?.description ?? details.text ?? 'unknown exception'}`)
  }
  return result?.value
}

export async function runRealBrowserProbe(
  url: string,
  options: RealBrowserProbeOptions = {},
): Promise<RealBrowserProbe> {
  const session = await launchBrowser(options.viewport)
  const consoleErrors: string[] = []
  const runtimeExceptions: string[] = []
  const removeConsoleListener = session.connection.on('Runtime.consoleAPICalled', message => {
    const params = message.params as { type?: string; args?: Array<{ value?: unknown; description?: string }> } | undefined
    if (params?.type !== 'error') return
    consoleErrors.push((params.args ?? []).map(arg => String(arg.value ?? arg.description ?? '')).join(' '))
  })
  const removeExceptionListener = session.connection.on('Runtime.exceptionThrown', message => {
    const details = message.params as { exceptionDetails?: { text?: string; exception?: { description?: string } } } | undefined
    runtimeExceptions.push(details?.exceptionDetails?.exception?.description ?? details?.exceptionDetails?.text ?? 'runtime exception')
  })
  let browserExited = false
  let browserProfileRemoved = false
  let cleanupError: unknown
  let probe: Omit<RealBrowserProbe, 'cleanup'> | undefined
  let probeError: unknown
  let lastReadiness: unknown
  try {
    await session.connection.send('Page.navigate', { url }, session.sessionId)
    await waitUntil(async () => {
      const state = await evaluate(session, `(() => {
        const visible = element => {
          if (!(element instanceof HTMLElement)) return false;
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden';
        };
        const visibleButtons = [...document.querySelectorAll('button')].filter(visible);
        const shellOverlays = document.querySelectorAll('[data-shell-overlay]');
        const probe = window.__HARNESS_BROWSER_PROBE__;
        const body = document.body;
        const bodyText = body?.textContent?.trim() ?? '';
        const bodyRect = body?.getBoundingClientRect();
        return {
          appFrame: body !== null && visible(body) && shellOverlays.length === 1 && visibleButtons.length >= 2 && bodyText.length > 0,
          requiredMarker: '[data-shell-overlay]',
          shellOverlayCount: shellOverlays.length,
          bodyText: bodyText.slice(0, 200),
          bodyRect: bodyRect === undefined ? undefined : { width: bodyRect.width, height: bodyRect.height },
          visibleButtonCount: visibleButtons.length,
          loadedModules: probe?.loadedModules ?? [],
          contextIds: Object.keys(probe?.contexts ?? {}),
          fiberIds: Object.keys(probe?.fibers ?? {}),
        };
      })()`)
      const value = state as { appFrame?: boolean; requiredMarker?: string; shellOverlayCount?: number; bodyText?: string; bodyRect?: { width: number; height: number }; visibleButtonCount?: number; loadedModules?: string[]; contextIds?: string[]; fiberIds?: string[] } | undefined
      lastReadiness = value
      if (!value?.appFrame) return undefined
      if (!value.loadedModules?.includes('@deepseek-ai/dsh-client-ui-layout')) return undefined
      if (!value.loadedModules.includes('@deepseek-ai/dsh-client-ui-conversation')) return undefined
      if (!value.loadedModules.includes('harness-comfyui')) return undefined
      if (!value.contextIds?.includes('@deepseek-ai/dsh-client-ui-conversation')) return undefined
      if (!value.contextIds.includes('@deepseek-ai/dsh-client-ui-layout')) return undefined
      if (!value.contextIds.includes('harness-comfyui')) return undefined
      if (!value.fiberIds?.includes('@deepseek-ai/dsh-client-ui-layout')) return undefined
      if (!value.fiberIds?.includes('harness-comfyui')) return undefined
      return value
    }, 'visible Harness AppFrame and client contexts', options.readinessTimeoutMs ?? 30000)

    const state = await evaluate(session, `(async () => {
      const probe = window.__HARNESS_BROWSER_PROBE__;
      const context = probe?.contexts?.['harness-comfyui'];
      if (!context) throw new Error('test Client probe did not capture a Client Context');
      const slotContext = probe?.contexts?.['@deepseek-ai/dsh-client-ui-conversation'];
      if (!slotContext) throw new Error('test Client probe did not capture the native conversation Context');
      const fiber = probe?.fibers?.['harness-comfyui'];
      if (!fiber) throw new Error('test Client probe did not capture the harness-comfyui Fiber');
      let carried;
      const remoteFiber = context.inject(['remote.pluginStatus'], async remoteContext => {
        carried = await remoteContext.remote.pluginStatus.get();
        return () => {};
      });
      await remoteFiber;
      await remoteFiber.dispose();
      if (carried === undefined) throw new Error('pluginStatus/get did not settle');
      if (!carried.ok) throw new Error('pluginStatus/get carrier failed: ' + carried.error.code + ': ' + carried.error.message);
      const ownerByRegistrant = new Map([
        [probe.fibers['harness-comfyui'].name, 'harness-comfyui'],
        [probe.fibers['@deepseek-ai/dsh-client-ui-conversation'].name, '@deepseek-ai/dsh-client-ui-conversation'],
      ]);
      const snapshot = () => {
        const details = slotContext.slots.snapshot('details')[0];
        return (details?.occupants ?? []).map(entry => ({
          owner: ownerByRegistrant.get(entry.registrant) ?? entry.registrant,
          priority: entry.priority,
          active: entry.active,
        }));
      };
      const detailsEntries = snapshot();
      await fiber.dispose();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        pluginStatus: carried.value,
        detailsEntries,
        remainingDetailsEntries: snapshot(),
        loadedModules: probe.loadedModules,
      };
    })()`)
    const value = state as {
      pluginStatus?: RealBrowserProbe['pluginStatus']
      detailsEntries?: BrowserSlotEntry[]
      remainingDetailsEntries?: BrowserSlotEntry[]
      loadedModules?: string[]
    }
    await delay(100)
    if (runtimeExceptions.length > 0 || consoleErrors.length > 0) {
      throw new Error(`browser emitted errors: ${[...runtimeExceptions, ...consoleErrors].join(' | ')}`)
    }
    if (value.pluginStatus === undefined) throw new Error('browser Client did not return pluginStatus')
    probe = {
      appFrame: true,
      hostClientConnected: true,
      clientModuleLoaded: value.loadedModules?.includes('harness-comfyui') ?? false,
      nativeDetailsModuleLoaded: value.loadedModules?.includes('@deepseek-ai/dsh-client-ui-conversation') ?? false,
      loadedModules: value.loadedModules ?? [],
      consoleErrors,
      runtimeExceptions,
      singleSlotDuplicateErrors: [...consoleErrors, ...runtimeExceptions].filter(message => /single|duplicate|details|slot/i.test(message)),
      pluginStatus: value.pluginStatus,
      detailsEntries: value.detailsEntries ?? [],
      remainingDetailsEntries: value.remainingDetailsEntries ?? [],
    }
  } catch (error) {
    probeError = runtimeExceptions.length === 0
      ? new Error(`${String(error)}; last readiness=${JSON.stringify(lastReadiness)}`)
      : new Error(`browser runtime exception: ${runtimeExceptions.join(' | ')}; ${String(error)}`)
  } finally {
    removeConsoleListener()
    removeExceptionListener()
    try {
      await session.connection.send('Target.closeTarget', { targetId: session.targetId })
    } catch {
      // The page can already be gone after a failed browser assertion.
    }
    session.connection.close()
    try {
      browserExited = await terminateBrowserProcessGroup(session.process, session.processGroupId)
    } catch (error) {
      cleanupError = error
    }
    try {
      if (!browserExited) throw new Error('Chrome process group is still running; browser profile removal was not attempted')
      browserProfileRemoved = await removeBrowserProfileWhenStable(session.profileDirectory)
    } catch (error) {
      cleanupError ??= error
    }
  }
  if (cleanupError !== undefined || !browserExited || !browserProfileRemoved) {
    const error = cleanupError instanceof Error ? cleanupError : new Error('browser cleanup did not complete')
    if (!browserExited) error.message += '; Chrome process is still running'
    if (!browserProfileRemoved) error.message += '; Chrome profile still exists'
    if (probeError !== undefined) throw new AggregateError([probeError, error], 'real browser probe failed and cleanup did not complete')
    throw error
  }
  if (probeError !== undefined) throw probeError
  if (probe === undefined) throw new Error('real browser probe completed without a result')
  return {
    ...probe,
    cleanup: {
      browserExited,
      browserProfileRemoved,
      processGroupId: session.processGroupId,
      profileDirectory: session.profileDirectory,
    },
  }
}

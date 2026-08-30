import { spawn, spawnSync } from 'node:child_process'
import { cp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'

const defaultRepositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const MOBILE_BRIDGE_PORT_ENVIRONMENT_VARIABLE = 'DSH_DESKTOP_MOBILE_BRIDGE_PORT'

function desktopMode(mode) {
  if (mode === 'development') {
    return {
      launchCommand: 'dev',
      mobileBridgePort: 43128,
      userDataDirectory: 'dsh-desktop-dev',
      logDirectory: 'DSH Desktop Dev',
    }
  }
  if (mode === 'production') {
    return {
      launchCommand: 'preview',
      mobileBridgePort: 43127,
      userDataDirectory: 'dsh-desktop',
      logDirectory: 'DSH Desktop',
    }
  }
  throw new Error('desktopMode must be development or production')
}

export function desktopWorktreeContext(definition, sourceDefinition, options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? defaultRepositoryRoot)
  const desktopSourceRoot = resolve(options.desktopSourceRoot ?? repositoryRoot)
  const runtimeRoot = resolve(repositoryRoot, definition.runtimeRelativeRoot)
  const runtimeHome = resolve(runtimeRoot, 'home')
  const mode = desktopMode(definition.desktopMode)
  const desktopUserData = resolve(runtimeHome, 'Library/Application Support', mode.userDataDirectory)
  return {
    repositoryRoot,
    desktopSource: resolve(desktopSourceRoot, definition.desktopSourceRelativePath),
    runtimeRoot,
    runtimeHome,
    dshHome: resolve(desktopUserData, 'harness'),
    pidFile: resolve(runtimeRoot, 'desktop.pid'),
    harnessLog: resolve(runtimeHome, 'Library/Logs', mode.logDirectory, 'harness.log'),
    environmentFilePath: resolve(repositoryRoot, definition.environmentFileRelativePath),
    startupWorkspacePath: resolve(definition.startupWorkspacePath),
    mobileBridgePort: definition.mobileBridgePort ?? mode.mobileBridgePort,
    launchCommand: mode.launchCommand,
    catalogPort: sourceDefinition.source.catalogPort,
    catalogCliPath: resolve(repositoryRoot, sourceDefinition.source.catalogCliRelativePath),
    sourceCliPath: resolve(repositoryRoot, sourceDefinition.source.sourceCliRelativePath),
    skillSource: resolve(options.homeDirectory ?? homedir(), '.agents/skills'),
  }
}

function resolveMobileBridgePort(environment, fallback) {
  const configured = environment[MOBILE_BRIDGE_PORT_ENVIRONMENT_VARIABLE]
  if (configured === undefined) return fallback
  if (!/^[1-9]\d*$/u.test(configured)) {
    throw new Error(`${MOBILE_BRIDGE_PORT_ENVIRONMENT_VARIABLE} must be an integer from 1 to 65535`)
  }
  const port = Number(configured)
  if (!Number.isSafeInteger(port) || port > 65535) {
    throw new Error(`${MOBILE_BRIDGE_PORT_ENVIRONMENT_VARIABLE} must be an integer from 1 to 65535`)
  }
  return port
}

async function readDesktopEnvironment(environmentFilePath) {
  try {
    return parseEnv(await readFile(environmentFilePath, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw error
  }
}

export async function loadDesktopWorktreeContext(options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? defaultRepositoryRoot)
  const definitionPath = resolve(options.definitionPath ?? resolve(repositoryRoot, 'config/desktop-worktree.json'))
  const productionDefinitionPath = resolve(
    options.productionDefinitionPath ?? resolve(repositoryRoot, 'config/desktop-production.json'),
  )
  const [worktreeDefinition, productionDefinition] = await Promise.all([
    readFile(definitionPath, 'utf8').then(JSON.parse),
    readFile(productionDefinitionPath, 'utf8').then(JSON.parse),
  ])
  const sourceDefinition = JSON.parse(await readFile(resolve(repositoryRoot, 'config/source-production.json'), 'utf8'))
  const environmentFilePath = resolve(repositoryRoot, productionDefinition.environmentFileRelativePath)
  const environment = await readDesktopEnvironment(environmentFilePath)
  return desktopWorktreeContext({
    ...productionDefinition,
    desktopMode: 'development',
    runtimeRelativeRoot: worktreeDefinition.runtimeRelativeRoot,
    mobileBridgePort: resolveMobileBridgePort(environment, desktopMode('development').mobileBridgePort),
  }, sourceDefinition, {
    ...options,
    repositoryRoot,
    desktopSourceRoot: worktreeDefinition.mainCheckoutPath,
  })
}

export async function loadDesktopProductionContext(options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? defaultRepositoryRoot)
  const definitionPath = resolve(options.definitionPath ?? resolve(repositoryRoot, 'config/desktop-production.json'))
  const definition = JSON.parse(await readFile(definitionPath, 'utf8'))
  const sourceDefinition = JSON.parse(await readFile(resolve(repositoryRoot, 'config/source-production.json'), 'utf8'))
  const environmentFilePath = resolve(repositoryRoot, definition.environmentFileRelativePath)
  const environment = await readDesktopEnvironment(environmentFilePath)
  return desktopWorktreeContext({
    ...definition,
    desktopMode: 'production',
    mobileBridgePort: resolveMobileBridgePort(environment, desktopMode('production').mobileBridgePort),
  }, sourceDefinition, {
    ...options,
    repositoryRoot,
  })
}

async function replaceLink(source, target, type) {
  await mkdir(dirname(target), { recursive: true })
  await rm(target, { force: true })
  await symlink(source, target, type)
}

async function rootPnpmStoreDirectory(context) {
  const nodeModules = await realpath(resolve(context.repositoryRoot, 'node_modules'))
  const metadataPath = resolve(nodeModules, '.modules.yaml')
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'))
  if (typeof metadata.storeDir !== 'string' || metadata.storeDir.length === 0) {
    throw new Error(`root pnpm metadata does not define storeDir: ${metadataPath}`)
  }
  return resolve(metadata.storeDir)
}

async function desktopEnvironment(context, environment = process.env) {
  const dataDirectory = resolve(context.runtimeRoot, 'data')
  const fileEnvironment = await readDesktopEnvironment(context.environmentFilePath)
  return {
    ...fileEnvironment,
    ...environment,
    HOME: context.runtimeHome,
    CFFIXED_USER_HOME: context.runtimeHome,
    DSH_HOME: context.dshHome,
    HARNESS_COMFYUI_CONFIGURATION_PROFILE: 'production',
    HARNESS_COMFYUI_STARTUP_WORKSPACE_PATH: context.startupWorkspacePath,
    HARNESS_COMFYUI_DATA_DIR: dataDirectory,
    HARNESS_COMFYUI_API_WORKFLOW_CACHE_DIRECTORY: resolve(dataDirectory, 'api-workflow-cache'),
    HARNESS_COMFYUI_RUN_REPOSITORY_FILE: resolve(dataDirectory, 'runs.sqlite'),
    HARNESS_COMFYUI_RUN_DIRECTORY: resolve(context.runtimeRoot, 'runs'),
    HARNESS_COMFYUI_SAVED_MEDIA_DIRECTORY: resolve(context.runtimeRoot, 'saved-media'),
    HARNESS_COMFYUI_LOG_DIRECTORY: resolve(context.runtimeRoot, 'logs'),
    HARNESS_COMFYUI_CATALOG_PORT: String(context.catalogPort),
    HARNESS_COMFYUI_CATALOG_CLI_PATH: context.catalogCliPath,
    HARNESS_COMFYUI_SOURCE_CLI_PATH: context.sourceCliPath,
    DSH_DESKTOP_MOBILE_BRIDGE_PORT: String(context.mobileBridgePort),
    PATH: `${resolve(context.desktopSource, 'node_modules/.bin')}:${environment.PATH ?? ''}`,
  }
}

export function sourceProfileInitializeArguments() {
  return ['plugin', '--profile', 'web', 'install', '--no-frozen-lockfile']
}

export function sourcePluginRemoveArguments() {
  return ['plugin', '--profile', 'web', 'remove', '--workspace-root', 'harness-comfyui']
}

export function packagedPluginManifest(manifest) {
  return {
    ...manifest,
    exports: {
      ...manifest.exports,
      '.': {
        ...manifest.exports?.['.'],
        default: './.local/source-host/index.js',
      },
    },
  }
}

async function buildSourcePluginPackage(context) {
  const packageSource = resolve(context.runtimeRoot, 'plugin-package-source')
  const packageOutput = resolve(context.runtimeRoot, 'plugin-package')
  await rm(packageSource, { recursive: true, force: true })
  await rm(packageOutput, { recursive: true, force: true })
  await mkdir(packageSource, { recursive: true })
  await mkdir(packageOutput, { recursive: true })
  for (const path of [
    'package.json',
    'cordis.patch.yml',
    'config',
    'src',
    'scripts/cli',
    '.local/source-client',
    '.local/source-host',
  ]) {
    await cp(resolve(context.repositoryRoot, path), resolve(packageSource, path), { recursive: true })
  }
  const manifestPath = resolve(packageSource, 'package.json')
  const manifest = packagedPluginManifest(JSON.parse(await readFile(manifestPath, 'utf8')))
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  const result = spawnSync(resolve(context.desktopSource, 'node_modules/node/bin/node'), [
    resolve(context.desktopSource, 'node_modules/pnpm/bin/pnpm.cjs'),
    'pack',
    '--pack-destination',
    packageOutput,
  ], {
    cwd: packageSource,
    stdio: 'inherit',
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`pnpm pack exited with status ${result.status ?? 1}`)
  return resolve(packageOutput, `${manifest.name}-${manifest.version}.tgz`)
}

function runDshPluginCommand(context, environment, args) {
  const result = spawnSync(resolve(context.desktopSource, 'node_modules/node/bin/node'), [
    resolve(context.desktopSource, 'node_modules/@deepseek-ai/dsh/lib/bin.js'),
    ...args,
  ], {
    cwd: context.repositoryRoot,
    env: environment,
    stdio: 'inherit',
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`dsh plugin exited with status ${result.status ?? 1}`)
}

async function initializeSourceProfile(context, environment) {
  const profileManifestPath = resolve(context.dshHome, 'profiles/web/package.json')
  try {
    const profileManifest = JSON.parse(await readFile(profileManifestPath, 'utf8'))
    if (profileManifest.dependencies?.['harness-comfyui'] !== undefined) {
      runDshPluginCommand(context, environment, sourcePluginRemoveArguments())
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      runDshPluginCommand(context, environment, sourceProfileInitializeArguments())
      return
    }
    throw error
  }
}

export async function installSourcePluginGeneration(context, environment, packageTarball, options = {}) {
  await (options.initializeProfile ?? initializeSourceProfile)(context, environment)
  const pnpmStoreDirectory = await rootPnpmStoreDirectory(context)
  const spawnGenerationProcess = options.spawnGenerationProcess ?? spawn
  const requireFromDesktop = createRequire(resolve(context.desktopSource, 'package.json'))
  const loadDesktopModule = options.loadDesktopModule ?? (specifier => import(
    pathToFileURL(requireFromDesktop.resolve(specifier)).href
  ))
  const [installer, registry, projection] = await Promise.all([
    loadDesktopModule('dsh-desktop-market-installer/generations/installer'),
    loadDesktopModule('dsh-desktop-market-installer/generations/registry'),
    loadDesktopModule('dsh-desktop-market-installer/generations/projection'),
  ])
  await registry.withRegistryLock(context.dshHome, async () => {
    const result = await installer.installGeneration({
      dshHome: context.dshHome,
      pluginSpec: packageTarball,
      expectedPluginName: 'harness-comfyui',
      sourceSpec: packageTarball,
      nodeExecutablePath: resolve(context.desktopSource, 'node_modules/node/bin/node'),
      pnpmEntryPath: resolve(context.desktopSource, 'node_modules/pnpm/bin/pnpm.cjs'),
      environment,
      spawnProcess(command, args, spawnOptions) {
        const [pnpmEntryPath, ...pnpmArguments] = args
        if (pnpmEntryPath === undefined) throw new Error('DSH Desktop generation installer did not provide a pnpm entry path')
        return spawnGenerationProcess(command, [
          pnpmEntryPath,
          '--ignore-workspace',
          '--store-dir',
          pnpmStoreDirectory,
          ...pnpmArguments,
        ], spawnOptions)
      },
    })
    if (!result.ok || result.generation === undefined) {
      throw new Error(`DSH Desktop could not install harness-comfyui generation: ${result.detail ?? 'unknown error'}`)
    }
    const [desired, generations] = await Promise.all([
      registry.readDesired(context.dshHome),
      registry.listGenerations(context.dshHome),
    ])
    const byId = new Map(generations.map(generation => [generation.id, generation]))
    await registry.writeDesired(context.dshHome, [
      ...desired.filter(id => byId.get(id)?.pluginName !== 'harness-comfyui'),
      result.generation.id,
    ])
    await projection.projectGenerations(context.dshHome)
    await writeFile(resolve(context.dshHome, 'profiles/web/.generations-migrated'), `${new Date().toISOString()}\n`)
    await rm(resolve(context.dshHome, 'profiles/web/.generations-deferred.json'), { force: true })
  })
}

export async function prepareDesktopWorktree(context, options = {}) {
  const materializeClient = options.materializeClient ?? (await import('../production/client-module.mjs'))
    .materializeSourceClientModule
  const materializeHost = options.materializeHost ?? (await import('../production/host-module.mjs'))
    .materializeSourceHostModule
  const materializePreset = options.materializePreset ?? (await import('../profile/agent-preset.mjs'))
    .materializeSourceProductAgentPreset
  await mkdir(context.dshHome, { recursive: true })
  await replaceLink(context.environmentFilePath, resolve(context.dshHome, '.env'), 'file')
  await replaceLink(context.skillSource, resolve(context.runtimeHome, '.agents/skills'), 'dir')
  await materializeClient(context.repositoryRoot)
  await materializeHost(context.repositoryRoot)
  await materializePreset(context.repositoryRoot, context.dshHome)
  const packageTarball = await (options.packagePlugin ?? buildSourcePluginPackage)(context)
  const environment = await desktopEnvironment(context, options.environment)
  await (options.installPlugin ?? installSourcePluginGeneration)(context, environment, packageTarball)
  return { environment }
}

async function readPid(pidFile) {
  try {
    const pid = Number.parseInt((await readFile(pidFile, 'utf8')).trim(), 10)
    return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

function processIsRunning(pid, signalProcess = process.kill) {
  try {
    signalProcess(pid, 0)
    return true
  } catch (error) {
    if (error?.code === 'EPERM') return true
    if (error?.code === 'ESRCH') return false
    throw error
  }
}

async function assertMobileBridgePortAvailable(port) {
  const server = createServer()
  try {
    await new Promise((resolveListen, reject) => {
      server.once('error', error => {
        if (error?.code === 'EADDRINUSE') {
          reject(new Error(`DSH Desktop mobile bridge port ${port} is already in use`))
        } else {
          reject(error)
        }
      })
      server.listen(port, '0.0.0.0', resolveListen)
    })
  } finally {
    if (server.listening) {
      await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()))
    }
  }
}

export async function desktopWorktreeStatus(context, options = {}) {
  const pid = await readPid(context.pidFile)
  if (pid === undefined || !processIsRunning(pid, options.signalProcess)) return { status: 'stopped' }
  return { status: 'running', pid }
}

export async function stopDesktopWorktree(context, options = {}) {
  const signalProcess = options.signalProcess ?? process.kill
  const pid = await readPid(context.pidFile)
  if (pid === undefined || !processIsRunning(pid, signalProcess)) {
    await rm(context.pidFile, { force: true })
    return { status: 'stopped' }
  }
  try {
    signalProcess(-pid, 'SIGTERM')
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
  const deadline = Date.now() + (options.stopTimeoutMs ?? 5_000)
  while (Date.now() < deadline && processIsRunning(pid, signalProcess)) {
    await new Promise(resolveWait => setTimeout(resolveWait, options.stopPollIntervalMs ?? 50))
  }
  if (processIsRunning(pid, signalProcess)) throw new Error(`DSH Desktop process ${pid} did not stop`)
  await rm(context.pidFile, { force: true })
  return { status: 'stopped', pid }
}

export async function startDesktopWorktree(context, options = {}) {
  const status = await desktopWorktreeStatus(context, options)
  if (status.status === 'running') throw new Error(`DSH Desktop is already running with PID ${status.pid}`)
  await assertMobileBridgePortAvailable(context.mobileBridgePort)
  await rm(context.pidFile, { force: true })
  const prepared = await prepareDesktopWorktree(context, options)
  const pnpmArguments = [
    resolve(context.desktopSource, 'node_modules/pnpm/bin/pnpm.cjs'),
    context.launchCommand,
  ]
  if (options.remoteDebuggingPort !== undefined) {
    pnpmArguments.push('--remoteDebuggingPort', String(options.remoteDebuggingPort))
  }
  const child = (options.spawnDesktop ?? spawn)(
    resolve(context.desktopSource, 'node_modules/node/bin/node'),
    pnpmArguments,
    {
      cwd: context.desktopSource,
      env: prepared.environment,
      stdio: 'inherit',
      detached: true,
    },
  )
  if (child.pid === undefined) throw new Error('DSH Desktop did not provide a process ID')
  await mkdir(dirname(context.pidFile), { recursive: true })
  await writeFile(context.pidFile, `${child.pid}\n`)
  const forward = () => {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // The Desktop process has already exited.
    }
  }
  process.once('SIGINT', forward)
  process.once('SIGTERM', forward)
  try {
    const outcome = await new Promise((resolveExit, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolveExit({ code: code ?? 1, signal }))
    })
    return { status: outcome.code === 0 || outcome.signal === 'SIGTERM' ? 'stopped' : 'failed', pid: child.pid, ...outcome }
  } finally {
    process.off('SIGINT', forward)
    process.off('SIGTERM', forward)
    await rm(context.pidFile, { force: true })
  }
}

export async function readDesktopWorktreeLogs(context, lines = 120) {
  try {
    return (await readFile(context.harnessLog, 'utf8')).split(/\r?\n/u).slice(-lines).join('\n')
  } catch (error) {
    if (error?.code === 'ENOENT') return 'DSH Desktop Harness log has not been created.\n'
    throw error
  }
}

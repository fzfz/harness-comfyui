import { constants as fsConstants } from 'node:fs'
import { access, mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateSourceRuntime } from './contract.mjs'
import { materializeSourceClientModule } from './client-module.mjs'
import { assertNoRunningHost, processStatePath, writeAtomicJson } from './process.mjs'
import { loadProfile } from '../../src/config/load-profile.ts'
import { materializeSourceAgentExperiment } from '../profile/agent-preset.mjs'
import { materializeSourceProfile } from '../profile/source.mjs'

export const SOURCE_RUNTIME_STATE_SCHEMA_VERSION = 1
export const SOURCE_MANAGED_STATE_SCHEMA_VERSION = 1
export const SOURCE_PRODUCTION_COMMANDS = Object.freeze([
  'start', 'stop', 'restart', 'status', 'health', 'logs',
])

const defaultRepositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DEFINITION_KEYS = Object.freeze([
  'schemaVersion', 'runtimeId', 'runtimeRelativeRoot', 'configurationProfile', 'source', 'logs',
])
const MANAGED_STATE_KEYS = Object.freeze([
  'schemaVersion', 'runtimeId', 'activeVersion', 'runtimeRoot', 'configurationProfile',
  'host', 'port', 'paths', 'comfyui', 'source', 'client', 'process', 'logs',
])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireRecord(value, name) {
  if (!isRecord(value)) throw new TypeError(`${name} must be an object`)
  return value
}

function assertExactKeys(value, keys, name) {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${name} must contain exactly ${expected.join(', ')}`)
  }
}

function requireString(value, name) {
  if (typeof value !== 'string' || value.length === 0 || value.trim().length === 0 || value.includes('\0')) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
  return value
}

function requirePositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`)
  return value
}

function parseLogOptions(value, name) {
  const logs = requireRecord(value, name)
  assertExactKeys(logs, ['source', 'lines'], name)
  if (!['stdout', 'stderr', 'operations', 'all'].includes(logs.source)) {
    throw new TypeError(`${name}.source must be stdout, stderr, operations, or all`)
  }
  return {
    source: logs.source,
    lines: requirePositiveInteger(logs.lines, `${name}.lines`),
  }
}

function requireRelativePath(value, name, root, { insideRoot }) {
  const path = requireString(value, name)
  if (isAbsolute(path)) throw new TypeError(`${name} must be relative to the source repository`)
  const resolved = resolve(root, path)
  if (insideRoot) {
    const fromRoot = relative(root, resolved)
    if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
      throw new TypeError(`${name} must identify a directory inside the source repository`)
    }
  }
  return resolved
}

async function readJson(path, name) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path))
    return JSON.parse(text)
  } catch (error) {
    throw new Error(
      `cannot read ${name} ${path}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
}

export function parseSourceProductionDefinition(value, repositoryRoot = defaultRepositoryRoot) {
  const root = resolve(repositoryRoot)
  const definition = requireRecord(value, 'source production definition')
  assertExactKeys(definition, DEFINITION_KEYS, 'source production definition')
  if (definition.schemaVersion !== 1) throw new TypeError('source production definition.schemaVersion must be 1')

  const source = requireRecord(definition.source, 'source production definition.source')
  assertExactKeys(source, ['catalogPort', 'catalogCliRelativePath', 'sourceCliRelativePath'], 'source production definition.source')
  const logs = parseLogOptions(definition.logs, 'source production definition.logs')

  const configurationProfile = requireString(
    definition.configurationProfile,
    'source production definition.configurationProfile',
  )
  if (configurationProfile !== 'production') {
    throw new TypeError('source production definition.configurationProfile must be production')
  }
  return {
    schemaVersion: 1,
    runtimeId: requireString(definition.runtimeId, 'source production definition.runtimeId'),
    runtimeRoot: requireRelativePath(
      definition.runtimeRelativeRoot,
      'source production definition.runtimeRelativeRoot',
      root,
      { insideRoot: true },
    ),
    configurationProfile,
    catalogPort: requirePositiveInteger(source.catalogPort, 'source production definition.source.catalogPort'),
    catalogCliPath: requireRelativePath(
      source.catalogCliRelativePath,
      'source production definition.source.catalogCliRelativePath',
      root,
      { insideRoot: false },
    ),
    sourceCliPath: requireRelativePath(
      source.sourceCliRelativePath,
      'source production definition.source.sourceCliRelativePath',
      root,
      { insideRoot: false },
    ),
    logs: {
      source: logs.source,
      lines: logs.lines,
    },
  }
}

export async function loadSourceProductionContext(options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? defaultRepositoryRoot)
  const definitionPath = resolve(options.definitionPath ?? resolve(repositoryRoot, 'config/source-production.json'))
  const parsedDefinition = parseSourceProductionDefinition(
    await readJson(definitionPath, 'source production definition'),
    repositoryRoot,
  )
  const runtimeOverride = options.runtimeOverride
  let definition = parsedDefinition
  if (runtimeOverride !== undefined) {
    const override = requireRecord(runtimeOverride, 'source runtime override')
    assertExactKeys(override, ['runtimeId', 'runtimeRoot'], 'source runtime override')
    const rawRuntimeRoot = requireString(override.runtimeRoot, 'source runtime override.runtimeRoot')
    if (!isAbsolute(rawRuntimeRoot)) throw new TypeError('source runtime override.runtimeRoot must be an absolute path')
    const runtimeRoot = resolve(rawRuntimeRoot)
    const fromRepository = relative(repositoryRoot, runtimeRoot)
    if (
      fromRepository === ''
      || fromRepository === '..'
      || fromRepository.startsWith(`..${sep}`)
      || isAbsolute(fromRepository)
    ) {
      throw new TypeError('source runtime override.runtimeRoot must identify a directory inside the source repository')
    }
    definition = {
      ...parsedDefinition,
      runtimeId: requireString(override.runtimeId, 'source runtime override.runtimeId'),
      runtimeRoot,
    }
  }
  const dataDir = resolve(definition.runtimeRoot, 'shared/data')
  const profileEnvironment = {
    ...(options.environment ?? process.env),
    HARNESS_COMFYUI_DATA_DIR: dataDir,
    HARNESS_COMFYUI_API_WORKFLOW_CACHE_DIRECTORY: resolve(dataDir, 'api-workflow-cache'),
    HARNESS_COMFYUI_RUN_REPOSITORY_FILE: resolve(dataDir, 'runs.sqlite'),
    HARNESS_COMFYUI_RUN_DIRECTORY: resolve(definition.runtimeRoot, 'shared/runs'),
    HARNESS_COMFYUI_SAVED_MEDIA_DIRECTORY: resolve(definition.runtimeRoot, 'shared/saved-media'),
    HARNESS_COMFYUI_LOG_DIRECTORY: resolve(definition.runtimeRoot, 'shared/logs'),
    HARNESS_COMFYUI_CATALOG_CLI_PATH: definition.catalogCliPath,
    HARNESS_COMFYUI_CATALOG_PORT: String(definition.catalogPort),
    HARNESS_COMFYUI_SOURCE_CLI_PATH: definition.sourceCliPath,
  }
  const configRoot = resolve(repositoryRoot, 'config')
  const profile = loadProfile(definition.configurationProfile, {
    configRoot,
    environment: profileEnvironment,
  })
  const packageManifest = requireRecord(
    await readJson(resolve(repositoryRoot, 'package.json'), 'source package manifest'),
    'source package manifest',
  )
  const activeVersion = requireString(packageManifest.version, 'source package manifest.version')
  const runtime = validateSourceRuntime({
    schemaVersion: 1,
    runtimeId: definition.runtimeId,
    runtimeRoot: definition.runtimeRoot,
    configurationProfile: profile.configurationProfile,
    host: profile.server.host,
    port: profile.server.port,
    paths: {
      dataDir: profile.paths.dataDir,
      apiWorkflowCacheDirectory: profile.paths.apiWorkflowCacheDirectory,
      runRepositoryFile: profile.paths.runRepositoryFile,
      runDirectory: profile.paths.runDirectory,
      savedMediaDirectory: profile.paths.savedMediaDirectory,
      logDirectory: profile.paths.logDirectory,
    },
    comfyui: {
      defaultInstanceId: profile.comfyui.defaultInstanceId,
      frontendCompiler: profile.comfyui.frontendCompiler,
    },
    source: {
      catalogPort: profile.source.catalogPort,
      catalogCliPath: profile.source.catalogCliPath,
      sourceCliPath: profile.source.sourceCliPath,
      contractId: profile.source.contractId,
      sourceReleaseVersion: profile.source.sourceReleaseVersion,
    },
    client: { runRefreshIntervalMs: profile.client.runRefreshIntervalMs },
    process: { shutdownTimeoutMs: profile.process.shutdownTimeoutMs },
  })
  return {
    repositoryRoot,
    definitionPath,
    definition,
    profile,
    configReadOrder: [
      definitionPath,
      resolve(configRoot, 'base.json'),
      resolve(configRoot, 'profiles', `${definition.configurationProfile}.json`),
      resolve(configRoot, 'environment-overrides.json'),
    ],
    runtime,
    dshExecutable: resolve(repositoryRoot, 'node_modules/.bin/dsh'),
    dshHome: resolve(definition.runtimeRoot, 'dsh-home'),
    dshProfile: options.dshProfile ?? 'comfyui-workbench',
    userEnvironmentFilePath: options.userEnvironmentFilePath,
    startupWorkspacePath: options.startupWorkspacePath,
    sourceRuntimeStatePath: resolve(definition.runtimeRoot, 'state/source-runtime.json'),
    sourceManagedStatePath: resolve(
      options.managedStatePath ?? resolve(repositoryRoot, '.local/source-production-managed.json'),
    ),
    managedStatePresent: false,
    activeVersion,
  }
}

function sourceManagedState(context) {
  return {
    schemaVersion: SOURCE_MANAGED_STATE_SCHEMA_VERSION,
    runtimeId: context.definition.runtimeId,
    activeVersion: context.activeVersion,
    runtimeRoot: context.runtime.runtimeRoot,
    configurationProfile: context.runtime.configurationProfile,
    host: context.runtime.host,
    port: context.runtime.port,
    paths: context.runtime.paths,
    comfyui: context.runtime.comfyui,
    source: context.runtime.source,
    client: context.runtime.client,
    process: context.runtime.process,
    logs: context.definition.logs,
  }
}

function validateSourceManagedState(value, repositoryRoot) {
  const state = requireRecord(value, 'source managed state')
  assertExactKeys(state, MANAGED_STATE_KEYS, 'source managed state')
  if (state.schemaVersion !== SOURCE_MANAGED_STATE_SCHEMA_VERSION) {
    throw new TypeError(`source managed state.schemaVersion must be ${SOURCE_MANAGED_STATE_SCHEMA_VERSION}`)
  }
  const rawRuntimeRoot = requireString(state.runtimeRoot, 'source managed state.runtimeRoot')
  if (!isAbsolute(rawRuntimeRoot)) throw new TypeError('source managed state.runtimeRoot must be an absolute path')
  const runtimeRoot = resolve(rawRuntimeRoot)
  const fromRepository = relative(repositoryRoot, runtimeRoot)
  if (
    fromRepository === ''
    || fromRepository === '..'
    || fromRepository.startsWith(`..${sep}`)
    || isAbsolute(fromRepository)
  ) {
    throw new TypeError('source managed state.runtimeRoot must identify a directory inside the source repository')
  }
  const runtimeId = requireString(state.runtimeId, 'source managed state.runtimeId')
  const runtime = validateSourceRuntime({
    schemaVersion: 1,
    runtimeId,
    runtimeRoot,
    configurationProfile: state.configurationProfile,
    host: state.host,
    port: state.port,
    paths: state.paths,
    comfyui: state.comfyui,
    source: state.source,
    client: state.client,
    process: state.process,
  })
  return {
    runtimeId,
    activeVersion: requireString(state.activeVersion, 'source managed state.activeVersion'),
    runtime,
    logs: parseLogOptions(state.logs, 'source managed state.logs'),
  }
}

async function readOptionalSourceManagedState(context) {
  try {
    return await readJson(context.sourceManagedStatePath, 'source managed state')
  } catch (error) {
    if (error?.cause?.code === 'ENOENT') return undefined
    throw error
  }
}

export async function loadSourceManagedContext(currentContext) {
  const stateValue = await readOptionalSourceManagedState(currentContext)
  if (stateValue === undefined) return currentContext
  const state = validateSourceManagedState(stateValue, currentContext.repositoryRoot)
  return {
    ...currentContext,
    definition: {
      ...currentContext.definition,
      runtimeId: state.runtimeId,
      runtimeRoot: state.runtime.runtimeRoot,
      logs: state.logs,
    },
    runtime: state.runtime,
    dshHome: resolve(state.runtime.runtimeRoot, 'dsh-home'),
    sourceRuntimeStatePath: resolve(state.runtime.runtimeRoot, 'state/source-runtime.json'),
    managedStatePresent: true,
    activeVersion: state.activeVersion,
  }
}

export async function loadSavedSourceManagedContext(options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? defaultRepositoryRoot)
  const definitionPath = resolve(options.definitionPath ?? resolve(repositoryRoot, 'config/source-production.json'))
  const sourceManagedStatePath = resolve(
    options.managedStatePath ?? resolve(repositoryRoot, '.local/source-production-managed.json'),
  )
  const stateValue = await readOptionalSourceManagedState({ sourceManagedStatePath })
  if (stateValue === undefined) return undefined
  const state = validateSourceManagedState(stateValue, repositoryRoot)
  const configRoot = resolve(repositoryRoot, 'config')
  return {
    repositoryRoot,
    definitionPath,
    definition: {
      schemaVersion: SOURCE_MANAGED_STATE_SCHEMA_VERSION,
      runtimeId: state.runtimeId,
      runtimeRoot: state.runtime.runtimeRoot,
      configurationProfile: state.runtime.configurationProfile,
      catalogPort: state.runtime.source.catalogPort,
      catalogCliPath: state.runtime.source.catalogCliPath,
      sourceCliPath: state.runtime.source.sourceCliPath,
      logs: state.logs,
    },
    configReadOrder: [
      definitionPath,
      resolve(configRoot, 'base.json'),
      resolve(configRoot, 'profiles', `${state.runtime.configurationProfile}.json`),
      resolve(configRoot, 'environment-overrides.json'),
    ],
    runtime: state.runtime,
    dshExecutable: resolve(repositoryRoot, 'node_modules/.bin/dsh'),
    dshHome: resolve(state.runtime.runtimeRoot, 'dsh-home'),
    dshProfile: 'comfyui-workbench',
    userEnvironmentFilePath: undefined,
    startupWorkspacePath: undefined,
    sourceRuntimeStatePath: resolve(state.runtime.runtimeRoot, 'state/source-runtime.json'),
    sourceManagedStatePath,
    managedStatePresent: true,
    activeVersion: state.activeVersion,
  }
}

export async function clearSourceManagedState(context) {
  await rm(context.sourceManagedStatePath, { force: true })
}

async function assertReadable(path, name) {
  try {
    await access(path, fsConstants.R_OK)
  } catch (error) {
    throw new Error(`${name} is unavailable at ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function assertExecutable(path, name) {
  try {
    await access(path, fsConstants.R_OK | fsConstants.X_OK)
  } catch (error) {
    throw new Error(`${name} is unavailable at ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function readOptionalRuntimeState(context) {
  try {
    return await readJson(context.sourceRuntimeStatePath, 'source runtime state')
  } catch (error) {
    if (error?.cause?.code === 'ENOENT') return undefined
    throw error
  }
}

function validateSourceRuntimeState(value, context) {
  const state = requireRecord(value, 'source runtime state')
  assertExactKeys(state, ['schemaVersion', 'runtimeId', 'activeVersion', 'packageRoot'], 'source runtime state')
  if (state.schemaVersion !== SOURCE_RUNTIME_STATE_SCHEMA_VERSION) {
    throw new TypeError(`source runtime state.schemaVersion must be ${SOURCE_RUNTIME_STATE_SCHEMA_VERSION}`)
  }
  if (state.runtimeId !== context.definition.runtimeId) {
    throw new TypeError('source runtime state.runtimeId does not match source production definition')
  }
  if (resolve(requireString(state.packageRoot, 'source runtime state.packageRoot')) !== context.repositoryRoot) {
    throw new TypeError('source runtime state.packageRoot does not match current source repository')
  }
  return { activeVersion: requireString(state.activeVersion, 'source runtime state.activeVersion') }
}

export async function prepareSourceRuntime(context, options = {}) {
  await assertNoRunningHost(processStatePath(context.runtime.runtimeRoot), context.runtime, context.activeVersion)
  await assertExecutable(context.dshExecutable, 'source production dsh executable')
  await assertReadable(context.runtime.source.catalogCliPath, 'source production Catalog CLI')
  await assertReadable(context.runtime.source.sourceCliPath, 'source production Source CLI')
  await mkdir(context.runtime.paths.apiWorkflowCacheDirectory, { recursive: true })
  await materializeSourceClientModule(context.repositoryRoot)
  await materializeSourceProfile(context.repositoryRoot, context.dshHome, {
    profileName: context.dshProfile,
    ...(context.userEnvironmentFilePath === undefined
      ? {}
      : { userEnvironmentFilePath: context.userEnvironmentFilePath }),
  })
  const agentExperiment = await (
    options.materializeAgentExperiment ?? materializeSourceAgentExperiment
  )(context.repositoryRoot, context.dshHome)
  await writeAtomicJson(context.sourceRuntimeStatePath, {
    schemaVersion: SOURCE_RUNTIME_STATE_SCHEMA_VERSION,
    runtimeId: context.definition.runtimeId,
    activeVersion: context.activeVersion,
    packageRoot: context.repositoryRoot,
  })
  await writeAtomicJson(context.sourceManagedStatePath, sourceManagedState(context))
  return {
    activeVersion: context.activeVersion,
    runtimeRoot: context.runtime.runtimeRoot,
    packageRoot: context.repositoryRoot,
    dshExecutable: context.dshExecutable,
    dshHome: context.dshHome,
    dshProfile: context.dshProfile,
    agentExperiment,
    ...(context.startupWorkspacePath === undefined
      ? {}
      : { startupWorkspacePath: context.startupWorkspacePath }),
  }
}

export async function loadSourceRuntimeTarget(context, options = {}) {
  const stateValue = await readOptionalRuntimeState(context)
  const activeVersion = stateValue === undefined
    ? context.activeVersion
    : validateSourceRuntimeState(stateValue, context).activeVersion
  if (options.validateRuntime === false) return { activeVersion }
  return {
    activeVersion,
    runtimeRoot: context.runtime.runtimeRoot,
    packageRoot: context.repositoryRoot,
    dshExecutable: context.dshExecutable,
    dshHome: context.dshHome,
    dshProfile: context.dshProfile,
    ...(context.startupWorkspacePath === undefined
      ? {}
      : { startupWorkspacePath: context.startupWorkspacePath }),
  }
}

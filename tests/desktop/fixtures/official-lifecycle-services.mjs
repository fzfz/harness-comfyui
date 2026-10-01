import { copyFile, lstat, mkdir, open, readFile, realpath, stat } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import { execFile, spawn } from 'node:child_process'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import desktopE2EConfigJson from '../../../config/desktop-e2e.json' with { type: 'json' }
import pluginPackageConfig from '../../../config/plugin-package.json' with { type: 'json' }
import { parseDesktopE2EConfig } from '../../../config/desktop-e2e-schema.mjs'
import {
  parseOfficialLifecycleDebugRetentionEvidence,
  parseOfficialLifecycleEvidence,
  parseOfficialLifecycleFixture,
} from './official-lifecycle-schema.mjs'

const FIXTURE_CONFIG_PATH = fileURLToPath(new URL('./official-lifecycle-fixture.json', import.meta.url))
const execFileAsync = promisify(execFile)
const lifecycleRunRegistries = new WeakMap()
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const PACKAGE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/u
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u

export async function loadOfficialLifecycleFixture() {
  return parseOfficialLifecycleFixture(JSON.parse(await readFile(FIXTURE_CONFIG_PATH, 'utf8')))
}

export async function readLifecycleSessionCache({
  path,
  timeoutMs,
  pollIntervalMs,
  readFileImplementation = readFile,
  delay = milliseconds => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds)),
  now = Date.now,
} = {}) {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) {
    throw new TypeError('lifecycle Session cache path must be an absolute path')
  }
  for (const [name, value] of Object.entries({ timeoutMs, pollIntervalMs })) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new TypeError(`lifecycle Session cache ${name} must be a positive integer`)
    }
  }
  if (typeof readFileImplementation !== 'function' || typeof delay !== 'function' || typeof now !== 'function') {
    throw new TypeError('lifecycle Session cache read, delay, and clock dependencies must be functions')
  }
  const startedAt = now()
  if (!Number.isFinite(startedAt)) throw new TypeError('lifecycle Session cache clock must return a finite number')
  const deadline = startedAt + timeoutMs

  while (true) {
    try {
      const content = await readFileImplementation(path, 'utf8')
      return JSON.parse(content)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      const remainingMs = deadline - now()
      if (remainingMs <= 0) {
        throw new Error(`timed out waiting for the official Session cache file ${path}`, { cause: error })
      }
      await delay(Math.min(pollIntervalMs, remainingMs))
    }
  }
}

export async function observeLifecyclePortOwners(ports) {
  if (!Array.isArray(ports) || ports.some(port => !Number.isSafeInteger(port) || port < 1 || port > 65_535)) {
    throw new TypeError('lifecycle OS port observation requires valid TCP port numbers')
  }
  return Promise.all(ports.map(async port => {
    try {
      const { stdout } = await execFileAsync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fp'], { encoding: 'utf8' })
      const pids = [...new Set(stdout.split('\n')
        .filter(line => line.startsWith('p'))
        .map(line => Number(line.slice(1)))
        .filter(Number.isSafeInteger))]
      return { port, pids }
    } catch (error) {
      if (error.code === 1) return { port, pids: [] }
      throw error
    }
  }))
}

export function createLifecycleRunRegistry() {
  const runs = new Map()
  const registry = Object.freeze({
    register(entry) {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)
        || !UUID_PATTERN.test(nonEmptyString(entry.runId, 'lifecycle run entry.runId'))) {
        throw new TypeError('lifecycle run registry entry must contain a UUID runId')
      }
      if (runs.has(entry.runId)) throw new TypeError(`lifecycle run registry already contains ${entry.runId}`)
      runs.set(entry.runId, entry)
      return entry
    },
    get(runId) {
      return runs.get(runId)
    },
    entries() {
      return [...runs.entries()]
    },
  })
  lifecycleRunRegistries.set(registry, runs)
  return registry
}

export async function invokeLifecycleStartUnlessAborted({ signal, start } = {}) {
  if (typeof start !== 'function') throw new TypeError('lifecycle start requires a start function')
  if (signal !== undefined && (signal === null || typeof signal.aborted !== 'boolean')) {
    throw new TypeError('lifecycle start signal must be an AbortSignal')
  }
  if (signal?.aborted) {
    const error = new Error('Lifecycle case was cancelled before Desktop process start')
    error.name = 'AbortError'
    throw error
  }
  return start(signal)
}

export async function cleanupRegisteredLifecycleRun({ registry, runId, getStatus, stopRun } = {}) {
  const runs = lifecycleRunRegistries.get(registry)
  if (runs === undefined) throw new TypeError('cleanup requires a lifecycle run registry created by this fixture')
  if (!UUID_PATTERN.test(runId ?? '')) throw new TypeError('cleanup requires a UUID runId')
  if (typeof getStatus !== 'function' || typeof stopRun !== 'function') {
    throw new TypeError('cleanup requires getStatus and stopRun functions')
  }
  const entry = runs.get(runId)
  if (entry === undefined) throw new TypeError(`lifecycle run registry does not contain ${runId}`)

  let status = await getStatus(entry)
  assertLifecycleRunStatusIdentity(status, runId)
  const leasePath = assertLifecycleRunLeaseIdentity(status, entry, runId)
  if (!await isLifecycleRunCleanAndReleased(status, leasePath)) {
    await stopRun(entry)
    status = await getStatus(entry)
    assertLifecycleRunStatusIdentity(status, runId)
    assertLifecycleRunLeaseIdentity(status, entry, runId)
  }
  if (!await isLifecycleRunCleanAndReleased(status, leasePath)) {
    throw new Error(`Lifecycle cleanup did not verify stopped process ownership, released ports, and development lease for ${runId}`)
  }
  runs.delete(runId)
  return { record: status.record, status }
}

export async function captureLifecycleFailureAndCleanup({ readStatus, afterFailure, cleanup } = {}) {
  if (typeof readStatus !== 'function' || typeof cleanup !== 'function') {
    throw new TypeError('lifecycle failure capture requires readStatus and cleanup functions')
  }
  if (afterFailure !== undefined && typeof afterFailure !== 'function') {
    throw new TypeError('lifecycle failure capture afterFailure must be a function')
  }
  let failureStatus
  try {
    failureStatus = await readStatus()
  } finally {
    await afterFailure?.(failureStatus ?? null)
  }
  const failureRecord = record(failureStatus?.record, 'lifecycle failure status.record')
  const cleanupResult = await cleanup()
  if (cleanupResult?.record?.runId !== failureRecord.runId
    || cleanupResult?.status?.record?.runId !== failureRecord.runId) {
    throw new TypeError('lifecycle cleanup result.runId does not match the failure snapshot')
  }
  return { failureStatus, cleanup: cleanupResult }
}

export function createLifecycleDesktopConfig(baseConfigValue, options) {
  const baseConfig = parseDesktopE2EConfig(structuredClone(baseConfigValue))
  const fixture = parseOfficialLifecycleFixture(options?.fixture)
  const fixtureId = requireUuid(options?.fixtureId, 'fixtureId')
  const runId = requireUuid(options?.runId, 'runId')
  const workspacePath = requireAbsolutePath(options?.workspacePath, 'workspacePath')
  const environmentFilePath = requireAbsolutePath(options?.environmentFilePath, 'environmentFilePath')
  const providers = record(options?.providers, 'providers')
  const configuredProviders = structuredClone(providers)
  const provider = record(configuredProviders[fixture.operations.defaultProviderId], 'configured lifecycle default provider')
  if (!Array.isArray(provider.models)
    || !provider.models.some(model => record(model, 'configured lifecycle default model').id === fixture.operations.defaultModelId)) {
    throw new TypeError(`providers must include ${fixture.operations.defaultProviderId}.${fixture.operations.defaultModelId}`)
  }

  const config = structuredClone(baseConfig)
  provider.apiKeyEnv = fixture.credentials.testKeyEnvironmentName
  const environmentRelativePath = [
    config.paths.runRootRelativePath,
    fixture.paths.environmentDirectoryName,
    fixtureId,
    runId,
  ].join('/')
  config.modes.development.environmentRootRelativePath = environmentRelativePath
  config.modes.development.environmentFilePath = environmentFilePath
  config.modes.development.credentialEnvironmentNames = [...new Set([
    ...baseConfig.modes.development.credentialEnvironmentNames,
    fixture.credentials.testKeyEnvironmentName,
  ])]
  config.modes.development.requiredEnvironmentNames = [fixture.credentials.testKeyEnvironmentName]
  config.modes.development.initialProfilePatches = [
    {
      id: fixture.profileEntries.agentDefaultModel,
      config: {
        provider: fixture.operations.defaultProviderId,
        model: fixture.operations.defaultModelId,
      },
    },
    {
      id: fixture.profileEntries.providerSettings,
      config: { providers: configuredProviders },
    },
    {
      id: fixture.profileEntries.pluginSettings,
      config: {
        configurationProfile: fixture.profileEntries.configurationProfile,
        startupWorkspacePath: workspacePath,
        configuration: { url: fixture.profileEntries.sourceUrl, port: fixture.profileEntries.sourcePort },
      },
    },
  ]
  return parseDesktopE2EConfig(config)
}

export async function writeLifecycleTestEnvironmentFile(path, fixtureValue) {
  const fixture = parseOfficialLifecycleFixture(fixtureValue)
  const target = requireAbsolutePath(path, 'test environment file path')
  await mkdir(dirname(target), { recursive: true, mode: 0o700 })
  const handle = await open(target, 'wx', 0o600)
  try {
    await handle.writeFile(`${fixture.credentials.testKeyEnvironmentName}=${fixture.credentials.testKeyValue}\n`, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  return target
}

export function createIsolatedDesktopSpawn(spawnImplementation = spawn, desktopConfigValue, fixtureValue) {
  if (typeof spawnImplementation !== 'function') throw new TypeError('spawnImplementation must be a function')
  const desktopConfig = parseDesktopE2EConfig(structuredClone(desktopConfigValue ?? desktopE2EConfigJson))
  const fixture = parseOfficialLifecycleFixture(fixtureValue)
  const dshHomeEnvironmentName = desktopConfig.invocation.environmentNames.dshHome

  return (executablePath, args, options) => {
    const environment = record(options?.env, 'Desktop spawn environment')
    const dshHome = requireAbsolutePath(environment[dshHomeEnvironmentName], `Desktop spawn environment.${dshHomeEnvironmentName}`)
    const homeDirectory = join(dshHome, fixture.paths.osHomeDirectoryName)
    const agentsHomeDirectory = join(dshHome, fixture.paths.agentsHomeDirectoryName)
    mkdirSync(homeDirectory, { recursive: true, mode: 0o700 })
    mkdirSync(agentsHomeDirectory, { recursive: true, mode: 0o700 })
    return spawnImplementation(executablePath, args, {
      ...options,
      env: {
        ...environment,
        HOME: homeDirectory,
        DSH_AGENTS_HOME: agentsHomeDirectory,
      },
    })
  }
}

export function createLifecycleRunObservation({
  fixture: fixtureValue,
  label,
  repositoryRoot,
  run,
  status = null,
  homePath,
  install = null,
  session = null,
  savedSetting = null,
  pluginManagerRecord = null,
  pluginManagerResponse = null,
  cleanup = null,
  stateOverride = null,
  failure = undefined,
} = {}) {
  const fixture = parseOfficialLifecycleFixture(fixtureValue)
  if (![...fixture.instanceLabels, ...Object.values(fixture.scenarioLabels)].includes(label)) {
    throw new TypeError('lifecycle observation label is not configured')
  }
  requireAbsolutePath(repositoryRoot, 'repositoryRoot')
  const recordValue = record(run?.record, 'Desktop probe run.record')
  const config = parseDesktopE2EConfig(structuredClone(run.config))
  const dshHome = requireAbsolutePath(recordValue.directories?.dshHome, 'Desktop probe run.record.directories.dshHome')
  const pluginInstallPath = join(
    dshHome,
    config.paths.profileRelativePath,
    'node_modules',
    pluginPackageConfig.packageName,
  )
  const home = homePath === undefined ? join(dshHome, fixture.paths.osHomeDirectoryName) : requireAbsolutePath(homePath, 'homePath')
  const processAtReady = simplifyProcessGroup(status?.processGroup ?? null, status?.processGroupMatchesRun === true, recordValue.process)
  const portOwnersAtReady = simplifyPortOwners(status?.ports ?? [], recordValue.ports ?? {})
  const configuredPorts = Object.values(recordValue.ports ?? {})
  const finalPortOwners = cleanup?.status?.ports ?? []
  const cleanupPortsReleased = configuredPorts.length > 0 && configuredPorts.every(port =>
    finalPortOwners.some(owner => owner.port === port && Array.isArray(owner.pids) && owner.pids.length === 0))
  const cleanupObservation = cleanup === null ? null : {
    state: cleanup.record?.state ?? cleanup.state ?? 'unknown',
    exitCode: cleanup.record?.result?.exitCode ?? null,
    error: cleanup.record?.result?.error ?? null,
    portsReleased: cleanupPortsReleased,
    processGroupMembers: simplifyProcessGroup(cleanup.status?.processGroup ?? null, cleanup.status?.processGroupMatchesRun === true),
    portOwners: simplifyPortOwners(cleanup.status?.ports ?? [], recordValue.ports ?? {}),
  }

  return {
    label,
    runId: recordValue.runId,
    state: stateOverride ?? recordValue.state,
    application: {
      bundlePath: recordValue.application.bundlePath,
      bundleId: recordValue.application.bundleId,
      version: recordValue.application.version,
    },
    directories: {
      home,
      dshHome,
      electronUserData: recordValue.directories.electronUserData,
      workspace: recordValue.directories.workspace,
      evidence: recordValue.directories.evidence,
      pluginInstallPath,
    },
    ports: { ...recordValue.ports },
    processObservedDuringStart: processAtReady,
    portOwnersAtReady,
    install: install === null ? null : {
      packageName: install.expectedPackageName ?? pluginPackageConfig.packageName,
      packageVersion: install.packageVersion,
      path: install.installedPackagePath === undefined ? pluginInstallPath : dirname(install.installedPackagePath),
      status: install.status,
      restartRequired: install.restartRequired,
      enabled: install.enabled,
      evidenceComplete: install.evidenceComplete,
      artifactComparisons: install.artifactComparisons,
      loadedClientSource: install.loadedClientSource,
    },
    session: session === null ? null : {
      workspaceId: session.workspaceId,
      sessionId: session.sessionId,
      title: session.title,
      remoteResponse: session.remoteResponse,
      workspaceReadback: session.workspaceReadback,
      identityReadback: session.identityReadback,
      visibleSessionIds: session.visibleSessionIds,
    },
    savedSetting: savedSetting === null ? null : {
      entryId: savedSetting.entryId,
      browserExecutablePath: savedSetting.browserExecutablePath,
    },
    pluginManagerRecord: pluginManagerRecord === null ? null : {
      name: pluginManagerRecord.name,
      version: pluginManagerRecord.version,
      installed: pluginManagerRecord.installed,
      enabled: pluginManagerRecord.enabled,
    },
    pluginManagerResponse,
    cleanup: cleanupObservation,
    failure: failure === undefined ? recordValue.result?.error ?? null : failure,
  }
}

export function createOfficialLifecycleEvidence({
  fixture: fixtureValue,
  scenario,
  fixtureId,
  fixtureRoot,
  artifact,
  environments,
  parallelRequest = null,
  recordedAt = new Date().toISOString(),
} = {}) {
  const fixture = parseOfficialLifecycleFixture(fixtureValue)
  const allRunsStopped = environments.every(environment => environment.state === 'stopped'
    || environment.cleanup !== null && environment.cleanup.processGroupMembers === null)
  const allPortsReleased = environments.every(environment => environment.cleanup?.portsReleased === true)
  return parseOfficialLifecycleEvidence({
    schemaVersion: 1,
    classification: fixture.classification,
    acceptanceClaim: fixture.acceptanceClaim,
    scenario,
    recordedAt,
    fixtureId: requireUuid(fixtureId, 'fixtureId'),
    fixtureRoot: requireAbsolutePath(fixtureRoot, 'fixtureRoot'),
    artifact: {
      packageName: artifact.packageName,
      packageVersion: artifact.packageVersion,
      sourcePath: requireAbsolutePath(artifact.sourcePath, 'artifact.sourcePath'),
      stagedPath: requireAbsolutePath(artifact.stagedPath, 'artifact.stagedPath'),
      sourceIdentity: artifact.sourceIdentity,
    },
    environments,
    parallelRequest,
    cleanup: {
      allRunsStopped,
      allPortsReleased,
      verifiedAt: recordedAt,
    },
  })
}

export async function stageLifecycleTarball({ sourcePath, artifactRoot, repositoryRoot, packageName, packageVersion, fixture: fixtureValue } = {}) {
  const fixture = parseOfficialLifecycleFixture(fixtureValue)
  const source = requireAbsolutePath(sourcePath, 'tarball sourcePath')
  const root = requireAbsolutePath(artifactRoot, 'tarball artifactRoot')
  const repository = await realpath(requireAbsolutePath(repositoryRoot, 'repositoryRoot'))
  assertContainedPath(repository, root, 'tarball artifactRoot')
  if (!PACKAGE_NAME_PATTERN.test(nonEmptyString(packageName, 'tarball packageName'))) {
    throw new TypeError('tarball packageName must be an unscoped package name')
  }
  if (!VERSION_PATTERN.test(nonEmptyString(packageVersion, 'tarball packageVersion'))) {
    throw new TypeError('tarball packageVersion must be a semantic version')
  }
  const sourceInfo = await lstat(source)
  if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink()) throw new TypeError('tarball sourcePath must be a regular file')
  await mkdir(root, { recursive: true, mode: 0o700 })
  await assertNoSymlinkAncestors(repository, root)
  const rootRealPath = await realpath(root)
  const destination = join(rootRealPath, `${packageName}-${packageVersion}.tgz`)
  if (resolve(source) === destination) return { sourcePath: source, stagedPath: destination, packageName, packageVersion }
  await copyFile(source, destination)
  const destinationInfo = await stat(destination)
  if (destinationInfo.size !== sourceInfo.size) throw new Error('staged Desktop lifecycle tarball size does not match its source')
  if (!(await readFile(source)).equals(await readFile(destination))) {
    throw new Error('staged Desktop lifecycle tarball bytes do not match the fixed candidate archive')
  }
  return { sourcePath: source, stagedPath: destination, packageName, packageVersion }
}

export function assertIndependentLifecycleEnvironments(environments) {
  if (!Array.isArray(environments) || environments.length !== 2) {
    throw new TypeError('A13 requires exactly two running Desktop environments')
  }
  const [first, second] = environments
  if (first.runId === second.runId) throw new Error('A13 environments must use different run IDs')
  for (const key of ['home', 'dshHome', 'electronUserData', 'workspace', 'evidence', 'pluginInstallPath']) {
    if (first.directories[key] === second.directories[key]) {
      throw new Error(`A13 environments must use different ${key} directories`)
    }
  }
  const allPorts = [...Object.values(first.ports), ...Object.values(second.ports)]
  if (new Set(allPorts).size !== allPorts.length) throw new Error('A13 environments must use different OS-allocated ports')
  return true
}

export async function writeOfficialLifecycleEvidence({ evidence, directory, repositoryRoot, fixture: fixtureValue } = {}) {
  const fixture = parseOfficialLifecycleFixture(fixtureValue)
  const report = parseOfficialLifecycleEvidence(evidence)
  const repository = await realpath(requireAbsolutePath(repositoryRoot, 'repositoryRoot'))
  const targetDirectory = resolve(directory)
  assertContainedPath(repository, targetDirectory, 'lifecycle evidence directory')
  await mkdir(targetDirectory, { recursive: true, mode: 0o700 })
  await assertNoSymlinkAncestors(repository, targetDirectory)
  const filename = fixture.paths.evidenceFilenames[report.scenario]
  if (filename === undefined) throw new TypeError(`lifecycle evidence scenario is not configured: ${report.scenario}`)
  const target = join(targetDirectory, filename)
  const handle = await open(target, 'wx', 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(report, null, 2)}\n`, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  return target
}

export function createDebugRetentionEvidence({ run, repositoryRoot, desktopConfig, fixture: fixtureValue, retainedAt = new Date().toISOString() } = {}) {
  const fixture = parseOfficialLifecycleFixture(fixtureValue)
  const config = parseDesktopE2EConfig(structuredClone(desktopConfig))
  const recordValue = record(run?.record, 'debug-retained run.record')
  const repository = requireAbsolutePath(repositoryRoot, 'repositoryRoot')
  if (recordValue.state !== 'running' || recordValue.process === null) {
    throw new TypeError('debug retention requires a running Desktop probe')
  }
  return {
    schemaVersion: 1,
    classification: fixture.classification,
    acceptanceClaim: fixture.acceptanceClaim,
    runId: recordValue.runId,
    application: { ...recordValue.application },
    process: {
      pid: recordValue.process.pid,
      processGroupId: recordValue.process.processGroupId,
    },
    ports: { ...recordValue.ports },
    evidenceDirectory: recordValue.directories.evidence,
    stopMethod: 'stopProbe({ runId, repositoryRoot, config })',
    stopInvocation: { runId: recordValue.runId, repositoryRoot: repository, configPath: 'config/desktop-e2e.json' },
    configuredProfile: config.paths.profileRelativePath,
    retainedAt,
  }
}

export async function writeDebugRetentionEvidence({ evidence, repositoryRoot, fixture: fixtureValue } = {}) {
  const fixture = parseOfficialLifecycleFixture(fixtureValue)
  const report = parseOfficialLifecycleDebugRetentionEvidence(evidence)
  const repository = await realpath(requireAbsolutePath(repositoryRoot, 'repositoryRoot'))
  assertContainedPath(repository, report.evidenceDirectory, 'debug retention evidence directory')
  await assertNoSymlinkAncestors(repository, report.evidenceDirectory)
  const path = join(report.evidenceDirectory, fixture.paths.debugRetentionFilename)
  const handle = await open(path, 'wx', 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(report, null, 2)}\n`, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  return path
}

function simplifyProcessGroup(group, matchesRun = false, recordedProcess = null) {
  if (group === null) return null
  if (!Array.isArray(group.members)) throw new TypeError('processGroup.members must be an array')
  return {
    rootPid: group.processGroupId,
    processGroupId: group.processGroupId,
    matchesRun,
    members: group.members.map(member => {
      const recordedRoot = recordedProcess?.pid === member.pid
        && recordedProcess.processGroupId === group.processGroupId
        ? recordedProcess
        : null
      const command = typeof member.command === 'string' && member.command.trim() !== ''
        ? member.command
        : recordedRoot?.command
      const workingDirectory = typeof member.workingDirectory === 'string' && isAbsolute(member.workingDirectory)
        ? member.workingDirectory
        : recordedRoot?.workingDirectory
      return {
        pid: member.pid,
        parentPid: member.parentPid,
        processGroupId: member.processGroupId,
        command,
        workingDirectory: typeof workingDirectory === 'string' && isAbsolute(workingDirectory) ? workingDirectory : null,
        listeningPorts: [...member.listeningPorts],
      }
    }),
  }
}

function simplifyPortOwners(owners, ports) {
  if (!Array.isArray(owners)) throw new TypeError('Desktop port ownership observations must be an array')
  const configuredPorts = new Set(Object.values(ports))
  return owners
    .filter(owner => configuredPorts.has(owner.port))
    .map(owner => ({ port: owner.port, pids: [...owner.pids] }))
    .sort((left, right) => left.port - right.port)
}

function assertContainedPath(root, candidate, label) {
  requireAbsolutePath(candidate, label)
  const pathRelative = relative(resolve(root), resolve(candidate))
  if (pathRelative === '..' || pathRelative.startsWith(`..${sep}`) || isAbsolute(pathRelative)) {
    throw new TypeError(`${label} must remain inside the repository`)
  }
}

async function assertNoSymlinkAncestors(root, candidate) {
  assertContainedPath(root, candidate, 'lifecycle path')
  let cursor = resolve(root)
  const parts = relative(cursor, resolve(candidate)).split(sep).filter(Boolean)
  for (const part of parts) {
    cursor = join(cursor, part)
    try {
      const info = await lstat(cursor)
      if (info.isSymbolicLink()) throw new TypeError(`lifecycle path contains a symbolic-link ancestor: ${cursor}`)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      break
    }
  }
}

function record(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`)
  return value
}

function assertLifecycleRunStatusIdentity(statusValue, runId) {
  const status = record(statusValue, 'lifecycle cleanup status')
  const statusRecord = record(status.record, 'lifecycle cleanup status.record')
  if (statusRecord.runId !== runId) throw new TypeError('lifecycle cleanup status.runId does not match the registered run')
  if (!Array.isArray(status.ports)) throw new TypeError('lifecycle cleanup status.ports must be an array')
  for (const [index, ownerValue] of status.ports.entries()) {
    const owner = record(ownerValue, `lifecycle cleanup status.ports[${index}]`)
    positiveInteger(owner.port, `lifecycle cleanup status.ports[${index}].port`, 65_535)
    if (!Array.isArray(owner.pids) || owner.pids.some(pid => !Number.isSafeInteger(pid) || pid < 1)) {
      throw new TypeError(`lifecycle cleanup status.ports[${index}].pids must contain positive process IDs`)
    }
  }
}

function assertLifecycleRunLeaseIdentity(status, entry, runId) {
  const observedLeasePath = status.record.environment?.leasePath
  const registeredRecord = record(entry.run?.record, 'registered lifecycle run.record')
  const registeredLeasePath = registeredRecord.environment?.leasePath
  if (registeredRecord.runId !== runId || typeof registeredLeasePath !== 'string'
    || !isAbsolute(registeredLeasePath) || observedLeasePath !== registeredLeasePath) {
    throw new TypeError('lifecycle cleanup development lease path does not match the registered run')
  }
  return registeredLeasePath
}

async function isLifecycleRunCleanAndReleased(status, leasePath) {
  const unspawnedPortConflict = status.record.state === 'failed'
    && status.record.process === null
    && typeof status.record.result?.error === 'string'
    && status.record.result.error.startsWith('PORT_CONFLICT:')
  const leaseReleased = await isLifecycleLeaseReleased(leasePath)
  return ['stopped', 'failed', 'cancelled'].includes(status.record.state)
    && (status.record.result?.portsReleased === true || unspawnedPortConflict)
    && status.processGroup === null
    && status.ports.length > 0
    && status.ports.every(owner => owner.pids.length === 0)
    && leaseReleased
}

async function isLifecycleLeaseReleased(leasePath) {
  try {
    await lstat(leasePath)
    return false
  } catch (error) {
    if (error?.code === 'ENOENT') return true
    throw error
  }
}

function requireUuid(value, label) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new TypeError(`${label} must be a UUID`)
  return value
}

function requireAbsolutePath(value, label) {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0')) {
    throw new TypeError(`${label} must be an absolute path`)
  }
  return value
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} must be a non-empty string`)
  return value
}

function positiveInteger(value, label, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new TypeError(`${label} must be a valid positive integer`)
  return value
}

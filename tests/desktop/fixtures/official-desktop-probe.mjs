import { createServer } from 'node:net'
import { access, lstat, mkdir, open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import { parseArgs, promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  matchesDesktopRendererTitle,
  parseDesktopE2EConfig,
  parseDevelopmentEnvironmentLeaseRecord,
  parseDesktopE2EPreparationFailureEvidence,
  parseDesktopE2ERunRecord,
} from '../../../config/desktop-e2e-schema.mjs'
import {
  inspectDevelopmentEnvironment,
  loadDevelopmentEnvironmentOverrides,
  prepareDevelopmentEnvironment,
  releaseDevelopmentEnvironmentLease,
} from './development-environment.mjs'
import { loadOfficialProfilePatchAdapter } from './official-profile-patch.mjs'
import {
  assertRendererCdpResponse,
  validateRendererPageWebSocketTarget,
} from './renderer-target-validation.mjs'

const CONFIG_URL = new URL('../../../config/desktop-e2e.json', import.meta.url)
const PORT_RESERVATIONS = new Map()
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const execFileAsync = promisify(execFile)

export async function loadDesktopE2EConfig() {
  const value = JSON.parse(await readFile(CONFIG_URL, 'utf8'))
  return parseDesktopE2EConfig(value)
}

export async function reserveLoopbackPort({ port = 0, host } = {}) {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new TypeError('port must be an integer from 0 through 65535')
  }
  const config = await loadDesktopE2EConfig()
  const bindAddress = host ?? config.ports.host
  if (bindAddress !== config.ports.host) throw new TypeError(`probe ports must bind to ${config.ports.host}`)
  const server = createServer()
  try {
    await new Promise((resolveListen, rejectListen) => {
      server.once('error', rejectListen)
      server.listen({ port, host: bindAddress, exclusive: true }, resolveListen)
    })
  } catch (error) {
    if (error?.code === 'EADDRINUSE') {
      const conflict = new Error(`PORT_CONFLICT: ${bindAddress}:${port} is already in use`, { cause: error })
      conflict.code = 'PORT_CONFLICT'
      throw conflict
    }
    throw error
  }
  const address = server.address()
  if (address === null || typeof address === 'string') {
    await closeServer(server)
    throw new Error('PORT_RESERVATION_FAILED: loopback listener has no TCP port')
  }
  let released = false
  return {
    port: address.port,
    async release() {
      if (released) return
      released = true
      await closeServer(server)
    },
  }
}

export async function prepareProbeRun({
  repositoryRoot = process.cwd(), runId = randomUUID(), mode: requestedMode, signal, config: configOverride,
  profilePatchAdapter,
} = {}) {
  const config = configOverride === undefined ? await loadDesktopE2EConfig() : parseDesktopE2EConfig(configOverride)
  if (!UUID_PATTERN.test(runId)) throw new TypeError('runId must be a UUID')
  const mode = requestedMode ?? config.modes.defaultMode
  if (!Object.hasOwn(config.modes, mode) || mode === 'defaultMode') throw new TypeError(`unknown Desktop probe mode: ${mode}`)

  const repository = await realpath(repositoryRoot)
  const runRoot = resolve(repository, config.paths.runRootRelativePath)
  const runRootRelative = relative(repository, runRoot)
  if (runRootRelative === '..' || runRootRelative.startsWith(`..${sep}`) || isAbsolute(runRootRelative)) {
    throw new TypeError('desktop E2E run root must remain inside the repository')
  }
  await assertNoSymlinkAncestors(repository, runRoot)
  await mkdir(runRoot, { recursive: true, mode: 0o700 })
  const runDirectory = join(runRoot, runId)
  await mkdir(runDirectory, { mode: 0o700 })

  const names = config.paths.directoryNames
  const evidenceDirectory = join(runDirectory, names.evidence)
  const failureEvidencePath = join(evidenceDirectory, config.paths.outputFilenames.preparationFailureEvidence)
  let developmentEnvironment = null
  const reservations = []
  try {
    throwIfAborted(signal)
    if (config.modes[mode].persistent) {
      developmentEnvironment = await prepareDevelopmentEnvironment({ repositoryRoot: repository, runId, config })
    }
    const directories = {
      run: runDirectory,
      dshHome: developmentEnvironment?.directories.dshHome ?? join(runDirectory, names.dshHome),
      electronUserData: developmentEnvironment?.directories.electronUserData ?? join(runDirectory, names.electronUserData),
      workspace: developmentEnvironment?.directories.workspace ?? join(runDirectory, names.workspace),
      logs: join(runDirectory, names.logs),
      evidence: join(runDirectory, names.evidence),
      profile: developmentEnvironment?.directories.profile ?? join(runDirectory, names.dshHome, config.paths.profileRelativePath),
      diagnosticFile: join(runDirectory, names.logs, config.paths.diagnosticFilename),
    }
    await assertNoSymlinkAncestors(repository, runDirectory)
    for (const directory of new Set([
      directories.dshHome, directories.electronUserData, directories.workspace,
      directories.logs, directories.evidence, directories.profile,
    ])) {
      await assertNoSymlinkAncestors(repository, directory)
      await mkdir(directory, { recursive: true, mode: 0o700 })
    }
    throwIfAborted(signal)

    for (const role of config.ports.roles) reservations.push(await reserveLoopbackPort({ host: config.ports.host }))
    const ports = Object.fromEntries(config.ports.roles.map((role, index) => [role, reservations[index].port]))
    if (new Set(Object.values(ports)).size !== config.ports.roles.length) {
      throw new Error('PORT_CONFLICT: operating system returned a duplicate loopback port')
    }
    throwIfAborted(signal)

    const environment = {
      [config.invocation.environmentNames.dshHome]: directories.dshHome,
      [config.invocation.environmentNames.electronUserData]: directories.electronUserData,
      [config.invocation.environmentNames.diagnosticFile]: directories.diagnosticFile,
      [config.invocation.environmentNames.hostInspectorPort]: String(ports.hostInspector),
    }
    const argumentValues = {
      electronUserData: directories.electronUserData,
      rendererCdpPort: String(ports.rendererCdp),
      loopbackHost: config.ports.host,
    }
    const args = config.invocation.arguments.map(argument => argument.replace(/\{([^}]+)\}/gu, (match, key) => {
      if (!Object.hasOwn(argumentValues, key)) throw new TypeError(`unknown invocation argument placeholder: ${key}`)
      return argumentValues[key]
    }))
    const executablePath = join(config.application.bundlePath, config.application.executableRelativePath)
    const profilePatch = createPortPatch(
      config.profilePortPatch.entryId,
      config.profilePortPatch.hostField,
      config.profilePortPatch.portField,
      config.ports.host,
      ports.host,
    )
    await writeProfilePortPatch(
      join(directories.profile, config.paths.profilePatchFilename),
      profilePatch,
      {
        persistent: config.modes[mode].persistent,
        initialProfilePatches: mode === 'development' ? config.modes.development.initialProfilePatches : [],
        profilePatchAdapter,
        signal,
      },
    )
    throwIfAborted(signal)

    const now = new Date().toISOString()
    const record = parseDesktopE2ERunRecord({
      schemaVersion: 1,
      runId,
      mode,
      state: 'prepared',
      createdAt: now,
      updatedAt: now,
      application: {
        bundlePath: config.application.bundlePath,
        executablePath,
        version: config.application.version,
        bundleId: config.application.bundleId,
      },
      directories,
      environment: developmentEnvironment === null
        ? { root: null, leasePath: null }
        : { root: developmentEnvironment.environmentRoot, leasePath: developmentEnvironment.leasePath },
      ports,
      launch: {
        arguments: args,
        environment,
        unsetEnvironmentNames: config.invocation.unsetEnvironmentNames,
      },
      process: null,
      result: null,
    }, config)
    const recordPath = join(runDirectory, config.paths.runRecordFilename)
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    PORT_RESERVATIONS.set(runId, reservations)
    return { config, record, recordPath, developmentEnvironment }
  } catch (error) {
    const portReleaseResults = await Promise.allSettled(reservations.map(reservation => reservation.release()))
    const portsReleased = portReleaseResults.every(result => result.status === 'fulfilled')
    let environmentLease = developmentEnvironment === null ? 'not-acquired' : 'retained'
    if (developmentEnvironment !== null) {
      try {
        await developmentEnvironment.release()
        environmentLease = 'released'
      } catch {
        environmentLease = 'retained'
      }
    }
    await rm(join(runDirectory, config.paths.runRecordFilename), { force: true }).catch(() => undefined)

    let evidenceWritten = false
    try {
      await assertNoSymlinkAncestors(repository, evidenceDirectory)
      await mkdir(evidenceDirectory, { recursive: true, mode: 0o700 })
      const evidence = parseDesktopE2EPreparationFailureEvidence({
        schemaVersion: 1,
        runId,
        mode,
        phase: 'prepare',
        code: safeErrorCode(error),
        errorType: safeErrorType(error),
        recordedAt: new Date().toISOString(),
        cleanup: { portsReleased, environmentLease },
      }, config)
      await writeFile(failureEvidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
        encoding: 'utf8', flag: 'wx', mode: 0o600,
      })
      evidenceWritten = true
    } catch {
      evidenceWritten = false
    }
    const finalError = error instanceof Error ? error : new Error('Desktop probe preparation failed')
    finalError.preparationFailure = { runId, evidencePath: failureEvidencePath, evidenceWritten }
    throw finalError
  }
}

export async function releasePortReservations(runId) {
  const reservations = PORT_RESERVATIONS.get(runId)
  if (reservations === undefined) return 0
  PORT_RESERVATIONS.delete(runId)
  const results = await Promise.allSettled(reservations.map(reservation => reservation.release()))
  const failure = results.find(result => result.status === 'rejected')
  if (failure) throw failure.reason
  return reservations.length
}

export async function inspectProcessGroup(rootPid, { execFileImplementation = execFileAsync } = {}) {
  if (!Number.isSafeInteger(rootPid) || rootPid < 1) throw new TypeError('rootPid must be a positive integer')
  const { stdout } = await execFileImplementation('ps', ['-axo', 'pid=,ppid=,pgid=,command='], { encoding: 'utf8' })
  const processRows = stdout.split('\n').map(parsePsRow).filter(Boolean)
  const members = processRows.filter(candidate => candidate.processGroupId === rootPid)
  if (members.length === 0) return null

  const detailed = await Promise.all(members.map(async candidate => {
    const [workingDirectory, listeningPorts] = await Promise.all([
      inspectWorkingDirectory(candidate.pid, execFileImplementation),
      inspectListeningPorts(candidate.pid, execFileImplementation),
    ])
    return { ...candidate, workingDirectory, listeningPorts }
  }))
  return { processGroupId: rootPid, members: detailed }
}

export function processGroupMatchesRun(group, record) {
  if (group === null || group.processGroupId !== record.process?.processGroupId) return false
  const root = group.members.find(candidate => candidate.pid === record.process.pid)
  if (root === undefined || root.processGroupId !== root.pid) return false
  if (!root.command.includes(record.application.executablePath)) return false
  if (root.workingDirectory !== record.directories.workspace) return false
  return record.launch.arguments.every(argument => root.command.includes(argument))
}

async function writeProfilePortPatch(path, patchRows, { persistent, initialProfilePatches, profilePatchAdapter, signal }) {
  const initialRows = persistent ? [...initialProfilePatches, ...patchRows] : patchRows
  const initialContent = `${JSON.stringify(initialRows, null, 2)}\n`
  if (!persistent) {
    throwIfAborted(signal)
    await writeFile(path, initialContent, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    return
  }

  let source
  try {
    source = await readFile(path, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    try {
      throwIfAborted(signal)
      await writeFile(path, initialContent, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      return
    } catch (writeError) {
      if (writeError?.code !== 'EEXIST') throw writeError
      source = await readFile(path, 'utf8')
    }
  }

  if (profilePatchAdapter === undefined || profilePatchAdapter === null) {
    const unavailable = new Error(`DEVELOPMENT_PROFILE_PARSER_REQUIRED: profile patch exists at ${path}; provide an explicit YAML adapter that preserves other settings, then retry`)
    unavailable.code = 'DEVELOPMENT_PROFILE_PARSER_REQUIRED'
    throw unavailable
  }
  for (const method of ['parse', 'updateProfilePatch', 'serialize']) {
    if (typeof profilePatchAdapter[method] !== 'function') {
      const invalid = new Error(`DEVELOPMENT_PROFILE_PARSER_INVALID: profile patch at ${path} requires adapter method ${method}(); provide a complete YAML adapter, then retry`)
      invalid.code = 'DEVELOPMENT_PROFILE_PARSER_INVALID'
      throw invalid
    }
  }

  let serialized
  try {
    const document = await profilePatchAdapter.parse(source)
    const updated = await profilePatchAdapter.updateProfilePatch(document, {
      entryId: patchRows[0].id,
      config: patchRows[0].config,
    })
    serialized = await profilePatchAdapter.serialize(updated)
    if (typeof serialized !== 'string') throw new TypeError('serialize() must return YAML text')
  } catch (error) {
    const invalid = new Error(`DEVELOPMENT_PROFILE_PATCH_INVALID: the YAML adapter failed for ${path}; correct the adapter and retry without logging profile contents`)
    invalid.code = 'DEVELOPMENT_PROFILE_PATCH_INVALID'
    invalid.diagnosticType = safeErrorType(error)
    throw invalid
  }

  const latestSource = await readFile(path, 'utf8')
  if (latestSource !== source) {
    const changed = new Error(`DEVELOPMENT_PROFILE_PATCH_CHANGED: profile settings changed while preparing the Host port update: ${path}`)
    changed.code = 'DEVELOPMENT_PROFILE_PATCH_CHANGED'
    throw changed
  }
  throwIfAborted(signal)

  const temporaryPath = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, serialized.endsWith('\n') ? serialized : `${serialized}\n`, {
      encoding: 'utf8', flag: 'wx', mode: 0o600,
    })
    await rename(temporaryPath, path)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
}

export async function startProbe({
  repositoryRoot = process.cwd(), runId, mode, signal, config, inspect = inspectProcessGroup,
  profilePatchAdapter,
  portOwners = inspectPortOwners, spawnProcess = spawn, verifyApplication = readInstalledApplicationIdentity,
  accessExecutable = access, readEnvironmentFile = readFile, openLog = open,
  signalProcessGroup = signalGroup, rendererStatus = inspectRendererStatus, now = Date.now, sleep = delay,
} = {}) {
  const prepared = await prepareProbeRun({ repositoryRoot, runId, mode, signal, config, profilePatchAdapter })
  let record = prepared.record
  let child = null
  let childExitResult = null
  let childError = null
  let logHandles = []
  let recordPersistenceError = null
  try {
    const installed = await verifyApplication(prepared.config)
    if (installed.version !== record.application.version
      || installed.bundleId !== record.application.bundleId
      || installed.executablePath !== record.application.executablePath) {
      throw probeError('APPLICATION_IDENTITY_MISMATCH',
        `installed app is ${installed.bundleId} ${installed.version} at ${installed.executablePath}; config requires ${record.application.bundleId} ${record.application.version} at ${record.application.executablePath}`)
    }
    await accessExecutable(record.application.executablePath)
    await releasePortReservations(record.runId)
    const beforeLaunchOwners = await portOwners(Object.values(record.ports))
    if (beforeLaunchOwners.some(owner => owner.pids.length > 0)) {
      throw probeError('PORT_CONFLICT', `assigned ports are already listening: ${formatPortOwners(beforeLaunchOwners)}`)
    }
    throwIfAborted(signal)

    const stdoutPath = join(record.directories.logs, prepared.config.paths.outputFilenames.stdoutLog)
    const stderrPath = join(record.directories.logs, prepared.config.paths.outputFilenames.stderrLog)
    logHandles.push(await openLog(stdoutPath, 'wx', 0o600))
    logHandles.push(await openLog(stderrPath, 'wx', 0o600))
    const [stdoutHandle, stderrHandle] = logHandles
    const credentialNames = prepared.config.modes.development.credentialEnvironmentNames
    const environmentOverrides = record.mode === 'development'
      ? await loadDevelopmentEnvironmentOverrides({
        environmentFilePath: prepared.config.modes.development.environmentFilePath,
        environmentNames: credentialNames,
        requiredEnvironmentNames: prepared.config.modes.development.requiredEnvironmentNames,
        readEnvironmentFile,
      })
      : {}
    throwIfAborted(signal)
    const childEnvironment = { ...process.env }
    for (const name of credentialNames) delete childEnvironment[name]
    Object.assign(childEnvironment, environmentOverrides, record.launch.environment)
    for (const name of record.launch.unsetEnvironmentNames) delete childEnvironment[name]
    delete childEnvironment[prepared.config.commandRunner.invocationDirectoryEnvironmentName]
    throwIfAborted(signal)
    child = spawnProcess(record.application.executablePath, record.launch.arguments, {
      cwd: record.directories.workspace,
      env: childEnvironment,
      detached: true,
      stdio: ['ignore', stdoutHandle.fd, stderrHandle.fd],
    })
    observeChildExit(child, error => { childError = error }, result => { childExitResult = result })
    if (!Number.isSafeInteger(child.pid) || child.pid < 1) throw probeError('SPAWN_FAILED', 'operating system did not return the probe process PID')
    record = {
      ...record,
      state: 'starting',
      updatedAt: new Date(now()).toISOString(),
      process: {
        pid: child.pid,
        processGroupId: child.pid,
        command: `${record.application.executablePath} ${record.launch.arguments.join(' ')}`,
        workingDirectory: record.directories.workspace,
        listeningPorts: [],
        observedAt: new Date(now()).toISOString(),
      },
    }
    child.unref()
    for (const handle of logHandles) await handle.close()
    logHandles = []
    try {
      await saveRunRecord(record, prepared.recordPath, prepared.config)
    } catch (error) {
      recordPersistenceError = error
      throw error
    }

    const startedAt = now()
    const startupDeadline = startedAt + prepared.config.startup.startupTimeoutMs
    const portDeadline = startedAt + prepared.config.startup.portReadyTimeoutMs
    const observedChildExit = () => childExitResult ?? (
      child.exitCode !== null || child.signalCode !== null
        ? { code: child.exitCode, signal: child.signalCode }
        : null
    )
    const assertChildRunning = () => {
      throwIfAborted(signal)
      if (childError !== null) throw probeError('SPAWN_FAILED', `probe process could not start: ${childError.message}`)
      const exited = observedChildExit()
      if (exited !== null) {
        const code = now() - startedAt <= prepared.config.startup.singleInstanceExitWindowMs
          ? 'SINGLE_INSTANCE_LOCK_OR_EARLY_EXIT'
          : 'APPLICATION_EARLY_EXIT'
        throw probeError(code,
          `probe process exited before Host and Renderer UI readiness (exit=${String(exited.code ?? exited.signal)})`)
      }
    }
    const inspectReadyOwnership = async () => {
      assertChildRunning()
      const group = await inspect(child.pid)
      assertChildRunning()
      if (group === null) {
        throw probeError('APPLICATION_EARLY_EXIT', 'probe process group disappeared before readiness could be committed')
      }
      if (!processGroupMatchesRun(group, record)) {
        throw probeError('PROCESS_IDENTITY_MISMATCH', 'probe process identity changed before readiness could be committed')
      }
      const owners = await portOwners(Object.values(record.ports))
      assertChildRunning()
      const groupPids = new Set(group.members.map(member => member.pid))
      const foreignOwners = owners.filter(owner => owner.pids.some(pid => !groupPids.has(pid)))
      if (foreignOwners.length > 0) {
        throw probeError('PORT_CONFLICT', `a probe port changed ownership before readiness could be committed: ${formatPortOwners(foreignOwners)}`)
      }
      const ownedListeningPorts = owners
        .filter(owner => owner.pids.some(pid => groupPids.has(pid)))
        .map(owner => owner.port)
      const missingRequiredPorts = prepared.config.ports.requiredForReady
        .filter(role => !ownedListeningPorts.includes(record.ports[role]))
      if (missingRequiredPorts.length > 0) {
        throw probeError('PROCESS_IDENTITY_MISMATCH',
          `required readiness ports changed ownership before readiness could be committed: ${missingRequiredPorts.join(', ')}`)
      }
      return { group, owners, ownedListeningPorts }
    }
    const verifyRendererOwnership = async () => {
      const ownership = await inspectReadyOwnership()
      if (now() >= startupDeadline) {
        throw probeError('STARTUP_TIMEOUT', 'startup deadline expired while verifying Renderer process and port ownership')
      }
      return ownership
    }
    let lastGroup = null
    let lastOwners = []
    let requiredListenersReady = false
    while (now() < startupDeadline) {
      assertChildRunning()

      lastGroup = await inspect(child.pid)
      assertChildRunning()
      if (lastGroup === null) {
        assertChildRunning()
      } else if (!processGroupMatchesRun(lastGroup, record)) {
        throw probeError('PROCESS_IDENTITY_MISMATCH', 'probe PID, command, user-data argument, or process group did not match this run')
      }

      lastOwners = await portOwners(Object.values(record.ports))
      assertChildRunning()
      const groupPids = new Set(lastGroup?.members.map(member => member.pid) ?? [])
      const foreignOwners = lastOwners.filter(owner => owner.pids.some(pid => !groupPids.has(pid)))
      if (foreignOwners.length > 0) throw probeError('PORT_CONFLICT', `a probe port belongs to another process: ${formatPortOwners(foreignOwners)}`)

      const ownedListeningPorts = lastOwners.filter(owner => owner.pids.some(pid => groupPids.has(pid))).map(owner => owner.port)
      requiredListenersReady = prepared.config.ports.requiredForReady.every(role => ownedListeningPorts.includes(record.ports[role]))
      const readinessBudgetMs = startupDeadline - now()
      if (readinessBudgetMs <= 0) break
      const renderer = requiredListenersReady
        ? await rendererStatus(
          record.ports.rendererCdp,
          prepared.config.readiness,
          prepared.config.ports.host,
          readinessBudgetMs,
          prepared.config.startup.stopTimeoutMs,
          signal,
          verifyRendererOwnership,
        )
        : null
      assertChildRunning()
      if (now() >= startupDeadline) break
      if (requiredListenersReady && renderer?.ready === true && lastGroup !== null) {
        const readyOwnership = await inspectReadyOwnership()
        if (now() >= startupDeadline) break
        lastGroup = readyOwnership.group
        lastOwners = readyOwnership.owners
        requiredListenersReady = prepared.config.ports.requiredForReady.every(role =>
          readyOwnership.ownedListeningPorts.includes(record.ports[role]))
        record = {
          ...record,
          state: 'running',
          updatedAt: new Date(now()).toISOString(),
          process: processRecord(lastGroup, record, now()),
        }
        try {
          await saveRunRecord(record, prepared.recordPath, prepared.config)
        } catch (error) {
          recordPersistenceError = error
          throw error
        }
        assertChildRunning()
        const committedOwnership = await inspectReadyOwnership()
        if (now() >= startupDeadline) break
        lastGroup = committedOwnership.group
        lastOwners = committedOwnership.owners
        await writeEvidence(record.directories.evidence, prepared.config.paths.outputFilenames.startupReadyEvidence, {
          runId: record.runId,
          host: { address: prepared.config.ports.host, port: record.ports.host, owningPids: committedOwnership.owners.find(owner => owner.port === record.ports.host)?.pids ?? [] },
          rendererCdp: { address: prepared.config.ports.host, port: record.ports.rendererCdp, target: renderer },
          hostInspector: { address: prepared.config.ports.host, port: record.ports.hostInspector, listening: committedOwnership.ownedListeningPorts.includes(record.ports.hostInspector) },
          capabilities: prepared.config.capabilities,
          recordedAt: new Date(now()).toISOString(),
        })
        assertChildRunning()
        const finalOwnership = await inspectReadyOwnership()
        if (now() >= startupDeadline) break
        lastGroup = finalOwnership.group
        lastOwners = finalOwnership.owners
        return { ...prepared, record, stdoutPath, stderrPath, renderer }
      }
      if (!requiredListenersReady && now() >= portDeadline) break
      await sleep(prepared.config.startup.pollIntervalMs, signal)
    }
    throw probeError('STARTUP_TIMEOUT',
      `Host and Renderer UI were not ready within ${now() - startedAt}ms (port deadline ${prepared.config.startup.portReadyTimeoutMs}ms, startup deadline ${prepared.config.startup.startupTimeoutMs}ms); observed ${formatPortOwners(lastOwners)}`)
  } catch (error) {
    for (const handle of logHandles) await handle.close().catch(() => undefined)
    await releasePortReservations(record.runId).catch(() => undefined)
    const code = error?.name === 'AbortError' || signal?.aborted ? 'CANCELLED' : (error?.code ?? 'PROBE_FAILED')
    const message = error instanceof Error ? error.message : String(error)
    let cleanupError = null
    let cleanupFailureEvidenceWritten = false
    let stopResultEvidenceWritten = false
    let failureEvidenceWritten = false
    let failureEvidenceError = null
    if (record.process !== null) {
      try {
        const persisted = await readRunRecord(prepared.recordPath, prepared.config)
        if (persisted.process !== null || record.process === null) record = persisted
      } catch (readError) {
        recordPersistenceError ??= readError
      }
      try {
        record = await stopRecord(record, prepared.config, prepared.recordPath, {
          inspect, portOwners, signalProcessGroup, now, sleep,
          persistRunRecord: recordPersistenceError === null,
        })
        stopResultEvidenceWritten = true
      } catch (stopError) {
        cleanupError = stopError
        try {
          await writeEvidence(record.directories.evidence, prepared.config.paths.outputFilenames.cleanupFailureEvidence, {
            code: stopError?.code ?? 'CLEANUP_FAILED', message: stopError instanceof Error ? stopError.message : String(stopError),
            recordedAt: new Date(now()).toISOString(),
          })
          cleanupFailureEvidenceWritten = true
        } catch (evidenceError) {
          cleanupError = new AggregateError([stopError, evidenceError], 'process cleanup and its evidence write both failed')
        }
      }
      try {
        const persisted = await readRunRecord(prepared.recordPath, prepared.config)
        if (persisted.process !== null || record.process === null) record = persisted
      } catch (readError) {
        recordPersistenceError ??= readError
      }
    } else if (record.process === null && (!Number.isSafeInteger(child?.pid) || child.pid < 1)) {
      try {
        await prepared.developmentEnvironment?.release()
      } catch (releaseError) {
        cleanupError = releaseError
      }
    }
    let portsReleased = false
    try {
      portsReleased = (await portOwners(Object.values(record.ports))).every(owner => owner.pids.length === 0)
    } catch (portInspectionError) {
      cleanupError ??= portInspectionError
    }
    record = {
      ...record,
      state: code === 'CANCELLED' ? 'cancelled' : 'failed',
      updatedAt: new Date(now()).toISOString(),
      result: {
        exitCode: childExitResult?.code ?? child?.exitCode ?? null,
        error: `${code}: ${message}`,
        completedAt: new Date(now()).toISOString(),
        portsReleased,
      },
    }
    let finalPersistenceError = null
    try {
      await saveRunRecord(record, prepared.recordPath, prepared.config)
    } catch (persistError) {
      finalPersistenceError = persistError
      recordPersistenceError ??= persistError
    }
    try {
      await writeEvidence(record.directories.evidence, prepared.config.paths.outputFilenames.failureEvidence, {
        runId: record.runId, code, message, recordedAt: record.updatedAt,
        ports: record.ports, process: record.process, portsReleased,
      })
      failureEvidenceWritten = true
    } catch (evidenceError) {
      failureEvidenceError = evidenceError
    }
    const finalError = error instanceof Error ? error : new Error(String(error))
    finalError.run = { record, recordPath: prepared.recordPath }
    if (recordPersistenceError !== null || finalPersistenceError !== null) {
      const persistenceError = finalPersistenceError ?? recordPersistenceError
      finalError.persistenceFailure = {
        runRecordPath: prepared.recordPath,
        code: persistenceError?.code ?? 'RECORD_PERSISTENCE_FAILED',
        message: persistenceError instanceof Error ? persistenceError.message : String(persistenceError),
        finalRecordWritten: finalPersistenceError === null,
        failureEvidenceWritten,
        cleanupFailureEvidenceWritten,
        stopResultEvidenceWritten,
        portsReleased,
      }
      finalError.message = `${message}; run record persistence failed at ${prepared.recordPath}: ${finalError.persistenceFailure.message}; failure evidence written: ${String(failureEvidenceWritten)}`
    }
    if (cleanupError !== null) finalError.cleanupError = cleanupError
    if (failureEvidenceError !== null) finalError.failureEvidenceError = failureEvidenceError
    throw finalError
  }
}

export async function stopProbe({ runId, repositoryRoot = process.cwd(), config: configOverride,
  inspect = inspectProcessGroup, portOwners = inspectPortOwners, signalProcessGroup = signalGroup,
  processIsAlive = isOperatingSystemProcessAlive, now = Date.now, sleep = delay } = {}) {
  if (!UUID_PATTERN.test(runId ?? '')) throw new TypeError('runId must be a UUID')
  const config = configOverride === undefined
    ? await loadDesktopE2EConfig()
    : parseDesktopE2EConfig(configOverride)
  const repository = await realpath(repositoryRoot)
  const runDirectory = resolve(repository, config.paths.runRootRelativePath, runId)
  await assertNoSymlinkAncestors(repository, runDirectory)
  const runPath = join(runDirectory, config.paths.runRecordFilename)
  await assertRunRecordFile(runPath)
  const record = await readRunRecord(runPath, config)
  await assertProbeRunIdentity({ repositoryRoot: repository, runId, config, record, recordPath: runPath })
  if (await preserveCompletedTerminalFailure(record, { inspect, portOwners, processIsAlive })) {
    await releasePortReservations(runId)
    return { record, recordPath: runPath }
  }
  await releasePortReservations(runId)
  const stopped = await stopRecord(record, config, runPath, { inspect, portOwners, signalProcessGroup, now, sleep })
  return { record: stopped, recordPath: runPath }
}

export async function getProbeStatus({ runId, repositoryRoot = process.cwd(), config: configOverride,
  inspect = inspectProcessGroup, portOwners = inspectPortOwners } = {}) {
  if (!UUID_PATTERN.test(runId ?? '')) throw new TypeError('runId must be a UUID')
  const config = configOverride === undefined
    ? await loadDesktopE2EConfig()
    : parseDesktopE2EConfig(configOverride)
  const repository = await realpath(repositoryRoot)
  const runDirectory = resolve(repository, config.paths.runRootRelativePath, runId)
  await assertNoSymlinkAncestors(repository, runDirectory)
  const runPath = join(runDirectory, config.paths.runRecordFilename)
  await assertRunRecordFile(runPath)
  const record = await readRunRecord(runPath, config)
  await assertProbeRunIdentity({ repositoryRoot: repository, runId, config, record, recordPath: runPath })
  const group = record.process === null ? null : await inspect(record.process.pid)
  const owners = await portOwners(Object.values(record.ports))
  const developmentEnvironment = record.mode === 'development'
    ? await inspectDevelopmentEnvironment({ repositoryRoot: repository, config })
    : null
  return {
    record,
    recordPath: runPath,
    developmentEnvironment,
    processGroupMatchesRun: processGroupMatchesRun(group, record),
    processGroup: group,
    ports: owners,
  }
}

export async function assertProbeRunIdentity({ repositoryRoot, runId, config: configValue, record: recordValue, recordPath } = {}) {
  if (!UUID_PATTERN.test(runId ?? '')) throw new TypeError('verified Desktop run identity requires a UUID runId')
  if (typeof repositoryRoot !== 'string' || repositoryRoot.trim() === '') {
    throw new TypeError('verified Desktop run identity requires a repositoryRoot')
  }
  const config = parseDesktopE2EConfig(configValue)
  const repository = await realpath(repositoryRoot)
  const record = parseDesktopE2ERunRecord(recordValue, config)
  if (record.runId !== runId) {
    throw probeError('RUN_IDENTITY_MISMATCH', 'run record does not match the requested runId')
  }

  const expectedRunDirectory = resolve(repository, config.paths.runRootRelativePath, runId)
  const expectedRecordPath = join(expectedRunDirectory, config.paths.runRecordFilename)
  if (typeof recordPath !== 'string' || resolve(recordPath) !== expectedRecordPath) {
    throw probeError('RUN_IDENTITY_MISMATCH', 'run recordPath does not belong to the requested run repository path')
  }
  if (record.directories.run !== expectedRunDirectory) {
    throw probeError('RUN_IDENTITY_MISMATCH', 'run record directories.run does not belong to the requested run path')
  }

  const expectedApplication = {
    bundlePath: config.application.bundlePath,
    executablePath: join(config.application.bundlePath, config.application.executableRelativePath),
    version: config.application.version,
    bundleId: config.application.bundleId,
  }
  for (const key of Object.keys(expectedApplication)) {
    if (record.application[key] !== expectedApplication[key]) {
      throw probeError('RUN_IDENTITY_MISMATCH', `run record application identity ${key} does not match the configured Desktop application`)
    }
  }

  const modeConfig = config.modes[record.mode]
  const names = config.paths.directoryNames
  const expectedDirectories = {
    run: expectedRunDirectory,
    logs: join(expectedRunDirectory, names.logs),
    evidence: join(expectedRunDirectory, names.evidence),
    diagnosticFile: join(expectedRunDirectory, names.logs, config.paths.diagnosticFilename),
  }
  let expectedEnvironment
  if (modeConfig.persistent === true) {
    const environmentRoot = resolve(repository, modeConfig.environmentRootRelativePath)
    expectedEnvironment = {
      root: environmentRoot,
      leasePath: join(environmentRoot, modeConfig.leaseFilename),
    }
    for (const key of ['dshHome', 'electronUserData', 'workspace']) {
      expectedDirectories[key] = join(environmentRoot, modeConfig.directoryNames[key])
    }
  } else {
    expectedEnvironment = { root: null, leasePath: null }
    for (const key of ['dshHome', 'electronUserData', 'workspace']) {
      expectedDirectories[key] = join(expectedRunDirectory, names[key])
    }
  }
  expectedDirectories.profile = join(expectedDirectories.dshHome, config.paths.profileRelativePath)

  for (const [key, expectedPath] of Object.entries(expectedDirectories)) {
    if (record.directories[key] !== expectedPath) {
      throw probeError('RUN_IDENTITY_MISMATCH', `run record directory ${key} does not match the configured run layout`)
    }
  }
  for (const key of Object.keys(expectedEnvironment)) {
    if (record.environment[key] !== expectedEnvironment[key]) {
      throw probeError('RUN_IDENTITY_MISMATCH', `run record environment ${key} does not match the configured run layout`)
    }
  }

  const protectedDirectories = new Set([
    expectedRunDirectory,
    ...Object.values(expectedDirectories).filter(path => path !== expectedDirectories.diagnosticFile),
  ])
  if (modeConfig.persistent === true) protectedDirectories.add(expectedEnvironment.root)
  for (const directory of protectedDirectories) {
    await assertNoSymlinkAncestors(repository, directory)
  }
  return record
}

function createPortPatch(entryId, hostField, portField, host, port) {
  return [{ id: entryId, config: { [hostField]: host, [portField]: port } }]
}

async function preserveCompletedTerminalFailure(record, { inspect, portOwners, processIsAlive }) {
  if (!['failed', 'cancelled'].includes(record.state) || record.result?.portsReleased !== true) return false

  if (record.process !== null) {
    for (const processGroupId of new Set([record.process.processGroupId, record.process.pid])) {
      const group = await inspect(processGroupId)
      if (group !== null) {
        throw probeError('PROCESS_IDENTITY_MISMATCH',
          `terminal run ${record.runId} reports released resources but process group ${processGroupId} still exists`)
      }
    }
    if (await processIsAlive(record.process.pid)) {
      throw probeError('PROCESS_IDENTITY_MISMATCH',
        `terminal run ${record.runId} reports released resources but recorded process PID ${record.process.pid} is still alive`)
    }
  }

  const owners = await portOwners(Object.values(record.ports))
  const occupied = owners.filter(owner => owner.pids.length > 0)
  if (occupied.length > 0) {
    throw probeError('PROCESS_IDENTITY_MISMATCH',
      `terminal run ${record.runId} reports released resources but assigned ports still have owners: ${formatPortOwners(occupied)}`)
  }

  if (record.environment.leasePath !== null) {
    await releaseDevelopmentEnvironmentLease({ leasePath: record.environment.leasePath, runId: record.runId })
  }
  return true
}

async function stopRecord(record, config, recordPath, {
  inspect = inspectProcessGroup, portOwners = inspectPortOwners, signalProcessGroup = signalGroup,
  now = Date.now, sleep = delay, persistRunRecord = true,
} = {}) {
  if (record.process === null) {
    return finalizeStop(record, recordPath, portOwners, now, config, 'no process was recorded', persistRunRecord)
  }
  await assertDevelopmentEnvironmentLeaseOwner(record)
  let group = await inspect(record.process.pid)
  if (group === null) return finalizeStop(record, recordPath, portOwners, now, config, null, persistRunRecord)
  if (!processGroupMatchesRun(group, record)) {
    const error = probeError('PROCESS_IDENTITY_MISMATCH', 'refusing to signal a process group whose PID, command, user-data argument, or group id does not match this run')
    await failCleanup(record, recordPath, error, now, config, persistRunRecord)
    throw error
  }
  const groupPids = new Set(group.members.map(member => member.pid))
  const currentOwners = await portOwners(Object.values(record.ports))
  const foreignOwners = currentOwners.filter(owner => owner.pids.some(pid => !groupPids.has(pid)))
  if (foreignOwners.length > 0) {
    const error = probeError('PROCESS_IDENTITY_MISMATCH', `refusing to signal a process group while a run port belongs to another process: ${formatPortOwners(foreignOwners)}`)
    await failCleanup(record, recordPath, error, now, config, persistRunRecord)
    throw error
  }

  record = { ...record, state: 'stopping', updatedAt: new Date(now()).toISOString() }
  if (persistRunRecord) await saveRunRecord(record, recordPath, config)
  await writeEvidence(record.directories.evidence, config.paths.outputFilenames.stopRequestEvidence, {
    runId: record.runId, pid: record.process.pid, processGroupId: record.process.processGroupId,
    command: group.members.find(member => member.pid === record.process.pid)?.command,
    listeningPorts: group.members.flatMap(member => member.listeningPorts),
    recordedAt: record.updatedAt,
  })
  await assertDevelopmentEnvironmentLeaseOwner(record)
  await signalProcessGroup(record.process.processGroupId, 'SIGTERM')
  let stopped = await waitForGroupExit(record.process.processGroupId, config.startup.stopTimeoutMs,
    { inspect, now, sleep, pollIntervalMs: config.startup.pollIntervalMs })
  if (!stopped) {
    group = await inspect(record.process.processGroupId)
    if (group === null) stopped = true
    else if (!processGroupMatchesRun(group, record)) {
      const error = probeError('PROCESS_IDENTITY_CHANGED', 'process group identity changed before forced stop; no further signal was sent')
      await failCleanup(record, recordPath, error, now, config, persistRunRecord)
      throw error
    } else {
      const remainingPids = new Set(group.members.map(member => member.pid))
      const remainingOwners = await portOwners(Object.values(record.ports))
      const foreignOwners = remainingOwners.filter(owner => owner.pids.some(pid => !remainingPids.has(pid)))
      if (foreignOwners.length > 0) {
        const error = probeError('PROCESS_IDENTITY_MISMATCH', `refusing forced stop while a run port belongs to another process: ${formatPortOwners(foreignOwners)}`)
        await failCleanup(record, recordPath, error, now, config, persistRunRecord)
        throw error
      }
      try {
        await assertDevelopmentEnvironmentLeaseOwner(record)
      } catch (error) {
        await failCleanup(record, recordPath, error, now, config, persistRunRecord)
        throw error
      }
      await signalProcessGroup(record.process.processGroupId, 'SIGKILL')
      stopped = await waitForGroupExit(record.process.processGroupId, config.startup.killTimeoutMs,
        { inspect, now, sleep, pollIntervalMs: config.startup.pollIntervalMs })
    }
  }
  if (!stopped) {
    const error = probeError('CLEANUP_TIMEOUT', `run process group ${record.process.processGroupId} remained after SIGKILL`)
    await failCleanup(record, recordPath, error, now, config, persistRunRecord)
    throw error
  }
  return finalizeStop(record, recordPath, portOwners, now, config, null, persistRunRecord)
}

async function assertDevelopmentEnvironmentLeaseOwner(record) {
  const leasePath = record.environment.leasePath
  if (leasePath === null) return
  let leaseStat
  try {
    leaseStat = await lstat(leasePath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw probeError('DEVELOPMENT_ENVIRONMENT_LEASE_MISSING',
        `development environment lease for run ${record.runId} is missing`)
    }
    throw error
  }
  if (!leaseStat.isFile() || leaseStat.isSymbolicLink()) {
    throw probeError('DEVELOPMENT_ENVIRONMENT_LEASE_INVALID',
      `development environment lease for run ${record.runId} is not a regular file`)
  }
  const lease = parseDevelopmentEnvironmentLeaseRecord(JSON.parse(await readFile(leasePath, 'utf8')))
  if (lease.runId !== record.runId) {
    throw probeError('DEVELOPMENT_ENVIRONMENT_LEASE_MISMATCH',
      `development environment lease belongs to run ${lease.runId}, not ${record.runId}`)
  }
}

function isOperatingSystemProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error?.code === 'ESRCH') return false
    if (error?.code === 'EPERM') return true
    throw error
  }
}

async function finalizeStop(record, recordPath, portOwners, now, config, existingError, persistRunRecord = true) {
  const owners = await portOwners(Object.values(record.ports))
  const portsReleased = owners.every(owner => owner.pids.length === 0)
  let error = existingError ?? (portsReleased ? null : `ports remain owned after stop: ${formatPortOwners(owners.filter(owner => owner.pids.length > 0))}`)
  if (error === null && record.environment.leasePath !== null && record.state !== 'stopped') {
    try {
      const released = await releaseDevelopmentEnvironmentLease({
        leasePath: record.environment.leasePath,
        runId: record.runId,
      })
      if (!released) error = 'persistent development environment lease is missing'
    } catch (releaseError) {
      error = `could not release persistent development environment lease: ${releaseError.message}`
    }
  }
  const state = error === null ? 'stopped' : 'failed'
  const next = {
    ...record,
    state,
    updatedAt: new Date(now()).toISOString(),
    result: {
      exitCode: null,
      error,
      completedAt: new Date(now()).toISOString(),
      portsReleased,
    },
  }
  if (persistRunRecord) await saveRunRecord(next, recordPath, config)
  await writeEvidence(next.directories.evidence, config.paths.outputFilenames.stopResultEvidence, {
    runId: next.runId, state, error, portsReleased, portOwners: owners,
    recordedAt: next.updatedAt,
  })
  if (error !== null) throw probeError('CLEANUP_FAILED', error)
  return next
}

async function failCleanup(record, recordPath, error, now, config, persistRunRecord = true) {
  const next = {
    ...record,
    state: 'failed',
    updatedAt: new Date(now()).toISOString(),
    result: {
      exitCode: null,
      error: `${error.code ?? 'CLEANUP_FAILED'}: ${error.message}`,
      completedAt: new Date(now()).toISOString(),
      portsReleased: false,
    },
  }
  if (persistRunRecord) await saveRunRecord(next, recordPath, config)
  await writeEvidence(next.directories.evidence, config.paths.outputFilenames.cleanupFailureEvidence, {
    code: error.code ?? 'CLEANUP_FAILED', message: error.message,
    recordedAt: next.updatedAt,
  })
}

async function waitForGroupExit(processGroupId, timeoutMs, { inspect, now, sleep, pollIntervalMs }) {
  const deadline = now() + timeoutMs
  while (now() < deadline) {
    const group = await inspect(processGroupId)
    if (group === null) return true
    await sleep(Math.min(pollIntervalMs, deadline - now()))
  }
  return (await inspect(processGroupId)) === null
}

function observeChildExit(child, onError, onExitResult = () => undefined) {
  return new Promise(resolveExit => {
    let settled = false
    const finish = result => {
      if (settled) return
      settled = true
      child.removeListener('exit', onExit)
      child.removeListener('error', onSpawnError)
      onExitResult(result)
      resolveExit(result)
    }
    const onExit = (code, signal) => finish({ code, signal })
    const onSpawnError = error => {
      onError(error)
      finish({ code: null, signal: null, error })
    }
    child.once('exit', onExit)
    child.once('error', onSpawnError)
    if (child.exitCode !== null || child.signalCode !== null) {
      finish({ code: child.exitCode, signal: child.signalCode })
    }
  })
}

async function readInstalledApplicationIdentity(config) {
  const plistPath = join(config.application.bundlePath, 'Contents', 'Info.plist')
  const plist = await readFile(plistPath, 'utf8')
  const bundleId = readPlistString(plist, 'CFBundleIdentifier')
  const version = readPlistString(plist, 'CFBundleShortVersionString')
  const executableName = readPlistString(plist, 'CFBundleExecutable')
  const executablePath = join(config.application.bundlePath, 'Contents', 'MacOS', executableName)
  return { bundleId, version, executablePath }
}

function readPlistString(plist, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const match = new RegExp(`<key>${escapedKey}</key>\\s*<string>([^<]*)</string>`, 'u').exec(plist)
  if (match === null) throw probeError('APPLICATION_IDENTITY_UNAVAILABLE', `Info.plist does not contain ${key}`)
  return match[1].replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
}

async function inspectPortOwners(ports, execFileImplementation = execFileAsync) {
  return Promise.all(ports.map(async port => {
    try {
      const { stdout } = await execFileImplementation('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fp'], { encoding: 'utf8' })
      return { port, pids: [...new Set(stdout.split('\n').filter(line => line.startsWith('p')).map(line => Number(line.slice(1))).filter(Number.isSafeInteger))] }
    } catch (error) {
      if (error?.code === 1) return { port, pids: [] }
      throw probeError('PROCESS_INSPECTION_FAILED', `could not inspect listener on port ${port}: ${error.message}`)
    }
  }))
}

async function inspectWorkingDirectory(pid, execFileImplementation) {
  try {
    const { stdout } = await execFileImplementation('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { encoding: 'utf8' })
    return stdout.split('\n').find(line => line.startsWith('n'))?.slice(1) ?? ''
  } catch (error) {
    if (error?.code === 1) return ''
    throw error
  }
}

async function inspectListeningPorts(pid, execFileImplementation) {
  try {
    const { stdout } = await execFileImplementation('lsof', ['-a', '-p', String(pid), '-iTCP', '-sTCP:LISTEN', '-nP', '-Fn'], { encoding: 'utf8' })
    return stdout.split('\n').filter(line => line.startsWith('n')).map(line => Number(/:(\d+)$/u.exec(line.slice(1))?.[1]))
      .filter(port => Number.isSafeInteger(port) && port > 0 && port <= 65_535)
  } catch (error) {
    if (error?.code === 1) return []
    throw error
  }
}

function parsePsRow(line) {
  const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/u.exec(line)
  if (match === null) return null
  return { pid: Number(match[1]), parentPid: Number(match[2]), processGroupId: Number(match[3]), command: match[4] }
}

function processRecord(group, record, timestamp) {
  const root = group.members.find(member => member.pid === record.process.pid)
  if (root === undefined) throw probeError('PROCESS_IDENTITY_MISMATCH', 'probe process is missing from its process group')
  return {
    pid: root.pid,
    processGroupId: root.processGroupId,
    command: root.command,
    workingDirectory: root.workingDirectory,
    listeningPorts: [...new Set(group.members.flatMap(member => member.listeningPorts))].sort((left, right) => left - right),
    observedAt: new Date(timestamp).toISOString(),
  }
}

async function inspectRendererStatus(port, readiness, host, timeoutMs = 1_500, closeTimeoutMs = 5_000, signal,
  verifyOwnership = async () => undefined) {
  const deadline = Date.now() + timeoutMs
  let ownershipCheckFailed = false
  const verifyAtBoundary = async () => {
    try {
      await verifyOwnership()
    } catch (error) {
      ownershipCheckFailed = true
      throw error
    }
  }
  try {
    throwIfAborted(signal)
    await verifyAtBoundary()
    throwIfAborted(signal)
    const endpoint = `http://${host}:${port}/json/list`
    const requestTimeoutMs = Math.min(500, remainingUntil(deadline))
    if (requestTimeoutMs < 1) return { ready: false }
    const { response, targets } = await fetchRendererTargetList(endpoint, requestTimeoutMs, signal)
    throwIfAborted(signal)
    await verifyAtBoundary()
    throwIfAborted(signal)
    if (!response.ok) return { ready: false, status: response.status }
    const target = targets.find(candidate => candidate.type === 'page'
      && matchesDesktopRendererTitle(candidate.title, readiness)
      && typeof candidate.url === 'string'
      && candidate.url.startsWith(readiness.applicationUrlPrefix)
      && typeof candidate.webSocketDebuggerUrl === 'string')
    if (target === undefined) return { ready: false, targetCount: targets.length }
    const socketUrl = validateRendererPageWebSocketTarget(target.webSocketDebuggerUrl, target, host, port)
    const remainingMs = remainingUntil(deadline)
    if (remainingMs < 1) return { ready: false }
    const document = await inspectRendererDocument(socketUrl, { deadline, closeTimeoutMs, signal, verifyOwnership: verifyAtBoundary })
    if (remainingUntil(deadline) < 1) return { ready: false }
    return {
      ready: document.readyState === readiness.documentReadyState
        && (!readiness.requireVisibleBodyText || document.bodyTextLength > 0),
      title: target.title,
      url: target.url,
      readyState: document.readyState,
      bodyTextLength: document.bodyTextLength,
    }
  } catch (error) {
    if (ownershipCheckFailed) throw error
    if (signal?.aborted) throw abortError(signal.reason)
    if (error?.name === 'AbortError' || error?.cause?.name === 'AbortError') return { ready: false }
    return { ready: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function fetchRendererTargetList(endpoint, timeoutMs, signal) {
  throwIfAborted(signal)
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  signal?.addEventListener('abort', onAbort, { once: true })
  if (signal?.aborted) onAbort()
  try {
    const response = await fetch(endpoint, { signal: controller.signal, redirect: 'error' })
    assertRendererCdpResponse(response, endpoint)
    const targets = response.ok ? await response.json() : undefined
    return { response, targets }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

async function inspectRendererDocument(webSocketUrl, { deadline, closeTimeoutMs, signal, verifyOwnership }) {
  const socket = new WebSocket(webSocketUrl)
  let operationError
  try {
    await waitForRendererWebSocketOpen(socket, remainingUntil(deadline), signal)
    throwIfAborted(signal)
    await verifyOwnership()
    throwIfAborted(signal)
    return await evaluateRendererDocument(socket, remainingUntil(deadline), signal)
  } catch (error) {
    operationError = error
    throw error
  } finally {
    try {
      await closeRendererWebSocket(socket, closeTimeoutMs)
    } catch (cleanupError) {
      if (operationError !== undefined) {
        throw new AggregateError([operationError, cleanupError], 'Renderer document probe failed and WebSocket cleanup did not finish')
      }
      throw cleanupError
    }
  }
}

function waitForRendererWebSocketOpen(socket, timeoutMs, signal) {
  throwIfAborted(signal)
  if (socket.readyState === 1) return Promise.resolve()
  return new Promise((resolveOpen, rejectOpen) => {
    let settled = false
    let timer
    const finish = error => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.removeEventListener('open', onOpen)
      socket.removeEventListener('error', onError)
      socket.removeEventListener('close', onClose)
      signal?.removeEventListener('abort', onAbort)
      if (error === undefined) resolveOpen()
      else rejectOpen(error)
    }
    const onOpen = () => finish()
    const onError = () => finish(new Error('Renderer CDP WebSocket failed before opening'))
    const onClose = () => finish(new Error('Renderer CDP WebSocket closed before opening'))
    const onAbort = () => finish(abortError(signal.reason))
    timer = setTimeout(() => finish(new Error('Renderer CDP WebSocket open timed out')), Math.max(1, timeoutMs))
    socket.addEventListener('open', onOpen)
    socket.addEventListener('error', onError)
    socket.addEventListener('close', onClose)
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
  })
}

function evaluateRendererDocument(socket, timeoutMs, signal) {
  throwIfAborted(signal)
  return new Promise((resolveDocument, rejectDocument) => {
    let settled = false
    let timer
    const cleanup = () => {
      clearTimeout(timer)
      socket.removeEventListener('message', onMessage)
      socket.removeEventListener('error', onError)
      socket.removeEventListener('close', onClose)
      signal?.removeEventListener('abort', onAbort)
    }
    const finish = (error, value) => {
      if (settled) return
      settled = true
      cleanup()
      if (error === undefined) resolveDocument(value)
      else rejectDocument(error)
    }
    const onError = () => finish(new Error('Renderer CDP WebSocket reported an error during document inspection'))
    const onClose = () => finish(new Error('Renderer CDP WebSocket closed during document inspection'))
    const onAbort = () => finish(abortError(signal.reason))
    const onMessage = event => {
      let message
      try { message = JSON.parse(String(event.data)) } catch { return }
      if (message.id !== 1) return
      if (message.error !== undefined) {
        finish(new Error(`Renderer CDP Runtime.evaluate failed: ${message.error.message}`))
        return
      }
      finish(undefined, message.result?.result?.value)
    }
    timer = setTimeout(() => finish(new Error('Renderer document readiness timed out')), Math.max(1, timeoutMs))
    socket.addEventListener('message', onMessage)
    socket.addEventListener('error', onError)
    socket.addEventListener('close', onClose)
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) {
      onAbort()
      return
    }
    try {
      socket.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: '({ readyState: document.readyState, bodyTextLength: (document.body?.innerText ?? "").trim().length })',
          returnByValue: true,
        },
      }))
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

function closeRendererWebSocket(socket, timeoutMs) {
  if (socket.readyState === 3) return Promise.resolve()
  return new Promise((resolveClose, rejectClose) => {
    let settled = false
    let timer
    const finish = error => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.removeEventListener('close', onClose)
      if (error === undefined) resolveClose()
      else rejectClose(error)
    }
    const onClose = () => finish()
    timer = setTimeout(() => finish(new Error('Renderer CDP WebSocket close timed out')), Math.max(1, timeoutMs))
    socket.addEventListener('close', onClose)
    try {
      socket.close()
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)))
    }
    if (socket.readyState === 3) finish()
  })
}

function remainingUntil(deadline) {
  return Math.max(0, deadline - Date.now())
}

async function signalGroup(processGroupId, signal) {
  try { process.kill(-processGroupId, signal) } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
}

async function saveRunRecord(record, recordPath, config) {
  const parsed = parseDesktopE2ERunRecord(record, config)
  const temporaryPath = `${recordPath}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    const { rename } = await import('node:fs/promises')
    await rename(temporaryPath, recordPath)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
}

async function readRunRecord(recordPath, config) {
  return parseDesktopE2ERunRecord(JSON.parse(await readFile(recordPath, 'utf8')), config)
}

async function assertRunRecordFile(recordPath) {
  const info = await lstat(recordPath)
  if (info.isSymbolicLink() || !info.isFile()) {
    throw probeError('RUN_IDENTITY_MISMATCH', 'run.json must be a regular file in the requested run directory')
  }
}

async function writeEvidence(directory, filename, data) {
  await writeFile(join(directory, filename), `${JSON.stringify(data, null, 2)}\n`, {
    encoding: 'utf8', flag: 'w', mode: 0o600,
  })
}

function formatPortOwners(owners) {
  return owners.map(owner => `${owner.port}:[${owner.pids.join(',')}]`).join(', ')
}

function probeError(code, message) {
  const error = new Error(`${code}: ${message}`)
  error.code = code
  return error
}

function safeErrorCode(error) {
  const code = error?.code
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/u.test(code) ? code : 'PROBE_PREPARATION_FAILED'
}

function safeErrorType(error) {
  const type = error?.diagnosticType ?? error?.name
  return ['AbortError', 'Error', 'RangeError', 'TypeError'].includes(type) ? type : 'Error'
}

function delay(milliseconds, signal) {
  return new Promise((resolveDelay, rejectDelay) => {
    if (signal?.aborted) {
      rejectDelay(abortError(signal.reason))
      return
    }
    const timer = setTimeout(done, Math.max(0, milliseconds))
    function done() {
      signal?.removeEventListener('abort', onAbort)
      resolveDelay()
    }
    function onAbort() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      rejectDelay(abortError(signal.reason))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function abortError(reason) {
  const error = new Error('official Desktop probe was cancelled', { cause: reason })
  error.name = 'AbortError'
  error.code = 'ABORT_ERR'
  return error
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    const error = new Error('official Desktop probe preparation was cancelled', { cause: signal.reason })
    error.name = 'AbortError'
    error.code = 'ABORT_ERR'
    throw error
  }
}

async function assertNoSymlinkAncestors(root, target) {
  const relativeTarget = relative(root, target)
  if (relativeTarget === '..' || relativeTarget.startsWith(`..${sep}`) || isAbsolute(relativeTarget)) {
    throw new TypeError('desktop E2E path must remain inside the repository')
  }
  let current = root
  for (const part of relativeTarget.split(sep).filter(Boolean)) {
    current = join(current, part)
    try {
      const { lstat } = await import('node:fs/promises')
      const info = await lstat(current)
      if (info.isSymbolicLink()) throw new Error(`desktop E2E path contains a symbolic link: ${current}`)
      if (!info.isDirectory()) throw new Error(`desktop E2E path component is not a directory: ${current}`)
    } catch (error) {
      if (error?.code === 'ENOENT') return
      throw error
    }
  }
}

function closeServer(server) {
  return new Promise((resolveClose, rejectClose) => {
    if (!server.listening) return resolveClose()
    server.close(error => error ? rejectClose(error) : resolveClose())
  })
}

export { parseDesktopE2EConfig }

export function createStartCommandResult({ started, repositoryRoot } = {}) {
  const record = started?.record
  if (record === null || typeof record !== 'object' || Array.isArray(record)
    || !UUID_PATTERN.test(record.runId ?? '') || typeof repositoryRoot !== 'string' || !isAbsolute(repositoryRoot)) {
    throw new TypeError('Desktop start command result requires a started run and absolute repositoryRoot')
  }
  return {
    ok: true,
    runId: record.runId,
    mode: record.mode,
    environment: record.environment,
    initializationStatus: started.developmentEnvironment?.initializationStatus ?? null,
    recordPath: started.recordPath,
    evidenceDirectory: record.directories.evidence,
    process: record.process,
    ports: record.ports,
    renderer: started.renderer,
    hostInspectorListening: record.process.listeningPorts.includes(record.ports.hostInspector),
    capabilities: started.config.capabilities,
    stopCommand: {
      executable: process.execPath,
      arguments: [
        fileURLToPath(import.meta.url),
        'stop', '--run-id', record.runId, '--repository-root', repositoryRoot,
      ],
    },
  }
}

async function main(argv) {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      'repository-root': { type: 'string' },
      'run-id': { type: 'string' },
      mode: { type: 'string' },
    },
    strict: true,
  })
  const command = positionals[0]
  const repositoryRoot = values['repository-root'] ?? process.cwd()
  if (command === 'start' && positionals.length === 1 && values['run-id'] === undefined) {
    const controller = new AbortController()
    const abort = signal => controller.abort(new Error(`received ${signal}`))
    const onInterrupt = () => abort('SIGINT')
    const onTerminate = () => abort('SIGTERM')
    process.once('SIGINT', onInterrupt)
    process.once('SIGTERM', onTerminate)
    try {
      const config = await loadDesktopE2EConfig()
      const mode = values.mode ?? config.modes.defaultMode
      const profilePatchAdapter = mode === 'development' ? await loadOfficialProfilePatchAdapter(config) : undefined
      const started = await startProbe({ repositoryRoot, mode, config, profilePatchAdapter, signal: controller.signal })
      process.stdout.write(`${JSON.stringify(createStartCommandResult({ started, repositoryRoot }), null, 2)}\n`)
      return
    } finally {
      process.removeListener('SIGINT', onInterrupt)
      process.removeListener('SIGTERM', onTerminate)
    }
  }
  if (command === 'status' && positionals.length === 1 && values['run-id'] !== undefined) {
    const status = await getProbeStatus({ repositoryRoot, runId: values['run-id'] })
    process.stdout.write(`${JSON.stringify(status, null, 2)}\n`)
    if (!status.processGroupMatchesRun && status.record.state === 'running') process.exitCode = 1
    return
  }
  if (command === 'stop' && positionals.length === 1 && values['run-id'] !== undefined) {
    const stopped = await stopProbe({ repositoryRoot, runId: values['run-id'] })
    process.stdout.write(`${JSON.stringify({ ok: true, ...stopped }, null, 2)}\n`)
    return
  }
  throw new TypeError('usage: node tests/desktop/fixtures/official-desktop-probe.mjs start [--mode fresh|development] | status --run-id <uuid> | stop --run-id <uuid> [--repository-root <path>]')
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    const run = error?.run
    process.stderr.write(`${JSON.stringify({
      ok: false,
      code: error?.code ?? 'PROBE_FAILED',
      message: error instanceof Error ? error.message : String(error),
      runId: run?.record?.runId,
      recordPath: run?.recordPath,
      evidenceDirectory: run?.record?.directories?.evidence,
      failureEvidencePath: error?.preparationFailure?.evidencePath,
      failureEvidenceWritten: error?.preparationFailure?.evidenceWritten,
    }, null, 2)}\n`)
    process.exitCode = 1
  })
}

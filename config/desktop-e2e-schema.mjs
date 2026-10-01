import { isAbsolute, join, relative, resolve, sep } from 'node:path'

const CONFIG_KEYS = [
  'schemaVersion', 'modes', 'application', 'paths', 'ports', 'startup', 'rendererCdp', 'readiness', 'invocation', 'profilePortPatch', 'capabilities',
  'commandRunner',
]
const MODES_KEYS = ['defaultMode', 'fresh', 'development']
const EPHEMERAL_MODE_KEYS = ['persistent']
const DEVELOPMENT_MODE_KEYS = [
  'persistent', 'environmentRootRelativePath', 'environmentFilePath', 'credentialEnvironmentNames',
  'requiredEnvironmentNames', 'initialProfilePatches', 'directoryNames', 'leaseFilename',
]
const INITIAL_PROFILE_PATCH_KEYS = ['id', 'config']
const APPLICATION_KEYS = ['bundlePath', 'executableRelativePath', 'bundleId', 'version']
const PATHS_KEYS = [
  'runRootRelativePath', 'directoryNames', 'profileRelativePath', 'profilePatchFilename',
  'runRecordFilename', 'diagnosticFilename', 'outputFilenames',
]
const OUTPUT_FILENAME_KEYS = [
  'stdoutLog', 'stderrLog', 'startupReadyEvidence', 'preparationFailureEvidence', 'failureEvidence',
  'cleanupFailureEvidence', 'stopRequestEvidence', 'stopResultEvidence',
]
const DIRECTORY_NAME_KEYS = ['dshHome', 'electronUserData', 'workspace', 'logs', 'evidence']
const DEVELOPMENT_DIRECTORY_NAME_KEYS = ['dshHome', 'electronUserData', 'workspace']
const PORTS_KEYS = ['allocation', 'host', 'roles', 'requiredForReady']
const STARTUP_KEYS = [
  'startupTimeoutMs', 'portReadyTimeoutMs', 'singleInstanceExitWindowMs', 'stopTimeoutMs',
  'killTimeoutMs', 'pollIntervalMs',
]
const RENDERER_CDP_KEYS = ['maxPayloadSize']
const READINESS_KEYS = ['rendererTargetTitle', 'rendererSessionTitleSeparator', 'applicationUrlPrefix', 'documentReadyState', 'requireVisibleBodyText']
const INVOCATION_KEYS = ['environmentNames', 'unsetEnvironmentNames', 'arguments']
const ENVIRONMENT_NAME_KEYS = ['dshHome', 'electronUserData', 'diagnosticFile', 'hostInspectorPort']
const PROFILE_PORT_PATCH_KEYS = ['entryId', 'hostField', 'portField']
const CAPABILITIES_KEYS = [
  'defaultApplicationLogsIsolated', 'applicationHostHealthVerified', 'pluginIdentityVerified',
]
const COMMAND_RUNNER_KEYS = [
  'invocationDirectoryEnvironmentName', 'invocationsRelativePath', 'descriptorDirectoryName', 'invocationFilename',
  'cancellationFilename', 'resultFilename', 'pendingStartDrainTimeoutMs', 'commandStopTimeoutMs', 'commandKillTimeoutMs',
]
const COMMAND_INVOCATION_CONTEXT_KEYS = [
  'schemaVersion', 'invocationId', 'repositoryRoot', 'runnerPid', 'runnerCwd', 'createdAt',
]
const COMMAND_RUN_DESCRIPTOR_KEYS = [
  'schemaVersion', 'invocationId', 'runId', 'repositoryRoot', 'config', 'state', 'outcome', 'paths',
  'startError', 'registeredAt', 'settledAt',
]
const COMMAND_RUN_PATHS_KEYS = [
  'record', 'preparationFailure', 'failure', 'cleanupFailure', 'stopRequest', 'stopResult',
]
const COMMAND_RUN_ERROR_KEYS = ['name', 'code']
const COMMAND_CANCELLATION_REQUEST_KEYS = ['schemaVersion', 'invocationId', 'signal', 'requestedAt']
const COMMAND_CANCELLATION_RESULT_KEYS = [
  'schemaVersion', 'invocationId', 'runnerPid', 'runnerCwd', 'signal', 'phase', 'commandChild',
  'requestedAt', 'completedAt', 'exitCode', 'cleanupSucceeded', 'cleanupFailures', 'runs',
]
const COMMAND_CHILD_KEYS = ['pid', 'processGroupId', 'command', 'workingDirectory']
const COMMAND_RUN_RESULT_KEYS = [
  'runId', 'repositoryRoot', 'paths', 'state', 'processGroupAbsent', 'portsReleased',
  'environmentLeaseReleased', 'evidencePaths', 'cleanupError',
]
const COMMAND_SIGNALS = ['SIGINT', 'SIGTERM']
const COMMAND_PHASES = ['build', 'pack', 'tests']
const COMMAND_RUN_STATES = ['cancelled-before-start', 'preparation-failed', 'stopped', 'cleanup-failed']
const RUN_RECORD_KEYS = [
  'schemaVersion', 'runId', 'mode', 'state', 'createdAt', 'updatedAt', 'application', 'directories', 'environment',
  'ports', 'launch', 'process', 'result',
]
const RUN_APPLICATION_KEYS = ['bundlePath', 'executablePath', 'version', 'bundleId']
const DIRECTORY_KEYS = [
  'run', 'dshHome', 'electronUserData', 'workspace', 'logs', 'evidence', 'profile', 'diagnosticFile',
]
const RUN_ENVIRONMENT_KEYS = ['root', 'leasePath']
const LAUNCH_KEYS = ['arguments', 'environment', 'unsetEnvironmentNames']
const PROCESS_KEYS = ['pid', 'processGroupId', 'command', 'workingDirectory', 'listeningPorts', 'observedAt']
const RESULT_KEYS = ['exitCode', 'error', 'completedAt', 'portsReleased']
const PREPARATION_FAILURE_KEYS = [
  'schemaVersion', 'runId', 'mode', 'phase', 'code', 'errorType', 'recordedAt', 'cleanup',
]
const PREPARATION_FAILURE_CLEANUP_KEYS = ['portsReleased', 'environmentLease']
const SAFE_ERROR_TYPES = ['AbortError', 'Error', 'RangeError', 'TypeError']
const LEASE_CLEANUP_STATES = ['not-acquired', 'released', 'retained']
const PORT_STATES = ['prepared', 'starting', 'running', 'stopping', 'stopped', 'failed', 'cancelled']
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u

function record(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`)
  }
  return value
}

function exactKeys(value, keys, label) {
  record(value, label)
  const expected = new Set(keys)
  const actual = Object.keys(value)
  const missing = keys.filter(key => !Object.hasOwn(value, key))
  const unexpected = actual.filter(key => !expected.has(key))
  if (missing.length > 0 || unexpected.length > 0) {
    throw new TypeError(`${label} must contain exactly ${keys.join(', ')}${
      missing.length ? `; missing ${missing.join(', ')}` : ''
    }${unexpected.length ? `; unexpected ${unexpected.join(', ')}` : ''}`)
  }
  return value
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} must be a non-empty string`)
  return value
}

function safeRelativePath(value, label) {
  nonEmptyString(value, label)
  if (value.startsWith('/') || value.includes('\\') || value.split('/').some(part => part === '..' || part === '.')) {
    throw new TypeError(`${label} must be a safe relative path`)
  }
}

function positiveInteger(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new TypeError(`${label} must be an integer from 1 through ${maximum}`)
  }
}

function isoTimestamp(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new TypeError(`${label} must be an ISO timestamp`)
  }
}

function assertJsonValue(value, label, active = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
    || typeof value === 'number' && Number.isFinite(value)) return
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) {
    throw new TypeError(`${label} must contain JSON-compatible values`)
  }
  if (active.has(value)) throw new TypeError(`${label} must not contain cycles`)
  active.add(value)
  const values = Array.isArray(value) ? value : Object.values(value)
  for (const item of values) assertJsonValue(item, label, active)
  active.delete(value)
}

function assertProfilePatchContainsNoCredentialValues(value, label) {
  if (Array.isArray(value)) {
    for (const item of value) assertProfilePatchContainsNoCredentialValues(item, label)
    return
  }
  if (value === null || typeof value !== 'object') return
  for (const [key, item] of Object.entries(value)) {
    if (/^(?:api[-_]?key|token|secret|password|authorization|credential)(?:value)?$/iu.test(key)) {
      throw new TypeError(`${label}.${key} must use an environment variable reference instead of a credential value`)
    }
    if (key === 'apiKeyEnv') {
      if (typeof item !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(item)) {
        throw new TypeError(`${label}.apiKeyEnv must name an environment variable`)
      }
      continue
    }
    assertProfilePatchContainsNoCredentialValues(item, `${label}.${key}`)
  }
}

export function parseDesktopE2EConfig(value) {
  const config = exactKeys(value, CONFIG_KEYS, 'desktop E2E config')
  if (config.schemaVersion !== 1) throw new TypeError('desktop E2E config.schemaVersion must be 1')

  const modes = exactKeys(config.modes, MODES_KEYS, 'desktop E2E config.modes')
  if (modes.defaultMode !== 'fresh') throw new TypeError('desktop E2E config.modes.defaultMode must be fresh')
  const freshMode = exactKeys(modes.fresh, EPHEMERAL_MODE_KEYS, 'desktop E2E config.modes.fresh')
  if (freshMode.persistent !== false) throw new TypeError('desktop E2E config.modes.fresh.persistent must be false')
  const developmentMode = exactKeys(modes.development, DEVELOPMENT_MODE_KEYS, 'desktop E2E config.modes.development')
  if (developmentMode.persistent !== true) throw new TypeError('desktop E2E config.modes.development.persistent must be true')
  safeRelativePath(developmentMode.environmentRootRelativePath, 'desktop E2E config.modes.development.environmentRootRelativePath')
  if (!isAbsolute(nonEmptyString(developmentMode.environmentFilePath, 'desktop E2E config.modes.development.environmentFilePath'))) {
    throw new TypeError('desktop E2E config.modes.development.environmentFilePath must be absolute')
  }
  for (const key of ['credentialEnvironmentNames', 'requiredEnvironmentNames']) {
    const names = developmentMode[key]
    if (!Array.isArray(names) || names.some(name => typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name))
      || new Set(names).size !== names.length) {
      throw new TypeError(`desktop E2E config.modes.development.${key} must contain unique environment variable names`)
    }
  }
  if (developmentMode.requiredEnvironmentNames.some(name => !developmentMode.credentialEnvironmentNames.includes(name))) {
    throw new TypeError('desktop E2E config.modes.development.requiredEnvironmentNames must be a subset of credentialEnvironmentNames')
  }
  if (!Array.isArray(developmentMode.initialProfilePatches) || developmentMode.initialProfilePatches.length === 0) {
    throw new TypeError('desktop E2E config.modes.development.initialProfilePatches must be a non-empty array')
  }
  const initialPatchIds = new Set()
  for (const [index, initialPatchValue] of developmentMode.initialProfilePatches.entries()) {
    const label = `desktop E2E config.modes.development.initialProfilePatches[${index}]`
    const initialPatch = exactKeys(initialPatchValue, INITIAL_PROFILE_PATCH_KEYS, label)
    if (!/^[a-z][a-z0-9-]*$/u.test(nonEmptyString(initialPatch.id, `${label}.id`))) {
      throw new TypeError(`${label}.id must be a plugin id`)
    }
    if (initialPatchIds.has(initialPatch.id)) {
      throw new TypeError(`desktop E2E config.modes.development.initialProfilePatches contains duplicate id ${initialPatch.id}`)
    }
    initialPatchIds.add(initialPatch.id)
    record(initialPatch.config, `${label}.config`)
    assertJsonValue(initialPatch.config, `${label}.config`)
    assertProfilePatchContainsNoCredentialValues(initialPatch.config, `${label}.config`)
  }
  const developmentDirectoryNames = exactKeys(developmentMode.directoryNames, DEVELOPMENT_DIRECTORY_NAME_KEYS, 'desktop E2E config.modes.development.directoryNames')
  for (const [key, name] of Object.entries(developmentDirectoryNames)) {
    nonEmptyString(name, `desktop E2E config.modes.development.directoryNames.${key}`)
    if (name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
      throw new TypeError(`desktop E2E config.modes.development.directoryNames.${key} must be a directory name`)
    }
  }
  if (new Set(Object.values(developmentDirectoryNames)).size !== Object.keys(developmentDirectoryNames).length) {
    throw new TypeError('desktop E2E config.modes.development.directoryNames must be unique')
  }
  nonEmptyString(developmentMode.leaseFilename, 'desktop E2E config.modes.development.leaseFilename')
  if (developmentMode.leaseFilename.includes('/') || developmentMode.leaseFilename.includes('\\')
    || developmentMode.leaseFilename === '.' || developmentMode.leaseFilename === '..') {
    throw new TypeError('desktop E2E config.modes.development.leaseFilename must be a filename')
  }

  const application = exactKeys(config.application, APPLICATION_KEYS, 'desktop E2E config.application')
  if (!isAbsolute(nonEmptyString(application.bundlePath, 'desktop E2E config.application.bundlePath'))) {
    throw new TypeError('desktop E2E config.application.bundlePath must be absolute')
  }
  safeRelativePath(application.executableRelativePath, 'desktop E2E config.application.executableRelativePath')
  if (!/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u.test(nonEmptyString(application.bundleId, 'desktop E2E config.application.bundleId'))) {
    throw new TypeError('desktop E2E config.application.bundleId must be a reverse-domain identifier')
  }
  if (!VERSION_PATTERN.test(nonEmptyString(application.version, 'desktop E2E config.application.version'))) {
    throw new TypeError('desktop E2E config.application.version must be a semantic version')
  }

  const paths = exactKeys(config.paths, PATHS_KEYS, 'desktop E2E config.paths')
  for (const key of ['runRootRelativePath', 'profileRelativePath']) safeRelativePath(paths[key], `desktop E2E config.paths.${key}`)
  for (const key of ['profilePatchFilename', 'runRecordFilename', 'diagnosticFilename']) {
    nonEmptyString(paths[key], `desktop E2E config.paths.${key}`)
    if (paths[key].includes('/') || paths[key].includes('\\') || paths[key] === '.' || paths[key] === '..') {
      throw new TypeError(`desktop E2E config.paths.${key} must be a filename`)
    }
  }
  const outputFilenames = exactKeys(paths.outputFilenames, OUTPUT_FILENAME_KEYS, 'desktop E2E config.paths.outputFilenames')
  for (const [key, filename] of Object.entries(outputFilenames)) {
    nonEmptyString(filename, `desktop E2E config.paths.outputFilenames.${key}`)
    if (filename.includes('/') || filename.includes('\\') || filename === '.' || filename === '..') {
      throw new TypeError(`desktop E2E config.paths.outputFilenames.${key} must be a filename`)
    }
  }
  const directoryNames = exactKeys(paths.directoryNames, DIRECTORY_NAME_KEYS, 'desktop E2E config.paths.directoryNames')
  for (const [key, name] of Object.entries(directoryNames)) {
    nonEmptyString(name, `desktop E2E config.paths.directoryNames.${key}`)
    if (name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
      throw new TypeError(`desktop E2E config.paths.directoryNames.${key} must be a directory name`)
    }
  }

  const ports = exactKeys(config.ports, PORTS_KEYS, 'desktop E2E config.ports')
  if (ports.allocation !== 'held-loopback-ephemeral') throw new TypeError('desktop E2E config.ports.allocation must be held-loopback-ephemeral')
  if (ports.host !== '127.0.0.1') throw new TypeError('desktop E2E config.ports.host must be 127.0.0.1')
  if (!Array.isArray(ports.roles) || ports.roles.length !== 3
    || ports.roles.some(role => typeof role !== 'string' || !/^[A-Za-z][A-Za-z0-9]*$/u.test(role))
    || new Set(ports.roles).size !== ports.roles.length) {
    throw new TypeError('desktop E2E config.ports.roles must contain three unique port role names')
  }
  if (!Array.isArray(ports.requiredForReady) || ports.requiredForReady.length < 1
    || ports.requiredForReady.some(role => !ports.roles.includes(role))
    || new Set(ports.requiredForReady).size !== ports.requiredForReady.length) {
    throw new TypeError('desktop E2E config.ports.requiredForReady must be a non-empty unique subset of roles')
  }

  const startup = exactKeys(config.startup, STARTUP_KEYS, 'desktop E2E config.startup')
  for (const [key, timeout] of Object.entries(startup)) positiveInteger(timeout, `desktop E2E config.startup.${key}`, 300_000)

  const rendererCdp = exactKeys(config.rendererCdp, RENDERER_CDP_KEYS, 'desktop E2E config.rendererCdp')
  positiveInteger(rendererCdp.maxPayloadSize, 'desktop E2E config.rendererCdp.maxPayloadSize', 67_108_864)

  const readiness = exactKeys(config.readiness, READINESS_KEYS, 'desktop E2E config.readiness')
  for (const key of ['rendererTargetTitle', 'rendererSessionTitleSeparator', 'applicationUrlPrefix', 'documentReadyState']) {
    nonEmptyString(readiness[key], `desktop E2E config.readiness.${key}`)
  }
  if (typeof readiness.requireVisibleBodyText !== 'boolean') {
    throw new TypeError('desktop E2E config.readiness.requireVisibleBodyText must be boolean')
  }

  const invocation = exactKeys(config.invocation, INVOCATION_KEYS, 'desktop E2E config.invocation')
  const environmentNames = exactKeys(invocation.environmentNames, ENVIRONMENT_NAME_KEYS, 'desktop E2E config.invocation.environmentNames')
  for (const [key, name] of Object.entries(environmentNames)) nonEmptyString(name, `desktop E2E config.invocation.environmentNames.${key}`)
  if (!Array.isArray(invocation.unsetEnvironmentNames)
    || invocation.unsetEnvironmentNames.some(name => typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name))
    || new Set(invocation.unsetEnvironmentNames).size !== invocation.unsetEnvironmentNames.length) {
    throw new TypeError('desktop E2E config.invocation.unsetEnvironmentNames must contain unique environment variable names')
  }
  if (!Array.isArray(invocation.arguments) || invocation.arguments.length < 1
    || invocation.arguments.some(argument => typeof argument !== 'string' || argument.trim() === ''
      || /\{[^}]+\}/u.test(argument) && !/^([^{}]|\{[A-Za-z][A-Za-z0-9]*\})*$/u.test(argument))) {
    throw new TypeError('desktop E2E config.invocation.arguments must contain non-empty templates with named placeholders')
  }

  const patch = exactKeys(config.profilePortPatch, PROFILE_PORT_PATCH_KEYS, 'desktop E2E config.profilePortPatch')
  nonEmptyString(patch.entryId, 'desktop E2E config.profilePortPatch.entryId')
  for (const key of ['hostField', 'portField']) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/u.test(nonEmptyString(patch[key], `desktop E2E config.profilePortPatch.${key}`))) {
      throw new TypeError(`desktop E2E config.profilePortPatch.${key} must be a field name`)
    }
  }
  if (patch.hostField === patch.portField) throw new TypeError('desktop E2E config.profilePortPatch host and port fields must be distinct')
  if (initialPatchIds.has(patch.entryId)) {
    throw new TypeError('desktop E2E config.modes.development.initialProfilePatches must not define the managed webserver row')
  }
  const capabilities = exactKeys(config.capabilities, CAPABILITIES_KEYS, 'desktop E2E config.capabilities')
  for (const [key, value] of Object.entries(capabilities)) {
    if (typeof value !== 'boolean') throw new TypeError(`desktop E2E config.capabilities.${key} must be boolean`)
  }

  const commandRunner = exactKeys(config.commandRunner, COMMAND_RUNNER_KEYS, 'desktop E2E config.commandRunner')
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(nonEmptyString(
    commandRunner.invocationDirectoryEnvironmentName,
    'desktop E2E config.commandRunner.invocationDirectoryEnvironmentName',
  ))) {
    throw new TypeError('desktop E2E config.commandRunner.invocationDirectoryEnvironmentName must be an environment variable name')
  }
  safeRelativePath(commandRunner.invocationsRelativePath, 'desktop E2E config.commandRunner.invocationsRelativePath')
  for (const key of ['descriptorDirectoryName', 'invocationFilename', 'cancellationFilename', 'resultFilename']) {
    nonEmptyString(commandRunner[key], `desktop E2E config.commandRunner.${key}`)
    if (commandRunner[key].includes('/') || commandRunner[key].includes('\\') || commandRunner[key] === '.' || commandRunner[key] === '..') {
      throw new TypeError(`desktop E2E config.commandRunner.${key} must be a path component`)
    }
  }
  for (const key of ['pendingStartDrainTimeoutMs', 'commandStopTimeoutMs', 'commandKillTimeoutMs']) {
    positiveInteger(commandRunner[key], `desktop E2E config.commandRunner.${key}`, 300_000)
  }
  if (commandRunner.pendingStartDrainTimeoutMs < startup.startupTimeoutMs + startup.stopTimeoutMs + startup.killTimeoutMs) {
    throw new TypeError('desktop E2E config.commandRunner.pendingStartDrainTimeoutMs must cover startup, stop and kill timeouts')
  }
  return config
}

export function parseDesktopE2ECommandInvocationContext(value) {
  const context = exactKeys(value, COMMAND_INVOCATION_CONTEXT_KEYS, 'desktop test command invocation context')
  if (context.schemaVersion !== 1) throw new TypeError('desktop test command invocation context.schemaVersion must be 1')
  if (typeof context.invocationId !== 'string' || !UUID_PATTERN.test(context.invocationId)) {
    throw new TypeError('desktop test command invocation context.invocationId must be a UUID')
  }
  if (!isAbsolute(nonEmptyString(context.repositoryRoot, 'desktop test command invocation context.repositoryRoot'))
    || !isAbsolute(nonEmptyString(context.runnerCwd, 'desktop test command invocation context.runnerCwd'))) {
    throw new TypeError('desktop test command invocation context repositoryRoot and runnerCwd must be absolute')
  }
  positiveInteger(context.runnerPid, 'desktop test command invocation context.runnerPid')
  isoTimestamp(context.createdAt, 'desktop test command invocation context.createdAt')
  return context
}

export function parseDesktopE2ECommandRunDescriptor(value) {
  const descriptor = exactKeys(value, COMMAND_RUN_DESCRIPTOR_KEYS, 'desktop test command run descriptor')
  if (descriptor.schemaVersion !== 1) throw new TypeError('desktop test command run descriptor.schemaVersion must be 1')
  for (const key of ['invocationId', 'runId']) {
    if (typeof descriptor[key] !== 'string' || !UUID_PATTERN.test(descriptor[key])) {
      throw new TypeError(`desktop test command run descriptor.${key} must be a UUID`)
    }
  }
  if (!isAbsolute(nonEmptyString(descriptor.repositoryRoot, 'desktop test command run descriptor.repositoryRoot'))) {
    throw new TypeError('desktop test command run descriptor.repositoryRoot must be absolute')
  }
  const config = parseDesktopE2EConfig(descriptor.config)
  if (!['pending', 'settled'].includes(descriptor.state)) {
    throw new TypeError('desktop test command run descriptor.state must be pending or settled')
  }
  const outcomes = ['started', 'cancelled', 'cancelled-before-start', 'failed']
  if (descriptor.state === 'pending') {
    if (descriptor.outcome !== null || descriptor.startError !== null || descriptor.settledAt !== null) {
      throw new TypeError('pending desktop test command run descriptors cannot contain settlement fields')
    }
  } else {
    if (!outcomes.includes(descriptor.outcome)) {
      throw new TypeError(`settled desktop test command run descriptor.outcome must be one of ${outcomes.join(', ')}`)
    }
    isoTimestamp(descriptor.settledAt, 'desktop test command run descriptor.settledAt')
    if ((descriptor.outcome === 'failed' || descriptor.outcome === 'cancelled') !== (descriptor.startError !== null)) {
      throw new TypeError('desktop test command run descriptor.startError must match its failure or cancellation outcome')
    }
  }
  isoTimestamp(descriptor.registeredAt, 'desktop test command run descriptor.registeredAt')

  const paths = exactKeys(descriptor.paths, COMMAND_RUN_PATHS_KEYS, 'desktop test command run descriptor.paths')
  const runDirectory = resolve(descriptor.repositoryRoot, config.paths.runRootRelativePath, descriptor.runId)
  const evidenceDirectory = join(runDirectory, config.paths.directoryNames.evidence)
  const expectedPaths = {
    record: join(runDirectory, config.paths.runRecordFilename),
    preparationFailure: join(evidenceDirectory, config.paths.outputFilenames.preparationFailureEvidence),
    failure: join(evidenceDirectory, config.paths.outputFilenames.failureEvidence),
    cleanupFailure: join(evidenceDirectory, config.paths.outputFilenames.cleanupFailureEvidence),
    stopRequest: join(evidenceDirectory, config.paths.outputFilenames.stopRequestEvidence),
    stopResult: join(evidenceDirectory, config.paths.outputFilenames.stopResultEvidence),
  }
  for (const [key, path] of Object.entries(paths)) {
    nonEmptyString(path, `desktop test command run descriptor.paths.${key}`)
    if (!isAbsolute(path) || resolve(path) !== expectedPaths[key]) {
      throw new TypeError(`desktop test command run descriptor.paths.${key} must identify this run's configured path`)
    }
  }
  if (descriptor.startError !== null) {
    const error = exactKeys(descriptor.startError, COMMAND_RUN_ERROR_KEYS, 'desktop test command run descriptor.startError')
    if (!/^[A-Za-z][A-Za-z0-9]*$/u.test(nonEmptyString(error.name, 'desktop test command run descriptor.startError.name'))) {
      throw new TypeError('desktop test command run descriptor.startError.name must be an error name')
    }
    if (error.code !== null && (typeof error.code !== 'string' || !/^[A-Z][A-Z0-9_]{0,79}$/u.test(error.code))) {
      throw new TypeError('desktop test command run descriptor.startError.code must be a safe error code or null')
    }
  }
  return descriptor
}

export function parseDesktopE2ECommandCancellationRequest(value) {
  const request = exactKeys(value, COMMAND_CANCELLATION_REQUEST_KEYS, 'desktop test command cancellation request')
  if (request.schemaVersion !== 1) throw new TypeError('desktop test command cancellation request.schemaVersion must be 1')
  if (typeof request.invocationId !== 'string' || !UUID_PATTERN.test(request.invocationId)) {
    throw new TypeError('desktop test command cancellation request.invocationId must be a UUID')
  }
  if (!COMMAND_SIGNALS.includes(request.signal)) {
    throw new TypeError(`desktop test command cancellation request.signal must be one of ${COMMAND_SIGNALS.join(', ')}`)
  }
  isoTimestamp(request.requestedAt, 'desktop test command cancellation request.requestedAt')
  return request
}

export function parseDesktopE2ECommandCancellationResult(value) {
  const result = exactKeys(value, COMMAND_CANCELLATION_RESULT_KEYS, 'desktop test command cancellation result')
  if (result.schemaVersion !== 1) throw new TypeError('desktop test command cancellation result.schemaVersion must be 1')
  if (typeof result.invocationId !== 'string' || !UUID_PATTERN.test(result.invocationId)) {
    throw new TypeError('desktop test command cancellation result.invocationId must be a UUID')
  }
  positiveInteger(result.runnerPid, 'desktop test command cancellation result.runnerPid')
  for (const key of ['runnerCwd']) {
    if (!isAbsolute(nonEmptyString(result[key], `desktop test command cancellation result.${key}`))) {
      throw new TypeError(`desktop test command cancellation result.${key} must be absolute`)
    }
  }
  if (!COMMAND_SIGNALS.includes(result.signal)) throw new TypeError('desktop test command cancellation result.signal is invalid')
  if (result.phase !== null && !COMMAND_PHASES.includes(result.phase)) {
    throw new TypeError(`desktop test command cancellation result.phase must be null or one of ${COMMAND_PHASES.join(', ')}`)
  }
  if (result.commandChild !== null) {
    const child = exactKeys(result.commandChild, COMMAND_CHILD_KEYS, 'desktop test command cancellation result.commandChild')
    positiveInteger(child.pid, 'desktop test command cancellation result.commandChild.pid')
    positiveInteger(child.processGroupId, 'desktop test command cancellation result.commandChild.processGroupId')
    if (child.processGroupId !== child.pid) {
      throw new TypeError('desktop test command cancellation result.commandChild.processGroupId must match the detached child PID')
    }
    nonEmptyString(child.command, 'desktop test command cancellation result.commandChild.command')
    if (!isAbsolute(nonEmptyString(child.workingDirectory, 'desktop test command cancellation result.commandChild.workingDirectory'))) {
      throw new TypeError('desktop test command cancellation result.commandChild.workingDirectory must be absolute')
    }
  }
  isoTimestamp(result.requestedAt, 'desktop test command cancellation result.requestedAt')
  isoTimestamp(result.completedAt, 'desktop test command cancellation result.completedAt')
  const expectedExitCode = result.signal === 'SIGINT' ? 130 : 143
  if (result.exitCode !== expectedExitCode) throw new TypeError(`desktop test command cancellation result.exitCode must be ${expectedExitCode}`)
  if (typeof result.cleanupSucceeded !== 'boolean') throw new TypeError('desktop test command cancellation result.cleanupSucceeded must be boolean')
  if (!Array.isArray(result.cleanupFailures) || result.cleanupFailures.some(message => typeof message !== 'string' || message.trim() === '')) {
    throw new TypeError('desktop test command cancellation result.cleanupFailures must contain non-empty strings')
  }
  if (result.cleanupSucceeded !== (result.cleanupFailures.length === 0)) {
    throw new TypeError('desktop test command cancellation result.cleanupSucceeded must match cleanupFailures')
  }
  if (!Array.isArray(result.runs)) throw new TypeError('desktop test command cancellation result.runs must be an array')
  for (const [index, item] of result.runs.entries()) {
    const run = exactKeys(item, COMMAND_RUN_RESULT_KEYS, `desktop test command cancellation result.runs[${index}]`)
    if (typeof run.runId !== 'string' || !UUID_PATTERN.test(run.runId)) {
      throw new TypeError(`desktop test command cancellation result.runs[${index}].runId must be a UUID`)
    }
    if (!isAbsolute(nonEmptyString(run.repositoryRoot, `desktop test command cancellation result.runs[${index}].repositoryRoot`))) {
      throw new TypeError(`desktop test command cancellation result.runs[${index}].repositoryRoot must be absolute`)
    }
    const paths = exactKeys(run.paths, COMMAND_RUN_PATHS_KEYS, `desktop test command cancellation result.runs[${index}].paths`)
    for (const [key, path] of Object.entries(paths)) {
      if (!isAbsolute(nonEmptyString(path, `desktop test command cancellation result.runs[${index}].paths.${key}`))) {
        throw new TypeError(`desktop test command cancellation result.runs[${index}].paths.${key} must be absolute`)
      }
    }
    if (!COMMAND_RUN_STATES.includes(run.state)) {
      throw new TypeError(`desktop test command cancellation result.runs[${index}].state is invalid`)
    }
    for (const key of ['processGroupAbsent', 'portsReleased', 'environmentLeaseReleased']) {
      if (run[key] !== null && typeof run[key] !== 'boolean') {
        throw new TypeError(`desktop test command cancellation result.runs[${index}].${key} must be boolean or null`)
      }
    }
    if (!Array.isArray(run.evidencePaths) || run.evidencePaths.some(path => !isAbsolute(nonEmptyString(path, 'command cleanup evidence path')))) {
      throw new TypeError(`desktop test command cancellation result.runs[${index}].evidencePaths must contain absolute paths`)
    }
    if (run.cleanupError !== null && typeof run.cleanupError !== 'string') {
      throw new TypeError(`desktop test command cancellation result.runs[${index}].cleanupError must be a string or null`)
    }
  }
  return result
}

export function parseDesktopE2ERunRecord(value, config) {
  const run = exactKeys(value, RUN_RECORD_KEYS, 'desktop E2E run record')
  if (run.schemaVersion !== 1) throw new TypeError('desktop E2E run record.schemaVersion must be 1')
  if (typeof run.runId !== 'string' || !UUID_PATTERN.test(run.runId)) throw new TypeError('desktop E2E run record.runId must be a UUID')
  if (config === undefined) throw new TypeError('desktop E2E run record validation requires the desktop E2E config')
  if (typeof run.mode !== 'string' || !Object.hasOwn(config.modes, run.mode) || run.mode === 'defaultMode') {
    throw new TypeError('desktop E2E run record.mode must name a configured mode')
  }
  if (!PORT_STATES.includes(run.state)) throw new TypeError(`desktop E2E run record.state must be one of ${PORT_STATES.join(', ')}`)
  isoTimestamp(run.createdAt, 'desktop E2E run record.createdAt')
  isoTimestamp(run.updatedAt, 'desktop E2E run record.updatedAt')

  const application = exactKeys(run.application, RUN_APPLICATION_KEYS, 'desktop E2E run record.application')
  for (const [key, field] of Object.entries(application)) nonEmptyString(field, `desktop E2E run record.application.${key}`)
  if (!isAbsolute(application.bundlePath) || !isAbsolute(application.executablePath)) {
    throw new TypeError('desktop E2E run record application paths must be absolute')
  }
  if (!VERSION_PATTERN.test(application.version)) throw new TypeError('desktop E2E run record.application.version must be a semantic version')
  const directories = exactKeys(run.directories, DIRECTORY_KEYS, 'desktop E2E run record.directories')
  for (const [key, path] of Object.entries(directories)) {
    nonEmptyString(path, `desktop E2E run record.directories.${key}`)
    if (!path.startsWith('/')) throw new TypeError(`desktop E2E run record.directories.${key} must be absolute`)
  }
  const environment = exactKeys(run.environment, RUN_ENVIRONMENT_KEYS, 'desktop E2E run record.environment')
  const modeConfig = config.modes[run.mode]
  if (modeConfig?.persistent === true) {
    for (const key of RUN_ENVIRONMENT_KEYS) {
      nonEmptyString(environment[key], `desktop E2E run record.environment.${key}`)
      if (!isAbsolute(environment[key])) throw new TypeError(`desktop E2E run record.environment.${key} must be absolute`)
    }
    const expectedLeasePath = join(environment.root, modeConfig.leaseFilename)
    if (environment.leasePath !== expectedLeasePath) throw new TypeError('desktop E2E run record.environment.leasePath must be inside the configured environment root')
    for (const key of ['dshHome', 'electronUserData', 'workspace']) {
      if (directories[key] !== join(environment.root, modeConfig.directoryNames[key])) {
        throw new TypeError(`desktop E2E run record.directories.${key} must use the persistent environment path`)
      }
    }
    if (directories.profile !== join(directories.dshHome, config.paths.profileRelativePath)) {
      throw new TypeError('desktop E2E run record.directories.profile must use the persistent DSH home')
    }
    for (const key of ['logs', 'evidence', 'diagnosticFile']) {
      const rel = relative(directories.run, directories[key])
      if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        throw new TypeError(`persistent run record.directories.${key} must remain inside its run directory`)
      }
    }
  } else if (environment.root !== null || environment.leasePath !== null) {
    throw new TypeError('ephemeral run records must not reference a persistent environment lease')
  } else {
    for (const key of ['dshHome', 'electronUserData', 'workspace', 'logs', 'evidence', 'profile', 'diagnosticFile']) {
      const rel = relative(directories.run, directories[key])
      if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        throw new TypeError(`ephemeral run record.directories.${key} must be inside its run directory`)
      }
    }
  }
  const ports = record(run.ports, 'desktop E2E run record.ports')
  if (Object.keys(ports).length !== 3 || Object.keys(ports).some(key => !/^[A-Za-z][A-Za-z0-9]*$/u.test(key))) {
    throw new TypeError('desktop E2E run record.ports must contain three named ports')
  }
  for (const [key, port] of Object.entries(ports)) positiveInteger(port, `desktop E2E run record.ports.${key}`, 65_535)
  if (new Set(Object.values(ports)).size !== Object.keys(ports).length) throw new TypeError('desktop E2E run record.ports must be distinct')

  const launch = exactKeys(run.launch, LAUNCH_KEYS, 'desktop E2E run record.launch')
  if (!Array.isArray(launch.arguments) || launch.arguments.some(argument => typeof argument !== 'string')) {
    throw new TypeError('desktop E2E run record.launch.arguments must be an array of strings')
  }
  record(launch.environment, 'desktop E2E run record.launch.environment')
  for (const [key, value] of Object.entries(launch.environment)) {
    nonEmptyString(key, 'desktop E2E run record.launch.environment key')
    nonEmptyString(value, `desktop E2E run record.launch.environment.${key}`)
  }
  if (!Array.isArray(launch.unsetEnvironmentNames)
    || launch.unsetEnvironmentNames.some(name => typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name))
    || new Set(launch.unsetEnvironmentNames).size !== launch.unsetEnvironmentNames.length) {
    throw new TypeError('desktop E2E run record.launch.unsetEnvironmentNames must contain unique environment variable names')
  }

  if (run.process !== null) {
    const process = exactKeys(run.process, PROCESS_KEYS, 'desktop E2E run record.process')
    positiveInteger(process.pid, 'desktop E2E run record.process.pid')
    positiveInteger(process.processGroupId, 'desktop E2E run record.process.processGroupId')
    nonEmptyString(process.command, 'desktop E2E run record.process.command')
    nonEmptyString(process.workingDirectory, 'desktop E2E run record.process.workingDirectory')
    isoTimestamp(process.observedAt, 'desktop E2E run record.process.observedAt')
    if (!Array.isArray(process.listeningPorts) || process.listeningPorts.some(port => !Number.isSafeInteger(port) || port < 1 || port > 65_535)) {
      throw new TypeError('desktop E2E run record.process.listeningPorts must contain valid ports')
    }
  }

  if (run.result !== null) {
    const result = exactKeys(run.result, RESULT_KEYS, 'desktop E2E run record.result')
    if (result.exitCode !== null && !Number.isInteger(result.exitCode)) throw new TypeError('desktop E2E run record.result.exitCode must be an integer or null')
    if (result.error !== null && typeof result.error !== 'string') throw new TypeError('desktop E2E run record.result.error must be a string or null')
    isoTimestamp(result.completedAt, 'desktop E2E run record.result.completedAt')
    if (typeof result.portsReleased !== 'boolean') throw new TypeError('desktop E2E run record.result.portsReleased must be boolean')
  }
  return run
}

export function parseDevelopmentEnvironmentLeaseRecord(value) {
  const lease = exactKeys(value, ['schemaVersion', 'runId', 'processId', 'createdAt'], 'development environment lease')
  if (lease.schemaVersion !== 1) throw new TypeError('development environment lease.schemaVersion must be 1')
  if (typeof lease.runId !== 'string' || !UUID_PATTERN.test(lease.runId)) throw new TypeError('development environment lease.runId must be a UUID')
  positiveInteger(lease.processId, 'development environment lease.processId')
  isoTimestamp(lease.createdAt, 'development environment lease.createdAt')
  return lease
}

export function parseDesktopE2EPreparationFailureEvidence(value, config) {
  const evidence = exactKeys(value, PREPARATION_FAILURE_KEYS, 'desktop E2E preparation failure evidence')
  if (evidence.schemaVersion !== 1) throw new TypeError('desktop E2E preparation failure evidence.schemaVersion must be 1')
  if (typeof evidence.runId !== 'string' || !UUID_PATTERN.test(evidence.runId)) {
    throw new TypeError('desktop E2E preparation failure evidence.runId must be a UUID')
  }
  if (config === undefined || typeof evidence.mode !== 'string'
    || !Object.hasOwn(config.modes, evidence.mode) || evidence.mode === 'defaultMode') {
    throw new TypeError('desktop E2E preparation failure evidence.mode must name a configured mode')
  }
  if (evidence.phase !== 'prepare') throw new TypeError('desktop E2E preparation failure evidence.phase must be prepare')
  if (typeof evidence.code !== 'string' || !/^[A-Z][A-Z0-9_]{0,79}$/u.test(evidence.code)) {
    throw new TypeError('desktop E2E preparation failure evidence.code must be a safe error code')
  }
  if (!SAFE_ERROR_TYPES.includes(evidence.errorType)) {
    throw new TypeError(`desktop E2E preparation failure evidence.errorType must be one of ${SAFE_ERROR_TYPES.join(', ')}`)
  }
  isoTimestamp(evidence.recordedAt, 'desktop E2E preparation failure evidence.recordedAt')
  const cleanup = exactKeys(evidence.cleanup, PREPARATION_FAILURE_CLEANUP_KEYS, 'desktop E2E preparation failure evidence.cleanup')
  if (typeof cleanup.portsReleased !== 'boolean') {
    throw new TypeError('desktop E2E preparation failure evidence.cleanup.portsReleased must be boolean')
  }
  if (!LEASE_CLEANUP_STATES.includes(cleanup.environmentLease)) {
    throw new TypeError(`desktop E2E preparation failure evidence.cleanup.environmentLease must be one of ${LEASE_CLEANUP_STATES.join(', ')}`)
  }
  return evidence
}

export function matchesDesktopRendererTitle(title, readiness) {
  if (typeof title !== 'string') return false
  if (title === readiness.rendererTargetTitle) return true
  const suffix = readiness.rendererSessionTitleSeparator + readiness.rendererTargetTitle
  return title.endsWith(suffix) && title.slice(0, -suffix.length).trim().length > 0
}

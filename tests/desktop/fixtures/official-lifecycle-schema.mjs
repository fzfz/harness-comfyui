import { isAbsolute } from 'node:path'

import lifecycleFixtureConfig from './official-lifecycle-fixture.json' with { type: 'json' }
import settingsEntryIds from '../../../config/settings-entry-ids.json' with { type: 'json' }
import browserSettings from '../../../config/browser-settings.json' with { type: 'json' }
import {
  OFFICIAL_CANDIDATE_RUNTIME_PATHS,
  parseOfficialCandidateComparisons,
  parseOfficialCandidateClientSourceResult,
  parseOfficialCandidateSourceIdentity,
} from './official-candidate-identity-schema.mjs'

const FIXTURE_KEYS = [
  'schemaVersion', 'classification', 'acceptanceClaim', 'artifact', 'credentials', 'runGateEnvironmentName', 'scenarios', 'instanceLabels',
  'scenarioLabels', 'profileEntries', 'operations', 'paths', 'timeouts',
]
const SCENARIOS = [
  'a13-parallel-instances',
  'a15-successful-start-stop',
  'a15-start-failure',
  'a15-cancel-after-launch',
  'a15-startup-timeout',
  'a15-port-conflict',
  'a15-debug-retention',
]
const PROFILE_ENTRY_KEYS = [
  'agentDefaultModel', 'providerSettings', 'pluginSettings', 'configurationProfile', 'sourceUrl', 'sourcePort',
]
const ARTIFACT_KEYS = ['sourcePathEnvironmentName', 'sourceIdentityPathEnvironmentName', 'sourceIdentityFilename']
const CREDENTIAL_KEYS = ['testKeyEnvironmentName', 'testKeyValue']
const SCENARIO_LABEL_KEYS = ['successfulStartStop', 'startFailure', 'startupCancellation', 'startupTimeout', 'portConflict', 'debugRetention', 'savedSettingsRestart', 'rightSettingsRestart']
const OPERATION_KEYS = [
  'sessionPresetId', 'workspaceNameTemplate', 'sessionTitleTemplate', 'defaultProviderId', 'defaultModelId',
  'hostReadOnlyRequestOperation',
  'viewBundleButtonAriaLabelTemplate',
  'candidateClientScript',
  'newSessionButtonAriaLabel', 'pluginBrandText', 'unexpectedOnboardingButtonText',
  'pluginNoticeText', 'pluginNoticeContinueButtonText',
]
const CANDIDATE_CLIENT_SCRIPT_KEYS = [
  'scriptUrlPrefix', 'sourceMapUrlPrefix', 'sourceMapRequestPrefix', 'revisionQueryPrefix', 'revisionPattern',
  'moduleRoutePattern', 'candidateModuleMustBeLast', 'moduleMapSuffix', 'sourceUrlDirectivePrefix',
  'sourceUrlDirectiveValuePattern', 'sourceMapDirectiveValuePattern',
  'moduleSeparator', 'sourceMapTrailerTemplate', 'evidenceFilenameTemplate',
  'sourceMapEvidenceFilenameTemplate', 'evidenceRecordFilenameTemplate',
]
const PATH_KEYS = [
  'supportDirectoryName', 'environmentDirectoryName', 'artifactsDirectoryName', 'testEnvironmentFilename',
  'evidenceFilenames', 'debugRetentionFilename', 'osHomeDirectoryName', 'agentsHomeDirectoryName',
]
const TIMEOUT_KEYS = [
  'a13CaseTimeoutMs', 'a15CaseTimeoutMs', 'operationTimeoutMs', 'cleanupTimeoutMs', 'installTimeoutMs',
  'failureStartupTimeoutMs', 'timeoutStartupTimeoutMs',
  'timeoutPortReadyMs', 'pollIntervalMs',
]
const EVIDENCE_KEYS = [
  'schemaVersion', 'classification', 'acceptanceClaim', 'scenario', 'recordedAt', 'fixtureId', 'fixtureRoot',
  'artifact', 'environments', 'parallelRequest', 'cleanup',
]
const EVIDENCE_SCENARIOS = new Set(SCENARIOS)
const ENVIRONMENT_KEYS = [
  'label', 'runId', 'state', 'application', 'directories', 'ports', 'processObservedDuringStart', 'portOwnersAtReady',
  'install', 'session', 'savedSetting', 'pluginManagerRecord', 'pluginManagerResponse', 'cleanup', 'failure',
]
const APPLICATION_KEYS = ['bundlePath', 'bundleId', 'version']
const DIRECTORY_KEYS = ['home', 'dshHome', 'electronUserData', 'workspace', 'evidence', 'pluginInstallPath']
const PORT_KEYS = ['host', 'rendererCdp', 'hostInspector']
const PROCESS_KEYS = ['rootPid', 'processGroupId', 'matchesRun', 'members']
const MEMBER_KEYS = ['pid', 'parentPid', 'processGroupId', 'command', 'workingDirectory', 'listeningPorts']
const PORT_OBSERVATION_KEYS = ['port', 'pids']
const INSTALL_KEYS = [
  'packageName', 'packageVersion', 'path', 'status', 'restartRequired', 'enabled', 'evidenceComplete',
  'artifactComparisons', 'loadedClientSource',
]
const SESSION_KEYS = ['workspaceId', 'sessionId', 'title', 'remoteResponse', 'workspaceReadback', 'identityReadback', 'visibleSessionIds']
const WORKSPACE_READBACK_KEYS = ['workspaceId', 'path', 'sessionIds']
const IDENTITY_READBACK_KEYS = ['sessionId', 'cwd']
const SETTING_KEYS = ['entryId', browserSettings.fieldName]
const BUNDLE_KEYS = ['name', 'version', 'installed', 'enabled']
const BUNDLE_INFO_REQUIRED_KEYS = ['name', 'enabled', 'installed', 'optional', 'removable', 'rows', 'overrides']
const BUNDLE_INFO_OPTIONAL_KEYS = ['version', 'meta', 'description', 'readOnlyReason', 'error']
const BUNDLE_ROW_REQUIRED_KEYS = ['rowId', 'moduleName']
const BUNDLE_ROW_OPTIONAL_KEYS = ['meta', 'entryId']
const BUNDLE_ERROR_CODES = new Set([
  'management-required', 'unaddressable', 'unknown-plugin', 'invalid-spec', 'ambiguous-install', 'not-bundle',
  'not-removable', 'stop-profile', 'bundle-in-use', 'stale-approval', 'incompatible-version', 'operation-error',
])
const CLEANUP_KEYS = ['state', 'exitCode', 'error', 'portsReleased', 'processGroupMembers', 'portOwners']
const PARALLEL_REQUEST_KEYS = ['runId', 'operation', 'result', 'sessionId', 'workspaceId', 'workspacePath', 'cwd', 'visibleSessionIds', 'ok']
const DEBUG_RETENTION_KEYS = [
  'schemaVersion', 'classification', 'acceptanceClaim', 'runId', 'application', 'process', 'ports',
  'evidenceDirectory', 'stopMethod', 'stopInvocation', 'configuredProfile', 'retainedAt',
]
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u
function record(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
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

function knownKeys(value, requiredKeys, optionalKeys, label) {
  record(value, label)
  const allowed = new Set([...requiredKeys, ...optionalKeys])
  const missing = requiredKeys.filter(key => !Object.hasOwn(value, key))
  const unexpected = Object.keys(value).filter(key => !allowed.has(key))
  if (missing.length > 0 || unexpected.length > 0) {
    throw new TypeError(`${label} must follow the SDK fields${
      missing.length ? `; missing ${missing.join(', ')}` : ''
    }${unexpected.length ? `; unexpected ${unexpected.join(', ')}` : ''}`)
  }
  return value
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} must be a non-empty string`)
  return value
}

function absolutePath(value, label) {
  if (!isAbsolute(nonEmptyString(value, label)) || value.includes('\0')) {
    throw new TypeError(`${label} must be an absolute path`)
  }
}

function directoryName(value, label) {
  nonEmptyString(value, label)
  if (value.includes('/') || value.includes('\\') || value === '.' || value === '..') {
    throw new TypeError(`${label} must be a directory name`)
  }
}

function filename(value, label) {
  directoryName(value, label)
}

function positiveInteger(value, label, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new TypeError(`${label} must be an integer from 1 through ${max}`)
  }
}

function uniqueStrings(value, label, { nonEmpty = true } = {}) {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)
    || value.some(item => typeof item !== 'string' || item.trim() === '')
    || new Set(value).size !== value.length) {
    throw new TypeError(`${label} must contain unique non-empty strings${nonEmpty ? '' : ' and may be empty'}`)
  }
}

function isoTimestamp(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new TypeError(`${label} must be an ISO timestamp`)
  }
}

export function parseOfficialLifecycleFixture(value) {
  const fixture = exactKeys(value, FIXTURE_KEYS, 'official lifecycle fixture')
  if (fixture.schemaVersion !== 1) throw new TypeError('official lifecycle fixture.schemaVersion must be 1')
  if (fixture.classification !== 'automated-regression') {
    throw new TypeError('official lifecycle fixture.classification must be automated-regression')
  }
  if (fixture.acceptanceClaim !== false) throw new TypeError('official lifecycle fixture.acceptanceClaim must be false')
  const artifact = exactKeys(fixture.artifact, ARTIFACT_KEYS, 'official lifecycle fixture.artifact')
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(nonEmptyString(artifact.sourcePathEnvironmentName, 'official lifecycle fixture.artifact.sourcePathEnvironmentName'))) {
    throw new TypeError('official lifecycle fixture.artifact.sourcePathEnvironmentName must name an environment variable')
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(nonEmptyString(artifact.sourceIdentityPathEnvironmentName, 'official lifecycle fixture.artifact.sourceIdentityPathEnvironmentName'))) {
    throw new TypeError('official lifecycle fixture.artifact.sourceIdentityPathEnvironmentName must name an environment variable')
  }
  if (artifact.sourcePathEnvironmentName === artifact.sourceIdentityPathEnvironmentName) {
    throw new TypeError('official lifecycle fixture artifact environment names must be distinct')
  }
  filename(artifact.sourceIdentityFilename, 'official lifecycle fixture.artifact.sourceIdentityFilename')
  const credentials = exactKeys(fixture.credentials, CREDENTIAL_KEYS, 'official lifecycle fixture.credentials')
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(nonEmptyString(credentials.testKeyEnvironmentName, 'official lifecycle fixture.credentials.testKeyEnvironmentName'))) {
    throw new TypeError('official lifecycle fixture.credentials.testKeyEnvironmentName must name an environment variable')
  }
  nonEmptyString(credentials.testKeyValue, 'official lifecycle fixture.credentials.testKeyValue')
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(nonEmptyString(fixture.runGateEnvironmentName, 'official lifecycle fixture.runGateEnvironmentName'))) {
    throw new TypeError('official lifecycle fixture.runGateEnvironmentName must name an environment variable')
  }
  uniqueStrings(fixture.scenarios, 'official lifecycle fixture.scenarios')
  if (fixture.scenarios.length !== SCENARIOS.length || SCENARIOS.some(name => !fixture.scenarios.includes(name))) {
    throw new TypeError('official lifecycle fixture.scenarios must cover the A13 and A15 lifecycle scenarios')
  }
  uniqueStrings(fixture.instanceLabels, 'official lifecycle fixture.instanceLabels')
  if (fixture.instanceLabels.length !== 2) throw new TypeError('official lifecycle fixture.instanceLabels must contain two labels')
  const scenarioLabels = exactKeys(fixture.scenarioLabels, SCENARIO_LABEL_KEYS, 'official lifecycle fixture.scenarioLabels')
  for (const [key, label] of Object.entries(scenarioLabels)) nonEmptyString(label, `official lifecycle fixture.scenarioLabels.${key}`)
  if (new Set([...fixture.instanceLabels, ...Object.values(scenarioLabels)]).size !== fixture.instanceLabels.length + SCENARIO_LABEL_KEYS.length) {
    throw new TypeError('official lifecycle fixture scenario labels must be unique')
  }

  const entries = exactKeys(fixture.profileEntries, PROFILE_ENTRY_KEYS, 'official lifecycle fixture.profileEntries')
  for (const [key, entryId] of Object.entries(entries)) {
    if (key === 'sourcePort') continue
    nonEmptyString(entryId, `official lifecycle fixture.profileEntries.${key}`)
  }
  positiveInteger(entries.sourcePort, 'official lifecycle fixture.profileEntries.sourcePort', 65_535)

  const operations = exactKeys(fixture.operations, OPERATION_KEYS, 'official lifecycle fixture.operations')
  for (const [key, item] of Object.entries(operations)) {
    if (key === 'candidateClientScript') continue
    nonEmptyString(item, `official lifecycle fixture.operations.${key}`)
  }
  if ((operations.viewBundleButtonAriaLabelTemplate.match(/\{name\}/gu) ?? []).length !== 1) {
    throw new TypeError('official lifecycle fixture.operations.viewBundleButtonAriaLabelTemplate must contain {name} exactly once')
  }
  const candidateClientScript = exactKeys(
    operations.candidateClientScript,
    CANDIDATE_CLIENT_SCRIPT_KEYS,
    'official lifecycle fixture.operations.candidateClientScript',
  )
  if (candidateClientScript.scriptUrlPrefix !== 'dsh-app://app/plugins/??'
    || candidateClientScript.sourceMapUrlPrefix !== '??'
    || candidateClientScript.sourceMapRequestPrefix !== 'dsh-app://app/plugins/'
    || candidateClientScript.revisionQueryPrefix !== '&rev='
    || candidateClientScript.revisionPattern !== '^[a-f0-9]{12}$'
    || candidateClientScript.moduleRoutePattern !== '^(?:@deepseek-ai/[a-z0-9][a-z0-9-]*|harness-comfyui)/client\\.js$'
    || candidateClientScript.candidateModuleMustBeLast !== true
    || candidateClientScript.moduleMapSuffix !== '.map'
    || candidateClientScript.sourceUrlDirectivePrefix !== '//# sourceURL='
    || candidateClientScript.sourceUrlDirectiveValuePattern !== '+'
    || candidateClientScript.sourceMapDirectiveValuePattern !== '*'
    || candidateClientScript.moduleSeparator !== ';\n'
    || candidateClientScript.sourceMapTrailerTemplate !== '//# sourceMappingURL={sourceMapUrl}\n') {
    throw new TypeError('official lifecycle fixture.operations.candidateClientScript must match the verified official combo bundle route and source wrapper')
  }
  if (candidateClientScript.evidenceFilenameTemplate !== 'official-client-source-{scriptId}-{kind}.js'
    || candidateClientScript.sourceMapEvidenceFilenameTemplate !== 'official-client-source-{scriptId}-combo-map.json'
    || candidateClientScript.evidenceRecordFilenameTemplate !== 'official-client-source-{scriptId}.json') {
    throw new TypeError('official lifecycle fixture.operations.candidateClientScript evidence filenames must match the verified source evidence format')
  }

  const paths = exactKeys(fixture.paths, PATH_KEYS, 'official lifecycle fixture.paths')
  for (const key of ['supportDirectoryName', 'environmentDirectoryName', 'artifactsDirectoryName', 'osHomeDirectoryName', 'agentsHomeDirectoryName']) {
    directoryName(paths[key], `official lifecycle fixture.paths.${key}`)
  }
  filename(paths.testEnvironmentFilename, 'official lifecycle fixture.paths.testEnvironmentFilename')
  filename(paths.debugRetentionFilename, 'official lifecycle fixture.paths.debugRetentionFilename')
  const evidenceFilenames = exactKeys(paths.evidenceFilenames, SCENARIOS, 'official lifecycle fixture.paths.evidenceFilenames')
  for (const [scenario, path] of Object.entries(evidenceFilenames)) filename(path, `official lifecycle fixture.paths.evidenceFilenames.${scenario}`)
  const allPathNames = [
    ...['supportDirectoryName', 'environmentDirectoryName', 'artifactsDirectoryName', 'osHomeDirectoryName', 'agentsHomeDirectoryName'].map(key => paths[key]),
    paths.testEnvironmentFilename,
    paths.debugRetentionFilename,
    ...Object.values(evidenceFilenames),
  ]
  if (new Set(allPathNames).size !== allPathNames.length) {
    throw new TypeError('official lifecycle fixture.paths values must be unique')
  }

  const timeouts = exactKeys(fixture.timeouts, TIMEOUT_KEYS, 'official lifecycle fixture.timeouts')
  for (const [key, timeout] of Object.entries(timeouts)) {
    const maximum = key === 'a13CaseTimeoutMs' ? 900_000 : 300_000
    positiveInteger(timeout, `official lifecycle fixture.timeouts.${key}`, maximum)
  }
  if (timeouts.timeoutPortReadyMs > timeouts.timeoutStartupTimeoutMs) {
    throw new TypeError('official lifecycle fixture.timeouts.timeoutPortReadyMs must not exceed timeoutStartupTimeoutMs')
  }
  return fixture
}

function validateProcess(value, label) {
  if (value === null) return
  const process = exactKeys(value, PROCESS_KEYS, label)
  positiveInteger(process.rootPid, `${label}.rootPid`)
  positiveInteger(process.processGroupId, `${label}.processGroupId`)
  if (typeof process.matchesRun !== 'boolean') throw new TypeError(`${label}.matchesRun must be boolean`)
  if (!Array.isArray(process.members)) throw new TypeError(`${label}.members must be an array`)
  for (const [index, memberValue] of process.members.entries()) {
    const member = exactKeys(memberValue, MEMBER_KEYS, `${label}.members[${index}]`)
    for (const key of ['pid', 'parentPid', 'processGroupId']) positiveInteger(member[key], `${label}.members[${index}].${key}`)
    nonEmptyString(member.command, `${label}.members[${index}].command`)
    if (member.workingDirectory !== null) {
      if (typeof member.workingDirectory !== 'string' || !isAbsolute(member.workingDirectory)) {
        throw new TypeError(`${label}.members[${index}].workingDirectory must be null or an absolute path`)
      }
      absolutePath(member.workingDirectory, `${label}.members[${index}].workingDirectory`)
    }
    if (!Array.isArray(member.listeningPorts)) throw new TypeError(`${label}.members[${index}].listeningPorts must be an array`)
    for (const [portIndex, port] of member.listeningPorts.entries()) {
      positiveInteger(port, `${label}.members[${index}].listeningPorts[${portIndex}]`, 65_535)
    }
  }
}

function validatePortObservations(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`)
  for (const [index, observationValue] of value.entries()) {
    const observation = exactKeys(observationValue, PORT_OBSERVATION_KEYS, `${label}[${index}]`)
    positiveInteger(observation.port, `${label}[${index}].port`, 65_535)
    if (!Array.isArray(observation.pids)) throw new TypeError(`${label}[${index}].pids must be an array`)
    for (const [pidIndex, pid] of observation.pids.entries()) positiveInteger(pid, `${label}[${index}].pids[${pidIndex}]`)
  }
}

function validateInstall(value, label, sourceIdentity) {
  if (value === null) return
  const install = exactKeys(value, INSTALL_KEYS, label)
  for (const key of ['packageName', 'packageVersion', 'status']) nonEmptyString(install[key], `${label}.${key}`)
  absolutePath(install.path, `${label}.path`)
  if (install.packageName !== sourceIdentity.packageName || install.packageVersion !== sourceIdentity.packageVersion) {
    throw new TypeError(`${label} package identity must match the fixed candidate source identity`)
  }
  for (const key of ['restartRequired', 'enabled', 'evidenceComplete']) {
    if (typeof install[key] !== 'boolean') throw new TypeError(`${label}.${key} must be boolean`)
  }
  parseOfficialCandidateComparisons(install.artifactComparisons, sourceIdentity, `${label}.artifactComparisons`)
  parseOfficialCandidateClientSourceResult(install.loadedClientSource, sourceIdentity)
}

function validateSession(value, label, workspacePath) {
  if (value === null) return
  const session = exactKeys(value, SESSION_KEYS, label)
  for (const key of ['workspaceId', 'sessionId']) nonEmptyString(session[key], `${label}.${key}`)
  if (session.title !== null && (typeof session.title !== 'string' || session.title.trim() === '')) {
    throw new TypeError(`${label}.title must be a non-empty string or null`)
  }
  const workspaceReadback = exactKeys(session.workspaceReadback, WORKSPACE_READBACK_KEYS, `${label}.workspaceReadback`)
  nonEmptyString(workspaceReadback.workspaceId, `${label}.workspaceReadback.workspaceId`)
  absolutePath(workspaceReadback.path, `${label}.workspaceReadback.path`)
  uniqueStrings(workspaceReadback.sessionIds, `${label}.workspaceReadback.sessionIds`)
  if (workspaceReadback.workspaceId !== session.workspaceId || workspaceReadback.path !== workspacePath
    || !workspaceReadback.sessionIds.includes(session.sessionId)) {
    throw new TypeError(`${label}.workspaceReadback must identify this run Workspace and contain its Session`)
  }
  const identityReadback = exactKeys(session.identityReadback, IDENTITY_READBACK_KEYS, `${label}.identityReadback`)
  nonEmptyString(identityReadback.sessionId, `${label}.identityReadback.sessionId`)
  absolutePath(identityReadback.cwd, `${label}.identityReadback.cwd`)
  if (identityReadback.sessionId !== session.sessionId || identityReadback.cwd !== workspacePath) {
    throw new TypeError(`${label}.identityReadback must identify this run Session and Workspace path`)
  }
  uniqueStrings(session.visibleSessionIds, `${label}.visibleSessionIds`)
  if (!session.visibleSessionIds.includes(session.sessionId)) {
    throw new TypeError(`${label}.visibleSessionIds must include the verified Session`)
  }
  const remoteResponse = record(session.remoteResponse, `${label}.remoteResponse`)
  if (remoteResponse.ok !== true || remoteResponse.value === null || typeof remoteResponse.value !== 'object'
    || Array.isArray(remoteResponse.value) || !Array.isArray(remoteResponse.value.items)) {
    throw new TypeError(`${label}.remoteResponse must preserve the successful Host session.list response`)
  }
  const remoteSessionIds = remoteResponse.value.items.map((item, index) => {
    record(item, `${label}.remoteResponse.value.items[${index}]`)
    return nonEmptyString(item.sessionId, `${label}.remoteResponse.value.items[${index}].sessionId`)
  })
  uniqueStrings(remoteSessionIds, `${label}.remoteResponse Session identities`)
  if (JSON.stringify(remoteSessionIds) !== JSON.stringify(session.visibleSessionIds)) {
    throw new TypeError(`${label}.remoteResponse Session identities must match visibleSessionIds`)
  }
  const matchingSessions = remoteResponse.value.items.filter(item => item.sessionId === session.sessionId)
  if (matchingSessions.length !== 1) {
    throw new TypeError(`${label}.remoteResponse must contain exactly one verified Host Session`)
  }
  const remoteSession = matchingSessions[0]
  const remoteTitle = remoteSession.projections?.values?.title
  if (remoteSession.cwd !== identityReadback.cwd || remoteTitle !== session.title) {
    throw new TypeError(`${label}.remoteResponse must identify the verified Session Workspace and observed title`)
  }
  if (remoteTitle !== null && (typeof remoteTitle !== 'string' || remoteTitle.trim() === '')) {
    throw new TypeError(`${label}.remoteResponse Session title must be a non-empty string or null`)
  }
}

function validateSetting(value, label) {
  if (value === null) return
  const setting = exactKeys(value, SETTING_KEYS, label)
  if (setting.entryId !== settingsEntryIds.core) {
    throw new TypeError(`${label}.entryId must equal config/settings-entry-ids.json core`)
  }
  absolutePath(setting[browserSettings.fieldName], `${label}.${browserSettings.fieldName}`)
}

function validateBundle(value, label) {
  if (value === null) return
  const bundle = exactKeys(value, BUNDLE_KEYS, label)
  nonEmptyString(bundle.name, `${label}.name`)
  if (typeof bundle.version !== 'string' || !SEMVER_PATTERN.test(bundle.version)) {
    throw new TypeError(`${label}.version must be a semantic version`)
  }
  for (const key of ['installed', 'enabled']) {
    if (typeof bundle[key] !== 'boolean') throw new TypeError(`${label}.${key} must be boolean`)
  }
}

function validateLocalizedText(value, label) {
  if (typeof value === 'string') return
  record(value, label)
  if (!Object.hasOwn(value, 'en')) throw new TypeError(`${label} must contain an English fallback`)
  for (const [locale, text] of Object.entries(value)) {
    nonEmptyString(locale, `${label} locale`)
    if (typeof text !== 'string') throw new TypeError(`${label}.${locale} must be a string`)
  }
}

function validateBundleMeta(value, label) {
  if (value === undefined) return
  const meta = knownKeys(value, [], ['title', 'description', 'icon', 'error'], label)
  if (meta.title !== undefined) validateLocalizedText(meta.title, `${label}.title`)
  if (meta.description !== undefined) validateLocalizedText(meta.description, `${label}.description`)
  for (const key of ['icon', 'error']) {
    if (meta[key] !== undefined && typeof meta[key] !== 'string') throw new TypeError(`${label}.${key} must be a string`)
  }
}

function validateIncompatiblePlugin(value, label) {
  const incompatible = exactKeys(value, ['name', 'version', 'runtimeVersion', 'peers'], label)
  for (const key of ['name', 'version', 'runtimeVersion']) nonEmptyString(incompatible[key], `${label}.${key}`)
  record(incompatible.peers, `${label}.peers`)
  for (const [name, range] of Object.entries(incompatible.peers)) {
    nonEmptyString(name, `${label}.peers package`)
    if (typeof range !== 'string') throw new TypeError(`${label}.peers.${name} must be a string`)
  }
}

function validateBundleManagementError(value, label) {
  const error = knownKeys(value, ['code'], ['diagnostic', 'incompatible'], label)
  if (!BUNDLE_ERROR_CODES.has(error.code)) throw new TypeError(`${label}.code is not a plugin-manager error code`)
  if (error.diagnostic !== undefined && typeof error.diagnostic !== 'string') {
    throw new TypeError(`${label}.diagnostic must be a string`)
  }
  if (error.incompatible !== undefined) {
    if (!Array.isArray(error.incompatible)) throw new TypeError(`${label}.incompatible must be an array`)
    error.incompatible.forEach((item, index) => validateIncompatiblePlugin(item, `${label}.incompatible[${index}]`))
  }
}

function validateBundleInfo(value, label) {
  const bundle = knownKeys(value, BUNDLE_INFO_REQUIRED_KEYS, BUNDLE_INFO_OPTIONAL_KEYS, label)
  nonEmptyString(bundle.name, `${label}.name`)
  if (bundle.version !== undefined) nonEmptyString(bundle.version, `${label}.version`)
  for (const key of ['enabled', 'installed', 'optional', 'removable']) {
    if (typeof bundle[key] !== 'boolean') throw new TypeError(`${label}.${key} must be boolean`)
  }
  if (!Array.isArray(bundle.rows)) throw new TypeError(`${label}.rows must be an array`)
  bundle.rows.forEach((rowValue, index) => {
    const rowLabel = `${label}.rows[${index}]`
    const row = knownKeys(rowValue, BUNDLE_ROW_REQUIRED_KEYS, BUNDLE_ROW_OPTIONAL_KEYS, rowLabel)
    nonEmptyString(row.rowId, `${rowLabel}.rowId`)
    nonEmptyString(row.moduleName, `${rowLabel}.moduleName`)
    if (row.entryId !== undefined) nonEmptyString(row.entryId, `${rowLabel}.entryId`)
    validateBundleMeta(row.meta, `${rowLabel}.meta`)
  })
  if (!Array.isArray(bundle.overrides) || bundle.overrides.some(item => typeof item !== 'string')) {
    throw new TypeError(`${label}.overrides must be an array of strings`)
  }
  if (bundle.meta !== undefined) validateBundleMeta(bundle.meta, `${label}.meta`)
  if (bundle.description !== undefined && typeof bundle.description !== 'string') {
    throw new TypeError(`${label}.description must be a string`)
  }
  if (bundle.readOnlyReason !== undefined && !['management-required', 'unaddressable'].includes(bundle.readOnlyReason)) {
    throw new TypeError(`${label}.readOnlyReason must be a supported SDK value`)
  }
  if (bundle.error !== undefined) validateBundleManagementError(bundle.error, `${label}.error`)
  return bundle
}

function validatePluginManagerListBundlesResponse(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must use the SDK RemoteResult envelope`)
  }
  const response = record(value, label)
  if (response.ok === false) {
    exactKeys(response, ['ok', 'error'], label)
    const error = record(response.error, `${label}.error`)
    nonEmptyString(error.code, `${label}.error.code`)
    throw new Error(`Remote pluginManager.listBundles failed: ${error.code}`)
  }
  if (response.ok !== true) throw new TypeError(`${label} must use the SDK RemoteResult envelope`)
  exactKeys(response, ['ok', 'value'], label)
  if (!Array.isArray(response.value)) throw new TypeError(`${label}.value must be the SDK BundleInfo array`)
  return response.value.map((bundle, index) => validateBundleInfo(bundle, `${label}.value[${index}] BundleInfo`))
}

export function parseOfficialPluginManagerListBundlesResponse(value, packageName, packageVersion) {
  nonEmptyString(packageName, 'expected plugin package name')
  nonEmptyString(packageVersion, 'expected plugin package version')
  const bundles = validatePluginManagerListBundlesResponse(value, 'Remote pluginManager.listBundles response')
  const matches = bundles.filter(bundle => bundle.name === packageName)
  if (matches.length !== 1) {
    throw new TypeError(`Remote pluginManager.listBundles must report exactly one ${packageName} BundleInfo`)
  }
  const [bundle] = matches
  if (bundle.version !== packageVersion) {
    throw new TypeError(`Remote pluginManager.listBundles expected package version ${packageVersion} for ${packageName}`)
  }
  if (bundle.installed !== true || bundle.enabled !== true) {
    throw new TypeError(`Remote pluginManager.listBundles must report ${packageName} as installed and enabled`)
  }
  return { name: bundle.name, version: bundle.version, installed: bundle.installed, enabled: bundle.enabled }
}

function validateCleanup(value, label) {
  if (value === null) return
  const cleanup = exactKeys(value, CLEANUP_KEYS, label)
  nonEmptyString(cleanup.state, `${label}.state`)
  if (cleanup.exitCode !== null && !Number.isSafeInteger(cleanup.exitCode)) {
    throw new TypeError(`${label}.exitCode must be an integer or null`)
  }
  if (cleanup.error !== null) nonEmptyString(cleanup.error, `${label}.error`)
  if (typeof cleanup.portsReleased !== 'boolean') throw new TypeError(`${label}.portsReleased must be boolean`)
  validateProcess(cleanup.processGroupMembers, `${label}.processGroupMembers`)
  validatePortObservations(cleanup.portOwners, `${label}.portOwners`)
}

function validateEnvironment(value, index, sourceIdentity) {
  const label = `official lifecycle evidence.environments[${index}]`
  const environment = exactKeys(value, ENVIRONMENT_KEYS, label)
  nonEmptyString(environment.label, `${label}.label`)
  if (!UUID_PATTERN.test(nonEmptyString(environment.runId, `${label}.runId`))) {
    throw new TypeError(`${label}.runId must be a UUID`)
  }
  if (!['running', 'failed', 'cancelled', 'stopped'].includes(environment.state)) {
    throw new TypeError(`${label}.state must be running, failed, cancelled, or stopped`)
  }
  const application = exactKeys(environment.application, APPLICATION_KEYS, `${label}.application`)
  absolutePath(application.bundlePath, `${label}.application.bundlePath`)
  nonEmptyString(application.bundleId, `${label}.application.bundleId`)
  if (!SEMVER_PATTERN.test(nonEmptyString(application.version, `${label}.application.version`))) {
    throw new TypeError(`${label}.application.version must be a semantic version`)
  }
  const directories = exactKeys(environment.directories, DIRECTORY_KEYS, `${label}.directories`)
  for (const [key, path] of Object.entries(directories)) absolutePath(path, `${label}.directories.${key}`)
  const ports = exactKeys(environment.ports, PORT_KEYS, `${label}.ports`)
  for (const [key, port] of Object.entries(ports)) positiveInteger(port, `${label}.ports.${key}`, 65_535)
  if (new Set(Object.values(ports)).size !== Object.keys(ports).length) {
    throw new TypeError(`${label}.ports must contain distinct port numbers`)
  }
  validateProcess(environment.processObservedDuringStart, `${label}.processObservedDuringStart`)
  validatePortObservations(environment.portOwnersAtReady, `${label}.portOwnersAtReady`)
  validateInstall(environment.install, `${label}.install`, sourceIdentity)
  if (environment.install !== null && environment.install.path !== directories.pluginInstallPath) {
    throw new TypeError(`${label}.install.path must match this run pluginInstallPath`)
  }
  validateSession(environment.session, `${label}.session`, directories.workspace)
  validateSetting(environment.savedSetting, `${label}.savedSetting`)
  validateBundle(environment.pluginManagerRecord, `${label}.pluginManagerRecord`)
  if ((environment.pluginManagerRecord === null) !== (environment.pluginManagerResponse === null)) {
    throw new TypeError(`${label}.pluginManagerRecord and pluginManagerResponse must be recorded together`)
  }
  if (environment.pluginManagerResponse !== null) {
    const bundles = validatePluginManagerListBundlesResponse(
      environment.pluginManagerResponse,
      `${label}.pluginManagerResponse`,
    )
    const matches = bundles.filter(bundle => bundle.name === environment.pluginManagerRecord.name)
    if (matches.length !== 1) {
      throw new TypeError(`${label}.pluginManagerResponse must contain exactly one recorded BundleInfo`)
    }
    const [bundle] = matches
    if (bundle.version !== environment.pluginManagerRecord.version
      || bundle.installed !== environment.pluginManagerRecord.installed
      || bundle.enabled !== environment.pluginManagerRecord.enabled) {
      throw new TypeError(`${label}.pluginManagerRecord must match its SDK RemoteResult evidence`)
    }
  }
  validateCleanup(environment.cleanup, `${label}.cleanup`)
  if (environment.failure !== null) nonEmptyString(environment.failure, `${label}.failure`)
}

export function parseOfficialLifecycleEvidence(value) {
  const evidence = exactKeys(value, EVIDENCE_KEYS, 'official lifecycle evidence')
  if (evidence.schemaVersion !== 1) throw new TypeError('official lifecycle evidence.schemaVersion must be 1')
  if (evidence.classification !== 'automated-regression') {
    throw new TypeError('official lifecycle evidence.classification must be automated-regression')
  }
  if (evidence.acceptanceClaim !== false) throw new TypeError('official lifecycle evidence.acceptanceClaim must be false')
  if (!EVIDENCE_SCENARIOS.has(evidence.scenario)) throw new TypeError('official lifecycle evidence.scenario is unknown')
  isoTimestamp(evidence.recordedAt, 'official lifecycle evidence.recordedAt')
  if (!UUID_PATTERN.test(nonEmptyString(evidence.fixtureId, 'official lifecycle evidence.fixtureId'))) {
    throw new TypeError('official lifecycle evidence.fixtureId must be a UUID')
  }
  absolutePath(evidence.fixtureRoot, 'official lifecycle evidence.fixtureRoot')
  const artifact = exactKeys(evidence.artifact,
    ['packageName', 'packageVersion', 'sourcePath', 'stagedPath', 'sourceIdentity'], 'official lifecycle evidence.artifact')
  for (const key of ['packageName', 'packageVersion']) nonEmptyString(artifact[key], `official lifecycle evidence.artifact.${key}`)
  absolutePath(artifact.sourcePath, 'official lifecycle evidence.artifact.sourcePath')
  absolutePath(artifact.stagedPath, 'official lifecycle evidence.artifact.stagedPath')
  const sourceIdentity = parseOfficialCandidateSourceIdentity(artifact.sourceIdentity, {
    archivePath: artifact.sourcePath,
    packageName: artifact.packageName,
    packageVersion: artifact.packageVersion,
  })
  if (!Array.isArray(evidence.environments)) throw new TypeError('official lifecycle evidence.environments must be an array')
  const runIds = new Set()
  const labels = new Set()
  for (const [index, environment] of evidence.environments.entries()) {
    validateEnvironment(environment, index, sourceIdentity)
    if (runIds.has(environment.runId)) throw new TypeError('official lifecycle evidence.environments contains duplicate runId')
    if (labels.has(environment.label)) throw new TypeError('official lifecycle evidence.environments contains duplicate label')
    runIds.add(environment.runId)
    labels.add(environment.label)
  }
  if (evidence.parallelRequest === null) {
    if (evidence.scenario === 'a13-parallel-instances') {
      throw new TypeError('A13 parallel evidence requires a successful request from the remaining run')
    }
  } else {
    const request = exactKeys(evidence.parallelRequest, PARALLEL_REQUEST_KEYS, 'official lifecycle evidence.parallelRequest')
    if (!UUID_PATTERN.test(nonEmptyString(request.runId, 'official lifecycle evidence.parallelRequest.runId'))) {
      throw new TypeError('official lifecycle evidence.parallelRequest.runId must be a UUID')
    }
    for (const key of ['operation', 'result', 'sessionId', 'workspaceId']) {
      nonEmptyString(request[key], `official lifecycle evidence.parallelRequest.${key}`)
    }
    absolutePath(request.workspacePath, 'official lifecycle evidence.parallelRequest.workspacePath')
    absolutePath(request.cwd, 'official lifecycle evidence.parallelRequest.cwd')
    uniqueStrings(request.visibleSessionIds, 'official lifecycle evidence.parallelRequest.visibleSessionIds')
    if (request.ok !== true) throw new TypeError('official lifecycle evidence.parallelRequest.ok must be true')
    if (!runIds.has(request.runId)) throw new TypeError('official lifecycle evidence.parallelRequest.runId must identify an observed run')
  }
  validateScenarioEvidence(evidence)
  const cleanup = exactKeys(evidence.cleanup, ['allRunsStopped', 'allPortsReleased', 'verifiedAt'], 'official lifecycle evidence.cleanup')
  if (typeof cleanup.allRunsStopped !== 'boolean' || typeof cleanup.allPortsReleased !== 'boolean') {
    throw new TypeError('official lifecycle evidence.cleanup run and port states must be boolean')
  }
  isoTimestamp(cleanup.verifiedAt, 'official lifecycle evidence.cleanup.verifiedAt')
  if (cleanup.allRunsStopped && evidence.environments.some(environment => environment.cleanup?.processGroupMembers !== null)) {
    throw new TypeError('official lifecycle evidence.cleanup.allRunsStopped conflicts with an active process group')
  }
  if (cleanup.allPortsReleased && evidence.environments.some(environment => environment.cleanup?.portsReleased === false)) {
    throw new TypeError('official lifecycle evidence.cleanup.allPortsReleased conflicts with a retained port')
  }
  return evidence
}

function validateScenarioEvidence(evidence) {
  if (evidence.scenario === 'a13-parallel-instances') {
    const requiredLabels = ['left', 'right', 'left-restart', 'right-restart']
    if (evidence.environments.length !== requiredLabels.length
      || requiredLabels.some(label => !evidence.environments.some(environment => environment.label === label))) {
      throw new TypeError('A13 evidence must contain both original and restarted independent environments')
    }
    for (const environment of evidence.environments) {
      if (environment.install?.status !== 'installed' || environment.install.enabled !== true
        || typeof environment.install.restartRequired !== 'boolean' || environment.install.evidenceComplete !== true
        || environment.install.packageName !== evidence.artifact.packageName
        || environment.install.packageVersion !== evidence.artifact.packageVersion
        || environment.savedSetting === null || environment.processObservedDuringStart?.matchesRun !== true
        || environment.cleanup?.state !== 'stopped' || environment.cleanup.portsReleased !== true
        || environment.cleanup.processGroupMembers !== null) {
        throw new TypeError(`A13 environment ${environment.label} must record the installed bundle and saved settings`)
      }
    }
    const initialLeft = evidence.environments.find(environment => environment.label === 'left')
    const initialRight = evidence.environments.find(environment => environment.label === 'right')
    const restartedLeft = evidence.environments.find(environment => environment.label === 'left-restart')
    const restartedRight = evidence.environments.find(environment => environment.label === 'right-restart')
    for (const environment of [initialLeft, initialRight, restartedLeft, restartedRight]) {
      if (environment.session === null) {
        throw new TypeError(`A13 environment ${environment.label} must record its real Workspace and Session readback`)
      }
    }
    for (const environment of [initialLeft, initialRight]) {
      if (environment.session.title === null) {
        throw new TypeError(`A13 initial environment ${environment.label} must record the created Session title`)
      }
    }
    if (initialLeft.session.sessionId === initialRight.session.sessionId
      || initialLeft.session.workspaceId === initialRight.session.workspaceId) {
      throw new TypeError('A13 environments must use unique Session identities and Workspace identities')
    }
    if (initialLeft.session.visibleSessionIds.includes(initialRight.session.sessionId)
      || initialRight.session.visibleSessionIds.includes(initialLeft.session.sessionId)
      || restartedLeft.session.visibleSessionIds.includes(initialRight.session.sessionId)
      || restartedRight.session.visibleSessionIds.includes(initialLeft.session.sessionId)) {
      throw new TypeError('A13 environments must not expose the opposite Session identity')
    }
    if (initialLeft.savedSetting[browserSettings.fieldName] === initialRight.savedSetting[browserSettings.fieldName]) {
      throw new TypeError(`A13 independent environments must save different ${browserSettings.fieldName} values`)
    }
    for (const [initial, restarted, label] of [
      [initialLeft, restartedLeft, 'left'],
      [initialRight, restartedRight, 'right'],
    ]) {
      if (initial.savedSetting.entryId !== settingsEntryIds.core
        || restarted.savedSetting.entryId !== settingsEntryIds.core
        || initial.savedSetting[browserSettings.fieldName] !== restarted.savedSetting[browserSettings.fieldName]) {
        throw new TypeError(`A13 ${label} restart must preserve its saved browser executable setting`)
      }
    }
    const independentDirectories = ['home', 'dshHome', 'electronUserData', 'workspace', 'evidence', 'pluginInstallPath']
    for (const key of independentDirectories) {
      if (initialLeft.directories[key] === initialRight.directories[key]) {
        throw new TypeError(`A13 original environments must use different ${key} directories`)
      }
    }
    for (const [initial, restarted, label] of [
      [initialLeft, restartedLeft, 'left'],
      [initialRight, restartedRight, 'right'],
    ]) {
      for (const key of ['home', 'dshHome', 'electronUserData', 'workspace', 'pluginInstallPath']) {
        if (initial.directories[key] !== restarted.directories[key]) {
          throw new TypeError(`A13 ${label} restart must reuse its ${key} directory`)
        }
      }
    }
    for (const [first, second, pairLabel] of [
      [initialLeft, initialRight, 'original instances'],
      [restartedLeft, initialRight, 'left restart and remaining right instance'],
      [restartedLeft, restartedRight, 'restarted instances'],
    ]) {
      if (new Set([...Object.values(first.ports), ...Object.values(second.ports)]).size !== 6) {
        throw new TypeError(`A13 ${pairLabel} must use different OS ports`)
      }
    }
    for (const label of ['left-restart', 'right-restart']) {
      const environment = evidence.environments.find(candidate => candidate.label === label)
      if (environment.session === null || environment.pluginManagerRecord?.installed !== true
        || environment.pluginManagerRecord.enabled !== true
        || environment.pluginManagerRecord.name !== evidence.artifact.packageName
        || environment.pluginManagerRecord.version !== evidence.artifact.packageVersion) {
        throw new TypeError(`A13 environment ${label} must record a real Session and official plugin-manager bundle`)
      }
    }
    for (const [initial, restarted, label] of [
      [initialLeft, restartedLeft, 'left'],
      [initialRight, restartedRight, 'right'],
    ]) {
      if (initial.session.sessionId !== restarted.session.sessionId
        || initial.session.workspaceId !== restarted.session.workspaceId) {
        throw new TypeError(`A13 ${label} restart must read the same original Session identity`)
      }
    }
    if (evidence.parallelRequest.runId !== initialRight.runId) {
      throw new TypeError('A13 parallel request must identify the remaining right instance after stopping the left instance')
    }
    if (evidence.parallelRequest.operation !== lifecycleFixtureConfig.operations.hostReadOnlyRequestOperation) {
      throw new TypeError('A13 parallel request must record the configured Host Remote read-only operation')
    }
    const parallelRequest = evidence.parallelRequest
    let response
    try {
      response = JSON.parse(evidence.parallelRequest.result)
    } catch {
      throw new TypeError('A13 parallel request result must contain the successful session.list response as JSON')
    }
    if (response?.ok !== true || !Array.isArray(response.value?.items)) {
      throw new TypeError('A13 parallel request result must contain the successful session.list response as JSON')
    }
    const listedIds = response.value.items.map((item, index) => {
      record(item, `A13 session.list item ${index}`)
      nonEmptyString(item.sessionId, `A13 session.list item ${index}.sessionId`)
      return item.sessionId
    })
    uniqueStrings(listedIds, 'A13 session.list returned Session identities')
    const rightSession = initialRight.session
    if (parallelRequest.sessionId !== rightSession.sessionId
      || parallelRequest.workspaceId !== rightSession.workspaceId
      || parallelRequest.workspacePath !== initialRight.directories.workspace
      || parallelRequest.cwd !== initialRight.directories.workspace
      || !parallelRequest.visibleSessionIds.includes(rightSession.sessionId)
      || parallelRequest.visibleSessionIds.includes(initialLeft.session.sessionId)) {
      throw new TypeError('A13 parallel request must identify only the remaining right Session and Workspace')
    }
    if (JSON.stringify([...parallelRequest.visibleSessionIds].sort()) !== JSON.stringify([...listedIds].sort())) {
      throw new TypeError('A13 parallel request visibleSessionIds must match the Host session.list response')
    }
    const matchingSessions = response.value.items.filter(item => item.sessionId === rightSession.sessionId)
    if (matchingSessions.length !== 1 || matchingSessions[0].cwd !== rightSession.identityReadback.cwd
      || matchingSessions[0].projections?.values?.title !== rightSession.title
      || listedIds.includes(initialLeft.session.sessionId)) {
      throw new TypeError('A13 Host session.list must read the same remaining right Session and exclude the stopped left Session')
    }
    return
  }

  if (evidence.environments.length !== 1) {
    throw new TypeError(`A15 scenario ${evidence.scenario} must contain exactly one Desktop run`)
  }
  const [environment] = evidence.environments
  const expectedState = {
    'a15-successful-start-stop': 'stopped',
    'a15-start-failure': 'failed',
    'a15-cancel-after-launch': 'cancelled',
    'a15-startup-timeout': 'failed',
    'a15-port-conflict': 'failed',
    'a15-debug-retention': 'stopped',
  }[evidence.scenario]
  if (environment.state !== expectedState) {
    throw new TypeError(`A15 scenario ${evidence.scenario} must record a ${expectedState} lifecycle outcome`)
  }
  if (environment.cleanup?.portsReleased !== true || environment.cleanup.processGroupMembers !== null) {
    throw new TypeError(`A15 scenario ${evidence.scenario} must record completed process and port cleanup`)
  }
  if (evidence.scenario === 'a15-port-conflict') {
    if (environment.processObservedDuringStart !== null || !environment.failure?.startsWith('PORT_CONFLICT:')) {
      throw new TypeError('A15 port-conflict evidence must name PORT_CONFLICT and show no app process was spawned')
    }
    const configuredPorts = new Set(Object.values(environment.ports))
    if (!environment.portOwnersAtReady.some(observation => configuredPorts.has(observation.port) && observation.pids.length > 0)) {
      throw new TypeError('A15 port-conflict evidence must record the observed operating-system listener')
    }
  } else if (environment.processObservedDuringStart?.matchesRun !== true) {
    throw new TypeError(`A15 scenario ${evidence.scenario} must record the launched app process group`)
  }
  if (['a15-start-failure', 'a15-cancel-after-launch', 'a15-startup-timeout'].includes(evidence.scenario)
    && environment.failure === null) {
    throw new TypeError(`A15 scenario ${evidence.scenario} must record its failure or cancellation reason`)
  }
}

export function parseOfficialLifecycleDebugRetentionEvidence(value) {
  const evidence = exactKeys(value, DEBUG_RETENTION_KEYS, 'official lifecycle debug-retention evidence')
  if (evidence.schemaVersion !== 1) throw new TypeError('official lifecycle debug-retention evidence.schemaVersion must be 1')
  if (evidence.classification !== 'automated-regression') {
    throw new TypeError('official lifecycle debug-retention evidence.classification must be automated-regression')
  }
  if (evidence.acceptanceClaim !== false) {
    throw new TypeError('official lifecycle debug-retention evidence.acceptanceClaim must be false')
  }
  if (!UUID_PATTERN.test(nonEmptyString(evidence.runId, 'official lifecycle debug-retention evidence.runId'))) {
    throw new TypeError('official lifecycle debug-retention evidence.runId must be a UUID')
  }
  const application = exactKeys(evidence.application, ['bundlePath', 'executablePath', 'version', 'bundleId'], 'official lifecycle debug-retention evidence.application')
  absolutePath(application.bundlePath, 'official lifecycle debug-retention evidence.application.bundlePath')
  absolutePath(application.executablePath, 'official lifecycle debug-retention evidence.application.executablePath')
  if (!SEMVER_PATTERN.test(nonEmptyString(application.version, 'official lifecycle debug-retention evidence.application.version'))) {
    throw new TypeError('official lifecycle debug-retention evidence.application.version must be a semantic version')
  }
  nonEmptyString(application.bundleId, 'official lifecycle debug-retention evidence.application.bundleId')
  const process = exactKeys(evidence.process, ['pid', 'processGroupId'], 'official lifecycle debug-retention evidence.process')
  positiveInteger(process.pid, 'official lifecycle debug-retention evidence.process.pid')
  positiveInteger(process.processGroupId, 'official lifecycle debug-retention evidence.process.processGroupId')
  const ports = exactKeys(evidence.ports, PORT_KEYS, 'official lifecycle debug-retention evidence.ports')
  for (const [key, port] of Object.entries(ports)) positiveInteger(port, `official lifecycle debug-retention evidence.ports.${key}`, 65_535)
  if (new Set(Object.values(ports)).size !== Object.keys(ports).length) {
    throw new TypeError('official lifecycle debug-retention evidence.ports must be distinct')
  }
  absolutePath(evidence.evidenceDirectory, 'official lifecycle debug-retention evidence.evidenceDirectory')
  if (evidence.stopMethod !== 'stopProbe({ runId, repositoryRoot, config })') {
    throw new TypeError('official lifecycle debug-retention evidence.stopMethod must name the public stopProbe method')
  }
  const invocation = exactKeys(evidence.stopInvocation, ['runId', 'repositoryRoot', 'configPath'], 'official lifecycle debug-retention evidence.stopInvocation')
  if (invocation.runId !== evidence.runId) throw new TypeError('official lifecycle debug-retention evidence.stopInvocation.runId must match runId')
  absolutePath(invocation.repositoryRoot, 'official lifecycle debug-retention evidence.stopInvocation.repositoryRoot')
  if (invocation.configPath !== 'config/desktop-e2e.json') {
    throw new TypeError('official lifecycle debug-retention evidence.stopInvocation.configPath must name config/desktop-e2e.json')
  }
  nonEmptyString(evidence.configuredProfile, 'official lifecycle debug-retention evidence.configuredProfile')
  isoTimestamp(evidence.retainedAt, 'official lifecycle debug-retention evidence.retainedAt')
  return evidence
}

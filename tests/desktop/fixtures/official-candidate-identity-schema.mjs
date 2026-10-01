import runtimeArtifacts from '../../../config/runtime-artifacts.json' with { type: 'json' }
import pluginPackageConfig from '../../../config/plugin-package.json' with { type: 'json' }
import lifecycleFixture from './official-lifecycle-fixture.json' with { type: 'json' }

const SOURCE_IDENTITY_KEYS = ['schemaVersion', 'packageName', 'packageVersion', 'archivePath', 'sourceCommit', 'dirty', 'runtimeFiles']
const COMPARISON_KEYS = ['relativePath', 'matchesCandidate']
const CLIENT_SOURCE_EVIDENCE_KEYS = [
  'schemaVersion', 'packageName', 'packageVersion', 'scriptId', 'scriptUrl', 'revision', 'sourceMapUrl', 'expectedSourceMapUrl',
  'moduleRoutes', 'candidateModuleIndex', 'sourceMapSectionCount', 'modulePositions',
  'sectionOffsetLine', 'sectionOffsetColumn', 'matchesCandidate',
  'expectedScriptFilename', 'actualScriptFilename', 'comboScriptFilename', 'sourceMapFilename',
]
const CLIENT_SOURCE_RESULT_KEYS = [
  'scriptId', 'scriptUrl', 'sourceMapUrl', 'moduleRoutes', 'candidateModuleIndex',
  'sectionOffsetLine', 'sectionOffsetColumn', 'matchesCandidate',
]
const CLIENT_MODULE_POSITION_KEYS = ['moduleRoute', 'offsetLine', 'offsetColumn']
const GIT_COMMIT_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u
const CANDIDATE_PACKAGE_ROOTS = [...pluginPackageConfig.files, ...pluginPackageConfig.artifacts]
const CLIENT_SCRIPT_CONFIG = lifecycleFixture.operations.candidateClientScript

function collectRuntimeArtifactPaths(value, paths = []) {
  if (Array.isArray(value)) {
    for (const child of value) collectRuntimeArtifactPaths(child, paths)
    return paths
  }
  if (value === null || typeof value !== 'object') return paths
  if (typeof value.outputEntryRelativePath === 'string') {
    paths.push(value.outputEntryRelativePath)
    return paths
  }
  for (const child of Object.values(value)) collectRuntimeArtifactPaths(child, paths)
  return paths
}

export const OFFICIAL_CANDIDATE_RUNTIME_PATHS = Object.freeze([...new Set(collectRuntimeArtifactPaths(runtimeArtifacts))].sort())

function record(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`)
  return value
}

function exactKeys(value, keys, label) {
  record(value, label)
  const unexpected = Object.keys(value).filter(key => !keys.includes(key))
  const missing = keys.filter(key => !Object.hasOwn(value, key))
  if (unexpected.length || missing.length) {
    throw new TypeError(`${label} must contain exactly ${keys.join(', ')}${missing.length ? `; missing ${missing.join(', ')}` : ''}${unexpected.length ? `; unexpected ${unexpected.join(', ')}` : ''}`)
  }
  return value
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} must be a non-empty string`)
  return value
}

function isCandidatePackagePath(path) {
  return CANDIDATE_PACKAGE_ROOTS.some(root => path === root || path.startsWith(`${root}/`))
}

export function parseOfficialCandidateSourceIdentity(value, expected = {}) {
  const identity = exactKeys(value, SOURCE_IDENTITY_KEYS, 'official candidate source identity')
  if (identity.schemaVersion !== 1) throw new TypeError('official candidate source identity.schemaVersion must be 1')
  nonEmptyString(identity.packageName, 'official candidate source identity.packageName')
  if (identity.packageName !== pluginPackageConfig.packageName) {
    throw new TypeError('official candidate source identity.packageName must match config/plugin-package.json')
  }
  if (!SEMVER_PATTERN.test(nonEmptyString(identity.packageVersion, 'official candidate source identity.packageVersion'))) {
    throw new TypeError('official candidate source identity.packageVersion must be a semantic version')
  }
  nonEmptyString(identity.archivePath, 'official candidate source identity.archivePath')
  if (!identity.archivePath.startsWith('/') || identity.archivePath.includes('\0')) {
    throw new TypeError('official candidate source identity.archivePath must be absolute')
  }
  if (!GIT_COMMIT_PATTERN.test(identity.sourceCommit)) {
    throw new TypeError('official candidate source identity.sourceCommit must be a full Git commit')
  }
  if (typeof identity.dirty !== 'boolean') throw new TypeError('official candidate source identity.dirty must be boolean')
  if (!Array.isArray(identity.runtimeFiles) || identity.runtimeFiles.length === 0
    || identity.runtimeFiles.some(path => typeof path !== 'string' || path.trim() === ''
      || path.split('/').some(segment => segment === '' || segment === '.' || segment === '..')
      || !isCandidatePackagePath(path))
    || new Set(identity.runtimeFiles).size !== identity.runtimeFiles.length) {
    throw new TypeError('official candidate source identity.runtimeFiles must uniquely list configured package files and runtime artifacts')
  }
  if (identity.runtimeFiles.some((path, index, paths) => index > 0 && paths[index - 1] > path)) {
    throw new TypeError('official candidate source identity.runtimeFiles must be sorted')
  }
  const runtimeFiles = new Set(identity.runtimeFiles)
  if (OFFICIAL_CANDIDATE_RUNTIME_PATHS.some(path => !runtimeFiles.has(path))) {
    throw new TypeError('official candidate source identity.runtimeFiles must include every config/runtime-artifacts.json output')
  }
  for (const key of ['archivePath', 'packageName', 'packageVersion']) {
    if (expected[key] !== undefined && identity[key] !== expected[key]) {
      throw new TypeError(`official candidate source identity.${key} does not match the runner candidate`)
    }
  }
  return identity
}

export function parseOfficialCandidateComparisons(value, sourceIdentity, label = 'candidate byte comparisons') {
  const identity = parseOfficialCandidateSourceIdentity(sourceIdentity)
  if (!Array.isArray(value) || value.length !== identity.runtimeFiles.length) {
    throw new TypeError(`${label} must compare every fixed candidate runtime file`)
  }
  const comparisons = value.map((item, index) => {
    const comparison = exactKeys(item, COMPARISON_KEYS, `${label}[${index}]`)
    nonEmptyString(comparison.relativePath, `${label}[${index}].relativePath`)
    if (comparison.relativePath !== identity.runtimeFiles[index]) {
      throw new TypeError(`${label} must preserve the candidate runtime file order and identity`)
    }
    if (comparison.matchesCandidate !== true) throw new TypeError(`${label}[${index}] must match candidate bytes exactly`)
    return comparison
  })
  return comparisons
}

export function parseOfficialCandidateClientComboRoute(scriptUrl, packageName) {
  const config = CLIENT_SCRIPT_CONFIG
  if (typeof scriptUrl !== 'string' || !scriptUrl.startsWith(config.scriptUrlPrefix)) {
    throw new TypeError('loaded candidate Client scriptUrl must use the verified dsh-app combo route')
  }
  const routeAndRevision = scriptUrl.slice(config.scriptUrlPrefix.length)
  const revisionIndex = routeAndRevision.lastIndexOf(config.revisionQueryPrefix)
  if (revisionIndex < 1 || routeAndRevision.indexOf(config.revisionQueryPrefix) !== revisionIndex) {
    throw new TypeError('loaded candidate Client scriptUrl must contain one combo revision marker')
  }
  const routesText = routeAndRevision.slice(0, revisionIndex)
  const revision = routeAndRevision.slice(revisionIndex + config.revisionQueryPrefix.length)
  if (!new RegExp(config.revisionPattern, 'u').test(revision)) {
    throw new TypeError('loaded candidate Client combo revision does not match the configured route revision')
  }
  const moduleRoutes = routesText.split(',')
  const routePattern = new RegExp(config.moduleRoutePattern, 'u')
  if (moduleRoutes.length === 0 || moduleRoutes.some(route => !routePattern.test(route))
    || new Set(moduleRoutes).size !== moduleRoutes.length) {
    throw new TypeError('loaded candidate Client combo route must contain unique verified official module routes')
  }
  const clientFilename = runtimeArtifacts.client.outputEntryRelativePath.split('/').at(-1)
  const candidateRoute = `${packageName}/${clientFilename}`
  const candidateIndexes = moduleRoutes.flatMap((route, index) => route === candidateRoute ? [index] : [])
  if (candidateIndexes.length !== 1
    || (config.candidateModuleMustBeLast && candidateIndexes[0] !== moduleRoutes.length - 1)) {
    throw new TypeError('loaded candidate Client combo route must contain its unique candidate module last')
  }
  return {
    revision,
    moduleRoutes,
    candidateModuleIndex: candidateIndexes[0],
  }
}

export function buildOfficialCandidateClientSourceMapUrl(scriptUrl, packageName) {
  const route = parseOfficialCandidateClientComboRoute(scriptUrl, packageName)
  const sourceMapRoutes = route.moduleRoutes.map(moduleRoute => moduleRoute.replace('/client.js', `/client.js${CLIENT_SCRIPT_CONFIG.moduleMapSuffix}`))
  return `${CLIENT_SCRIPT_CONFIG.sourceMapUrlPrefix}${sourceMapRoutes.join(',')}${CLIENT_SCRIPT_CONFIG.revisionQueryPrefix}${route.revision}`
}

export function parseOfficialCandidateClientSourceResult(value, sourceIdentityValue) {
  const result = exactKeys(value, CLIENT_SOURCE_RESULT_KEYS, 'official candidate Client source result')
  const sourceIdentity = parseOfficialCandidateSourceIdentity(sourceIdentityValue)
  if (!/^[A-Za-z0-9_-]+$/u.test(nonEmptyString(result.scriptId, 'official candidate Client source result.scriptId'))) {
    throw new TypeError('official candidate Client source result.scriptId must be a safe DevTools filename token')
  }
  const route = parseOfficialCandidateClientComboRoute(result.scriptUrl, sourceIdentity.packageName)
  const expectedSourceMapUrl = buildOfficialCandidateClientSourceMapUrl(result.scriptUrl, sourceIdentity.packageName)
  if (result.sourceMapUrl !== expectedSourceMapUrl) {
    throw new TypeError('official candidate Client source result.sourceMapUrl must match the candidate combo modules and revision')
  }
  if (!Array.isArray(result.moduleRoutes)
    || JSON.stringify(result.moduleRoutes) !== JSON.stringify(route.moduleRoutes)
    || result.candidateModuleIndex !== route.candidateModuleIndex) {
    throw new TypeError('official candidate Client source result must preserve the verified combo route identity')
  }
  for (const key of ['sectionOffsetLine', 'sectionOffsetColumn']) {
    if (!Number.isSafeInteger(result[key]) || result[key] < 0) {
      throw new TypeError(`official candidate Client source result.${key} must be a non-negative integer`)
    }
  }
  if (result.sectionOffsetColumn !== 0) {
    throw new TypeError('official candidate Client source result.sectionOffsetColumn must be zero')
  }
  if (result.matchesCandidate !== true) {
    throw new TypeError('official candidate Client source result must match the fixed candidate bytes')
  }
  return result
}

export function parseOfficialCandidateClientSourceEvidence(value) {
  const evidence = exactKeys(value, CLIENT_SOURCE_EVIDENCE_KEYS, 'official candidate Client source evidence')
  if (evidence.schemaVersion !== 1) throw new TypeError('official candidate Client source evidence.schemaVersion must be 1')
  if (evidence.packageName !== pluginPackageConfig.packageName) {
    throw new TypeError('official candidate Client source evidence.packageName must match config/plugin-package.json')
  }
  if (!SEMVER_PATTERN.test(nonEmptyString(evidence.packageVersion, 'official candidate Client source evidence.packageVersion'))) {
    throw new TypeError('official candidate Client source evidence.packageVersion must be a semantic version')
  }
  if (!/^[A-Za-z0-9_-]+$/u.test(nonEmptyString(evidence.scriptId, 'official candidate Client source evidence.scriptId'))) {
    throw new TypeError('official candidate Client source evidence.scriptId must be a safe DevTools filename token')
  }
  const route = parseOfficialCandidateClientComboRoute(evidence.scriptUrl, evidence.packageName)
  if (evidence.revision !== route.revision
    || !Array.isArray(evidence.moduleRoutes)
    || JSON.stringify(evidence.moduleRoutes) !== JSON.stringify(route.moduleRoutes)
    || evidence.candidateModuleIndex !== route.candidateModuleIndex) {
    throw new TypeError('official candidate Client source evidence must preserve the verified combo route identity')
  }
  if (typeof evidence.sourceMapUrl !== 'string' || evidence.sourceMapUrl.trim() === '') {
    throw new TypeError('official candidate Client source evidence.sourceMapUrl must be a non-empty string')
  }
  const expectedSourceMapUrl = buildOfficialCandidateClientSourceMapUrl(evidence.scriptUrl, evidence.packageName)
  if (evidence.expectedSourceMapUrl !== expectedSourceMapUrl) {
    throw new TypeError('official candidate Client source evidence.expectedSourceMapUrl must match the combo route revision and modules')
  }
  if (evidence.matchesCandidate && evidence.sourceMapUrl !== expectedSourceMapUrl) {
    throw new TypeError('matching official candidate Client source evidence must use its expected sourceMapUrl')
  }
  if (evidence.sourceMapSectionCount !== null
    && (!Number.isSafeInteger(evidence.sourceMapSectionCount) || evidence.sourceMapSectionCount < 0)) {
    throw new TypeError('official candidate Client source evidence.sourceMapSectionCount must be a non-negative integer or null')
  }
  if (!Array.isArray(evidence.modulePositions) || evidence.modulePositions.length !== route.moduleRoutes.length) {
    throw new TypeError('official candidate Client source evidence.modulePositions must match the combo module count')
  }
  const modulePositions = evidence.modulePositions.map((position, index) => {
    exactKeys(position, CLIENT_MODULE_POSITION_KEYS, `official candidate Client source evidence.modulePositions[${index}]`)
    if (position.moduleRoute !== route.moduleRoutes[index]) {
      throw new TypeError('official candidate Client source evidence.modulePositions must preserve module route order')
    }
    for (const field of ['offsetLine', 'offsetColumn']) {
      if (position[field] !== null && (!Number.isSafeInteger(position[field]) || position[field] < 0)) {
        throw new TypeError(`official candidate Client source evidence.modulePositions[${index}].${field} must be a non-negative integer or null`)
      }
    }
    return position
  })
  const candidatePosition = modulePositions[route.candidateModuleIndex]
  if (evidence.sectionOffsetLine !== candidatePosition.offsetLine
    || evidence.sectionOffsetColumn !== candidatePosition.offsetColumn) {
    throw new TypeError('official candidate Client source evidence section offset must match the candidate module position')
  }
  if (typeof evidence.matchesCandidate !== 'boolean') {
    throw new TypeError('official candidate Client source evidence.matchesCandidate must be boolean')
  }
  if (evidence.matchesCandidate
    && (evidence.sourceMapSectionCount !== route.moduleRoutes.length
      || modulePositions.some(position => position.offsetLine === null || position.offsetColumn !== 0)
      || modulePositions[0].offsetLine !== 0
      || modulePositions.some((position, index) => index > 0 && position.offsetLine <= modulePositions[index - 1].offsetLine))) {
    throw new TypeError('matching official candidate Client evidence must contain ordered column-0 positions for every combo section')
  }
  const expectedFilename = CLIENT_SCRIPT_CONFIG.evidenceFilenameTemplate
    .replace('{scriptId}', evidence.scriptId)
    .replace('{kind}', 'expected')
  const actualFilename = CLIENT_SCRIPT_CONFIG.evidenceFilenameTemplate
    .replace('{scriptId}', evidence.scriptId)
    .replace('{kind}', 'actual')
  if (evidence.expectedScriptFilename !== expectedFilename || evidence.actualScriptFilename !== actualFilename) {
    throw new TypeError('official candidate Client source evidence filenames must follow the configured evidence template')
  }
  const expectedComboFilename = CLIENT_SCRIPT_CONFIG.evidenceFilenameTemplate
    .replace('{scriptId}', evidence.scriptId)
    .replace('{kind}', 'combo')
  const expectedSourceMapFilename = CLIENT_SCRIPT_CONFIG.sourceMapEvidenceFilenameTemplate
    .replace('{scriptId}', evidence.scriptId)
  if (evidence.comboScriptFilename !== expectedComboFilename || evidence.sourceMapFilename !== expectedSourceMapFilename) {
    throw new TypeError('official candidate Client combo and source-map evidence filenames must follow configured templates')
  }
  const recordFilename = CLIENT_SCRIPT_CONFIG.evidenceRecordFilenameTemplate.replace('{scriptId}', evidence.scriptId)
  if (!/^[A-Za-z0-9._-]+$/u.test(recordFilename)) {
    throw new TypeError('official candidate Client source evidence record filename must be safe')
  }
  return evidence
}

import { execFile } from 'node:child_process'
import { mkdir, open, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'

import pluginPackageConfig from '../../../config/plugin-package.json' with { type: 'json' }
import runtimeArtifacts from '../../../config/runtime-artifacts.json' with { type: 'json' }
import lifecycleFixtureJson from './official-lifecycle-fixture.json' with { type: 'json' }
import { parseOfficialLifecycleFixture } from './official-lifecycle-schema.mjs'
import {
  OFFICIAL_CANDIDATE_RUNTIME_PATHS,
  buildOfficialCandidateClientSourceMapUrl,
  parseOfficialCandidateClientComboRoute,
  parseOfficialCandidateClientSourceEvidence,
  parseOfficialCandidateSourceIdentity,
} from './official-candidate-identity-schema.mjs'

const execFileAsync = promisify(execFile)
const TAR_MAX_BUFFER = 128 * 1024 * 1024
const lifecycleFixture = parseOfficialLifecycleFixture(lifecycleFixtureJson)
const candidateClientScript = lifecycleFixture.operations.candidateClientScript

export async function writeOfficialCandidateSourceIdentity({
  repositoryRoot,
  archivePath,
  identityPath,
  packageName,
  packageVersion,
} = {}) {
  for (const [label, path] of Object.entries({ repositoryRoot, archivePath, identityPath })) {
    if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) {
      throw new TypeError(`candidate identity ${label} must be an absolute path`)
    }
  }
  const archiveStat = await stat(archivePath)
  if (!archiveStat.isFile()) throw new TypeError('candidate identity archivePath must identify a regular tarball')
  const [commitResult, statusResult, runtimeFiles] = await Promise.all([
    execFileAsync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }),
    execFileAsync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: repositoryRoot, encoding: 'utf8' }),
    listCandidateRuntimeFiles(archivePath),
  ])
  const identity = parseOfficialCandidateSourceIdentity({
    schemaVersion: 1,
    packageName,
    packageVersion,
    archivePath,
    sourceCommit: commitResult.stdout.trim(),
    dirty: statusResult.stdout.length > 0,
    runtimeFiles,
  }, { archivePath, packageName, packageVersion })
  await mkdir(dirname(identityPath), { recursive: true, mode: 0o700 })
  const handle = await open(identityPath, 'wx', 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(identity, null, 2)}\n`, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  return identity
}

export async function compareOfficialCandidateFiles({ sourceIdentity: sourceIdentityValue, installedPackageRoot } = {}) {
  const sourceIdentity = parseOfficialCandidateSourceIdentity(sourceIdentityValue)
  if (typeof installedPackageRoot !== 'string' || !isAbsolute(installedPackageRoot) || installedPackageRoot.includes('\0')) {
    throw new TypeError('installed candidate package root must be an absolute path')
  }
  const archiveRuntimeFiles = await listCandidateRuntimeFiles(sourceIdentity.archivePath)
  if (JSON.stringify(archiveRuntimeFiles) !== JSON.stringify(sourceIdentity.runtimeFiles)) {
    throw new Error('fixed candidate tarball runtime file list differs from its source identity record')
  }

  const comparisons = []
  for (const relativePath of sourceIdentity.runtimeFiles) {
    const candidateBytes = await readTarballEntry(sourceIdentity.archivePath, `package/${relativePath}`)
    const installedBytes = await readFile(join(installedPackageRoot, relativePath))
    if (!candidateBytes.equals(installedBytes)) {
      throw new Error(`Installed ${relativePath} bytes differ from the fixed candidate`)
    }
    comparisons.push({ relativePath, matchesCandidate: true })
  }
  return comparisons
}

export async function assertOfficialCandidateClientSource({
  sourceIdentity: sourceIdentityValue,
  scriptId,
  scriptUrl,
  sourceMapUrl,
  scriptSource,
  sourceMapText,
  evidenceDirectory,
} = {}) {
  const sourceIdentity = parseOfficialCandidateSourceIdentity(sourceIdentityValue)
  if (typeof scriptId !== 'string' || scriptId.trim() === '') {
    throw new TypeError('loaded candidate Client scriptId must be a non-empty string')
  }
  if (typeof scriptUrl !== 'string' || scriptUrl.trim() === '') {
    throw new TypeError('loaded candidate Client scriptUrl must be a non-empty string')
  }
  if (typeof sourceMapUrl !== 'string' || sourceMapUrl.trim() === '') {
    throw new TypeError('loaded candidate Client sourceMapURL must be a non-empty string')
  }
  if (!/^[A-Za-z0-9_-]+$/u.test(scriptId)) {
    throw new TypeError('loaded candidate Client scriptId must be a safe DevTools filename token')
  }
  if (typeof scriptSource !== 'string') throw new TypeError('loaded candidate Client scriptSource must be a string')
  if (typeof sourceMapText !== 'string') throw new TypeError('loaded candidate Client source map text must be a string')
  if (typeof evidenceDirectory !== 'string' || !isAbsolute(evidenceDirectory) || evidenceDirectory.includes('\0')) {
    throw new TypeError('loaded candidate Client evidenceDirectory must be an absolute run evidence directory')
  }
  const route = parseOfficialCandidateClientComboRoute(scriptUrl, sourceIdentity.packageName)
  const expected = await buildOfficialCandidateClientFragment({ sourceIdentity, scriptUrl })
  const clientPath = runtimeArtifacts.client.outputEntryRelativePath
  if (!sourceIdentity.runtimeFiles.includes(clientPath)) throw new Error('fixed candidate source identity does not include the configured Client runtime file')
  const actualComboScript = Buffer.from(scriptSource, 'utf8')
  const actualSourceMapExpectedUrl = buildOfficialCandidateClientSourceMapUrl(scriptUrl, sourceIdentity.packageName)
  const mapInspection = inspectOfficialComboSourceMap(sourceMapText, route.moduleRoutes)
  const modulePositions = mapInspection.modulePositions
  const candidatePosition = modulePositions[route.candidateModuleIndex]
  let actualCandidateFragment = Buffer.alloc(0)
  let validationError = null
  if (sourceMapUrl !== expected.sourceMapUrl) {
    validationError = new Error('Loaded Renderer Client source-map URL does not match the exact combo modules and revision')
  } else if (mapInspection.error !== null) {
    validationError = mapInspection.error
  } else {
    try {
      const candidateStart = byteOffsetForLine(actualComboScript, candidatePosition.offsetLine)
      const expectedTrailer = Buffer.from(
        candidateClientScript.sourceMapTrailerTemplate.replace('{sourceMapUrl}', sourceMapUrl),
        'utf8',
      )
      const hasTrailer = actualComboScript.length >= expectedTrailer.length
        && actualComboScript.subarray(actualComboScript.length - expectedTrailer.length).equals(expectedTrailer)
      if (hasTrailer) {
        actualCandidateFragment = actualComboScript.subarray(candidateStart, actualComboScript.length - expectedTrailer.length)
      } else {
        actualCandidateFragment = actualComboScript.subarray(candidateStart)
        validationError = new Error('Loaded official combo script does not end with its exact source-map trailer')
      }
      if (candidateStart > actualComboScript.length || candidateStart > actualComboScript.length - (hasTrailer ? expectedTrailer.length : 0)) {
        validationError ??= new Error('Candidate source-map section line offset falls outside the loaded combo script')
        actualCandidateFragment = Buffer.alloc(0)
      }
    } catch (error) {
      validationError = error
    }
  }
  const matchesCandidate = validationError === null && expected.fragment.equals(actualCandidateFragment)
  const expectedScriptFilename = evidenceFilename(scriptId, 'expected')
  const actualScriptFilename = evidenceFilename(scriptId, 'actual')
  const comboScriptFilename = evidenceFilename(scriptId, 'combo')
  const sourceMapFilename = candidateClientScript.sourceMapEvidenceFilenameTemplate.replace('{scriptId}', scriptId)
  const sourceEvidence = parseOfficialCandidateClientSourceEvidence({
    schemaVersion: 1,
    packageName: sourceIdentity.packageName,
    packageVersion: sourceIdentity.packageVersion,
    scriptId,
    scriptUrl,
    revision: route.revision,
    sourceMapUrl,
    expectedSourceMapUrl: actualSourceMapExpectedUrl,
    moduleRoutes: route.moduleRoutes,
    candidateModuleIndex: route.candidateModuleIndex,
    sourceMapSectionCount: mapInspection.sectionCount,
    modulePositions,
    sectionOffsetLine: candidatePosition.offsetLine,
    sectionOffsetColumn: candidatePosition.offsetColumn,
    matchesCandidate,
    expectedScriptFilename,
    actualScriptFilename,
    comboScriptFilename,
    sourceMapFilename,
  })
  const recordFilename = candidateClientScript.evidenceRecordFilenameTemplate.replace('{scriptId}', scriptId)
  await writeFile(join(evidenceDirectory, expectedScriptFilename), expected.fragment, { flag: 'wx', mode: 0o600 })
  await writeFile(join(evidenceDirectory, actualScriptFilename), actualCandidateFragment, { flag: 'wx', mode: 0o600 })
  await writeFile(join(evidenceDirectory, comboScriptFilename), actualComboScript, { flag: 'wx', mode: 0o600 })
  await writeFile(join(evidenceDirectory, sourceMapFilename), sourceMapText, { flag: 'wx', mode: 0o600 })
  await writeFile(join(evidenceDirectory, recordFilename), `${JSON.stringify(sourceEvidence, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  if (validationError !== null) {
    throw new Error(`${validationError.message}; evidence: ${join(evidenceDirectory, recordFilename)}`, { cause: validationError })
  }
  if (!matchesCandidate) {
    throw new Error('Loaded Renderer Client candidate fragment bytes differ from the exact fixed candidate; evidence: '
      + join(evidenceDirectory, recordFilename))
  }
  return {
    scriptId,
    scriptUrl,
    sourceMapUrl,
    moduleRoutes: route.moduleRoutes,
    candidateModuleIndex: route.candidateModuleIndex,
    sectionOffsetLine: candidatePosition.offsetLine,
    sectionOffsetColumn: candidatePosition.offsetColumn,
    matchesCandidate: true,
  }
}

export async function buildOfficialCandidateClientFragment({ sourceIdentity: sourceIdentityValue, scriptUrl, sourceMapUrl } = {}) {
  const sourceIdentity = parseOfficialCandidateSourceIdentity(sourceIdentityValue)
  const route = parseOfficialCandidateClientComboRoute(scriptUrl, sourceIdentity.packageName)
  const expectedSourceMapUrl = buildOfficialCandidateClientSourceMapUrl(scriptUrl, sourceIdentity.packageName)
  if (sourceMapUrl !== undefined && sourceMapUrl !== expectedSourceMapUrl) {
    throw new Error('Loaded Renderer Client source-map URL must identify the same combo modules and revision')
  }
  const clientPath = runtimeArtifacts.client.outputEntryRelativePath
  if (!sourceIdentity.runtimeFiles.includes(clientPath)) {
    throw new Error('fixed candidate source identity does not include the configured Client runtime file')
  }
  const candidateBytes = await readTarballEntry(sourceIdentity.archivePath, `package/${clientPath}`)
  let source = candidateBytes.toString('utf8')
  if (!Buffer.from(source, 'utf8').equals(candidateBytes)) throw new Error('Fixed candidate Client bundle is not valid UTF-8')
  source = removeTrailingDirective(source, candidateClientScript.sourceUrlDirectivePrefix, candidateClientScript.sourceUrlDirectiveValuePattern)
  const sourceMapDirectivePrefix = candidateClientScript.sourceMapTrailerTemplate.split('{sourceMapUrl}')[0]
  source = removeTrailingDirective(source, sourceMapDirectivePrefix, candidateClientScript.sourceMapDirectiveValuePattern)
  if (!source.endsWith('\n')) source += '\n'
  return {
    revision: route.revision,
    sourceMapUrl: expectedSourceMapUrl,
    moduleRoutes: route.moduleRoutes,
    candidateModuleIndex: route.candidateModuleIndex,
    fragment: Buffer.from(source + candidateClientScript.moduleSeparator, 'utf8'),
  }
}

export function isOfficialCandidateClientScriptUrl(scriptUrl, sourceIdentityValue) {
  try {
    const sourceIdentity = parseOfficialCandidateSourceIdentity(sourceIdentityValue)
    parseOfficialCandidateClientComboRoute(scriptUrl, sourceIdentity.packageName)
    return true
  } catch {
    return false
  }
}

export async function readOfficialCandidateClientSourceMap({ page, sourceIdentity: sourceIdentityValue, scriptUrl, sourceMapUrl } = {}) {
  if (!page || typeof page.evaluate !== 'function') throw new TypeError('candidate source-map fetch requires a connected Renderer page')
  const sourceIdentity = parseOfficialCandidateSourceIdentity(sourceIdentityValue)
  const expectedSourceMapUrl = buildOfficialCandidateClientSourceMapUrl(scriptUrl, sourceIdentity.packageName)
  if (sourceMapUrl !== expectedSourceMapUrl) {
    throw new Error('Debugger.scriptParsed sourceMapURL does not match the exact candidate combo route')
  }
  const requestUrl = candidateClientScript.sourceMapRequestPrefix + expectedSourceMapUrl
  const result = await page.evaluate(`(async () => {
    const response = await fetch(${JSON.stringify(requestUrl)}, { redirect: 'error' })
    if (!response.ok || response.redirected || response.url !== ${JSON.stringify(requestUrl)}) {
      throw new Error('Official candidate source map fetch did not return the exact requested URL')
    }
    return { url: response.url, sourceMapText: await response.text() }
  })()`)
  if (result?.url !== requestUrl || typeof result.sourceMapText !== 'string') {
    throw new Error('Official candidate source map fetch returned an invalid response record')
  }
  return result.sourceMapText
}

function evidenceFilename(scriptId, kind) {
  return candidateClientScript.evidenceFilenameTemplate.replace('{scriptId}', scriptId).replace('{kind}', kind)
}

function inspectOfficialComboSourceMap(sourceMapText, moduleRoutes) {
  const modulePositions = moduleRoutes.map(moduleRoute => ({ moduleRoute, offsetLine: null, offsetColumn: null }))
  let sourceMap
  try {
    sourceMap = JSON.parse(sourceMapText)
  } catch (error) {
    return { sectionCount: null, modulePositions, error: new Error('Official combo source map is not valid JSON', { cause: error }) }
  }
  if (sourceMap === null || typeof sourceMap !== 'object' || Array.isArray(sourceMap) || sourceMap.version !== 3
    || !Array.isArray(sourceMap.sections)) {
    return { sectionCount: null, modulePositions, error: new TypeError('Official combo source map must be an indexed version 3 map') }
  }
  const sections = sourceMap.sections
  for (let index = 0; index < Math.min(sections.length, moduleRoutes.length); index += 1) {
    const offset = sections[index]?.offset
    modulePositions[index] = {
      moduleRoute: moduleRoutes[index],
      offsetLine: Number.isSafeInteger(offset?.line) && offset.line >= 0 ? offset.line : null,
      offsetColumn: Number.isSafeInteger(offset?.column) && offset.column >= 0 ? offset.column : null,
    }
  }
  if (sections.length !== moduleRoutes.length) {
    return {
      sectionCount: sections.length,
      modulePositions,
      error: new Error('Official combo source-map section count does not match its module route count'),
    }
  }
  let priorLine = -1
  for (const [index, section] of sections.entries()) {
    if (section === null || typeof section !== 'object' || Array.isArray(section)
      || section.map === null || typeof section.map !== 'object' || Array.isArray(section.map)
      || section.map.version !== 3) {
      return { sectionCount: sections.length, modulePositions, error: new TypeError(`Official combo source-map section ${index} must contain an embedded version 3 map`) }
    }
    const { line, column } = section.offset ?? {}
    if (!Number.isSafeInteger(line) || line < 0 || !Number.isSafeInteger(column) || column !== 0) {
      return { sectionCount: sections.length, modulePositions, error: new Error(`Official combo source-map section ${index} offset must use column 0`) }
    }
    if ((index === 0 && line !== 0) || line <= priorLine) {
      return { sectionCount: sections.length, modulePositions, error: new Error('Official combo source-map line offsets must start at 0 and strictly follow module order') }
    }
    priorLine = line
  }
  return { sectionCount: sections.length, modulePositions, error: null }
}

function byteOffsetForLine(source, targetLine) {
  if (!Number.isSafeInteger(targetLine) || targetLine < 0) throw new TypeError('candidate source-map line offset must be a non-negative integer')
  if (targetLine === 0) return 0
  let line = 0
  for (let offset = 0; offset < source.length; offset += 1) {
    if (source[offset] === 0x0a) {
      line += 1
      if (line === targetLine) return offset + 1
    }
  }
  throw new Error('Candidate source-map section line offset falls outside the loaded combo script')
}

function removeTrailingDirective(source, directivePrefix, valuePattern) {
  const pattern = '(?:\\r?\\n)?' + directivePrefix + '[^\\r\\n]' + valuePattern + '(?:\\r?\\n)?$'
  return source.replace(new RegExp(pattern, 'u'), '')
}

async function listCandidateRuntimeFiles(archivePath) {
  const { stdout } = await execFileAsync('tar', ['-tzf', archivePath], { encoding: 'utf8', maxBuffer: TAR_MAX_BUFFER })
  const roots = [...pluginPackageConfig.files, ...pluginPackageConfig.artifacts]
  const files = new Set()
  for (const member of stdout.split(/\r?\n/u)) {
    if (!member.startsWith('package/') || member.endsWith('/')) continue
    const relativePath = member.slice('package/'.length)
    if (relativePath.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) {
      throw new Error(`Candidate tarball contains an invalid runtime member path: ${member}`)
    }
    if (roots.some(root => relativePath === root || relativePath.startsWith(`${root}/`))) files.add(relativePath)
  }
  const runtimeFiles = [...files].sort()
  if (OFFICIAL_CANDIDATE_RUNTIME_PATHS.some(path => !files.has(path))) {
    throw new Error('Candidate tarball omits a configured config/runtime-artifacts.json output')
  }
  if (runtimeFiles.length === 0) throw new Error('Candidate tarball contains no configured runtime artifacts')
  return runtimeFiles
}

async function readTarballEntry(archivePath, member) {
  const { stdout } = await execFileAsync('tar', ['-xOzf', archivePath, member], {
    encoding: null,
    maxBuffer: TAR_MAX_BUFFER,
  })
  return Buffer.from(stdout)
}

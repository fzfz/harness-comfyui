import { constants } from 'node:fs'
import { access, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'
import yaml from 'js-yaml'
import sharp from 'sharp'

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url))
const expectedSize = Object.freeze({ width: 512, height: 512 })
const firstSeed = 424242
const inputNames = Array.from({ length: 11 }, (_, index) => `prompt-${String(index + 1).padStart(2, '0')}.txt`)
const expectedSeeds = inputNames.map((_, index) => firstSeed + index)
const expectedRequest = Object.freeze({ templateId: '1', instanceId: '1', defaultModelId: '1' })
const profileSchema = yaml.DEFAULT_SCHEMA.extend([
  new yaml.Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: value => value }),
])

function errorRecord(error) {
  return { name: error?.name ?? 'Error', code: error?.code ?? null, message: error?.reason ?? error?.message ?? String(error) }
}

function inside(directory, path) {
  const child = relative(directory, path)
  return child !== '' && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child)
}

async function openStorage(matrix) {
  const configuration = JSON.parse(await readFile(matrix.configPath, 'utf8'))
  const development = configuration.modes.development
  const home = await realpath(resolve(repositoryRoot, development.environmentRootRelativePath, development.directoryNames.dshHome))
  const profile = join(home, configuration.paths.profileRelativePath)
  const rows = yaml.load(await readFile(join(profile, configuration.paths.profilePatchFilename), 'utf8'), { schema: profileSchema })
  const visit = entries => entries.flatMap(row => [
    ...(row.id === 'harness-comfyui-core' ? [row] : []),
    ...(row.group && Array.isArray(row.config) ? visit(row.config) : []),
  ])
  const cores = visit(rows)
  if (cores.length > 1) throw new Error('The isolated Profile contains duplicate ComfyUI core entries.')
  const core = cores[0]?.config ?? {}
  const base = JSON.parse(await readFile(join(matrix.installedPackageRoot, 'config/base.json'), 'utf8'))
  const overrides = JSON.parse(await readFile(join(matrix.installedPackageRoot, 'config/profiles', `${core.configurationProfile ?? 'production'}.json`), 'utf8'))
  const paths = { ...base.paths, ...overrides.paths }
  const relocate = path => core.dataDirectory
    ? resolve(core.dataDirectory, relative(paths.dataDir, path)) : resolve(home, path)
  const databasePath = await realpath(relocate(paths.runRepositoryFile))
  const mediaDirectory = relocate(paths.savedMediaDirectory)
  if (!inside(home, databasePath) || !inside(home, mediaDirectory)) throw new Error('Verification requires storage inside the matrix isolated Harness home.')
  if (!(await stat(databasePath)).isFile()) throw new Error('The isolated Run Repository is not a file.')
  return { home, databasePath, mediaDirectory, database: new DatabaseSync(databasePath, { readOnly: true }) }
}

function compareSets(initial, restored) {
  const first = new Set(initial)
  const second = new Set(restored)
  const added = [...second].filter(id => !first.has(id)).sort()
  const removed = [...first].filter(id => !second.has(id)).sort()
  return { equal: added.length === 0 && removed.length === 0, added, removed }
}

async function checkImage(media, storage) {
  const result = { mediaId: media.mediaId, runId: media.runId, filePath: null,
    accessible: null, decoded: null, width: null, height: null, dimensionsMatch: null }
  if (!storage) return { ...result, unavailable: 'The isolated Run Repository could not be opened.' }
  const row = storage.database.prepare('SELECT relative_path FROM generation_media WHERE media_id = ? AND run_id = ?').get(media.mediaId, media.runId)
  if (!row) return { ...result, rowFound: false, unavailable: 'The observed media has no matching database row.' }
  result.rowFound = true
  result.filePath = resolve(storage.mediaDirectory, row.relative_path)
  if (!inside(storage.mediaDirectory, result.filePath)) return { ...result, accessible: false, error: { message: 'The media path is outside its configured directory.' } }
  try {
    result.realMediaDirectory = await realpath(storage.mediaDirectory)
    result.realFilePath = await realpath(result.filePath)
    result.insideMediaDirectory = inside(storage.home, result.realMediaDirectory) && inside(result.realMediaDirectory, result.realFilePath)
    if (!result.insideMediaDirectory) throw new Error('The resolved media file is outside its isolated media directory.')
    await access(result.realFilePath, constants.R_OK)
    const file = await stat(result.realFilePath)
    if (!file.isFile()) throw new Error('The saved media path is not a file.')
    result.accessible = true
    result.byteLength = file.size
  } catch (error) { return { ...result, accessible: false, error: errorRecord(error) } }
  try {
    const metadata = await sharp(result.realFilePath, { failOn: 'warning' }).metadata()
    result.width = metadata.width ?? null
    result.height = metadata.height ?? null
    result.dimensionsSource = 'header'
    result.dimensionsMatch = metadata.width === expectedSize.width && metadata.height === expectedSize.height
    result.metadataDimensions = { width: result.width, height: result.height, dimensionsMatch: result.dimensionsMatch }
  } catch (error) { return { ...result, decoded: false, error: errorRecord(error) } }
  try {
    const { info } = await sharp(result.realFilePath, { failOn: 'warning' }).raw().toBuffer({ resolveWithObject: true })
    result.decoded = true
    result.dimensionsSource = 'decoded'
    result.width = info.width
    result.height = info.height
    result.dimensionsMatch = info.width === expectedSize.width && info.height === expectedSize.height
  } catch (error) { result.decoded = false; result.error = errorRecord(error) }
  return result
}

async function checkRequest(run, entry, matrix, storage) {
  const result = { runId: run.runId, isFailureFixture: run.runId === entry.failureFixture?.runId,
    seed: null, inputPath: null, promptMatches: null, fixedParameters: null }
  if (!storage) return { ...result, unavailable: 'The isolated Run Repository could not be opened.' }
  const row = storage.database.prepare('SELECT request_json FROM generation_runs WHERE run_id = ?').get(run.runId)
  if (!row) return { ...result, rowFound: false, unavailable: 'The observed Run has no matching database row.' }
  result.rowFound = true
  try {
    const request = JSON.parse(row.request_json)
    const parameters = request.parameters
    result.seed = parameters?.seed ?? null
    const index = Number.isSafeInteger(result.seed) ? result.seed - firstSeed : -1
    result.fixedParameters = {
      actual: { seed: result.seed, width: parameters?.width, height: parameters?.height,
        templateId: request.templateId, instanceId: request.instanceId, model: request.model },
      matches: { seed: index >= 0 && index < expectedSeeds.length,
        width: parameters?.width === expectedSize.width, height: parameters?.height === expectedSize.height,
        templateId: request.templateId === expectedRequest.templateId, instanceId: request.instanceId === expectedRequest.instanceId,
        model: request.model === null || (typeof request.model === 'object' && request.model !== null
          && !Array.isArray(request.model) && request.model.id === expectedRequest.defaultModelId) },
    }
    if (index < 0 || index >= inputNames.length) return { ...result, seedMapsToInput: false }
    result.seedMapsToInput = true
    const name = inputNames[index]
    result.inputPath = entry.inputs?.find(input => input.name === name)?.path ?? join(matrix.inputDirectory, name)
    const bytes = await readFile(result.inputPath)
    const prompt = parameters?.positive_prompt
    result.inputByteLength = bytes.length
    result.promptByteLength = typeof prompt === 'string' ? Buffer.byteLength(prompt, 'utf8') : null
    result.promptMatches = typeof prompt === 'string' && Buffer.from(prompt, 'utf8').equals(bytes)
  } catch (error) { result.error = errorRecord(error) }
  return result
}

function checkSeedCoverage(requests, entry) {
  const excludedFailureFixtureRunIds = requests.filter(request => request.isFailureFixture).map(request => request.runId)
  if (entry.caseId === 'neutral-query') return { status: 'not-applicable', excludedFailureFixtureRunIds }
  const generated = requests.filter(request => !request.isFailureFixture)
  if (generated.some(request => request.fixedParameters === null)) {
    return { status: 'unavailable', excludedFailureFixtureRunIds, expectedSeeds, completeUnique: null }
  }
  const actualSeeds = generated.map(request => request.seed)
  const counts = new Map()
  for (const seed of actualSeeds) counts.set(seed, (counts.get(seed) ?? 0) + 1)
  const duplicateSeeds = [...counts].filter(([, count]) => count > 1).map(([seed]) => seed).sort((a, b) => a - b)
  const missingSeeds = expectedSeeds.filter(seed => !counts.has(seed))
  const unexpectedSeeds = [...counts.keys()].filter(seed => !expectedSeeds.includes(seed))
  return { status: 'checked', excludedFailureFixtureRunIds, expectedSeeds, actualSeeds, duplicateSeeds, missingSeeds, unexpectedSeeds,
    completeUnique: actualSeeds.length === expectedSeeds.length && duplicateSeeds.length === 0 && missingSeeds.length === 0 && unexpectedSeeds.length === 0 }
}

export async function verifyMatrix(matrixPath) {
  matrixPath = await realpath(resolve(matrixPath))
  const matrix = JSON.parse(await readFile(matrixPath, 'utf8'))
  if (!Array.isArray(matrix.cases)) throw new TypeError('The matrix must contain a cases array.')
  const report = { matrixPath, matrixId: matrix.matrixId, label: matrix.label, matrixExecutionStatus: matrix.executionStatus,
    verifiedAt: new Date().toISOString(), expectedSize, firstSeed, expectedRequest, businessAssessment: 'pending-human-review',
    storage: null, cases: [] }
  let storage
  try {
    storage = await openStorage(matrix)
    report.storage = { databasePath: storage.databasePath, mediaDirectory: storage.mediaDirectory, readOnly: true, available: true }
  } catch (error) { report.storage = { available: false, readOnly: true, error: errorRecord(error) } }
  try {
    for (const entry of matrix.cases) {
      const checked = { caseId: entry.caseId, repetition: entry.repetition, phases: [], recoveryComparisons: [] }
      report.cases.push(checked)
      for (const phase of entry.phases ?? []) {
        if (phase.naturalCompletion !== true || !phase.observation) {
          checked.phases.push({ id: phase.id, status: 'pending-verification', reason: 'This phase has no completed observation.' })
          continue
        }
        const generation = phase.observation.generation
        if (!generation?.ok || !Array.isArray(generation.value?.runs) || !Array.isArray(generation.value?.media)) {
          checked.phases.push({ id: phase.id, status: 'unavailable', reason: 'The phase has no successful generation projection.' })
          continue
        }
        const { runs, media } = generation.value
        const runIds = runs.map(run => run.runId).sort()
        const mediaIds = media.map(item => item.mediaId).sort()
        const images = []
        for (const item of media.filter(item => item.mediaKind === 'image')) images.push(await checkImage(item, storage))
        const requests = []
        for (const run of runs) requests.push(await checkRequest(run, entry, matrix, storage))
        checked.phases.push({ id: phase.id, status: 'checked', runIds, mediaIds,
          runCount: runs.length, mediaCount: media.length, uniqueRunCount: new Set(runIds).size, uniqueMediaCount: new Set(mediaIds).size,
          runStatuses: Object.fromEntries([...new Set(runs.map(run => run.status))].map(status => [status, runs.filter(run => run.status === status).length])),
          successfulRunsWithoutImages: runs.filter(run => run.status === 'succeeded'
            && !media.some(item => item.runId === run.runId && item.mediaKind === 'image')).map(run => run.runId),
          mediaWithoutObservedRun: media.filter(item => !runIds.includes(item.runId)).map(item => item.mediaId),
          images, requests, seedCoverage: checkSeedCoverage(requests, entry) })
      }
      const initial = checked.phases.find(phase => phase.id === 'initial')
      for (const restored of checked.phases.filter(phase => phase.id !== 'initial')) {
        checked.recoveryComparisons.push(initial?.status === 'checked' && restored.status === 'checked'
          ? { phaseId: restored.id, status: 'checked', runIds: compareSets(initial.runIds, restored.runIds), mediaIds: compareSets(initial.mediaIds, restored.mediaIds) }
          : { phaseId: restored.id, status: 'pending-verification' })
      }
    }
  } finally { storage?.database.close() }
  report.notStartedCases = []
  if (Array.isArray(matrix.caseIds) && Number.isSafeInteger(matrix.repetitions)) {
    for (const caseId of matrix.caseIds) {
      for (let repetition = 1; repetition <= matrix.repetitions; repetition += 1) {
        if (!report.cases.some(entry => entry.caseId === caseId && entry.repetition === repetition)) {
          report.notStartedCases.push({ caseId, repetition, status: 'pending-verification' })
        }
      }
    }
  }
  const phases = report.cases.flatMap(entry => entry.phases)
  const checked = phases.filter(phase => phase.status === 'checked')
  const images = checked.flatMap(phase => phase.images)
  const requests = checked.flatMap(phase => phase.requests)
  const recoveries = report.cases.flatMap(entry => entry.recoveryComparisons).filter(comparison => comparison.status === 'checked')
  report.summary = {
    recordedCases: report.cases.length, unstartedCases: report.notStartedCases.length,
    checkedPhases: checked.length, pendingPhases: phases.filter(phase => phase.status === 'pending-verification').length,
    unavailablePhases: phases.filter(phase => phase.status === 'unavailable').length,
    checkedImages: images.length, accessibleImages: images.filter(image => image.accessible === true).length,
    decodedImages: images.filter(image => image.decoded === true).length,
    imagesWithExpectedDimensions: images.filter(image => image.decoded === true && image.dimensionsMatch === true).length,
    imagesWithMatchingMetadataDimensions: images.filter(image => image.metadataDimensions?.dimensionsMatch === true).length,
    dimensionMismatches: images.filter(image => image.dimensionsMatch === false).length,
    inaccessibleImages: images.filter(image => image.accessible === false).length,
    undecodableImages: images.filter(image => image.decoded === false).length,
    unavailableImages: images.filter(image => image.accessible === null).length,
    missingMediaRows: images.filter(image => image.rowFound === false).length,
    successfulRunsWithoutImages: checked.reduce((count, phase) => count + phase.successfulRunsWithoutImages.length, 0),
    mediaWithoutObservedRun: checked.reduce((count, phase) => count + phase.mediaWithoutObservedRun.length, 0),
    promptChecks: requests.length, matchingPrompts: requests.filter(request => request.promptMatches === true).length,
    promptMismatches: requests.filter(request => request.promptMatches === false).length,
    unavailablePrompts: requests.filter(request => request.promptMatches === null).length,
    unmappedSeeds: requests.filter(request => request.seedMapsToInput === false).length,
    missingRunRows: requests.filter(request => request.rowFound === false).length,
    fixedParameterChecks: requests.filter(request => request.fixedParameters !== null).length,
    fixedParameterMismatches: requests.filter(request => request.fixedParameters !== null
      && Object.values(request.fixedParameters.matches).some(matches => matches === false)).length,
    unavailableFixedParameters: requests.filter(request => request.fixedParameters === null).length,
    seedCoverageChecks: checked.filter(phase => phase.seedCoverage.status === 'checked').length,
    seedCoverageMismatches: checked.filter(phase => phase.seedCoverage.status === 'checked' && !phase.seedCoverage.completeUnique).length,
    unavailableSeedCoverage: checked.filter(phase => phase.seedCoverage.status === 'unavailable').length,
    inapplicableSeedCoverage: checked.filter(phase => phase.seedCoverage.status === 'not-applicable').length,
    recoveryComparisons: recoveries.length, recoveryRunSetChanges: recoveries.filter(comparison => !comparison.runIds.equal).length,
    recoveryMediaSetChanges: recoveries.filter(comparison => !comparison.mediaIds.equal).length,
  }
  return report
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [matrixPath, option, outputPath, ...extra] = process.argv.slice(2)
    if (!matrixPath || extra.length || (option !== undefined && (option !== '--output' || !outputPath))) {
      throw new TypeError('Usage: node verify-matrix.mjs <matrix.json> [--output <new-report.json>]')
    }
    const report = await verifyMatrix(matrixPath)
    if (outputPath) {
      if (resolve(outputPath) === report.matrixPath) throw new Error('The output must differ from the input matrix path.')
      await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
      console.log(resolve(outputPath))
    } else console.log(JSON.stringify({ matrixPath: report.matrixPath, matrixExecutionStatus: report.matrixExecutionStatus,
      storage: report.storage, summary: report.summary, businessAssessment: report.businessAssessment }, null, 2))
  } catch (error) { console.error(error.message ?? String(error)); process.exitCode = 1 }
}

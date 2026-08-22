import { createHash } from 'node:crypto'
import {
  lstatSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, basename, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadQualityPolicy } from './quality-policy.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const artifactDirectoryName = '.release/quality'
const artifactKeys = ['byteLength', 'commit', 'filename', 'sha256', 'tarballPath', 'version']
const immutableArtifactKeys = ['filename', 'version', 'commit', 'byteLength', 'sha256']
const recordKeys = ['artifact', 'commit', 'gates', 'runId', 'schemaVersion', 'workflowName']
const recordArtifactKeys = ['byteLength', 'commit', 'filename', 'manifestFilename', 'sha256', 'version']
const gateKeys = ['id', 'status']
const exactCommit = /^[0-9a-f]{40}$/u
const exactSha256 = /^[0-9a-f]{64}$/u
const positiveRunId = /^[1-9][0-9]*$/u
const strictSemVer = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u

function fail(message) {
  throw new Error(`artifact qualification: ${message}`)
}

function assertExactKeys(value, expectedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`)
  const actualKeys = Object.keys(value).sort()
  const sortedExpected = [...expectedKeys].sort()
  if (JSON.stringify(actualKeys) !== JSON.stringify(sortedExpected)) {
    fail(`${label} must contain exactly ${expectedKeys.join(', ')}`)
  }
}

function assertRegularFile(path, label) {
  let entry
  try {
    entry = lstatSync(path)
  } catch (error) {
    throw new Error(`artifact qualification ${label} does not exist: ${path}`, { cause: error })
  }
  if (entry.isSymbolicLink()) fail(`${label} must not be a symlink: ${path}`)
  if (!entry.isFile()) fail(`${label} must be a regular file: ${path}`)
}

function readJsonFile(path, label) {
  assertRegularFile(path, label)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`artifact qualification ${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}

function artifactDirectory(root) {
  const directory = resolve(root, artifactDirectoryName)
  let entry
  try {
    entry = lstatSync(directory)
  } catch (error) {
    throw new Error(`artifact qualification directory does not exist: ${directory}`, { cause: error })
  }
  if (entry.isSymbolicLink() || !entry.isDirectory()) fail(`${artifactDirectoryName} must be a real directory`)
  return directory
}

function safeTarballFilename(filename) {
  if (typeof filename !== 'string' || filename.length === 0 || filename.includes('\0') || filename.includes('\\')) {
    fail('artifact filename must be a non-empty safe basename')
  }
  if (basename(filename) !== filename || filename === '.' || filename === '..' || !filename.endsWith('.tgz')) {
    fail(`artifact filename must be a safe .tgz basename: ${String(filename)}`)
  }
  return filename
}

function safePolicyFilename(filename, label) {
  if (typeof filename !== 'string' || filename.length === 0 || filename.includes('\0') || filename.includes('\\') || basename(filename) !== filename || filename === '.' || filename === '..') {
    fail(`policy ${label} filename must be a safe basename`)
  }
  return filename
}

function readQualificationPolicy(root) {
  const policy = loadQualityPolicy(root)
  const manifestFilename = safePolicyFilename(policy.qualification.files.manifest, 'manifest')
  const recordFilename = safePolicyFilename(policy.qualification.files.record, 'record')
  return { policy, manifestFilename, recordFilename }
}

function readArtifactManifest(root, manifestFilename) {
  safePolicyFilename(manifestFilename, 'manifest')
  const directory = artifactDirectory(root)
  const path = join(directory, manifestFilename)
  const artifact = readJsonFile(path, manifestFilename)
  assertExactKeys(artifact, artifactKeys, manifestFilename)
  safeTarballFilename(artifact.filename)
  if (typeof artifact.tarballPath !== 'string' || !isAbsolute(artifact.tarballPath) || resolve(artifact.tarballPath) !== artifact.tarballPath) {
    fail('artifact tarballPath must be a normalized absolute path')
  }
  if (basename(artifact.tarballPath) !== artifact.filename) fail('artifact tarballPath basename must match artifact filename')
  if (typeof artifact.version !== 'string' || !strictSemVer.test(artifact.version)) fail('artifact version must be strict SemVer')
  if (typeof artifact.commit !== 'string' || !exactCommit.test(artifact.commit)) fail('artifact commit must be lowercase 40-character hex')
  if (!Number.isInteger(artifact.byteLength) || artifact.byteLength < 0) fail('artifact byteLength must be a non-negative integer')
  if (typeof artifact.sha256 !== 'string' || !exactSha256.test(artifact.sha256)) fail('artifact sha256 must be lowercase SHA-256')
  return { artifact, directory, path }
}

function readCurrentTarball(root, options = {}) {
  const { artifact, directory } = readArtifactManifest(root, options.manifestFilename)
  const tgzEntries = readdirSync(directory, { withFileTypes: true }).filter(entry => entry.name.endsWith('.tgz'))
  if (tgzEntries.length !== 1) fail(`artifact directory must contain exactly one .tgz; found ${tgzEntries.length}`)
  const entry = tgzEntries[0]
  if (entry.isSymbolicLink()) fail(`artifact tarball must not be a symlink: ${entry.name}`)
  if (!entry.isFile()) fail(`artifact tarball must be a regular file: ${entry.name}`)
  if (entry.name !== artifact.filename) fail(`artifact tarball filename ${entry.name} differs from manifest ${artifact.filename}`)
  const tarballPath = resolve(directory, entry.name)
  if (relative(directory, tarballPath).startsWith('..') || isAbsolute(relative(directory, tarballPath))) fail('artifact tarball must remain inside .release/quality')
  if (options.requireRelocated === true && artifact.tarballPath !== tarballPath) {
    fail(`artifact tarballPath must point to the current runner path ${tarballPath}`)
  }
  const bytes = readFileSync(tarballPath)
  const byteLength = statSync(tarballPath).size
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (byteLength !== artifact.byteLength) fail(`artifact byteLength ${artifact.byteLength} differs from tarball ${byteLength}`)
  if (sha256 !== artifact.sha256) fail(`artifact sha256 ${artifact.sha256} differs from tarball ${sha256}`)
  return { artifact, directory, tarballPath }
}

function atomicWriteJson(path, value, label) {
  const directory = dirname(path)
  const temporaryPath = join(directory, `.${basename(path)}.tmp-${process.pid}-${Date.now()}`)
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
    renameSync(temporaryPath, path)
  } catch (error) {
    try {
      unlinkSync(temporaryPath)
    } catch {
      // The temporary path is already absent.
    }
    throw new Error(`cannot atomically write ${label}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}

function assertImmutableArtifactFields(before, after) {
  for (const field of immutableArtifactKeys) {
    if (after[field] !== before[field]) fail(`artifact ${field} changed during relocation`)
  }
}

export function relocateArtifact(root = repositoryRoot) {
  const { manifestFilename } = readQualificationPolicy(root)
  const before = readCurrentTarball(root, { manifestFilename })
  const tarballPath = resolve(before.directory, before.artifact.filename)
  if (before.artifact.tarballPath !== tarballPath) {
    atomicWriteJson(join(before.directory, manifestFilename), { ...before.artifact, tarballPath }, manifestFilename)
  }
  const after = readCurrentTarball(root, { manifestFilename, requireRelocated: true })
  assertImmutableArtifactFields(before.artifact, after.artifact)
  return after.artifact
}

function assertRunId(runId) {
  if (typeof runId !== 'string' || !positiveRunId.test(runId)) fail('run-id must be a positive decimal string')
}

function assertCommit(commitValue) {
  if (typeof commitValue !== 'string' || !exactCommit.test(commitValue)) fail('commit must be lowercase 40-character hex')
}

function assertExpectedVersion(version) {
  if (typeof version !== 'string' || !strictSemVer.test(version)) fail('expected-version must be strict SemVer')
}

function assertExpectedSha256(sha256) {
  if (typeof sha256 !== 'string' || !exactSha256.test(sha256)) fail('expected-sha256 must be lowercase SHA-256')
}

function assertWritableRecordPath(path) {
  try {
    const entry = lstatSync(path)
    if (entry.isSymbolicLink()) fail(`qualification record must not be a symlink: ${path}`)
    if (!entry.isFile()) fail(`qualification record must be a regular file: ${path}`)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

export function writeQualification(root = repositoryRoot, options = {}) {
  assertRunId(options.runId)
  assertCommit(options.commit)
  const { policy, manifestFilename, recordFilename } = readQualificationPolicy(root)
  const { artifact, directory } = readCurrentTarball(root, { manifestFilename, requireRelocated: true })
  if (artifact.commit !== options.commit) fail(`artifact commit ${artifact.commit} differs from requested commit ${options.commit}`)
  const record = {
    schemaVersion: policy.qualification.schemaVersion,
    workflowName: policy.qualification.workflowName,
    runId: options.runId,
    commit: options.commit,
    artifact: {
      manifestFilename,
      filename: artifact.filename,
      version: artifact.version,
      commit: artifact.commit,
      byteLength: artifact.byteLength,
      sha256: artifact.sha256,
    },
    gates: policy.qualification.requiredGateIds.map(id => ({ id, status: 'passed' })),
  }
  const recordPath = join(directory, recordFilename)
  assertWritableRecordPath(recordPath)
  atomicWriteJson(recordPath, record, recordFilename)
  return record
}

export function validateQualification(root = repositoryRoot, options = {}) {
  assertExpectedVersion(options.expectedVersion)
  assertCommit(options.expectedCommit)
  assertRunId(options.expectedRunId)
  assertExpectedSha256(options.expectedSha256)
  const { policy, manifestFilename, recordFilename } = readQualificationPolicy(root)
  const { artifact, directory } = readCurrentTarball(root, { manifestFilename, requireRelocated: true })
  if (artifact.version !== options.expectedVersion) fail(`artifact version ${artifact.version} differs from expected ${options.expectedVersion}`)
  if (artifact.commit !== options.expectedCommit) fail(`artifact commit ${artifact.commit} differs from expected ${options.expectedCommit}`)
  if (artifact.sha256 !== options.expectedSha256) fail(`artifact sha256 ${artifact.sha256} differs from expected ${options.expectedSha256}`)
  const recordPath = join(directory, recordFilename)
  const record = readJsonFile(recordPath, recordFilename)
  assertExactKeys(record, recordKeys, recordFilename)
  if (record.schemaVersion !== policy.qualification.schemaVersion) fail('qualification schemaVersion differs from policy')
  if (record.workflowName !== policy.qualification.workflowName) fail('qualification workflowName differs from policy')
  if (record.runId !== options.expectedRunId) fail('qualification runId differs from expected run ID')
  if (record.commit !== options.expectedCommit) fail('qualification commit differs from expected commit')
  assertExactKeys(record.artifact, recordArtifactKeys, 'qualification artifact')
  const expectedArtifact = {
    manifestFilename,
    filename: artifact.filename,
    version: artifact.version,
    commit: artifact.commit,
    byteLength: artifact.byteLength,
    sha256: artifact.sha256,
  }
  for (const field of recordArtifactKeys) {
    if (record.artifact[field] !== expectedArtifact[field]) fail(`qualification artifact ${field} differs from manifest or policy`)
  }
  if (!Array.isArray(record.gates) || record.gates.length !== policy.qualification.requiredGateIds.length) fail('qualification gates must contain every required gate exactly once')
  record.gates.forEach((gate, index) => {
    assertExactKeys(gate, gateKeys, `qualification gate ${index}`)
    if (gate.id !== policy.qualification.requiredGateIds[index]) fail(`qualification gate ${index} is unknown, missing, duplicated, or out of order`)
    if (gate.status !== 'passed') fail(`qualification gate ${gate.id} status must be passed`)
  })
  return { artifact, record }
}

function parseArguments(argv) {
  const command = argv[0]
  if (!['relocate', 'write', 'validate'].includes(command)) fail('command must be relocate, write, or validate')
  const options = { command, root: undefined }
  const seen = new Set()
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index]
    const names = {
      '--root': 'root',
      '--run-id': 'runId',
      '--commit': 'commit',
      '--expected-version': 'expectedVersion',
      '--expected-commit': 'expectedCommit',
      '--expected-run-id': 'expectedRunId',
      '--expected-sha256': 'expectedSha256',
    }
    const key = names[argument]
    if (!key) fail(`unknown argument ${argument}`)
    if (seen.has(argument)) fail(`duplicate argument ${argument}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) fail(`${argument} requires a non-empty value`)
    seen.add(argument)
    options[key] = key === 'root' ? resolve(value) : value
    index += 1
  }
  if (!options.root) fail('--root is required')
  const allowedByCommand = {
    relocate: new Set(['root']),
    write: new Set(['root', 'runId', 'commit']),
    validate: new Set(['root', 'expectedVersion', 'expectedCommit', 'expectedRunId', 'expectedSha256']),
  }[command]
  for (const key of Object.keys(options)) {
    if (key !== 'command' && options[key] !== undefined && !allowedByCommand.has(key)) fail(`${key} is not valid for ${command}`)
  }
  if (command === 'write') {
    assertRunId(options.runId)
    assertCommit(options.commit)
  }
  if (command === 'validate') {
    assertExpectedVersion(options.expectedVersion)
    assertCommit(options.expectedCommit)
    assertRunId(options.expectedRunId)
    assertExpectedSha256(options.expectedSha256)
  }
  return options
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv)
  if (options.command === 'relocate') {
    const artifact = relocateArtifact(options.root)
    process.stdout.write(`artifact relocated: ${artifact.filename} (${artifact.sha256})\n`)
    return 0
  }
  if (options.command === 'write') {
    const record = writeQualification(options.root, options)
    process.stdout.write(`qualification written: ${record.runId}\n`)
    return 0
  }
  validateQualification(options.root, options)
  process.stdout.write('qualification validated\n')
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main()
  } catch (error) {
    process.stderr.write(`artifact-qualification: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

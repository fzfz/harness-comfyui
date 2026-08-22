import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

// @ts-expect-error The qualification seam is a checked-in JavaScript CLI module.
import { relocateArtifact, validateQualification, writeQualification } from '../../scripts/ci/artifact-qualification.mjs'
// @ts-expect-error The policy seam is a checked-in JavaScript policy module.
import { loadQualityPolicy } from '../../scripts/ci/quality-policy.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const qualificationScript = resolve(repositoryRoot, 'scripts/ci/artifact-qualification.mjs')
const commit = 'a'.repeat(40)
const temporaryRoots: string[] = []

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-artifact-'))
  temporaryRoots.push(root)
  mkdirSync(join(root, 'config'), { recursive: true })
  copyFileSync(join(repositoryRoot, 'config/quality-gates.json'), join(root, 'config/quality-gates.json'))
  return root
}

function artifactFixture(options: { filename?: string; bytes?: string; tarballPath?: string } = {}) {
  const root = temporaryRoot()
  const qualityDirectory = join(root, '.release/quality')
  mkdirSync(qualityDirectory, { recursive: true })
  const filename = options.filename ?? 'harness-comfyui-1.2.3.tgz'
  const bytes = Buffer.from(options.bytes ?? 'candidate artifact bytes')
  const currentTarballPath = join(qualityDirectory, filename)
  writeFileSync(currentTarballPath, bytes)
  const artifact = {
    tarballPath: options.tarballPath ?? resolve('/old/runner/.release/quality', filename),
    filename,
    version: '1.2.3',
    commit,
    byteLength: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
  writeFileSync(join(qualityDirectory, 'artifact.json'), `${JSON.stringify(artifact, null, 2)}\n`)
  return { root, qualityDirectory, currentTarballPath, artifact, bytes, filename }
}

function runCli(...args: string[]) {
  return spawnSync(process.execPath, [qualificationScript, ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('artifact qualification relocation', () => {
  it('relocates a stale runner path and preserves every artifact identity field', () => {
    const fixture = artifactFixture()
    const before = JSON.parse(readFileSync(join(fixture.qualityDirectory, 'artifact.json'), 'utf8'))

    const relocated = relocateArtifact(fixture.root)
    const after = JSON.parse(readFileSync(join(fixture.qualityDirectory, 'artifact.json'), 'utf8'))

    expect(relocated.tarballPath).toBe(fixture.currentTarballPath)
    expect(after.tarballPath).toBe(fixture.currentTarballPath)
    for (const field of ['filename', 'version', 'commit', 'byteLength', 'sha256']) {
      expect(after[field]).toEqual(before[field])
    }
    expect(runCli('relocate', '--root', fixture.root).status).toBe(0)
  })

  it.each([
    ['missing tarball', (fixture: ReturnType<typeof artifactFixture>) => rmSync(fixture.currentTarballPath), /tarball|\.tgz/u],
    ['extra tarball', (fixture: ReturnType<typeof artifactFixture>) => writeFileSync(join(fixture.qualityDirectory, 'extra.tgz'), 'extra'), /exactly one \.tgz/u],
    ['tampered bytes', (fixture: ReturnType<typeof artifactFixture>) => writeFileSync(fixture.currentTarballPath, 'tampered'), /sha256|byteLength/u],
    ['unsafe filename', (fixture: ReturnType<typeof artifactFixture>) => {
      const artifactPath = join(fixture.qualityDirectory, 'artifact.json')
      const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'))
      artifact.filename = '../unsafe.tgz'
      writeFileSync(artifactPath, `${JSON.stringify(artifact)}\n`)
    }, /filename/u],
  ])('rejects %s', (_name, mutate, expected) => {
    const fixture = artifactFixture()
    mutate(fixture)
    expect(() => relocateArtifact(fixture.root)).toThrow(expected)
  })

  it('rejects a tarball symlink instead of hashing a linked file', () => {
    const fixture = artifactFixture()
    rmSync(fixture.currentTarballPath)
    const target = join(fixture.root, 'outside.tgz')
    writeFileSync(target, fixture.bytes)
    symlinkSync(target, fixture.currentTarballPath)
    expect(() => relocateArtifact(fixture.root)).toThrow(/symlink/u)
  })

  it.each([
    ['manifest extra field', (artifact: Record<string, unknown>) => { artifact.extra = true }, /exactly/u],
    ['manifest missing field', (artifact: Record<string, unknown>) => { delete artifact.sha256 }, /exactly/u],
    ['relative tarball path', (artifact: Record<string, unknown>) => { artifact.tarballPath = 'artifact.tgz' }, /absolute/u],
    ['non-normalized tarball path', (artifact: Record<string, unknown>) => { artifact.tarballPath = `${artifact.tarballPath}/../harness-comfyui-1.2.3.tgz` }, /normalized/u],
    ['tarball basename mismatch', (artifact: Record<string, unknown>) => { artifact.tarballPath = resolve(String(artifact.tarballPath), '..', 'other.tgz') }, /basename/u],
    ['invalid SemVer', (artifact: Record<string, unknown>) => { artifact.version = '01.2.3' }, /SemVer/u],
    ['invalid commit', (artifact: Record<string, unknown>) => { artifact.commit = 'A'.repeat(40) }, /commit/u],
    ['invalid SHA-256', (artifact: Record<string, unknown>) => { artifact.sha256 = 'F'.repeat(64) }, /SHA-256/u],
  ])('rejects %s in artifact manifest', (_name, mutate, expected) => {
    const fixture = artifactFixture()
    const artifactPath = join(fixture.qualityDirectory, 'artifact.json')
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as Record<string, unknown>
    mutate(artifact)
    writeFileSync(artifactPath, `${JSON.stringify(artifact)}\n`)
    expect(() => relocateArtifact(fixture.root)).toThrow(expected)
  })
})

describe('qualification record write and validation', () => {
  it('writes the exact policy-bound record and validates the actual tarball identity', () => {
    const fixture = artifactFixture()
    relocateArtifact(fixture.root)
    const policy = loadQualityPolicy(fixture.root)
    const record = writeQualification(fixture.root, { runId: '123456789', commit })

    expect(record).toEqual({
      schemaVersion: policy.qualification.schemaVersion,
      workflowName: policy.qualification.workflowName,
      runId: '123456789',
      commit,
      artifact: {
        manifestFilename: policy.qualification.artifactNames.manifest,
        filename: fixture.filename,
        version: fixture.artifact.version,
        commit,
        byteLength: fixture.bytes.byteLength,
        sha256: fixture.artifact.sha256,
      },
      gates: policy.qualification.requiredGateIds.map((id: string) => ({ id, status: 'passed' })),
    })
    expect(validateQualification(fixture.root, {
      expectedVersion: fixture.artifact.version,
      expectedCommit: commit,
      expectedRunId: '123456789',
      expectedSha256: fixture.artifact.sha256,
    }).artifact.sha256).toBe(fixture.artifact.sha256)
  })

  it('rejects record, manifest, tarball, and expected-input tampering', () => {
    const fixture = artifactFixture()
    relocateArtifact(fixture.root)
    writeQualification(fixture.root, { runId: '123456789', commit })
    const recordPath = join(fixture.qualityDirectory, 'qualification.json')
    const record = JSON.parse(readFileSync(recordPath, 'utf8'))

    record.gates[0] = { id: 'unknown-gate', status: 'passed' }
    writeFileSync(recordPath, `${JSON.stringify(record)}\n`)
    expect(() => validateQualification(fixture.root, {
      expectedVersion: fixture.artifact.version,
      expectedCommit: commit,
      expectedRunId: '123456789',
      expectedSha256: fixture.artifact.sha256,
    })).toThrow(/gate/u)

    record.gates[0] = { id: 'test:deploy', status: 'passed' }
    writeFileSync(recordPath, `${JSON.stringify(record)}\n`)
    writeFileSync(fixture.currentTarballPath, 'tampered')
    expect(() => validateQualification(fixture.root, {
      expectedVersion: fixture.artifact.version,
      expectedCommit: commit,
      expectedRunId: '123456789',
      expectedSha256: fixture.artifact.sha256,
    })).toThrow(/sha256|byteLength/u)

    writeFileSync(fixture.currentTarballPath, fixture.bytes)
    const artifactPath = join(fixture.qualityDirectory, 'artifact.json')
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'))
    artifact.version = '9.9.9'
    writeFileSync(artifactPath, `${JSON.stringify(artifact)}\n`)
    expect(() => validateQualification(fixture.root, {
      expectedVersion: fixture.artifact.version,
      expectedCommit: commit,
      expectedRunId: '123456789',
      expectedSha256: fixture.artifact.sha256,
    })).toThrow(/version/u)
  })

  it.each([
    ['workflow name', (record: Record<string, unknown>) => { record.workflowName = 'Other Workflow' }, /workflowName/u],
    ['record run ID', (record: Record<string, unknown>) => { record.runId = '987654321' }, /run ID/u],
    ['schema version', (record: Record<string, unknown>) => { record.schemaVersion = 2 }, /schemaVersion/u],
    ['artifact SHA-256', (record: Record<string, unknown>) => { (record.artifact as Record<string, unknown>).sha256 = 'b'.repeat(64) }, /artifact sha256/u],
    ['artifact version', (record: Record<string, unknown>) => { (record.artifact as Record<string, unknown>).version = '9.9.9' }, /artifact version/u],
    ['artifact commit', (record: Record<string, unknown>) => { (record.artifact as Record<string, unknown>).commit = 'b'.repeat(40) }, /artifact commit/u],
    ['gate extra key', (record: Record<string, unknown>) => { (record.gates as Array<Record<string, unknown>>)[0].extra = true }, /exactly/u],
    ['unknown gate', (record: Record<string, unknown>) => { (record.gates as Array<Record<string, unknown>>)[0].id = 'unknown-gate' }, /gate/u],
    ['duplicate gate', (record: Record<string, unknown>) => { (record.gates as Array<Record<string, unknown>>)[1].id = (record.gates as Array<Record<string, unknown>>)[0].id }, /gate/u],
    ['missing gate', (record: Record<string, unknown>) => { (record.gates as Array<Record<string, unknown>>).pop() }, /gates/u],
    ['failed gate', (record: Record<string, unknown>) => { (record.gates as Array<Record<string, unknown>>)[0].status = 'failed' }, /status/u],
  ])('rejects qualification %s tampering', (_name, mutate, expected) => {
    const fixture = artifactFixture()
    relocateArtifact(fixture.root)
    writeQualification(fixture.root, { runId: '123456789', commit })
    const recordPath = join(fixture.qualityDirectory, 'qualification.json')
    const record = JSON.parse(readFileSync(recordPath, 'utf8')) as Record<string, unknown>
    mutate(record)
    writeFileSync(recordPath, `${JSON.stringify(record)}\n`)
    expect(() => validateQualification(fixture.root, {
      expectedVersion: fixture.artifact.version,
      expectedCommit: commit,
      expectedRunId: '123456789',
      expectedSha256: fixture.artifact.sha256,
    })).toThrow(expected)
  })

  it('requires relocation, exact commit, positive run ID, and an atomic record path', () => {
    const fixture = artifactFixture()
    expect(() => writeQualification(fixture.root, { runId: '123456789', commit })).toThrow(/current runner/u)
    relocateArtifact(fixture.root)
    expect(() => writeQualification(fixture.root, { runId: '0', commit })).toThrow(/positive/u)
    expect(() => writeQualification(fixture.root, { runId: '123456789', commit: 'b'.repeat(40) })).toThrow(/differs/u)

    const recordPath = join(fixture.qualityDirectory, 'qualification.json')
    const target = join(fixture.root, 'outside-record.json')
    writeFileSync(target, '{}')
    symlinkSync(target, recordPath)
    expect(() => writeQualification(fixture.root, { runId: '123456789', commit })).toThrow(/symlink/u)
  })

  it.each([
    ['version', { expectedVersion: '9.9.9' }],
    ['commit', { expectedCommit: 'b'.repeat(40) }],
    ['run ID', { expectedRunId: '987654321' }],
    ['SHA-256', { expectedSha256: 'b'.repeat(64) }],
  ])('rejects an expected %s mismatch', (_name, mismatch) => {
    const fixture = artifactFixture()
    relocateArtifact(fixture.root)
    writeQualification(fixture.root, { runId: '123456789', commit })
    expect(() => validateQualification(fixture.root, {
      expectedVersion: fixture.artifact.version,
      expectedCommit: commit,
      expectedRunId: '123456789',
      expectedSha256: fixture.artifact.sha256,
      ...mismatch,
    })).toThrow(/differs/u)
  })

  it.each([
    ['record extra field', (record: Record<string, unknown>) => { record.extra = true }, /exactly/u],
    ['record missing field', (record: Record<string, unknown>) => { delete record.workflowName }, /exactly/u],
    ['duplicate gate', (record: Record<string, unknown>) => {
      const gates = record.gates as Array<Record<string, unknown>>
      gates[1].id = gates[0].id
    }, /gate/u],
    ['failed gate status', (record: Record<string, unknown>) => {
      const gates = record.gates as Array<Record<string, unknown>>
      gates[0].status = 'failed'
    }, /status/u],
  ])('rejects %s in qualification record', (_name, mutate, expected) => {
    const fixture = artifactFixture()
    relocateArtifact(fixture.root)
    writeQualification(fixture.root, { runId: '123456789', commit })
    const recordPath = join(fixture.qualityDirectory, 'qualification.json')
    const record = JSON.parse(readFileSync(recordPath, 'utf8')) as Record<string, unknown>
    mutate(record)
    writeFileSync(recordPath, `${JSON.stringify(record)}\n`)
    expect(() => validateQualification(fixture.root, {
      expectedVersion: fixture.artifact.version,
      expectedCommit: commit,
      expectedRunId: '123456789',
      expectedSha256: fixture.artifact.sha256,
    })).toThrow(expected)
  })
})

describe('artifact qualification CLI arguments', () => {
  it('fails nonzero for missing, duplicate, unknown, and invalid arguments', () => {
    expect(runCli().status).not.toBe(0)
    expect(runCli('relocate', '--root', repositoryRoot, '--unknown').status).not.toBe(0)
    expect(runCli('write', '--root', repositoryRoot, '--root', repositoryRoot, '--run-id', '1', '--commit', commit).status).not.toBe(0)
    expect(runCli('validate', '--root', repositoryRoot, '--expected-version', 'not-semver', '--expected-commit', commit, '--expected-run-id', '0', '--expected-sha256', 'f'.repeat(64)).status).not.toBe(0)
  })
})

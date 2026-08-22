import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

// @ts-expect-error The policy seam is a checked-in JavaScript CLI module.
import { classifyChangedPaths } from '../../scripts/ci/classify-changes.mjs'
// @ts-expect-error The policy seam is a checked-in JavaScript policy module.
import { loadQualityPolicy, validateQualityPolicy } from '../../scripts/ci/quality-policy.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const classifierScript = resolve(repositoryRoot, 'scripts/ci/classify-changes.mjs')
const temporaryRoots: string[] = []

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-quality-git-'))
  temporaryRoots.push(root)
  return root
}

function git(root: string, ...args: string[]): string {
  return execFileSync('git', [
    '-c', 'user.name=quality-gate-test',
    '-c', 'user.email=quality-gate-test@example.invalid',
    ...args,
  ], { cwd: root, encoding: 'utf8' }).trim()
}

function createGitFixture(path: string): { root: string; trackedPath: string; before: string } {
  const root = temporaryRoot()
  mkdirSync(join(root, 'config'), { recursive: true })
  copyFileSync(join(repositoryRoot, 'config/quality-gates.json'), join(root, 'config/quality-gates.json'))
  git(root, 'init', '--quiet')
  const trackedPath = join(root, path)
  mkdirSync(resolve(trackedPath, '..'), { recursive: true })
  writeFileSync(trackedPath, 'fixture\n')
  git(root, 'add', '--all')
  git(root, 'commit', '--quiet', '-m', 'fixture')
  return { root, trackedPath, before: git(root, 'rev-parse', 'HEAD') }
}

function classifyGitDiff(root: string, before: string): string {
  const after = git(root, 'rev-parse', 'HEAD')
  return execFileSync(process.execPath, [
    classifierScript,
    '--root', root,
    '--before', before,
    '--after', after,
  ], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('quality gate policy', () => {
  it('loads one structured source for numerical coverage, fail-closed classes, and qualification identity', () => {
    const policy = loadQualityPolicy(repositoryRoot)
    expect(policy.coverage.provider).toBe('v8')
    expect(policy.coverage.include).toEqual(['src/**/*.{ts,tsx}'])
    expect(policy.coverage.exclude).toEqual(['src/**/*.d.ts', 'src/testing/**'])
    expect(policy.coverage.thresholds).toEqual({
      lines: expect.any(Number),
      functions: expect.any(Number),
      statements: expect.any(Number),
      branches: expect.any(Number),
    })
    expect(policy.fastOnlyFiles).toEqual(['README.md'])
    expect(policy.fastOnlyPrefixes).toEqual(['docs/', 'prototype/', '.planning/'])
    expect(policy.qualification.schemaVersion).toBe(1)
    expect(policy.qualification.workflowName).toBe('Artifact Qualification')
    expect(policy.qualification.requiredGateIds).toEqual([
      'test:deploy',
      'test:composition',
      'test:e2e',
      'release:smoke',
    ])
    expect(policy.qualification.artifactNames).toEqual({
      candidate: 'quality-candidate',
      qualified: 'quality-qualified',
      manifest: 'artifact.json',
      record: 'qualification.json',
    })
  })

  it('rejects unknown policy keys and malformed qualification gate or artifact-name records', () => {
    const policy = loadQualityPolicy(repositoryRoot)
    expect(() => validateQualityPolicy({ ...policy, unexpected: true })).toThrow(/policy.*exactly/u)
    expect(() => validateQualityPolicy({
      ...policy,
      coverage: { ...policy.coverage, unexpected: true },
    })).toThrow(/coverage.*exactly/u)
    expect(() => validateQualityPolicy({
      ...policy,
      qualification: { ...policy.qualification, unexpected: true },
    })).toThrow(/qualification.*exactly/u)
    expect(() => validateQualityPolicy({
      ...policy,
      qualification: {
        ...policy.qualification,
        artifactNames: { ...policy.qualification.artifactNames, unexpected: 'extra' },
      },
    })).toThrow(/artifactNames.*exactly/u)
    expect(() => validateQualityPolicy({
      ...policy,
      qualification: {
        ...policy.qualification,
        artifactNames: { ...policy.qualification.artifactNames, qualified: policy.qualification.artifactNames.candidate },
      },
    })).toThrow(/artifactNames.*unique/u)

    const withGates = (mutate: (gates: Array<Record<string, unknown>>) => void) => {
      const gates = policy.qualification.gates.map((gate: Record<string, unknown>) => ({ ...gate }))
      mutate(gates)
      return validateQualityPolicy({
        ...policy,
        qualification: { ...policy.qualification, gates },
      })
    }
    expect(() => withGates(gates => { gates[0].unexpected = true })).toThrow(/gates entry.*exactly/u)
    expect(() => withGates(gates => { gates[0].id = '' })).toThrow(/non-empty/u)
    expect(() => withGates(gates => { gates[1].id = gates[0].id })).toThrow(/ids.*unique/u)
    expect(() => withGates(gates => { gates[1].job = gates[0].job })).toThrow(/jobs.*unique/u)
    expect(() => withGates(gates => { gates[0].command = '' })).toThrow(/non-empty/u)
  })

  it('returns false only when every path is explicitly fast-only', () => {
    expect(classifyChangedPaths(['docs/operations/test-gates.md'], repositoryRoot).qualify).toBe(false)
    expect(classifyChangedPaths(['prototype/generation-workbench/app.js'], repositoryRoot).qualify).toBe(false)
    expect(classifyChangedPaths(['.planning/quality-gate-architecture/task_plan.md'], repositoryRoot).qualify).toBe(false)
    expect(classifyChangedPaths(['README.md'], repositoryRoot).qualify).toBe(false)
    expect(classifyChangedPaths(['docs/operations/test-gates.md', 'README.md'], repositoryRoot).qualify).toBe(false)
    expect(classifyChangedPaths(['docs/operations/test-gates.md', 'src/host/plugin.ts'], repositoryRoot).qualify).toBe(true)
    expect(classifyChangedPaths(['new/unknown/path.txt'], repositoryRoot).qualify).toBe(true)
    expect(classifyChangedPaths([], repositoryRoot).qualify).toBe(true)
    expect(classifyChangedPaths(['../outside.txt'], repositoryRoot).qualify).toBe(true)
    expect(classifyChangedPaths(['src/host/plugin.ts'], repositoryRoot, { workflowDispatch: true }).qualify).toBe(true)
  })

  it('qualifies deleted product paths while skipping deleted fast-only paths', () => {
    const productFixture = createGitFixture('src/removed-product.ts')
    unlinkSync(productFixture.trackedPath)
    git(productFixture.root, 'add', '--all')
    git(productFixture.root, 'commit', '--quiet', '-m', 'delete product')
    expect(classifyGitDiff(productFixture.root, productFixture.before)).toBe('true')

    const docsFixture = createGitFixture('docs/removed-guide.md')
    unlinkSync(docsFixture.trackedPath)
    git(docsFixture.root, 'add', '--all')
    git(docsFixture.root, 'commit', '--quiet', '-m', 'delete docs')
    expect(classifyGitDiff(docsFixture.root, docsFixture.before)).toBe('false')
  })

  it('validates fast-only paths as relative slash-separated paths without rejecting legitimate dot names', () => {
    const policy = loadQualityPolicy(repositoryRoot)
    expect(validateQualityPolicy({
      ...policy,
      fastOnlyFiles: ['release..notes.md'],
    }).fastOnlyFiles).toEqual(['release..notes.md'])

    for (const file of ['../README.md', 'docs\\guide.md', 'docs/\0guide.md', 'docs/./guide.md', 'docs//guide.md', '']) {
      expect(() => validateQualityPolicy({ ...policy, fastOnlyFiles: [file] })).toThrow(/fastOnlyFiles/u)
    }
    for (const prefix of ['docs', 'docs\\', 'docs/\0', 'docs/./', 'docs//', '', '/docs/']) {
      expect(() => validateQualityPolicy({ ...policy, fastOnlyPrefixes: [prefix] })).toThrow(/fastOnlyPrefixes/u)
    }
  })

  it('CLI fails closed for missing, invalid, zero, and git-diff failures', () => {
    const run = (...args: string[]) => execFileSync(process.execPath, [classifierScript, ...args], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    expect(run()).toBe('true')
    expect(run('--event-name', 'workflow_dispatch')).toBe('true')
    expect(run('--unknown')).toBe('true')
    expect(run('--before', 'not-a-commit', '--after', 'a'.repeat(40))).toBe('true')
    expect(run('--before', '0'.repeat(40), '--after', 'a'.repeat(40))).toBe('true')
    expect(run('--before', 'b'.repeat(40), '--after', 'c'.repeat(40))).toBe('true')
  })
})

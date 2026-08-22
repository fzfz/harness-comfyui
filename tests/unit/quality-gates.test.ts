import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// @ts-expect-error The policy seam is a checked-in JavaScript CLI module.
import { classifyChangedPaths } from '../../scripts/ci/classify-changes.mjs'
// @ts-expect-error The policy seam is a checked-in JavaScript policy module.
import { loadQualityPolicy } from '../../scripts/ci/quality-policy.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const classifierScript = resolve(repositoryRoot, 'scripts/ci/classify-changes.mjs')

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
    expect(policy.fastOnlyPrefixes).toEqual(['docs/'])
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

  it('returns false only when every path is explicitly fast-only', () => {
    expect(classifyChangedPaths(['docs/operations/test-gates.md'], repositoryRoot).qualify).toBe(false)
    expect(classifyChangedPaths(['README.md'], repositoryRoot).qualify).toBe(false)
    expect(classifyChangedPaths(['docs/operations/test-gates.md', 'README.md'], repositoryRoot).qualify).toBe(false)
    expect(classifyChangedPaths(['docs/operations/test-gates.md', 'src/host/plugin.ts'], repositoryRoot).qualify).toBe(true)
    expect(classifyChangedPaths(['new/unknown/path.txt'], repositoryRoot).qualify).toBe(true)
    expect(classifyChangedPaths([], repositoryRoot).qualify).toBe(true)
    expect(classifyChangedPaths(['../outside.txt'], repositoryRoot).qualify).toBe(true)
    expect(classifyChangedPaths(['src/host/plugin.ts'], repositoryRoot, { workflowDispatch: true }).qualify).toBe(true)
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

import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

type QualityPolicy = {
  qualification: {
    workflowName: string
    requiredGateIds: string[]
    gates: Array<{ id: string; job: string; command: string }>
    artifactNames: {
      candidate: string
      qualified: string
      manifest: string
      record: string
    }
  }
}

const repositoryRoot = resolve(import.meta.dirname, '../..')

async function workflow(name: string) {
  return readFile(join(repositoryRoot, '.github/workflows', name), 'utf8')
}

async function policy(): Promise<QualityPolicy> {
  return JSON.parse(await readFile(join(repositoryRoot, 'config/quality-gates.json'), 'utf8')) as QualityPolicy
}

function count(source: string, value: string) {
  return source.split(value).length - 1
}

function commandIndex(source: string, command: string, from = 0) {
  return source.indexOf(command, from)
}

function runBlocks(source: string) {
  const blocks: string[] = []
  let activeIndent: number | undefined
  let active = ''
  const flush = () => {
    if (activeIndent !== undefined) blocks.push(active)
    activeIndent = undefined
    active = ''
  }
  for (const line of source.split('\n')) {
    const run = line.match(/^(\s*)run:\s?(.*)$/u)
    if (run !== null) {
      flush()
      activeIndent = run[1].length
      active = run[2]
      continue
    }
    if (activeIndent !== undefined) {
      const indentation = line.length - line.trimStart().length
      if (line.trim().length === 0 || indentation > activeIndent) {
        active += `\n${line}`
      } else {
        flush()
      }
    }
  }
  flush()
  return blocks
}

function expectNoInputExpressionsInRun(source: string) {
  for (const run of runBlocks(source)) expect(run).not.toContain('${{ inputs.')
}

function jobBlock(source: string, job: string) {
  const start = source.indexOf(`  ${job}:\n`)
  expect(start).toBeGreaterThanOrEqual(0)
  const nextJob = source.slice(start + 1).search(/\n  [A-Za-z0-9_-]+:\n/u)
  return source.slice(start, nextJob < 0 ? source.length : start + 1 + nextJob)
}

function expectExactRuntimeSetup(source: string) {
  expect(source).toContain('actions/checkout@v4')
  expect(source).toContain('actions/setup-node@v4')
  expect(source).toContain('node-version-file: .node-version')
  expect(source).not.toMatch(/node-version:\s*['"]?\d/u)
  expect(source).toContain('corepack disable pnpm')
  expect(source).toContain('npm install --global pnpm@11.7.0')
  expect(source).toContain('pnpm install --frozen-lockfile')
  expect(source).not.toMatch(/corepack (?:enable|install|prepare)/u)
  expect(source).not.toContain('cache: pnpm')
  expect(source).not.toMatch(/secrets\./iu)
}

function expectPreinstallOrder(source: string) {
  const preinstall = commandIndex(source, 'pnpm run quality:preinstall')
  const frozenInstall = commandIndex(source, 'pnpm install --frozen-lockfile')
  expect(preinstall).toBeGreaterThanOrEqual(0)
  expect(frozenInstall).toBeGreaterThan(preinstall)
}

describe('workflow orchestration contracts', () => {
  it('keeps PR fast-only and gates main qualification behind impact classification', async () => {
    const source = await workflow('ci.yml')
    expect(source).toContain('pull_request:')
    expect(source).toContain('push:')
    expect(source).toContain('branches: [main]')
    expect(source).toContain('cancel-in-progress: true')
    expect(source).toContain('group: ci-${{ github.workflow }}-${{ github.ref }}')
    expectExactRuntimeSetup(source)
    expectPreinstallOrder(source)
    expect(source).toContain('pnpm run quality:preinstall')
    expect(source).toContain('pnpm run quality:fast')
    expect(source).not.toMatch(/pnpm\s+(?:run\s+)?quality(?!:)/u)
    expect(source).not.toMatch(/test:(?:deploy|composition|e2e)|release:smoke|package:(?:pack|validate)/u)
    expect(source).toContain('if: github.event_name == \'push\'')
    expect(source).toContain('fetch-depth: 0')
    expect(source).toContain('classify-changes.mjs')
    expect(source).toContain('github.event.before')
    expect(source).toContain('github.sha')
    expect(source).toContain('outputs:')
    expect(source).toContain('qualify:')
    expect(source).toContain('uses: ./.github/workflows/deploy.yml')
    expect(source).toContain('needs: [quality, impact]')
    expect(source).toContain("if: needs.impact.outputs.qualify == 'true'")
    expect(source).toContain('commit: ${{ github.sha }}')
    expectNoInputExpressionsInRun(source)
  })

  it('defines reusable Artifact Qualification candidate and parallel consumers from policy', async () => {
    const source = await workflow('deploy.yml')
    const configured = await policy()
    const qualification = configured.qualification
    expect(source).toContain(`name: ${qualification.workflowName}`)
    expect(source).toContain('workflow_call:')
    expect(source).toContain('workflow_dispatch:')
    expect(source).toMatch(/workflow_call:[\s\S]*?commit:[\s\S]*?required: true[\s\S]*?type: string/u)
    expect(source).toMatch(/workflow_dispatch:[\s\S]*?commit:[\s\S]*?required: true[\s\S]*?type: string/u)
    expect(source).toMatch(/permissions:\n\s+contents: read/u)
    expectExactRuntimeSetup(source)
    expectPreinstallOrder(source)
    expect(source).toContain('if: github.event_name == \'workflow_dispatch\'')
    expect(source).toContain('pnpm run quality:fast')
    const candidate = jobBlock(source, 'candidate')
    expect(candidate).toContain('ref: ${{ inputs.commit }}')
    expect(candidate).toContain('pnpm run quality:preinstall')
    expect(candidate).toContain('pnpm install --frozen-lockfile')
    expect(candidate).toContain('if: github.event_name != \'workflow_dispatch\'')
    const checkout = commandIndex(candidate, 'Checkout exact commit')
    const verifyCommit = commandIndex(candidate, 'Verify exact qualification commit')
    const setup = commandIndex(candidate, 'Set up Node.js')
    const install = commandIndex(candidate, 'pnpm install --frozen-lockfile')
    const build = commandIndex(candidate, 'pnpm run build')
    expect(verifyCommit).toBeGreaterThan(checkout)
    expect(setup).toBeGreaterThan(verifyCommit)
    expect(install).toBeGreaterThan(setup)
    expect(build).toBeGreaterThan(verifyCommit)
    expect(candidate).toMatch(/\^\[0-9a-f\]\{40\}\$/u)
    expect(candidate).toContain('git rev-parse HEAD')
    expect(count(source, 'pnpm run build')).toBe(1)
    expect(count(source, 'pnpm run package:pack')).toBe(1)
    expect(count(source, 'pnpm run package:validate')).toBe(1)
    expect(source).toContain(`name: ${qualification.artifactNames.candidate}`)
    expect(source).toContain(`.release/quality/${qualification.artifactNames.manifest}`)
    expect(source).toContain('.release/quality/*.tgz')
    expect(source).toContain('lib/**')
    expect(source).toContain('include-hidden-files: true')
    expect(source).toContain('if-no-files-found: error')

    expect(qualification.requiredGateIds).toHaveLength(4)
    for (const gate of qualification.gates) {
      const consumer = jobBlock(source, gate.job)
      expect(consumer).toContain('needs: candidate')
      expect(consumer).toContain('actions/download-artifact@v4')
      expect(consumer).toContain(`name: ${qualification.artifactNames.candidate}`)
      expect(consumer).toContain('path: .')
      expect(consumer).toContain('artifact-qualification.mjs relocate --root "$PWD"')
      expect(consumer).toContain(gate.command)
      expect(consumer).not.toMatch(/pnpm run (?:build|package:pack|package:validate)\b/u)
    }
    expect(source).toContain('actions/download-artifact@v4')
    expect(source).toContain('path: .')
    expect(count(source, 'artifact-qualification.mjs relocate --root "$PWD"')).toBe(5)
    expect(count(source, 'pnpm test:deploy')).toBe(1)
    expect(count(source, 'pnpm test:composition')).toBe(1)
    expect(count(source, 'pnpm test:e2e')).toBe(1)
    expect(count(source, 'pnpm run release:smoke')).toBe(1)
    expect(source).toContain('needs: [deploy-lifecycle, composition, browser-e2e, release-smoke]')
    expect(source).toContain('artifact-qualification.mjs write')
    expect(source).toContain('artifact-qualification.mjs validate')
    expect(source).toContain(`name: ${qualification.artifactNames.qualified}`)
    const final = jobBlock(source, 'qualification')
    expect(final).toContain('needs: [deploy-lifecycle, composition, browser-e2e, release-smoke]')
    expect(final).toContain('QUALIFICATION_RUN_ID: ${{ github.run_id }}')
    expect(final).toContain('QUALIFICATION_COMMIT: ${{ inputs.commit }}')
    expect(final).toContain('--run-id "$QUALIFICATION_RUN_ID"')
    expect(final).toContain('--commit "$QUALIFICATION_COMMIT"')
    expect(final).toContain('--expected-version "$EXPECTED_VERSION"')
    expect(final).toContain('--expected-sha256 "$EXPECTED_SHA256"')
    expect(final).toContain(`name: ${qualification.artifactNames.qualified}`)
    expectNoInputExpressionsInRun(source)
    expect(source).not.toMatch(/deploy:(?:install|start|stop|upgrade|rollback)|ssh|curl\s+https?:/iu)
  })

  it('downloads and validates the qualified artifact for Release Preview without installation or retesting', async () => {
    const source = await workflow('release.yml')
    const configured = await policy()
    const qualification = configured.qualification
    expect(source).toContain('workflow_dispatch:')
    for (const input of ['version', 'commit', 'qualification_run_id', 'artifact_sha256']) {
      expect(source).toMatch(new RegExp(`${input}:[\\s\\S]*?required: true[\\s\\S]*?type: string`, 'u'))
    }
    expect(source).toMatch(/permissions:[\s\S]*?actions: read[\s\S]*?contents: read/u)
    expect(source).toContain('ref: ${{ inputs.commit }}')
    expect(source).toContain('fetch-depth: 0')
    expect(source).toContain('git fetch --no-tags origin main:refs/remotes/origin/main')
    expect(source).toContain('git merge-base --is-ancestor')
    expect(source).toContain('actions/setup-node@v4')
    expect(source).not.toContain('npm install --global')
    expect(source).not.toContain('corepack disable')
    expect(source).not.toMatch(/pnpm\s+(?:install|run\s+(?:quality|build|package:|test:)|test:)/u)
    expect(source).not.toMatch(/git\s+(?:tag|push)\b|gh\s+release|softprops\/action-gh-release/iu)
    expectNoInputExpressionsInRun(source)
    expect(source).toContain('actions/download-artifact@v4')
    expect(source).toContain(`name: ${qualification.artifactNames.qualified}`)
    expect(source).toContain('run-id: ${{ inputs.qualification_run_id }}')
    expect(source).toContain('github-token: ${{ github.token }}')
    expect(source).toContain('path: .')
    expect(source).toContain('artifact-qualification.mjs relocate --root "$PWD"')
    expect(source).toContain('EXPECTED_VERSION: ${{ inputs.version }}')
    expect(source).toContain('EXPECTED_COMMIT: ${{ inputs.commit }}')
    expect(source).toContain('EXPECTED_RUN_ID: ${{ inputs.qualification_run_id }}')
    expect(source).toContain('EXPECTED_SHA256: ${{ inputs.artifact_sha256 }}')
    expect(source).toContain('--expected-version "$EXPECTED_VERSION"')
    expect(source).toContain('--expected-commit "$EXPECTED_COMMIT"')
    expect(source).toContain('--expected-run-id "$EXPECTED_RUN_ID"')
    expect(source).toContain('--expected-sha256 "$EXPECTED_SHA256"')
    expect(source).toContain('node scripts/release/preview.mjs')
    expect(source).toContain('set -o pipefail')
    expect(source).toContain('--expected-version "$RELEASE_VERSION"')
    expect(source).toContain('--expected-commit "$RELEASE_COMMIT"')
    expect(source).toContain(`.release/quality/${qualification.artifactNames.manifest}`)
    expect(source).toContain(`.release/quality/${qualification.artifactNames.record}`)
    expect(source).toContain('.release/quality/release-preview.txt')
    expect(source).toContain('include-hidden-files: true')
    expect(source).toContain('if-no-files-found: error')
  })
})

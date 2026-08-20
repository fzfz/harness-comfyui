import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const script = resolve(root, 'scripts/security/check-build-scripts.mjs')
const policyPath = resolve(root, 'config/dependency-security-policy.json')
const temporaryDirectories: string[] = []

interface CommandResult {
  readonly code: number | null
  readonly stdout: string
  readonly stderr: string
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function readPolicyAllowBuilds(): Promise<Record<string, unknown>> {
  const policy = JSON.parse(await readFile(policyPath, 'utf8')) as { allowBuilds: Record<string, unknown> }
  return policy.allowBuilds
}

interface FixtureOptions {
  readonly policyText?: string
  readonly policyAllowBuilds?: unknown
  readonly pnpmAllowBuilds?: unknown
  readonly npmrc?: string
  readonly manifestPnpm?: unknown
}

async function createFixture(mode: string, options: FixtureOptions = {}): Promise<{ root: string; pnpm: string; record: string }> {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'harness-comfyui-build-scripts-'))
  temporaryDirectories.push(fixtureRoot)
  await mkdir(join(fixtureRoot, 'config'), { recursive: true })
  const sourceAllowBuilds = await readPolicyAllowBuilds()
  const policyText = options.policyText ?? JSON.stringify({ allowBuilds: options.policyAllowBuilds ?? sourceAllowBuilds })
  await writeFile(join(fixtureRoot, 'config', 'dependency-security-policy.json'), policyText, 'utf8')
  const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as Record<string, unknown>
  if (Object.hasOwn(options, 'manifestPnpm')) manifest.pnpm = options.manifestPnpm
  await writeFile(join(fixtureRoot, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  const sourceNpmrc = await readFile(resolve(root, '.npmrc'), 'utf8')
  await writeFile(join(fixtureRoot, '.npmrc'), options.npmrc ?? sourceNpmrc, 'utf8')
  await copyFile(resolve(root, 'pnpm-workspace.yaml'), join(fixtureRoot, 'pnpm-workspace.yaml'))

  const record = join(fixtureRoot, 'pnpm-record.jsonl')
  const pnpm = join(fixtureRoot, 'pnpm')
  const pnpmAllowBuilds = options.pnpmAllowBuilds ?? sourceAllowBuilds
  await writeFile(pnpm, `#!/usr/bin/env node
import { appendFileSync } from 'node:fs'

const record = process.env.FAKE_PNPM_RECORD
if (record) appendFileSync(record, JSON.stringify({ argv: process.argv.slice(2) }) + '\\n')
if (process.env.FAKE_PNPM_MODE === 'error') process.exit(23)
if (process.env.FAKE_PNPM_MODE === 'malformed') {
  process.stdout.write('{malformed')
  process.exit(0)
}
if (process.env.FAKE_PNPM_MODE === 'missing') {
  process.stdout.write('')
  process.exit(0)
}
process.stdout.write(JSON.stringify(${JSON.stringify(pnpmAllowBuilds)}))
`, 'utf8')
  await chmod(pnpm, 0o755)
  return { root: fixtureRoot, pnpm, record }
}

function runScript(environment: NodeJS.ProcessEnv, fixtureRoot: string): Promise<CommandResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [script, '--root', fixtureRoot], {
      cwd: root,
      env: { ...process.env, NO_COLOR: '1', ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.once('error', reject)
    child.once('close', code => resolveResult({ code, stdout, stderr }))
  })
}

describe('security:build-scripts', () => {
  it('accepts exactly the five true, exact-version allowBuilds decisions without running lifecycle scripts', async () => {
    const fixture = await createFixture('clean')
    const result = await runScript({
      PNPM_BIN: fixture.pnpm,
      FAKE_PNPM_MODE: 'clean',
      FAKE_PNPM_RECORD: fixture.record,
    }, fixture.root)

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('five exact allowBuilds decisions')
    const invocations = (await readFile(fixture.record, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    expect(invocations).toEqual([{ argv: ['config', 'get', 'allowBuilds', '--json'] }])
    expect(invocations.flatMap(invocation => invocation.argv)).not.toEqual(expect.arrayContaining(['install', 'run', 'rebuild']))
  })

  it('rejects an additional pnpm allowBuilds projection', async () => {
    const sourceAllowBuilds = await readPolicyAllowBuilds()
    const projection = { ...sourceAllowBuilds, 'unknown-package@1.2.3': true }
    const fixture = await createFixture('clean', { pnpmAllowBuilds: projection })
    const result = await runScript({
      PNPM_BIN: fixture.pnpm,
      FAKE_PNPM_MODE: 'clean',
      FAKE_PNPM_RECORD: fixture.record,
    }, fixture.root)

    expect(result.code).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/projection|allowBuilds|unknown/i)
  })

  it.each([
    ['false decision', (source: Record<string, unknown>) => ({ ...source, 'koffi@3.1.5': false }), /boolean true|allowBuilds/i],
    ['placeholder decision', (source: Record<string, unknown>) => ({ ...source, 'koffi@3.1.5': 'pending' }), /boolean true|placeholder|pending|allowBuilds/i],
  ])('rejects a policy %s', async (_label, mutate, expected) => {
    const policyAllowBuilds = mutate(await readPolicyAllowBuilds())
    const fixture = await createFixture('clean', { policyAllowBuilds })
    const result = await runScript({
      PNPM_BIN: fixture.pnpm,
      FAKE_PNPM_MODE: 'clean',
      FAKE_PNPM_RECORD: fixture.record,
    }, fixture.root)

    expect(result.code).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(expected)
  })

  it('rejects a policy identity that does not match the pnpm workspace projection', async () => {
    const sourceAllowBuilds = await readPolicyAllowBuilds()
    const policyAllowBuilds = { ...sourceAllowBuilds }
    delete policyAllowBuilds['koffi@3.1.5']
    policyAllowBuilds['koffi@3.1.4'] = true
    const fixture = await createFixture('clean', { policyAllowBuilds })
    const result = await runScript({
      PNPM_BIN: fixture.pnpm,
      FAKE_PNPM_MODE: 'clean',
      FAKE_PNPM_RECORD: fixture.record,
    }, fixture.root)

    expect(result.code).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/projection|differs|allowBuilds/i)
  })

  it.each([
    ['missing', undefined, /missing|could not read.*npmrc/i],
    ['false', 'registry=https://registry.npmjs.org/\nstrict-dep-builds=false\n', /strict-dep-builds=true/i],
    ['duplicate', 'registry=https://registry.npmjs.org/\nstrict-dep-builds=true\nstrict-dep-builds=true\n', /duplicate.*strict-dep-builds/i],
  ])('rejects .npmrc %s', async (_label, npmrc, expected) => {
    const sourceNpmrc = await readFile(resolve(root, '.npmrc'), 'utf8')
    const fixture = await createFixture('clean', {
      npmrc: npmrc ?? sourceNpmrc.replace(/^strict-dep-builds=.*\n?/mu, ''),
    })
    if (_label === 'missing') await rm(join(fixture.root, '.npmrc'))
    const result = await runScript({
      PNPM_BIN: fixture.pnpm,
      FAKE_PNPM_MODE: 'clean',
      FAKE_PNPM_RECORD: fixture.record,
    }, fixture.root)

    expect(result.code).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(expected)
  })

  it.each([
    ['null', null],
    ['array', []],
    ['string', 'invalid'],
  ])('rejects a non-object package.json.pnpm value (%s)', async (_label, manifestPnpm) => {
    const fixture = await createFixture('clean', { manifestPnpm })
    const result = await runScript({
      PNPM_BIN: fixture.pnpm,
      FAKE_PNPM_MODE: 'clean',
      FAKE_PNPM_RECORD: fixture.record,
    }, fixture.root)

    expect(result.code).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/package\.json pnpm policy must be an object/i)
  })

  it.each(['onlyBuiltDependencies', 'onlyBuiltDependenciesFile', 'neverBuiltDependencies', 'ignoredBuiltDependencies'])('rejects package.json.pnpm.%s', async field => {
    const fixture = await createFixture('clean', { manifestPnpm: { [field]: ['unclassified'] } })
    const result = await runScript({
      PNPM_BIN: fixture.pnpm,
      FAKE_PNPM_MODE: 'clean',
      FAKE_PNPM_RECORD: fixture.record,
    }, fixture.root)

    expect(result.code).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(new RegExp(`unclassified build decisions: ${field}`))
  })

  it.each([
    ['missing allowBuilds', JSON.stringify({}), /missing object allowBuilds|allowBuilds/i],
    ['malformed JSON', '{', /could not read.*JSON|Unexpected end/i],
    ['non-object JSON', '[]', /must contain an object/i],
  ])('rejects a %s policy document', async (_label, policyText, expected) => {
    const fixture = await createFixture('clean', { policyText })
    const result = await runScript({
      PNPM_BIN: fixture.pnpm,
      FAKE_PNPM_MODE: 'clean',
      FAKE_PNPM_RECORD: fixture.record,
    }, fixture.root)

    expect(result.code).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(expected)
  })

  it('rejects an extra policy decision', async () => {
    const sourceAllowBuilds = await readPolicyAllowBuilds()
    const policyText = JSON.stringify({ allowBuilds: { ...sourceAllowBuilds, 'extra@1.0.0': true } })
    const fixture = await createFixture('clean', { policyText })
    const result = await runScript({
      PNPM_BIN: fixture.pnpm,
      FAKE_PNPM_MODE: 'clean',
      FAKE_PNPM_RECORD: fixture.record,
    }, fixture.root)

    expect(result.code).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/exactly 5|allowBuilds/i)
  })

  it.each([
    ['malformed', /malformed JSON/i],
    ['missing', /missing|allowBuilds/i],
    ['error', /exited with code|execute pnpm/i],
  ])('fails closed for %s pnpm output', async (_label, expected) => {
    const fixture = await createFixture(_label)
    const result = await runScript({
      PNPM_BIN: fixture.pnpm,
      FAKE_PNPM_MODE: _label,
      FAKE_PNPM_RECORD: fixture.record,
    }, fixture.root)

    expect(result.code).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(expected)
  })
})

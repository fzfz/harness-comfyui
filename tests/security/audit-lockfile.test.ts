import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const script = resolve(root, 'scripts/security/audit-lockfile.mjs')
const temporaryDirectories: string[] = []

interface CommandResult {
  readonly code: number | null
  readonly stdout: string
  readonly stderr: string
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function createFakePnpm(mode: string): Promise<{ bin: string; record: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'harness-comfyui-audit-pnpm-'))
  temporaryDirectories.push(directory)
  const record = join(directory, 'record.jsonl')
  const bin = join(directory, 'pnpm')
  await writeFile(bin, `#!/usr/bin/env node
import { appendFileSync } from 'node:fs'

const mode = process.env.FAKE_PNPM_MODE
const record = process.env.FAKE_PNPM_RECORD
const prod = process.argv.includes('--prod')
if (record) appendFileSync(record, JSON.stringify({ argv: process.argv.slice(2), prod }) + '\\n')

const clean = { advisories: {}, metadata: { vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0 } } }
const payload = mode === 'malformed'
  ? '{not-json'
  : mode === 'missing-metadata'
    ? JSON.stringify({ advisories: {} })
    : mode === 'severity'
      ? JSON.stringify({ ...clean, metadata: { vulnerabilities: { critical: 0, high: 0, moderate: 1, low: 0 } } })
      : mode === 'advisory-nonzero'
        ? JSON.stringify({ ...clean, advisories: { GHSA_fixture: { severity: 'high' } } })
        : JSON.stringify(clean)
process.stdout.write(payload)
process.exit(mode === 'nonzero' || mode === 'advisory-nonzero' ? 1 : 0)
`, 'utf8')
  await chmod(bin, 0o755)
  return { bin, record }
}

function runScript(environment: NodeJS.ProcessEnv): Promise<CommandResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [script], {
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

describe('security:advisories', () => {
  it('runs full and production audits against the official registry and reports zero severities', async () => {
    const fake = await createFakePnpm('clean')
    const result = await runScript({
      PNPM_BIN: fake.bin,
      FAKE_PNPM_MODE: 'clean',
      FAKE_PNPM_RECORD: fake.record,
    })

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('full: critical=0 high=0 moderate=0 low=0')
    expect(result.stdout).toContain('production: critical=0 high=0 moderate=0 low=0')
    const invocations = (await readFile(fake.record, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    expect(invocations).toEqual([
      {
        argv: ['audit', '--json', '--registry=https://registry.npmjs.org'],
        prod: false,
      },
      {
        argv: ['audit', '--prod', '--json', '--registry=https://registry.npmjs.org'],
        prod: true,
      },
    ])
  })

  it.each([
    ['malformed', /malformed JSON/i],
    ['missing-metadata', /metadata\.vulnerabilities/i],
    ['severity', /moderate=1|moderate vulnerability/i],
    ['advisory-nonzero', /exited with code|non-zero|advisory/i],
    ['nonzero', /exited with code|non-zero/i],
  ])('fails closed for %s audit output', async (mode, expected) => {
    const fake = await createFakePnpm(mode)
    const result = await runScript({
      PNPM_BIN: fake.bin,
      FAKE_PNPM_MODE: mode,
      FAKE_PNPM_RECORD: fake.record,
    })

    expect(result.code).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(expected)
  })

  it('fails closed when pnpm cannot be executed', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'harness-comfyui-audit-missing-pnpm-'))
    temporaryDirectories.push(directory)
    const result = await runScript({ PNPM_BIN: join(directory, 'does-not-exist') })

    expect(result.code).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/execute pnpm|ENOENT|spawn/i)
  })
})

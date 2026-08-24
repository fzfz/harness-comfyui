import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

// @ts-expect-error Checked-in JavaScript security module.
import { auditLockfile, parseAuditJson } from '../../scripts/security/audit-lockfile.mjs'

const temporaryRoots: string[] = []

async function fakePnpm(mode: 'clean' | 'severity'): Promise<{ root: string; bin: string; record: string }> {
  const root = await mkdtemp(join(tmpdir(), 'harness-audit-'))
  temporaryRoots.push(root)
  const bin = join(root, 'pnpm')
  const record = join(root, 'record.jsonl')
  await writeFile(bin, `#!/usr/bin/env node
import { appendFileSync } from 'node:fs'
appendFileSync(${JSON.stringify(record)}, JSON.stringify(process.argv.slice(2)) + '\\n')
const moderate = ${JSON.stringify(mode)} === 'severity' ? 1 : 0
process.stdout.write(JSON.stringify({ metadata: { vulnerabilities: { critical: 0, high: 0, moderate, low: 0 } } }))
`, 'utf8')
  await chmod(bin, 0o755)
  return { root, bin, record }
}

afterEach(async () => {
  delete process.env.PNPM_BIN
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('root lockfile advisory audit', () => {
  it('audits the root dependency graph in full and production modes', async () => {
    const fake = await fakePnpm('clean')
    process.env.PNPM_BIN = fake.bin
    expect(auditLockfile(fake.root)).toEqual({
      full: { critical: 0, high: 0, moderate: 0, low: 0 },
      production: { critical: 0, high: 0, moderate: 0, low: 0 },
    })
    const calls = (await readFile(fake.record, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    expect(calls).toEqual([
      ['audit', '--json', '--registry=https://registry.npmjs.org'],
      ['audit', '--prod', '--json', '--registry=https://registry.npmjs.org'],
    ])
  })

  it('rejects malformed results and non-zero severities', async () => {
    expect(() => parseAuditJson('{bad', 'full')).toThrow(/malformed JSON/u)
    const fake = await fakePnpm('severity')
    process.env.PNPM_BIN = fake.bin
    expect(() => auditLockfile(fake.root)).toThrow(/moderate=1/u)
  })
})

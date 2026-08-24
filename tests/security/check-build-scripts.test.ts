import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

// @ts-expect-error Checked-in JavaScript security module.
import { checkBuildScripts } from '../../scripts/security/check-build-scripts.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const temporaryRoots: string[] = []

async function fixture(output?: unknown): Promise<{ root: string; pnpm: string }> {
  const root = await mkdtemp(join(tmpdir(), 'harness-build-policy-'))
  temporaryRoots.push(root)
  await mkdir(join(root, 'config'), { recursive: true })
  for (const file of ['package.json', 'pnpm-workspace.yaml', '.npmrc']) {
    await copyFile(join(repositoryRoot, file), join(root, file))
  }
  const policyPath = join(repositoryRoot, 'config/dependency-security-policy.json')
  await copyFile(policyPath, join(root, 'config/dependency-security-policy.json'))
  const policy = JSON.parse(await readFile(policyPath, 'utf8')) as Record<string, any>
  const pnpm = join(root, 'pnpm')
  await writeFile(pnpm, `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(output ?? policy.allowBuilds))})\n`, 'utf8')
  await chmod(pnpm, 0o755)
  return { root, pnpm }
}

afterEach(async () => {
  delete process.env.PNPM_BIN
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('dependency build-script policy', () => {
  it('accepts the reviewed root allowBuilds projection', async () => {
    const value = await fixture()
    process.env.PNPM_BIN = value.pnpm
    expect(checkBuildScripts(value.root).allowBuilds).toHaveProperty('koffi@3.1.5', true)
  })

  it('rejects an unreviewed or malformed pnpm projection', async () => {
    const value = await fixture({ 'unknown@1.0.0': true })
    process.env.PNPM_BIN = value.pnpm
    expect(() => checkBuildScripts(value.root)).toThrow(/differs/u)

    await writeFile(value.pnpm, '#!/bin/sh\nprintf not-json\n', 'utf8')
    expect(() => checkBuildScripts(value.root)).toThrow(/malformed JSON/u)
  })
})

import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

// @ts-expect-error Checked-in JavaScript security module.
import { checkManifestLock, validateDependencyPolicy } from '../../scripts/security/check-manifest-lock.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const temporaryRoots: string[] = []

async function fixture(): Promise<{ root: string; pnpm: string }> {
  const root = await mkdtemp(join(tmpdir(), 'harness-manifest-lock-'))
  temporaryRoots.push(root)
  await mkdir(join(root, 'config'), { recursive: true })
  for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc']) {
    await copyFile(join(repositoryRoot, file), join(root, file))
  }
  await copyFile(
    join(repositoryRoot, 'config/dependency-security-policy.json'),
    join(root, 'config/dependency-security-policy.json'),
  )
  const pnpm = join(root, 'pnpm')
  await writeFile(pnpm, '#!/bin/sh\nexit "${FAKE_PNPM_EXIT_CODE:-0}"\n', 'utf8')
  await chmod(pnpm, 0o755)
  return { root, pnpm }
}

afterEach(async () => {
  delete process.env.PNPM_BIN
  delete process.env.FAKE_PNPM_EXIT_CODE
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('manifest and lockfile policy', () => {
  it('accepts the root workspace without a second runtime package', async () => {
    const value = await fixture()
    process.env.PNPM_BIN = value.pnpm
    expect(() => checkManifestLock(value.root)).not.toThrow()
  })

  it('rejects dependency ranges and workspace policy drift', async () => {
    const value = await fixture()
    const manifestPath = join(value.root, 'package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, any>
    manifest.devDependencies.typescript = '^6.0.3'
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    expect(() => validateDependencyPolicy(value.root)).toThrow(/exact version/u)

    await copyFile(join(repositoryRoot, 'package.json'), manifestPath)
    const workspacePath = join(value.root, 'pnpm-workspace.yaml')
    await writeFile(workspacePath, `${await readFile(workspacePath, 'utf8')}\nunknown: true\n`, 'utf8')
    expect(() => validateDependencyPolicy(value.root)).toThrow(/exact projection/u)
  })

  it('fails when pnpm reports frozen lockfile drift', async () => {
    const value = await fixture()
    process.env.PNPM_BIN = value.pnpm
    process.env.FAKE_PNPM_EXIT_CODE = '9'
    expect(() => checkManifestLock(value.root)).toThrow(/pnpm status 9/u)
  })

  it('requires exact public Harness peer versions and rejects the old host range', async () => {
    const value = await fixture()
    const manifestPath = join(value.root, 'package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, any>
    manifest.peerDependencies['@deepseek-ai/dsh-agent'] = '0.2.0-rc.2'
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    expect(() => validateDependencyPolicy(value.root)).not.toThrow()
    manifest.peerDependencies['@deepseek-ai/dsh-agent'] = '>=0.1.7-rc.2 <0.1.8'
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    expect(() => validateDependencyPolicy(value.root)).toThrow(/exact version/u)
  })
})

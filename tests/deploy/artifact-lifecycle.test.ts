import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createProfileFixture } from '../../src/testing/profile-fixture.ts'

const fixtures: Array<Awaited<ReturnType<typeof createProfileFixture>>> = []

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose()))
})

describe('release artifact deployment lifecycle', () => {
  it('uses the existing artifact for preflight and install, then exercises the stable CLI restart lifecycle', async () => {
    const fixture = await createProfileFixture({ configuration: 'test' })
    fixtures.push(fixture)

    try {
      await expect(fixture.preflight()).resolves.toMatchObject({
        stage: 'preflight',
        status: 'passed',
      })
      await fixture.install()
      await expect(access(fixture.stableCliPath)).resolves.toBeUndefined()
      await expect(access(`${fixture.installationRoot}/releases/${fixture.artifact.version}/harness-runtime/node_modules/.bin/dsh`)).resolves.toBeUndefined()

      await fixture.start()
      const statePath = join(fixture.installationRoot, 'state/process.json')
      const oldState = JSON.parse(await readFile(statePath, 'utf8')) as { pid: number }
      expect(Number.isSafeInteger(oldState.pid)).toBe(true)
      expect(oldState.pid).toBeGreaterThan(0)
      await expect(fixture.status()).resolves.toMatchObject({
        status: 'running',
        activeVersion: fixture.artifact.version,
      })
      await expect(fixture.health()).resolves.toMatchObject({
        stage: 'health',
        status: 'passed',
      })
      await expect(fixture.logs()).resolves.toMatch(/\[operations\]|\[stdout\]/u)

      await fixture.restart()
      const newState = JSON.parse(await readFile(statePath, 'utf8')) as { pid: number }
      expect(Number.isSafeInteger(newState.pid)).toBe(true)
      expect(newState.pid).toBeGreaterThan(0)
      expect(newState.pid).not.toBe(oldState.pid)
      await expect(fixture.status()).resolves.toMatchObject({
        status: 'running',
        activeVersion: fixture.artifact.version,
      })
      await fixture.stop()
    } finally {
      await fixture.stop()
      await fixture.dispose()
    }

    expect(fixture.cleanupEvidence.processStateRemoved).toBe(true)
    expect(fixture.cleanupEvidence.portReleased).toBe(true)
    expect(fixture.cleanupEvidence.noChildProcesses).toBe(true)
    expect(fixture.cleanupEvidence.installationRemoved).toBe(true)
    expect(fixture.cleanupEvidence.dshHomeRemoved).toBe(true)
  }, 90000)
})

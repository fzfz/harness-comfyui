import { access } from 'node:fs/promises'

import { afterEach, describe, expect, it } from 'vitest'

import { createProfileFixture } from '../../src/testing/profile-fixture.ts'

const fixtures: Array<Awaited<ReturnType<typeof createProfileFixture>>> = []

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose()))
})

describe('release artifact deployment lifecycle', () => {
  it('installs the existing artifact with npm exec and uses only the installed stable CLI afterward', async () => {
    const fixture = await createProfileFixture({ configuration: 'test' })
    fixtures.push(fixture)

    try {
      await fixture.install()
      await expect(access(fixture.stableCliPath)).resolves.toBeUndefined()
      await expect(access(`${fixture.installationRoot}/releases/${fixture.artifact.version}/harness-runtime/node_modules/.bin/dsh`)).resolves.toBeUndefined()

      await fixture.start()
      await expect(fixture.status()).resolves.toMatchObject({
        status: 'running',
        activeVersion: fixture.artifact.version,
      })
      await expect(fixture.health()).resolves.toMatchObject({
        stage: 'health',
        status: 'passed',
      })
      await expect(fixture.logs()).resolves.toMatch(/\[operations\]|\[stdout\]/u)
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

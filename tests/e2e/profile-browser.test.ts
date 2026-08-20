import { afterEach, describe, expect, it } from 'vitest'

import { createProfileFixture } from '../../src/testing/profile-fixture.ts'

const fixtures: Array<Awaited<ReturnType<typeof createProfileFixture>>> = []

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose()))
})

describe('release artifact browser boundary', () => {
  it('boots the real AppFrame roster and reads pluginStatus through the browser Client projection', async () => {
    const fixture = await createProfileFixture({
      configuration: 'test',
      artifactManifestPath: '.release/quality/artifact.json',
    })
    fixtures.push(fixture)

    try {
      await fixture.materialize()
      await fixture.start()

      const browser = await fixture.runBrowserProbe()
      expect(browser.appFrame).toBe(true)
      expect(browser.nativeDetailsModuleLoaded).toBe(true)
      expect(browser.hostClientConnected).toBe(true)
      expect(browser.clientModuleLoaded).toBe(true)
      expect(browser.pluginStatus).toEqual({
        packageName: 'harness-comfyui',
        packageVersion: fixture.artifact.version,
        configurationProfile: 'test',
        hostLoaded: true,
      })
    } finally {
      await fixture.stop()
      await fixture.dispose()
    }
    expect(fixture.cleanupEvidence.processExit).toBeDefined()
    expect(fixture.cleanupEvidence.portReleased).toBe(true)
    expect(fixture.cleanupEvidence.dshHomeRemoved).toBe(true)
  })
})

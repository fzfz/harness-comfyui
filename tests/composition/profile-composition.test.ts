import { readFile } from 'node:fs/promises'

import { afterEach, describe, expect, it } from 'vitest'

import { createProfileFixture } from '../../src/testing/profile-fixture.ts'

const artifactManifestPath = '.release/quality/artifact.json'
const fixtures: Array<Awaited<ReturnType<typeof createProfileFixture>>> = []

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose()))
})

describe('release artifact composition', () => {
  it('loads the fixed artifact and exposes the ComfyUI details slot as the active replacement', async () => {
    const fixture = await createProfileFixture({
      configuration: 'test',
      artifactManifestPath,
    })
    fixtures.push(fixture)

    try {
      await fixture.materialize()
      const manifest = JSON.parse(await readFile(fixture.profileManifestPath, 'utf8')) as {
        dependencies?: Record<string, string>
        dsh?: { profile?: { bundles?: string[] } }
      }
      expect(manifest.dependencies?.['harness-comfyui']).toBe(`file:${fixture.artifact.tarballPath}`)
      expect(manifest.dsh?.profile?.bundles).toEqual([
        '@deepseek-ai/dsh-base',
        '@deepseek-ai/dsh-web-app',
        'harness-comfyui',
      ])

      const installed = await fixture.readInstalledProfileEvidence()
      expect(installed.profileVersions).toEqual({
        dshBase: undefined,
        dshWebApp: undefined,
        harnessComfyui: fixture.artifact.version,
      })
      expect(installed.runtimeBundleVersions).toEqual({
        cliDsh: fixture.artifact.version,
        dshBase: fixture.artifact.version,
        dshWebApp: fixture.artifact.version,
      })
      expect(installed.hostLoaderRow).toEqual({
        id: 'harness-comfyui',
        name: 'harness-comfyui',
        configurationExpression: '!!js process.env.HARNESS_COMFYUI_CONFIGURATION_PROFILE',
      })

      await fixture.start()
      const boot = await fixture.readBootGraph()
      expect(boot.entries.filter(entry => entry.id === 'harness-comfyui')).toHaveLength(1)
      expect(boot.entries.filter(entry => entry.id === '@deepseek-ai/dsh-client-ui-conversation')).toHaveLength(1)
      expect(await fixture.readClientModule('harness-comfyui')).toContain('__ModuleLoader__')

      const composition = await fixture.inspectDetailsComposition()
      expect(composition.registrationError).toBeUndefined()
      expect(composition.priorities).toEqual([-10, 0])
      expect(composition.activePriority).toBe(-10)

      await fixture.unloadClient(composition)
      expect(composition.remainingPriorities).toEqual([0])
    } finally {
      await fixture.stop()
      await fixture.dispose()
    }
    expect(fixture.cleanupEvidence.processExit).toBeDefined()
    expect(fixture.cleanupEvidence.portReleased).toBe(true)
    expect(fixture.cleanupEvidence.dshHomeRemoved).toBe(true)
  })
})

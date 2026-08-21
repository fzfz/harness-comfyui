import { readFile } from 'node:fs/promises'

import { afterEach, describe, expect, it } from 'vitest'

import { createProfileFixture } from '../../src/testing/profile-fixture.ts'

const fixtures: Array<Awaited<ReturnType<typeof createProfileFixture>>> = []

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose()))
})

describe('release artifact composition', () => {
  it('uses one existing artifact through the product CLI and keeps native AppFrame slots unoccupied', async () => {
    const fixture = await createProfileFixture({
      configuration: 'test',
    })
    fixtures.push(fixture)

    try {
      await fixture.install()

      const profileManifest = JSON.parse(await readFile(fixture.profileManifestPath, 'utf8')) as {
        dependencies?: Record<string, string>
      }
      expect(profileManifest.dependencies?.['harness-comfyui']).toBe(`file:${fixture.artifact.tarballPath}`)

      const installed = await fixture.readInstalledProfileEvidence()
      expect(installed.profileBundles).toEqual([
        '@deepseek-ai/dsh-base',
        '@deepseek-ai/dsh-web-app',
        'harness-comfyui',
      ])
      expect(installed.profileVersions).toEqual({
        harnessComfyui: fixture.artifact.version,
        dshBase: '0.1.0-rc.7',
        dshWebApp: '0.1.0-rc.7',
      })
      expect(installed.runtimeBundleVersions).toEqual({
        cliDsh: '0.1.0-rc.7',
        dshBase: '0.1.0-rc.7',
        dshWebApp: '0.1.0-rc.7',
      })
      expect(installed.hostLoaderRow).toEqual({
        id: 'harness-comfyui',
        name: 'harness-comfyui',
        configurationExpression: '!!js process.env.HARNESS_COMFYUI_CONFIGURATION_PROFILE',
      })
      const clientManifest = await fixture.readClientPackageEvidence()
      expect(clientManifest.exportTarget).toBe('./lib/client.js')
      expect(clientManifest.moduleSource).toContain('__ModuleLoader__')

      await fixture.start()
      await expect(fixture.status()).resolves.toMatchObject({
        installationId: expect.any(String),
        activeVersion: fixture.artifact.version,
        host: '127.0.0.1',
        port: fixture.port,
        status: 'running',
      })
      const boot = await fixture.readBootGraph()
      expect(boot.entries.filter(entry => entry.id === 'harness-comfyui')).toHaveLength(1)
      expect(boot.entries.filter(entry => entry.id === '@deepseek-ai/dsh-client-ui-conversation')).toHaveLength(1)
      expect(await fixture.readClientModule('harness-comfyui')).toContain('__ModuleLoader__')
      const health = await fixture.health()
      expect(health).toMatchObject({ stage: 'health', status: 'passed' })
      expect(Object.keys(health)).toEqual(expect.arrayContaining([
        'process', 'activeRelease', 'harnessWeb', 'clientBundle', 'pluginStatus',
        'catalogContract', 'sourceContract', 'runRepository', 'savedMedia',
      ]))
      const logs = await fixture.logs()
      expect(logs).toContain('[operations]')
      expect(logs).toContain('[stdout]')
    } finally {
      await fixture.stop()
      await fixture.dispose()
    }
    expect(fixture.cleanupEvidence.processExit).toBeDefined()
    expect(fixture.cleanupEvidence.processStateRemoved).toBe(true)
    expect(fixture.cleanupEvidence.portReleased).toBe(true)
    expect(fixture.cleanupEvidence.installationRemoved).toBe(true)
    expect(fixture.cleanupEvidence.noChildProcesses).toBe(true)
    expect(fixture.cleanupEvidence.dshHomeRemoved).toBe(true)
  }, 90000)
})

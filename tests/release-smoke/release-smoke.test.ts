import { readFile } from 'node:fs/promises'

import { afterEach, describe, expect, it } from 'vitest'

import { createProfileFixture } from '../../src/testing/profile-fixture.ts'

const artifactManifestPath = process.env.HARNESS_COMFYUI_ARTIFACT_MANIFEST_PATH
const fixtures: Array<Awaited<ReturnType<typeof createProfileFixture>>> = []

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose()))
})

describe('release artifact smoke', () => {
  it('runs the shared release-smoke test through one runner without building, packing, or materializing directly', async () => {
    const source = await readFile(new URL('../../scripts/release/smoke.mjs', import.meta.url), 'utf8')
    expect(source).not.toMatch(/(?:pnpm|npm)\s+(?:install|run\s+(?:build|package:pack))/u)
    expect(source).not.toMatch(/(?:materialize\.mjs|start\.mjs|tar\s+-)/u)
    expect(source).toContain("'tests/release-smoke'")
    expect(source).toContain("'--maxWorkers=1'")
    expect(source).toContain("'--no-file-parallelism'")
  })

  it('uses the existing artifact through npm exec and then only the stable lifecycle CLI', async () => {
    const fixture = await createProfileFixture({
      configuration: 'release-smoke',
      ...(artifactManifestPath === undefined ? {} : { artifactManifestPath }),
    })
    fixtures.push(fixture)

    try {
      await fixture.install()
      expect(fixture.configuration).toBe('release-smoke')

      const profileManifest = JSON.parse(await readFile(fixture.profileManifestPath, 'utf8')) as {
        dependencies?: Record<string, string>
      }
      expect(profileManifest.dependencies?.['harness-comfyui']).toBe(`file:${fixture.artifact.tarballPath}`)

      await fixture.start()
      await expect(fixture.status()).resolves.toMatchObject({
        installationId: expect.any(String),
        activeVersion: fixture.artifact.version,
        host: '127.0.0.1',
        port: fixture.port,
        status: 'running',
      })

      const boot = await fixture.readBootGraph()
      expect(boot.entries.map(entry => entry.id)).toEqual(expect.arrayContaining([
        '@deepseek-ai/dsh-client-ui-layout',
        '@deepseek-ai/dsh-client-ui-conversation',
        'harness-comfyui',
      ]))
      expect(await fixture.readClientModule('harness-comfyui')).toContain('__ModuleLoader__')

      await expect(fixture.health()).resolves.toMatchObject({
        stage: 'health',
        status: 'passed',
      })
      await expect(fixture.logs()).resolves.toEqual(expect.stringContaining('[operations]'))
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
  }, 120000)
})

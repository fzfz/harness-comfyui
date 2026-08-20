import { createHash } from 'node:crypto'
import { basename, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { createProfileFixture } from '../../src/testing/profile-fixture.ts'

const artifactManifestPath = '.release/quality/artifact.json'
const repositoryRoot = resolve(import.meta.dirname, '../..')
const fixtures: Array<Awaited<ReturnType<typeof createProfileFixture>>> = []

function createDivergentArtifactFixture() {
  const base = JSON.parse(readFileSync(resolve(artifactManifestPath), 'utf8')) as {
    tarballPath: string
    filename: string
    version: string
    commit: string
    byteLength: number
    sha256: string
  }
  const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-divergent-artifact-'))
  const extracted = join(root, 'extracted')
  mkdirSync(extracted)
  const unpack = spawnSync('tar', ['-xzf', base.tarballPath, '-C', extracted], { encoding: 'utf8' })
  if (unpack.status !== 0) throw new Error(unpack.stderr)
  const packageManifestPath = join(extracted, 'package/package.json')
  const packageManifest = JSON.parse(readFileSync(packageManifestPath, 'utf8')) as { version: string }
  const appVersion = `${base.version}-app-fixture`
  packageManifest.version = appVersion
  writeFileSync(packageManifestPath, `${JSON.stringify(packageManifest, null, 2)}\n`)
  const tarballPath = join(root, `harness-comfyui-${appVersion}.tgz`)
  const pack = spawnSync('tar', ['-czf', tarballPath, '-C', extracted, 'package'], { encoding: 'utf8' })
  if (pack.status !== 0) throw new Error(pack.stderr)
  const bytes = readFileSync(tarballPath)
  const manifest = {
    ...base,
    filename: basename(tarballPath),
    version: appVersion,
    tarballPath,
    byteLength: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
  const manifestPath = join(root, 'artifact.json')
  writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`)
  return { manifestPath, manifest, root }
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose()))
})

describe('release artifact composition', () => {
  it('loads the fixed artifact and exposes the ComfyUI details slot as the active replacement', async () => {
    const divergent = createDivergentArtifactFixture()
    const fixture = await createProfileFixture({
      configuration: 'test',
      artifactManifestPath: divergent.manifestPath,
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
      const sourcePackage = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8')) as {
        devDependencies: Record<string, string>
      }
      const expectedRuntimeBundleVersions = {
        cliDsh: sourcePackage.devDependencies['@deepseek-ai/dsh'],
        dshBase: sourcePackage.devDependencies['@deepseek-ai/dsh-base'],
        dshWebApp: sourcePackage.devDependencies['@deepseek-ai/dsh-web-app'],
      }
      expect(fixture.artifact.version).not.toBe(expectedRuntimeBundleVersions.cliDsh)
      expect(installed.runtimeBundleVersions).toEqual({
        ...expectedRuntimeBundleVersions,
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
      rmSync(divergent.root, { recursive: true, force: true })
    }
    expect(fixture.cleanupEvidence.processExit).toBeDefined()
    expect(fixture.cleanupEvidence.portReleased).toBe(true)
    expect(fixture.cleanupEvidence.dshHomeRemoved).toBe(true)
  })
})
